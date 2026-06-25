// Persistence seam shared by the web and desktop builds. The workspace
// components import file I/O from here (not from `@/lib/authapi` directly), so
// the same components drive both targets:
//   • web      → ./http   (auth-backed online storage, unchanged)
//   • desktop  → ./native (local single-file projects via window.__native)
//
// The desktop flag is injected by simulizer.exe (webview `init`) before any
// page script runs, so this resolves correctly at module load time.

import * as http from "./http";
import * as native from "./native";

export const isDesktop =
    typeof window !== "undefined" && !!window.__SIMULIZER_DESKTOP__;

const impl = isDesktop ? native : http;

export const getMe = impl.getMe;
export const getCredits = impl.getCredits;
export const getFile = impl.getFile;
export const createFile = impl.createFile;
export const saveFile = impl.saveFile;
export const renameFile = impl.renameFile;
export const duplicateFile = impl.duplicateFile;
export const setFileVisibility = impl.setFileVisibility;
export const uploadThumbnail = impl.uploadThumbnail;

export type {
    FileDetail,
    FileOut,
    FileType,
    FileVisibility,
    UserOut,
    CreditOut,
} from "@/lib/authapi";
