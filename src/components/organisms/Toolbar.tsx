import React from "react";
import { token } from "@/components/tokens";
import { Inline } from "@/components/atoms/layout/Inline";
import { Divider } from "@/components/atoms/Divider";

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export function Toolbar({ style, children, ...rest }: ToolbarProps) {
  return (
    <Inline
      gap="sp15"
      style={{
        padding:      `${token.space.sp1} ${token.space.sp2}`,
        borderBottom: `1px solid ${token.color.border}`,
        background:   token.color.surface,
        flexShrink:   0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Inline>
  );
}

export function ToolbarSeparator() {
  return <Divider orientation="vertical" style={{ height: 16, alignSelf: "center" }} />;
}

export interface TopbarProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

export function Topbar({ style, children, ...rest }: TopbarProps) {
  return (
    <header
      style={{
        display:        "flex",
        alignItems:     "center",
        height:         48,
        padding:        `0 ${token.space.sp4}`,
        borderBottom:   `1px solid ${token.color.border}`,
        background:     token.color.surface,
        flexShrink:     0,
        gap:            token.space.sp2,
        ...style,
      }}
      {...rest}
    >
      {children}
    </header>
  );
}