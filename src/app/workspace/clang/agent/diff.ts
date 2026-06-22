// Minimal line-level diff (LCS) for the agent's edit/write previews.
//
// Used only by the chat UI to render what an edit_file / write_file changed —
// the diff is never sent to the model. Edits target modest files, so the
// O(n*m) LCS is fine; a size guard degrades huge overwrites to del-all/add-all.

export type DiffRowType = "ctx" | "add" | "del";
export type DiffRow = { type: DiffRowType; oldNo: number | null; newNo: number | null; text: string };
export type DiffStat = { added: number; removed: number };
export type FileDiff = { rows: DiffRow[]; stat: DiffStat };

const MAX_CELLS = 4_000_000; // ~2000×2000 lines before falling back

export function diffLines(before: string, after: string): FileDiff {
    const a = before.length ? before.split("\n") : [];
    const b = after.length ? after.split("\n") : [];

    // Fast paths: pure create / pure clear skip the DP table entirely.
    if (a.length === 0) return allRows(b, "add");
    if (b.length === 0) return allRows(a, "del");
    if (a.length * b.length > MAX_CELLS) {
        return {
            rows: [...allRows(a, "del").rows, ...allRows(b, "add").rows],
            stat: { added: b.length, removed: a.length },
        };
    }

    const n = a.length, m = b.length;
    // LCS length table, filled bottom-up.
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const rows: DiffRow[] = [];
    let added = 0, removed = 0;
    let i = 0, j = 0, oldNo = 1, newNo = 1;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            rows.push({ type: "ctx", oldNo: oldNo++, newNo: newNo++, text: a[i] }); i++; j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            rows.push({ type: "del", oldNo: oldNo++, newNo: null, text: a[i] }); i++; removed++;
        } else {
            rows.push({ type: "add", oldNo: null, newNo: newNo++, text: b[j] }); j++; added++;
        }
    }
    while (i < n) { rows.push({ type: "del", oldNo: oldNo++, newNo: null, text: a[i++] }); removed++; }
    while (j < m) { rows.push({ type: "add", oldNo: null, newNo: newNo++, text: b[j++] }); added++; }
    return { rows, stat: { added, removed } };
}

function allRows(lines: string[], type: "add" | "del"): FileDiff {
    const rows: DiffRow[] = lines.map((text, idx) => ({
        type,
        oldNo: type === "del" ? idx + 1 : null,
        newNo: type === "add" ? idx + 1 : null,
        text,
    }));
    return {
        rows,
        stat: { added: type === "add" ? lines.length : 0, removed: type === "del" ? lines.length : 0 },
    };
}
