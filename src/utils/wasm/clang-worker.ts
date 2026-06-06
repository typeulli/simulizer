import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgpu";
import {
    js_tensor_create_with_shape,
    js_tensor_random_with_shape,
    js_tensor_add,
    js_tensor_sub,
    js_tensor_matmul,
    js_tensor_neg,
    js_tensor_elemul,
    js_tensor_scale,
    js_tensor_save,
    js_tensor_set,
    js_tensor_get,
    js_tensor_toString,
    js_tensor_get_mat_data,
    js_tensor_get_field_data,
    js_tensor_debug,
    js_tensor_shape,
    js_tensor_perlin,
    js_tensor_clone,
    js_tensor_dispose,
    js_tensor_reset,
    js_matrix_create,
    js_matrix_matmul,
    js_matrix_transpose,
    js_matrix_inverse,
    js_matrix_det,
    js_matrix_trace,
    js_matrix_identity,
} from "./tensor";
import type { WorkerOutMsg } from "./wasm-worker";
import type {
    Sidecar, SidecarType, DebugInMsg, DebugOutMsg, DebugFrame, DebugVariable,
    BreakpointReq, StopReason,
} from "./debug-protocol";

export type ClangWorkerInMsg =
    | { type: "init" }
    | { type: "run"; wasmBuffer: ArrayBuffer }
    | { type: "switch-backend"; backend: string }
    | DebugInMsg;

function post(msg: WorkerOutMsg) {
    self.postMessage(msg);
}

function postDbg(msg: DebugOutMsg) {
    self.postMessage(msg);
}

let tfReady = false;
const tfReadyPromise = (async () => {
    for (const backend of ["webgpu", "webgl", "cpu"] as const) {
        try {
            const ok = await tf.setBackend(backend);
            if (!ok) continue;
            await tf.ready();
            tfReady = true;
            return;
        } catch { /* try next */ }
    }
    tfReady = true;
})();

let barIdCounter = 0;
let holderCounter = 1;
let currentHolderId = 0;
let wasmMemory: WebAssembly.Memory | null = null;

// stdout/stderr line buffers (module-level so the run/debug paths can flush any
// trailing partial line — output without a final newline — at termination).
let stdoutBuf = "";
let stderrBuf = "";
function flushStdioTail() {
    if (stdoutBuf) { post({ type: "log", holderId: currentHolderId, kind: "info", text: stdoutBuf }); stdoutBuf = ""; }
    if (stderrBuf) { post({ type: "log", holderId: currentHolderId, kind: "error", text: stderrBuf }); stderrBuf = ""; }
}

function log(text: string) {
    post({ type: "log", holderId: currentHolderId, kind: "info", text });
}

function load_raw_i32(ptr: number, cap: number): number[] {
    if (!wasmMemory) return [];
    return Array.from(new Int32Array(wasmMemory.buffer, ptr, cap));
}
function load_raw_f64(ptr: number, cap: number): number[] {
    if (!wasmMemory) return [];
    return Array.from(new Float64Array(wasmMemory.buffer, ptr, cap));
}

function buildEnvImports(): Record<string, unknown> {
    return {
        __sim_log_i32: (val: number) => log(`🔍 log: ${val}`),
        __sim_log_f64: (val: number) => log(`🔍 log: ${val}`),
        __sim_log_vec2: (x: number, y: number) => log(`📐 vec2(${x}, ${y})`),
        __sim_log_vec3: (x: number, y: number, z: number) => log(`📦 vec3(${x}, ${y}, ${z})`),
        __sim_log_arr_i32: (ptr: number, cap: number) => log(`📚 [${load_raw_i32(ptr, cap).join(", ")}]`),
        __sim_log_arr_f64: (ptr: number, cap: number) => log(`📚 [${load_raw_f64(ptr, cap).join(", ")}]`),
        __sim_log_tensor: (id: number) => log(`🧠 ${js_tensor_toString(id)}`),

        __sim_debug_bar: (mn: number, mx: number): number => {
            const id = ++barIdCounter;
            post({ type: "bar_create", barId: id, min: mn, max: mx });
            return id;
        },
        __sim_debug_bar_set: (barId: number, val: number) => {
            post({ type: "bar_set", barId, val });
        },
        __sim_debug_series: (): number => {
            const id = holderCounter++;
            post({ type: "holder_create", holderId: id, kind: "series" });
            return id;
        },
        __sim_debug_set_holder: (id: number) => { currentHolderId = id; },
        __sim_show_mat: (tensorId: number) => {
            const holderId = currentHolderId;
            const field = js_tensor_get_field_data(tensorId);
            if (field) {
                post({ type: "visual_vec", holderId, dx: Array.from(field.dx), dy: Array.from(field.dy), rows: field.rows, cols: field.cols });
                return;
            }
            const mat = js_tensor_get_mat_data(tensorId);
            if (mat) post({ type: "visual", holderId, data: Array.from(mat.data), rows: mat.rows, cols: mat.cols });
        },

        __sim_graph_arr_i32: (ptr: number, cap: number) =>
            post({ type: "graph_array", holderId: currentHolderId, data: load_raw_i32(ptr, cap) }),
        __sim_graph_arr_f64: (ptr: number, cap: number) =>
            post({ type: "graph_array", holderId: currentHolderId, data: load_raw_f64(ptr, cap) }),
        __sim_graph_arr_range_i32: (ptr: number, cap: number, mn: number, mx: number) =>
            post({ type: "graph_array", holderId: currentHolderId, data: load_raw_i32(ptr, cap), fixedMin: mn, fixedMax: mx }),
        __sim_graph_arr_range_f64: (ptr: number, cap: number, mn: number, mx: number) =>
            post({ type: "graph_array", holderId: currentHolderId, data: load_raw_f64(ptr, cap), fixedMin: mn, fixedMax: mx }),

        __sim_tensor_create: (varid: number, ptr: number, dim: number) =>
            js_tensor_create_with_shape(varid, load_raw_i32(ptr, dim)),
        __sim_tensor_random: (varid: number, distType: number, p1: number, p2: number, ptr: number, dim: number) =>
            js_tensor_random_with_shape(varid, distType, p1, p2, load_raw_i32(ptr, dim)),
        __sim_tensor_add: js_tensor_add,
        __sim_tensor_sub: js_tensor_sub,
        __sim_tensor_matmul: js_tensor_matmul,
        __sim_tensor_neg: js_tensor_neg,
        __sim_tensor_elemul: js_tensor_elemul,
        __sim_tensor_scale: js_tensor_scale,
        __sim_tensor_save: js_tensor_save,
        __sim_tensor_set: js_tensor_set,
        __sim_tensor_get: js_tensor_get,
        __sim_tensor_perlin: js_tensor_perlin,
        __sim_tensor_clone: js_tensor_clone,
        __sim_tensor_dispose: js_tensor_dispose,
        __sim_matrix_create: js_matrix_create,
        __sim_matrix_matmul: js_matrix_matmul,
        __sim_matrix_transpose: js_matrix_transpose,
        __sim_matrix_inverse: js_matrix_inverse,
        __sim_matrix_det: js_matrix_det,
        __sim_matrix_trace: js_matrix_trace,
        __sim_matrix_identity: js_matrix_identity,
    };
}

// WASI `_start` doesn't return — it calls `proc_exit(code)` after main.
// Throw a typed sentinel so the run handler can distinguish clean termination
// from a real crash.
class ProcExit extends Error {
    constructor(public readonly code: number) {
        super(`proc_exit(${code})`);
    }
}

// Minimal WASI imports — STANDALONE_WASM compiles libc with WASI ABI;
// fd_write powers printf/cout, the rest are no-op stubs.
function buildWasiImports(): Record<string, unknown> {
    const textDecoder = new TextDecoder("utf-8");

    const flushLine = (buf: string, kind: "info" | "error"): string => {
        const lines = buf.split("\n");
        for (let i = 0; i < lines.length - 1; i++) {
            post({ type: "log", holderId: currentHolderId, kind, text: lines[i] });
        }
        return lines[lines.length - 1];
    };

    return {
        fd_write: (fd: number, iovs_ptr: number, iovs_len: number, nwritten_ptr: number): number => {
            if (!wasmMemory) return 28; // EINVAL
            const view = new DataView(wasmMemory.buffer);
            const bytes = new Uint8Array(wasmMemory.buffer);
            let total = 0;
            let text = "";
            for (let i = 0; i < iovs_len; i++) {
                const ptr = view.getUint32(iovs_ptr + i * 8, true);
                const len = view.getUint32(iovs_ptr + i * 8 + 4, true);
                text += textDecoder.decode(bytes.subarray(ptr, ptr + len));
                total += len;
            }
            view.setUint32(nwritten_ptr, total, true);
            if (fd === 1)      stdoutBuf = flushLine(stdoutBuf + text, "info");
            else if (fd === 2) stderrBuf = flushLine(stderrBuf + text, "error");
            return 0;
        },
        proc_exit: (code: number) => {
            throw new ProcExit(code);
        },
        random_get: (buf: number, len: number): number => {
            if (!wasmMemory) return 28;
            const view = new Uint8Array(wasmMemory.buffer, buf, len);
            crypto.getRandomValues(view);
            return 0;
        },
        clock_time_get: (_id: number, _precision: bigint, time_ptr: number): number => {
            if (!wasmMemory) return 28;
            const view = new DataView(wasmMemory.buffer);
            const nowNs = BigInt(Date.now()) * BigInt(1_000_000);
            view.setBigUint64(time_ptr, nowNs, true);
            return 0;
        },
        environ_sizes_get: (count_ptr: number, size_ptr: number): number => {
            if (!wasmMemory) return 28;
            const view = new DataView(wasmMemory.buffer);
            view.setUint32(count_ptr, 0, true);
            view.setUint32(size_ptr, 0, true);
            return 0;
        },
        environ_get: () => 0,
        args_sizes_get: (count_ptr: number, size_ptr: number): number => {
            if (!wasmMemory) return 28;
            const view = new DataView(wasmMemory.buffer);
            view.setUint32(count_ptr, 0, true);
            view.setUint32(size_ptr, 0, true);
            return 0;
        },
        args_get: () => 0,
        fd_close: () => 0,
        fd_seek: () => 0,
        fd_read: () => 0,
        fd_fdstat_get: () => 0,
    };
}

// ── Debug session ───────────────────────────────────────────────────────────
//
// Drives the instrumented, Asyncify-enabled Debug wasm. The four __sim_dbg_*
// hooks feed a shadow call stack; __sim_dbg_line is the pause point. To pause we
// manually start an Asyncify *unwind* (returns control to JS while preserving the
// C stack), and to resume we *rewind* back into the hook. While paused the worker
// idles in its event loop, so memory is stable and we read locals straight from
// linear memory using the sidecar's type layout.
//
// Note: in "continue" mode __sim_worker_entry() runs synchronously to the next
// breakpoint (or completion), so control messages are only serviced while paused.
// A runaway program is stopped by terminating the worker from the main thread.

const ASYNCIFY_STACK_BYTES = 1 << 20; // 1 MiB region for saved frame state

// simulizer's Tensor<T> (and matrices, which are 2D Tensor<f64>) gets a custom
// pretty-printer that bridges to the TF.js registry. Match the canonical type
// name (e.g. "Tensor<double>") without false-positiving on "MyTensor<...>".
function isTensorType(name: string): boolean {
    return /\bTensor</.test(name);
}

function fmtNum(x: number): string {
    if (!Number.isFinite(x)) return String(x);
    return Number.isInteger(x) ? String(x) : String(+x.toFixed(6));
}

type RefEntry =
    | { kind: "scope"; frameIndex: number }
    | { kind: "value"; addr: number; typeId: number };

interface ShadowFrame { funcId: number; line: number; locals: Map<number, number>; }

class DebugSession {
    sidecar: Sidecar;
    exports: Record<string, unknown>;
    memory: WebAssembly.Memory;
    asyncifyData = 0;

    frames: ShadowFrame[] = [];
    breakpoints = new Set<string>();          // "file|line"
    mode: "continue" | "stepOver" | "stepInto" | "stepOut" = "stepInto";
    stepDepth = 0;
    pendingReason: StopReason = "breakpoint";
    firstStop = true;

    refTable = new Map<number, RefEntry>();
    setTable = new Map<number, { addr: number; typeId: number }>(); // editable scalars
    refCounter = 1;
    stopped = false;
    terminated = false;

    constructor(sidecar: Sidecar, exports: Record<string, unknown>, memory: WebAssembly.Memory) {
        this.sidecar = sidecar;
        this.exports = exports;
        this.memory = memory;
    }

    private asExport<T>(name: string): T { return this.exports[name] as T; }
    private get asState(): number { return this.asExport<() => number>("asyncify_get_state")(); }
    private dv(): DataView { return new DataView(this.memory.buffer); }

    // ---- hooks (called from wasm) -------------------------------------------
    onEnter(funcId: number) { this.frames.push({ funcId, line: 0, locals: new Map() }); }
    onExit(_funcId: number) { this.frames.pop(); }
    onLocal(varId: number, addr: number) {
        const f = this.frames[this.frames.length - 1];
        if (f) f.locals.set(varId, addr);
    }
    onLine(locId: number) {
        if (this.asState === 2) {                 // rewinding: finish here, then continue
            this.asExport<() => void>("asyncify_stop_rewind")();
            return;
        }
        const loc = this.sidecar.locations[locId];
        if (!loc) return;
        const file = this.sidecar.files[loc.file] ?? "";
        const top = this.frames[this.frames.length - 1];
        if (top) top.line = loc.line;

        let reason: StopReason | null = null;
        if (this.breakpoints.has(file + "|" + loc.line)) reason = "breakpoint";
        else if (this.mode === "stepInto") reason = "step";
        else if (this.mode === "stepOver" && this.frames.length <= this.stepDepth) reason = "step";
        else if (this.mode === "stepOut" && this.frames.length < this.stepDepth) reason = "step";

        if (reason) {
            this.pendingReason = reason;
            this.asExport<(p: number) => void>("asyncify_start_unwind")(this.asyncifyData);
        }
    }

    // ---- driver --------------------------------------------------------------
    start() {
        this.asyncifyData = this.asExport<(n: number) => number>("malloc")(ASYNCIFY_STACK_BYTES + 8);
        // header: [currentStackPtr, endStackPtr] then the stack region
        new Int32Array(this.memory.buffer, this.asyncifyData, 2)
            .set([this.asyncifyData + 8, this.asyncifyData + 8 + ASYNCIFY_STACK_BYTES]);
        this.run(true);
    }

    private run(initial: boolean) {
        if (this.terminated) return;
        if (!initial) this.asExport<(p: number) => void>("asyncify_start_rewind")(this.asyncifyData);
        let ret: unknown;
        try {
            ret = this.asExport<() => unknown>("__sim_worker_entry")();
        } catch (err) {
            if (err instanceof ProcExit) { this.finish(String(err.code)); return; }
            postDbg({ type: "dbg-error", message: err instanceof Error ? err.message : String(err) });
            this.finish();
            return;
        }
        if (this.asState === 1) {                  // unwound -> paused
            this.asExport<() => void>("asyncify_stop_unwind")();
            this.onStopped();
        } else {
            this.finish(ret == null ? "(void)" : String(ret));
        }
    }

    private onStopped() {
        this.stopped = true;
        this.refTable.clear();
        this.setTable.clear();
        this.refCounter = 1;
        const frames: DebugFrame[] = [];
        for (let i = this.frames.length - 1; i >= 0; i--) {
            const sf = this.frames[i];
            const fn = this.sidecar.functions[sf.funcId];
            const scopeRef = this.refCounter++;
            this.refTable.set(scopeRef, { kind: "scope", frameIndex: i });
            frames.push({
                id: this.frames.length - 1 - i,
                name: fn?.name ?? "?",
                file: this.sidecar.files[fn?.file ?? 0] ?? "",
                line: sf.line,
                scopeRef,
            });
        }
        const top = frames[0];
        postDbg({
            type: "dbg-stopped",
            reason: this.firstStop ? "entry" : this.pendingReason,
            file: top?.file ?? "",
            line: top?.line ?? 0,
            frames,
        });
        this.firstStop = false;
    }

    private finish(value?: string) {
        if (this.terminated) return;
        this.terminated = true;
        try { this.asExport<(p: number) => void>("free")(this.asyncifyData); } catch { /* ignore */ }
        flushStdioTail();
        // Surface the return value in the shared top "output" area, exactly like
        // Run (not as a console log line). Errors/Stop pass no value.
        if (value !== undefined) post({ type: "result", value });
        postDbg({ type: "dbg-terminated", value });
        post({ type: "done" });
        dbg = null;
    }

    // ---- control -------------------------------------------------------------
    setBreakpoints(bps: BreakpointReq[]) {
        this.breakpoints = new Set(bps.map((b) => b.file + "|" + b.line));
    }
    private resume(mode: DebugSession["mode"]) {
        if (!this.stopped || this.terminated) return;
        this.mode = mode;
        if (mode === "stepOver" || mode === "stepOut") this.stepDepth = this.frames.length;
        this.stopped = false;
        this.run(false);
    }
    doContinue() { this.resume("continue"); }
    stepOver() { this.resume("stepOver"); }
    stepInto() { this.resume("stepInto"); }
    stepOut() { this.resume("stepOut"); }
    stop() { if (!this.terminated) this.finish(); }

    // ---- variable inspection (while paused) ----------------------------------
    getVariables(ref: number): DebugVariable[] {
        if (!this.stopped) return [];
        const entry = this.refTable.get(ref);
        if (!entry) return [];
        if (entry.kind === "scope") return this.scopeVars(entry.frameIndex);
        return this.children(entry.addr, entry.typeId);
    }

    private scopeVars(frameIndex: number): DebugVariable[] {
        const sf = this.frames[frameIndex];
        if (!sf) return [];
        const out: DebugVariable[] = [];
        for (const v of this.sidecar.variables) {
            if (v.func !== sf.funcId) continue;
            const addr = sf.locals.get(v.id);
            if (addr === undefined) continue;      // not yet in scope
            out.push(this.makeVar(v.name, addr, v.type));
        }
        return out;
    }

    private readCString(ptr: number): string {
        const bytes = new Uint8Array(this.memory.buffer);
        const end = Math.min(ptr + 1024, bytes.length);
        let i = ptr;
        while (i < end && bytes[i] !== 0) i++;
        return new TextDecoder("utf-8").decode(bytes.subarray(ptr, i));
    }

    private tensorChildren(addr: number): DebugVariable[] {
        let varid: number;
        try { varid = this.dv().getInt32(addr, true); } catch { return []; }
        if (varid < 0) return [];
        const info = js_tensor_debug(varid);
        if (!info) return [];
        const { shape, data, dtype } = info;
        // 2D matrix → one expandable row per index; everything else → flat (capped).
        if (shape.length === 2) {
            const [rows, cols] = shape;
            return Array.from({ length: rows }, (_, r) => ({
                name: `[${r}]`,
                value: "[" + data.slice(r * cols, (r + 1) * cols).map(fmtNum).join(", ") + "]",
                type: dtype,
                variablesReference: 0,
            }));
        }
        const cap = Math.min(data.length, 512);
        const out: DebugVariable[] = Array.from({ length: cap }, (_, i) => ({
            name: `[${i}]`, value: fmtNum(data[i]), type: dtype, variablesReference: 0,
        }));
        if (data.length > cap) out.push({ name: "…", value: `(${data.length - cap} more)`, type: "", variablesReference: 0 });
        return out;
    }

    private vectorChildren(addr: number, stl: { elem?: number }): DebugVariable[] {
        if (stl.elem == null) return [];
        let begin: number, count: number, elemSize: number;
        try { ({ begin, count, elemSize } = this.vectorCount(addr, stl)); } catch { return []; }
        const cap = Math.min(count, 1000);
        const out: DebugVariable[] = [];
        for (let i = 0; i < cap; i++) out.push(this.makeVar(`[${i}]`, begin + i * elemSize, stl.elem));
        if (count > cap) out.push({ name: "…", value: `(${count - cap} more)`, type: "", variablesReference: 0 });
        return out;
    }

    private children(addr: number, typeId: number): DebugVariable[] {
        const t = this.sidecar.types[typeId];
        if (!t) return [];
        if (t.kind === "record") {
            if (t.stl?.kind === "vector") return this.vectorChildren(addr, t.stl);
            if (isTensorType(t.name)) return this.tensorChildren(addr);
            return t.fields.map((f) => this.makeVar(f.name, addr + f.offset, f.type));
        }
        if (t.kind === "array") {
            const elem = this.sidecar.types[t.elem];
            const sz = elem && elem.size > 0 ? elem.size : 1;
            const out: DebugVariable[] = [];
            for (let i = 0; i < t.count; i++) out.push(this.makeVar(`[${i}]`, addr + i * sz, t.elem));
            return out;
        }
        if (t.kind === "pointer") {
            const target = this.dv().getUint32(addr, true);
            if (target === 0) return [];
            return [this.makeVar("*", target, t.pointee)];
        }
        return [];
    }

    private makeVar(name: string, addr: number, typeId: number): DebugVariable {
        const t = this.sidecar.types[typeId];
        const { value, expandable } = this.render(addr, typeId);
        let ref = 0;
        if (expandable) {
            ref = this.refCounter++;
            this.refTable.set(ref, { kind: "value", addr, typeId });
        }
        // Scalars are editable: hand out a setId the UI echoes back to write.
        let setId = 0;
        if (t?.kind === "scalar") {
            setId = this.refCounter++;
            this.setTable.set(setId, { addr, typeId });
        }
        return { name, value, type: t?.name ?? "?", variablesReference: ref, setId };
    }

    // Write a new scalar value into linear memory (paused → memory stable; the
    // address survives the Asyncify rewind, so the change persists into the run).
    setVariable(setId: number, raw: string): { ok: boolean; value?: string; error?: string } {
        if (!this.stopped) return { ok: false, error: "일시정지 상태에서만 변경할 수 있어요" };
        const e = this.setTable.get(setId);
        if (!e) return { ok: false, error: "변경할 수 없는 변수입니다" };
        const t = this.sidecar.types[e.typeId];
        if (!t || t.kind !== "scalar") return { ok: false, error: "스칼라 값만 변경할 수 있어요" };
        try {
            this.writeScalar(e.addr, t, raw.trim());
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : "잘못된 값" };
        }
        return { ok: true, value: this.render(e.addr, e.typeId).value };
    }

    private writeScalar(addr: number, t: SidecarType & { kind: "scalar" }, raw: string): void {
        const d = this.dv();
        const int = (lo: number, hi: number): number => {
            const n = Number(raw);
            if (!Number.isFinite(n) || !Number.isInteger(n) || n < lo || n > hi) throw new Error(`정수 ${lo}~${hi} 범위여야 해요`);
            return n;
        };
        const flt = (): number => {
            const n = Number(raw);
            if (!Number.isFinite(n)) throw new Error("숫자를 입력하세요");
            return n;
        };
        switch (t.scalar) {
            case "bool": d.setUint8(addr, /^(true|1)$/i.test(raw) ? 1 : 0); break;
            case "char": d.setInt8(addr, raw.length === 1 ? raw.charCodeAt(0) : int(-128, 127)); break;
            case "schar": d.setInt8(addr, int(-128, 127)); break;
            case "uchar": d.setUint8(addr, int(0, 255)); break;
            case "short": d.setInt16(addr, int(-32768, 32767), true); break;
            case "ushort": d.setUint16(addr, int(0, 65535), true); break;
            case "int": d.setInt32(addr, int(-2147483648, 2147483647), true); break;
            case "uint": d.setUint32(addr, int(0, 4294967295), true); break;
            case "longlong": d.setBigInt64(addr, BigInt(raw), true); break;
            case "ulonglong": d.setBigUint64(addr, BigInt(raw), true); break;
            case "float": d.setFloat32(addr, flt(), true); break;
            case "double": d.setFloat64(addr, flt(), true); break;
            default: throw new Error("지원하지 않는 타입");
        }
    }

    private render(addr: number, typeId: number): { value: string; expandable: boolean } {
        const t = this.sidecar.types[typeId];
        if (!t) return { value: "?", expandable: false };
        const d = this.dv();
        switch (t.kind) {
            case "scalar": return { value: this.readScalar(addr, t), expandable: false };
            case "pointer": return this.renderPointer(addr, t);
            case "array": {
                const elem = this.sidecar.types[t.elem];
                return { value: `${elem?.name ?? "?"}[${t.count}]`, expandable: t.count > 0 };
            }
            case "record":
                if (t.stl?.kind === "vector") return this.renderVector(addr, t.stl);
                if (t.stl?.kind === "string") return this.renderString(addr, t.size > 0 ? t.size : 12);
                if (isTensorType(t.name)) return this.renderTensor(addr);
                return { value: t.name, expandable: t.fields.length > 0 };
            default: return { value: `<${t.name}>`, expandable: false };
        }
    }

    // libc++ std::vector: { __begin_ @0, __end_ @4, __cap_ @8 } (3 pointers on
    // wasm32). size = (__end_ - __begin_) / sizeof(T).
    private vectorCount(addr: number, stl: { elem?: number }): { begin: number; count: number; elemSize: number } {
        const d = this.dv();
        const begin = d.getUint32(addr, true);
        const end = d.getUint32(addr + 4, true);
        const elem = stl.elem != null ? this.sidecar.types[stl.elem] : undefined;
        const elemSize = elem && elem.size > 0 ? elem.size : 1;
        const count = begin && end >= begin ? Math.floor((end - begin) / elemSize) : 0;
        return { begin, count, elemSize };
    }

    private renderVector(addr: number, stl: { elem?: number }): { value: string; expandable: boolean } {
        try {
            const { count } = this.vectorCount(addr, stl);
            return { value: `vector (${count})`, expandable: count > 0 };
        } catch { return { value: "vector (?)", expandable: false }; }
    }

    // emscripten's libc++ std::string uses the ALTERNATE layout (little-endian):
    // __data_ is first. The is_long flag is the high bit of the last byte of the
    // object. Short: data at addr, size = lastByte & 0x7f. Long: data ptr = u32@0,
    // size = u32@4. (`structSize` = sizeof(std::string), 12 on wasm32.)
    private renderString(addr: number, structSize: number): { value: string; expandable: boolean } {
        try {
            const d = this.dv();
            const lastByte = d.getUint8(addr + structSize - 1);
            const isLong = (lastByte & 0x80) !== 0;
            let dataPtr: number, size: number;
            if (isLong) { dataPtr = d.getUint32(addr, true); size = d.getUint32(addr + 4, true); }
            else { dataPtr = addr; size = lastByte & 0x7f; }
            const bytes = new Uint8Array(this.memory.buffer, dataPtr, Math.min(size, 4096));
            const s = new TextDecoder("utf-8").decode(bytes);
            return { value: `"${s}"`, expandable: false };
        } catch { return { value: "<string?>", expandable: false }; }
    }

    private renderPointer(addr: number, t: SidecarType & { kind: "pointer" }): { value: string; expandable: boolean } {
        let ptr: number;
        try { ptr = this.dv().getUint32(addr, true); } catch { return { value: "0x?", expandable: false }; }
        if (ptr === 0) return { value: "0x0 (nullptr)", expandable: false };
        const hex = "0x" + ptr.toString(16);
        const pointee = this.sidecar.types[t.pointee];
        try {
            // char* → show the C-string it points at.
            if (pointee?.kind === "scalar" && (pointee.scalar === "char" || pointee.scalar === "schar" || pointee.scalar === "uchar")) {
                return { value: `${hex} "${this.readCString(ptr)}"`, expandable: true };
            }
            // scalar* → peek the pointed-to value inline.
            if (pointee?.kind === "scalar") {
                return { value: `${hex} (${this.readScalar(ptr, pointee)})`, expandable: true };
            }
        } catch { /* out-of-range / bad pointer — fall through to plain address */ }
        return { value: hex, expandable: !!pointee && pointee.kind !== "unknown" };
    }

    // simulizer Tensor: the wasm object is just an `int varid_` (offset 0); the
    // real data lives in TF.js. While paused the worker is idle, so we can read
    // shape/values straight from the JS-side tensor registry.
    private renderTensor(addr: number): { value: string; expandable: boolean } {
        let varid: number;
        try { varid = this.dv().getInt32(addr, true); } catch { return { value: "Tensor(?)", expandable: false }; }
        if (varid < 0) return { value: "Tensor(empty)", expandable: false };
        const info = js_tensor_shape(varid);
        if (!info) return { value: `Tensor(#${varid}, 해제됨)`, expandable: false };
        const shape = info.shape.length ? info.shape.join("×") : "scalar";
        return { value: `Tensor ${info.dtype} [${shape}]`, expandable: true };
    }

    private readScalar(addr: number, t: SidecarType & { kind: "scalar" }): string {
        const d = this.dv();
        switch (t.scalar) {
            case "bool": return d.getUint8(addr) ? "true" : "false";
            case "char": { const c = d.getInt8(addr); return `${c} '${String.fromCharCode(c & 0xff)}'`; }
            case "schar": return String(d.getInt8(addr));
            case "uchar": return String(d.getUint8(addr));
            case "short": return String(d.getInt16(addr, true));
            case "ushort": return String(d.getUint16(addr, true));
            case "int": return String(d.getInt32(addr, true));
            case "uint": return String(d.getUint32(addr, true) >>> 0);
            case "longlong": return d.getBigInt64(addr, true).toString();
            case "ulonglong": return d.getBigUint64(addr, true).toString();
            case "float": return String(d.getFloat32(addr, true));
            case "double": return String(d.getFloat64(addr, true));
            default: return `<${t.scalar}>`;
        }
    }

    evaluate(frameId: number, expr: string): string | null {
        if (!this.stopped) return null;
        const frameIndex = this.frames.length - 1 - frameId;
        const sf = this.frames[frameIndex];
        if (!sf) return null;
        const name = expr.trim();
        for (const v of this.sidecar.variables) {
            if (v.func === sf.funcId && v.name === name && sf.locals.has(v.id)) {
                return this.render(sf.locals.get(v.id)!, v.type).value;
            }
        }
        return null;
    }
}

let dbg: DebugSession | null = null;

function buildDebugImports(): Record<string, unknown> {
    return {
        __sim_dbg_enter: (funcId: number) => dbg?.onEnter(funcId),
        __sim_dbg_exit: (funcId: number) => dbg?.onExit(funcId),
        __sim_dbg_local: (varId: number, addr: number) => dbg?.onLocal(varId, addr),
        __sim_dbg_line: (locId: number) => dbg?.onLine(locId),
    };
}

async function startDebug(wasmBuffer: ArrayBuffer, sidecar: Sidecar, breakpoints: BreakpointReq[]) {
    if (!tfReady) await tfReadyPromise;
    js_tensor_reset();
    barIdCounter = 0;
    holderCounter = 1;
    currentHolderId = 0;
    stdoutBuf = "";
    stderrBuf = "";
    dbg = null;

    try {
        const mod = await WebAssembly.compile(wasmBuffer);
        const imports: Record<string, Record<string, unknown>> = {
            env: { ...buildEnvImports(), ...buildDebugImports() },
            wasi_snapshot_preview1: buildWasiImports(),
        };
        // Auto-stub anything we didn't supply (same policy as the run path).
        for (const imp of WebAssembly.Module.imports(mod)) {
            if (!imports[imp.module]) imports[imp.module] = {};
            const ns = imports[imp.module];
            if (imp.kind === "function") { if (typeof ns[imp.name] !== "function") ns[imp.name] = () => 0; }
            else if (imp.kind === "global") { if (ns[imp.name] === undefined) ns[imp.name] = new WebAssembly.Global({ value: "i32", mutable: true }, 0); }
            else if (imp.kind === "memory") { if (ns[imp.name] === undefined) ns[imp.name] = new WebAssembly.Memory({ initial: 256, maximum: 32768 }); }
            else if (imp.kind === "table") { if (ns[imp.name] === undefined) ns[imp.name] = new WebAssembly.Table({ initial: 0, element: "anyfunc" }); }
        }

        const instance = await WebAssembly.instantiate(mod, imports as unknown as WebAssembly.Imports);
        const wasmExports = instance.exports as Record<string, unknown>;
        const memory = (wasmExports.memory instanceof WebAssembly.Memory)
            ? wasmExports.memory
            : (imports.env.memory as WebAssembly.Memory);
        wasmMemory = memory;

        // WASI reactor: `_initialize` runs the global constructors (so
        // std::cout / user globals work). Fall back to __wasm_call_ctors.
        const init = wasmExports._initialize ?? wasmExports.__wasm_call_ctors;
        if (typeof init === "function") (init as () => void)();

        if (typeof wasmExports.__sim_worker_entry !== "function") {
            postDbg({ type: "dbg-error", message: "No entry point (__sim_worker_entry) in debug wasm" });
            return;
        }
        if (typeof wasmExports.malloc !== "function" || typeof wasmExports.asyncify_start_unwind !== "function") {
            postDbg({ type: "dbg-error", message: "Debug wasm missing Asyncify/malloc exports" });
            return;
        }

        const session = new DebugSession(sidecar, wasmExports, memory);
        session.setBreakpoints(breakpoints);
        dbg = session;
        session.start();
    } catch (err) {
        postDbg({ type: "dbg-error", message: err instanceof Error ? err.message : String(err) });
        dbg = null;
    }
}

self.onmessage = async (e: MessageEvent<ClangWorkerInMsg>) => {
    const msg = e.data;

    // Debug control messages operate on the live session.
    switch (msg.type) {
        case "debug": await startDebug(msg.wasmBuffer, msg.sidecar, msg.breakpoints); return;
        case "dbg-setBreakpoints": dbg?.setBreakpoints(msg.breakpoints); return;
        case "dbg-continue": dbg?.doContinue(); return;
        case "dbg-stepOver": dbg?.stepOver(); return;
        case "dbg-stepInto": dbg?.stepInto(); return;
        case "dbg-stepOut": dbg?.stepOut(); return;
        case "dbg-stop": dbg?.stop(); return;
        case "dbg-getVariables":
            postDbg({ type: "dbg-variables", requestId: msg.requestId, variables: dbg?.getVariables(msg.variablesReference) ?? [] });
            return;
        case "dbg-evaluate":
            postDbg({ type: "dbg-evaluate", requestId: msg.requestId, result: dbg?.evaluate(msg.frameId, msg.expression) ?? null });
            return;
        case "dbg-setVariable": {
            const r = dbg?.setVariable(msg.setId, msg.value) ?? { ok: false, error: "세션 없음" };
            postDbg({ type: "dbg-setVariable", requestId: msg.requestId, ...r });
            return;
        }
    }

    if (msg.type === "init") {
        await tfReadyPromise;
        post({ type: "ready" });
        post({ type: "backend-switched", backend: tf.getBackend() ?? "cpu" });
        return;
    }

    if (msg.type === "switch-backend") {
        try {
            const ok = await tf.setBackend(msg.backend);
            if (ok) {
                await tf.ready();
                post({ type: "backend-switched", backend: tf.getBackend() });
            } else {
                post({ type: "error", message: `Failed to switch to backend: ${msg.backend}` });
            }
        } catch (err) {
            post({ type: "error", message: `Error switching backend: ${err instanceof Error ? err.message : String(err)}` });
        }
        return;
    }

    if (msg.type !== "run") return;

    if (!tfReady) await tfReadyPromise;

    js_tensor_reset();
    barIdCounter = 0;
    holderCounter = 1;
    currentHolderId = 0;
    stdoutBuf = "";
    stderrBuf = "";

    try {
        const mod = await WebAssembly.compile(msg.wasmBuffer);
        const expected = WebAssembly.Module.imports(mod);

        const imports: Record<string, Record<string, unknown>> = {
            env: buildEnvImports(),
            wasi_snapshot_preview1: buildWasiImports(),
        };

        // Auto-stub any imports we didn't supply explicitly.
        const stubbed: string[] = [];
        for (const imp of expected) {
            if (!imports[imp.module]) imports[imp.module] = {};
            const ns = imports[imp.module];
            if (imp.kind === "function") {
                if (typeof ns[imp.name] !== "function") {
                    stubbed.push(`${imp.module}.${imp.name} (fn)`);
                    ns[imp.name] = () => 0;
                }
            } else if (imp.kind === "global") {
                if (ns[imp.name] === undefined) {
                    stubbed.push(`${imp.module}.${imp.name} (global)`);
                    ns[imp.name] = new WebAssembly.Global({ value: "i32", mutable: true }, 0);
                }
            } else if (imp.kind === "memory") {
                if (ns[imp.name] === undefined) {
                    stubbed.push(`${imp.module}.${imp.name} (memory)`);
                    ns[imp.name] = new WebAssembly.Memory({ initial: 256, maximum: 32768 });
                }
            } else if (imp.kind === "table") {
                if (ns[imp.name] === undefined) {
                    stubbed.push(`${imp.module}.${imp.name} (table)`);
                    ns[imp.name] = new WebAssembly.Table({ initial: 0, element: "anyfunc" });
                }
            }
        }
        if (stubbed.length) {
            console.info(`[clang-worker] stubbed ${stubbed.length} imports:`, stubbed);
        }

        const instance = await WebAssembly.instantiate(mod, imports as unknown as WebAssembly.Imports);
        const wasmExports = instance.exports as Record<string, unknown>;

        // STANDALONE_WASM exports memory; bridge closures read it via the
        // module-level wasmMemory variable on each call.
        if (wasmExports.memory instanceof WebAssembly.Memory) {
            wasmMemory = wasmExports.memory;
        } else if (imports.env.memory instanceof WebAssembly.Memory) {
            wasmMemory = imports.env.memory;
        }

        // Run any C++ static initializers (WASI reactor `_initialize`), then
        // the user's worker. Fall back to __wasm_call_ctors for older builds.
        const init = wasmExports._initialize ?? wasmExports.__wasm_call_ctors;
        if (typeof init === "function") {
            (init as () => void)();
        }

        const entry = wasmExports.__sim_worker_entry;
        if (typeof entry !== "function") {
            post({ type: "error", message: "No entry point (__sim_worker_entry) in user.wasm" });
            return;
        }
        try {
            const ret = (entry as () => unknown)();
            post({ type: "result", value: ret == null ? "(void)" : String(ret) });
        } catch (err) {
            if (err instanceof ProcExit) {
                post({ type: "result", value: String(err.code) });
            } else {
                throw err;
            }
        }
        flushStdioTail();
        post({ type: "done" });
    } catch (err) {
        post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
};
