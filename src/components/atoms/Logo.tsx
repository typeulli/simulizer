import React from "react";
import { token } from "@/components/tokens";

interface LogoProps {
    size?: number;
    style?: React.CSSProperties;
    accentColor?: string;
    strokeColor?: string;
}

export const Logo: React.FC<LogoProps> = ({
    size = 18,
    style,
    accentColor = token.color.accent,
    strokeColor = "currentColor",
}) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            style={{ flexShrink: 0, ...style }}
        >
            <rect x="3" y="3" width="8" height="8" rx="1.5" fill={accentColor} />
            <rect x="13" y="3" width="8" height="8" rx="1.5" fill="none" stroke={strokeColor} strokeWidth="1.5" />
            <rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" stroke={strokeColor} strokeWidth="1.5" />
            <rect x="13" y="13" width="8" height="8" rx="1.5" fill={accentColor} opacity="0.4" />
        </svg>
    );
};
