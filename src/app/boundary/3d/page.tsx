"use client";

import { useEffect, useRef, useState } from "react";
import { computeBoundary3D, type BoundaryData3D } from "@/lib/bctool3d/bctool3d";
import { packF64Arrays, unpackF64Arrays } from "@/utils/ziparray";
import useDownloader from "@/hooks/useDownloader";
import { token } from "@/components/tokens";
import { Icon } from "@/components/atoms/Icons";
import { Button } from "@/components/atoms/Button";
import { Input, Textarea } from "@/components/atoms/Input";
import { TopbarBrand } from "@/components/organisms/TopbarBrand";
import useLanguagePack from "@/hooks/useLanguagePack";

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

function cssVar(name: string): string {
    if (typeof document === "undefined") return "";
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ── types ───────────────────────────────────────────────────── */
type WasmEntry = { id: number; kind: "wasm"; xFn: string; yFn: string; zFn: string };
type FileEntry = { id: number; kind: "file"; filename: string; surfaces: BoundaryData3D[] | null };
type Entry = WasmEntry | FileEntry;

interface Params {
    uMin: number; uMax: number; du: number;
    vMin: number; vMax: number; dv: number;
}


/* ── page ───────────────────────────────────────────────────── */
let _nextId = 1;
function nextId() { return _nextId++; }

export default function Boundary3DPage() {
    const [, , pack] = useLanguagePack();
    const t = pack.boundary;
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
                setError(t.no_data_error);
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

            const baseLayout = {
                paper_bgcolor: bgColor,
                font: { family: "monospace", size: 12, color: fgColor },
                margin: { l: 0, r: 0, t: 50, b: 0 },
                width: 500,
                height: 460,
                scene: {
                    xaxis: { title: "x" },
                    yaxis: { title: "y" },
                    zaxis: { title: "z" },
                },
            };

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
                        text: `Surface — dS    (${data.reduce((s, d) => s + d.count, 0)} pts)`,
                        font: { size: 13, color: fgColor },
                    },
                });
            }

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
                    title: { text: "Unit Normal Vectors (stride 3)", font: { size: 13, color: fgColor } },
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
                    <Icon.Layers size={12} />
                    <span>{t.breadcrumb_3d}</span>
                </div>

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    {data.length > 0 && (
                        <Button variant="ghost" size="sm"
                            leading={<Icon.Download size={11} />}
                            onClick={() => {
                                const buf = packF64Arrays(...surfacesToArrays(data));
                                download("boundary3d.bin", new Blob([buf]));
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
                <div style={{ background: token.color.bgSubtle, border: `1px solid ${token.color.border}`, borderRadius: token.radius.md, padding: `${token.space.sp3} ${token.space.sp4}`, display: "flex", gap: token.space.sp5, alignItems: "center", flexWrap: "wrap" }}>
                    {(["uMin","uMax","du","vMin","vMax","dv"] as const).map(k => (
                        <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: token.font.size.fs12 }}>
                            <span style={{ color: token.color.fgMuted }}>{k}</span>
                            <Input size="sm" type="number"
                                value={params[k]}
                                step={k === "du" || k === "dv" ? 0.05 : 1}
                                onChange={e => setParams(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))}
                                style={{ width: 72, fontFamily: token.font.family.mono }}
                            />
                        </label>
                    ))}
                </div>

                {/* Entry list */}
                {entries.map((entry, idx) => (
                    <div key={entry.id} style={{ background: token.color.bgSubtle, border: `1px solid ${token.color.border}`, borderRadius: token.radius.md, padding: `${token.space.sp3} ${token.space.sp4}` }}>
                        {/* Card header */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>surface {idx + 1}</span>
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
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                                {(["xFn", "yFn", "zFn"] as const).map(field => (
                                    <div key={field}>
                                        <div style={{ fontSize: token.font.size.fs10, color: token.color.fgSubtle, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{field} (WAT, u=local.get 0, v=local.get 1)</div>
                                        <Textarea size="sm"
                                            placeholder={field === "xFn" ? "local.get 0" : field === "yFn" ? "local.get 1" : "local.get 0\nlocal.get 0\nf64.mul\nlocal.get 1\nlocal.get 1\nf64.mul\nf64.add"}
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
                                {entry.surfaces !== null && (
                                    <span style={{ fontSize: token.font.size.fs11, color: token.color.success }}>
                                        {entry.surfaces.length} surface{entry.surfaces.length !== 1 ? "s" : ""} loaded
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
                            {data.length} surface{data.length > 1 ? "s" : ""} — {data.reduce((s, d) => s + d.count, 0)} pts total
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: token.space.sp6, alignItems: "flex-start" }}>
                            <div ref={surfRef} />
                            <div ref={coneRef} />
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
