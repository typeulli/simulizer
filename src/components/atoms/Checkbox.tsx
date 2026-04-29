import React from "react";
import { token } from "@/components/tokens";
import { Text } from "@/components/atoms/Text";

export interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  style?: React.CSSProperties;
}

export function Checkbox({ checked, defaultChecked, onChange, disabled, label, style }: CheckboxProps) {
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
        role="checkbox"
        aria-checked={isOn}
        tabIndex={disabled ? -1 : 0}
        onClick={toggle}
        onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } }}
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          justifyContent: "center",
          width:          16,
          height:         16,
          borderRadius:   token.radius.xs,
          border:         `1.5px solid ${isOn ? token.color.accent : token.color.borderStrong}`,
          background:     isOn ? token.color.accent : "transparent",
          transition:     `background ${token.motion.transition.fast}, border-color ${token.motion.transition.fast}`,
          flexShrink:     0,
        }}
      >
        {isOn && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke={token.color.fgOnAccent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label && (
        <Text variant="body" style={{ userSelect: "none" }}>
          {label}
        </Text>
      )}
    </label>
  );
}
