"use client";

import React from "react";
import Image from "next/image";
import { BlocklyPreview } from "@/components/organisms/BlocklyPreview";

// ── Shared viz frame ──────────────────────────────────────────────────────
type Pill = { label: string; tone: "wasm" | "lsp" | "gpu" };

export function VizFrame({
    title, sub, pill, children, kind = "diagram",
}: {
    title: string;
    sub: string;
    pill: Pill;
    children: React.ReactNode;
    kind?: "blocks" | "code" | "diagram" | "image";
}) {
    return (
        <div className="ld-vf">
            <div className="ld-vf-chrome">
                <span className="ld-vf-title">{title}</span>
                <span className="ld-vf-sub">{sub}</span>
                <span className={`ld-vf-pill ld-vf-pill-${pill.tone}`}>
                    <span className="ld-vf-pill-dot" />
                    {pill.label}
                </span>
            </div>
            <div className={`ld-vf-body ld-vf-body-${kind}`}>{children}</div>
        </div>
    );
}

// ── Static image viz (poster screenshots, newplot.png, etc.) ─────────────
export function VizImage({
    src, alt, title, sub, pill, fit = "cover",
}: {
    src: string;
    alt: string;
    title: string;
    sub: string;
    pill: Pill;
    fit?: "cover" | "contain";
}) {
    return (
        <VizFrame title={title} sub={sub} pill={pill} kind="image">
            <div className="ld-vf-img" data-fit={fit}>
                <Image
                    src={src}
                    alt={alt}
                    fill
                    sizes="(max-width: 900px) 100vw, 600px"
                    style={{ objectFit: fit, objectPosition: "center" }}
                />
            </div>
        </VizFrame>
    );
}

// ── Block preview (real Blockly via BlocklyPreview) ──────────────────────
export function VizBlocks({
    title, sub, pill, example, mode = "scale", scale = 0.9, focus = "center",
}: {
    title: string;
    sub: string;
    pill: Pill;
    example: "heat" | "em" | "sum" | "basics";
    mode?: "fit" | "scale";
    scale?: number;
    focus?: string;
}) {
    return (
        <VizFrame title={title} sub={sub} pill={pill} kind="blocks">
            <div className="ld-vf-blockly">
                <BlocklyPreview height={460} example={example} mode={mode} scale={scale} focus={focus} />
            </div>
        </VizFrame>
    );
}

// ── Code panel (Monaco-ish, scrollable, with gutter) ─────────────────────
export function VizCode({
    title, sub, pill, lang, code,
}: {
    title: string;
    sub: string;
    pill: Pill;
    lang: "py" | "cpp";
    code: string;
}) {
    const lines = code.split("\n");
    return (
        <VizFrame title={title} sub={sub} pill={pill} kind="code">
            <div className={`ld-mn ld-mn-${lang}`}>
                <div className="ld-mn-gutter">
                    {lines.map((_, i) => (
                        <span key={i} className="ld-mn-num">{i + 1}</span>
                    ))}
                </div>
                <pre className="ld-mn-pre"><code>{code}</code></pre>
            </div>
        </VizFrame>
    );
}

// ── simstd.hpp viz functions (3 only) ────────────────────────────────────
const SIMSTD_FNS = [
    {
        name: "show_mat",
        sig: "(matrix m)",
        desc: "2D 행렬을 히트맵으로",
        icon: (
            <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="3" width="6" height="6" fill="oklch(58% 0.16 240)"/><rect x="9" y="3" width="6" height="6" fill="oklch(70% 0.16 200)"/><rect x="15" y="3" width="6" height="6" fill="oklch(82% 0.14 110)"/><rect x="3" y="9" width="6" height="6" fill="oklch(70% 0.16 200)"/><rect x="9" y="9" width="6" height="6" fill="oklch(88% 0.16 90)"/><rect x="15" y="9" width="6" height="6" fill="oklch(70% 0.16 200)"/><rect x="3" y="15" width="6" height="6" fill="oklch(82% 0.14 110)"/><rect x="9" y="15" width="6" height="6" fill="oklch(70% 0.16 200)"/><rect x="15" y="15" width="6" height="6" fill="oklch(58% 0.16 240)"/></svg>
        ),
    },
    {
        name: "show_graph",
        sig: "(tensor1d t)",
        desc: "1D 시계열을 라인 그래프로",
        icon: (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18 L7 14 L9 16 L13 8 L17 12 L21 6" /><circle cx="13" cy="8" r="1.4" fill="var(--accent)" /></svg>
        ),
    },
    {
        name: "show_field",
        sig: "(tensor2d vx, vy)",
        desc: "2D 벡터장을 quiver로",
        icon: (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round"><path d="M4 6 L8 6" /><path d="M7 4 L8 6 L7 8" /><path d="M4 12 L10 12" /><path d="M9 10 L10 12 L9 14" /><path d="M4 18 L7 18" /><path d="M6 16 L7 18 L6 20" /><path d="M14 7 L19 11" /><path d="M17 8 L19 11 L16 11" /><path d="M14 13 L20 17" /><path d="M19 14 L20 17 L17 17" /></svg>
        ),
    },
];

// ── Backend selector (WebGPU / WebGL / CPU) ─────────────────────────────
export function VizBackend() {
    const backends = [
        { id: "webgpu", name: "WebGPU", meta: "Apple M3 · 8c GPU",  active: true,  pill: "ready" },
        { id: "webgl",  name: "WebGL",  meta: "fallback · GPU",      active: false, pill: null   },
        { id: "cpu",    name: "CPU",    meta: "single-thread",       active: false, pill: null   },
    ];
    return (
        <VizFrame title="compute backend" sub="tfjs · 4.22" pill={{ label: "WebGPU", tone: "gpu" }} kind="diagram">
            <div className="ld-vb">
                <div className="ld-vb-list">
                    {backends.map((b) => (
                        <div key={b.id} className={`ld-vb-row ${b.active ? "is-on" : ""}`}>
                            <span className="ld-vb-radio">{b.active && <span className="ld-vb-radio-dot" />}</span>
                            <span className="ld-vb-name">{b.name}</span>
                            <span className="ld-vb-meta">{b.meta}</span>
                            {b.pill && <span className="ld-vb-pill">{b.pill}</span>}
                        </div>
                    ))}
                </div>
            </div>
        </VizFrame>
    );
}

// ── EXE build (single button) ───────────────────────────────────────────
export function VizExe() {
    return (
        <VizFrame title="heat-diffusion-2d" sub="ClangWorkspace" pill={{ label: "ready", tone: "wasm" }} kind="diagram">
            <div className="ld-vx">
                <button className="ld-vx-btn" type="button" tabIndex={-1}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Build EXE</span>
                </button>
                <span className="ld-vx-hint">emcc · mingw-link → sim.exe</span>
            </div>
        </VizFrame>
    );
}

// ── iframe (real workspace, scaled + cropped, interaction blocked) ─────
export function VizIframe({
    title, sub, pill, src,
    sourceWidth = 1600, sourceHeight = 1000,
    focus, blockInteraction = true,
}: {
    title: string;
    sub: string;
    pill: Pill;
    src: string;
    sourceWidth?: number;
    sourceHeight?: number;
    focus?: { x: number; y: number; w: number; h: number };
    blockInteraction?: boolean;
}) {
    // Default: scale entire workspace to fit wrap (wrap aspect = source aspect).
    // Focus mode: crop to focus rect and scale that rect to fit wrap.
    const aspect = focus
        ? `${focus.w} / ${focus.h}`
        : `${sourceWidth} / ${sourceHeight}`;
    const styleVars = {
        aspectRatio: aspect,
        ["--src-w"]: `${sourceWidth}px`,
        ["--src-h"]: `${sourceHeight}px`,
        ...(focus && {
            ["--focus-w"]: `${focus.w}px`,
            ["--focus-x"]: `${focus.x}px`,
            ["--focus-y"]: `${focus.y}px`,
        }),
    } as React.CSSProperties;
    return (
        <VizFrame title={title} sub={sub} pill={pill} kind="diagram">
            <div
                className={`ld-vf-iframe ${focus ? "ld-vf-iframe-focus" : ""}`}
                style={styleVars}
            >
                <iframe
                    src={src}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                />
                {blockInteraction && <div className="ld-vf-iframe-overlay" aria-hidden />}
            </div>
        </VizFrame>
    );
}

// ── Pending placeholder ─────────────────────────────────────────────────
export function VizPending({
    title, sub, pill,
}: { title: string; sub: string; pill: Pill }) {
    return (
        <VizFrame title={title} sub={sub} pill={pill} kind="diagram">
            <div className="ld-vf-pending">screenshot pending</div>
        </VizFrame>
    );
}

export function VizSimstd() {
    return (
        <VizFrame
            title="simstd.hpp"
            sub="3 visualization functions"
            pill={{ label: "include", tone: "lsp" }}
            kind="diagram"
        >
            <div className="ld-simstd">
                {SIMSTD_FNS.map((f) => (
                    <div key={f.name} className="ld-simstd-row">
                        <span className="ld-simstd-icon">{f.icon}</span>
                        <div className="ld-simstd-meta">
                            <code className="ld-simstd-name">{f.name}<span className="ld-simstd-sig">{f.sig}</span></code>
                            <span className="ld-simstd-desc">{f.desc}</span>
                        </div>
                    </div>
                ))}
            </div>
        </VizFrame>
    );
}
