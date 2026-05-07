"use client";

import React, { useState } from "react";
import { token } from "@/components/tokens";
import { Logo } from "@/components/atoms/Logo";
import { UserMenuDropdown } from "@/components/organisms/UserMenuDropdown";

export const TopbarBrand: React.FC = () => {
    const [open, setOpen] = useState(false);

    return (
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <div onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <Logo size={18} />
                <span style={{ fontWeight: 600, fontSize: token.font.size.fs14, letterSpacing: "-0.01em" }}>Simulizer</span>
            </div>

            {open && <UserMenuDropdown onClose={() => setOpen(false)} align="left" />}
        </div>
    );
};
