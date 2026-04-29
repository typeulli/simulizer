import React from "react";
import { token } from "@/components/tokens";

export type BadgeTone = "default" | "accent" | "success" | "warning" | "danger" | "solid";
export type BadgeShape = "rect" | "pill";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  shape?: BadgeShape;
  mono?: boolean;
  dot?: boolean;
  children?: React.ReactNode;
}

const toneBgMap: Record<BadgeTone, string> = {
  default: token.color.surfaceHover,
  accent:  token.color.accentSoft,
  success: token.color.successSoft,
  warning: token.color.warningSoft,
  danger:  token.color.dangerSoft,
  solid:   token.color.accent,
};

const toneTextMap: Record<BadgeTone, string> = {
  default: token.color.fgMuted,
  accent:  token.color.accent,
  success: token.color.success,
  warning: token.color.warning,
  danger:  token.color.danger,
  solid:   token.color.fgOnAccent,
};

const toneBorderMap: Record<BadgeTone, string> = {
  default: token.color.border,
  accent:  token.color.accentBorder,
  success: token.color.successBorder,
  warning: token.color.warningBorder,
  danger:  token.color.dangerBorder,
  solid:   "transparent",
};

export function Badge({
  tone = "default",
  shape = "rect",
  mono = false,
  dot = false,
  style,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        gap:            token.space.sp1,
        height:         "20px",
        padding:        `0 ${token.space.sp15}`,
        fontSize:       token.font.size.fs11,
        fontFamily:     mono ? token.font.family.mono : token.font.family.sans,
        fontWeight:     token.font.weight.medium,
        lineHeight:     1,
        borderRadius:   shape === "pill" ? token.radius.full : token.radius.sm,
        border:         `1px solid ${toneBorderMap[tone]}`,
        background:     toneBgMap[tone],
        color:          toneTextMap[tone],
        whiteSpace:     "nowrap",
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span
          style={{
            width:        5,
            height:       5,
            borderRadius: token.radius.full,
            background:   toneTextMap[tone],
            flexShrink:   0,
          }}
        />
      )}
      {children}
    </span>
  );
}