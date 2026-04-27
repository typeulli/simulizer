import WabtModule from 'wabt';

const WAT_URL = '/dist/bctool3d.wat';

let watSourcePromise: Promise<string> | null = null;
function getWatSource(): Promise<string> {
    if (!watSourcePromise) {
        watSourcePromise = fetch(WAT_URL).then((res) => {
            if (!res.ok) throw new Error(`WAT fetch failed: ${res.status} ${res.statusText}`);
            return res.text();
        });
    }
    return watSourcePromise;
}

export interface BoundaryData3D {
    count: number;
    nu: number;
    nv: number;
    u: Float64Array;
    v: Float64Array;
    x: Float64Array;
    y: Float64Array;
    z: Float64Array;
    dS: Float64Array;
    normal_x: Float64Array;
    normal_y: Float64Array;
    normal_z: Float64Array;
}

export interface BoundaryParams3D {
    uMin: number;
    uMax: number;
    du: number;
    vMin: number;
    vMax: number;
    dv: number;
    bufPtr?: number;
}

function replaceImportsWithFuncs(
    wat: string,
    replacements: Record<string, string>
): string {
    return wat.replace(
        /\(import\s+"env"\s+"(x_fn|y_fn|z_fn)"\s+\(func\s+\(;(\d+);\)\s+\(type\s+(\d+)\)\)\)/g,
        (_match, name: string, index: string, typeIdx: string) => {
            const body = replacements[name];
            if (!body) throw new Error(`No replacement for ${name}`);
            return `(func (;${index};) (type ${typeIdx})
    ${body.trim().split('\n').map((l) => '    ' + l).join('\n')}
)`;
        }
    );
}

function hoistMemoryImport(wat: string): string {
    const memImportRe = /^[ \t]*\(import "env" "memory"[^\n]*\n?/m;
    const m = memImportRe.exec(wat);
    if (!m) return wat;

    const memLine = m[0];
    const without = wat.slice(0, m.index) + wat.slice(m.index + memLine.length);

    const typeRe = /^[ \t]*\(type[^\n]*\n/gm;
    let lastEnd = 0;
    let hit: RegExpExecArray | null;
    while ((hit = typeRe.exec(without)) !== null) lastEnd = hit.index + hit[0].length;

    return without.slice(0, lastEnd) + memLine + without.slice(lastEnd);
}

/**
 * Injects x_fn/y_fn/z_fn, compiles to WASM, and returns 3D boundary data.
 * Each function has the signature (u: f64, v: f64) → f64.
 *
 * @param xFnBody    - x(u,v) function body (WAT instruction string)
 * @param yFnBody    - y(u,v) function body
 * @param zFnBody    - z(u,v) function body
 * @param params     - u/v range and buffer pointer
 */
export async function computeBoundary3D(
    xFnBody: string,
    yFnBody: string,
    zFnBody: string,
    params: BoundaryParams3D = { uMin: -2, uMax: 2, du: 0.2, vMin: -2, vMax: 2, dv: 0.2 }
): Promise<BoundaryData3D> {
    const watContent = await getWatSource();

    let modifiedWat = replaceImportsWithFuncs(watContent, {
        x_fn: xFnBody,
        y_fn: yFnBody,
        z_fn: zFnBody,
    });
    modifiedWat = hoistMemoryImport(modifiedWat);

    const wabt = await WabtModule();
    const wabtMod = wabt.parseWat('bctool3d_modified.wat', modifiedWat);
    const { buffer: wasmBytes } = wabtMod.toBinary({});
    wabtMod.destroy();

    // Required memory: 9 * nu * nv * 8 bytes — allocate 4 pages (256 KB) for headroom
    const memory = new WebAssembly.Memory({ initial: 4 });
    const { instance } = (await WebAssembly.instantiate(wasmBytes, {
        env: { memory },
    })) as unknown as WebAssembly.WebAssemblyInstantiatedSource;

    const { uMin, uMax, du, vMin, vMax, dv, bufPtr = 0 } = params;

    const get3dBoundary = instance.exports.get_3d_boundary as (
        uMin: number, uMax: number, du: number,
        vMin: number, vMax: number, dv: number,
        bufPtr: number
    ) => number;

    const count = get3dBoundary(uMin, uMax, du, vMin, vMax, dv, bufPtr);
    if (count <= 0) throw new Error('get_3d_boundary returned 0 — check your parameters');

    const nu = Math.floor((uMax - uMin) / du) + 1;
    const nv = Math.floor((vMax - vMin) / dv) + 1;
    const n    = count;
    const B    = Float64Array.BYTES_PER_ELEMENT;
    const buf = memory.buffer;

    return {
        count, nu, nv,
        u:        new Float64Array(buf, bufPtr + B * 0 * n, n),
        v:        new Float64Array(buf, bufPtr + B * 1 * n, n),
        x:        new Float64Array(buf, bufPtr + B * 2 * n, n),
        y:        new Float64Array(buf, bufPtr + B * 3 * n, n),
        z:        new Float64Array(buf, bufPtr + B * 4 * n, n),
        dS:       new Float64Array(buf, bufPtr + B * 5 * n, n),
        normal_x: new Float64Array(buf, bufPtr + B * 6 * n, n),
        normal_y: new Float64Array(buf, bufPtr + B * 7 * n, n),
        normal_z: new Float64Array(buf, bufPtr + B * 8 * n, n),
    };
}
