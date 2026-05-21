// System-level docs examples (S1).
// Examples are repo-bundled JSON files in src/contents/docs/assets/<id>.json.
// They are public, unauthenticated, and version-controlled with the code.
//
// This route serves one example by id. IDs are restricted to a strict slug
// shape to prevent any path traversal.

import { promises as fs } from "fs";
import path from "path";

const EXAMPLES_ROOT = path.join(
    process.cwd(),
    "src",
    "contents",
    "docs",
    "assets",
);

const VALID_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    if (!VALID_ID.test(id)) {
        return new Response("Invalid example id", { status: 400 });
    }
    const file = path.join(EXAMPLES_ROOT, `${id}.json`);
    if (!file.startsWith(EXAMPLES_ROOT + path.sep)) {
        return new Response("Invalid example id", { status: 400 });
    }
    try {
        const content = await fs.readFile(file, "utf8");
        return new Response(content, {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
        });
    } catch {
        return new Response("Example not found", { status: 404 });
    }
}
