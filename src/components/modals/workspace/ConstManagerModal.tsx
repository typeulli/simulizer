"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/atoms/Button";
import { Inline } from "@/components/atoms/layout/Inline";
import { Text } from "@/components/atoms/Text";
import { Modal, ModalBody, ModalHeader } from "@/components/organisms/Modal";
import { token } from "@/components/tokens";
import langpack from "@/i18n/lang";
import { BUILTIN_CONSTS, type BuiltinConst, type ConstCategory } from "@/utils/blockly/locals";

interface ConstManagerModalProps {
    open: boolean;
    onClose: () => void;
    onAdd: (consts: BuiltinConst[]) => void;
    pack: langpack;
}

// fzf-style fuzzy score: subsequence match + bonuses for word-boundary and consecutive hits.
// Case-insensitive on Latin; unicode symbols (π, ℏ, ε₀) compared as-is so they still match.
function fuzzyScore(query: string, target: string): number {
    if (!query) return 0;
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    if (t === q)        return 1000;
    if (t.startsWith(q)) return 600 + Math.floor((q.length / t.length) * 100);
    const idx = t.indexOf(q);
    if (idx !== -1)     return 400 - idx;

    let score = 0, qi = 0, lastMatch = -2, consecutive = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] === q[qi]) {
            const prev = ti === 0 ? "" : t[ti - 1];
            const wordBoundary = ti === 0 || /[\s_\-./]/.test(prev);
            score += wordBoundary ? 25 : 10;
            if (lastMatch === ti - 1) { consecutive++; score += consecutive * 6; }
            else                       { consecutive = 0; }
            lastMatch = ti;
            qi++;
        }
    }
    if (qi < q.length) return 0;
    score -= Math.floor((t.length - q.length) * 0.5);
    return Math.max(score, 1);
}

function constScore(query: string, c: BuiltinConst): number {
    return Math.max(fuzzyScore(query, c.name), fuzzyScore(query, c.label));
}

export function ConstManagerModal({ open, onClose, onAdd, pack }: ConstManagerModalProps) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<ConstCategory>("math");
    const [query, setQuery] = useState("");
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setSelected(new Set());
            setActiveTab("math");
            setQuery("");
            setTimeout(() => searchInputRef.current?.focus(), 0);
        }
    }, [open]);

    const trimmedQuery = query.trim();

    const visible = useMemo(() => {
        const inTab = BUILTIN_CONSTS.filter(c => c.category === activeTab);
        if (!trimmedQuery) return inTab;
        return inTab
            .map(c => ({ c, score: constScore(trimmedQuery, c) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(x => x.c);
    }, [activeTab, trimmedQuery]);

    if (!open) return null;

    const toggle = (name: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const handleAdd = () => {
        if (selected.size === 0) return;
        const items = BUILTIN_CONSTS.filter(c => selected.has(c.name));
        onAdd(items);
    };

    const tabs: { id: ConstCategory; label: string }[] = [
        { id: "math",         label: pack.workspace.ui.const_tab_math },
        { id: "fundamental",  label: pack.workspace.ui.const_tab_fundamental },
        { id: "experimental", label: pack.workspace.ui.const_tab_experimental },
    ];

    const tabBadge = (cat: ConstCategory): string => {
        if (trimmedQuery) {
            const n = BUILTIN_CONSTS.filter(c => c.category === cat && constScore(trimmedQuery, c) > 0).length;
            return n > 0 ? ` (${n})` : "";
        }
        const n = BUILTIN_CONSTS.filter(c => c.category === cat && selected.has(c.name)).length;
        return n > 0 ? ` (${n})` : "";
    };

    const inputStyle: React.CSSProperties = {
        padding: "6px 10px",
        borderRadius: token.radius.sm,
        border: `1px solid ${token.color.borderStrong}`,
        background: token.color.bgRaised,
        color: token.color.fg,
        fontFamily: "inherit",
        fontSize: token.font.size.fs14,
        outline: "none",
        width: "100%",
    };

    return (
        <Modal onClose={onClose} width="min(520px,95vw)">
            <ModalHeader onClose={onClose}>
                <Text variant="label" tone="accent">{pack.workspace.ui.const_mgr_title}</Text>
            </ModalHeader>

            <ModalBody>
                <Text variant="body" tone="muted" style={{ marginBottom: 10, display: "block" }}>
                    {pack.workspace.ui.const_select_hint}
                </Text>

                <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={pack.workspace.ui.const_search_placeholder}
                    style={{ ...inputStyle, marginBottom: 10 }}
                />

                <Inline gap="sp1" style={{ marginBottom: 10 }}>
                    {tabs.map(t => {
                        const isActive = t.id === activeTab;
                        return (
                            <Button
                                key={t.id}
                                variant="secondary"
                                size="sm"
                                onClick={() => setActiveTab(t.id)}
                                style={{ background: isActive ? token.color.border : "none" }}
                            >
                                {t.label}{tabBadge(t.id)}
                            </Button>
                        );
                    })}
                </Inline>

                <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    marginBottom: 12,
                    maxHeight: 360,
                    overflowY: "auto",
                    paddingRight: 4,
                }}>
                    {visible.length === 0 && (
                        <Text variant="body" tone="muted" style={{ textAlign: "center", padding: "16px 0" }}>
                            {pack.workspace.ui.const_no_results}
                        </Text>
                    )}
                    {visible.map(c => {
                        const isSelected = selected.has(c.name);
                        return (
                            <label
                                key={c.name}
                                style={{
                                    background: isSelected ? token.color.accentSoft : token.color.bgSubtle,
                                    border: `1px solid ${isSelected ? token.color.accent : token.color.borderStrong}`,
                                    borderRadius: token.radius.md,
                                    padding: "8px 12px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    cursor: "pointer",
                                    userSelect: "none",
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggle(c.name)}
                                />
                                <div style={{ flex: 1, fontSize: token.font.size.fs12 }}>
                                    <span style={{ color: token.color.accent, fontWeight: 700 }}>{c.name}</span>
                                    <span style={{ color: token.color.fgMuted }}> — {c.label}</span>
                                </div>
                                <span style={{
                                    color: token.color.info,
                                    fontSize: token.font.size.fs11,
                                    fontFamily: "var(--font-mono)",
                                }}>
                                    {c.value}
                                </span>
                            </label>
                        );
                    })}
                </div>

                <Button
                    variant="run"
                    style={{ width: "100%" }}
                    onClick={handleAdd}
                    disabled={selected.size === 0}
                >
                    {pack.workspace.ui.add_button}{selected.size > 0 ? ` (${selected.size})` : ""}
                </Button>
            </ModalBody>
        </Modal>
    );
}
