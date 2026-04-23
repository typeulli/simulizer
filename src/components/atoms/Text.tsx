import React from "react";
import { darkTheme } from "../tokens";

export type TextVariant = "title" | "heading" | "label" | "code" | "body";
export type TextColor   = "primary" | "accent" | "muted" | "success" | "error" | "warning" | "code";

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  variant?: TextVariant;
  color?:   TextColor;
  as?:      React.ElementType;
  children?: React.ReactNode;
}

const colorMap: Record<TextColor, string> = {
  primary: darkTheme.color.text.primary,
  accent:  darkTheme.color.text.accent,
  muted:   darkTheme.color.text.muted,
  success: darkTheme.color.text.success,
  error:   darkTheme.color.text.error,
  warning: darkTheme.color.text.warning,
  code:    darkTheme.color.text.code,
};

const variantStyle: Record<TextVariant, React.CSSProperties> = {
  title: {
    fontSize:              darkTheme.fontSize.lg,
    fontWeight:            700,
    letterSpacing:         1,
    background:            darkTheme.color.gradient.title,
    WebkitBackgroundClip:  "text",
    WebkitTextFillColor:   "transparent",
    whiteSpace:            "nowrap",
  },
  heading: {
    fontSize:    darkTheme.fontSize.xl,
    fontWeight:  800,
    letterSpacing: -0.5,
  },
  label: {
    fontSize:      darkTheme.fontSize.sm,
    fontWeight:    700,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  code: {
    fontSize:   darkTheme.fontSize.md,
    fontFamily: darkTheme.font.mono,
  },
  body: {
    fontSize: darkTheme.fontSize.base,
  },
};

export function Text({
  variant = "body",
  color,
  as,
  style,
  children,
  ...rest
}: TextProps) {
  const Tag = (as ?? "span") as React.ElementType;
  const vStyle = variantStyle[variant];
  const colorValue = color ? colorMap[color] : undefined;

  // gradient text 는 color 를 WebkitTextFillColor 로 제어하므로 color prop 무시
  const colorStyle: React.CSSProperties =
    variant === "title" ? {} : { color: colorValue };

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag style={{ ...vStyle, ...colorStyle, ...style }} {...(rest as any)}>
      {children}
    </Tag>
  );
}
