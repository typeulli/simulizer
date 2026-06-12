"use client";

// Relocated verbatim from app/docs/page.tsx (the auto-generated block
// catalog). Per the agreed structure this is now the "About the APIs" /
// Reference section, served at /docs/reference. Logic is unchanged; only the
// export name moved. R3-lite per-block supplements + per-category runnable
// examples are a separate content step (not added here).

import { useMemo, useState } from "react";
import Link from "next/link";

import { useTheme } from "@/hooks/useTheme";
import { useLocale, useMessages } from "next-intl";
import { setLocaleCookie } from "@/i18n/setLocale";
import type langpack from "@/i18n/lang";

import { Topbar } from "@/components/organisms/Toolbar";
import { Text } from "@/components/atoms/Text";
import { Badge } from "@/components/atoms/Badge";
import { Divider } from "@/components/atoms/Divider";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { token } from "@/components/tokens";

import { translateBlockSet, type BlockSet } from "@/utils/blockly/$base";
import { I32_BLOCKS } from "@/utils/blockly/i32";
import { F64_BLOCKS } from "@/utils/blockly/f64";
import { BOOL_BLOCKS } from "@/utils/blockly/bool";
import { FLOW_BLOCKS } from "@/utils/blockly/flow";
import { LOCAL_BLOCKS } from "@/utils/blockly/locals";
import { ARRAY_BLOCKS } from "@/utils/blockly/array";
import { TENSOR_BLOCKS } from "@/utils/blockly/tensor";
import { VECTOR_BLOCKS } from "@/utils/blockly/vector";
import { BOUNDARY_BLOCKS } from "@/utils/blockly/boundary";
import { DEBUG_BLOCKS } from "@/utils/blockly/debug";
import { UTIL_BLOCKS } from "@/utils/blockly/util";

// ── Category order — keyed to pack.workspace.toolbox ──────────────────────
type ToolboxKey = keyof langpack["workspace"]["toolbox"];
const CATEGORIES: { key: ToolboxKey; set: BlockSet }[] = [
    { key: "int",      set: I32_BLOCKS },
    { key: "float",    set: F64_BLOCKS },
    { key: "bool",     set: BOOL_BLOCKS },
    { key: "flow",     set: FLOW_BLOCKS },
    { key: "var",      set: LOCAL_BLOCKS },
    { key: "array",    set: ARRAY_BLOCKS },
    { key: "tensor",   set: TENSOR_BLOCKS },
    { key: "vector",   set: VECTOR_BLOCKS },
    { key: "boundary", set: BOUNDARY_BLOCKS },
    { key: "debug",    set: DEBUG_BLOCKS },
    { key: "cast",     set: UTIL_BLOCKS },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArg = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBody = any;

function typeLabel(types: langpack["types"], t?: string | string[]): string {
    if (!t) return "";
    if (Array.isArray(t)) return t.map((x) => typeLabel(types, x)).join(" | ");
    return (types as Record<string, string>)[t] ?? t;
}

function ArgChip({ arg, types }: { arg: AnyArg; types: langpack["types"] }) {
    const base: React.CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        gap: token.space.sp1,
        padding: `1px ${token.space.sp15}`,
        borderRadius: token.radius.xs,
        fontFamily: token.font.family.mono,
        fontSize: token.font.size.fs12,
        verticalAlign: "middle",
    };

    if (arg.type === "input_value") {
        return (
            <span
                style={{
                    ...base,
                    background: token.color.accentSoft,
                    color: token.color.accent,
                    border: `1px solid ${token.color.accentBorder}`,
                }}
            >
                {typeLabel(types, arg.check) || arg.name}
            </span>
        );
    }
    if (arg.type === "input_statement") {
        return (
            <span
                style={{
                    ...base,
                    background: token.color.surfaceHover,
                    color: token.color.fgMuted,
                    border: `1px dashed ${token.color.border}`,
                }}
            >
                {"{ … }"}
            </span>
        );
    }
    if (arg.type === "field_dropdown") {
        const opts: [string, string][] = arg.options ?? [];
        return (
            <span
                style={{
                    ...base,
                    background: token.color.surfaceHover,
                    color: token.color.fg,
                    border: `1px solid ${token.color.border}`,
                }}
            >
                {opts.map((o) => o[0]).join(" / ")}
            </span>
        );
    }
    // field_number / field_input / field_latex
    return (
        <span
            style={{
                ...base,
                background: token.color.surfaceHover,
                color: token.color.fg,
                border: `1px solid ${token.color.border}`,
            }}
        >
            {arg.value !== undefined && arg.value !== "" ? String(arg.value) : arg.name}
        </span>
    );
}

function BlockBodyLine({ body, types }: { body: AnyBody; types: langpack["types"] }) {
    const parts = String(body.message).split(/(%\d+)/g);
    return (
        <span
            style={{
                display: "inline-flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: token.space.sp1,
                fontFamily: token.font.family.mono,
                fontSize: token.font.size.fs13,
                color: token.color.fg,
                lineHeight: 1.9,
            }}
        >
            {parts.map((part, i) => {
                const m = part.match(/^%(\d+)$/);
                if (!m) {
                    return part ? <span key={i}>{part}</span> : null;
                }
                const arg = body.args[Number(m[1]) - 1];
                if (!arg) return <span key={i}>{part}</span>;
                return <ArgChip key={i} arg={arg} types={types} />;
            })}
        </span>
    );
}

export function BlockReference() {
    const { theme, toggleTheme } = useTheme();
    const lang = useLocale();
    const pack = useMessages();
    const [query, setQuery] = useState("");

    function toggleLang() {
        const next = lang === "ko" ? "en" : "ko";
        setLocaleCookie(next);
        window.location.reload();
    }

    // Translate every block set with the active language pack.
    const translated = useMemo(
        () =>
            CATEGORIES.map((c) => ({
                key: c.key,
                set: translateBlockSet(
                    c.set,
                    pack.block_messages as unknown as Record<string, string[]>,
                    pack.block_dropdowns as unknown as Record<
                        string,
                        Record<string, Record<string, string>>
                    >,
                ),
            })),
        [pack],
    );

    const q = query.trim().toLowerCase();
    const sections = translated
        .map((c) => {
            const blocks = Object.values(c.set).filter((b) => {
                if (!q) return true;
                const hay = (
                    b.type +
                    " " +
                    b.body.map((bb) => bb.message).join(" ") +
                    " " +
                    (b.tooltip ?? "")
                ).toLowerCase();
                return hay.includes(q);
            });
            return { key: c.key, blocks };
        })
        .filter((c) => c.blocks.length > 0);

    const totalBlocks = translated.reduce(
        (n, c) => n + Object.keys(c.set).length,
        0,
    );

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
            {/* ── Nav ── */}
            <Topbar
                style={{
                    height: "auto",
                    padding: `18px ${token.space.sp12}`,
                    justifyContent: "space-between",
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

                <span style={{ display: "inline-flex", alignItems: "center", gap: token.space.sp6 }}>
                    <Link href="/docs" style={{ textDecoration: "none" }}>
                        <Text variant="body" tone="muted" style={{ cursor: "pointer" }}>
                            {pack.home.nav_docs}
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
            </Topbar>

            <main
                style={{
                    flex: 1,
                    maxWidth: 1100,
                    width: "100%",
                    margin: "0 auto",
                    padding: `48px ${token.space.sp12} ${token.space.sp16}`,
                }}
            >
                {/* ── Header ── */}
                <Badge tone="accent" shape="pill" mono>
                    <Icon.Book size={12} />
                    {pack.home.nav_docs}
                </Badge>
                <Text
                    as="h1"
                    variant="h1"
                    tone="strong"
                    style={{ margin: `${token.space.sp4} 0 0` }}
                >
                    Block Reference
                </Text>
                <Text
                    as="p"
                    variant="body-lg"
                    tone="muted"
                    style={{ margin: `${token.space.sp3} 0 0`, maxWidth: 620 }}
                >
                    {totalBlocks} blocks · {pack.meta.name}
                </Text>

                {/* ── Search ── */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: token.space.sp2,
                        marginTop: token.space.sp6,
                        padding: `0 ${token.space.sp3}`,
                        height: 40,
                        maxWidth: 420,
                        background: token.color.bgSubtle,
                        border: `1px solid ${token.color.border}`,
                        borderRadius: token.radius.md,
                        color: token.color.fgMuted,
                    }}
                >
                    <Icon.Search size={14} />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search blocks…"
                        style={{
                            flex: 1,
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            color: token.color.fg,
                            fontSize: token.font.size.fs14,
                            fontFamily: token.font.family.sans,
                        }}
                    />
                </div>

                {/* ── Category quick nav ── */}
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: token.space.sp2,
                        marginTop: token.space.sp5,
                    }}
                >
                    {sections.map((c) => (
                        <a
                            key={c.key}
                            href={`#cat-${c.key}`}
                            style={{ textDecoration: "none" }}
                        >
                            <Badge tone="default" shape="pill">
                                {pack.workspace.toolbox[c.key]}
                                <span style={{ color: token.color.fgSubtle }}>
                                    {c.blocks.length}
                                </span>
                            </Badge>
                        </a>
                    ))}
                </div>

                <Divider style={{ margin: `${token.space.sp8} 0` }} />

                {/* ── Sections ── */}
                {sections.length === 0 && (
                    <Text tone="muted">No blocks match “{query}”.</Text>
                )}

                {sections.map((cat) => (
                    <section
                        key={cat.key}
                        id={`cat-${cat.key}`}
                        style={{ marginBottom: token.space.sp12, scrollMarginTop: token.space.sp8 }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: token.space.sp3,
                                marginBottom: token.space.sp4,
                            }}
                        >
                            <Text as="h2" variant="h3" tone="strong">
                                {pack.workspace.toolbox[cat.key]}
                            </Text>
                            <Text variant="mono" tone="subtle">
                                {cat.blocks.length}
                            </Text>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                                gap: token.space.sp3,
                            }}
                        >
                            {cat.blocks.map((b) => {
                                const out = Array.isArray(b.output)
                                    ? b.output.join(" | ")
                                    : b.output;
                                return (
                                    <div
                                        key={b.type}
                                        style={{
                                            background: token.color.bgSubtle,
                                            border: `1px solid ${token.color.border}`,
                                            borderRadius: token.radius.lg,
                                            padding: token.space.sp4,
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: token.space.sp2,
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: token.space.sp2,
                                            }}
                                        >
                                            <Text variant="mono" tone="subtle">
                                                {b.type}
                                            </Text>
                                            {out ? (
                                                <Badge tone="accent" mono>
                                                    {typeLabel(pack.types, out)}
                                                </Badge>
                                            ) : (
                                                <Badge tone="default" mono>
                                                    stmt
                                                </Badge>
                                            )}
                                        </div>

                                        <div
                                            style={{
                                                background: token.color.bg,
                                                border: `1px solid ${token.color.borderSubtle}`,
                                                borderRadius: token.radius.md,
                                                padding: `${token.space.sp2} ${token.space.sp3}`,
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: token.space.sp1,
                                            }}
                                        >
                                            {b.body.map((bb, i) => (
                                                <BlockBodyLine key={i} body={bb} types={pack.types} />
                                            ))}
                                        </div>

                                        {b.tooltip && (
                                            <Text variant="caption" tone="muted">
                                                {b.tooltip}
                                            </Text>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </main>

            <Divider />
            <footer
                style={{
                    padding: `${token.space.sp4} ${token.space.sp12}`,
                    display: "flex",
                    justifyContent: "space-between",
                }}
            >
                <Text variant="mono" tone="subtle" style={{ fontSize: token.font.size.fs11 }}>
                    {pack.home.footer_copy}
                </Text>
                <Text variant="mono" tone="subtle" style={{ fontSize: token.font.size.fs11 }}>
                    {pack.home.footer_mode}
                </Text>
            </footer>
        </div>
    );
}
