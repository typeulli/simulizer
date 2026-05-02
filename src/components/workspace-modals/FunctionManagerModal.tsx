"use client";

import React from "react";
import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";
import { Modal, ModalBody, ModalHeader } from "@/components/organisms/Modal";
import { token } from "@/components/tokens";
import langpack from "@/lang/lang";

interface FunctionSpec {
    id: string;
    name: string;
    retType: "i32" | "f64" | "void";
    params: { name: string; type: "i32" | "f64" }[];
}

interface FunctionManagerModalProps {
    open: boolean;
    onClose: () => void;
    pack: langpack;
    customFuncs: FunctionSpec[];
    newFuncName: string;
    newFuncRet: "i32" | "f64" | "void";
    newFuncParams: { name: string; type: "i32" | "f64" }[];
    onChangeName: (value: string) => void;
    onChangeRet: (value: "i32" | "f64" | "void") => void;
    onChangeParamName: (index: number, value: string) => void;
    onChangeParamType: (index: number, value: "i32" | "f64") => void;
    onRemoveParam: (index: number) => void;
    onAddParam: () => void;
    onAddFunc: () => void;
    onRemoveFunc: (id: string) => void;
}

export function FunctionManagerModal({
    open,
    onClose,
    pack,
    customFuncs,
    newFuncName,
    newFuncRet,
    newFuncParams,
    onChangeName,
    onChangeRet,
    onChangeParamName,
    onChangeParamType,
    onRemoveParam,
    onAddParam,
    onAddFunc,
    onRemoveFunc,
}: FunctionManagerModalProps) {
    if (!open) return null;

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
    const selectStyle: React.CSSProperties = { ...inputStyle };

    return (
        <Modal onClose={onClose} width="min(560px,95vw)">
            <ModalHeader onClose={onClose}>
                <Text variant="label" tone="accent">{pack.workspace.ui.func_mgr_title}</Text>
            </ModalHeader>

            <ModalBody>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                    {customFuncs.length === 0 && (
                        <Text variant="body" tone="muted">{pack.workspace.ui.func_empty_message}</Text>
                    )}
                    {customFuncs.map(spec => (
                        <div key={spec.id} style={{ background: token.color.bgSubtle, border: `1px solid ${token.color.borderStrong}`, borderRadius: token.radius.md, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, fontSize: token.font.size.fs12 }}>
                                <span style={{ color: token.color.accent, fontWeight: 700 }}>{spec.name}</span>
                                <span style={{ color: token.color.fgMuted }}> → {spec.retType}</span>
                                {spec.params.length > 0 && (
                                    <span style={{ color: token.color.info }}>
                                        {"  "}({spec.params.map(p => `${p.name}:${p.type}`).join(", ")})
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => onRemoveFunc(spec.id)}
                                style={{ background: token.color.dangerSoft, border: `1px solid ${token.color.danger}`, borderRadius: 5, color: token.color.danger, cursor: "pointer", fontSize: token.font.size.fs11, padding: "3px 10px" }}
                            >
                                {pack.workspace.ui.delete_button}
                            </button>
                        </div>
                    ))}
                </div>

                <div style={{ borderTop: `1px solid ${token.color.border}`, marginBottom: 12 }} />

                <Text variant="label" tone="accent" style={{ marginBottom: 8, display: "block" }}>{pack.workspace.ui.add_func_section}</Text>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <input
                        value={newFuncName}
                        onChange={e => onChangeName(e.target.value)}
                        placeholder={pack.workspace.ui.func_name_placeholder}
                        style={{ ...inputStyle, flex: 2 }}
                    />
                    <select value={newFuncRet} onChange={e => onChangeRet(e.target.value as "i32" | "f64" | "void")} style={{ ...selectStyle, flex: 1 }}>
                        <option value="i32">i32</option>
                        <option value="f64">f64</option>
                        <option value="void">void</option>
                    </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                    {newFuncParams.map((p, i) => (
                        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                                value={p.name}
                                onChange={e => onChangeParamName(i, e.target.value)}
                                placeholder={`param${i}`}
                                style={{ ...inputStyle, flex: 2 }}
                            />
                            <select value={p.type} onChange={e => onChangeParamType(i, e.target.value as "i32" | "f64")} style={{ ...selectStyle, flex: 1 }}>
                                <option value="i32">i32</option>
                                <option value="f64">f64</option>
                            </select>
                            <button
                                onClick={() => onRemoveParam(i)}
                                style={{ background: "none", border: "none", color: token.color.fgMuted, cursor: "pointer", fontSize: token.font.size.fs16 }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                    <Button variant="reset" size="sm" style={{ alignSelf: "flex-start" }} onClick={onAddParam}>
                        {pack.workspace.ui.add_param_button}
                    </Button>
                </div>
                <Button variant="run" style={{ width: "100%" }} onClick={onAddFunc}>{pack.workspace.ui.add_button}</Button>
            </ModalBody>
        </Modal>
    );
}
