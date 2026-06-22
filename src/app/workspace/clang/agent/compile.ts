// Parse emcc/clang compiler stderr into structured diagnostics for the
// check_syntax tool (model + UI). Compiler output lines look like:
//   main.cpp:12:5: error: use of undeclared identifier 'x'
//   /tmp/abc/main.cpp:12:5: warning: ...
//   2 errors generated.

export type CompileSeverity = "fatal" | "error" | "warning";
export type CompileDiag = {
    /** Workspace path if the compiler's path resolved to a known file, else the raw token (may be null). */
    file: string | null;
    line: number | null;
    column: number | null;
    severity: CompileSeverity;
    message: string;
};

const LINE_RE = /^(.*?):(\d+):(\d+):\s+(fatal error|error|warning|note):\s+(.*)$/;

export function parseCompilerErrors(stderr: string, knownPaths: string[] = []): CompileDiag[] {
    const out: CompileDiag[] = [];
    for (const raw of stderr.split("\n")) {
        const m = LINE_RE.exec(raw.trim());
        if (!m) continue;
        const kind = m[4];
        if (kind === "note") continue; // follow-up context — kept in the raw output only
        const severity: CompileSeverity = kind === "fatal error" ? "fatal" : (kind as CompileSeverity);
        out.push({
            file: resolvePath(m[1], knownPaths),
            line: Number(m[2]),
            column: Number(m[3]),
            severity,
            message: m[5],
        });
    }
    return out;
}

// Map a compiler-reported path (often absolute / temp-dir) back to a workspace
// file by basename so the panel can offer click-to-scroll. Falls back to the
// raw token (revealing a non-workspace path is a harmless no-op downstream).
function resolvePath(p: string, known: string[]): string | null {
    if (!p) return null;
    if (known.includes(p)) return p;
    const base = p.split(/[\\/]/).pop() ?? p;
    const hit = known.find(k => (k.split("/").pop() ?? k) === base);
    return hit ?? p;
}
