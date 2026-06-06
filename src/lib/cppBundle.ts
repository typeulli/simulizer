// C++ project bundle — a multi-file project serialized as a single JSON blob.
//
// Stored in the `files.content` column of backend-auth as a JSON string. The
// outer DB row's `name` is the project name (no extension). Path strings used
// by `entry`/`ui.activeFile`/`ui.openTabs` join folder/file names with `/`.

export const BUNDLE_VERSION = 1;

export const ALLOWED_EXTENSIONS = [".cpp", ".hpp", ".json"] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export type FileNode = {
    type: "file";
    name: string;
    content: string;
};

export type FolderNode = {
    type: "folder";
    name: string;
    contents: TreeNode[];
};

export type TreeNode = FileNode | FolderNode;

export type BundleUI = {
    activeFile: string;
    openTabs: string[];
    treeOpen: boolean;
};

export type CppBundle = {
    version: number;
    entry: string;
    tree: TreeNode[];
    ui: BundleUI;
};

export const INITIAL_MAIN_CONTENT = `#include "simstd.hpp"

int worker() {
    auto a = matrix_create(2, 3);
    a(0, 0) = 1.0; a(0, 1) = 2.0; a(0, 2) = 3.0;
    a(1, 0) = 4.0; a(1, 1) = 5.0; a(1, 2) = 6.0;

    auto b = matrix_transpose(a);
    auto c = matrix_matmul(a, b);

    show_mat(c);
    debug_log(c);
    return 0;
}
`;

export function makeDefaultBundle(): CppBundle {
    return {
        version: BUNDLE_VERSION,
        entry: "main.cpp",
        tree: [{ type: "file", name: "main.cpp", content: INITIAL_MAIN_CONTENT }],
        ui: {
            activeFile: "main.cpp",
            openTabs: ["main.cpp"],
            treeOpen: false,
        },
    };
}

// Accepts a content string from the DB. If it's valid bundle JSON, returns it
// (with missing optional fields filled in). Otherwise treats it as legacy
// single-file C++ source and wraps it as { main.cpp: <raw> }. The empty "{}"
// placeholder created by the dashboard for new files is also normalized here.
export function parseBundle(raw: string): CppBundle {
    if (!raw || raw === "{}") return makeDefaultBundle();
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.version === BUNDLE_VERSION) {
            return normalizeBundle(parsed);
        }
    } catch {
        // fall through — legacy plain C++ source
    }
    return {
        version: BUNDLE_VERSION,
        entry: "main.cpp",
        tree: [{ type: "file", name: "main.cpp", content: raw }],
        ui: { activeFile: "main.cpp", openTabs: ["main.cpp"], treeOpen: false },
    };
}

function normalizeBundle(b: any): CppBundle {
    const tree = Array.isArray(b.tree) ? (b.tree as TreeNode[]) : [];
    const allPaths = new Set(walkFilePaths(tree));
    const entry = typeof b.entry === "string" && allPaths.has(b.entry)
        ? b.entry
        : (allPaths.values().next().value ?? "main.cpp");
    const ui = b.ui ?? {};
    const activeFile = typeof ui.activeFile === "string" && allPaths.has(ui.activeFile)
        ? ui.activeFile
        : entry;
    const openTabs: string[] = Array.isArray(ui.openTabs)
        ? (ui.openTabs as string[]).filter(p => allPaths.has(p))
        : [activeFile];
    if (!openTabs.includes(activeFile)) openTabs.push(activeFile);
    return {
        version: BUNDLE_VERSION,
        entry,
        tree,
        ui: {
            activeFile,
            openTabs,
            treeOpen: !!ui.treeOpen,
        },
    };
}

export function serializeBundle(b: CppBundle): string {
    return JSON.stringify(b);
}

// ────────────────────────────── traversal ──────────────────────────────

export function* walkFilePaths(tree: TreeNode[], prefix = ""): Generator<string> {
    for (const node of tree) {
        const path = prefix ? `${prefix}/${node.name}` : node.name;
        if (node.type === "file") yield path;
        else yield* walkFilePaths(node.contents, path);
    }
}

export function listFiles(tree: TreeNode[]): { path: string; file: FileNode }[] {
    const out: { path: string; file: FileNode }[] = [];
    const walk = (nodes: TreeNode[], prefix: string) => {
        for (const node of nodes) {
            const path = prefix ? `${prefix}/${node.name}` : node.name;
            if (node.type === "file") out.push({ path, file: node });
            else walk(node.contents, path);
        }
    };
    walk(tree, "");
    return out;
}

export function findFile(tree: TreeNode[], path: string): FileNode | null {
    const parts = path.split("/");
    let nodes: TreeNode[] = tree;
    for (let i = 0; i < parts.length - 1; i++) {
        const folder = nodes.find(n => n.name === parts[i] && n.type === "folder") as FolderNode | undefined;
        if (!folder) return null;
        nodes = folder.contents;
    }
    const leaf = nodes.find(n => n.name === parts[parts.length - 1] && n.type === "file");
    return (leaf ?? null) as FileNode | null;
}

export function pathExists(tree: TreeNode[], path: string): boolean {
    const parts = path.split("/");
    let nodes: TreeNode[] = tree;
    for (let i = 0; i < parts.length - 1; i++) {
        const folder = nodes.find(n => n.name === parts[i] && n.type === "folder") as FolderNode | undefined;
        if (!folder) return false;
        nodes = folder.contents;
    }
    return nodes.some(n => n.name === parts[parts.length - 1]);
}

// ────────────────────────────── validation ──────────────────────────────

const NAME_RE = /^[A-Za-z0-9_.\- ]+$/;

export function getExtension(name: string): string {
    const dot = name.lastIndexOf(".");
    if (dot < 0) return "";
    return name.slice(dot).toLowerCase();
}

export function validateFileName(name: string): string | null {
    if (!name) return "이름이 비어 있습니다";
    if (name.includes("/") || name.includes("\\")) return "이름에 슬래시를 쓸 수 없습니다";
    if (!NAME_RE.test(name)) return "파일명에 허용되지 않는 문자가 있습니다";
    const ext = getExtension(name) as AllowedExtension;
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return `허용되지 않는 확장자입니다 (${ALLOWED_EXTENSIONS.join(", ")} 만 가능)`;
    }
    return null;
}

export function validateFolderName(name: string): string | null {
    if (!name) return "이름이 비어 있습니다";
    if (name.includes("/") || name.includes("\\")) return "이름에 슬래시를 쓸 수 없습니다";
    if (!NAME_RE.test(name)) return "폴더명에 허용되지 않는 문자가 있습니다";
    if (name.startsWith(".")) return "폴더명이 점으로 시작할 수 없습니다";
    return null;
}

// ────────────────────────────── mutation ──────────────────────────────

function cloneTree(tree: TreeNode[]): TreeNode[] {
    return tree.map(n => n.type === "file"
        ? { type: "file", name: n.name, content: n.content }
        : { type: "folder", name: n.name, contents: cloneTree(n.contents) });
}

function findFolderAt(tree: TreeNode[], folderPath: string): TreeNode[] | null {
    if (!folderPath) return tree;
    const parts = folderPath.split("/");
    let nodes: TreeNode[] = tree;
    for (const part of parts) {
        const f = nodes.find(n => n.name === part && n.type === "folder") as FolderNode | undefined;
        if (!f) return null;
        nodes = f.contents;
    }
    return nodes;
}

export function splitPath(path: string): { dir: string; base: string } {
    const slash = path.lastIndexOf("/");
    if (slash < 0) return { dir: "", base: path };
    return { dir: path.slice(0, slash), base: path.slice(slash + 1) };
}

// Updates the content of an existing file. Returns a new tree.
export function setFileContent(tree: TreeNode[], path: string, content: string): TreeNode[] {
    const parts = path.split("/");
    const recur = (nodes: TreeNode[], idx: number): TreeNode[] => {
        return nodes.map(n => {
            if (n.name !== parts[idx]) return n;
            if (idx === parts.length - 1 && n.type === "file") {
                return { ...n, content };
            }
            if (n.type === "folder" && idx < parts.length - 1) {
                return { ...n, contents: recur(n.contents, idx + 1) };
            }
            return n;
        });
    };
    return recur(tree, 0);
}

// Creates a file at `path`. Intermediate folders are created automatically.
// Returns the new tree, or null if the path already exists.
export function addFile(tree: TreeNode[], path: string, content: string): TreeNode[] | null {
    if (pathExists(tree, path)) return null;
    const parts = path.split("/");
    const next = cloneTree(tree);
    let nodes: TreeNode[] = next;
    for (let i = 0; i < parts.length - 1; i++) {
        let folder = nodes.find(n => n.name === parts[i] && n.type === "folder") as FolderNode | undefined;
        if (!folder) {
            // Refuse to overwrite a file as a folder.
            if (nodes.some(n => n.name === parts[i])) return null;
            folder = { type: "folder", name: parts[i], contents: [] };
            nodes.push(folder);
        }
        nodes = folder.contents;
    }
    nodes.push({ type: "file", name: parts[parts.length - 1], content });
    return next;
}

export function addFolder(tree: TreeNode[], path: string): TreeNode[] | null {
    if (pathExists(tree, path)) return null;
    const parts = path.split("/");
    const next = cloneTree(tree);
    let nodes: TreeNode[] = next;
    for (let i = 0; i < parts.length; i++) {
        let folder = nodes.find(n => n.name === parts[i] && n.type === "folder") as FolderNode | undefined;
        if (!folder) {
            if (nodes.some(n => n.name === parts[i])) return null;
            folder = { type: "folder", name: parts[i], contents: [] };
            nodes.push(folder);
        }
        nodes = folder.contents;
    }
    return next;
}

// Removes a file or folder at `path`. Empty intermediate folders are NOT
// pruned — the user created them explicitly.
export function removeNode(tree: TreeNode[], path: string): TreeNode[] {
    const parts = path.split("/");
    const recur = (nodes: TreeNode[], idx: number): TreeNode[] => {
        if (idx === parts.length - 1) {
            return nodes.filter(n => n.name !== parts[idx]);
        }
        return nodes.map(n => {
            if (n.name === parts[idx] && n.type === "folder") {
                return { ...n, contents: recur(n.contents, idx + 1) };
            }
            return n;
        });
    };
    return recur(tree, 0);
}

// Moves the node at `srcPath` (file or folder, with its subtree) into the
// folder at `destDir` ("" = project root). Returns the new tree, or null if
// the move is illegal: name collision in dest, or trying to drop a folder
// into itself / one of its descendants.
export function moveNode(tree: TreeNode[], srcPath: string, destDir: string): TreeNode[] | null {
    if (!srcPath) return null;
    // Find the source node so we can preserve its subtree.
    const srcParts = srcPath.split("/");
    const srcName = srcParts[srcParts.length - 1];
    const srcParent = srcParts.slice(0, -1).join("/");
    if (srcParent === destDir) return null; // no-op
    if (destDir === srcPath || destDir.startsWith(srcPath + "/")) return null; // cycle
    const destPath = destDir ? `${destDir}/${srcName}` : srcName;
    if (pathExists(tree, destPath)) return null;
    // Pluck the node out of its current location while keeping its contents.
    let plucked: TreeNode | null = null;
    const pluck = (nodes: TreeNode[], depth: number): TreeNode[] => {
        if (depth === srcParts.length - 1) {
            return nodes.filter(n => {
                if (n.name === srcName) { plucked = n; return false; }
                return true;
            });
        }
        return nodes.map(n => {
            if (n.name === srcParts[depth] && n.type === "folder") {
                return { ...n, contents: pluck(n.contents, depth + 1) };
            }
            return n;
        });
    };
    const without = pluck(tree, 0);
    if (!plucked) return null;
    // Insert at destination. The destination folder must already exist (the
    // FileTree only fires drops on real folders or the root container).
    const dstParts = destDir ? destDir.split("/") : [];
    if (dstParts.length === 0) {
        return [...without, plucked];
    }
    const insert = (nodes: TreeNode[], depth: number): TreeNode[] => {
        return nodes.map(n => {
            if (n.name !== dstParts[depth]) return n;
            if (n.type !== "folder") return n;
            if (depth === dstParts.length - 1) {
                return { ...n, contents: [...n.contents, plucked!] };
            }
            return { ...n, contents: insert(n.contents, depth + 1) };
        });
    };
    return insert(without, 0);
}

// Renames the leaf node at `oldPath` to `newName` (same parent directory).
export function renameNode(tree: TreeNode[], oldPath: string, newName: string): TreeNode[] | null {
    const { dir } = splitPath(oldPath);
    const newPath = dir ? `${dir}/${newName}` : newName;
    if (newPath !== oldPath && pathExists(tree, newPath)) return null;
    const parts = oldPath.split("/");
    const recur = (nodes: TreeNode[], idx: number): TreeNode[] => {
        return nodes.map(n => {
            if (n.name !== parts[idx]) return n;
            if (idx === parts.length - 1) return { ...n, name: newName };
            if (n.type === "folder") return { ...n, contents: recur(n.contents, idx + 1) };
            return n;
        });
    };
    return recur(tree, 0);
}

// Returns all descendant file paths under `path` (inclusive if path is a file).
// Used to figure out which open tabs need to be closed when a folder is removed.
export function descendantFilePaths(tree: TreeNode[], path: string): string[] {
    const parts = path.split("/");
    let nodes: TreeNode[] = tree;
    for (let i = 0; i < parts.length - 1; i++) {
        const folder = nodes.find(n => n.name === parts[i] && n.type === "folder") as FolderNode | undefined;
        if (!folder) return [];
        nodes = folder.contents;
    }
    const leaf = nodes.find(n => n.name === parts[parts.length - 1]);
    if (!leaf) return [];
    if (leaf.type === "file") return [path];
    const out: string[] = [];
    const walk = (folder: FolderNode, prefix: string) => {
        for (const child of folder.contents) {
            const p = `${prefix}/${child.name}`;
            if (child.type === "file") out.push(p);
            else walk(child, p);
        }
    };
    walk(leaf, path);
    return out;
}
