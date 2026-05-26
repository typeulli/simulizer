"use client";

// Shared chrome for markdown docs pages. Full-width three-column layout:
//   left grouped nav | reading column | right "on this page" rail.
// Studio-docs structure, mapped onto Simulizer's design tokens. The
// code-generated Reference page keeps its own standalone chrome.

import { useEffect, useState } from "react";
import Link from "next/link";

import { useTheme } from "@/hooks/useTheme";
import useLanguagePack from "@/hooks/useLanguagePack";
import { Topbar } from "@/components/organisms/Toolbar";
import { Text } from "@/components/atoms/Text";
import { Divider } from "@/components/atoms/Divider";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { Inline } from "@/components/atoms/layout/Inline";
import { MobileNavDrawer, MobileNavToggle } from "@/components/organisms/MobileNavDrawer";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { token } from "@/components/tokens";
import { getDocsNav, docsUi } from "@/lib/docs-nav";
import type { TocItem } from "@/components/docs/toc";

const TOP_OFFSET = 88;

function hrefFor(slug: string): string {
    return slug === "" ? "/docs" : `/docs/${slug}`;
}

function setLangCookie(lang: string) {
    document.cookie = `language=${lang}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

const groupLabel: React.CSSProperties = {
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    fontSize: token.font.size.fs11,
    color: token.color.fgSubtle,
    display: "block",
    marginBottom: token.space.sp2,
    paddingLeft: token.space.sp3,
};

function OnThisPage({ toc, label }: { toc: TocItem[]; label: string }) {
    const [activeId, setActiveId] = useState<string>("");

    useEffect(() => {
        if (toc.length === 0) return;
        const els = Array.from(
            document.querySelectorAll<HTMLElement>("[data-doc-heading]"),
        );
        if (els.length === 0) return;

        const io = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]?.target.id) setActiveId(visible[0].target.id);
            },
            { rootMargin: `-${TOP_OFFSET}px 0px -65% 0px` },
        );
        els.forEach((el) => io.observe(el));
        return () => io.disconnect();
    }, [toc]);

    if (toc.length === 0) return null;

    return (
        <aside
            style={{
                position: "sticky",
                top: TOP_OFFSET,
                alignSelf: "start",
                maxHeight: `calc(100vh - ${TOP_OFFSET}px)`,
                overflowY: "auto",
            }}
        >
            <span style={groupLabel}>{label}</span>
            {toc.map((it) => {
                const active = it.id === activeId;
                const indent =
                    it.depth <= 1
                        ? token.space.sp3
                        : it.depth === 2
                          ? token.space.sp3
                          : it.depth === 3
                            ? token.space.sp5
                            : token.space.sp7;
                return (
                    <a
                        key={it.id}
                        href={`#${it.id}`}
                        style={{
                            display: "block",
                            textDecoration: "none",
                            padding: `${token.space.sp1} 0`,
                            paddingInlineStart: indent,
                            borderLeft: `2px solid ${active ? token.color.accent : "transparent"}`,
                            fontSize: token.font.size.fs12,
                            lineHeight: 1.55,
                            color: active ? token.color.accent : token.color.fgMuted,
                            fontWeight:
                                it.depth <= 1 ? token.font.weight.medium : token.font.weight.regular,
                        }}
                    >
                        {it.text}
                    </a>
                );
            })}
        </aside>
    );
}

export function DocsShell({
    activeSlug,
    toc,
    children,
}: {
    activeSlug: string;
    toc: TocItem[];
    children: React.ReactNode;
}) {
    const { theme, toggleTheme } = useTheme();
    const [lang, , pack] = useLanguagePack();
    const isMobile = useIsMobile();
    const [navOpen, setNavOpen] = useState(false);

    // Keep the server-readable cookie in sync with the client language so
    // route-level locale resolution matches what the user selected.
    useEffect(() => {
        if (lang) setLangCookie(lang);
    }, [lang]);

    function toggleLang() {
        const next = lang === "ko" ? "en" : "ko";
        localStorage.setItem("language", next);
        setLangCookie(next);
        window.location.reload();
    }

    const uiLocale = lang ?? "ko";
    const nav = getDocsNav(uiLocale);

    return (
        <div
            style={{
                width: "100%",
                minHeight: "100vh",
                background: token.color.bg,
                color: token.color.fg,
                display: "flex",
                flexDirection: "column",
                fontFamily: token.font.family.sans,
            }}
        >
            <Topbar
                style={{
                    height: "auto",
                    padding: isMobile ? "12px 16px" : `18px ${token.space.sp10}`,
                    justifyContent: "space-between",
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    background: token.color.bg,
                    borderBottom: `1px solid ${token.color.borderSubtle}`,
                }}
            >
                <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: token.space.sp2,
                            fontSize: token.font.size.fs15,
                            fontWeight: token.font.weight.semibold,
                            letterSpacing: "-0.01em",
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="3" width="8" height="8" rx="1.5" fill={token.color.accent} />
                            <rect x="13" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                            <rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                            <rect x="13" y="13" width="8" height="8" rx="1.5" fill={token.color.accent} opacity="0.4" />
                        </svg>
                        <span>Simulizer</span>
                    </span>
                </Link>

                {isMobile ? (
                    <MobileNavToggle onClick={() => setNavOpen(true)} />
                ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: token.space.sp6 }}>
                        <Link href="/" style={{ textDecoration: "none" }}>
                            <Text variant="body" tone="muted" style={{ cursor: "pointer" }}>
                                {pack.topbar.home}
                            </Text>
                        </Link>
                        <Divider orientation="vertical" style={{ height: 16 }} />
                        <Button variant="ghost" size="xs" onClick={toggleTheme}>
                            {theme === "dark" ? <Icon.Sun size={14} /> : <Icon.Moon size={14} />}
                        </Button>
                        <Button variant="ghost" size="xs" onClick={toggleLang}>
                            <Icon.Globe size={14} />
                        </Button>
                    </span>
                )}
            </Topbar>

            <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)}>
                <Link href="/" onClick={() => setNavOpen(false)} style={{ textDecoration: "none" }}>
                    <Text as="span" variant="body" tone="strong">{pack.topbar.home}</Text>
                </Link>
                <Divider />
                <nav>
                    {nav.map((group) => (
                        <div key={group.title} style={{ marginBottom: token.space.sp5 }}>
                            <span style={groupLabel}>{group.title}</span>
                            {group.items.map((it) => {
                                const active = it.slug === activeSlug;
                                return (
                                    <Link
                                        key={it.slug || "overview"}
                                        href={hrefFor(it.slug)}
                                        onClick={() => setNavOpen(false)}
                                        style={{ textDecoration: "none", display: "block" }}
                                    >
                                        <span
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                minHeight: 38,
                                                padding: `${token.space.sp2} ${token.space.sp3}`,
                                                borderRadius: token.radius.md,
                                                fontSize: token.font.size.fs14,
                                                lineHeight: 1.5,
                                                color: active ? token.color.accent : token.color.fgMuted,
                                                background: active ? token.color.accentSoft : "transparent",
                                                fontWeight: active
                                                    ? token.font.weight.medium
                                                    : token.font.weight.regular,
                                            }}
                                        >
                                            {it.title}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </nav>
                <Divider />
                <Inline gap="sp2">
                    <Button variant="ghost" size="sm" onClick={toggleTheme}>
                        {theme === "dark" ? <Icon.Sun size={14} /> : <Icon.Moon size={14} />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={toggleLang}>
                        <Icon.Globe size={14} />
                    </Button>
                </Inline>
            </MobileNavDrawer>

            <div
                style={{
                    flex: 1,
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "260px minmax(0, 1fr) 240px",
                    gap: isMobile ? token.space.sp4 : token.space.sp10,
                    padding: isMobile ? "16px" : `${token.space.sp10} ${token.space.sp10} ${token.space.sp16}`,
                    alignItems: "start",
                }}
            >
                {!isMobile && <nav
                    style={{
                        position: "sticky",
                        top: TOP_OFFSET,
                        alignSelf: "start",
                        maxHeight: `calc(100vh - ${TOP_OFFSET}px)`,
                        overflowY: "auto",
                    }}
                >
                    {nav.map((group) => (
                        <div key={group.title} style={{ marginBottom: token.space.sp7 }}>
                            <span style={groupLabel}>{group.title}</span>
                            {group.items.map((it) => {
                                const active = it.slug === activeSlug;
                                return (
                                    <Link
                                        key={it.slug || "overview"}
                                        href={hrefFor(it.slug)}
                                        style={{ textDecoration: "none", display: "block" }}
                                    >
                                        <span
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                minHeight: 38,
                                                padding: `${token.space.sp2} ${token.space.sp3}`,
                                                borderRadius: token.radius.md,
                                                fontSize: token.font.size.fs14,
                                                lineHeight: 1.5,
                                                color: active ? token.color.accent : token.color.fgMuted,
                                                background: active ? token.color.accentSoft : "transparent",
                                                fontWeight: active
                                                    ? token.font.weight.medium
                                                    : token.font.weight.regular,
                                            }}
                                        >
                                            {it.title}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </nav>}

                <main style={{ minWidth: 0 }}>{children}</main>

                {!isMobile && (
                    <OnThisPage toc={toc} label={docsUi("onThisPage", uiLocale)} />
                )}
            </div>
        </div>
    );
}
