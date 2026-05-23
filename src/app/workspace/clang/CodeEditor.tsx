"use client";
import React, { useEffect, useRef } from "react";
import { LogLevel } from "@codingame/monaco-vscode-api";
import getKeybindingsServiceOverride from "@codingame/monaco-vscode-keybindings-service-override";
import getThemeServiceOverride from "@codingame/monaco-vscode-theme-service-override";
import getTextmateServiceOverride from "@codingame/monaco-vscode-textmate-service-override";
import getConfigurationServiceOverride, { updateUserConfiguration } from "@codingame/monaco-vscode-configuration-service-override";
import getLanguagesServiceOverride from "@codingame/monaco-vscode-languages-service-override";
import { getEnhancedMonacoEnvironment } from "monaco-languageclient/vscodeApiWrapper";
import { MonacoEditorReactComp } from "@typefox/monaco-editor-react";
import type { TextContents } from "monaco-languageclient/editorApp";

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

type Props = {
    initialCode: string;
    lspWsUrl: string;
    onTextChanged: (code: string) => void;
    readOnly?: boolean;
    theme?: "light" | "dark";
};

const CodeEditor: React.FC<Props> = ({ initialCode, lspWsUrl, onTextChanged, readOnly = false, theme = "light" }) => {
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

    return (
        <MonacoEditorReactComp
            style={{ width: "100%", height: "100%" }}
            vscodeApiConfig={{
                $type: "classic",
                logLevel: LogLevel.Warning,
                viewsConfig: { $type: "EditorService" },
                serviceOverrides: {
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
                        uri: "file:///workspace/user.cpp",
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
                        stopOptions: { onCall: () => { /* noop */ }, reportStatus: true },
                    },
                },
                clientOptions: {
                    documentSelector: ["cpp"],
                },
            }}
            onTextChanged={(changes: TextContents) => {
                if (changes.modified !== undefined) onTextChanged(changes.modified);
            }}
            enforceLanguageClientDispose={true}
        />
    );
};

export default CodeEditor;
