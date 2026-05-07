"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { token } from "@/components/tokens";
import { Button } from "@/components/atoms/Button";
import { Logo } from "@/components/atoms/Logo";
import useLanguagePack from "@/hooks/useLanguagePack";
import { type RecoveryUserOut, getRecoveryUser, confirmRecover, cancelRecover } from "@/lib/authapi";

export default function RecoverPage() {
    const router = useRouter();
    const [, , pack] = useLanguagePack();
    const t = pack.recover;

    const [user, setUser] = useState<RecoveryUserOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);

    useEffect(() => {
        getRecoveryUser()
            .then(setUser)
            .catch(() => router.replace("/login"))
            .finally(() => setLoading(false));
    }, [router]);

    async function handleRecover() {
        setConfirming(true);
        try {
            await confirmRecover();
            router.replace("/dashboard");
        } catch {
            setConfirming(false);
        }
    }

    async function handleCancel() {
        setCancelling(true);
        setCancelError(null);
        try {
            await cancelRecover();
            router.replace("/login");
        } catch {
            setCancelError(t.cancel_error);
            setCancelling(false);
        }
    }

    if (loading || !user) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: token.color.bg }} />
        );
    }

    const busy = confirming || cancelling;

    return (
        <div style={{
            minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
            background: token.color.bg, fontFamily: token.font.family.sans, color: token.color.fg,
            padding: "32px 16px",
        }}>
            <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: token.space.sp8 }}>

                {/* Logo */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Logo size={22} />
                    <span style={{ fontSize: token.font.size.fs16, fontWeight: 700, letterSpacing: "-0.02em" }}>Simulizer</span>
                </div>

                {/* Card */}
                <div style={{
                    width: "100%", background: token.color.bgSubtle,
                    border: `1px solid ${token.color.border}`, borderRadius: token.radius.lg,
                    padding: token.space.sp8, display: "flex", flexDirection: "column",
                    alignItems: "center", gap: token.space.sp6,
                }}>
                    {/* Avatar */}
                    {user.picture_url ? (
                        <img src={user.picture_url} alt={user.name}
                            style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", boxShadow: token.shadow.md }} />
                    ) : (
                        <div style={{
                            width: 64, height: 64, borderRadius: "50%",
                            background: token.color.gradient.title,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: token.color.fgOnAccent, fontWeight: 700, fontSize: token.font.size.fs24,
                            boxShadow: token.shadow.md,
                        }}>
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                    )}

                    {/* Name / Email */}
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: token.font.size.fs18, fontWeight: 700, color: token.color.fgStrong, letterSpacing: token.font.tracking.tight }}>
                            {user.name}
                        </div>
                        <div style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted, marginTop: 4 }}>
                            {user.email}
                        </div>
                    </div>

                    {/* Status badge */}
                    <div style={{
                        width: "100%", padding: `${token.space.sp3} ${token.space.sp4}`,
                        background: token.color.dangerSoft, border: `1px solid ${token.color.danger}`,
                        borderRadius: token.radius.md, fontSize: token.font.size.fs12,
                        color: token.color.danger, textAlign: "center", lineHeight: 1.6,
                    }}>
                        {t.deleted_badge}
                        <br />
                        <span style={{ fontWeight: 600 }}>
                            {t.days_remaining.replace("{n}", String(user.days_remaining))}
                        </span>
                    </div>

                    <div style={{ textAlign: "center", fontSize: token.font.size.fs13, color: token.color.fgMuted, lineHeight: 1.6 }}>
                        {t.question}<br />{t.question_sub}
                    </div>

                    {/* Recover button */}
                    <Button variant="primary" onClick={handleRecover} disabled={busy} style={{ width: "100%" }}>
                        {confirming ? t.recovering_button : t.recover_button}
                    </Button>

                    {/* Cancel / hard delete */}
                    {!showCancelConfirm ? (
                        <button
                            onClick={() => setShowCancelConfirm(true)}
                            disabled={busy}
                            style={{
                                background: "none", border: "none", cursor: "pointer",
                                fontSize: token.font.size.fs12, color: token.color.fgSubtle,
                                textDecoration: "underline", padding: 0,
                            }}
                        >
                            {t.cancel_link}
                        </button>
                    ) : (
                        <div style={{
                            width: "100%", padding: token.space.sp4,
                            border: `1px solid ${token.color.danger}`, borderRadius: token.radius.md,
                            background: token.color.dangerSoft, display: "flex", flexDirection: "column", gap: token.space.sp3,
                        }}>
                            <div style={{ fontSize: token.font.size.fs12, color: token.color.danger, fontWeight: 600 }}>
                                {t.cancel_confirm}
                            </div>
                            {cancelError && (
                                <div style={{ fontSize: token.font.size.fs11, color: token.color.danger }}>
                                    {cancelError}
                                </div>
                            )}
                            <div style={{ display: "flex", gap: token.space.sp2 }}>
                                <Button variant="danger" size="sm" disabled={busy} onClick={handleCancel}>
                                    {cancelling ? t.deleting_button : t.delete_now_button}
                                </Button>
                                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setShowCancelConfirm(false)}>
                                    {t.cancel_button}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
