import WabtModule from 'wabt';

const WAT_URL = '/dist/bctool2d.wat';

// Fetched once on first call — subsequent calls reuse the cached Promise (avoids SSR)
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

export interface BoundaryData {
    count: number;
    t: Float64Array;
    x: Float64Array;
    y: Float64Array;
    dl: Float64Array;
    tangent_x: Float64Array;
    tangent_y: Float64Array;
    normal_x: Float64Array;
    normal_y: Float64Array;
}

export interface BoundaryParams {
    tMin: number;
    tMax: number;
    dt: number;
    bufPtr?: number;
}

function replaceImportsWithFuncs(
    wat: string,
    replacements: Record<string, string>
): string {
    return wat.replace(
        /\(import\s+"env"\s+"(x_fn|y_fn)"\s+\(func\s+\(;(\d+);\)\s+\(type\s+(\d+)\)\)\)/g,
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

    // Insert immediately after the last (type ...) declaration
    const typeRe = /^[ \t]*\(type[^\n]*\n/gm;
    let lastEnd = 0;
    let hit: RegExpExecArray | null;
    while ((hit = typeRe.exec(without)) !== null) lastEnd = hit.index + hit[0].length;

    return without.slice(0, lastEnd) + memLine + without.slice(lastEnd);
}

/**
 * Injects x_fn/y_fn, compiles to WASM, and returns boundary data.
 * The WAT source is fetched only once at module load time.
 *
 * @param xFnBody    - x_fn function body (WAT instruction string)
 * @param yFnBody    - y_fn function body (WAT instruction string)
 * @param params     - parameter range and buffer pointer
 */
export async function computeBoundary(
    xFnBody: string,
    yFnBody: string,
    params: BoundaryParams = { tMin: 0.0, tMax: 10.0, dt: 0.1 }
): Promise<BoundaryData> {
    const watContent = await getWatSource();

    // Replace x_fn / y_fn imports with concrete implementations
    let modifiedWat = replaceImportsWithFuncs(watContent, {
        x_fn: xFnBody,
        y_fn: yFnBody,
    });
    modifiedWat = hoistMemoryImport(modifiedWat);

    // Compile WAT → WASM (in-browser)
    const wabt = await WabtModule();
    const wabtMod = wabt.parseWat('bcgen_modified.wat', modifiedWat);
    const { buffer: wasmBytes } = wabtMod.toBinary({});
    wabtMod.destroy();

    // Allocate memory (1 page = 64 KB) and instantiate
    const memory = new WebAssembly.Memory({ initial: 1 });
    const { instance } = (await WebAssembly.instantiate(wasmBytes, {
        env: { memory },
    })) as unknown as WebAssembly.WebAssemblyInstantiatedSource;

    // get_2d_boundary(t_min, t_max, dt, buf_ptr) → point count
    const { tMin, tMax, dt, bufPtr = 0 } = params;
    const get2dBoundary = instance.exports.get_2d_boundary as (
        tMin: number, tMax: number, dt: number, bufPtr: number
    ) => number;
    const count = get2dBoundary(tMin, tMax, dt, bufPtr);

    // Memory layout (Float64, relative to bufPtr):
    // [0    .. n-1  ] t_values (n)
    // [n    .. 2n-1 ] x_values  (n)
    // [2n   .. 3n-1 ] y_values  (n)
    // [3n   .. 4n-2 ] dl_values (n-1)
    // [4n-1 .. 5n-2 ] tangent_x (n)
    // [5n-1 .. 6n-2 ] tangent_y (n)
    // [6n-1 .. 7n-2 ] normal_x  (n)
    // [7n-1 .. 8n-2 ] normal_y  (n)
    const n = count;
    const buf = memory.buffer;
    const B = Float64Array.BYTES_PER_ELEMENT;

    return {
        count,
        t:         new Float64Array(buf, bufPtr + B * 0,           n),
        x:         new Float64Array(buf, bufPtr + B * n,           n),
        y:         new Float64Array(buf, bufPtr + B * (2 * n),     n),
        dl:        new Float64Array(buf, bufPtr + B * (3 * n), n - 1),
        tangent_x: new Float64Array(buf, bufPtr + B * (4 * n - 1), n),
        tangent_y: new Float64Array(buf, bufPtr + B * (5 * n - 1), n),
        normal_x:  new Float64Array(buf, bufPtr + B * (6 * n - 1), n),
        normal_y:  new Float64Array(buf, bufPtr + B * (7 * n - 1), n),
    };
}

