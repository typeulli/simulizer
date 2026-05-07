"use client";

import React from "react";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { Modal, ModalBody } from "@/components/organisms/Modal";
import { token } from "@/components/tokens";
import langpack from "@/lang/lang";

type BlockMode = "export" | "import" | "wat";

interface BlockManagerModalProps {
    open: boolean;
    mode: BlockMode;
    blockData: string;
    watSource: string;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    pack: langpack;
    onClose: () => void;
    onModeChange: (mode: BlockMode) => void;
    onBlockDataChange: (value: string) => void;
    onOpenImport: () => void;
    onCopyToClipboard: (text: string) => void;
    onResetWorkspace: () => void;
    onApplyImport: () => void;
    onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function BlockManagerModal({
    open,
    mode,
    blockData,
    watSource,
    fileInputRef,
    pack,
    onClose,
    onModeChange,
    onBlockDataChange,
    onOpenImport,
    onCopyToClipboard,
    onResetWorkspace,
    onApplyImport,
    onFileInput,
}: BlockManagerModalProps) {
    if (!open) return null;

    return (
        <Modal onClose={onClose} width="min(700px,90vw)">
            <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 0, flex: 1 }}>
                    {([
                        { mode: "export" as const, label: pack.workspace.ui.export_button, icon: <Icon.File size={11} /> },
                        { mode: "import" as const, label: pack.workspace.ui.import_button, icon: <Icon.Layers size={11} /> },
                        ...(watSource ? [{ mode: "wat" as const, label: pack.workspace.ui.wat_button, icon: <Icon.Terminal size={11} /> }] : []),
                    ]).map(({ mode: nextMode, label, icon }) => (
                        <button
                            key={nextMode}
                            onClick={() => nextMode === "import" ? onOpenImport() : onModeChange(nextMode)}
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
                {mode === "export" && (
                    <>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderBottom: `1px solid ${token.color.border}`, flexShrink: 0 }}>
                            <Button variant="ghost" size="sm" leading={<Icon.Check size={11} />} onClick={() => onCopyToClipboard(blockData)}>{pack.workspace.ui.copy_button}</Button>
                            <div style={{ marginLeft: "auto" }}>
                                <Button variant="danger" size="sm" onClick={onResetWorkspace}>{pack.workspace.ui.reset_button}</Button>
                            </div>
                        </div>
                        <pre style={{ overflow: "auto", flex: 1, margin: 0, padding: "16px", fontSize: token.font.size.fs11, color: token.color.fgMuted, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: token.font.family.mono, background: token.color.bgCanvas, minHeight: 300 }}>{blockData}</pre>
                    </>
                )}

                {mode === "import" && (
                    <>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderBottom: `1px solid ${token.color.border}`, flexShrink: 0 }}>
                            <Button variant="ghost" size="sm" leading={<Icon.File size={11} />} onClick={() => fileInputRef.current?.click()}>{pack.workspace.ui.open_file_button}</Button>
                            <input ref={fileInputRef} type="file" accept=".simphy,.json" onChange={onFileInput} style={{ display: "none" }} />
                            <div style={{ marginLeft: "auto" }}>
                                <Button variant="ai" size="sm" onClick={onApplyImport}>{pack.workspace.ui.apply_button}</Button>
                            </div>
                        </div>
                        <textarea
                            value={blockData}
                            onChange={e => onBlockDataChange(e.target.value)}
                            placeholder={pack.workspace.ui.xml_textarea_placeholder}
                            spellCheck={false}
                            style={{ flex: 1, margin: 0, padding: 16, fontSize: token.font.size.fs11, color: token.color.fg, lineHeight: 1.7, background: token.color.bgCanvas, border: "none", outline: "none", resize: "none", fontFamily: token.font.family.mono, minHeight: 300 }}
                        />
                    </>
                )}

                {mode === "wat" && (
                    <pre style={{ overflow: "auto", flex: 1, margin: 0, padding: 16, fontSize: token.font.size.fs12, color: token.color.fg, lineHeight: 1.7, whiteSpace: "pre", fontFamily: token.font.family.mono, background: token.color.bgCanvas, minHeight: 300 }}>{watSource}</pre>
                )}
            </ModalBody>
        </Modal>
    );
}
