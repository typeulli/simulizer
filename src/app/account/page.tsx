"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { token } from "@/components/tokens";
import { TopbarBrand } from "@/components/organisms/TopbarBrand";
import { Icon } from "@/components/atoms/Icons";
import { Button } from "@/components/atoms/Button";
import { useAuth, clearUserCache } from "@/hooks/useAuth";
import useLanguagePack from "@/hooks/useLanguagePack";
import { logout, deleteAccount } from "@/lib/authapi";

function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("ko-KR", {
        year: "numeric", month: "long", day: "numeric",
    });
}

export default function AccountPage() {
    const { user } = useAuth();
    const [, , pack] = useLanguagePack();
    const router = useRouter();
    const t = pack.account;

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const rows: { label: string; value: string }[] = user ? [
        { label: t.row_name,       value: user.name },
        { label: t.row_email,      value: user.email },
        { label: t.row_joined,     value: formatDate(user.created_at) },
        { label: t.row_last_login, value: formatDate(user.last_login_at) },
    ] : [];

    async function handleLogout() {
        try {
            await logout();
        } catch {
            // 로그아웃 실패해도 클라이언트 세션은 초기화
        }
        clearUserCache();
        router.replace("/login");
    }

    async function handleDeleteAccount() {
        setDeleting(true);
        setDeleteError(null);
        try {
            await deleteAccount();
            clearUserCache();
            router.replace("/login?account_deleted=1");
        } catch {
            setDeleteError(t.delete_error);
            setDeleting(false);
        }
    }

    return (
        <div style={{
            minHeight: "100vh",
            background: token.color.bg,
            fontFamily: token.font.family.sans,
            color: token.color.fg,
            display: "flex",
            flexDirection: "column",
        }}>
            <header style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                padding: `0 ${token.space.sp4}`,
                height: 48,
                borderBottom: `1px solid ${token.color.border}`,
                background: token.color.bg,
                flexShrink: 0,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, whiteSpace: "nowrap" }}>
                    <TopbarBrand />
                    <span style={{ color: token.color.fgSubtle, fontWeight: 300 }}>/</span>
                    <div style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "4px 8px", borderRadius: token.radius.sm,
                        color: token.color.fgMuted, fontSize: 12, fontFamily: token.font.family.mono,
                    }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                        </svg>
                        <span>{t.breadcrumb}</span>
                    </div>
                </div>

                <div style={{ display: "flex", justifyContent: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: token.color.fgSubtle, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {t.header_title}
                    </span>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                        onClick={handleLogout}
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "6px 12px", borderRadius: token.radius.sm,
                            background: "none", border: `1px solid ${token.color.border}`,
                            color: token.color.fgMuted, fontSize: 12, fontWeight: 500,
                            cursor: "pointer", transition: "all 0.15s",
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.color = token.color.fg;
                            e.currentTarget.style.borderColor = token.color.fgSubtle;
                            e.currentTarget.style.background = token.color.bgSubtle;
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.color = token.color.fgMuted;
                            e.currentTarget.style.borderColor = token.color.border;
                            e.currentTarget.style.background = "none";
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        {pack.topbar.log_out}
                    </button>
                </div>
            </header>

            <main style={{
                flex: 1, display: "flex", justifyContent: "center",
                padding: `${token.space.sp16} ${token.space.sp4}`,
            }}>
                <div style={{ width: "100%", maxWidth: 520 }}>

                    {/* Avatar + name */}
                    <div style={{ display: "flex", alignItems: "center", gap: token.space.sp5, marginBottom: token.space.sp10 }}>
                        {user?.picture_url ? (
                            <img src={user.picture_url} alt={user.name}
                                style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", boxShadow: token.shadow.md }} />
                        ) : (
                            <div style={{
                                width: 64, height: 64, borderRadius: "50%",
                                background: token.color.gradient.title,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: token.color.fgOnAccent, fontWeight: 700, fontSize: token.font.size.fs24,
                                boxShadow: token.shadow.md, flexShrink: 0,
                            }}>
                                {user?.name?.charAt(0)?.toUpperCase() ?? "…"}
                            </div>
                        )}
                        <div>
                            <div style={{ fontSize: token.font.size.fs20, fontWeight: 700, color: token.color.fgStrong, letterSpacing: token.font.tracking.tight }}>
                                {user?.name ?? ""}
                            </div>
                            <div style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted, marginTop: 2 }}>
                                {user?.email ?? ""}
                            </div>
                        </div>
                    </div>

                    {/* Info rows */}
                    <div style={{ border: `1px solid ${token.color.border}`, borderRadius: token.radius.lg, overflow: "hidden" }}>
                        {rows.map((row, i) => (
                            <div key={row.label} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: `${token.space.sp4} ${token.space.sp5}`,
                                borderBottom: i < rows.length - 1 ? `1px solid ${token.color.border}` : "none",
                                background: token.color.bgSubtle,
                            }}>
                                <span style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted }}>{row.label}</span>
                                <span style={{ fontSize: token.font.size.fs13, color: token.color.fgStrong, fontWeight: 500 }}>{row.value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Google badge */}
                    <div style={{ marginTop: token.space.sp4, display: "flex", alignItems: "center", gap: token.space.sp2, fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>
                        <Icon.Check size={11} />
                        <span>{t.google_badge}</span>
                    </div>

                    {/* Danger zone */}
                    <div style={{
                        marginTop: token.space.sp10, padding: token.space.sp5,
                        border: `1px solid ${token.color.danger}`, borderRadius: token.radius.lg,
                        background: token.color.dangerSoft,
                    }}>
                        <div style={{ fontSize: token.font.size.fs13, fontWeight: 600, color: token.color.danger, marginBottom: token.space.sp1 }}>
                            {t.danger_title}
                        </div>
                        <div style={{ fontSize: token.font.size.fs12, color: token.color.fgMuted, marginBottom: token.space.sp4, lineHeight: 1.6 }}>
                            {t.danger_desc}
                        </div>

                        {!showDeleteConfirm ? (
                            <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                                {t.delete_button}
                            </Button>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp3 }}>
                                <div style={{ fontSize: token.font.size.fs12, fontWeight: 600, color: token.color.danger }}>
                                    {t.confirm_title}
                                </div>
                                <div style={{ fontSize: token.font.size.fs11, color: token.color.fgMuted, lineHeight: 1.5 }}>
                                    {t.confirm_desc}
                                </div>
                                {deleteError && (
                                    <div style={{ fontSize: token.font.size.fs11, color: token.color.danger }}>
                                        {deleteError}
                                    </div>
                                )}
                                <div style={{ display: "flex", gap: token.space.sp2 }}>
                                    <Button variant="danger" size="sm" disabled={deleting} onClick={handleDeleteAccount}>
                                        {deleting ? t.deleting_button : t.confirm_button}
                                    </Button>
                                    <Button variant="ghost" size="sm" disabled={deleting} onClick={() => setShowDeleteConfirm(false)}>
                                        {t.cancel_button}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </main>
        </div>
    );
}
