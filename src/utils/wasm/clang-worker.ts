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

export type ClangWorkerInMsg =
    | { type: "init" }
    | { type: "run"; wasmBuffer: ArrayBuffer }
    | { type: "switch-backend"; backend: string };

function post(msg: WorkerOutMsg) {
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
    let stdoutBuf = "";
    let stderrBuf = "";

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

self.onmessage = async (e: MessageEvent<ClangWorkerInMsg>) => {
    const msg = e.data;

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

        // Run any C++ static initializers, then user's worker.
        const ctors = wasmExports.__wasm_call_ctors;
        if (typeof ctors === "function") {
            (ctors as () => void)();
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
        post({ type: "done" });
    } catch (err) {
        post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
};
