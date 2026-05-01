import React from "react";
import { token } from "@/components/tokens";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";

const sizeMap: Record<SpinnerSize, number> = {
    xs: 10,
    sm: 12,
    md: 16,
    lg: 20,
};

const borderMap: Record<SpinnerSize, number> = {
    xs: 1.5,
    sm: 1.5,
    md: 2,
    lg: 2.5,
};

export interface SpinnerProps {
    size?: SpinnerSize;
    color?: string;
    style?: React.CSSProperties;
}

export function Spinner({ size = "md", color, style }: SpinnerProps) {
    const px = sizeMap[size];
    const bw = borderMap[size];
    const c = color ?? token.color.accent;

    return (
        <span
            style={{
                display:      "inline-block",
                width:        px,
                height:       px,
                borderRadius: token.radius.full,
                border:       `${bw}px solid color-mix(in oklch, ${c} 24%, transparent)`,
                borderTopColor: c,
                animation:    "ui-spin 0.7s linear infinite",
                flexShrink:   0,
                ...style,
            }}
        />
    );
}