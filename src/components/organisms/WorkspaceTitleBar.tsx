"use client";

// Workspace top bar shared by the Block and Clang workspaces.
//
//  • web      → the normal app header: a `1fr auto 1fr` grid with brand/filename
//               on the left and actions on the right (unchanged from before).
//  • desktop  → two stacked, frameless layers (no OS caption/menu; driven via
//               the `window.__native` binds):
//                 row 1 — the window-chrome layer: brand (logo + wordmark) +
//                         File menu on the left, window controls (min/max/close)
//                         on the right. This row is the drag surface.
//                 row 2 — the workspace toolbar: the `left` (filename + badges)
//                         and `right` (Save / AI / Build / Run …) content.
//
// Drag is expressed with CSS `-webkit-app-region` (interactive children opt out
// with `no-drag`); the native host enables non-client region support so the
// OS handles move / snap / double-click-maximize over the drag area.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { token } from "@/components/tokens";
import { Icon } from "@/components/atoms/Icons";
import { Logo } from "@/components/atoms/Logo";
import { useTheme } from "@/hooks/useTheme";
import { isDesktop } from "@/lib/file";

export const TITLEBAR_HEIGHT = 40;
// Height of the desktop window-chrome layer (row 1): brand + File menu + window
// controls. It stacks above the workspace toolbar (row 2, TITLEBAR_HEIGHT tall).
export const CHROME_HEIGHT = 36;

// `-webkit-app-region` isn't in the CSSProperties type; cast through unknown.
const dragRegion = { WebkitAppRegion: "drag" } as unknown as React.CSSProperties;
const noDragRegion = { WebkitAppRegion: "no-drag" } as unknown as React.CSSProperties;

const baseName = (p: string): string => {
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return i < 0 ? p : p.slice(i + 1);
};

// ── window control glyphs (thin Windows-style strokes) ───────────────────────
const MinGlyph = () => (
    <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5.5" x2="9" y2="5.5" stroke="currentColor" strokeWidth="1" /></svg>
);
const MaxGlyph = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1" /></svg>
);
const RestoreGlyph = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <rect x="1.5" y="3" width="5.5" height="5.5" stroke="currentColor" strokeWidth="1" />
        <path d="M3.6 3V1.5H8.5V6.4H7" stroke="currentColor" strokeWidth="1" />
    </svg>
);
const CloseGlyph = () => (
    <svg width="10" height="10" viewBox="0 0 10 10">
        <line x1="1.2" y1="1.2" x2="8.8" y2="8.8" stroke="currentColor" strokeWidth="1.1" />
        <line x1="8.8" y1="1.2" x2="1.2" y2="8.8" stroke="currentColor" strokeWidth="1.1" />
    </svg>
);

// ── File menu ────────────────────────────────────────────────────────────────
const FileMenu: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [recents, setRecents] = useState<string[]>([]);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        window.__native?.recentProjects().then(setRecents).catch(() => setRecents([]));
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
    }, [open]);

    const item: React.CSSProperties = {
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: "6px 10px", border: "none", borderRadius: token.radius.sm,
        background: "none", cursor: "pointer", color: token.color.fgMuted,
        fontSize: token.font.size.fs12, fontWeight: 500, textAlign: "left",
        whiteSpace: "nowrap",
    };
    const hoverIn = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = token.color.bgSubtle; e.currentTarget.style.color = token.color.fg; };
    const hoverOut = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = token.color.fgMuted; };

    const run = (fn: (() => Promise<unknown>) | undefined) => { setOpen(false); fn?.(); };

    return (
        <div ref={ref} data-no-drag="true" style={{ position: "relative", ...noDragRegion }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    display: "inline-flex", alignItems: "center", gap: 4, height: 26, padding: "0 10px",
                    border: "none", borderRadius: token.radius.sm,
                    background: open ? token.color.bgSubtle : "none", cursor: "pointer",
                    color: open ? token.color.fg : token.color.fgMuted, fontSize: token.font.size.fs12, fontWeight: 500,
                }}
            >
                File <span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>
            </button>
            {open && (
                <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: 220,
                    background: token.color.bgRaised, border: `1px solid ${token.color.border}`,
                    borderRadius: token.radius.sm, boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                    padding: 4, zIndex: 1000, display: "flex", flexDirection: "column", gap: 1,
                }}>
                    <button style={item} onClick={() => run(() => window.__native!.menuNew())} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                        <Icon.Plus size={13} /> New Project
                    </button>
                    <button style={item} onClick={() => run(() => window.__native!.menuOpen())} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                        <Icon.File size={13} /> Open Project…
                    </button>
                    {recents.length > 0 && (
                        <>
                            <div style={{ height: 1, background: token.color.border, margin: "4px 0" }} />
                            <div style={{ padding: "2px 10px", fontSize: token.font.size.fs10, textTransform: "uppercase", letterSpacing: "0.05em", color: token.color.fgSubtle, fontWeight: 600 }}>
                                Recent
                            </div>
                            {recents.slice(0, 8).map(p => (
                                <button
                                    key={p}
                                    style={item}
                                    title={p}
                                    onClick={() => run(() => window.__native!.openRecent(p))}
                                    onMouseEnter={hoverIn}
                                    onMouseLeave={hoverOut}
                                >
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", fontFamily: token.font.family.mono }}>{baseName(p)}</span>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ── theme toggle (standalone item in the window-chrome layer) ─────────────────
const ThemeToggle: React.FC = () => {
    const { theme } = useTheme();
    const toggle = useCallback(() => {
        const next = (document.documentElement.getAttribute("data-theme") ?? "light") === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        document.cookie = `theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
        window.__native?.setTheme(next);
    }, []);
    return (
        <button
            data-no-drag="true"
            aria-label="Toggle theme"
            title={theme === "dark" ? "다크 모드 (클릭 시 라이트)" : "라이트 모드 (클릭 시 다크)"}
            onClick={toggle}
            style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 26, border: "none", borderRadius: token.radius.sm,
                background: "none", cursor: "pointer", color: token.color.fgMuted, ...noDragRegion,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = token.color.bgSubtle; e.currentTarget.style.color = token.color.fg; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = token.color.fgMuted; }}
        >
            {theme === "dark" ? <Icon.Moon size={14} /> : <Icon.Sun size={14} />}
        </button>
    );
};

// ── window controls (min / max-restore / close) ──────────────────────────────
const WindowControls: React.FC = () => {
    const [maximized, setMaximized] = useState(false);

    const refresh = useCallback(() => {
        window.__native?.isMaximized().then(setMaximized).catch(() => {});
    }, []);

    useEffect(() => {
        refresh();
        window.addEventListener("resize", refresh);
        return () => window.removeEventListener("resize", refresh);
    }, [refresh]);

    const btn: React.CSSProperties = {
        width: 46, height: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: "none", background: "none", cursor: "pointer", color: token.color.fgMuted, padding: 0,
    };

    return (
        <div data-no-drag="true" style={{ display: "flex", alignItems: "stretch", ...noDragRegion }}>
            <button
                aria-label="Minimize" style={btn}
                onClick={() => window.__native?.minimize()}
                onMouseEnter={e => { e.currentTarget.style.background = token.color.bgSubtle; e.currentTarget.style.color = token.color.fg; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = token.color.fgMuted; }}
            ><MinGlyph /></button>
            <button
                aria-label="Maximize" style={btn}
                onClick={() => { window.__native?.maximizeToggle(); setTimeout(refresh, 50); }}
                onMouseEnter={e => { e.currentTarget.style.background = token.color.bgSubtle; e.currentTarget.style.color = token.color.fg; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = token.color.fgMuted; }}
            >{maximized ? <RestoreGlyph /> : <MaxGlyph />}</button>
            <button
                aria-label="Close" style={btn}
                onClick={() => window.__native?.close()}
                onMouseEnter={e => { e.currentTarget.style.background = token.color.danger; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = token.color.fgMuted; }}
            ><CloseGlyph /></button>
        </div>
    );
};

export interface WorkspaceTitleBarProps {
    isMobile?: boolean;
    /** Brand + filename (+ badges). Rendered left of center. */
    left: React.ReactNode;
    /** Actions (Save / AI / Build / Debug / Run …). Rendered right of center. */
    right: React.ReactNode;
}

export const WorkspaceTitleBar: React.FC<WorkspaceTitleBarProps> = ({ isMobile = false, left, right }) => {
    // Web (and the inert mobile case): the original `1fr auto 1fr` header.
    if (!isDesktop) {
        return (
            <header style={isMobile
                ? { display: "flex", alignItems: "center", gap: 4, padding: "0 12px", height: 48, borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0 }
                : { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 16px", height: 48, borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0 }
            }>
                {left}
                {!isMobile && <div />}
                {right}
            </header>
        );
    }

    // Desktop: two stacked layers. Row 1 (the window-chrome layer) is the drag
    // surface; interactive clusters inside it opt out via `data-no-drag` (also
    // tagged `-webkit-app-region: no-drag` for hosts that support non-client
    // regions). `-webkit-app-region` is inert on the current WebView2 build, so
    // the mousedown → `startDrag()` path is what actually moves the window.
    const onChromeMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
        window.__native?.startDrag();
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, background: token.color.bg }}>
            {/* Row 1 — window-chrome layer (brand + File menu + window controls); the drag surface. */}
            <div
                onMouseDown={onChromeMouseDown}
                onDoubleClick={e => { if (!(e.target as HTMLElement).closest("[data-no-drag]")) window.__native?.maximizeToggle(); }}
                style={{
                    display: "flex", alignItems: "stretch", height: CHROME_HEIGHT,
                    borderBottom: `1px solid ${token.color.border}`, ...dragRegion,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 10 }}>
                    <Logo size={18} />
                    <span style={{ fontWeight: 600, fontSize: token.font.size.fs13, letterSpacing: "-0.01em", color: token.color.fg }}>Simulizer</span>
                    <FileMenu />
                </div>
                {/* draggable spacer */}
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", alignItems: "center", paddingRight: 2 }}>
                    <ThemeToggle />
                </div>
                <WindowControls />
            </div>
            {/* Row 2 — workspace toolbar (filename + actions). */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: TITLEBAR_HEIGHT, padding: "0 12px", borderBottom: `1px solid ${token.color.border}` }}>
                <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>{left}</div>
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{right}</div>
            </div>
        </div>
    );
};
