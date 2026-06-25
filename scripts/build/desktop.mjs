// Desktop static-export build for simulizer.exe.
//
// Produces a static export of ONLY the /workspace route (no Next.js server at
// runtime) and stages it into ../client/resources, which simulizer.exe serves
// from an embedded localhost HTTP server.
//
// `output: "export"` cannot ship server code, so the build runs against a
// STAGING COPY of the frontend with the non-workspace routes and route
// handlers (app/api, dashboard, login, …) pruned. Building from a copy (rather
// than mutating src/app in place) keeps the build working even while `next dev`
// is watching src/app (an in-place rename trips EPERM on Windows). The staging
// dir lives UNDER frontend so Turbopack (root = frontend, set in next.config)
// resolves the shared node_modules without a cross-root symlink. The normal web
// build is untouched; desktop behavior is gated by the SIMULIZER_DESKTOP env
// flag read in next.config.ts / src/i18n/request.ts.

import { spawnSync } from "child_process";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import {
    existsSync, mkdirSync, readdirSync, rmSync, unlinkSync, cpSync, lstatSync,
} from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(__dirname, "..", "..");
const REPO = resolve(FRONTEND, "..");
const STAGE = join(FRONTEND, ".desktop-build");             // under frontend → shares node_modules via turbopack root
const STAGE_APP = join(STAGE, "src", "app");
const STAGE_OUT = join(STAGE, "out-desktop");
const CLIENT_RES = join(REPO, "client", "resources");

// Project files/dirs the build needs. node_modules is intentionally NOT copied:
// Turbopack's root is set to frontend (next.config), so the staging project
// resolves the real frontend/node_modules one level up.
const COPY = ["src", "public", "messages", "next.config.ts", "tsconfig.json",
    "package.json", "postcss.config.mjs", "next-env.d.ts"];
const COPY_ENV = [".env.local", ".env", ".env.production", ".env.development"];

// app/ entries kept in the desktop export. Everything else under src/app is a
// server page or route handler that can't be statically exported.
const RETAIN = new Set(["workspace", "layout.tsx", "globals.css", "not-found.tsx"]);

function cleanStage() {
    rmSync(STAGE, { recursive: true, force: true });
}

function buildStage() {
    mkdirSync(STAGE, { recursive: true });
    for (const name of COPY) {
        const src = join(FRONTEND, name);
        if (existsSync(src)) cpSync(src, join(STAGE, name), { recursive: true });
    }
    for (const name of COPY_ENV) {
        const src = join(FRONTEND, name);
        if (existsSync(src)) cpSync(src, join(STAGE, name));
    }
    // Prune server-only routes from the staged app dir.
    for (const name of readdirSync(STAGE_APP)) {
        if (RETAIN.has(name)) continue;
        const p = join(STAGE_APP, name);
        if (lstatSync(p).isDirectory()) rmSync(p, { recursive: true, force: true });
        else unlinkSync(p);
    }
}

function nextBuild() {
    const nextBin = join(FRONTEND, "node_modules", "next", "dist", "bin", "next");
    const env = {
        ...process.env,
        SIMULIZER_DESKTOP: "1",
        NEXT_PUBLIC_DESKTOP_LOCALE: process.env.NEXT_PUBLIC_DESKTOP_LOCALE || "ko",
    };
    const r = spawnSync(process.execPath, [nextBin, "build"], {
        cwd: STAGE,
        env,
        stdio: "inherit",
    });
    if (r.status !== 0) throw new Error(`next build failed (exit ${r.status})`);
}

function stageResources() {
    if (!existsSync(STAGE_OUT)) throw new Error(`export missing: ${STAGE_OUT}`);
    rmSync(CLIENT_RES, { recursive: true, force: true });
    mkdirSync(CLIENT_RES, { recursive: true });
    cpSync(STAGE_OUT, CLIENT_RES, { recursive: true });
}

cleanStage();
try {
    buildStage();
    nextBuild();
    stageResources();
    console.log(`\n✓ desktop export staged to ${CLIENT_RES}`);
} finally {
    cleanStage();
}
