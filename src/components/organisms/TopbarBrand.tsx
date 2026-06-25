"use client";

import React, { useState } from "react";
import { token } from "@/components/tokens";
import { Logo } from "@/components/atoms/Logo";
import { UserMenuDropdown } from "@/components/organisms/UserMenuDropdown";
import { isDesktop } from "@/lib/file";

export interface TopbarBrandProps {
    compact?: boolean;
}

export const TopbarBrand: React.FC<TopbarBrandProps> = ({ compact = false }) => {
    const [open, setOpen] = useState(false);

    // Desktop: no account/login/dashboard navigation — the brand is just a mark.
    return (
        <div style={{ position: "relative", display: "flex", alignItems: "center", flexShrink: 0 }}>
            <div onClick={() => { if (!isDesktop) setOpen(v => !v); }} style={{ display: "flex", alignItems: "center", gap: 8, cursor: isDesktop ? "default" : "pointer" }}>
                <Logo size={18} />
                {!compact && (
                    <span style={{ fontWeight: 600, fontSize: token.font.size.fs14, letterSpacing: "-0.01em" }}>Simulizer</span>
                )}
            </div>

            {open && !isDesktop && <UserMenuDropdown onClose={() => setOpen(false)} align="left" />}
        </div>
    );
};
