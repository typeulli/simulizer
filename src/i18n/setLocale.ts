import { LOCALE_COOKIE, type Locale } from "./locales";

/** Persist the chosen UI language in a cookie (no URL routing). The caller is
 *  responsible for triggering a re-render (e.g. `location.reload()` /
 *  `router.refresh()`) so server components pick up the new locale. */
export function setLocaleCookie(locale: Locale): void {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

/** Remove the locale cookie so the server falls back to Accept-Language ("auto"). */
export function clearLocaleCookie(): void {
    document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`;
}

/** Read the persisted locale cookie on the client, or null if unset ("auto"). */
export function readLocaleCookie(): string | null {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
    return m ? m[1] : null;
}
