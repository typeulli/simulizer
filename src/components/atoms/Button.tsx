import React from "react";
import { darkTheme } from "../tokens";

export type ButtonVariant = "run" | "wat" | "blocks" | "reset" | "ghost" | "ai";
export type ButtonSize = "md" | "sm";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

const bgMap: Record<ButtonVariant, string> = {
  run:    darkTheme.color.gradient.run,
  wat:    darkTheme.color.gradient.wat,
  blocks: darkTheme.color.gradient.blocks,
  reset:  darkTheme.color.gradient.reset,
  ghost:  "none",
  ai:     darkTheme.color.gradient.ai,
};

export function Button({
  variant = "reset",
  size = "md",
  style,
  children,
  ...rest
}: ButtonProps) {
  const isSmall = size === "sm";
  return (
    <button
      style={{
        padding:      isSmall ? "4px 12px" : "6px 16px",
        fontSize:     isSmall ? darkTheme.fontSize.md : darkTheme.fontSize.base,
        borderRadius: darkTheme.borderRadius.md,
        border:       "none",
        cursor:       "pointer",
        fontFamily:   "inherit",
        fontWeight:   600,
        transition:   "opacity .15s",
        background:   bgMap[variant],
        color:        "#fff",
        opacity:      rest.disabled ? 0.5 : 1,
        ...style,
      }}
      onMouseEnter={e => { if (!rest.disabled) (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
      onMouseLeave={e => { if (!rest.disabled) (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
      {...rest}
    >
      {children}
    </button>
  );
}
