"use client";

import React, { useEffect, useRef, useState } from "react";

export type PipelineStage = {
    id: string;
    num: string;
    label: string;
    sub: string;
    title: string;
    body: React.ReactNode;
    viz: React.ReactNode;
};

type Props = {
    eyebrow: string;
    title: React.ReactNode;
    intro?: React.ReactNode;
    stages: PipelineStage[];
};

/**
 * Pipeline section with a sticky horizontal track pinned at the top.
 * Each stage flows vertically below; an IntersectionObserver activates
 * the corresponding track marker as the stage centres in the viewport.
 */
export function PipelineScrolly({ eyebrow, title, intro, stages }: Props) {
    const stageRefs = useRef<Array<HTMLDivElement | null>>([]);
    const [active, setActive] = useState(0);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                let bestIdx = active;
                let bestRatio = -1;
                for (const e of entries) {
                    if (!(e.target instanceof HTMLElement)) continue;
                    const idx = Number(e.target.dataset.stageIdx);
                    if (e.isIntersecting && e.intersectionRatio > bestRatio) {
                        bestRatio = e.intersectionRatio;
                        bestIdx = idx;
                    }
                }
                if (bestRatio >= 0) setActive(bestIdx);
            },
            { rootMargin: "-40% 0px -40% 0px", threshold: [0, 0.25, 0.5, 1] }
        );
        const refs = stageRefs.current;
        refs.forEach((r) => r && observer.observe(r));
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stages.length]);

    return (
        <section className="ld-section ld-scrolly-section">
            <div className="ld-container">
                <div className="ld-scrolly-head">
                    <div className="ld-eyebrow">{eyebrow}</div>
                    <h2 className="ld-scrolly-title">{title}</h2>
                    {intro && <p className="ld-scrolly-intro">{intro}</p>}
                </div>
            </div>

            <div className="ld-pipe-rail">
                <div className="ld-pipe-rail-track-wrap">
                    <div className="ld-pipe-rail-track-bg" />
                    <div className="ld-container">
                        <div
                            className="ld-dp-track ld-pipe-rail-track"
                            style={{ ["--ld-dp-steps" as never]: stages.length }}
                            role="tablist"
                            aria-label="pipeline stages"
                        >
                            {stages.map((s, i) => (
                                <div
                                    key={s.id}
                                    className="ld-dp-step"
                                    data-active={i === active}
                                    role="tab"
                                    aria-selected={i === active}
                                >
                                    <span className="ld-dp-step-num">{s.num}</span>
                                    <span className="ld-dp-step-node" />
                                    <span className="ld-dp-step-label">{s.label}</span>
                                    <span className="ld-dp-step-sub">{s.sub}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="ld-pipe-rail-fade" aria-hidden />
                </div>

                <div className="ld-container">
                    <div className="ld-pipe-rail-stages">
                        {stages.map((s, i) => (
                            <div
                                key={s.id}
                                ref={(el) => { stageRefs.current[i] = el; }}
                                data-stage-idx={i}
                                className="ld-pipe-rail-stage"
                            >
                                <div className="ld-dp-explain">
                                    <div className="ld-section-num">{s.num} · STAGE</div>
                                    <div className="ld-dp-explain-title">{s.title}</div>
                                    <div className="ld-dp-explain-body">{s.body}</div>
                                </div>
                                <div className="ld-pipe-rail-stage-viz">{s.viz}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
