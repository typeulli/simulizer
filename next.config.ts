import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    resolveAlias: {
      fs: { browser: "./src/lib/empty.ts" },
      path: { browser: "./src/lib/empty.ts" },
      crypto: { browser: "./src/lib/empty.ts" },
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
    return config;
  },
};

export default nextConfig;
