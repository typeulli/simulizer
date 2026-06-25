// Shared release/download config for the /download pages.
//
// The installer is produced by `cmake --build <build> --target installer`
// (desktop/installer/simulizer.nsi) → `simulizer-<version>-setup.exe`.
//
// HOSTING: GitHub Releases on the `typeulli/simulizer-desktop` repo. We use the
// `/releases/latest/download/<asset>` redirect, which always points at the
// newest release — but ONLY stays valid if every release uploads the installer
// under the SAME constant filename: `simulizer-setup.exe` (no version in the
// name). Each release: upload the .exe as `simulizer-setup.exe` and bump
// `version` here for display; `url`/`FILENAME` stay unchanged.
export const RELEASE = {
    version: "1.0.0",   // display only — the latest redirect tracks the newest release
    platform: "Windows 10 / 11 · 64-bit",
    // Windows installer — stable "latest" link (asset must be `simulizer-setup.exe`).
    url: "https://github.com/typeulli/simulizer-desktop/releases/latest/download/simulizer-setup.exe",
    releasesPage: "https://github.com/typeulli/simulizer-desktop/releases",
} as const;

export const FILENAME = "simulizer-setup.exe";