"use client";
import React, { useState } from "react";

import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/organisms/Modal";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { token } from "@/components/tokens";
import { COMPILE_FIELDS, DEVICES, DEVICE_LABEL, type CompileOptions, type DeviceKind } from "@/lib/compileConfig";

type Props = {
    open: boolean;
    /** Current compile options (parsed from config.json, or defaults). */
    options: CompileOptions;
    /** Current runtime device (config["environment"]["device"], or default). */
    device: DeviceKind;
    /** Actual active backend reported by the worker (may differ via fallback). */
    runtimeBackend: string;
    /** True while the backend is (re)initializing — device control disabled. */
    deviceBusy: boolean;
    /** Non-null when config.json exists but isn't valid JSON — form is disabled. */
    parseError: string | null;
    /** Called with the next options on every change; the parent writes config.json. */
    onChange: (next: CompileOptions) => void;
    /** Called when the device is changed (parent persists + switches backend). */
    onDeviceChange: (next: DeviceKind) => void;
    /** Open the raw config.json file in an editor tab ("Edit in settings.json"). */
    onOpenRaw: () => void;
    onClose: () => void;
};

const selectStyle: React.CSSProperties = {
    height: 32,
    padding: "0 10px",
    background: token.color.bgSubtle,
    color: token.color.fg,
    border: `1px solid ${token.color.border}`,
    borderRadius: token.radius.sm,
    fontSize: token.font.size.fs12,
    fontFamily: token.font.family.mono,
    outline: "none",
    cursor: "pointer",
};

// VS Code-style settings editor for the `compile` section of config.json.
// Controls are generated from COMPILE_FIELDS (schema-derived); every change is
// pushed up immediately so the file stays mapped to the UI.
export function CompileSettingsModal({ open, options, device, runtimeBackend, deviceBusy, parseError, onChange, onDeviceChange, onOpenRaw, onClose }: Props) {
    const [defineDraft, setDefineDraft] = useState("");
    const [defineErr, setDefineErr] = useState<string | null>(null);

    if (!open) return null;
    const disabled = parseError !== null;

    const update = (partial: Partial<CompileOptions>) => onChange({ ...options, ...partial });

    const addDefine = () => {
        const v = defineDraft.trim();
        if (!v) return;
        const field = COMPILE_FIELDS.find(f => f.kind === "list");
        if (field?.kind === "list" && !new RegExp(field.itemPattern).test(v)) {
            setDefineErr("이름 또는 NAME=value 형식만 가능해요 (영문/숫자/_).");
            return;
        }
        if (options.defines.includes(v)) {
            setDefineErr("이미 추가된 정의예요.");
            return;
        }
        update({ defines: [...options.defines, v] });
        setDefineDraft("");
        setDefineErr(null);
    };

    const removeDefine = (d: string) =>
        update({ defines: options.defines.filter(x => x !== d) });

    return (
        <Modal onClose={onClose} width={560}>
            <ModalHeader onClose={onClose}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Icon.Settings size={15} />
                    <span style={{ fontWeight: token.font.weight.semibold }}>빌드 설정</span>
                    <span style={{ color: token.color.fgSubtle, fontFamily: token.font.family.mono, fontSize: token.font.size.fs11 }}>
                        config.json · compile
                    </span>
                </span>
            </ModalHeader>

            <ModalBody style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {parseError && (
                    <div style={{
                        padding: "10px 12px",
                        background: token.color.warningSoft,
                        border: `1px solid ${token.color.warningBorder}`,
                        borderRadius: token.radius.sm,
                        color: token.color.warning,
                        fontSize: token.font.size.fs12,
                        lineHeight: 1.55,
                    }}>
                        {parseError}
                    </div>
                )}

                {COMPILE_FIELDS.map(field => (
                    <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 6, opacity: disabled ? 0.5 : 1 }}>
                        <label style={{ fontSize: token.font.size.fs12, fontWeight: token.font.weight.semibold, color: token.color.fg }}>
                            {field.label}
                        </label>
                        <span style={{ fontSize: token.font.size.fs11, color: token.color.fgMuted, lineHeight: 1.5 }}>
                            {field.description}
                        </span>

                        {field.kind === "enum" ? (
                            <select
                                value={options[field.key]}
                                disabled={disabled}
                                onChange={e => update({ [field.key]: e.target.value } as Partial<CompileOptions>)}
                                style={{ ...selectStyle, alignSelf: "flex-start", minWidth: 180 }}
                            >
                                {field.options.map(opt => (
                                    <option key={opt} value={opt}>
                                        {field.optionLabels?.[opt] ?? opt}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {options.defines.length === 0 && (
                                        <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle, fontStyle: "italic" }}>
                                            정의 없음
                                        </span>
                                    )}
                                    {options.defines.map(d => (
                                        <span
                                            key={d}
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 6,
                                                padding: "3px 6px 3px 9px",
                                                background: token.color.bgSubtle,
                                                border: `1px solid ${token.color.border}`,
                                                borderRadius: 999,
                                                fontFamily: token.font.family.mono,
                                                fontSize: token.font.size.fs11,
                                                color: token.color.fg,
                                            }}
                                        >
                                            {d}
                                            <button
                                                type="button"
                                                onClick={() => removeDefine(d)}
                                                disabled={disabled}
                                                title="제거"
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    padding: 0,
                                                    background: "none",
                                                    border: "none",
                                                    color: token.color.fgSubtle,
                                                    cursor: disabled ? "default" : "pointer",
                                                }}
                                            >
                                                <Icon.X size={11} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <input
                                        value={defineDraft}
                                        disabled={disabled}
                                        placeholder={field.placeholder}
                                        spellCheck={false}
                                        onChange={e => { setDefineDraft(e.target.value); setDefineErr(null); }}
                                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addDefine(); } }}
                                        style={{
                                            flex: 1,
                                            height: 32,
                                            padding: "0 10px",
                                            background: token.color.bgSubtle,
                                            color: token.color.fg,
                                            border: `1px solid ${token.color.border}`,
                                            borderRadius: token.radius.sm,
                                            fontSize: token.font.size.fs12,
                                            fontFamily: token.font.family.mono,
                                            outline: "none",
                                        }}
                                    />
                                    <Button variant="secondary" size="sm" leading={<Icon.Plus size={11} />} onClick={addDefine} disabled={disabled}>
                                        추가
                                    </Button>
                                </div>
                                {defineErr && (
                                    <span style={{ fontSize: token.font.size.fs11, color: token.color.danger }}>{defineErr}</span>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {/* Runtime device — segmented control, mapped to environment.device. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: disabled ? 0.5 : 1 }}>
                    <label style={{ fontSize: token.font.size.fs12, fontWeight: token.font.weight.semibold, color: token.color.fg }}>
                        Device
                    </label>
                    <span style={{ fontSize: token.font.size.fs11, color: token.color.fgMuted, lineHeight: 1.5 }}>
                        TensorFlow.js 실행 백엔드. config.json 의 environment.device 에 저장됩니다.
                    </span>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 2, alignSelf: "flex-start", padding: 3, background: token.color.bgSubtle, border: `1px solid ${token.color.border}`, borderRadius: token.radius.md }}>
                        {DEVICES.map((d, i) => {
                            const selected = device === d;
                            const btnDisabled = disabled || deviceBusy;
                            return (
                                <React.Fragment key={d}>
                                    {i > 0 && <span style={{ color: token.color.border, opacity: 0.5 }}>|</span>}
                                    <button
                                        type="button"
                                        onClick={() => !selected && !btnDisabled && onDeviceChange(d)}
                                        disabled={btnDisabled}
                                        style={{
                                            background: selected ? token.color.surface : "none",
                                            border: "none",
                                            borderRadius: token.radius.sm,
                                            padding: "4px 10px",
                                            cursor: btnDisabled ? "default" : "pointer",
                                            color: selected ? token.color.accent : token.color.fgSubtle,
                                            fontSize: token.font.size.fs11,
                                            fontFamily: token.font.family.mono,
                                            fontWeight: selected ? 700 : 500,
                                        }}
                                    >
                                        {DEVICE_LABEL[d]}
                                    </button>
                                </React.Fragment>
                            );
                        })}
                    </div>
                    {deviceBusy ? (
                        <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>백엔드 초기화 중…</span>
                    ) : runtimeBackend && runtimeBackend !== device && DEVICES.includes(runtimeBackend as DeviceKind) ? (
                        <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>
                            현재 실행 중: {DEVICE_LABEL[runtimeBackend as DeviceKind]} (요청한 백엔드를 사용할 수 없어 대체됨)
                        </span>
                    ) : null}
                </div>
            </ModalBody>

            <ModalFooter style={{ justifyContent: "space-between" }}>
                <Button variant="ghost" size="sm" leading={<Icon.File size={11} />} onClick={onOpenRaw}>
                    JSON 으로 열기
                </Button>
                <Button variant="secondary" size="sm" onClick={onClose}>
                    닫기
                </Button>
            </ModalFooter>
        </Modal>
    );
}
