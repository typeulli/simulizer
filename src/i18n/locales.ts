export const locales = ["en", "ko"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ko";

/** Cookie that persists the user's chosen UI language (no URL routing). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
    return value === "en" || value === "ko";
}
