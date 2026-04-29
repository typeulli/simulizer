import React from "react";
import { token } from "@/components/tokens";

export type TextVariant =
  | "display" | "h1" | "h2" | "h3" | "h4" | "h5"
  | "body-lg" | "body" | "caption" | "overline" | "mono"
  | "title" | "heading" | "label" | "code";

export type TextTone =
  | "default" | "strong" | "muted" | "subtle" | "disabled"
  | "accent" | "success" | "warning" | "danger" | "info"
  | "primary" | "error" | "code" | "warning-text";

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  variant?: TextVariant;
  tone?: TextTone;
  color?: TextTone;
  gradient?: boolean;
  as?: React.ElementType;
  children?: React.ReactNode;
}

const variantStyle: Record<TextVariant, React.CSSProperties> = {
  display: {
    fontSize:      token.font.size.fs56,
    fontWeight:    token.font.weight.bold,
    lineHeight:    token.font.lineHeight.tight,
    letterSpacing: token.font.tracking.tighter,
  },
  h1: {
    fontSize:      token.font.size.fs40,
    fontWeight:    token.font.weight.bold,
    lineHeight:    token.font.lineHeight.tight,
    letterSpacing: token.font.tracking.tight,
  },
  h2: {
    fontSize:      token.font.size.fs32,
    fontWeight:    token.font.weight.bold,
    lineHeight:    token.font.lineHeight.snug,
    letterSpacing: token.font.tracking.tight,
  },
  h3: {
    fontSize:      token.font.size.fs24,
    fontWeight:    token.font.weight.semibold,
    lineHeight:    token.font.lineHeight.snug,
    letterSpacing: token.font.tracking.tight,
  },
  h4: {
    fontSize:   token.font.size.fs20,
    fontWeight: token.font.weight.semibold,
    lineHeight: token.font.lineHeight.snug,
  },
  h5: {
    fontSize:   token.font.size.fs16,
    fontWeight: token.font.weight.semibold,
    lineHeight: token.font.lineHeight.snug,
  },
  "body-lg": {
    fontSize:   token.font.size.fs16,
    fontWeight: token.font.weight.regular,
    lineHeight: token.font.lineHeight.relaxed,
  },
  body: {
    fontSize:   token.font.size.fs14,
    fontWeight: token.font.weight.regular,
    lineHeight: token.font.lineHeight.base,
  },
  caption: {
    fontSize:   token.font.size.fs12,
    fontWeight: token.font.weight.regular,
    lineHeight: token.font.lineHeight.base,
  },
  overline: {
    fontSize:      token.font.size.fs11,
    fontWeight:    token.font.weight.semibold,
    lineHeight:    token.font.lineHeight.base,
    letterSpacing: token.font.tracking.wider,
    textTransform: "uppercase" as const,
  },
  mono: {
    fontSize:   token.font.size.fs12,
    fontWeight: token.font.weight.regular,
    fontFamily: token.font.family.mono,
    lineHeight: token.font.lineHeight.base,
  },
  title: {
    fontSize:      token.font.size.fs18,
    fontWeight:    token.font.weight.bold,
    letterSpacing: token.font.tracking.tight,
  },
  heading: {
    fontSize:      token.font.size.fs28,
    fontWeight:    token.font.weight.black,
    letterSpacing: token.font.tracking.tighter,
  },
  label: {
    fontSize:      token.font.size.fs11,
    fontWeight:    token.font.weight.bold,
    letterSpacing: token.font.tracking.widest,
    textTransform: "uppercase" as const,
  },
  code: {
    fontSize:   token.font.size.fs12,
    fontFamily: token.font.family.mono,
  },
};

const toneMap: Record<TextTone, string> = {
  default:        token.color.fg,
  strong:         token.color.fgStrong,
  muted:          token.color.fgMuted,
  subtle:         token.color.fgSubtle,
  disabled:       token.color.fgDisabled,
  accent:         token.color.accent,
  success:        token.color.success,
  warning:        token.color.warning,
  danger:         token.color.danger,
  info:           token.color.info,
  primary:        token.color.fg,
  error:          token.color.danger,
  code:           token.color.accent,
  "warning-text": token.color.warning,
};

export interface CodeProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

export function Code({ style, children, ...rest }: CodeProps) {
  return (
    <code
      style={{
        fontSize:        token.font.size.fs12,
        fontFamily:      token.font.family.mono,
        color:           token.color.accent,
        background:      token.color.bgCode,
        padding:         `1px ${token.space.sp1}`,
        borderRadius:    token.radius.xs,
        border:          `1px solid ${token.color.borderSubtle}`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </code>
  );
}

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

export function Kbd({ style, children, ...rest }: KbdProps) {
  return (
    <kbd
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        justifyContent:"center",
        minWidth:      20,
        height:        20,
        padding:       `0 ${token.space.sp1}`,
        fontSize:      token.font.size.fs11,
        fontFamily:    token.font.family.mono,
        fontWeight:    token.font.weight.medium,
        color:         token.color.fgMuted,
        background:    token.color.bgSubtle,
        border:        `1px solid ${token.color.border}`,
        borderBottom:  `2px solid ${token.color.border}`,
        borderRadius:  token.radius.xs,
        lineHeight:    1,
        ...style,
      }}
      {...rest}
    >
      {children}
    </kbd>
  );
}

export function Text({
  variant = "body",
  tone,
  color,
  gradient,
  as,
  style,
  children,
  ...rest
}: TextProps) {
  const Tag = (as ?? "span") as React.ElementType;
  const activeTone = tone ?? color;
  const vStyle = variantStyle[variant];

  const isGradient = gradient ?? (variant === "title");
  const gradientStyle: React.CSSProperties = isGradient
    ? {
        background:           token.color.gradient.title,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor:  "transparent",
        backgroundClip:       "text",
      }
    : {};

  const colorStyle: React.CSSProperties = isGradient
    ? {}
    : { color: activeTone ? toneMap[activeTone] : undefined };

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag style={{ ...vStyle, ...colorStyle, ...gradientStyle, ...style }} {...(rest as any)}>
      {children}
    </Tag>
  );
}