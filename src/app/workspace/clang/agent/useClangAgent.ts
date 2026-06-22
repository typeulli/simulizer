"use client";
// In-workspace AI agent controller (Vercel AI SDK v6).
//
// Wires `useChat` to the /api/agent/chat proxy and dispatches the model's
// client-side tool calls against the live workspace. The chat instance is never
// recreated — the host's accessors (read/write/context) flow through a ref so
// the transport and tool dispatcher always see fresh state.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";

import { AGENT_API_PATH, TOOL, type AgentContext, type AgentMessageMetadata } from "./tools";
import type { HashedLine, LineEdit } from "./lines";
import type { GrepMatch } from "./search";
import type { CompileDiag } from "./compile";

/** UI message shape carrying the per-turn token usage the route streams back. */
export type AgentUIMessage = UIMessage<AgentMessageMetadata>;

/**
 * UI-only metadata attached to a tool call, keyed by toolCallId. Kept on the
 * client (never sent to the model) so the panel can render a rich preview —
 * e.g. the before/after text of an edit for its diff view.
 */
export type ToolMeta = { kind: "diff"; path: string; before: string; after: string };

/** A modifying tool call awaiting the user's 적용/취소 decision (approval mode). */
export type PendingApproval = { toolCallId: string; tool: string; path?: string };

// read_file / read_lines both return the (line, hash, content) view; `total` is
// the file's line count so the model can widen a range.
export type AgentReadResult = { ok: boolean; total?: number; lines?: HashedLine[]; error?: string };
// before/after carry the pre/post file text for the panel's diff preview; they
// are stored in the client-only tool-meta map, never forwarded to the model.
// `commit` applies the (already-computed) change — called immediately in auto
// mode, or on the user's approval in approval mode. Omitted when there's nothing
// to apply (e.g. a no-op rename).
export type AgentWriteResult = { ok: boolean; error?: string; before?: string; after?: string; commit?: () => void };
export type AgentEditResult = { ok: boolean; lines?: HashedLine[]; error?: string; before?: string; after?: string; commit?: () => void };
export type AgentListResult = { ok: boolean; entry?: string; files?: string[]; error?: string };
export type AgentGlobResult = { ok: boolean; matches?: string[]; error?: string };
export type AgentGrepResult = { ok: boolean; matches?: GrepMatch[]; truncated?: boolean; error?: string };
export type AgentRenameResult = { ok: boolean; error?: string; commit?: () => void };
export type AgentDeleteResult = { ok: boolean; status?: string; error?: string };
export type AgentRunResult = { ok: boolean; result?: string | null; output?: string; error?: string };
// check_syntax: success=true → compile passed; otherwise diagnostics + raw stderr.
export type AgentCheckResult = { ok: boolean; success?: boolean; diagnostics?: CompileDiag[]; output?: string; error?: string };

type Options = {
    /** Live workspace snapshot, attached to every request (drives the prompt). */
    getContext: () => AgentContext;
    /** Selected model id, attached to every request (server resolves the provider). */
    getModel: () => string;
    /** True when file edits must be approved by the user before they apply. */
    getApprovalMode: () => boolean;
    /** list_files tool — every file path + the entry file. */
    listFiles: () => AgentListResult;
    /** glob tool — file paths matching a glob pattern. */
    glob: (pattern: string) => AgentGlobResult;
    /** grep tool — regex content search → {path, line, text} matches. */
    grep: (pattern: string, path?: string, ignoreCase?: boolean) => AgentGrepResult;
    /** read_file tool — whole file as {line, hash, content}[]. */
    readFile: (path: string) => AgentReadResult;
    /** read_lines tool — a (1-based, inclusive) line range as {line, hash, content}[]. */
    readLines: (path: string, start?: number, end?: number) => AgentReadResult;
    /** write_file tool — create/overwrite a text file (collab + permission aware). */
    writeFile: (path: string, content: string) => AgentWriteResult;
    /** edit_file tool — apply hash-addressed line edits (collab + permission aware). */
    editFile: (path: string, edits: LineEdit[]) => AgentEditResult;
    /** rename_file tool — rename/move a file (collab + permission aware). */
    renameFile: (path: string, newPath: string) => AgentRenameResult;
    /** delete_file tool — request deletion (routes through the user confirm modal). */
    deleteFile: (path: string) => AgentDeleteResult;
    /** run tool — compile + execute, resolving with the return value and console output. */
    run: () => Promise<AgentRunResult>;
    /** check_syntax tool — emcc compile-only check; resolves with pass/fail + diagnostics. */
    checkSyntax: () => Promise<AgentCheckResult>;
};

export function useClangAgent(opts: Options) {
    // Stable ref so the (once-created) transport and tool dispatcher always read
    // the freshest accessors without recreating the chat instance.
    const optsRef = useRef(opts);
    useEffect(() => { optsRef.current = opts; }, [opts]);

    // UI-only side channel: rich preview data per tool call (e.g. edit diffs),
    // populated before we reply so the addToolOutput re-render can read it.
    const toolMetaRef = useRef<Map<string, ToolMeta>>(new Map());

    // Approval mode: modifying tool calls awaiting the user's 적용/취소. The
    // resolver map holds the deferred commit/reply for each pending call.
    const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
    const approvalsRef = useRef<Map<string, { approve: () => void; reject: () => void }>>(new Map());

    const transport = useMemo(
        () => new DefaultChatTransport<AgentUIMessage>({
            api: AGENT_API_PATH,
            // Send the auth cookie to our same-origin route so it can forward the
            // user's token to backend-api for the credit check.
            credentials: "include",
            // Attach the live workspace snapshot to EVERY request — the initial
            // user send AND the automatic tool-result continuations — so the
            // system prompt always reflects the current files/diagnostics.
            prepareSendMessagesRequest: ({ messages }) => ({
                body: { messages, context: optsRef.current.getContext(), model: optsRef.current.getModel() },
            }),
        }),
        [],
    );

    // `addToolOutput` is needed inside onToolCall, which only fires after
    // useChat has returned — read it through a ref to dodge the TDZ.
    const addToolOutputRef = useRef<
        ((args: { tool: string; toolCallId: string; output: unknown }) => void) | null
    >(null);

    const chat = useChat<AgentUIMessage>({
        transport,
        // Auto-resubmit once every tool call of the last assistant turn has a
        // result — EXCEPT when the user rejected a change this turn. In that case
        // the cancelled tool result stays in history and is sent with the user's
        // next message instead of auto-continuing now.
        sendAutomaticallyWhen: (options) => {
            if (!lastAssistantMessageIsCompleteWithToolCalls(options)) return false;
            const last = options.messages[options.messages.length - 1];
            const cancelled = last?.parts?.some(p =>
                typeof (p as { type?: string }).type === "string"
                && (p as { type: string }).type.startsWith("tool-")
                && (p as { output?: { cancelled?: boolean } }).output?.cancelled === true);
            return !cancelled;
        },
        async onToolCall({ toolCall }) {
            if (toolCall.dynamic) return;
            const o = optsRef.current;
            const reply = (output: unknown) =>
                addToolOutputRef.current?.({
                    tool: toolCall.toolName,
                    toolCallId: toolCall.toolCallId,
                    output,
                });

            // File-modifying tools route through here. In auto mode the change
            // commits immediately; in approval mode the commit + model reply are
            // deferred until the user clicks 적용/취소 (rejection replies with
            // {cancelled:true}, which stops the auto-continuation above).
            const gateModifying = (
                path: string | undefined,
                commit: (() => void) | undefined,
                successOutput: unknown,
                previewMeta?: ToolMeta,
            ): void | Promise<void> => {
                if (previewMeta) toolMetaRef.current.set(toolCall.toolCallId, previewMeta);
                if (!commit || !o.getApprovalMode()) {
                    commit?.();
                    reply(successOutput);
                    return;
                }
                return new Promise<void>((resolve) => {
                    approvalsRef.current.set(toolCall.toolCallId, {
                        approve: () => { commit(); reply(successOutput); resolve(); },
                        reject: () => { reply({ cancelled: true, message: "사용자가 이 변경 적용을 취소했습니다." }); resolve(); },
                    });
                    setPendingApprovals(prev => [...prev, { toolCallId: toolCall.toolCallId, tool: toolCall.toolName, path }]);
                });
            };

            switch (toolCall.toolName) {
                case TOOL.listFiles: {
                    const r = o.listFiles();
                    reply(r.ok ? { entry: r.entry, files: r.files } : { error: r.error });
                    return;
                }
                case TOOL.glob: {
                    const { pattern } = toolCall.input as { pattern: string };
                    const r = o.glob(pattern);
                    reply(r.ok ? { matches: r.matches } : { error: r.error });
                    return;
                }
                case TOOL.grep: {
                    const { pattern, path, ignoreCase } = toolCall.input as { pattern: string; path?: string; ignoreCase?: boolean };
                    const r = o.grep(pattern, path, ignoreCase);
                    reply(r.ok ? { matches: r.matches, truncated: r.truncated } : { error: r.error });
                    return;
                }
                case TOOL.readFile: {
                    const { path } = toolCall.input as { path: string };
                    const r = o.readFile(path);
                    reply(r.ok ? { total: r.total, lines: r.lines } : { error: r.error });
                    return;
                }
                case TOOL.readLines: {
                    const { path, start, end } = toolCall.input as { path: string; start?: number; end?: number };
                    const r = o.readLines(path, start, end);
                    reply(r.ok ? { total: r.total, lines: r.lines } : { error: r.error });
                    return;
                }
                case TOOL.writeFile: {
                    const { path, content } = toolCall.input as { path: string; content: string };
                    const r = o.writeFile(path, content);
                    if (!r.ok) { reply({ error: r.error }); return; }
                    // Return the updated {hash, content}[]? write returns no lines;
                    // the diff preview lives in toolMeta (UI only).
                    return gateModifying(path, r.commit, { ok: true, message: `${path} 저장 완료` },
                        r.before !== undefined && r.after !== undefined ? { kind: "diff", path, before: r.before, after: r.after } : undefined);
                }
                case TOOL.editFile: {
                    const { path, edits } = toolCall.input as { path: string; edits: LineEdit[] };
                    const r = o.editFile(path, edits);
                    if (!r.ok) { reply({ error: r.error }); return; }
                    // Reply with the updated {hash, content}[] so the model can
                    // chain further edits without re-reading.
                    return gateModifying(path, r.commit, { ok: true, lines: r.lines },
                        r.before !== undefined && r.after !== undefined ? { kind: "diff", path, before: r.before, after: r.after } : undefined);
                }
                case TOOL.renameFile: {
                    const { path, newPath } = toolCall.input as { path: string; newPath: string };
                    const r = o.renameFile(path, newPath);
                    if (!r.ok) { reply({ error: r.error }); return; }
                    return gateModifying(newPath, r.commit, { ok: true });
                }
                case TOOL.deleteFile: {
                    const { path } = toolCall.input as { path: string };
                    const r = o.deleteFile(path);
                    reply(r.ok ? { ok: true, status: r.status } : { error: r.error });
                    return;
                }
                case TOOL.checkSyntax: {
                    const r = await o.checkSyntax();
                    reply(r.ok
                        ? { success: r.success, diagnostics: r.diagnostics ?? [], output: (r.output ?? "").slice(0, 4000) }
                        : { error: r.error });
                    return;
                }
                case TOOL.run: {
                    const r = await o.run();
                    reply(r.ok ? { result: r.result ?? null, output: r.output ?? "" } : { error: r.error, output: r.output });
                    return;
                }
                case TOOL.build:
                    reply({ status: "not_implemented", message: "빌드(build) 기능은 아직 구현되지 않았습니다 (placeholder)." });
                    return;
            }
        },
    });
    addToolOutputRef.current = chat.addToolOutput;

    const approveToolCall = useCallback((id: string) => {
        const entry = approvalsRef.current.get(id);
        if (!entry) return;
        approvalsRef.current.delete(id);
        setPendingApprovals(prev => prev.filter(p => p.toolCallId !== id));
        entry.approve();
    }, []);
    const rejectToolCall = useCallback((id: string) => {
        const entry = approvalsRef.current.get(id);
        if (!entry) return;
        approvalsRef.current.delete(id);
        setPendingApprovals(prev => prev.filter(p => p.toolCallId !== id));
        entry.reject();
    }, []);

    // Expose the UI-only tool-meta map + pending-approval controls alongside the
    // chat helpers. Re-spread each render is fine — refs are stable.
    return { ...chat, toolMeta: toolMetaRef.current, pendingApprovals, approveToolCall, rejectToolCall };
}

export type ClangAgent = ReturnType<typeof useClangAgent>;
