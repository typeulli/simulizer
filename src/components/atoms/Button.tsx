import React from "react";
import { token } from "@/components/tokens";

export type ButtonVariant =
    | "primary" | "accent" | "secondary" | "ghost" | "subtle" | "danger" | "link"
    | "run" | "wat" | "blocks" | "reset" | "ai";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    block?: boolean;
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    children?: React.ReactNode;
}

const bgMap: Record<ButtonVariant, string> = {
    primary:   token.color.fg,
    accent:    token.color.accent,
    secondary: token.color.surface,
    ghost:     "transparent",
    subtle:    token.color.surfaceHover,
    danger:    token.color.danger,
    link:      "transparent",
    run:       token.color.gradient.run,
    wat:       token.color.gradient.wat,
    blocks:    token.color.gradient.blocks,
    reset:     token.color.gradient.reset,
    ai:        token.color.gradient.ai,
};

const textMap: Record<ButtonVariant, string> = {
    primary:   token.color.fgInverse,
    accent:    token.color.fgOnAccent,
    secondary: token.color.fg,
    ghost:     token.color.fg,
    subtle:    token.color.fg,
    danger:    token.color.fgOnAccent,
    link:      token.color.accent,
    run:       token.color.fgOnAccent,
    wat:       token.color.fgOnAccent,
    blocks:    token.color.fgOnAccent,
    reset:     token.color.fgOnAccent,
    ai:        token.color.fgOnAccent,
};

const borderMap: Record<ButtonVariant, string | undefined> = {
    primary:   undefined,
    accent:    undefined,
    secondary: `1px solid ${token.color.border}`,
    ghost:     undefined,
    subtle:    undefined,
    danger:    undefined,
    link:      undefined,
    run:       undefined,
    wat:       undefined,
    blocks:    undefined,
    reset:     undefined,
    ai:        undefined,
};

const heightMap: Record<ButtonSize, string> = {
    xs: token.height.xs,
    sm: token.height.sm,
    md: token.height.md,
    lg: token.height.lg,
    xl: token.height.xl,
};

const fontSizeMap: Record<ButtonSize, string> = {
    xs: token.font.size.fs11,
    sm: token.font.size.fs12,
    md: token.font.size.fs13,
    lg: token.font.size.fs14,
    xl: token.font.size.fs15,
};

const paddingMap: Record<ButtonSize, string> = {
    xs: `0 ${token.space.sp15}`,
    sm: `0 ${token.space.sp2}`,
    md: `0 ${token.space.sp3}`,
    lg: `0 ${token.space.sp4}`,
    xl: `0 ${token.space.sp5}`,
};

export function Button({
    variant = "secondary",
    size = "md",
    block = false,
    leading,
    trailing,
    style,
    children,
    ...rest
}: ButtonProps) {
    return (
        <button
            style={{
                display:        block ? "flex" : "inline-flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            token.space.sp15,
                height:         heightMap[size],
                width:          block ? "100%" : undefined,
                padding:        paddingMap[size],
                fontSize:       fontSizeMap[size],
                fontFamily:     token.font.family.sans,
                fontWeight:     token.font.weight.semibold,
                lineHeight:     1,
                borderRadius:   token.radius.md,
                border:         borderMap[variant] ?? "none",
                cursor:         rest.disabled ? "not-allowed" : "pointer",
                background:     bgMap[variant],
                color:          textMap[variant],
                opacity:        rest.disabled ? 0.45 : 1,
                transition:     `opacity ${token.motion.transition.fast}, background ${token.motion.transition.fast}`,
                whiteSpace:     "nowrap",
                flexShrink:     block ? undefined : 0,
                ...style,
            }}
            onMouseEnter={e => {
                if (!rest.disabled) (e.currentTarget as HTMLButtonElement).style.opacity = "0.82";
            }}
            onMouseLeave={e => {
                if (!rest.disabled) (e.currentTarget as HTMLButtonElement).style.opacity = "1";
            }}
            {...rest}
        >
            {leading}
            {children}
            {trailing}
        </button>
    );
}