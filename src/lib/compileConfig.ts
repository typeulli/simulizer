// Project configuration for a C++ project.
//
// Lives as an optional `config.json` file at the project root (a normal file in
// the bundle tree — created/edited/deleted like any .cpp/.hpp). Build/compile
// options are namespaced under a top-level `"compile"` object so the file can
// grow other sections later. When absent or empty, defaults apply. The frontend
// is the source of truth: it parses and validates this file, then sends the
// resolved options to the compile backend (the file itself is never shipped into
// the build sandbox).

import type { TreeNode, FileNode } from "./cppBundle";

export const CONFIG_FILENAME = "config.json";

export type TargetSystem = "auto" | "windows" | "linux" | "macos";
export type OptLevel = "O0" | "O1" | "O2" | "O3" | "Os";
export type CppStd = "c++17" | "c++20" | "c++23";

export type CompileOptions = {
    /** Build target OS — Build only, ignored by Run (emcc). */
    system: TargetSystem;
    optimization: OptLevel;
    std: CppStd;
    /** Preprocessor defines, e.g. ["FOO", "BAR=1"] → -DFOO -DBAR=1 */
    defines: string[];
};

export const DEFAULT_COMPILE_OPTIONS: CompileOptions = {
    system: "auto",
    optimization: "O3",
    std: "c++17",
    defines: [],
};

// ─── Runtime environment (config["environment"]) ──────────────────────────
// The TensorFlow.js execution backend, persisted so a project can pin its
// preferred device. Default "webgpu" matches the worker's own fallback
// preference (webgpu → webgl → cpu), so the default is never written out.
export type DeviceKind = "webgpu" | "webgl" | "cpu";
export const DEVICES: DeviceKind[] = ["webgpu", "webgl", "cpu"];
export const DEFAULT_DEVICE: DeviceKind = "webgpu";
export const DEVICE_LABEL: Record<DeviceKind, string> = {
    webgpu: "WebGPU",
    webgl: "WebGL",
    cpu: "CPU",
};

export type EnvironmentOptions = {
    device: DeviceKind;
};

export const DEFAULT_ENVIRONMENT: EnvironmentOptions = {
    device: DEFAULT_DEVICE,
};

const SYSTEMS: TargetSystem[] = ["auto", "windows", "linux", "macos"];

export const SYSTEM_LABEL: Record<TargetSystem, string> = {
    auto: "Auto",
    windows: "Windows",
    linux: "Linux",
    macos: "macOS",
};
const OPT_LEVELS: OptLevel[] = ["O0", "O1", "O2", "O3", "Os"];
const STDS: CppStd[] = ["c++17", "c++20", "c++23"];

// A single preprocessor define token: an identifier, optionally `=value` where
// value is word chars / dots. Deliberately strict — these reach the compiler
// command line, so anything shell-special is rejected.
export const DEFINE_PATTERN = "^[A-Za-z_][A-Za-z0-9_]*(=[A-Za-z0-9_.]+)?$";
const DEFINE_RE = new RegExp(DEFINE_PATTERN);

export type ParsedCompileConfig = {
    options: CompileOptions;
    /** Non-null only when the file couldn't be parsed as a JSON object at all. */
    error: string | null;
};

// Parse + validate config.json content, returning the resolved compile options
// from its `compile` section. Unknown / out-of-range field values fall back to
// their default silently (the editor surfaces schema errors live); only a hard
// JSON/shape failure yields an `error` worth a build-time warning.
export function parseCompileConfig(raw: string | undefined | null): ParsedCompileConfig {
    if (raw == null || raw.trim() === "") {
        return { options: { ...DEFAULT_COMPILE_OPTIONS }, error: null };
    }
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return {
            options: { ...DEFAULT_COMPILE_OPTIONS },
            error: "config.json 을 읽을 수 없어요 (JSON 형식 오류). 기본 설정으로 빌드합니다.",
        };
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        return {
            options: { ...DEFAULT_COMPILE_OPTIONS },
            error: "config.json 은 객체(object)여야 해요. 기본 설정으로 빌드합니다.",
        };
    }
    const compileRaw = (data as Record<string, unknown>).compile;
    // No "compile" section → defaults (a config.json may hold only other sections).
    if (compileRaw === undefined) {
        return { options: { ...DEFAULT_COMPILE_OPTIONS }, error: null };
    }
    if (typeof compileRaw !== "object" || compileRaw === null || Array.isArray(compileRaw)) {
        return {
            options: { ...DEFAULT_COMPILE_OPTIONS },
            error: 'config.json 의 "compile" 은 객체여야 해요. 기본 설정으로 빌드합니다.',
        };
    }
    const c = compileRaw as Record<string, unknown>;
    const options: CompileOptions = { ...DEFAULT_COMPILE_OPTIONS };
    if (typeof c.system === "string" && SYSTEMS.includes(c.system as TargetSystem)) {
        options.system = c.system as TargetSystem;
    }
    if (typeof c.optimization === "string" && OPT_LEVELS.includes(c.optimization as OptLevel)) {
        options.optimization = c.optimization as OptLevel;
    }
    if (typeof c.std === "string" && STDS.includes(c.std as CppStd)) {
        options.std = c.std as CppStd;
    }
    if (Array.isArray(c.defines)) {
        options.defines = c.defines.filter(
            (d): d is string => typeof d === "string" && DEFINE_RE.test(d),
        );
    }
    return { options, error: null };
}

// Read + parse the root `config.json` from a bundle tree (if present).
export function readCompileConfig(tree: TreeNode[]): ParsedCompileConfig {
    const node = tree.find(
        (n): n is FileNode => n.type === "file" && n.name === CONFIG_FILENAME,
    );
    return parseCompileConfig(node?.content);
}

export type ParsedEnvironmentConfig = {
    environment: EnvironmentOptions;
    /** Whether `environment.device` was explicitly present (vs defaulted). */
    deviceExplicit: boolean;
    error: string | null;
};

// Parse + validate the `environment` section of config.json. Like the compile
// parser, unknown/out-of-range values fall back to defaults silently; only a
// hard JSON/shape failure yields an `error`.
export function parseEnvironmentConfig(raw: string | undefined | null): ParsedEnvironmentConfig {
    if (raw == null || raw.trim() === "") {
        return { environment: { ...DEFAULT_ENVIRONMENT }, deviceExplicit: false, error: null };
    }
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return { environment: { ...DEFAULT_ENVIRONMENT }, deviceExplicit: false, error: "config.json 을 읽을 수 없어요 (JSON 형식 오류). 기본 설정으로 실행합니다." };
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        return { environment: { ...DEFAULT_ENVIRONMENT }, deviceExplicit: false, error: "config.json 은 객체(object)여야 해요. 기본 설정으로 실행합니다." };
    }
    const envRaw = (data as Record<string, unknown>).environment;
    if (envRaw === undefined) {
        return { environment: { ...DEFAULT_ENVIRONMENT }, deviceExplicit: false, error: null };
    }
    if (typeof envRaw !== "object" || envRaw === null || Array.isArray(envRaw)) {
        return { environment: { ...DEFAULT_ENVIRONMENT }, deviceExplicit: false, error: 'config.json 의 "environment" 은 객체여야 해요. 기본 설정으로 실행합니다.' };
    }
    const e = envRaw as Record<string, unknown>;
    const environment: EnvironmentOptions = { ...DEFAULT_ENVIRONMENT };
    let deviceExplicit = false;
    if (typeof e.device === "string" && DEVICES.includes(e.device as DeviceKind)) {
        environment.device = e.device as DeviceKind;
        deviceExplicit = true;
    }
    return { environment, deviceExplicit, error: null };
}

export function readEnvironmentConfig(tree: TreeNode[]): ParsedEnvironmentConfig {
    const node = tree.find(
        (n): n is FileNode => n.type === "file" && n.name === CONFIG_FILENAME,
    );
    return parseEnvironmentConfig(node?.content);
}

// Drop every `.json` file from the tree (recursively). The compile backend
// only accepts .cpp/.hpp sources, and config/data JSON has no place in the
// build sandbox — so we strip it before shipping the tree to /build or /emcc.
export function stripJsonFiles(tree: TreeNode[]): TreeNode[] {
    const out: TreeNode[] = [];
    for (const n of tree) {
        if (n.type === "file") {
            if (n.name.toLowerCase().endsWith(".json")) continue;
            out.push(n);
        } else {
            out.push({ ...n, contents: stripJsonFiles(n.contents) });
        }
    }
    return out;
}

// JSON Schema used by the editor for `config.json` autocomplete + validation.
// Build options live under the top-level `compile` object; the top level itself
// stays open so future config sections don't trip validation.
export const CONFIG_SCHEMA = {
    type: "object",
    properties: {
        compile: {
            type: "object",
            additionalProperties: false,
            description: "C++ 빌드/실행 설정.",
            properties: {
                system: {
                    type: "string",
                    enum: SYSTEMS,
                    default: "auto",
                    description: "빌드 대상 OS. Build 전용이며 Run(브라우저 실행)에서는 무시됩니다.",
                },
                optimization: {
                    type: "string",
                    enum: OPT_LEVELS,
                    default: "O3",
                    description: "컴파일러 최적화 레벨 (-O…).",
                },
                std: {
                    type: "string",
                    enum: STDS,
                    default: "c++17",
                    description: "C++ 표준 (-std=…). c++23 은 툴체인에 따라 부분 지원될 수 있어요.",
                },
                defines: {
                    type: "array",
                    items: { type: "string", pattern: DEFINE_PATTERN },
                    default: [],
                    description: '전처리기 정의 (-D). 예: ["DEBUG", "VERSION=2"]',
                },
            },
        },
        environment: {
            type: "object",
            additionalProperties: false,
            description: "런타임 실행 환경 설정.",
            properties: {
                device: {
                    type: "string",
                    enum: DEVICES,
                    default: "webgpu",
                    description: "TensorFlow.js 실행 백엔드 (WebGPU / WebGL / CPU).",
                },
            },
        },
    },
} as const;

// ─── Settings-window form model ───────────────────────────────────────────
// The VS Code-style settings modal renders one control per `compile` field.
// Descriptions are sourced from CONFIG_SCHEMA so the GUI and the JSON schema
// stay in sync (single source of truth).
const COMPILE_PROPS = CONFIG_SCHEMA.properties.compile.properties;

export type EnumCompileField = {
    key: "system" | "optimization" | "std";
    kind: "enum";
    label: string;
    description: string;
    options: readonly string[];
    /** Optional human labels for option values (e.g. auto → "Auto"). */
    optionLabels?: Record<string, string>;
};
export type ListCompileField = {
    key: "defines";
    kind: "list";
    label: string;
    description: string;
    itemPattern: string;
    placeholder: string;
};
export type CompileField = EnumCompileField | ListCompileField;

export const COMPILE_FIELDS: CompileField[] = [
    { key: "system", kind: "enum", label: "Target System", description: COMPILE_PROPS.system.description, options: SYSTEMS, optionLabels: SYSTEM_LABEL },
    { key: "optimization", kind: "enum", label: "Optimization", description: COMPILE_PROPS.optimization.description, options: OPT_LEVELS },
    { key: "std", kind: "enum", label: "C++ Standard", description: COMPILE_PROPS.std.description, options: STDS },
    { key: "defines", kind: "list", label: "Defines", description: COMPILE_PROPS.defines.description, itemPattern: DEFINE_PATTERN, placeholder: "예: DEBUG 또는 VERSION=2" },
];

// Only the fields that differ from their defaults — we never write defaults to
// config.json (a default-valued project keeps an empty, or absent, section).
function nonDefaultCompile(o: CompileOptions): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (o.system !== DEFAULT_COMPILE_OPTIONS.system) out.system = o.system;
    if (o.optimization !== DEFAULT_COMPILE_OPTIONS.optimization) out.optimization = o.optimization;
    if (o.std !== DEFAULT_COMPILE_OPTIONS.std) out.std = o.std;
    if (o.defines.length > 0) out.defines = o.defines;
    return out;
}
function nonDefaultEnvironment(e: EnvironmentOptions): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (e.device !== DEFAULT_ENVIRONMENT.device) out.device = e.device;
    return out;
}

// Serialize the project config into config.json content, preserving any other
// top-level keys already present in `rawConfig` and writing ONLY non-default
// values. A section that reduces to all-defaults is dropped entirely (so a
// fully-default project serializes to `{}`). Returns an `error` (leaving
// content untouched) when the existing file can't be parsed.
export function serializeProjectConfig(
    rawConfig: string | undefined | null,
    next: { compile: CompileOptions; environment: EnvironmentOptions },
): { content: string; error: string | null } {
    let base: Record<string, unknown> = {};
    if (rawConfig != null && rawConfig.trim() !== "") {
        let data: unknown;
        try {
            data = JSON.parse(rawConfig);
        } catch {
            return {
                content: rawConfig,
                error: "config.json 형식 오류로 설정 창에서 편집할 수 없어요. JSON 으로 열어 먼저 고쳐주세요.",
            };
        }
        if (typeof data === "object" && data !== null && !Array.isArray(data)) {
            base = data as Record<string, unknown>;
        }
    }
    const compile = nonDefaultCompile(next.compile);
    if (Object.keys(compile).length > 0) base.compile = compile; else delete base.compile;
    const environment = nonDefaultEnvironment(next.environment);
    if (Object.keys(environment).length > 0) base.environment = environment; else delete base.environment;
    return { content: JSON.stringify(base, null, 2) + "\n", error: null };
}

// Content used when `$config-json` materializes the file. Defaults aren't
// written, so a fresh config is just an empty object.
export function defaultConfigJson(): string {
    return serializeProjectConfig(null, {
        compile: DEFAULT_COMPILE_OPTIONS,
        environment: DEFAULT_ENVIRONMENT,
    }).content;
}
