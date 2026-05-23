"use client";

import React from "react";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { Modal, ModalBody } from "@/components/organisms/Modal";
import { token } from "@/components/tokens";
import langpack from "@/lang/lang";

type CppMode = "code" | "share";

interface CppManagerModalProps {
    open: boolean;
    mode: CppMode;
    code: string;
    fileName: string;
    pack: langpack;
    sharePanel?: React.ReactNode;
    onClose: () => void;
    onModeChange: (mode: CppMode) => void;
    onCopyToClipboard: (text: string) => void;
    onDownload: () => void;
}

export function CppManagerModal({
    open,
    mode,
    code,
    fileName,
    pack,
    sharePanel,
    onClose,
    onModeChange,
    onCopyToClipboard,
    onDownload,
}: CppManagerModalProps) {
    if (!open) return null;

    const tabs: { mode: CppMode; label: string; icon: React.ReactNode }[] = [
        { mode: "code", label: pack.workspace.ui.export_button, icon: <Icon.File size={11} /> },
    ];
    if (sharePanel) {
        tabs.push({ mode: "share", label: pack.workspace.ui.share_button, icon: <Icon.Globe size={11} /> });
    }

    return (
        <Modal onClose={onClose} width="min(700px,90vw)">
            <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 0, flex: 1 }}>
                    {tabs.map(({ mode: nextMode, label, icon }) => (
                        <button
                            key={nextMode}
                            onClick={() => onModeChange(nextMode)}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "12px 14px", fontSize: token.font.size.fs12, fontWeight: mode === nextMode ? 600 : 400, border: "none", background: "none", cursor: "pointer", color: mode === nextMode ? token.color.fg : token.color.fgMuted, borderBottom: mode === nextMode ? `2px solid ${token.color.accent}` : "2px solid transparent", marginBottom: -1, transition: "all 0.1s" }}
                        >
                            {icon}{label}
                        </button>
                    ))}
                </div>
                <Button variant="ghost" size="xs" onClick={onClose} style={{ padding: token.space.sp1 }}>
                    <Icon.X size={13} />
                </Button>
            </div>

            <ModalBody style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
                {mode === "code" && (
                    <>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderBottom: `1px solid ${token.color.border}`, flexShrink: 0 }}>
                            <Button variant="ghost" size="sm" leading={<Icon.Check size={11} />} onClick={() => onCopyToClipboard(code)}>
                                {pack.workspace.ui.copy_button}
                            </Button>
                            <div style={{ marginLeft: "auto" }}>
                                <Button variant="ghost" size="sm" leading={<Icon.Download size={11} />} onClick={onDownload}>
                                    {fileName}.cpp
                                </Button>
                            </div>
                        </div>
                        <pre style={{ overflow: "auto", flex: 1, margin: 0, padding: "16px", fontSize: token.font.size.fs11, color: token.color.fgMuted, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: token.font.family.mono, background: token.color.bgCanvas, minHeight: 300 }}>{code}</pre>
                    </>
                )}

                {mode === "share" && sharePanel && (
                    <div style={{ padding: token.space.sp4, minHeight: 300 }}>
                        {sharePanel}
                    </div>
                )}
            </ModalBody>
        </Modal>
    );
}
