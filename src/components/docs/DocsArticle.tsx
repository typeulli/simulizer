"use client";

import { useMemo } from "react";

import { DocsShell } from "@/components/docs/DocsShell";
import { Markdown } from "@/components/docs/Markdown";
import { tocFromMarkdown } from "@/components/docs/toc";

export function DocsArticle({
    slug,
    markdown,
}: {
    slug: string;
    markdown: string;
}) {
    const toc = useMemo(() => tocFromMarkdown(markdown), [markdown]);
    return (
        <DocsShell activeSlug={slug} toc={toc}>
            <Markdown source={markdown} />
        </DocsShell>
    );
}
