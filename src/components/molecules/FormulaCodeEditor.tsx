"use client";

import { type ComponentProps, useCallback, useRef } from "react";
import { LogLevel } from "@codingame/monaco-vscode-api";
import getFilesServiceOverride from "@codingame/monaco-vscode-files-service-override";
import getConfigurationServiceOverride from "@codingame/monaco-vscode-configuration-service-override";
import getKeybindingsServiceOverride from "@codingame/monaco-vscode-keybindings-service-override";
import getLanguagesServiceOverride from "@codingame/monaco-vscode-languages-service-override";
import getQuickAccessServiceOverride from "@codingame/monaco-vscode-quickaccess-service-override";
import getThemeServiceOverride from "@codingame/monaco-vscode-theme-service-override";
import getTextmateServiceOverride from "@codingame/monaco-vscode-textmate-service-override";
import { getEnhancedMonacoEnvironment } from "monaco-languageclient/vscodeApiWrapper";
import { MonacoEditorReactComp } from "@typefox/monaco-editor-react";
import type { EditorApp } from "monaco-languageclient/editorApp";
import * as monaco from "@codingame/monaco-vscode-editor-api";
import katex from "katex";
import "katex/dist/katex.min.css";

// Side-effect imports: register the bundled VS Code extensions used here —
// the default theme set and the Python grammar (textmate) for highlighting.
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import "@codingame/monaco-vscode-python-default-extension";

/**
 * A Python code editor for the boundary-condition scripts, built on the SAME
 * @codingame/monaco-vscode-api ("vscode editor") stack as the ClangWorkspace
 * editor — so it adds no separate Monaco runtime.
 *
 * The string argument of every `add_formula(...)` / `add_formula3d(...)` call is
 * normally rendered inline as KaTeX. When the caret moves into that region
 * (click or arrow keys) the formula reverts to its raw string for editing, then
 * re-renders once the caret leaves.
 */

// Worker factory mirrors CodeEditor's: route each Monaco/vscode worker request
// to a local entry that re-exports the vendored worker (so Turbopack bundles a
// chunk). Global + idempotent — whichever editor mounts first installs it.
const installMonacoWorkerEnvironment = () => {
    const env = getEnhancedMonacoEnvironment() as typeof globalThis & {
        getWorker?: (moduleId: string, label: string) => Worker;
    };
    if (env.getWorker) return;
    env.getWorker = (_moduleId: string, label: string) => {
        switch (label) {
            case "TextEditorWorker":
            case "editorWorkerService":
                return new Worker(new URL("./monacoWorkers/editor.worker.ts", import.meta.url), { type: "module", name: "editor-worker" });
            case "extensionHostWorkerMain":
                return new Worker(new URL("./monacoWorkers/extensionHost.worker.ts", import.meta.url), { type: "module", name: "extension-host-worker" });
            case "TextMateWorker":
                return new Worker(new URL("./monacoWorkers/textmate.worker.ts", import.meta.url), { type: "module", name: "textmate-worker" });
            default:
                return new Worker(new URL("./monacoWorkers/editor.worker.ts", import.meta.url), { type: "module", name: `${label}-fallback-worker` });
        }
    };
};

const STYLE_ID = "formula-code-editor-style";
function ensureStyles() {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.formula-concealed { opacity: 0; }
.formula-katex-widget {
    display: inline-flex;
    align-items: center;
    padding: 0 3px;
    background: var(--formula-editor-bg, #1e1e1e);
    color: var(--formula-editor-fg, #d4d4d4);
    border-radius: 3px;
    cursor: text;
    white-space: nowrap;
    box-sizing: border-box;
}
.formula-katex-widget .katex { font-size: 1em; line-height: normal; }
`;
    document.head.appendChild(style);
}

interface FormulaRange {
    range: monaco.Range;
    latex: string;
}

// Unescape common Python string escapes so the preview shows the intended
// LaTeX (e.g. source "\\cos(t)" → \cos(t)).
function unescapePy(raw: string): string {
    return raw.replace(/\\\\/g, "\\").replace(/\\"/g, '"').replace(/\\'/g, "'");
}

// Find string literals passed to add_formula(...) calls; return their editor
// ranges (quotes inclusive) and decoded LaTeX content.
function findFormulaRanges(model: monaco.editor.ITextModel): FormulaRange[] {
    const text = model.getValue();
    const out: FormulaRange[] = [];
    const callRe = /add_formula(?:3d)?\s*\(/g;

    let m: RegExpExecArray | null;
    while ((m = callRe.exec(text)) !== null) {
        let i = callRe.lastIndex;
        let depth = 1;
        while (i < text.length && depth > 0) {
            const ch = text[i];
            if (ch === "(") { depth++; i++; continue; }
            if (ch === ")") { depth--; i++; continue; }
            if (ch === '"' || ch === "'") {
                const quote = ch;
                const start = i;
                i++;
                let raw = "";
                while (i < text.length) {
                    const c = text[i];
                    if (c === "\\") { raw += c + (text[i + 1] ?? ""); i += 2; continue; }
                    if (c === quote || c === "\n") break;
                    raw += c;
                    i++;
                }
                const end = Math.min(i + 1, text.length);
                const p1 = model.getPositionAt(start);
                const p2 = model.getPositionAt(end);
                out.push({
                    range: new monaco.Range(p1.lineNumber, p1.column, p2.lineNumber, p2.column),
                    latex: unescapePy(raw),
                });
                i = end;
                continue;
            }
            i++;
        }
    }
    return out;
}

function caretInside(range: monaco.Range, pos: monaco.Position): boolean {
    if (pos.lineNumber < range.startLineNumber || pos.lineNumber > range.endLineNumber) return false;
    if (pos.lineNumber === range.startLineNumber && pos.column < range.startColumn) return false;
    if (pos.lineNumber === range.endLineNumber && pos.column > range.endColumn) return false;
    return true;
}

const FORMULA_URI = "file:///boundary/formula.py";

// ─── Lightweight, serverless language features ──────────────────────────────
// A custom completion + hover provider scoped to this editor — no language
// server, no Pyodide. Outside a formula string it suggests the add_formula API
// + Python keywords; inside a string it suggests the LaTeX commands that the
// evaluator (utils/tex/evalAst) actually understands.

interface LatexDef { cmd: string; insert: string; doc: string }
const LATEX_DEFS: LatexDef[] = [
    { cmd: "\\sin", insert: "\\sin($1)", doc: "sine — `\\sin(t)`" },
    { cmd: "\\cos", insert: "\\cos($1)", doc: "cosine — `\\cos(t)`" },
    { cmd: "\\tan", insert: "\\tan($1)", doc: "tangent" },
    { cmd: "\\cot", insert: "\\cot($1)", doc: "cotangent" },
    { cmd: "\\sec", insert: "\\sec($1)", doc: "secant" },
    { cmd: "\\csc", insert: "\\csc($1)", doc: "cosecant" },
    { cmd: "\\arcsin", insert: "\\arcsin($1)", doc: "inverse sine" },
    { cmd: "\\arccos", insert: "\\arccos($1)", doc: "inverse cosine" },
    { cmd: "\\arctan", insert: "\\arctan($1)", doc: "inverse tangent" },
    { cmd: "\\sinh", insert: "\\sinh($1)", doc: "hyperbolic sine" },
    { cmd: "\\cosh", insert: "\\cosh($1)", doc: "hyperbolic cosine" },
    { cmd: "\\tanh", insert: "\\tanh($1)", doc: "hyperbolic tangent" },
    { cmd: "\\exp", insert: "\\exp($1)", doc: "exponential eˣ" },
    { cmd: "\\ln", insert: "\\ln($1)", doc: "natural log" },
    { cmd: "\\log", insert: "\\log($1)", doc: "log base 10" },
    { cmd: "\\sqrt", insert: "\\sqrt($1)", doc: "square root — `\\sqrt(x)` or `\\sqrt{x}`" },
    { cmd: "\\frac", insert: "\\frac{$1}{$2}", doc: "fraction — `\\frac{a}{b}`" },
    { cmd: "\\abs", insert: "\\abs($1)", doc: "absolute value" },
    { cmd: "\\floor", insert: "\\floor($1)", doc: "floor" },
    { cmd: "\\ceil", insert: "\\ceil($1)", doc: "ceiling" },
    { cmd: "\\pi", insert: "\\pi", doc: "π" },
    { cmd: "\\tau", insert: "\\tau", doc: "τ = 2π" },
];

const PY_KEYWORDS = [
    "for", "in", "range", "if", "else", "elif", "while", "def", "return",
    "import", "from", "print", "True", "False", "None", "and", "or", "not",
];

const KWARGS = ["t_min", "t_max", "dt", "u_min", "u_max", "du", "v_min", "v_max", "dv"];

const API_DOCS: Record<string, string> = {
    add_formula: [
        "**add_formula(x, y=None, \\*, t_min=None, t_max=None, dt=None)**",
        "",
        "Declare a 2D boundary curve.",
        "- Parametric: `add_formula(\"\\\\cos(t)\", \"\\\\sin(t)\")`",
        "- Explicit:   `add_formula(\"y = x^2\")`  (x parametrised as t)",
        "",
        "`t_min`/`t_max`/`dt` override the page defaults for this curve.",
    ].join("\n"),
    add_formula3d: [
        "**add_formula3d(x, y, z, \\*, u_min, u_max, du, v_min, v_max, dv)**",
        "",
        "Declare a 3D parametric surface x(u,v), y(u,v), z(u,v).",
    ].join("\n"),
};

let pythonFeaturesRegistered = false;
function registerPythonLanguageFeatures() {
    if (pythonFeaturesRegistered) return;
    try {
        monaco.languages.registerCompletionItemProvider("python", {
            triggerCharacters: ["\\"],
            provideCompletionItems(model, position) {
                const ranges = findFormulaRanges(model);
                const inFormula = ranges.some((r) => caretInside(r.range, position));

                // Inside an add_formula string → suggest LaTeX commands.
                if (inFormula) {
                    const lineToCursor = model.getValueInRange(
                        new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column),
                    );
                    const m = /\\([a-zA-Z]*)$/.exec(lineToCursor);
                    const startColumn = m ? position.column - m[0].length : position.column;
                    const range = new monaco.Range(position.lineNumber, startColumn, position.lineNumber, position.column);
                    return {
                        suggestions: LATEX_DEFS.map((d) => ({
                            label: d.cmd,
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: d.insert,
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            documentation: { value: d.doc },
                            detail: "LaTeX",
                            range,
                        })),
                    };
                }

                // Otherwise → the add_formula API + kwargs + Python keywords.
                const word = model.getWordUntilPosition(position);
                const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
                const suggestions: monaco.languages.CompletionItem[] = [
                    {
                        label: "add_formula",
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: 'add_formula("$1", "$2")',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: { value: API_DOCS.add_formula },
                        detail: "2D boundary curve",
                        range,
                    },
                    {
                        label: "add_formula3d",
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: 'add_formula3d("$1", "$2", "$3")',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: { value: API_DOCS.add_formula3d },
                        detail: "3D parametric surface",
                        range,
                    },
                    ...KWARGS.map((k) => ({
                        label: k,
                        kind: monaco.languages.CompletionItemKind.Property,
                        insertText: `${k}=`,
                        detail: "range override",
                        range,
                    })),
                    ...PY_KEYWORDS.map((k) => ({
                        label: k,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: k,
                        range,
                    })),
                ];
                return { suggestions };
            },
        });

        monaco.languages.registerHoverProvider("python", {
            provideHover(model, position) {
                const word = model.getWordAtPosition(position);
                if (word && API_DOCS[word.word]) {
                    return { contents: [{ value: API_DOCS[word.word] }] };
                }
                // LaTeX command under the cursor.
                const line = model.getLineContent(position.lineNumber);
                const re = /\\[a-zA-Z]+/g;
                let m: RegExpExecArray | null;
                while ((m = re.exec(line)) !== null) {
                    const startCol = m.index + 1; // 1-based column of the backslash
                    const endCol = startCol + m[0].length;
                    if (position.column >= startCol && position.column <= endCol) {
                        const def = LATEX_DEFS.find((d) => d.cmd === m![0]);
                        if (def) return { contents: [{ value: `**${def.cmd}** — ${def.doc}` }] };
                    }
                }
                return null;
            },
        });

        pythonFeaturesRegistered = true;
    } catch (e) {
        console.warn("[FormulaCodeEditor] python language features registration skipped:", e);
    }
}

export interface FormulaCodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    height?: number | string;
    theme?: "vs-dark" | "vs";
}

export function FormulaCodeEditor({
    value,
    onChange,
    height = 200,
    theme = "vs-dark",
}: FormulaCodeEditorProps) {
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    // Captured once: the editor is uncontrolled after mount (the parent reads
    // its value via onChange), so re-renders never reset the model / caret.
    const initialTextRef = useRef(value);
    const colorTheme = theme === "vs" ? "Default Light Modern" : "Default Dark Modern";

    // Stable config objects so MonacoEditorReactComp doesn't re-initialise.
    const vscodeApiConfigRef = useRef<ComponentProps<typeof MonacoEditorReactComp>["vscodeApiConfig"]>(undefined);
    if (!vscodeApiConfigRef.current) {
        vscodeApiConfigRef.current = {
            $type: "classic",
            logLevel: LogLevel.Warning,
            viewsConfig: { $type: "EditorService" },
            serviceOverrides: {
                ...getFilesServiceOverride(),
                ...getConfigurationServiceOverride(),
                ...getKeybindingsServiceOverride(),
                ...getLanguagesServiceOverride(),
                ...getQuickAccessServiceOverride(),
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
                    "editor.detectIndentation": false,
                }),
            },
            monacoWorkerFactory: installMonacoWorkerEnvironment,
        };
    }

    const editorAppConfigRef = useRef<ComponentProps<typeof MonacoEditorReactComp>["editorAppConfig"]>(undefined);
    if (!editorAppConfigRef.current) {
        editorAppConfigRef.current = {
            codeResources: {
                modified: { text: initialTextRef.current, uri: FORMULA_URI },
            },
            editorOptions: {
                automaticLayout: true,
                scrollBeyondLastLine: false,
                glyphMargin: false,
                lineNumbers: "on",
                overviewRulerLanes: 0,
            },
        };
    }

    const handleEditorStartDone = useCallback((app?: EditorApp) => {
        const editor = app?.getEditor();
        if (!editor) return;
        ensureStyles();
        registerPythonLanguageFeatures();

        let widgets: monaco.editor.IContentWidget[] = [];
        const decorations = editor.createDecorationsCollection([]);
        const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
        const fontSize = editor.getOption(monaco.editor.EditorOption.fontSize);

        const refresh = () => {
            const model = editor.getModel();
            if (!model) return;

            widgets.forEach((w) => editor.removeContentWidget(w));
            widgets = [];

            const ranges = findFormulaRanges(model);
            const pos = editor.getPosition();
            const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];

            ranges.forEach((r, idx) => {
                if (pos && caretInside(r.range, pos)) return; // caret here → show raw text

                newDecorations.push({ range: r.range, options: { inlineClassName: "formula-concealed" } });

                const dom = document.createElement("div");
                dom.className = "formula-katex-widget";
                dom.style.height = `${lineHeight}px`;
                dom.style.lineHeight = `${lineHeight}px`;
                dom.style.fontSize = `${fontSize}px`;
                try {
                    katex.render(r.latex || "\\square", dom, { throwOnError: false, displayMode: false, output: "html" });
                } catch {
                    dom.textContent = r.latex;
                }
                dom.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    editor.setPosition({ lineNumber: r.range.startLineNumber, column: r.range.startColumn + 1 });
                    editor.focus();
                });

                const widget: monaco.editor.IContentWidget = {
                    getId: () => `formula-katex-${idx}`,
                    getDomNode: () => dom,
                    getPosition: () => ({
                        position: { lineNumber: r.range.startLineNumber, column: r.range.startColumn },
                        preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
                    }),
                };
                editor.addContentWidget(widget);
                widgets.push(widget);
            });

            decorations.set(newDecorations);
        };

        const d1 = editor.onDidChangeModelContent(() => {
            const model = editor.getModel();
            if (model) onChangeRef.current(model.getValue());
            refresh();
        });
        const d2 = editor.onDidChangeCursorPosition(() => refresh());
        editor.onDidDispose(() => {
            d1.dispose();
            d2.dispose();
        });
        refresh();
    }, []);

    return (
        <div
            style={{
                height,
                ["--formula-editor-bg" as string]: theme === "vs-dark" ? "#1e1e1e" : "#fffffe",
                ["--formula-editor-fg" as string]: theme === "vs-dark" ? "#d4d4d4" : "#1e1e1e",
            }}
        >
            <MonacoEditorReactComp
                style={{ width: "100%", height: "100%" }}
                vscodeApiConfig={vscodeApiConfigRef.current}
                editorAppConfig={editorAppConfigRef.current}
                onEditorStartDone={handleEditorStartDone}
            />
        </div>
    );
}

export default FormulaCodeEditor;
