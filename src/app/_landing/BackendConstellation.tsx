"use client";

type Node = {
    id: string;
    label: string;
    name: string;
    meta: string;
    x: number; // % of width
    y: number; // % of height
    kind: "center" | "svc-api" | "svc-ai" | "svc-auth" | "ext";
};

const NODES: Node[] = [
    { id: "fe",     label: "client",              name: "Frontend",       meta: "Next.js · React 19",     x: 14, y: 50, kind: "center"   },
    { id: "svc-ai", label: "service · AI · GPU",  name: "AI · SAM2 Tracker",     meta: "KSA Turing · H100",      x: 52, y: 18, kind: "svc-ai"   },
    { id: "svc-api",label: "service · API",        name: "API · Compiler + LLM",  meta: "FastAPI · :8000",        x: 52, y: 50, kind: "svc-api"  },
    { id: "svc-auth",label: "service · Auth · stateful", name: "Auth + Files", meta: "FastAPI · :8001",        x: 52, y: 82, kind: "svc-auth" },
    { id: "groq",   label: "provider",            name: "Groq",           meta: "gpt-oss-120b",           x: 88, y: 50, kind: "ext"      },
    { id: "google", label: "provider",            name: "Google OAuth",   meta: "openid · hd=ksa.hs.kr",  x: 88, y: 82, kind: "ext"      },
];

type Edge = {
    from: string;
    to: string;
    style: "solid" | "dashed" | "accent" | "success" | "purple";
    label?: string;
    /** position along path 0–1 */
    labelT?: number;
    /** vertical pixel offset of label */
    labelDy?: number;
    /** horizontal pixel offset of label */
    labelDx?: number;
};

const EDGES: Edge[] = [
    { from: "fe",      to: "svc-ai",   style: "purple",  label: "/track/* · WebSocket",                                                  labelT: 0.5,  labelDy: -10 },
    { from: "fe",      to: "svc-api",  style: "accent",  label: "SSE · /chat\nPOST · /translate · /compile · /texocr",                  labelT: 0.5,  labelDy: -14 },
    { from: "fe",      to: "svc-auth", style: "success", label: "cookie · /auth/* · /files/*",                                          labelT: 0.5,  labelDy: 14  },
    { from: "svc-api", to: "groq",     style: "dashed",  label: "LLM stream",  labelT: 0.55, labelDy: -10 },
    { from: "svc-auth",to: "google",   style: "dashed",  label: "OAuth · userinfo",  labelT: 0.55, labelDy: -10 },
];

export function BackendConstellation() {
    const node = (id: string) => NODES.find(n => n.id === id)!;

    return (
        <div className="ld-const" role="img" aria-label="Simulizer three-service backend constellation">
            <div className="ld-const-inner">
            <div className="ld-const-grid" aria-hidden />

            <svg className="ld-const-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                {EDGES.map((e, i) => {
                    const a = node(e.from);
                    const b = node(e.to);
                    return (
                        <path
                            key={i}
                            className={`ld-const-edge ${e.style}`}
                            d={curveD(a, b)}
                            vectorEffect="non-scaling-stroke"
                        />
                    );
                })}
            </svg>

            {/* Edge labels (HTML, positioned along curves) */}
            {EDGES.map((e, i) => {
                const a = node(e.from);
                const b = node(e.to);
                const t = e.labelT ?? 0.5;
                const mx = a.x + (b.x - a.x) * t + (e.labelDx ?? 0);
                const my = a.y + (b.y - a.y) * t;
                if (!e.label) return null;
                return (
                    <div
                        key={`l-${i}`}
                        style={{
                            position: "absolute",
                            left: `${mx}%`,
                            top: `${my}%`,
                            transform: `translate(-50%, calc(-50% + ${e.labelDy ?? 0}px))`,
                            pointerEvents: "none",
                            zIndex: 2,
                        }}
                    >
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 10,
                                lineHeight: 1.45,
                                letterSpacing: "0.03em",
                                background: "var(--bg)",
                                padding: "3px 8px",
                                borderRadius: 4,
                                color: "var(--fg-muted)",
                                border: "1px solid var(--border-subtle)",
                                whiteSpace: "pre",
                                textAlign: "center",
                                display: "inline-block",
                                boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
                            }}
                        >
                            {e.label}
                        </span>
                    </div>
                );
            })}

            {NODES.map(n => (
                <div
                    key={n.id}
                    className={`ld-const-node ${n.kind}`}
                    style={{ left: `${n.x}%`, top: `${n.y}%`, zIndex: 3 }}
                >
                    <span className="ld-const-node-label">{n.label}</span>
                    <div className="ld-const-node-card">
                        <div className="name">{n.name}</div>
                        <div className="meta">{n.meta}</div>
                    </div>
                </div>
            ))}
            </div>

            <div className="ld-const-legend">
                <span><i className="purple" /> AI · /track</span>
                <span><i className="accent" /> API · /chat · /compile</span>
                <span><i className="success" /> Auth · cookie · CRUD</span>
                <span><i className="dashed" /> external provider</span>
            </div>
        </div>
    );
}

function curveD(a: Node, b: Node): string {
    // gentle horizontal bezier
    const dx = b.x - a.x;
    const c1x = a.x + dx * 0.45;
    const c2x = a.x + dx * 0.55;
    return `M ${a.x} ${a.y} C ${c1x} ${a.y} ${c2x} ${b.y} ${b.x} ${b.y}`;
}
