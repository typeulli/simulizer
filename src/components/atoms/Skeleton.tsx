import React from "react";
import { token } from "@/components/tokens";

export interface SkeletonProps {
  width?: React.CSSProperties["width"];
  height?: React.CSSProperties["height"];
  radius?: keyof typeof token.radius;
  style?: React.CSSProperties;
}

export function Skeleton({ width = "100%", height = 12, radius = "sm", style }: SkeletonProps) {
  return (
    <span
      style={{
        display:         "block",
        width,
        height,
        borderRadius:    token.radius[radius],
        background:      token.color.bgMuted,
        backgroundImage: `linear-gradient(90deg, transparent 0%, color-mix(in oklch, ${token.color.bg} 60%, transparent) 50%, transparent 100%)`,
        backgroundSize:  "200% 100%",
        animation:       "ui-skeleton-shine 1.4s ease infinite",
        flexShrink:      0,
        ...style,
      }}
    />
  );
}
