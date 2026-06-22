// Shared definitions for the in-workspace AI agent (Vercel AI SDK).
//
// Imported by BOTH the browser (useClangAgent / AgentPanel) and the server
// route (api/agent/chat). Keep it free of the `ai` package and DOM imports so
// it stays isomorphic — only zod (schemas) and plain types live here.

import { z } from "zod";

/** Route that proxies the model call (holds the provider keys server-side). */
export const AGENT_API_PATH = "/api/agent/chat";

/** Prefix the chat route stamps on quota / credit errors so the panel shows them distinctly. */
export const QUOTA_MARKER = "__QUOTA__";

/** Tool names — shared so the client dispatcher and server schemas can't drift. */
export const TOOL = {
    listFiles: "list_files",
    glob: "glob",
    grep: "grep",
    readFile: "read_file",
    readLines: "read_lines",
    writeFile: "write_file",
    editFile: "edit_file",
    renameFile: "rename_file",
    deleteFile: "delete_file",
    checkSyntax: "check_syntax",
    run: "run",
    build: "build",
} as const;

export type ToolName = (typeof TOOL)[keyof typeof TOOL];

// Tool schemas WITHOUT an `execute` — every tool runs client-side in the
// browser. The route wraps these with `tool()` and never executes them; the
// SDK forwards each call to the client, which replies via `addToolOutput`.
export const AGENT_TOOLS = {
    [TOOL.listFiles]: {
        description: "List every file path in the workspace, plus the entry file.",
        inputSchema: z.object({}),
    },
    [TOOL.glob]: {
        description: "Find file paths by glob pattern. Supports `**` (across directories), `*` (within a segment), `?` (one char). e.g. **/*.hpp, src/*.cpp",
        inputSchema: z.object({
            pattern: z.string().describe("glob pattern (e.g. **/*.hpp)"),
        }),
    },
    [TOOL.grep]: {
        description: "Regex-search text file contents, returning {path, line, text} matches. Prefer this to locate code.",
        inputSchema: z.object({
            pattern: z.string().describe("regex pattern"),
            path: z.string().optional().describe("limit the search to this one file (omit to search all text files)"),
            ignoreCase: z.boolean().optional().describe("case-insensitive (default false)"),
        }),
    },
    [TOOL.readFile]: {
        description:
            "Read a whole text file as a (line, hash, content) array. For a large file, prefer read_lines to read only the range you need. " +
            "Each hash addresses that line in edit_file.",
        inputSchema: z.object({
            path: z.string().describe("workspace-relative path (e.g. main.cpp, src/util.hpp)"),
        }),
    },
    [TOOL.readLines]: {
        description:
            "Read a given line range of a text file as a (line, hash, content) array. Prefer this over read_file when reading a file " +
            "— reading only the needed range saves tokens. start/end are 1-based and inclusive; omit both to read the whole file. " +
            "Each hash is based on (line number + content), so it goes stale when the file changes, and addresses that line in edit_file.",
        inputSchema: z.object({
            path: z.string().describe("workspace-relative path"),
            start: z.number().int().optional().describe("start line (1-based, inclusive); default 1"),
            end: z.number().int().optional().describe("end line (1-based, inclusive); default end of file"),
        }),
    },
    [TOOL.writeFile]: {
        description:
            "Create a file or overwrite its entire contents. Text files only (.cpp/.hpp/.json); always pass the full file content. " +
            "To change only part of an existing file, use edit_file instead of write_file.",
        inputSchema: z.object({
            path: z.string().describe("workspace-relative path"),
            content: z.string().describe("the file's new full contents"),
        }),
    },
    [TOOL.editFile]: {
        description:
            "Precisely edit an existing text file by line. First get each line's hash via read_lines, then specify edits by those hashes. " +
            "Each edit targets a line by hash and chooses an action via op (default replace). " +
            "All hashes must come from the same read_lines snapshot; if applying fails, re-read with read_lines and retry with fresh hashes.",
        inputSchema: z.object({
            path: z.string().describe("workspace-relative path"),
            edits: z.array(z.object({
                hash: z.string().describe("hash of the target/anchor line, from read_lines"),
                op: z.enum(["replace", "delete", "insert_after", "insert_before"]).optional()
                    .describe("default replace. delete=remove the line, insert_after/before=insert a new line after/before it"),
                content: z.string().optional().describe("new line content — required for replace/insert, omit for delete"),
            })).min(1).describe("line edits to apply (each addressed by an original-snapshot hash)"),
        }),
    },
    [TOOL.renameFile]: {
        description: "Rename a file or move it to another folder. Creates newPath's folder if it doesn't exist.",
        inputSchema: z.object({
            path: z.string().describe("existing file path"),
            newPath: z.string().describe("new file path (rename or move target)"),
        }),
    },
    [TOOL.deleteFile]: {
        description: "Request file deletion — the user gets a confirm dialog and must approve before it actually deletes. The entry file can't be deleted.",
        inputSchema: z.object({
            path: z.string().describe("path of the file to delete"),
        }),
    },
    [TOOL.checkSyntax]: {
        description:
            "Compile the whole project with emcc to check for syntax/compile errors only (does not run it). " +
            "success=true means it compiled; false puts a {file, line, column, severity, message} error list in diagnostics, " +
            "plus the raw compiler output. After editing files, always finish by checking this passes.",
        inputSchema: z.object({}),
    },
    [TOOL.run]: {
        description:
            "Compile and run the project, returning its return value (result) and console output (output). " +
            "A program needing standard input (sim_input) may block waiting for user input.",
        inputSchema: z.object({}),
    },
    [TOOL.build]: {
        description: "Build the project into an executable. (placeholder, not implemented yet)",
        inputSchema: z.object({}),
    },
} as const;

/** A single diagnostic surfaced from clangd, passed to the model for context. */
export type AgentDiagnostic = {
    line: number;
    column: number;
    severity: string;
    message: string;
};

/** Per-assistant-message metadata streamed back from the route (token usage). */
export type AgentMessageMetadata = {
    usage?: { input: number; output: number; total: number };
};

/** Snapshot of the workspace attached to every request (drives the system prompt). */
export type AgentContext = {
    entry: string;
    /** Active file's relative path, or "" when the user opts out of sending it. */
    activeFile: string;
    files: string[];
    diagnostics: AgentDiagnostic[];
};

// ── Models ──────────────────────────────────────────────────────────────────
// Selectable chat models, classified by provider. Shared so the client picker
// and the server's provider resolver use the same list (a model id the server
// doesn't recognize falls back to DEFAULT_MODEL_ID — no arbitrary model use).

export type AgentProvider = "openai" | "google" | "ollama";

export type AgentModel = { id: string; label: string; provider: AgentProvider };

export const AGENT_PROVIDER_GROUPS: { provider: AgentProvider; label: string; models: AgentModel[] }[] = [
    {
        provider: "openai",
        label: "OpenAI · GPT",
        models: [
            { id: "gpt-4o", label: "GPT-4o", provider: "openai" },
            { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "openai" },
            { id: "gpt-4.1", label: "GPT-4.1", provider: "openai" },
            { id: "gpt-4.1-mini", label: "GPT-4.1 mini", provider: "openai" },
        ],
    },
    {
        provider: "google",
        label: "Google · Gemini",
        models: [
            { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google" },
            { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google" },
            { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "google" },
        ],
    },
    {
        provider: "ollama",
        label: "Ollama · Local",
        models: [
            { id: "gemma4:e4b", label: "Gemma 4 (e4b)", provider: "ollama" },
        ],
    },
];

export const AGENT_MODELS: AgentModel[] = AGENT_PROVIDER_GROUPS.flatMap(g => g.models);

export const DEFAULT_MODEL_ID = "gpt-4o";

export function findAgentModel(id: string | undefined): AgentModel | undefined {
    return AGENT_MODELS.find(m => m.id === id);
}
