// Desktop (local) file-store implementation. A "project" is a single file on
// disk: `.simblock` holds the raw Blockly save JSON, `.simclang` holds the
// serialized CppBundle JSON — identical to what the online `content` column
// held, so no format conversion is needed.
//
// All filesystem work is delegated to the C++ host via the `window.__native`
// bridge (injected by simulizer.exe through webview `bind`). Each bridge call
// returns a JSON value (webview JSON-parses the host's reply).
//
// The functions here mirror the signatures of the web client in
// `@/lib/authapi` so the same workspace components drive both builds.

import type { FileDetail, FileOut, FileType, FileVisibility, UserOut, CreditOut } from "@/lib/authapi";

// ── bridge contract ──────────────────────────────────────────────────────────

interface NativeBridge {
    readProject(path: string): Promise<{ ok: boolean; content?: string; error?: string }>;
    writeProject(path: string, content: string): Promise<{ ok: boolean; error?: string }>;
    openDialog(): Promise<{ ok: boolean; path?: string }>;
    saveDialog(defaultName: string, ext: string): Promise<{ ok: boolean; path?: string }>;
    renameProject(path: string, newName: string): Promise<{ ok: boolean; path?: string; error?: string }>;
    recentProjects(): Promise<string[]>;
    addRecent(path: string): Promise<null>;

    // ── window chrome (frameless VS Code-style title bar) ───────────────────
    // The native host runs frameless; the web renders the title bar and drives
    // the window through these binds. Present only in the desktop build.
    minimize(): Promise<null>;
    maximizeToggle(): Promise<null>;
    close(): Promise<null>;
    isMaximized(): Promise<boolean>;
    // Begin an OS window-move loop (called on mousedown over the drag strip).
    startDrag(): Promise<null>;
    // File menu actions (the native menu bar is gone — the web menu calls these).
    menuNew(): Promise<null>;
    menuOpen(): Promise<null>;
    openRecent(path: string): Promise<null>;
    menuExit(): Promise<null>;
    // App-wide light/dark theme (persisted natively; setTheme also applies it live).
    getTheme(): Promise<"light" | "dark">;
    setTheme(theme: "light" | "dark"): Promise<null>;
    // Transient OS notification (tray toast) — e.g. on build/compile success.
    notify(title: string, message: string): Promise<null>;
}

declare global {
    interface Window {
        __SIMULIZER_DESKTOP__?: boolean;
        __SIMULIZER_PROJECT__?: string;
        __native?: NativeBridge;
        /** Set by the workspace router so the host (or native flows) can
         *  re-open a project in place at a new path. */
        __loadProject?: (path: string) => void;
    }
}

function bridge(): NativeBridge {
    const n = typeof window !== "undefined" ? window.__native : undefined;
    if (!n) throw new Error("native bridge unavailable");
    return n;
}

// ── path helpers ─────────────────────────────────────────────────────────────

function baseName(path: string): string {
    const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return i < 0 ? path : path.slice(i + 1);
}

function extOf(path: string): string {
    const b = baseName(path);
    const dot = b.lastIndexOf(".");
    return dot < 0 ? "" : b.slice(dot).toLowerCase();
}

function nameNoExt(path: string): string {
    const b = baseName(path);
    const dot = b.lastIndexOf(".");
    return dot <= 0 ? b : b.slice(0, dot);
}

function typeForPath(path: string): FileType {
    return extOf(path) === ".simclang" ? "clangfile" : "blockfile";
}

function makeFileOut(path: string, visibility: FileVisibility = "private"): FileOut {
    const now = new Date().toISOString();
    return {
        idx: 0,
        id: path,
        author_id: 0,
        name: nameNoExt(path),
        type: typeForPath(path),
        visibility,
        thumbnail_custom: false,
        created_at: now,
        updated_at: now,
    };
}

function addRecent(path: string): void {
    bridge().addRecent(path).catch(() => {});
}

// ── identity (no auth — synthetic local user so `owner` is always true) ──────

export async function getMe(): Promise<UserOut> {
    const now = new Date().toISOString();
    return {
        id: 0,
        email: "local@localhost",
        name: "local",
        picture_url: null,
        last_login_at: now,
        created_at: now,
        updated_at: now,
    };
}

export async function getCredits(): Promise<CreditOut> {
    return { credits: 0 };
}

// ── files ────────────────────────────────────────────────────────────────────

export async function getFile(id: string): Promise<FileDetail> {
    const r = await bridge().readProject(id);
    if (!r.ok) throw Object.assign(new Error(r.error || "Not found"), { status: 404 });
    return { ...makeFileOut(id), content: r.content ?? "" };
}

export async function saveFile(id: string, content: string): Promise<FileOut> {
    const r = await bridge().writeProject(id, content);
    if (!r.ok) throw new Error(r.error || "Failed to save file");
    addRecent(id);
    return makeFileOut(id);
}

export async function renameFile(id: string, name: string): Promise<FileOut> {
    const r = await bridge().renameProject(id, name);
    if (!r.ok || !r.path) {
        throw Object.assign(new Error(r.error || "Failed to rename file"), {
            status: r.error === "conflict" ? 409 : 500,
        });
    }
    addRecent(r.path);
    // The on-disk path changed; re-open in place so the component's fileId
    // (= path) tracks the new file for subsequent saves.
    window.__loadProject?.(r.path);
    return makeFileOut(r.path);
}

export async function createFile(
    name: string,
    type: FileType = "blockfile",
    content?: string,
): Promise<FileDetail> {
    const ext = type === "clangfile" ? ".simclang" : ".simblock";
    const dlg = await bridge().saveDialog(name, ext);
    if (!dlg.ok || !dlg.path) throw Object.assign(new Error("cancelled"), { status: 0 });
    const body = content ?? "{}";
    const w = await bridge().writeProject(dlg.path, body);
    if (!w.ok) throw new Error(w.error || "Failed to create file");
    addRecent(dlg.path);
    window.__loadProject?.(dlg.path);
    return { ...makeFileOut(dlg.path), content: body };
}

export async function duplicateFile(id: string): Promise<FileDetail> {
    const dlg = await bridge().saveDialog(nameNoExt(id) + " copy", extOf(id) || ".simblock");
    if (!dlg.ok || !dlg.path) throw Object.assign(new Error("cancelled"), { status: 0 });
    const read = await bridge().readProject(id);
    if (!read.ok) throw new Error(read.error || "Failed to read source");
    const w = await bridge().writeProject(dlg.path, read.content ?? "");
    if (!w.ok) throw new Error(w.error || "Failed to duplicate file");
    addRecent(dlg.path);
    window.__loadProject?.(dlg.path);
    return { ...makeFileOut(dlg.path), content: read.content ?? "" };
}

// ── disabled-in-desktop no-ops ───────────────────────────────────────────────

export async function setFileVisibility(id: string, visibility: FileVisibility): Promise<FileOut> {
    return makeFileOut(id, visibility);
}

/* eslint-disable @typescript-eslint/no-unused-vars */
export async function uploadThumbnail(
    _fileId: string,
    _blob: Blob,
    _opts?: { manual?: boolean },
): Promise<void> {
    // Thumbnails are a cloud/dashboard concept; nothing to do locally.
}
