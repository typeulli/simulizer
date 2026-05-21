// Docs content loader (server-only: uses node fs).
//
// Agreed model (see design discussion):
//  - Content lives OUTSIDE the app-router dir:
//    src/contents/docs/markdowns/<locale>/<...>.md
//  - ko is the source of truth (default). Other locales fall back to ko when
//    the localized file is missing.
//  - The "reference" section is NOT markdown — it is code-generated from the
//    block definitions and handled separately by the route.
//  - IV. Common Use Cases / V. Example Tours are intentionally deferred.

import { promises as fs } from "fs";
import path from "path";

import { DOCS_DEFAULT_LOCALE, docTitle } from "@/lib/docs-nav";

export * from "@/lib/docs-nav";

const CONTENT_ROOT = path.join(process.cwd(), "src", "contents", "docs", "markdowns");

export interface LoadedDoc {
    slug: string;
    title: string;
    markdown: string;
    /** locale actually used after fallback */
    resolvedLocale: string;
}

/**
 * Resolve a markdown file for `slug` in `locale`, falling back to the default
 * locale when the localized file is absent. Returns null when neither exists.
 */
export async function loadDoc(
    slug: string,
    locale: string = DOCS_DEFAULT_LOCALE,
): Promise<LoadedDoc | null> {
    const rel = (slug === "" ? "overview" : slug) + ".md";
    const tryLocales =
        locale === DOCS_DEFAULT_LOCALE ? [locale] : [locale, DOCS_DEFAULT_LOCALE];

    for (const loc of tryLocales) {
        const file = path.join(CONTENT_ROOT, loc, rel);
        // Keep traversal inside the content root.
        if (!file.startsWith(CONTENT_ROOT + path.sep)) return null;
        try {
            const markdown = await fs.readFile(file, "utf8");
            return { slug, title: docTitle(slug, loc), markdown, resolvedLocale: loc };
        } catch {
            /* try next locale */
        }
    }
    return null;
}
