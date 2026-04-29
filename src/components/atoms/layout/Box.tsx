import React from "react";
import { token } from "@/components/tokens";

export type BoxTone = "default" | "subtle" | "muted" | "raised" | "accent" | "success" | "warning" | "danger";

export interface BoxProps extends React.HTMLAttributes<HTMLElement> {
  tone?: BoxTone;
  p?: keyof typeof token.space;
  shadow?: keyof typeof token.shadow;
  radius?: keyof typeof token.radius;
  border?: boolean;
  borderBottom?: boolean;
  as?: "div" | "aside" | "header" | "main" | "section" | "article" | "nav" | "footer";
  children?: React.ReactNode;
  bg?: "root" | "surface" | "raised" | "inset" | "modal" | "header";
}

const toneBgMap: Record<BoxTone, string> = {
  default: token.color.bg,
  subtle:  token.color.bgSubtle,
  muted:   token.color.bgMuted,
  raised:  token.color.bgRaised,
  accent:  token.color.accentSoft,
  success: token.color.successSoft,
  warning: token.color.warningSoft,
  danger:  token.color.dangerSoft,
};

const toneBorderMap: Record<BoxTone, string> = {
  default: token.color.border,
  subtle:  token.color.borderSubtle,
  muted:   token.color.border,
  raised:  token.color.border,
  accent:  token.color.accentBorder,
  success: token.color.successBorder,
  warning: token.color.warningBorder,
  danger:  token.color.dangerBorder,
};

const legacyBgMap: Record<string, string> = {
  root:    token.color.bg,
  surface: token.color.surface,
  raised:  token.color.bgRaised,
  inset:   token.color.bgSubtle,
  modal:   token.color.bg,
  header:  token.color.gradient.header,
};

export function Box({
  tone,
  bg,
  p,
  shadow: shadowKey,
  radius: radiusKey,
  border,
  borderBottom,
  as: As = "div",
  style,
  children,
  ...rest
}: BoxProps) {
  const background = tone
    ? toneBgMap[tone]
    : bg
    ? legacyBgMap[bg]
    : undefined;

  const borderColor = tone ? toneBorderMap[tone] : token.color.border;

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <As
      style={{
        background,
        padding:      p ? token.space[p] : undefined,
        boxShadow:    shadowKey ? token.shadow[shadowKey] : undefined,
        borderRadius: radiusKey ? token.radius[radiusKey] : undefined,
        border:       border ? `1px solid ${borderColor}` : undefined,
        borderBottom: borderBottom ? `1px solid ${borderColor}` : undefined,
        ...style,
      }}
      {...(rest as any)}
    >
      {children}
    </As>
  );
}