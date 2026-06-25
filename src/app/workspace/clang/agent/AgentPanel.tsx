"use client";
// Chat surface for the in-workspace AI agent. Renders the useChat message
// stream (assistant text as markdown, tool calls as rich preview cards) and an
// input box. Lives in the right panel as the "AI" tab.

import React, { useCallback, useMemo, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { token } from "@/components/tokens";
import { getCredits } from "@/lib/file";
import { Button } from "@/components/atoms/Button";
import { Spinner } from "@/components/atoms/Spinner";
import { Checkbox } from "@/components/atoms/Checkbox";
import { Modal, ModalHeader, ModalBody } from "@/components/organisms/Modal";
import { TOOL, AGENT_PROVIDER_GROUPS, QUOTA_MARKER } from "./tools";
import { diffLines, type FileDiff, type DiffRow } from "./diff";
import type { ClangAgent, ToolMeta, PendingApproval } from "./useClangAgent";

const TOOL_LABEL: Record<string, string> = {
    [TOOL.listFiles]: "파일 목록",
    [TOOL.glob]: "glob",
    [TOOL.grep]: "grep",
    [TOOL.readFile]: "파일 읽기",
    [TOOL.readLines]: "라인 읽기",
    [TOOL.writeFile]: "파일 쓰기",
    [TOOL.editFile]: "파일 수정",
    [TOOL.renameFile]: "이름변경",
    [TOOL.deleteFile]: "삭제",
    [TOOL.checkSyntax]: "문법 검사",
    [TOOL.run]: "실행",
    [TOOL.build]: "빌드",
};

type UIMessage = ClangAgent["messages"][number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Part = any;

type RevealFn = (path: string, line: number) => void;

const fmt = (n: number) => n.toLocaleString();

// ── markdown ──────────────────────────────────────────────────────────────
// react-markdown v9 no longer passes an `inline` prop — block code is wrapped
// in <pre>, inline code is a bare <code>. So style inline via `code` and the
// fenced container via `pre`; only treat code as a block when it has a language
// class or spans multiple lines.
const inlineCodeStyle: React.CSSProperties = {
    background: token.color.bgCode,
    borderRadius: token.radius.xs,
    padding: "0 4px",
    fontFamily: token.font.family.mono,
    fontSize: token.font.size.fs11,
};

const markdownComponents = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code({ className, children, ...props }: any) {
        const isBlock = /language-/.test(className || "") || String(children ?? "").includes("\n");
        if (!isBlock) {
            return <code style={inlineCodeStyle} {...props}>{children}</code>;
        }
        return (
            <code className={className} style={{ fontFamily: token.font.family.mono, fontSize: token.font.size.fs11, lineHeight: 1.6, whiteSpace: "pre" }} {...props}>
                {children}
            </code>
        );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pre({ children, ...props }: any) {
        return (
            <pre style={{ margin: "6px 0", padding: 10, background: token.color.bgCode, border: `1px solid ${token.color.border}`, borderRadius: token.radius.sm, overflowX: "auto" }} {...props}>
                {children}
            </pre>
        );
    },
};

// ── usage badge ───────────────────────────────────────────────────────────
const UsageBadge: React.FC<{ usage: { input: number; output: number; total: number } }> = ({ usage }) => (
    <div style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: token.font.family.mono, fontSize: token.font.size.fs10, color: token.color.fgSubtle }}>
        <span>토큰 {fmt(usage.total)}</span>
        <span style={{ opacity: 0.7 }}>↑{fmt(usage.input)} ↓{fmt(usage.output)}</span>
    </div>
);

// ── shared chip primitives ────────────────────────────────────────────────
const chipBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    padding: "3px 8px",
    borderRadius: token.radius.sm,
    background: token.color.bgSubtle,
    border: `1px solid ${token.color.border}`,
    fontFamily: token.font.family.mono,
    fontSize: token.font.size.fs10,
    color: token.color.fgMuted,
    textAlign: "left",
};

function partStatus(part: Part) {
    const out = part.output as { error?: string } | undefined;
    const failed = part.state === "output-error" || !!out?.error;
    const done = part.state === "output-available";
    const errText: string | undefined = part.errorText ?? out?.error;
    return { failed, done, errText };
}

const StatusMark: React.FC<{ failed: boolean; done: boolean }> = ({ failed, done }) => {
    const symbol = failed ? "✕" : done ? "✓" : "…";
    const color = failed ? token.color.danger : done ? token.color.success : token.color.fgMuted;
    return <span style={{ color, flexShrink: 0 }}>{symbol}</span>;
};

const ellipsisText: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

// Generic chip used for tools without a richer view (run, build, rename, delete)
// and as the fallback for pending / failed states of the rich tools.
const ToolChip: React.FC<{ part: Part }> = ({ part }) => {
    const name = String(part.type).slice("tool-".length);
    const label = TOOL_LABEL[name] ?? name;
    const detail: string | undefined = part.input?.path ?? part.input?.pattern ?? part.input?.newPath;
    const { failed, done, errText } = partStatus(part);
    return (
        <div style={chipBase}>
            <StatusMark failed={failed} done={done} />
            <span style={ellipsisText}>{label}{detail ? `: ${detail}` : ""}</span>
            {failed && errText && <span style={{ color: token.color.danger, flexShrink: 0 }}>— {String(errText)}</span>}
        </div>
    );
};

// Clickable chip variant (button reset) for "jump to code" affordances.
const ChipButton: React.FC<{ onClick: () => void; title?: string; children: React.ReactNode }> = ({ onClick, title, children }) => (
    <button type="button" onClick={onClick} title={title} style={{ ...chipBase, cursor: "pointer", font: "inherit", color: token.color.fgMuted }}>
        {children}
    </button>
);

const previewBox: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    maxWidth: "100%",
    maxHeight: 180,
    overflowY: "auto",
    background: token.color.bgCode,
    border: `1px solid ${token.color.border}`,
    borderRadius: token.radius.sm,
    padding: "3px 0",
};

const rowButton: React.CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    width: "100%",
    padding: "1px 8px",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: token.font.family.mono,
    fontSize: token.font.size.fs10,
    lineHeight: 1.7,
    color: token.color.fg,
};

const moreNote: React.CSSProperties = { padding: "1px 8px", fontFamily: token.font.family.mono, fontSize: token.font.size.fs10, color: token.color.fgSubtle };

// ── read_file / read_lines ────────────────────────────────────────────────
const ReadView: React.FC<{ part: Part; onRevealRange: RevealFn }> = ({ part, onRevealRange }) => {
    const { failed, done } = partStatus(part);
    if (!done || failed) return <ToolChip part={part} />;
    const name = String(part.type).slice("tool-".length);
    const path = String(part.input?.path ?? "");
    const lines = (part.output?.lines ?? []) as Array<{ line: number }>;
    const total = part.output?.total as number | undefined;
    const start = lines[0]?.line;
    const end = lines[lines.length - 1]?.line;
    const range = start != null && end != null ? (start === end ? `L${start}` : `L${start}–${end}`) : "전체";
    return (
        <ChipButton onClick={() => onRevealRange(path, start ?? 1)} title="에디터에서 이 위치로 이동">
            <StatusMark failed={false} done />
            <span style={ellipsisText}>{TOOL_LABEL[name]}: {path}</span>
            <span style={{ flexShrink: 0, color: token.color.accent }}>· {range}{total ? ` / ${total}` : ""} ↗</span>
        </ChipButton>
    );
};

// ── grep ──────────────────────────────────────────────────────────────────
const GREP_PEEK = 8;
const GrepView: React.FC<{ part: Part; onRevealRange: RevealFn }> = ({ part, onRevealRange }) => {
    const { failed, done } = partStatus(part);
    if (!done || failed) return <ToolChip part={part} />;
    const pattern = String(part.input?.pattern ?? "");
    const matches = (part.output?.matches ?? []) as Array<{ path: string; line: number; text: string }>;
    const truncated = !!part.output?.truncated;
    const shown = matches.slice(0, GREP_PEEK);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "100%" }}>
            <div style={chipBase}>
                <StatusMark failed={false} done />
                <span style={ellipsisText}>grep: {pattern}</span>
                <span style={{ flexShrink: 0 }}>· {matches.length}{truncated ? "+" : ""}건</span>
            </div>
            {shown.length > 0 && (
                <div style={previewBox}>
                    {shown.map((m, i) => (
                        <button key={i} type="button" onClick={() => onRevealRange(m.path, m.line)} title="에디터에서 이 위치로 이동" style={rowButton}>
                            <span style={{ color: token.color.accent, flexShrink: 0 }}>{m.path}:{m.line}</span>
                            <span style={{ ...ellipsisText, color: token.color.fgMuted, flex: 1, minWidth: 0 }}>{m.text.trim()}</span>
                        </button>
                    ))}
                    {matches.length > shown.length && <div style={moreNote}>+{matches.length - shown.length}건 더…</div>}
                </div>
            )}
        </div>
    );
};

// ── glob / list_files (path lists) ────────────────────────────────────────
const PATH_PEEK = 12;
const PathsView: React.FC<{ part: Part; onRevealRange: RevealFn }> = ({ part, onRevealRange }) => {
    const { failed, done } = partStatus(part);
    if (!done || failed) return <ToolChip part={part} />;
    const name = String(part.type).slice("tool-".length);
    const isGlob = name === TOOL.glob;
    const paths = ((isGlob ? part.output?.matches : part.output?.files) ?? []) as string[];
    const detail = isGlob ? String(part.input?.pattern ?? "") : `${paths.length}개`;
    const shown = paths.slice(0, PATH_PEEK);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "100%" }}>
            <div style={chipBase}>
                <StatusMark failed={false} done />
                <span style={ellipsisText}>{TOOL_LABEL[name]}{isGlob ? `: ${detail}` : ""}</span>
                <span style={{ flexShrink: 0 }}>· {paths.length}개</span>
            </div>
            {shown.length > 0 && (
                <div style={previewBox}>
                    {shown.map((p, i) => (
                        <button key={i} type="button" onClick={() => onRevealRange(p, 1)} title="파일 열기" style={rowButton}>
                            <span style={{ ...ellipsisText, color: token.color.fgMuted }}>{p}</span>
                        </button>
                    ))}
                    {paths.length > shown.length && <div style={moreNote}>+{paths.length - shown.length}개 더…</div>}
                </div>
            )}
        </div>
    );
};

// ── edit_file / write_file (diff) ─────────────────────────────────────────
const Gutter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span style={{ flexShrink: 0, width: 34, textAlign: "right", color: token.color.fgSubtle, userSelect: "none" }}>{children}</span>
);

const DiffLine: React.FC<{ row: DiffRow; compact?: boolean }> = ({ row, compact }) => {
    const isAdd = row.type === "add";
    const isDel = row.type === "del";
    const bg = isAdd ? token.color.successSoft : isDel ? token.color.dangerSoft : "transparent";
    const accent = isAdd ? token.color.success : isDel ? token.color.danger : token.color.fgMuted;
    const sign = isAdd ? "+" : isDel ? "−" : " ";
    return (
        <div style={{ display: "flex", background: bg, fontFamily: token.font.family.mono, fontSize: token.font.size.fs10, lineHeight: 1.7 }}>
            {!compact && (
                <>
                    <Gutter>{row.oldNo ?? ""}</Gutter>
                    <Gutter>{row.newNo ?? ""}</Gutter>
                </>
            )}
            <span style={{ flexShrink: 0, width: 14, textAlign: "center", color: accent }}>{sign}</span>
            <span style={compact
                ? { ...ellipsisText, flex: 1, minWidth: 0, color: row.type === "ctx" ? token.color.fg : accent }
                : { whiteSpace: "pre", paddingRight: 12, color: row.type === "ctx" ? token.color.fg : accent }}>
                {row.text === "" ? " " : row.text}
            </span>
        </div>
    );
};

const DiffModal: React.FC<{ title: string; path: string; diff: FileDiff; onClose: () => void }> = ({ title, path, diff, onClose }) => (
    <Modal onClose={onClose} width={780} style={{ height: "min(80vh, 640px)" }}>
        <ModalHeader onClose={onClose}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ flexShrink: 0, fontWeight: token.font.weight.semibold }}>{title}</span>
                <span style={{ ...ellipsisText, fontFamily: token.font.family.mono, fontSize: token.font.size.fs12, color: token.color.fgMuted }}>{path}</span>
                <span style={{ flexShrink: 0, color: token.color.success }}>+{diff.stat.added}</span>
                <span style={{ flexShrink: 0, color: token.color.danger }}>−{diff.stat.removed}</span>
            </div>
        </ModalHeader>
        <ModalBody style={{ padding: 0, overflow: "auto", background: token.color.bgCode }}>
            <div style={{ width: "max-content", minWidth: "100%" }}>
                {diff.rows.map((r, i) => <DiffLine key={i} row={r} />)}
            </div>
        </ModalBody>
    </Modal>
);

const EDIT_PEEK = 6;
const EditView: React.FC<{ part: Part; meta?: ToolMeta }> = ({ part, meta }) => {
    const before = meta?.kind === "diff" ? meta.before : "";
    const after = meta?.kind === "diff" ? meta.after : "";
    const diff = useMemo(() => diffLines(before, after), [before, after]);
    const [open, setOpen] = useState(false);

    const { failed, done } = partStatus(part);
    if (!done || failed || meta?.kind !== "diff") return <ToolChip part={part} />;

    const name = String(part.type).slice("tool-".length);
    const path = meta.path;
    const labelKo = name === TOOL.writeFile ? (before ? "파일 쓰기" : "파일 생성") : "파일 수정";
    const changed = diff.rows.filter(r => r.type !== "ctx");
    const peek = changed.slice(0, EDIT_PEEK);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "100%" }}>
            <ChipButton onClick={() => setOpen(true)} title="전체 변경 내용 보기">
                <StatusMark failed={false} done />
                <span style={ellipsisText}>{labelKo}: {path}</span>
                <span style={{ flexShrink: 0, color: token.color.success }}>+{diff.stat.added}</span>
                <span style={{ flexShrink: 0, color: token.color.danger }}>−{diff.stat.removed}</span>
            </ChipButton>
            {peek.length > 0 && (
                <div style={{ ...previewBox, cursor: "pointer" }} onClick={() => setOpen(true)} title="전체 변경 내용 보기">
                    {peek.map((r, i) => <DiffLine key={i} row={r} compact />)}
                    {changed.length > peek.length && <div style={moreNote}>… 전체 보기 (변경 {changed.length}줄)</div>}
                </div>
            )}
            {open && <DiffModal title={labelKo} path={path} diff={diff} onClose={() => setOpen(false)} />}
        </div>
    );
};

// ── check_syntax (emcc compile check) ─────────────────────────────────────
const CHECK_PEEK = 8;
const CheckView: React.FC<{ part: Part; onRevealRange: RevealFn }> = ({ part, onRevealRange }) => {
    const { failed, done } = partStatus(part);
    if (!done || failed) return <ToolChip part={part} />;
    const success = !!part.output?.success;
    const diags = (part.output?.diagnostics ?? []) as Array<{ file: string | null; line: number | null; column: number | null; severity: string; message: string }>;
    if (success) {
        return (
            <div style={chipBase}>
                <StatusMark failed={false} done />
                <span style={ellipsisText}>문법 검사: 컴파일 통과</span>
            </div>
        );
    }
    const errCount = diags.filter(d => d.severity !== "warning").length;
    const shown = diags.slice(0, CHECK_PEEK);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "100%" }}>
            <div style={chipBase}>
                <span style={{ color: token.color.danger, flexShrink: 0 }}>✕</span>
                <span style={ellipsisText}>문법 검사: 컴파일 오류 {errCount}개</span>
            </div>
            {shown.length > 0 && (
                <div style={previewBox}>
                    {shown.map((d, i) => {
                        const loc = `${d.file ?? "?"}${d.line != null ? `:${d.line}` : ""}${d.column != null ? `:${d.column}` : ""}`;
                        const locColor = d.severity === "warning" ? token.color.warning : token.color.danger;
                        const body = (
                            <>
                                <span style={{ color: locColor, flexShrink: 0 }}>{loc}</span>
                                <span style={{ ...ellipsisText, color: token.color.fgMuted, flex: 1, minWidth: 0 }}>{d.message}</span>
                            </>
                        );
                        return d.file && d.line != null
                            ? <button key={i} type="button" onClick={() => onRevealRange(d.file as string, d.line as number)} title="에디터에서 이 위치로 이동" style={rowButton}>{body}</button>
                            : <div key={i} style={{ ...rowButton, cursor: "default" }}>{body}</div>;
                    })}
                    {diags.length > shown.length && <div style={moreNote}>+{diags.length - shown.length}개 더…</div>}
                </div>
            )}
        </div>
    );
};

// ── error / rate-limit banner ─────────────────────────────────────────────
const AgentError: React.FC<{ message: string }> = ({ message }) => {
    const quota = message.startsWith(QUOTA_MARKER);
    const text = quota ? message.slice(QUOTA_MARKER.length) : message;
    if (quota) {
        return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: token.radius.sm, background: token.color.warningSoft, border: `1px solid ${token.color.warningBorder}`, color: token.color.warning, fontSize: token.font.size.fs11, fontFamily: token.font.family.mono, lineHeight: 1.6, wordBreak: "break-word" }}>
                <span style={{ flexShrink: 0, fontSize: token.font.size.fs12 }}>⏳</span>
                <span>{text}</span>
            </div>
        );
    }
    return (
        <div style={{ color: token.color.danger, fontSize: token.font.size.fs11, fontFamily: token.font.family.mono, wordBreak: "break-word" }}>
            오류: {text}
        </div>
    );
};

// ── approval (manual-approve mode) & cancelled ────────────────────────────
const ApprovalView: React.FC<{ part: Part; meta?: ToolMeta; onApprove: () => void; onReject: () => void }> = ({ part, meta, onApprove, onReject }) => {
    const before = meta?.kind === "diff" ? meta.before : "";
    const after = meta?.kind === "diff" ? meta.after : "";
    const diff = useMemo(() => (meta?.kind === "diff" ? diffLines(before, after) : null), [meta?.kind, before, after]);
    const [open, setOpen] = useState(false);
    const name = String(part.type).slice("tool-".length);
    const label = TOOL_LABEL[name] ?? name;
    const path = (part.input?.path ?? part.input?.newPath) as string | undefined;
    const changed = diff ? diff.rows.filter(r => r.type !== "ctx") : [];
    const peek = changed.slice(0, EDIT_PEEK);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "100%", padding: 8, borderRadius: token.radius.sm, background: token.color.bgSubtle, border: `1px solid ${token.color.accentBorder}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: token.font.family.mono, fontSize: token.font.size.fs11, color: token.color.fg }}>
                <span style={{ flexShrink: 0, color: token.color.accent }}>⏸</span>
                <span style={ellipsisText}>승인 대기 · {label}{path ? `: ${path}` : ""}</span>
                {diff && <span style={{ flexShrink: 0, color: token.color.success }}>+{diff.stat.added}</span>}
                {diff && <span style={{ flexShrink: 0, color: token.color.danger }}>−{diff.stat.removed}</span>}
            </div>
            {peek.length > 0 && (
                <div style={{ ...previewBox, cursor: "pointer" }} onClick={() => setOpen(true)} title="전체 변경 내용 보기">
                    {peek.map((r, i) => <DiffLine key={i} row={r} compact />)}
                    {changed.length > peek.length && <div style={moreNote}>… 전체 보기 (변경 {changed.length}줄)</div>}
                </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
                <Button variant="accent" size="sm" onClick={onApprove}>적용</Button>
                <Button variant="secondary" size="sm" onClick={onReject}>취소</Button>
            </div>
            {open && diff && <DiffModal title={label} path={path ?? ""} diff={diff} onClose={() => setOpen(false)} />}
        </div>
    );
};

const CancelledView: React.FC<{ part: Part }> = ({ part }) => {
    const name = String(part.type).slice("tool-".length);
    const label = TOOL_LABEL[name] ?? name;
    const path = (part.input?.path ?? part.input?.newPath) as string | undefined;
    return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%", padding: "3px 8px", fontFamily: token.font.family.mono, fontSize: token.font.size.fs10, color: token.color.fgSubtle }}>
            <span style={{ flexShrink: 0 }}>⊘</span>
            <span style={{ ...ellipsisText, textDecoration: "line-through" }}>{label}{path ? `: ${path}` : ""}</span>
            <span style={{ flexShrink: 0 }}>— 취소됨</span>
        </div>
    );
};

// ── tool dispatcher ───────────────────────────────────────────────────────
const ToolView: React.FC<{ part: Part; toolMeta: Map<string, ToolMeta>; onRevealRange: RevealFn; pendingApprovals: PendingApproval[]; onApprove: (id: string) => void; onReject: (id: string) => void }> = ({ part, toolMeta, onRevealRange, pendingApprovals, onApprove, onReject }) => {
    const id = part.toolCallId as string;
    // Awaiting the user's 적용/취소 (approval mode) — show the gate, not the result.
    if (pendingApprovals.some(p => p.toolCallId === id)) {
        return <ApprovalView part={part} meta={toolMeta.get(id)} onApprove={() => onApprove(id)} onReject={() => onReject(id)} />;
    }
    if (part.output?.cancelled) return <CancelledView part={part} />;
    const name = String(part.type).slice("tool-".length);
    switch (name) {
        case TOOL.readFile:
        case TOOL.readLines:
            return <ReadView part={part} onRevealRange={onRevealRange} />;
        case TOOL.grep:
            return <GrepView part={part} onRevealRange={onRevealRange} />;
        case TOOL.glob:
        case TOOL.listFiles:
            return <PathsView part={part} onRevealRange={onRevealRange} />;
        case TOOL.writeFile:
        case TOOL.editFile:
            return <EditView part={part} meta={toolMeta.get(part.toolCallId)} />;
        case TOOL.checkSyntax:
            return <CheckView part={part} onRevealRange={onRevealRange} />;
        default:
            return <ToolChip part={part} />;
    }
};

const MessageBubble: React.FC<{ message: UIMessage; toolMeta: Map<string, ToolMeta>; onRevealRange: RevealFn; pendingApprovals: PendingApproval[]; onApprove: (id: string) => void; onReject: (id: string) => void }> = ({ message, toolMeta, onRevealRange, pendingApprovals, onApprove, onReject }) => {
    const isUser = message.role === "user";
    const usage = !isUser ? message.metadata?.usage : undefined;
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 4 }}>
            {usage && <UsageBadge usage={usage} />}
            {message.parts.map((part: Part, i: number) => {
                if (part.type === "text") {
                    return isUser ? (
                        <div key={i} style={{ maxWidth: "85%", padding: "7px 10px", borderRadius: token.radius.md, background: token.color.accentSoft, border: `1px solid ${token.color.accentBorder}`, color: token.color.fg, fontSize: token.font.size.fs12, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {part.text}
                        </div>
                    ) : (
                        <div key={i} style={{ maxWidth: "100%", color: token.color.fg, fontSize: token.font.size.fs12, lineHeight: 1.65, wordBreak: "break-word" }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {part.text}
                            </ReactMarkdown>
                        </div>
                    );
                }
                if (typeof part.type === "string" && part.type.startsWith("tool-")) {
                    return <ToolView key={i} part={part} toolMeta={toolMeta} onRevealRange={onRevealRange} pendingApprovals={pendingApprovals} onApprove={onApprove} onReject={onReject} />;
                }
                return null;
            })}
        </div>
    );
};

export const AgentPanel: React.FC<{
    agent: ClangAgent;
    canEdit: boolean;
    onRevealRange: RevealFn;
    attachActiveFile: boolean;
    onToggleAttachActiveFile: (v: boolean) => void;
    modelId: string;
    onChangeModel: (id: string) => void;
    approvalRequired: boolean;
    onToggleApproval: (v: boolean) => void;
}> = ({ agent, canEdit, onRevealRange, attachActiveFile, onToggleAttachActiveFile, modelId, onChangeModel, approvalRequired, onToggleApproval }) => {
    const { messages, sendMessage, status, error, stop, toolMeta, pendingApprovals, approveToolCall, rejectToolCall } = agent;
    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const busy = status === "submitted" || status === "streaming";
    // While an edit awaits 적용/취소, the assistant's tool call is unanswered —
    // block sending a new message until it's resolved.
    const waitingApproval = pendingApprovals.length > 0;

    // Remaining credits ("남은 토큰"), debited server-side per turn. Refetched on
    // mount and whenever a turn settles (busy true → false).
    const [credits, setCredits] = useState<number | null>(null);
    const refreshCredits = useCallback(() => {
        getCredits().then(c => setCredits(c.credits)).catch(() => setCredits(null));
    }, []);
    useEffect(() => { refreshCredits(); }, [refreshCredits]);
    const prevBusyRef = useRef(busy);
    useEffect(() => {
        if (prevBusyRef.current && !busy) refreshCredits();
        prevBusyRef.current = busy;
    }, [busy, refreshCredits]);

    // Keep the transcript pinned to the bottom as it grows / streams.
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages, status, pendingApprovals]);

    const submit = () => {
        const text = input.trim();
        if (!text || busy || waitingApproval) return;
        sendMessage({ text });
        setInput("");
    };

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.length === 0 && (
                    <div style={{ color: token.color.fgSubtle, fontSize: token.font.size.fs11, fontFamily: token.font.family.mono, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                        {"C++ 코드에 대해 질문하거나 수정을 요청하세요.\n예) \"행렬 곱셈을 별도 함수로 분리해줘\""}
                    </div>
                )}
                {messages.map(m => <MessageBubble key={m.id} message={m} toolMeta={toolMeta} onRevealRange={onRevealRange} pendingApprovals={pendingApprovals} onApprove={approveToolCall} onReject={rejectToolCall} />)}
                {error && <AgentError message={error.message} />}
            </div>

            <div style={{ borderTop: `1px solid ${token.color.border}`, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ flexShrink: 0, fontSize: token.font.size.fs10, color: token.color.fgSubtle, fontFamily: token.font.family.mono }}>모델</span>
                    <select
                        value={modelId}
                        onChange={e => onChangeModel(e.target.value)}
                        style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "5px 8px", background: token.color.bg, color: token.color.fg, border: `1px solid ${token.color.border}`, borderRadius: token.radius.sm, fontSize: token.font.size.fs11, fontFamily: token.font.family.sans, outline: "none", cursor: "pointer" }}
                    >
                        {AGENT_PROVIDER_GROUPS.map(g => (
                            <optgroup key={g.provider} label={g.label}>
                                {g.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                            </optgroup>
                        ))}
                    </select>
                    <span
                        title="남은 토큰(크레딧) — 사용량만큼 차감됩니다"
                        style={{ flexShrink: 0, fontSize: token.font.size.fs10, color: token.color.fgSubtle, fontFamily: token.font.family.mono }}
                    >
                        남은 {credits != null ? credits.toLocaleString() : "—"}
                    </span>
                </div>
                {!canEdit && (
                    <div style={{ fontSize: token.font.size.fs10, color: token.color.fgSubtle, fontFamily: token.font.family.mono }}>
                        읽기 전용 — 에이전트가 파일을 수정할 수 없습니다 (질문/설명만 가능).
                    </div>
                )}
                <div
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    title="활성 파일의 상대 경로만 보냅니다. 파일 내용은 전송하지 않으며, 필요하면 에이전트가 read_lines로 직접 읽습니다."
                >
                    <Checkbox checked={attachActiveFile} onChange={onToggleAttachActiveFile} />
                    <span
                        onClick={() => onToggleAttachActiveFile(!attachActiveFile)}
                        style={{ cursor: "pointer", fontSize: token.font.size.fs11, color: token.color.fgMuted, fontFamily: token.font.family.mono, userSelect: "none" }}
                    >
                        활성 파일 경로 첨부
                    </span>
                </div>
                <div
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    title="켜면 에이전트의 파일 변경이 적용 전 승인(적용/취소)을 기다립니다. 끄면 자동 적용됩니다."
                >
                    <Checkbox checked={approvalRequired} onChange={onToggleApproval} />
                    <span
                        onClick={() => onToggleApproval(!approvalRequired)}
                        style={{ cursor: "pointer", fontSize: token.font.size.fs11, color: token.color.fgMuted, fontFamily: token.font.family.mono, userSelect: "none" }}
                    >
                        수정 전 승인 받기
                    </span>
                </div>
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                    }}
                    placeholder="메시지를 입력하세요…  (Enter 전송, Shift+Enter 줄바꿈)"
                    rows={2}
                    style={{ resize: "none", width: "100%", boxSizing: "border-box", padding: "8px 10px", background: token.color.bg, color: token.color.fg, border: `1px solid ${token.color.border}`, borderRadius: token.radius.sm, fontSize: token.font.size.fs12, fontFamily: token.font.family.sans, lineHeight: 1.5, outline: "none" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: token.font.size.fs10, color: token.color.warning, fontFamily: token.font.family.mono }}>
                        {waitingApproval ? "변경 승인 대기 중 — 적용/취소를 먼저 선택하세요" : ""}
                    </span>
                    {busy ? (
                        <Button variant="secondary" size="sm" leading={<Spinner size="sm" />} onClick={() => stop()}>
                            중지
                        </Button>
                    ) : (
                        <Button variant="accent" size="sm" onClick={submit} disabled={!input.trim() || waitingApproval}>
                            보내기
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AgentPanel;
