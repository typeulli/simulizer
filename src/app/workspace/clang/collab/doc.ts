// Y.Doc ⇆ CppBundle mapping for ClangWorkspace collaboration.
//
// Document shape (agreed design):
//   - texts : Y.Map<string, Y.Text>   — one Y.Text per *text* file, keyed by
//                                        workspace path. Char-level CRDT merge;
//                                        this is what MonacoBinding binds to.
//   - meta  : Y.Map  with key "structure" holding a { tree, entry } snapshot,
//                                        where text-file contents are blanked
//                                        (the live text lives in `texts`). Binary
//                                        files keep their base64 content inline.
//                                        Structure is last-write-wins.
//
// Per-user state (activeFile / openTabs / treeOpen / breakpoints) is NOT shared
// — it stays in each client's local bundle.ui.

import * as Y from "yjs";
import {
    type CppBundle,
    type TreeNode,
    isBinaryName,
    listFiles,
} from "@/lib/cppBundle";

export type StructureSnapshot = { tree: TreeNode[]; entry: string };

export const TEXTS_KEY = "texts";
export const META_KEY = "meta";
export const STRUCTURE_FIELD = "structure";

export function getTexts(doc: Y.Doc): Y.Map<Y.Text> {
    return doc.getMap<Y.Text>(TEXTS_KEY);
}
export function getMeta(doc: Y.Doc): Y.Map<unknown> {
    return doc.getMap<unknown>(META_KEY);
}

/** Deep-clone a tree, blanking text-file contents (kept in `texts`). */
function stripTextContents(tree: TreeNode[]): TreeNode[] {
    return tree.map(n => {
        if (n.type === "folder") {
            return { type: "folder", name: n.name, contents: stripTextContents(n.contents) };
        }
        const isBinary = !!n.encoding || isBinaryName(n.name);
        return isBinary
            ? { type: "file", name: n.name, content: n.content, ...(n.encoding ? { encoding: n.encoding } : {}) }
            : { type: "file", name: n.name, content: "" };
    });
}

/** Rehydrate a stripped tree, filling text-file contents from `texts`. */
function fillTextContents(tree: TreeNode[], texts: Y.Map<Y.Text>, prefix = ""): TreeNode[] {
    return tree.map(n => {
        const path = prefix ? `${prefix}/${n.name}` : n.name;
        if (n.type === "folder") {
            return { type: "folder", name: n.name, contents: fillTextContents(n.contents, texts, path) };
        }
        const isBinary = !!n.encoding || isBinaryName(n.name);
        if (isBinary) {
            return { type: "file", name: n.name, content: n.content, ...(n.encoding ? { encoding: n.encoding } : {}) };
        }
        const yt = texts.get(path);
        return { type: "file", name: n.name, content: yt ? yt.toString() : n.content };
    });
}

/** Whether the shared doc has been seeded yet. */
export function isDocEmpty(doc: Y.Doc): boolean {
    return getMeta(doc).get(STRUCTURE_FIELD) === undefined && getTexts(doc).size === 0;
}

/**
 * Seed an empty doc from a bundle (owner-only, once). Writes the structure
 * snapshot and a Y.Text per text file. Wrapped in a transaction so peers see
 * one atomic update.
 */
export function seedDoc(doc: Y.Doc, bundle: CppBundle): void {
    doc.transact(() => {
        const texts = getTexts(doc);
        for (const { path, file } of listFiles(bundle.tree)) {
            if (file.encoding || isBinaryName(file.name)) continue;
            if (!texts.has(path)) {
                const yt = new Y.Text();
                yt.insert(0, file.content ?? "");
                texts.set(path, yt);
            }
        }
        const snapshot: StructureSnapshot = { tree: stripTextContents(bundle.tree), entry: bundle.entry };
        getMeta(doc).set(STRUCTURE_FIELD, snapshot);
    });
}

/**
 * Push the current structure (tree + entry) to the doc and reconcile the
 * `texts` map: create a Y.Text for newly-added text files (seeded from the
 * bundle), drop Y.Texts for removed files. Content edits to *existing* files
 * are NOT touched here — MonacoBinding owns those. Call this from the client
 * that performed a structural change (add/remove/rename/move/entry).
 */
export function pushStructure(doc: Y.Doc, bundle: CppBundle): void {
    doc.transact(() => {
        const texts = getTexts(doc);
        const wantTextPaths = new Set<string>();
        for (const { path, file } of listFiles(bundle.tree)) {
            if (file.encoding || isBinaryName(file.name)) continue;
            wantTextPaths.add(path);
            if (!texts.has(path)) {
                const yt = new Y.Text();
                yt.insert(0, file.content ?? "");
                texts.set(path, yt);
            }
        }
        for (const key of Array.from(texts.keys())) {
            if (!wantTextPaths.has(key)) texts.delete(key);
        }
        const snapshot: StructureSnapshot = { tree: stripTextContents(bundle.tree), entry: bundle.entry };
        getMeta(doc).set(STRUCTURE_FIELD, snapshot);
    });
}

/**
 * Programmatically replace a text file's content in the doc (creating the
 * Y.Text if absent). Used for non-editor writes such as the settings GUI
 * rewriting config.json — editor typing already flows through MonacoBinding.
 * A whole-content replace; fine for these infrequent programmatic writes.
 */
export function setText(doc: Y.Doc, path: string, content: string): void {
    const texts = getTexts(doc);
    doc.transact(() => {
        let yt = texts.get(path);
        if (!yt) {
            yt = new Y.Text();
            texts.set(path, yt);
        }
        if (yt.toString() === content) return;
        yt.delete(0, yt.length);
        yt.insert(0, content);
    });
}

/**
 * Remap text-file paths after a rename/move, preserving each Y.Text's content
 * (read from the authoritative Y.Text, not a possibly-stale bundle mirror).
 * `rewrite` maps an old path to its new path (identity for unaffected files).
 */
export function remapTextPaths(doc: Y.Doc, rewrite: (path: string) => string): void {
    const texts = getTexts(doc);
    doc.transact(() => {
        for (const oldPath of Array.from(texts.keys())) {
            const newPath = rewrite(oldPath);
            if (newPath === oldPath) continue;
            const content = texts.get(oldPath)?.toString() ?? "";
            texts.delete(oldPath);
            const yt = new Y.Text();
            yt.insert(0, content);
            texts.set(newPath, yt);
        }
    });
}

/** Read the shared structure (tree with text contents filled from `texts`). */
export function readSharedTree(doc: Y.Doc): StructureSnapshot | null {
    const snapshot = getMeta(doc).get(STRUCTURE_FIELD) as StructureSnapshot | undefined;
    if (!snapshot) return null;
    return {
        tree: fillTextContents(snapshot.tree, getTexts(doc)),
        entry: snapshot.entry,
    };
}
