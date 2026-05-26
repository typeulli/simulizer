"use client";
import React, { useCallback, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/atoms/Icons";
import { token } from "@/components/tokens";
import type { TreeNode, FolderNode } from "@/lib/cppBundle";

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
    focusBorder:     () => vscv("focusBorder",                         token.color.accent),
    danger:          () => vscv("errorForeground",                     token.color.danger),
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

export type FileTreeProps = {
    tree: TreeNode[];
    entryPath: string;
    activePath: string;
    readOnly?: boolean;
    onOpenFile: (path: string) => void;
    onCreateFile: (parentPath: string) => void;
    onCreateFolder: (parentPath: string) => void;
    onUploadFile: (parentPath: string) => void;
    onDownloadFile: (path: string) => void;
    onRename: (path: string) => void;
    onDelete: (path: string) => void;
    onSetAsEntry: (path: string) => void;
    /** Move `srcPath` into the folder at `destDir` ("" = project root). */
    onMove: (srcPath: string, destDir: string) => void;
};

const DRAG_MIME = "application/x-simulizer-path";

// VS Code tree row metrics
const ROW_HEIGHT      = 22;     // px, matches workbench listRow.height
const INDENT_WIDTH    = 8;      // px per nesting level
const ROOT_PADDING    = 8;      // px at depth=0
const TWISTIE_WIDTH   = 16;     // px chevron column; file rows leave it empty

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

// Vertical indent guides — one absolutely-positioned 1px line per ancestor
// level, sitting at the column where its chevron would be. Mirrors how the
// workbench renders `tree-indentGuidesStroke`.
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
    // dropTarget=""  means the root drop zone; otherwise it's a folder path.
    // null means no active drag — the prop change toggles row highlighting.
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    // The HTML5 DnD spec hides `dataTransfer.getData()` until the `drop`
    // event for security reasons — `dragover` only sees the type list. Since
    // every drag happens inside this React tree, we track the source path
    // out-of-band so `dragover` can compute drop validity without reading
    // the payload.
    const draggingPathRef = useRef<string | null>(null);

    const toggleFolder = useCallback((path: string) => {
        setOpenFolders(prev => ({ ...prev, [path]: !prev[path] }));
    }, []);

    const handleRowDragStart = useCallback((e: React.DragEvent, srcPath: string) => {
        if (readOnly) { e.preventDefault(); return; }
        draggingPathRef.current = srcPath;
        // Still populate the dataTransfer so the browser shows the drag image
        // and external observers see *something*; the actual move dispatch
        // reads from the ref.
        e.dataTransfer.setData(DRAG_MIME, srcPath);
        e.dataTransfer.setData("text/plain", srcPath);
        e.dataTransfer.effectAllowed = "move";
    }, [readOnly]);

    const isDropAllowed = useCallback((destDir: string): string | null => {
        const srcPath = draggingPathRef.current;
        if (!srcPath) return null;
        const srcParent = srcPath.includes("/") ? srcPath.slice(0, srcPath.lastIndexOf("/")) : "";
        if (srcParent === destDir) return null;                              // same parent → no-op
        if (destDir === srcPath || destDir.startsWith(srcPath + "/")) return null; // cycle
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

    const closeMenu = useCallback(() => setMenu(null), []);

    const openMenu = useCallback((e: React.MouseEvent, target: ContextMenuTarget) => {
        e.preventDefault();
        e.stopPropagation();
        if (readOnly) return;
        setMenu({ target, x: e.clientX, y: e.clientY });
    }, [readOnly]);

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

    const renderNodes = (nodes: TreeNode[], depth: number, parentPath: string): React.ReactNode[] => {
        return nodes.map(node => {
            const path = parentPath ? `${parentPath}/${node.name}` : node.name;
            const indentPx = ROOT_PADDING + depth * INDENT_WIDTH;
            if (node.type === "folder") {
                const isOpen = !!openFolders[path];
                const isDropHere = dropTarget === path;
                return (
                    <React.Fragment key={path}>
                        <button
                            type="button"
                            draggable={!readOnly}
                            onDragStart={e => handleRowDragStart(e, path)}
                            onDragEnd={handleRowDragEnd}
                            onDragOver={e => handleRowDragOver(e, path)}
                            onDragLeave={() => { if (dropTarget === path) setDropTarget(null); }}
                            onDrop={e => handleRowDrop(e, path)}
                            onClick={() => toggleFolder(path)}
                            onContextMenu={e => openMenu(e, { kind: "folder", path })}
                            style={{ ...rowBase, background: isDropHere ? C.activeBg() : "transparent" }}
                            onMouseEnter={e => { if (!isDropHere) e.currentTarget.style.background = C.hoverBg(); }}
                            onMouseLeave={e => { if (!isDropHere) e.currentTarget.style.background = "transparent"; }}
                        >
                            <IndentGuides depth={depth} />
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: TWISTIE_WIDTH, marginLeft: indentPx, color: C.iconFg() }}>
                                <Icon.Chevron size={10} dir={isOpen ? "down" : "right"} />
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", marginRight: 6, color: C.iconFg() }}>
                                <FolderIcon open={isOpen} size={14} />
                            </span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                {node.name}
                            </span>
                        </button>
                        {isOpen && renderNodes((node as FolderNode).contents, depth + 1, path)}
                    </React.Fragment>
                );
            }

            const isActive = path === activePath;
            const isEntry  = path === entryPath;
            return (
                <button
                    key={path}
                    type="button"
                    draggable={!readOnly}
                    onDragStart={e => handleRowDragStart(e, path)}
                    onDragEnd={handleRowDragEnd}
                    onClick={() => onOpenFile(path)}
                    onContextMenu={e => openMenu(e, { kind: "file", path })}
                    style={{
                        ...rowBase,
                        background: isActive ? C.activeBg() : "transparent",
                        color:      isActive ? C.activeFg() : C.sideBarFg(),
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.hoverBg(); }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                    <IndentGuides depth={depth} />
                    {/* Empty twistie slot so file rows align with folder rows. */}
                    <span style={{ display: "inline-block", width: TWISTIE_WIDTH, marginLeft: indentPx }} />
                    <span style={{ display: "inline-flex", alignItems: "center", marginRight: 6, color: C.iconFg() }}>
                        <Icon.File size={14} />
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                        {node.name}
                    </span>
                    {isEntry && (
                        <span title="Entry" style={{ display: "inline-flex", color: token.color.warning, marginRight: 8 }}>
                            <StarIcon size={10} />
                        </span>
                    )}
                </button>
            );
        });
    };

    const menuItems = useMemo<{ label: string; onClick: () => void; danger?: boolean }[]>(() => {
        if (!menu) return [];
        const t = menu.target;
        if (t.kind === "file") {
            return [
                { label: "다운로드", onClick: () => onDownloadFile(t.path) },
                { label: "이름 변경", onClick: () => onRename(t.path) },
                ...(t.path !== entryPath ? [{ label: "Entry 로 설정", onClick: () => onSetAsEntry(t.path) }] : []),
                { label: "삭제", onClick: () => onDelete(t.path), danger: true },
            ];
        }
        if (t.kind === "folder") {
            return [
                { label: "새 파일", onClick: () => onCreateFile(t.path) },
                { label: "새 폴더", onClick: () => onCreateFolder(t.path) },
                { label: "파일 업로드…", onClick: () => onUploadFile(t.path) },
                { label: "이름 변경", onClick: () => onRename(t.path) },
                { label: "삭제", onClick: () => onDelete(t.path), danger: true },
            ];
        }
        return [
            { label: "새 파일", onClick: () => onCreateFile("") },
            { label: "새 폴더", onClick: () => onCreateFolder("") },
            { label: "파일 업로드…", onClick: () => onUploadFile("") },
        ];
    }, [menu, entryPath, onCreateFile, onCreateFolder, onUploadFile, onDownloadFile, onRename, onDelete, onSetAsEntry]);

    return (
        <div
            onContextMenu={e => openMenu(e, { kind: "root" })}
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
                            onClick={() => onCreateFile("")}
                            style={{ background: "none", border: "none", cursor: "pointer", color: C.iconFg(), padding: 2, display: "inline-flex" }}
                        >
                            <Icon.Plus size={12} />
                        </button>
                        <button
                            type="button"
                            title="새 폴더"
                            onClick={() => onCreateFolder("")}
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
                    // Subtle outline on the entire scroll area when dragging
                    // over empty root space so the drop zone is discoverable.
                    outline: dropTarget === "" ? `1px solid ${C.focusBorder()}` : "none",
                    outlineOffset: -1,
                }}
            >
                {tree.length === 0 ? (
                    <div style={{ padding: "8px 20px", fontSize: token.font.size.fs12, color: C.sideBarFg(), opacity: 0.7 }}>
                        파일이 없습니다
                    </div>
                ) : renderNodes(tree, 0, "")}
            </div>

            {menu && (
                <>
                    <div onClick={closeMenu} onContextMenu={e => { e.preventDefault(); closeMenu(); }} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
                    <div style={{
                        position: "fixed",
                        top: menu.y, left: menu.x,
                        background: C.menuBg(),
                        color: C.menuFg(),
                        border: `1px solid ${C.menuBorder()}`,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                        zIndex: 50,
                        minWidth: 160,
                        padding: "4px 0",
                        fontSize: token.font.size.fs12,
                    }}>
                        {menuItems.map((item, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => { item.onClick(); closeMenu(); }}
                                style={{
                                    display: "flex", alignItems: "center",
                                    width: "100%",
                                    padding: "4px 26px 4px 14px",
                                    height: 22,
                                    lineHeight: "22px",
                                    background: "none",
                                    border: "none",
                                    textAlign: "left",
                                    cursor: "pointer",
                                    color: item.danger ? C.danger() : C.menuFg(),
                                    fontFamily: "inherit",
                                    fontSize: "inherit",
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
                                {item.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default FileTree;
