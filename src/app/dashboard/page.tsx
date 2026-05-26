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
    getFile,
    uploadThumbnail,
    deleteThumbnail,
    type FileOut,
    type FileType,
} from "@/lib/authapi";
import { replaceLatexBlocksInWorkspace } from "@/utils/tex/blockgen";
import { serializeBundle, makeDefaultBundle, type CppBundle } from "@/lib/cppBundle";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
import { Modal, ModalBody, ModalHeader } from "@/components/organisms/Modal";
import { Prism } from "react-syntax-highlighter";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";

function pathForType(file: { id: string }): string {
    return `/workspace?file=${file.id}`;
}

type NewFileAction = FileType | "import";

interface NewFileMenuOption {
    action: NewFileAction;
    icon: React.ReactNode;
    title: string;
    desc: string;
}

interface NewFileMenuProps {
    open: boolean;
    creating: boolean;
    onSelect: (action: NewFileAction) => void;
    align?: "right" | "center";
    options: NewFileMenuOption[];
}

function NewFileMenu({ open, creating, onSelect, align = "right", options }: NewFileMenuProps) {
    if (!open) return null;
    const alignStyle = align === "center"
        ? { left: "50%", transform: "translateX(-50%)" } as const
        : { right: 0 } as const;
    return (
        <div
            onClick={e => e.stopPropagation()}
            style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                ...alignStyle,
                minWidth: 260,
                background: token.color.bgRaised,
                border: `1px solid ${token.color.border}`,
                borderRadius: token.radius.md,
                boxShadow: token.shadow.lg,
                padding: 4,
                zIndex: 20,
                display: "flex",
                flexDirection: "column",
                gap: 1,
            }}
        >
            {options.map((opt, i) => {
                const showDivider = opt.action === "import" && i > 0;
                return (
                    <React.Fragment key={opt.action}>
                        {showDivider && <div style={{ height: 1, background: token.color.border, margin: "4px 0" }} />}
                        <button
                            onClick={() => onSelect(opt.action)}
                            disabled={creating}
                            style={{
                                display: "flex", alignItems: "flex-start", gap: 10,
                                padding: "8px 10px",
                                border: "none", background: "none",
                                borderRadius: token.radius.sm,
                                cursor: creating ? "default" : "pointer",
                                color: token.color.fg, textAlign: "left",
                                transition: "background 0.1s",
                            }}
                            onMouseEnter={e => { if (!creating) e.currentTarget.style.background = token.color.bgSubtle; }}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                            <span style={{ color: token.color.fgMuted, flexShrink: 0, marginTop: 2 }}>{opt.icon}</span>
                            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                                <span style={{ fontSize: token.font.size.fs12, fontWeight: 600 }}>{opt.title}</span>
                                <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle, lineHeight: 1.4 }}>{opt.desc}</span>
                            </span>
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

const BLOCK_EXTS = new Set([".simulizer", ".json"]);
const CLANG_EXTS = new Set([".cpp", ".cc", ".cxx", ".c++", ".h", ".hpp", ".hxx"]);

function splitExt(filename: string): { base: string; ext: string } {
    const lastDot = filename.lastIndexOf(".");
    // No dot at all → no extension.
    if (lastDot < 0) return { base: filename, ext: "" };
    // Leading dot ('.cpp', '.gitignore') is the only dot — treat the whole
    // string as the extension so the user's intent classifies correctly,
    // leaving the base empty (callers fall back to "untitled").
    if (lastDot === 0) return { base: "", ext: filename.toLowerCase() };
    return { base: filename.slice(0, lastDot), ext: filename.slice(lastDot).toLowerCase() };
}
import { ShareControl } from "@/components/share/ShareControl";

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
    const [sharingFile, setSharingFile] = useState<FileOut | null>(null);
    const [pickerAnchor, setPickerAnchor] = useState<"header" | "empty" | null>(null);
    const [thumbVersions, setThumbVersions] = useState<Record<string, number>>({});
    const [thumbnailModalFile, setThumbnailModalFile] = useState<FileOut | null>(null);
    const [previewBoxSize, setPreviewBoxSize] = useState<{ w: number; h: number }>({ w: 480, h: 240 });
    const renameInputRef = useRef<HTMLInputElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const previewBoxRef = useRef<HTMLDivElement | null>(null);
    const previewResizeObsRef = useRef<ResizeObserver | null>(null);

    const measurePreviewBox = useCallback((el: HTMLDivElement | null) => {
        previewResizeObsRef.current?.disconnect();
        previewResizeObsRef.current = null;
        previewBoxRef.current = el;
        if (!el) return;
        const update = () => {
            const r = el.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            setPreviewBoxSize({ w: Math.round(r.width * dpr), h: Math.round(r.height * dpr) });
        };
        update();
        if (typeof ResizeObserver !== "undefined") {
            const obs = new ResizeObserver(update);
            obs.observe(el);
            previewResizeObsRef.current = obs;
        }
    }, []);

    useEffect(() => () => { previewResizeObsRef.current?.disconnect(); }, []);

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

    async function handleCreateFile(type: FileType) {
        setCreating(true);
        try {
            const existing = new Set(files.map(f => f.name));
            let name = "untitled";
            let counter = 2;
            while (existing.has(name)) {
                name = `untitled ${counter++}`;
            }
            const file = await createFile(name, type);
            setPickerAnchor(null);
            router.push(pathForType(file));
        } finally {
            setCreating(false);
        }
    }

    function handleMenuSelect(action: NewFileAction) {
        if (action === "import") {
            setPickerAnchor(null);
            importInputRef.current?.click();
            return;
        }
        handleCreateFile(action);
    }

    async function handleImportFileInput(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const { base, ext } = splitExt(file.name);
        let type: FileType;
        if (BLOCK_EXTS.has(ext)) type = "blockfile";
        else if (CLANG_EXTS.has(ext)) type = "clangfile";
        else { alert(t.import_unsupported_ext); return; }
        // Reject oversized files BEFORE reading — otherwise file.text() loads
        // potentially gigabytes into a JS string and can OOM the tab. Server
        // also enforces MAX_CONTENT_BYTES = 5 MB, but only post-upload.
        if (file.size > 5 * 1024 * 1024) {
            alert(t.import_failed);
            return;
        }

        setCreating(true);
        try {
            const raw = await file.text();
            // clangfile imports come in as raw source; wrap them in a single-
            // file bundle so the workspace's parser sees a v1 schema and the
            // imported file becomes both the entry and the only tab.
            let content = raw;
            if (type === "clangfile") {
                const ext2 = ext.toLowerCase();
                const isHeader = [".hpp", ".h", ".hxx"].includes(ext2);
                const fileName = isHeader ? `${base || "header"}.hpp` : "main.cpp";
                const bundle: CppBundle = {
                    version: 1,
                    entry: "main.cpp",
                    tree: isHeader
                        ? [
                            { type: "file", name: "main.cpp", content: "" },
                            { type: "file", name: fileName, content: raw },
                        ]
                        : [{ type: "file", name: "main.cpp", content: raw }],
                    ui: {
                        activeFile: isHeader ? fileName : "main.cpp",
                        openTabs: isHeader ? ["main.cpp", fileName] : ["main.cpp"],
                        treeOpen: false,
                    },
                };
                content = serializeBundle(bundle);
            }
            const existing = new Set(files.map(f => f.name));
            let candidate = base || "untitled";
            let counter = 2;
            while (existing.has(candidate)) {
                candidate = `${base || "untitled"} ${counter++}`;
            }
            let created;
            for (;;) {
                try {
                    created = await createFile(candidate, type, content);
                    break;
                } catch (err: any) {
                    if (err?.status === 409) {
                        candidate = `${base || "untitled"} ${counter++}`;
                        if (counter > 50) throw err;
                        continue;
                    }
                    throw err;
                }
            }
            router.push(pathForType(created));
        } catch {
            alert(t.import_failed);
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

    async function handleDuplicateAsCpp(file: FileOut) {
        setMenuOpen(null);
        try {
            const src = await getFile(file.id);
            const rawSave = JSON.parse(src.content);
            const processedSave = replaceLatexBlocksInWorkspace(rawSave);
            const blocklyJson = JSON.stringify(processedSave);
            const res = await fetch(`${API_URL}/compile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lang: "cpp", code: blocklyJson, main_fn: "worker" }),
            });
            if (!res.ok) throw new Error(`compile failed: ${res.status}`);
            const data = await res.json();
            const cppSource: string = data.result ?? "";
            if (!cppSource) throw new Error("empty compile result");

            const baseName = `${file.name} (C++)`;
            const existing = new Set(files.map(f => f.name));
            let candidate = baseName;
            let counter = 2;
            while (existing.has(candidate)) {
                candidate = `${baseName} ${counter++}`;
            }
            // Wrap the generated source as a single-file bundle; clangfiles
            // are JSON now, not raw C++.
            const bundle: CppBundle = {
                ...makeDefaultBundle(),
                tree: [{ type: "file", name: "main.cpp", content: cppSource }],
            };
            const wrapped = serializeBundle(bundle);
            let created;
            for (;;) {
                try {
                    created = await createFile(candidate, "clangfile", wrapped);
                    break;
                } catch (err: any) {
                    if (err?.status === 409) {
                        candidate = `${baseName} ${counter++}`;
                        if (counter > 50) throw err;
                        continue;
                    }
                    throw err;
                }
            }
            setFiles(prev => [created!, ...prev]);
        } catch {
            alert(t.duplicate_cpp_failed);
        }
    }

    function startRename(file: FileOut) {
        setMenuOpen(null);
        setRenamingId(file.id);
        setRenameValue(file.name);
    }

    function startSetThumbnail(file: FileOut) {
        setMenuOpen(null);
        setThumbnailModalFile(file);
    }

    async function handleThumbnailUpload(file: File): Promise<void> {
        const target = thumbnailModalFile;
        if (!target) return;
        if (!file.type.startsWith("image/")) throw new Error(t.thumbnail_not_image);
        if (file.size > 2 * 1024 * 1024) throw new Error(t.thumbnail_too_large);
        await uploadThumbnail(target.id, file, { manual: true });
        setFiles(prev => prev.map(f => f.id === target.id ? { ...f, thumbnail_custom: true } : f));
        setThumbVersions(prev => ({ ...prev, [target.id]: (prev[target.id] ?? 0) + 1 }));
        setThumbnailModalFile(null);
    }

    async function handleThumbnailReset(): Promise<void> {
        const target = thumbnailModalFile;
        if (!target) return;
        await deleteThumbnail(target.id);
        setFiles(prev => prev.map(f => f.id === target.id ? { ...f, thumbnail_custom: false } : f));
        setThumbVersions(prev => ({ ...prev, [target.id]: (prev[target.id] ?? 0) + 1 }));
        setThumbnailModalFile(null);
    }

    function startShare(file: FileOut) {
        setMenuOpen(null);
        setSharingFile(file);
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

                <span className="dashboard-header-title" style={{ fontSize: token.font.size.fs13, fontWeight: 600, color: token.color.fgMuted }}>
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
                    <div style={{ position: "relative", zIndex: pickerAnchor === "header" ? 20 : undefined }}>
                        <Button
                            variant="accent"
                            size="md"
                            leading={creating ? <Spinner size="sm" /> : <Icon.Plus size={13} />}
                            trailing={<Icon.Chevron size={14} />}
                            onClick={() => setPickerAnchor(prev => prev === "header" ? null : "header")}
                            disabled={creating}
                        >
                            {t.new_file_button}
                        </Button>
                        <NewFileMenu
                            open={pickerAnchor === "header"}
                            creating={creating}
                            onSelect={handleMenuSelect}
                            align="right"
                            options={[
                                { action: "blockfile", icon: <Icon.Layers size={14} />, title: t.new_file_type_block_title, desc: t.new_file_type_block_desc },
                                { action: "clangfile", icon: <Icon.File size={14} />,   title: t.new_file_type_clang_title, desc: t.new_file_type_clang_desc },
                                { action: "import",    icon: <Icon.Download size={14} />, title: t.new_file_type_import_title, desc: t.new_file_type_import_desc },
                            ]}
                        />
                    </div>
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
                        <div style={{ position: "relative", zIndex: pickerAnchor === "empty" ? 20 : undefined }}>
                            <Button
                                variant="accent"
                                size="sm"
                                leading={<Icon.Plus size={12} />}
                                trailing={<Icon.Chevron size={14} />}
                                onClick={() => setPickerAnchor(prev => prev === "empty" ? null : "empty")}
                                disabled={creating}
                            >
                                {t.empty_new_file_button}
                            </Button>
                            <NewFileMenu
                                open={pickerAnchor === "empty"}
                                creating={creating}
                                onSelect={handleMenuSelect}
                                align="center"
                                options={[
                                    { action: "blockfile", icon: <Icon.Layers size={14} />, title: t.new_file_type_block_title, desc: t.new_file_type_block_desc },
                                    { action: "clangfile", icon: <Icon.File size={14} />,   title: t.new_file_type_clang_title, desc: t.new_file_type_clang_desc },
                                    { action: "import",    icon: <Icon.Download size={14} />, title: t.new_file_type_import_title, desc: t.new_file_type_import_desc },
                                ]}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="dashboard-grid" style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                        gap: token.space.sp4,
                    }}>
                        {files.map((file, i) => (
                            <FileCard
                                key={file.id}
                                file={file}
                                previewRef={i === 0 ? measurePreviewBox : undefined}
                                isRenaming={renamingId === file.id}
                                renameValue={renameValue}
                                renameInputRef={renamingId === file.id ? renameInputRef : undefined}
                                menuOpen={menuOpen === file.id}
                                onOpen={() => router.push(pathForType(file))}
                                onMenuToggle={() => setMenuOpen(prev => prev === file.id ? null : file.id)}
                                onMenuClose={() => setMenuOpen(null)}
                                onRename={() => startRename(file)}
                                onDuplicate={() => handleDuplicate(file.id)}
                                onDuplicateAsCpp={file.type === "blockfile" ? () => handleDuplicateAsCpp(file) : undefined}
                                onShare={() => startShare(file)}
                                onSetThumbnail={() => startSetThumbnail(file)}
                                onDelete={() => handleDelete(file.id)}
                                thumbnailVersion={thumbVersions[file.id] ?? 0}
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

            {pickerAnchor !== null && !creating && (
                <div onClick={() => setPickerAnchor(null)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
            )}

            <input
                ref={importInputRef}
                type="file"
                accept=".simulizer,.json,.cpp,.cc,.cxx,.c++,.h,.hpp,.hxx"
                onChange={handleImportFileInput}
                style={{ display: "none" }}
            />

            {thumbnailModalFile && (
                <ThumbnailUploadModal
                    fileName={thumbnailModalFile.name}
                    recommendedSize={previewBoxSize}
                    canReset={thumbnailModalFile.thumbnail_custom}
                    onUpload={handleThumbnailUpload}
                    onReset={handleThumbnailReset}
                    onClose={() => setThumbnailModalFile(null)}
                    pack={t}
                />
            )}

            {sharingFile && (
                <Modal width={420} onClose={() => setSharingFile(null)}>
                    <ModalHeader onClose={() => setSharingFile(null)}>
                        {pack.workspace.ui.share_dialog_title}
                    </ModalHeader>
                    <ModalBody>
                        <ShareControl
                            file={sharingFile}
                            onChange={updated => {
                                setFiles(prev => prev.map(f => f.id === updated.id ? { ...f, visibility: updated.visibility } : f));
                                setSharingFile(prev => prev ? { ...prev, visibility: updated.visibility } : prev);
                            }}
                        />
                    </ModalBody>
                </Modal>
            )}
        </div>
    );
}

const AUTH_BASE = process.env.NEXT_PUBLIC_AUTH_URL;

function FileThumbnail({ fileId, version = 0 }: { fileId: string; version?: number }) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let createdUrl: string | null = null;
        setBlobUrl(null);
        setFailed(false);
        const suffix = version > 0 ? `?v=${version}` : "";
        fetch(`${AUTH_BASE}/files/${fileId}/thumbnail${suffix}`, { credentials: "include" })
            .then(res => {
                if (!res.ok) throw new Error();
                return res.blob();
            })
            .then(blob => {
                if (cancelled) return;
                createdUrl = URL.createObjectURL(blob);
                setBlobUrl(createdUrl);
            })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => {
            cancelled = true;
            // If the fetch resolved before cleanup, createdUrl is set and we
            // must revoke it. If it resolves after cleanup, the cancelled
            // flag prevents URL.createObjectURL from running at all.
            if (createdUrl) URL.revokeObjectURL(createdUrl);
        };
    }, [fileId, version]);

    if (blobUrl) {
        return (
            <img
                src={blobUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
        );
    }
    if (failed) {
        return (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon.Grid size={32} />
            </div>
        );
    }
    return null;
}

function CodeSnippet({ fileId }: { fileId: string }) {
    const { theme } = useTheme();
    const [text, setText] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        fetch(`${AUTH_BASE}/files/${fileId}/preview`, { credentials: "include" })
            .then(res => {
                if (!res.ok) throw new Error();
                return res.text();
            })
            .then(t => setText(t.trim()))
            .catch(() => setFailed(true));
    }, [fileId]);

    if (failed || (text !== null && text === "")) {
        return (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon.File size={32} />
            </div>
        );
    }
    if (text === null) return null;
    return (
        <Prism
            language="cpp"
            style={theme === "dark" ? oneDark : oneLight}
            customStyle={{
                width: "100%",
                height: "100%",
                margin: 0,
                padding: "8px 10px",
                overflow: "hidden",
                fontSize: 9,
                lineHeight: 1.35,
                fontFamily: token.font.family.mono,
                background: "transparent",
                whiteSpace: "pre",
                wordBreak: "normal",
                pointerEvents: "none",
            }}
            codeTagProps={{ style: { fontFamily: token.font.family.mono, background: "transparent" } }}
        >
            {text}
        </Prism>
    );
}

interface FileCardProps {
    file: FileOut;
    isRenaming: boolean;
    renameValue: string;
    renameInputRef?: React.RefObject<HTMLInputElement | null>;
    menuOpen: boolean;
    thumbnailVersion: number;
    previewRef?: (el: HTMLDivElement | null) => void;
    onOpen: () => void;
    onMenuToggle: () => void;
    onMenuClose: () => void;
    onRename: () => void;
    onDuplicate: () => void;
    onDuplicateAsCpp?: () => void;
    onShare: () => void;
    onSetThumbnail: () => void;
    onDelete: () => void;
    onRenameChange: (v: string) => void;
    onRenameCommit: () => void;
    onRenameCancel: () => void;
}

function FileCard({
    file, isRenaming, renameValue, renameInputRef,
    menuOpen, thumbnailVersion, previewRef, onOpen, onMenuToggle, onMenuClose,
    onRename, onDuplicate, onDuplicateAsCpp, onShare, onSetThumbnail, onDelete,
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
                ref={previewRef}
                onClick={onOpen}
                style={{
                    aspectRatio: "2 / 1",
                    background: token.color.bgSubtle,
                    display: "flex",
                    alignItems: "stretch",
                    justifyContent: "stretch",
                    color: token.color.fgSubtle,
                    borderRadius: `${token.radius.lg} ${token.radius.lg} 0 0`,
                    overflow: "hidden",
                }}
            >
                {file.thumbnail_custom
                    ? <FileThumbnail fileId={file.id} version={thumbnailVersion} />
                    : file.type === "clangfile"
                        ? <CodeSnippet fileId={file.id} />
                        : <FileThumbnail fileId={file.id} version={thumbnailVersion} />}
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
                                {onDuplicateAsCpp && (
                                    <button style={menuItem} onClick={onDuplicateAsCpp}
                                        onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                                    >
                                        <Icon.File size={12} /> {t.menu_duplicate_cpp}
                                    </button>
                                )}
                                <button style={menuItem} onClick={onShare}
                                    onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                                >
                                    <Icon.Globe size={12} /> {t.menu_share}
                                </button>
                                <button style={menuItem} onClick={onSetThumbnail}
                                    onMouseEnter={e => (e.currentTarget.style.background = token.color.bgSubtle)}
                                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                                >
                                    <Icon.Download size={12} /> {t.menu_set_thumbnail}
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

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle, flex: 1 }}>
                        {t.card_updated.replace("{date}", formatDate(file.updated_at))}
                    </span>
                    {file.type === "clangfile" && (
                        <span style={{
                            display: "inline-flex", alignItems: "center",
                            padding: "1px 6px", borderRadius: 999,
                            background: token.color.bgSubtle, color: token.color.fgMuted,
                            fontSize: token.font.size.fs10, fontWeight: 600,
                            fontFamily: token.font.family.mono,
                        }}>
                            {t.badge_clangfile}
                        </span>
                    )}
                    {file.visibility === "link" && (
                        <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "1px 6px", borderRadius: 999,
                            background: token.color.accentSubtle, color: token.color.accent,
                            fontSize: token.font.size.fs10, fontWeight: 600,
                        }}>
                            <Icon.Globe size={9} />
                            {t.badge_link_shared}
                        </span>
                    )}
                </div>
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

interface ThumbnailUploadModalProps {
    fileName: string;
    recommendedSize: { w: number; h: number };
    canReset: boolean;
    onUpload: (file: File) => Promise<void>;
    onReset: () => Promise<void>;
    onClose: () => void;
    pack: ReturnType<typeof useLanguagePack>[2]["dashboard"];
}

function ThumbnailUploadModal({ fileName, recommendedSize, canReset, onUpload, onReset, onClose, pack }: ThumbnailUploadModalProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const busy = uploading || resetting;

    const recHint = pack.thumbnail_recommended_size
        .replace("{w}", String(recommendedSize.w))
        .replace("{h}", String(recommendedSize.h));

    const handleFile = async (file: File) => {
        setError(null);
        setUploading(true);
        try {
            await onUpload(file);
        } catch (err) {
            setError(err instanceof Error ? err.message : pack.thumbnail_upload_failed);
        } finally {
            setUploading(false);
        }
    };

    const handleReset = async () => {
        setError(null);
        setResetting(true);
        try {
            await onReset();
        } catch (err) {
            setError(err instanceof Error ? err.message : pack.thumbnail_reset_failed);
        } finally {
            setResetting(false);
        }
    };

    return (
        <Modal width={480} onClose={() => !busy && onClose()}>
            <ModalHeader onClose={() => !busy && onClose()}>
                {pack.thumbnail_modal_title}
            </ModalHeader>
            <ModalBody>
                <p style={{ margin: `0 0 ${token.space.sp3} 0`, fontSize: token.font.size.fs12, color: token.color.fgSubtle, fontFamily: token.font.family.mono }}>
                    {fileName}
                </p>
                <div
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        if (busy) return;
                        const f = e.dataTransfer.files[0];
                        if (f) handleFile(f);
                    }}
                    onDragEnter={() => !busy && setDragOver(true)}
                    onDragLeave={() => setDragOver(false)}
                    onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
                    onClick={() => !busy && inputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        gap: token.space.sp2,
                        padding: `${token.space.sp8} ${token.space.sp6}`,
                        borderRadius: token.radius.lg,
                        border: `2px dashed ${dragOver ? token.color.accent : token.color.border}`,
                        background: dragOver ? token.color.accentSubtle : token.color.bgSubtle,
                        cursor: uploading ? "wait" : "pointer",
                        transition: "border-color 0.15s, background 0.15s",
                    }}
                >
                    {uploading ? (
                        <>
                            <Spinner size="lg" />
                            <p style={{ margin: 0, fontSize: token.font.size.fs13, color: token.color.fgMuted }}>{pack.thumbnail_uploading}</p>
                        </>
                    ) : (
                        <>
                            <div style={{
                                width: 48, height: 48,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                borderRadius: 999,
                                background: dragOver ? token.color.accent : token.color.bg,
                                color: dragOver ? token.color.fgOnAccent : token.color.fgMuted,
                                border: `1px solid ${token.color.border}`,
                                transition: "background 0.15s, color 0.15s",
                            }}>
                                <Icon.Download size={20} />
                            </div>
                            <p style={{ margin: 0, fontSize: token.font.size.fs13, fontWeight: 600, color: token.color.fg, textAlign: "center" }}>
                                {pack.thumbnail_dropzone_idle}
                            </p>
                            <p style={{ margin: 0, fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>
                                {pack.thumbnail_dropzone_hint}
                            </p>
                        </>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleFile(f); }}
                    />
                </div>
                <p style={{ margin: `${token.space.sp3} 0 0 0`, fontSize: token.font.size.fs11, color: token.color.fgSubtle, fontFamily: token.font.family.mono, textAlign: "center" }}>
                    {recHint}
                </p>
                {error && (
                    <p style={{ margin: `${token.space.sp3} 0 0 0`, fontSize: token.font.size.fs12, color: token.color.danger, textAlign: "center" }}>
                        {error}
                    </p>
                )}
                {canReset && (
                    <div style={{ display: "flex", justifyContent: "center", marginTop: token.space.sp4 }}>
                        <Button
                            variant="ghost"
                            size="sm"
                            leading={resetting ? <Spinner size="sm" /> : <Icon.Trash size={11} />}
                            onClick={handleReset}
                            disabled={busy}
                        >
                            {pack.thumbnail_reset_button}
                        </Button>
                    </div>
                )}
            </ModalBody>
        </Modal>
    );
}
