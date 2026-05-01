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

export function js_tensor_create(
    memory: WebAssembly.Memory,
    varid: number,
    ptr: number,
    cap: number,
): number {
    const dimList: number[] = simulizer.pipe.load_arr_i32(memory, ptr, cap) || [];
    console.log(`js_tensor_create: varid=${varid}, ptr=0x${ptr.toString(16)}, cap=${cap}, dimList=[${dimList.join(", ")}]`);
    tfSpace[varid] = tf.zeros(dimList, "float32");
    return varid;
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
    let tensor: tf.Tensor;
    if (distType === 1) {
        tensor = tf.randomNormal(dimList, param1, param2, "float32");
    } else if (distType === 2) {
        tensor = tf.truncatedNormal(dimList, param1, param2, "float32");
    } else {
        tensor = tf.randomUniform(dimList, param1, param2, "float32");
    }
    tfSpace[varid] = tensor;
    console.log(`js_tensor_random: varid=${varid}, distType=${distType}, p1=${param1}, p2=${param2}, shape=[${dimList.join(", ")}]`);
    return varid;
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
