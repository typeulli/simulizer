"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { token } from "@/components/tokens";
import type { DebugFrame, DebugVariable } from "@/utils/wasm/debug-protocol";
import type { DebugStatus, SetResult } from "./useClangDebug";

interface Props {
    status: DebugStatus;
    errorMsg: string | null;
    callStack: DebugFrame[];
    activeFrameId: number;
    setActiveFrameId: (id: number) => void;
    watches: string[];
    addWatch: (expr: string) => void;
    removeWatch: (expr: string) => void;
    onContinue: () => void;
    onStepOver: () => void;
    onStepInto: () => void;
    onStepOut: () => void;
    onStop: () => void;
    requestVariables: (ref: number) => Promise<DebugVariable[]>;
    requestEvaluate: (frameId: number, expr: string) => Promise<string | null>;
    requestSetVariable: (setId: number, value: string) => Promise<SetResult>;
    onRevealFrame: (file: string, line: number) => void;
}

const mono = token.font.family.mono;

// ── toolbar ──────────────────────────────────────────────────────────────────
function ToolBtn({ title, onClick, disabled, children }: {
    title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
    return (
        <button type="button" title={title} onClick={onClick} disabled={disabled}
            style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 26, border: "none", borderRadius: token.radius.sm,
                background: "transparent", color: disabled ? token.color.fgSubtle : token.color.fg,
                cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
            }}>
            {children}
        </button>
    );
}

const ICON = {
    continue: <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2v12l9-6z" /></svg>,
    over: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 6a6 6 0 0 1 11-2" /><path d="M13 2v3h-3" /><circle cx="8" cy="12" r="1.6" fill="currentColor" stroke="none" /></svg>,
    into: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v7" /><path d="M5 6.5 8 9.5 11 6.5" /><circle cx="8" cy="13" r="1.6" fill="currentColor" stroke="none" /></svg>,
    out: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 9V2" /><path d="M5 4.5 8 1.5 11 4.5" /><circle cx="8" cy="13" r="1.6" fill="currentColor" stroke="none" /></svg>,
    stop: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5" /></svg>,
};

// ── variables tree ───────────────────────────────────────────────────────────
// `expanded` (a persistent Set of node paths) survives the per-stop remount so
// a step keeps whatever the user had opened. Each row keys itself by its path
// (e.g. "p/a", "v/[0]/x") and re-fetches its children on mount if it was open.
interface TreeCtx {
    requestVariables: (ref: number) => Promise<DebugVariable[]>;
    requestSetVariable: (setId: number, value: string) => Promise<SetResult>;
    expanded: Set<string>;
    onToggle: (path: string, open: boolean) => void;
}

function VarRow({ v, depth, path, ctx }: { v: DebugVariable; depth: number; path: string; ctx: TreeCtx }) {
    const expandable = v.variablesReference > 0;
    const editable = (v.setId ?? 0) > 0;
    const [open, setOpen] = useState(expandable && ctx.expanded.has(path));
    const [children, setChildren] = useState<DebugVariable[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [override, setOverride] = useState<string | null>(null);  // value after an edit
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const shownValue = override ?? v.value;

    const fetchChildren = useCallback(async () => {
        setLoading(true);
        const c = await ctx.requestVariables(v.variablesReference);
        setChildren(c);
        setLoading(false);
    }, [ctx, v.variablesReference]);

    // Restore: if this node was expanded before the step, re-fetch on mount.
    useEffect(() => {
        if (open && children === null) void fetchChildren();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggle = async () => {
        if (!expandable) return;
        const next = !open;
        setOpen(next);
        ctx.onToggle(path, next);
        if (next && children === null) await fetchChildren();
    };

    const beginEdit = (e: React.MouseEvent) => {
        if (!editable) return;
        e.stopPropagation();
        setDraft(shownValue);
        setErr(null);
        setEditing(true);
    };
    const commit = async () => {
        const r = await ctx.requestSetVariable(v.setId!, draft);
        if (r.ok) { setOverride(r.value ?? draft); setEditing(false); setErr(null); }
        else setErr(r.error ?? "변경 실패");
    };

    return (
        <>
            <div onClick={toggle}
                style={{
                    display: "flex", alignItems: "baseline", gap: 4,
                    padding: "1px 8px 1px " + (8 + depth * 12) + "px",
                    fontFamily: mono, fontSize: token.font.size.fs11, lineHeight: 1.7,
                    cursor: expandable ? "pointer" : "default", whiteSpace: "nowrap",
                }}>
                <span style={{ width: 9, flexShrink: 0, color: token.color.fgSubtle }}>
                    {expandable ? (open ? "▾" : "▸") : ""}
                </span>
                <span style={{ color: token.color.accent }}>{v.name}</span>
                {editing ? (
                    <input
                        autoFocus
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                            if (e.key === "Enter") void commit();
                            else if (e.key === "Escape") { setEditing(false); setErr(null); }
                        }}
                        onBlur={() => { setEditing(false); setErr(null); }}
                        style={{
                            font: "inherit", padding: "0 4px", marginLeft: 2, width: 120,
                            background: token.color.bgCanvas, color: token.color.fgStrong,
                            border: `1px solid ${err ? token.color.danger : token.color.accent}`,
                            borderRadius: token.radius.xs, outline: "none",
                        }}
                        title={err ?? "Enter로 적용, Esc로 취소"}
                    />
                ) : (
                    <span
                        onDoubleClick={beginEdit}
                        title={editable ? "더블클릭하여 값 변경" : undefined}
                        style={{
                            color: override != null ? token.color.warning : token.color.fgStrong,
                            overflow: "hidden", textOverflow: "ellipsis",
                            cursor: editable ? "text" : "default",
                            textDecoration: editable ? "underline dotted transparent" : undefined,
                        }}>= {shownValue}</span>
                )}
                <span style={{ color: token.color.fgSubtle, marginLeft: 4 }}>{v.type}</span>
            </div>
            {open && loading && (
                <div style={{ padding: "1px 8px 1px " + (8 + (depth + 1) * 12 + 9) + "px", fontFamily: mono, fontSize: token.font.size.fs10, color: token.color.fgSubtle }}>로딩…</div>
            )}
            {open && children?.map((c, i) => (
                <VarRow key={c.name + i} v={c} depth={depth + 1} path={path + "/" + c.name} ctx={ctx} />
            ))}
        </>
    );
}

function VariablesView({ scopeRef, ctx }: { scopeRef: number | null; ctx: TreeCtx }) {
    const [vars, setVars] = useState<DebugVariable[] | null>(null);
    useEffect(() => {
        let alive = true;
        if (scopeRef == null) { setVars([]); return; }
        setVars(null);
        ctx.requestVariables(scopeRef).then(v => { if (alive) setVars(v); });
        return () => { alive = false; };
    }, [scopeRef, ctx]);

    if (vars === null) return <Muted>로딩…</Muted>;
    if (vars.length === 0) return <Muted>이 범위에 변수가 없습니다</Muted>;
    return <>{vars.map((v, i) => <VarRow key={v.name + i} v={v} depth={0} path={v.name} ctx={ctx} />)}</>;
}

// ── watch ────────────────────────────────────────────────────────────────────
function WatchView({ watches, activeFrameId, status, requestEvaluate, addWatch, removeWatch }: {
    watches: string[]; activeFrameId: number; status: DebugStatus;
    requestEvaluate: (frameId: number, expr: string) => Promise<string | null>;
    addWatch: (e: string) => void; removeWatch: (e: string) => void;
}) {
    const [vals, setVals] = useState<Record<string, string | null>>({});
    const [input, setInput] = useState("");

    useEffect(() => {
        if (status !== "stopped") return;
        let alive = true;
        (async () => {
            const out: Record<string, string | null> = {};
            for (const w of watches) out[w] = await requestEvaluate(activeFrameId, w);
            if (alive) setVals(out);
        })();
        return () => { alive = false; };
    }, [watches, activeFrameId, status, requestEvaluate]);

    return (
        <div>
            <form onSubmit={e => { e.preventDefault(); addWatch(input); setInput(""); }}
                style={{ padding: "4px 10px" }}>
                <input value={input} onChange={e => setInput(e.target.value)} placeholder="식 추가 (변수명)"
                    style={{
                        width: "100%", padding: "3px 6px", fontFamily: mono, fontSize: token.font.size.fs11,
                        background: token.color.bgSubtle, color: token.color.fg,
                        border: `1px solid ${token.color.border}`, borderRadius: token.radius.sm, outline: "none",
                    }} />
            </form>
            {watches.length === 0
                ? <Muted>감시할 식을 추가하세요</Muted>
                : watches.map(w => (
                    <div key={w} style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "1px 10px", fontFamily: mono, fontSize: token.font.size.fs11, lineHeight: 1.7 }}>
                        <span style={{ color: token.color.accent }}>{w}</span>
                        <span style={{ color: token.color.fgStrong }}>= {status === "stopped" ? (vals[w] ?? "<n/a>") : "—"}</span>
                        <button type="button" onClick={() => removeWatch(w)} title="제거"
                            style={{ marginLeft: "auto", border: "none", background: "none", color: token.color.fgSubtle, cursor: "pointer", fontSize: token.font.size.fs11 }}>×</button>
                    </div>
                ))}
        </div>
    );
}

function Muted({ children }: { children: React.ReactNode }) {
    return <div style={{ padding: "3px 14px", color: token.color.fgSubtle, fontFamily: mono, fontSize: token.font.size.fs11 }}>{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ padding: "8px 12px 3px", fontSize: token.font.size.fs10, textTransform: "uppercase", letterSpacing: "0.06em", color: token.color.fgSubtle, fontWeight: 600 }}>
            {children}
        </div>
    );
}

export default function DebugPanel(props: Props) {
    const {
        status, errorMsg, callStack, activeFrameId, setActiveFrameId, watches, addWatch, removeWatch,
        onContinue, onStepOver, onStepInto, onStepOut, onStop,
        requestVariables, requestEvaluate, requestSetVariable, onRevealFrame,
    } = props;

    const paused = status === "stopped";
    const activeFrame = callStack.find(f => f.id === activeFrameId) ?? callStack[0];
    const scopeRef = paused && activeFrame ? activeFrame.scopeRef : null;

    // Persistent expansion state (by node path) so stepping keeps the tree open.
    const expandedRef = useRef<Set<string>>(new Set());
    const onToggle = useCallback((path: string, open: boolean) => {
        if (open) expandedRef.current.add(path);
        else {
            // Collapse the node and any descendants beneath it.
            for (const p of Array.from(expandedRef.current)) {
                if (p === path || p.startsWith(path + "/")) expandedRef.current.delete(p);
            }
        }
    }, []);
    const treeCtx: TreeCtx = useMemo(
        () => ({ requestVariables, requestSetVariable, expanded: expandedRef.current, onToggle }),
        [requestVariables, requestSetVariable, onToggle],
    );

    const statusText =
        status === "compiling" ? "디버그 빌드 중…" :
        status === "running" ? "실행 중…" :
        status === "stopped" ? `일시정지 · ${activeFrame ? `${activeFrame.file}:${activeFrame.line}` : ""}` :
        status === "terminated" ? "종료됨" :
        status === "error" ? "오류" : "대기 중";

    return (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            {/* toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "4px 8px", borderBottom: `1px solid ${token.color.border}` }}>
                <ToolBtn title="계속 (F5)" onClick={onContinue} disabled={!paused}>{ICON.continue}</ToolBtn>
                <ToolBtn title="단계 건너뛰기" onClick={onStepOver} disabled={!paused}>{ICON.over}</ToolBtn>
                <ToolBtn title="단계 들어가기" onClick={onStepInto} disabled={!paused}>{ICON.into}</ToolBtn>
                <ToolBtn title="단계 나가기" onClick={onStepOut} disabled={!paused}>{ICON.out}</ToolBtn>
                <ToolBtn title="중지" onClick={onStop} disabled={status === "idle" || status === "terminated"}>{ICON.stop}</ToolBtn>
                <span style={{ marginLeft: 8, fontFamily: mono, fontSize: token.font.size.fs10, color: token.color.fgMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {statusText}
                </span>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
                {status === "error" && errorMsg && (
                    <pre style={{
                        margin: "8px 10px", padding: "8px 10px", whiteSpace: "pre-wrap", wordBreak: "break-word",
                        fontFamily: mono, fontSize: token.font.size.fs10, color: token.color.danger,
                        background: token.color.bgSubtle, border: `1px solid ${token.color.danger}`,
                        borderRadius: token.radius.sm, maxHeight: 260, overflowY: "auto",
                    }}>{errorMsg}</pre>
                )}
                <SectionLabel>변수</SectionLabel>
                {paused
                    ? <VariablesView key={scopeRef ?? -1} scopeRef={scopeRef} ctx={treeCtx} />
                    : <Muted>일시정지 상태에서 변수를 볼 수 있어요</Muted>}

                <SectionLabel>호출 스택</SectionLabel>
                {callStack.length === 0
                    ? <Muted>—</Muted>
                    : callStack.map(f => (
                        <div key={f.id}
                            onClick={() => { setActiveFrameId(f.id); onRevealFrame(f.file, f.line); }}
                            style={{
                                display: "flex", alignItems: "baseline", gap: 6, padding: "2px 12px",
                                fontFamily: mono, fontSize: token.font.size.fs11, lineHeight: 1.7, cursor: "pointer",
                                background: f.id === activeFrameId ? token.color.bgSubtle : "transparent",
                                borderLeft: `2px solid ${f.id === activeFrameId ? token.color.accent : "transparent"}`,
                            }}>
                            <span style={{ color: token.color.fgStrong }}>{f.name}</span>
                            <span style={{ color: token.color.fgSubtle }}>{f.file}:{f.line}</span>
                        </div>
                    ))}

                <SectionLabel>감시</SectionLabel>
                <WatchView watches={watches} activeFrameId={activeFrameId} status={status}
                    requestEvaluate={requestEvaluate} addWatch={addWatch} removeWatch={removeWatch} />
            </div>
        </div>
    );
}
