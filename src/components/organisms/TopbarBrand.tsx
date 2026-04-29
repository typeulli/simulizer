"use client";

import React, { useState } from "react";
import { token } from "@/components/tokens";
import { Icon } from "@/components/atoms/Icons";
import { Logo } from "@/components/atoms/Logo";
import { Divider } from "@/components/atoms/Divider";
import { useTheme } from "@/hooks/useTheme";
import langpack from "@/lang/lang";
import en from "@/lang/en";

interface TopbarBrandProps {
    onDrafts?: () => void;
    pack?: langpack;
}

export const TopbarBrand: React.FC<TopbarBrandProps> = ({ onDrafts, pack = en }) => {
    const [open, setOpen] = useState(false);
    const { theme, toggleTheme } = useTheme();

    const t = pack.topbar;

    const menuBtn: React.CSSProperties = {
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "8px 16px", border: "none", background: "none",
        color: token.color.fg, fontSize: token.font.size.fs12, textAlign: "left",
        cursor: "pointer", transition: "background 0.1s",
    };

    return (
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <div onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <Logo size={18} />
                <span style={{ fontWeight: 600, fontSize: token.font.size.fs14, letterSpacing: "-0.01em" }}>Simulizer</span>
            </div>

            {open && (
                <>
                    <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1000 }} />
                    <div style={{
                        position: "absolute", top: "100%", left: 0, marginTop: 8,
                        background: token.color.bg, border: `1px solid ${token.color.border}`,
                        borderRadius: token.radius.md, boxShadow: token.shadow.lg,
                        zIndex: 1001, minWidth: 220, padding: "6px 0", overflow: "hidden",
                    }}>
                        {/* Profile */}
                        <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: "50%",
                                background: token.color.gradient.title,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: token.color.fgOnAccent, fontWeight: 700, fontSize: token.font.size.fs14,
                                boxShadow: token.shadow.sm,
                            }}>H</div>
                            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                                <span style={{ fontSize: token.font.size.fs13, fontWeight: 600, color: token.color.fgStrong }}>홍하루</span>
                                <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle, overflow: "hidden", textOverflow: "ellipsis" }}>haru.hong@simulizer.io</span>
                            </div>
                        </div>

                        <Divider style={{ margin: "4px 0", opacity: 0.5 }} />

                        <button style={menuBtn}
                            onClick={() => { setOpen(false); window.location.href = "/"; }}
                            onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                            <Icon.Zap size={14} />
                            <span>{t.home}</span>
                        </button>

                        {onDrafts && (
                            <button style={menuBtn}
                                onClick={() => { setOpen(false); onDrafts(); }}
                                onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                                onMouseLeave={e => (e.currentTarget.style.background = "none")}
                            >
                                <Icon.Book size={14} />
                                <span>{t.my_drafts}</span>
                            </button>
                        )}
                        <button style={menuBtn}
                            onClick={() => { setOpen(false); alert("Account Clicked"); }}
                            onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: token.color.fgMuted }}>
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                            </svg>
                            <span>{t.account}</span>
                        </button>
                        <button style={menuBtn}
                            onClick={toggleTheme}
                            onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                            {theme === "dark" ? <Icon.Sun size={14} /> : <Icon.Moon size={14} />}
                            <span>{theme === "dark" ? t.light_mode : t.dark_mode}</span>
                        </button>
                        <button style={menuBtn}
                            onClick={() => { setOpen(false); window.location.href = "/setting"; }}
                            onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                            <Icon.Settings size={14} />
                            <span>{t.settings}</span>
                        </button>

                        <Divider style={{ margin: "4px 0", opacity: 0.5 }} />

                        <button
                            style={{ ...menuBtn, color: token.color.danger }}
                            onClick={() => { setOpen(false); alert("Log out Clicked"); }}
                            onMouseEnter={e => (e.currentTarget.style.background = token.color.dangerSoft)}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            <span>{t.log_out}</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
