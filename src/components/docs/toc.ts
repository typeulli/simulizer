// Shared heading slug + table-of-contents extraction.
// Used by Markdown (to id headings) and DocsShell (right "On this page" rail).
// The slugify here MUST match the id assigned to rendered headings.

export interface TocItem {
    depth: 1 | 2 | 3 | 4;
    text: string;
    id: string;
}

export function slugify(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

/** Extract h2/h3 headings, ignoring those inside fenced code blocks. */
export function tocFromMarkdown(md: string): TocItem[] {
    const out: TocItem[] = [];
    let inFence = false;
    for (const raw of md.split("\n")) {
        const line = raw.trimEnd();
        if (/^\s*```/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;
        const m = /^(#{1,4})\s+(.+)$/.exec(line);
        if (!m) continue;
        const depth = m[1].length as 1 | 2 | 3 | 4;
        const text = m[2].replace(/\s*#+\s*$/, "").trim();
        out.push({ depth, text, id: slugify(text) });
    }
    return out;
}
