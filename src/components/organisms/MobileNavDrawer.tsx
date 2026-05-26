"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { token } from "@/components/tokens";
import { Icon } from "@/components/atoms/Icons";

export interface MobileNavDrawerProps {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileNavDrawer({ open, onClose, children }: MobileNavDrawerProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const closeBtnRef = useRef<HTMLButtonElement>(null);
    const lastFocusedRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        lastFocusedRef.current = document.activeElement as HTMLElement | null;
        // Move focus into the drawer on open.
        closeBtnRef.current?.focus();

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
                return;
            }
            if (e.key !== "Tab" || !panelRef.current) return;
            const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener("keydown", onKey);
            // Restore focus to the trigger that opened the drawer.
            lastFocusedRef.current?.focus?.();
        };
    }, [open, onClose]);

    if (typeof document === "undefined") return null;
    if (!open) return null;

    return createPortal(
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 1000,
                display: "flex",
                justifyContent: "flex-end",
            }}
        >
            <div
                aria-hidden="true"
                onClick={onClose}
                style={{
                    position: "absolute",
                    inset: 0,
                    background: token.color.scrim,
                }}
            />
            <aside
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                style={{
                    position: "relative",
                    width: "min(320px, 85vw)",
                    height: "100%",
                    background: token.color.bg,
                    borderLeft: `1px solid ${token.color.border}`,
                    boxShadow: token.shadow.xl,
                    display: "flex",
                    flexDirection: "column",
                    padding: token.space.sp4,
                    gap: token.space.sp3,
                    overflowY: "auto",
                }}
            >
                <button
                    ref={closeBtnRef}
                    onClick={onClose}
                    aria-label="Close menu"
                    style={{
                        alignSelf: "flex-end",
                        background: "transparent",
                        border: "none",
                        color: token.color.fg,
                        cursor: "pointer",
                        padding: token.space.sp1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Icon.X size={18} />
                </button>
                {children}
            </aside>
        </div>,
        document.body,
    );
}

export interface MobileNavToggleProps {
    onClick: () => void;
}

export function MobileNavToggle({ onClick }: MobileNavToggleProps) {
    return (
        <button
            onClick={onClick}
            aria-label="Open menu"
            aria-haspopup="dialog"
            style={{
                background: "transparent",
                border: "none",
                color: token.color.fg,
                cursor: "pointer",
                padding: token.space.sp1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <Icon.Menu size={20} />
        </button>
    );
}
