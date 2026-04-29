import React from "react";
import { token } from "@/components/tokens";
import { Text } from "@/components/atoms/Text";

export interface TabItem {
  key: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeKey?: string;
  defaultActiveKey?: string;
  onChange?: (key: string) => void;
  style?: React.CSSProperties;
}

export function Tabs({ items, activeKey, defaultActiveKey, onChange, style }: TabsProps) {
  const [internal, setInternal] = React.useState(defaultActiveKey ?? items[0]?.key ?? "");
  const isControlled = activeKey !== undefined;
  const active = isControlled ? activeKey : internal;

  const select = (key: string) => {
    if (!isControlled) setInternal(key);
    onChange?.(key);
  };

  return (
    <div
      role="tablist"
      style={{
        display:      "flex",
        alignItems:   "flex-end",
        gap:          token.space.sp1,
        borderBottom: `1px solid ${token.color.border}`,
        ...style,
      }}
    >
      {items.map(item => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={isActive}
            disabled={item.disabled}
            onClick={() => !item.disabled && select(item.key)}
            style={{
              display:       "inline-flex",
              alignItems:    "center",
              gap:           token.space.sp15,
              height:        36,
              padding:       `0 ${token.space.sp2}`,
              background:    "transparent",
              border:        "none",
              borderBottom:  `2px solid ${isActive ? token.color.accent : "transparent"}`,
              borderRadius:  `${token.radius.sm} ${token.radius.sm} 0 0`,
              cursor:        item.disabled ? "not-allowed" : "pointer",
              opacity:       item.disabled ? 0.45 : 1,
              marginBottom:  -1,
              transition:    `border-color ${token.motion.transition.fast}, color ${token.motion.transition.fast}`,
              flexShrink:    0,
            }}
          >
            <Text
              variant="body"
              tone={isActive ? "accent" : "muted"}
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