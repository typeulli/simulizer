"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { fetchEventSource } from "@microsoft/fetch-event-source";

import { useConsolePanel } from "@/components/console";
import type { WorkerOutMsg } from "@/utils/wasm/wasm-worker";
import type { ClangWorkerInMsg } from "@/utils/wasm/clang-worker";
import { vec_field_to_image_url, mat_data_to_image_url } from "@/utils/wasm/tensor";
import type { ClangDiagnostic, CodeEditorRef } from "./clang/CodeEditor";

// Keep this in sync with DEFAULT_MAIN_URI in ./clang/CodeEditor. Inlined here
// (instead of imported) so this module doesn't drag in the monaco-vscode
// bundle during SSR — CodeEditor itself is loaded via dynamic({ ssr: false }).
const DEFAULT_MAIN_URI = "file:///workspace/user.cpp";

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
    uri: string;
    label: string;
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

const INITIAL_CODE = `#include "simstd.hpp"

int worker() {
    auto a = matrix_create(2, 3);
    a(0, 0) = 1.0; a(0, 1) = 2.0; a(0, 2) = 3.0;
    a(1, 0) = 4.0; a(1, 1) = 5.0; a(1, 2) = 6.0;

    auto b = matrix_transpose(a);
    auto c = matrix_matmul(a, b);

    show_mat(c);
    debug_log(c);
    return 0;
}
`;

type Props = {
    initialFile: FileDetail;
    initialOwner: boolean;
};

const ClangWorkspace: React.FC<Props> = ({ initialFile, initialOwner }) => {
    const router = useRouter();
    const [, , pack] = useLanguagePack();
    const { theme } = useTheme();

    const [code, setCode] = useState(INITIAL_CODE);
    const [editorKey, setEditorKey] = useState(0);
    const [fileId, setFileId] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>("main.cpp");
    const [fileMeta, setFileMeta] = useState<FileOut | null>(null);
    const [isOwner, setIsOwner] = useState<boolean | null>(null);
    const [duplicating, setDuplicating] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

    const [managerOpen, setManagerOpen] = useState(false);
    const [managerMode, setManagerMode] = useState<CppMode>("code");

    const fileIdRef = useRef<string | null>(null);
    const isOwnerRef = useRef<boolean>(false);
    useEffect(() => { isOwnerRef.current = !!isOwner; }, [isOwner]);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [runState, setRunState] = useState<RunState>("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [resultValue, setResultValue] = useState<string | null>(null);
    const [tfBackend, setTfBackend] = useState<string>("initializing");
    const [buildState, setBuildState] = useState<BuildState>("idle");
    const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null);

    const [rightTab, setRightTab] = useState<"console" | "infos">("console");
    const [infos, setInfos] = useState<ClangDiagnostic[]>([]);
    const codeEditorRef = useRef<CodeEditorRef | null>(null);

    const [editorTabs, setEditorTabs] = useState<EditorTab[]>([
        { uri: DEFAULT_MAIN_URI, label: "main.cpp", readOnly: false, closable: false },
    ]);
    const [activeTabUri, setActiveTabUri] = useState<string>(DEFAULT_MAIN_URI);

    // Keep the main tab label in sync with the (renameable) file name. The
    // main tab is always index 0 by construction.
    useEffect(() => {
        setEditorTabs(prev => {
            if (prev.length === 0) return prev;
            const main = prev[0];
            if (main.label === fileName && main.readOnly === (isOwner === false)) return prev;
            return [{ ...main, label: fileName, readOnly: isOwner === false }, ...prev.slice(1)];
        });
    }, [fileName, isOwner]);

    const handleDiagnosticsChanged = useCallback((diagnostics: ClangDiagnostic[]) => {
        setInfos(diagnostics);
    }, []);

    const handleActiveModelChanged = useCallback((uri: string) => {
        setActiveTabUri(uri);
        // When monaco-vscode opens a system header via go-to-definition, the
        // model switch fires before we have a tab for it — register it here so
        // the tab strip stays in sync with the editor.
        if (uri !== DEFAULT_MAIN_URI) {
            setEditorTabs(prev => {
                if (prev.some(t => t.uri === uri)) return prev;
                return [...prev, { uri, label: systemTabLabel(uri), readOnly: true, closable: true }];
            });
        }
    }, []);

    const handleTabClick = useCallback((uri: string) => {
        codeEditorRef.current?.setActiveModel(uri);
    }, []);

    const handleTabClose = useCallback((uri: string) => {
        codeEditorRef.current?.closeModel(uri);
        setEditorTabs(prev => prev.filter(t => t.uri !== uri));
    }, []);

    const focusInfoEntry = useCallback((entry: ClangDiagnostic) => {
        codeEditorRef.current?.revealAt(DEFAULT_MAIN_URI, entry.line, entry.column);
    }, []);

    // Hydrate from props (parent already fetched the file + ownership).
    useEffect(() => {
        const f = initialFile;
        const owner = initialOwner;
        setIsOwner(owner);
        setFileMeta(f);
        setFileId(f.id);
        fileIdRef.current = f.id;
        setFileName(f.name);
        // "{}" is the FileCreate default produced when dashboard creates a
        // new file without sending content. Treat it as never-seeded and
        // populate with the template, then persist immediately so the
        // preview/refresh shows real content (Monaco doesn't fire
        // onTextChanged on mount, so autosave wouldn't run otherwise).
        // Plain "" is the user's deliberate empty state — preserve it.
        const needsSeed = f.content === "{}";
        const content = needsSeed ? INITIAL_CODE : f.content;
        setCode(content);
        setEditorKey(k => k + 1);
        setEditorTabs([{ uri: DEFAULT_MAIN_URI, label: f.name, readOnly: !owner, closable: false }]);
        setActiveTabUri(DEFAULT_MAIN_URI);
        setSaveStatus("saved");
        if (needsSeed && owner) {
            saveFile(f.id, INITIAL_CODE).catch(() => { /* surfaced on next edit */ });
        }
    }, [initialFile, initialOwner]);

    // Autosave on code change (debounced). Non-owners (link-share viewers) skip
    // the save call entirely — they have no write permission and the editor is
    // read-only, but Monaco can still fire onTextChanged during programmatic
    // updates so we gate at the handler level too.
    const handleCodeChange = useCallback((next: string) => {
        setCode(next);
        if (!fileIdRef.current || !isOwnerRef.current) return;
        setSaveStatus("unsaved");
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(async () => {
            const id = fileIdRef.current;
            if (!id) return;
            setSaveStatus("saving");
            try {
                await saveFile(id, next);
                setSaveStatus("saved");
            } catch {
                setSaveStatus("error");
            }
        }, 2000);
    }, []);

    useEffect(() => () => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    }, []);

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
            if (err?.status === 409) setErrorMsg("같은 이름의 파일이 이미 있어요.");
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
            await saveFile(fileId, code);
            setSaveStatus("saved");
        } catch {
            setSaveStatus("error");
        }
    }, [fileId, code]);

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

    const handleDownloadCpp = useCallback(() => {
        const blob = new Blob([code], { type: "text/x-c++src;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        // Strip any existing C/C++ extension so we don't end up with foo.cpp.cpp
        const base = (fileName || "untitled").replace(/\.(cpp|cc|cxx|c\+\+|h|hpp|hxx)$/i, "");
        a.download = `${base || "untitled"}.cpp`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revoke on the next tick so the browser has begun fetching the blob: URL.
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }, [code, fileName]);

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
            // If the error is from an in-flight backend switch, restore the
            // previous backend instead of leaving the UI stuck on "initializing".
            // Backend switch errors aren't runtime errors so we don't flip
            // runState.
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

    const handleRun = useCallback(async () => {
        if (runState === "loading" || runState === "compiling" || runState === "running") return;
        const worker = workerRef.current;
        if (!worker) return;

        clearLog();
        setErrorMsg(null);
        setResultValue(null);
        setRunState("compiling");

        try {
            const res = await fetch(`${API_BASE}/compile/emcc`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
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
    }, [code, runState, clearLog]);

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
                    body: JSON.stringify({ code, lang: "cpp" }),
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
    }, [code, buildState]);

    const runDisabled = runState === "loading" || runState === "compiling" || runState === "running" || buildState === "building" || buildState === "downloading";
    const buildDisabled = runState === "loading" || runState === "compiling" || runState === "running" || buildState === "building" || buildState === "downloading";
    const runLabel =
        runState === "loading"   ? "런타임 로드 중…" :
        runState === "compiling" ? "컴파일 중…" :
        runState === "running"   ? "실행 중…" :
        "Run";
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

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: token.color.bg, color: token.color.fg, fontSize: token.font.size.fs13 }}>
            {/* ── Top bar ── */}
            <header style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 16px", height: 48, borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0 }}>
                {/* Brand + filename */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, whiteSpace: "nowrap" }}>
                    <TopbarBrand />
                    <span style={{ color: token.color.fgSubtle, fontWeight: 300, marginLeft: 4 }}>/</span>
                    <button
                        onClick={isOwner ? handleOpenManager : undefined}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: token.radius.sm, background: "none", border: "none", cursor: isOwner ? "pointer" : "default", color: token.color.fgMuted, fontSize: token.font.size.fs12, fontFamily: token.font.family.mono }}
                    >
                        <Icon.File size={12} />
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
                        {isOwner && <Icon.Chevron size={11} />}
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

                {/* Center — build progress (only when building) */}
                <div style={{ display: "flex", justifyContent: "center" }}>
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
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
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
                    {/* Backend toggle */}
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

                    {/* Build */}
                    <Button
                        variant="secondary"
                        size="sm"
                        leading={buildSpinning ? <Spinner size="sm" /> : <Icon.Download size={11} />}
                        onClick={handleBuild}
                        disabled={buildDisabled}
                    >
                        {buildLabel}
                    </Button>

                    {/* Run */}
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", flex: 1, minHeight: 0 }}>

                {/* Editor area */}
                <main style={{ display: "flex", flexDirection: "column", minWidth: 0, background: token.color.bgCanvas, overflow: "hidden" }}>
                    {/* Editor toolbar (tab strip) */}
                    <div style={{ display: "flex", alignItems: "center", padding: "5px 10px", borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0 }}>
                        <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
                            {editorTabs.map(tab => {
                                const isActive = tab.uri === activeTabUri;
                                return (
                                    <div
                                        key={tab.uri}
                                        onClick={() => !isActive && handleTabClick(tab.uri)}
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
                                        {tab.readOnly && (
                                            <span style={{ fontSize: token.font.size.fs10, color: token.color.fgSubtle, fontFamily: token.font.family.mono }}>
                                                read-only
                                            </span>
                                        )}
                                        {tab.closable && (
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); handleTabClose(tab.uri); }}
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

                    {/* Editor */}
                    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                        <CodeEditor
                            key={editorKey}
                            ref={codeEditorRef}
                            initialCode={code}
                            mainUri={DEFAULT_MAIN_URI}
                            lspWsUrl={LSP_WS_URL}
                            onTextChanged={handleCodeChange}
                            readOnly={isOwner === false}
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
                </main>

                {/* Right panel: console + infos */}
                <aside style={{ display: "flex", flexDirection: "column", borderLeft: `1px solid ${token.color.border}`, background: token.color.bg, overflow: "hidden" }}>
                    {/* Tabs */}
                    <div style={{ display: "flex", padding: "8px 8px 0", gap: 2, borderBottom: `1px solid ${token.color.border}` }}>
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
                        {/* Result card */}
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
                        {/* Log */}
                        <div
                            className="simulizer-log"
                            ref={logAreaRef}
                            style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}
                        >
                            <div data-placeholder style={{ padding: "3px 14px", color: token.color.fgSubtle, fontFamily: token.font.family.mono, fontSize: token.font.size.fs11 }}>
                                {pack.workspace.ui.log_placeholder}
                            </div>
                        </div>
                        {/* Footer */}
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

            {/* Error banner */}
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

            <CppManagerModal
                open={managerOpen}
                mode={managerMode}
                code={code}
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
            />
        </div>
    );
};

export default ClangWorkspace;
