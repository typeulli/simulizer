"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildSvg } from "@/components/console/panels/GraphArray";

/**
 * Hero canvas: an interactive embed of the workspace's SeriesPanel pattern
 * (header · ◀ slider ▶ · Graph). Runs the workspace's actual 1D FDTD EM
 * simulation: 500-cell grid, modulated Gaussian current source at k=1,
 * Mur 1st-order absorbing boundaries at both walls. (Particles, B3, J2,
 * J3 from the full sim are dropped — they don't affect the plotted E1.)
 */

const N3 = 500;
const Nt = 1000;
const VC = 299792458;
const DT = 1e-16;
const DX = 4e-8;
const C = 3e8;
const MU = 1.257e-6;
const PER = 2.5e-15;

const CELLS = N3;
const FRAMES_E = Nt;

function runSimulation(): number[][] {
    const E1 = new Float64Array(N3);
    const E2 = new Float64Array(N3);
    const B1 = new Float64Array(N3);
    const B2 = new Float64Array(N3);
    const J1 = new Float64Array(N3);

    const dtdx   = DT / DX;
    const c2dtdx = C * C * DT / DX;
    const c2dt   = C * C * DT;
    const f      = C * DT / DX;
    const srcAmp = 4 / (MU * VC * DX);
    const omega  = (2 * Math.PI) / PER;

    const frames: number[][] = new Array(Nt);

    for (let i = 0; i < Nt; i++) {
        const t = DT * i;
        const env = Math.exp(-((t - 6 * PER) ** 2) / (PER * PER));
        J1[1] = srcAmp * Math.cos(omega * t) * env;

        // Faraday: B update for k = 0 .. N3-2
        for (let k = 0; k < N3 - 1; k++) {
            B1[k] += (E2[k + 1] - E2[k]) * dtdx;
            B2[k] -= (E1[k + 1] - E1[k]) * dtdx;
        }
        // Mur 1st-order absorbing BC at right wall (k = N3-1)
        {
            const k = N3 - 1;
            B1[k] = (B1[k] * (1 - f) - 2 * E2[k] * dtdx) / (1 + f);
            B2[k] = (B2[k] * (1 - f) + 2 * E1[k] * dtdx) / (1 + f);
        }

        // Ampere: E update for k = 1 .. N3-1
        for (let k = 1; k < N3; k++) {
            E1[k] += -(B2[k] - B2[k - 1]) * c2dtdx - J1[k] * MU * c2dt;
            E2[k] += (B1[k] - B1[k - 1]) * c2dtdx;
        }
        // Mur 1st-order absorbing BC at left wall (k = 0)
        {
            const k = 0;
            E1[k] = (E1[k] * (1 - f) - 2 * B2[k] * c2dtdx - J1[k] * MU * c2dt) / (1 + f);
            E2[k] = (E2[k] * (1 - f) + 2 * B1[k] * c2dtdx) / (1 + f);
        }

        frames[i] = Array.from(E1);
    }

    return frames;
}

type PanelProps = {
    title: string;
    total: number;
    cells: number;
    data: number[];
    /** When provided, renders the slider/buttons so the user can scrub. */
    scrub?: { frame: number; onFrame: (f: number) => void };
};

function Series({ title, total, cells, data, scrub }: PanelProps) {
    const slotRef = useRef<HTMLDivElement>(null);

    // Redraw the SVG whenever data changes — let GraphArray auto-range.
    // Force the SVG to stretch to fill its parent box (no letterboxing); the
    // viewBox aspect (2:1) is close enough to the panel that text stretches
    // only slightly. vectorEffect="non-scaling-stroke" keeps line widths
    // crisp regardless of the stretch.
    useEffect(() => {
        const slot = slotRef.current;
        if (!slot) return;
        // Symmetric y-range so the E=0 baseline always sits in the middle.
        let maxAbs = 0;
        for (let i = 0; i < data.length; i++) {
            const v = data[i] < 0 ? -data[i] : data[i];
            if (v > maxAbs) maxAbs = v;
        }
        if (maxAbs < 1e-6) maxAbs = 1;
        const svg = buildSvg(data, -maxAbs, maxAbs);
        // Let CSS centre + scale the SVG (no preserveAspectRatio override —
        // keep its natural 2:1 aspect so labels stay readable).
        slot.replaceChildren(svg);
    }, [data]);

    return (
        <div className="ld-series">
            <div className="ld-series-hd">
                <span className="ld-series-title">📊 {title}</span>
                <span className="ld-series-count">({total}개)</span>
            </div>
            {scrub && (
                <div className="ld-series-nav">
                    <button
                        type="button"
                        className="ld-series-btn"
                        onClick={() => scrub.onFrame(Math.max(0, scrub.frame - 1))}
                        aria-label="previous frame"
                    >◀</button>
                    <input
                        type="range"
                        min={0}
                        max={total - 1}
                        value={scrub.frame}
                        onChange={e => scrub.onFrame(parseInt(e.target.value, 10))}
                        className="ld-series-slider"
                    />
                    <span className="ld-series-step">{scrub.frame + 1} / {total}</span>
                    <button
                        type="button"
                        className="ld-series-btn"
                        onClick={() => scrub.onFrame(Math.min(total - 1, scrub.frame + 1))}
                        aria-label="next frame"
                    >▶</button>
                </div>
            )}
            <div className="ld-series-graph">
                <div className="ld-series-graph-label">📈 Graph [{cells}]</div>
                <div ref={slotRef} />
            </div>
        </div>
    );
}

// Run the full simulation to its last frame before looping.
const LOOP_END = FRAMES_E - 1;
const ZERO_FRAME: number[] = new Array(CELLS).fill(0);

export function HeroSeries() {
    const [frame, setFrame] = useState(400);
    const [autoplay, setAutoplay] = useState(true);
    const [frames, setFrames] = useState<number[][] | null>(null);

    // Run the FDTD sim once on mount. ~4MB / ~50–100ms; defer past first
    // paint so it doesn't block the hero rendering.
    useEffect(() => {
        let cancelled = false;
        const id = setTimeout(() => {
            if (cancelled) return;
            setFrames(runSimulation());
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(id);
        };
    }, []);

    useEffect(() => {
        if (!autoplay) return;
        const id = setInterval(() => {
            setFrame(f => (f >= LOOP_END ? 0 : f + 8));
        }, 60);
        return () => clearInterval(id);
    }, [autoplay]);

    const eData = useMemo(() => {
        if (!frames) return ZERO_FRAME;
        return frames[Math.min(frame, frames.length - 1)];
    }, [frame, frames]);

    const onFrameChange = (f: number) => {
        setFrame(f);
        setAutoplay(false);
    };

    return (
        <div
            className="ld-shot"
            role="img"
            aria-label="Interactive 1D EM FDTD simulation — scrub the slider to step through frames"
        >
            <header className="ld-shot-hd">
                <div className="ld-shot-hd-l">
                    <span className="ld-shot-file">em-wave-packet</span>
                    <span className="ld-shot-sep">·</span>
                    <span className="ld-shot-meta">1D EM field across a 500-cell grid</span>
                </div>
                <div className="ld-shot-hd-r">
                    <span className="ld-shot-pill">
                        <span className="ld-shot-pill-dot" /> WASM
                    </span>
                </div>
            </header>

            <div className="ld-series-stack">
                <Series
                    title="시리즈 · E(x, t)"
                    total={FRAMES_E}
                    cells={CELLS}
                    data={eData}
                    scrub={{ frame, onFrame: onFrameChange }}
                />
            </div>

            <footer className="ld-shot-ft">
                <div className="ld-shot-tele">
                    <span className="ld-shot-tele-item">
                        <span className="ld-shot-tele-k">grid</span>
                        <span className="ld-shot-tele-v">{CELLS}</span>
                    </span>
                    <span className="ld-shot-tele-item">
                        <span className="ld-shot-tele-k">timesteps</span>
                        <span className="ld-shot-tele-v">{FRAMES_E}</span>
                    </span>
                </div>
                <span className="ld-shot-ft-r">drag to scrub</span>
            </footer>
        </div>
    );
}
