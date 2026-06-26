import { compileLatexFn2 } from '@/utils/tex/evalAst';
import type { BoundaryData3D } from './bctool3d';

/**
 * One `add_formula3d(...)` call collected from the user's Python script:
 * a parametric surface x(u,v), y(u,v), z(u,v). The u/v range fields override the
 * page defaults for this surface only.
 */
export interface Formula3DSpec {
    x: string;
    y: string;
    z: string;
    u_min: number | null;
    u_max: number | null;
    du: number | null;
    v_min: number | null;
    v_max: number | null;
    dv: number | null;
}

interface Range3D {
    uMin: number;
    uMax: number;
    du: number;
    vMin: number;
    vMax: number;
    dv: number;
}

function resolveRange(spec: Formula3DSpec, defaults: Range3D): Range3D {
    return {
        uMin: spec.u_min ?? defaults.uMin,
        uMax: spec.u_max ?? defaults.uMax,
        du: spec.du ?? defaults.du,
        vMin: spec.v_min ?? defaults.vMin,
        vMax: spec.v_max ?? defaults.vMax,
        dv: spec.dv ?? defaults.dv,
    };
}

/**
 * Samples x(u,v), y(u,v), z(u,v) over the u/v grid and computes dS / unit
 * normal, mirroring the WAT pipeline (bctool3d.cpp): dS is the magnitude of the
 * cross product of the forward-difference edge vectors; the normal is the
 * normalised cross product of the central-difference partials (∂r/∂u × ∂r/∂v).
 * Flat index = i * nv + j.
 */
export function sampleBoundary3D(
    xFn: (u: number, v: number) => number,
    yFn: (u: number, v: number) => number,
    zFn: (u: number, v: number) => number,
    { uMin, uMax, du, vMin, vMax, dv }: Range3D,
): BoundaryData3D {
    const nu = Math.floor((uMax - uMin) / du) + 1;
    const nv = Math.floor((vMax - vMin) / dv) + 1;
    if (nu <= 0 || nv <= 0) throw new Error('Invalid range: check u/v bounds and steps');

    const n = nu * nv;
    const u = new Float64Array(n);
    const v = new Float64Array(n);
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const z = new Float64Array(n);
    const dS = new Float64Array(n);
    const normal_x = new Float64Array(n);
    const normal_y = new Float64Array(n);
    const normal_z = new Float64Array(n);

    for (let i = 0; i < nu; i++) {
        const uVal = uMin + i * du;
        for (let j = 0; j < nv; j++) {
            const vVal = vMin + j * dv;
            const idx = i * nv + j;

            const xi = xFn(uVal, vVal);
            const yi = yFn(uVal, vVal);
            const zi = zFn(uVal, vVal);
            u[idx] = uVal;
            v[idx] = vVal;
            x[idx] = xi;
            y[idx] = yi;
            z[idx] = zi;

            // Cell area: (r(u+du,v) - r(u,v)) × (r(u,v+dv) - r(u,v))
            const dux = xFn(uVal + du, vVal) - xi;
            const duy = yFn(uVal + du, vVal) - yi;
            const duz = zFn(uVal + du, vVal) - zi;
            const dvx = xFn(uVal, vVal + dv) - xi;
            const dvy = yFn(uVal, vVal + dv) - yi;
            const dvz = zFn(uVal, vVal + dv) - zi;

            const cx = duy * dvz - duz * dvy;
            const cy = duz * dvx - dux * dvz;
            const cz = dux * dvy - duy * dvx;
            dS[idx] = Math.sqrt(cx * cx + cy * cy + cz * cz);
        }
    }

    for (let i = 0; i < nu; i++) {
        const uVal = uMin + i * du;
        for (let j = 0; j < nv; j++) {
            const vVal = vMin + j * dv;
            const idx = i * nv + j;

            const dux = xFn(uVal + du * 0.5, vVal) - xFn(uVal - du * 0.5, vVal);
            const duy = yFn(uVal + du * 0.5, vVal) - yFn(uVal - du * 0.5, vVal);
            const duz = zFn(uVal + du * 0.5, vVal) - zFn(uVal - du * 0.5, vVal);
            const dvx = xFn(uVal, vVal + dv * 0.5) - xFn(uVal, vVal - dv * 0.5);
            const dvy = yFn(uVal, vVal + dv * 0.5) - yFn(uVal, vVal - dv * 0.5);
            const dvz = zFn(uVal, vVal + dv * 0.5) - zFn(uVal, vVal - dv * 0.5);

            const cx = duy * dvz - duz * dvy;
            const cy = duz * dvx - dux * dvz;
            const cz = dux * dvy - duy * dvx;
            const len = Math.sqrt(cx * cx + cy * cy + cz * cz);

            if (len < 1e-12) {
                normal_x[idx] = 0;
                normal_y[idx] = 0;
                normal_z[idx] = 0;
            } else {
                normal_x[idx] = cx / len;
                normal_y[idx] = cy / len;
                normal_z[idx] = cz / len;
            }
        }
    }

    return { count: n, nu, nv, u, v, x, y, z, dS, normal_x, normal_y, normal_z };
}

/** Compiles + samples one collected 3D formula into a surface. */
export function computeBoundary3DFromSpec(
    spec: Formula3DSpec,
    defaults: Range3D,
): BoundaryData3D {
    const xFn = compileLatexFn2(spec.x, 'u', 'v');
    const yFn = compileLatexFn2(spec.y, 'u', 'v');
    const zFn = compileLatexFn2(spec.z, 'u', 'v');
    return sampleBoundary3D(xFn, yFn, zFn, resolveRange(spec, defaults));
}
