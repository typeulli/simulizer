import React from "react";
import useLanguagePack from "@/hooks/useLanguagePack";
import { token } from "@/components/tokens";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/organisms/Modal";
import { Button } from "@/components/atoms/Button";

export type AlertVariant = "info" | "warning" | "error";

type VariantMeta = {
    /** Foreground / accent color of the variant. */
    color: string;
    /** Soft background used behind the icon. */
    soft: string;
    /** Default title shown when none is provided. */
    defaultTitle: string;
    /** 24×24 glyph drawn in currentColor. */
    glyph: React.ReactNode;
};

const VARIANT_META: Record<AlertVariant, Omit<VariantMeta, 'defaultTitle'>> = {
    info: {
        color: token.color.info,
        soft: token.color.infoSoft,
        glyph: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="11" x2="12" y2="16" />
                <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
            </svg>
        ),
    },
    warning: {
        color: token.color.warning,
        soft: token.color.warningSoft,
        glyph: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
            </svg>
        ),
    },
    error: {
        color: token.color.danger,
        soft: token.color.dangerSoft,
        glyph: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
        ),
    },
};

export interface AlertModalProps {
    variant: AlertVariant;
    /** Heading text; falls back to a per-variant default. */
    title?: string;
    /** Body content — string or rich node. */
    message: React.ReactNode;
    /** Label for the confirm/dismiss button. */
    confirmLabel?: string;
    onClose: () => void;
    width?: string | number;
}

/**
 * VS Code-style notification dialog with info / warning / error variants.
 * A single confirm button dismisses it; Escape and backdrop click also close.
 */
export function AlertModal({
    variant,
    title,
    message,
    confirmLabel,
    onClose,
    width = 420,
}: AlertModalProps) {
    const [, , pack] = useLanguagePack();
    const meta = VARIANT_META[variant];
    const defaultTitle = variant === "info" ? pack.messages.alert_title
        : variant === "warning" ? pack.messages.warning_title
        : pack.messages.error_title;
    const finalConfirmLabel = confirmLabel ?? pack.messages.ok_button;
    return (
        <Modal width={width} onClose={onClose}>
            <ModalHeader onClose={onClose}>
                <div style={{ display: "flex", alignItems: "center", gap: token.space.sp2 }}>
                    <span
                        aria-hidden
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 30,
                            height: 30,
                            borderRadius: token.radius.md,
                            background: meta.soft,
                            color: meta.color,
                            flexShrink: 0,
                        }}
                    >
                        {meta.glyph}
                    </span>
                    <span style={{ fontWeight: token.font.weight.semibold, fontSize: token.font.size.fs14 }}>
                        {title ?? defaultTitle}
                    </span>
                </div>
            </ModalHeader>
            <ModalBody>
                <div style={{ fontSize: token.font.size.fs13, color: token.color.fg, lineHeight: 1.65, whiteSpace: "pre-line" }}>
                    {message}
                </div>
            </ModalBody>
            <ModalFooter>
                <Button variant="secondary" size="sm" onClick={onClose}>
                    {finalConfirmLabel}
                </Button>
            </ModalFooter>
        </Modal>
    );
}
