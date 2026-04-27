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
    step:    (s) => `${c.gray}${s}${c.reset}`,
};

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT     = __dirname;
const SRC      = path.join(ROOT, "bctool3d.cpp");
const TMP_WASM = path.join(ROOT, "bctool3d.wasm");
const PUBLIC   = path.join(ROOT, "..", "..", "..", "public");
const OUT_WAT  = path.join(PUBLIC, "dist", "bctool3d.wat");

// ── Emscripten flags ─────────────────────────────────────────────────────────
const emccFlags = [
    "-O2",
    "-s", "WASM=1",
    "-s", "SIDE_MODULE=2",
    "-s", "EXPORTED_FUNCTIONS=['_get_3d_boundary']",
    "--no-entry",
];

const emccCmd = ["emcc", SRC, ...emccFlags, "-o", TMP_WASM].join(" ");
const wabtCmd = `wasm2wat ${TMP_WASM} -o ${OUT_WAT}`;

// ── Helpers ──────────────────────────────────────────────────────────────────
const kb      = (bytes) => (bytes / 1024).toFixed(1).padStart(7) + " KB";
const divider = () => console.log(fmt.arrow("─".repeat(56)));

// ── Build ────────────────────────────────────────────────────────────────────
console.log();
console.log(fmt.header("  bctool3d  build"));
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
    `  ${fmt.label("bctool3d.wasm")}` +
    `${fmt.size(kb(wasmSize))}  ` +
    `${fmt.arrow("→")}  ${fmt.path("(intermediate, deleted)")}`
);
console.log(
    `  ${fmt.label("bctool3d.wat ")}` +
    `${fmt.size(kb(watSize))}  ` +
    `${fmt.arrow("→")}  ${fmt.path("public/dist/bctool3d.wat")}`
);
divider();
console.log();
