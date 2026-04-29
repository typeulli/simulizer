import React from "react";
import { token } from "@/components/tokens";
import { Text } from "@/components/atoms/Text";

export interface EmptyProps {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Empty({ icon, title, description, action, style }: EmptyProps) {
  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            token.space.sp2,
        padding:        token.space.sp10,
        textAlign:      "center",
        ...style,
      }}
    >
      {icon && (
        <span style={{ color: token.color.fgSubtle, marginBottom: token.space.sp1 }}>
          {icon}
        </span>
      )}
      {title && (
        <Text variant="body" style={{ fontWeight: token.font.weight.semibold }}>
          {title}
        </Text>
      )}
      {description && (
        <Text variant="caption" tone="muted">
          {description}
        </Text>
      )}
      {action && (
        <div style={{ marginTop: token.space.sp2 }}>
          {action}
        </div>
      )}
    </div>
  );
}
