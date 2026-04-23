import React from "react";
import { darkTheme } from "../tokens";

type RunState = "idle" | "compiling" | "running" | "done" | "error";

interface StatusDotProps {
  runState: RunState;
}

const colorMap: Record<RunState, string> = {
  idle:      "#374151",
  compiling: darkTheme.color.text.warning,
  running:   darkTheme.color.text.warning,
  done:      darkTheme.color.text.success,
  error:     darkTheme.color.text.error,
};

export function StatusDot({ runState }: StatusDotProps) {
  const isActive = runState === "compiling" || runState === "running";
  const bg = colorMap[runState];
  return (
    <span
      style={{
        width:       8,
        height:      8,
        borderRadius: "50%",
        display:     "inline-block",
        marginRight: 6,
        background:  bg,
        boxShadow:   isActive ? `0 0 6px ${bg}` : "none",
        flexShrink:  0,
      }}
    />
  );
}
