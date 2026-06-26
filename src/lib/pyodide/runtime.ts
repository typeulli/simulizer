import type { Formula2DSpec } from '@/lib/bctool2d/formula2d';
import type { Formula3DSpec } from '@/lib/bctool3d/formula3d';

/**
 * Minimal Pyodide integration. Pyodide (a full CPython compiled to WASM) is
 * loaded once from the official CDN — it is not an npm dependency, which keeps
 * it out of the Next.js bundle. The user's Python script runs in this runtime
 * with `add_formula` / `add_formula3d` bound so we can collect the LaTeX
 * formulas they declare.
 *
 * NOTE: the CDN load needs network access on first run (≈6–10 MB, cached after).
 */

const PYODIDE_VERSION = '0.27.5';
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pyodide = any;

let pyodidePromise: Promise<Pyodide> | null = null;

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[data-pyodide]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.dataset.pyodide = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load Pyodide from ${src}`));
        document.head.appendChild(script);
    });
}

/** Loads (once) and returns the shared Pyodide instance. */
export function getPyodide(): Promise<Pyodide> {
    if (!pyodidePromise) {
        pyodidePromise = (async () => {
            await loadScript(`${INDEX_URL}pyodide.js`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const loadPyodide = (window as any).loadPyodide as (opts: { indexURL: string }) => Promise<Pyodide>;
            if (!loadPyodide) throw new Error('Pyodide failed to initialise');
            return await loadPyodide({ indexURL: INDEX_URL });
        })().catch((e) => {
            pyodidePromise = null; // allow retry after a failed load
            throw e;
        });
    }
    return pyodidePromise;
}

const PRELUDE = `
import json as _json
_FORMULAS_2D = []
_FORMULAS_3D = []

def add_formula(x, y=None, *, t_min=None, t_max=None, dt=None):
    """Declare a 2D boundary curve.

    Parametric:  add_formula("\\\\cos(t)", "\\\\sin(t)")
    Explicit:    add_formula("y = x^2")
    """
    _FORMULAS_2D.append({"x": x, "y": y, "t_min": t_min, "t_max": t_max, "dt": dt})

def add_formula3d(x, y, z, *, u_min=None, u_max=None, du=None,
                  v_min=None, v_max=None, dv=None):
    """Declare a 3D parametric surface x(u,v), y(u,v), z(u,v)."""
    _FORMULAS_3D.append({
        "x": x, "y": y, "z": z,
        "u_min": u_min, "u_max": u_max, "du": du,
        "v_min": v_min, "v_max": v_max, "dv": dv,
    })
`;

export type { Formula3DSpec };

export interface FormulaCollection {
    formulas2d: Formula2DSpec[];
    formulas3d: Formula3DSpec[];
}

/**
 * Runs the user's Python `code` and returns every formula it declared via
 * `add_formula` / `add_formula3d`. Python exceptions surface as Error messages.
 */
export async function runPythonFormulas(code: string): Promise<FormulaCollection> {
    const py = await getPyodide();
    py.runPython(PRELUDE);
    py.runPython(code);
    const json2d = py.runPython('_json.dumps(_FORMULAS_2D)') as string;
    const json3d = py.runPython('_json.dumps(_FORMULAS_3D)') as string;
    return {
        formulas2d: JSON.parse(json2d) as Formula2DSpec[],
        formulas3d: JSON.parse(json3d) as Formula3DSpec[],
    };
}
