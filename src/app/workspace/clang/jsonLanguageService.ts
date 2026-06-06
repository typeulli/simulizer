// Real JSON language support for the editor, powered by `vscode-json-languageservice`
// (the same engine VS Code's built-in JSON support uses) run IN-PROCESS and bridged
// to Monaco providers. We do this instead of the json-language-features VS Code
// extension because that extension spawns its own language-server worker whose
// asset the dev bundler can't serve ("Failed to fetch"). Running the service in
// the main thread sidesteps workers entirely while still giving real,
// schema-driven completion / hover / validation for compile.json.

import * as monaco from "@codingame/monaco-vscode-editor-api";
import {
    getLanguageService,
    ClientCapabilities,
    TextDocument,
    CompletionItemKind as LspCompletionItemKind,
    InsertTextFormat,
    DiagnosticSeverity,
    type JSONSchema,
    type CompletionItem as LspCompletionItem,
    type Diagnostic as LspDiagnostic,
    type Hover as LspHover,
    type Range as LspRange,
    type MarkupContent,
} from "vscode-json-languageservice";

import { CONFIG_FILENAME, CONFIG_SCHEMA } from "@/lib/compileConfig";

const SCHEMA_URI = "inmemory://schemas/project-config.json";

// LSP CompletionItemKind → Monaco CompletionItemKind, by name.
const KIND_NAMES: (keyof typeof LspCompletionItemKind)[] = [
    "Text", "Method", "Function", "Constructor", "Field", "Variable", "Class",
    "Interface", "Module", "Property", "Unit", "Value", "Enum", "Keyword",
    "Snippet", "Color", "File", "Reference", "Folder", "EnumMember", "Constant",
    "Struct", "Event", "Operator", "TypeParameter",
];
const KIND_MAP = new Map<number, monaco.languages.CompletionItemKind>();
for (const name of KIND_NAMES) {
    const lsp = LspCompletionItemKind[name];
    const mon = (monaco.languages.CompletionItemKind as unknown as Record<string, number>)[name];
    if (typeof lsp === "number" && typeof mon === "number") KIND_MAP.set(lsp, mon);
}

const SEVERITY_MAP: Record<number, monaco.MarkerSeverity> = {
    [DiagnosticSeverity.Error]: monaco.MarkerSeverity.Error,
    [DiagnosticSeverity.Warning]: monaco.MarkerSeverity.Warning,
    [DiagnosticSeverity.Information]: monaco.MarkerSeverity.Info,
    [DiagnosticSeverity.Hint]: monaco.MarkerSeverity.Hint,
};

const toMonacoRange = (r: LspRange): monaco.IRange => ({
    startLineNumber: r.start.line + 1,
    startColumn: r.start.character + 1,
    endLineNumber: r.end.line + 1,
    endColumn: r.end.character + 1,
});

const toMonacoDoc = (d?: string | MarkupContent): string | monaco.IMarkdownString | undefined => {
    if (!d) return undefined;
    return typeof d === "string" ? d : { value: d.value };
};

function toMonacoCompletion(item: LspCompletionItem, fallback: monaco.IRange): monaco.languages.CompletionItem {
    let insertText = item.insertText ?? item.label;
    let range: monaco.languages.CompletionItem["range"] = fallback;
    const edit = item.textEdit;
    if (edit) {
        insertText = edit.newText;
        if ("range" in edit) {
            range = toMonacoRange(edit.range);
        } else {
            range = { insert: toMonacoRange(edit.insert), replace: toMonacoRange(edit.replace) };
        }
    }
    return {
        label: item.label,
        kind: KIND_MAP.get(item.kind ?? LspCompletionItemKind.Property) ?? monaco.languages.CompletionItemKind.Property,
        insertText,
        insertTextRules: item.insertTextFormat === InsertTextFormat.Snippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
        range,
        detail: item.detail,
        documentation: toMonacoDoc(item.documentation),
        filterText: item.filterText,
        sortText: item.sortText,
    };
}

function toMonacoMarker(d: LspDiagnostic): monaco.editor.IMarkerData {
    return {
        severity: SEVERITY_MAP[d.severity ?? DiagnosticSeverity.Error] ?? monaco.MarkerSeverity.Error,
        message: d.message,
        ...toMonacoRange(d.range),
        code: typeof d.code === "string" || typeof d.code === "number" ? String(d.code) : undefined,
        source: d.source,
    };
}

function toMonacoHover(h: LspHover): monaco.languages.Hover {
    const out: monaco.IMarkdownString[] = [];
    const c = h.contents;
    if (typeof c === "string") {
        out.push({ value: c });
    } else if (Array.isArray(c)) {
        for (const part of c) out.push({ value: typeof part === "string" ? part : part.value });
    } else if (c) {
        out.push({ value: (c as MarkupContent).value });
    }
    return { contents: out, range: h.range ? toMonacoRange(h.range) : undefined };
}

// The JSON service inserts object-valued properties collapsed onto one line
// (e.g. `"compile": {}`). For our top-level sections — which we know are
// objects — rewrite the completion to a formatted, multi-line block with the
// cursor inside.
const OBJECT_SECTIONS = new Set(["build", "compile", "environment"]);
function expandObjectSnippet(item: LspCompletionItem): void {
    if (!OBJECT_SECTIONS.has(item.label)) return;
    const existing = item.textEdit?.newText ?? item.insertText ?? "";
    const trailingComma = existing.trimEnd().endsWith(",") ? "," : "";
    const newText = `"${item.label}": {\n\t$0\n}${trailingComma}`;
    if (item.textEdit) {
        item.textEdit = { ...item.textEdit, newText };
    } else {
        item.insertText = newText;
    }
    item.insertTextFormat = InsertTextFormat.Snippet;
}

let registered = false;

// Register Monaco JSON providers backed by vscode-json-languageservice. Idempotent;
// safe to call after the workbench services are up (post editor start).
export function setupJsonLanguageService(): void {
    if (registered) return;
    try {
        const service = getLanguageService({
            clientCapabilities: ClientCapabilities.LATEST,
            // Only our inline compile.json schema is served; no network fetches.
            schemaRequestService: (uri) =>
                uri === SCHEMA_URI
                    ? Promise.resolve(JSON.stringify(CONFIG_SCHEMA))
                    : Promise.reject(new Error(`Unsupported schema: ${uri}`)),
        });
        service.configure({
            validate: true,
            allowComments: false,
            schemas: [{
                uri: SCHEMA_URI,
                fileMatch: [CONFIG_FILENAME, `**/${CONFIG_FILENAME}`, `*${CONFIG_FILENAME}`],
                schema: CONFIG_SCHEMA as unknown as JSONSchema,
            }],
        });

        const toDoc = (model: monaco.editor.ITextModel): TextDocument =>
            TextDocument.create(model.uri.toString(), "json", model.getVersionId(), model.getValue());

        monaco.languages.registerCompletionItemProvider("json", {
            // Only auto-open on a quote (a key/value string start). Notably NOT
            // on "{" — so an empty `{}` stays quiet until the user types `"`.
            triggerCharacters: ['"'],
            async provideCompletionItems(model, position) {
                const doc = toDoc(model);
                const jsonDoc = service.parseJSONDocument(doc);
                const list = await service.doComplete(
                    doc,
                    { line: position.lineNumber - 1, character: position.column - 1 },
                    jsonDoc,
                );
                if (!list) return { suggestions: [] };
                const w = model.getWordUntilPosition(position);
                const fallback: monaco.IRange = {
                    startLineNumber: position.lineNumber,
                    startColumn: w.startColumn,
                    endLineNumber: position.lineNumber,
                    endColumn: w.endColumn,
                };
                for (const it of list.items) expandObjectSnippet(it);
                return {
                    suggestions: list.items.map(it => toMonacoCompletion(it, fallback)),
                    incomplete: list.isIncomplete,
                };
            },
        });

        monaco.languages.registerHoverProvider("json", {
            async provideHover(model, position) {
                const doc = toDoc(model);
                const jsonDoc = service.parseJSONDocument(doc);
                const hover = await service.doHover(
                    doc,
                    { line: position.lineNumber - 1, character: position.column - 1 },
                    jsonDoc,
                );
                return hover ? toMonacoHover(hover) : null;
            },
        });

        // Schema + syntax diagnostics, refreshed on every edit.
        const validate = async (model: monaco.editor.ITextModel) => {
            if (model.isDisposed() || model.getLanguageId() !== "json") return;
            const doc = toDoc(model);
            const jsonDoc = service.parseJSONDocument(doc);
            const diags = await service.doValidation(doc, jsonDoc);
            if (model.isDisposed()) return;
            monaco.editor.setModelMarkers(model, "json", diags.map(toMonacoMarker));
        };
        const watch = (model: monaco.editor.ITextModel) => {
            if (model.getLanguageId() !== "json") return;
            void validate(model);
            const sub = model.onDidChangeContent(() => void validate(model));
            model.onWillDispose(() => sub.dispose());
        };
        monaco.editor.getModels().forEach(watch);
        monaco.editor.onDidCreateModel(watch);

        registered = true;
    } catch (e) {
        console.warn("[CodeEditor] JSON language service setup skipped:", e);
    }
}
