// Line-hash addressing for the agent's edit_file tool.
//
// Each line is identified by a short hash derived from its 1-based line number
// AND its text. The model reads a file as {hash, content}[] (read_lines), then
// edits by referencing those hashes (edit_file) — far more precise than
// string-matching. Because the hash folds in the line number, identical text on
// different lines stays distinguishable; and because it folds in the content,
// any drift (the file changed since the read) makes the hash miss, so a stale
// edit is rejected rather than misapplied.
//
// All hashing happens client-side (both read_lines and edit_file run in the
// browser), so the two sides always agree — the server never hashes.

export type HashedLine = { line: number; hash: string; content: string };

export type LineEditOp = "replace" | "delete" | "insert_after" | "insert_before";

export type LineEdit = {
    /** Hash of the existing line this edit targets (or anchors to, for inserts). */
    hash: string;
    /** Defaults to "replace". */
    op?: LineEditOp;
    /** New line text — required for replace / insert, ignored for delete. */
    content?: string;
};

export type ApplyEditsResult =
    | { ok: true; content: string; lines: HashedLine[] }
    | { ok: false; error: string };

// FNV-1a (32-bit) of `${lineNumber}\0${content}`, base36-padded.
export function hashLine(lineNumber: number, content: string): string {
    const s = `${lineNumber}\0${content}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36).padStart(7, "0");
}

export function toHashedLines(content: string): HashedLine[] {
    return content.split("\n").map((c, i) => ({ line: i + 1, hash: hashLine(i + 1, c), content: c }));
}

// Read a (1-based, inclusive) line range as {line, hash, content}[]. Omitting
// both bounds returns the whole file. `total` lets the model see the file size
// so it can widen the range if needed. Backs both read_file (whole) and
// read_lines (range).
export function readLineRange(content: string, start?: number, end?: number): { total: number; lines: HashedLine[] } {
    const all = toHashedLines(content);
    const total = all.length;
    if (start == null && end == null) return { total, lines: all };
    const s = Math.max(1, Math.floor(start ?? 1));
    const e = Math.min(total, Math.floor(end ?? total));
    return { total, lines: s > e ? [] : all.slice(s - 1, e) };
}

// Apply hash-addressed edits to `original`. Every hash resolves against the
// ORIGINAL line positions (so multiple edits in one call don't shift each other),
// then the result is reassembled in order: leading inserts, the body line
// (replaced / kept / dropped), trailing inserts. An unknown or colliding hash
// aborts the whole edit so nothing is half-applied.
export function applyHashEdits(original: string, edits: LineEdit[]): ApplyEditsResult {
    const lines = original.split("\n");
    const indexByHash = new Map<string, number>();
    const collided = new Set<string>();
    lines.forEach((c, i) => {
        const h = hashLine(i + 1, c);
        if (indexByHash.has(h)) collided.add(h);
        else indexByHash.set(h, i);
    });

    const before: string[][] = lines.map(() => []);
    const after: string[][] = lines.map(() => []);
    const body: (string | null)[] = lines.slice();

    for (const e of edits) {
        const op = e.op ?? "replace";
        if (!indexByHash.has(e.hash)) {
            return { ok: false, error: `알 수 없는 라인 해시: ${e.hash} — 파일이 바뀌었을 수 있으니 read_lines로 다시 읽으세요.` };
        }
        if (collided.has(e.hash)) {
            return { ok: false, error: `라인 해시 충돌(${e.hash})로 모호하여 적용할 수 없습니다.` };
        }
        if (op !== "delete" && e.content == null) {
            return { ok: false, error: `${op} 편집에는 content가 필요합니다 (hash ${e.hash}).` };
        }
        const idx = indexByHash.get(e.hash)!;
        switch (op) {
            case "replace": body[idx] = e.content!; break;
            case "delete": body[idx] = null; break;
            case "insert_before": before[idx].push(e.content!); break;
            case "insert_after": after[idx].push(e.content!); break;
        }
    }

    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        out.push(...before[i]);
        if (body[i] !== null) out.push(body[i]!);
        out.push(...after[i]);
    }
    const content = out.join("\n");
    return { ok: true, content, lines: toHashedLines(content) };
}
