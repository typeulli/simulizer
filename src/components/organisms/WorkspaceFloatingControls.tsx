"use client";

// Floating control cluster pinned to the top-right of the editor/canvas area.
// Holds the workspace's auxiliary controls (view modes, AI, settings) that used
// to live in a full-width secondary toolbar — demoting them here removes one
// header layer. The parent must be `position: relative`/`absolute`-anchoring.

import React from "react";
import { token } from "@/components/tokens";

export interface WorkspaceFloatingControlsProps {
    children: React.ReactNode;
    top?: number;
    right?: number;
}

export const WorkspaceFloatingControls: React.FC<WorkspaceFloatingControlsProps> = ({ children, top = 10, right = 16 }) => (
    <div
        style={{
            position: "absolute", top, right, zIndex: 20,
            display: "flex", alignItems: "center", gap: 3,
            padding: 4,
            background: token.color.bgRaised,
            border: `1px solid ${token.color.border}`,
            borderRadius: token.radius.md,
            boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
        }}
    >
        {children}
    </div>
);
