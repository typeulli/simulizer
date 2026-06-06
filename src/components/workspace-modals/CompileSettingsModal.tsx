"use client";
import React, { useState } from "react";

import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/organisms/Modal";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";
import { token } from "@/components/tokens";
import { BUILD_FIELDS, COMPILE_FIELDS, DEVICES, DEVICE_LABEL, type BuildOptions, type CompileOptions, type DeviceKind } from "@/lib/compileConfig";
import { isBinaryName } from "@/lib/cppBundle";

type SettingsTab = "compile" | "build" | "environment";

type Props = {
    open: boolean;
    /** config["build"] — target OS + exe icon. */
    build: BuildOptions;
    /** config["compile"] — optimization / std / defines. */
    compile: CompileOptions;
    /** Current runtime device (config["environment"]["device"], or default). */
    device: DeviceKind;
    /** Actual active backend reported by the worker (may differ via fallback). */
    runtimeBackend: string;
    /** True while the backend is (re)initializing — device control disabled. */
    deviceBusy: boolean;
    /** Non-null when config.json exists but isn't valid JSON — form is disabled. */
    parseError: string | null;
    /** Every image path in the project, for the icon-path autocomplete. */
    iconChoices: string[];
    /** Called with the next build options on every change; parent writes config.json. */
    onBuildChange: (next: BuildOptions) => void;
    /** Called with the next compile options on every change; parent writes config.json. */
    onCompileChange: (next: CompileOptions) => void;
    /** Called when the device is changed (parent persists + switches backend). */
    onDeviceChange: (next: DeviceKind) => void;
    /** Upload an image into build/icon and set it as the icon. */
    onUploadIcon: () => void;
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

const inputStyle: React.CSSProperties = {
    height: 32,
    padding: "0 10px",
    background: token.color.bgSubtle,
    color: token.color.fg,
    border: `1px solid ${token.color.border}`,
    borderRadius: token.radius.sm,
    fontSize: token.font.size.fs12,
    fontFamily: token.font.family.mono,
    outline: "none",
};

const fieldLabel: React.CSSProperties = { fontSize: token.font.size.fs12, fontWeight: token.font.weight.semibold, color: token.color.fg };
const fieldDesc: React.CSSProperties = { fontSize: token.font.size.fs11, color: token.color.fgMuted, lineHeight: 1.5 };

// Validate the configured icon path for the inline warning. The icon may live
// anywhere in the project, but must be an image that actually exists.
function iconWarning(icon: string, iconChoices: string[]): string | null {
    const p = icon.trim();
    if (!p) return null;
    if (!isBinaryName(p)) return "아이콘은 이미지 파일만 사용할 수 있어요 (.ico / .png / .jpg 등).";
    if (!iconChoices.includes(p)) return "해당 경로에 이미지 파일이 없어요. 경로를 확인하거나 업로드하세요.";
    return null;
}

// VS Code-style settings editor for config.json. Each config section gets its
// own tab (빌드 / 컴파일 / 실행 환경); every change is pushed up immediately so
// the file stays mapped to the UI.
export function CompileSettingsModal({ open, build, compile, device, runtimeBackend, deviceBusy, parseError, iconChoices, onBuildChange, onCompileChange, onDeviceChange, onUploadIcon, onOpenRaw, onClose }: Props) {
    const [tab, setTab] = useState<SettingsTab>("compile");
    const [defineDraft, setDefineDraft] = useState("");
    const [defineErr, setDefineErr] = useState<string | null>(null);

    if (!open) return null;
    const disabled = parseError !== null;

    const updateBuild = (partial: Partial<BuildOptions>) => onBuildChange({ ...build, ...partial });
    const updateCompile = (partial: Partial<CompileOptions>) => onCompileChange({ ...compile, ...partial });

    const addDefine = () => {
        const v = defineDraft.trim();
        if (!v) return;
        const field = COMPILE_FIELDS.find(f => f.kind === "list");
        if (field?.kind === "list" && !new RegExp(field.itemPattern).test(v)) {
            setDefineErr("이름 또는 NAME=value 형식만 가능해요 (영문/숫자/_).");
            return;
        }
        if (compile.defines.includes(v)) {
            setDefineErr("이미 추가된 정의예요.");
            return;
        }
        updateCompile({ defines: [...compile.defines, v] });
        setDefineDraft("");
        setDefineErr(null);
    };

    const removeDefine = (d: string) =>
        updateCompile({ defines: compile.defines.filter(x => x !== d) });

    const iconWarn = iconWarning(build.icon, iconChoices);

    return (
        <Modal onClose={onClose} width={560}>
            <ModalHeader onClose={onClose}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Icon.Settings size={15} />
                    <span style={{ fontWeight: token.font.weight.semibold }}>설정</span>
                    <span style={{ color: token.color.fgSubtle, fontFamily: token.font.family.mono, fontSize: token.font.size.fs11 }}>
                        config.json
                    </span>
                </span>
            </ModalHeader>

            <ModalBody style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

                {/* Tab strip — 컴파일 / 빌드 / 실행 환경 */}
                <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${token.color.border}` }}>
                    {([
                        { id: "compile" as const, label: "컴파일" },
                        { id: "build" as const, label: "빌드" },
                        { id: "environment" as const, label: "실행 환경" },
                    ]).map(t => {
                        const active = tab === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTab(t.id)}
                                style={{
                                    padding: "8px 14px",
                                    border: "none",
                                    background: "none",
                                    cursor: "pointer",
                                    color: active ? token.color.fg : token.color.fgMuted,
                                    fontSize: token.font.size.fs12,
                                    fontWeight: active ? 600 : 500,
                                    borderBottom: active ? `2px solid ${token.color.accent}` : "2px solid transparent",
                                    marginBottom: -1,
                                }}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                {/* ── 컴파일 탭 (optimization / std / defines) ── */}
                {tab === "compile" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        {COMPILE_FIELDS.map(field => (
                            <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 6, opacity: disabled ? 0.5 : 1 }}>
                                <label style={fieldLabel}>{field.label}</label>
                                <span style={fieldDesc}>{field.description}</span>

                                {field.kind === "enum" ? (
                                    <select
                                        value={compile[field.key]}
                                        disabled={disabled}
                                        onChange={e => updateCompile({ [field.key]: e.target.value } as Partial<CompileOptions>)}
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
                                            {compile.defines.length === 0 && (
                                                <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle, fontStyle: "italic" }}>
                                                    정의 없음
                                                </span>
                                            )}
                                            {compile.defines.map(d => (
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
                                                style={{ ...inputStyle, flex: 1 }}
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
                    </div>
                )}

                {/* ── 빌드 탭 (target system + exe icon) ── */}
                {tab === "build" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        {BUILD_FIELDS.map(field => (
                            <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 6, opacity: disabled ? 0.5 : 1 }}>
                                <label style={fieldLabel}>{field.label}</label>
                                <span style={fieldDesc}>{field.description}</span>
                                <select
                                    value={build[field.key]}
                                    disabled={disabled}
                                    onChange={e => updateBuild({ [field.key]: e.target.value } as Partial<BuildOptions>)}
                                    style={{ ...selectStyle, alignSelf: "flex-start", minWidth: 180 }}
                                >
                                    {field.options.map(opt => (
                                        <option key={opt} value={opt}>
                                            {field.optionLabels?.[opt] ?? opt}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))}

                        {/* Windows exe icon — relative image path (anywhere in the project). */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: disabled ? 0.5 : 1 }}>
                            <label style={fieldLabel}>아이콘 (Windows exe)</label>
                            <span style={fieldDesc}>
                                exe 아이콘으로 쓸 이미지 파일(.ico / .png / .jpg 등)의 상대 경로를 지정하세요. 프로젝트 어디에 있든 가능하며, .ico 가 아니면 빌드 시 서버에서 자동으로 .ico 로 변환돼요.
                            </span>
                            <div style={{ display: "flex", gap: 6 }}>
                                <input
                                    value={build.icon}
                                    disabled={disabled}
                                    list="settings-icon-choices"
                                    placeholder="예: build/icon/app.png"
                                    spellCheck={false}
                                    onChange={e => updateBuild({ icon: e.target.value })}
                                    style={{ ...inputStyle, flex: 1 }}
                                />
                                <datalist id="settings-icon-choices">
                                    {iconChoices.map(p => <option key={p} value={p} />)}
                                </datalist>
                                <Button variant="secondary" size="sm" leading={<Icon.Upload size={11} />} onClick={onUploadIcon} disabled={disabled}>
                                    이미지 업로드
                                </Button>
                            </div>
                            {iconWarn ? (
                                <span style={{ fontSize: token.font.size.fs11, color: token.color.warning }}>{iconWarn}</span>
                            ) : (
                                <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>
                                    아이콘은 Windows 빌드에만 적용돼요.
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* ── 실행 환경 탭 (TF.js device) ── */}
                {tab === "environment" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: disabled ? 0.5 : 1 }}>
                            <label style={fieldLabel}>Device</label>
                            <span style={fieldDesc}>
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
                    </div>
                )}
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
