"use client";

import { BlocklyPreview } from "@/components/organisms/BlocklyPreview";
import { token } from "@/components/tokens";

/**
 * A 100×100 heat-diffusion grid rendered as a tiny SVG heat map. Values are
 * Gaussian falloff from the centre — what the workspace's `show_mat T` panel
 * looks like once the simulation has run for ~1000 steps.
 */
function MatShowThumbnail() {
    const N = 32;
    const cells: { x: number; y: number; v: number }[] = [];
    const cx = (N - 1) / 2;
    const cy = (N - 1) / 2;
    const sigma = N * 0.22;
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const v = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
            cells.push({ x, y, v });
        }
    }
    return (
        <svg viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: 120, display: "block" }}>
            {cells.map((c, i) => {
                // viridis-ish: dark blue → cyan → green → yellow
                const t = c.v;
                const r = Math.round(255 * Math.max(0, t - 0.55) * 2);
                const g = Math.round(255 * (0.2 + t * 0.7));
                const b = Math.round(255 * (1 - t) * 0.85);
                return <rect key={i} x={c.x} y={c.y} width={1.02} height={1.02} fill={`rgb(${r},${g},${b})`} />;
            })}
        </svg>
    );
}

export function Showcase() {
    return (
        <div className="ld-show-frame">
            <div className="ld-show-chrome">
                <span className="ld-show-dot" style={{ background: token.color.danger }} />
                <span className="ld-show-dot" style={{ background: token.color.warning }} />
                <span className="ld-show-dot" style={{ background: token.color.success }} />
                <span className="ld-show-title">simulizer · heat-diffusion-2d.simulizer</span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-subtle)" }}>
                        ⌘K · open
                    </span>
                    <span
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            padding: "3px 8px",
                            border: "1px solid var(--border)",
                            borderRadius: 999,
                            color: "var(--fg-muted)",
                        }}
                    >
                        ● WASM
                    </span>
                </div>
            </div>

            <div className="ld-show-grid">
                <div className="ld-show-canvas">
                    <BlocklyPreview height={460} example="heat" />
                </div>
                <div className="ld-show-side">
                    <div className="ld-show-side-block">
                        <div className="ld-show-side-label">
                            <span
                                style={{
                                    width: 6, height: 6, borderRadius: 999,
                                    background: "var(--success)",
                                    boxShadow: "0 0 0 3px color-mix(in oklch, var(--success) 22%, transparent)",
                                }}
                            />
                            Result · matshow T
                        </div>
                        <div style={{ marginTop: 6, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
                            <MatShowThumbnail />
                        </div>
                        <div className="ld-show-result-sub" style={{ marginTop: 6 }}>tensor T · 100 × 100 · f64</div>
                    </div>
                    <div className="ld-show-side-block">
                        <div className="ld-show-side-label">WAT (excerpt)</div>
                        <pre className="ld-show-wat">{`(module
  (import "tensor" "create" (func $tnew (param i32 i32) (result i32)))
  (import "tensor" "get_f64" (func $tget (param i32 i32 i32) (result f64)))
  (import "tensor" "set_f64" (func $tset (param i32 i32 i32 f64)))
  (import "debug"  "matshow" (func $matshow (param i32)))
  (func $main
    (local $T i32) (local $Tf i32) (local $k i32) (local $i i32) (local $j i32)
    i32.const 100  i32.const 100  call $tnew  local.set $T
    i32.const 100  i32.const 100  call $tnew  local.set $Tf
    ;; for k = 0 .. nt
    ;;   for i = 1 .. 98
    ;;     for j = 1 .. 98
    ;;       lapl ← (T[i+1,j]+T[i-1,j]+T[i,j+1]+T[i,j-1] - 4·T[i,j]) / dx²
    ;;       Tf[i,j] ← T[i,j] + lapl·dt·α
    ...
    local.get $T  call $matshow))`}</pre>
                    </div>
                    <div className="ld-show-side-block" style={{ marginTop: "auto" }}>
                        <div className="ld-show-side-label">Console · trace</div>
                        <div
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 11,
                                color: "var(--fg-muted)",
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                            }}
                        >
                            <span>info · WebAssembly.instantiate ok</span>
                            <span>bar  · t=  250 / 1000</span>
                            <span>bar  · t=  500 / 1000</span>
                            <span>bar  · t= 1000 / 1000</span>
                            <span>matshow · T = 100×100</span>
                            <span style={{ color: "var(--success)" }}>done</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
