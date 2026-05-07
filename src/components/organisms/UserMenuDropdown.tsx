"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { token } from "@/components/tokens";
import { Icon } from "@/components/atoms/Icons";
import { Divider } from "@/components/atoms/Divider";
import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/hooks/useAuth";
import useLanguagePack from "@/hooks/useLanguagePack";
import { logout } from "@/lib/authapi";

interface UserMenuDropdownProps {
    onClose: () => void;
    align?: "left" | "right";
}

export const UserMenuDropdown: React.FC<UserMenuDropdownProps> = ({ onClose, align = "left" }) => {
    const { theme, toggleTheme } = useTheme();
    const { user } = useUser();
    const router = useRouter();
    const [, , pack] = useLanguagePack();
    const t = pack.topbar;

    async function handleLogout() {
        onClose();
        await logout();
        router.replace("/login");
    }

    const menuBtn: React.CSSProperties = {
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "8px 16px", border: "none", background: "none",
        color: token.color.fg, fontSize: token.font.size.fs12, textAlign: "left",
        cursor: "pointer", transition: "background 0.1s",
    };

    return (
        <>
            <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000 }} />
            <div style={{
                position: "absolute", top: "100%", [align]: 0, marginTop: 8,
                background: token.color.bg, border: `1px solid ${token.color.border}`,
                borderRadius: token.radius.md, boxShadow: token.shadow.lg,
                zIndex: 1001, minWidth: 220, padding: "6px 0", overflow: "hidden",
            }}>
                {/* Profile */}
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    {user?.picture_url ? (
                        <img src={user.picture_url} alt={user.name} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", boxShadow: token.shadow.sm }} />
                    ) : (
                        <div style={{
                            width: 36, height: 36, borderRadius: "50%",
                            background: token.color.gradient.title,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: token.color.fgOnAccent, fontWeight: 700, fontSize: token.font.size.fs14,
                            boxShadow: token.shadow.sm,
                        }}>{user?.name?.charAt(0)?.toUpperCase() ?? "…"}</div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span style={{ fontSize: token.font.size.fs13, fontWeight: 600, color: token.color.fgStrong }}>{user?.name ?? ""}</span>
                        <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle, overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email ?? ""}</span>
                    </div>
                </div>

                <Divider style={{ margin: "4px 0", opacity: 0.5 }} />

                {/* Navigation */}
                <button style={menuBtn}
                    onClick={() => { onClose(); router.push("/"); }}
                    onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                    <Icon.Zap size={14} />
                    <span>{t.home}</span>
                </button>

                <button style={menuBtn}
                    onClick={() => { onClose(); router.push("/dashboard"); }}
                    onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                    <Icon.Book size={14} />
                    <span>{t.my_drafts}</span>
                </button>

                <Divider style={{ margin: "4px 0", opacity: 0.5 }} />

                {/* Account & Preferences */}
                <button style={menuBtn}
                    onClick={() => { onClose(); router.push("/account"); }}
                    onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: token.color.fgMuted }}>
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>{t.account}</span>
                </button>

                <button style={menuBtn}
                    onClick={() => { onClose(); router.push("/setting"); }}
                    onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                    <Icon.Settings size={14} />
                    <span>{t.settings}</span>
                </button>

                <button style={menuBtn}
                    onClick={toggleTheme}
                    onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                    {theme === "dark" ? <Icon.Sun size={14} /> : <Icon.Moon size={14} />}
                    <span>{theme === "dark" ? t.light_mode : t.dark_mode}</span>
                </button>

                <Divider style={{ margin: "4px 0", opacity: 0.5 }} />

                <button
                    style={{ ...menuBtn, color: token.color.danger }}
                    onClick={handleLogout}
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
    );
};
