"use client";

import { useEffect, useRef, useState } from "react";
import { computeBoundary, type BoundaryData } from "@/lib/bctool2d/bctool2d";
import { packF64Arrays, unpackF64Arrays } from "@/utils/ziparray";
import useDownloader from "@/hooks/useDownloader";

/* ── Blues colormap ──────────────────────────────────────────── */
const BLUES: [number, number, number][] = [
    [247, 251, 255], [222, 235, 247], [198, 219, 239],
    [158, 202, 225], [107, 174, 214], [ 66, 146, 198],
    [ 33, 113, 181], [  8,  81, 156], [  8,  48, 107],
];

function bluesAt(t: number): string {
    const p  = Math.max(0, Math.min(1, t)) * (BLUES.length - 1);
    const lo = Math.floor(p);
    const hi = Math.min(lo + 1, BLUES.length - 1);
    const f  = p - lo;
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
function buildDlTraces(d: BoundaryData, showColorbar = true): any[] {
    const { x, y, dl } = d;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < dl.length; i++) { if (dl[i] < lo) lo = dl[i]; if (dl[i] > hi) hi = dl[i]; }
    const rng = hi - lo || 1e-12;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traces: any[] = [];
    for (let i = 0; i < dl.length; i++) {
        traces.push({
            type: "scatter", mode: "lines",
            x: [x[i], x[i + 1]], y: [y[i], y[i + 1]],
            line: { color: bluesAt((dl[i] - lo) / rng), width: 2.5 },
            showlegend: false, hoverinfo: "skip",
        });
    }

    if (showColorbar) {
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
    }

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
            x: x[i] + vx[i] * scale,
            y: y[i] + vy[i] * scale,
            ax: x[i], ay: y[i],
            xref: "x", yref: "y",
            axref: "x", ayref: "y",
            arrowhead: 2, arrowsize: 1, arrowwidth: 1.5, arrowcolor: arrowColor,
            showarrow: true, text: "",
        });
    }

    return { traces: [curve], annotations };
}

/* ── helpers ─────────────────────────────────────────────────── */
function arrsToBoundaryData(arrs: Float64Array[]): BoundaryData[] {
    const curves: BoundaryData[] = [];
    for (let i = 0; i + 7 < arrs.length; i += 8) {
        const t = arrs[i];
        curves.push({
            count:     t.length,
            t,
            x:         arrs[i + 1],
            y:         arrs[i + 2],
            dl:        arrs[i + 3],
            tangent_x: arrs[i + 4],
            tangent_y: arrs[i + 5],
            normal_x:  arrs[i + 6],
            normal_y:  arrs[i + 7],
        });
    }
    return curves;
}

/* ── types ───────────────────────────────────────────────────── */
type WasmEntry = { id: number; kind: "wasm"; xFn: string; yFn: string };
type FileEntry = { id: number; kind: "file"; filename: string; curves: BoundaryData[] | null };
type Entry = WasmEntry | FileEntry;

interface Params {
    tMin: number;
    tMax: number;
    dt: number;
}

/* ── styles ──────────────────────────────────────────────────── */
const S = {
    page: {
        fontFamily: "monospace",
        padding: 24,
        background: "#f8f8f8",
        minHeight: "100vh",
        color: "#222",
    } as React.CSSProperties,
    card: {
        background: "white",
        border: "1px solid #ddd",
        borderRadius: 6,
        padding: 16,
        marginBottom: 12,
    } as React.CSSProperties,
    label: {
        display: "block",
        fontSize: 11,
        color: "#666",
        marginBottom: 4,
    } as React.CSSProperties,
    textarea: {
        width: "100%",
        fontFamily: "monospace",
        fontSize: 12,
        border: "1px solid #ccc",
        borderRadius: 4,
        padding: "6px 8px",
        resize: "vertical",
        background: "#fafafa",
        boxSizing: "border-box",
    } as React.CSSProperties,
    input: {
        fontFamily: "monospace",
        fontSize: 12,
        border: "1px solid #ccc",
        borderRadius: 4,
        padding: "4px 8px",
        width: 80,
        background: "#fafafa",
    } as React.CSSProperties,
    btn: (color: string, bg: string) => ({
        fontFamily: "monospace",
        fontSize: 12,
        padding: "5px 12px",
        border: `1px solid ${color}`,
        borderRadius: 4,
        background: bg,
        color: color,
        cursor: "pointer",
    } as React.CSSProperties),
};

/* ── page ───────────────────────────────────────────────────── */
let _nextId = 1;
function nextId() { return _nextId++; }

export default function BoundaryPage() {
    const [entries, setEntries] = useState<Entry[]>([
        { id: nextId(), kind: "wasm", xFn: "local.get 0\nlocal.get 0\nf64.mul", yFn: "local.get 0\nf64.const 2\nf64.mul" },
    ]);
    const [params, setParams] = useState<Params>({ tMin: 0.0, tMax: 10.0, dt: 0.1 });
    const [data,    setData]    = useState<BoundaryData[]>([]);
    const { download } = useDownloader();
    const [running, setRunning] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const dlRef  = useRef<HTMLDivElement>(null);
    const tanRef = useRef<HTMLDivElement>(null);
    const norRef = useRef<HTMLDivElement>(null);

    /* ── entry mutations ──────────────────────────────────────── */
    function addEntry(kind: "wasm" | "file") {
        const base = { id: nextId() };
        const e: Entry = kind === "wasm"
            ? { ...base, kind: "wasm", xFn: "", yFn: "" }
            : { ...base, kind: "file", filename: "", curves: null };
        setEntries(prev => [...prev, e]);
    }

    function removeEntry(id: number) {
        setEntries(prev => prev.length > 1 ? prev.filter(e => e.id !== id) : prev);
    }

    function changeKind(id: number, kind: "wasm" | "file") {
        setEntries(prev => prev.map(e => {
            if (e.id !== id) return e;
            return kind === "wasm"
                ? { id, kind: "wasm", xFn: "", yFn: "" }
                : { id, kind: "file", filename: "", curves: null };
        }));
    }

    function updateWasm(id: number, field: "xFn" | "yFn", value: string) {
        setEntries(prev => prev.map(e =>
            e.id === id && e.kind === "wasm" ? { ...e, [field]: value } : e
        ));
    }

    function loadFile(id: number, file: File) {
        file.arrayBuffer().then(buf => {
            const arrs   = unpackF64Arrays(buf);
            const curves = arrsToBoundaryData(arrs);
            setEntries(prev => prev.map(e =>
                e.id === id && e.kind === "file"
                    ? { ...e, filename: file.name, curves }
                    : e
            ));
        });
    }

    /* ── run ──────────────────────────────────────────────────── */
    async function handleRun() {
        setRunning(true);
        setError(null);
        setData([]);

        try {
            const results: BoundaryData[] = [];

            for (const entry of entries) {
                if (entry.kind === "wasm") {
                    if (!entry.xFn.trim() || !entry.yFn.trim()) continue;
                    results.push(await computeBoundary(entry.xFn, entry.yFn, params));
                } else {
                    if (!entry.curves) continue;
                    results.push(...entry.curves);
                }
            }

            if (results.length === 0) {
                setError("실행할 데이터가 없습니다.");
                return;
            }

            setData(results);
        } catch (e: unknown) {
            setError(String(e));
        } finally {
            setRunning(false);
        }
    }

    /* ── render plots ─────────────────────────────────────────── */
    useEffect(() => {
        if (data.length === 0) return;

        const render = async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mod = await import("plotly.js-dist-min") as any;
            const P   = mod.default ?? mod;

            // dl plot — each curve independently normalized, colorbar only on first
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dlTraces: any[] = data.flatMap((d, i) => buildDlTraces(d, i === 0));
            if (dlRef.current) {
                P.newPlot(dlRef.current, dlTraces, {
                    ...BASE,
                    title: { text: "Boundary Segments Colored by Normalized dl", font: { size: 14 } },
                    xaxis: { ...BASE.xaxis, title: { text: "xt" } },
                    yaxis: { ...BASE.yaxis, title: { text: "yt" } },
                });
            }

            // tangent / normal — overlay all curves
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tanTraces: any[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tanAnnotations: any[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const norTraces: any[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const norAnnotations: any[] = [];

            for (const d of data) {
                const { traces: tT, annotations: tA } = buildArrowTraces(d, d.tangent_x, d.tangent_y, "steelblue");
                tanTraces.push(...tT);
                tanAnnotations.push(...tA);
                const { traces: nT, annotations: nA } = buildArrowTraces(d, d.normal_x, d.normal_y, "tomato");
                norTraces.push(...nT);
                norAnnotations.push(...nA);
            }

            if (tanRef.current) {
                P.newPlot(tanRef.current, tanTraces, {
                    ...BASE,
                    title: { text: "Tangent Vectors", font: { size: 14 } },
                    annotations: tanAnnotations,
                });
            }
            if (norRef.current) {
                P.newPlot(norRef.current, norTraces, {
                    ...BASE,
                    title: { text: "Normal Vectors", font: { size: 14 } },
                    annotations: norAnnotations,
                });
            }
        };

        render();
    }, [data]);

    /* ── UI ───────────────────────────────────────────────────── */
    return (
        <main style={S.page}>
            <h2 style={{ marginBottom: 20, fontSize: 15 }}>bctool2d — boundary visualisation</h2>

            {/* param row */}
            <div style={{ ...S.card, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                {(["tMin", "tMax", "dt"] as const).map(k => (
                    <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <span style={{ color: "#555" }}>{k}</span>
                        <input
                            style={S.input}
                            type="number"
                            value={params[k]}
                            step={k === "dt" ? 0.01 : 1}
                            onChange={e => setParams(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))}
                        />
                    </label>
                ))}
            </div>

            {/* entry list */}
            {entries.map((entry, idx) => (
                <div key={entry.id} style={S.card}>
                    {/* card header */}
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "#888" }}>curve {idx + 1}</span>
                        <select
                            value={entry.kind}
                            onChange={e => changeKind(entry.id, e.target.value as "wasm" | "file")}
                            style={{ fontFamily: "monospace", fontSize: 12, border: "1px solid #ccc", borderRadius: 4, padding: "3px 6px", background: "#fafafa" }}
                        >
                            <option value="wasm">WASM</option>
                            <option value="file">File</option>
                        </select>
                        <button
                            style={{ ...S.btn("#c00", "white"), marginLeft: "auto" }}
                            onClick={() => removeEntry(entry.id)}
                            disabled={entries.length === 1}
                        >×</button>
                    </div>

                    {/* card body */}
                    {entry.kind === "wasm" ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                                <label style={S.label}>X_FN (WAT)</label>
                                <textarea
                                    style={{ ...S.textarea, height: 80 }}
                                    placeholder={"local.get 0\nlocal.get 0\nf64.mul"}
                                    value={entry.xFn}
                                    onChange={e => updateWasm(entry.id, "xFn", e.target.value)}
                                />
                            </div>
                            <div>
                                <label style={S.label}>Y_FN (WAT)</label>
                                <textarea
                                    style={{ ...S.textarea, height: 80 }}
                                    placeholder={"local.get 0\nf64.const 2\nf64.mul"}
                                    value={entry.yFn}
                                    onChange={e => updateWasm(entry.id, "yFn", e.target.value)}
                                />
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <input
                                type="file"
                                accept=".bin"
                                style={{ fontFamily: "monospace", fontSize: 12 }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(entry.id, f); }}
                            />
                            {entry.curves !== null && (
                                <span style={{ fontSize: 11, color: "#1a6" }}>
                                    {entry.curves.length} curve{entry.curves.length !== 1 ? "s" : ""} loaded
                                </span>
                            )}
                        </div>
                    )}
                </div>
            ))}

            {/* action buttons */}
            <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                <button style={S.btn("#555", "white")} onClick={() => addEntry("wasm")}>+ WASM</button>
                <button style={S.btn("#555", "white")} onClick={() => addEntry("file")}>+ File</button>
                <button
                    style={S.btn("white", running ? "#999" : "#1a6")}
                    onClick={handleRun}
                    disabled={running}
                >
                    {running ? "computing…" : "▶ Run"}
                </button>
                {data.length > 0 && (
                    <button
                        style={S.btn("#336", "white")}
                        onClick={() => {
                            const arrays = data.flatMap(d => [d.t, d.x, d.y, d.dl, d.tangent_x, d.tangent_y, d.normal_x, d.normal_y]);
                            const buf = packF64Arrays(...arrays);
                            download("boundary2d.bin", new Blob([buf]));
                        }}
                    >↓ Download</button>
                )}
            </div>

            {/* error */}
            {error && <pre style={{ color: "red", marginBottom: 16 }}>{error}</pre>}

            {/* plots */}
            {data.length > 0 && (
                <>
                    <p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
                        {data.length} curve{data.length > 1 ? "s" : ""} —{" "}
                        {data.reduce((s, d) => s + d.count, 0)} pts total
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
                        <div ref={dlRef}  />
                        <div ref={tanRef} />
                        <div ref={norRef} />
                    </div>
                </>
            )}
        </main>
    );
}
