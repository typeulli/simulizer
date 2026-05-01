import React from "react";
import { token } from "@/components/tokens";
import { Box, type BoxProps } from "@/components/atoms/layout/Box";
import { Text } from "@/components/atoms/Text";

export type CardVariant = "flat" | "raised" | "elevated" | "outlined" | "filled";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: CardVariant;
    radius?: keyof typeof token.radius;
    children?: React.ReactNode;
}

const variantBoxTone: Record<CardVariant, BoxProps["tone"]> = {
    flat:     undefined,
    raised:   "default",
    elevated: "raised",
    outlined: undefined,
    filled:   "subtle",
};

const shadowMap: Record<CardVariant, keyof typeof token.shadow | undefined> = {
    flat:     undefined,
    raised:   "md",
    elevated: "lg",
    outlined: undefined,
    filled:   undefined,
};

export function Card({
    variant = "raised",
    radius: radiusKey = "lg",
    style,
    children,
    ...rest
}: CardProps) {
    const showBorder = variant !== "flat";

    return (
        <Box
            tone={variantBoxTone[variant]}
            shadow={shadowMap[variant]}
            radius={radiusKey}
            border={showBorder}
            style={{ display: "flex", flexDirection: "column", overflow: "hidden", ...style }}
            {...(rest as BoxProps)}
        >
            {children}
        </Box>
    );
}

export interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {
    children?: React.ReactNode;
}

export interface CardHeaderProps extends Omit<CardSectionProps, 'title'> {
    title?: React.ReactNode;
    sub?: React.ReactNode;
    right?: React.ReactNode;
}

export function CardHeader({ title, sub, right, style, children, ...rest }: CardHeaderProps) {
    if (children) {
        return (
            <Box
                style={{ flexShrink: 0, ...style }}
                borderBottom
                p="sp4"
                {...(rest as BoxProps)}
            >
                {children}
            </Box>
        );
    }
    return (
        <Box
            style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: token.space.sp3, ...style }}
            borderBottom
            p="sp4"
            {...(rest as BoxProps)}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                {title && (
                    <Text variant="body" style={{ fontWeight: token.font.weight.semibold }}>{title}</Text>
                )}
                {sub && (
                    <Text variant="caption" tone="muted">{sub}</Text>
                )}
            </div>
            {right}
        </Box>
    );
}

export function CardBody({ style, children, ...rest }: CardSectionProps) {
    return (
        <Box style={{ flex: 1, ...style }} p="sp4" {...(rest as BoxProps)}>
            {children}
        </Box>
    );
}

export function CardFooter({ style, children, ...rest }: CardSectionProps) {
    return (
        <Box
            tone="subtle"
            style={{ flexShrink: 0, ...style }}
            p="sp4"
            {...(rest as BoxProps)}
        >
            {children}
        </Box>
    );
}