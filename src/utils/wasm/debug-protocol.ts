// Shared debug protocol between the Clang Web Worker and the workspace UI.
//
// Mirrors the "rich sidecar" emitted by the backend instrumentation pass
// (backend-api/debug/instrument.py) and defines the DAP-flavoured messages the
// worker and main thread exchange to drive an in-app source-level debugger for
// the user's own C++ (compiled to instrumented, Asyncify-enabled WASM).

// ── Sidecar (matches instrument.py output) ──────────────────────────────────

export interface SidecarFunction { id: number; name: string; file: number; line: number; }
export interface SidecarLocation { id: number; file: number; line: number; }
export interface SidecarVariable { id: number; func: number; name: string; type: number; line: number; }
export interface SidecarField { name: string; offset: number; type: number; }

export interface StlInfo { kind: "vector" | "string"; elem?: number; }

export type SidecarType =
    | { id: number; name: string; size: number; kind: "scalar"; scalar: string }
    | { id: number; name: string; size: number; kind: "pointer"; pointee: number }
    | { id: number; name: string; size: number; kind: "array"; elem: number; count: number }
    | { id: number; name: string; size: number; kind: "record"; fields: SidecarField[]; stl?: StlInfo }
    | { id: number; name: string; size: number; kind: "unknown" };

export interface Sidecar {
    version: number;
    files: string[];                 // file_id -> project-relative path
    functions: SidecarFunction[];
    locations: SidecarLocation[];
    variables: SidecarVariable[];
    types: SidecarType[];
}

// ── UI-facing debug data ────────────────────────────────────────────────────

export interface DebugFrame {
    id: number;        // 0 = innermost (currently executing)
    name: string;      // function name
    file: string;      // project-relative path
    line: number;
    scopeRef: number;  // variablesReference for this frame's locals
}

export interface DebugVariable {
    name: string;
    value: string;
    type: string;
    variablesReference: number;  // 0 = leaf, >0 = expandable via dbg-getVariables
    setId?: number;              // >0 = editable scalar; write via dbg-setVariable
}

export type StopReason = "breakpoint" | "step" | "entry" | "pause";

export interface BreakpointReq { file: string; line: number; }

// ── Control: main thread -> worker ──────────────────────────────────────────

export type DebugInMsg =
    | { type: "debug"; wasmBuffer: ArrayBuffer; sidecar: Sidecar; breakpoints: BreakpointReq[] }
    | { type: "dbg-setBreakpoints"; breakpoints: BreakpointReq[] }
    | { type: "dbg-continue" }
    | { type: "dbg-stepOver" }
    | { type: "dbg-stepInto" }
    | { type: "dbg-stepOut" }
    | { type: "dbg-stop" }
    | { type: "dbg-getVariables"; requestId: number; variablesReference: number }
    | { type: "dbg-evaluate"; requestId: number; frameId: number; expression: string }
    | { type: "dbg-setVariable"; requestId: number; setId: number; value: string };

// ── Events / replies: worker -> main thread ─────────────────────────────────

export type DebugOutMsg =
    | { type: "dbg-stopped"; reason: StopReason; file: string; line: number; frames: DebugFrame[] }
    | { type: "dbg-terminated"; value?: string }
    | { type: "dbg-variables"; requestId: number; variables: DebugVariable[] }
    | { type: "dbg-evaluate"; requestId: number; result: string | null }
    | { type: "dbg-setVariable"; requestId: number; ok: boolean; value?: string; error?: string }
    | { type: "dbg-error"; message: string };
