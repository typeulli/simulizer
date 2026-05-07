"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/atoms/Logo";
import { token } from "@/components/tokens";
import { getMe } from "@/lib/authapi";
import useLanguagePack from "@/hooks/useLanguagePack";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function LoginPage() {
    const router = useRouter();
    const [, , pack] = useLanguagePack();
    const t = pack.login;

    const searchParams = useSearchParams();
    const errorParam = searchParams.get("error");
    const accountDeleted = searchParams.get("account_deleted") === "1";

    useEffect(() => {
        getMe().then(() => router.replace("/dashboard")).catch(() => {});
    }, [router]);

    const errorMessage: Record<string, string> = {
        oauth_denied:         t.error_oauth_denied,
        oauth_failed:         t.error_oauth_failed,
        unauthorized_domain:  t.error_unauthorized_domain,
    };

    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            minHeight: "100vh",
            background: token.color.bg,
            fontFamily: token.font.family.sans,
            color: token.color.fg,
        }}>
            {/* ── Left: Landing ── */}
            <div style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "64px 72px",
                borderRight: `1px solid ${token.color.border}`,
                background: token.color.bgSubtle,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 48 }}>
                    <Logo size={28} />
                    <span style={{ fontSize: token.font.size.fs20, fontWeight: 700, letterSpacing: "-0.02em" }}>Simulizer</span>
                </div>

                <h1 style={{
                    fontSize: 36,
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.2,
                    margin: "0 0 16px",
                    background: token.color.gradient.title,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                }}>
                    {t.left_title_1}<br />{t.left_title_2}
                </h1>

                <p style={{
                    fontSize: token.font.size.fs15,
                    color: token.color.fgMuted,
                    lineHeight: 1.7,
                    margin: "0 0 40px",
                    maxWidth: 400,
                }}>
                    {t.left_body}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[t.left_feature_1, t.left_feature_2, t.left_feature_3, t.left_feature_4].map(feat => (
                        <div key={feat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                                width: 6, height: 6, borderRadius: "50%",
                                background: token.color.accent, flexShrink: 0,
                            }} />
                            <span style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted }}>{feat}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Right: Login ── */}
            <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "64px 72px",
                gap: 32,
            }}>
                <div style={{ textAlign: "center", maxWidth: 360 }}>
                    <h2 style={{ fontSize: token.font.size.fs24, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
                        {t.right_title}
                    </h2>
                    <p style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted, margin: 0, lineHeight: 1.6 }}>
                        {t.right_subtitle}
                    </p>
                </div>

                {accountDeleted && (
                    <div style={{
                        width: "100%",
                        maxWidth: 320,
                        padding: "12px 16px",
                        background: token.color.bgSubtle,
                        border: `1px solid ${token.color.border}`,
                        borderRadius: token.radius.md,
                        fontSize: token.font.size.fs13,
                        color: token.color.fgMuted,
                        textAlign: "center",
                        lineHeight: 1.6,
                    }}>
                        {t.account_deleted_msg}
                    </div>
                )}

                {errorParam && errorMessage[errorParam] && (
                    <div style={{
                        width: "100%",
                        maxWidth: 320,
                        padding: "12px 16px",
                        background: token.color.dangerSoft,
                        border: `1px solid ${token.color.danger}`,
                        borderRadius: token.radius.md,
                        fontSize: token.font.size.fs13,
                        color: token.color.danger,
                        textAlign: "center",
                    }}>
                        {errorMessage[errorParam]}
                    </div>
                )}

                <a
                    href={`${API}/auth/google`}
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "13px 24px",
                        borderRadius: token.radius.md,
                        border: `1px solid ${token.color.border}`,
                        background: token.color.bg,
                        color: token.color.fg,
                        fontSize: token.font.size.fs14,
                        fontWeight: 500,
                        textDecoration: "none",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        boxShadow: token.shadow.sm,
                        width: "100%",
                        maxWidth: 320,
                        justifyContent: "center",
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLAnchorElement).style.borderColor = token.color.accentBorder;
                        (e.currentTarget as HTMLAnchorElement).style.background = token.color.bgSubtle;
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLAnchorElement).style.borderColor = token.color.border;
                        (e.currentTarget as HTMLAnchorElement).style.background = token.color.bg;
                    }}
                >
                    <GoogleIcon />
                    {t.google_button}
                </a>

                <p style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle, margin: 0, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
                    {t.footer_note}
                </p>
            </div>
        </div>
    );
}

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z" />
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z" />
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z" />
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z" />
        </svg>
    );
}
