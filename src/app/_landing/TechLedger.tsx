"use client";

import { Fragment } from "react";

type Row = { label: string; value: string };
type Group = { cat: string; rows: Row[] };

const GROUPS: Group[] = [
    {
        cat: "Frontend",
        rows: [
            { label: "Framework",       value: "Next.js 16.2 · React 19 · TypeScript" },
            { label: "Block coding",    value: "Blockly 12.5.1 · BlockBuilder DSL" },
            { label: "WASM compile",    value: "wabt 1.0.39 · Web Worker" },
            { label: "Tensor",          value: "TensorFlow.js 4.22 + WebGPU backend" },
            { label: "C++ editor",      value: "Monaco · clangd LSP (monaco-vscode-api 25.1)" },
            { label: "Charts",          value: "Plotly.js 3.5" },
            { label: "LaTeX",           value: "KaTeX 0.16 · moo 0.5 lexer" },
            { label: "SSE",             value: "@microsoft/fetch-event-source 2.0" },
        ],
    },
    {
        cat: "Backend · AI Service (port 8000)",
        rows: [
            { label: "Compiler",        value: "C++17 · libclang · Emscripten · MinGW g++" },
            { label: "LLM",             value: "Groq openai/gpt-oss-120b · Ollama gemma3:27b" },
            { label: "Transpiler",      value: "block2py / py2block — bijective AST" },
            { label: "LSP bridge",      value: "clangd ↔ WebSocket (per-session workspace)" },
        ],
    },
    {
        cat: "Backend · Auth Service (port 8001)",
        rows: [
            { label: "Auth",            value: "Google OAuth 2.0 + JWT HS256 cookie · 7d" },
            { label: "DB",              value: "SQLite WAL · yoyo-migrations · slowapi rate limit" },
            { label: "Files",           value: "atomic tmp→replace · disk content + DB metadata" },
            { label: "Recovery",        value: "soft-delete 30d · `recovery_token` cookie 10m" },
        ],
    },
    {
        cat: "External · Compute",
        rows: [
            { label: "ML / GPU",        value: "Meta SAM2 · PyTorch · NVIDIA H100 PCIe (CUDA 12.6)" },
            { label: "Infra",           value: "KSA Turing Server · Jupyter Hub + jupyter-server-proxy 4.4" },
        ],
    },
];

export function TechLedger() {
    return (
        <div style={{ overflowX: "auto" }}>
            <table className="ld-tech">
                <thead>
                    <tr>
                        <th colSpan={2}>Stack · Versions</th>
                    </tr>
                </thead>
                <tbody>
                    {GROUPS.map(g => (
                        <Fragment key={g.cat}>
                            <tr>
                                <td className="cat" colSpan={2}>{g.cat}</td>
                            </tr>
                            {g.rows.map(r => (
                                <tr key={`${g.cat}-${r.label}`}>
                                    <td className="label">{r.label}</td>
                                    <td className="val">{r.value}</td>
                                </tr>
                            ))}
                        </Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
