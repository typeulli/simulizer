"use client";

import React from "react";
import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/organisms/Modal";
import { token } from "@/components/tokens";

interface ErrorModalProps {
    message: string | null;
    onClose: () => void;
    onCopy: (message: string) => void;
}

export function ErrorModal({ message, onClose, onCopy }: ErrorModalProps) {
    if (!message) return null;

    return (
        <Modal onClose={onClose} width="min(480px,90vw)">
            <ModalHeader onClose={onClose}>
                <Text variant="label" tone="danger">⚠ 오류</Text>
            </ModalHeader>
            <ModalBody style={{ padding: 0 }}>
                <pre style={{ margin: 0, padding: "16px", fontSize: token.font.size.fs12, color: token.color.fgMuted, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all", overflowY: "auto", maxHeight: 300 }}>{message}</pre>
            </ModalBody>
            <ModalFooter>
                <Button variant="reset" size="sm" onClick={() => onCopy(message)}>복사</Button>
                <Button variant="blocks" size="sm" onClick={onClose}>닫기</Button>
            </ModalFooter>
        </Modal>
    );
}
