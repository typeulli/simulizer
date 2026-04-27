"use client";

import { useEffect, useRef, useState } from "react";
import { computeBoundary3D, type BoundaryData3D } from "@/lib/bctool3d/bctool3d";

// 포물면: x(u,v)=u, y(u,v)=v, z(u,v)=u²+v²
const X_FN = `local.get 0`;

const Y_FN = `local.get 1`;

const Z_FN = `local.get 0
local.get 0
f64.mul
local.get 1
local.get 1
f64.mul
f64.add`;

const PARAMS = { uMin: -2, uMax: 2, du: 0.2, vMin: -2, vMax: 2, dv: 0.2 };

/* ── reshape flat array → 2D array[nu][nv] for Plotly surface ─── */
function to2D(arr: Float64Array, nu: number, nv: number): number[][] {
    const out: number[][] = [];
    for (let i = 0; i < nu; i++) {
        out.push(Array.from(arr.subarray(i * nv, (i + 1) * nv)));
    }
    return out;
}

/* ── subsample points for cone/arrow traces ──────────────────── */
function subsample(arr: Float64Array, nu: number, nv: number, stride: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < nu; i += stride) {
        for (let j = 0; j < nv; j += stride) {
            out.push(arr[i * nv + j]);
        }
    }
    return out;
}

/* ── page ───────────────────────────────────────────────────── */
export default function Boundary3DPage() {
    const [data,    setData]    = useState<BoundaryData3D | null>(null);
    const [error, setError] = useState<string | null>(null);

    const surfRef    = useRef<HTMLDivElement>(null);
    const coneRef    = useRef<HTMLDivElement>(null);

    useEffect(() => {
        computeBoundary3D(X_FN, Y_FN, Z_FN, PARAMS)
            .then(setData)
            .catch((e: unknown) => setError(String(e)));
    }, []);

    useEffect(() => {
        if (!data) return;

        const render = async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mod = await import("plotly.js-dist-min") as any;
            const P     = mod.default ?? mod;

            const { nu, nv, x, y, z, dS, normal_x, normal_y, normal_z, count } = data;

            const x2D    = to2D(x,    nu, nv);
            const y2D    = to2D(y,    nu, nv);
            const z2D    = to2D(z,    nu, nv);
            const dS2D = to2D(dS, nu, nv);

            const baseLayout = {
                paper_bgcolor: "white",
                font: { family: "monospace", size: 12, color: "#333" },
                margin: { l: 0, r: 0, t: 50, b: 0 },
                width: 520,
                height: 480,
            };

            // ── Chart 1: Surface coloured by dS ──────────────────────
            if (surfRef.current) {
                P.newPlot(surfRef.current, [
                    {
                        type: "surface",
                        x: x2D, y: y2D, z: z2D,
                        surfacecolor: dS2D,
                        colorscale: "Blues",
                        colorbar: {
                            title: { text: "dS", side: "right" },
                            tickfont: { family: "monospace" },
                        },
                        hovertemplate: "x: %{x:.2f}<br>y: %{y:.2f}<br>z: %{z:.2f}<extra>dS: %{surfacecolor:.4f}</extra>",
                    },
                ], {
                    ...baseLayout,
                    title: { text: `Surface Colored by dS    (${count} pts)`, font: { size: 14 } },
                    scene: {
                        xaxis: { title: "x" },
                        yaxis: { title: "y" },
                        zaxis: { title: "z" },
                    },
                });
            }

            // ── Chart 2: Normal vectors (cone) on the surface ────────
            const STRIDE = 3;
            const cx = subsample(x,        nu, nv, STRIDE);
            const cy = subsample(y,        nu, nv, STRIDE);
            const cz = subsample(z,        nu, nv, STRIDE);
            const cu = subsample(normal_x, nu, nv, STRIDE);
            const cv = subsample(normal_y, nu, nv, STRIDE);
            const cw = subsample(normal_z, nu, nv, STRIDE);

            if (coneRef.current) {
                P.newPlot(coneRef.current, [
                    {
                        type: "surface",
                        x: x2D, y: y2D, z: z2D,
                        colorscale: [[0, "#e8e8e8"], [1, "#e8e8e8"]],
                        showscale: false,
                        opacity: 0.6,
                        hoverinfo: "skip",
                    },
                    {
                        type: "cone",
                        x: cx, y: cy, z: cz,
                        u: cu, v: cv, w: cw,
                        sizemode: "scaled",
                        sizeref: 0.4,
                        colorscale: "Reds",
                        showscale: false,
                        anchor: "tail",
                        hovertemplate: "nx: %{u:.2f}<br>ny: %{v:.2f}<br>nz: %{w:.2f}<extra></extra>",
                    },
                ], {
                    ...baseLayout,
                    title: { text: "Unit Normal Vectors (stride 3)", font: { size: 14 } },
                    scene: {
                        xaxis: { title: "x" },
                        yaxis: { title: "y" },
                        zaxis: { title: "z" },
                    },
                });
            }
        };

        render();
    }, [data]);

    if (error) return <pre style={{ color: "red", padding: 16 }}>{error}</pre>;
    if (!data) return <pre style={{ padding: 16 }}>computing…</pre>;

    return (
        <main style={{ fontFamily: "monospace", padding: 24, background: "white", minHeight: "100vh" }}>
            <h2 style={{ marginBottom: 20, fontSize: 16 }}>
                bctool3d — 3D boundary visualisation ({data.nu}×{data.nv} = {data.count} pts)
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
                <div ref={surfRef} />
                <div ref={coneRef} />
            </div>
        </main>
    );
}
