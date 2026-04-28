"use client";

import { useEffect, useRef, useState } from "react";
import { computeBoundary3D, type BoundaryData3D } from "@/lib/bctool3d/bctool3d";
import { packF64Arrays, unpackF64Arrays } from "@/utils/ziparray";
import useDownloader from "@/hooks/useDownloader";

/* ── reshape flat array → 2D array[nu][nv] for Plotly surface ─── */
function to2D(arr: Float64Array, nu: number, nv: number): number[][] {
    const out: number[][] = [];
    for (let i = 0; i < nu; i++) {
        out.push(Array.from(arr.subarray(i * nv, (i + 1) * nv)));
    }
    return out;
}

/* ── subsample for cone traces ───────────────────────────────── */
function subsample(arr: Float64Array, nu: number, nv: number, stride: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < nu; i += stride) {
        for (let j = 0; j < nv; j += stride) {
            out.push(arr[i * nv + j]);
        }
    }
    return out;
}

/* ── pack/unpack helpers ─────────────────────────────────────── */
// format per surface: [meta(nu,nv), u, v, x, y, z, dS, nx, ny, nz]  → 10 arrays
function arrsToSurfaces(arrs: Float64Array[]): BoundaryData3D[] {
    const surfaces: BoundaryData3D[] = [];
    for (let i = 0; i + 9 < arrs.length; i += 10) {
        const meta = arrs[i];
        const u    = arrs[i + 1];
        surfaces.push({
            count:    u.length,
            nu:       meta[0],
            nv:       meta[1],
            u,
            v:        arrs[i + 2],
            x:        arrs[i + 3],
            y:        arrs[i + 4],
            z:        arrs[i + 5],
            dS:       arrs[i + 6],
            normal_x: arrs[i + 7],
            normal_y: arrs[i + 8],
            normal_z: arrs[i + 9],
        });
    }
    return surfaces;
}

function surfacesToArrays(surfaces: BoundaryData3D[]): Float64Array[] {
    return surfaces.flatMap(d => [
        new Float64Array([d.nu, d.nv]),
        d.u, d.v, d.x, d.y, d.z, d.dS, d.normal_x, d.normal_y, d.normal_z,
    ]);
}

/* ── types ───────────────────────────────────────────────────── */
type WasmEntry = { id: number; kind: "wasm"; xFn: string; yFn: string; zFn: string };
type FileEntry = { id: number; kind: "file"; filename: string; surfaces: BoundaryData3D[] | null };
type Entry = WasmEntry | FileEntry;

interface Params {
    uMin: number; uMax: number; du: number;
    vMin: number; vMax: number; dv: number;
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

export default function Boundary3DPage() {
    const [entries, setEntries] = useState<Entry[]>([
        { id: nextId(), kind: "wasm", xFn: "local.get 0", yFn: "local.get 1", zFn: "local.get 0\nlocal.get 0\nf64.mul\nlocal.get 1\nlocal.get 1\nf64.mul\nf64.add" },
    ]);
    const [params, setParams] = useState<Params>({
        uMin: -2, uMax: 2, du: 0.2,
        vMin: -2, vMax: 2, dv: 0.2,
    });
    const [data,    setData]    = useState<BoundaryData3D[]>([]);
    const { download } = useDownloader();
    const [running, setRunning] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const surfRef = useRef<HTMLDivElement>(null);
    const coneRef = useRef<HTMLDivElement>(null);

    /* ── entry mutations ──────────────────────────────────────── */
    function addEntry(kind: "wasm" | "file") {
        const base = { id: nextId() };
        const e: Entry = kind === "wasm"
            ? { ...base, kind: "wasm", xFn: "", yFn: "", zFn: "" }
            : { ...base, kind: "file", filename: "", surfaces: null };
        setEntries(prev => [...prev, e]);
    }

    function removeEntry(id: number) {
        setEntries(prev => prev.length > 1 ? prev.filter(e => e.id !== id) : prev);
    }

    function changeKind(id: number, kind: "wasm" | "file") {
        setEntries(prev => prev.map(e => {
            if (e.id !== id) return e;
            return kind === "wasm"
                ? { id, kind: "wasm", xFn: "", yFn: "", zFn: "" }
                : { id, kind: "file", filename: "", surfaces: null };
        }));
    }

    function updateWasm(id: number, field: "xFn" | "yFn" | "zFn", value: string) {
        setEntries(prev => prev.map(e =>
            e.id === id && e.kind === "wasm" ? { ...e, [field]: value } : e
        ));
    }

    function loadFile(id: number, file: File) {
        file.arrayBuffer().then(buf => {
            const arrs     = unpackF64Arrays(buf);
            const surfaces = arrsToSurfaces(arrs);
            setEntries(prev => prev.map(e =>
                e.id === id && e.kind === "file"
                    ? { ...e, filename: file.name, surfaces }
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
            const results: BoundaryData3D[] = [];

            for (const entry of entries) {
                if (entry.kind === "wasm") {
                    if (!entry.xFn.trim() || !entry.yFn.trim() || !entry.zFn.trim()) continue;
                    results.push(await computeBoundary3D(entry.xFn, entry.yFn, entry.zFn, params));
                } else {
                    if (!entry.surfaces) continue;
                    results.push(...entry.surfaces);
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

            const baseLayout = {
                paper_bgcolor: "white",
                font: { family: "monospace", size: 12, color: "#333" },
                margin: { l: 0, r: 0, t: 50, b: 0 },
                width: 520,
                height: 480,
                scene: {
                    xaxis: { title: "x" },
                    yaxis: { title: "y" },
                    zaxis: { title: "z" },
                },
            };

            // ── surface plot (dS coloring, colorbar on first surface only) ──
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const surfTraces: any[] = data.map((d, i) => ({
                type: "surface",
                x: to2D(d.x, d.nu, d.nv),
                y: to2D(d.y, d.nu, d.nv),
                z: to2D(d.z, d.nu, d.nv),
                surfacecolor: to2D(d.dS, d.nu, d.nv),
                colorscale: "Blues",
                showscale: i === 0,
                colorbar: i === 0 ? {
                    title: { text: "dS", side: "right" },
                    tickfont: { family: "monospace" },
                } : undefined,
                hovertemplate: "x: %{x:.2f}<br>y: %{y:.2f}<br>z: %{z:.2f}<extra>dS: %{surfacecolor:.4f}</extra>",
            }));

            if (surfRef.current) {
                P.newPlot(surfRef.current, surfTraces, {
                    ...baseLayout,
                    title: {
                        text: `Surface Colored by dS    (${data.reduce((s, d) => s + d.count, 0)} pts)`,
                        font: { size: 14 },
                    },
                });
            }

            // ── cone plot (surface + normals) ──
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const coneTraces: any[] = [];
            const STRIDE = 3;

            for (const d of data) {
                coneTraces.push({
                    type: "surface",
                    x: to2D(d.x, d.nu, d.nv),
                    y: to2D(d.y, d.nu, d.nv),
                    z: to2D(d.z, d.nu, d.nv),
                    colorscale: [[0, "#e8e8e8"], [1, "#e8e8e8"]],
                    showscale: false,
                    opacity: 0.6,
                    hoverinfo: "skip",
                });
                coneTraces.push({
                    type: "cone",
                    x: subsample(d.x,        d.nu, d.nv, STRIDE),
                    y: subsample(d.y,        d.nu, d.nv, STRIDE),
                    z: subsample(d.z,        d.nu, d.nv, STRIDE),
                    u: subsample(d.normal_x, d.nu, d.nv, STRIDE),
                    v: subsample(d.normal_y, d.nu, d.nv, STRIDE),
                    w: subsample(d.normal_z, d.nu, d.nv, STRIDE),
                    sizemode: "scaled",
                    sizeref: 0.4,
                    colorscale: "Reds",
                    showscale: false,
                    anchor: "tail",
                    hovertemplate: "nx: %{u:.2f}<br>ny: %{v:.2f}<br>nz: %{w:.2f}<extra></extra>",
                });
            }

            if (coneRef.current) {
                P.newPlot(coneRef.current, coneTraces, {
                    ...baseLayout,
                    title: { text: "Unit Normal Vectors (stride 3)", font: { size: 14 } },
                });
            }
        };

        render();
    }, [data]);

    /* ── UI ───────────────────────────────────────────────────── */
    return (
        <main style={S.page}>
            <h2 style={{ marginBottom: 20, fontSize: 15 }}>bctool3d — 3D boundary visualisation</h2>

            {/* param row */}
            <div style={{ ...S.card, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                {(["uMin","uMax","du","vMin","vMax","dv"] as const).map(k => (
                    <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <span style={{ color: "#555" }}>{k}</span>
                        <input
                            style={S.input}
                            type="number"
                            value={params[k]}
                            step={k === "du" || k === "dv" ? 0.05 : 1}
                            onChange={e => setParams(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))}
                        />
                    </label>
                ))}
            </div>

            {/* entry list */}
            {entries.map((entry, idx) => (
                <div key={entry.id} style={S.card}>
                    {/* card header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 12, color: "#888" }}>surface {idx + 1}</span>
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
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                            {(["xFn", "yFn", "zFn"] as const).map(field => (
                                <div key={field}>
                                    <label style={S.label}>{field.toUpperCase()} (WAT, params: u=local.get 0, v=local.get 1)</label>
                                    <textarea
                                        style={{ ...S.textarea, height: 80 }}
                                        placeholder={field === "xFn" ? "local.get 0" : field === "yFn" ? "local.get 1" : "local.get 0\nlocal.get 0\nf64.mul\nlocal.get 1\nlocal.get 1\nf64.mul\nf64.add"}
                                        value={entry[field]}
                                        onChange={e => updateWasm(entry.id, field, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <input
                                type="file"
                                accept=".bin"
                                style={{ fontFamily: "monospace", fontSize: 12 }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(entry.id, f); }}
                            />
                            {entry.surfaces !== null && (
                                <span style={{ fontSize: 11, color: "#1a6" }}>
                                    {entry.surfaces.length} surface{entry.surfaces.length !== 1 ? "s" : ""} loaded
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
                            const buf = packF64Arrays(...surfacesToArrays(data));
                            download("boundary3d.bin", new Blob([buf]));
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
                        {data.length} surface{data.length > 1 ? "s" : ""} —{" "}
                        {data.reduce((s, d) => s + d.count, 0)} pts total
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
                        <div ref={surfRef} />
                        <div ref={coneRef} />
                    </div>
                </>
            )}
        </main>
    );
}
