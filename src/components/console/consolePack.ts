import type langpack from "@/i18n/lang";

// The console panels are DOM-direct, non-React classes created lazily via the
// registry, so they can't consume the language pack through a hook. Instead the
// React `useConsolePanel` hook keeps this module-level reference in sync, and
// panels read from it (with fallbacks) at render time.
let _pack: langpack | null = null;

export function setConsolePack(p: langpack): void {
    _pack = p;
}

export function consolePack(): langpack | null {
    return _pack;
}
