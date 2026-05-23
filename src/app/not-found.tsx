"use client";
import React from "react";
import { useRouter } from "next/navigation";

import { Logo } from "@/components/atoms/Logo";
import { token } from "@/components/tokens";
import useLanguagePack from "@/hooks/useLanguagePack";

export default function NotFound() {
    const router = useRouter();
    const [, , pack] = useLanguagePack();
    const t = pack.not_found;

    return (
        <div style={{
            minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
            background: token.color.bg, fontFamily: token.font.family.sans, color: token.color.fg,
            padding: "32px 16px",
        }}>
            <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: token.space.sp6, textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Logo size={22} />
                    <span style={{ fontSize: token.font.size.fs16, fontWeight: 700, letterSpacing: "-0.02em" }}>Simulizer</span>
                </div>
                <div style={{
                    fontSize: 72, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.04em",
                    fontFamily: token.font.family.mono,
                    background: token.color.gradient.title,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                }}>
                    {t.code}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp2 }}>
                    <div style={{ fontSize: token.font.size.fs20, fontWeight: 700, color: token.color.fgStrong, letterSpacing: token.font.tracking.tight }}>
                        {t.title}
                    </div>
                    <div style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted, lineHeight: 1.6 }}>
                        {t.desc}
                    </div>
                </div>
                <div style={{ display: "flex", gap: token.space.sp2 }}>
                    <button
                        onClick={() => router.back()}
                        style={{ padding: "8px 20px", borderRadius: token.radius.md, background: "transparent", color: token.color.fg, fontWeight: 600, fontSize: token.font.size.fs13, border: `1px solid ${token.color.border}`, cursor: "pointer" }}
                    >
                        {t.go_back}
                    </button>
                    <button
                        onClick={() => router.replace("/")}
                        style={{ padding: "8px 20px", borderRadius: token.radius.md, background: token.color.accent, color: token.color.fgOnAccent, fontWeight: 600, fontSize: token.font.size.fs13, border: "none", cursor: "pointer" }}
                    >
                        {t.go_home}
                    </button>
                </div>
            </div>
        </div>
    );
}
