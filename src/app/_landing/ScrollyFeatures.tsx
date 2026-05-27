"use client";

import React, { useEffect, useRef, useState } from "react";

export type ScrollyStep = {
    id: string;
    tag: string;
    name: string;
    desc: React.ReactNode;
    viz: React.ReactNode;
};

type Props = {
    eyebrow: string;
    title: React.ReactNode;
    intro?: React.ReactNode;
    steps: ScrollyStep[];
    /** which side the viz sits on at desktop widths */
    vizSide?: "left" | "right";
};

export function ScrollyFeatures({ eyebrow, title, intro, steps, vizSide = "right" }: Props) {
    const [activeIdx, setActiveIdx] = useState(0);
    const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                let bestIdx = activeIdx;
                let bestRatio = -1;
                for (const e of entries) {
                    if (!(e.target instanceof HTMLElement)) continue;
                    const idx = Number(e.target.dataset.stepIdx);
                    if (e.isIntersecting && e.intersectionRatio > bestRatio) {
                        bestRatio = e.intersectionRatio;
                        bestIdx = idx;
                    }
                }
                if (bestRatio >= 0) setActiveIdx(bestIdx);
            },
            { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.5, 1] }
        );
        const refs = stepRefs.current;
        refs.forEach((r) => r && observer.observe(r));
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [steps.length]);

    return (
        <section className={`ld-section ld-scrolly-section ld-scrolly-${vizSide}`}>
            <div className="ld-container">
                <div className="ld-scrolly-head">
                    <div className="ld-eyebrow">{eyebrow}</div>
                    <h2 className="ld-scrolly-title">{title}</h2>
                    {intro && <p className="ld-scrolly-intro">{intro}</p>}
                </div>

                <div className="ld-scrolly">
                    <div className="ld-scrolly-text">
                        {steps.map((s, i) => (
                            <div
                                key={s.id}
                                ref={(el) => { stepRefs.current[i] = el; }}
                                data-step-idx={i}
                                className={`ld-scrolly-step ${activeIdx === i ? "is-active" : ""}`}
                            >
                                <span className="ld-scrolly-num">
                                    {String(i + 1).padStart(2, "0")} <span className="ld-scrolly-of">/ {String(steps.length).padStart(2, "0")}</span>
                                </span>
                                <span className="ld-scrolly-tag">{s.tag}</span>
                                <h3 className="ld-scrolly-name">{s.name}</h3>
                                <div className="ld-scrolly-desc">{s.desc}</div>
                                {/* Mobile-only inline viz (sticky column is hidden < 900px) */}
                                <div className="ld-scrolly-viz-inline">{s.viz}</div>
                            </div>
                        ))}
                    </div>
                    <div className="ld-scrolly-viz-wrap">
                        <div className="ld-scrolly-viz-sticky">
                            {steps.map((s, i) => (
                                <div
                                    key={s.id}
                                    className={`ld-scrolly-viz-slide ${activeIdx === i ? "is-active" : ""}`}
                                    aria-hidden={activeIdx !== i}
                                >
                                    {s.viz}
                                </div>
                            ))}
                            <div className="ld-scrolly-progress" aria-hidden>
                                {steps.map((s, i) => (
                                    <span key={s.id} className={`ld-scrolly-dot ${activeIdx === i ? "is-active" : ""}`} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
