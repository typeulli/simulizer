#!/usr/bin/env node
// build.js — treediff.cpp → treediff.wasm + treediff.js (Emscripten)

const { execSync } = require("child_process");
const path         = require("path");
const fs           = require("fs");

// ── ANSI colours ────────────────────────────────────────────────────────────
const c = {
    reset:  "\x1b[0m",
    bold:   "\x1b[1m",
    dim:    "\x1b[2m",
    cyan:   "\x1b[36m",
    green:  "\x1b[32m",
    yellow: "\x1b[33m",
    red:    "\x1b[31m",
    gray:   "\x1b[90m",
};

const fmt = {
    header:  (s) => `${c.bold}${c.cyan}${s}${c.reset}`,
    label:   (s) => `${c.bold}${s}${c.reset}`,
    path:    (s) => `${c.yellow}${s}${c.reset}`,
    size:    (s) => `${c.green}${s}${c.reset}`,
    arrow:   (s) => `${c.gray}${s}${c.reset}`,
    cmd:     (s) => `${c.dim}${s}${c.reset}`,
    success: (s) => `${c.bold}${c.green}${s}${c.reset}`,
    error:   (s) => `${c.bold}${c.red}${s}${c.reset}`,
};

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT   = __dirname;
const SRC    = path.join(ROOT, "treediff.cpp");
const OUT_JS = path.join(ROOT, "treediff.js");
const OUT_WA = OUT_JS.replace(/\.js$/, ".wasm");
const PUBLIC = path.join(ROOT, "..", "..", "..", "public");

// ── Emscripten flags ─────────────────────────────────────────────────────────
const flags = [
    "-O2",
    "--bind",
    "-s", "MODULARIZE=1",
    "-s", `EXPORT_NAME=createTreeDiff`,
    "-s", "ENVIRONMENT=web,node",
    "-s", "ALLOW_MEMORY_GROWTH=1",
    "--no-entry",
];

const quote = (p) => `"${p}"`;

const cmd = [
    "emcc",
    quote(SRC),
    ...flags,
    "-o",
    quote(OUT_JS)
].join(" ");

// ── Helpers ──────────────────────────────────────────────────────────────────
const kb     = (bytes) => (bytes / 1024).toFixed(1).padStart(7) + " KB";
const divider = () => console.log(fmt.arrow("─".repeat(56)));

// ── Build ────────────────────────────────────────────────────────────────────
console.log();
console.log(fmt.header("  treediff  build"));
divider();
console.log(fmt.cmd(`  $ ${cmd}`));
divider();
console.log();

try {
    execSync(cmd, { stdio: "inherit", cwd: ROOT });

    const jsSize   = fs.statSync(OUT_JS).size;
    const wasmSize = fs.statSync(OUT_WA).size;

    const DIST = path.join(PUBLIC, "dist");
    fs.mkdirSync(DIST, { recursive: true });

    fs.renameSync(OUT_JS, path.join(PUBLIC, "dist", "treediff.js"));
    fs.renameSync(OUT_WA, path.join(PUBLIC, "dist", "treediff.wasm"));

    console.log();
    divider();
    console.log(fmt.success("  ✓ Build complete"));
    divider();
    console.log(
        `  ${fmt.label("treediff.js  ")}` +
        `${fmt.size(kb(jsSize))}  ` +
        `${fmt.arrow("→")}  ${fmt.path("public/dist/treediff.js")}`
    );
    console.log(
        `  ${fmt.label("treediff.wasm")}` +
        `${fmt.size(kb(wasmSize))}  ` +
        `${fmt.arrow("→")}  ${fmt.path("public/dist/treediff.wasm")}`
    );
    divider();
    console.log();
} catch(err) {
    console.log();
    console.error(fmt.error("  ✗ Build failed"));
    console.error(err.message);
    console.log();
    process.exit(1);
}
