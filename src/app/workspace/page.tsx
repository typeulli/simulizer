"use client";
import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Logo } from "@/components/atoms/Logo";
import { Spinner } from "@/components/atoms/Spinner";
import { token } from "@/components/tokens";
import { getFile, getMe, isDesktop, type FileDetail } from "@/lib/file";
import { useTranslations } from "next-intl";

import BlockWorkspace from "./BlockWorkspace";
import ClangWorkspace from "./ClangWorkspace";

type FileError = "not_found" | "forbidden";

const WorkspaceRouter: React.FC = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tErr = useTranslations("file_error");
    const tMsg = useTranslations("messages");

    const fileParam = searchParams.get("file");
    const exampleParam = searchParams.get("example");

    const [file, setFile] = useState<FileDetail | null>(null);
    const [isOwner, setIsOwner] = useState<boolean>(false);
    const [fileError, setFileError] = useState<FileError | null>(null);
    // Desktop: the open project is an absolute file path injected by the host
    // (simulizer.exe) and switched in place via window.__loadProject.
    const [projectPath, setProjectPath] = useState<string | null>(
        () => (isDesktop && typeof window !== "undefined" ? window.__SIMULIZER_PROJECT__ ?? null : null),
    );

    // Desktop: let the native File menu (and native create/duplicate/rename
    // flows) re-open a project in place by path.
    useEffect(() => {
        if (!isDesktop) return;
        window.__loadProject = (p: string) => setProjectPath(p);
        return () => { if (window.__loadProject) delete window.__loadProject; };
    }, []);

    // Desktop project loader (by path).
    useEffect(() => {
        if (!isDesktop || !projectPath) return;
        let cancelled = false;
        setFileError(null);
        setFile(null);
        (async () => {
            const f = await getFile(projectPath).catch(() => {
                if (!cancelled) setFileError("not_found");
                return null;
            });
            if (cancelled || !f) return;
            setIsOwner(true);
            setFile(f);
        })();
        return () => { cancelled = true; };
    }, [projectPath]);

    // Web project loader (by ?file= / ?example=).
    useEffect(() => {
        if (isDesktop) return;
        if (!fileParam && !exampleParam) {
            router.replace("/dashboard");
            return;
        }
        if (!fileParam) {
            // Example mode: BlockWorkspace handles the bundled JSON itself.
            return;
        }
        let cancelled = false;
        setFileError(null);
        setFile(null);
        (async () => {
            const me = await getMe().catch(() => null);
            const f = await getFile(fileParam).catch((err) => {
                const status = (err as { status?: number }).status;
                if (!cancelled) setFileError(status === 403 ? "forbidden" : "not_found");
                return null;
            });
            if (cancelled || !f) return;
            const owner = !!(me && me.id === f.author_id);
            setIsOwner(owner);
            setFile(f);
        })();
        return () => { cancelled = true; };
    }, [fileParam, exampleParam, router]);

    if (fileError) {
        const isForbidden = fileError === "forbidden";
        return (
            <div style={{
                minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
                background: token.color.bg, fontFamily: token.font.family.sans, color: token.color.fg,
                padding: "32px 16px",
            }}>
                <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: token.space.sp6, textAlign: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Logo size={22} />
                        <span style={{ fontSize: token.font.size.fs16, fontWeight: 700, letterSpacing: "-0.02em" }}>Simulizer</span>
                    </div>
                    <div style={{ fontSize: 48, lineHeight: 1, color: token.color.fgSubtle }}>
                        {isForbidden ? "🔒" : "📄"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp2 }}>
                        <div style={{ fontSize: token.font.size.fs20, fontWeight: 700, color: token.color.fgStrong, letterSpacing: token.font.tracking.tight }}>
                            {isForbidden ? tErr("forbidden_title") : tErr("not_found_title")}
                        </div>
                        <div style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted, lineHeight: 1.6 }}>
                            {isForbidden ? tErr("forbidden_desc") : tErr("not_found_desc")}
                        </div>
                    </div>
                    <button
                        onClick={() => router.replace("/dashboard")}
                        style={{ padding: "8px 20px", borderRadius: token.radius.md, background: token.color.accent, color: token.color.fgOnAccent, fontWeight: 600, fontSize: token.font.size.fs13, border: "none", cursor: "pointer" }}
                    >
                        {tErr("go_dashboard")}
                    </button>
                </div>
            </div>
        );
    }

    // Example mode (no fileParam): BlockWorkspace runs its own example-load
    // path and never receives a parent-fetched file.
    if (!fileParam && exampleParam) {
        return <BlockWorkspace />;
    }

    // Waiting for parent fetch (or for the redirect to /dashboard to commit).
    if (!file) {
        return (
            <div style={{
                minHeight: "100vh", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                background: token.color.bg, color: token.color.fg, gap: 24,
            }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <Logo size={48} />
                    <div style={{
                        fontSize: token.font.size.fs16, fontWeight: 700,
                        letterSpacing: "0.1em", color: token.color.fgStrong,
                        marginLeft: 4,
                    }}>
                        SIMULIZER
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: token.color.fgSubtle, fontSize: token.font.size.fs13, fontFamily: token.font.family.mono }}>
                    <Spinner size="md" />
                    <span>{tMsg("loading")}</span>
                </div>
            </div>
        );
    }

    if (file.type === "clangfile") {
        return <ClangWorkspace key={file.id} initialFile={file} initialOwner={isOwner} />;
    }
    return <BlockWorkspace key={file.id} initialFile={file} initialOwner={isOwner} />;
};

export default function WorkspacePage() {
    return (
        <React.Suspense>
            <WorkspaceRouter />
        </React.Suspense>
    );
}
