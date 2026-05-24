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

export const DEFAULT_MAIN_URI = "file:///workspace/user.cpp";

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

export type CodeEditorRef = {
    setActiveModel: (uri: string) => void;
    closeModel: (uri: string) => void;
    revealAt: (uri: string, line: number, column?: number) => void;
    focus: () => void;
};

type Props = {
    initialCode: string;
    mainUri?: string;
    lspWsUrl: string;
    onTextChanged: (code: string) => void;
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
    initialCode,
    mainUri = DEFAULT_MAIN_URI,
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
    // swaps the theme without remounting. The first effect run on mount is a
    // no-op since initial userConfiguration already sets the same value; we
    // still call it so the service applies the theme even if the initial
    // bootstrap was racy.
    const themeAppliedRef = useRef<string | null>(null);
    useEffect(() => {
        if (themeAppliedRef.current === colorTheme) return;
        let cancelled = false;
        (async () => {
            try {
                await updateUserConfiguration(JSON.stringify({ "workbench.colorTheme": colorTheme }));
                if (!cancelled) themeAppliedRef.current = colorTheme;
            } catch {
                // Service not initialized yet on first mount — initial
                // userConfiguration already provided the same theme.
            }
        })();
        return () => { cancelled = true; };
    }, [colorTheme]);

    // Latest callbacks captured via refs so the editor-start handler doesn't
    // need to re-subscribe every time the parent re-renders with new closures.
    const onDiagnosticsChangedRef = useRef(onDiagnosticsChanged);
    const onActiveModelChangedRef = useRef(onActiveModelChanged);
    const onUnresolvedDefinitionRef = useRef(onUnresolvedDefinition);
    useEffect(() => { onDiagnosticsChangedRef.current = onDiagnosticsChanged; }, [onDiagnosticsChanged]);
    useEffect(() => { onActiveModelChangedRef.current = onActiveModelChanged; }, [onActiveModelChanged]);
    useEffect(() => { onUnresolvedDefinitionRef.current = onUnresolvedDefinition; }, [onUnresolvedDefinition]);

    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const mainUriRef = useRef(mainUri);
    useEffect(() => { mainUriRef.current = mainUri; }, [mainUri]);

    // The `readOnly` prop only governs the main file (ownership-driven). Any
    // other model (system headers opened via go-to-definition or pinned tabs)
    // is always read-only. Monaco bakes editorOptions in on mount, so we have
    // to push readOnly imperatively whenever the active model changes or the
    // prop flips.
    const readOnlyRef = useRef(readOnly);
    useEffect(() => {
        readOnlyRef.current = readOnly;
        const editor = editorRef.current;
        if (!editor) return;
        const currentUri = editor.getModel()?.uri.toString();
        if (currentUri === mainUriRef.current) {
            editor.updateOptions({ readOnly });
        }
    }, [readOnly]);

    const syncReadOnlyForModel = useCallback((uri: string | undefined) => {
        const editor = editorRef.current;
        if (!editor || !uri) return;
        const isMain = uri === mainUriRef.current;
        editor.updateOptions({ readOnly: isMain ? readOnlyRef.current : true });
    }, []);

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
        editorRef.current = null;
    }, []);

    // Monaco invokes provideDefinition both on Ctrl/Cmd+hover (to underline
    // the link target) and on Ctrl/Cmd+click (to actually navigate). The
    // middleware below performs the model swap itself, so without this gate
    // hover alone would jump into the header. We flip the flag during a
    // modifier+left-click mouseDown so only the click-triggered invocation
    // navigates; hover invocations just return the locations so the underline
    // still appears.
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
                const mainModel = monaco.editor.getModel(monaco.Uri.parse(mainUriRef.current));
                if (mainModel) editor.setModel(mainModel);
            }
            model.dispose();
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

    const handleEditorStartDone = useCallback((app?: EditorApp) => {
        if (!app) return;
        const editor = app.getEditor() ?? null;
        editorRef.current = editor;
        if (!editor) return;
        const mainModel = editor.getModel();
        if (!mainModel) return;
        const mainModelUri = mainModel.uri;

        onActiveModelChangedRef.current?.(mainModelUri.toString());

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
            // Auto-clear in case provideDefinition never fires (e.g., the
            // clicked token has no definition).
            definitionClickTimerRef.current = setTimeout(() => {
                definitionClickAllowedRef.current = false;
                definitionClickTimerRef.current = null;
            }, 500);
        });

        // Diagnostics are scoped to the main file — user cares about their
        // own code, not lints inside a system header.
        const emit = () => {
            const cb = onDiagnosticsChangedRef.current;
            if (!cb) return;
            const markers = monaco.editor.getModelMarkers({ resource: mainModelUri });
            cb(markers.map(m => ({
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
        markersDisposableRef.current = monaco.editor.onDidChangeMarkers(uris => {
            if (uris.some(u => u.toString() === mainModelUri.toString())) emit();
        });
    }, []);

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
                        text: initialCode,
                        uri: mainUri,
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
                                // Hover invocation — return locations so
                                // Monaco renders the link underline, but do
                                // not navigate. The Ctrl/Cmd+click handler
                                // re-invokes this middleware with the flag
                                // set, which is when we actually swap models.
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

                            // Workspace targets — let monaco's default flow
                            // handle them (it can open file:///workspace/...
                            // because the main model is already registered).
                            const allWorkspace = locations.every(loc => {
                                const u = (loc.uri ?? loc.targetUri)?.toString() ?? "";
                                return u.startsWith("file:///workspace");
                            });
                            if (allWorkspace) return result;

                            // External (std library, MSVC includes, etc.) —
                            // we have no content for these. Notify the parent
                            // and return empty so monaco doesn't throw an
                            // unhandled FileOperationError trying to read
                            // from a non-existent in-browser path.
                            const external = locations.find(loc => {
                                const u = (loc.uri ?? loc.targetUri)?.toString() ?? "";
                                return !u.startsWith("file:///workspace") && !u.startsWith(`${SIMULIZER_SCHEME}:`);
                            });
                            if (external) {
                                // Same hover-vs-click gate as the simulizer
                                // branch — don't spam the parent on hover.
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
            onTextChanged={(changes: TextContents) => {
                if (changes.modified !== undefined) onTextChanged(changes.modified);
            }}
            onEditorStartDone={handleEditorStartDone}
            enforceLanguageClientDispose={true}
        />
    );
});

export default CodeEditor;
