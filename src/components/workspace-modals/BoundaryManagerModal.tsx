"use client";

import React from "react";
import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";
import { Inline } from "@/components/atoms/layout/Inline";
import { Modal, ModalBody, ModalHeader } from "@/components/organisms/Modal";
import { token } from "@/components/tokens";

interface BoundaryEntry {
    id: string;
    name: string;
    count: number;
    offset: number;
}

interface BoundaryManagerModalProps {
    open: boolean;
    tab: "2d" | "3d";
    arrays2d: BoundaryEntry[];
    arrays3d: BoundaryEntry[];
    name2d: string;
    name3d: string;
    fileInputRef2d: React.RefObject<HTMLInputElement | null>;
    fileInputRef3d: React.RefObject<HTMLInputElement | null>;
    onClose: () => void;
    onTabChange: (tab: "2d" | "3d") => void;
    onName2dChange: (value: string) => void;
    onName3dChange: (value: string) => void;
    onFile2d: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onFile3d: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemove2d: (id: string) => void;
    onRemove3d: (id: string) => void;
}

export function BoundaryManagerModal({
    open,
    tab,
    arrays2d,
    arrays3d,
    name2d,
    name3d,
    fileInputRef2d,
    fileInputRef3d,
    onClose,
    onTabChange,
    onName2dChange,
    onName3dChange,
    onFile2d,
    onFile3d,
    onRemove2d,
    onRemove3d,
}: BoundaryManagerModalProps) {
    if (!open) return null;

    const is2d = tab === "2d";
    const arrays = is2d ? arrays2d : arrays3d;
    const nameVal = is2d ? name2d : name3d;
    const fileRef = is2d ? fileInputRef2d : fileInputRef3d;
    const fmt = is2d
        ? "f64 × 7 × N 바이트 (t, x, y, tx, ty, nx, ny 순서)"
        : "f64 × 10 × N 바이트 (t, x, y, z, tx, ty, tz, nx, ny, nz 순서)";
    const prefix = is2d ? "bd2" : "bd3";

    const inputStyle: React.CSSProperties = {
        padding: "4px 8px",
        borderRadius: token.radius.sm,
        border: `1px solid ${token.color.borderStrong}`,
        background: token.color.bgRaised,
        color: token.color.fg,
        fontFamily: "inherit",
        fontSize: token.font.size.fs14,
        outline: "none",
    };

    return (
        <Modal onClose={onClose} width="min(560px,95vw)">
            <ModalHeader onClose={onClose}>
                <Inline gap="sp1">
                    <Button variant="secondary" size="sm" onClick={() => onTabChange("2d")} style={{ background: tab === "2d" ? token.color.border : "none" }}>
                        🗺 Boundary 2D
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onTabChange("3d")} style={{ background: tab === "3d" ? token.color.border : "none" }}>
                        🌐 Boundary 3D
                    </Button>
                </Inline>
            </ModalHeader>

            <ModalBody>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                    {arrays.length === 0 && (
                        <Text variant="body" tone="muted">업로드된 배열이 없습니다.</Text>
                    )}
                    {arrays.map(entry => (
                        <div key={entry.id} style={{ background: token.color.bgSubtle, border: `1px solid ${token.color.borderStrong}`, borderRadius: token.radius.md, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, fontSize: token.font.size.fs12 }}>
                                <span style={{ color: token.color.accent, fontWeight: 700 }}>{entry.name}</span>
                                <span style={{ color: token.color.fgMuted }}> — {entry.count}개 원소</span>
                                <span style={{ color: token.color.fgMuted, fontSize: token.font.size.fs11 }}> (0x{entry.offset.toString(16)})</span>
                            </div>
                            <Button variant="danger" size="sm" onClick={() => (is2d ? onRemove2d(entry.id) : onRemove3d(entry.id))}>삭제</Button>
                        </div>
                    ))}
                </div>

                <div style={{ borderTop: `1px solid ${token.color.border}`, marginBottom: 12 }} />

                <Text variant="label" tone="accent" style={{ marginBottom: 8, display: "block" }}>새 배열 업로드</Text>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <input
                        value={nameVal}
                        onChange={e => (is2d ? onName2dChange(e.target.value) : onName3dChange(e.target.value))}
                        placeholder="변수명 (영문)"
                        style={{ ...inputStyle, flex: 1 }}
                    />
                    <Button variant="blocks" size="sm" onClick={() => fileRef.current?.click()}>.bin 파일 선택</Button>
                    <input ref={fileRef} type="file" accept=".bin" onChange={is2d ? onFile2d : onFile3d} style={{ display: "none" }} />
                </div>
                <Text variant="caption" tone="muted" style={{ lineHeight: 1.6 }}>
                    형식: {fmt}<br />
                    블록 사용: <span style={{ color: token.color.fgMuted }}>{prefix} 변수 선언</span> → <span style={{ color: token.color.fgMuted }}>{prefix} 반복</span>
                </Text>
            </ModalBody>
        </Modal>
    );
}
