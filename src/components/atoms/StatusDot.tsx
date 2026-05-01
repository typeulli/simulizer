import React from "react";
import { token } from "@/components/tokens";

type RunState = "idle" | "compiling" | "running" | "done" | "error";

interface StatusDotProps {
    runState: RunState;
}

const colorMap: Record<RunState, string> = {
    idle:      token.color.fgSubtle,
    compiling: token.color.warning,
    running:   token.color.warning,
    done:      token.color.success,
    error:     token.color.danger,
};

export function StatusDot({ runState }: StatusDotProps) {
    const isActive = runState === "compiling" || runState === "running";
    const bg = colorMap[runState];
    return (
        <span
            style={{
                width:        8,
                height:       8,
                borderRadius: token.radius.full,
                display:      "inline-block",
                marginRight:  6,
                background:   bg,
                boxShadow:    isActive ? `0 0 6px ${bg}` : "none",
                flexShrink:   0,
                transition:   `background ${token.motion.transition.base}`,
            }}
        />
    );
}