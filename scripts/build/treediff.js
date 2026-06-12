#!/usr/bin/env node
// treediff.js — treediff.cpp → treediff.wasm + treediff.js (Emscripten)

const { execSync } = require("child_process");
const path         = require("path");
const fs           = require("fs");
const { fmt, kb, divider, quote } = require("./_log");

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT   = path.join(__dirname, "..", "..", "src", "lib", "treediff");
const SRC    = path.join(ROOT, "treediff.cpp");
const OUT_JS = path.join(ROOT, "treediff.js");
const OUT_WA = OUT_JS.replace(/\.js$/, ".wasm");
const PUBLIC = path.join(__dirname, "..", "..", "public");

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

const cmd = [
    "emcc",
    quote(SRC),
    ...flags,
    "-o",
    quote(OUT_JS)
].join(" ");

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
