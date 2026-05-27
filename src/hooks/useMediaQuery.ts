"use client";

import { useCallback, useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 768px)";
const COMPACT_QUERY = "(max-width: 1023px)";

function subscribe(query: string) {
    return (callback: () => void) => {
        const mql = window.matchMedia(query);
        mql.addEventListener("change", callback);
        return () => mql.removeEventListener("change", callback);
    };
}

// Server and client hydration both return false (desktop) so SSR HTML and the
// hydrated client tree match. After hydration React calls getSnapshot and
// re-renders with the real viewport — accepts one frame of layout flash on
// mobile, but avoids hydration warnings.
const getServerSnapshot = () => false;

export function useMediaQuery(query: string): boolean {
    const sub = useCallback(subscribe(query), [query]);
    const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
    return useSyncExternalStore(sub, getSnapshot, getServerSnapshot);
}

export function useIsMobile(): boolean {
    return useMediaQuery(MOBILE_QUERY);
}

export function useIsCompact(): boolean {
    return useMediaQuery(COMPACT_QUERY);
}
