import React, { useEffect, useMemo, useRef, useState } from "react";
import { token } from "@/components/tokens";

export interface CommandItem {
    id: string;
    label: string;
    hint?: string;
    disabled?: boolean;
    run: () => void;
}

export interface CommandBarProps {
    /** Openable files (folders excluded). */
    files: { path: string }[];
    onOpenFile: (path: string) => void;
    /** Commands shown in "$" command mode. */
    commands: CommandItem[];
    placeholder?: string;
    width?: number;
}

type Row =
    | { kind: "file"; path: string; label: string; hint: string }
    | { kind: "command"; item: CommandItem };

/** Substring match, falling back to a subsequence ("fzf"-style) match. */
function fuzzyMatch(text: string, term: string): boolean {
    if (!term) return true;
    const t = text.toLowerCase();
    const q = term.toLowerCase();
    if (t.includes(q)) return true;
    let qi = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
        if (t[i] === q[qi]) qi++;
    }
    return qi === q.length;
}

/**
 * Top command bar: fuzzy-search files and open them, or type "$" to switch to
 * command mode and run actions (e.g. Build / Run). Keyboard: ↑/↓ to move,
 * Enter to select, Esc to clear.
 */
export function CommandBar({
    files,
    onOpenFile,
    commands,
    placeholder = '파일 검색…   ( "$" 로 명령 )',
    width = 360,
}: CommandBarProps) {
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const isCommand = q.startsWith("$");

    // Global Ctrl/Cmd+K focuses the bar. Capture phase + preventDefault steals
    // it before the browser (omnibox search) or Monaco (chord leader) react,
    // even when the editor has focus.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K")) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(true);
                inputRef.current?.focus();
                inputRef.current?.select();
            }
        };
        window.addEventListener("keydown", onKey, { capture: true });
        return () => window.removeEventListener("keydown", onKey, { capture: true });
    }, []);

    const rows = useMemo<Row[]>(() => {
        if (isCommand) {
            const term = q.slice(1).trim();
            return commands
                .filter(c => fuzzyMatch(c.label, term))
                .map(item => ({ kind: "command", item }));
        }
        const term = q.trim();
        return files
            .filter(f => fuzzyMatch(f.path, term))
            .slice(0, 50)
            // Show the full relative path (directories + filename + extension).
            .map(f => ({ kind: "file", path: f.path, label: f.path, hint: "" }));
    }, [q, isCommand, files, commands]);

    const clampedHi = rows.length ? Math.min(hi, rows.length - 1) : 0;

    const select = (row: Row | undefined) => {
        if (!row) return;
        if (row.kind === "file") {
            onOpenFile(row.path);
        } else {
            if (row.item.disabled) return;
            row.item.run();
        }
        setQ("");
        setOpen(false);
        inputRef.current?.blur();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHi(h => Math.min(h + 1, rows.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi(h => Math.max(h - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            select(rows[clampedHi]);
        } else if (e.key === "Escape") {
            e.preventDefault();
            setQ("");
            setOpen(false);
            inputRef.current?.blur();
        }
    };

    return (
        <div style={{ position: "relative", width, maxWidth: "100%" }}>
            <input
                ref={inputRef}
                value={q}
                onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                spellCheck={false}
                style={{ width: "100%", height: 30, padding: "0 10px", fontSize: token.font.size.fs12, fontFamily: token.font.family.mono, color: token.color.fg, background: token.color.bgSubtle, border: `1px solid ${isCommand ? token.color.accent : token.color.border}`, borderRadius: token.radius.md, outline: "none" }}
            />
            {open && rows.length > 0 && (
                <div
                    onMouseDown={e => e.preventDefault()}  // keep the input focused when clicking a row
                    style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60, maxHeight: 320, overflowY: "auto", padding: 4, background: token.color.bgRaised, border: `1px solid ${token.color.border}`, borderRadius: token.radius.sm, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", gap: 2 }}
                >
                    {rows.map((row, i) => {
                        const active = i === clampedHi;
                        const disabled = row.kind === "command" && !!row.item.disabled;
                        const label = row.kind === "file" ? row.label : row.item.label;
                        const hint = row.kind === "file" ? row.hint : row.item.hint;
                        return (
                            <button
                                key={row.kind === "file" ? `f:${row.path}` : `c:${row.item.id}`}
                                onMouseEnter={() => setHi(i)}
                                onClick={() => select(row)}
                                disabled={disabled}
                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "none", borderRadius: token.radius.sm, background: active ? token.color.surfaceHover : "transparent", color: disabled ? token.color.fgSubtle : token.color.fg, cursor: disabled ? "default" : "pointer", textAlign: "left", opacity: disabled ? 0.5 : 1, fontFamily: token.font.family.mono, fontSize: token.font.size.fs12 }}
                            >
                                {row.kind === "command" && <span style={{ color: token.color.accent, fontWeight: 700 }}>$</span>}
                                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                                {hint && <span style={{ color: token.color.fgSubtle, fontSize: token.font.size.fs10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "50%" }}>{hint}</span>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
