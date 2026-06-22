// Pure search helpers for the agent's glob / grep tools. Operate on a plain
// list of {path, content} so they're trivially testable and free of workspace
// state. Kept client-side (the tools run in the browser).

export type GrepMatch = { path: string; line: number; text: string };

// Minimal glob → RegExp. Supports `**` (across `/`), `*` (within a segment),
// `?` (one non-`/` char); everything else is matched literally.
export function globToRegExp(glob: string): RegExp {
    let re = "^";
    let i = 0;
    while (i < glob.length) {
        const c = glob[i];
        if (c === "*") {
            if (glob[i + 1] === "*") {
                i += 2;
                if (glob[i] === "/") { re += "(?:.*/)?"; i += 1; } // `**/` → zero or more dirs
                else re += ".*";
            } else {
                re += "[^/]*";
                i += 1;
            }
        } else if (c === "?") {
            re += "[^/]";
            i += 1;
        } else {
            re += /[\\^$.|+()[\]{}]/.test(c) ? "\\" + c : c;
            i += 1;
        }
    }
    return new RegExp(re + "$");
}

export type GrepResult =
    | { ok: true; matches: GrepMatch[]; truncated: boolean }
    | { ok: false; error: string };

// Regex search over file contents, line by line. Results are capped at `limit`.
export function grepFiles(
    files: { path: string; content: string }[],
    pattern: string,
    opts?: { ignoreCase?: boolean; limit?: number },
): GrepResult {
    let re: RegExp;
    try {
        re = new RegExp(pattern, opts?.ignoreCase ? "i" : "");
    } catch {
        return { ok: false, error: `잘못된 정규식: ${pattern}` };
    }
    const limit = opts?.limit ?? 100;
    const matches: GrepMatch[] = [];
    let truncated = false;
    outer: for (const f of files) {
        const lines = f.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (!re.test(lines[i])) continue;
            if (matches.length >= limit) { truncated = true; break outer; }
            matches.push({ path: f.path, line: i + 1, text: lines[i] });
        }
    }
    return { ok: true, matches, truncated };
}
