const AUTH_BASE = process.env.NEXT_PUBLIC_AUTH_URL;

function req(path: string, init?: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    return fetch(`${AUTH_BASE}${path}`, {
        credentials: "include",
        signal: controller.signal,
        ...init,
    }).finally(() => clearTimeout(timer));
}

function reqJson(path: string, method: string, body: object, init?: RequestInit) {
    return req(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...init,
    });
}

function throwIfConflict(res: Response) {
    if (res.status === 409) throw Object.assign(new Error("conflict"), { status: 409 });
}

export interface UserOut {
    id: number;
    email: string;
    name: string;
    picture_url: string | null;
    last_login_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface RecoveryUserOut extends UserOut {
    days_remaining: number;
}

export type FileVisibility = "private" | "link";

export type FileType = "blockfile" | "clangfile";

export interface FileOut {
    idx: number;
    id: string;
    author_id: number;
    name: string;
    type: FileType;
    visibility: string;
    thumbnail_custom: boolean;
    created_at: string;
    updated_at: string;
}

export interface FileDetail extends FileOut {
    content: string;
}

export async function getMe(): Promise<UserOut> {
    const res = await req("/auth/me");
    if (!res.ok) throw new Error("Unauthorized");
    return res.json();
}

export interface CreditOut {
    credits: number;
}

export async function getCredits(): Promise<CreditOut> {
    const res = await req("/credits/me");
    if (!res.ok) throw new Error("Failed to get credits");
    return res.json();
}

export async function logout(): Promise<void> {
    await req("/auth/logout", { method: "POST" });
}

export async function getRecoveryUser(): Promise<RecoveryUserOut> {
    const res = await req("/auth/recover/me");
    if (!res.ok) throw new Error("No recovery session");
    return res.json();
}

export async function confirmRecover(): Promise<void> {
    const res = await req("/auth/recover/confirm", { method: "POST" });
    if (!res.ok) throw new Error("Recovery failed");
}

export async function cancelRecover(): Promise<void> {
    const res = await req("/auth/recover/cancel", { method: "POST" });
    if (!res.ok) throw new Error("Cancel recovery failed");
}

export async function deleteAccount(): Promise<void> {
    const res = await req("/auth/google/delete", { method: "POST" });
    if (!res.ok) throw new Error("Account deletion failed");
}

export async function listFiles(): Promise<FileOut[]> {
    const res = await req("/files");
    if (!res.ok) throw new Error("Failed to list files");
    return res.json();
}

export async function createFile(
    name: string,
    type: FileType = "blockfile",
    content?: string,
): Promise<FileDetail> {
    const body: { name: string; type: FileType; content?: string } = { name, type };
    if (content !== undefined) body.content = content;
    const res = await reqJson("/files", "POST", body);
    throwIfConflict(res);
    if (!res.ok) throw new Error("Failed to create file");
    return res.json();
}

export async function getFile(id: string): Promise<FileDetail> {
    const res = await req(`/files/${id}`);
    if (res.status === 403) throw Object.assign(new Error("Forbidden"), { status: 403 });
    if (res.status === 404) throw Object.assign(new Error("Not found"), { status: 404 });
    if (!res.ok) throw Object.assign(new Error("File error"), { status: res.status });
    return res.json();
}

export async function saveFile(id: string, content: string): Promise<FileOut> {
    const res = await reqJson(`/files/${id}`, "PUT", { content });
    if (!res.ok) throw new Error("Failed to save file");
    return res.json();
}

export async function deleteFile(id: string): Promise<void> {
    const res = await req(`/files/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete file");
}

export async function renameFile(id: string, name: string): Promise<FileOut> {
    const res = await reqJson(`/files/${id}/name`, "PATCH", { name });
    throwIfConflict(res);
    if (!res.ok) throw new Error("Failed to rename file");
    return res.json();
}

export async function duplicateFile(id: string): Promise<FileDetail> {
    const res = await req(`/files/${id}/duplicate`, { method: "POST" });
    if (res.status === 401) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    if (!res.ok) throw new Error("Failed to duplicate file");
    return res.json();
}

export async function setFileVisibility(id: string, visibility: FileVisibility): Promise<FileOut> {
    const res = await reqJson(`/files/${id}/visibility`, "PATCH", { visibility });
    if (!res.ok) throw new Error("Failed to update visibility");
    return res.json();
}

export async function uploadThumbnail(fileId: string, blob: Blob, opts?: { manual?: boolean }): Promise<void> {
    const qs = opts?.manual ? "?manual=true" : "";
    const res = await req(`/files/${fileId}/thumbnail${qs}`, {
        method: "PUT",
        headers: { "Content-Type": blob.type || "image/png" },
        body: blob,
    });
    if (!res.ok) throw new Error("Failed to upload thumbnail");
}

export async function deleteThumbnail(fileId: string): Promise<void> {
    const res = await req(`/files/${fileId}/thumbnail`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete thumbnail");
}
