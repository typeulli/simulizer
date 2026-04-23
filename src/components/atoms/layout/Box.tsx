import React from "react";
import { darkTheme } from "../../tokens";

type BoxBg = "root" | "surface" | "raised" | "inset" | "modal" | "header";

export interface BoxProps extends React.HTMLAttributes<HTMLElement> {
  bg?:          BoxBg;
  p?:           keyof typeof darkTheme.spacing;
  borderBottom?: boolean;
  as?:          "div" | "aside" | "header" | "main" | "section" | "article";
  children?:    React.ReactNode;
}

const bgMap: Record<BoxBg, string> = {
  root:    darkTheme.color.bg.root,
  surface: darkTheme.color.bg.surface,
  raised:  darkTheme.color.bg.raised,
  inset:   darkTheme.color.bg.inset,
  modal:   darkTheme.color.bg.modal,
  header:  darkTheme.color.gradient.header,
};

export function Box({
  bg,
  p,
  borderBottom,
  as: As = "div",
  style,
  children,
  ...rest
}: BoxProps) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <As
      style={{
        background:   bg ? bgMap[bg] : undefined,
        padding:      p  ? darkTheme.spacing[p] : undefined,
        borderBottom: borderBottom ? `1px solid ${darkTheme.color.border.default}` : undefined,
        ...style,
      }}
      {...(rest as any)}
    >
      {children}
    </As>
  );
}
