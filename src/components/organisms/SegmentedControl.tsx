import React from "react";
import { token } from "@/components/tokens";
import { Text } from "@/components/atoms/Text";

export interface SegmentItem {
  key: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  items: SegmentItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (key: string) => void;
  style?: React.CSSProperties;
}

export function SegmentedControl({ items, value, defaultValue, onChange, style }: SegmentedControlProps) {
  const [internal, setInternal] = React.useState(defaultValue ?? items[0]?.key ?? "");
  const isControlled = value !== undefined;
  const active = isControlled ? value : internal;

  const select = (key: string) => {
    if (!isControlled) setInternal(key);
    onChange?.(key);
  };

  return (
    <div
      role="group"
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          token.space.spPx,
        padding:      token.space.spPx,
        background:   token.color.bgSubtle,
        border:       `1px solid ${token.color.border}`,
        borderRadius: token.radius.lg,
        ...style,
      }}
    >
      {items.map(item => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            role="radio"
            aria-checked={isActive}
            disabled={item.disabled}
            onClick={() => !item.disabled && select(item.key)}
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              justifyContent: "center",
              gap:          token.space.sp15,
              height:       28,
              padding:      `0 ${token.space.sp3}`,
              background:   isActive ? token.color.surface : "transparent",
              border:       isActive ? `1px solid ${token.color.border}` : "1px solid transparent",
              borderRadius: token.radius.md,
              cursor:       item.disabled ? "not-allowed" : "pointer",
              opacity:      item.disabled ? 0.45 : 1,
              boxShadow:    isActive ? token.shadow.xs : undefined,
              transition:   `background ${token.motion.transition.fast}, box-shadow ${token.motion.transition.fast}`,
              flexShrink:   0,
            }}
          >
            <Text
              variant="caption"
              tone={isActive ? "default" : "muted"}
              style={{ fontWeight: isActive ? token.font.weight.semibold : token.font.weight.regular }}
            >
              {item.label}
            </Text>
          </button>
        );
      })}
    </div>
  );
}
