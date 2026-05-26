"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { fetchEventSource } from "@microsoft/fetch-event-source";

import { useConsolePanel } from "@/components/console";
import type { WorkerOutMsg } from "@/utils/wasm/wasm-worker";
import type { ClangWorkerInMsg } from "@/utils/wasm/clang-worker";
import { vec_field_to_image_url, mat_data_to_image_url } from "@/utils/wasm/tensor";
import type { ClangDiagnostic, CodeEditorRef, EditorFile } from "./clang/CodeEditor";
import { pathToUri, uriToPath } from "./clang/uri";
import FileTree from "./clang/FileTree";
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
    type CppBundle,
} from "@/lib/cppBundle";

import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { Spinner } from "@/components/atoms/Spinner";
import { TopbarBrand } from "@/components/organisms/TopbarBrand";
import { token } from "@/components/tokens";
import { duplicateFile, renameFile, saveFile, type FileDetail, type FileOut } from "@/lib/authapi";
import { CppManagerModal } from "@/components/workspace-modals/CppManagerModal";
import { ShareControl } from "@/components/share/ShareControl";
import useLanguagePack from "@/hooks/useLanguagePack";
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

type Props = {
    initialFile: FileDetail;
    initialOwner: boolean;
};

const ClangWorkspace: React.FC<Props> = ({ initialFile, initialOwner }) => {
    const router = useRouter();
    const [, , pack] = useLanguagePack();
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

    const [rightTab, setRightTab] = useState<"console" | "infos">("console");
    const [infos, setInfos] = useState<ClangDiagnostic[]>([]);
    const codeEditorRef = useRef<CodeEditorRef | null>(null);

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
                readOnly: !isOwner,
                closable: p !== bundle.entry,
            }));
        return [...bundleTabs, ...systemTabs];
    }, [bundle.tree, bundle.ui.openTabs, bundle.entry, isOwner, systemTabs]);

    // ─── Files passed to the editor (all bundle files) ────────────────────
    const editorFiles: EditorFile[] = useMemo(
        () => listBundleFiles(bundle.tree).map(({ path, file }) => ({ path, content: file.content })),
        [bundle.tree],
    );

    // ─── Autosave ─────────────────────────────────────────────────────────
    const scheduleAutosave = useCallback(() => {
        if (!fileIdRef.current || !isOwnerRef.current) return;
        setSaveStatus("unsaved");
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(async () => {
            const id = fileIdRef.current;
            if (!id) return;
            setSaveStatus("saving");
            try {
                await saveFile(id, serializeBundle(pendingBundleRef.current));
                setSaveStatus("saved");
            } catch {
                setSaveStatus("error");
            }
        }, 2000);
    }, []);

    // Flush the latest bundle to the server right away. Use this for
    // structural changes (file add/remove/rename, entry change) that the
    // user expects to stick the moment they perform the action; content
    // edits go through scheduleAutosave instead so we don't hammer the
    // server on every keystroke.
    const flushSave = useCallback(() => {
        if (!isOwnerRef.current || !fileIdRef.current) return;
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        setSaveStatus("saving");
        saveFile(fileIdRef.current, serializeBundle(pendingBundleRef.current))
            .then(() => setSaveStatus("saved"))
            .catch(() => setSaveStatus("error"));
    }, []);

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
    const handleEditorTextChanged = useCallback((path: string, content: string) => {
        if (!isOwnerRef.current) return;
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
            if (err?.status === 409) setErrorMsg("같은 이름의 프로젝트가 이미 있어요.");
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
            await saveFile(fileId, serializeBundle(pendingBundleRef.current));
            setSaveStatus("saved");
        } catch {
            setSaveStatus("error");
        }
    }, [fileId]);

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
                setErrorMsg(pack.workspace.ui.share_login_to_duplicate);
            }
        } finally {
            setDuplicating(false);
        }
    }, [fileId, duplicating, router, pack]);

    // ─── File-tree operations ─────────────────────────────────────────────
    // Apply a pure transformation to the bundle, persist immediately, and
    // update React state. Returning null from `transform` is the "do nothing"
    // signal (e.g., the user-facing alert was already raised). The transform
    // must NOT itself call setBundle/setActiveUri — those happen here.
    const applyBundleChange = useCallback((transform: (prev: CppBundle) => CppBundle | null) => {
        const prev = pendingBundleRef.current;
        const next = transform(prev);
        if (!next) return;
        pendingBundleRef.current = next;
        setBundle(next);
        // Only sync activeUri when the bundle's active file actually changed
        // — otherwise we'd yank the user away from a system header they're
        // viewing whenever they rename a sibling file or change the entry.
        if (next.ui.activeFile !== prev.ui.activeFile) {
            setActiveUri(pathToUri(next.ui.activeFile));
        }
        flushSave();
    }, [flushSave]);

    const handleCreateFile = useCallback((parentPath: string) => {
        if (!isOwnerRef.current) return;
        const raw = window.prompt(`새 파일 이름 (확장자 포함, ${parentPath ? `${parentPath}/` : ""}…):`, "");
        if (raw === null) return;
        const name = raw.trim();
        const err = validateFileName(name);
        if (err) { window.alert(err); return; }
        const path = parentPath ? `${parentPath}/${name}` : name;
        applyBundleChange(prev => {
            const nextTree = bundleAddFile(prev.tree, path, "");
            if (!nextTree) { window.alert("같은 이름의 파일이 이미 있습니다."); return null; }
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

    const handleCreateFolder = useCallback((parentPath: string) => {
        if (!isOwnerRef.current) return;
        const raw = window.prompt(`새 폴더 이름 (${parentPath ? `${parentPath}/` : ""}…):`, "");
        if (raw === null) return;
        const name = raw.trim();
        const err = validateFolderName(name);
        if (err) { window.alert(err); return; }
        const path = parentPath ? `${parentPath}/${name}` : name;
        applyBundleChange(prev => {
            const nextTree = bundleAddFolder(prev.tree, path);
            if (!nextTree) { window.alert("같은 이름의 폴더가 이미 있습니다."); return null; }
            return { ...prev, tree: nextTree };
        });
    }, [applyBundleChange]);

    const handleRenameNode = useCallback((path: string) => {
        if (!isOwnerRef.current) return;
        const { base, dir } = splitPath(path);
        const raw = window.prompt("새 이름:", base);
        if (raw === null) return;
        const newName = raw.trim();
        if (!newName || newName === base) return;
        const isFile = listBundleFiles(pendingBundleRef.current.tree).some(f => f.path === path);
        const err = isFile ? validateFileName(newName) : validateFolderName(newName);
        if (err) { window.alert(err); return; }
        const newPath = dir ? `${dir}/${newName}` : newName;
        applyBundleChange(prev => {
            const nextTree = bundleRenameNode(prev.tree, path, newName);
            if (!nextTree) { window.alert("같은 이름이 이미 있습니다."); return null; }
            // A rename affects every descendant path, so prefix-swap path
            // references in entry / activeFile / openTabs.
            const rewrite = (p: string) =>
                p === path ? newPath
                : p.startsWith(path + "/") ? newPath + p.slice(path.length)
                : p;
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
        });
    }, [applyBundleChange]);

    const handleDeleteNode = useCallback((path: string) => {
        if (!isOwnerRef.current) return;
        const affected = descendantFilePaths(pendingBundleRef.current.tree, path);
        if (affected.includes(pendingBundleRef.current.entry)) {
            window.alert("Entry 파일은 삭제할 수 없습니다. 다른 파일을 Entry로 지정한 뒤 다시 시도해주세요.");
            return;
        }
        const ok = window.confirm(
            affected.length > 1
                ? `${path} 와 그 하위 ${affected.length}개 파일을 삭제할까요?`
                : `${path} 를 삭제할까요?`,
        );
        if (!ok) return;
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
    }, [applyBundleChange]);

    const handleMoveNode = useCallback((srcPath: string, destDir: string) => {
        if (!isOwnerRef.current) return;
        const srcName = srcPath.split("/").pop()!;
        const newPath = destDir ? `${destDir}/${srcName}` : srcName;
        applyBundleChange(prev => {
            const nextTree = bundleMoveNode(prev.tree, srcPath, destDir);
            if (!nextTree) {
                // No-op (same parent), invalid (cycle), or name collision —
                // only the collision case is worth surfacing.
                return null;
            }
            // Move shifts every descendant path; prefix-swap entry / activeFile /
            // openTabs the same way rename does.
            const rewrite = (p: string) =>
                p === srcPath ? newPath
                : p.startsWith(srcPath + "/") ? newPath + p.slice(srcPath.length)
                : p;
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
        });
    }, [applyBundleChange]);

    const handleSetAsEntry = useCallback((path: string) => {
        if (!isOwnerRef.current) return;
        if (!path.toLowerCase().endsWith(".cpp")) {
            window.alert("Entry 는 .cpp 파일이어야 합니다.");
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

    const handleUploadFile = useCallback((parentPath: string) => {
        if (!isOwnerRef.current) return;
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
            window.alert("파일이 너무 큽니다 (1MB 이하)");
            return;
        }
        const parentPath = uploadParentRef.current;
        const path = parentPath ? `${parentPath}/${name}` : name;
        const content = await file.text();
        applyBundleChange(prev => {
            const nextTree = bundleAddFile(prev.tree, path, content);
            if (!nextTree) { window.alert("같은 이름의 파일이 이미 있습니다."); return null; }
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

    const handleDownloadTreeFile = useCallback((path: string) => {
        const file = findBundleFile(pendingBundleRef.current.tree, path);
        if (!file) return;
        const ext = path.toLowerCase().endsWith(".hpp") ? "text/x-c++hdr" : "text/x-c++src";
        const blob = new Blob([file.content], { type: `${ext};charset=utf-8` });
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
        setEditorNotice(`외부 라이브러리 파일은 열 수 없습니다: ${filename}`);
        if (editorNoticeTimerRef.current) clearTimeout(editorNoticeTimerRef.current);
        editorNoticeTimerRef.current = setTimeout(() => setEditorNotice(null), 4500);
    }, []);

    const handleWorkerMessage = useCallback((e: MessageEvent<WorkerOutMsg>) => {
        const msg = e.data;
        const b = bindingsRef.current;

        if (msg.type === "ready") { setRunState("idle"); return; }
        if (msg.type === "backend-switched") {
            setTfBackend(msg.backend);
            pendingBackendSwitchRef.current = null;
            return;
        }
        if (msg.type === "log") { b.logToHolder(msg.holderId, msg.kind, msg.text); return; }
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
        if (msg.type === "result") { setResultValue(msg.value); return; }
        if (msg.type === "done") { setRunState("done"); return; }
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
            return;
        }
    }, []);

    useEffect(() => {
        const worker = new Worker(
            new URL("@/utils/wasm/clang-worker.ts", import.meta.url),
            { type: "module" }
        );
        worker.addEventListener("message", handleWorkerMessage);
        workerRef.current = worker;
        worker.postMessage({ type: "init" } satisfies ClangWorkerInMsg);
        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, [handleWorkerMessage]);

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
        setRunState("compiling");

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
                return;
            }
            const wasmBuffer = await res.arrayBuffer();
            setRunState("running");
            worker.postMessage({ type: "run", wasmBuffer } satisfies ClangWorkerInMsg, [wasmBuffer]);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setRunState("error");
        }
    }, [bundle.tree, bundle.entry, runState, clearLog, isMobile]);

    const handleBuild = useCallback(async () => {
        if (buildState === "building" || buildState === "downloading") return;

        setBuildState("building");
        setBuildProgress({ step: 0, total: 0, message: "요청 전송 중…" });

        const ctrl = new AbortController();
        let uuid: string | null = null;

        try {
            const doneUuid = await new Promise<string>((resolve, reject) => {
                fetchEventSource(`${API_BASE}/compile/build`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
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
                        let payload: { uuid?: string; step?: number; total?: number; message?: string; detail?: string };
                        try { payload = JSON.parse(e.data); } catch { return; }
                        if (e.event === "error") {
                            throw new Error(payload.detail ?? "Build failed");
                        }
                        if (e.event === "done") {
                            const finalUuid = payload.uuid ?? uuid;
                            if (!finalUuid) throw new Error("Build stream ended without uuid");
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
            setBuildProgress(prev => ({ step: prev?.step ?? 0, total: prev?.total ?? 0, message: "다운로드 중…" }));

            const dlRes = await fetch(`${API_BASE}/compile/build/download/${doneUuid}`);
            if (!dlRes.ok) {
                const err = await dlRes.json().catch(() => ({ detail: dlRes.statusText }));
                throw new Error(err.detail ?? "Download failed");
            }
            const blob = await dlRes.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "output.exe";
            a.click();
            URL.revokeObjectURL(url);

            setBuildState("done");
            setBuildProgress(prev => ({ step: prev?.total ?? 0, total: prev?.total ?? 0, message: "다운로드 완료" }));
        } catch (e) {
            setBuildState("error");
            setErrorMsg(e instanceof Error ? e.message : String(e));
        }
    }, [bundle.tree, bundle.entry, buildState]);

    const runDisabled = runState === "loading" || runState === "compiling" || runState === "running" || buildState === "building" || buildState === "downloading";
    const buildDisabled = runState === "loading" || runState === "compiling" || runState === "running" || buildState === "building" || buildState === "downloading";
    const runLabel =
        runState === "loading"   ? "런타임 로드 중…" :
        runState === "compiling" ? "컴파일 중…" :
        runState === "running"   ? pack.workspace.ui.run_button_running :
        pack.workspace.ui.run_button;
    const buildLabel =
        buildState === "building"    ? "빌드 중…" :
        buildState === "downloading" ? "다운로드 중…" :
        "Build .exe";

    const runStatusLabel =
        runState === "loading"   ? "런타임 로드 중"   :
        runState === "compiling" ? "컴파일 중"        :
        runState === "running"   ? "실행 중"          :
        runState === "done"      ? "완료"             :
        runState === "error"     ? "오류"             :
        "대기 중";

    const runStatusColor =
        runState === "error"     ? token.color.danger  :
        runState === "done"      ? token.color.success :
        runState === "loading" || runState === "compiling" || runState === "running"
                                 ? token.color.accent  :
        token.color.fgSubtle;

    const runSpinning = runState === "loading" || runState === "compiling" || runState === "running";
    const buildSpinning = buildState === "building" || buildState === "downloading";

    const entryFile = useMemo(() => listBundleFiles(bundle.tree).find(f => f.path === bundle.entry), [bundle.tree, bundle.entry]);
    const entryCode = entryFile?.file.content ?? "";

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: token.color.bg, color: token.color.fg, fontSize: token.font.size.fs13 }}>
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
                    {isOwner === false && (
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
                            {pack.workspace.ui.share_readonly_badge}
                        </span>
                    )}
                </div>

                {!isMobile && <div style={{ display: "flex", justifyContent: "center" }}>
                    {buildProgress && (buildState === "building" || buildState === "downloading" || buildState === "done") && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", background: token.color.bgSubtle, border: `1px solid ${token.color.border}`, borderRadius: token.radius.md, color: token.color.fgMuted, fontSize: token.font.size.fs12, minWidth: 340, fontFamily: token.font.family.mono }}>
                            {buildSpinning ? <Spinner size="sm" /> : <Icon.Check size={12} />}
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {buildProgress.total > 0
                                    ? `${buildProgress.step}/${buildProgress.total} · ${buildProgress.message}`
                                    : buildProgress.message}
                            </span>
                        </div>
                    )}
                </div>}

                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                    {!isMobile && <>
                    {isOwner && saveStatus === "unsaved" && (
                        <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>저장 안됨</span>
                    )}
                    {isOwner && saveStatus === "error" && (
                        <span style={{ fontSize: token.font.size.fs11, color: token.color.danger }}>저장 실패</span>
                    )}
                    {isOwner && (
                        <Button
                            variant="ghost"
                            size="sm"
                            leading={saveStatus === "saving" ? <Spinner size="sm" /> : <Icon.Save size={11} />}
                            onClick={handleSaveToServer}
                            disabled={saveStatus === "saving" || !fileId}
                        >
                            {saveStatus === "saving" ? "저장 중..." : "저장"}
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
                            {pack.workspace.ui.share_duplicate_button}
                        </Button>
                    )}
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "4px 8px", background: token.color.bgSubtle, border: `1px solid ${token.color.border}`, borderRadius: 999, fontSize: token.font.size.fs10, color: token.color.fgMuted, fontFamily: token.font.family.mono }}>
                        {(["webgpu", "webgl", "cpu"] as const).map((b, i, arr) => {
                            const isSelected = tfBackend === b;
                            const label = b === "webgpu" ? "WebGPU" : b === "webgl" ? "WebGL" : "CPU";
                            return (
                                <React.Fragment key={b}>
                                    <button
                                        onClick={() => tfBackend !== "initializing" && handleSwitchBackend(b)}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            cursor: tfBackend === "initializing" ? "default" : "pointer",
                                            color: isSelected ? token.color.accent : token.color.fgSubtle,
                                            fontSize: token.font.size.fs10,
                                            padding: "0 4px",
                                            fontWeight: isSelected ? 700 : 500,
                                            opacity: tfBackend === "initializing" ? 0.4 : 1,
                                            transition: "all 0.1s",
                                        }}
                                    >
                                        {label}
                                    </button>
                                    {i < arr.length - 1 && <span style={{ color: token.color.border, opacity: 0.5 }}>|</span>}
                                </React.Fragment>
                            );
                        })}
                    </div>

                    <Button
                        variant="secondary"
                        size="sm"
                        leading={buildSpinning ? <Spinner size="sm" /> : <Icon.Download size={11} />}
                        onClick={handleBuild}
                        disabled={buildDisabled}
                    >
                        {buildLabel}
                    </Button>
                    </>}

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
                            title="파일 트리 열기/닫기"
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
                                        <Icon.File size={11} />
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
                                                aria-label={`${tab.label} 탭 닫기`}
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
                        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: token.color.fgSubtle, fontSize: token.font.size.fs10, fontFamily: token.font.family.mono }}>
                            <Icon.Globe size={11} /> LSP: cpp
                        </div>
                    </div>

                    {/* Tree + editor */}
                    <div style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden" }}>
                        {!isMobile && bundle.ui.treeOpen && (
                            <FileTree
                                tree={bundle.tree}
                                entryPath={bundle.entry}
                                activePath={bundle.ui.activeFile}
                                readOnly={!isOwner}
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
                                readOnly={isOwner === false || isMobile}
                                theme={theme}
                                onDiagnosticsChanged={handleDiagnosticsChanged}
                                onActiveModelChanged={handleActiveModelChanged}
                                onUnresolvedDefinition={handleUnresolvedDefinition}
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
                                        aria-label="알림 닫기"
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
                            <Icon.Terminal size={11} /> {pack.workspace.ui.console_tab}
                        </button>
                        <button onClick={() => setRightTab("infos")}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: token.font.size.fs12, border: "none", background: "none", cursor: "pointer", color: rightTab === "infos" ? token.color.fg : token.color.fgMuted, fontWeight: 500, borderRadius: `${token.radius.sm} ${token.radius.sm} 0 0`, marginBottom: -1, borderBottom: rightTab === "infos" ? `2px solid ${token.color.accent}` : "2px solid transparent" }}
                        >
                            {pack.workspace.ui.infos_tab}
                            {infos.filter(i => i.severity === "error" || i.severity === "warn").length > 0 && (
                                <span style={{ marginLeft: 2, padding: "1px 5px", borderRadius: 999, background: infos.some(i => i.severity === "error") ? token.color.danger : token.color.warning, color: "#fff", fontSize: token.font.size.fs10, fontWeight: 700, lineHeight: 1.4 }}>
                                    {infos.filter(i => i.severity === "error" || i.severity === "warn").length}
                                </span>
                            )}
                        </button>
                    </div>

                    <div style={{ display: rightTab === "console" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
                        <div style={{ padding: 14, borderBottom: `1px solid ${token.color.borderSubtle}` }}>
                            <div style={{ padding: 14, background: token.color.bgSubtle, border: `1px solid ${token.color.border}`, borderRadius: token.radius.md }}>
                                <div style={{ fontSize: token.font.size.fs10, textTransform: "uppercase", letterSpacing: "0.06em", color: token.color.fgSubtle, fontWeight: 600 }}>{pack.workspace.ui.output_label}</div>
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
                                {pack.workspace.ui.log_placeholder}
                            </div>
                        </div>
                        <div style={{ padding: "8px 14px", borderTop: `1px solid ${token.color.border}`, fontFamily: token.font.family.mono, fontSize: token.font.size.fs10, color: token.color.fgSubtle, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: token.color.success, display: "inline-block" }} />
                            {tfBackend === "initializing" ? pack.workspace.ui.backend_initializing : `${tfBackend} · ${pack.workspace.ui.backend_ready}`}
                        </div>
                    </div>

                    {rightTab === "infos" && (
                        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                            {infos.length === 0 ? (
                                <div style={{ padding: "3px 14px", color: token.color.fgSubtle, fontFamily: token.font.family.mono, fontSize: token.font.size.fs11 }}>
                                    {pack.workspace.ui.infos_empty}
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
                                        title="클릭하여 해당 위치로 이동"
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
                        { id: "result" as const, icon: <Icon.Terminal size={14} />, label: pack.workspace.ui.result_tab },
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
                            닫기
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

            <input
                ref={uploadInputRef}
                type="file"
                accept=".cpp,.hpp"
                onChange={handleUploadInputChange}
                style={{ display: "none" }}
            />

            {!isMobile && <CppManagerModal
                open={managerOpen}
                mode={managerMode}
                code={entryCode}
                fileName={fileName}
                pack={pack}
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
        </div>
    );
};

export default ClangWorkspace;
