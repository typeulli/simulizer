import React from "react";
import { token } from "@/components/tokens";

export interface DotProps {
  color?: string;
  size?: number;
  style?: React.CSSProperties;
}

export function Dot({ color = token.color.fgMuted, size = 6, style }: DotProps) {
  return (
    <span
      style={{
        display:      "inline-block",
        width:        size,
        height:       size,
        borderRadius: token.radius.full,
        background:   color,
        flexShrink:   0,
        ...style,
      }}
    />
  );
}
