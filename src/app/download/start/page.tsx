"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { token } from "@/components/tokens";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { TopbarBrand } from "@/components/organisms/TopbarBrand";
import { RELEASE, FILENAME } from "../release";

// Programmatically start the download by clicking a synthetic anchor. GitHub
// serves release assets with `Content-Disposition: attachment`, so this kicks
// off the file download without navigating away from this page.
function triggerDownload() {
    const a = document.createElement("a");
    a.href = RELEASE.url;
    a.download = FILENAME;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

export default function DownloadStartPage() {
    const isMobile = useIsMobile();
    const [started, setStarted] = useState(false);
    const fired = useRef(false);

    useEffect(() => {
        if (fired.current) return; // guard against double-invocation
        fired.current = true;
        // Small delay so the page paints before the browser's download prompt.
        const t = setTimeout(() => {
            triggerDownload();
            setStarted(true);
        }, 700);
        return () => clearTimeout(t);
    }, []);

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
                    flexShrink: 0,
                }}
            >
                <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
                    <TopbarBrand />
                </Link>
                <span style={{ color: token.color.fgSubtle, fontWeight: 300 }}>/</span>
                <Link href="/download" style={{ textDecoration: "none" }}>
                    <span style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted }}>Download</span>
                </Link>
            </header>

            {/* ── Body ── */}
            <main
                style={{
                    flex: 1,
                    width: "100%",
                    maxWidth: 520,
                    margin: "0 auto",
                    padding: `${token.space.sp16} ${token.space.sp5}`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    justifyContent: "center",
                    gap: token.space.sp5,
                }}
            >
                {/* icon */}
                <span
                    style={{
                        width: 64,
                        height: 64,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: token.radius.full,
                        background: token.color.accentSoft,
                        color: token.color.accent,
                    }}
                >
                    <Icon.Download size={28} />
                </span>

                <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp2 }}>
                    <h1
                        style={{
                            margin: 0,
                            fontSize: isMobile ? token.font.size.fs28 : token.font.size.fs32,
                            fontWeight: 800,
                            letterSpacing: "-0.03em",
                            color: token.color.fgStrong,
                        }}
                    >
                        {started ? "다운로드를 시작했습니다" : "다운로드를 준비 중입니다…"}
                    </h1>
                    <p style={{ margin: 0, fontSize: token.font.size.fs15, color: token.color.fgMuted, lineHeight: 1.7, wordBreak: "keep-all" }}>
                        잠시 후 <strong>{FILENAME}</strong> 다운로드가 자동으로 시작됩니다.
                        <br />
                        시작되지 않으면 아래 버튼으로 직접 받으세요.
                    </p>
                </div>

                {/* manual download */}
                <a href={RELEASE.url} download={FILENAME} onClick={() => setStarted(true)} style={{ textDecoration: "none" }}>
                    <Button variant="primary" size="lg" leading={<Icon.Download size={15} />}>
                        수동으로 다운로드
                    </Button>
                </a>

                <span style={{ fontSize: token.font.size.fs12, color: token.color.fgSubtle, fontFamily: token.font.family.mono }}>
                    {RELEASE.platform} · v{RELEASE.version}
                </span>

                {/* SmartScreen reminder */}
                <div
                    style={{
                        display: "flex",
                        gap: token.space.sp25,
                        textAlign: "left",
                        padding: `${token.space.sp3} ${token.space.sp4}`,
                        background: token.color.warningSoft,
                        border: `1px solid ${token.color.warningBorder}`,
                        borderRadius: token.radius.md,
                        marginTop: token.space.sp2,
                    }}
                >
                    <span style={{ color: token.color.warning, flexShrink: 0, marginTop: 1 }}>
                        <Icon.Zap size={14} />
                    </span>
                    <span style={{ fontSize: token.font.size.fs12, color: token.color.fgMuted, lineHeight: 1.65, wordBreak: "keep-all" }}>
                        설치 시 SmartScreen 경고가 뜨면 <strong>추가 정보 → 실행</strong>을 눌러 계속하세요.
                    </span>
                </div>

                {/* secondary links */}
                <div style={{ display: "flex", gap: token.space.sp4, flexWrap: "wrap", justifyContent: "center", marginTop: token.space.sp1 }}>
                    <a href={RELEASE.releasesPage} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                        모든 버전 · 릴리스 노트 →
                    </a>
                    <Link href="/download" style={linkStyle}>
                        다운로드 안내로 돌아가기 →
                    </Link>
                </div>
            </main>
        </div>
    );
}

const linkStyle: React.CSSProperties = {
    color: token.color.accent,
    textDecoration: "none",
    fontSize: token.font.size.fs13,
    fontWeight: token.font.weight.medium,
};
