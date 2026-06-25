"use client";

import Link from "next/link";
import { useTheme } from "@/hooks/useTheme";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { token } from "@/components/tokens";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { TopbarBrand } from "@/components/organisms/TopbarBrand";
import { RELEASE, FILENAME } from "./release";

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DownloadPage() {
    const { theme, toggleTheme } = useTheme();
    const isMobile = useIsMobile();

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
                        <WindowsGlyph size={12} />
                        Windows · Desktop · v{RELEASE.version}
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

                    {/* download CTA */}
                    <div
                        style={{
                            marginTop: token.space.sp8,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: token.space.sp3,
                        }}
                    >
                        <Link href="/download/start" style={{ textDecoration: "none" }}>
                            <Button variant="primary" size="xl" leading={<Icon.Download size={16} />}>
                                Windows용 다운로드
                            </Button>
                        </Link>
                        <span style={{ fontSize: token.font.size.fs12, color: token.color.fgSubtle, fontFamily: token.font.family.mono }}>
                            {FILENAME} · {RELEASE.platform}
                        </span>
                        <div style={{ display: "flex", gap: token.space.sp4, marginTop: token.space.sp1, flexWrap: "wrap", justifyContent: "center" }}>
                            <a href={RELEASE.releasesPage} target="_blank" rel="noopener noreferrer" style={linkStyle}>
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
                            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
                            gap: token.space.sp3,
                        }}
                    >
                        <FeatureCard
                            icon={<Icon.Layers size={18} />}
                            title="Simulizer Editor"
                            mono="simulizer.exe"
                            desc="Block과 C++ 워크스페이스를 그대로. 프로젝트는 .simblock / .simclang 파일로 로컬에 저장됩니다."
                        />
                        <FeatureCard
                            icon={<Icon.Play size={18} />}
                            title="Simulizer Viewer"
                            mono="simulizerv.exe"
                            desc=".sim 시뮬레이션을 실행하고 결과를 시각화하는 가벼운 뷰어입니다."
                        />
                        <FeatureCard
                            icon={<Icon.File size={18} />}
                            title=".sim 파일 연결"
                            mono="double-click → open"
                            desc=".sim 더블클릭으로 바로 실행. 시작 메뉴 · 바탕화면 바로가기도 함께 등록됩니다."
                        />
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
                        <ReqRow label="운영체제" value="Windows 10 / 11 (64-bit)" />
                        <ReqRow label="런타임" value="Microsoft Edge WebView2 (대부분의 Windows에 기본 포함)" />
                        <ReqRow label="디스크" value="약 200 MB" />
                        <ReqRow label="라이선스" value="AGPL-3.0 · 무료" last />
                    </div>
                </section>

                {/* ── Install note (SmartScreen) ── */}
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
                            설치 시 “Windows의 PC 보호” 화면이 뜰 수 있습니다
                        </span>
                        <span style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted, lineHeight: 1.7, wordBreak: "keep-all" }}>
                            설치 파일에 아직 코드 서명이 적용되지 않아 SmartScreen 경고가 표시될 수 있습니다.
                            <strong> 추가 정보 → 실행</strong>을 눌러 설치를 계속하세요. 소스는{" "}
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

function WindowsGlyph({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M3 5.5 11 4.3v7.2H3V5.5Zm0 13L11 19.7v-7.1H3v5.9Zm9-14.4L21 2.8v8.7h-9V4.1Zm0 16.3 9 1.3v-8.6h-9v7.3Z" />
        </svg>
    );
}
