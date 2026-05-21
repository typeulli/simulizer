// /docs → I. Overview (markdown-driven). The former auto-generated block
// catalog moved to /docs/reference (see components/docs/BlockReference).

import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { loadDoc } from "@/lib/docs";
import { resolveDocsLocale } from "@/lib/docs-locale";
import { DocsArticle } from "@/components/docs/DocsArticle";

export default async function DocsOverviewPage() {
    const locale = resolveDocsLocale((await cookies()).get("language")?.value);
    const doc = await loadDoc("", locale);
    if (!doc) notFound();
    return <DocsArticle slug="" markdown={doc.markdown} />;
}
