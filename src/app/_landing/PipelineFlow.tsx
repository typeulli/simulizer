"use client";

import { useEffect, useState } from "react";

type StageContent = {
    key: "blocks" | "wat" | "wasm" | "worker" | "result";
    label: string;
    tag: string;
    samples: string[];
};

const STAGES: StageContent[] = [
    {
        key: "blocks",
        label: "Blockly JSON",
        tag: "01 · BUILD",
        samples: [
            "flow_while {…}",
            "local_set_i32",
            "i32_binop · add",
        ],
    },
    {
        key: "wat",
        label: "WAT text",
        tag: "02 · LOWER",
        samples: [
            "local.set $i",
            "i32.add",
            "loop $L (…)",
        ],
    },
    {
        key: "wasm",
        label: "WASM bytes",
        tag: "03 · COMPILE",
        samples: [
            "00 61 73 6D",
            "0A 0E 01 0C",
            "60 00 7F 03",
        ],
    },
    {
        key: "worker",
        label: "Web Worker",
        tag: "04 · EXEC",
        samples: [
            "main() → i32",
            "instantiate(…)",
            "TF · webgpu",
        ],
    },
    {
        key: "result",
        label: "Result",
        tag: "05 · RENDER",
        samples: ["55", "55", "55"],
    },
];

export function PipelineFlow() {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 2200);
        return () => clearInterval(id);
    }, []);

    // Positions are percentages — diagonal staircase across the canvas
    const positions: Record<StageContent["key"], { x: number; y: number }> = {
        blocks: { x: 22, y: 14 },
        wat:    { x: 42, y: 32 },
        wasm:   { x: 62, y: 50 },
        worker: { x: 32, y: 72 },
        result: { x: 72, y: 84 },
    };

    return (
        <div className="ld-flow" role="img" aria-label="Simulizer compile pipeline visualization">
            <div className="ld-flow-corner tl" />
            <div className="ld-flow-corner tr" />
            <div className="ld-flow-corner bl" />
            <div className="ld-flow-corner br" />
            <div className="ld-gridfield" aria-hidden />

            <div className="ld-flow-readout">
                <span className="ld-flow-readout-dot" />
                <span>pipeline · live</span>
            </div>

            {/* SVG edges */}
            <svg className="ld-flow-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                {/* base path */}
                <path className="ld-flow-path" d={pathD(positions)} vectorEffect="non-scaling-stroke" />
                {/* glowing trace */}
                <path className="ld-flow-path-trace" d={pathD(positions)} vectorEffect="non-scaling-stroke" />
            </svg>

            {STAGES.map((s, i) => {
                const p = positions[s.key];
                const sample = s.samples[tick % s.samples.length];
                return (
                    <div
                        key={s.key}
                        className="ld-flow-stage ld-rise"
                        data-kind={s.key}
                        style={{
                            left: `${p.x}%`,
                            top: `${p.y}%`,
                            transform: "translate(-50%, -50%)",
                            ["--i" as never]: i + 2,
                        }}
                    >
                        <span className="ld-flow-stage-tag">{s.tag}</span>
                        <div className="ld-flow-stage-box">
                            {s.key === "result" ? (
                                <span key={tick} className="ld-flow-result ld-flow-stream enter">
                                    {sample}
                                </span>
                            ) : (
                                <span key={`${s.key}-${tick}`} className="ld-flow-stream enter">
                                    {sample}
                                </span>
                            )}
                        </div>
                        <span className="ld-flow-stage-label">{s.label}</span>
                    </div>
                );
            })}
        </div>
    );
}

function pathD(p: Record<string, { x: number; y: number }>): string {
    const pt = (key: string) => `${p[key].x},${p[key].y}`;
    // Smooth-ish curve through stages
    return [
        `M ${pt("blocks")}`,
        `C ${p.blocks.x + 12},${p.blocks.y + 4} ${p.wat.x - 10},${p.wat.y - 6} ${pt("wat")}`,
        `C ${p.wat.x + 12},${p.wat.y + 6} ${p.wasm.x - 12},${p.wasm.y - 6} ${pt("wasm")}`,
        `C ${p.wasm.x - 6},${p.wasm.y + 10} ${p.worker.x + 6},${p.worker.y - 6} ${pt("worker")}`,
        `C ${p.worker.x + 14},${p.worker.y + 6} ${p.result.x - 16},${p.result.y - 2} ${pt("result")}`,
    ].join(" ");
}
