import React from "react";
import { darkTheme } from "../../tokens";

export interface InlineProps extends React.HTMLAttributes<HTMLDivElement> {
  gap?:     keyof typeof darkTheme.spacing;
  align?:   React.CSSProperties["alignItems"];
  justify?: React.CSSProperties["justifyContent"];
  children?: React.ReactNode;
}

export function Inline({
  gap = "sm",
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
        gap:            darkTheme.spacing[gap],
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
