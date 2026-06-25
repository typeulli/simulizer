// Project configuration for a C++ project.
//
// Lives as an optional `config.json` file at the project root (a normal file in
// the bundle tree). Settings are namespaced under top-level sections:
//   build:       target OS + exe icon          (Build only)
//   compile:     optimization / std / defines   (Build and Run)
//   environment: TensorFlow.js device           (Run only)
// When absent or empty, defaults apply. config.json ships inside the bundle
// tree; the backend parses it server-side as the source of truth.

import type { TreeNode, FileNode } from "./cppBundle";

export const CONFIG_FILENAME = "config.json";

export type OptLevel = "O0" | "O1" | "O2" | "O3" | "Os";
export type CppStd = "c++17" | "c++20" | "c++23";

// Build target operating systems. A Build produces a multi-OS `.sim` bundle —
// one native binary per enabled OS — which simulizerv unpacks for the current
// OS at launch. macOS is wired up but only built when a macOS build server is
// available; otherwise it's silently skipped by the backend.
export const OS_KEYS = ["windows", "linux", "macos"] as const;
export type OsKey = typeof OS_KEYS[number];

/** Which OSes a Build targets. Every OS defaults to `true` (all platforms). */
export type BuildSystem = Record<OsKey, boolean>;

// ─── build (config["build"]) — Build-only: target OSes + exe icon ──────────
export type BuildOptions = {
    /** Per-OS build toggles — Build only, ignored by Run (emcc). */
    system: BuildSystem;
    /**
     * Relative path (anywhere in the project) to an image used as the Windows
     * exe icon. Empty = default icon. Non-.ico images are converted to .ico
     * server-side. Build-only and Windows-only.
     */
    icon: string;
};

export const DEFAULT_BUILD_SYSTEM: BuildSystem = { windows: true, linux: true, macos: true };

export const DEFAULT_BUILD_OPTIONS: BuildOptions = {
    system: { ...DEFAULT_BUILD_SYSTEM },
    icon: "",
};

// Default folder the settings window's "이미지 업로드" button drops new icons
// into. The icon path itself may point anywhere in the project.
export const ICON_DIR = "build/icon";

// ─── compile (config["compile"]) — applies to both Build and Run ───────────
export type CompileOptions = {
    optimization: OptLevel;
    std: CppStd;
    /** Preprocessor defines, e.g. ["FOO", "BAR=1"] → -DFOO -DBAR=1 */
    defines: string[];
};

export const DEFAULT_COMPILE_OPTIONS: CompileOptions = {
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

export const SYSTEM_LABEL: Record<OsKey, string> = {
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

// ─── Shared section reader ─────────────────────────────────────────────────
// Parse config.json once and pull out a named top-level object section. `verb`
// ("빌드"/"실행") tailors the fall-back-to-defaults warning. Unknown/out-of-range
// field values are left for each caller to drop silently; only a hard JSON/shape
// failure yields an `error` worth a build-time warning.
type SectionResult = { section: Record<string, unknown>; error: string | null };

function readConfigSection(raw: string | undefined | null, name: string, verb: string): SectionResult {
    if (raw == null || raw.trim() === "") return { section: {}, error: null };
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return { section: {}, error: `config.json 을 읽을 수 없어요 (JSON 형식 오류). 기본 설정으로 ${verb}합니다.` };
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        return { section: {}, error: `config.json 은 객체(object)여야 해요. 기본 설정으로 ${verb}합니다.` };
    }
    const raw2 = (data as Record<string, unknown>)[name];
    if (raw2 === undefined) return { section: {}, error: null };
    if (typeof raw2 !== "object" || raw2 === null || Array.isArray(raw2)) {
        return { section: {}, error: `config.json 의 "${name}" 은 객체여야 해요. 기본 설정으로 ${verb}합니다.` };
    }
    return { section: raw2 as Record<string, unknown>, error: null };
}

function configContent(tree: TreeNode[]): string | undefined {
    const node = tree.find((n): n is FileNode => n.type === "file" && n.name === CONFIG_FILENAME);
    return node?.content;
}

// ─── build parser ──────────────────────────────────────────────────────────
export type ParsedBuildConfig = {
    options: BuildOptions;
    /** Non-null only when config.json couldn't be parsed as a JSON object. */
    error: string | null;
};

export function parseBuildConfig(raw: string | undefined | null): ParsedBuildConfig {
    const { section, error } = readConfigSection(raw, "build", "빌드");
    const options: BuildOptions = { ...DEFAULT_BUILD_OPTIONS, system: { ...DEFAULT_BUILD_SYSTEM } };
    // `system` is an object of per-OS booleans (e.g. {"linux": false}); every OS
    // defaults to true. Anything else (missing / wrong-shaped) leaves all true.
    const sys = section.system;
    if (typeof sys === "object" && sys !== null && !Array.isArray(sys)) {
        for (const os of OS_KEYS) {
            const v = (sys as Record<string, unknown>)[os];
            if (typeof v === "boolean") options.system[os] = v;
        }
    }
    if (typeof section.icon === "string") {
        options.icon = section.icon.trim();
    }
    return { options, error };
}

export function readBuildConfig(tree: TreeNode[]): ParsedBuildConfig {
    return parseBuildConfig(configContent(tree));
}

// ─── compile parser ────────────────────────────────────────────────────────
export type ParsedCompileConfig = {
    options: CompileOptions;
    error: string | null;
};

export function parseCompileConfig(raw: string | undefined | null): ParsedCompileConfig {
    const { section, error } = readConfigSection(raw, "compile", "빌드");
    const options: CompileOptions = { ...DEFAULT_COMPILE_OPTIONS };
    if (typeof section.optimization === "string" && OPT_LEVELS.includes(section.optimization as OptLevel)) {
        options.optimization = section.optimization as OptLevel;
    }
    if (typeof section.std === "string" && STDS.includes(section.std as CppStd)) {
        options.std = section.std as CppStd;
    }
    if (Array.isArray(section.defines)) {
        options.defines = section.defines.filter(
            (d): d is string => typeof d === "string" && DEFINE_RE.test(d),
        );
    }
    return { options, error };
}

export function readCompileConfig(tree: TreeNode[]): ParsedCompileConfig {
    return parseCompileConfig(configContent(tree));
}

// ─── environment parser ──────────────────────────────────────────────────
export type ParsedEnvironmentConfig = {
    environment: EnvironmentOptions;
    /** Whether `environment.device` was explicitly present (vs defaulted). */
    deviceExplicit: boolean;
    error: string | null;
};

export function parseEnvironmentConfig(raw: string | undefined | null): ParsedEnvironmentConfig {
    const { section, error } = readConfigSection(raw, "environment", "실행");
    const environment: EnvironmentOptions = { ...DEFAULT_ENVIRONMENT };
    let deviceExplicit = false;
    if (typeof section.device === "string" && DEVICES.includes(section.device as DeviceKind)) {
        environment.device = section.device as DeviceKind;
        deviceExplicit = true;
    }
    return { environment, deviceExplicit, error };
}

export function readEnvironmentConfig(tree: TreeNode[]): ParsedEnvironmentConfig {
    return parseEnvironmentConfig(configContent(tree));
}

// JSON Schema used by the editor for `config.json` autocomplete + validation.
// Each top-level section is closed (additionalProperties:false); the top level
// itself stays open so future sections don't trip validation.
export const CONFIG_SCHEMA = {
    type: "object",
    properties: {
        build: {
            type: "object",
            additionalProperties: false,
            description: "빌드(실행 파일 생성) 설정. Build 전용.",
            properties: {
                system: {
                    type: "object",
                    additionalProperties: false,
                    description: "빌드 대상 OS별 on/off. 켜진 OS마다 네이티브 바이너리를 만들어 하나의 .sim 으로 묶고, simulizerv 가 현재 OS용만 풀어 실행합니다. 각 OS 기본값은 true (전체 플랫폼). Build 전용.",
                    properties: {
                        windows: { type: "boolean", default: true, description: "Windows 바이너리 포함." },
                        linux: { type: "boolean", default: true, description: "Linux 바이너리 포함." },
                        macos: { type: "boolean", default: true, description: "macOS 바이너리 포함 (전용 빌드 서버가 있을 때만 실제로 빌드됩니다)." },
                    },
                },
                icon: {
                    type: "string",
                    default: "",
                    description: "Windows exe 아이콘으로 쓸 이미지 파일의 상대 경로 (예: build/icon/app.png). 프로젝트 어디든 가능하며, .ico 가 아니면 서버에서 .ico 로 변환됩니다. Build(Windows)에서만 적용됩니다.",
                },
            },
        },
        compile: {
            type: "object",
            additionalProperties: false,
            description: "컴파일 설정. Build·Run 모두에 적용됩니다.",
            properties: {
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
// The VS Code-style settings modal renders one control per field. Descriptions
// are sourced from CONFIG_SCHEMA so the GUI and the JSON schema stay in sync.
const BUILD_PROPS = CONFIG_SCHEMA.properties.build.properties;
const COMPILE_PROPS = CONFIG_SCHEMA.properties.compile.properties;

export type EnumCompileField = {
    key: "optimization" | "std";
    kind: "enum";
    label: string;
    description: string;
    options: readonly string[];
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
    { key: "optimization", kind: "enum", label: "Optimization", description: COMPILE_PROPS.optimization.description, options: OPT_LEVELS },
    { key: "std", kind: "enum", label: "C++ Standard", description: COMPILE_PROPS.std.description, options: STDS },
    { key: "defines", kind: "list", label: "Defines", description: COMPILE_PROPS.defines.description, itemPattern: DEFINE_PATTERN, placeholder: "예: DEBUG 또는 VERSION=2" },
];

// The 빌드 tab's "Target Systems" control is a checkbox per OS, rendered
// manually in the settings window (alongside the icon control). The shared
// description text comes from CONFIG_SCHEMA so the GUI and JSON schema agree.
export const BUILD_SYSTEM_DESCRIPTION = BUILD_PROPS.system.description;

// Only the fields that differ from their defaults — we never write defaults to
// config.json (a default-valued project keeps an empty, or absent, section).
function nonDefaultBuild(b: BuildOptions): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    // Each OS defaults to true, so only write the ones turned OFF — a project
    // building everywhere keeps `system` absent, and disabling Linux serializes
    // to exactly {"linux": false}.
    const system: Record<string, boolean> = {};
    for (const os of OS_KEYS) {
        if (b.system[os] !== DEFAULT_BUILD_SYSTEM[os]) system[os] = b.system[os];
    }
    if (Object.keys(system).length > 0) out.system = system;
    if (b.icon && b.icon.trim() !== "") out.icon = b.icon.trim();
    return out;
}
function nonDefaultCompile(o: CompileOptions): Record<string, unknown> {
    const out: Record<string, unknown> = {};
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
    next: { build: BuildOptions; compile: CompileOptions; environment: EnvironmentOptions },
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
    const build = nonDefaultBuild(next.build);
    if (Object.keys(build).length > 0) base.build = build; else delete base.build;
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
        build: DEFAULT_BUILD_OPTIONS,
        compile: DEFAULT_COMPILE_OPTIONS,
        environment: DEFAULT_ENVIRONMENT,
    }).content;
}
