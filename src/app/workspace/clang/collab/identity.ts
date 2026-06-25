// Presence identity for awareness. Logged-in users get their account name +
// picture; everyone else gets a stable-per-session anonymous name. A color is
// derived deterministically from the name so the same person keeps the same
// cursor color across reconnects within a session.

import { getMe } from "@/lib/file";

export type CollabUser = {
    /** Stable id within this client session (account id when logged in). */
    id: string;
    name: string;
    color: string;
    /** Light tint of `color`, used for selection highlights. */
    colorLight: string;
    pictureUrl: string | null;
    isAnonymous: boolean;
};

// A small, legible palette for cursor colors.
const PALETTE = [
    "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
    "#008080", "#9a6324", "#800000", "#808000", "#000075",
    "#e67e22", "#16a085", "#c0392b", "#2980b9", "#8e44ad",
];

const ANIMALS = [
    "Cat", "Fox", "Owl", "Bear", "Wolf", "Hawk", "Deer", "Seal",
    "Lynx", "Crow", "Moth", "Newt", "Ibis", "Wren", "Mole",
];

function hashString(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function colorForName(name: string): string {
    return PALETTE[hashString(name) % PALETTE.length];
}

// Build a 18%-alpha variant of a #rrggbb color for selection backgrounds.
function lighten(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return "rgba(67,99,216,0.18)";
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r}, ${g}, ${b}, 0.18)`;
}

// A non-crypto session token so two anonymous users on the same machine still
// differ. Derived from a varying string rather than Math.random so it's cheap.
function anonSuffix(): string {
    const seed = `${typeof navigator !== "undefined" ? navigator.userAgent : ""}|${typeof performance !== "undefined" ? performance.now() : 0}`;
    return (hashString(seed) % 1000).toString().padStart(3, "0");
}

/** Resolve the presence identity for this client (best-effort network call). */
export async function resolveCollabUser(): Promise<CollabUser> {
    try {
        const me = await getMe();
        const name = me.name?.trim() || me.email?.split("@")[0] || `User ${me.id}`;
        const color = colorForName(name);
        return {
            id: String(me.id),
            name,
            color,
            colorLight: lighten(color),
            pictureUrl: me.picture_url ?? null,
            isAnonymous: false,
        };
    } catch {
        const name = `${ANIMALS[hashString(anonSuffix()) % ANIMALS.length]} ${anonSuffix()}`;
        const color = colorForName(name);
        return {
            id: `anon-${anonSuffix()}`,
            name,
            color,
            colorLight: lighten(color),
            pictureUrl: null,
            isAnonymous: true,
        };
    }
}
