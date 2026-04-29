import React from "react";
import { token } from "@/components/tokens";
import { Text } from "@/components/atoms/Text";

export interface StatProps {
  label?: React.ReactNode;
  value?: React.ReactNode;
  sub?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Stat({ label, value, sub, style }: StatProps) {
  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        gap:           token.space.sp05,
        ...style,
      }}
    >
      {label && (
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      )}
      {value !== undefined && (
        <Text variant="h4" tone="strong">
          {value}
        </Text>
      )}
      {sub && (
        <Text variant="caption" tone="subtle">
          {sub}
        </Text>
      )}
    </div>
  );
}
