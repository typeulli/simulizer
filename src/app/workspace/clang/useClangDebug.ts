"use client";
import { useCallback, useRef, useState } from "react";

import type { CodeEditorRef } from "./CodeEditor";
import { pathToUri } from "./uri";
import type {
    DebugFrame, DebugVariable, DebugOutMsg, BreakpointReq,
} from "@/utils/wasm/debug-protocol";

export type DebugStatus = "idle" | "compiling" | "running" | "stopped" | "terminated" | "error";
export type SetResult = { ok: boolean; value?: string; error?: string };

type LogFn = (kind: "info" | "error" | "success", text: string) => void;

interface Args {
    apiBase: string;
    workerRef: React.MutableRefObject<Worker | null>;
    codeEditorRef: React.MutableRefObject<CodeEditorRef | null>;
    getBundle: () => { tree: unknown; entry: string };
    /** Terminate the current worker and return a fresh one (for Stop). */
    recreateWorker: () => void;
    onLog: LogFn;
    /** Clear the console output panel (called when a debug session starts). */
    clearConsole: () => void;
    /** Breakpoints restored from the saved project. */
    initialBreakpoints?: Record<string, number[]>;
    /** Notified whenever breakpoints change, so they can be persisted. */
    onBreakpointsChange?: (bps: Record<string, number[]>) => void;
}

function b64ToArrayBuffer(b64: string): ArrayBuffer {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

function flatten(bps: Record<string, number[]>): BreakpointReq[] {
    const out: BreakpointReq[] = [];
    for (const [file, lines] of Object.entries(bps)) for (const line of lines) out.push({ file, line });
    return out;
}

export function useClangDebug({ apiBase, workerRef, codeEditorRef, getBundle, recreateWorker, onLog, clearConsole, initialBreakpoints, onBreakpointsChange }: Args) {
    const [status, setStatus] = useState<DebugStatus>("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [breakpoints, setBreakpoints] = useState<Record<string, number[]>>(initialBreakpoints ?? {});
    const [callStack, setCallStack] = useState<DebugFrame[]>([]);
    const [activeFrameId, setActiveFrameId] = useState(0);
    const [stopLine, setStopLine] = useState<{ file: string; line: number } | null>(null);
    const [watches, setWatches] = useState<string[]>([]);

    const breakpointsRef = useRef(breakpoints);
    breakpointsRef.current = breakpoints;
    const statusRef = useRef(status);
    statusRef.current = status;

    const reqIdRef = useRef(1);
    const pendingVarsRef = useRef<Map<number, (v: DebugVariable[]) => void>>(new Map());
    const pendingEvalRef = useRef<Map<number, (r: string | null) => void>>(new Map());
    const pendingSetRef = useRef<Map<number, (r: SetResult) => void>>(new Map());

    const active = status === "running" || status === "stopped";

    // ── breakpoints ──────────────────────────────────────────────────────────
    const toggleBreakpoint = useCallback((path: string, line: number) => {
        // Compute from the ref (not a functional updater) so the side effects —
        // especially onBreakpointsChange → setBundle — run in the event handler,
        // not inside a setState updater (which would be dropped/unsafe).
        const prev = breakpointsRef.current;
        const lines = new Set(prev[path] ?? []);
        if (lines.has(line)) lines.delete(line); else lines.add(line);
        const nextLines = Array.from(lines).sort((a, b) => a - b);
        const next: Record<string, number[]> = { ...prev, [path]: nextLines };
        if (nextLines.length === 0) delete next[path];
        breakpointsRef.current = next;
        setBreakpoints(next);
        codeEditorRef.current?.renderBreakpoints(path, nextLines);
        // Live-update a running/paused session.
        if (statusRef.current === "running" || statusRef.current === "stopped") {
            workerRef.current?.postMessage({ type: "dbg-setBreakpoints", breakpoints: flatten(next) });
        }
        onBreakpointsChange?.(next);  // persist with the project
    }, [codeEditorRef, workerRef, onBreakpointsChange]);

    /** Re-apply all breakpoint glyphs + the stop line (after editor (re)mounts
     *  or a tab opens, since model-level decorations are lost on dispose). */
    const reapplyDecorations = useCallback(() => {
        for (const [path, lines] of Object.entries(breakpointsRef.current)) {
            codeEditorRef.current?.renderBreakpoints(path, lines);
        }
        if (stopLine) codeEditorRef.current?.renderStoppedLine(stopLine.file, stopLine.line);
    }, [codeEditorRef, stopLine]);

    // ── session lifecycle ──────────────────────────────────────────────────────
    const handleDebug = useCallback(async () => {
        if (statusRef.current === "compiling" || statusRef.current === "running") return;
        const worker = workerRef.current;
        if (!worker) return;
        clearConsole();
        setStatus("compiling");
        setErrorMsg(null);
        setCallStack([]);
        setStopLine(null);
        codeEditorRef.current?.renderStoppedLine(null, null);

        const { tree, entry } = getBundle();
        try {
            const res = await fetch(`${apiBase}/compile/emcc/debug`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tree, entry }),
            });
            if (!res.ok) {
                let detail = await res.text();
                try { detail = JSON.parse(detail).detail ?? detail; } catch { /* raw */ }
                onLog("error", detail);
                setErrorMsg(detail);
                setStatus("error");
                return;
            }
            const { wasm, sidecar } = await res.json();
            const wasmBuffer = b64ToArrayBuffer(wasm);
            setStatus("running");
            worker.postMessage(
                { type: "debug", wasmBuffer, sidecar, breakpoints: flatten(breakpointsRef.current) },
                [wasmBuffer],
            );
        } catch (err) {
            onLog("error", err instanceof Error ? err.message : String(err));
            setStatus("error");
        }
    }, [apiBase, workerRef, codeEditorRef, getBundle, onLog, clearConsole]);

    const resume = useCallback((type: "dbg-continue" | "dbg-stepOver" | "dbg-stepInto" | "dbg-stepOut") => {
        if (statusRef.current !== "stopped") return;
        codeEditorRef.current?.renderStoppedLine(null, null);
        setStopLine(null);
        setStatus("running");
        workerRef.current?.postMessage({ type });
    }, [codeEditorRef, workerRef]);

    const stop = useCallback(() => {
        codeEditorRef.current?.renderStoppedLine(null, null);
        setStopLine(null);
        setCallStack([]);
        if (statusRef.current === "running") {
            // Can't message a synchronously-running worker — kill and respawn.
            recreateWorker();
        } else {
            workerRef.current?.postMessage({ type: "dbg-stop" });
        }
        setStatus("terminated");
    }, [codeEditorRef, workerRef, recreateWorker]);

    // ── variable / watch RPC ───────────────────────────────────────────────────
    const requestVariables = useCallback((variablesReference: number): Promise<DebugVariable[]> => {
        const worker = workerRef.current;
        if (!worker) return Promise.resolve([]);
        return new Promise(resolve => {
            const requestId = reqIdRef.current++;
            pendingVarsRef.current.set(requestId, resolve);
            worker.postMessage({ type: "dbg-getVariables", requestId, variablesReference });
        });
    }, [workerRef]);

    const requestEvaluate = useCallback((frameId: number, expression: string): Promise<string | null> => {
        const worker = workerRef.current;
        if (!worker) return Promise.resolve(null);
        return new Promise(resolve => {
            const requestId = reqIdRef.current++;
            pendingEvalRef.current.set(requestId, resolve);
            worker.postMessage({ type: "dbg-evaluate", requestId, frameId, expression });
        });
    }, [workerRef]);

    const requestSetVariable = useCallback((setId: number, value: string): Promise<SetResult> => {
        const worker = workerRef.current;
        if (!worker) return Promise.resolve({ ok: false, error: "no worker" });
        return new Promise(resolve => {
            const requestId = reqIdRef.current++;
            pendingSetRef.current.set(requestId, resolve);
            worker.postMessage({ type: "dbg-setVariable", requestId, setId, value });
        });
    }, [workerRef]);

    const addWatch = useCallback((expr: string) => {
        const e = expr.trim();
        if (e) setWatches(prev => prev.includes(e) ? prev : [...prev, e]);
    }, []);
    const removeWatch = useCallback((expr: string) => {
        setWatches(prev => prev.filter(w => w !== expr));
    }, []);

    // ── worker message sink (called from ClangWorkspace) ───────────────────────
    const handleDebugMessage = useCallback((msg: DebugOutMsg): boolean => {
        switch (msg.type) {
            case "dbg-stopped": {
                setStatus("stopped");
                setCallStack(msg.frames);
                setActiveFrameId(0);
                setStopLine({ file: msg.file, line: msg.line });
                codeEditorRef.current?.renderStoppedLine(msg.file, msg.line);
                codeEditorRef.current?.revealAt(pathToUri(msg.file), msg.line);
                return true;
            }
            case "dbg-terminated": {
                // The return value is surfaced in the top output area via the
                // worker's "result" message (handled by ClangWorkspace), just
                // like Run — so we don't log anything to the console here.
                setStatus("terminated");
                setCallStack([]);
                setStopLine(null);
                codeEditorRef.current?.renderStoppedLine(null, null);
                return true;
            }
            case "dbg-variables": {
                pendingVarsRef.current.get(msg.requestId)?.(msg.variables);
                pendingVarsRef.current.delete(msg.requestId);
                return true;
            }
            case "dbg-evaluate": {
                pendingEvalRef.current.get(msg.requestId)?.(msg.result);
                pendingEvalRef.current.delete(msg.requestId);
                return true;
            }
            case "dbg-setVariable": {
                pendingSetRef.current.get(msg.requestId)?.({ ok: msg.ok, value: msg.value, error: msg.error });
                pendingSetRef.current.delete(msg.requestId);
                return true;
            }
            case "dbg-error": {
                onLog("error", msg.message);
                setErrorMsg(msg.message);
                setStatus("error");
                setStopLine(null);
                codeEditorRef.current?.renderStoppedLine(null, null);
                return true;
            }
        }
        return false;
    }, [codeEditorRef, onLog]);

    return {
        status, errorMsg, active, breakpoints, callStack, activeFrameId, setActiveFrameId, stopLine, watches,
        toggleBreakpoint, reapplyDecorations,
        handleDebug, continue: () => resume("dbg-continue"), stepOver: () => resume("dbg-stepOver"),
        stepInto: () => resume("dbg-stepInto"), stepOut: () => resume("dbg-stepOut"), stop,
        requestVariables, requestEvaluate, requestSetVariable, addWatch, removeWatch,
        handleDebugMessage,
    };
}
