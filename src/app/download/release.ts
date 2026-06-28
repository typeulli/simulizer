// Shared release/download config for the /download pages.
//
// HOSTING: GitHub Releases on the `typeulli/simulizer-desktop` repo. Each page
// links to the `/releases/latest/download/<asset>` redirect, which always points
// at the newest release — but ONLY stays valid if every release uploads each
// platform's installer under the SAME CONSTANT filename below (no version in the
// name). Per release, upload exactly these three assets (produced by the
// per-OS build scripts in `desktop/`):
//     simulizer-windows-setup.exe     (NSIS installer)
//     simulizer-linux-setup.AppImage  (AppImage)
//     simulizer-macos-setup.dmg       (disk image)
// Bump `VERSION` here for display only — the latest redirect tracks the newest
// release regardless.

export type OS = "windows" | "linux" | "macos";

const REPO = "https://github.com/typeulli/simulizer-desktop";

export const VERSION = "1.0.2"; // display only
export const RELEASES_PAGE = `${REPO}/releases`;

export interface Req {
    label: string;
    value: string;
}

export interface Included {
    kind: "editor" | "viewer" | "file";
    title: string;
    mono: string;
    desc: string;
}

export interface PlatformRelease {
    os: OS;
    label: string; // "Windows"
    filename: string; // constant release asset name
    url: string; // /releases/latest/download/<filename>
    summary: string; // one line shown under the button
    included: Included[];
    requirements: Req[];
    note: { title: string; body: string }; // install caveat (signing / Gatekeeper / AppImage)
}

const asset = (name: string) => `${REPO}/releases/latest/download/${name}`;

export const PLATFORMS: Record<OS, PlatformRelease> = {
    windows: {
        os: "windows",
        label: "Windows",
        filename: "simulizer-windows-setup.exe",
        url: asset("simulizer-windows-setup.exe"),
        summary: "Windows 10 / 11 · 64-bit",
        included: [
            { kind: "editor", title: "Simulizer Editor", mono: "simulizer.exe", desc: "Block과 C++ 워크스페이스를 그대로. 프로젝트는 .simblock / .simclang 파일로 로컬에 저장됩니다." },
            { kind: "viewer", title: "Simulizer Viewer", mono: "simulizerv.exe", desc: ".sim 시뮬레이션을 실행하고 결과를 시각화하는 가벼운 뷰어입니다." },
            { kind: "file", title: ".sim 파일 연결", mono: "double-click → open", desc: ".sim 더블클릭으로 바로 실행. 시작 메뉴 · 바탕화면 바로가기도 함께 등록됩니다." },
        ],
        requirements: [
            { label: "운영체제", value: "Windows 10 / 11 (64-bit)" },
            { label: "런타임", value: "Microsoft Edge WebView2 (대부분의 Windows에 기본 포함)" },
            { label: "디스크", value: "약 200 MB" },
            { label: "라이선스", value: "AGPL-3.0 · 무료" },
        ],
        note: {
            title: "설치 시 “Windows의 PC 보호” 화면이 뜰 수 있습니다",
            body: "설치 파일에 아직 코드 서명이 적용되지 않아 SmartScreen 경고가 표시될 수 있습니다. 추가 정보 → 실행을 눌러 설치를 계속하세요.",
        },
    },
    macos: {
        os: "macos",
        label: "macOS",
        filename: "simulizer-macos-setup.dmg",
        url: asset("simulizer-macos-setup.dmg"),
        summary: "macOS 11+ · Apple Silicon / Intel",
        included: [
            { kind: "viewer", title: "Simulizer Viewer", mono: "Simulizer.app", desc: ".sim 시뮬레이션을 실행하고 결과를 시각화하는 뷰어입니다." },
            { kind: "editor", title: "에디터는 준비 중", mono: "Windows 전용 (현재)", desc: "Block / C++ 에디터는 현재 Windows 전용입니다. macOS 빌드는 추후 제공될 예정이에요." },
        ],
        requirements: [
            { label: "운영체제", value: "macOS 11 (Big Sur) 이상" },
            { label: "런타임", value: "시스템 WebKit (별도 설치 불필요)" },
            { label: "디스크", value: "약 200 MB" },
            { label: "라이선스", value: "AGPL-3.0 · 무료" },
        ],
        note: {
            title: "“확인되지 않은 개발자” 경고가 뜰 수 있습니다",
            body: "아직 공증(notarization)이 적용되지 않았습니다. 앱을 우클릭 → 열기로 한 번 실행하거나, 시스템 설정 → 개인정보 보호 및 보안에서 실행을 허용하세요.",
        },
    },
    linux: {
        os: "linux",
        label: "Linux",
        filename: "simulizer-linux-setup.AppImage",
        url: asset("simulizer-linux-setup.AppImage"),
        summary: "Linux · x86-64 · AppImage",
        included: [
            { kind: "viewer", title: "Simulizer Viewer", mono: "simulizerv (AppImage)", desc: ".sim 시뮬레이션을 실행하고 결과를 시각화하는 뷰어입니다." },
            { kind: "editor", title: "에디터는 준비 중", mono: "Windows 전용 (현재)", desc: "Block / C++ 에디터는 현재 Windows 전용입니다. Linux 빌드는 추후 제공될 예정이에요." },
        ],
        requirements: [
            { label: "아키텍처", value: "x86-64 (AppImage)" },
            { label: "런타임", value: "WebKitGTK (libwebkit2gtk-4.1) · FUSE" },
            { label: "디스크", value: "약 200 MB" },
            { label: "라이선스", value: "AGPL-3.0 · 무료" },
        ],
        note: {
            title: "실행하려면 실행 권한이 필요합니다",
            body: "내려받은 뒤 chmod +x simulizer-linux-setup.AppImage 로 실행 권한을 준 다음 실행하세요. WebKitGTK(libwebkit2gtk-4.1)가 설치되어 있어야 합니다.",
        },
    },
};

// Display order (detected OS is surfaced first by the page regardless).
export const PLATFORM_LIST: PlatformRelease[] = [PLATFORMS.windows, PLATFORMS.macos, PLATFORMS.linux];

// Best-effort client-side OS detection for the default download target.
export function detectOS(): OS {
    if (typeof navigator === "undefined") return "windows";
    const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
    const hint = (uaData?.platform || navigator.userAgent || "").toLowerCase();
    if (hint.includes("mac") || hint.includes("darwin")) return "macos";
    if (hint.includes("linux") || hint.includes("x11") || hint.includes("ubuntu")) return "linux";
    return "windows";
}

export function osFromParam(v: string | null | undefined): OS | null {
    return v === "windows" || v === "linux" || v === "macos" ? v : null;
}
