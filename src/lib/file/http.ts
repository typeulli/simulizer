// Web (online) file-store implementation. This is a thin re-export of the
// existing auth-backed API client so the web build behaves exactly as before.
// The desktop build swaps this out for ./native via ./index.

export {
    getMe,
    getCredits,
    getFile,
    createFile,
    saveFile,
    renameFile,
    duplicateFile,
    setFileVisibility,
    uploadThumbnail,
} from "@/lib/authapi";
