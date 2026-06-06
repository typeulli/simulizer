"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/atoms/Icons";
import { token } from "@/components/tokens";
import type { TreeNode, FolderNode } from "@/lib/cppBundle";
import { FileIcon } from "./FileIcon";

// VS Code workbench colors. monaco-vscode injects these CSS variables onto
// document.body once the workbench/theme service initializes — which has
// happened by the time the user opens the tree (the editor is always loaded
// alongside). We provide token-based fallbacks so the tree still renders if
// the variables aren't available yet (initial mount race, hot reload, etc.).
const vscv = (name: string, fallback: string) => `var(--vscode-${name}, ${fallback})`;

const C = {
    sideBarBg:       () => vscv("sideBar-background",                  token.color.bg),
    sideBarFg:       () => vscv("sideBar-foreground",                  token.color.fgMuted),
    sectionHeaderBg: () => vscv("sideBarSectionHeader-background",     token.color.bg),
    sectionHeaderFg: () => vscv("sideBarSectionHeader-foreground",     token.color.fg),
    sectionBorder:   () => vscv("sideBarSectionHeader-border",         token.color.border),
    hoverBg:         () => vscv("list-hoverBackground",                token.color.bgSubtle),
    activeBg:        () => vscv("list-activeSelectionBackground",      token.color.bgSubtle),
    activeFg:        () => vscv("list-activeSelectionForeground",      token.color.fg),
    inactiveBg:      () => vscv("list-inactiveSelectionBackground",    token.color.bgSubtle),
    iconFg:          () => vscv("icon-foreground",                     token.color.fgSubtle),
    indentGuide:     () => vscv("tree-indentGuidesStroke",             token.color.border),
    menuBg:          () => vscv("menu-background",                     token.color.bg),
    menuFg:          () => vscv("menu-foreground",                     token.color.fg),
    menuBorder:      () => vscv("menu-border",                         token.color.border),
    menuSelectionBg: () => vscv("menu-selectionBackground",            token.color.bgSubtle),
    menuSelectionFg: () => vscv("menu-selectionForeground",            token.color.fg),
    menuSeparator:   () => vscv("menu-separatorBackground",            token.color.border),
    focusBorder:     () => vscv("focusBorder",                         token.color.accent),
    inputBg:         () => vscv("input-background",                    token.color.bg),
    inputFg:         () => vscv("input-foreground",                    token.color.fg),
    inputBorder:     () => vscv("input-border",                        token.color.border),
    danger:          () => vscv("errorForeground",                     token.color.danger),
    validationErrBg: () => vscv("inputValidation-errorBackground",     token.color.dangerSoft),
    validationErrBd: () => vscv("inputValidation-errorBorder",         token.color.danger),
};

type ContextMenuTarget =
    | { kind: "file"; path: string }
    | { kind: "folder"; path: string }
    | { kind: "root" };

type ContextMenuState = {
    target: ContextMenuTarget;
    x: number;
    y: number;
} | null;

// VS Code-style inline edit state. `rename` swaps the row's name span with
// an input; `create-*` injects a "ghost" row at the top of the target
// folder's child list (and auto-expands ancestors so it's visible).
type EditingState =
    | { mode: "rename"; path: string; initialValue: string; isFolder: boolean }
    | { mode: "create-file"; parentPath: string }
    | { mode: "create-folder"; parentPath: string };

export type FileTreeProps = {
    tree: TreeNode[];
    entryPath: string;
    activePath: string;
    readOnly?: boolean;
    onOpenFile: (path: string) => void;
    /** Returns an error string to keep the inline input open, or null on success. */
    onCreateFile: (parentPath: string, name: string) => string | null;
    onCreateFolder: (parentPath: string, name: string) => string | null;
    onUploadFile: (parentPath: string) => void;
    onDownloadFile: (path: string) => void;
    onRename: (path: string, newName: string) => string | null;
    onDelete: (path: string) => void;
    onSetAsEntry: (path: string) => void;
    onMove: (srcPath: string, destDir: string) => void;
};

const DRAG_MIME = "application/x-simulizer-path";

// macOS Finder + VS Code on macOS use Enter to rename files; Windows/Linux
// use F2. Detect at module load to match the host platform.
const IS_MAC =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
const RENAME_SHORTCUT_KEY   = IS_MAC ? "Enter" : "F2";
const RENAME_SHORTCUT_LABEL = IS_MAC ? "Enter" : "F2";

const ROW_HEIGHT      = 22;
const INDENT_WIDTH    = 8;
const ROOT_PADDING    = 8;
const TWISTIE_WIDTH   = 16;

function FolderIcon({ open, size = 14 }: { open: boolean; size?: number }) {
    return open ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
    ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-9l-2-3H4a1 1 0 0 0-1 1z"/>
        </svg>
    );
}

function StarIcon({ size = 11 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
    );
}

function IndentGuides({ depth }: { depth: number }) {
    if (depth === 0) return null;
    const guides: React.ReactNode[] = [];
    for (let i = 0; i < depth; i++) {
        const left = ROOT_PADDING + i * INDENT_WIDTH + INDENT_WIDTH / 2;
        guides.push(
            <span
                key={i}
                style={{
                    position: "absolute",
                    left,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    background: C.indentGuide(),
                    opacity: 0.5,
                    pointerEvents: "none",
                }}
            />
        );
    }
    return <>{guides}</>;
}

/**
 * Inline edit input shown either in place of a row's name (rename) or as a
 * ghost row (create). VS Code semantics:
 *   - Enter commits; if the parent rejects (returns an error), the input
 *     stays open with the error tooltip below it.
 *   - Escape cancels.
 *   - Blur silently cancels — clicking elsewhere shouldn't surface a
 *     validation message for an attempt the user already abandoned.
 *   - Empty value is treated as cancel.
 * For renames, the basename (text before the last `.`) is pre-selected so
 * pressing a key replaces the name without losing the extension.
 */
type InlineEditInputProps = {
    initialValue: string;
    error: string | null;
    onCommit: (value: string) => void;
    onCancel: () => void;
};

function InlineEditInput({ initialValue, error, onCommit, onCancel }: InlineEditInputProps) {
    const ref = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        const v = el.value;
        const dot = v.lastIndexOf(".");
        if (dot > 0) el.setSelectionRange(0, dot);
        else el.select();
    }, []);
    return (
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <input
                ref={ref}
                defaultValue={initialValue}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                        e.preventDefault();
                        onCommit(e.currentTarget.value);
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        onCancel();
                    }
                }}
                onBlur={() => onCancel()}
                style={{
                    width: "100%",
                    height: 18,
                    padding: "0 4px",
                    background: C.inputBg(),
                    color: C.inputFg(),
                    border: `1px solid ${error ? C.validationErrBd() : C.focusBorder()}`,
                    outline: "none",
                    fontFamily: "inherit",
                    fontSize: token.font.size.fs12,
                    boxSizing: "border-box",
                }}
            />
            {error && (
                <div style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 1,
                    padding: "2px 6px",
                    background: C.validationErrBg(),
                    border: `1px solid ${C.validationErrBd()}`,
                    color: C.menuFg(),
                    fontSize: token.font.size.fs10,
                    lineHeight: 1.4,
                    zIndex: 60,
                    whiteSpace: "normal",
                }}>
                    {error}
                </div>
            )}
        </div>
    );
}

const FileTree: React.FC<FileTreeProps> = ({
    tree,
    entryPath,
    activePath,
    readOnly,
    onOpenFile,
    onCreateFile,
    onCreateFolder,
    onUploadFile,
    onDownloadFile,
    onRename,
    onDelete,
    onSetAsEntry,
    onMove,
}) => {
    const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
        const open: Record<string, boolean> = {};
        const segs = activePath.split("/");
        for (let i = 0; i < segs.length - 1; i++) {
            const p = segs.slice(0, i + 1).join("/");
            open[p] = true;
        }
        return open;
    });
    const [menu, setMenu] = useState<ContextMenuState>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const draggingPathRef = useRef<string | null>(null);
    const [editing, setEditing] = useState<EditingState | null>(null);
    const [editError, setEditError] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const toggleFolder = useCallback((path: string) => {
        setOpenFolders(prev => ({ ...prev, [path]: !prev[path] }));
    }, []);

    const closeMenu = useCallback(() => setMenu(null), []);

    const openMenu = useCallback((e: React.MouseEvent, target: ContextMenuTarget) => {
        e.preventDefault();
        e.stopPropagation();
        if (readOnly) return;
        setMenu({ target, x: e.clientX, y: e.clientY });
    }, [readOnly]);

    // Close the menu on outside interaction. We listen on `mousedown` rather
    // than `click` because right-click only fires `mousedown` + `contextmenu`
    // (no `click`) — using mousedown means the close happens *before* the
    // next `contextmenu` opens its own menu, so right-clicking another row
    // while a menu is already open correctly opens that row's menu instead
    // of the original. `Escape` provides a keyboard escape hatch.
    useEffect(() => {
        if (!menu) return;
        const onMouseDown = (e: MouseEvent) => {
            if (menuRef.current?.contains(e.target as Node)) return;
            setMenu(null);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setMenu(null);
        };
        document.addEventListener("mousedown", onMouseDown, true);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onMouseDown, true);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [menu]);

    const expandAncestors = useCallback((path: string) => {
        if (!path) return;
        const segs = path.split("/");
        const updates: Record<string, boolean> = {};
        for (let i = 0; i < segs.length; i++) {
            updates[segs.slice(0, i + 1).join("/")] = true;
        }
        setOpenFolders(prev => ({ ...prev, ...updates }));
    }, []);

    const beginRename = useCallback((path: string, isFolder: boolean) => {
        const name = path.split("/").pop() ?? "";
        setEditError(null);
        setEditing({ mode: "rename", path, initialValue: name, isFolder });
        // Make sure the row is visible — expand all ancestors.
        const slash = path.lastIndexOf("/");
        if (slash >= 0) expandAncestors(path.slice(0, slash));
    }, [expandAncestors]);

    const beginCreate = useCallback((parentPath: string, kind: "file" | "folder") => {
        setEditError(null);
        setEditing({
            mode: kind === "file" ? "create-file" : "create-folder",
            parentPath,
        });
        expandAncestors(parentPath);
    }, [expandAncestors]);

    const cancelEdit = useCallback(() => {
        setEditing(null);
        setEditError(null);
    }, []);

    // Enter pathway: try to commit; on error keep the input open with the
    // message. Empty trims to cancel so users can type-then-Enter to bail.
    const commitEdit = useCallback((rawName: string) => {
        if (!editing) return;
        const name = rawName.trim();
        if (!name) { cancelEdit(); return; }
        let err: string | null = null;
        if (editing.mode === "rename") {
            if (name === editing.initialValue) { cancelEdit(); return; }
            err = onRename(editing.path, name);
        } else if (editing.mode === "create-file") {
            err = onCreateFile(editing.parentPath, name);
        } else {
            err = onCreateFolder(editing.parentPath, name);
        }
        if (err) setEditError(err);
        else cancelEdit();
    }, [editing, onCreateFile, onCreateFolder, onRename, cancelEdit]);

    const handleRowDragStart = useCallback((e: React.DragEvent, srcPath: string) => {
        if (readOnly) { e.preventDefault(); return; }
        draggingPathRef.current = srcPath;
        e.dataTransfer.setData(DRAG_MIME, srcPath);
        e.dataTransfer.setData("text/plain", srcPath);
        e.dataTransfer.effectAllowed = "move";
    }, [readOnly]);

    const isDropAllowed = useCallback((destDir: string): string | null => {
        const srcPath = draggingPathRef.current;
        if (!srcPath) return null;
        const srcParent = srcPath.includes("/") ? srcPath.slice(0, srcPath.lastIndexOf("/")) : "";
        if (srcParent === destDir) return null;
        if (destDir === srcPath || destDir.startsWith(srcPath + "/")) return null;
        return srcPath;
    }, []);

    const handleRowDragOver = useCallback((e: React.DragEvent, destDir: string) => {
        if (readOnly) return;
        if (!isDropAllowed(destDir)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        if (dropTarget !== destDir) setDropTarget(destDir);
    }, [isDropAllowed, dropTarget, readOnly]);

    const handleRowDrop = useCallback((e: React.DragEvent, destDir: string) => {
        if (readOnly) return;
        const src = isDropAllowed(destDir);
        setDropTarget(null);
        if (!src) return;
        e.preventDefault();
        e.stopPropagation();
        draggingPathRef.current = null;
        onMove(src, destDir);
    }, [isDropAllowed, onMove, readOnly]);

    const handleRowDragEnd = useCallback(() => {
        draggingPathRef.current = null;
        setDropTarget(null);
    }, []);

    // Rename / Delete shortcuts. Each row button stashes its path/kind in
    // data-attributes so we can pick up the focused row from the keydown
    // target without wiring per-button handlers. Editor-side F2 still
    // triggers clangd's rename-symbol because that keydown never bubbles
    // out of Monaco.
    //
    // The rename key is platform-dependent (Enter on macOS, F2 elsewhere).
    // For Enter we MUST preventDefault — the row is a <button>, so Enter
    // would otherwise fire its implicit click and toggle the folder /
    // re-open the file before our rename takes effect.
    const handleTreeKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (readOnly || editing) return;
        const targetEl = e.target as HTMLElement | null;
        const path = targetEl?.dataset?.path;
        const kind = targetEl?.dataset?.kind;
        if (!path || (kind !== "file" && kind !== "folder")) return;
        if (e.key === RENAME_SHORTCUT_KEY) {
            e.preventDefault();
            e.stopPropagation();
            beginRename(path, kind === "folder");
        } else if (e.key === "Delete") {
            e.preventDefault();
            e.stopPropagation();
            onDelete(path);
        }
    }, [readOnly, editing, beginRename, onDelete]);

    const rowBase: React.CSSProperties = {
        position: "relative",
        display: "flex",
        alignItems: "center",
        height: ROW_HEIGHT,
        lineHeight: `${ROW_HEIGHT}px`,
        padding: 0,
        margin: 0,
        background: "none",
        border: "none",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: token.font.size.fs12,
        whiteSpace: "nowrap",
        color: C.sideBarFg(),
    };

    const renderGhostRow = (depth: number, isFolder: boolean) => {
        const indentPx = ROOT_PADDING + depth * INDENT_WIDTH;
        return (
            <div key="__ghost" style={{ ...rowBase, cursor: "default", overflow: "visible" }}>
                <IndentGuides depth={depth} />
                <span style={{ display: "inline-block", width: TWISTIE_WIDTH, marginLeft: indentPx }} />
                <span style={{ display: "inline-flex", alignItems: "center", marginRight: 6, color: C.iconFg() }}>
                    {isFolder ? <FolderIcon open={false} size={14} /> : <Icon.File size={14} />}
                </span>
                <InlineEditInput
                    initialValue=""
                    error={editError}
                    onCommit={commitEdit}
                    onCancel={cancelEdit}
                />
            </div>
        );
    };

    const renderNodes = (nodes: TreeNode[], depth: number, parentPath: string): React.ReactNode[] => {
        const result: React.ReactNode[] = [];

        // Ghost row at the top of this level when creating in this parent.
        if (
            editing && (editing.mode === "create-file" || editing.mode === "create-folder")
            && editing.parentPath === parentPath
        ) {
            result.push(renderGhostRow(depth, editing.mode === "create-folder"));
        }

        for (const node of nodes) {
            const path = parentPath ? `${parentPath}/${node.name}` : node.name;
            const indentPx = ROOT_PADDING + depth * INDENT_WIDTH;
            const isRenamingThis = editing?.mode === "rename" && editing.path === path;

            if (node.type === "folder") {
                const isOpen = !!openFolders[path];
                const isDropHere = dropTarget === path;
                result.push(
                    <React.Fragment key={path}>
                        <button
                            type="button"
                            data-path={path}
                            data-kind="folder"
                            draggable={!readOnly && !isRenamingThis}
                            onDragStart={e => handleRowDragStart(e, path)}
                            onDragEnd={handleRowDragEnd}
                            onDragOver={e => handleRowDragOver(e, path)}
                            onDragLeave={() => { if (dropTarget === path) setDropTarget(null); }}
                            onDrop={e => handleRowDrop(e, path)}
                            onClick={() => { if (!isRenamingThis) toggleFolder(path); }}
                            onContextMenu={e => openMenu(e, { kind: "folder", path })}
                            style={{ ...rowBase, background: isDropHere ? C.activeBg() : "transparent", overflow: isRenamingThis ? "visible" : "hidden" }}
                            onMouseEnter={e => { if (!isDropHere && !isRenamingThis) e.currentTarget.style.background = C.hoverBg(); }}
                            onMouseLeave={e => { if (!isDropHere && !isRenamingThis) e.currentTarget.style.background = "transparent"; }}
                        >
                            <IndentGuides depth={depth} />
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: TWISTIE_WIDTH, marginLeft: indentPx, color: C.iconFg() }}>
                                <Icon.Chevron size={10} dir={isOpen ? "down" : "right"} />
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", marginRight: 6, color: C.iconFg() }}>
                                <FolderIcon open={isOpen} size={14} />
                            </span>
                            {isRenamingThis ? (
                                <InlineEditInput
                                    initialValue={editing.initialValue}
                                    error={editError}
                                    onCommit={commitEdit}
                                    onCancel={cancelEdit}
                                />
                            ) : (
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {node.name}
                                </span>
                            )}
                        </button>
                        {isOpen && renderNodes((node as FolderNode).contents, depth + 1, path)}
                    </React.Fragment>
                );
                continue;
            }

            const isActive = path === activePath;
            const isEntry  = path === entryPath;
            result.push(
                <button
                    key={path}
                    type="button"
                    data-path={path}
                    data-kind="file"
                    draggable={!readOnly && !isRenamingThis}
                    onDragStart={e => handleRowDragStart(e, path)}
                    onDragEnd={handleRowDragEnd}
                    onClick={() => { if (!isRenamingThis) onOpenFile(path); }}
                    onContextMenu={e => openMenu(e, { kind: "file", path })}
                    style={{
                        ...rowBase,
                        background: isActive ? C.activeBg() : "transparent",
                        color:      isActive ? C.activeFg() : C.sideBarFg(),
                        overflow:   isRenamingThis ? "visible" : "hidden",
                    }}
                    onMouseEnter={e => { if (!isActive && !isRenamingThis) e.currentTarget.style.background = C.hoverBg(); }}
                    onMouseLeave={e => { if (!isActive && !isRenamingThis) e.currentTarget.style.background = "transparent"; }}
                >
                    <IndentGuides depth={depth} />
                    <span style={{ display: "inline-block", width: TWISTIE_WIDTH, marginLeft: indentPx }} />
                    <span style={{ display: "inline-flex", alignItems: "center", marginRight: 6 }}>
                        <FileIcon name={node.name} isEntry={isEntry} size={16} />
                    </span>
                    {isRenamingThis ? (
                        <InlineEditInput
                            initialValue={editing.initialValue}
                            error={editError}
                            onCommit={commitEdit}
                            onCancel={cancelEdit}
                        />
                    ) : (
                        <>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                                {node.name}
                            </span>
                            {isEntry && (
                                <span title="Entry" style={{ display: "inline-flex", color: token.color.warning, marginRight: 8 }}>
                                    <StarIcon size={10} />
                                </span>
                            )}
                        </>
                    )}
                </button>
            );
        }

        return result;
    };

    type MenuItem = {
        label: string;
        /** Right-aligned shortcut text, e.g. `"F2"`, `"Del"`. Display-only — the
         *  actual keybinding lives in handleTreeKeyDown / native editor handlers. */
        shortcut?: string;
        onClick: () => void;
        danger?: boolean;
        /** Render a separator line directly above this item. */
        separatorBefore?: boolean;
    };

    const menuItems = useMemo<MenuItem[]>(() => {
        if (!menu) return [];
        const t = menu.target;
        if (t.kind === "file") {
            return [
                { label: "다운로드", onClick: () => onDownloadFile(t.path) },
                { label: "이름 변경", shortcut: RENAME_SHORTCUT_LABEL, onClick: () => beginRename(t.path, false), separatorBefore: true },
                ...(t.path !== entryPath ? [{ label: "Entry 로 설정", onClick: () => onSetAsEntry(t.path) }] : []),
                { label: "삭제", shortcut: "Del", onClick: () => onDelete(t.path), danger: true, separatorBefore: true },
            ];
        }
        if (t.kind === "folder") {
            return [
                { label: "새 파일", onClick: () => beginCreate(t.path, "file") },
                { label: "새 폴더", onClick: () => beginCreate(t.path, "folder") },
                { label: "파일 업로드…", onClick: () => onUploadFile(t.path) },
                { label: "이름 변경", shortcut: RENAME_SHORTCUT_LABEL, onClick: () => beginRename(t.path, true), separatorBefore: true },
                { label: "삭제", shortcut: "Del", onClick: () => onDelete(t.path), danger: true, separatorBefore: true },
            ];
        }
        return [
            { label: "새 파일", onClick: () => beginCreate("", "file") },
            { label: "새 폴더", onClick: () => beginCreate("", "folder") },
            { label: "파일 업로드…", onClick: () => onUploadFile("") },
        ];
    }, [menu, entryPath, beginRename, beginCreate, onUploadFile, onDownloadFile, onDelete, onSetAsEntry]);

    return (
        <div
            onContextMenu={e => openMenu(e, { kind: "root" })}
            onKeyDown={handleTreeKeyDown}
            style={{
                display: "flex", flexDirection: "column",
                width: 240, flexShrink: 0,
                borderRight: `1px solid ${C.sectionBorder()}`,
                background: C.sideBarBg(),
                color: C.sideBarFg(),
                overflow: "hidden",
                userSelect: "none",
            }}
        >
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                height: 22,
                padding: "0 16px 0 20px",
                background: C.sectionHeaderBg(),
                borderBottom: `1px solid ${C.sectionBorder()}`,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                color: C.sectionHeaderFg(),
                fontWeight: 700,
            }}>
                <span>EXPLORER</span>
                {!readOnly && (
                    <span style={{ display: "inline-flex", gap: 2 }}>
                        <button
                            type="button"
                            title="새 파일"
                            onClick={() => beginCreate("", "file")}
                            style={{ background: "none", border: "none", cursor: "pointer", color: C.iconFg(), padding: 2, display: "inline-flex" }}
                        >
                            <Icon.Plus size={12} />
                        </button>
                        <button
                            type="button"
                            title="새 폴더"
                            onClick={() => beginCreate("", "folder")}
                            style={{ background: "none", border: "none", cursor: "pointer", color: C.iconFg(), padding: 2, display: "inline-flex" }}
                        >
                            <FolderIcon open={false} size={12} />
                        </button>
                        <button
                            type="button"
                            title="파일 업로드"
                            onClick={() => onUploadFile("")}
                            style={{ background: "none", border: "none", cursor: "pointer", color: C.iconFg(), padding: 2, display: "inline-flex" }}
                        >
                            <Icon.Upload size={12} />
                        </button>
                    </span>
                )}
            </div>
            <div
                onDragOver={e => handleRowDragOver(e, "")}
                onDragLeave={() => { if (dropTarget === "") setDropTarget(null); }}
                onDrop={e => handleRowDrop(e, "")}
                style={{
                    flex: 1, overflowY: "auto", padding: "2px 0",
                    outline: dropTarget === "" ? `1px solid ${C.focusBorder()}` : "none",
                    outlineOffset: -1,
                }}
            >
                {tree.length === 0 && !(editing && (editing.mode === "create-file" || editing.mode === "create-folder") && editing.parentPath === "") ? (
                    <div style={{ padding: "8px 20px", fontSize: token.font.size.fs12, color: C.sideBarFg(), opacity: 0.7 }}>
                        파일이 없습니다
                    </div>
                ) : renderNodes(tree, 0, "")}
            </div>

            {menu && (
                <div
                    ref={menuRef}
                    onContextMenu={e => e.preventDefault()}
                    style={{
                            position: "fixed",
                            top: menu.y, left: menu.x,
                            background: C.menuBg(),
                            color: C.menuFg(),
                            border: `1px solid ${C.menuBorder()}`,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.36)",
                            zIndex: 50,
                            minWidth: 200,
                            padding: "4px 0",
                            fontSize: token.font.size.fs13,
                        }}
                    >
                        {menuItems.map((item, i) => (
                            <React.Fragment key={i}>
                                {item.separatorBefore && (
                                    <div
                                        aria-hidden
                                        style={{
                                            height: 1,
                                            background: C.menuSeparator(),
                                            margin: "4px 0",
                                            opacity: 0.6,
                                        }}
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={() => { item.onClick(); closeMenu(); }}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        width: "100%",
                                        // VS Code reserves a 22px icon slot on the
                                        // left even when no icon is rendered, plus
                                        // ~14px trailing padding for the shortcut.
                                        padding: "0 14px 0 26px",
                                        height: 22,
                                        lineHeight: "22px",
                                        background: "none",
                                        border: "none",
                                        textAlign: "left",
                                        cursor: "pointer",
                                        color: item.danger ? C.danger() : C.menuFg(),
                                        fontFamily: "inherit",
                                        fontSize: "inherit",
                                        whiteSpace: "nowrap",
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = C.menuSelectionBg();
                                        if (!item.danger) e.currentTarget.style.color = C.menuSelectionFg();
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = "transparent";
                                        e.currentTarget.style.color = item.danger ? C.danger() : C.menuFg();
                                    }}
                                >
                                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {item.label}
                                    </span>
                                    {item.shortcut && (
                                        <span style={{
                                            marginLeft: 28,
                                            color: "inherit",
                                            opacity: 0.7,
                                            fontSize: token.font.size.fs11,
                                        }}>
                                            {item.shortcut}
                                        </span>
                                    )}
                                </button>
                            </React.Fragment>
                        ))}
                </div>
            )}
        </div>
    );
};

export default FileTree;
