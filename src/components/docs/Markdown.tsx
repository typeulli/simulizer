"use client";

// react-markdown + remark-gfm. Two jobs:
//  1. Intercept the ` ```simulizer ` fence -> runnable read-only embed.
//  2. Render prose in Simulizer's design language, with the structural feel
//     of an editorial docs site (sectioned headings w/ anchors, quiet tables,
//     callout blockquotes, copyable code).

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

import { token } from "@/components/tokens";
import { SimulizerEmbed } from "@/components/docs/SimulizerEmbed";
import { slugify } from "@/components/docs/toc";

function isSimulizer(className: unknown): boolean {
    return typeof className === "string" && className.split(/\s+/).includes("language-simulizer");
}

function nodeText(children: React.ReactNode): string {
    if (typeof children === "string" || typeof children === "number") return String(children);
    if (Array.isArray(children)) return children.map(nodeText).join("");
    return "";
}

function CopyableCode({ children }: { children: React.ReactNode }) {
    const [copied, setCopied] = useState(false);
    return (
        <div style={{ position: "relative", margin: `${token.space.sp4} 0` }}>
            <button
                onClick={() => {
                    navigator.clipboard?.writeText(nodeText(children)).then(
                        () => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1200);
                        },
                        () => {},
                    );
                }}
                style={{
                    position: "absolute",
                    top: token.space.sp2,
                    right: token.space.sp2,
                    background: token.color.surfaceHover,
                    color: token.color.fgMuted,
                    border: `1px solid ${token.color.borderSubtle}`,
                    borderRadius: token.radius.xs,
                    padding: `2px ${token.space.sp2}`,
                    fontFamily: token.font.family.mono,
                    fontSize: token.font.size.fs11,
                    cursor: "pointer",
                }}
            >
                {copied ? "copied" : "copy"}
            </button>
            <pre
                style={{
                    background: token.color.bg,
                    border: `1px solid ${token.color.borderSubtle}`,
                    borderRadius: token.radius.md,
                    padding: `${token.space.sp3} ${token.space.sp4}`,
                    paddingRight: token.space.sp10,
                    overflowX: "auto",
                    fontFamily: token.font.family.mono,
                    fontSize: token.font.size.fs13,
                    lineHeight: 1.7,
                    margin: 0,
                }}
            >
                {children}
            </pre>
        </div>
    );
}

const headingBase = (size: string, mt: string): React.CSSProperties => ({
    fontSize: size,
    fontWeight: token.font.weight.semibold,
    color: token.color.fgStrong,
    letterSpacing: "-0.01em",
    margin: `${mt} 0 ${token.space.sp3}`,
    scrollMarginTop: "88px",
});

const components: Components = {
    pre({ children }) {
        const child = Array.isArray(children) ? children[0] : children;
        const cls =
            child && typeof child === "object" && "props" in child
                ? (child as { props?: { className?: unknown } }).props?.className
                : undefined;
        if (isSimulizer(cls)) return <>{children}</>;
        return <CopyableCode>{children}</CopyableCode>;
    },
    code({ className, children }) {
        if (isSimulizer(className)) {
            return <SimulizerEmbed fileId={String(children).replace(/\n+$/, "").trim()} />;
        }
        const isBlock = typeof className === "string" && className.startsWith("language-");
        return (
            <code
                style={{
                    fontFamily: token.font.family.mono,
                    fontSize: token.font.size.fs13,
                    ...(isBlock
                        ? {}
                        : {
                              background: token.color.surfaceHover,
                              borderRadius: token.radius.xs,
                              padding: `1px ${token.space.sp1}`,
                          }),
                }}
            >
                {children}
            </code>
        );
    },
    h1: ({ children }) => {
        const id = slugify(nodeText(children));
        return (
            <h1
                id={id}
                data-doc-heading
                style={{ ...headingBase(token.font.size.fs32, "0"), marginBottom: token.space.sp6 }}
            >
                {children}
            </h1>
        );
    },
    h2: ({ children }) => {
        const id = slugify(nodeText(children));
        return (
            <h2 id={id} data-doc-heading style={headingBase(token.font.size.fs20, token.space.sp10)}>
                {children}
            </h2>
        );
    },
    h3: ({ children }) => {
        const id = slugify(nodeText(children));
        return (
            <h3 id={id} data-doc-heading style={headingBase(token.font.size.fs16, token.space.sp6)}>
                {children}
            </h3>
        );
    },
    h4: ({ children }) => {
        const id = slugify(nodeText(children));
        return (
            <h4
                id={id}
                data-doc-heading
                style={{ ...headingBase(token.font.size.fs14, token.space.sp5), color: token.color.fgMuted }}
            >
                {children}
            </h4>
        );
    },
    p: ({ children }) => (
        <p style={{ margin: `${token.space.sp3} 0`, lineHeight: 1.8, color: token.color.fg }}>
            {children}
        </p>
    ),
    ul: ({ children }) => (
        <ul style={{ margin: `${token.space.sp3} 0`, paddingLeft: token.space.sp6, lineHeight: 1.8, color: token.color.fg }}>
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol style={{ margin: `${token.space.sp3} 0`, paddingLeft: token.space.sp6, lineHeight: 1.8, color: token.color.fg }}>
            {children}
        </ol>
    ),
    li: ({ children }) => <li style={{ margin: `${token.space.sp1} 0` }}>{children}</li>,
    a: ({ href, children }) => (
        <a
            href={href}
            style={{ color: token.color.accent, textDecoration: "none", borderBottom: `1px solid ${token.color.accentBorder}` }}
        >
            {children}
        </a>
    ),
    strong: ({ children }) => (
        <strong style={{ fontWeight: token.font.weight.semibold, color: token.color.fgStrong }}>
            {children}
        </strong>
    ),
    blockquote: ({ children }) => (
        <div
            style={{
                margin: `${token.space.sp5} 0`,
                padding: `${token.space.sp3} ${token.space.sp4}`,
                background: token.color.accentSoft,
                border: `1px solid ${token.color.accentBorder}`,
                borderRadius: token.radius.md,
                color: token.color.fgMuted,
                fontSize: token.font.size.fs14,
            }}
        >
            {children}
        </div>
    ),
    hr: () => (
        <hr style={{ border: "none", borderTop: `1px solid ${token.color.borderSubtle}`, margin: `${token.space.sp8} 0` }} />
    ),
    table: ({ children }) => (
        <div style={{ overflowX: "auto", margin: `${token.space.sp5} 0` }}>
            <table
                style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: token.font.size.fs13,
                    border: `1px solid ${token.color.border}`,
                    borderRadius: token.radius.md,
                }}
            >
                {children}
            </table>
        </div>
    ),
    thead: ({ children }) => (
        <thead style={{ background: token.color.bgSubtle }}>{children}</thead>
    ),
    th: ({ children }) => (
        <th
            style={{
                textAlign: "left",
                padding: `${token.space.sp2} ${token.space.sp3}`,
                borderBottom: `1px solid ${token.color.border}`,
                color: token.color.fgMuted,
                fontWeight: token.font.weight.medium,
            }}
        >
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td
            style={{
                padding: `${token.space.sp2} ${token.space.sp3}`,
                borderBottom: `1px solid ${token.color.borderSubtle}`,
                color: token.color.fg,
                verticalAlign: "top",
            }}
        >
            {children}
        </td>
    ),
};

export function Markdown({ source }: { source: string }) {
    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {source}
        </ReactMarkdown>
    );
}
