import React from "react";
import { token } from "@/components/tokens";

type NewGap = keyof typeof token.space;
type LegacyGap = "xs" | "sm" | "md" | "lg" | "xl";

const legacyGapMap: Record<LegacyGap, string> = {
    xs: token.space.sp1,
    sm: token.space.sp2,
    md: token.space.sp3,
    lg: token.space.sp4,
    xl: token.space.sp5,
};

function resolveGap(gap: NewGap | LegacyGap): string {
    if (gap in legacyGapMap) return legacyGapMap[gap as LegacyGap];
    return token.space[gap as NewGap];
}

export interface InlineProps extends React.HTMLAttributes<HTMLDivElement> {
    gap?:     NewGap | LegacyGap;
    align?:   React.CSSProperties["alignItems"];
    justify?: React.CSSProperties["justifyContent"];
    children?: React.ReactNode;
}

export function Inline({
    gap = "sp4",
    align = "center",
    justify,
    style,
    children,
    ...rest
}: InlineProps) {
    return (
        <div
            style={{
                display:        "flex",
                flexDirection:  "row",
                gap:            resolveGap(gap),
                alignItems:     align,
                justifyContent: justify,
                ...style,
            }}
            {...rest}
        >
            {children}
        </div>
    );
}
