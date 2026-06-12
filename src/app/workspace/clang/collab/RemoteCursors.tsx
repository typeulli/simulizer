"use client";
// y-monaco renders remote selections with the classes
//   .yRemoteSelection / .yRemoteSelection-<clientID>
//   .yRemoteSelectionHead / .yRemoteSelectionHead-<clientID>
// but injects NO colors — each participant's color must be supplied as CSS keyed
// on their awareness client id. This component emits one <style> block with a
// tinted selection background + a colored caret carrying a name label for every
// remote participant.

import React from "react";
import type { CollabParticipant } from "./useClangCollab";

// Escape a string for safe use inside a CSS `content: "..."` value.
function cssContent(name: string): string {
    return name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function RemoteCursorStyles({ participants }: { participants: CollabParticipant[] }) {
    const remote = participants.filter(p => !p.self);
    if (remote.length === 0) return null;

    const rules = remote.map(p => {
        const id = p.clientId;
        return `
.yRemoteSelection-${id} { background-color: ${p.colorLight}; }
.yRemoteSelectionHead-${id} {
    position: absolute;
    border-left: 2px solid ${p.color};
    border-top: 2px solid ${p.color};
    border-bottom: 2px solid ${p.color};
    height: 100%;
    box-sizing: border-box;
}
.yRemoteSelectionHead-${id}::after {
    position: absolute;
    content: "${cssContent(p.name)}";
    transform: translateY(-100%);
    left: -2px;
    background-color: ${p.color};
    color: #fff;
    padding: 0 4px;
    border-radius: 3px 3px 3px 0;
    font-size: 10px;
    font-family: sans-serif;
    line-height: 1.4;
    white-space: nowrap;
    z-index: 10;
}`;
    }).join("\n");

    // A static element key so React reuses the same <style> node across renders.
    return <style key="yjs-remote-cursors" dangerouslySetInnerHTML={{ __html: rules }} />;
}
