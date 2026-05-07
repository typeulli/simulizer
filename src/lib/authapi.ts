const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function req(path: string, init?: RequestInit) {
    return fetch(`${BASE}${path}`, { credentials: "include", ...init });
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

export interface FileOut {
    idx: number;
    id: string;
    name: string;
    visibility: string;
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

export async function createFile(name: string, content = "{}"): Promise<FileDetail> {
    const res = await reqJson("/files", "POST", { name, content });
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
    if (!res.ok) throw new Error("Failed to duplicate file");
    return res.json();
}

export async function uploadThumbnail(fileId: string, blob: Blob): Promise<void> {
    const res = await req(`/files/${fileId}/thumbnail`, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: blob,
    });
    if (!res.ok) throw new Error("Failed to upload thumbnail");
}
