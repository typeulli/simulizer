import React from "react";
import { token } from "@/components/tokens";
import { Text } from "@/components/atoms/Text";

export interface RadioProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  style?: React.CSSProperties;
}

export function Radio({ checked, defaultChecked, onChange, disabled, label, style }: RadioProps) {
  const [internal, setInternal] = React.useState(defaultChecked ?? false);
  const isControlled = checked !== undefined;
  const isOn = isControlled ? checked : internal;

  const select = () => {
    if (disabled || isOn) return;
    if (!isControlled) setInternal(true);
    onChange?.(true);
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
        role="radio"
        aria-checked={isOn}
        tabIndex={disabled ? -1 : 0}
        onClick={select}
        onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); select(); } }}
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          justifyContent: "center",
          width:          16,
          height:         16,
          borderRadius:   token.radius.full,
          border:         `1.5px solid ${isOn ? token.color.accent : token.color.borderStrong}`,
          background:     "transparent",
          transition:     `border-color ${token.motion.transition.fast}`,
          flexShrink:     0,
        }}
      >
        {isOn && (
          <span
            style={{
              width:        8,
              height:       8,
              borderRadius: token.radius.full,
              background:   token.color.accent,
            }}
          />
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
