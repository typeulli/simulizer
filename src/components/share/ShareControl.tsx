"use client";
import React, { useState } from "react";
import { token } from "@/components/tokens";
import { Button } from "@/components/atoms/Button";
import { Spinner } from "@/components/atoms/Spinner";
import { Icon } from "@/components/atoms/Icons";
import { setFileVisibility, type FileOut, type FileVisibility } from "@/lib/authapi";
import useLanguagePack from "@/hooks/useLanguagePack";

export interface ShareControlProps {
    file: FileOut;
    onChange?: (file: FileOut) => void;
}

// Brand mid-tone (그라데이션 가운데 색, 약간 청록)
const BRAND = {
    base:    "oklch(64% 0.13 198)",
    soft:    "oklch(64% 0.13 198 / 0.12)",
    border:  "oklch(64% 0.13 198 / 0.45)",
    fgOn:    "#ffffff",
} as const;

function shareUrlFor(fileId: string): string {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/workspace?file=${fileId}`;
}

function LockIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
    );
}

function CopyIcon({ size = 11 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
    );
}

interface OptionRowProps {
    selected: boolean;
    disabled: boolean;
    icon: React.ReactNode;
    title: string;
    desc: string;
    onClick: () => void;
}

function OptionRow({ selected, disabled, icon, title, desc, onClick }: OptionRowProps) {
    const [hover, setHover] = useState(false);
    const borderColor = selected
        ? BRAND.border
        : hover
            ? token.color.borderStrong
            : token.color.border;
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                display: "flex",
                alignItems: "center",
                gap: token.space.sp3,
                padding: `${token.space.sp25} ${token.space.sp3}`,
                background: selected ? BRAND.soft : token.color.surface,
                border: `1px solid ${borderColor}`,
                borderRadius: token.radius.md,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.55 : 1,
                textAlign: "left",
                width: "100%",
                transition: `border-color ${token.motion.transition.fast}, background ${token.motion.transition.fast}`,
            }}
        >
            <div
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: token.radius.sm,
                    background: selected ? BRAND.base : token.color.bgSubtle,
                    color: selected ? BRAND.fgOn : token.color.fgMuted,
                    flexShrink: 0,
                }}
            >
                {icon}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{
                    fontSize: token.font.size.fs13,
                    fontWeight: token.font.weight.semibold,
                    color: token.color.fgStrong,
                }}>{title}</div>
                <div style={{
                    fontSize: token.font.size.fs11,
                    color: token.color.fgMuted,
                    lineHeight: 1.5,
                }}>{desc}</div>
            </div>
            <div
                style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: `1.5px solid ${selected ? BRAND.base : token.color.border}`,
                    background: selected ? BRAND.base : "transparent",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: BRAND.fgOn,
                }}
            >
                {selected && <Icon.Check size={10} />}
            </div>
        </button>
    );
}

export function ShareControl({ file, onChange }: ShareControlProps) {
    const [, , pack] = useLanguagePack();
    const t = pack.workspace.ui;
    const visibility = (file.visibility === "link" ? "link" : "private") as FileVisibility;
    const [pending, setPending] = useState<FileVisibility | null>(null);
    const [copied, setCopied] = useState(false);

    const handleVisibility = async (next: FileVisibility) => {
        if (next === visibility || pending) return;
        setPending(next);
        try {
            const updated = await setFileVisibility(file.id, next);
            onChange?.(updated);
        } catch {
            // silent
        } finally {
            setPending(null);
        }
    };

    const handleCopy = async () => {
        const url = shareUrlFor(file.id);
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // ignore
        }
    };

    const isLink = visibility === "link";
    const url = shareUrlFor(file.id);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp4, minWidth: 340 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp2 }}>
                <OptionRow
                    selected={visibility === "private"}
                    disabled={pending !== null}
                    icon={pending === "private" ? <Spinner size="sm" /> : <LockIcon size={14} />}
                    title={t.share_state_private}
                    desc={t.share_state_private_desc}
                    onClick={() => handleVisibility("private")}
                />
                <OptionRow
                    selected={visibility === "link"}
                    disabled={pending !== null}
                    icon={pending === "link" ? <Spinner size="sm" /> : <Icon.Globe size={14} />}
                    title={t.share_state_link}
                    desc={t.share_state_link_desc}
                    onClick={() => handleVisibility("link")}
                />
            </div>

            {isLink && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "stretch",
                        gap: 0,
                        padding: 0,
                        background: token.color.bgSubtle,
                        border: `1px solid ${token.color.border}`,
                        borderRadius: token.radius.md,
                        overflow: "hidden",
                    }}
                >
                    <input
                        readOnly
                        value={url}
                        onFocus={e => e.currentTarget.select()}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            padding: `${token.space.sp25} ${token.space.sp3}`,
                            fontFamily: token.font.family.mono,
                            fontSize: token.font.size.fs12,
                            color: token.color.fg,
                        }}
                    />
                    <Button
                        variant="secondary"
                        size="sm"
                        leading={copied ? <Icon.Check size={11} /> : <CopyIcon size={11} />}
                        onClick={handleCopy}
                        style={{
                            borderRadius: 0,
                            border: "none",
                            borderLeft: `1px solid ${token.color.border}`,
                            background: copied ? BRAND.base : undefined,
                            color: copied ? BRAND.fgOn : undefined,
                            height: "auto",
                            alignItems: "center",
                            padding: `${token.space.sp25} ${token.space.sp3}`,
                        }}
                    >
                        {copied ? t.share_link_copied : t.share_copy_link}
                    </Button>
                </div>
            )}
        </div>
    );
}
