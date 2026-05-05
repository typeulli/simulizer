import { build } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, unlinkSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
    entryPoints: ["src/standalone/console/index.ts"],
    bundle: true,
    outfile: "public/dist/console.js",
    platform: "browser",
    format: "iife",
    globalName: "_SimulizerConsoleModule",
    minify: process.argv.includes("--minify"),
    sourcemap: false,
    tsconfig: "tsconfig.json",
    alias: {
        "@": resolve(__dirname, "src"),
    },
});

const jsPath  = "public/dist/console.js";
const hppPath = "public/dist/console.hpp";

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
