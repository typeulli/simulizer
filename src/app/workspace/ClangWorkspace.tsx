"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";

import { fetchEventSource } from "@microsoft/fetch-event-source";

import { useConsolePanel } from "@/components/console";
import type { WorkerOutMsg } from "@/utils/wasm/wasm-worker";
import type { ClangWorkerInMsg } from "@/utils/wasm/clang-worker";
import type { DebugOutMsg } from "@/utils/wasm/debug-protocol";
import { vec_field_to_image_url, mat_data_to_image_url } from "@/utils/wasm/tensor";
import type { ClangDiagnostic, CodeEditorRef, EditorCommand, EditorFile, LspStatus } from "./clang/CodeEditor";
import { useClangDebug } from "./clang/useClangDebug";
import DebugPanel from "./clang/DebugPanel";
import { pathToUri, uriToPath } from "./clang/uri";
import FileTree from "./clang/FileTree";
import { FileIcon } from "./clang/FileIcon";
import {
    useClangAgent,
    type AgentReadResult,
    type AgentWriteResult,
    type AgentEditResult,
    type AgentListResult,
    type AgentGlobResult,
    type AgentGrepResult,
    type AgentRenameResult,
    type AgentDeleteResult,
    type AgentRunResult,
    type AgentCheckResult,
} from "./clang/agent/useClangAgent";
import { AgentPanel } from "./clang/agent/AgentPanel";
import { DEFAULT_MODEL_ID, type AgentContext } from "./clang/agent/tools";
import { readLineRange, applyHashEdits, type LineEdit } from "./clang/agent/lines";
import { globToRegExp, grepFiles } from "./clang/agent/search";
import { parseCompilerErrors } from "./clang/agent/compile";
import {
    parseBundle,
    serializeBundle,
    listFiles as listBundleFiles,
    setFileContent,
    findFile as findBundleFile,
    addFile as bundleAddFile,
    addFolder as bundleAddFolder,
    removeNode as bundleRemoveNode,
    renameNode as bundleRenameNode,
    moveNode as bundleMoveNode,
    descendantFilePaths,
    validateFileName,
    validateFolderName,
    splitPath,
    isBinaryName,
    type CppBundle,
} from "@/lib/cppBundle";

import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { Spinner } from "@/components/atoms/Spinner";
import { BuildSnackbar } from "@/components/molecules/BuildSnackbar";
import { TopbarBrand } from "@/components/organisms/TopbarBrand";
import { token } from "@/components/tokens";
import { duplicateFile, renameFile, saveFile, setFileVisibility, type FileDetail, type FileOut } from "@/lib/authapi";
import { CppManagerModal } from "@/components/modals/workspace/CppManagerModal";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/organisms/Modal";
import { AlertModal, type AlertVariant } from "@/components/organisms/AlertModal";
import { CompileSettingsModal } from "@/components/modals/workspace/CompileSettingsModal";
import {
    readBuildConfig,
    readCompileConfig,
    readEnvironmentConfig,
    serializeProjectConfig,
    defaultConfigJson,
    SYSTEM_LABEL,
    CONFIG_FILENAME,
    ICON_DIR,
    type BuildOptions,
    type CompileOptions,
    type EnvironmentOptions,
    type DeviceKind,
} from "@/lib/compileConfig";
import { ShareControl } from "@/components/share/ShareControl";
import { useClangCollab } from "./clang/collab/useClangCollab";
import type { StructureSnapshot } from "./clang/collab/doc";
import { PresenceBar } from "./clang/collab/PresenceBar";
import { RemoteCursorStyles } from "./clang/collab/RemoteCursors";
import { useMessages, useTranslations } from "next-intl";
import { useTheme } from "@/hooks/useTheme";
import { useIsMobile } from "@/hooks/useMediaQuery";

type SaveStatus = "idle" | "saved" | "unsaved" | "saving" | "error";
type CppMode = "code" | "share";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

const LSP_WS_URL = (() => {
    const explicit = process.env.NEXT_PUBLIC_LSP_URL;
    if (explicit) return explicit.replace(/\/+$/, "") + "/lsp/cpp";
    const base = API_BASE || (typeof window !== "undefined" ? window.location.origin : "");
    return base.replace(/^http/, "ws") + "/lsp/cpp";
})();

// How long the connect modal waits before declaring the LSP unreachable.
const LSP_CONNECT_TIMEOUT_MS = 20000;

type LspModalState =
    | { kind: "connecting" }
    | { kind: "alert"; variant: AlertVariant; title: string; message: string };

type EditorTab = {
    /** Full URI (workspace `file:///workspace/...` or system `simulizer:/...`) */
    uri: string;
    label: string;
    /** Workspace-relative path, present only for workspace tabs. */
    path?: string;
    readOnly: boolean;
    closable: boolean;
};

const systemTabLabel = (uri: string): string => {
    const slash = uri.lastIndexOf("/");
    return slash >= 0 ? uri.slice(slash + 1) : uri;
};

const CodeEditor = dynamic(() => import("./clang/CodeEditor"), {
    ssr: false,
    loading: () => (
        <div style={{ flex: 1, padding: 16, color: token.color.fgMuted, fontFamily: token.font.family.mono, fontSize: token.font.size.fs12 }}>
            에디터 로드 중…
        </div>
    ),
});

type RunState = "idle" | "loading" | "compiling" | "running" | "done" | "error";
type BuildState = "idle" | "building" | "downloading" | "done" | "error";
type BuildProgress = { step: number; total: number; message: string };

// ─── Binary (base64) file helpers ─────────────────────────────────────────
// Uploaded images (icons) are stored as base64 in the bundle. Read a File into
// raw base64 (no `data:` prefix) and decode base64 back to bytes for download.
function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const res = reader.result as string;
            const comma = res.indexOf(",");
            resolve(comma >= 0 ? res.slice(comma + 1) : res);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
    const bin = atob(b64);
    const bytes = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

// MIME for an image data: URL, by extension (used for the preview overlay).
function imageMimeFor(name: string): string {
    const dot = name.lastIndexOf(".");
    switch (dot >= 0 ? name.slice(dot).toLowerCase() : "") {
        case ".png": return "image/png";
        case ".jpg":
        case ".jpeg": return "image/jpeg";
        case ".gif": return "image/gif";
        case ".bmp": return "image/bmp";
        case ".webp": return "image/webp";
        case ".ico": return "image/x-icon";
        default: return "application/octet-stream";
    }
}

type Props = {
    initialFile: FileDetail;
    initialOwner: boolean;
};

const ClangWorkspace: React.FC<Props> = ({ initialFile, initialOwner }) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tx = useTranslations();
    const messages = useMessages();
    const { theme } = useTheme();
    const isMobile = useIsMobile();
    const [mobileTab, setMobileTab] = useState<"code" | "result">("code");

    const [bundle, setBundle] = useState<CppBundle>(() => parseBundle(initialFile.content));
    const fileId = initialFile.id;
    const [fileName, setFileName] = useState<string>(initialFile.name);
    const [fileMeta, setFileMeta] = useState<FileOut | null>(initialFile);
    const isOwner = initialOwner;
    const [duplicating, setDuplicating] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

    const [managerOpen, setManagerOpen] = useState(false);
    const [managerMode, setManagerMode] = useState<CppMode>("code");

    const fileIdRef = useRef<string | null>(initialFile.id);
    const isOwnerRef = useRef<boolean>(initialOwner);

    // ─── Collaboration ────────────────────────────────────────────────────
    // A real-time session is started explicitly by the owner (the "협업" button),
    // not merely by a file being link-shared. The owner is the session anchor:
    // backend-live only admits other participants while an owner is present.
    //   - owner connects iff they started a session (`sessionActive`).
    //   - a non-owner connects when the file is link-shared, but only actually
    //     joins if the owner has a session running (else it stays read-only).
    // `canEdit` generalizes "may modify the project"; persistence stays
    // owner-driven (saveFile is still gated on isOwner).
    const [sessionActive, setSessionActive] = useState(false);
    const visibility = fileMeta?.visibility ?? initialFile.visibility;
    const collabEnabled = isOwner ? sessionActive : visibility === "link";
    const collabEnabledRef = useRef(collabEnabled);
    useEffect(() => { collabEnabledRef.current = collabEnabled; }, [collabEnabled]);
    const canEditRef = useRef<boolean>(initialOwner);

    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // The latest bundle snapshot the autosave timer should serialize. Using a
    // ref so the debounced timer always sees the freshest state without
    // recreating it on every keystroke.
    const pendingBundleRef = useRef<CppBundle>(bundle);

    const [runState, setRunState] = useState<RunState>("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [resultValue, setResultValue] = useState<string | null>(null);
    const [tfBackend, setTfBackend] = useState<string>("initializing");
    const [buildState, setBuildState] = useState<BuildState>("idle");
    const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null);
    // Compile/build options come from the optional root `config.json` (under its
    // `compile` section). When malformed we fall back to defaults and warn.
    const [configAlert, setConfigAlert] = useState<{ variant: AlertVariant; title: string; message: string } | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    // Path of a binary (image) bundle file shown in the preview overlay — these
    // aren't editable, so clicking one opens a preview instead of an editor tab.
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const compileCfg = useMemo(() => readCompileConfig(bundle.tree), [bundle.tree]);
    // Build options (target OS + exe icon) live under config["build"].
    const buildCfg = useMemo(() => readBuildConfig(bundle.tree), [bundle.tree]);
    // Runtime environment (TF.js device) lives under config["environment"].
    const envCfg = useMemo(() => readEnvironmentConfig(bundle.tree), [bundle.tree]);
    // Every image file in the project — the choices offered by the settings
    // window's icon-path autocomplete. The icon may live anywhere; .ico is used
    // as-is and other formats are converted to .ico server-side at build time.
    const iconChoices = useMemo(
        () => listBundleFiles(bundle.tree).map(f => f.path).filter(p => isBinaryName(p)),
        [bundle.tree],
    );

    const [rightTab, setRightTab] = useState<"console" | "infos" | "debug" | "agent">("console");
    const [infos, setInfos] = useState<ClangDiagnostic[]>([]);
    // Interactive input prompt (Asyncify run paused on sim_input_*).
    const [inputRequest, setInputRequest] = useState<{ kind: "i32" | "f64" } | null>(null);
    const [inputValue, setInputValue] = useState("");
    const codeEditorRef = useRef<CodeEditorRef | null>(null);

    // ─── LSP connection prompt ────────────────────────────────────────────
    // On first load we surface a VS Code-style modal while clangd connects.
    // Cancelling tears the client down (edit without LSP); "$lsp" re-opens it.
    const [lspConnected, setLspConnected] = useState(false);
    const [lspModal, setLspModal] = useState<LspModalState | null>(null);
    const lspConnectedRef = useRef(false);
    // True while the connect modal is up and we're still waiting for a verdict.
    const lspConnectingRef = useRef(false);
    const lspConnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initialLspPromptDoneRef = useRef(false);

    const clearLspTimer = useCallback(() => {
        if (lspConnectTimerRef.current) {
            clearTimeout(lspConnectTimerRef.current);
            lspConnectTimerRef.current = null;
        }
    }, []);

    const showLspFailed = useCallback(() => {
        lspConnectingRef.current = false;
        clearLspTimer();
        codeEditorRef.current?.disposeLsp(); // tear down the stalled attempt → work without LSP
        setLspModal({ kind: "alert", variant: "warning", title: tx("clang.lsp_fail_title"), message: tx("clang.lsp_fail_message") });
    }, [clearLspTimer]);

    const beginLspConnecting = useCallback(() => {
        lspConnectingRef.current = true;
        setLspModal({ kind: "connecting" });
        clearLspTimer();
        lspConnectTimerRef.current = setTimeout(() => {
            lspConnectTimerRef.current = null;
            if (!lspConnectingRef.current) return;
            showLspFailed();
        }, LSP_CONNECT_TIMEOUT_MS);
    }, [clearLspTimer, showLspFailed]);

    const handleLspStatusChange = useCallback((status: LspStatus) => {
        if (status === "running") {
            lspConnectedRef.current = true;
            setLspConnected(true);
            if (lspConnectingRef.current) {
                lspConnectingRef.current = false;
                clearLspTimer();
                // Close the connecting modal; leave any other modal untouched.
                setLspModal(prev => (prev?.kind === "connecting" ? null : prev));
            }
        } else if (status === "stopped") {
            lspConnectedRef.current = false;
            setLspConnected(false);
            // A drop while still connecting is left to the connect timeout to
            // resolve (avoids a spurious warning from the transient teardown a
            // reconnect performs). A drop after a healthy session stays silent
            // per spec; the user re-opens the prompt via "$lsp".
        }
        // "starting": no UI change.
    }, [clearLspTimer]);

    // Editor finished booting → open the initial connect prompt (once).
    // Skipped on mobile, where the editor is read-only and the command
    // palette (the only way to re-open it) isn't available.
    const [editorReady, setEditorReady] = useState(false);
    const handleEditorReady = useCallback(() => {
        setEditorReady(true);  // models now exist → restored breakpoint glyphs can render
        if (initialLspPromptDoneRef.current) return;
        initialLspPromptDoneRef.current = true;
        if (isMobile || lspConnectedRef.current) return;
        beginLspConnecting();
    }, [isMobile, beginLspConnecting]);

    const handleLspCancel = useCallback(() => {
        lspConnectingRef.current = false;
        clearLspTimer();
        setLspModal(null);
        lspConnectedRef.current = false;
        setLspConnected(false);
        codeEditorRef.current?.disposeLsp();
    }, [clearLspTimer]);

    // "$lsp" command: show status if already connected, otherwise open the
    // connect prompt and trigger a fresh connection attempt.
    const handleLspCommand = useCallback(() => {
        if (lspConnectedRef.current) {
            setLspModal({ kind: "alert", variant: "info", title: tx("clang.lsp_connected_title"), message: tx("clang.lsp_already_connected") });
            return;
        }
        beginLspConnecting();
        codeEditorRef.current?.reconnectLsp();
    }, [beginLspConnecting]);

    useEffect(() => () => { clearLspTimer(); }, [clearLspTimer]);

    // System-header tabs (simulizer:/simstd.hpp etc.) live outside the bundle
    // because they're not user code — they appear/disappear via go-to-definition
    // and are never persisted.
    const [systemTabs, setSystemTabs] = useState<EditorTab[]>([]);
    const [activeUri, setActiveUri] = useState<string>(() => pathToUri(parseBundle(initialFile.content).ui.activeFile));

    // ─── Tabs derived from bundle + system tabs ───────────────────────────
    const editorTabs: EditorTab[] = useMemo(() => {
        const allBundlePaths = new Set(listBundleFiles(bundle.tree).map(f => f.path));
        const bundleTabs: EditorTab[] = bundle.ui.openTabs
            .filter(p => allBundlePaths.has(p))
            .map(p => ({
                uri: pathToUri(p),
                label: p,
                path: p,
                // In a shared session every connected participant is an editor.
                readOnly: collabEnabled ? false : !isOwner,
                closable: p !== bundle.entry,
            }));
        return [...bundleTabs, ...systemTabs];
    }, [bundle.tree, bundle.ui.openTabs, bundle.entry, isOwner, collabEnabled, systemTabs]);

    // ─── Files passed to the editor (text bundle files) ───────────────────
    // Binary assets (icons) are excluded — Monaco only ever sees source text.
    const editorFiles: EditorFile[] = useMemo(
        () => listBundleFiles(bundle.tree)
            .filter(({ path }) => !isBinaryName(path))
            .map(({ path, file }) => ({ path, content: file.content })),
        [bundle.tree],
    );

    // ─── Autosave ─────────────────────────────────────────────────────────
    // Holds the latest collab API so the (stable) save callbacks can reach it
    // without being recreated. In a shared session the doc — not the local
    // bundle — is authoritative for file tree + text contents, so the owner's
    // save serializes the doc-derived bundle (text edits by peers included).
    const collabApiRef = useRef<ReturnType<typeof useClangCollab> | null>(null);
    const serializeForSave = useCallback(() => {
        const b = pendingBundleRef.current;
        const api = collabApiRef.current;
        return serializeBundle(collabEnabledRef.current && api ? api.snapshotBundleForSave(b) : b);
    }, []);

    const scheduleAutosave = useCallback(() => {
        if (!fileIdRef.current || !isOwnerRef.current) return;
        setSaveStatus("unsaved");
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(async () => {
            const id = fileIdRef.current;
            if (!id) return;
            setSaveStatus("saving");
            try {
                await saveFile(id, serializeForSave());
                setSaveStatus("saved");
            } catch {
                setSaveStatus("error");
            }
        }, 2000);
    }, [serializeForSave]);

    // Flush the latest bundle to the server right away. Use this for
    // structural changes (file add/remove/rename, entry change) that the
    // user expects to stick the moment they perform the action; content
    // edits go through scheduleAutosave instead so we don't hammer the
    // server on every keystroke.
    const flushSave = useCallback(() => {
        if (!isOwnerRef.current || !fileIdRef.current) return;
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        setSaveStatus("saving");
        saveFile(fileIdRef.current, serializeForSave())
            .then(() => setSaveStatus("saved"))
            .catch(() => setSaveStatus("error"));
    }, [serializeForSave]);

    useEffect(() => () => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    }, []);

    // ─── Diagnostics ──────────────────────────────────────────────────────
    const handleDiagnosticsChanged = useCallback((diagnostics: ClangDiagnostic[]) => {
        setInfos(diagnostics);
    }, []);

    const handleActiveModelChanged = useCallback((uri: string) => {
        setActiveUri(uri);
        const path = uriToPath(uri);
        if (path) {
            const prev = pendingBundleRef.current;
            if (prev.ui.activeFile === path && prev.ui.openTabs.includes(path)) return;
            const next: CppBundle = {
                ...prev,
                ui: {
                    ...prev.ui,
                    activeFile: path,
                    openTabs: prev.ui.openTabs.includes(path)
                        ? prev.ui.openTabs
                        : [...prev.ui.openTabs, path],
                },
            };
            pendingBundleRef.current = next;
            setBundle(next);
            scheduleAutosave();
        } else {
            // System / external header — track as ephemeral tab.
            setSystemTabs(prev => prev.some(t => t.uri === uri) ? prev : [
                ...prev,
                { uri, label: systemTabLabel(uri), readOnly: true, closable: true },
            ]);
        }
    }, [scheduleAutosave]);

    const handleTabClick = useCallback((tab: EditorTab) => {
        codeEditorRef.current?.setActiveModel(tab.uri);
    }, []);

    const handleTabClose = useCallback((tab: EditorTab) => {
        codeEditorRef.current?.closeModel(tab.uri);
        if (tab.path) {
            const prev = pendingBundleRef.current;
            if (!prev.ui.openTabs.includes(tab.path)) return;
            const remainingTabs = prev.ui.openTabs.filter(p => p !== tab.path);
            let activeFile = prev.ui.activeFile;
            if (activeFile === tab.path) {
                activeFile = remainingTabs[remainingTabs.length - 1] ?? prev.entry;
                if (!remainingTabs.includes(activeFile)) remainingTabs.push(activeFile);
            }
            const next: CppBundle = {
                ...prev,
                ui: { ...prev.ui, openTabs: remainingTabs, activeFile },
            };
            pendingBundleRef.current = next;
            setBundle(next);
            if (activeFile !== prev.ui.activeFile) setActiveUri(pathToUri(activeFile));
            scheduleAutosave();
        } else {
            setSystemTabs(prev => prev.filter(t => t.uri !== tab.uri));
        }
    }, [scheduleAutosave]);

    const focusInfoEntry = useCallback((entry: ClangDiagnostic) => {
        // The Infos pane shows diagnostics for all bundle files; we'd need
        // each entry to carry its file URI to jump precisely. clangd reports
        // markers per resource, but our current shape only carries line/column.
        // Reveal in the currently-active file for now (matches old behavior).
        codeEditorRef.current?.revealAt(activeUri, entry.line, entry.column);
    }, [activeUri]);

    // ─── Initial seed for fresh files ─────────────────────────────────────
    // "{}" is the FileCreate default produced when dashboard creates a new
    // clangfile without sending content. parseBundle treats it as a fresh
    // bundle; we persist immediately so the preview/refresh shows real
    // content (the editor's onTextChanged wouldn't fire on mount otherwise).
    useEffect(() => {
        if (initialFile.content === "{}" && initialOwner) {
            saveFile(initialFile.id, serializeBundle(pendingBundleRef.current)).catch(() => { /* surfaced later */ });
        }
    }, [initialFile.content, initialFile.id, initialOwner]);

    // ─── Per-file content change from the editor ──────────────────────────
    // In a shared session the model is bound to its Y.Text (MonacoBinding owns
    // the CRDT write); this only mirrors the change into the local bundle so the
    // owner's autosave and non-active-file views stay current.
    const handleEditorTextChanged = useCallback((path: string, content: string) => {
        if (!canEditRef.current) return;
        const prev = pendingBundleRef.current;
        const nextTree = setFileContent(prev.tree, path, content);
        const next: CppBundle = { ...prev, tree: nextTree };
        pendingBundleRef.current = next;
        setBundle(next);
        scheduleAutosave();
    }, [scheduleAutosave]);

    // ─── Rename project (the JSON file itself) ────────────────────────────
    const handleRenameFile = useCallback(async () => {
        if (!fileId) return;
        const trimmed = fileName.trim();
        if (!trimmed) {
            if (fileMeta) setFileName(fileMeta.name);
            return;
        }
        if (fileMeta && trimmed === fileMeta.name) return;
        try {
            const updated = await renameFile(fileId, trimmed);
            setFileName(updated.name);
            setFileMeta(prev => prev ? { ...prev, name: updated.name } : prev);
        } catch (err: any) {
            if (err?.status === 409) setErrorMsg(tx("clang.project_name_conflict"));
            if (fileMeta) setFileName(fileMeta.name);
        }
    }, [fileId, fileName, fileMeta]);

    const handleOpenManager = useCallback(() => {
        setManagerMode("code");
        setManagerOpen(true);
    }, []);

    const handleSaveToServer = useCallback(async () => {
        if (!fileId || !isOwnerRef.current) return;
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        setSaveStatus("saving");
        try {
            await saveFile(fileId, serializeForSave());
            setSaveStatus("saved");
        } catch {
            setSaveStatus("error");
        }
    }, [fileId, serializeForSave]);

    const handleDuplicateToMine = useCallback(async () => {
        if (!fileId || duplicating) return;
        setDuplicating(true);
        try {
            const dup = await duplicateFile(fileId);
            router.push(`/workspace?file=${dup.id}`);
        } catch (err: any) {
            if (err?.status === 401) {
                router.push(`/login?next=${encodeURIComponent(`/workspace?file=${fileId}`)}`);
            } else {
                setErrorMsg(tx("workspace.ui.share_login_to_duplicate"));
            }
        } finally {
            setDuplicating(false);
        }
    }, [fileId, duplicating, router]);

    // ─── File-tree operations ─────────────────────────────────────────────
    // Apply a pure transformation to the bundle, persist immediately, and
    // update React state. Returning null from `transform` is the "do nothing"
    // signal. The transform must NOT itself call setBundle/setActiveUri —
    // those happen here.
    // `remap` (rename/move only) maps every old path to its new path so the
    // collab layer can carry each file's Y.Text across the path change instead
    // of recreating it (which would lose a peer's in-flight edits).
    const applyBundleChange = useCallback((
        transform: (prev: CppBundle) => CppBundle | null,
        opts?: { remap?: (path: string) => string },
    ) => {
        const prev = pendingBundleRef.current;
        const next = transform(prev);
        if (!next) return;
        pendingBundleRef.current = next;
        setBundle(next);
        if (next.ui.activeFile !== prev.ui.activeFile) {
            setActiveUri(pathToUri(next.ui.activeFile));
        }
        // In a shared session, propagate the structural change to peers through
        // the doc; the owner still persists via flushSave (no-op for peers).
        const api = collabApiRef.current;
        if (collabEnabledRef.current && api) {
            if (opts?.remap) api.remapTexts(opts.remap);
            api.pushStructure(next);
        }
        flushSave();
    }, [flushSave]);

    // ─── AI agent ─────────────────────────────────────────────────────────
    // Browser-side harness (Vercel AI SDK): the model loop runs client-side and
    // its tool calls act directly on this workspace. Only the LLM call is
    // proxied through /api/agent/chat (which holds the OpenAI key).
    const infosRef = useRef(infos);
    useEffect(() => { infosRef.current = infos; }, [infos]);

    // Whether to include the active file's relative path in the agent context.
    // The file *content* is never sent (the agent reads it via read_lines); this
    // only toggles the lightweight path hint. Driven by the AgentPanel checkbox.
    const [attachActiveFile, setAttachActiveFile] = useState(true);
    const attachActiveFileRef = useRef(attachActiveFile);
    useEffect(() => { attachActiveFileRef.current = attachActiveFile; }, [attachActiveFile]);

    // Selected agent model (gpt/gemini). Read through a ref so the request
    // builder always sends the current choice without recreating the chat.
    const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
    const modelIdRef = useRef(modelId);
    useEffect(() => { modelIdRef.current = modelId; }, [modelId]);

    // Edit-approval mode: when on, the agent's file changes wait for the user to
    // click 적용/취소 before they apply. Off (default) = auto-apply.
    const [approvalRequired, setApprovalRequired] = useState(false);
    const approvalRequiredRef = useRef(approvalRequired);
    useEffect(() => { approvalRequiredRef.current = approvalRequired; }, [approvalRequired]);

    // Live snapshot attached to every request. Paths + diagnostics only — no
    // file content — so it stays small and the server can keep it out of the
    // cacheable prefix.
    const getAgentContext = useCallback((): AgentContext => {
        const b = pendingBundleRef.current;
        const files = listBundleFiles(b.tree).filter(({ path }) => !isBinaryName(path)).map(f => f.path);
        return {
            entry: b.entry,
            activeFile: attachActiveFileRef.current ? b.ui.activeFile : "",
            files,
            diagnostics: infosRef.current.map(d => ({
                line: d.line,
                column: d.column,
                severity: String(d.severity),
                message: d.message,
            })),
        };
    }, []);

    // read_file tool — whole file as the (line, hash, content) view.
    const agentReadFile = useCallback((path: string): AgentReadResult => {
        const f = findBundleFile(pendingBundleRef.current.tree, path);
        if (!f) return { ok: false, error: `파일을 찾을 수 없습니다: ${path}` };
        if (isBinaryName(path) || f.encoding === "base64") return { ok: false, error: "바이너리 파일은 읽을 수 없습니다" };
        const { total, lines } = readLineRange(f.content);
        return { ok: true, total, lines };
    }, []);

    // read_lines tool — a 1-based, inclusive line range as (line, hash, content).
    const agentReadLines = useCallback((path: string, start?: number, end?: number): AgentReadResult => {
        const f = findBundleFile(pendingBundleRef.current.tree, path);
        if (!f) return { ok: false, error: `파일을 찾을 수 없습니다: ${path}` };
        if (isBinaryName(path) || f.encoding === "base64") return { ok: false, error: "바이너리 파일은 읽을 수 없습니다" };
        const { total, lines } = readLineRange(f.content, start, end);
        return { ok: true, total, lines };
    }, []);

    // write_file tool. Routes through applyBundleChange (collab structure push +
    // owner persist) and, for content, mirrors into the collab doc + open Monaco
    // model exactly like writeProjectConfig. Gated on canEdit so a read-only
    // viewer / non-joined peer can't have the agent edit on their behalf.
    const agentWriteFile = useCallback((path: string, content: string): AgentWriteResult => {
        if (!canEditRef.current) return { ok: false, error: "편집 권한이 없습니다 (읽기 전용 세션)" };
        const { base } = splitPath(path);
        const validationErr = validateFileName(base);
        if (validationErr) return { ok: false, error: validationErr };
        if (isBinaryName(path)) return { ok: false, error: "바이너리(이미지) 파일은 편집할 수 없습니다" };
        const existingNode = findBundleFile(pendingBundleRef.current.tree, path);
        const before = existingNode && existingNode.encoding !== "base64" ? existingNode.content : "";
        // Eager dry-run for new files so a path conflict surfaces before approval.
        if (!existingNode && !bundleAddFile(pendingBundleRef.current.tree, path, content)) {
            return { ok: false, error: "파일을 생성할 수 없습니다 (경로 충돌)" };
        }
        // Side effects deferred to commit() — applied now (auto mode) or on the
        // user's approval. Re-checks existence against the live tree at commit.
        const commit = () => {
            applyBundleChange(prev => {
                if (findBundleFile(prev.tree, path)) {
                    return { ...prev, tree: setFileContent(prev.tree, path, content) };
                }
                const nextTree = bundleAddFile(prev.tree, path, content);
                if (!nextTree) return null;
                return {
                    ...prev,
                    tree: nextTree,
                    ui: {
                        ...prev.ui,
                        activeFile: path,
                        openTabs: prev.ui.openTabs.includes(path) ? prev.ui.openTabs : [...prev.ui.openTabs, path],
                    },
                };
            });
            if (collabEnabledRef.current) collabApiRef.current?.setText(path, content);
            codeEditorRef.current?.syncModelContent(path, content);
        };
        return { ok: true, before, after: content, commit };
    }, [applyBundleChange]);

    // edit_file tool. Resolves the model's hash-addressed line edits against the
    // current file, then overwrites it through the same collab-aware path as
    // agentWriteFile (edit_file only ever targets existing files).
    const agentEditFile = useCallback((path: string, edits: LineEdit[]): AgentEditResult => {
        if (!canEditRef.current) return { ok: false, error: "편집 권한이 없습니다 (읽기 전용 세션)" };
        const f = findBundleFile(pendingBundleRef.current.tree, path);
        if (!f) return { ok: false, error: `파일을 찾을 수 없습니다: ${path}` };
        if (isBinaryName(path) || f.encoding === "base64") return { ok: false, error: "바이너리(이미지) 파일은 편집할 수 없습니다" };
        const applied = applyHashEdits(f.content, edits);
        if (!applied.ok) return { ok: false, error: applied.error };
        const after = applied.content;
        const commit = () => {
            applyBundleChange(prev => ({ ...prev, tree: setFileContent(prev.tree, path, after) }));
            if (collabEnabledRef.current) collabApiRef.current?.setText(path, after);
            codeEditorRef.current?.syncModelContent(path, after);
        };
        return { ok: true, lines: applied.lines, before: f.content, after, commit };
    }, [applyBundleChange]);

    // list_files / glob / grep — read-only workspace navigation.
    const agentListFiles = useCallback((): AgentListResult => {
        const b = pendingBundleRef.current;
        return { ok: true, entry: b.entry, files: listBundleFiles(b.tree).map(f => f.path) };
    }, []);

    const agentGlob = useCallback((pattern: string): AgentGlobResult => {
        let re: RegExp;
        try { re = globToRegExp(pattern); } catch { return { ok: false, error: `잘못된 glob 패턴: ${pattern}` }; }
        const matches = listBundleFiles(pendingBundleRef.current.tree).map(f => f.path).filter(p => re.test(p));
        return { ok: true, matches };
    }, []);

    const agentGrep = useCallback((pattern: string, path?: string, ignoreCase?: boolean): AgentGrepResult => {
        let files = listBundleFiles(pendingBundleRef.current.tree)
            .filter(({ path: p, file }) => !isBinaryName(p) && file.encoding !== "base64")
            .map(({ path: p, file }) => ({ path: p, content: file.content }));
        if (path) files = files.filter(f => f.path === path);
        const r = grepFiles(files, pattern, { ignoreCase, limit: 100 });
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, matches: r.matches, truncated: r.truncated };
    }, []);

    // rename_file — rename and/or move, creating the destination folder if needed.
    // Goes through applyBundleChange with a path remap so the collab layer carries
    // each file's Y.Text across the path change (same as the file-tree handlers).
    const agentRenameFile = useCallback((path: string, newPath: string): AgentRenameResult => {
        if (!canEditRef.current) return { ok: false, error: "편집 권한이 없습니다 (읽기 전용 세션)" };
        if (path === newPath) return { ok: true };
        if (!findBundleFile(pendingBundleRef.current.tree, path)) return { ok: false, error: `파일을 찾을 수 없습니다: ${path}` };
        const { dir: oldDir, base: oldName } = splitPath(path);
        const { dir: newDir, base: newName } = splitPath(newPath);
        const nameErr = validateFileName(newName);
        if (nameErr) return { ok: false, error: nameErr };
        const rewrite = (p: string) =>
            p === path ? newPath
            : p.startsWith(path + "/") ? newPath + p.slice(path.length)
            : p;
        // Pure tree transform — shared by the eager dry-run (validate before
        // approval) and the deferred commit.
        const transformTree = (tree: CppBundle["tree"]): { tree: CppBundle["tree"] } | { error: string } => {
            let t = tree;
            if (newDir !== oldDir) {
                if (newDir) { const withFolder = bundleAddFolder(t, newDir); if (withFolder) t = withFolder; }
                const moved = bundleMoveNode(t, path, newDir);
                if (!moved) return { error: "이동할 수 없습니다 (경로 충돌 또는 잘못된 대상)" };
                t = moved;
            }
            if (newName !== oldName) {
                const movedPath = newDir ? `${newDir}/${oldName}` : oldName;
                const renamed = bundleRenameNode(t, movedPath, newName);
                if (!renamed) return { error: "이름을 변경할 수 없습니다 (이름 충돌)" };
                t = renamed;
            }
            return { tree: t };
        };
        const dry = transformTree(pendingBundleRef.current.tree);
        if ("error" in dry) return { ok: false, error: dry.error };
        const commit = () => {
            applyBundleChange(prev => {
                const r = transformTree(prev.tree);
                if ("error" in r) return null;
                return {
                    ...prev,
                    tree: r.tree,
                    entry: rewrite(prev.entry),
                    ui: {
                        ...prev.ui,
                        activeFile: rewrite(prev.ui.activeFile),
                        openTabs: prev.ui.openTabs.map(rewrite),
                    },
                };
            }, { remap: rewrite });
        };
        return { ok: true, commit };
    }, [applyBundleChange]);

    // delete_file — destructive, so it routes through the same confirmation modal
    // the UI uses (human-in-the-loop). handleDeleteNode is defined later, so we
    // reach it through a ref assigned on each render.
    const requestDeleteRef = useRef<((path: string) => void) | null>(null);
    const agentDeleteFile = useCallback((path: string): AgentDeleteResult => {
        if (!canEditRef.current) return { ok: false, error: "편집 권한이 없습니다 (읽기 전용 세션)" };
        const affected = descendantFilePaths(pendingBundleRef.current.tree, path);
        if (affected.length === 0) return { ok: false, error: `파일을 찾을 수 없습니다: ${path}` };
        if (affected.includes(pendingBundleRef.current.entry)) {
            return { ok: false, error: "진입(entry) 파일은 삭제할 수 없습니다" };
        }
        requestDeleteRef.current?.(path);
        return { ok: true, status: "confirmation_requested" };
    }, []);

    // run tool — a pending agent run is captured here and fulfilled by
    // handleWorkerMessage when the worker reports done/error. agentRun itself is
    // defined after handleRun (it needs the worker + compile flow), and the
    // useClangAgent hook is instantiated there once every callback exists.
    const agentRunRef = useRef<{
        resolve: (r: AgentRunResult) => void;
        logs: string[];
        result: string | null;
        timer: ReturnType<typeof setTimeout> | null;
    } | null>(null);

    // ─── Collab wiring ────────────────────────────────────────────────────
    // A peer's structural change → apply tree/entry to the local bundle while
    // preserving this client's per-user ui (pruning tabs for deleted files).
    const applyRemoteStructure = useCallback((snapshot: StructureSnapshot) => {
        const prev = pendingBundleRef.current;
        const allPaths = new Set(listBundleFiles(snapshot.tree).map(f => f.path));
        const openTabs = prev.ui.openTabs.filter(p => allPaths.has(p));
        let activeFile = prev.ui.activeFile;
        if (!allPaths.has(activeFile)) activeFile = openTabs[openTabs.length - 1] ?? snapshot.entry;
        if (allPaths.has(activeFile) && !openTabs.includes(activeFile)) openTabs.push(activeFile);
        const next: CppBundle = {
            ...prev,
            tree: snapshot.tree,
            entry: snapshot.entry,
            ui: { ...prev.ui, openTabs, activeFile },
        };
        pendingBundleRef.current = next;
        setBundle(next);
        if (activeFile !== prev.ui.activeFile) setActiveUri(pathToUri(activeFile));
        // Owner persists peer-driven structural changes.
        if (isOwnerRef.current) scheduleAutosave();
    }, [scheduleAutosave]);

    const handleCollabTextsChanged = useCallback(() => {
        // A peer's Y.Text arrived/left — (re)bind any unbound editor models.
        codeEditorRef.current?.rebindCollab();
    }, []);

    const getCurrentBundle = useCallback(() => pendingBundleRef.current, []);

    const collab = useClangCollab({
        fileId,
        enabled: collabEnabled,
        isOwner,
        getCurrentBundle,
        onRemoteStructure: applyRemoteStructure,
        onTextsChanged: handleCollabTextsChanged,
    });
    useEffect(() => { collabApiRef.current = collab; }, [collab]);

    // Generalized edit permission. The owner can always edit their project
    // (solo or hosting a session). A non-owner edits only while actually joined
    // to a live session (status "connected"); otherwise it's the read-only
    // saved view. Mirrored into the ref the stable edit handlers read.
    const inSession = collab.status === "connected";
    const canEdit = isOwner || inSession;
    useEffect(() => { canEditRef.current = canEdit; }, [canEdit]);

    // Owner starts/stops a live session. Starting ensures the file is link-shared
    // (so invitees can open it) and connects as the session anchor; stopping
    // disconnects, which closes the room for everyone (link stays valid for the
    // read-only/duplicate view).
    const [sessionStarting, setSessionStarting] = useState(false);
    const handleStartSession = useCallback(async () => {
        if (!isOwner || sessionStarting) return;
        setSessionStarting(true);
        try {
            if ((fileMeta?.visibility ?? initialFile.visibility) !== "link") {
                const updated = await setFileVisibility(fileId, "link");
                setFileMeta(updated);
            }
            setSessionActive(true);
        } catch {
            setErrorMsg(tx("clang.collab_start_failed"));
        } finally {
            setSessionStarting(false);
        }
    }, [isOwner, sessionStarting, fileMeta, initialFile.visibility, fileId]);

    const handleStopSession = useCallback(() => {
        setSessionActive(false);
    }, []);

    // Publish which file this client is viewing (presence).
    useEffect(() => {
        collab.setActiveFile(uriToPath(activeUri));
    }, [activeUri, collab]);

    // Attach/detach the editor's Yjs bindings as the session connects/ends.
    useEffect(() => {
        const editor = codeEditorRef.current;
        if (!editor) return;
        if (collabEnabled && collab.texts && collab.awareness) {
            const texts = collab.texts;
            editor.attachCollab((path) => texts.get(path), collab.awareness);
            return () => editor.detachCollab();
        }
    }, [collabEnabled, collab.texts, collab.awareness, editorReady]);

    // FileTree-driven create/rename use inline inputs (VS Code style) and
    // surface errors back into the input via a return value: returning a
    // string keeps the input open with that message, null commits.
    const handleCreateFile = useCallback((parentPath: string, name: string): string | null => {
        if (!canEditRef.current) return tx("clang.no_permission");
        const validationErr = validateFileName(name);
        if (validationErr) return validationErr;
        const path = parentPath ? `${parentPath}/${name}` : name;
        let resultErr: string | null = null;
        applyBundleChange(prev => {
            const nextTree = bundleAddFile(prev.tree, path, "");
            if (!nextTree) { resultErr = tx("clang.file_name_conflict"); return null; }
            return {
                ...prev,
                tree: nextTree,
                ui: {
                    ...prev.ui,
                    activeFile: path,
                    openTabs: prev.ui.openTabs.includes(path) ? prev.ui.openTabs : [...prev.ui.openTabs, path],
                },
            };
        });
        return resultErr;
    }, [applyBundleChange]);

    const handleCreateFolder = useCallback((parentPath: string, name: string): string | null => {
        if (!canEditRef.current) return tx("clang.no_permission");
        const validationErr = validateFolderName(name);
        if (validationErr) return validationErr;
        const path = parentPath ? `${parentPath}/${name}` : name;
        let resultErr: string | null = null;
        applyBundleChange(prev => {
            const nextTree = bundleAddFolder(prev.tree, path);
            if (!nextTree) { resultErr = tx("clang.folder_name_conflict"); return null; }
            return { ...prev, tree: nextTree };
        });
        return resultErr;
    }, [applyBundleChange]);

    const handleRenameNode = useCallback((path: string, newName: string): string | null => {
        if (!canEditRef.current) return tx("clang.no_permission");
        const { base, dir } = splitPath(path);
        if (newName === base) return null; // no-op
        const isFile = listBundleFiles(pendingBundleRef.current.tree).some(f => f.path === path);
        const validationErr = isFile ? validateFileName(newName) : validateFolderName(newName);
        if (validationErr) return validationErr;
        const newPath = dir ? `${dir}/${newName}` : newName;
        const rewrite = (p: string) =>
            p === path ? newPath
            : p.startsWith(path + "/") ? newPath + p.slice(path.length)
            : p;
        let resultErr: string | null = null;
        applyBundleChange(prev => {
            const nextTree = bundleRenameNode(prev.tree, path, newName);
            if (!nextTree) { resultErr = tx("clang.name_conflict"); return null; }
            return {
                ...prev,
                tree: nextTree,
                entry: rewrite(prev.entry),
                ui: {
                    ...prev.ui,
                    activeFile: rewrite(prev.ui.activeFile),
                    openTabs: prev.ui.openTabs.map(rewrite),
                },
            };
        }, { remap: rewrite });
        return resultErr;
    }, [applyBundleChange]);

    // Confirmation modal state for delete. The FileTree fires
    // `onDelete(path)` synchronously; we don't actually delete until the
    // user confirms (or dismiss-via-Escape/click-outside cancels).
    // `kind: "entry-block"` is shown when the path being deleted contains
    // the project entry — that case is informational only.
    const [deleteConfirm, setDeleteConfirm] = useState<
        | { kind: "entry-block"; path: string }
        | { kind: "confirm"; path: string; affected: string[] }
        | null
    >(null);

    const handleDeleteNode = useCallback((path: string) => {
        if (!canEditRef.current) return;
        const affected = descendantFilePaths(pendingBundleRef.current.tree, path);
        if (affected.includes(pendingBundleRef.current.entry)) {
            setDeleteConfirm({ kind: "entry-block", path });
            return;
        }
        setDeleteConfirm({ kind: "confirm", path, affected });
    }, []);
    // Let the agent's delete_file tool open the same confirmation modal.
    requestDeleteRef.current = handleDeleteNode;

    const confirmDelete = useCallback(() => {
        const pending = deleteConfirm;
        if (!pending || pending.kind !== "confirm") return;
        const { path, affected } = pending;
        applyBundleChange(prev => {
            const nextTree = bundleRemoveNode(prev.tree, path);
            const removed = new Set(affected);
            const newOpenTabs = prev.ui.openTabs.filter(p => !removed.has(p));
            let activeFile = prev.ui.activeFile;
            if (removed.has(activeFile)) {
                activeFile = newOpenTabs[newOpenTabs.length - 1] ?? prev.entry;
                if (!newOpenTabs.includes(activeFile)) newOpenTabs.push(activeFile);
            }
            return {
                ...prev,
                tree: nextTree,
                ui: { ...prev.ui, openTabs: newOpenTabs, activeFile },
            };
        });
        setDeleteConfirm(null);
    }, [applyBundleChange, deleteConfirm]);

    const handleMoveNode = useCallback((srcPath: string, destDir: string) => {
        if (!canEditRef.current) return;
        const srcName = srcPath.split("/").pop()!;
        const newPath = destDir ? `${destDir}/${srcName}` : srcName;
        // Move shifts every descendant path; prefix-swap entry / activeFile /
        // openTabs (and the collab Y.Text keys) the same way rename does.
        const rewrite = (p: string) =>
            p === srcPath ? newPath
            : p.startsWith(srcPath + "/") ? newPath + p.slice(srcPath.length)
            : p;
        applyBundleChange(prev => {
            const nextTree = bundleMoveNode(prev.tree, srcPath, destDir);
            if (!nextTree) {
                // No-op (same parent), invalid (cycle), or name collision —
                // only the collision case is worth surfacing.
                return null;
            }
            return {
                ...prev,
                tree: nextTree,
                entry: rewrite(prev.entry),
                ui: {
                    ...prev.ui,
                    activeFile: rewrite(prev.ui.activeFile),
                    openTabs: prev.ui.openTabs.map(rewrite),
                },
            };
        }, { remap: rewrite });
    }, [applyBundleChange]);

    const handleSetAsEntry = useCallback((path: string) => {
        if (!canEditRef.current) return;
        if (!path.toLowerCase().endsWith(".cpp")) {
            window.alert(tx("clang.entry_must_cpp"));
            return;
        }
        applyBundleChange(prev => prev.entry === path ? null : { ...prev, entry: path });
    }, [applyBundleChange]);

    // ─── Per-file upload / download ───────────────────────────────────────
    // The native <input type="file"> can't be programmatically targeted to a
    // specific folder, so we stash the desired parent path in a ref and read
    // it from the change handler. A single hidden input is reused for every
    // upload invocation.
    const uploadInputRef = useRef<HTMLInputElement | null>(null);
    const uploadParentRef = useRef<string>("");
    // Dedicated hidden input for the settings window's ".ico 업로드" button —
    // always targets build/icon and sets compile.icon on success.
    const iconUploadInputRef = useRef<HTMLInputElement | null>(null);

    const handleUploadFile = useCallback((parentPath: string) => {
        if (!canEditRef.current) return;
        uploadParentRef.current = parentPath;
        if (uploadInputRef.current) {
            // Reset so re-uploading the same filename still triggers change.
            uploadInputRef.current.value = "";
            uploadInputRef.current.click();
        }
    }, []);

    const handleUploadInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const name = file.name;
        const err = validateFileName(name);
        if (err) { window.alert(err); return; }
        // Cap per-file size at 1 MB. The whole bundle is bounded by the
        // backend's 5 MB content limit; this is a friendlier per-file ceiling.
        if (file.size > 1 * 1024 * 1024) {
            window.alert(tx("clang.file_too_large_1mb"));
            return;
        }
        const parentPath = uploadParentRef.current;
        const path = parentPath ? `${parentPath}/${name}` : name;
        const binary = isBinaryName(name);
        const content = binary ? await fileToBase64(file) : await file.text();
        applyBundleChange(prev => {
            const nextTree = bundleAddFile(prev.tree, path, content, binary ? "base64" : undefined);
            if (!nextTree) { window.alert(tx("clang.file_name_conflict")); return null; }
            // Binary assets (icons) aren't editable — add them to the tree
            // without opening an editor tab. Text files open as before.
            if (binary) return { ...prev, tree: nextTree };
            return {
                ...prev,
                tree: nextTree,
                ui: {
                    ...prev.ui,
                    activeFile: path,
                    openTabs: prev.ui.openTabs.includes(path) ? prev.ui.openTabs : [...prev.ui.openTabs, path],
                },
            };
        });
    }, [applyBundleChange]);

    // Settings window ".ico 업로드": pick a .ico, store it under build/icon,
    // and point compile.icon at it — all in one persisted change.
    const handleUploadIcon = useCallback(() => {
        if (!canEditRef.current) return;
        if (iconUploadInputRef.current) {
            iconUploadInputRef.current.value = "";
            iconUploadInputRef.current.click();
        }
    }, []);

    const handleIconUploadChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || !canEditRef.current) return;
        const name = file.name;
        if (!isBinaryName(name)) { window.alert(tx("clang.image_only")); return; }
        const nameErr = validateFileName(name);
        if (nameErr) { window.alert(nameErr); return; }
        // Source images can be larger than a finished .ico (the server converts).
        if (file.size > 4 * 1024 * 1024) { window.alert(tx("clang.file_too_large_4mb")); return; }
        const base64 = await fileToBase64(file);
        const path = `${ICON_DIR}/${name}`;
        // Serialize config.json up front so a parse error aborts before we touch
        // the tree (writeProjectConfig has the same guard).
        const existingCfg = findBundleFile(pendingBundleRef.current.tree, CONFIG_FILENAME);
        const cfg = serializeProjectConfig(existingCfg?.content ?? null, {
            build: { ...buildCfg.options, icon: path },
            compile: compileCfg.options,
            environment: envCfg.environment,
        });
        if (cfg.error) { window.alert(tx("clang.config_json_format_error")); return; }
        applyBundleChange(prev => {
            // 1) add (replacing any existing file at the path) the icon under
            //    build/icon — remove+add guarantees base64 encoding even if a
            //    stray text file already sat at that path.
            const base = findBundleFile(prev.tree, path) ? bundleRemoveNode(prev.tree, path) : prev.tree;
            let tree = bundleAddFile(base, path, base64, "base64");
            if (!tree) return null;
            // 2) point compile.icon at it in config.json
            tree = findBundleFile(tree, CONFIG_FILENAME)
                ? setFileContent(tree, CONFIG_FILENAME, cfg.content)
                : bundleAddFile(tree, CONFIG_FILENAME, cfg.content);
            if (!tree) return null;
            return { ...prev, tree };
        });
        // In a shared session config.json's content lives in its Y.Text; write
        // it there (the icon itself is binary and rides the structure snapshot).
        if (collabEnabledRef.current) collabApiRef.current?.setText(CONFIG_FILENAME, cfg.content);
        // Mirror into the open config.json model, matching writeProjectConfig.
        codeEditorRef.current?.syncModelContent(CONFIG_FILENAME, cfg.content);
    }, [applyBundleChange, buildCfg, compileCfg, envCfg]);

    const handleDownloadTreeFile = useCallback((path: string) => {
        const file = findBundleFile(pendingBundleRef.current.tree, path);
        if (!file) return;
        const blob = file.encoding === "base64"
            ? new Blob([base64ToBytes(file.content)], { type: "application/octet-stream" })
            : new Blob([file.content], { type: `${path.toLowerCase().endsWith(".hpp") ? "text/x-c++hdr" : "text/x-c++src"};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        // Use the file's basename (last segment) so nested files don't try to
        // download as `src/util.hpp` — most browsers reject `/` in download
        // filenames anyway.
        a.download = path.split("/").pop() || "untitled";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }, []);

    const handleOpenFile = useCallback((path: string) => {
        // Binary assets (icons) can't be edited — show a preview overlay
        // instead of routing them through the (text-only) editor.
        if (isBinaryName(path)) { setImagePreview(path); return; }
        const prev = pendingBundleRef.current;
        const openTabs = prev.ui.openTabs.includes(path)
            ? prev.ui.openTabs
            : [...prev.ui.openTabs, path];
        if (prev.ui.openTabs === openTabs && prev.ui.activeFile === path) {
            setActiveUri(pathToUri(path));
            return;
        }
        const next: CppBundle = {
            ...prev,
            ui: { ...prev.ui, openTabs, activeFile: path },
        };
        pendingBundleRef.current = next;
        setBundle(next);
        setActiveUri(pathToUri(path));
        scheduleAutosave();
    }, [scheduleAutosave]);

    // Click-to-scroll from the agent's tool chips (read_lines / grep / glob).
    // Opens the file (if needed) and reveals the line. revealAt is a no-op until
    // the model exists, so re-try across a few frames to catch the open we just
    // scheduled; repeated reveals of the same line are idempotent.
    const agentRevealRange = useCallback((path: string, line: number) => {
        if (isBinaryName(path) || !findBundleFile(pendingBundleRef.current.tree, path)) return;
        handleOpenFile(path);
        const uri = pathToUri(path);
        const target = Math.max(1, line || 1);
        let tries = 3;
        const tick = () => {
            codeEditorRef.current?.revealAt(uri, target);
            if (--tries > 0) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }, [handleOpenFile]);

    const handleToggleTree = useCallback(() => {
        const prev = pendingBundleRef.current;
        const next: CppBundle = {
            ...prev,
            ui: { ...prev.ui, treeOpen: !prev.ui.treeOpen },
        };
        pendingBundleRef.current = next;
        setBundle(next);
        scheduleAutosave();
    }, [scheduleAutosave]);

    // ─── Download ─────────────────────────────────────────────────────────
    const handleDownloadCpp = useCallback(() => {
        const entryFile = listBundleFiles(bundle.tree).find(f => f.path === bundle.entry);
        const code = entryFile?.file.content ?? "";
        const blob = new Blob([code], { type: "text/x-c++src;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const base = (fileName || "untitled").replace(/\.(cpp|cc|cxx|c\+\+|h|hpp|hxx)$/i, "");
        a.download = `${base || "untitled"}.cpp`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }, [bundle.tree, bundle.entry, fileName]);

    // ─── Wasm worker / runtime backend ────────────────────────────────────
    const workerRef = useRef<Worker | null>(null);
    const tfBackendRef = useRef<string>("initializing");
    useEffect(() => { tfBackendRef.current = tfBackend; }, [tfBackend]);
    const pendingBackendSwitchRef = useRef<{ previous: string } | null>(null);

    const handleSwitchBackend = useCallback((backend: string) => {
        const worker = workerRef.current;
        if (!worker) return;
        pendingBackendSwitchRef.current = { previous: tfBackendRef.current };
        setTfBackend("initializing");
        worker.postMessage({ type: "switch-backend", backend } satisfies ClangWorkerInMsg);
    }, []);

    // Apply config's pinned device once the worker has reported its initial
    // (fallback-chosen) backend. Only when explicitly set and different — the
    // default (webgpu) already matches the worker's own preference, so a
    // default-valued project never forces a switch.
    const initialDeviceAppliedRef = useRef(false);
    useEffect(() => {
        if (initialDeviceAppliedRef.current) return;
        if (tfBackend === "initializing") return;
        initialDeviceAppliedRef.current = true;
        if (envCfg.deviceExplicit && envCfg.environment.device !== tfBackend) {
            handleSwitchBackend(envCfg.environment.device);
        }
    }, [tfBackend, envCfg, handleSwitchBackend]);
    const {
        logAreaRef, addLog, addBar, setBar,
        addSeries, logToHolder, visualToHolder, graphToHolder,
        clearLog,
    } = useConsolePanel();

    const bindingsRef = useRef({ addLog, addBar, setBar, addSeries, logToHolder, visualToHolder, graphToHolder });
    useEffect(() => {
        bindingsRef.current = { addLog, addBar, setBar, addSeries, logToHolder, visualToHolder, graphToHolder };
    }, [addLog, addBar, setBar, addSeries, logToHolder, visualToHolder, graphToHolder]);

    const [editorNotice, setEditorNotice] = useState<string | null>(null);
    const editorNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (editorNoticeTimerRef.current) clearTimeout(editorNoticeTimerRef.current);
    }, []);
    const handleUnresolvedDefinition = useCallback((uri: string) => {
        const filename = uri.split(/[/\\]/).pop() || uri;
        setEditorNotice(tx("clang.external_lib_locked", { 0: filename }));
        if (editorNoticeTimerRef.current) clearTimeout(editorNoticeTimerRef.current);
        editorNoticeTimerRef.current = setTimeout(() => setEditorNotice(null), 4500);
    }, []);

    // Set each render to the latest debug-message handler (the worker handler
    // below is stable, so it routes debug events through this ref).
    const debugHandlerRef = useRef<((m: DebugOutMsg) => boolean) | null>(null);

    const handleWorkerMessage = useCallback((e: MessageEvent<WorkerOutMsg | DebugOutMsg>) => {
        const msg = e.data;

        // Debug events ("dbg-*") are owned by the useClangDebug hook.
        if (typeof msg.type === "string" && msg.type.startsWith("dbg-")) {
            debugHandlerRef.current?.(msg as DebugOutMsg);
            return;
        }
        const b = bindingsRef.current;

        if (msg.type === "ready") { setRunState("idle"); return; }
        if (msg.type === "input-request") {
            setRightTab("console");
            setInputRequest({ kind: msg.kind });
            return;
        }
        if (msg.type === "backend-switched") {
            setTfBackend(msg.backend);
            pendingBackendSwitchRef.current = null;
            return;
        }
        if (msg.type === "log") {
            b.logToHolder(msg.holderId, msg.kind, msg.text);
            if (agentRunRef.current) agentRunRef.current.logs.push(`[${msg.kind}] ${msg.text}`);
            return;
        }
        if (msg.type === "holder_create") { if (msg.kind === "series") b.addSeries(msg.holderId); return; }
        if (msg.type === "bar_create") { b.addBar(msg.min, msg.max, msg.barId); return; }
        if (msg.type === "bar_set") { b.setBar(msg.barId, msg.val); return; }
        if (msg.type === "visual") {
            const imageUrl = mat_data_to_image_url(new Float32Array(msg.data), msg.rows, msg.cols);
            b.visualToHolder(msg.holderId, imageUrl, msg.rows, msg.cols);
            return;
        }
        if (msg.type === "visual_vec") {
            const imageUrl = vec_field_to_image_url(new Float32Array(msg.dx), new Float32Array(msg.dy), msg.rows, msg.cols);
            b.visualToHolder(msg.holderId, imageUrl, msg.rows, msg.cols);
            return;
        }
        if (msg.type === "graph_array") {
            b.graphToHolder(msg.holderId, msg.data, msg.fixedMin, msg.fixedMax);
            return;
        }
        if (msg.type === "result") {
            setResultValue(msg.value);
            if (agentRunRef.current) agentRunRef.current.result = msg.value;
            return;
        }
        if (msg.type === "done") {
            setRunState("done");
            const run = agentRunRef.current;
            if (run) {
                agentRunRef.current = null;
                if (run.timer) clearTimeout(run.timer);
                run.resolve({ ok: true, result: run.result, output: run.logs.join("\n") });
            }
            return;
        }
        if (msg.type === "error") {
            if (pendingBackendSwitchRef.current) {
                setTfBackend(pendingBackendSwitchRef.current.previous);
                pendingBackendSwitchRef.current = null;
                b.addLog("error", msg.message);
                return;
            }
            b.addLog("error", msg.message);
            setErrorMsg(msg.message);
            setRunState("error");
            const run = agentRunRef.current;
            if (run) {
                agentRunRef.current = null;
                if (run.timer) clearTimeout(run.timer);
                run.resolve({ ok: false, error: msg.message, output: run.logs.join("\n") });
            }
            return;
        }
    }, []);

    const createWorker = useCallback(() => {
        const worker = new Worker(
            new URL("@/utils/wasm/clang-worker.ts", import.meta.url),
            { type: "module" }
        );
        worker.addEventListener("message", handleWorkerMessage);
        workerRef.current = worker;
        worker.postMessage({ type: "init" } satisfies ClangWorkerInMsg);
        return worker;
    }, [handleWorkerMessage]);

    useEffect(() => {
        const worker = createWorker();
        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, [createWorker]);

    // Hard-stop for a runaway debug session: kill the worker and respawn it.
    const recreateWorker = useCallback(() => {
        workerRef.current?.terminate();
        createWorker();
    }, [createWorker]);

    // Persist breakpoint changes into the project bundle (autosaved like other
    // ui state). Defined before the hook so it can be passed in.
    const handleBreakpointsChange = useCallback((bps: Record<string, number[]>) => {
        const prev = pendingBundleRef.current;
        const next: CppBundle = { ...prev, ui: { ...prev.ui, breakpoints: bps } };
        pendingBundleRef.current = next;
        setBundle(next);
        scheduleAutosave();
    }, [scheduleAutosave]);

    const debug = useClangDebug({
        apiBase: API_BASE,
        workerRef,
        codeEditorRef,
        getBundle: useCallback(() => ({ tree: bundle.tree, entry: bundle.entry }), [bundle.tree, bundle.entry]),
        recreateWorker,
        onLog: useCallback((kind: "info" | "error" | "success", text: string) => {
            bindingsRef.current.addLog(kind, text);
        }, []),
        clearConsole: clearLog,
        initialBreakpoints: bundle.ui.breakpoints,
        onBreakpointsChange: handleBreakpointsChange,
    });
    debugHandlerRef.current = debug.handleDebugMessage;

    // Surface the debug panel while a session is compiling/running/paused.
    const debugActive = debug.status === "compiling" || debug.status === "running" || debug.status === "stopped";
    useEffect(() => {
        if (debugActive) setRightTab("debug");
    }, [debugActive]);

    // Re-apply breakpoint glyphs + the stop line when the active model changes
    // (a freshly-opened file's model starts with no decorations).
    const reapplyDecorations = debug.reapplyDecorations;
    useEffect(() => { reapplyDecorations(); }, [activeUri, editorReady, reapplyDecorations]);

    // Mirror the debug session into the shared run-state + top "output" area so
    // it behaves exactly like Run: cleared on start, the return value shown at
    // the end (the worker posts the same "result"/"done" messages on finish).
    useEffect(() => {
        switch (debug.status) {
            case "compiling": setResultValue(null); setErrorMsg(null); setRunState("compiling"); break;
            case "running":
            case "stopped":   setRunState("running"); break;
            case "error":     setRunState("error"); break;
            case "terminated":
                // Session over — surface the result like Run (value/"done" come
                // via the worker's result/done messages); jump back to console.
                setRightTab("console");
                break;
            // "idle": leave the run UI untouched.
        }
    }, [debug.status]);

    useEffect(() => {
        if (!isMobile) return;
        setManagerOpen(false);
        setRightTab("console");
    }, [isMobile]);

    // ─── Run / build ──────────────────────────────────────────────────────
    const handleRun = useCallback(async () => {
        if (runState === "loading" || runState === "compiling" || runState === "running") return;
        const worker = workerRef.current;
        if (!worker) return;

        if (isMobile) setMobileTab("result");

        clearLog();
        setErrorMsg(null);
        setResultValue(null);
        setInputRequest(null);
        setRunState("compiling");

        if (compileCfg.error) {
            setConfigAlert({ variant: "warning", title: tx("clang.config_json_error_title"), message: compileCfg.error });
        }

        try {
            const res = await fetch(`${API_BASE}/compile/emcc`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Send the whole bundle (incl. config.json + .ico as files); the
                // server reads compile options from config.json itself.
                body: JSON.stringify({ tree: bundle.tree, entry: bundle.entry }),
            });
            if (!res.ok) {
                const errText = await res.text();
                let detail = errText;
                try { detail = JSON.parse(errText).detail ?? errText; } catch { /* leave raw */ }
                setErrorMsg(detail);
                setRunState("error");
                return;
            }
            const wasmBuffer = await res.arrayBuffer();
            setRunState("running");
            worker.postMessage({ type: "run", wasmBuffer } satisfies ClangWorkerInMsg, [wasmBuffer]);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setRunState("error");
        }
    }, [bundle.tree, bundle.entry, runState, clearLog, isMobile, compileCfg]);

    // ─── Agent: run tool + hook instantiation ─────────────────────────────
    // agentRun mirrors handleRun's compile+execute, but resolves a promise when
    // the run finishes so the agent's `run` tool can return the result + output.
    // Compile failures resolve here directly; runtime completion (done/error)
    // resolves via handleWorkerMessage (which fills agentRunRef). 30s watchdog
    // guards a program that blocks on stdin with no user input.
    const agentRun = useCallback(async (): Promise<AgentRunResult> => {
        if (agentRunRef.current) return { ok: false, error: "이미 실행 중입니다" };
        if (runState === "loading" || runState === "compiling" || runState === "running") {
            return { ok: false, error: "이미 실행/컴파일 중입니다" };
        }
        const worker = workerRef.current;
        if (!worker) return { ok: false, error: "런타임 워커가 준비되지 않았습니다" };

        clearLog();
        setErrorMsg(null);
        setResultValue(null);
        setInputRequest(null);
        setRunState("compiling");
        if (compileCfg.error) {
            setConfigAlert({ variant: "warning", title: tx("clang.config_json_error_title"), message: compileCfg.error });
        }

        let wasmBuffer: ArrayBuffer;
        try {
            const res = await fetch(`${API_BASE}/compile/emcc`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tree: bundle.tree, entry: bundle.entry }),
            });
            if (!res.ok) {
                const errText = await res.text();
                let detail = errText;
                try { detail = JSON.parse(errText).detail ?? errText; } catch { /* leave raw */ }
                setErrorMsg(detail);
                setRunState("error");
                return { ok: false, error: `컴파일 실패: ${detail}` };
            }
            wasmBuffer = await res.arrayBuffer();
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            setErrorMsg(m);
            setRunState("error");
            return { ok: false, error: `컴파일 요청 실패: ${m}` };
        }

        return new Promise<AgentRunResult>((resolve) => {
            const timer = setTimeout(() => {
                const run = agentRunRef.current;
                if (!run) return;
                agentRunRef.current = null;
                resolve({ ok: false, error: "실행 시간 초과 (30초)", output: run.logs.join("\n") });
            }, 30000);
            agentRunRef.current = { resolve, logs: [], result: null, timer };
            setRunState("running");
            worker.postMessage({ type: "run", wasmBuffer } satisfies ClangWorkerInMsg, [wasmBuffer]);
        });
    }, [runState, bundle.tree, bundle.entry, clearLog, compileCfg, tx]);

    // check_syntax tool — compile-only (no execute). Reuses the emcc compile
    // endpoint: a successful build (wasm body) means no compile errors; a !ok
    // response carries the compiler stderr in `detail`, which we parse into
    // structured diagnostics. Reads the live bundle ref so it sees edits the
    // agent just made in the same turn. Does not touch the run/worker state.
    const agentCheckSyntax = useCallback(async (): Promise<AgentCheckResult> => {
        const b = pendingBundleRef.current;
        try {
            const res = await fetch(`${API_BASE}/compile/emcc`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tree: b.tree, entry: b.entry }),
            });
            if (res.ok) {
                await res.arrayBuffer(); // drain the wasm body; we only needed pass/fail
                return { ok: true, success: true, diagnostics: [], output: "" };
            }
            const errText = await res.text();
            let detail = errText;
            try { detail = JSON.parse(errText).detail ?? errText; } catch { /* leave raw */ }
            const knownPaths = listBundleFiles(b.tree).map(f => f.path);
            return { ok: true, success: false, diagnostics: parseCompilerErrors(detail, knownPaths), output: detail };
        } catch (err) {
            return { ok: false, error: `컴파일 요청 실패: ${err instanceof Error ? err.message : String(err)}` };
        }
    }, []);

    const agent = useClangAgent({
        getContext: getAgentContext,
        getModel: () => modelIdRef.current,
        getApprovalMode: () => approvalRequiredRef.current,
        listFiles: agentListFiles,
        glob: agentGlob,
        grep: agentGrep,
        readFile: agentReadFile,
        readLines: agentReadLines,
        writeFile: agentWriteFile,
        editFile: agentEditFile,
        renameFile: agentRenameFile,
        deleteFile: agentDeleteFile,
        run: agentRun,
        checkSyntax: agentCheckSyntax,
    });

    // Submit the value typed into the input panel; the clang worker resumes the
    // suspended run with it.
    const submitInput = useCallback(() => {
        if (!inputRequest) return;
        const raw = inputValue.trim();
        let value = inputRequest.kind === "i32" ? parseInt(raw, 10) : parseFloat(raw);
        if (!Number.isFinite(value)) value = 0;
        workerRef.current?.postMessage({ type: "input-response", value } satisfies ClangWorkerInMsg);
        setInputRequest(null);
        setInputValue("");
    }, [inputRequest, inputValue]);

    // ── Auto-run on URL ?autorun=1 ────────────────────────────────────────
    // Used by the landing-page iframes to show a workspace that already
    // produced a result instead of an empty console.
    const autorunFiredRef = useRef(false);
    const handleRunLatestRef = useRef<typeof handleRun>(handleRun);
    useEffect(() => { handleRunLatestRef.current = handleRun; }, [handleRun]);
    useEffect(() => {
        if (autorunFiredRef.current) return;
        if (searchParams.get("autorun") !== "1") return;
        if (!workerRef.current) return;
        const t = setTimeout(() => {
            if (autorunFiredRef.current) return;
            autorunFiredRef.current = true;
            handleRunLatestRef.current?.();
        }, 1200);
        return () => clearTimeout(t);
    }, [searchParams]);

    const handleBuild = useCallback(async () => {
        if (buildState === "building" || buildState === "downloading") return;

        setBuildState("building");
        setBuildProgress({ step: 0, total: 0, message: tx("clang.progress_sending") });

        if (compileCfg.error) {
            setConfigAlert({ variant: "warning", title: tx("clang.config_json_error_title"), message: compileCfg.error });
        }

        // Target OS (and the rest of the options) come from config.json; "auto"
        // lets the backend fall back to User-Agent sniffing.
        const buildUrl = `${API_BASE}/compile/build`;

        const ctrl = new AbortController();
        let uuid: string | null = null;
        let downloadName = "output";

        try {
            const doneUuid = await new Promise<string>((resolve, reject) => {
                fetchEventSource(buildUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    // Send the whole bundle (incl. config.json + .ico as files);
                    // the server reads compile options + resolves the exe icon
                    // from config.json's compile.icon relative path itself.
                    body: JSON.stringify({ tree: bundle.tree, entry: bundle.entry, lang: "cpp" }),
                    signal: ctrl.signal,
                    openWhenHidden: true,
                    async onopen(res) {
                        if (!res.ok) {
                            const err = await res.json().catch(() => ({ detail: res.statusText }));
                            throw new Error(err.detail ?? "Build failed");
                        }
                    },
                    onmessage(e) {
                        let payload: { uuid?: string; name?: string; step?: number; total?: number; message?: string; detail?: string };
                        try { payload = JSON.parse(e.data); } catch { return; }
                        if (e.event === "error") {
                            throw new Error(payload.detail ?? "Build failed");
                        }
                        if (e.event === "done") {
                            const finalUuid = payload.uuid ?? uuid;
                            if (!finalUuid) throw new Error("Build stream ended without uuid");
                            if (payload.name) downloadName = payload.name;
                            ctrl.abort();
                            resolve(finalUuid);
                            return;
                        }
                        if (payload.uuid && !uuid) uuid = payload.uuid;
                        if (payload.message) {
                            setBuildProgress(prev => ({
                                step: payload.step ?? prev?.step ?? 0,
                                total: payload.total ?? prev?.total ?? 0,
                                message: payload.message!,
                            }));
                        }
                    },
                    onerror(err) {
                        if ((err as Error)?.name !== "AbortError") {
                            reject(err instanceof Error ? err : new Error(String(err)));
                        }
                        throw err;
                    },
                    onclose() {
                        reject(new Error("Build stream ended without completion"));
                    },
                }).catch(reject);
            });

            setBuildState("downloading");
            setBuildProgress(prev => ({ step: prev?.step ?? 0, total: prev?.total ?? 0, message: tx("clang.progress_downloading") }));

            const dlRes = await fetch(`${API_BASE}/compile/build/download/${doneUuid}`);
            if (!dlRes.ok) {
                const err = await dlRes.json().catch(() => ({ detail: dlRes.statusText }));
                throw new Error(err.detail ?? "Download failed");
            }
            const blob = await dlRes.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = downloadName;
            a.click();
            URL.revokeObjectURL(url);

            setBuildState("done");
            setBuildProgress(prev => ({ step: prev?.total ?? 0, total: prev?.total ?? 0, message: tx("clang.progress_download_done") }));
        } catch (e) {
            setBuildState("error");
            setErrorMsg(e instanceof Error ? e.message : String(e));
        }
    }, [bundle.tree, bundle.entry, buildState, compileCfg]);

    // ─── Build config (config.json) ───────────────────────────────────────
    // "$config-json" opens the raw file (materializing it with defaults the
    // first time — invoking the command IS the explicit create action).
    const handleOpenConfigJson = useCallback(() => {
        const exists = !!findBundleFile(pendingBundleRef.current.tree, CONFIG_FILENAME);
        if (exists) { handleOpenFile(CONFIG_FILENAME); return; }
        if (!canEditRef.current) return;
        applyBundleChange(prev => {
            const nextTree = bundleAddFile(prev.tree, CONFIG_FILENAME, defaultConfigJson());
            if (!nextTree) return null;
            return {
                ...prev,
                tree: nextTree,
                ui: {
                    ...prev.ui,
                    activeFile: CONFIG_FILENAME,
                    openTabs: prev.ui.openTabs.includes(CONFIG_FILENAME) ? prev.ui.openTabs : [...prev.ui.openTabs, CONFIG_FILENAME],
                },
            };
        });
    }, [applyBundleChange, handleOpenFile]);

    // Write the project config (build + compile + environment) back into
    // config.json, creating the file on the first change. Only non-default
    // values are persisted; other top-level keys are preserved. Returns false
    // if the existing file couldn't be parsed (we won't clobber it). Owner-only.
    const writeProjectConfig = useCallback((build: BuildOptions, compile: CompileOptions, environment: EnvironmentOptions): boolean => {
        if (!canEditRef.current) return false;
        const existing = findBundleFile(pendingBundleRef.current.tree, CONFIG_FILENAME);
        const { content, error } = serializeProjectConfig(existing?.content ?? null, { build, compile, environment });
        if (error) return false;
        applyBundleChange(prev => {
            const ex = findBundleFile(prev.tree, CONFIG_FILENAME);
            const nextTree = ex
                ? setFileContent(prev.tree, CONFIG_FILENAME, content)
                : bundleAddFile(prev.tree, CONFIG_FILENAME, content);
            if (!nextTree) return null;
            return { ...prev, tree: nextTree };
        });
        // config.json is a text file, so in a shared session its content lives in
        // the Y.Text (the structure snapshot blanks text contents). Write it
        // there so peers and the owner's save see this programmatic change.
        if (collabEnabledRef.current) collabApiRef.current?.setText(CONFIG_FILENAME, content);
        // If config.json is open in a tab, mirror the change into its model so
        // the raw view updates live alongside the settings window.
        codeEditorRef.current?.syncModelContent(CONFIG_FILENAME, content);
        return true;
    }, [applyBundleChange]);

    // "$config" opens the VS Code-style settings window. Each section's changes
    // are written while keeping the other sections as-is.
    const handleCompileChange = useCallback((next: CompileOptions) => {
        writeProjectConfig(buildCfg.options, next, envCfg.environment);
    }, [writeProjectConfig, buildCfg, envCfg]);

    const handleBuildChange = useCallback((next: BuildOptions) => {
        writeProjectConfig(next, compileCfg.options, envCfg.environment);
    }, [writeProjectConfig, compileCfg, envCfg]);

    // Device change: switch the runtime backend live (for everyone), and for
    // owners also persist it to config["environment"]["device"].
    const handleDeviceChange = useCallback((device: DeviceKind) => {
        handleSwitchBackend(device);
        writeProjectConfig(buildCfg.options, compileCfg.options, { device });
    }, [handleSwitchBackend, writeProjectConfig, buildCfg, compileCfg]);

    const runDisabled = runState === "loading" || runState === "compiling" || runState === "running" || buildState === "building" || buildState === "downloading";
    const buildDisabled = runState === "loading" || runState === "compiling" || runState === "running" || buildState === "building" || buildState === "downloading";
    const runLabel =
        runState === "loading"   ? tx("clang.progress_loading") :
        runState === "compiling" ? tx("clang.progress_compiling") :
        runState === "running"   ? tx("workspace.ui.run_button_running") :
        tx("workspace.ui.run_button");
    const buildLabel =
        buildState === "building"    ? tx("clang.progress_building") :
        buildState === "downloading" ? tx("clang.progress_downloading") :
        buildCfg.options.system === "auto" ? "Build" :
        `Build (${SYSTEM_LABEL[buildCfg.options.system]})`;

    const runStatusLabel =
        runState === "loading"   ? tx("clang.status_loading")   :
        runState === "compiling" ? tx("clang.status_compiling") :
        runState === "running"   ? tx("clang.status_running")   :
        runState === "done"      ? tx("clang.status_done")      :
        runState === "error"     ? tx("clang.status_error")     :
        tx("clang.status_waiting");

    const runStatusColor =
        runState === "error"     ? token.color.danger  :
        runState === "done"      ? token.color.success :
        runState === "loading" || runState === "compiling" || runState === "running"
                                 ? token.color.accent  :
        token.color.fgSubtle;

    const runSpinning = runState === "loading" || runState === "compiling" || runState === "running";
    const buildSpinning = buildState === "building" || buildState === "downloading";
    // Build-progress snackbar: visible while building/downloading and after a successful build.
    const buildSnackVisible = !!buildProgress && (buildState === "building" || buildState === "downloading" || buildState === "done");
    const buildSnackStatus: "progress" | "done" = buildState === "done" ? "done" : "progress";

    // Workspace commands, surfaced in the editor's command palette (F1).
    const editorCommands = useMemo<EditorCommand[]>(() => [
        { id: "run", label: "Run", disabled: runDisabled, run: handleRun },
        { id: "debug", label: "Run (Debug)", disabled: debug.status === "compiling" || debug.status === "running", run: debug.handleDebug },
        { id: "build", label: "Build", disabled: buildDisabled, run: handleBuild },
        { id: "lsp", label: "Restart Language Server (LSP)", run: handleLspCommand },
        { id: "config", label: "Open Settings", run: () => setSettingsOpen(true) },
        { id: "config-json", label: "Open Settings (JSON)", run: handleOpenConfigJson },
    ], [runDisabled, buildDisabled, handleRun, handleBuild, handleLspCommand, handleOpenConfigJson, debug.status, debug.handleDebug]);

    const entryFile = useMemo(() => listBundleFiles(bundle.tree).find(f => f.path === bundle.entry), [bundle.tree, bundle.entry]);
    const entryCode = entryFile?.file.content ?? "";

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: token.color.bg, color: token.color.fg, fontSize: token.font.size.fs13 }}>
            {collabEnabled && <RemoteCursorStyles participants={collab.participants} />}
            {/* ── Top bar ── */}
            <header style={isMobile
                ? { display: "flex", alignItems: "center", gap: 4, padding: "0 12px", height: 48, borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0 }
                : { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 16px", height: 48, borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0 }
            }>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, whiteSpace: "nowrap", flex: isMobile ? 1 : undefined }}>
                    <TopbarBrand compact={isMobile} />
                    {!isMobile && <span style={{ color: token.color.fgSubtle, fontWeight: 300, marginLeft: 4 }}>/</span>}
                    <button
                        onClick={isOwner && !isMobile ? handleOpenManager : undefined}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: isMobile ? "4px 4px" : "4px 8px", borderRadius: token.radius.sm, background: "none", border: "none", cursor: isOwner && !isMobile ? "pointer" : "default", color: token.color.fgMuted, fontSize: token.font.size.fs12, fontFamily: token.font.family.mono, minWidth: 0, flex: isMobile ? "1 1 0" : undefined, overflow: "hidden" }}
                    >
                        {!isMobile && <Icon.File size={12} />}
                        {isMobile ? (
                            <span style={{ minWidth: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {fileName || "untitled"}
                            </span>
                        ) : (
                            <input
                                value={fileName}
                                onChange={e => isOwner && setFileName(e.target.value)}
                                onBlur={isOwner ? handleRenameFile : undefined}
                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                onClick={e => e.stopPropagation()}
                                placeholder="untitled"
                                readOnly={!isOwner}
                                style={{ background: "transparent", border: "none", outline: "none", color: "inherit", fontFamily: "inherit", fontSize: "inherit", width: 140, cursor: isOwner ? "text" : "default" }}
                            />
                        )}
                        {isOwner && !isMobile && <Icon.Chevron size={11} />}
                    </button>
                    {isOwner === false && !collabEnabled && (
                        <span style={{
                            marginLeft: 6,
                            padding: "2px 8px",
                            background: token.color.bgSubtle,
                            border: `1px solid ${token.color.border}`,
                            borderRadius: 999,
                            fontSize: token.font.size.fs10,
                            color: token.color.fgMuted,
                            fontFamily: token.font.family.mono,
                            whiteSpace: "nowrap",
                        }}>
                            {tx("workspace.ui.share_readonly_badge")}
                        </span>
                    )}
                </div>

                {/* center grid cell — reserved (commands live in the editor's F1 palette) */}
                {!isMobile && <div />}

                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                    {collabEnabled && (
                        <PresenceBar participants={collab.participants} status={collab.status} compact={isMobile} />
                    )}
                    {!isMobile && isOwner && (
                        sessionActive ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                leading={<Icon.Globe size={11} />}
                                onClick={handleStopSession}
                                title={tx("clang.collab_stop_title")}
                            >
                                {tx("clang.collab_stop")}
                            </Button>
                        ) : (
                            <Button
                                variant="secondary"
                                size="sm"
                                leading={sessionStarting ? <Spinner size="sm" /> : <Icon.Globe size={11} />}
                                onClick={handleStartSession}
                                disabled={sessionStarting}
                                title={tx("clang.collab_start_title")}
                            >
                                {tx("clang.collab_start")}
                            </Button>
                        )
                    )}
                    {!isMobile && <>
                    {isOwner && saveStatus === "unsaved" && (
                        <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>{tx("clang.save_unsaved")}</span>
                    )}
                    {isOwner && saveStatus === "error" && (
                        <span style={{ fontSize: token.font.size.fs11, color: token.color.danger }}>{tx("clang.save_failed")}</span>
                    )}
                    {isOwner && (
                        <Button
                            variant="ghost"
                            size="sm"
                            leading={saveStatus === "saving" ? <Spinner size="sm" /> : <Icon.Save size={11} />}
                            onClick={handleSaveToServer}
                            disabled={saveStatus === "saving" || !fileId}
                        >
                            {saveStatus === "saving" ? tx("clang.saving") : tx("clang.save")}
                        </Button>
                    )}
                    {isOwner === false && (
                        <Button
                            variant="accent"
                            size="sm"
                            onClick={handleDuplicateToMine}
                            disabled={duplicating || !fileId}
                            leading={duplicating ? <Spinner size="sm" /> : undefined}
                        >
                            {tx("workspace.ui.share_duplicate_button")}
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        size="sm"
                        leading={buildSpinning ? <Spinner size="sm" /> : <Icon.Download size={11} />}
                        onClick={handleBuild}
                        disabled={buildDisabled}
                        title={tx("clang.build_settings_title")}
                    >
                        {buildLabel}
                    </Button>
                    </>}

                    <Button
                        variant="secondary"
                        size="sm"
                        leading={debug.status === "compiling" || debug.status === "running"
                            ? <Spinner size="sm" />
                            : <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="9" r="4" /><path d="M8 5V3M5 6 3.5 4.5M11 6l1.5-1.5M4 9H2M14 9h-2M5 12l-1.5 1.5M11 12l1.5 1.5" /></svg>}
                        onClick={debug.handleDebug}
                        disabled={debug.status === "compiling" || debug.status === "running"}
                        title={tx("clang.debug_title")}
                    >
                        {tx("clang.debug_button")}
                    </Button>

                    <button
                        onClick={handleRun}
                        disabled={runDisabled}
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 7,
                            padding: "6px 11px",
                            borderRadius: token.radius.sm,
                            background: token.color.gradient.ai,
                            color: "#fff",
                            fontSize: token.font.size.fs12,
                            fontWeight: 600,
                            border: "none",
                            cursor: runDisabled ? "not-allowed" : "pointer",
                            opacity: runDisabled ? 0.45 : 1,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                        }}
                    >
                        {runSpinning ? <Spinner size="sm" /> : <Icon.Play size={11} fill />}
                        <span>{runLabel}</span>
                    </button>
                </div>
            </header>

            {/* ── Main 2-column layout ── */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 340px", flex: 1, minHeight: 0 }}>

                {/* Editor area */}
                <main style={{ display: isMobile && mobileTab !== "code" ? "none" : "flex", flexDirection: "column", minWidth: 0, background: token.color.bgCanvas, overflow: "hidden" }}>
                    {/* Editor toolbar (tab strip + tree toggle) */}
                    <div style={{ display: isMobile ? "none" : "flex", alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0, gap: 6 }}>
                        <button
                            type="button"
                            onClick={handleToggleTree}
                            title={tx("clang.filetree_toggle")}
                            aria-pressed={bundle.ui.treeOpen}
                            style={{
                                display: "inline-flex", alignItems: "center",
                                padding: "4px 6px",
                                background: bundle.ui.treeOpen ? token.color.bgSubtle : "transparent",
                                border: "none", borderRadius: token.radius.sm,
                                color: token.color.fgMuted,
                                cursor: "pointer",
                            }}
                        >
                            <Icon.Menu size={12} />
                        </button>
                        <div style={{ display: "flex", gap: 2, overflowX: "auto", flex: 1 }}>
                            {editorTabs.map(tab => {
                                const isActive = tab.uri === activeUri;
                                const isEntry  = tab.path === bundle.entry;
                                return (
                                    <div
                                        key={tab.uri}
                                        onClick={() => !isActive && handleTabClick(tab)}
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 5,
                                            padding: "4px 8px 4px 10px",
                                            borderRadius: token.radius.sm,
                                            background: isActive ? token.color.bgSubtle : "transparent",
                                            cursor: isActive ? "default" : "pointer",
                                            color: isActive ? token.color.fg : token.color.fgMuted,
                                            fontSize: token.font.size.fs11,
                                            fontWeight: isActive ? 600 : 500,
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        <FileIcon name={tab.path ? tab.path.split("/").pop()! : tab.label} isEntry={isEntry} size={14} />
                                        <span>{tab.label}</span>
                                        {isEntry && (
                                            <span title="Entry" style={{ display: "inline-flex", color: token.color.warning }}>
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                            </span>
                                        )}
                                        {tab.readOnly && (
                                            <span style={{ fontSize: token.font.size.fs10, color: token.color.fgSubtle, fontFamily: token.font.family.mono }}>
                                                read-only
                                            </span>
                                        )}
                                        {tab.closable && (
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); handleTabClose(tab); }}
                                                aria-label={tx("clang.tab_close_aria", { 0: tab.label })}
                                                style={{
                                                    marginLeft: 2,
                                                    width: 16,
                                                    height: 16,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    border: "none",
                                                    background: "transparent",
                                                    color: token.color.fgSubtle,
                                                    cursor: "pointer",
                                                    borderRadius: token.radius.xs,
                                                    fontSize: token.font.size.fs11,
                                                    lineHeight: 1,
                                                }}
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            onClick={handleLspCommand}
                            title={lspConnected ? tx("clang.lsp_status_connected") : tx("clang.lsp_status_disconnected")}
                            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 4px", border: "none", background: "transparent", cursor: "pointer", color: token.color.fgSubtle, fontSize: token.font.size.fs10, fontFamily: token.font.family.mono }}
                        >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: lspConnected ? token.color.success : token.color.fgSubtle, display: "inline-block" }} />
                            <Icon.Globe size={11} /> LSP: {lspConnected ? "cpp" : tx("clang.lsp_disconnected_short")}
                        </button>
                    </div>

                    {/* Tree + editor */}
                    <div style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden" }}>
                        {!isMobile && bundle.ui.treeOpen && (
                            <FileTree
                                tree={bundle.tree}
                                entryPath={bundle.entry}
                                activePath={bundle.ui.activeFile}
                                readOnly={!canEdit}
                                onOpenFile={handleOpenFile}
                                onCreateFile={handleCreateFile}
                                onCreateFolder={handleCreateFolder}
                                onUploadFile={handleUploadFile}
                                onDownloadFile={handleDownloadTreeFile}
                                onRename={handleRenameNode}
                                onDelete={handleDeleteNode}
                                onSetAsEntry={handleSetAsEntry}
                                onMove={handleMoveNode}
                            />
                        )}
                        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                            <CodeEditor
                                ref={codeEditorRef}
                                files={editorFiles}
                                activeUri={activeUri}
                                entryPath={bundle.entry}
                                lspWsUrl={LSP_WS_URL}
                                onTextChanged={handleEditorTextChanged}
                                readOnly={!canEdit || isMobile}
                                theme={theme}
                                onDiagnosticsChanged={handleDiagnosticsChanged}
                                onActiveModelChanged={handleActiveModelChanged}
                                onUnresolvedDefinition={handleUnresolvedDefinition}
                                onLspStatusChange={handleLspStatusChange}
                                onEditorReady={handleEditorReady}
                                onToggleBreakpoint={debug.toggleBreakpoint}
                                editorCommands={editorCommands}
                                viewStateKey={fileId}
                            />
                            {editorNotice && (
                                <div
                                    role="status"
                                    style={{
                                        position: "absolute",
                                        top: 12,
                                        right: 16,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 8,
                                        maxWidth: "calc(100% - 32px)",
                                        padding: "8px 10px 8px 12px",
                                        background: token.color.bgSubtle,
                                        border: `1px solid ${token.color.border}`,
                                        borderRadius: token.radius.md,
                                        boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                                        color: token.color.fg,
                                        fontSize: token.font.size.fs11,
                                        fontFamily: token.font.family.mono,
                                        zIndex: 10,
                                    }}
                                >
                                    <span aria-hidden style={{
                                        width: 14,
                                        height: 14,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderRadius: "50%",
                                        border: `1px solid ${token.color.fgSubtle}`,
                                        color: token.color.fgSubtle,
                                        fontSize: 10,
                                        fontFamily: "serif",
                                        fontStyle: "italic",
                                        lineHeight: 1,
                                        flexShrink: 0,
                                    }}>i</span>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {editorNotice}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (editorNoticeTimerRef.current) clearTimeout(editorNoticeTimerRef.current);
                                            setEditorNotice(null);
                                        }}
                                        aria-label={tx("clang.notice_close_aria")}
                                        style={{
                                            marginLeft: 4,
                                            width: 16,
                                            height: 16,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            border: "none",
                                            background: "transparent",
                                            color: token.color.fgSubtle,
                                            cursor: "pointer",
                                            borderRadius: token.radius.xs,
                                            fontSize: token.font.size.fs11,
                                            lineHeight: 1,
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </main>

                {/* Right panel: console + infos */}
                <aside style={{ display: isMobile && mobileTab !== "result" ? "none" : "flex", flexDirection: "column", borderLeft: isMobile ? "none" : `1px solid ${token.color.border}`, background: token.color.bg, overflow: "hidden" }}>
                    <div style={{ display: isMobile ? "none" : "flex", padding: "8px 8px 0", gap: 2, borderBottom: `1px solid ${token.color.border}` }}>
                        <button onClick={() => setRightTab("console")}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: token.font.size.fs12, border: "none", background: "none", cursor: "pointer", color: rightTab === "console" ? token.color.fg : token.color.fgMuted, fontWeight: 500, borderRadius: `${token.radius.sm} ${token.radius.sm} 0 0`, marginBottom: -1, borderBottom: rightTab === "console" ? `2px solid ${token.color.accent}` : "2px solid transparent" }}
                        >
                            <Icon.Terminal size={11} /> {tx("workspace.ui.console_tab")}
                        </button>
                        <button onClick={() => setRightTab("infos")}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: token.font.size.fs12, border: "none", background: "none", cursor: "pointer", color: rightTab === "infos" ? token.color.fg : token.color.fgMuted, fontWeight: 500, borderRadius: `${token.radius.sm} ${token.radius.sm} 0 0`, marginBottom: -1, borderBottom: rightTab === "infos" ? `2px solid ${token.color.accent}` : "2px solid transparent" }}
                        >
                            {tx("workspace.ui.infos_tab")}
                            {infos.filter(i => i.severity === "error" || i.severity === "warn").length > 0 && (
                                <span style={{ marginLeft: 2, padding: "1px 5px", borderRadius: 999, background: infos.some(i => i.severity === "error") ? token.color.danger : token.color.warning, color: "#fff", fontSize: token.font.size.fs10, fontWeight: 700, lineHeight: 1.4 }}>
                                    {infos.filter(i => i.severity === "error" || i.severity === "warn").length}
                                </span>
                            )}
                        </button>
                        <button onClick={() => setRightTab("debug")}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: token.font.size.fs12, border: "none", background: "none", cursor: "pointer", color: rightTab === "debug" ? token.color.fg : token.color.fgMuted, fontWeight: 500, borderRadius: `${token.radius.sm} ${token.radius.sm} 0 0`, marginBottom: -1, borderBottom: rightTab === "debug" ? `2px solid ${token.color.accent}` : "2px solid transparent" }}
                        >
                            {tx("clang.debug_button")}
                            {debugActive && (
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: debug.status === "stopped" ? token.color.warning : token.color.success, display: "inline-block" }} />
                            )}
                        </button>
                        <button onClick={() => setRightTab("agent")}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: token.font.size.fs12, border: "none", background: "none", cursor: "pointer", color: rightTab === "agent" ? token.color.fg : token.color.fgMuted, fontWeight: 500, borderRadius: `${token.radius.sm} ${token.radius.sm} 0 0`, marginBottom: -1, borderBottom: rightTab === "agent" ? `2px solid ${token.color.accent}` : "2px solid transparent" }}
                        >
                            <Icon.Sparkle size={11} /> AI
                        </button>
                    </div>

                    <div style={{ display: rightTab === "console" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
                        <div style={{ padding: 14, borderBottom: `1px solid ${token.color.borderSubtle}` }}>
                            <div style={{ padding: 14, background: token.color.bgSubtle, border: `1px solid ${token.color.border}`, borderRadius: token.radius.md }}>
                                <div style={{ fontSize: token.font.size.fs10, textTransform: "uppercase", letterSpacing: "0.06em", color: token.color.fgSubtle, fontWeight: 600 }}>{tx("workspace.ui.output_label")}</div>
                                <div style={{
                                    fontFamily: token.font.family.mono,
                                    fontSize: resultValue !== null ? token.font.size.fs32 : token.font.size.fs24,
                                    fontWeight: 500,
                                    letterSpacing: "-0.02em",
                                    color: resultValue !== null ? token.color.fgStrong : token.color.fgSubtle,
                                    lineHeight: 1.1,
                                    marginTop: 4,
                                    wordBreak: "break-all",
                                }}>
                                    {resultValue ?? "—"}
                                </div>
                                <div style={{ marginTop: 6, fontSize: token.font.size.fs11, color: runStatusColor, fontFamily: token.font.family.mono, display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: runStatusColor, display: "inline-block" }} />
                                    {runStatusLabel}
                                </div>
                            </div>
                        </div>
                        <div
                            className="simulizer-log"
                            ref={logAreaRef}
                            style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}
                        >
                            <div data-placeholder style={{ padding: "3px 14px", color: token.color.fgSubtle, fontFamily: token.font.family.mono, fontSize: token.font.size.fs11 }}>
                                {tx("workspace.ui.log_placeholder")}
                            </div>
                        </div>
                        {/* Interactive input prompt (Asyncify run paused on sim_input_*) */}
                        {inputRequest && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderTop: `1px solid ${token.color.border}`, background: token.color.bgSubtle }}>
                                <span style={{ fontFamily: token.font.family.mono, fontSize: token.font.size.fs11, color: token.color.fgMuted, whiteSpace: "nowrap" }}>
                                    {inputRequest.kind === "i32" ? tx("workspace.input.int_label") : tx("workspace.input.float_label")}
                                </span>
                                <input
                                    autoFocus
                                    type="number"
                                    step={inputRequest.kind === "i32" ? "1" : "any"}
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") submitInput(); }}
                                    style={{ flex: 1, minWidth: 0, padding: "6px 8px", fontSize: token.font.size.fs12, fontFamily: token.font.family.mono, background: token.color.bg, color: token.color.fg, border: `1px solid ${token.color.border}`, borderRadius: 6 }}
                                />
                                <Button onClick={submitInput}>{tx("workspace.input.submit")}</Button>
                            </div>
                        )}
                        <div style={{ padding: "8px 14px", borderTop: `1px solid ${token.color.border}`, fontFamily: token.font.family.mono, fontSize: token.font.size.fs10, color: token.color.fgSubtle, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: token.color.success, display: "inline-block" }} />
                            {tfBackend === "initializing" ? tx("workspace.ui.backend_initializing") : `${tfBackend} · ${tx("workspace.ui.backend_ready")}`}
                        </div>
                    </div>

                    {rightTab === "infos" && (
                        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                            {infos.length === 0 ? (
                                <div style={{ padding: "3px 14px", color: token.color.fgSubtle, fontFamily: token.font.family.mono, fontSize: token.font.size.fs11 }}>
                                    {tx("workspace.ui.infos_empty")}
                                </div>
                            ) : infos.map((entry, i) => {
                                const levelColor =
                                    entry.severity === "error" ? token.color.danger :
                                    entry.severity === "warn"  ? token.color.warning :
                                    token.color.fgMuted;
                                const icon =
                                    entry.severity === "error" ? "✕" :
                                    entry.severity === "warn"  ? "⚠" :
                                    entry.severity === "info"  ? "ℹ" :
                                    "·";
                                const tag = entry.source ?? (entry.code ? String(entry.code) : "");
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => focusInfoEntry(entry)}
                                        title={tx("clang.jump_title")}
                                        style={{
                                            display: "flex",
                                            alignItems: "flex-start",
                                            gap: 8,
                                            width: "100%",
                                            padding: "3px 14px",
                                            fontFamily: token.font.family.mono,
                                            fontSize: token.font.size.fs11,
                                            lineHeight: 1.6,
                                            border: "none",
                                            background: "none",
                                            textAlign: "left",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <span style={{ color: levelColor, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                                        <span style={{ color: token.color.fgSubtle, flexShrink: 0, minWidth: 44, textAlign: "right" }}>{entry.line}:{entry.column}</span>
                                        <span style={{ color: token.color.fg, flex: 1, wordBreak: "break-word" }}>{entry.message}</span>
                                        {tag && (
                                            <span style={{ color: token.color.fgSubtle, flexShrink: 0 }}>{tag}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {rightTab === "debug" && (
                        <DebugPanel
                            status={debug.status}
                            errorMsg={debug.errorMsg}
                            callStack={debug.callStack}
                            activeFrameId={debug.activeFrameId}
                            setActiveFrameId={debug.setActiveFrameId}
                            watches={debug.watches}
                            addWatch={debug.addWatch}
                            removeWatch={debug.removeWatch}
                            onContinue={debug.continue}
                            onStepOver={debug.stepOver}
                            onStepInto={debug.stepInto}
                            onStepOut={debug.stepOut}
                            onStop={debug.stop}
                            requestVariables={debug.requestVariables}
                            requestEvaluate={debug.requestEvaluate}
                            requestSetVariable={debug.requestSetVariable}
                            onRevealFrame={(file, line) => {
                                codeEditorRef.current?.renderStoppedLine(file, line);
                                codeEditorRef.current?.revealAt(pathToUri(file), line);
                            }}
                        />
                    )}

                    {rightTab === "agent" && (
                        <AgentPanel
                            agent={agent}
                            canEdit={canEdit}
                            onRevealRange={agentRevealRange}
                            attachActiveFile={attachActiveFile}
                            onToggleAttachActiveFile={setAttachActiveFile}
                            modelId={modelId}
                            onChangeModel={setModelId}
                            approvalRequired={approvalRequired}
                            onToggleApproval={setApprovalRequired}
                        />
                    )}
                </aside>
            </div>

            {isMobile && (
                <div style={{
                    display: "flex",
                    borderTop: `1px solid ${token.color.border}`,
                    background: token.color.bg,
                    flexShrink: 0,
                }}>
                    {([
                        { id: "code" as const, icon: <Icon.File size={14} />, label: "Code" },
                        { id: "result" as const, icon: <Icon.Terminal size={14} />, label: tx("workspace.ui.result_tab") },
                    ]).map(({ id, icon, label }) => {
                        const active = mobileTab === id;
                        return (
                            <button
                                key={id}
                                onClick={() => setMobileTab(id)}
                                style={{
                                    flex: 1,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 6,
                                    padding: "12px 8px",
                                    background: "none",
                                    border: "none",
                                    borderTop: `2px solid ${active ? token.color.accent : "transparent"}`,
                                    color: active ? token.color.accent : token.color.fgMuted,
                                    fontSize: token.font.size.fs12,
                                    fontWeight: active ? 600 : 500,
                                    cursor: "pointer",
                                }}
                            >
                                {icon}
                                <span>{label}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {errorMsg && (
                <div style={{
                    padding: "10px 14px",
                    background: token.color.dangerSoft,
                    borderTop: `1px solid ${token.color.dangerBorder}`,
                    color: token.color.danger,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    maxHeight: 240,
                    overflow: "auto",
                    flexShrink: 0,
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: token.font.size.fs11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        <Icon.X size={11} />
                        <span>Error</span>
                        <button
                            onClick={() => setErrorMsg(null)}
                            style={{
                                marginLeft: "auto",
                                padding: "2px 8px",
                                border: `1px solid ${token.color.dangerBorder}`,
                                borderRadius: token.radius.xs,
                                background: "transparent",
                                color: token.color.danger,
                                fontSize: token.font.size.fs10,
                                cursor: "pointer",
                                fontFamily: token.font.family.mono,
                            }}
                        >
                            {tx("clang.close")}
                        </button>
                    </div>
                    <pre style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        fontFamily: token.font.family.mono,
                        fontSize: token.font.size.fs11,
                        lineHeight: 1.55,
                        color: token.color.fg,
                    }}>
                        {errorMsg}
                    </pre>
                </div>
            )}

            {buildSnackVisible && buildProgress && (
                <BuildSnackbar
                    status={buildSnackStatus}
                    message={buildProgress.message}
                    step={buildProgress.step}
                    total={buildProgress.total}
                    onDismiss={() => setBuildProgress(null)}
                    position="fixed"
                    zIndex={50}
                />
            )}

            <input
                ref={uploadInputRef}
                type="file"
                accept=".cpp,.hpp,.ico,.png,.jpg,.jpeg,.gif,.bmp,.webp"
                onChange={handleUploadInputChange}
                style={{ display: "none" }}
            />
            <input
                ref={iconUploadInputRef}
                type="file"
                accept=".ico,.png,.jpg,.jpeg,.gif,.bmp,.webp"
                onChange={handleIconUploadChange}
                style={{ display: "none" }}
            />

            {!isMobile && <CppManagerModal
                open={managerOpen}
                mode={managerMode}
                code={entryCode}
                fileName={fileName}
                pack={messages}
                sharePanel={isOwner && fileMeta ? (
                    <ShareControl
                        file={fileMeta}
                        onChange={updated => setFileMeta(prev => prev ? { ...prev, visibility: updated.visibility } : prev)}
                    />
                ) : undefined}
                onClose={() => setManagerOpen(false)}
                onModeChange={setManagerMode}
                onCopyToClipboard={(text) => navigator.clipboard.writeText(text)}
                onDownload={handleDownloadCpp}
            />}

            {lspModal?.kind === "connecting" && (
                <Modal width={420}>
                    <ModalHeader>{tx("clang.lsp_connecting_title")}</ModalHeader>
                    <ModalBody>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <Spinner size="lg" />
                            <div style={{ fontSize: token.font.size.fs13, color: token.color.fg, lineHeight: 1.6 }}>
                                <div>{tx("clang.lsp_connecting_msg")}</div>
                                <div style={{ marginTop: 4, color: token.color.fgMuted, fontSize: token.font.size.fs11 }}>
                                    {tx("clang.lsp_cancel_hint")}
                                </div>
                            </div>
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" size="sm" onClick={handleLspCancel}>
                            {tx("clang.cancel")}
                        </Button>
                    </ModalFooter>
                </Modal>
            )}

            {lspModal?.kind === "alert" && (
                <AlertModal
                    variant={lspModal.variant}
                    title={lspModal.title}
                    message={lspModal.message}
                    onClose={() => setLspModal(null)}
                />
            )}

            {configAlert && (
                <AlertModal
                    variant={configAlert.variant}
                    title={configAlert.title}
                    message={configAlert.message}
                    onClose={() => setConfigAlert(null)}
                />
            )}

            <CompileSettingsModal
                open={settingsOpen}
                build={buildCfg.options}
                compile={compileCfg.options}
                device={envCfg.environment.device}
                runtimeBackend={tfBackend}
                deviceBusy={tfBackend === "initializing"}
                parseError={compileCfg.error ?? buildCfg.error}
                iconChoices={iconChoices}
                onBuildChange={handleBuildChange}
                onCompileChange={handleCompileChange}
                onDeviceChange={handleDeviceChange}
                onUploadIcon={handleUploadIcon}
                onOpenRaw={() => { setSettingsOpen(false); handleOpenConfigJson(); }}
                onClose={() => setSettingsOpen(false)}
            />

            {imagePreview && (() => {
                const f = findBundleFile(bundle.tree, imagePreview);
                const name = imagePreview.split("/").pop() ?? imagePreview;
                const src = f?.encoding === "base64" ? `data:${imageMimeFor(name)};base64,${f.content}` : null;
                return (
                    <Modal width={360} onClose={() => setImagePreview(null)}>
                        <ModalHeader onClose={() => setImagePreview(null)}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                <FileIcon name={name} size={14} />
                                <span style={{ fontFamily: token.font.family.mono, fontSize: token.font.size.fs12, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                            </span>
                        </ModalHeader>
                        <ModalBody>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                                {src ? (
                                    <div style={{
                                        padding: 16,
                                        borderRadius: token.radius.md,
                                        border: `1px solid ${token.color.border}`,
                                        // Checkerboard so transparent icons read clearly.
                                        backgroundImage: "linear-gradient(45deg,#0003 25%,transparent 25%),linear-gradient(-45deg,#0003 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#0003 75%),linear-gradient(-45deg,transparent 75%,#0003 75%)",
                                        backgroundSize: "16px 16px",
                                        backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
                                    }}>
                                        <img src={src} alt={name} width={128} height={128} style={{ display: "block", objectFit: "contain" }} />
                                    </div>
                                ) : (
                                    <span style={{ color: token.color.fgMuted, fontSize: token.font.size.fs12 }}>{tx("clang.preview_unavailable")}</span>
                                )}
                                <span style={{ color: token.color.fgSubtle, fontFamily: token.font.family.mono, fontSize: token.font.size.fs11 }}>{imagePreview}</span>
                            </div>
                        </ModalBody>
                    </Modal>
                );
            })()}

            {deleteConfirm && (
                <Modal width={420} onClose={() => setDeleteConfirm(null)}>
                    <ModalHeader onClose={() => setDeleteConfirm(null)}>
                        {deleteConfirm.kind === "entry-block" ? tx("clang.delete_entry_title") : tx("clang.delete_confirm_title")}
                    </ModalHeader>
                    <ModalBody>
                        {deleteConfirm.kind === "entry-block" ? (
                            <div style={{ fontSize: token.font.size.fs13, color: token.color.fg, lineHeight: 1.6 }}>
                                <div>
                                    <span style={{ fontFamily: token.font.family.mono }}>{deleteConfirm.path}</span>
                                    {tx("clang.entry_contains")}
                                </div>
                                <div style={{ marginTop: 8, color: token.color.fgMuted }}>
                                    {tx("clang.entry_reassign")}
                                </div>
                            </div>
                        ) : (
                            <div style={{ fontSize: token.font.size.fs13, color: token.color.fg, lineHeight: 1.6 }}>
                                <div>
                                    <span style={{ fontFamily: token.font.family.mono }}>{deleteConfirm.path}</span>
                                    {deleteConfirm.affected.length > 1
                                        ? tx("clang.delete_with_children", { 0: deleteConfirm.affected.length })
                                        : tx("clang.delete_single")}
                                </div>
                                <div style={{ marginTop: 8, color: token.color.fgMuted, fontSize: token.font.size.fs11 }}>
                                    {tx("clang.delete_irreversible")}
                                </div>
                            </div>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        {deleteConfirm.kind === "entry-block" ? (
                            <Button variant="primary" size="sm" onClick={() => setDeleteConfirm(null)}>
                                {tx("clang.confirm")}
                            </Button>
                        ) : (
                            <>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>
                                    {tx("clang.cancel")}
                                </Button>
                                <Button variant="danger" size="sm" onClick={confirmDelete}>
                                    {tx("clang.delete")}
                                </Button>
                            </>
                        )}
                    </ModalFooter>
                </Modal>
            )}
        </div>
    );
};

export default ClangWorkspace;
