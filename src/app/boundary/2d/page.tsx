"use client";

import { useEffect, useRef, useState } from "react";
import { computeBoundary, type BoundaryData } from "@/lib/bctool2d/bctool2d";

const X_FN = `local.get 0
local.get 0
f64.mul`;

const Y_FN = `local.get 0
f64.const 2
f64.mul`;

/* ── Blues colormap (matplotlib "Blues") ───────────────────── */
const BLUES: [number, number, number][] = [
    [247, 251, 255], [222, 235, 247], [198, 219, 239],
    [158, 202, 225], [107, 174, 214], [ 66, 146, 198],
    [ 33, 113, 181], [    8,    81, 156], [    8,    48, 107],
];

function bluesAt(t: number): string {
    const p    = Math.max(0, Math.min(1, t)) * (BLUES.length - 1);
    const lo   = Math.floor(p);
    const hi   = Math.min(lo + 1, BLUES.length - 1);
    const f    = p - lo;
    const [r0, g0, b0] = BLUES[lo];
    const [r1, g1, b1] = BLUES[hi];
    return `rgb(${~~(r0+(r1-r0)*f)},${~~(g0+(g1-g0)*f)},${~~(b0+(b1-b0)*f)})`;
}

const BLUES_CS = BLUES.map((c, i) => [i / (BLUES.length - 1), `rgb(${c.join(",")})`]);

/* ── shared Plotly layout ────────────────────────────────────── */
const BASE = {
    paper_bgcolor: "white",
    plot_bgcolor:  "white",
    font:          { family: "monospace", size: 13, color: "#333" },
    xaxis:         { gridcolor: "#e8e8e8", linecolor: "#aaa", title: { text: "x" } },
    yaxis:         { gridcolor: "#e8e8e8", linecolor: "#aaa", title: { text: "y" }, scaleanchor: "x", scaleratio: 1 },
    margin:        { l: 60, r: 30, t: 50, b: 50 },
    width:         520,
    height:        440,
};

/* ── trace builders ─────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDlTraces(d: BoundaryData): any[] {
    const { x, y, dl, count } = d;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < dl.length; i++) { if (dl[i] < lo) lo = dl[i]; if (dl[i] > hi) hi = dl[i]; }
    const rng = hi - lo || 1e-12;

    // one trace per segment, colored by dl    (matches matplotlib LineCollection)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traces: any[] = [];
    for (let i = 0; i < count - 1; i++) {
        traces.push({
            type: "scatter", mode: "lines",
            x: [x[i], x[i + 1]], y: [y[i], y[i + 1]],
            line: { color: bluesAt((dl[i] - lo) / rng), width: 2.5 },
            showlegend: false, hoverinfo: "skip",
        });
    }

    // invisible trace just to anchor the colorbar
    traces.push({
        type: "scatter", mode: "markers",
        x: [null], y: [null],
        marker: {
            color: [lo, hi], cmin: lo, cmax: hi,
            colorscale: BLUES_CS, showscale: true,
            colorbar: { title: { text: "dl (normalized)", side: "right" }, tickfont: { family: "monospace" } },
            size: 0.1,
        },
        showlegend: false, hoverinfo: "skip",
    });

    return traces;
}

function arrRange(a: Float64Array): number {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
    return hi - lo;
}

function autoScale(d: BoundaryData): number {
    return Math.max(arrRange(d.x), arrRange(d.y)) * 0.06;
}

function buildArrowTraces(
    d: BoundaryData,
    vx: Float64Array, vy: Float64Array,
    arrowColor: string,
    stride = 5, scale = autoScale(d),
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): { traces: any[]; annotations: any[] } {
    const { x, y, count } = d;

    const curve = {
        type: "scatter", mode: "lines",
        x: Array.from(x), y: Array.from(y),
        line: { color: "lightgray", width: 1.5 },
        showlegend: false,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const annotations: any[] = [];
    for (let i = 0; i < count; i += stride) {
        annotations.push({
            x: x[i] + vx[i] * scale,    y: y[i] + vy[i] * scale,
            ax: x[i],                                    ay: y[i],
            xref: "x", yref: "y", axref: "x", ayref: "y",
            arrowhead: 2, arrowsize: 1, arrowwidth: 1.5, arrowcolor: arrowColor,
            showarrow: true, text: "",
        });
    }

    return { traces: [curve], annotations };
}

/* ── page ───────────────────────────────────────────────────── */
export default function BoundaryPage() {
    const [data,    setData]    = useState<BoundaryData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const dlRef    = useRef<HTMLDivElement>(null);
    const tanRef = useRef<HTMLDivElement>(null);
    const norRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        computeBoundary(X_FN, Y_FN, { tMin: 0.0, tMax: 10.0, dt: 0.1 })
            .then(setData)
            .catch((e: unknown) => setError(String(e)));
    }, []);

    useEffect(() => {
        if (!data) return;

        const render = async () => {
            // Dynamic import avoids SSR issues with plotly
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mod = await import("plotly.js-dist-min") as any;
            const P     = mod.default ?? mod;

            if (dlRef.current) {
                P.newPlot(dlRef.current, buildDlTraces(data), {
                    ...BASE,
                    title: { text: "Boundary Segments Colored by Normalized dl", font: { size: 14 } },
                    xaxis: { ...BASE.xaxis, title: { text: "xt" } },
                    yaxis: { ...BASE.yaxis, title: { text: "yt" } },
                });
            }

            const { traces: tanT, annotations: tanA } = buildArrowTraces(
                data, data.tangent_x, data.tangent_y, "steelblue",
            );
            if (tanRef.current) {
                P.newPlot(tanRef.current, tanT, {
                    ...BASE,
                    title: { text: "Tangent Vectors", font: { size: 14 } },
                    annotations: tanA,
                });
            }

            const { traces: norT, annotations: norA } = buildArrowTraces(
                data, data.normal_x, data.normal_y, "tomato",
            );
            if (norRef.current) {
                P.newPlot(norRef.current, norT, {
                    ...BASE,
                    title: { text: "Normal Vectors", font: { size: 14 } },
                    annotations: norA,
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
                bctool2d — boundary visualisation ({data.count} pts)
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
                <div ref={dlRef}  />
                <div ref={tanRef} />
                <div ref={norRef} />
            </div>
        </main>
    );
}
