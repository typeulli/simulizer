"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Hero canvas: a real damped-pendulum phase portrait — the kind of plot
 * Simulizer actually produces. We integrate the ODE in JS at mount time and
 * draw the trajectories as SVG polylines, then animate them with
 * stroke-dashoffset so they "draw themselves" once on load. No decorative
 * stage chips, no fake pipeline diagram — this is the product output.
 *
 *     θ̈ + 0.18 θ̇ + sin θ = 0
 */

const W = 100;
const H = 100;
const X_MIN = -Math.PI * 1.25;
const X_MAX =  Math.PI * 1.25;
const Y_MIN = -3.3;
const Y_MAX =  3.3;

const px = (theta: number) => ((theta - X_MIN) / (X_MAX - X_MIN)) * W;
const py = (omega: number) => H - ((omega - Y_MIN) / (Y_MAX - Y_MIN)) * H;

function integrate(theta0: number, omega0: number, steps = 1400, dt = 0.020, damping = 0.18) {
    let theta = theta0;
    let omega = omega0;
    const pts: string[] = [`${px(theta).toFixed(2)},${py(omega).toFixed(2)}`];
    for (let i = 0; i < steps; i++) {
        // semi-implicit Euler
        omega += (-Math.sin(theta) - damping * omega) * dt;
        theta += omega * dt;
        pts.push(`${px(theta).toFixed(2)},${py(omega).toFixed(2)}`);
    }
    return pts.join(" ");
}

type Trace = {
    color: string;
    width: number;
    points: string;
    delay: number;
};

const TRACES: Trace[] = [
    { color: "var(--accent)",             width: 1.6, points: integrate( 2.95,  0.0),  delay: 0    },
    { color: "oklch(62% 0.16 160)",       width: 1.6, points: integrate(-1.9,   1.6),  delay: 200  },
    { color: "var(--accent)",             width: 1.3, points: integrate( 0.6,  -1.0),  delay: 400  },
    { color: "oklch(62% 0.16 160)",       width: 1.3, points: integrate(-0.4,   0.6),  delay: 600  },
    { color: "var(--accent)",             width: 1.1, points: integrate( 1.1,   2.3),  delay: 800  },
];

const TELEMETRY = [
    { k: "θ",  v: "+0.42" },
    { k: "θ̇", v: "−1.10" },
    { k: "Δt", v: "0.020 s" },
    { k: "τ",  v: "16.4 s" },
];

export function HeroSim() {
    // Cycle through telemetry-ish values so it feels alive
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1200);
        return () => clearInterval(id);
    }, []);
    const liveTheta = useMemo(() => {
        const phase = tick * 0.4;
        return (Math.sin(phase) * 1.6).toFixed(2);
    }, [tick]);
    const liveOmega = useMemo(() => {
        const phase = tick * 0.4;
        return (Math.cos(phase) * 1.2).toFixed(2);
    }, [tick]);

    return (
        <div className="ld-sim" role="img" aria-label="damped pendulum phase portrait — Simulizer output">
            <header className="ld-sim-hd">
                <div className="ld-sim-hd-l">
                    <span className="ld-sim-file">damped-pendulum.simulizer</span>
                    <span className="ld-sim-sep">·</span>
                    <span className="ld-sim-meta">phase portrait of θ̈ + 0.18 θ̇ + sin θ = 0</span>
                </div>
                <div className="ld-sim-hd-r">
                    <span className="ld-sim-pill">
                        <span className="ld-sim-pill-dot" /> running
                    </span>
                    <span className="ld-sim-pill mono">WebGPU · 12 ms</span>
                </div>
            </header>

            <div className="ld-sim-canvas">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="ld-sim-svg" aria-hidden>
                    {/* axes */}
                    <line x1={px(0)} y1="0" x2={px(0)} y2="100" stroke="var(--border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.6" />
                    <line x1="0" y1={py(0)} x2="100" y2={py(0)} stroke="var(--border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.6" />

                    {/* equilibrium marker (attractor) */}
                    <circle cx={px(0)} cy={py(0)} r="4" fill="none" stroke="var(--fg-subtle)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.35" />
                    <circle cx={px(0)} cy={py(0)} r="1.5" fill="var(--fg-subtle)" opacity="0.55" />

                    {/* trajectories */}
                    {TRACES.map((t, i) => (
                        <polyline
                            key={i}
                            points={t.points}
                            fill="none"
                            stroke={t.color}
                            strokeWidth={t.width * 1.6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                            style={{
                                opacity: 0.88,
                                strokeDasharray: 800,
                                strokeDashoffset: 800,
                                animation: `ld-sim-draw 4s var(--ease-out) ${t.delay}ms forwards`,
                            }}
                        />
                    ))}

                    {/* current particle marker on the leading trajectory */}
                    <circle
                        cx={px(parseFloat(liveTheta))}
                        cy={py(parseFloat(liveOmega))}
                        r="2.4"
                        fill="var(--accent)"
                        opacity="0.25"
                        style={{ transition: "cx 1.2s linear, cy 1.2s linear" }}
                    />
                    <circle
                        cx={px(parseFloat(liveTheta))}
                        cy={py(parseFloat(liveOmega))}
                        r="1.6"
                        fill="var(--accent)"
                        style={{ transition: "cx 1.2s linear, cy 1.2s linear" }}
                    />
                </svg>

                {/* axis labels */}
                <span className="ld-sim-axis ld-sim-axis-x">θ →</span>
                <span className="ld-sim-axis ld-sim-axis-y">θ̇ →</span>
            </div>

            <footer className="ld-sim-ft">
                <div className="ld-sim-tele">
                    {TELEMETRY.map((t, i) => (
                        <span key={t.k} className="ld-sim-tele-item">
                            <span className="ld-sim-tele-k">{t.k}</span>
                            <span className="ld-sim-tele-v">
                                {i === 0 ? (parseFloat(liveTheta) >= 0 ? `+${liveTheta}` : liveTheta) :
                                 i === 1 ? (parseFloat(liveOmega) >= 0 ? `+${liveOmega}` : liveOmega) :
                                 t.v}
                            </span>
                        </span>
                    ))}
                </div>
                <span className="ld-sim-ft-r">step 412 / 1400</span>
            </footer>
        </div>
    );
}
