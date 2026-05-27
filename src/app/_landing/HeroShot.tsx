"use client";

/**
 * Hero canvas: a real result-panel screenshot from the poster's example set —
 * a 1D EM wave packet plotted by Simulizer (top: E-field across 500 grid
 * cells, bottom: probe value over 30 samples). Labels and ranges are read
 * directly off the chart; nothing fabricated.
 */
export function HeroShot() {
    return (
        <div className="ld-shot" role="img" aria-label="Simulizer result panel — 1D EM wave packet">
            <header className="ld-shot-hd">
                <div className="ld-shot-hd-l">
                    <span className="ld-shot-file">em-wave-packet</span>
                    <span className="ld-shot-sep">·</span>
                    <span className="ld-shot-meta">1D EM field over 500 cells · probe over 30 samples</span>
                </div>
                <div className="ld-shot-hd-r">
                    <span className="ld-shot-pill">
                        <span className="ld-shot-pill-dot" /> WASM
                    </span>
                </div>
            </header>

            <div className="ld-shot-canvas">
                <img
                    src="/landing/electric.png"
                    alt=""
                    aria-hidden
                    draggable={false}
                />
            </div>

            <footer className="ld-shot-ft">
                <div className="ld-shot-tele">
                    <span className="ld-shot-tele-item">
                        <span className="ld-shot-tele-k">E_max</span>
                        <span className="ld-shot-tele-v">+1.69</span>
                    </span>
                    <span className="ld-shot-tele-item">
                        <span className="ld-shot-tele-k">E_min</span>
                        <span className="ld-shot-tele-v">−2.00</span>
                    </span>
                    <span className="ld-shot-tele-item">
                        <span className="ld-shot-tele-k">grid</span>
                        <span className="ld-shot-tele-v">500</span>
                    </span>
                    <span className="ld-shot-tele-item">
                        <span className="ld-shot-tele-k">probe</span>
                        <span className="ld-shot-tele-v">30 samples</span>
                    </span>
                </div>
            </footer>
        </div>
    );
}
