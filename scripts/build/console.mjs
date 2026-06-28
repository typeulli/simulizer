import { build } from "esbuild";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

await build({
    entryPoints: [join(ROOT, "src/standalone/console/index.ts")],
    bundle: true,
    outfile: join(ROOT, "public/dist/console.js"),
    platform: "browser",
    format: "iife",
    globalName: "_SimulizerConsoleModule",
    minify: process.argv.includes("--minify"),
    sourcemap: false,
    tsconfig: join(ROOT, "tsconfig.json"),
    alias: {
        "@": resolve(ROOT, "src"),
    },
});

const jsPath  = join(ROOT, "public/dist/console.js");
const hppPath = join(ROOT, "public/dist/console.hpp");

const buf  = readFileSync(jsPath);
const name = "console_js";
const hex  = Array.from(buf).map(b => `0x${b.toString(16).padStart(2, "0")}`);
const rows = [];
for (let i = 0; i < hex.length; i += 12)
    rows.push("  " + hex.slice(i, i + 12).join(", "));
const hpp = `unsigned char ${name}[] = {\n${rows.join(",\n")}\n};\nunsigned int ${name}_len = ${buf.length};\n`;

writeFileSync(hppPath, hpp, "utf8");
unlinkSync(jsPath);

console.log("✓ public/dist/console.hpp built");

// Single source of truth for the SimulizerConsole bundle. The native builds
// each embed the raw console.js (backend-api/build.py → _binary_assets_console_js,
// desktop/CMakeLists.txt → g_console_js), so emit the production bundle straight
// into their res/ dirs to keep both consumers in sync. Only the minified build
// is propagated; a consumer whose repo isn't checked out (standalone frontend
// clone) is skipped rather than failing.
if (process.argv.includes("--minify")) {
    const consumers = [
        resolve(ROOT, "..", "backend-api", "res", "console.js"),
        resolve(ROOT, "..", "desktop", "res", "console.js"),
    ];
    for (const dest of consumers) {
        if (!existsSync(dirname(dest))) {
            console.log(`– skipped ${dest} (res/ not present)`);
            continue;
        }
        writeFileSync(dest, buf);
        console.log(`✓ synced ${dest}`);
    }
}
