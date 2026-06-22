// Server-side relay for the in-workspace AI agent.
//
// This route runs the Vercel AI SDK (tool loop, streaming) but points the
// provider `baseURL` at backend-api, so the actual provider traffic + credit
// gating happen there. It forwards the user's own `token` cookie as the
// credential — backend-api/agent authorizes by that token (no service secret
// here). Tools are declared WITHOUT an `execute`, so the SDK forwards each tool
// call to the browser.

import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import {
    AGENT_TOOLS,
    TOOL,
    DEFAULT_MODEL_ID,
    QUOTA_MARKER,
    findAgentModel,
    type AgentContext,
} from "@/app/workspace/clang/agent/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

// backend-api base (server-side reachable). The agent proxy lives at /agent.
// Must share the same auth realm as the login (NEXT_PUBLIC_AUTH_URL): keep it
// pointed at the backend-api whose auth server issued the user's token.
const BACKEND = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/** Pull the auth `token` cookie out of the incoming request to forward upstream. */
function readToken(req: Request): string | null {
    const cookie = req.headers.get("cookie") ?? "";
    const m = cookie.match(/(?:^|;\s*)token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

// Map a streaming error to the client-facing message. backend-api returns 402
// when the USER is out of credits → quota banner; 5xx when the server's own
// provider fails (incl. its quota) → plain Internal error; 401 → sign-in.
function describeStreamError(error: unknown): string {
    const apiErr = APICallError.isInstance(error) ? error : undefined;
    const sc = apiErr?.statusCode;
    if (sc === 402) return `${QUOTA_MARKER}크레딧(토큰)이 부족합니다. 충전 후 다시 시도해주세요.`;
    if (sc === 401) return `${QUOTA_MARKER}인증에 실패했습니다 (토큰이 유효하지 않음). 로그인한 인증 서버와 에이전트 백엔드가 같은지 확인하세요.`;
    if (sc !== undefined && sc >= 500) return "내부 오류가 발생했습니다 (Internal error). 잠시 후 다시 시도해주세요.";
    return error instanceof Error ? error.message : String(error);
}

// Static instructions only — no per-request data. Keeping this (and the tool
// definitions) byte-identical across requests lets OpenAI prompt caching
// discount the whole prefix. The volatile workspace snapshot is injected as a
// trailing message instead (see buildContextBlock), so it never invalidates the
// cached prefix.
const SYSTEM_PROMPT = [
    "You are a coding assistant embedded in the Simulizer C++ workspace, which compiles C++ to WebAssembly and runs it in the browser.",
    "Reply in the language the user asked in (usually Korean), concisely. Use Markdown; write short code (function/type/var names, file paths) inline with single backticks, and use triple-backtick blocks only for multi-line code — never for short identifiers.",
    "No stdout/stdin: printf, std::printf, puts, std::cout, std::cin, and scanf produce no visible output — never use them. Do all I/O, math, and visualization through `simstd.hpp` helpers. To use ANY simstd helper you must explicitly write `#include \"simstd.hpp\"` at the top of the source yourself — it is not included automatically, so a file that uses a helper without that include will fail to compile.",
    "simstd helpers: output/log = debug_log (overloads: int, double, vec2, vec3, array(ptr,cap), Tensor); matrix view = show_mat(Tensor<f64>&); array graph = graph_arr_f64/graph_arr_i32; progress bar = debug_bar/debug_bar_set; input = sim_input_int()/sim_input_float(); random = sim_rand()/sim_rand_int(lo,hi)/sim_rand_range(lo,hi); matrix = matrix_create/identity/matmul/transpose/inverse/det/trace; tensor = Tensor<f64>, tensor_uniform, tensor_normal, tensor_grad/curl/lapl; vectors = vec2/vec3 with vec2_dot etc. simstd.hpp resolves on the include path (you still must `#include \"simstd.hpp\"` yourself) but is NOT in the file list — don't try to read it; trust these names.",
    "Entry point is `int worker()`, not main() — never define main(); put your code in worker() (the runtime calls it).",
    "The workspace snapshot (entry/active file, file list, diagnostics) is appended as the final system message every request. Active-file content is NOT included — read it with read_lines when needed.",
    "Call tools immediately; never just announce one ('let me check/read/edit…') and end the turn. While tool calls remain, keep calling — end with a final answer only when no tool is left to call. Keep the user's original goal even when a tool fails or returns an error: read the error, fix the arguments, retry, and continue — never drop the goal or restart by asking what to do.",
    "Finding code: grep (content), glob (name pattern), list_files (all). rename_file renames/moves; delete_file deletes (prompts the user to confirm).",
    "Reading: prefer read_lines (a line range) over read_file (the whole file) to save tokens; both return lines as (line, hash, content), and you address edits by that hash.",
    "Editing: to change part of a file, prefer edit_file — read_lines for the hashes, then pass {hash, op, content} edits. Use write_file only to create a file or fully replace one, and always send the COMPLETE content in a single call (a truncated argument is an invalid tool call and fails); if it would be too long, write a minimal skeleton with write_file then fill it in via read_lines + edit_file. Hashes are based on (line number + content) and go stale when the file changes — if edit_file fails with an unknown hash, re-read with read_lines and retry.",
    "Any turn that used a file-modifying tool (write_file/edit_file/rename_file/delete_file) must call check_syntax (emcc compile check) before finishing; if success=false, inspect with read_lines, fix with edit_file, and re-check until it passes. Skip check_syntax for pure questions with no edits.",
    "build is a placeholder (returns not-implemented); call run only when the user explicitly asks to run.",
    "If a file-change tool returns {cancelled:true}, the user rejected applying it (it was NOT applied) — don't silently retry; wait for the user's next message to re-read their intent.",
].join("\n");

// The volatile per-request snapshot, rendered as a trailing system message so
// the cached prefix above stays stable. No file content — paths + diagnostics
// only. Returns null when there's nothing to add.
function buildContextBlock(ctx?: AgentContext): string | null {
    if (!ctx) return null;
    const lines: string[] = ["── 현재 워크스페이스 ──", `진입 파일: ${ctx.entry}`];
    if (ctx.activeFile) lines.push(`활성 파일: ${ctx.activeFile}`);
    if (ctx.files.length) lines.push(`파일 목록: ${ctx.files.join(", ")}`);
    if (ctx.diagnostics.length) {
        lines.push("진단(diagnostics):");
        for (const d of ctx.diagnostics.slice(0, 30)) {
            const loc = ctx.activeFile ? `${ctx.activeFile}:${d.line}:${d.column}` : `${d.line}:${d.column}`;
            lines.push(`  ${loc} [${d.severity}] ${d.message}`);
        }
    }
    return lines.join("\n");
}

// Wrap the shared schemas with `tool()`; no `execute` → client-side execution.
// Built explicitly per tool (not via a dynamic map) so each `tool()` infers its
// own concrete input schema instead of the widened union.
const TOOLS = {
    [TOOL.listFiles]: tool(AGENT_TOOLS[TOOL.listFiles]),
    [TOOL.glob]: tool(AGENT_TOOLS[TOOL.glob]),
    [TOOL.grep]: tool(AGENT_TOOLS[TOOL.grep]),
    [TOOL.readFile]: tool(AGENT_TOOLS[TOOL.readFile]),
    [TOOL.readLines]: tool(AGENT_TOOLS[TOOL.readLines]),
    [TOOL.writeFile]: tool(AGENT_TOOLS[TOOL.writeFile]),
    [TOOL.editFile]: tool(AGENT_TOOLS[TOOL.editFile]),
    [TOOL.renameFile]: tool(AGENT_TOOLS[TOOL.renameFile]),
    [TOOL.deleteFile]: tool(AGENT_TOOLS[TOOL.deleteFile]),
    [TOOL.checkSyntax]: tool(AGENT_TOOLS[TOOL.checkSyntax]),
    [TOOL.run]: tool(AGENT_TOOLS[TOOL.run]),
    [TOOL.build]: tool(AGENT_TOOLS[TOOL.build]),
};

export async function POST(req: Request) {
    if (!BACKEND) {
        return Response.json(
            { error: "Agent backend is not configured (NEXT_PUBLIC_API_URL)." },
            { status: 500 },
        );
    }

    const { messages, context, model: modelId } = (await req.json()) as {
        messages: UIMessage[];
        context?: AgentContext;
        model?: string;
    };

    const entry = findAgentModel(modelId) ?? findAgentModel(DEFAULT_MODEL_ID)!;
    const token = readToken(req);

    // OpenAI-compatible provider pointed at backend-api. The user's auth cookie
    // is forwarded as the credential; apiKey is a placeholder (backend-api
    // ignores the Authorization header). backend-api routes to the real upstream
    // (OpenAI / Google) by model id.
    const provider = createOpenAI({
        baseURL: `${BACKEND}/agent/v1`,
        apiKey: "user-cookie-auth",
        headers: token ? { Cookie: `token=${token}` } : {},
    });
    const model = provider.chat(entry.id);

    const modelMessages = await convertToModelMessages(messages);
    const ctxBlock = buildContextBlock(context);

    // Inject the volatile workspace snapshot. For OpenAI, a TRAILING system
    // message keeps the cached prefix (SYSTEM_PROMPT + TOOLS + append-only
    // conversation) stable so prompt caching can discount it. Gemini (proxied
    // through the same endpoint) rejects any non-leading system message, so
    // there we fold it into the system instruction instead.
    let system = SYSTEM_PROMPT;
    if (ctxBlock) {
        if (entry.provider === "openai") modelMessages.push({ role: "system", content: ctxBlock });
        else system = `${SYSTEM_PROMPT}\n\n${ctxBlock}`;
    }

    const result = streamText({
        model,
        system,
        messages: modelMessages,
        tools: TOOLS,
        // Cap output generously so a full-file write_file isn't truncated
        // mid-argument — a truncated tool call yields invalid input (missing
        // `path`) which poisons the history. Maps to max_tokens downstream
        // (OpenAI / Gemini / Ollama num_predict).
        maxOutputTokens: 8192,
        // Let the model chain tool calls before answering — enough headroom for
        // an edit → check_syntax → fix → re-check loop.
        stopWhen: stepCountIs(12),
    });

    return result.toUIMessageStreamResponse({
        // Attach per-message token usage so the chat UI can show how many tokens
        // each assistant turn cost. Fires on `finish` with the step-aggregated usage.
        messageMetadata: ({ part }) =>
            part.type === "finish"
                ? {
                    usage: {
                        input: part.totalUsage.inputTokens ?? 0,
                        output: part.totalUsage.outputTokens ?? 0,
                        total: part.totalUsage.totalTokens ?? 0,
                    },
                }
                : undefined,
        // Surface the real error to the panel (default masks it), tagging rate
        // limits so they render distinctly.
        onError: describeStreamError,
    });
}
