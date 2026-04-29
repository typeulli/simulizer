import * as tf from '@tensorflow/tfjs';
import * as Blockly from "blockly/core";

const tfSpace: { [key: number]: tf.Tensor } = {};
// 쓰기 중인 텐서는 tf.TensorBuffer로 관리한다 (TF 텐서는 불변이므로)
const bufferSpace: { [key: number]: tf.TensorBuffer<tf.Rank, "float32"> } = {};
let tempTensorCounter = 1000000;  // 임시 텐서 ID 카운터

/** 이전 실행의 텐서/버퍼를 모두 해제하고 카운터를 초기화한다. */
export function js_tensor_reset() {
    for (const id of Object.keys(bufferSpace)) delete bufferSpace[Number(id)];
    for (const id of Object.keys(tfSpace)) {
        try { tfSpace[Number(id)].dispose(); } catch { /* ignore */ }
        delete tfSpace[Number(id)];
    }
    tempTensorCounter = 1000000;
}

/** bufferSpace에 있는 버퍼를 tfSpace의 텐서로 커밋한다. */
function flushBuffer(tensorId: number) {
    const buf = bufferSpace[tensorId];
    if (!buf) return;
    if (tfSpace[tensorId]) tfSpace[tensorId].dispose();
    tfSpace[tensorId] = buf.toTensor();
    delete bufferSpace[tensorId];
}

/** tfSpace의 텐서를 bufferSpace에 가변 버퍼로 전개한다. */
function openBuffer(tensorId: number) {
    if (bufferSpace[tensorId]) return; // 이미 열려 있음
    const tensor = tfSpace[tensorId];
    if (!tensor) return;
    bufferSpace[tensorId] = tf.buffer(tensor.shape as number[], "float32", tensor.dataSync() as Float32Array);
}

/** WASM 메모리에서 null-terminated 문자열을 읽어 텐서를 생성하는 JS 핸들러 */
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

/**
 * 랜덤 분포로 텐서를 생성한다.
 * distType: 0 = uniform(min, max), 1 = normal(mean, stddev), 2 = truncatedNormal(mean, stddev)
 */
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

/** 텐서에 스칼라를 곱해 새로운 임시 텐서를 생성하고 ID를 반환한다. */
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

/** 두 텐서를 element-wise 빼서 새로운 임시 텐서를 생성하고 ID를 반환한다. */
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

/** 두 2D 텐서를 행렬곱(matmul)해 새로운 임시 텐서를 생성하고 ID를 반환한다. */
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

/** 텐서의 부호를 반전(element-wise neg)해 새로운 임시 텐서를 생성하고 ID를 반환한다. */
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

/** element-wise 곱(Hadamard product)해 새로운 임시 텐서를 생성하고 ID를 반환한다. */
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

/** 두 텐서를 element-wise 더해 새로운 임시 텐서를 생성하고 ID를 반환한다. */
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

/** 임시 텐서를 최종 변수 ID로 저장한다. */
export function js_tensor_save(outVarId: number, tensorId: number): number {
    flushBuffer(tensorId);
    if (!tfSpace[tensorId]) {
        console.warn(`Source tensor not found: tensorId=${tensorId}`);
        return 0;
    }

    // 기존 out 텐서 해제
    if (tfSpace[outVarId] && outVarId !== tensorId) {
        tfSpace[outVarId].dispose();
    }
    tfSpace[outVarId] = tfSpace[tensorId];

    // 임시 텐서(tempTensorCounter 범위)이면 참조 제거
    if (tensorId >= 1000000) {
        delete tfSpace[tensorId];
    }

    console.log(`js_tensor_save: outVarId=${outVarId}, tensorId=${tensorId}`);
    return outVarId;
}

/** 다차원 인덱스를 flat index로 변환한다. */
function multiIndexToFlat(indices: number[], shape: number[]): number {
    let flatIndex = 0;
    let stride = 1;
    // 역순으로 계산 (마지막 차원부터)
    for (let i = indices.length - 1; i >= 0; i--) {
        flatIndex += indices[i] * stride;
        stride *= shape[i];
    }
    return flatIndex;
}

const MAX_DIM = 6;

/** 텐서의 특정 인덱스에 값을 설정한다. (최대 6차원, 개별 인덱스 전달) */
export function js_tensor_set(
    tensorId: number,
    n: number,
    i0: number, i1: number, i2: number, i3: number, i4: number, i5: number,
    value: number,
): number {
    // 버퍼가 없으면 텐서를 가변 버퍼로 전개
    if (!bufferSpace[tensorId]) openBuffer(tensorId);
    const buf = bufferSpace[tensorId];
    if (!buf) { console.warn(`Tensor not found for set: tensorId=${tensorId}`); return 0; }

    const indices = [i0, i1, i2, i3, i4, i5].slice(0, n) as number[];
    buf.set(value, ...indices);
    return tensorId;
}

/** 텐서의 특정 인덱스에서 값을 가져온다. (최대 6차원, 개별 인덱스 전달) */
export function js_tensor_get(
    tensorId: number,
    n: number,
    i0: number, i1: number, i2: number, i3: number, i4: number, i5: number,
): number {
    // 쓰기 버퍼가 열려 있으면 직접 읽고, 없으면 텐서에서 읽는다
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

/** 텐서 id의 내용을 문자열로 반환한다. */
export function js_tensor_toString(varid: number): string {
    flushBuffer(varid);
    const tensor = tfSpace[varid];
    if (!tensor) return `Tensor not found: varid=${varid}`;
    const shape = tensor.shape;
    const data = Array.from(tensor.dataSync());
    
    // shape에 맞춰 다차원 배열로 재구성
    function reshape(arr: number[], shape: number[]): any {
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

/** 2D 텐서의 raw 데이터를 추출한다 (Worker에서 호출 가능, DOM 불필요). */
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

/** (2, rows, cols) 텐서에서 벡터장 데이터를 추출한다 (Worker에서 호출 가능). */
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

// ── Perlin Noise 헬퍼 ──────────────────────────────────────────────────────────

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

/**
 * (2, rows, cols) 형태의 Perlin Noise 그라디언트 텐서를 생성한다.
 * channel 0 = dx (∂noise/∂x), channel 1 = dy (∂noise/∂y)
 */
export function js_tensor_perlin(varid: number, rows: number, cols: number): number {
    // 랜덤 치환 테이블 생성
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
    const stacked = tf.stack([dxT, dyT], 0); // shape: (2, rows, cols)
    dxT.dispose();
    dyT.dispose();

    if (tfSpace[varid]) tfSpace[varid].dispose();
    tfSpace[varid] = stacked;
    console.log(`js_tensor_perlin: varid=${varid}, shape=(2,${rows},${cols})`);
    return varid;
}

/**
 * (dx, dy) 벡터장 데이터를 화살표 그리드 이미지로 변환한다 (메인 스레드 전용, DOM 필요).
 * dx, dy 는 각각 rows×cols Float32Array.
 */
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

    // 배경
    ctx.fillStyle = "#0d0d1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 최대 크기로 정규화
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

            // 크기에 따라 색상 그라데이션 (파랑 → 보라 → 노랑)
            const t = mag;
            const red   = Math.round(t * 255);
            const green = Math.round(t * 200 * (1 - t));
            const blue  = Math.round((1 - t) * 220);
            ctx.strokeStyle = `rgb(${red},${green},${blue})`;
            ctx.lineWidth = 1.2;

            // 몸통
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(ex, ey);
            ctx.stroke();

            // 화살촉
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

/** Float32Array 데이터를 그레이스케일 히트맵 data URL로 변환한다 (메인 스레드 전용, DOM 필요). */
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

import { simulizer } from "../engine";
import { BlockBuilder, GetVarID, type BlockSet, type CompileCtx } from "./$base";

function buildTensorCreateCall(block: Blockly.Block, ctx: CompileCtx): simulizer.Call | null {
    const name = `__tensor_${block.id}`;

    const arrBlock = block.getInputTargetBlock("ARRAY");
    if (!arrBlock) return null;

    const arrName = arrBlock.getFieldValue("NAME") as string;
    const arrInfo = ctx.arrays?.get(arrName);
    const capacity = arrInfo ? arrInfo.def.capacity : 0;

    const val = ctx.blockToExpr(arrBlock, ctx);
    if (!val) return null;

    return new simulizer.Call(
        "tensor_create",
        [
            simulizer.i32c(GetVarID(name)),
            ctx.coerce(val, simulizer.i32),
            simulizer.i32c(capacity),
        ],
        simulizer.i32
    );
}

function buildTensorRandomCall(block: Blockly.Block, ctx: CompileCtx): simulizer.Call | null {
    const name = `__tensor_${block.id}`;
    const distType = parseInt(block.getFieldValue("DIST") as string, 10);

    const param1Block = block.getInputTargetBlock("PARAM1");
    const param2Block = block.getInputTargetBlock("PARAM2");
    const arrBlock = block.getInputTargetBlock("ARRAY");
    if (!param1Block || !param2Block || !arrBlock) return null;

    const param1Expr = ctx.blockToExpr(param1Block, ctx);
    const param2Expr = ctx.blockToExpr(param2Block, ctx);
    const arrExpr = ctx.blockToExpr(arrBlock, ctx);
    if (!param1Expr || !param2Expr || !arrExpr) return null;

    const arrName = arrBlock.getFieldValue("NAME") as string;
    const arrInfo = ctx.arrays?.get(arrName);
    const capacity = arrInfo ? arrInfo.def.capacity : 0;

    return new simulizer.Call(
        "tensor_random",
        [
            simulizer.i32c(GetVarID(name)),
            simulizer.i32c(distType),
            ctx.coerce(param1Expr, simulizer.f64),
            ctx.coerce(param2Expr, simulizer.f64),
            ctx.coerce(arrExpr, simulizer.i32),
            simulizer.i32c(capacity),
        ],
        simulizer.i32,
    );
}

function buildTensorGetCall(block: Blockly.Block): simulizer.Const {
    const srcName = block.getFieldValue("NAME") as string;
    return simulizer.i32c(GetVarID(srcName));
}


function buildTensorSaveCall(block: Blockly.Block, ctx: CompileCtx): simulizer.Expr | null {
    const name = block.getFieldValue("NAME") as string;
    const exprBlock = block.getInputTargetBlock("EXPR");

    if (!exprBlock) return null;

    const exprExpr = ctx.blockToExpr(exprBlock, ctx);
    if (!exprExpr) return null;

    return new simulizer.Drop(new simulizer.Call(
        "tensor_save",
        [
            simulizer.i32c(GetVarID(name)),
            ctx.coerce(exprExpr, simulizer.i32),
        ],
        simulizer.i32,
    ));
}

function buildTensorSetByIndexCall(block: Blockly.Block, ctx: CompileCtx): simulizer.Expr | null {
    const tensorName = block.getFieldValue("TENSOR_NAME") as string;
    const dim = Math.max(1, parseInt(block.getFieldValue("DIM") || "1", 10));
    const valueBlock = block.getInputTargetBlock("VALUE");
    if (!valueBlock) return null;
    const valueExpr = ctx.blockToExpr(valueBlock, ctx);
    if (!valueExpr) return null;

    const indexArgs: simulizer.Expr[] = [];
    for (let i = 0; i < MAX_DIM; i++) {
        const idxBlock = i < dim ? block.getInputTargetBlock(`INDEX_${i}`) : null;
        const idxExpr = idxBlock ? ctx.blockToExpr(idxBlock, ctx) : null;
        indexArgs.push(idxExpr ? ctx.coerce(idxExpr, simulizer.i32) : simulizer.i32c(0));
    }

    return new simulizer.Drop(new simulizer.Call(
        "tensor_set",
        [simulizer.i32c(GetVarID(tensorName)), simulizer.i32c(dim), ...indexArgs, ctx.coerce(valueExpr, simulizer.f64)],
        simulizer.i32,
    ));
}

function buildTensorGetByIndexCall(block: Blockly.Block, ctx: CompileCtx): simulizer.Call | null {
    const tensorName = block.getFieldValue("TENSOR_NAME") as string;
    const dim = Math.max(1, parseInt(block.getFieldValue("DIM") || "1", 10));

    const indexArgs: simulizer.Expr[] = [];
    for (let i = 0; i < MAX_DIM; i++) {
        const idxBlock = i < dim ? block.getInputTargetBlock(`INDEX_${i}`) : null;
        const idxExpr = idxBlock ? ctx.blockToExpr(idxBlock, ctx) : null;
        indexArgs.push(idxExpr ? ctx.coerce(idxExpr, simulizer.i32) : simulizer.i32c(0));
    }

    return new simulizer.Call(
        "tensor_get",
        [simulizer.i32c(GetVarID(tensorName)), simulizer.i32c(dim), ...indexArgs],
        simulizer.f64,
    );
}

export const TENSOR_BLOCKS: BlockSet = {
    TENSOR_RANDOM: new BlockBuilder("tensor_random", "i32", 160,"랜덤 텐서 생성 (id 반환)")
        .addBody("TENSOR_RANDOM dist:%1 p1:%2 p2:%3 shape:%4")
        .addArgDropdown("DIST", [["uniform", "0"], ["normal", "1"], ["truncNormal", "2"]])
        .addArgValue("PARAM1", "f64")
        .addArgValue("PARAM2", "f64")
        .addArgValue("ARRAY", "i32*")
        .expr((block, ctx) => buildTensorRandomCall(block, ctx)),
    TENSOR_CREATE: new BlockBuilder("tensor_create", "i32", 160,"텐서 생성 (id 반환)")
        .addBody("TENSOR_CREATE (data: %1)")
        .addArgValue("ARRAY", "i32*")
        .expr((block, ctx) => buildTensorCreateCall(block, ctx)),
    TENSOR_GET: new BlockBuilder("tensor_get", "i32", 160,"텐서 가져오기 (id 반환)")
        .addBody("TENSOR_GET %1")
        .addArg("field_input", "NAME", "t")
        .expr((block) => buildTensorGetCall(block)),
    TENSOR_SAVE: new BlockBuilder("tensor_save", undefined, 160,"텐서 저장 TENSOR %1 = %2")
        .addBody("TENSOR %1 = %2")
        .addArg("field_input", "NAME", "out")
        .addArgValue("EXPR", "i32")
        .stmt((block, ctx) => buildTensorSaveCall(block, ctx)),
    TENSOR_BINOP: new BlockBuilder("tensor_binop", "i32", 160,"텐서 이항 연산")
        .addBody("%1 %2 %3")
        .addArgValue("LHS", "i32")
        .addArgDropdown("OP", [["+", "add"], ["-", "sub"], ["@", "matmul"], ["⊙", "elemul"]])
        .addArgValue("RHS", "i32")
        .expr((block, ctx) => {
            const lhsBlock = block.getInputTargetBlock("LHS");
            const rhsBlock = block.getInputTargetBlock("RHS");
            if (!lhsBlock || !rhsBlock) return null;
            const lhsExpr = ctx.blockToExpr(lhsBlock, ctx);
            const rhsExpr = ctx.blockToExpr(rhsBlock, ctx);
            if (!lhsExpr || !rhsExpr) return null;
            const op = block.getFieldValue("OP") as string;
            return new simulizer.Call(`tensor_${op}`,
                [ctx.coerce(lhsExpr, simulizer.i32), ctx.coerce(rhsExpr, simulizer.i32)],
                simulizer.i32);
        }),
    TENSOR_UNOP: new BlockBuilder("tensor_unop", "i32", 160,"텐서 단항 연산")
        .addBody("%1 %2")
        .addArgDropdown("OP", [["neg", "neg"]])
        .addArgValue("TENSOR", "i32")
        .expr((block, ctx) => {
            const tensorBlock = block.getInputTargetBlock("TENSOR");
            if (!tensorBlock) return null;
            const tensorExpr = ctx.blockToExpr(tensorBlock, ctx);
            if (!tensorExpr) return null;
            const op = block.getFieldValue("OP") as string;
            return new simulizer.Call(`tensor_${op}`,
                [ctx.coerce(tensorExpr, simulizer.i32)],
                simulizer.i32);
        }),
    TENSOR_SCALE: new BlockBuilder("tensor_scale", "i32", 160,"텐서 상수배 %1 × %2")
        .addBody("%1 × %2")
        .addArgValue("TENSOR", "i32")
        .addArgValue("SCALAR", "f64")
        .expr((block, ctx) => {
            const tensorBlock = block.getInputTargetBlock("TENSOR");
            const scalarBlock = block.getInputTargetBlock("SCALAR");
            if (!tensorBlock || !scalarBlock) return null;
            const tensorExpr = ctx.blockToExpr(tensorBlock, ctx);
            const scalarExpr = ctx.blockToExpr(scalarBlock, ctx);
            if (!tensorExpr || !scalarExpr) return null;
            return new simulizer.Call(
                "tensor_scale",
                [
                    ctx.coerce(tensorExpr, simulizer.i32),
                    ctx.coerce(scalarExpr, simulizer.f64),
                ],
                simulizer.i32,
            );
        }),
    TENSOR_SET_BY_INDEX: new BlockBuilder("tensor_set_by_index", undefined, 160,"텐서 요소 설정")
        .addBody("dummy — registered directly via Blockly.Blocks")
        .stmt((block, ctx) => buildTensorSetByIndexCall(block, ctx)),
    TENSOR_GET_BY_INDEX: new BlockBuilder("tensor_get_by_index", "f64", 160,"텐서 요소 읽기")
        .addBody("dummy — registered directly via Blockly.Blocks")
        .expr((block, ctx) => buildTensorGetByIndexCall(block, ctx)),
    TENSOR_PERLIN: new BlockBuilder("tensor_perlin", "i32", 160,"Perlin Noise 벡터장 텐서 생성 (2, rows, cols)")
        .addBody("PERLIN_NOISE rows:%1 cols:%2")
        .addArgValue("ROWS", "i32")
        .addArgValue("COLS", "i32")
        .expr((block, ctx) => {
            const name = `__tensor_${block.id}`;
            const rowsBlock = block.getInputTargetBlock("ROWS");
            const colsBlock = block.getInputTargetBlock("COLS");
            if (!rowsBlock || !colsBlock) return null;
            const rowsExpr = ctx.blockToExpr(rowsBlock, ctx);
            const colsExpr = ctx.blockToExpr(colsBlock, ctx);
            if (!rowsExpr || !colsExpr) return null;
            return new simulizer.Call(
                "tensor_perlin",
                [
                    simulizer.i32c(GetVarID(name)),
                    ctx.coerce(rowsExpr, simulizer.i32),
                    ctx.coerce(colsExpr, simulizer.i32),
                ],
                simulizer.i32,
            );
        }),
    TENSOR_SHOW_MAT: new BlockBuilder("tensor_show_mat", undefined, 160,"2D 텐서 시각화")
        .addBody("show_mat %1")
        .addArgValue("TENSOR_ID", "i32")
        .stmt((block, ctx) => {
            const tensorIdBlock = block.getInputTargetBlock("TENSOR_ID");
            if (!tensorIdBlock) return null;
            const tensorIdExpr = ctx.blockToExpr(tensorIdBlock, ctx);
            if (!tensorIdExpr) return null;
            return new simulizer.Drop(new simulizer.Call(
                "show_mat",
                [ctx.coerce(tensorIdExpr, simulizer.i32)],
                simulizer.i32,
            ));
        }),
}

/** tensor_set_by_index / tensor_get_by_index를 동적 입력(n차원 인덱스)으로 등록한다. */
export function registerDynamicTensorBlocks() {
    Blockly.Blocks["tensor_set_by_index"] = {
            init(this: Blockly.Block) {
                this.appendDummyInput("HEADER")
                    .appendField("TENSOR")
                    .appendField(new Blockly.FieldTextInput("t"), "TENSOR_NAME")
                    .appendField("[");
                this.appendValueInput("INDEX_0").setCheck("i32");
                this.appendDummyInput("MID").appendField("] =");
                this.appendValueInput("VALUE").setCheck("f64");
                this.appendDummyInput("DIM_ROW")
                    .appendField("dims:")
                    .appendField(new Blockly.FieldNumber(1, 1, MAX_DIM, 1), "DIM");
                this.setInputsInline(true);
                this.setPreviousStatement(true, null);
                this.setNextStatement(true, null);
                this.setColour(160);
                this.setTooltip("텐서 요소 설정");
                this.setOnChange(() => (this as any).updateShape_());
            },
            mutationToDom(this: Blockly.Block) {
                const el = document.createElement("mutation");
                el.setAttribute("dim", String(Math.max(1, parseInt(this.getFieldValue("DIM") || "1", 10))));
                return el;
            },
            domToMutation(this: Blockly.Block, xmlElement: Element) {
                const dim = Math.max(1, parseInt(xmlElement.getAttribute("dim") || "1", 10));
                (this as any).updateShape_(dim);
            },
            updateShape_(this: Blockly.Block, targetDim?: number) {
                const dim = targetDim ?? Math.max(1, parseInt(this.getFieldValue("DIM") || "1", 10));
                const existing = this.inputList.filter(i => i.name.startsWith("INDEX_")).length;
                if (dim > existing) {
                    for (let i = existing; i < dim; i++) {
                        this.appendValueInput(`INDEX_${i}`).setCheck("i32");
                        this.moveInputBefore(`INDEX_${i}`, "MID");
                    }
                } else {
                    for (let i = existing - 1; i >= dim; i--) {
                        this.removeInput(`INDEX_${i}`);
                    }
                }
            },
        };

    Blockly.Blocks["tensor_get_by_index"] = {
            init(this: Blockly.Block) {
                this.appendDummyInput("HEADER")
                    .appendField("TENSOR")
                    .appendField(new Blockly.FieldTextInput("t"), "TENSOR_NAME")
                    .appendField("[");
                this.appendValueInput("INDEX_0").setCheck("i32");
                this.appendDummyInput("FOOTER").appendField("]");
                this.appendDummyInput("DIM_ROW")
                    .appendField("dims:")
                    .appendField(new Blockly.FieldNumber(1, 1, MAX_DIM, 1), "DIM");
                this.setInputsInline(true);
                this.setOutput(true, "f64");
                this.setColour(160);
                this.setTooltip("텐서 요소 읽기");
                this.setOnChange(() => (this as any).updateShape_());
            },
            mutationToDom(this: Blockly.Block) {
                const el = document.createElement("mutation");
                el.setAttribute("dim", String(Math.max(1, parseInt(this.getFieldValue("DIM") || "1", 10))));
                return el;
            },
            domToMutation(this: Blockly.Block, xmlElement: Element) {
                const dim = Math.max(1, parseInt(xmlElement.getAttribute("dim") || "1", 10));
                (this as any).updateShape_(dim);
            },
            updateShape_(this: Blockly.Block, targetDim?: number) {
                const dim = targetDim ?? Math.max(1, parseInt(this.getFieldValue("DIM") || "1", 10));
                const existing = this.inputList.filter(i => i.name.startsWith("INDEX_")).length;
                if (dim > existing) {
                    for (let i = existing; i < dim; i++) {
                        this.appendValueInput(`INDEX_${i}`).setCheck("i32");
                        this.moveInputBefore(`INDEX_${i}`, "FOOTER");
                    }
                } else {
                    for (let i = existing - 1; i >= dim; i--) {
                        this.removeInput(`INDEX_${i}`);
                    }
                }
            },
        };
}

export function xmlTensorBlocks(cat: string) {
    return `<category name="${cat}" colour="${160}">
    <block type="tensor_create">
        <value name="ARRAY"><block type="local_array_get_i32"></block></value>
    </block>
    <block type="tensor_get"></block>
    <block type="tensor_binop">
        <value name="LHS"><block type="tensor_get"></block></value>
        <value name="RHS"><block type="tensor_get"></block></value>
    </block>
    <block type="tensor_unop">
        <value name="TENSOR"><block type="tensor_get"></block></value>
    </block>
    <block type="tensor_scale">
        <value name="TENSOR"><block type="tensor_get"></block></value>
        <value name="SCALAR"><block type="f64_const"><field name="VALUE">2</field></block></value>
    </block>
    <block type="tensor_save">
        <value name="EXPR"><block type="tensor_binop"></block></value>
    </block>
    <block type="tensor_random">
        <value name="PARAM1"><block type="f64_const"><field name="VALUE">0</field></block></value>
        <value name="PARAM2"><block type="f64_const"><field name="VALUE">1</field></block></value>
        <value name="ARRAY"><block type="local_array_get_i32"></block></value>
    </block>
    <block type="tensor_perlin">
        <value name="ROWS"><block type="i32_const"><field name="VALUE">16</field></block></value>
        <value name="COLS"><block type="i32_const"><field name="VALUE">16</field></block></value>
    </block>
    <block type="tensor_set_by_index"></block>
    <block type="tensor_get_by_index"></block>
    <block type="tensor_show_mat">
        <value name="TENSOR_ID"><block type="tensor_get"></block></value>
    </block>
</category>`;
}
