"use client";

import React from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";
import { Icon } from "@/components/atoms/Icons";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/organisms/Modal";
import { token } from "@/components/tokens";

interface LatexOcrModalProps {
    open: boolean;
    imageUrl: string | null;
    latex: string;
    streaming: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onClose: () => void;
    onUpload: (file: File) => void;
    onApply: () => void;
}

export function LatexOcrModal({
    open,
    imageUrl,
    latex,
    streaming,
    fileInputRef,
    onClose,
    onUpload,
    onApply,
}: LatexOcrModalProps) {
    if (!open) return null;

    const formulas = (() => {
        const trimmed = latex.trim();
        if (!trimmed) return [];
        const parts = latex.split("$");
        const extracted: string[] = [];
        for (let i = 1; i < parts.length; i += 2) {
            const formula = parts[i].trim();
            if (formula) extracted.push(formula);
        }
        if (extracted.length === 0 && trimmed) extracted.push(trimmed);
        return extracted;
    })();

    return (
        <Modal onClose={onClose} width="min(560px,95vw)">
            <ModalHeader onClose={onClose}>
                <Text variant="label" tone="accent">Image → LaTeX OCR</Text>
            </ModalHeader>
            <ModalBody style={{ display: "flex", flexDirection: "column", gap: token.space.sp3 }}>
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file && file.type.startsWith("image/")) onUpload(file);
                    }}
                    style={{
                        border: `2px dashed ${token.color.borderStrong}`,
                        borderRadius: token.radius.md,
                        padding: token.space.sp4,
                        textAlign: "center",
                        cursor: "pointer",
                        background: token.color.bgSubtle,
                        minHeight: 100,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: token.space.sp2,
                    }}
                >
                    {imageUrl ? (
                        <img src={imageUrl} alt="uploaded" style={{ maxHeight: 160, maxWidth: "100%", borderRadius: token.radius.sm, objectFit: "contain" }} />
                    ) : (
                        <>
                            <Icon.Upload size={22} />
                            <Text variant="body" tone="muted">클릭, 드래그, 또는 Ctrl+V로 이미지 업로드</Text>
                        </>
                    )}
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) onUpload(file);
                        e.target.value = "";
                    }}
                />

                {(latex || streaming) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: token.space.sp2 }}>
                        <Text variant="label" tone="muted">LaTeX 결과</Text>
                        <div style={{
                            background: token.color.bgCanvas,
                            border: `1px solid ${token.color.border}`,
                            borderRadius: token.radius.md,
                            padding: token.space.sp3,
                            fontFamily: token.font.family.mono,
                            fontSize: token.font.size.fs12,
                            color: token.color.fg,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                            minHeight: 48,
                        }}>
                            {latex}{streaming && <span style={{ opacity: 0.5, animation: "pulse 1s infinite" }}>▍</span>}
                        </div>

                        {formulas.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {formulas.map((formula, i) => {
                                    const html = katex.renderToString(formula, { throwOnError: false, displayMode: true });
                                    return (
                                        <div
                                            key={i}
                                            style={{
                                                background: token.color.bgSubtle,
                                                border: `1px solid ${token.color.border}`,
                                                borderRadius: token.radius.md,
                                                padding: token.space.sp3,
                                                overflowX: "auto",
                                                textAlign: "center",
                                            }}
                                            dangerouslySetInnerHTML={{ __html: html }}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </ModalBody>
            <ModalFooter>
                <Button variant="ghost" size="sm" onClick={onClose}>취소</Button>
                <Button variant="run" size="sm" onClick={onApply} disabled={!latex.trim() || streaming}>
                    Apply
                </Button>
            </ModalFooter>
        </Modal>
    );
}
