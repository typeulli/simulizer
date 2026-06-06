import React from "react";
import { token } from "@/components/tokens";
import { Icon } from "@/components/atoms/Icons";

export type BuildSnackbarStatus = "progress" | "done" | "error";

export interface BuildSnackbarProps {
    status: BuildSnackbarStatus;
    message: string;
    step: number;
    total: number;
    onDismiss: () => void;
    /** "fixed" floats over the viewport; "absolute" floats within the nearest positioned ancestor. */
    position?: "fixed" | "absolute";
    zIndex?: number;
}

const DONE_COLOR = "#46a758";
const ERROR_COLOR = "#e5484d";

/**
 * Floating build/compile progress card: a message row with a dismiss button,
 * plus a progress bar and step/total counter. The dismiss button is disabled
 * while a build is still in progress. Shared by the Block and Clang workspaces.
 */
export function BuildSnackbar({
    status,
    message,
    step,
    total,
    onDismiss,
    position = "fixed",
    zIndex = 50,
}: BuildSnackbarProps) {
    const isProgress = status === "progress";
    const accent =
        status === "error" ? ERROR_COLOR :
        status === "done"  ? DONE_COLOR  :
        token.color.fg;

    return (
        <div style={{ position, bottom: 16, right: 24, zIndex, width: 300, maxWidth: "calc(100vw - 32px)", padding: "10px 12px", background: token.color.bgRaised, border: `1px solid ${status === "error" ? ERROR_COLOR : status === "done" ? DONE_COLOR : token.color.border}`, borderRadius: token.radius.sm, boxShadow: "0 6px 18px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, fontSize: token.font.size.fs11, color: status === "error" ? ERROR_COLOR : token.color.fg, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: status === "error" ? "normal" : "nowrap", wordBreak: "break-word", maxHeight: status === "error" ? 120 : undefined, overflowY: status === "error" ? "auto" : undefined }}>
                    {status === "done" && "✓ "}
                    {status === "error" && "✕ "}
                    {message}
                </span>
                <button
                    onClick={onDismiss}
                    disabled={isProgress}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 2, border: "none", background: "none", color: token.color.fgMuted, cursor: isProgress ? "default" : "pointer", opacity: isProgress ? 0.3 : 1 }}
                    aria-label="Dismiss"
                >
                    <Icon.X size={11} />
                </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 4, background: token.color.bgSubtle, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, (step / Math.max(1, total)) * 100))}%`, height: "100%", background: accent, transition: "width 0.2s ease" }} />
                </div>
                {total > 0 && (
                    <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle, fontVariantNumeric: "tabular-nums" }}>
                        {step}/{total}
                    </span>
                )}
            </div>
        </div>
    );
}
