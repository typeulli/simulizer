// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TreeNode {
    content: number;
    children?: TreeNode[];
}

export interface DeleteOp {
    type: "delete";
    parentIdx: number;
    childIdx: number;
    cost: number;
}

export interface InsertOp {
    type: "insert";
    parentIdx: number;
    childIdx: number;
    cost: number;
    nodeIdx: number;
}

export type DiffOp = DeleteOp | InsertOp;

export interface DiffResult {
    sizeA: number;
    sizeB: number;
    common: number;
    cost: number;
    ops: DiffOp[];
}

// ---------------------------------------------------------------------------
// Wasm module shape (minimal — extend if you expose more bindings)
// ---------------------------------------------------------------------------

interface TreeDiffModule {
    treeDiff(a: TreeNode, b: TreeNode): DiffResult;
}

// ---------------------------------------------------------------------------
// Module loader
// Emscripten generates a factory function as the default export of the .js
// glue file (compiled with `-s MODULARIZE=1 -s EXPORT_NAME=createTreeDiff`).
// ---------------------------------------------------------------------------

declare function createTreeDiff(): Promise<TreeDiffModule>;

let _module: TreeDiffModule | null = null;

async function getModule(): Promise<TreeDiffModule> {
    if (_module) return _module;
    _module = await createTreeDiff();
    return _module;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the minimum-cost edit script that transforms tree `a` into tree `b`.
 *
 * Cost model:
 *   DELETE subtree of size k  →  cost k
 *   INSERT subtree of size k  →  cost k
 * Total cost = |a| + |b| − 2 × (max common matched nodes)
 *
 * Algorithm: bottom-up DP + LCS on ordered trees, O(|a| × |b|).
 */
export async function treeDiff(a: TreeNode, b: TreeNode): Promise<DiffResult> {
    const mod = await getModule();
    return mod.treeDiff(a, b);
}

/**
 * Synchronous variant — only safe to call after the module has been
 * initialised by at least one `await treeDiff(...)` call.
 */
export function treeDiffSync(a: TreeNode, b: TreeNode): DiffResult {
    if (!_module) throw new Error("TreeDiff wasm module not yet initialised. Call treeDiff() first.");
    return _module.treeDiff(a, b);
}

/**
 * Eagerly initialise the wasm module.
 * Call this once at application startup if you need `treeDiffSync` to be
 * available without a prior async call.
 */
export async function initTreeDiff(): Promise<void> {
    await getModule();
}

/**
 * Dynamically load the Emscripten glue script from `src` (e.g. "/treediff.js"),
 * initialise the wasm module, and return it.
 * Subsequent calls return the cached module without re-fetching.
 */
export function loadTreeDiff(src: string = "/dist/treediff.js"): Promise<TreeDiffModule> {
    if (_module) return Promise.resolve(_module);
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => {
            (window as unknown as Record<string, () => Promise<TreeDiffModule>>)
                .createTreeDiff()
                .then((mod) => { _module = mod; resolve(mod); })
                .catch(reject);
        };
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}
