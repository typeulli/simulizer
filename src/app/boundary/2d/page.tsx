"use client";

import { useEffect, useRef, useState } from "react";
import { computeBoundary, type BoundaryData } from "@/lib/bctool2d/bctool2d";
import { packF64Arrays, unpackF64Arrays } from "@/utils/ziparray";
import useDownloader from "@/hooks/useDownloader";
import { token } from "@/components/tokens";
import { Icon } from "@/components/atoms/Icons";
import { Button } from "@/components/atoms/Button";
import { Input, Textarea } from "@/components/atoms/Input";
import { TopbarBrand } from "@/components/organisms/TopbarBrand";

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

function cssVar(name: string): string {
    if (typeof document === "undefined") return "";
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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

            const bgColor   = cssVar("--bg") || "#fff";
            const fgColor   = cssVar("--fg-muted") || "#555";
            const gridColor = cssVar("--border") || "#e8e8e8";

            const BASE = {
                paper_bgcolor: bgColor,
                plot_bgcolor:  bgColor,
                font:          { family: "monospace", size: 12, color: fgColor },
                xaxis:         { gridcolor: gridColor, linecolor: gridColor, title: { text: "x" } },
                yaxis:         { gridcolor: gridColor, linecolor: gridColor, title: { text: "y" }, scaleanchor: "x", scaleratio: 1 },
                margin:        { l: 60, r: 30, t: 50, b: 50 },
                width:         480,
                height:        400,
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dlTraces: any[] = data.flatMap((d, i) => buildDlTraces(d, i === 0));
            if (dlRef.current) {
                P.newPlot(dlRef.current, dlTraces, {
                    ...BASE,
                    title: { text: "Boundary Segments — dl", font: { size: 13, color: fgColor } },
                    xaxis: { ...BASE.xaxis, title: { text: "x" } },
                    yaxis: { ...BASE.yaxis, title: { text: "y" } },
                });
            }

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
                    title: { text: "Tangent Vectors", font: { size: 13, color: fgColor } },
                    annotations: tanAnnotations,
                });
            }
            if (norRef.current) {
                P.newPlot(norRef.current, norTraces, {
                    ...BASE,
                    title: { text: "Normal Vectors", font: { size: 13, color: fgColor } },
                    annotations: norAnnotations,
                });
            }
        };

        render();
    }, [data]);

    /* ── UI ───────────────────────────────────────────────────── */
    return (
        <div style={{ minHeight: "100vh", background: token.color.bg, color: token.color.fg, fontFamily: token.font.family.mono, display: "flex", flexDirection: "column" }}>

            {/* Header */}
            <header style={{ display: "flex", alignItems: "center", gap: 8, padding: `0 ${token.space.sp4}`, height: 48, borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0 }}>
                <TopbarBrand />
                <span style={{ color: token.color.fgSubtle, fontWeight: 300 }}>/</span>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: token.radius.sm, color: token.color.fgMuted, fontSize: token.font.size.fs12 }}>
                    <Icon.Grid size={12} />
                    <span>경계조건 2D</span>
                </div>

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    {data.length > 0 && (
                        <Button variant="ghost" size="sm"
                            leading={<Icon.Download size={11} />}
                            onClick={() => {
                                const arrays = data.flatMap(d => [d.t, d.x, d.y, d.dl, d.tangent_x, d.tangent_y, d.normal_x, d.normal_y]);
                                const buf = packF64Arrays(...arrays);
                                download("boundary2d.bin", new Blob([buf]));
                            }}
                        >Download</Button>
                    )}
                    <Button variant="ai" size="sm" disabled={running}
                        leading={running ? <Icon.Square size={10} /> : <Icon.Play size={11} fill />}
                        onClick={handleRun}
                    >{running ? "computing…" : "Run"}</Button>
                </div>
            </header>

            {/* Body */}
            <main style={{ flex: 1, padding: token.space.sp6, display: "flex", flexDirection: "column", gap: token.space.sp3 }}>

                {/* Params */}
                <div style={{ background: token.color.bgSubtle, border: `1px solid ${token.color.border}`, borderRadius: token.radius.md, padding: `${token.space.sp3} ${token.space.sp4}`, display: "flex", gap: token.space.sp6, alignItems: "center", flexWrap: "wrap" }}>
                    {(["tMin", "tMax", "dt"] as const).map(k => (
                        <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: token.font.size.fs12 }}>
                            <span style={{ color: token.color.fgMuted }}>{k}</span>
                            <Input size="sm" type="number"
                                value={params[k]}
                                step={k === "dt" ? 0.01 : 1}
                                onChange={e => setParams(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))}
                                style={{ width: 80, fontFamily: token.font.family.mono }}
                            />
                        </label>
                    ))}
                </div>

                {/* Entry list */}
                {entries.map((entry, idx) => (
                    <div key={entry.id} style={{ background: token.color.bgSubtle, border: `1px solid ${token.color.border}`, borderRadius: token.radius.md, padding: `${token.space.sp3} ${token.space.sp4}` }}>
                        {/* Card header */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>curve {idx + 1}</span>
                            {(["wasm", "file"] as const).map(k => (
                                <Button key={k} size="xs"
                                    variant={entry.kind === k ? "accent" : "ghost"}
                                    onClick={() => changeKind(entry.id, k)}
                                    style={{ fontFamily: token.font.family.mono }}
                                >{k.toUpperCase()}</Button>
                            ))}
                            <Button variant="danger" size="xs"
                                style={{ marginLeft: "auto" }}
                                onClick={() => removeEntry(entry.id)}
                                disabled={entries.length === 1}
                            >×</Button>
                        </div>

                        {/* Card body */}
                        {entry.kind === "wasm" ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                {(["xFn", "yFn"] as const).map(field => (
                                    <div key={field}>
                                        <div style={{ fontSize: token.font.size.fs10, color: token.color.fgSubtle, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{field} (WAT)</div>
                                        <Textarea size="sm"
                                            placeholder={field === "xFn" ? "local.get 0\nlocal.get 0\nf64.mul" : "local.get 0\nf64.const 2\nf64.mul"}
                                            value={entry[field]}
                                            onChange={e => updateWasm(entry.id, field, e.target.value)}
                                            style={{ height: 120, fontFamily: token.font.family.mono, background: token.color.bgCanvas, color: token.color.fg, resize: "vertical" }}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <input
                                    type="file"
                                    accept=".bin"
                                    style={{ fontFamily: token.font.family.mono, fontSize: token.font.size.fs12, color: token.color.fgMuted }}
                                    onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(entry.id, f); }}
                                />
                                {entry.curves !== null && (
                                    <span style={{ fontSize: token.font.size.fs11, color: token.color.success }}>
                                        {entry.curves.length} curve{entry.curves.length !== 1 ? "s" : ""} loaded
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {/* Add buttons */}
                <div style={{ display: "flex", gap: 6 }}>
                    <Button variant="ghost" size="sm" leading={<Icon.Plus size={11} />} onClick={() => addEntry("wasm")}>WASM</Button>
                    <Button variant="ghost" size="sm" leading={<Icon.Plus size={11} />} onClick={() => addEntry("file")}>File</Button>
                </div>

                {/* Error */}
                {error && (
                    <div style={{ padding: "8px 12px", background: token.color.dangerSoft, border: `1px solid ${token.color.dangerBorder}`, borderRadius: token.radius.sm, fontSize: token.font.size.fs12, color: token.color.danger, fontFamily: token.font.family.mono }}>
                        {error}
                    </div>
                )}

                {/* Results */}
                {data.length > 0 && (
                    <>
                        <p style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>
                            {data.length} curve{data.length > 1 ? "s" : ""} — {data.reduce((s, d) => s + d.count, 0)} pts total
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: token.space.sp6, alignItems: "flex-start" }}>
                            <div ref={dlRef}  />
                            <div ref={tanRef} />
                            <div ref={norRef} />
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
