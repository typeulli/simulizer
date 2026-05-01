import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgpu";
import {
    js_tensor_create,
    js_tensor_random,
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
    js_tensor_reset,
} from "./tensor";
import { simulizer } from "./engine";

// Message type definitions────────────

export type WorkerInMsg =
    | { type: "run"; wasmBuffer: ArrayBuffer; latexStrings?: string[] }
    | { type: "init" }
    | { type: "switch-backend"; backend: string };

export type WorkerOutMsg =
    | { type: "ready" }
    | { type: "log"; holderId: number; kind: "info" | "success" | "error"; text: string }
    | { type: "holder_create"; holderId: number; kind: "series" }
    | { type: "bar_create"; barId: number; min: number; max: number }
    | { type: "bar_set"; barId: number; val: number }
    | { type: "visual"; holderId: number; data: number[]; rows: number; cols: number }
    | { type: "visual_vec"; holderId: number; dx: number[]; dy: number[]; rows: number; cols: number }
    | { type: "result"; value: string }
    | { type: "done" }
    | { type: "error"; message: string }
    | { type: "backend-switched"; backend: string };

function post(msg: WorkerOutMsg) {
    self.postMessage(msg);
}

// Initialize TF backend (starts immediately after Worker creation)

let tfReady = false;
const tfReadyPromise = (async () => {
    for (const backend of ["webgpu", "webgl", "cpu"] as const) {
        try {
            const ok = await tf.setBackend(backend);
            if (!ok) continue;
            await tf.ready();
            tfReady = true;
            return;
        } catch { /* Try next backend */ }
    }
    tfReady = true;
})();

let barIdCounter = 0;
let holderCounter = 1;  // 0 = global
let currentHolderId = 0;

// Message handler─────────────

self.onmessage = async (e: MessageEvent<WorkerInMsg>) => {
    const msg = e.data;

    // init: Wait for TF initialization to complete then send ready signal
    if (msg.type === "init") {
        await tfReadyPromise;
        post({ type: "ready" });
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

    // Reset tensor state from previous execution
    js_tensor_reset();
    barIdCounter = 0;
    holderCounter = 1;
    currentHolderId = 0;

    const latexStrings = msg.latexStrings ?? [];

    // Wait if TF is still initializing
    if (!tfReady) await tfReadyPromise;

    try {
        const wasmModule = await WebAssembly.compile(msg.wasmBuffer);

        let wasmMemory: WebAssembly.Memory | null = null;

        const log = (text: string) =>
            post({ type: "log", holderId: currentHolderId, kind: "info", text });

        const imports: WebAssembly.Imports = {
            debug: {
                log: (val: number) => log(`🔍 log: ${val}`),
                log_ptr: (ptr: number) => log(`🔍 ptr: 0x${ptr.toString(16)}`),
                log_arr_i32: (ptr: number, cap: number) => {
                    if (!wasmMemory) return;
                    const arr = simulizer.pipe.load_arr_i32(wasmMemory, ptr, cap);
                    log(`📚 [${arr?.join(", ") ?? "undefined"}]`);
                },
                log_arr_f64: (ptr: number, cap: number) => {
                    if (!wasmMemory) return;
                    const arr = simulizer.pipe.load_arr_f64(wasmMemory, ptr, cap);
                    log(`📚 [${arr?.join(", ") ?? "undefined"}]`);
                },
                log_tensor: (tensorId: number) => log(`🧠 ${js_tensor_toString(tensorId)}`),
                log_vec2: (x: number, y: number) => log(`📐 vec2(${x}, ${y})`),
                log_vec3: (x: number, y: number, z: number) => log(`📦 vec3(${x}, ${y}, ${z})`),
                debug_bar: (min: number, max: number): number => {
                    const barId = ++barIdCounter;
                    post({ type: "bar_create", barId, min, max });
                    return barId;
                },
                debug_bar_set: (barId: number, val: number) => {
                    post({ type: "bar_set", barId, val });
                },
                log_latex: (id: number) => log(latexStrings[id] ?? ""),
                debug_series: (): number => {
                    const id = holderCounter++;
                    post({ type: "holder_create", holderId: id, kind: "series" });
                    return id;
                },
                debug_set_holder: (id: number) => {
                    currentHolderId = id;
                },
                show_mat: (tensorId: number) => {
                    const holderId = currentHolderId;
                    const field = js_tensor_get_field_data(tensorId);
                    if (field) {
                        post({ type: "visual_vec", holderId, dx: Array.from(field.dx), dy: Array.from(field.dy), rows: field.rows, cols: field.cols });
                        return 0;
                    }
                    const mat = js_tensor_get_mat_data(tensorId);
                    if (mat) post({ type: "visual", holderId, data: Array.from(mat.data), rows: mat.rows, cols: mat.cols });
                    return 0;
                },
            },
            tensor: {
                tensor_random: (varid: number, distType: number, param1: number, param2: number, ptr: number, cap: number) => {
                    if (!wasmMemory) return 0;
                    return js_tensor_random(wasmMemory, varid, distType, param1, param2, ptr, cap);
                },
                tensor_create: (varid: number, ptr: number, cap: number) => {
                    if (!wasmMemory) return 0;
                    return js_tensor_create(wasmMemory, varid, ptr, cap);
                },
                tensor_add:    (lhsVarId: number, rhsVarId: number) => js_tensor_add(lhsVarId, rhsVarId),
                tensor_sub:    (lhsVarId: number, rhsVarId: number) => js_tensor_sub(lhsVarId, rhsVarId),
                tensor_matmul: (lhsVarId: number, rhsVarId: number) => js_tensor_matmul(lhsVarId, rhsVarId),
                tensor_neg:    (varId: number) => js_tensor_neg(varId),
                tensor_elemul: (lhsVarId: number, rhsVarId: number) => js_tensor_elemul(lhsVarId, rhsVarId),
                tensor_scale:  (tensorVarId: number, scalar: number) => js_tensor_scale(tensorVarId, scalar),
                tensor_save:   (outVarId: number, tensorId: number) => js_tensor_save(outVarId, tensorId),
                tensor_set: (tensorId: number, n: number, i0: number, i1: number, i2: number, i3: number, i4: number, i5: number, value: number) =>
                    js_tensor_set(tensorId, n, i0, i1, i2, i3, i4, i5, value),
                tensor_get: (tensorId: number, n: number, i0: number, i1: number, i2: number, i3: number, i4: number, i5: number) =>
                    js_tensor_get(tensorId, n, i0, i1, i2, i3, i4, i5),
                tensor_perlin: (varid: number, rows: number, cols: number) =>
                    js_tensor_perlin(varid, rows, cols),
            },
        };

        const instance = await WebAssembly.instantiate(wasmModule, imports);
        wasmMemory = instance.exports.memory as WebAssembly.Memory;

        const exports = instance.exports as Record<string, unknown>;
        if (typeof exports.main !== "function") {
            post({ type: "error", message: "export 'main' 없음" });
            return;
        }

        const raw = (exports.main as () => unknown)();
        const str = raw != null ? String(raw) : "(void)";
        post({ type: "result", value: str });
        post({ type: "done" });
    } catch (err) {
        post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
};
