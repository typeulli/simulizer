import { compileLatexFn, lhsVariable } from '@/utils/tex/evalAst';
import type { BoundaryData } from './bctool2d';

/**
 * One `add_formula(...)` call collected from the user's Python script.
 *
 *  - parametric:  add_formula("\\cos(t)", "\\sin(t)")   → x(t), y(t)
 *  - explicit:    add_formula("y = x^2")                → x = t, y(t) = (t)^2
 *
 * t_min / t_max / dt override the page defaults for this curve only.
 */
export interface Formula2DSpec {
    x: string | null;
    y: string | null;
    t_min: number | null;
    t_max: number | null;
    dt: number | null;
}

interface Range {
    tMin: number;
    tMax: number;
    dt: number;
}

function resolveFns(spec: Formula2DSpec): {
    xFn: (t: number) => number;
    yFn: (t: number) => number;
} {
    // Parametric form: both x(t) and y(t) given.
    if (spec.x != null && spec.y != null) {
        return {
            xFn: compileLatexFn(spec.x, 't'),
            yFn: compileLatexFn(spec.y, 't'),
        };
    }

    // Explicit form: a single equation such as "y = x^2" or "x = y^2".
    const single = (spec.x ?? spec.y ?? '').trim();
    if (!single) throw new Error('add_formula(): expression is empty');

    const lhs = lhsVariable(single);
    if (lhs === 'x') {
        // x = f(y): parametrise by y = t.
        return { xFn: compileLatexFn(single, 'y'), yFn: (t) => t };
    }
    // Default (lhs === 'y' or no "="): y = f(x), parametrise by x = t.
    return { xFn: (t) => t, yFn: compileLatexFn(single, 'x') };
}

function resolveRange(spec: Formula2DSpec, defaults: Range): Range {
    return {
        tMin: spec.t_min ?? defaults.tMin,
        tMax: spec.t_max ?? defaults.tMax,
        dt: spec.dt ?? defaults.dt,
    };
}

/**
 * Samples x(t), y(t) over [tMin, tMax] and computes dl / tangent / normal,
 * mirroring the WAT pipeline (bctool2d.cpp): tangent/normal are unit vectors
 * from central differences, normal is the left-pointing perpendicular (-ty, tx).
 */
export function sampleBoundary2D(
    xFn: (t: number) => number,
    yFn: (t: number) => number,
    { tMin, tMax, dt }: Range,
): BoundaryData {
    const n = Math.floor((tMax - tMin) / dt) + 1;
    if (n <= 0) throw new Error('Invalid range: tMax must be greater than tMin');

    const t = new Float64Array(n);
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const dl = new Float64Array(Math.max(n - 1, 0));
    const tangent_x = new Float64Array(n);
    const tangent_y = new Float64Array(n);
    const normal_x = new Float64Array(n);
    const normal_y = new Float64Array(n);

    let lastX = xFn(tMin);
    let lastY = yFn(tMin);
    t[0] = tMin;
    x[0] = lastX;
    y[0] = lastY;

    for (let i = 1; i < n; i++) {
        const ti = tMin + i * dt;
        const xt = xFn(ti);
        const yt = yFn(ti);
        t[i] = ti;
        x[i] = xt;
        y[i] = yt;
        const dx = xt - lastX;
        const dy = yt - lastY;
        dl[i - 1] = Math.sqrt(dx * dx + dy * dy);
        lastX = xt;
        lastY = yt;
    }

    for (let i = 0; i < n; i++) {
        const ti = tMin + i * dt;
        const dxt = xFn(ti + dt * 0.5) - xFn(ti - dt * 0.5);
        const dyt = yFn(ti + dt * 0.5) - yFn(ti - dt * 0.5);
        const len = Math.sqrt(dxt * dxt + dyt * dyt);
        if (len < 1e-12) {
            tangent_x[i] = 0;
            tangent_y[i] = 0;
            normal_x[i] = 0;
            normal_y[i] = 0;
        } else {
            const tx = dxt / len;
            const ty = dyt / len;
            tangent_x[i] = tx;
            tangent_y[i] = ty;
            normal_x[i] = -ty; // left-pointing normal
            normal_y[i] = tx;
        }
    }

    return { count: n, t, x, y, dl, tangent_x, tangent_y, normal_x, normal_y };
}

/** Compiles + samples one collected formula into a boundary curve. */
export function computeBoundary2DFromSpec(
    spec: Formula2DSpec,
    defaults: Range,
): BoundaryData {
    const { xFn, yFn } = resolveFns(spec);
    return sampleBoundary2D(xFn, yFn, resolveRange(spec, defaults));
}
