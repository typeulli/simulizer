"use client";
// Presence avatars for the ClangWorkspace top bar. Shows who is currently in
// the collaboration session; the current user is rendered first with a "you"
// marker. Each avatar is tinted with the participant's cursor color so it maps
// to their carets in the editor.

import React from "react";
import { token } from "@/components/tokens";
import type { CollabParticipant, CollabStatus } from "./useClangCollab";

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function Avatar({ p }: { p: CollabParticipant }) {
    const ring = p.color;
    return (
        <div
            title={p.self ? `${p.name} (you)` : p.name}
            style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: p.pictureUrl ? "transparent" : ring,
                color: "#fff",
                fontSize: token.font.size.fs10,
                fontWeight: 700,
                border: `2px solid ${ring}`,
                boxShadow: `0 0 0 2px ${token.color.bg}`,
                marginLeft: -6,
                overflow: "hidden",
                flexShrink: 0,
                cursor: "default",
            }}
        >
            {p.pictureUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.pictureUrl} alt={p.name} width={26} height={26} style={{ objectFit: "cover" }} />
                : initials(p.name)}
        </div>
    );
}

export function PresenceBar({
    participants,
    status,
}: {
    participants: CollabParticipant[];
    status: CollabStatus;
}) {
    // Nothing to show until actually in a session ("inactive" = link opened but
    // the owner hasn't started one).
    if (status === "disabled" || status === "inactive") return null;

    // Self first, then others; cap the rendered avatars and show a "+N" pill.
    const sorted = [...participants].sort((a, b) => (a.self === b.self ? 0 : a.self ? -1 : 1));
    const MAX = 5;
    const shown = sorted.slice(0, MAX);
    const extra = sorted.length - shown.length;

    const dotColor =
        status === "connected"          ? token.color.success :
        status === "closed"             ? token.color.danger  :
        status === "error"              ? token.color.danger  :
        token.color.warning;
    const label =
        status === "connected" ? `Live · ${participants.length}` :
        status === "closed"    ? "Session ended" :
        status === "error"     ? "Can't connect" :
        "Connecting…";

    return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }} aria-label="collaborators">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: token.font.size.fs10, color: token.color.fgMuted, fontFamily: token.font.family.mono, whiteSpace: "nowrap" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
                {label}
            </span>
            {shown.length > 0 && (
                <div style={{ display: "inline-flex", alignItems: "center", paddingLeft: 6 }}>
                    {shown.map(p => <Avatar key={`${p.id}-${p.self ? "self" : "peer"}-${p.name}`} p={p} />)}
                    {extra > 0 && (
                        <div style={{
                            width: 26, height: 26, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
                            background: token.color.bgSubtle, color: token.color.fgMuted, fontSize: token.font.size.fs10, fontWeight: 700,
                            border: `2px solid ${token.color.border}`, boxShadow: `0 0 0 2px ${token.color.bg}`, marginLeft: -6, flexShrink: 0,
                        }}>
                            +{extra}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
