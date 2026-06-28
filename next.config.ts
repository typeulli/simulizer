import type { NextConfig } from "next";
import path from "path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Desktop build: static HTML export bundled into simulizer.exe (served by the
// app's embedded localhost HTTP server). Gated by an env flag so the normal web
// build is completely unaffected.
const desktop = process.env.SIMULIZER_DESKTOP === "1";

const nextConfig: NextConfig = {
  ...(desktop
    ? {
        output: "export" as const,
        distDir: "out-desktop",
        trailingSlash: true, // emit `workspace/index.html` for deterministic local serving
        images: { unoptimized: true },
      }
    : {}),
  reactStrictMode: false,
  serverExternalPackages: [
    "@tensorflow/tfjs",
    "@tensorflow/tfjs-backend-cpu",
    "@tensorflow/tfjs-backend-webgl",
    "@tensorflow/tfjs-backend-webgpu",
    "@tensorflow/tfjs-core",
  ],
  transpilePackages: [
    "monaco-languageclient",
    "vscode-ws-jsonrpc",
    "vscode-languageclient",
    "vscode-jsonrpc",
    "vscode-languageserver-protocol",
    "vscode-languageserver-types",
    "@codingame/monaco-vscode-api",
    "@codingame/monaco-vscode-editor-api",
    "@codingame/monaco-vscode-extension-api",
    "@codingame/monaco-vscode-configuration-service-override",
    "@codingame/monaco-vscode-keybindings-service-override",
    "@codingame/monaco-vscode-theme-service-override",
    "@codingame/monaco-vscode-textmate-service-override",
    "@codingame/monaco-vscode-languages-service-override",
    "@codingame/monaco-vscode-theme-defaults-default-extension",
    "@codingame/monaco-vscode-cpp-default-extension",
  ],
  turbopack: {
    // Desktop export builds from a staging copy under frontend/.desktop-build;
    // point Turbopack's root at the real frontend dir so it resolves the shared
    // node_modules (one level up) instead of treating the staging dir as root.
    ...(desktop ? { root: path.resolve(process.cwd(), "..") } : {}),
    resolveAlias: {
      fs: { browser: "./src/lib/empty.ts" },
      path: { browser: "./src/lib/empty.ts" },
      crypto: { browser: "./src/lib/empty.ts" },
      // y-monaco statically imports the standalone `monaco-editor` build, which
      // would bundle a second copy of monaco (and its quick-input CSS, which
      // mis-positions the workbench command palette). Redirect it to the same
      // @codingame/monaco-vscode-editor-api the workspace already uses so monaco
      // is deduped to a single instance.
      "monaco-editor": "@codingame/monaco-vscode-editor-api",
      "monaco-editor/esm/vs/editor/editor.api.js": "@codingame/monaco-vscode-editor-api",
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    // Same monaco dedupe as the Turbopack alias above (covers `next build`).
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "monaco-editor$": "@codingame/monaco-vscode-editor-api",
      "monaco-editor/esm/vs/editor/editor.api.js": "@codingame/monaco-vscode-editor-api",
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
