import React from "react";
import { token } from "@/components/tokens";

export interface DividerProps {
    orientation?: "horizontal" | "vertical";
    variant?: "solid" | "dashed";
    style?: React.CSSProperties;
}

export function Divider({ orientation = "horizontal", variant = "solid", style }: DividerProps) {
    const isVertical = orientation === "vertical";

    return (
        <span
            role="separator"
            aria-orientation={orientation}
            style={{
                display:    "block",
                flexShrink: 0,
                ...(isVertical
                    ? {
                            width:     "1px",
                            height:    "100%",
                            alignSelf: "stretch",
                            background: variant === "dashed"
                                ? `repeating-linear-gradient(to bottom, ${token.color.border} 0px, ${token.color.border} 4px, transparent 4px, transparent 8px)`
                                : token.color.border,
                        }
                    : {
                            width:     "100%",
                            height:    "1px",
                            background: variant === "dashed"
                                ? `repeating-linear-gradient(to right, ${token.color.border} 0px, ${token.color.border} 4px, transparent 4px, transparent 8px)`
                                : token.color.border,
                        }),
                ...style,
            }}
        />
    );
}