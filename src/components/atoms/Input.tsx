import React from "react";
import { token } from "@/components/tokens";

export type InputSize = "sm" | "md" | "lg";

const heightMap: Record<InputSize, string> = {
    sm: token.height.sm,
    md: token.height.md,
    lg: token.height.lg,
};

const fontSizeMap: Record<InputSize, string> = {
    sm: token.font.size.fs12,
    md: token.font.size.fs13,
    lg: token.font.size.fs14,
};

const paddingMap: Record<InputSize, string> = {
    sm: `0 ${token.space.sp2}`,
    md: `0 ${token.space.sp3}`,
    lg: `0 ${token.space.sp4}`,
};

const baseInputStyle = (size: InputSize, invalid?: boolean): React.CSSProperties => ({
    width:           "100%",
    height:          heightMap[size],
    padding:         paddingMap[size],
    fontSize:        fontSizeMap[size],
    fontFamily:      token.font.family.sans,
    fontWeight:      token.font.weight.regular,
    lineHeight:      token.font.lineHeight.base,
    color:           token.color.fg,
    background:      token.color.surface,
    border:          `1px solid ${invalid ? token.color.dangerBorder : token.color.border}`,
    borderRadius:    token.radius.md,
    outline:         "none",
    transition:      `border-color ${token.motion.transition.fast}, box-shadow ${token.motion.transition.fast}`,
    boxSizing:       "border-box",
});

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
    size?: InputSize;
    invalid?: boolean;
}

export function Input({ size = "md", invalid, style, onFocus, onBlur, ...rest }: InputProps) {
    return (
        <input
            style={{ ...baseInputStyle(size, invalid), ...style }}
            onFocus={e => {
                e.currentTarget.style.borderColor = invalid ? token.color.dangerBorder : token.color.borderFocus;
                e.currentTarget.style.boxShadow = invalid
                    ? `0 0 0 3px color-mix(in oklch, ${token.color.danger} 18%, transparent)`
                    : token.shadow.focus;
                onFocus?.(e);
            }}
            onBlur={e => {
                e.currentTarget.style.borderColor = invalid ? token.color.dangerBorder : token.color.border;
                e.currentTarget.style.boxShadow = "none";
                onBlur?.(e);
            }}
            {...rest}
        />
    );
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    size?: InputSize;
    invalid?: boolean;
}

export function Textarea({ size = "md", invalid, style, onFocus, onBlur, ...rest }: TextareaProps) {
    return (
        <textarea
            style={{
                ...baseInputStyle(size, invalid),
                height:     "auto",
                minHeight:  "100px",
                padding:    `${token.space.sp2} ${size === "sm" ? token.space.sp2 : size === "lg" ? token.space.sp4 : token.space.sp3}`,
                resize:     "vertical",
                ...style,
            }}
            onFocus={e => {
                e.currentTarget.style.borderColor = invalid ? token.color.dangerBorder : token.color.borderFocus;
                e.currentTarget.style.boxShadow = invalid
                    ? `0 0 0 3px color-mix(in oklch, ${token.color.danger} 18%, transparent)`
                    : token.shadow.focus;
                onFocus?.(e);
            }}
            onBlur={e => {
                e.currentTarget.style.borderColor = invalid ? token.color.dangerBorder : token.color.border;
                e.currentTarget.style.boxShadow = "none";
                onBlur?.(e);
            }}
            {...rest}
        />
    );
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
    size?: InputSize;
    invalid?: boolean;
}

export function Select({ size = "md", invalid, style, onFocus, onBlur, ...rest }: SelectProps) {
    return (
        <select
            style={{
                ...baseInputStyle(size, invalid),
                cursor:      "pointer",
                appearance:  "none",
                ...style,
            }}
            onFocus={e => {
                e.currentTarget.style.borderColor = token.color.borderFocus;
                e.currentTarget.style.boxShadow = token.shadow.focus;
                onFocus?.(e);
            }}
            onBlur={e => {
                e.currentTarget.style.borderColor = invalid ? token.color.dangerBorder : token.color.border;
                e.currentTarget.style.boxShadow = "none";
                onBlur?.(e);
            }}
            {...rest}
        />
    );
}

export interface InputGroupProps {
    icon?: React.ReactNode;
    iconSide?: "left" | "right";
    children?: React.ReactNode;
    style?: React.CSSProperties;
}

export function InputGroup({ icon, iconSide = "left", children, style }: InputGroupProps) {
    return (
        <div
            style={{
                position: "relative",
                display:  "flex",
                width:    "100%",
                ...style,
            }}
        >
            {icon && (
                <span
                    style={{
                        position:       "absolute",
                        top:            "50%",
                        transform:      "translateY(-50%)",
                        ...(iconSide === "left" ? { left: token.space.sp2 } : { right: token.space.sp2 }),
                        display:        "flex",
                        alignItems:     "center",
                        justifyContent: "center",
                        color:          token.color.fgMuted,
                        pointerEvents:  "none",
                        zIndex:         1,
                    }}
                >
                    {icon}
                </span>
            )}
            <div
                style={{
                    width:      "100%",
                    ...(icon && iconSide === "left"  ? { paddingLeft:  token.space.sp7 } : {}),
                    ...(icon && iconSide === "right" ? { paddingRight: token.space.sp7 } : {}),
                }}
            >
                {children}
            </div>
        </div>
    );
}
