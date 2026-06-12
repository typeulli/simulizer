"use client";
// Collaboration controller for ClangWorkspace.
//
// Wires a Yjs WebsocketProvider to backend-live (room = file id), seeds the doc
// from the owner's bundle the first time, observes shared structure/text changes
// and surfaces them to the host, and tracks awareness (presence). Persistence is
// owner-client driven: this hook never saves — the host's existing autosave does
// (gated on isOwner), serializing the doc-authoritative bundle from
// `snapshotBundleForSave`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";

import type { CppBundle } from "@/lib/cppBundle";
import {
    getTexts,
    getMeta,
    isDocEmpty,
    seedDoc,
    pushStructure as docPushStructure,
    setText as docSetText,
    remapTextPaths as docRemapTextPaths,
    readSharedTree,
    type StructureSnapshot,
} from "./doc";
import { resolveCollabUser, type CollabUser } from "./identity";

// "inactive" = the socket reached the server but no shared session is active
// (a non-owner connected before the owner started one). The client stays in a
// read-only fallback and keeps retrying so it auto-joins once the owner starts.
// "error" = couldn't reach backend-live within the connect timeout (it keeps
// retrying in the background, so it can still recover).
export type CollabStatus = "disabled" | "connecting" | "connected" | "closed" | "inactive" | "error";

// Close codes from backend-live.
const ROOM_CLOSED_CODE = 4001;   // room torn down after the owner left
const NO_SESSION_CODE = 4002;    // owner hasn't started a session yet

// How long to wait for the first successful sync before surfacing an error
// (backend-live unreachable / misconfigured NEXT_PUBLIC_LIVE_URL).
const CONNECT_TIMEOUT_MS = 12000;
const CONNECT_RETRY_COOLDOWN_MS = 30000;

const LIVE_WS_URL = (() => {
    const explicit = process.env.NEXT_PUBLIC_LIVE_URL;
    if (explicit) return explicit.replace(/\/+$/, "") + "/live";
    const api = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? window.location.origin : "");
    return api.replace(/^http/, "ws") + "/live";
})();

export type CollabParticipant = CollabUser & {
    self: boolean;
    activeFile?: string;
    /** Awareness client id — matches y-monaco's `yRemoteSelection-<id>` classes. */
    clientId: number;
};

type Options = {
    fileId: string;
    /** Collaboration is active only for link-shared files. */
    enabled: boolean;
    isOwner: boolean;
    /** Latest local bundle (used to seed the doc on first connect). */
    getCurrentBundle: () => CppBundle;
    /** Remote structural change (tree/entry) — host applies it to local bundle. */
    onRemoteStructure: (snapshot: StructureSnapshot) => void;
    /** Fires when the set of text files changes (a peer added/removed a file) so
     *  the host can (re)bind editor models to freshly-arrived Y.Texts. */
    onTextsChanged: () => void;
};

export type ClangCollab = {
    status: CollabStatus;
    /** Map of path → Y.Text; null until connected. */
    texts: Y.Map<Y.Text> | null;
    awareness: Awareness | null;
    participants: CollabParticipant[];
    /** Update which file this client is viewing (presence). */
    setActiveFile: (path: string | null) => void;
    /** Push a local structural change (add/remove/rename/move/entry) to peers. */
    pushStructure: (bundle: CppBundle) => void;
    /** Programmatically replace a text file's content (e.g. settings → config.json). */
    setText: (path: string, content: string) => void;
    /** Remap text paths after a rename/move (preserving Y.Text content). */
    remapTexts: (rewrite: (path: string) => string) => void;
    /** Build the doc-authoritative bundle for persistence (owner save path). */
    snapshotBundleForSave: (localBundle: CppBundle) => CppBundle;
};

export function useClangCollab(opts: Options): ClangCollab {
    const { fileId, enabled, isOwner } = opts;

    const [status, setStatus] = useState<CollabStatus>(enabled ? "connecting" : "disabled");
    const [participants, setParticipants] = useState<CollabParticipant[]>([]);
    const [texts, setTexts] = useState<Y.Map<Y.Text> | null>(null);
    const [awareness, setAwareness] = useState<Awareness | null>(null);

    const docRef = useRef<Y.Doc | null>(null);
    const providerRef = useRef<WebsocketProvider | null>(null);
    const userRef = useRef<CollabUser | null>(null);

    // Keep latest callbacks/bundle accessor in refs so the connect effect runs
    // once per (fileId, enabled) rather than re-subscribing on every render.
    const getCurrentBundleRef = useRef(opts.getCurrentBundle);
    const onRemoteStructureRef = useRef(opts.onRemoteStructure);
    const onTextsChangedRef = useRef(opts.onTextsChanged);
    useEffect(() => { getCurrentBundleRef.current = opts.getCurrentBundle; }, [opts.getCurrentBundle]);
    useEffect(() => { onRemoteStructureRef.current = opts.onRemoteStructure; }, [opts.onRemoteStructure]);
    useEffect(() => { onTextsChangedRef.current = opts.onTextsChanged; }, [opts.onTextsChanged]);

    useEffect(() => {
        if (!enabled || !fileId) {
            setStatus("disabled");
            return;
        }
        setStatus("connecting");

        const doc = new Y.Doc();
        docRef.current = doc;
        // `owner` lets backend-live's local dev mode (DEV_TRUST_PARAMS) attribute
        // ownership; production ignores it and uses the auth cookie instead.
        const provider = new WebsocketProvider(LIVE_WS_URL, fileId, doc, {
            connect: true,
            params: { owner: isOwner ? "1" : "0" },
        });
        providerRef.current = provider;
        const aw = provider.awareness;
        setTexts(getTexts(doc));
        setAwareness(aw);

        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let connectTimer: ReturnType<typeof setTimeout> | null = null;
        const armConnectTimer = () => {
            if (connectTimer) clearTimeout(connectTimer);
            connectTimer = setTimeout(() => {
                connectTimer = null;
                provider.shouldConnect = false;
                retryTimer = setTimeout(() => {
                    retryTimer = null;
                    if (cancelled) return;
                    provider.shouldConnect = true;
                    setStatus("connecting");
                    provider.connect();
                    armConnectTimer();
                }, CONNECT_RETRY_COOLDOWN_MS);
                provider.disconnect();
                setStatus("error");
            }, CONNECT_TIMEOUT_MS);
        };
        const clearConnectTimer = () => {
            if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
        };
        const clearRetryTimer = () => {
            if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        };
        armConnectTimer();

        // Resolve presence identity, then publish it.
        void resolveCollabUser().then(user => {
            if (cancelled) return;
            userRef.current = user;
            aw.setLocalStateField("user", user);
        });

        const recomputeParticipants = () => {
            const states = aw.getStates();
            const out: CollabParticipant[] = [];
            for (const [clientId, st] of states) {
                const u = (st as { user?: CollabUser; activeFile?: string }).user;
                if (!u) continue;
                out.push({ ...u, self: clientId === aw.clientID, activeFile: (st as { activeFile?: string }).activeFile, clientId });
            }
            setParticipants(out);
        };
        aw.on("change", recomputeParticipants);

        const meta = getMeta(doc);
        const textsMap = getTexts(doc);
        const onMeta = () => {
            const snap = readSharedTree(doc);
            if (snap) onRemoteStructureRef.current(snap);
        };
        const onTexts = () => { onTextsChangedRef.current(); };
        meta.observe(onMeta);
        textsMap.observe(onTexts);

        // We promote to "connected" only once the doc has synced (below), not on
        // raw socket open — a non-owner rejected with NO_SESSION_CODE opens then
        // closes before syncing, and must never look briefly editable.
        provider.on("status", (e: { status: string }) => {
            if (e.status === "disconnected") {
                if (retryTimer) return;
                setStatus(prev => (prev === "closed" || prev === "inactive" ? prev : "connecting"));
            }
        });

        provider.on("sync", (isSynced: boolean) => {
            if (!isSynced) return;
            clearConnectTimer();
            clearRetryTimer();
            // Owner seeds an empty room from the saved bundle exactly once.
            if (isOwner && isDocEmpty(doc)) {
                seedDoc(doc, getCurrentBundleRef.current());
            }
            setStatus("connected");
            // Surface whatever structure is present (seeded locally or synced).
            const snap = readSharedTree(doc);
            if (snap) onRemoteStructureRef.current(snap);
            onTextsChangedRef.current();
        });

        provider.on("connection-close", (event: { code?: number } | null) => {
            if (event?.code === ROOM_CLOSED_CODE) {
                // Owner left — the session is over; stop reconnecting.
                clearConnectTimer();
                clearRetryTimer();
                provider.shouldConnect = false;
                setStatus("closed");
            } else if (event?.code === NO_SESSION_CODE) {
                // Owner hasn't started a session — stay in read-only fallback but
                // keep retrying so we auto-join the moment the owner starts.
                clearConnectTimer();
                clearRetryTimer();
                setStatus("inactive");
            }
        });

        return () => {
            cancelled = true;
            clearConnectTimer();
            clearRetryTimer();
            aw.off("change", recomputeParticipants);
            meta.unobserve(onMeta);
            textsMap.unobserve(onTexts);
            try { aw.setLocalState(null); } catch { /* ignore */ }
            provider.destroy();
            doc.destroy();
            providerRef.current = null;
            docRef.current = null;
            setTexts(null);
            setAwareness(null);
            setParticipants([]);
        };
    }, [enabled, fileId, isOwner]);

    const setActiveFile = useCallback((path: string | null) => {
        const aw = providerRef.current?.awareness;
        if (!aw) return;
        aw.setLocalStateField("activeFile", path ?? undefined);
    }, []);

    const pushStructure = useCallback((bundle: CppBundle) => {
        const doc = docRef.current;
        if (!doc) return;
        docPushStructure(doc, bundle);
    }, []);

    const setText = useCallback((path: string, content: string) => {
        const doc = docRef.current;
        if (!doc) return;
        docSetText(doc, path, content);
    }, []);

    const remapTexts = useCallback((rewrite: (path: string) => string) => {
        const doc = docRef.current;
        if (!doc) return;
        docRemapTextPaths(doc, rewrite);
    }, []);

    const snapshotBundleForSave = useCallback((localBundle: CppBundle): CppBundle => {
        const doc = docRef.current;
        if (!doc) return localBundle;
        const snap = readSharedTree(doc);
        if (!snap) return localBundle;
        // Doc is authoritative for tree + text contents; local bundle keeps the
        // per-user ui (activeFile / openTabs / breakpoints / treeOpen).
        return { ...localBundle, tree: snap.tree, entry: snap.entry };
    }, []);

    return useMemo(
        () => ({ status, texts, awareness, participants, setActiveFile, pushStructure, setText, remapTexts, snapshotBundleForSave }),
        [status, texts, awareness, participants, setActiveFile, pushStructure, setText, remapTexts, snapshotBundleForSave],
    );
}
