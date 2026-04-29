import React from "react";
import { token } from "@/components/tokens";

export type AvatarSize = "sm" | "md" | "lg";

const sizeMap: Record<AvatarSize, number> = {
  sm: 24,
  md: 32,
  lg: 40,
};

const fontSizeMap: Record<AvatarSize, string> = {
  sm: token.font.size.fs11,
  md: token.font.size.fs13,
  lg: token.font.size.fs16,
};

export interface AvatarProps {
  size?: AvatarSize;
  src?: string;
  alt?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Avatar({ size = "md", src, alt, children, style }: AvatarProps) {
  const px = sizeMap[size];

  return (
    <span
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        justifyContent: "center",
        width:          px,
        height:         px,
        borderRadius:   token.radius.full,
        overflow:       "hidden",
        background:     token.color.accentSoft,
        color:          token.color.accent,
        fontSize:       fontSizeMap[size],
        fontWeight:     token.font.weight.semibold,
        flexShrink:     0,
        ...style,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        children
      )}
    </span>
  );
}