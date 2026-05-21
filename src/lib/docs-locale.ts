// Single place that decides which docs locale to serve. Client-safe.
// Two separate concerns:
//  - SERVE locale: which language to render when the visitor has no explicit
//    preference. We default this to "ko" (no-cookie visitors see Korean).
//  - CONTENT-FALLBACK locale: which language to fall back to when a localized
//    file is missing. That stays "en" (DOCS_DEFAULT_LOCALE in docs-nav) —
//    English remains the source of truth.

export const DOCS_LOCALES = ["en", "ko"] as const;
export type DocsLocale = (typeof DOCS_LOCALES)[number];

export const DOCS_INITIAL_LOCALE: DocsLocale = "ko";

export function resolveDocsLocale(raw: string | undefined | null): DocsLocale {
    return (DOCS_LOCALES as readonly string[]).includes(raw ?? "")
        ? (raw as DocsLocale)
        : DOCS_INITIAL_LOCALE;
}
