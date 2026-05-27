"use client";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { LogLevel } from "@codingame/monaco-vscode-api";
import getKeybindingsServiceOverride from "@codingame/monaco-vscode-keybindings-service-override";
import getThemeServiceOverride from "@codingame/monaco-vscode-theme-service-override";
import getTextmateServiceOverride from "@codingame/monaco-vscode-textmate-service-override";
import getConfigurationServiceOverride, { updateUserConfiguration } from "@codingame/monaco-vscode-configuration-service-override";
import getLanguagesServiceOverride from "@codingame/monaco-vscode-languages-service-override";
import getFilesServiceOverride, {
    RegisteredFileSystemProvider,
    RegisteredUriFile,
    registerCustomProvider,
} from "@codingame/monaco-vscode-files-service-override";
import { URI as VscodeURI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";
import { writeFile as vscodeWriteFile, deleteFile as vscodeDeleteFile } from "@codingame/monaco-vscode-api/monaco";
import { getEnhancedMonacoEnvironment } from "monaco-languageclient/vscodeApiWrapper";
import { MonacoEditorReactComp } from "@typefox/monaco-editor-react";
import type { EditorApp, TextContents } from "monaco-languageclient/editorApp";
import * as monaco from "@codingame/monaco-vscode-editor-api";

// Custom worker factory: monaco-languageclient's default loaders use bare
// specifiers that Turbopack can't resolve, and Turbopack only bundles a worker
// chunk when it sees `new Worker(new URL("./local.ts", import.meta.url))`. So
// we route each Monaco/vscode worker request to a local entry file that
// re-exports the vendored worker.
const installMonacoWorkerEnvironment = () => {
    const env = getEnhancedMonacoEnvironment() as typeof globalThis & {
        getWorker?: (moduleId: string, label: string) => Worker;
    };
    if (env.getWorker) return;
    env.getWorker = (_moduleId: string, label: string) => {
        switch (label) {
            case "TextEditorWorker":
            case "editorWorkerService":
                return new Worker(
                    new URL("./workers/editor.worker.ts", import.meta.url),
                    { type: "module", name: "editor-worker" },
                );
            case "extensionHostWorkerMain":
                return new Worker(
                    new URL("./workers/extensionHost.worker.ts", import.meta.url),
                    { type: "module", name: "extension-host-worker" },
                );
            case "TextMateWorker":
                return new Worker(
                    new URL("./workers/textmate.worker.ts", import.meta.url),
                    { type: "module", name: "textmate-worker" },
                );
            default:
                return new Worker(
                    new URL("./workers/editor.worker.ts", import.meta.url),
                    { type: "module", name: `${label}-fallback-worker` },
                );
        }
    };
};

// Side-effect imports register the bundled VS Code extensions (themes + cpp grammar).
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import "@codingame/monaco-vscode-cpp-default-extension";

export type ClangDiagnostic = {
    severity: "error" | "warn" | "info" | "hint";
    message: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    source?: string;
    code?: string;
};

// System-header URI scheme. The backend rewrites clangd's on-disk URI
// (file:///{abs}/bin/include/simstd.hpp) into simulizer:/simstd.hpp on the
// wire in both directions, so the same URI flows through monaco-vscode
// unchanged. A FileSystemProvider registered against the `simulizer` scheme
// answers reads.
export const SIMSTD_MONACO_URI = "simulizer:/simstd.hpp";
const SIMULIZER_SCHEME = "simulizer";

import { WORKSPACE_URI_PREFIX, pathToUri, uriToPath } from "./uri";
export { WORKSPACE_URI_PREFIX, pathToUri, uriToPath };

// registerCustomProvider must run BEFORE monaco-vscode services initialize
// (the registration helper throws "Services are already initialized" once
// MonacoEditorReactComp has bootstrapped). Module-level side effects run on
// import — and because this file is loaded via dynamic({ ssr: false }) and
// the React component only mounts afterwards, this ordering is reliable.
const SIMSTD_HTTP_URL = (() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
    const base = apiBase || (typeof window !== "undefined" ? window.location.origin : "");
    return base + "/lsp/simstd.hpp";
})();

let simstdProviderRegistered = false;
function setupSimstdProvider() {
    if (simstdProviderRegistered) return;
    try {
        const provider = new RegisteredFileSystemProvider(true);
        provider.registerFile(new RegisteredUriFile(
            VscodeURI.parse(SIMSTD_MONACO_URI),
            SIMSTD_HTTP_URL,
        ));
        registerCustomProvider(SIMULIZER_SCHEME, provider);
        simstdProviderRegistered = true;
    } catch (e) {
        // Hot-reload re-evaluates this module after services have already
        // bootstrapped from the original load. The original registration is
        // still in effect; nothing to do.
        console.warn("[CodeEditor] simstd provider registration skipped:", e);
    }
}
setupSimstdProvider();

// `#pragma region` / `#pragma endregion` folding. clangd's foldingRange
// service only knows C++ syntax (braces, comments, #if/#endif). MSVC-style
// region markers aren't part of that — we add a second FoldingRangeProvider
// for `cpp` so Monaco merges its ranges with clangd's. Nested regions
// supported via a stack; matching is case-insensitive.
//
// Registration is deferred to handleEditorStartDone (post-mount): touching
// `monaco.languages.*` at module-load triggers monaco-vscode's language
// services, and MonacoEditorReactComp's own start sequence then crashes
// with "Services are already initialized".
const REGION_START_RE = /^\s*#\s*pragma\s+region\b/i;
const REGION_END_RE   = /^\s*#\s*pragma\s+endregion\b/i;

let pragmaRegionFoldingRegistered = false;
function setupPragmaRegionFolding() {
    if (pragmaRegionFoldingRegistered) return;
    try {
        monaco.languages.registerFoldingRangeProvider("cpp", {
            provideFoldingRanges(model) {
                const ranges: monaco.languages.FoldingRange[] = [];
                const stack: number[] = [];
                const count = model.getLineCount();
                for (let i = 1; i <= count; i++) {
                    const line = model.getLineContent(i);
                    if (REGION_START_RE.test(line)) {
                        stack.push(i);
                    } else if (REGION_END_RE.test(line)) {
                        const start = stack.pop();
                        if (start !== undefined && i > start) {
                            ranges.push({
                                start,
                                end: i,
                                kind: monaco.languages.FoldingRangeKind.Region,
                            });
                        }
                    }
                }
                return ranges;
            },
        });
        pragmaRegionFoldingRegistered = true;
    } catch (e) {
        console.warn("[CodeEditor] pragma region folding registration skipped:", e);
    }
}

// Offer `region` / `endregion` as completions after `#pragma `. clangd's
// own completion sees `#pragma X` as a free-form preprocessor directive
// and doesn't suggest these by default, so we register a small Monaco-
// level provider. Items are scoped to lines that already look like
// `#pragma <partial>` so we don't pollute other contexts.
let pragmaCompletionRegistered = false;
function setupPragmaCompletion() {
    if (pragmaCompletionRegistered) return;
    try {
        monaco.languages.registerCompletionItemProvider("cpp", {
            triggerCharacters: [" "],
            provideCompletionItems(model, position) {
                const upToCursor = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
                const m = /^\s*#\s*pragma\s+(\w*)$/.exec(upToCursor);
                if (!m) return { suggestions: [] };
                // Replace the partial word the user typed after `#pragma `
                // so picking a suggestion overwrites `re` with `region`
                // rather than appending.
                const wordLen = m[1].length;
                const range: monaco.IRange = {
                    startLineNumber: position.lineNumber,
                    endLineNumber:   position.lineNumber,
                    startColumn:     position.column - wordLen,
                    endColumn:       position.column,
                };
                return {
                    suggestions: [
                        {
                            label:       "region",
                            kind:        monaco.languages.CompletionItemKind.Snippet,
                            insertText:  "region ${1:name}\n$0\n#pragma endregion",
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            detail:      "Foldable region",
                            documentation: "Inserts a `#pragma region` / `#pragma endregion` pair.",
                            range,
                        },
                        {
                            label:      "endregion",
                            kind:       monaco.languages.CompletionItemKind.Keyword,
                            insertText: "endregion",
                            detail:     "End of foldable region",
                            range,
                        },
                    ],
                };
            },
        });
        pragmaCompletionRegistered = true;
    } catch (e) {
        console.warn("[CodeEditor] pragma completion registration skipped:", e);
    }
}

export type EditorFile = {
    /** workspace-relative path like "main.cpp" or "src/util.hpp" */
    path: string;
    content: string;
};

export type CodeEditorRef = {
    setActiveModel: (uri: string) => void;
    closeModel: (uri: string) => void;
    revealAt: (uri: string, line: number, column?: number) => void;
    focus: () => void;
};

type Props = {
    files: EditorFile[];
    /**
     * Full URI of the currently-focused model. For workspace files use
     * pathToUri(path); for system headers opened via go-to-definition this
     * is the simulizer:/... URI.
     */
    activeUri: string;
    /** workspace-relative path of the project entry; used for diagnostics scoping */
    entryPath: string;
    lspWsUrl: string;
    onTextChanged: (path: string, content: string) => void;
    /** If true, all bundle files are read-only (link-share viewer). */
    readOnly?: boolean;
    theme?: "light" | "dark";
    onDiagnosticsChanged?: (diagnostics: ClangDiagnostic[]) => void;
    onActiveModelChanged?: (uri: string) => void;
    onUnresolvedDefinition?: (uri: string) => void;
    /**
     * Stable namespace for persisting per-URI view state (fold ranges,
     * cursor, scroll) to localStorage. Each viewer gets their own snapshot
     * — owners and link-share viewers don't share fold state, and it
     * doesn't pollute the bundle itself. Omit / null disables persistence.
     */
    viewStateKey?: string | null;
};

function severityToLevel(s: monaco.MarkerSeverity): ClangDiagnostic["severity"] {
    if (s === monaco.MarkerSeverity.Error)   return "error";
    if (s === monaco.MarkerSeverity.Warning) return "warn";
    if (s === monaco.MarkerSeverity.Info)    return "info";
    return "hint";
}

const CodeEditor = forwardRef<CodeEditorRef, Props>(function CodeEditor({
    files,
    activeUri,
    entryPath,
    lspWsUrl,
    onTextChanged,
    readOnly = false,
    theme = "light",
    onDiagnosticsChanged,
    onActiveModelChanged,
    onUnresolvedDefinition,
    viewStateKey,
}, ref) {
    const colorTheme = theme === "dark" ? "Default Dark Modern" : "Default Light Modern";

    // Push theme changes through the vscode configuration service so Monaco
    // swaps the theme without remounting.
    const themeAppliedRef = useRef<string | null>(null);
    useEffect(() => {
        if (themeAppliedRef.current === colorTheme) return;
        let cancelled = false;
        (async () => {
            try {
                await updateUserConfiguration(JSON.stringify({ "workbench.colorTheme": colorTheme }));
                if (!cancelled) themeAppliedRef.current = colorTheme;
            } catch {
                /* not initialized yet */
            }
        })();
        return () => { cancelled = true; };
    }, [colorTheme]);

    const onDiagnosticsChangedRef = useRef(onDiagnosticsChanged);
    const onActiveModelChangedRef = useRef(onActiveModelChanged);
    const onUnresolvedDefinitionRef = useRef(onUnresolvedDefinition);
    const onTextChangedRef = useRef(onTextChanged);
    useEffect(() => { onDiagnosticsChangedRef.current = onDiagnosticsChanged; }, [onDiagnosticsChanged]);
    useEffect(() => { onActiveModelChangedRef.current = onActiveModelChanged; }, [onActiveModelChanged]);
    useEffect(() => { onUnresolvedDefinitionRef.current = onUnresolvedDefinition; }, [onUnresolvedDefinition]);
    useEffect(() => { onTextChangedRef.current = onTextChanged; }, [onTextChanged]);

    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const entryUriRef = useRef(pathToUri(entryPath));
    useEffect(() => { entryUriRef.current = pathToUri(entryPath); }, [entryPath]);

    const readOnlyRef = useRef(readOnly);
    useEffect(() => {
        readOnlyRef.current = readOnly;
        const editor = editorRef.current;
        if (!editor) return;
        const currentUri = editor.getModel()?.uri.toString();
        if (currentUri) syncReadOnlyForModel(currentUri);
    }, [readOnly]);

    const syncReadOnlyForModel = useCallback((uri: string | undefined) => {
        const editor = editorRef.current;
        if (!editor || !uri) return;
        const isWorkspaceFile = uri.startsWith(WORKSPACE_URI_PREFIX);
        // System headers (simulizer:) and external URIs are always read-only;
        // workspace files follow the prop. The prop itself flips between true
        // (link-share viewer) and false (owner editing).
        editor.updateOptions({ readOnly: isWorkspaceFile ? readOnlyRef.current : true });
    }, []);

    // Track which paths have models so we can sync efficiently when `files`
    // changes. We never dispose the active model directly — we swap the editor
    // to another model first.
    const modelOwnedPathsRef = useRef<Set<string>>(new Set());
    // Per-URI view state cache. Monaco's setModel doesn't preserve fold
    // state, cursor, or scroll across model swaps; we save before swap and
    // restore after so #pragma region folds (and the rest of the view
    // state) survive tab switching.
    const viewStatesRef = useRef<Map<string, monaco.editor.ICodeEditorViewState>>(new Map());
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // localStorage namespace for this editor's view-state map. Set once
    // viewStateKey lands (CodeEditor remounts when the bundle's fileId
    // changes, so this stays stable for the life of the component).
    const storageKey = viewStateKey ? `simulizer-viewstate-${viewStateKey}` : null;

    // Drop view state for URIs that aren't in the bundle anymore. Otherwise
    // localStorage gets polluted by stale entries from deleted/renamed
    // files. Called whenever we serialize.
    const collectPersistableViewStates = useCallback((): Record<string, monaco.editor.ICodeEditorViewState> => {
        const out: Record<string, monaco.editor.ICodeEditorViewState> = {};
        for (const [uri, state] of viewStatesRef.current) {
            // Only workspace URIs — `simulizer:/` system headers are
            // ephemeral and re-fetched per session, restoring their state
            // is wasted bytes.
            if (uri.startsWith(WORKSPACE_URI_PREFIX)) out[uri] = state;
        }
        return out;
    }, []);

    const persistViewStates = useCallback(() => {
        if (!storageKey || typeof localStorage === "undefined") return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(collectPersistableViewStates()));
        } catch {
            // QuotaExceededError or storage disabled — silently drop.
        }
    }, [storageKey, collectPersistableViewStates]);

    const schedulePersist = useCallback(() => {
        if (!storageKey) return;
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => {
            persistTimerRef.current = null;
            persistViewStates();
        }, 500);
    }, [storageKey, persistViewStates]);

    const captureCurrentViewState = useCallback(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const current = editor.getModel();
        if (!current) return;
        const state = editor.saveViewState();
        if (state) {
            viewStatesRef.current.set(current.uri.toString(), state);
            schedulePersist();
        }
    }, [schedulePersist]);

    const swapModelTo = useCallback((model: monaco.editor.ITextModel) => {
        const editor = editorRef.current;
        if (!editor) return;
        const current = editor.getModel();
        if (current === model) return;
        if (current) {
            const state = editor.saveViewState();
            if (state) viewStatesRef.current.set(current.uri.toString(), state);
        }
        editor.setModel(model);
        const restored = viewStatesRef.current.get(model.uri.toString());
        if (restored) editor.restoreViewState(restored);
        schedulePersist();
    }, [schedulePersist]);
    const contentChangeDisposablesRef = useRef<Map<string, monaco.IDisposable>>(new Map());

    const ensureModel = useCallback((path: string, initialContent: string): monaco.editor.ITextModel => {
        const uri = monaco.Uri.parse(pathToUri(path));
        let model = monaco.editor.getModel(uri);
        if (!model) {
            // Seed the file service so non-entry workspace files can be
            // resolved by monaco-vscode flows that go through fileService
            // (e.g., textModelResolverService when opening a definition
            // target). The entry file gets this for free via MonacoEditor-
            // ReactComp's createModelReference; we mirror that here.
            void vscodeWriteFile(uri, initialContent).catch(() => { /* best-effort */ });
            model = monaco.editor.createModel(initialContent, "cpp", uri);
            const disp = model.onDidChangeContent(() => {
                const m = monaco.editor.getModel(uri);
                if (!m) return;
                onTextChangedRef.current?.(path, m.getValue());
            });
            contentChangeDisposablesRef.current.set(path, disp);
            modelOwnedPathsRef.current.add(path);
        } else if (model.getValue() !== initialContent) {
            // Programmatic content sync (e.g., after a load). We deliberately
            // do NOT set value back to the model for every prop change — the
            // editor's own content is the source of truth while focused.
        }
        return model;
    }, []);

    // Sync the set of models with the `files` prop. Models for files no longer
    // in the bundle are disposed (after swapping the editor away if active).
    useEffect(() => {
        if (!editorRef.current) return;
        const desired = new Set(files.map(f => f.path));

        // Create / update models for present files.
        for (const f of files) {
            const uri = monaco.Uri.parse(pathToUri(f.path));
            const existing = monaco.editor.getModel(uri);
            if (!existing) {
                ensureModel(f.path, f.content);
            }
            // We don't push prop content into an existing model — the user's
            // ongoing edits would be clobbered. ClangWorkspace's bundle state
            // tracks edits through onTextChanged so they stay in sync.
        }

        // Dispose models for removed paths.
        const owned = Array.from(modelOwnedPathsRef.current);
        for (const path of owned) {
            if (desired.has(path)) continue;
            const uri = monaco.Uri.parse(pathToUri(path));
            const model = monaco.editor.getModel(uri);
            if (!model) {
                modelOwnedPathsRef.current.delete(path);
                contentChangeDisposablesRef.current.get(path)?.dispose();
                contentChangeDisposablesRef.current.delete(path);
                continue;
            }
            const editor = editorRef.current;
            if (editor && editor.getModel() === model) {
                // Swap to the current active URI (or entry as a last resort)
                // before disposing.
                const target = monaco.editor.getModel(monaco.Uri.parse(activeUri))
                    ?? monaco.editor.getModel(monaco.Uri.parse(pathToUri(entryPath)));
                if (target && target !== model) {
                    swapModelTo(target);
                }
            }
            contentChangeDisposablesRef.current.get(path)?.dispose();
            contentChangeDisposablesRef.current.delete(path);
            model.dispose();
            void vscodeDeleteFile(uri).catch(() => { /* best-effort */ });
            modelOwnedPathsRef.current.delete(path);
        }
    }, [files, activeUri, entryPath, ensureModel]);

    // Sync the active model with `activeUri`. Falls back to the entry's URI
    // when the target model doesn't exist (e.g., a stale path after a rename).
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const target = monaco.editor.getModel(monaco.Uri.parse(activeUri))
            ?? monaco.editor.getModel(monaco.Uri.parse(pathToUri(entryPath)));
        if (target && editor.getModel() !== target) {
            swapModelTo(target);
        }
    }, [activeUri, entryPath, swapModelTo]);

    const markersDisposableRef = useRef<monaco.IDisposable | null>(null);
    const modelChangeDisposableRef = useRef<monaco.IDisposable | null>(null);
    const mouseDownDisposableRef = useRef<monaco.IDisposable | null>(null);
    const captureDisposablesRef = useRef<monaco.IDisposable[]>([]);
    useEffect(() => () => {
        markersDisposableRef.current?.dispose();
        modelChangeDisposableRef.current?.dispose();
        mouseDownDisposableRef.current?.dispose();
        markersDisposableRef.current = null;
        modelChangeDisposableRef.current = null;
        mouseDownDisposableRef.current = null;
        for (const d of captureDisposablesRef.current) d.dispose();
        captureDisposablesRef.current = [];
        for (const d of contentChangeDisposablesRef.current.values()) d.dispose();
        contentChangeDisposablesRef.current.clear();
        if (persistTimerRef.current) { clearTimeout(persistTimerRef.current); persistTimerRef.current = null; }
        editorRef.current = null;
    }, []);

    // Flush view state to localStorage when the page is about to unload —
    // catches Ctrl+R, tab close, navigation. The debounced timer wouldn't
    // get a chance to fire otherwise. Also flush on unmount (route change
    // within the SPA).
    useEffect(() => {
        const onBeforeUnload = () => {
            const editor = editorRef.current;
            if (editor) {
                const current = editor.getModel();
                if (current) {
                    const state = editor.saveViewState();
                    if (state) viewStatesRef.current.set(current.uri.toString(), state);
                }
            }
            persistViewStates();
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => {
            window.removeEventListener("beforeunload", onBeforeUnload);
            onBeforeUnload(); // unmount path
        };
    }, [persistViewStates]);

    // Modifier+click gate (see CodeEditor history): hover and click both
    // invoke provideDefinition; we only want navigation on click.
    const definitionClickAllowedRef = useRef(false);
    const definitionClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (definitionClickTimerRef.current) clearTimeout(definitionClickTimerRef.current);
    }, []);

    useImperativeHandle(ref, () => ({
        setActiveModel: (uri: string) => {
            const editor = editorRef.current;
            if (!editor) return;
            const model = monaco.editor.getModel(monaco.Uri.parse(uri));
            if (model && editor.getModel() !== model) swapModelTo(model);
        },
        closeModel: (uri: string) => {
            const model = monaco.editor.getModel(monaco.Uri.parse(uri));
            if (!model) return;
            const editor = editorRef.current;
            if (editor && editor.getModel()?.uri.toString() === uri) {
                const entryUri = entryUriRef.current;
                const fallback = monaco.editor.getModel(monaco.Uri.parse(entryUri));
                if (fallback) swapModelTo(fallback);
            }
            // Drop any saved view state for the closed URI — system header
            // tabs can come back later but with fresh state, which matches
            // VS Code's behavior for ephemeral previews.
            viewStatesRef.current.delete(uri);
            // Only dispose models we don't own (system headers etc.). Workspace
            // models are disposed by the files-sync effect.
            const path = uriToPath(uri);
            if (!path || !modelOwnedPathsRef.current.has(path)) {
                model.dispose();
            }
        },
        revealAt: (uri: string, line: number, column: number = 1) => {
            const editor = editorRef.current;
            if (!editor) return;
            const model = monaco.editor.getModel(monaco.Uri.parse(uri));
            if (!model) return;
            if (editor.getModel() !== model) swapModelTo(model);
            editor.revealLineInCenter(line);
            editor.setPosition({ lineNumber: line, column });
            editor.focus();
        },
        focus: () => { editorRef.current?.focus(); },
    }), [swapModelTo]);

    const initialFilesRef = useRef(files);
    const initialActiveUriRef = useRef(activeUri);
    const initialEntryPathRef = useRef(entryPath);

    const handleEditorStartDone = useCallback((app?: EditorApp) => {
        if (!app) return;
        const editor = app.getEditor() ?? null;
        editorRef.current = editor;
        if (!editor) return;

        // Safe to touch monaco.languages now — workbench services are up.
        setupPragmaRegionFolding();
        setupPragmaCompletion();

        // Rehydrate view-state map from localStorage before any swap so the
        // first restoreViewState in swapModelTo / handleEditorStartDone hits
        // the cached fold + cursor state from the previous session.
        if (storageKey && typeof localStorage !== "undefined") {
            try {
                const raw = localStorage.getItem(storageKey);
                if (raw) {
                    const parsed = JSON.parse(raw) as Record<string, monaco.editor.ICodeEditorViewState>;
                    for (const [uri, state] of Object.entries(parsed)) {
                        if (uri.startsWith(WORKSPACE_URI_PREFIX) && state) {
                            viewStatesRef.current.set(uri, state);
                        }
                    }
                }
            } catch {
                // Corrupt JSON or storage disabled — start fresh.
            }
        }

        // Bootstrap models for every bundle file so clangd's didOpen pipeline
        // sees the whole project at startup. The active file already has a
        // model created by MonacoEditorReactComp via codeResources; we hook
        // into it the same way as the others so its edits flow through
        // onTextChanged.
        const initialFiles = initialFilesRef.current;
        for (const f of initialFiles) {
            const uri = monaco.Uri.parse(pathToUri(f.path));
            const existing = monaco.editor.getModel(uri);
            const path = f.path;
            if (existing) {
                if (!contentChangeDisposablesRef.current.has(path)) {
                    const disp = existing.onDidChangeContent(() => {
                        const m = monaco.editor.getModel(uri);
                        if (!m) return;
                        onTextChangedRef.current?.(path, m.getValue());
                    });
                    contentChangeDisposablesRef.current.set(path, disp);
                }
                modelOwnedPathsRef.current.add(path);
            } else {
                ensureModel(path, f.content);
            }
        }

        // The editor's INITIAL model was set by MonacoEditorReactComp before
        // we rehydrated; if there's cached state for that URI, apply it now
        // so the first paint already shows the previous fold/cursor.
        const initialCurrent = editor.getModel();
        if (initialCurrent) {
            const cached = viewStatesRef.current.get(initialCurrent.uri.toString());
            if (cached) editor.restoreViewState(cached);
        }

        // Make sure the active model matches the prop (may differ from the
        // editor's auto-created initial model if `activeUri !== entryPath`).
        const wanted = initialActiveUriRef.current;
        const activeModel = monaco.editor.getModel(monaco.Uri.parse(wanted));
        if (activeModel && editor.getModel() !== activeModel) {
            swapModelTo(activeModel);
        }
        const currentUri = editor.getModel()?.uri.toString();
        syncReadOnlyForModel(currentUri);
        if (currentUri) onActiveModelChangedRef.current?.(currentUri);

        modelChangeDisposableRef.current?.dispose();
        modelChangeDisposableRef.current = editor.onDidChangeModel((e) => {
            const newUri = e.newModelUrl?.toString();
            if (!newUri) return;
            syncReadOnlyForModel(newUri);
            onActiveModelChangedRef.current?.(newUri);
        });

        // Capture view state on user interaction so reload-time persistence
        // sees the latest fold/cursor/scroll. Three signals cover the bases:
        //   - cursor moves (typing, clicks)
        //   - scroll changes (also fires when folding adjusts viewport)
        //   - decorations change (catches gutter fold toggles that don't
        //     move the cursor)
        const cursorDisp  = editor.onDidChangeCursorPosition(captureCurrentViewState);
        const scrollDisp  = editor.onDidScrollChange(captureCurrentViewState);
        const decorDisp   = editor.onDidChangeHiddenAreas?.(captureCurrentViewState);
        captureDisposablesRef.current.push(cursorDisp, scrollDisp);
        if (decorDisp) captureDisposablesRef.current.push(decorDisp);

        mouseDownDisposableRef.current?.dispose();
        mouseDownDisposableRef.current = editor.onMouseDown((e) => {
            const ev = e.event;
            if (!ev.leftButton) return;
            if (!ev.ctrlKey && !ev.metaKey) return;
            definitionClickAllowedRef.current = true;
            if (definitionClickTimerRef.current) clearTimeout(definitionClickTimerRef.current);
            definitionClickTimerRef.current = setTimeout(() => {
                definitionClickAllowedRef.current = false;
                definitionClickTimerRef.current = null;
            }, 500);
        });

        // Diagnostics: emit markers for every workspace file. ClangWorkspace
        // displays them grouped in the Infos panel.
        const emit = () => {
            const cb = onDiagnosticsChangedRef.current;
            if (!cb) return;
            const markers = monaco.editor.getModelMarkers({});
            cb(markers
                .filter(m => m.resource.toString().startsWith(WORKSPACE_URI_PREFIX))
                .map(m => ({
                    severity:  severityToLevel(m.severity),
                    message:   m.message,
                    line:      m.startLineNumber,
                    column:    m.startColumn,
                    endLine:   m.endLineNumber,
                    endColumn: m.endColumn,
                    source:    m.source,
                    code:      typeof m.code === "string" ? m.code : m.code?.value,
                })));
        };
        emit();
        markersDisposableRef.current?.dispose();
        markersDisposableRef.current = monaco.editor.onDidChangeMarkers(() => emit());
    }, [ensureModel, syncReadOnlyForModel, swapModelTo, captureCurrentViewState, storageKey]);

    // The seed for monaco-editor-react has to point at a workspace file (the
    // simulizer:/... scheme can't be used as a primary resource). Pick the
    // entry; ClangWorkspace also passes `activeUri` which we swap to in
    // handleEditorStartDone if it differs.
    const initialEntryPath = initialEntryPathRef.current;
    const initialFile = initialFilesRef.current.find(f => f.path === initialEntryPath)
        ?? initialFilesRef.current[0];
    const initialContent = initialFile?.content ?? "";
    const initialUri = pathToUri(initialFile?.path ?? initialEntryPath);

    return (
        <MonacoEditorReactComp
            style={{ width: "100%", height: "100%" }}
            vscodeApiConfig={{
                $type: "classic",
                logLevel: LogLevel.Warning,
                viewsConfig: { $type: "EditorService" },
                serviceOverrides: {
                    ...getFilesServiceOverride(),
                    ...getConfigurationServiceOverride(),
                    ...getKeybindingsServiceOverride(),
                    ...getLanguagesServiceOverride(),
                    ...getThemeServiceOverride(),
                    ...getTextmateServiceOverride(),
                },
                userConfiguration: {
                    json: JSON.stringify({
                        "workbench.colorTheme": colorTheme,
                        "editor.fontSize": 13,
                        "editor.fontFamily": "Consolas, 'JetBrains Mono', Menlo, monospace",
                        "editor.minimap.enabled": false,
                        "editor.tabSize": 4,
                        "editor.insertSpaces": true,
                    }),
                },
                monacoWorkerFactory: installMonacoWorkerEnvironment,
            }}
            editorAppConfig={{
                codeResources: {
                    modified: {
                        text: initialContent,
                        uri: initialUri,
                    },
                },
                editorOptions: {
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    readOnly,
                },
            }}
            languageClientConfig={{
                languageId: "cpp",
                connection: {
                    options: {
                        $type: "WebSocketUrl",
                        url: lspWsUrl,
                        startOptions: { onCall: () => { /* noop */ }, reportStatus: true },
                        stopOptions:  { onCall: () => { /* noop */ }, reportStatus: true },
                    },
                },
                clientOptions: {
                    documentSelector: ["cpp"],
                    middleware: {
                        // monaco-vscode's EditorService mode happily creates
                        // a model for `simstd:` definition targets (didOpen
                        // fires) but never swaps it into the active editor —
                        // it then disposes the model right away (didClose).
                        // Bypass the default flow: when a definition points
                        // at our scheme, drive editor.setModel + reveal
                        // ourselves and suppress further navigation.
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        provideDefinition: async (document: any, position: any, token: any, next: any) => {
                            const result = await next(document, position, token);
                            if (!result) return result;
                            const locations = (Array.isArray(result) ? result : [result]) as Array<{
                                uri?: { toString(): string };
                                targetUri?: { toString(): string };
                                range?: { start: { line: number; character: number } };
                                targetRange?: { start: { line: number; character: number } };
                                targetSelectionRange?: { start: { line: number; character: number } };
                            }>;
                            const target = locations.find(loc => {
                                const u = loc.uri ?? loc.targetUri;
                                return !!u && u.toString().startsWith(`${SIMULIZER_SCHEME}:`);
                            });
                            if (target) {
                                if (!definitionClickAllowedRef.current) return result;
                                definitionClickAllowedRef.current = false;
                                if (definitionClickTimerRef.current) {
                                    clearTimeout(definitionClickTimerRef.current);
                                    definitionClickTimerRef.current = null;
                                }
                                const editor = editorRef.current;
                                if (!editor) return result;
                                const uriStr = (target.uri ?? target.targetUri)!.toString();
                                const range = target.targetSelectionRange ?? target.targetRange ?? target.range;
                                if (!range) return result;
                                const monacoUri = monaco.Uri.parse(uriStr);
                                let model = monaco.editor.getModel(monacoUri);
                                if (!model) {
                                    try {
                                        const res = await fetch(SIMSTD_HTTP_URL);
                                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                        const content = await res.text();
                                        model = monaco.editor.getModel(monacoUri)
                                            ?? monaco.editor.createModel(content, "cpp", monacoUri);
                                    } catch (e) {
                                        console.error("[CodeEditor] failed to load simulizer file:", e);
                                        return result;
                                    }
                                }
                                swapModelTo(model);
                                const line = range.start.line + 1;
                                const col = range.start.character + 1;
                                editor.revealLineInCenter(line);
                                editor.setPosition({ lineNumber: line, column: col });
                                editor.focus();
                                return [];
                            }

                            // Workspace target — same problem as the simulizer
                            // scheme: monaco-vscode's EditorService mode with a
                            // single editor never actually swaps the current
                            // editor's model on navigation, so simstd.hpp works
                            // (we drive it manually above) but `src/util.hpp`
                            // silently no-ops. Drive workspace navigation the
                            // same way here.
                            const targetWorkspace = locations.find(loc => {
                                const u = (loc.uri ?? loc.targetUri)?.toString() ?? "";
                                return u.startsWith(WORKSPACE_URI_PREFIX);
                            });
                            if (targetWorkspace) {
                                if (!definitionClickAllowedRef.current) return result;
                                definitionClickAllowedRef.current = false;
                                if (definitionClickTimerRef.current) {
                                    clearTimeout(definitionClickTimerRef.current);
                                    definitionClickTimerRef.current = null;
                                }
                                const editor = editorRef.current;
                                if (!editor) return result;
                                const uriStr = (targetWorkspace.uri ?? targetWorkspace.targetUri)!.toString();
                                const range = targetWorkspace.targetSelectionRange ?? targetWorkspace.targetRange ?? targetWorkspace.range;
                                if (!range) return result;
                                const monacoUri = monaco.Uri.parse(uriStr);
                                const model = monaco.editor.getModel(monacoUri);
                                // No model means the target isn't part of the
                                // current bundle (shouldn't normally happen for
                                // workspace URIs the LSP already accepted).
                                // Fall through to monaco-vscode's default
                                // handling as a last resort.
                                if (!model) return result;
                                swapModelTo(model);
                                const line = range.start.line + 1;
                                const col = range.start.character + 1;
                                editor.revealLineInCenter(line);
                                editor.setPosition({ lineNumber: line, column: col });
                                editor.focus();
                                return [];
                            }

                            const external = locations.find(loc => {
                                const u = (loc.uri ?? loc.targetUri)?.toString() ?? "";
                                return !u.startsWith(WORKSPACE_URI_PREFIX) && !u.startsWith(`${SIMULIZER_SCHEME}:`);
                            });
                            if (external) {
                                if (definitionClickAllowedRef.current) {
                                    definitionClickAllowedRef.current = false;
                                    if (definitionClickTimerRef.current) {
                                        clearTimeout(definitionClickTimerRef.current);
                                        definitionClickTimerRef.current = null;
                                    }
                                    const uri = (external.uri ?? external.targetUri)!.toString();
                                    onUnresolvedDefinitionRef.current?.(uri);
                                }
                            }
                            return [];
                        },
                    },
                },
            }}
            onTextChanged={(_changes: TextContents) => {
                // Per-model edits are routed through the explicit
                // onDidChangeContent listeners we attach in ensureModel,
                // which carry the file path. The top-level callback only
                // sees changes to the editor's main resource which is
                // confusing in multi-file mode; ignore it.
            }}
            onEditorStartDone={handleEditorStartDone}
            enforceLanguageClientDispose={true}
        />
    );
});

export default CodeEditor;
