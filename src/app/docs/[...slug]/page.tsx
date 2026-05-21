// /docs/<...> — markdown sections (Get Started, etc.) plus the special
// "reference" branch which renders the code-generated block catalog instead
// of markdown (agreed: reference is generated, not authored).

import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { loadDoc, isReferenceSlug } from "@/lib/docs";
import { resolveDocsLocale } from "@/lib/docs-locale";
import { DocsArticle } from "@/components/docs/DocsArticle";
import { BlockReference } from "@/components/docs/BlockReference";

export default async function DocsSlugPage({
    params,
}: {
    params: Promise<{ slug?: string[] }>;
}) {
    const { slug: parts } = await params;
    const slug = (parts ?? []).join("/");

    if (isReferenceSlug(slug)) {
        return <BlockReference />;
    }

    const locale = resolveDocsLocale((await cookies()).get("language")?.value);
    const doc = await loadDoc(slug, locale);
    if (!doc) notFound();
    return <DocsArticle slug={slug} markdown={doc.markdown} />;
}
