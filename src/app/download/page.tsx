"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/hooks/useTheme";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { token } from "@/components/tokens";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { TopbarBrand } from "@/components/organisms/TopbarBrand";
import { PLATFORMS, PLATFORM_LIST, RELEASES_PAGE, VERSION, detectOS, type OS } from "./release";

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DownloadPage() {
    const { theme, toggleTheme } = useTheme();
    const isMobile = useIsMobile();
    // Default to Windows for SSR/first paint, then switch to the visitor's OS.
    const [os, setOs] = useState<OS>("windows");
    useEffect(() => setOs(detectOS()), []);
    const rel = PLATFORMS[os];

    return (
        <div
            style={{
                minHeight: "100vh",
                background: token.color.bg,
                color: token.color.fg,
                fontFamily: token.font.family.sans,
                display: "flex",
                flexDirection: "column",
            }}
        >
            {/* ── Nav ── */}
            <header
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: token.space.sp3,
                    padding: isMobile ? `0 ${token.space.sp4}` : `0 ${token.space.sp8}`,
                    height: 56,
                    borderBottom: `1px solid ${token.color.border}`,
                    position: "sticky",
                    top: 0,
                    zIndex: 50,
                    background: token.color.bg,
                    flexShrink: 0,
                }}
            >
                <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
                    <TopbarBrand />
                </Link>
                <span style={{ color: token.color.fgSubtle, fontWeight: 300 }}>/</span>
                <span style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted }}>Download</span>

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: token.space.sp2 }}>
                    {!isMobile && (
                        <Link href="/docs" style={{ textDecoration: "none" }}>
                            <Button variant="ghost" size="sm" leading={<Icon.Book size={13} />}>
                                Docs
                            </Button>
                        </Link>
                    )}
                    <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
                        {theme === "dark" ? <Icon.Sun size={14} /> : <Icon.Moon size={14} />}
                    </Button>
                    <Link href="/workspace" style={{ textDecoration: "none" }}>
                        <Button variant="secondary" size="sm">브라우저에서 열기</Button>
                    </Link>
                </div>
            </header>

            <main
                style={{
                    flex: 1,
                    width: "100%",
                    maxWidth: 960,
                    margin: "0 auto",
                    padding: isMobile
                        ? `${token.space.sp10} ${token.space.sp4} ${token.space.sp16}`
                        : `${token.space.sp20} ${token.space.sp6} ${token.space.sp24}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: token.space.sp16,
                }}
            >
                {/* ── Hero ── */}
                <section style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: token.space.sp15,
                            padding: `4px 10px`,
                            borderRadius: token.radius.full,
                            border: `1px solid ${token.color.border}`,
                            background: token.color.bgSubtle,
                            color: token.color.fgMuted,
                            fontSize: token.font.size.fs11,
                            fontFamily: token.font.family.mono,
                            letterSpacing: "0.02em",
                        }}
                    >
                        <OSGlyph os={os} size={12} />
                        {rel.label} · Desktop · v{VERSION}
                    </span>

                    <h1
                        style={{
                            margin: `${token.space.sp6} 0 0`,
                            fontSize: isMobile ? "clamp(36px, 10vw, 48px)" : "clamp(48px, 6vw, 72px)",
                            fontWeight: 800,
                            lineHeight: 1.02,
                            letterSpacing: "-0.04em",
                            color: token.color.fgStrong,
                        }}
                    >
                        Simulizer를<br />
                        <span
                            style={{
                                backgroundImage: token.color.gradient.title,
                                backgroundClip: "text",
                                WebkitBackgroundClip: "text",
                                color: "transparent",
                                WebkitTextFillColor: "transparent",
                            }}
                        >
                            데스크톱에서.
                        </span>
                    </h1>

                    <p
                        style={{
                            margin: `${token.space.sp5} 0 0`,
                            maxWidth: 560,
                            fontSize: token.font.size.fs16,
                            lineHeight: 1.7,
                            color: token.color.fgMuted,
                            fontWeight: 500,
                            wordBreak: "keep-all",
                        }}
                    >
                        브라우저와 동일한 Block · C++ 워크스페이스를 로컬 앱으로 사용하세요. 프로젝트를 내 컴퓨터에
                        파일로 저장하고, <code>.sim</code> 시뮬레이션을 더블클릭으로 바로 엽니다.
                    </p>

                    {/* OS selector */}
                    <div
                        style={{
                            marginTop: token.space.sp7,
                            display: "inline-flex",
                            gap: token.space.sp1,
                            padding: 4,
                            borderRadius: token.radius.full,
                            border: `1px solid ${token.color.border}`,
                            background: token.color.bgSubtle,
                        }}
                    >
                        {PLATFORM_LIST.map((p) => {
                            const active = p.os === os;
                            return (
                                <button
                                    key={p.os}
                                    onClick={() => setOs(p.os)}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: token.space.sp15,
                                        padding: `6px 14px`,
                                        borderRadius: token.radius.full,
                                        border: "none",
                                        cursor: "pointer",
                                        background: active ? token.color.surface : "transparent",
                                        boxShadow: active ? token.shadow.sm : "none",
                                        color: active ? token.color.fgStrong : token.color.fgMuted,
                                        fontFamily: token.font.family.sans,
                                        fontSize: token.font.size.fs13,
                                        fontWeight: token.font.weight.semibold,
                                    }}
                                >
                                    <OSGlyph os={p.os} size={13} />
                                    {p.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* download CTA */}
                    <div
                        style={{
                            marginTop: token.space.sp5,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: token.space.sp3,
                        }}
                    >
                        <Link href={`/download/start?os=${os}`} style={{ textDecoration: "none" }}>
                            <Button variant="primary" size="xl" leading={<Icon.Download size={16} />}>
                                {rel.label}용 다운로드
                            </Button>
                        </Link>
                        <span style={{ fontSize: token.font.size.fs12, color: token.color.fgSubtle, fontFamily: token.font.family.mono }}>
                            {rel.filename} · {rel.summary}
                        </span>
                        <div style={{ display: "flex", gap: token.space.sp4, marginTop: token.space.sp1, flexWrap: "wrap", justifyContent: "center" }}>
                            <a href={RELEASES_PAGE} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                                모든 버전 · 릴리스 노트 →
                            </a>
                            <Link href="/workspace" style={linkStyle}>
                                설치 없이 브라우저에서 쓰기 →
                            </Link>
                        </div>
                    </div>
                </section>

                {/* ── What's included ── */}
                <section>
                    <SectionLabel>설치되는 것</SectionLabel>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : `repeat(${rel.included.length}, 1fr)`,
                            gap: token.space.sp3,
                        }}
                    >
                        {rel.included.map((it, i) => (
                            <FeatureCard
                                key={i}
                                icon={it.kind === "viewer" ? <Icon.Play size={18} /> : it.kind === "editor" ? <Icon.Layers size={18} /> : <Icon.File size={18} />}
                                title={it.title}
                                mono={it.mono}
                                desc={it.desc}
                            />
                        ))}
                    </div>
                </section>

                {/* ── System requirements ── */}
                <section>
                    <SectionLabel>시스템 요구사항</SectionLabel>
                    <div
                        style={{
                            border: `1px solid ${token.color.border}`,
                            borderRadius: token.radius.lg,
                            background: token.color.surface,
                            overflow: "hidden",
                        }}
                    >
                        {rel.requirements.map((r, i) => (
                            <ReqRow key={i} label={r.label} value={r.value} last={i === rel.requirements.length - 1} />
                        ))}
                    </div>
                </section>

                {/* ── Install note (signing / Gatekeeper / AppImage) ── */}
                <section
                    style={{
                        display: "flex",
                        gap: token.space.sp3,
                        padding: `${token.space.sp4} ${token.space.sp5}`,
                        background: token.color.warningSoft,
                        border: `1px solid ${token.color.warningBorder}`,
                        borderLeft: `3px solid ${token.color.warning}`,
                        borderRadius: token.radius.lg,
                    }}
                >
                    <span style={{ color: token.color.warning, flexShrink: 0, marginTop: 1 }}>
                        <Icon.Zap size={16} />
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp1 }}>
                        <span style={{ fontSize: token.font.size.fs14, fontWeight: token.font.weight.semibold, color: token.color.fgStrong }}>
                            {rel.note.title}
                        </span>
                        <span style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted, lineHeight: 1.7, wordBreak: "keep-all" }}>
                            {rel.note.body}{" "}
                            소스는{" "}
                            <a href="https://github.com/typeulli/simulizer" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                                GitHub
                            </a>
                            에서 확인할 수 있습니다.
                        </span>
                    </div>
                </section>
            </main>

            {/* ── Footer ── */}
            <footer
                style={{
                    borderTop: `1px solid ${token.color.border}`,
                    padding: isMobile ? `${token.space.sp4} ${token.space.sp4}` : `${token.space.sp5} ${token.space.sp8}`,
                    display: "flex",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: token.space.sp2,
                    color: token.color.fgSubtle,
                }}
            >
                <span style={{ fontSize: token.font.size.fs11, fontFamily: token.font.family.mono }}>© 2026 Simulizer · AGPL-3.0</span>
                <a
                    href="https://github.com/typeulli/simulizer"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...linkStyle, fontFamily: token.font.family.mono, fontSize: token.font.size.fs11 }}
                >
                    github.com/typeulli/simulizer
                </a>
            </footer>
        </div>
    );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

const linkStyle: React.CSSProperties = {
    color: token.color.accent,
    textDecoration: "none",
    fontSize: token.font.size.fs13,
    fontWeight: token.font.weight.medium,
};

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <h2
            style={{
                margin: `0 0 ${token.space.sp4}`,
                fontSize: token.font.size.fs13,
                fontWeight: token.font.weight.semibold,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: token.color.fgSubtle,
                fontFamily: token.font.family.mono,
            }}
        >
            {children}
        </h2>
    );
}

function FeatureCard({ icon, title, mono, desc }: { icon: React.ReactNode; title: string; mono: string; desc: string }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: token.space.sp2,
                padding: token.space.sp5,
                background: token.color.surface,
                border: `1px solid ${token.color.border}`,
                borderRadius: token.radius.lg,
            }}
        >
            <span
                style={{
                    width: 36,
                    height: 36,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: token.radius.md,
                    background: token.color.accentSoft,
                    color: token.color.accent,
                }}
            >
                {icon}
            </span>
            <span style={{ fontSize: token.font.size.fs15, fontWeight: token.font.weight.semibold, color: token.color.fgStrong }}>
                {title}
            </span>
            <span style={{ fontSize: token.font.size.fs11, fontFamily: token.font.family.mono, color: token.color.fgSubtle }}>
                {mono}
            </span>
            <span style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted, lineHeight: 1.65, wordBreak: "keep-all" }}>
                {desc}
            </span>
        </div>
    );
}

function ReqRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: token.space.sp4,
                padding: `${token.space.sp3} ${token.space.sp5}`,
                borderBottom: last ? "none" : `1px solid ${token.color.borderSubtle}`,
            }}
        >
            <span style={{ width: 96, flexShrink: 0, fontSize: token.font.size.fs12, color: token.color.fgSubtle }}>{label}</span>
            <span style={{ fontSize: token.font.size.fs13, color: token.color.fg }}>{value}</span>
        </div>
    );
}

// ─── OS glyphs ─────────────────────────────────────────────────────────────────

function OSGlyph({ os, size = 12 }: { os: OS; size?: number }) {
    if (os === "macos") return <AppleGlyph size={size} />;
    if (os === "linux") return <LinuxGlyph size={size} />;
    return <WindowsGlyph size={size} />;
}

function WindowsGlyph({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M3 5.5 11 4.3v7.2H3V5.5Zm0 13L11 19.7v-7.1H3v5.9Zm9-14.4L21 2.8v8.7h-9V4.1Zm0 16.3 9 1.3v-8.6h-9v7.3Z" />
        </svg>
    );
}

function AppleGlyph({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M18.7 17.3c-.3.8-.5 1.2-.9 1.9-.6.9-1.4 2-2.4 2-.9 0-1.1-.6-2.3-.6s-1.5.6-2.3.6c-1 0-1.8-1-2.4-1.9-1.7-2.5-1.9-5.4-.8-7 .8-1.1 2-1.7 3.1-1.7s1.8.6 2.5.6c.7 0 1.1-.6 2.4-.6 1 0 2 .5 2.7 1.4-2.4 1.3-2 4.7.1 5.3ZM14.6 6.4c.5-.6.9-1.5.8-2.4-.8 0-1.7.5-2.3 1.2-.5.6-.9 1.5-.8 2.3.9.1 1.7-.5 2.3-1.1Z" />
        </svg>
    );
}

function LinuxGlyph({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2c-2 0-3.2 1.6-3.2 3.8 0 1.3.1 2-.5 3-.7 1.1-2.1 2.4-2.7 4-.3.8-.2 1.5.1 1.9-.4.6-.6 1.3-.2 1.9.3.5.9.6 1.5.7.5.1 1 .3 1.6.8.7.6 1.6 1.2 2.9 1.2s2.2-.6 2.9-1.2c.6-.5 1.1-.7 1.6-.8.6-.1 1.2-.2 1.5-.7.4-.6.2-1.3-.2-1.9.3-.4.4-1.1.1-1.9-.6-1.6-2-2.9-2.7-4-.6-1-.5-1.7-.5-3C15.2 3.6 14 2 12 2Zm-1.3 4.1c.4 0 .7.4.7.9s-.3.9-.7.9-.7-.4-.7-.9.3-.9.7-.9Zm2.6 0c.4 0 .7.4.7.9s-.3.9-.7.9-.7-.4-.7-.9.3-.9.7-.9Z" />
        </svg>
    );
}
