// Workspace URI helpers split out from CodeEditor so they can be imported by
// SSR-safe code (the rest of CodeEditor pulls in the monaco-vscode bundle and
// can only be loaded client-side).

export const WORKSPACE_URI_PREFIX = "file:///workspace/";

export function pathToUri(path: string): string {
    return `${WORKSPACE_URI_PREFIX}${path}`;
}

export function uriToPath(uri: string): string | null {
    return uri.startsWith(WORKSPACE_URI_PREFIX) ? uri.slice(WORKSPACE_URI_PREFIX.length) : null;
}
