"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { token } from "@/components/tokens";
import { Logo } from "@/components/atoms/Logo";
import { Icon } from "@/components/atoms/Icons";
import { Button } from "@/components/atoms/Button";
import { Spinner } from "@/components/atoms/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import useLanguagePack from "@/hooks/useLanguagePack";
import {
    listFiles,
    createFile,
    deleteFile,
    renameFile,
    duplicateFile,
    type FileOut,
} from "@/lib/authapi";

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("ko-KR", {
        year: "numeric", month: "short", day: "numeric",
    });
}

function Avatar({ name, picture }: { name: string; picture: string | null }) {
    if (picture) {
        return <img src={picture} alt={name} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />;
    }
    return (
        <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: token.color.gradient.title,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: token.color.fgOnAccent, fontWeight: 700, fontSize: token.font.size.fs13,
        }}>
            {name.charAt(0).toUpperCase()}
        </div>
    );
}

export default function DashboardPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const [lang, , pack] = useLanguagePack();
    const t = pack.dashboard;

    function toggleLang() {
        const next = lang === "ko" ? "en" : "ko";
        localStorage.setItem("language", next);
        window.location.reload();
    }

    const [files, setFiles] = useState<FileOut[]>([]);
    const [filesLoading, setFilesLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [menuOpen, setMenuOpen] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const renameInputRef = useRef<HTMLInputElement>(null);

    const fetchFiles = useCallback(async () => {
        try {
            const list = await listFiles();
            setFiles(list);
        } finally {
            setFilesLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && user) fetchFiles();
    }, [authLoading, user, fetchFiles]);

    useEffect(() => {
        if (renamingId !== null) renameInputRef.current?.focus();
    }, [renamingId]);

    async function handleNewFile() {
        setCreating(true);
        try {
            const existing = new Set(files.map(f => f.name));
            let name = "untitled";
            let counter = 2;
            while (existing.has(name)) {
                name = `untitled ${counter++}`;
            }
            const file = await createFile(name);
            router.push(`/workspace?file=${file.id}`);
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(id: string) {
        setMenuOpen(null);
        await deleteFile(id);
        setFiles(prev => prev.filter(f => f.id !== id));
    }

    async function handleDuplicate(id: string) {
        setMenuOpen(null);
        const dup = await duplicateFile(id);
        setFiles(prev => [dup, ...prev]);
    }

    function startRename(file: FileOut) {
        setMenuOpen(null);
        setRenamingId(file.id);
        setRenameValue(file.name);
    }

    async function commitRename(id: string) {
        const trimmed = renameValue.trim();
        if (!trimmed) { setRenamingId(null); return; }
        try {
            const updated = await renameFile(id, trimmed);
            setFiles(prev => prev.map(f => f.id === id ? { ...f, name: updated.name } : f));
        } catch (err: any) {
            if (err?.status === 409) alert(t.rename_conflict);
        } finally {
            setRenamingId(null);
        }
    }

    if (authLoading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: token.color.bg }}>
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", background: token.color.bg, fontFamily: token.font.family.sans, color: token.color.fg }}>
            {/* ── Header ── */}
            <header style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                padding: `0 ${token.space.sp6}`,
                height: 56,
                borderBottom: `1px solid ${token.color.border}`,
                background: token.color.bg,
                position: "sticky",
                top: 0,
                zIndex: 100,
            }}>
                <div
                    onClick={() => router.push("/")}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                >
                    <Logo size={20} />
                    <span style={{ fontWeight: 700, fontSize: token.font.size.fs15, letterSpacing: "-0.01em" }}>Simulizer</span>
                </div>

                <span style={{ fontSize: token.font.size.fs13, fontWeight: 600, color: token.color.fgMuted }}>
                    {t.header_title}
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "flex-end" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button
                        onClick={toggleTheme}
                        style={{ background: "none", border: "none", cursor: "pointer", color: token.color.fgSubtle, display: "flex", padding: 6, borderRadius: token.radius.sm }}
                        onMouseEnter={e => (e.currentTarget.style.color = token.color.fg)}
                        onMouseLeave={e => (e.currentTarget.style.color = token.color.fgSubtle)}
                    >
                        {theme === "dark" ? <Icon.Sun size={16} /> : <Icon.Moon size={16} />}
                    </button>
                    <button
                        onClick={toggleLang}
                        style={{ background: "none", border: "none", cursor: "pointer", color: token.color.fgSubtle, display: "flex", padding: 6, borderRadius: token.radius.sm }}
                        onMouseEnter={e => (e.currentTarget.style.color = token.color.fg)}
                        onMouseLeave={e => (e.currentTarget.style.color = token.color.fgSubtle)}
                    >
                        <Icon.Globe size={16} />
                    </button>
                    </div>
                    {user && (
                        <div onClick={() => router.push("/account")} style={{ cursor: "pointer", display: "flex" }}>
                            <Avatar name={user.name} picture={user.picture_url} />
                        </div>
                    )}
                </div>
            </header>

            {/* ── Body ── */}
            <main style={{ maxWidth: 960, margin: "0 auto", padding: `${token.space.sp8} ${token.space.sp6}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: token.space.sp6 }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: token.font.size.fs20, fontWeight: 700, letterSpacing: "-0.02em" }}>
                            {user ? t.section_title.replace("{name}", user.name) : t.header_title}
                        </h1>
                        <p style={{ margin: "4px 0 0", fontSize: token.font.size.fs13, color: token.color.fgSubtle }}>
                            {user?.email}
                        </p>
                    </div>
                    <Button
                        variant="accent"
                        size="md"
                        leading={creating ? <Spinner size="sm" /> : <Icon.Plus size={13} />}
                        onClick={handleNewFile}
                        disabled={creating}
                    >
                        {t.new_file_button}
                    </Button>
                </div>

                {filesLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
                        <Spinner size="lg" />
                    </div>
                ) : files.length === 0 ? (
                    <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        padding: "100px 0", gap: 16, color: token.color.fgSubtle,
                    }}>
                        <Icon.File size={40} />
                        <div style={{ textAlign: "center" }}>
                            <p style={{ margin: 0, fontSize: token.font.size.fs15, fontWeight: 500, color: token.color.fgMuted }}>{t.empty_title}</p>
                            <p style={{ margin: "4px 0 0", fontSize: token.font.size.fs13 }}>{t.empty_desc}</p>
                        </div>
                        <Button variant="accent" size="sm" leading={<Icon.Plus size={12} />} onClick={handleNewFile} disabled={creating}>
                            {t.empty_new_file_button}
                        </Button>
                    </div>
                ) : (
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                        gap: token.space.sp4,
                    }}>
                        {files.map(file => (
                            <FileCard
                                key={file.id}
                                file={file}
                                isRenaming={renamingId === file.id}
                                renameValue={renameValue}
                                renameInputRef={renamingId === file.id ? renameInputRef : undefined}
                                menuOpen={menuOpen === file.id}
                                onOpen={() => router.push(`/workspace?file=${file.id}`)}
                                onMenuToggle={() => setMenuOpen(prev => prev === file.id ? null : file.id)}
                                onMenuClose={() => setMenuOpen(null)}
                                onRename={() => startRename(file)}
                                onDuplicate={() => handleDuplicate(file.id)}
                                onDelete={() => handleDelete(file.id)}
                                onRenameChange={setRenameValue}
                                onRenameCommit={() => commitRename(file.id)}
                                onRenameCancel={() => setRenamingId(null)}
                            />
                        ))}
                    </div>
                )}
            </main>

            {menuOpen !== null && (
                <div onClick={() => setMenuOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 9 }} />
            )}
        </div>
    );
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function FileThumbnail({ fileId }: { fileId: string }) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let url: string | null = null;
        fetch(`${BASE}/files/${fileId}/thumbnail`, { credentials: "include" })
            .then(res => {
                if (!res.ok) throw new Error();
                return res.blob();
            })
            .then(blob => {
                url = URL.createObjectURL(blob);
                setBlobUrl(url);
            })
            .catch(() => setFailed(true));
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [fileId]);

    if (blobUrl) {
        return (
            <img
                src={blobUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "contain", padding: 12, boxSizing: "border-box" }}
            />
        );
    }
    if (failed) return <Icon.Grid size={32} />;
    return null;
}

interface FileCardProps {
    file: FileOut;
    isRenaming: boolean;
    renameValue: string;
    renameInputRef?: React.RefObject<HTMLInputElement | null>;
    menuOpen: boolean;
    onOpen: () => void;
    onMenuToggle: () => void;
    onMenuClose: () => void;
    onRename: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onRenameChange: (v: string) => void;
    onRenameCommit: () => void;
    onRenameCancel: () => void;
}

function FileCard({
    file, isRenaming, renameValue, renameInputRef,
    menuOpen, onOpen, onMenuToggle, onMenuClose,
    onRename, onDuplicate, onDelete,
    onRenameChange, onRenameCommit, onRenameCancel,
}: FileCardProps) {
    const [, , pack] = useLanguagePack();
    const t = pack.dashboard;
    const menuItem: React.CSSProperties = {
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", fontSize: token.font.size.fs12,
        border: "none", background: "none", cursor: "pointer",
        color: token.color.fg, width: "100%", textAlign: "left",
    };

    return (
        <div
            style={{
                background: token.color.bg,
                border: `1px solid ${token.color.border}`,
                borderRadius: token.radius.lg,
                display: "flex",
                flexDirection: "column",
                cursor: "pointer",
                transition: "border-color 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = token.color.accentBorder;
                (e.currentTarget as HTMLDivElement).style.boxShadow = token.shadow.sm;
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = token.color.border;
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
            }}
        >
            {/* Preview area */}
            <div
                onClick={onOpen}
                style={{
                    height: 120,
                    background: token.color.bgSubtle,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: token.color.fgSubtle,
                    borderRadius: `${token.radius.lg} ${token.radius.lg} 0 0`,
                    overflow: "hidden",
                }}
            >
                <FileThumbnail fileId={file.id} />
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    {isRenaming ? (
                        <input
                            ref={renameInputRef as React.RefObject<HTMLInputElement>}
                            value={renameValue}
                            onChange={e => onRenameChange(e.target.value)}
                            onBlur={onRenameCommit}
                            onKeyDown={e => {
                                if (e.key === "Enter") onRenameCommit();
                                if (e.key === "Escape") onRenameCancel();
                            }}
                            style={{
                                flex: 1, background: token.color.bgSubtle, border: `1px solid ${token.color.accentBorder}`,
                                borderRadius: token.radius.xs, padding: "2px 6px", fontSize: token.font.size.fs13,
                                fontFamily: token.font.family.mono, color: token.color.fg, outline: "none",
                            }}
                        />
                    ) : (
                        <span
                            style={{
                                flex: 1, fontSize: token.font.size.fs13, fontWeight: 600,
                                color: token.color.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                fontFamily: token.font.family.mono,
                            }}
                            onClick={onOpen}
                        >
                            {file.name}
                        </span>
                    )}

                    <div style={{ position: "relative", flexShrink: 0 }}>
                        <button
                            onClick={e => { e.stopPropagation(); onMenuToggle(); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: token.color.fgSubtle, display: "flex", padding: 4, borderRadius: token.radius.xs }}
                            onMouseEnter={e => (e.currentTarget.style.color = token.color.fg)}
                            onMouseLeave={e => (e.currentTarget.style.color = token.color.fgSubtle)}
                        >
                            <MoreIcon />
                        </button>

                        {menuOpen && (
                            <div
                                onClick={e => e.stopPropagation()}
                                style={{
                                    position: "absolute", right: 0, bottom: "calc(100% + 4px)",
                                    background: token.color.bg, border: `1px solid ${token.color.border}`,
                                    borderRadius: token.radius.md, boxShadow: token.shadow.lg,
                                    zIndex: 10, minWidth: 160, padding: "4px 0", overflow: "hidden",
                                }}
                            >
                                <button style={menuItem} onClick={onOpen}
                                    onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                                >
                                    <Icon.File size={12} /> {t.menu_open}
                                </button>
                                <button style={menuItem} onClick={onRename}
                                    onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> {t.menu_rename}
                                </button>
                                <button style={menuItem} onClick={onDuplicate}
                                    onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                                >
                                    <Icon.Layers size={12} /> {t.menu_duplicate}
                                </button>
                                <div style={{ height: 1, background: token.color.border, margin: "4px 0" }} />
                                <button
                                    style={{ ...menuItem, color: token.color.danger }}
                                    onClick={onDelete}
                                    onMouseEnter={e => (e.currentTarget.style.background = token.color.dangerSoft)}
                                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                                >
                                    <Icon.Trash size={12} /> {t.menu_delete}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>
                    {t.card_updated.replace("{date}", formatDate(file.updated_at))}
                </span>
            </div>
        </div>
    );
}

function MoreIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
        </svg>
    );
}
