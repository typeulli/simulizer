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
    const contentChangeDisposablesRef = useRef<Map<string, monaco.IDisposable>>(new Map());

    const ensureModel = useCallback((path: string, initialContent: string): monaco.editor.ITextModel => {
        const uri = monaco.Uri.parse(pathToUri(path));
        let model = monaco.editor.getModel(uri);
        if (!model) {
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
                    editor.setModel(target);
                }
            }
            contentChangeDisposablesRef.current.get(path)?.dispose();
            contentChangeDisposablesRef.current.delete(path);
            model.dispose();
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
            editor.setModel(target);
        }
    }, [activeUri, entryPath]);

    const markersDisposableRef = useRef<monaco.IDisposable | null>(null);
    const modelChangeDisposableRef = useRef<monaco.IDisposable | null>(null);
    const mouseDownDisposableRef = useRef<monaco.IDisposable | null>(null);
    useEffect(() => () => {
        markersDisposableRef.current?.dispose();
        modelChangeDisposableRef.current?.dispose();
        mouseDownDisposableRef.current?.dispose();
        markersDisposableRef.current = null;
        modelChangeDisposableRef.current = null;
        mouseDownDisposableRef.current = null;
        for (const d of contentChangeDisposablesRef.current.values()) d.dispose();
        contentChangeDisposablesRef.current.clear();
        editorRef.current = null;
    }, []);

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
            if (model && editor.getModel() !== model) editor.setModel(model);
        },
        closeModel: (uri: string) => {
            const model = monaco.editor.getModel(monaco.Uri.parse(uri));
            if (!model) return;
            const editor = editorRef.current;
            if (editor && editor.getModel()?.uri.toString() === uri) {
                const entryUri = entryUriRef.current;
                const fallback = monaco.editor.getModel(monaco.Uri.parse(entryUri));
                if (fallback) editor.setModel(fallback);
            }
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
            if (editor.getModel() !== model) editor.setModel(model);
            editor.revealLineInCenter(line);
            editor.setPosition({ lineNumber: line, column });
            editor.focus();
        },
        focus: () => { editorRef.current?.focus(); },
    }), []);

    const initialFilesRef = useRef(files);
    const initialActiveUriRef = useRef(activeUri);
    const initialEntryPathRef = useRef(entryPath);

    const handleEditorStartDone = useCallback((app?: EditorApp) => {
        if (!app) return;
        const editor = app.getEditor() ?? null;
        editorRef.current = editor;
        if (!editor) return;

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

        // Make sure the active model matches the prop (may differ from the
        // editor's auto-created initial model if `activeUri !== entryPath`).
        const wanted = initialActiveUriRef.current;
        const activeModel = monaco.editor.getModel(monaco.Uri.parse(wanted));
        if (activeModel && editor.getModel() !== activeModel) {
            editor.setModel(activeModel);
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
    }, [ensureModel, syncReadOnlyForModel]);

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
                                editor.setModel(model);
                                const line = range.start.line + 1;
                                const col = range.start.character + 1;
                                editor.revealLineInCenter(line);
                                editor.setPosition({ lineNumber: line, column: col });
                                editor.focus();
                                return [];
                            }

                            const allWorkspace = locations.every(loc => {
                                const u = (loc.uri ?? loc.targetUri)?.toString() ?? "";
                                return u.startsWith(WORKSPACE_URI_PREFIX);
                            });
                            if (allWorkspace) return result;

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
