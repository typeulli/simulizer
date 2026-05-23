"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { fetchEventSource } from "@microsoft/fetch-event-source";

import { useConsolePanel } from "@/components/console";
import type { WorkerOutMsg } from "@/utils/wasm/wasm-worker";
import type { ClangWorkerInMsg } from "@/utils/wasm/clang-worker";
import { vec_field_to_image_url, mat_data_to_image_url } from "@/utils/wasm/tensor";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

const LSP_WS_URL = (() => {
    const explicit = process.env.NEXT_PUBLIC_LSP_URL;
    if (explicit) return explicit.replace(/\/+$/, "") + "/lsp/cpp";
    const base = API_BASE || (typeof window !== "undefined" ? window.location.origin : "");
    return base.replace(/^http/, "ws") + "/lsp/cpp";
})();


const CodeEditor = dynamic(() => import("./CodeEditor"), {
    ssr: false,
    loading: () => (
        <div style={{ flex: 1, padding: 12, color: "var(--fg-muted, #888)" }}>
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

const ClangIDE: React.FC = () => {
    const [code, setCode] = useState(INITIAL_CODE);
    const [runState, setRunState] = useState<RunState>("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [resultValue, setResultValue] = useState<string | null>(null);
    const [tfBackend, setTfBackend] = useState<string>("initializing");
    const [buildState, setBuildState] = useState<BuildState>("idle");
    const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const {
        logAreaRef, addLog, addBar, setBar,
        addSeries, logToHolder, visualToHolder, graphToHolder,
        clearLog,
    } = useConsolePanel();

    const bindingsRef = useRef({ addLog, addBar, setBar, addSeries, logToHolder, visualToHolder, graphToHolder });
    useEffect(() => {
        bindingsRef.current = { addLog, addBar, setBar, addSeries, logToHolder, visualToHolder, graphToHolder };
    }, [addLog, addBar, setBar, addSeries, logToHolder, visualToHolder, graphToHolder]);

    const handleWorkerMessage = useCallback((e: MessageEvent<WorkerOutMsg>) => {
        const msg = e.data;
        const b = bindingsRef.current;

        if (msg.type === "ready") { setRunState("idle"); return; }
        if (msg.type === "backend-switched") { setTfBackend(msg.backend); return; }
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
        "▶ Run";
    const buildLabel =
        buildState === "building"    ? "빌드 중…" :
        buildState === "downloading" ? "다운로드 중…" :
        "⚙ Build (.exe)";

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg, #0d0d1a)", color: "var(--fg, #e0e0e0)" }}>
            <header
                style={{
                    display: "flex", alignItems: "center", gap: 16,
                    padding: "8px 16px",
                    borderBottom: "1px solid var(--border, #333)",
                    background: "var(--bg-subtle, #1a1a2a)",
                }}
            >
                <strong>Simulizer · C++</strong>
                <button
                    onClick={handleRun}
                    disabled={runDisabled}
                    style={{
                        padding: "6px 16px",
                        fontWeight: 600,
                        cursor: runDisabled ? "not-allowed" : "pointer",
                        opacity: runDisabled ? 0.5 : 1,
                        background: "var(--accent, #4a9eff)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                    }}
                >
                    {runLabel}
                </button>
                <button
                    onClick={handleBuild}
                    disabled={buildDisabled}
                    style={{
                        padding: "6px 16px",
                        fontWeight: 600,
                        cursor: buildDisabled ? "not-allowed" : "pointer",
                        opacity: buildDisabled ? 0.5 : 1,
                        background: "var(--accent-alt, #5a6a8a)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                    }}
                >
                    {buildLabel}
                </button>
                {buildProgress && (buildState === "building" || buildState === "downloading" || buildState === "done") && (
                    <span style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
                        {buildProgress.total > 0
                            ? `${buildProgress.step}/${buildProgress.total} · ${buildProgress.message}`
                            : buildProgress.message}
                    </span>
                )}
                <span style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
                    backend: {tfBackend}
                </span>
                {resultValue !== null && (
                    <span style={{ marginLeft: "auto", fontSize: 12 }}>
                        결과: <code>{resultValue}</code>
                    </span>
                )}
            </header>

            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                <div style={{ flex: 1, minWidth: 0, background: "var(--bg-canvas, #14141e)" }}>
                    <CodeEditor
                        initialCode={INITIAL_CODE}
                        lspWsUrl={LSP_WS_URL}
                        onTextChanged={setCode}
                    />
                </div>
                <div
                    ref={logAreaRef}
                    style={{
                        width: "40%",
                        minWidth: 320,
                        padding: 8,
                        overflowY: "auto",
                        background: "var(--bg-subtle, #1a1a2a)",
                        borderLeft: "1px solid var(--border, #333)",
                    }}
                >
                    <div data-placeholder style={{ color: "var(--fg-muted, #888)", fontSize: 12 }}>
                        ▶ 실행 버튼을 눌러 시작하세요
                    </div>
                </div>
            </div>

            {errorMsg && (
                <div
                    style={{
                        padding: 12,
                        background: "#3a1a1a",
                        color: "#ffaaaa",
                        whiteSpace: "pre-wrap",
                        fontFamily: "Consolas, monospace",
                        fontSize: 12,
                        maxHeight: 240,
                        overflow: "auto",
                        borderTop: "1px solid #5a2a2a",
                    }}
                >
                    {errorMsg}
                </div>
            )}
        </div>
    );
};

export default ClangIDE;
