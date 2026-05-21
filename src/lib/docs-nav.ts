// Client-safe docs navigation manifest (no node APIs).
// The fs-based loader (src/lib/docs.ts) re-exports from here.
//
// Titles/labels are localized; "en" is the source of truth and the fallback
// for any locale that is missing a string (mirrors the content fallback).

export const DOCS_DEFAULT_LOCALE = "ko";

type Localized = Record<string, string>;

function pick(map: Localized, locale: string): string {
    return map[locale] ?? map[DOCS_DEFAULT_LOCALE];
}

export interface DocNavItem {
    /** url slug, relative to /docs (e.g. "get-started/your-first-code") */
    slug: string;
    title: Localized;
    /** "reference" = code-generated catalog, not markdown */
    kind?: "markdown" | "reference";
}

export interface DocNavGroup {
    title: Localized;
    items: DocNavItem[];
}

// Structure agreed in discussion (results-first, Stripe/Diátaxis hybrid).
// Audience: code non-experts in general — high-schoolers, non-CS undergrads,
// hobbyists. Advanced/deep-physics content is segregated into "advanced".
// Nav labels stay in English regardless of locale (user decision).
// Use a small helper so we don't keep two identical en/ko strings inline.
const eng = (s: string): Localized => ({ en: s, ko: s });

export const DOCS_NAV: DocNavGroup[] = [
    {
        title: eng("Introduction"),
        items: [{ slug: "", title: eng("About Simulizer") }],
    },
    {
        title: eng("Get started"),
        items: [
            { slug: "start/what-you-can-make", title: eng("What you can make") },
            { slug: "start/sign-in", title: eng("Sign in") },
            { slug: "start/first-result", title: eng("Your first result") },
        ],
    },
    {
        title: eng("Make"),
        items: [
            { slug: "make/function-graph", title: eng("Function graph") },
            { slug: "make/random-samples", title: eng("Random samples") },
            { slug: "make/monte-carlo", title: eng("Monte Carlo") },
            { slug: "make/compound-interest", title: eng("Compound interest") },
            { slug: "make/random-walk", title: eng("Random walk") },
            { slug: "make/population-growth", title: eng("Population growth") },
            { slug: "make/linear-system", title: eng("Linear system") },
            { slug: "make/pendulum", title: eng("Pendulum") },
            { slug: "make/projectile", title: eng("Projectile motion") },
            { slug: "make/diffusion-1d", title: eng("1D diffusion") },
        ],
    },
    {
        title: eng("Tools"),
        items: [
            { slug: "tools/math-from-photo", title: eng("Math from a photo") },
            { slug: "tools/ask-ai", title: eng("Ask the AI") },
            { slug: "tools/share-and-duplicate", title: eng("Share & duplicate") },
            { slug: "tools/result-panels", title: eng("Result panels") },
        ],
    },
    {
        title: eng("Concepts"),
        items: [
            { slug: "concepts/how-it-runs", title: eng("How it runs") },
            { slug: "concepts/numbers", title: eng("Integers & reals") },
            { slug: "concepts/repeating", title: eng("Doing things many times") },
            { slug: "concepts/collections", title: eng("Arrays, tensors, vectors") },
            { slug: "concepts/verification", title: eng("Verifying results") },
            { slug: "concepts/ai-boundary", title: eng("What AI can and can't do") },
        ],
    },
    {
        title: eng("Advanced"),
        items: [
            { slug: "advanced/boundary-2d", title: eng("2D boundary conditions") },
            { slug: "advanced/boundary-3d", title: eng("3D boundary conditions") },
            { slug: "advanced/tracker", title: eng("Tracker") },
            { slug: "advanced/custom-functions", title: eng("Custom functions") },
            { slug: "advanced/inspecting-generated-code", title: eng("Inspecting generated code") },
            { slug: "advanced/native-build", title: eng("Native build") },
            { slug: "advanced/tensor-and-matrix", title: eng("Tensors & matrices") },
        ],
    },
    {
        title: eng("Examples"),
        items: [{ slug: "examples", title: eng("Gallery") }],
    },
    {
        title: eng("Reference"),
        items: [{ slug: "reference", title: eng("All blocks"), kind: "reference" }],
    },
    {
        title: eng("Help"),
        items: [
            { slug: "help/faq", title: eng("FAQ") },
            { slug: "help/troubleshooting", title: eng("Troubleshooting") },
        ],
    },
];

export interface ResolvedNavItem {
    slug: string;
    title: string;
    kind?: "markdown" | "reference";
}
export interface ResolvedNavGroup {
    title: string;
    items: ResolvedNavItem[];
}

export function getDocsNav(locale: string): ResolvedNavGroup[] {
    return DOCS_NAV.map((g) => ({
        title: pick(g.title, locale),
        items: g.items.map((it) => ({
            slug: it.slug,
            title: pick(it.title, locale),
            kind: it.kind,
        })),
    }));
}

const SLUG_TITLE = new Map<string, Localized>();
for (const g of DOCS_NAV) for (const it of g.items) SLUG_TITLE.set(it.slug, it.title);

export function docTitle(slug: string, locale: string = DOCS_DEFAULT_LOCALE): string {
    const t = SLUG_TITLE.get(slug);
    return t ? pick(t, locale) : slug;
}

export function isReferenceSlug(slug: string): boolean {
    return slug === "reference";
}

// Misc UI strings used by the docs chrome.
const UI: Record<string, Localized> = {
    onThisPage: { en: "On this page", ko: "이 페이지에서" },
};
export function docsUi(key: keyof typeof UI, locale: string): string {
    return pick(UI[key], locale);
}
