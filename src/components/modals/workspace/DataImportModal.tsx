"use client";

import React from "react";
import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";
import { Modal, ModalBody, ModalHeader } from "@/components/organisms/Modal";
import { Tabs } from "@/components/organisms/Tabs";
import { token } from "@/components/tokens";

/** A struct already defined on the canvas, offered in the "existing" tab. */
export interface ImportStructOption {
    name: string;
    fields: { name: string; type: "i32" | "f64" }[];
}

/** What the modal hands back once the user applies a mapping. */
export interface DataImportResult {
    name: string;                                   // array variable name
    fields: { name: string; type: "i32" | "f64" }[]; // struct fields (in order)
    columnMap: string[];                            // excel column per field (same order)
    rows: Record<string, unknown>[];                // raw parsed rows
}

interface DataImportModalProps {
    open: boolean;
    structs: ImportStructOption[];
    existing: { id: string; name: string; count: number; include: boolean }[];
    onRemove: (id: string) => void;
    onToggleInclude: (id: string) => void;
    onClose: () => void;
    onApply: (result: DataImportResult) => void;
}

type Mode = "existing" | "auto" | "custom";
interface FieldRow { name: string; type: "i32" | "f64"; column: string }

function sanitizeName(s: string): string {
    let n = String(s ?? "").trim().replace(/[^A-Za-z0-9_]/g, "_");
    if (!/^[A-Za-z_]/.test(n)) n = "f_" + n;
    return n || "field";
}

function inferType(col: string, rows: Record<string, unknown>[]): "i32" | "f64" {
    let sawValue = false;
    for (const r of rows) {
        const v = r[col];
        if (v === null || v === undefined || v === "") continue;
        sawValue = true;
        const num = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(num) || !Number.isInteger(num)) return "f64";
    }
    return sawValue ? "i32" : "f64";
}

export function DataImportModal({ open, structs, existing, onRemove, onToggleInclude, onClose, onApply }: DataImportModalProps) {
    const [fileName, setFileName] = React.useState("");
    const [headers, setHeaders]   = React.useState<string[]>([]);
    const [rows, setRows]         = React.useState<Record<string, unknown>[]>([]);
    const [parseError, setParseError] = React.useState<string | null>(null);

    const [arrayName, setArrayName] = React.useState("data");
    const [mode, setMode]           = React.useState<Mode>("existing");
    const [selectedStruct, setSelectedStruct] = React.useState("");
    const [fieldRows, setFieldRows] = React.useState<FieldRow[]>([]);

    const fileRef = React.useRef<HTMLInputElement>(null);

    if (!open) return null;

    const existingNames = existing.map(e => e.name);

    const inputStyle: React.CSSProperties = {
        padding: "4px 8px",
        borderRadius: token.radius.sm,
        border: `1px solid ${token.color.borderStrong}`,
        background: token.color.bgRaised,
        color: token.color.fg,
        fontFamily: "inherit",
        fontSize: token.font.size.fs13,
        outline: "none",
    };

    const bestColumn = (field: string, hs: string[]) =>
        hs.find(h => h.toLowerCase() === field.toLowerCase()) ?? hs[0] ?? "";

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setParseError(null);
        try {
            const buf = await file.arrayBuffer();
            const XLSX = await import("xlsx");
            const wb = XLSX.read(buf, { type: "array" });
            const ws = wb.Sheets[wb.SheetNames[0]];
            if (!ws) { setParseError("No sheet found in file."); return; }
            const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
            if (parsed.length === 0) { setParseError("Sheet has no data rows."); return; }
            const hs = Object.keys(parsed[0]);
            setFileName(file.name);
            setHeaders(hs);
            setRows(parsed);
            if (!arrayName || arrayName === "data") {
                setArrayName(sanitizeName(file.name.replace(/\.[^.]+$/, "")) || "data");
            }
            // Seed field rows for the active mode.
            if (mode === "auto") seedAuto(hs, parsed);
            else if (mode === "existing" && selectedStruct) seedExisting(selectedStruct, hs);
        } catch (err) {
            setParseError(err instanceof Error ? err.message : String(err));
        }
    }

    function seedAuto(hs: string[], rws: Record<string, unknown>[]) {
        setFieldRows(hs.map(h => ({ name: sanitizeName(h), type: inferType(h, rws), column: h })));
    }

    function seedExisting(structName: string, hs: string[]) {
        const s = structs.find(x => x.name === structName);
        if (!s) { setFieldRows([]); return; }
        setFieldRows(s.fields.map(f => ({ name: f.name, type: f.type, column: bestColumn(f.name, hs) })));
    }

    function switchMode(m: Mode) {
        setMode(m);
        if (m === "auto") seedAuto(headers, rows);
        else if (m === "existing") { if (selectedStruct) seedExisting(selectedStruct, headers); else setFieldRows([]); }
        else setFieldRows([]); // custom starts empty
    }

    const nameLocked = mode === "existing"; // struct fields fixed when chosen from existing

    function updateField(i: number, patch: Partial<FieldRow>) {
        setFieldRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
    }
    function addField() {
        setFieldRows(prev => [...prev, { name: `field${prev.length + 1}`, type: "f64", column: headers[0] ?? "" }]);
    }
    function removeField(i: number) {
        setFieldRows(prev => prev.filter((_, idx) => idx !== i));
    }

    const nameValid = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(arrayName.trim());
    const nameDup   = existingNames.includes(arrayName.trim());
    const canApply  = rows.length > 0 && fieldRows.length > 0 && nameValid && !nameDup
        && fieldRows.every(r => r.name.trim() && r.column);

    function apply() {
        if (!canApply) return;
        onApply({
            name: arrayName.trim(),
            fields: fieldRows.map(r => ({ name: sanitizeName(r.name), type: r.type })),
            columnMap: fieldRows.map(r => r.column),
            rows,
        });
    }

    const cellStyle: React.CSSProperties = { padding: "4px 6px", fontSize: token.font.size.fs12 };

    return (
        <Modal onClose={onClose} width="min(680px,96vw)">
            <ModalHeader onClose={onClose}>
                <Text variant="label" tone="accent">📊 Import Excel → struct array</Text>
            </ModalHeader>

            <ModalBody>
                {/* Existing imported arrays (removable) */}
                {existing.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                        {existing.map(e => (
                            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, background: token.color.bgSubtle, border: `1px solid ${token.color.border}`, borderRadius: token.radius.sm, padding: "4px 8px" }}>
                                <span style={{ flex: 1, fontSize: token.font.size.fs12 }}>
                                    <span style={{ color: token.color.accent, fontWeight: 700 }}>{e.name}</span>
                                    <span style={{ color: token.color.fgMuted }}> — {e.count} rows</span>
                                </span>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: token.font.size.fs11, color: token.color.fgMuted, cursor: "pointer" }}>
                                    <input type="checkbox" checked={e.include} onChange={() => onToggleInclude(e.id)} />
                                    프로젝트에 포함
                                </label>
                                <Button variant="danger" size="xs" onClick={() => onRemove(e.id)}>×</Button>
                            </div>
                        ))}
                    </div>
                )}

                {/* File picker + name */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
                    <Button variant="blocks" size="sm" onClick={() => fileRef.current?.click()}>Select file</Button>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />
                    <Text variant="caption" tone="muted" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fileName ? `${fileName} — ${rows.length} rows` : "no file selected"}
                    </Text>
                    <input
                        value={arrayName}
                        onChange={e => setArrayName(e.target.value)}
                        placeholder="array name"
                        style={{ ...inputStyle, width: 140, borderColor: nameValid && !nameDup ? token.color.borderStrong : token.color.danger }}
                    />
                </div>
                {parseError && <Text variant="caption" tone="danger" style={{ display: "block", marginBottom: 8 }}>{parseError}</Text>}
                {nameDup && <Text variant="caption" tone="danger" style={{ display: "block", marginBottom: 8 }}>name already in use</Text>}

                {/* Struct source tabs */}
                <Tabs
                    items={[
                        { key: "existing", label: "기존에서 선택" },
                        { key: "auto",     label: "자동 생성" },
                        { key: "custom",   label: "커스텀 생성" },
                    ]}
                    activeKey={mode}
                    onChange={k => switchMode(k as Mode)}
                    style={{ marginBottom: 10 }}
                />

                {mode === "existing" && (
                    <div style={{ marginBottom: 10 }}>
                        <select
                            value={selectedStruct}
                            onChange={e => { setSelectedStruct(e.target.value); seedExisting(e.target.value, headers); }}
                            style={{ ...inputStyle, width: "100%" }}
                        >
                            <option value="">— select a struct —</option>
                            {structs.map(s => <option key={s.name} value={s.name}>{s.name} ({s.fields.length} fields)</option>)}
                        </select>
                        {structs.length === 0 && (
                            <Text variant="caption" tone="muted" style={{ display: "block", marginTop: 6 }}>
                                No structs on the canvas. Use 자동/커스텀 생성.
                            </Text>
                        )}
                    </div>
                )}

                {mode === "auto" && (
                    <div style={{ marginBottom: 8 }}>
                        <Button variant="secondary" size="sm" disabled={headers.length === 0} onClick={() => seedAuto(headers, rows)}>
                            ↻ Regenerate from headers
                        </Button>
                    </div>
                )}

                {/* Field → column mapping table */}
                {fieldRows.length > 0 ? (
                    <div style={{ border: `1px solid ${token.color.border}`, borderRadius: token.radius.md, overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 1fr 32px", background: token.color.bgSubtle, fontWeight: 700 }}>
                            <div style={cellStyle}>field</div>
                            <div style={cellStyle}>type</div>
                            <div style={cellStyle}>excel column</div>
                            <div style={cellStyle} />
                        </div>
                        {fieldRows.map((r, i) => (
                            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 1fr 32px", borderTop: `1px solid ${token.color.border}`, alignItems: "center" }}>
                                <div style={cellStyle}>
                                    <input value={r.name} disabled={nameLocked}
                                        onChange={e => updateField(i, { name: e.target.value })}
                                        style={{ ...inputStyle, width: "100%", opacity: nameLocked ? 0.6 : 1 }} />
                                </div>
                                <div style={cellStyle}>
                                    <select value={r.type} disabled={nameLocked}
                                        onChange={e => updateField(i, { type: e.target.value as "i32" | "f64" })}
                                        style={{ ...inputStyle, width: "100%", opacity: nameLocked ? 0.6 : 1 }}>
                                        <option value="i32">int</option>
                                        <option value="f64">float</option>
                                    </select>
                                </div>
                                <div style={cellStyle}>
                                    <select value={r.column} onChange={e => updateField(i, { column: e.target.value })}
                                        style={{ ...inputStyle, width: "100%" }}>
                                        <option value="">—</option>
                                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div style={cellStyle}>
                                    {mode === "custom" && (
                                        <Button variant="danger" size="xs" onClick={() => removeField(i)}>×</Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <Text variant="caption" tone="muted" style={{ display: "block" }}>
                        {rows.length === 0 ? "Select a file, then choose a struct." : "No fields yet."}
                    </Text>
                )}

                {mode === "custom" && (
                    <div style={{ marginTop: 8 }}>
                        <Button variant="ghost" size="sm" disabled={headers.length === 0} onClick={addField}>+ field</Button>
                    </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 14 }}>
                    <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
                    <Button variant="accent" size="sm" disabled={!canApply} onClick={apply}>Apply</Button>
                </div>
            </ModalBody>
        </Modal>
    );
}

export default DataImportModal;
