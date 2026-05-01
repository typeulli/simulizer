import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { token } from "@/components/tokens";
import { Icon } from "@/components/atoms/Icons";
import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";

export interface ModalProps {
    children?: React.ReactNode;
    onClose?: () => void;
    width?: string | number;
    style?: React.CSSProperties;
}

export function Modal({ children, onClose, width = 480, style }: ModalProps) {
    useEffect(() => {
        if (!onClose) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    return ReactDOM.createPortal(
        <div style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: "var(--z-modal)" as React.CSSProperties["zIndex"],
        }}>
            <div
                onClick={onClose}
                style={{
                    position: "absolute",
                    inset: 0,
                    background: "var(--scrim)",
                    backdropFilter: "blur(var(--backdrop-blur))",
                }}
            />
            <div style={{
                position: "relative",
                width,
                maxWidth: "calc(100vw - 32px)",
                maxHeight: "calc(100vh - 64px)",
                display: "flex",
                flexDirection: "column",
                background: token.color.surface,
                border: `1px solid ${token.color.border}`,
                borderRadius: token.radius.lg,
                boxShadow: token.shadow.xl,
                overflow: "hidden",
                ...style,
            }}>
                {children}
            </div>
        </div>,
        document.body
    );
}

export interface ModalHeaderProps {
    children?: React.ReactNode;
    onClose?: () => void;
    style?: React.CSSProperties;
}

export function ModalHeader({ children, onClose, style }: ModalHeaderProps) {
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            gap: token.space.sp3,
            padding: `${token.space.sp3} ${token.space.sp4}`,
            borderBottom: `1px solid ${token.color.border}`,
            flexShrink: 0,
            ...style,
        }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                {typeof children === "string"
                    ? <Text variant="body" style={{ fontWeight: token.font.weight.semibold }}>{children}</Text>
                    : children}
            </div>
            {onClose && (
                <Button variant="ghost" size="xs" onClick={onClose} style={{ padding: token.space.sp1 }}>
                    <Icon.X size={13} />
                </Button>
            )}
        </div>
    );
}

export interface ModalBodyProps {
    children?: React.ReactNode;
    style?: React.CSSProperties;
}

export function ModalBody({ children, style }: ModalBodyProps) {
    return (
        <div style={{
            flex: 1,
            overflowY: "auto",
            padding: token.space.sp4,
            ...style,
        }}>
            {children}
        </div>
    );
}

export interface ModalFooterProps {
    children?: React.ReactNode;
    style?: React.CSSProperties;
}

export function ModalFooter({ children, style }: ModalFooterProps) {
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: token.space.sp2,
            padding: `${token.space.sp3} ${token.space.sp4}`,
            borderTop: `1px solid ${token.color.border}`,
            background: token.color.surfaceSunken,
            flexShrink: 0,
            ...style,
        }}>
            {children}
        </div>
    );
}
