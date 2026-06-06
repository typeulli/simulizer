import * as tf from '@tensorflow/tfjs';
import { simulizer } from "./engine";

const tfSpace: { [key: number]: tf.Tensor } = {};
const bufferSpace: { [key: number]: tf.TensorBuffer<tf.Rank, "float32"> } = {};
let tempTensorCounter = 1000000;

export function js_tensor_reset() {
    for (const id of Object.keys(bufferSpace)) delete bufferSpace[Number(id)];
    for (const id of Object.keys(tfSpace)) {
        try { tfSpace[Number(id)].dispose(); } catch { /* ignore */ }
        delete tfSpace[Number(id)];
    }
    tempTensorCounter = 1000000;
}

function flushBuffer(tensorId: number) {
    const buf = bufferSpace[tensorId];
    if (!buf) return;
    if (tfSpace[tensorId]) tfSpace[tensorId].dispose();
    tfSpace[tensorId] = buf.toTensor();
    delete bufferSpace[tensorId];
}

function openBuffer(tensorId: number) {
    if (bufferSpace[tensorId]) return;
    const tensor = tfSpace[tensorId];
    if (!tensor) return;
    bufferSpace[tensorId] = tf.buffer(tensor.shape as number[], "float32", tensor.dataSync() as Float32Array);
}

export function js_tensor_create_with_shape(varid: number, shape: number[]): number {
    console.log(`js_tensor_create_with_shape: varid=${varid}, shape=[${shape.join(", ")}]`);
    tfSpace[varid] = tf.zeros(shape, "float32");
    return varid;
}

// Deep-clones src's tensor into dst's slot. Any prior tensor at dst is disposed
// first. Source's bufferSpace edits are flushed so the clone sees current data.
export function js_tensor_clone(dstVarId: number, srcVarId: number): number {
    flushBuffer(srcVarId);
    const src = tfSpace[srcVarId];
    if (!src) {
        console.warn(`js_tensor_clone: src tensor not found: ${srcVarId}`);
        return 0;
    }
    if (tfSpace[dstVarId]) {
        try { tfSpace[dstVarId].dispose(); } catch { /* ignore */ }
    }
    delete bufferSpace[dstVarId];
    tfSpace[dstVarId] = src.clone();
    return dstVarId;
}

// Frees both the mutable buffer (if any) and the TF tensor at varid.
export function js_tensor_dispose(varid: number): number {
    delete bufferSpace[varid];
    if (tfSpace[varid]) {
        try { tfSpace[varid].dispose(); } catch { /* ignore */ }
        delete tfSpace[varid];
    }
    return varid;
}

export function js_tensor_random_with_shape(
    varid: number,
    distType: number,
    param1: number,
    param2: number,
    shape: number[],
): number {
    let tensor: tf.Tensor;
    if (distType === 1) {
        tensor = tf.randomNormal(shape, param1, param2, "float32");
    } else if (distType === 2) {
        tensor = tf.truncatedNormal(shape, param1, param2, "float32");
    } else {
        tensor = tf.randomUniform(shape, param1, param2, "float32");
    }
    tfSpace[varid] = tensor;
    console.log(`js_tensor_random_with_shape: varid=${varid}, distType=${distType}, p1=${param1}, p2=${param2}, shape=[${shape.join(", ")}]`);
    return varid;
}

export function js_tensor_create(
    memory: WebAssembly.Memory,
    varid: number,
    ptr: number,
    cap: number,
): number {
    const dimList: number[] = simulizer.pipe.load_arr_i32(memory, ptr, cap) || [];
    return js_tensor_create_with_shape(varid, dimList);
}

export function js_tensor_random(
    memory: WebAssembly.Memory,
    varid: number,
    distType: number,
    param1: number,
    param2: number,
    ptr: number,
    cap: number,
): number {
    const dimList: number[] = simulizer.pipe.load_arr_i32(memory, ptr, cap) || [];
    return js_tensor_random_with_shape(varid, distType, param1, param2, dimList);
}

export function js_tensor_scale(tensorVarId: number, scalar: number): number {
    flushBuffer(tensorVarId);
    const tensor = tfSpace[tensorVarId];
    if (!tensor) {
        console.warn(`Tensor scale failed: tensorVarId=${tensorVarId}`);
        return 0;
    }
    const tempId = tempTensorCounter++;
    tfSpace[tempId] = tf.mul(tensor, scalar);
    console.log(`js_tensor_scale: tensorVarId=${tensorVarId}, scalar=${scalar}, tempId=${tempId}`);
    return tempId;
}

export function js_tensor_sub(lhsVarId: number, rhsVarId: number): number {
    flushBuffer(lhsVarId);
    flushBuffer(rhsVarId);
    const lhs = tfSpace[lhsVarId];
    const rhs = tfSpace[rhsVarId];
    if (!lhs || !rhs) {
        console.warn(`Tensor sub failed: lhs=${lhsVarId}, rhs=${rhsVarId}`);
        return 0;
    }
    const tempId = tempTensorCounter++;
    tfSpace[tempId] = tf.sub(lhs, rhs);
    console.log(`js_tensor_sub: lhs=${lhsVarId}, rhs=${rhsVarId}, tempId=${tempId}`);
    return tempId;
}

export function js_tensor_matmul(lhsVarId: number, rhsVarId: number): number {
    flushBuffer(lhsVarId);
    flushBuffer(rhsVarId);
    const lhs = tfSpace[lhsVarId];
    const rhs = tfSpace[rhsVarId];
    if (!lhs || !rhs) {
        console.warn(`Tensor matmul failed: lhs=${lhsVarId}, rhs=${rhsVarId}`);
        return 0;
    }
    const tempId = tempTensorCounter++;
    tfSpace[tempId] = tf.matMul(lhs as tf.Tensor2D, rhs as tf.Tensor2D);
    console.log(`js_tensor_matmul: lhs=${lhsVarId}, rhs=${rhsVarId}, tempId=${tempId}`);
    return tempId;
}

// ── Matrix (2D tensor) operations ──────────────────────────────

function _readMatrix(id: number): { m: number[][]; rows: number; cols: number } | null {
    flushBuffer(id);
    const t = tfSpace[id];
    if (!t) { console.warn(`matrix op: tensor not found: id=${id}`); return null; }
    if (t.shape.length !== 2) { console.warn(`matrix op: expected 2D tensor, got ${t.shape.length}D`); return null; }
    const [rows, cols] = t.shape as [number, number];
    const flat = t.dataSync() as Float32Array;
    const m: number[][] = [];
    for (let r = 0; r < rows; r++) {
        const row: number[] = [];
        for (let c = 0; c < cols; c++) row.push(flat[r * cols + c]);
        m.push(row);
    }
    return { m, rows, cols };
}

function _storeMatrix(m: number[][]): number {
    const rows = m.length;
    const cols = rows ? m[0].length : 0;
    const flat = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) flat[r * cols + c] = m[r][c];
    const id = tempTensorCounter++;
    tfSpace[id] = tf.tensor2d(flat, [rows, cols]);
    return id;
}

export function js_matrix_create(varid: number, rows: number, cols: number): number {
    const r = Math.max(1, Math.floor(rows));
    const c = Math.max(1, Math.floor(cols));
    if (tfSpace[varid]) tfSpace[varid].dispose();
    tfSpace[varid] = tf.zeros([r, c], "float32");
    console.log(`js_matrix_create: varid=${varid}, shape=(${r},${c})`);
    return varid;
}

export function js_matrix_matmul(lhsVarId: number, rhsVarId: number): number {
    flushBuffer(lhsVarId);
    flushBuffer(rhsVarId);
    const lhs = tfSpace[lhsVarId];
    const rhs = tfSpace[rhsVarId];
    if (!lhs || !rhs || lhs.shape.length !== 2 || rhs.shape.length !== 2) {
        console.warn(`matrix_matmul failed: lhs=${lhsVarId}, rhs=${rhsVarId}`);
        return 0;
    }
    const tempId = tempTensorCounter++;
    tfSpace[tempId] = tf.matMul(lhs as tf.Tensor2D, rhs as tf.Tensor2D);
    console.log(`js_matrix_matmul: lhs=${lhsVarId}, rhs=${rhsVarId}, tempId=${tempId}`);
    return tempId;
}

export function js_matrix_transpose(varId: number): number {
    flushBuffer(varId);
    const t = tfSpace[varId];
    if (!t || t.shape.length !== 2) {
        console.warn(`matrix_transpose failed: varId=${varId}`);
        return 0;
    }
    const tempId = tempTensorCounter++;
    tfSpace[tempId] = tf.transpose(t);
    console.log(`js_matrix_transpose: varId=${varId}, tempId=${tempId}`);
    return tempId;
}

export function js_matrix_det(varId: number): number {
    const r = _readMatrix(varId);
    if (!r) return 0;
    if (r.rows !== r.cols) { console.warn(`matrix_det: not square (${r.rows}x${r.cols})`); return 0; }
    const n = r.rows;
    const m = r.m.map(row => row.slice());
    let det = 1;
    for (let i = 0; i < n; i++) {
        let p = i;
        for (let k = i + 1; k < n; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
        if (Math.abs(m[p][i]) < 1e-12) return 0;
        if (p !== i) { [m[i], m[p]] = [m[p], m[i]]; det = -det; }
        det *= m[i][i];
        for (let k = i + 1; k < n; k++) {
            const f = m[k][i] / m[i][i];
            for (let j = i; j < n; j++) m[k][j] -= f * m[i][j];
        }
    }
    console.log(`js_matrix_det: varId=${varId}, det=${det}`);
    return det;
}

export function js_matrix_trace(varId: number): number {
    const r = _readMatrix(varId);
    if (!r) return 0;
    const n = Math.min(r.rows, r.cols);
    let t = 0;
    for (let i = 0; i < n; i++) t += r.m[i][i];
    console.log(`js_matrix_trace: varId=${varId}, trace=${t}`);
    return t;
}

export function js_matrix_inverse(varId: number): number {
    const r = _readMatrix(varId);
    if (!r) return 0;
    if (r.rows !== r.cols) { console.warn(`matrix_inverse: not square (${r.rows}x${r.cols})`); return 0; }
    const n = r.rows;
    // [A | I] → Gauss-Jordan with partial pivoting
    const A = r.m.map((row, i) => {
        const id = new Array(n).fill(0);
        id[i] = 1;
        return [...row, ...id];
    });
    for (let i = 0; i < n; i++) {
        let p = i;
        for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
        if (Math.abs(A[p][i]) < 1e-12) { console.warn(`matrix_inverse: singular`); return 0; }
        [A[i], A[p]] = [A[p], A[i]];
        const piv = A[i][i];
        for (let j = 0; j < 2 * n; j++) A[i][j] /= piv;
        for (let k = 0; k < n; k++) {
            if (k === i) continue;
            const f = A[k][i];
            for (let j = 0; j < 2 * n; j++) A[k][j] -= f * A[i][j];
        }
    }
    const inv = A.map(row => row.slice(n));
    const id = _storeMatrix(inv);
    console.log(`js_matrix_inverse: varId=${varId}, tempId=${id}`);
    return id;
}

export function js_matrix_identity(n: number): number {
    const size = Math.max(1, Math.floor(n));
    const tempId = tempTensorCounter++;
    tfSpace[tempId] = tf.eye(size);
    console.log(`js_matrix_identity: n=${size}, tempId=${tempId}`);
    return tempId;
}

export function js_tensor_neg(varId: number): number {
    flushBuffer(varId);
    const tensor = tfSpace[varId];
    if (!tensor) {
        console.warn(`Tensor neg failed: varId=${varId}`);
        return 0;
    }
    const tempId = tempTensorCounter++;
    tfSpace[tempId] = tf.neg(tensor);
    console.log(`js_tensor_neg: varId=${varId}, tempId=${tempId}`);
    return tempId;
}

export function js_tensor_elemul(lhsVarId: number, rhsVarId: number): number {
    flushBuffer(lhsVarId);
    flushBuffer(rhsVarId);
    const lhs = tfSpace[lhsVarId];
    const rhs = tfSpace[rhsVarId];
    if (!lhs || !rhs) {
        console.warn(`Tensor elemul failed: lhs=${lhsVarId}, rhs=${rhsVarId}`);
        return 0;
    }
    const tempId = tempTensorCounter++;
    tfSpace[tempId] = tf.mul(lhs, rhs);
    console.log(`js_tensor_elemul: lhs=${lhsVarId}, rhs=${rhsVarId}, tempId=${tempId}`);
    return tempId;
}

export function js_tensor_add(lhsVarId: number, rhsVarId: number): number {
    flushBuffer(lhsVarId);
    flushBuffer(rhsVarId);
    const lhs = tfSpace[lhsVarId];
    const rhs = tfSpace[rhsVarId];
    if (!lhs || !rhs) {
        console.warn(`Tensor add failed: lhs=${lhsVarId}, rhs=${rhsVarId}`);
        return 0;
    }
    const tempId = tempTensorCounter++;
    tfSpace[tempId] = tf.add(lhs, rhs);
    console.log(`js_tensor_add: lhs=${lhsVarId}, rhs=${rhsVarId}, tempId=${tempId}`);
    return tempId;
}

export function js_tensor_save(outVarId: number, tensorId: number): number {
    flushBuffer(tensorId);
    if (!tfSpace[tensorId]) {
        console.warn(`Source tensor not found: tensorId=${tensorId}`);
        return 0;
    }
    if (tfSpace[outVarId] && outVarId !== tensorId) {
        tfSpace[outVarId].dispose();
    }
    tfSpace[outVarId] = tfSpace[tensorId];
    if (tensorId >= 1000000) {
        delete tfSpace[tensorId];
    }
    console.log(`js_tensor_save: outVarId=${outVarId}, tensorId=${tensorId}`);
    return outVarId;
}

function multiIndexToFlat(indices: number[], shape: number[]): number {
    let flatIndex = 0;
    let stride = 1;
    for (let i = indices.length - 1; i >= 0; i--) {
        flatIndex += indices[i] * stride;
        stride *= shape[i];
    }
    return flatIndex;
}

export const MAX_DIM = 6;

export function js_tensor_set(
    tensorId: number,
    n: number,
    i0: number, i1: number, i2: number, i3: number, i4: number, i5: number,
    value: number,
): number {
    if (!bufferSpace[tensorId]) openBuffer(tensorId);
    const buf = bufferSpace[tensorId];
    if (!buf) { console.warn(`Tensor not found for set: tensorId=${tensorId}`); return 0; }
    const indices = [i0, i1, i2, i3, i4, i5].slice(0, n) as number[];
    buf.set(value, ...indices);
    return tensorId;
}

export function js_tensor_get(
    tensorId: number,
    n: number,
    i0: number, i1: number, i2: number, i3: number, i4: number, i5: number,
): number {
    if (bufferSpace[tensorId]) {
        const indices = [i0, i1, i2, i3, i4, i5].slice(0, n) as number[];
        return bufferSpace[tensorId].get(...indices);
    }
    const tensor = tfSpace[tensorId];
    if (!tensor) { console.warn(`Tensor not found for get: tensorId=${tensorId}`); return 0; }
    const indices = [i0, i1, i2, i3, i4, i5].slice(0, n);
    const flatIndex = multiIndexToFlat(indices, tensor.shape);
    return (tensor.dataSync() as Float32Array)[flatIndex];
}

export function js_tensor_toString(varid: number): string {
    flushBuffer(varid);
    const tensor = tfSpace[varid];
    if (!tensor) return `Tensor not found: varid=${varid}`;
    const shape = tensor.shape;
    const data = Array.from(tensor.dataSync());

    function reshape(arr: number[], shape: number[]): unknown {
        if (shape.length === 1) return arr;
        const size = shape[0];
        const elemSize = arr.length / size;
        const result = [];
        for (let i = 0; i < size; i++) {
            result.push(reshape(arr.slice(i * elemSize, (i + 1) * elemSize), shape.slice(1)));
        }
        return result;
    }

    const reshaped = reshape(data, shape);
    return `Tensor(shape: [${shape.join(", ")}], dtype: ${tensor.dtype})\n${JSON.stringify(reshaped, null, 2)}`;
}

// Debugger-facing snapshot of a live JS-side tensor: shape + flat data + dtype.
// Used by the in-app debugger's Tensor pretty-printer (the wasm only stores a
// varid; the real values live here in TF.js). Returns null if the varid is
// unknown/disposed.
// Cheap shape-only peek (no dataSync read-back) for the debugger's tensor
// value summary in the variables list.
export function js_tensor_shape(varid: number): { shape: number[]; dtype: string } | null {
    const tensor = tfSpace[varid];
    if (!tensor) return null;
    return { shape: tensor.shape.slice(), dtype: tensor.dtype };
}

export function js_tensor_debug(
    varid: number,
): { shape: number[]; data: number[]; dtype: string } | null {
    flushBuffer(varid);
    const tensor = tfSpace[varid];
    if (!tensor) return null;
    return {
        shape: tensor.shape.slice(),
        data: Array.from(tensor.dataSync() as Float32Array),
        dtype: tensor.dtype,
    };
}

export function js_tensor_get_mat_data(
    tensorId: number,
): { data: Float32Array; rows: number; cols: number } | null {
    flushBuffer(tensorId);
    const tensor = tfSpace[tensorId];
    if (!tensor) {
        console.warn(`show_mat: tensor not found: tensorId=${tensorId}`);
        return null;
    }
    if (tensor.shape.length !== 2) {
        console.warn(`show_mat: expected 2D tensor, got ${tensor.shape.length}D`);
        return null;
    }
    const [rows, cols] = tensor.shape as [number, number];
    return { data: tensor.dataSync() as Float32Array, rows, cols };
}

export function js_tensor_get_field_data(
    tensorId: number,
): { dx: Float32Array; dy: Float32Array; rows: number; cols: number } | null {
    flushBuffer(tensorId);
    const tensor = tfSpace[tensorId];
    if (!tensor) return null;
    if (tensor.shape.length !== 3 || tensor.shape[0] !== 2) return null;
    const [, rows, cols] = tensor.shape as [number, number, number];
    const flat = tensor.dataSync() as Float32Array;
    return {
        dx: flat.slice(0, rows * cols),
        dy: flat.slice(rows * cols),
        rows,
        cols,
    };
}

function _perlinFade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
function _perlinLerp(a: number, b: number, t: number) { return a + t * (b - a); }
function _perlinGrad(hash: number, x: number, y: number) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}
function _perlin2D(x: number, y: number, perm: number[]): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = _perlinFade(xf);
    const v = _perlinFade(yf);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    return _perlinLerp(
        _perlinLerp(_perlinGrad(perm[a],     xf,     yf), _perlinGrad(perm[b],     xf - 1, yf),     u),
        _perlinLerp(_perlinGrad(perm[a + 1], xf,     yf - 1), _perlinGrad(perm[b + 1], xf - 1, yf - 1), u),
        v,
    );
}

export function js_tensor_perlin(varid: number, rows: number, cols: number): number {
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
    }
    const perm = [...p, ...p];

    const scale = 4;
    const eps = 1e-3;
    const dx_data = new Float32Array(rows * cols);
    const dy_data = new Float32Array(rows * cols);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const nx = (c / cols) * scale;
            const ny = (r / rows) * scale;
            const v  = _perlin2D(nx,       ny,       perm);
            dx_data[r * cols + c] = (_perlin2D(nx + eps, ny,       perm) - v) / eps;
            dy_data[r * cols + c] = (_perlin2D(nx,       ny + eps, perm) - v) / eps;
        }
    }

    const dxT = tf.tensor2d(dx_data, [rows, cols]);
    const dyT = tf.tensor2d(dy_data, [rows, cols]);
    const stacked = tf.stack([dxT, dyT], 0);
    dxT.dispose();
    dyT.dispose();

    if (tfSpace[varid]) tfSpace[varid].dispose();
    tfSpace[varid] = stacked;
    console.log(`js_tensor_perlin: varid=${varid}, shape=(2,${rows},${cols})`);
    return varid;
}

export function vec_field_to_image_url(
    dx: Float32Array,
    dy: Float32Array,
    rows: number,
    cols: number,
): string {
    const cellSize = Math.max(12, Math.min(48, Math.floor(512 / Math.max(rows, cols))));
    const canvas = document.createElement("canvas");
    canvas.width  = cols * cellSize;
    canvas.height = rows * cellSize;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#0d0d1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let maxMag = 0;
    for (let i = 0; i < rows * cols; i++) {
        const m = Math.sqrt(dx[i] ** 2 + dy[i] ** 2);
        if (m > maxMag) maxMag = m;
    }
    if (maxMag === 0) maxMag = 1;

    const arrowLen = cellSize * 0.72;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const vx = dx[idx] / maxMag;
            const vy = dy[idx] / maxMag;
            const mag = Math.sqrt(vx ** 2 + vy ** 2);

            const cx = c * cellSize + cellSize / 2;
            const cy = r * cellSize + cellSize / 2;
            const ex = cx + vx * arrowLen;
            const ey = cy + vy * arrowLen;

            const t = mag;
            const red   = Math.round(t * 255);
            const green = Math.round(t * 200 * (1 - t));
            const blue  = Math.round((1 - t) * 220);
            ctx.strokeStyle = `rgb(${red},${green},${blue})`;
            ctx.lineWidth = 1.2;

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(ex, ey);
            ctx.stroke();

            if (mag > 0.05) {
                const angle = Math.atan2(vy, vx);
                const headLen = arrowLen * 0.35;
                const a1 = angle + Math.PI * 0.75;
                const a2 = angle - Math.PI * 0.75;
                ctx.beginPath();
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex + Math.cos(a1) * headLen, ey + Math.sin(a1) * headLen);
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex + Math.cos(a2) * headLen, ey + Math.sin(a2) * headLen);
                ctx.stroke();
            }
        }
    }

    return canvas.toDataURL("image/png");
}

export function mat_data_to_image_url(
    data: Float32Array,
    rows: number,
    cols: number,
): string {
    const cellSize = Math.max(2, Math.min(32, Math.floor(512 / Math.max(rows, cols))));
    const canvas = document.createElement("canvas");
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;
    const ctx = canvas.getContext("2d")!;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const v = Math.max(0, Math.min(1, data[r * cols + c]));
            const gray = Math.round(v * 255);
            ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
            ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
    }
    return canvas.toDataURL("image/png");
}
