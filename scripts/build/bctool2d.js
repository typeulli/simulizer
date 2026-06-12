const { execSync } = require("child_process");
const path         = require("path");
const fs           = require("fs");
const { fmt, kb, divider, quote } = require("./_log");

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT     = path.join(__dirname, "..", "..", "src", "lib", "bctool2d");
const SRC      = path.join(ROOT, "bctool2d.cpp");
const TMP_WASM = path.join(ROOT, "bctool2d.wasm");
const PUBLIC   = path.join(__dirname, "..", "..", "public");
const OUT_WAT  = path.join(PUBLIC, "dist", "bctool2d.wat");

// ── Emscripten flags ─────────────────────────────────────────────────────────
const emccFlags = [
    "-O2",
    "-s", "WASM=1",
    "-s", "SIDE_MODULE=2",
    "-s", "EXPORTED_FUNCTIONS=['_get_2d_boundary']",
    "--no-entry",
];

const emccCmd   = ["emcc", quote(SRC), ...emccFlags, "-o", quote(TMP_WASM)].join(" ");
const wabtCmd   = `wasm2wat ${quote(TMP_WASM)} -o ${quote(OUT_WAT)}`;

// ── Build ────────────────────────────────────────────────────────────────────
console.log();
console.log(fmt.header("  bctool2d  build"));
divider();

// Step 1: C++ → WASM
console.log(`  ${fmt.step("[1/2]")} C++ → WASM`);
console.log(fmt.cmd(`  $ ${emccCmd}`));
divider();
console.log();

try {
    execSync(emccCmd, { stdio: "inherit", cwd: ROOT });
} catch {
    console.log();
    console.error(fmt.error("  ✗ emcc failed"));
    console.log();
    process.exit(1);
}

const wasmSize = fs.statSync(TMP_WASM).size;

// Step 2: WASM → WAT
console.log();
divider();
console.log(`  ${fmt.step("[2/2]")} WASM → WAT`);
console.log(fmt.cmd(`  $ ${wabtCmd}`));
divider();
console.log();

try {
    execSync(wabtCmd, { stdio: "inherit", cwd: ROOT });
} catch {
    console.log();
    console.error(fmt.error("  ✗ wasm2wat failed"));
    console.log();
    process.exit(1);
}

const watSize = fs.statSync(OUT_WAT).size;

// Cleanup intermediate WASM
fs.unlinkSync(TMP_WASM);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log();
divider();
console.log(fmt.success("  ✓ Build complete"));
divider();
console.log(
    `  ${fmt.label("bctool2d.wasm")}` +
    `${fmt.size(kb(wasmSize))}  ` +
    `${fmt.arrow("→")}  ${fmt.path("(intermediate, deleted)")}`
);
console.log(
    `  ${fmt.label("bctool2d.wat ")}` +
    `${fmt.size(kb(watSize))}  ` +
    `${fmt.arrow("→")}  ${fmt.path("public/dist/bctool2d.wat")}`
);
divider();
console.log();
