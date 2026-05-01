import React from "react";
import { token } from "@/components/tokens";
import { Text } from "@/components/atoms/Text";

export interface SwitchProps {
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (checked: boolean) => void;
    disabled?: boolean;
    label?: string;
    style?: React.CSSProperties;
}

export function Switch({ checked, defaultChecked, onChange, disabled, label, style }: SwitchProps) {
    const [internal, setInternal] = React.useState(defaultChecked ?? false);
    const isControlled = checked !== undefined;
    const isOn = isControlled ? checked : internal;

    const toggle = () => {
        if (disabled) return;
        if (!isControlled) setInternal(v => !v);
        onChange?.(!isOn);
    };

    return (
        <label
            style={{
                display:    "inline-flex",
                alignItems: "center",
                gap:        token.space.sp2,
                cursor:     disabled ? "not-allowed" : "pointer",
                opacity:    disabled ? 0.45 : 1,
                ...style,
            }}
        >
            <span
                role="switch"
                aria-checked={isOn}
                tabIndex={disabled ? -1 : 0}
                onClick={toggle}
                onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } }}
                style={{
                    display:        "inline-flex",
                    alignItems:     "center",
                    width:          32,
                    height:         18,
                    borderRadius:   token.radius.full,
                    padding:        "2px",
                    background:     isOn ? token.color.accent : token.color.borderStrong,
                    transition:     `background ${token.motion.transition.base}`,
                    flexShrink:     0,
                }}
            >
                <span
                    style={{
                        width:        14,
                        height:       14,
                        borderRadius: token.radius.full,
                        background:   "#ffffff",
                        transform:    isOn ? "translateX(14px)" : "translateX(0)",
                        transition:   `transform ${token.motion.transition.base}`,
                        flexShrink:   0,
                    }}
                />
            </span>
            {label && (
                <Text variant="body" style={{ userSelect: "none" }}>
                    {label}
                </Text>
            )}
        </label>
    );
}