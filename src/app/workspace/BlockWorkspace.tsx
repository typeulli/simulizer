"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";

import * as Blockly from "blockly/core";
import "blockly/blocks";
import * as BlocklyEn from "blockly/msg/en";

import { simulizer } from "@/utils/wasm/engine";
import { unpackF64Arrays } from "@/utils/ziparray";
import {
    type BlockDef,
    type CompileCtx,
    unpack,
    translateBlockSet,
} from "@/utils/blockly/$base";
import { xmlArrayBlocks, registerDynamicArrayBlocks, compileArrayLiteralBlock } from "@/utils/blockly/array";
import { xmlBoolBlocks } from "@/utils/blockly/bool";
import { xmlDebugBlocks } from "@/utils/blockly/debug";
import { xmlUtilBlocks } from "@/utils/blockly/util";
import { xmlI32Blocks } from "@/utils/blockly/i32";
import { xmlLocalBlocks, type BuiltinConst } from "@/utils/blockly/locals";
import { xmlTensorBlocks, registerDynamicTensorBlocks } from "@/utils/blockly/tensor";
import { mat_data_to_image_url, vec_field_to_image_url } from "@/utils/wasm/tensor";
import { CUSTOM_BLOCKS, NEEDS_EMCC_BLOCK_TYPES } from "@/utils/blockly/$blocks";

import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";
import { Inline } from "@/components/atoms/layout/Inline";
import { StatusDot } from "@/components/atoms/StatusDot";
import { Icon } from "@/components/atoms/Icons";
import { Logo } from "@/components/atoms/Logo";
import { Spinner } from "@/components/atoms/Spinner";
import { BuildSnackbar } from "@/components/molecules/BuildSnackbar";
import { TopbarBrand } from "@/components/organisms/TopbarBrand";
import { token } from "@/components/tokens";
import { BlockManagerModal } from "@/components/workspace-modals/BlockManagerModal";
import { BoundaryManagerModal } from "@/components/workspace-modals/BoundaryManagerModal";
import { ConstManagerModal } from "@/components/workspace-modals/ConstManagerModal";
import { ErrorModal } from "@/components/workspace-modals/ErrorModal";
import { LatexOcrModal } from "@/components/workspace-modals/LatexOcrModal";

import { useConsolePanel } from "@/components/console";
import useLanguagePack from "@/hooks/useLanguagePack";
import { useIsMobile } from "@/hooks/useMediaQuery";
import langpack from "@/lang/lang";
import { xmlF64Blocks } from "@/utils/blockly/f64";
import { xmlFlowBlocks, registerFoldRegionBlock } from "@/utils/blockly/flow";
import { xmlVectorBlocks } from "@/utils/blockly/vector";
import { xmlBoundaryBlocks } from "@/utils/blockly/boundary";
import { generateDiffTree, loadTreeDiff } from "@/lib/treediff/treediff";
import { NormalizeContext, unnormalize, normalize } from "@/lib/treediff/blockdiff";
import { replaceLatexBlocksInWorkspace } from "@/utils/tex/blockgen";
import { Prism } from "react-syntax-highlighter";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import { useTheme } from "@/hooks/useTheme";
import { useRouter, useSearchParams } from "next/navigation";
import type { WorkerOutMsg } from "@/utils/wasm/wasm-worker";
import type { ClangWorkerInMsg } from "@/utils/wasm/clang-worker";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { getMe, getFile, saveFile, renameFile, uploadThumbnail, duplicateFile, createFile, type FileOut, type FileDetail } from "@/lib/authapi";
import { serializeBundle, makeDefaultBundle, type CppBundle } from "@/lib/cppBundle";
import { ShareControl } from "@/components/share/ShareControl";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/organisms/Modal";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

// Auto-generated block thumbnails render at this size (2:1) so the dashboard
// card's preview box (same aspect) fills with objectFit:cover and nothing crops.
const THUMBNAIL_WIDTH = 480;
const THUMBNAIL_HEIGHT = 240;

// Register Blockly locale explicitly to prevent context menu labels from being undefined
Blockly.setLocale(BlocklyEn as { [key: string]: any });

// SVG elements loaded as <img> are sandboxed — CSS class selectors don't resolve.
// Walk the live DOM and inline getComputedStyle onto each cloned element before serializing.
function inlineSvgStyles(orig: Element, clone: Element) {
    const props = [
        "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity",
        "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
        "opacity", "display", "visibility",
        "font-family", "font-size", "font-weight", "font-style",
        "text-anchor", "dominant-baseline",
    ];
    const cs = window.getComputedStyle(orig);
    for (const p of props) {
        const v = cs.getPropertyValue(p);
        if (v) (clone as SVGElement).style.setProperty(p, v);
    }
    for (let i = 0; i < orig.children.length; i++) {
        if (clone.children[i]) inlineSvgStyles(orig.children[i], clone.children[i]);
    }
}

function generateThumbnailBlob(ws: Blockly.WorkspaceSvg): Promise<Blob | null> {
    const bbox = ws.getBlocksBoundingBox();
    const bw = bbox.right - bbox.left;
    const bh = bbox.bottom - bbox.top;
    if (bw <= 0 || bh <= 0) return Promise.resolve(null);

    const blockCanvas = ws.getCanvas();
    const ctm = blockCanvas.getCTM();
    if (!ctm) return Promise.resolve(null);

    // Fixed output size matching the dashboard preview aspect (2:1).
    // Blocks are uniformly scaled and centered with padding so nothing crops.
    const thumbW = THUMBNAIL_WIDTH;
    const thumbH = THUMBNAIL_HEIGHT;
    const pad = 24;

    const svgLeft = bbox.left * ctm.a + ctm.e;
    const svgTop  = bbox.top  * ctm.d + ctm.f;
    const svgW    = bw * ctm.a;
    const svgH    = bh * ctm.d;

    const scale = Math.min((thumbW - pad * 2) / svgW, (thumbH - pad * 2) / svgH);
    const drawnW = svgW * scale;
    const drawnH = svgH * scale;
    const offsetX = (thumbW - drawnW) / 2;
    const offsetY = (thumbH - drawnH) / 2;

    // ViewBox is in source coordinates; sizing it appropriately so the content
    // (positioned at svgLeft, svgTop with width svgW, svgH) maps to the
    // [offsetX, offsetY, drawnW, drawnH] region of a thumbW × thumbH canvas.
    const viewLeft = svgLeft - offsetX / scale;
    const viewTop  = svgTop  - offsetY / scale;
    const viewW    = thumbW / scale;
    const viewH    = thumbH / scale;

    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svgEl.setAttribute("viewBox", `${viewLeft} ${viewTop} ${viewW} ${viewH}`);
    svgEl.setAttribute("width", String(thumbW));
    svgEl.setAttribute("height", String(thumbH));

    // Transparent letterbox: the dashboard card behind the thumbnail provides
    // its own theme-aware background, so a baked-in light/dark fill would
    // clash whenever the viewer switches themes.

    // Copy defs (gradients, filters, etc.) from parent SVG.
    // Strip any elements referencing external URLs to prevent canvas taint.
    const externalUrlRe = /url\s*\(\s*['"]?https?:\/\//i;
    const parentSvg = ws.getParentSvg();
    for (const child of Array.from(parentSvg.childNodes)) {
        const el = child as Element;
        if (el.tagName === "defs") {
            const defsClone = child.cloneNode(true) as Element;
            for (const def of Array.from(defsClone.childNodes)) {
                const defEl = def as Element;
                const outer = defEl.outerHTML ?? "";
                if (externalUrlRe.test(outer)) defsClone.removeChild(def);
            }
            svgEl.appendChild(defsClone);
        }
    }

    // Clone canvas, then inline computed styles so fills survive img sandboxing.
    // Remove <foreignObject> elements — browsers unconditionally taint the canvas
    // when an SVG containing <foreignObject> is drawn onto it.
    const canvasClone = blockCanvas.cloneNode(true) as SVGGElement;
    for (const fo of Array.from(canvasClone.querySelectorAll("foreignObject"))) {
        fo.parentNode?.removeChild(fo);
    }
    inlineSvgStyles(blockCanvas, canvasClone);
    const { a, b, c, d, e, f } = ctm;
    canvasClone.setAttribute("transform", `matrix(${a},${b},${c},${d},${e},${f})`);
    svgEl.appendChild(canvasClone);

    const svgStr = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    return new Promise<Blob | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvasEl = document.createElement("canvas");
            canvasEl.width  = thumbW;
            canvasEl.height = thumbH;
            const ctx = canvasEl.getContext("2d");
            if (!ctx) { URL.revokeObjectURL(svgUrl); resolve(null); return; }
            ctx.drawImage(img, 0, 0, thumbW, thumbH);
            URL.revokeObjectURL(svgUrl);
            canvasEl.toBlob(b => resolve(b), "image/png");
        };
        img.onerror = () => { URL.revokeObjectURL(svgUrl); resolve(null); };
        img.src = svgUrl;
    });
}

// Recursively remaps input names in a Blockly JSON block tree to match the
// registered block definition. Handles cases where the AI returns wrong input
// names (e.g. FROM/TO instead of START/END for flow_for).
function sanitizeBlocksJson(blockJson: any, ws: Blockly.WorkspaceSvg): any {
    if (!blockJson) return blockJson;
    let result = { ...blockJson };

    if (blockJson.type && blockJson.inputs) {
        try {
            Blockly.Events.disable();
            const tempBlock = ws.newBlock(blockJson.type);
            const validNames = tempBlock.inputList
                .map((inp: any) => inp.name as string)
                .filter(Boolean);
            tempBlock.dispose(false);
            Blockly.Events.enable();

            const validSet = new Set(validNames);
            const currentNames = Object.keys(blockJson.inputs);
            const unknownNames = currentNames.filter(n => !validSet.has(n));

            if (unknownNames.length > 0) {
                const unusedValid = validNames.filter(n => !currentNames.includes(n));
                let ui = 0;
                const newInputs: any = {};
                for (const name of currentNames) {
                    if (validSet.has(name)) {
                        newInputs[name] = blockJson.inputs[name];
                    } else if (ui < unusedValid.length) {
                        newInputs[unusedValid[ui++]] = blockJson.inputs[name];
                    }
                }
                result = { ...result, inputs: newInputs };
            }
        } catch {
            Blockly.Events.enable();
        }
    }

    if (result.inputs) {
        const sanitizedInputs: any = {};
        for (const [k, v] of Object.entries<any>(result.inputs)) {
            sanitizedInputs[k] = v?.block
                ? { ...v, block: sanitizeBlocksJson(v.block, ws) }
                : v;
        }
        result.inputs = sanitizedInputs;
    }
    if (result.next?.block) {
        result.next = { ...result.next, block: sanitizeBlocksJson(result.next.block, ws) };
    }
    return result;
}

function buildSimulizerTheme(name: string) {
    const cs = getComputedStyle(document.documentElement);
    const cssVar = (v: string) => cs.getPropertyValue(v).trim();
    return Blockly.Theme.defineTheme(name, {
        name,
        base: Blockly.Themes.Classic,
        componentStyles: {
            workspaceBackgroundColour: cssVar("--bg-canvas"),
            toolboxBackgroundColour:   cssVar("--bg"),
            toolboxForegroundColour:   cssVar("--fg"),
            flyoutBackgroundColour:    cssVar("--bg-subtle"),
            flyoutForegroundColour:    cssVar("--fg-muted"),
            flyoutOpacity:             1,
            scrollbarColour:           cssVar("--border-strong"),
            insertionMarkerColour:     cssVar("--fg-strong"),
            insertionMarkerOpacity:    0.3,
            scrollbarOpacity:          0.6,
            cursorColour:              cssVar("--accent"),
        },
    });
}

// Blockly's setColour() only accepts hex colors, HSV numbers, or named colors.
// CSS custom properties using oklch/lab are not supported. This helper resolves
// a CSS color string to hex by painting it onto a canvas pixel, which always
// returns sRGB 0-255 values regardless of the source color space.
function cssColorToHex(value: string): string {
    if (!value) return "#888888";
    try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
    } catch {
        return "#888888";
    }
}

// Custom Block Definitions
function buildCustomBlockDefs(p: langpack): BlockDef[] {
    const msgs = p.block_messages ?? {};
    const dropdowns = p.block_dropdowns ?? {};
    const tooltips = p.block_tooltips ?? {};
    return [
        ...unpack(translateBlockSet(CUSTOM_BLOCKS, msgs, dropdowns, tooltips)),
        {
            type: "i32_not",
            message0: "! %1",
            args0: [{ type: "input_value", name: "VALUE", check: "i32" }],
            output: "bool", colour: 60, tooltip: tooltips["i32_not"] ?? "logical NOT",
            inputsInline: true,
        },
        {
            type: "wasm_return_i32",
            message0: msgs["wasm_return_i32"]?.[0] ?? "return int %1",
            args0: [{ type: "input_value", name: "VALUE", check: "i32" }],
            previousStatement: null, nextStatement: null, colour: 0, tooltip: tooltips["wasm_return_i32"] ?? "return int",
        },
        {
            type: "wasm_return_f64",
            message0: msgs["wasm_return_f64"]?.[0] ?? "return float %1",
            args0: [{ type: "input_value", name: "VALUE", check: "f64" }],
            previousStatement: null, nextStatement: null, colour: 0, tooltip: tooltips["wasm_return_f64"] ?? "return float",
        },
        {
            type: "wasm_func_main",
            message0: msgs["wasm_func_main"]?.[0] ?? "function main → %1",
            args0: [
                {
                    type: "field_dropdown", name: "RET_TYPE",
                    options: [[p.types.i32, "i32"], [p.types.f64, "f64"], [p.types.void, "void"]],
                },
            ],
            message1: msgs["wasm_func_main"]?.[1] ?? "body %1",
            args1: [{ type: "input_statement", name: "BODY" }],
            colour: 290, tooltip: tooltips["wasm_func_main"] ?? "WebAssembly main function",
        },
    ];
}

// Compiler [Blockly → simulizer AST]

type SimulizerExpr = simulizer.Expr;

interface CustomFuncSpec {
    id: string;
    name: string;
    retType: "i32" | "f64" | "void";
    params: { name: string; type: "i32" | "f64" }[];
}

const retTypeMap: Record<string, simulizer.Type> = {
    i32: simulizer.i32, f64: simulizer.f64, void: simulizer.void_,
};

// 컴파일 직전에 설정되는 모듈 레벨 참조 (blockToExpr 에서 접근)
let _customFuncSpecs: CustomFuncSpec[] = [];

// ── Boundary2D ─────────────────────────────────────────────────────────────
// 각 원소: f64 × 7 = 56 바이트 (t, x, y, tx, ty, nx, ny 순서)
const BD2_BASE_OFFSET = 0x80000; // 512 KB
const BD2_ELEM_BYTES  = 7 * 8;   // 56

interface Bd2ArrayEntry {
    id:     string;
    name:   string;
    data:   Float64Array;
    count:  number;
    offset: number;
}

let _bd2Arrays: Bd2ArrayEntry[] = [];

// ── Boundary3D ─────────────────────────────────────────────────────────────
// 각 원소: f64 × 9 = 72 바이트 (u, v, x, y, z, dS, nx, ny, nz 순서)
const BD3_BASE_OFFSET = 0xC0000; // 768 KB
const BD3_ELEM_BYTES  = 9 * 8;   // 72

interface Bd3ArrayEntry {
    id:     string;
    name:   string;
    data:   Float64Array;
    count:  number;
    offset: number;
}

let _bd3Arrays: Bd3ArrayEntry[] = [];

const displayType = (t: string) => t === "i32" ? "int" : t === "f64" ? "float" : t;

// ── Custom functions ─────────────────────────────────────────────────────────
// The canvas is the single source of truth: each `custom_func_def` block carries
// its own stable `funcId` (extraState), an editable NAME, a return-type dropdown,
// and N editable parameters (added/removed via the block's context menu). The
// function list, the per-function call blocks (`custom_func_<id>`), and the
// compiled symbols are all derived by scanning these blocks. The compiled symbol
// is id-based (`custom_func_<id>`), so renaming a function never orphans calls —
// the name is just a label that auto-syncs onto the call blocks.

type FuncDefBlock = Blockly.Block & {
    paramCount_: number;
    updateShape_(target: number): void;
};

const FUNC_RET_OPTIONS:  [string, string][] = [["int", "i32"], ["float", "f64"], ["void", "void"]];
const PARAM_TYPE_OPTIONS: [string, string][] = [["int", "i32"], ["float", "f64"]];

// A function's stable identity is its Blockly block id (unique per instance,
// preserved across save/load, regenerated on duplicate/flyout-drag). We only
// sanitize it into a WAT/block-type-safe symbol; nothing extra is serialized,
// so dragging two definitions out can never share an id.
function funcIdOf(blocklyId: string): string {
    return "f" + blocklyId.replace(/[^A-Za-z0-9]/g, "_");
}

// Module-level language pack reference so the dynamically-registered custom
// function blocks (def + calls) can localize their labels/tooltips without
// threading `pack` through every call site. Kept in sync by the component.
let _langPack: langpack | null = null;

/** Register the single generic function-definition block type. Re-registering
 *  with a fresh pack (on language change) relabels future blocks. */
function registerFuncDefBlock() {
    const cf = _langPack?.block_dynamic;
    const labelFunc = cf?.custom_func_def_label ?? "function";
    const labelBody = cf?.custom_func_def_body_label ?? "body";
    const labelParam = cf?.custom_func_def_param_label ?? "param";
    const defTip = cf?.custom_func_def_tooltip ?? "custom function (right-click to add/remove parameters)";
    const addParam = cf?.custom_func_add_param ?? "Add parameter";
    const removeParam = cf?.custom_func_remove_param ?? "Remove parameter";
    Blockly.Blocks["custom_func_def"] = {
        init(this: FuncDefBlock) {
            this.paramCount_ = 0;
            this.appendDummyInput()
                .appendField(labelFunc)
                .appendField(new Blockly.FieldTextInput("myFunc"), "NAME")
                .appendField("→")
                .appendField(new Blockly.FieldDropdown(FUNC_RET_OPTIONS), "RET");
            this.appendStatementInput("BODY").appendField(labelBody);
            this.setColour(290);
            this.setTooltip(defTip);
        },
        saveExtraState(this: FuncDefBlock) {
            return { paramCount: this.paramCount_ };
        },
        loadExtraState(this: FuncDefBlock, state: { paramCount?: number }) {
            this.updateShape_(state.paramCount ?? 0);
        },
        // Add/remove parameter rows to reach `target`; BODY always stays last.
        updateShape_(this: FuncDefBlock, target: number) {
            while (this.paramCount_ < target) {
                const i = this.paramCount_;
                this.appendDummyInput(`PARAM${i}`)
                    .appendField(labelParam)
                    .appendField(new Blockly.FieldTextInput(`p${i}`), `PNAME${i}`)
                    .appendField(":")
                    .appendField(new Blockly.FieldDropdown(PARAM_TYPE_OPTIONS), `PTYPE${i}`);
                this.moveInputBefore(`PARAM${i}`, "BODY");
                this.paramCount_ += 1;
            }
            while (this.paramCount_ > target) {
                this.paramCount_ -= 1;
                this.removeInput(`PARAM${this.paramCount_}`);
            }
        },
        customContextMenu(this: FuncDefBlock, options: Array<{ text: string; enabled: boolean; callback: () => void }>) {
            options.push({ text: addParam, enabled: true, callback: () => this.updateShape_(this.paramCount_ + 1) });
            if (this.paramCount_ > 0)
                options.push({ text: removeParam, enabled: true, callback: () => this.updateShape_(this.paramCount_ - 1) });
        },
    };
}

/** Read the current function list from the canvas `custom_func_def` blocks. */
function scanCustomFuncs(ws: Blockly.Workspace): CustomFuncSpec[] {
    const specs: CustomFuncSpec[] = [];
    for (const b of ws.getAllBlocks(false)) {
        if (b.type !== "custom_func_def") continue;
        const fb = b as unknown as FuncDefBlock;
        const id = funcIdOf(b.id);
        const name = (b.getFieldValue("NAME") as string)?.trim() || id;
        const retType = (b.getFieldValue("RET") as "i32" | "f64" | "void") ?? "void";
        const params: { name: string; type: "i32" | "f64" }[] = [];
        for (let i = 0; i < fb.paramCount_; i++) {
            const pn = (b.getFieldValue(`PNAME${i}`) as string)?.trim() || `p${i}`;
            const pt = (b.getFieldValue(`PTYPE${i}`) as "i32" | "f64") ?? "i32";
            params.push({ name: pn, type: pt });
        }
        specs.push({ id, name, retType, params });
    }
    return specs;
}

/** (Re)register the call block `custom_func_<id>` for a function spec. */
function registerCallBlock(spec: CustomFuncSpec) {
    const { id, name, retType, params } = spec;
    Blockly.Blocks[`custom_func_${id}`] = {
        init(this: Blockly.Block) {
            this.appendDummyInput().appendField(new Blockly.FieldLabel(`${name}(`), "FUNC_NAME");
            params.forEach((p, i) =>
                this.appendValueInput(`ARG${i}`).setCheck(p.type).appendField(`${p.name}:`)
            );
            this.appendDummyInput().appendField(")");
            if (retType !== "void") this.setOutput(true, retType);
            else { this.setPreviousStatement(true); this.setNextStatement(true); }
            this.setColour(290);
            this.setInputsInline(params.length <= 2);
            this.setTooltip((_langPack?.workspace.blocks.custom_func_call_tooltip ?? "call $0").replace("$0", name));
        },
    };
}

type WorkspaceState = Parameters<typeof Blockly.serialization.workspaces.load>[0];

/** Read func specs directly from a serialized workspace (top-level def blocks),
 *  so call blocks can be registered BEFORE the workspace is deserialized. */
function specsFromState(state: WorkspaceState): CustomFuncSpec[] {
    const specs: CustomFuncSpec[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const top = (state as any)?.blocks?.blocks;
    if (!Array.isArray(top)) return specs;
    for (const blk of top) {
        if (blk?.type !== "custom_func_def" || !blk.id) continue;
        const id = funcIdOf(String(blk.id));
        const count: number = blk.extraState?.paramCount ?? 0;
        const fields = blk.fields ?? {};
        const name = String(fields.NAME ?? "").trim() || id;
        const retType = (fields.RET ?? "void") as "i32" | "f64" | "void";
        const params: { name: string; type: "i32" | "f64" }[] = [];
        for (let i = 0; i < count; i++) {
            params.push({
                name: String(fields[`PNAME${i}`] ?? `p${i}`).trim() || `p${i}`,
                type: (fields[`PTYPE${i}`] ?? "i32") as "i32" | "f64",
            });
        }
        specs.push({ id, name, retType, params });
    }
    return specs;
}

/** Load a workspace, pre-registering the generic def block + every call block
 *  the state references so no block is dropped during deserialization. */
function loadWorkspaceState(ws: Blockly.Workspace, state: WorkspaceState) {
    registerFuncDefBlock();
    for (const spec of specsFromState(state)) registerCallBlock(spec);
    Blockly.serialization.workspaces.load(state, ws);
}

// Ensure the generic definition block type exists as soon as this module loads
// (the base toolbox references it).
registerFuncDefBlock();

/** Build custom function definition block → FuncDef */
function buildCustomFunc(
    defBlock: Blockly.Block,
    spec: CustomFuncSpec,
    mod: simulizer.ModuleDef,
): simulizer.FuncDef {
    const retType = retTypeMap[spec.retType] ?? simulizer.void_;
    const paramDefs = spec.params.map(
        p => new simulizer.ParamDef(new simulizer.Param(p.name, p.type === "i32" ? simulizer.i32 : simulizer.f64))
    );
    const func = new simulizer.FuncDef(`custom_func_${spec.id}`, paramDefs, retType);
    const ctx: CompileCtx = {
        func,
        locals: new Map(),
        funcRetType: retType,
        module: mod,
        nextArrayOffset: 0x8000,
        breakStack: [],
        blockToExpr,
        stmtBlockToExpr,
        coerce,
        stmtChainToExprs,
        getOrCreateLocal,
        declareLocal,
    };
    // Register parameters in locals (both read/write use local.get/set)
    spec.params.forEach(p => {
        const pType = p.type === "i32" ? simulizer.i32 : simulizer.f64;
        const local = new simulizer.Local(p.name, pType);
        ctx.locals.set(p.name, { local, def: null as unknown as simulizer.LocalDef });
    });
    const body = stmtChainToExprs(defBlock.getInputTargetBlock("BODY"), ctx);
    body.forEach(e => func.add_expr(e));
    return func;
}

/** Insert automatic conversion on type mismatch */
function coerce(expr: SimulizerExpr, target: simulizer.Type): SimulizerExpr {
    const src = expr.inferType();
    if (src.equals(target)) return expr;
    if (src.equals(simulizer.i32) && target.equals(simulizer.f64))
        return simulizer.f64ops.convert_i32_s(expr);
    if (src.equals(simulizer.f64) && target.equals(simulizer.i32))
        return simulizer.i32ops.trunc_f64_s(expr);
    return expr; // Conversion not possible → caught by WASM validation
}

/** Find or register a new variable in FuncDef (used by set/get — no duplicate tracking) */
function getOrCreateLocal(
    ctx: CompileCtx,
    name: string,
    type: simulizer.Type,
): simulizer.Local {
    const existing = ctx.locals.get(name);
    if (existing) return existing.local;
    const local = new simulizer.Local(name, type);
    const def   = ctx.func.add_local(local);
    ctx.locals.set(name, { local, def });
    return local;
}

/** Declare a variable (used by local_decl_* — always registers so duplicates are detected) */
function declareLocal(
    ctx: CompileCtx,
    name: string,
    type: simulizer.Type,
    blockId?: string,
): simulizer.Local {
    const existing = ctx.locals.get(name);
    if (existing) {
        const dupLocal = new simulizer.Local(name, type, blockId);
        ctx.func.add_local(dupLocal);
        return dupLocal;
    }
    const local = new simulizer.Local(name, type, blockId);
    const def   = ctx.func.add_local(local);
    ctx.locals.set(name, { local, def });
    return local;
}

/** Expression block → SimulizerExpr */
function blockToExpr(block: Blockly.Block | null, ctx: CompileCtx): SimulizerExpr | null {
    if (!block) return null;
    
    for (let def of Object.values(CUSTOM_BLOCKS)) {
        if (block.type === def.type && def.builderFn) {
            if (def.buildMode !== "expr") {
                console.warn(`Block ${block.type} is not an expression.`);
            }
            return def.builderFn(block, ctx);
        }
    }
    
    switch (block.type) {   



        // Array literal
        case "array_literal_i32":
            return compileArrayLiteralBlock(block, ctx, "i32");
        case "array_literal_f64":
            return compileArrayLiteralBlock(block, ctx, "f64");

        // Logical NOT
        case "i32_not": {
            const v = blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            return v ? simulizer.i32ops.eqz(coerce(v, simulizer.i32)) : null;
        }


        // Select
        case "i32_select":
        case "f64_select": {
            const cond = blockToExpr(block.getInputTargetBlock("COND"),    ctx);
            const onT    = blockToExpr(block.getInputTargetBlock("TRUE"),    ctx);
            const onF    = blockToExpr(block.getInputTargetBlock("FALSE"), ctx);
            if (!cond || !onT || !onF) return null;
            return new simulizer.Select(coerce(cond, simulizer.i32), onT, onF);
        }
        

        default: {
            // Custom function call (non-void → expr)
            if (block.type.startsWith("custom_func_")) {
                const id = block.type.slice("custom_func_".length);
                const spec = _customFuncSpecs.find(f => f.id === id);
                if (spec && spec.retType !== "void") {
                    const args = spec.params.map((p, i) => {
                        const e = blockToExpr(block.getInputTargetBlock(`ARG${i}`), ctx);
                        return e ? coerce(e, p.type === "i32" ? simulizer.i32 : simulizer.f64) : null;
                    }).filter((a): a is SimulizerExpr => a !== null);
                    return new simulizer.Call(`custom_func_${id}`, args, retTypeMap[spec.retType]);
                }
            }
            return null;
        }
    }
}

/** Single statement block → SimulizerExpr | null */
function stmtBlockToExpr(block: Blockly.Block, ctx: CompileCtx): SimulizerExpr | null {

    for (let def of Object.values(CUSTOM_BLOCKS)) {
        if (block.type === def.type && def.buildMode === "stmt") {
            return def.builderFn ? def.builderFn(block, ctx) : null;
        }
    }
    switch (block.type) {

        // Return
        case "wasm_return_i32":
        case "wasm_return_f64": {
            const val = blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            if (!val) return null;
            const targetType = ctx.funcRetType
                ?? (block.type === "wasm_return_i32" ? simulizer.i32 : simulizer.f64);
            return new simulizer.Return(coerce(val, targetType));
        }


        // Expression in statement position → wrap with Drop
        default: {
            // Custom void function call (statement position)
            if (block.type.startsWith("custom_func_")) {
                const id = block.type.slice("custom_func_".length);
                const spec = _customFuncSpecs.find(f => f.id === id);
                if (spec && spec.retType === "void") {
                    const args = spec.params.map((p, i) => {
                        const e = blockToExpr(block.getInputTargetBlock(`ARG${i}`), ctx);
                        return e ? coerce(e, p.type === "i32" ? simulizer.i32 : simulizer.f64) : null;
                    }).filter((a): a is SimulizerExpr => a !== null);
                    return new simulizer.Call(`custom_func_${id}`, args, simulizer.void_);
                }
            }
            const expr = blockToExpr(block, ctx);
            return expr ? new simulizer.Drop(expr) : null;
        }
    }
}

/** Entire statement chain → Expr[] */
function stmtChainToExprs(block: Blockly.Block | null, ctx: CompileCtx): SimulizerExpr[] {
    const exprs: SimulizerExpr[] = [];
    let cur: Blockly.Block | null = block;
    while (cur) {
        const e = stmtBlockToExpr(cur, ctx);
        if (e) exprs.push(e);
        cur = cur.getNextBlock();
    }
    return exprs;
}

function allPathsReturn(exprs: SimulizerExpr[]): boolean {
    if (exprs.length === 0) return false;
    const last = exprs[exprs.length - 1];
    if (last instanceof simulizer.Return) return true;
    if (last instanceof simulizer.Unreachable) return true;
    if (last instanceof simulizer.If) {
        return last.else_.length > 0 && allPathsReturn(last.then) && allPathsReturn(last.else_);
    }
    return false;
}

type BuildFuncError = { kind: "no_return" | "compile_fail"; message: string };

/** wasm_func_main → FuncDef | error */
function buildFuncDef(
    mainBlock: Blockly.Block,
): { func: simulizer.FuncDef; module: simulizer.ModuleDef } | BuildFuncError {
    const retTypeName = mainBlock.getFieldValue("RET_TYPE") as "i32" | "f64" | "void";
    const declaredRetType = retTypeMap[retTypeName] ?? simulizer.void_;

    const func = new simulizer.FuncDef("main", [], declaredRetType);
    func.export();

    // Create ModuleDef here and share in ctx
    const module = new simulizer.ModuleDef();

    // bd2/bd3 배열의 끝 주소를 기준으로 메모리 페이지 수 계산
    const maxBd2End = _bd2Arrays.reduce(
        (max, bd2) => Math.max(max, bd2.offset + bd2.count * BD2_ELEM_BYTES), 0,
    );
    const maxBd3End = _bd3Arrays.reduce(
        (max, bd3) => Math.max(max, bd3.offset + bd3.count * BD3_ELEM_BYTES), 0,
    );
    const maxEnd = Math.max(maxBd2End, maxBd3End);
    const pagesNeeded = maxEnd > 0 ? Math.ceil(maxEnd / 65536) + 1 : 1;
    module.set_memory(pagesNeeded);

    const bd2Map: Map<string, { offset: number; count: number }> = new Map(
        _bd2Arrays.map(bd2 => [bd2.name, { offset: bd2.offset, count: bd2.count }]),
    );
    const bd3Map: Map<string, { offset: number; count: number }> = new Map(
        _bd3Arrays.map(bd3 => [bd3.name, { offset: bd3.offset, count: bd3.count }]),
    );

    const ctx: CompileCtx = {
        func,
        locals:          new Map(),
        funcRetType:     declaredRetType,
        module,
        nextArrayOffset: 0x1000,
        bd2Arrays:       bd2Map,
        bd3Arrays:       bd3Map,
        breakStack:      [],
        blockToExpr,
        stmtBlockToExpr,
        coerce,
        stmtChainToExprs,
        getOrCreateLocal,
        declareLocal,
    };

    const body = stmtChainToExprs(mainBlock.getInputTargetBlock("BODY"), ctx);

    if (!declaredRetType.equals(simulizer.void_) && !allPathsReturn(body)) {
        return { kind: "no_return", message: _langPack?.workspace.infos.no_return ?? "Every path needs a return block." };
    }

    body.forEach((e) => func.add_expr(e));

    // If the last node in body is void (stmt) but return type is non-void,
    // insert unreachable to prevent WASM validation errors since stack is empty
    if (!declaredRetType.equals(simulizer.void_) && body.length > 0) {
        const lastType = body[body.length - 1].inferType();
        if (lastType.equals(simulizer.void_)) {
            func.add_expr(new simulizer.Unreachable());
        }
    }

    module.add_func(func); // Also register func in module

    return { func, module };
}

// Toolbox

function buildBaseToolboxXml(p: langpack): string {
    const tb = p.workspace.toolbox;
    return `<xml xmlns="https://developers.google.com/blockly/xml" id="toolbox">
    ${xmlDebugBlocks(tb.debug)}
    ${xmlBoolBlocks(tb.bool)}
    ${xmlI32Blocks(tb.int)}
    ${xmlF64Blocks(tb.float)}
    ${xmlLocalBlocks(tb.var, tb.float_const_btn)}
    ${xmlFlowBlocks(tb.flow)}
    ${xmlArrayBlocks(tb.array)}
    ${xmlTensorBlocks(tb.tensor)}
    ${xmlVectorBlocks(tb.vector)}
    ${xmlBoundaryBlocks(tb.boundary, tb.boundary_btn)}
    ${xmlUtilBlocks("LaTeX")}
    <category name="${tb.cast}" colour="${45}">
        <sep gap="16"></sep>
        <label text="Cast"></label>
        <block type="f64_from_i32"></block>
        <block type="i32_from_f64"></block>
    </category>
    <category name="${tb.func}" colour="${290}">
    <sep gap="16"></sep>
        <label text="Function"></label>
        <block type="wasm_func_main"></block>
        <block type="custom_func_def"></block>
        <block type="wasm_return_i32"></block>
        <block type="wasm_return_f64"></block>
    </category>
</xml>`;
}

function buildToolboxXml(funcs: CustomFuncSpec[], p: langpack): string {
    const base = buildBaseToolboxXml(p);
    if (funcs.length === 0) return base;
    // The generic definition block lives in the base toolbox; here we add one
    // call block per function currently defined on the canvas.
    const funcBlocks = funcs.map(f =>
        `<block type="custom_func_${f.id}"></block>`
    ).join("\n        ");
    return base.replace(
        `<block type="wasm_return_f64"></block>\n    </category>`,
        `<block type="wasm_return_f64"></block>\n        ${funcBlocks}\n    </category>`
    );
}

const INITIAL_WORKSPACE_XML = `
<xml xmlns="https://developers.google.com/blockly/xml">
    <block type="wasm_func_main" x="40" y="40">
        <field name="RET_TYPE">i32</field>
        <statement name="BODY">
            <block type="local_decl_i32">
                <field name="NAME">sum</field>
                <value name="INIT"><block type="i32_const"><field name="VALUE">0</field></block></value>
                <next>
                    <block type="local_decl_i32">
                        <field name="NAME">i</field>
                        <value name="INIT"><block type="i32_const"><field name="VALUE">1</field></block></value>
                        <next>
                            <block type="flow_while">
                                <value name="COND">
                                    <block type="i32_cmp">
                                        <field name="OP">le_s</field>
                                        <value name="LHS"><block type="local_get_i32"><field name="NAME">i</field></block></value>
                                        <value name="RHS"><block type="i32_const"><field name="VALUE">10</field></block></value>
                                    </block>
                                </value>
                                <statement name="BODY">
                                    <block type="local_set_i32">
                                        <field name="NAME">sum</field>
                                        <value name="VALUE">
                                            <block type="i32_binop">
                                                <field name="OP">add</field>
                                                <value name="LHS"><block type="local_get_i32"><field name="NAME">sum</field></block></value>
                                                <value name="RHS"><block type="local_get_i32"><field name="NAME">i</field></block></value>
                                            </block>
                                        </value>
                                        <next>
                                            <block type="local_set_i32">
                                                <field name="NAME">i</field>
                                                <value name="VALUE">
                                                    <block type="i32_binop">
                                                        <field name="OP">add</field>
                                                        <value name="LHS"><block type="local_get_i32"><field name="NAME">i</field></block></value>
                                                        <value name="RHS"><block type="i32_const"><field name="VALUE">1</field></block></value>
                                                    </block>
                                                </value>
                                            </block>
                                        </next>
                                    </block>
                                </statement>
                                <next>
                                    <block type="wasm_return_i32">
                                        <value name="VALUE">
                                            <block type="local_get_i32"><field name="NAME">sum</field></block>
                                        </value>
                                    </block>
                                </next>
                            </block>
                        </next>
                    </block>
                </next>
            </block>
        </statement>
    </block>
</xml>
`;


type RunState = "idle" | "compiling" | "running" | "done" | "error";

type TargetOs = "auto" | "windows" | "linux" | "macos";
const OS_LABEL: Record<TargetOs, string> = {
    auto: "Auto", windows: "Windows", linux: "Linux", macos: "macOS",
};
const OS_OPTIONS = ["auto", "windows", "linux", "macos"] as const;

interface InfoEntry {
    level: "info" | "warn" | "error";
    message: string;
    kind?: "no_main" | "duplicate_decl" | "compile_fail" | "no_return";
    blockId?: string;
}

type Props = {
    initialFile?: FileDetail;
    initialOwner?: boolean;
};

const BlockWorkspace: React.FC<Props> = ({ initialFile, initialOwner }) => {
    const blocklyDivRef = useRef<HTMLDivElement>(null);
    const workspaceRef  = useRef<Blockly.WorkspaceSvg | null>(null);
    const wasmWorkerRef = useRef<Worker | null>(null);
    // Clang worker drives the Asyncify (interactive-input) run path; created
    // lazily the first time a program with input blocks is run.
    const clangWorkerRef = useRef<Worker | null>(null);
    const [inputRequest, setInputRequest] = useState<{ kind: "i32" | "f64" } | null>(null);
    const [inputValue, setInputValue] = useState("");
    const router = useRouter();
    const searchParams = useSearchParams();
    const { theme } = useTheme();
    const isMobile = useIsMobile();

    const [runState, setRunState]           = useState<RunState>("idle");
    const [result, setResult]               = useState<string | null>(null);
    const [tfBackend, setTfBackend]         = useState<string>("initializing");
    const [lastRunBackend, setLastRunBackend] = useState<string | null>(null);
    const [lastRunDurationMs, setLastRunDurationMs] = useState<number | null>(null);
    const [watSource, setWatSource]         = useState<string>("");
    const [customFuncs, setCustomFuncs]     = useState<CustomFuncSpec[]>([]);
    const customFuncsRef                    = useRef<CustomFuncSpec[]>([]);

    const [bd2Arrays, setBd2Arrays]   = useState<Bd2ArrayEntry[]>([]);
    const bd2ArraysRef                = useRef<Bd2ArrayEntry[]>([]);
    const [newBd2Name, setNewBd2Name] = useState("boundary");
    const bd2FileInputRef             = useRef<HTMLInputElement>(null);

    const [bd3Arrays, setBd3Arrays]   = useState<Bd3ArrayEntry[]>([]);
    const bd3ArraysRef                = useRef<Bd3ArrayEntry[]>([]);
    const [newBd3Name, setNewBd3Name] = useState("boundary");
    const bd3FileInputRef             = useRef<HTMLInputElement>(null);

    const [showBdMgr, setShowBdMgr]   = useState(false);
    const [bdMgrTab,  setBdMgrTab]    = useState<"2d" | "3d">("2d");

    const [showConstMgr, setShowConstMgr] = useState(false);

    const [showLatexOcr, setShowLatexOcr] = useState(false);
    const [ocrLatex, setOcrLatex]         = useState("");
    const [ocrStreaming, setOcrStreaming] = useState(false);
    const [ocrImageUrl, setOcrImageUrl]   = useState<string | null>(null);
    const ocrFileInputRef                 = useRef<HTMLInputElement>(null);
    const ocrAbortRef                     = useRef<AbortController | null>(null);

    const [errorModal, setErrorModal] = useState<string | null>(null);
    const showErrorModal = useCallback((msg: string) => setErrorModal(msg), []);

    const [exportCppOpen, setExportCppOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportToast, setExportToast] = useState<{ message: string; href?: string } | null>(null);
    const exportToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (exportToastTimerRef.current) clearTimeout(exportToastTimerRef.current);
    }, []);

    const showExportToast = useCallback((message: string, href?: string) => {
        setExportToast({ message, href });
        if (exportToastTimerRef.current) clearTimeout(exportToastTimerRef.current);
        exportToastTimerRef.current = setTimeout(() => setExportToast(null), 6000);
    }, []);

    const [showChatPopover, setShowChatPopover] = useState(false);
    const chatPopoverRef                        = useRef<HTMLDivElement>(null);
    const [showToolsMenu, setShowToolsMenu]     = useState(false);
    const toolsMenuRef                          = useRef<HTMLDivElement>(null);
    const [canvasTab, setCanvasTab]             = useState<"blocks" | "wat" | "ai">("blocks");
    const [watLang, setWatLang]                 = useState<"wat" | "cpp" | "py" | "js">("wat");
    const [translatedSource, setTranslatedSource] = useState<string | null>(null);
    const [translating, setTranslating]         = useState(false);
    const [compiling, setCompiling]             = useState(false);
    const [compileProgress, setCompileProgress] = useState<{ status: "progress" | "done" | "error"; step: number; total: number; message: string } | null>(null);
    // Build target OS. "auto" defers to the backend's User-Agent sniffing.
    const [targetOs, setTargetOs]               = useState<TargetOs>("auto");
    const [osMenuOpen, setOsMenuOpen]           = useState(false);
    const [chatPrompt, setChatPrompt]           = useState("");
    const [chatOutput, setChatOutput]           = useState("");
    const [chatResult, setChatResult]           = useState<object | null>(null);
    const [chatStreaming, setChatStreaming]     = useState(false);
    const chatAbortRef                          = useRef<{ abort: () => void } | null>(null);
    const [chatDiffData, setChatDiffData]       = useState<{ tree: any[]; modeMap: Record<string, "insert" | "delete" | "common"> } | null>(null);
    const chatPrevStateRef                      = useRef<object | null>(null);
    const chatDiffDivRef                        = useRef<HTMLDivElement>(null);
    const chatDiffWsRef                         = useRef<Blockly.WorkspaceSvg | null>(null);
    const runStartedAtRef                      = useRef<number | null>(null);
    const multiSelectedRef                     = useRef<Set<string>>(new Set());

    const handleLatexOcr = useCallback(async (file: File) => {
        ocrAbortRef.current?.abort();
        const ctrl = new AbortController();
        ocrAbortRef.current = ctrl;

        const url = URL.createObjectURL(file);
        setOcrImageUrl(url);
        setOcrLatex("");
        setOcrStreaming(true);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`${API_BASE}/texocr`, { method: "POST", body: formData, signal: ctrl.signal });
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    if (line.startsWith("data:")) {
                        try {
                            const { content } = JSON.parse(line.slice(5).trim());
                            if (content) setOcrLatex(prev => prev + content);
                        } catch { /* ignore malformed chunk */ }
                    } else if (line.startsWith("event: done")) {
                        break;
                    }
                }
            }
        } catch (e: any) {
            if (e?.name !== "AbortError") setOcrLatex(prev => prev || pack.messages.error);
        } finally {
            setOcrStreaming(false);
        }
    }, []);

    useEffect(() => {
        if (!showLatexOcr) return;
        const handler = (e: ClipboardEvent) => {
            const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith("image/"));
            if (!item) return;
            e.preventDefault();
            e.stopPropagation();
            const file = item.getAsFile();
            if (file) handleLatexOcr(file);
        };
        window.addEventListener("paste", handler, true);
        return () => window.removeEventListener("paste", handler, true);
    }, [showLatexOcr, handleLatexOcr]);

    const handleLatexOcrApply = useCallback((latex: string) => {
        const ws = workspaceRef.current;
        if (!ws || !latex.trim()) return;

        const formulas: string[] = [];
        const parts = latex.split("$");
        for (let i = 1; i < parts.length; i += 2) {
            const f = parts[i].trim();
            if (f) formulas.push(f);
        }
        if (formulas.length === 0) {
            const clean = latex.trim();
            if (clean) formulas.push(clean);
        }

        const metrics = ws.getMetrics();
        const cx = metrics.viewLeft + metrics.viewWidth / 2 - 60;
        const cy = metrics.viewTop + metrics.viewHeight / 2 - 20;
        let lastBlock: Blockly.Block | null = null;

        formulas.forEach((formula, i) => {
            const block = ws.newBlock("latex_expr");
            block.setFieldValue(formula, "LATEX");
            block.initSvg();
            block.render();
            block.moveBy(cx, cy + i * 80);
            lastBlock = block;
        });

        if (lastBlock) ws.centerOnBlock((lastBlock as Blockly.Block).id);
        setShowLatexOcr(false);
    }, []);

    const handleAddConsts = useCallback((consts: BuiltinConst[]) => {
        const ws = workspaceRef.current;
        if (!ws || consts.length === 0) return;

        const buildBlock = (i: number): string => {
            const c = consts[i];
            const next = i + 1 < consts.length ? `<next>${buildBlock(i + 1)}</next>` : "";
            return `<block type="local_decl_f64"><field name="NAME">${c.name}</field><value name="INIT"><block type="f64_const"><field name="VALUE">${c.value}</field></block></value>${next}</block>`;
        };

        const metrics = ws.getMetrics();
        const x = Math.round(metrics.viewLeft + metrics.viewWidth / 2 - 80);
        const y = Math.round(metrics.viewTop + metrics.viewHeight / 2 - 20);

        const rootBlockXml = buildBlock(0).replace(
            `<block type="local_decl_f64">`,
            `<block type="local_decl_f64" x="${x}" y="${y}">`,
        );
        const xml = `<xml xmlns="https://developers.google.com/blockly/xml">${rootBlockXml}</xml>`;
        Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), ws);
        setShowConstMgr(false);
    }, []);

    const handleChat = useCallback(() => {
        const ws = workspaceRef.current;
        if (!ws || !chatPrompt.trim()) return;

        const blocklyJson = JSON.stringify(Blockly.serialization.workspaces.save(ws));

        chatPrevStateRef.current = Blockly.serialization.workspaces.save(ws);
        setChatDiffData(null);

        chatAbortRef.current?.abort();

        const ctrl = new AbortController();
        chatAbortRef.current = { abort: () => ctrl.abort() };

        setChatOutput("");
        setChatResult(null);
        setChatStreaming(true);
        let firstChunk = true;

        fetchEventSource(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: chatPrompt.trim(), blockjson: blocklyJson }),
            signal: ctrl.signal,
            onmessage(e) {
                if (e.event === "done") {
                    ctrl.abort();
                    setChatStreaming(false);
                    return;
                }
                try {
                    const parsed = JSON.parse(e.data);
                    if (typeof parsed.content === "string") {
                        if (firstChunk) {
                            firstChunk = false;
                            setCanvasTab("ai");
                            setShowChatPopover(false);
                        }
                        setChatOutput(prev => prev + parsed.content);
                    } else if (parsed.result !== undefined) {
                        setChatResult(parsed.result);
                        setChatOutput(prev => prev + "\n\n```json\n" + JSON.stringify(parsed.result, null, 2) + "\n```");
                        const prevState = chatPrevStateRef.current;
                        if (prevState) {
                            try {
                                const prevBlocks = (prevState as any).blocks?.blocks?.[0];
                                const newBlocks = (parsed.result as any).blocks?.blocks?.[0];
                                if (prevBlocks && newBlocks) {
                                    const ctx = new NormalizeContext();
                                    const n1 = normalize(prevBlocks, ctx);
                                    const ws = workspaceRef.current;
                                    const sanitized = ws ? sanitizeBlocksJson(newBlocks, ws) : newBlocks;
                                    const n2 = normalize(sanitized, ctx);
                                    loadTreeDiff().then(td => {
                                        const diffResult = td.treeDiff(n1, n2);
                                        const diffTree = generateDiffTree(n1, n2, diffResult);
                                        const { tree, modeMap } = unnormalize(diffTree, ctx);
                                        if (tree) setChatDiffData({ tree, modeMap });
                                    }).catch(console.error);
                                }
                            } catch (err) {
                                console.error("Diff computation failed:", err);
                            }
                        }
                    }
                } catch {
                    // JSON이 아닌 데이터는 무시
                }
            },
            onerror(err) {
                if ((err as Error)?.name !== "AbortError") {
                    setChatOutput(prev => prev + "\n\n" + pack.workspace.ai.error_prefix.replace("$0", err instanceof Error ? err.message : String(err)));
                }
                setChatStreaming(false);
                throw err; // fetchEventSource 재시도 방지
            },
            onclose() {
                setChatStreaming(false);
            },
        });
    }, [chatPrompt]);

    const [showBlocks, setShowBlocks] = useState(false);
    const [blockData, setBlockData]   = useState<string>("");
    const [blockMode, setBlockMode]   = useState<"export" | "share">("export");
    const [lang, , pack, langReady]   = useLanguagePack();

    const [fileId, setFileId]       = useState<string | null>(null);
    const [fileName, setFileName]   = useState<string>("");
    const [fileMeta, setFileMeta]   = useState<FileOut | null>(null);
    const [isOwner, setIsOwner]     = useState<boolean | null>(null);
    const isOwnerRef                = useRef<boolean>(false);
    const [duplicating, setDuplicating] = useState(false);
    const [fileError, setFileError] = useState<"not_found" | "forbidden" | null>(null);
    const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
    const wsReadyRef                = useRef(false);
    const pendingContentRef         = useRef<string | null>(null);
    const fileLoadCompletedRef      = useRef(false);
    const fileIdRef                 = useRef<string | null>(null);
    const autoSaveTimerRef          = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleConfirmExportToCpp = useCallback(async () => {
        const ws = workspaceRef.current;
        if (!ws || exporting) return;
        setExporting(true);
        try {
            const rawSave = Blockly.serialization.workspaces.save(ws);
            const processedSave = replaceLatexBlocksInWorkspace(rawSave);
            const blocklyJson = JSON.stringify(processedSave);

            const res = await fetch(`${API_BASE}/compile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lang: "cpp", code: blocklyJson }),
            });
            if (!res.ok) throw new Error(`compile failed: ${res.status}`);
            const data = await res.json();
            const cppSource: string = data.result ?? "";
            if (!cppSource) throw new Error("empty compile result");

            const baseName = fileName ? `${fileName} (C++)` : "untitled (C++)";
            let candidate = baseName;
            let counter = 2;
            let created: { id: string } | null = null;
            // clangfiles are JSON bundles now — wrap the generated source as
            // a single-file bundle whose `main.cpp` is the entry.
            const wrappedBundle: CppBundle = {
                ...makeDefaultBundle(),
                tree: [{ type: "file", name: "main.cpp", content: cppSource }],
            };
            const wrapped = serializeBundle(wrappedBundle);
            for (;;) {
                try {
                    created = await createFile(candidate, "clangfile", wrapped);
                    break;
                } catch (err: any) {
                    if (err?.status === 409) {
                        candidate = `${baseName} ${counter++}`;
                        if (counter > 50) throw err;
                        continue;
                    }
                    throw err;
                }
            }
            setExportCppOpen(false);
            const href = `/workspace?file=${created!.id}`;
            showExportToast(pack.workspace.logs.export_created.replace("$0", candidate), href);
        } catch (err) {
            showExportToast(pack.workspace.logs.export_failed.replace("$0", err instanceof Error ? err.message : String(err)));
        } finally {
            setExporting(false);
        }
    }, [exporting, fileName, showExportToast]);

    const { logAreaRef, addLog, addBar, setBar, clearLog, addSeries, logToHolder, visualToHolder, addGraphArray, graphToHolder } = useConsolePanel();
    const pendingRunRef = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null);
    const pendingBackendSwitchRef = useRef<{ previous: string } | null>(null);
    const tfBackendRef = useRef(tfBackend);
    const workerBindingsRef = useRef({
        addLog,
        addBar,
        setBar,
        addSeries,
        logToHolder,
        visualToHolder,
        addGraphArray,
        graphToHolder,
        pack,
    });

    useEffect(() => {
        tfBackendRef.current = tfBackend;
    }, [tfBackend]);

    useEffect(() => {
        workerBindingsRef.current = {
            addLog,
            addBar,
            setBar,
            addSeries,
            logToHolder,
            visualToHolder,
            addGraphArray,
            graphToHolder,
            pack,
        };
    }, [addLog, addBar, setBar, addSeries, logToHolder, visualToHolder, addGraphArray, graphToHolder, pack]);

    const handleWorkerMessage = useCallback((e: MessageEvent<WorkerOutMsg>) => {
        const msg = e.data;
        const {
            addLog: currentAddLog,
            addBar: currentAddBar,
            setBar: currentSetBar,
            addSeries: currentAddSeries,
            logToHolder: currentLogToHolder,
            visualToHolder: currentVisualToHolder,
            addGraphArray: currentAddGraphArray,
            graphToHolder: currentGraphToHolder,
            pack: currentPack,
        } = workerBindingsRef.current;

        if (msg.type === "ready") return;

        if (msg.type === "input-request") {
            // Clang (Asyncify) run suspended on sim_input_*; surface the inline
            // input prompt in the console tab.
            setRightTab("console");
            setInputRequest({ kind: msg.kind });
            return;
        }

        if (msg.type === "backend-switched") {
            pendingBackendSwitchRef.current = null;
            setTfBackend(msg.backend);
            return;
        }

        if (msg.type === "holder_create") {
            if (msg.kind === "series") currentAddSeries(msg.holderId);
            return;
        }

        if (msg.type === "log") {
            currentLogToHolder(msg.holderId, msg.kind, msg.text);
            return;
        }

        if (msg.type === "bar_create") {
            currentAddBar(msg.min, msg.max, msg.barId);
            return;
        }

        if (msg.type === "bar_set") {
            currentSetBar(msg.barId, msg.val);
            return;
        }

        if (msg.type === "visual_vec") {
            const imageUrl = vec_field_to_image_url(new Float32Array(msg.dx), new Float32Array(msg.dy), msg.rows, msg.cols);
            currentVisualToHolder(msg.holderId, imageUrl, msg.rows, msg.cols);
            return;
        }

        if (msg.type === "visual") {
            const imageUrl = mat_data_to_image_url(new Float32Array(msg.data), msg.rows, msg.cols);
            currentVisualToHolder(msg.holderId, imageUrl, msg.rows, msg.cols);
            return;
        }

        if (msg.type === "graph_array") {
            currentGraphToHolder(msg.holderId, msg.data, msg.fixedMin, msg.fixedMax);
            return;
        }

        if (msg.type === "result") {
            setResult(msg.value);
            currentAddLog("success", (_langPack?.workspace.logs.result_value ?? "🎉 Result: $0").replace("$0", String(msg.value)));
            return;
        }

        if (msg.type === "done") {
            if (runStartedAtRef.current !== null) {
                setLastRunDurationMs(performance.now() - runStartedAtRef.current);
                runStartedAtRef.current = null;
            }
            setRunState("done");
            pendingRunRef.current?.resolve();
            pendingRunRef.current = null;
            return;
        }

        if (msg.type === "error") {
            if (pendingBackendSwitchRef.current) {
                setTfBackend(pendingBackendSwitchRef.current.previous);
                pendingBackendSwitchRef.current = null;
                currentAddLog("error", currentPack.workspace.logs.error_prefix.replace("$0", msg.message));
                return;
            }

            if (pendingRunRef.current) {
                if (runStartedAtRef.current !== null) {
                    setLastRunDurationMs(performance.now() - runStartedAtRef.current);
                    runStartedAtRef.current = null;
                }
                pendingRunRef.current.reject(new Error(msg.message));
                pendingRunRef.current = null;
                return;
            }

            currentAddLog("error", currentPack.workspace.logs.error_prefix.replace("$0", msg.message));
        }
    }, []);

    const handleWorkerError = useCallback((e: ErrorEvent) => {
        const { addLog: currentAddLog, pack: currentPack } = workerBindingsRef.current;

        if (pendingRunRef.current) {
            pendingRunRef.current.reject(new Error(e.message));
            pendingRunRef.current = null;
            return;
        }

        currentAddLog("error", currentPack.workspace.logs.worker_error.replace("$0", e.message));
    }, []);

    const createWasmWorker = useCallback(() => {
        const worker = new Worker(
            new URL("@/utils/wasm/wasm-worker.ts", import.meta.url),
            { type: "module" }
        );
        worker.addEventListener("message", handleWorkerMessage);
        worker.addEventListener("error", handleWorkerError);
        worker.postMessage({ type: "init" });
        wasmWorkerRef.current = worker;
        return worker;
    }, [handleWorkerMessage, handleWorkerError]);


    // Create WASM Worker (once on app mount, then reused)
    useEffect(() => {
        const worker = createWasmWorker();
        return () => {
            worker.terminate();
            pendingRunRef.current = null;
            pendingBackendSwitchRef.current = null;
            if (wasmWorkerRef.current === worker) {
                wasmWorkerRef.current = null;
            }
        };
    }, [createWasmWorker]);

    // Clang worker (interactive-input run path) — created on demand, reused.
    const getClangWorker = useCallback(() => {
        if (clangWorkerRef.current) return clangWorkerRef.current;
        const worker = new Worker(
            new URL("@/utils/wasm/clang-worker.ts", import.meta.url),
            { type: "module" }
        );
        worker.addEventListener("message", handleWorkerMessage);
        worker.addEventListener("error", handleWorkerError);
        clangWorkerRef.current = worker;
        return worker;
    }, [handleWorkerMessage, handleWorkerError]);

    useEffect(() => () => {
        clangWorkerRef.current?.terminate();
        clangWorkerRef.current = null;
    }, []);

    const handleSwitchBackend = useCallback((backend: string) => {
        const worker = wasmWorkerRef.current;
        if (!worker) return;
        pendingBackendSwitchRef.current = { previous: tfBackendRef.current };
        setTfBackend("initializing");
        worker.postMessage({ type: "switch-backend", backend });
    }, []);

    useEffect(() => { fileIdRef.current = fileId; }, [fileId]);

    // Initialize Blockly
    useEffect(() => {
        if (isOwner === null) return;
        _langPack = pack;
        registerDynamicTensorBlocks(pack);
        registerDynamicArrayBlocks(pack);
        registerFoldRegionBlock(pack);
        registerFuncDefBlock();
        buildCustomBlockDefs(pack).forEach((def) => {
            const d = def as { type: string };
            if (!Blockly.Blocks[d.type]) {
                Blockly.Blocks[d.type] = {
                    init(this: Blockly.Block) { this.jsonInit(def); },
                };
            }
        });

        if (!blocklyDivRef.current) return;

        const cs = getComputedStyle(document.documentElement);
        const cssVar = (v: string) => cs.getPropertyValue(v).trim();

        const ws = Blockly.inject(blocklyDivRef.current, {
            toolbox:  isOwner && !isMobile ? buildBaseToolboxXml(pack) : undefined,
            grid:     { spacing: 20, length: 3, colour: cssVar("--grid-dot"), snap: true },
            zoom:     { controls: true, wheel: true, startScale: isMobile ? 0.7 : 0.9 },
            trashcan: isOwner && !isMobile,
            theme:    buildSimulizerTheme("simphy"),
            renderer: "zelos",
            readOnly: !isOwner || isMobile,
            move:     { scrollbars: true, drag: true, wheel: true },
        });

        workspaceRef.current = ws;
        if (!isMobile) {
            ws.registerButtonCallback("OPEN_BD_MGR",     () => { setBdMgrTab("2d"); setShowBdMgr(true); });
            ws.registerButtonCallback("OPEN_CONST_MGR",  () => setShowConstMgr(true));
            ws.registerButtonCallback("OPEN_LATEX_OCR",  () => { setOcrLatex(""); setOcrImageUrl(null); setShowLatexOcr(true); });
        }
        
        const refreshInfo = () => {
            const mainBlock = ws.getAllBlocks(false).find(b => b.type === "wasm_func_main");
            if (!mainBlock) {
                setInfos([{ level: "error", kind: "no_main", message: pack.workspace.infos.no_main }]);
                return;
            }
            const result = buildFuncDef(mainBlock);
            if ("kind" in result) {
                setInfos([{ level: "error", kind: result.kind, message: result.message }]);
                return;
            }
            const { declarations } = result.func.getLocalTypes();
            const entries: InfoEntry[] = [];
            for (const [name, bucket] of declarations) {
                if (bucket.length > 1) {
                    entries.push({
                        level: "error",
                        kind: "duplicate_decl",
                        message: pack.workspace.infos.var_redeclared.replace("$0", name).replace("$1", String(bucket.length)),
                        blockId: bucket[1].blockId,
                    });
                }
            }
            setInfos(entries);
        };
        const handleBlockChange = (event: Blockly.Events.Abstract) => {
            if (event.isUiEvent) return;

            // The canvas is the source of truth for custom functions: re-derive
            // the list, (re)register each call block, and sync the (possibly
            // renamed) function name onto existing call blocks. Field writes are
            // wrapped so they don't re-trigger this listener.
            const specs = scanCustomFuncs(ws);
            Blockly.Events.disable();
            try {
                for (const spec of specs) {
                    registerCallBlock(spec);
                    for (const cb of ws.getBlocksByType(`custom_func_${spec.id}`, false)) {
                        cb.getField("FUNC_NAME")?.setValue(`${spec.name}(`);
                    }
                }
            } finally {
                Blockly.Events.enable();
            }
            if (JSON.stringify(specs) !== JSON.stringify(customFuncsRef.current)) {
                customFuncsRef.current = specs;
                setCustomFuncs(specs);
            }

            refreshInfo();
            if (!isOwnerRef.current) return;
            setSaveStatus("unsaved");
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = setTimeout(async () => {
                const id = fileIdRef.current;
                if (!id) return;
                const content = JSON.stringify(Blockly.serialization.workspaces.save(ws));
                setBlockData(content);
                setSaveStatus("saving");
                try {
                    await saveFile(id, content);
                    setSaveStatus("saved");
                    generateThumbnailBlob(ws).then(blob => { if (blob) uploadThumbnail(id, blob).catch(() => {}); });
                } catch {
                    setSaveStatus("error");
                }
            }, 2000);
        };
        ws.addChangeListener(handleBlockChange);

        const flyout = ws.getFlyout();
        if (flyout) {
            (flyout as any).getFlyoutScale = () => 0.75;
        }
        const keepFlyoutScale = (e: Blockly.Events.Abstract) => {
            if (e.type !== Blockly.Events.VIEWPORT_CHANGE) return;
            const fl = ws.getFlyout();
            if (!fl) return;
            const flyoutWs = fl.getWorkspace() as Blockly.WorkspaceSvg | null;
            if (flyoutWs && flyoutWs.scale !== 1) flyoutWs.setScale(1);
            (fl as any).reflow?.();
        };
        ws.addChangeListener(keepFlyoutScale);

        // ── Multi-select: Shift+click (toggle) + Shift/RightButton-drag (rubber-band) ──
        const clearMultiSelect = () => {
            for (const id of multiSelectedRef.current) {
                const blk = ws.getBlockById(id) as Blockly.BlockSvg | null;
                if (blk) blk.removeSelect();
            }
            multiSelectedRef.current.clear();
        };

        const addToMultiSelect = (block: Blockly.BlockSvg) => {
            block.addSelect();
            multiSelectedRef.current.add(block.id);
        };

        const removeFromMultiSelect = (block: Blockly.BlockSvg) => {
            block.removeSelect();
            multiSelectedRef.current.delete(block.id);
        };

        const blockAtPointer = (e: PointerEvent): Blockly.BlockSvg | null => {
            const el = (e.target as Element).closest(".blocklyDraggable");
            if (!el) return null;
            return (ws.getAllBlocks(false).find(
                b => (b as Blockly.BlockSvg).getSvgRoot() === el
            ) as Blockly.BlockSvg | null) ?? null;
        };

        const wsSvg = ws.getParentSvg();

        const onMultiDown = (e: PointerEvent) => {
            const targetEl = e.target as Element;
            if (targetEl.closest(".blocklyFlyout") ||
                targetEl.closest(".blocklyScrollbar") ||
                targetEl.closest(".blocklyZoom") ||
                targetEl.closest(".blocklyTrash")) return;

            const isRightDrag = e.button === 2;

            if (!e.shiftKey && !isRightDrag) {
                clearMultiSelect();
                return;
            }

            const draggable = targetEl.closest(".blocklyDraggable");
            if (draggable) {
                // 우클릭이 블록 위에서 시작되면 Blockly 컨텍스트 메뉴를 그대로 둠
                if (isRightDrag) return;
                // Shift + 블록 클릭: 토글
                e.preventDefault();
                e.stopPropagation();
                const block = blockAtPointer(e);
                if (!block) return;
                if (multiSelectedRef.current.has(block.id)) {
                    removeFromMultiSelect(block);
                } else {
                    addToMultiSelect(block);
                }
                return;
            }

            // 빈 공간에서 Shift 또는 우클릭 드래그: 러버밴드
            // 우클릭은 OS/Blockly 컨텍스트 메뉴를 pointerdown 시점부터 차단하고,
            // 이동거리가 없으면 pointerup에서 직접 Blockly 메뉴를 띄운다.
            e.preventDefault();
            e.stopPropagation();
            wsSvg.setPointerCapture(e.pointerId);

            const svgRect = wsSvg.getBoundingClientRect();
            const sx = e.clientX - svgRect.left;
            const sy = e.clientY - svgRect.top;

            const band = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            band.style.cssText = "fill:rgba(99,102,241,0.08);stroke:rgba(99,102,241,0.7);stroke-width:1px;stroke-dasharray:4 2;pointer-events:none;";
            band.setAttribute("x", String(sx));
            band.setAttribute("y", String(sy));
            band.setAttribute("width", "0");
            band.setAttribute("height", "0");
            wsSvg.appendChild(band);

            let dragged = false;

            // 우클릭 제스처 동안 네이티브 컨텍스트 메뉴는 항상 차단
            const onContextMenu = (ce: Event) => {
                ce.preventDefault();
                ce.stopPropagation();
            };
            if (isRightDrag) {
                wsSvg.addEventListener("contextmenu", onContextMenu, { capture: true });
            }

            const onBandMove = (me: PointerEvent) => {
                const cx = me.clientX - svgRect.left;
                const cy = me.clientY - svgRect.top;
                if (!dragged && (Math.abs(cx - sx) > 4 || Math.abs(cy - sy) > 4)) dragged = true;
                band.setAttribute("x", String(Math.min(cx, sx)));
                band.setAttribute("y", String(Math.min(cy, sy)));
                band.setAttribute("width", String(Math.abs(cx - sx)));
                band.setAttribute("height", String(Math.abs(cy - sy)));
            };

            const onBandUp = (ue: PointerEvent) => {
                wsSvg.removeEventListener("pointermove", onBandMove, { capture: true });
                wsSvg.removeEventListener("pointerup", onBandUp, { capture: true });
                band.remove();

                // pointerup 직후에도 contextmenu가 한 번 더 발사될 수 있어 다음 틱까지 유지
                if (isRightDrag) {
                    setTimeout(() => {
                        wsSvg.removeEventListener("contextmenu", onContextMenu, { capture: true });
                    }, 0);
                }

                const ex = ue.clientX - svgRect.left;
                const ey = ue.clientY - svgRect.top;

                if (!dragged) {
                    // 단순 우클릭: Blockly 워크스페이스 컨텍스트 메뉴를 직접 표시
                    if (isRightDrag) {
                        try { (ws as any).showContextMenu?.(ue); } catch {}
                    }
                    return;
                }

                if (Math.abs(ex - sx) < 4 && Math.abs(ey - sy) < 4) return;

                const wsA = Blockly.utils.svgMath.screenToWsCoordinates(
                    ws, new Blockly.utils.Coordinate(e.clientX, e.clientY)
                );
                const wsB = Blockly.utils.svgMath.screenToWsCoordinates(
                    ws, new Blockly.utils.Coordinate(ue.clientX, ue.clientY)
                );
                const selL = Math.min(wsA.x, wsB.x), selR = Math.max(wsA.x, wsB.x);
                const selT = Math.min(wsA.y, wsB.y), selB = Math.max(wsA.y, wsB.y);

                clearMultiSelect();
                for (const block of ws.getAllBlocks(false)) {
                    const r = (block as Blockly.BlockSvg).getBoundingRectangleWithoutChildren();
                    if (r.right > selL && r.left < selR && r.bottom > selT && r.top < selB) {
                        addToMultiSelect(block as Blockly.BlockSvg);
                    }
                }
            };

            wsSvg.addEventListener("pointermove", onBandMove, { capture: true });
            wsSvg.addEventListener("pointerup", onBandUp, { capture: true });
        };

        wsSvg.addEventListener("pointerdown", onMultiDown, { capture: true });

        const onBlockDelete = (event: Blockly.Events.Abstract) => {
            if (event.type !== "block_delete") return;
            for (const id of [...multiSelectedRef.current]) {
                if (!ws.getBlockById(id)) multiSelectedRef.current.delete(id);
            }
        };
        ws.addChangeListener(onBlockDelete);

        const onMultiKeyDown = (e: KeyboardEvent) => {
            if (multiSelectedRef.current.size === 0) return;
            if (e.key !== "Delete" && e.key !== "Backspace") return;
            const target = e.target as HTMLElement;
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
            e.preventDefault();
            e.stopPropagation();
            Blockly.Events.setGroup(true);
            for (const id of [...multiSelectedRef.current]) {
                const blk = ws.getBlockById(id) as Blockly.BlockSvg | null;
                if (blk) blk.dispose(false);
            }
            Blockly.Events.setGroup(false);
            multiSelectedRef.current.clear();
        };
        document.addEventListener("keydown", onMultiKeyDown, { capture: true });

        wsReadyRef.current = true;
        if (fileLoadCompletedRef.current) {
            if (pendingContentRef.current) {
                try {
                    const state = JSON.parse(pendingContentRef.current);
                    loadWorkspaceState(ws, state);
                } catch {
                    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(INITIAL_WORKSPACE_XML), ws);
                }
                pendingContentRef.current = null;
            } else {
                Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(INITIAL_WORKSPACE_XML), ws);
            }
        }

        const slimToolboxBars = () => {
            blocklyDivRef.current?.querySelectorAll<HTMLElement>(".blocklyToolboxCategory").forEach(el => {
                const styleAttr = el.getAttribute("style") ?? "";
                const match = styleAttr.match(/border-left:\s*\S+\s+\S+\s+([^;]+)/);
                const color = match?.[1]?.trim();
                if (color) {
                    el.style.removeProperty("border-left");
                    const icon = el.querySelector<HTMLElement>(".blocklyToolboxCategoryIcon");
                    if (icon) icon.style.backgroundColor = color;
                }
            });
        };
        setTimeout(slimToolboxBars, 200);
        const barObserver = new MutationObserver(slimToolboxBars);
        barObserver.observe(blocklyDivRef.current, {
            childList: true, subtree: true,
            attributes: true, attributeFilter: ["style"],
        });

        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            ws.removeChangeListener(handleBlockChange);
            ws.removeChangeListener(onBlockDelete);
            wsSvg.removeEventListener("pointerdown", onMultiDown, { capture: true });
            document.removeEventListener("keydown", onMultiKeyDown, { capture: true });
            multiSelectedRef.current.clear();
            barObserver.disconnect();
            // Preserve workspace content across re-inject (e.g. viewport crossing 768px breakpoint)
            if (fileLoadCompletedRef.current && ws.getAllBlocks(false).length > 0) {
                try {
                    const snapshot = Blockly.serialization.workspaces.save(ws);
                    pendingContentRef.current = JSON.stringify(snapshot);
                } catch {
                    // ignore; fall back to INITIAL_WORKSPACE_XML on next inject
                }
            }
            ws.dispose();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOwner, isMobile]);

    // Re-apply Blockly theme when data-theme attribute changes (dark/light mode toggle)
    useEffect(() => {
        const observer = new MutationObserver(() => {
            workspaceRef.current?.setTheme(buildSimulizerTheme("simulizer"));
            chatDiffWsRef.current?.setTheme(buildSimulizerTheme("simulizer_diff"));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    // Re-register block text and reload workspace when language changes
    useEffect(() => {
        const ws = workspaceRef.current;
        if (!ws || !langReady) return;
        // Skip until the requested language and fetched pack match.
        if (lang && pack.meta.langc !== lang) return;
        _langPack = pack;
        const defs = buildCustomBlockDefs(pack);
        defs.forEach(def => {
            Blockly.Blocks[(def as { type: string }).type] = {
                init(this: Blockly.Block) { this.jsonInit(def); },
            };
        });
        // Restore dynamic blocks that were overwritten above
        registerDynamicTensorBlocks(pack);
        registerDynamicArrayBlocks(pack);
        registerFoldRegionBlock(pack);
        registerFuncDefBlock();
        const savedState = Blockly.serialization.workspaces.save(ws);
        ws.clear();
        loadWorkspaceState(ws, savedState);
        if (ws.getToolbox()) ws.updateToolbox(buildToolboxXml(customFuncs, pack));
    }, [lang, pack]);

    // Update toolbox when custom functions change
    useEffect(() => {
        const ws = workspaceRef.current;
        if (!ws) return;
        if (!ws.getToolbox()) return;
        ws.updateToolbox(buildToolboxXml(customFuncs, pack));
    }, [customFuncs]);

    // Dismiss AI popover on outside click
    useEffect(() => {
        if (!showChatPopover) return;
        const handler = (e: MouseEvent) => {
            if (chatPopoverRef.current && !chatPopoverRef.current.contains(e.target as Node)) {
                setShowChatPopover(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showChatPopover]);

    // Dismiss tools menu on outside click
    useEffect(() => {
        if (!showToolsMenu) return;
        const handler = (e: MouseEvent) => {
            if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
                setShowToolsMenu(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showToolsMenu]);

    // Clear Blockly selection when clicking outside the workspace pane.
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node | null;
            const workspaceHost = blocklyDivRef.current;
            const ws = workspaceRef.current;
            if (!target || !workspaceHost) return;
            if (workspaceHost.contains(target)) return;

            const focusManager = (Blockly as any).getFocusManager?.();
            if (ws && focusManager?.focusNode) {
                focusManager.focusNode(ws);
                return;
            }

            const selected = (Blockly.common as any).getSelected?.();
            if (selected?.unselect) {
                selected.unselect();
            }
        };

        document.addEventListener("pointerdown", handler, true);
        return () => document.removeEventListener("pointerdown", handler, true);
    }, []);

    // Diff Blockly workspace lifecycle
    useEffect(() => {
        if (canvasTab !== "ai") {
            if (chatDiffWsRef.current) {
                chatDiffWsRef.current.dispose();
                chatDiffWsRef.current = null;
            }
            return;
        }
        if (!chatDiffData || !chatDiffDivRef.current) return;

        if (chatDiffWsRef.current) {
            chatDiffWsRef.current.dispose();
            chatDiffWsRef.current = null;
        }

        const diffWs = Blockly.inject(chatDiffDivRef.current, {
            zoom:     { controls: true, wheel: true, startScale: 0.7 },
            renderer: "zelos",
            theme:    buildSimulizerTheme("simphy_diff"),
        });
        chatDiffWsRef.current = diffWs;

        const { tree, modeMap } = chatDiffData;
        tree.forEach((blk: any, i: number) => { blk.x = 40; blk.y = 40 + i * 400; });

        // Register dynamic blocks before loading to ensure block definitions exist
        registerDynamicTensorBlocks(pack);
        registerDynamicArrayBlocks(pack);

        try {
            loadWorkspaceState(diffWs, { blocks: { languageVersion: 0, blocks: tree } });
        } catch (e) {
            console.error("Failed to load diff tree:", e);
            return;
        }

        const cs = getComputedStyle(document.documentElement);
        const successHex = cssColorToHex(cs.getPropertyValue("--add-block-color").trim());
        const dangerHex  = cssColorToHex(cs.getPropertyValue("--delete-block-color").trim());
        const grayHex = cssColorToHex(cs.getPropertyValue("--nochange-block-color").trim());

        for (const block of diffWs.getAllBlocks(false)) {
            const mode = modeMap[block.id];
            if (!mode) continue;
            if (mode === "insert") block.setColour(successHex);
            else if (mode === "delete") block.setColour(dangerHex);
            else block.setColour(grayHex);
        }

        diffWs.scrollCenter();
    }, [chatDiffData, canvasTab]);

    useEffect(() => {
        if (canvasTab !== "wat") return;
        clearLog();
        generateWat();
    // generateWat을 dep에 넣으면 무한루프 — canvasTab 전환 시 1회만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasTab]);

    useEffect(() => {
        if (canvasTab !== "wat" || watLang === "wat") {
            setTranslatedSource(null);
            return;
        }
        const ws = workspaceRef.current;
        if (!ws) return;
        const rawSave = Blockly.serialization.workspaces.save(ws);
        const processedSave = replaceLatexBlocksInWorkspace(rawSave);
        const blocklyJson = JSON.stringify(processedSave);
        setTranslating(true);
        fetch(`${API_BASE}/compile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lang: watLang, code: blocklyJson }),
        })
            .then(r => r.json())
            .then(data => setTranslatedSource(data.result ?? null))
            .catch(() => setTranslatedSource(null))
            .finally(() => setTranslating(false));
    }, [canvasTab, watLang, watSource]);

    // Compile and run
    const generateWat = useCallback(async (): Promise<{ wat: string; mod: simulizer.ModuleDef } | null> => {
        const ws = workspaceRef.current;
        if (!ws) return null;

        // Function list is derived from the canvas definition blocks.
        const funcSpecs = scanCustomFuncs(ws);
        _customFuncSpecs = funcSpecs;
        _bd2Arrays = bd2ArraysRef.current;
        _bd3Arrays = bd3ArraysRef.current;

        const mainBlock = ws.getAllBlocks(false).find((b) => b.type === "wasm_func_main");
        if (!mainBlock) {
            addLog("error", pack.workspace.logs.main_block_not_found);
            return null;
        }

        addLog("info", pack.workspace.compile.block_to_ast);
        const funcOrErr = buildFuncDef(mainBlock);
        if ("kind" in funcOrErr) {
            addLog("error", funcOrErr.message); return null;
        }
        const { func, module: mod } = funcOrErr;

        addLog("info",
            pack.workspace.logs.ast_complete
                .replace("$0", func.ret_type.name)
                .replace("$1", String(func.locals.length))
                .replace("$2", String(func.body.length))
        );

        for (const spec of funcSpecs) {
            const defBlock = ws.getAllBlocks(false).find(b => b.type === "custom_func_def" && funcIdOf(b.id) === spec.id);
            if (!defBlock) { addLog("error", pack.workspace.logs.func_block_not_found.replace("$0", spec.name)); continue; }
            const customFunc = buildCustomFunc(defBlock, spec, mod);
            mod.add_func(customFunc);
            addLog("info", pack.workspace.logs.func_compile_complete.replace("$0", spec.name));
        }

        const allImports: simulizer.ImportDef[] = [
            new simulizer.ImportDef("debug",  "log",              "func", "log_i32",          "(param i32)"),
            new simulizer.ImportDef("debug",  "log",              "func", "log_f64",          "(param f64)"),
            new simulizer.ImportDef("debug",  "log_ptr",          "func", "log_ptr",          "(param i32)"),
            new simulizer.ImportDef("debug",  "log_arr_i32",      "func", "log_arr_i32",      "(param i32 i32)"),
            new simulizer.ImportDef("debug",  "log_arr_f64",      "func", "log_arr_f64",      "(param i32 i32)"),
            new simulizer.ImportDef("debug",  "log_tensor",       "func", "log_tensor",       "(param i32)"),
            new simulizer.ImportDef("debug",  "log_vec2",         "func", "log_vec2",         "(param f64 f64)"),
            new simulizer.ImportDef("debug",  "log_vec3",         "func", "log_vec3",         "(param f64 f64 f64)"),
            new simulizer.ImportDef("debug",  "debug_series",     "func", "debug_series",     "(result i32)"),
            new simulizer.ImportDef("debug",  "debug_set_holder", "func", "debug_set_holder", "(param i32)"),
            new simulizer.ImportDef("debug",  "debug_bar",        "func", "debug_bar",        "(param i32 i32) (result i32)"),
            new simulizer.ImportDef("debug",  "debug_bar_set",    "func", "debug_bar_set",    "(param i32 i32)"),
            new simulizer.ImportDef("tensor", "tensor_random",    "func", "tensor_random",    "(param i32 i32 f64 f64 i32 i32) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_create",    "func", "tensor_create",    "(param i32 i32 i32) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_add",       "func", "tensor_add",       "(param i32 i32) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_sub",       "func", "tensor_sub",       "(param i32 i32) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_matmul",    "func", "tensor_matmul",    "(param i32 i32) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_neg",       "func", "tensor_neg",       "(param i32) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_grad",      "func", "tensor_grad",      "(param i32) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_curl",      "func", "tensor_curl",      "(param i32) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_lapl",      "func", "tensor_lapl",      "(param i32) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_elemul",    "func", "tensor_elemul",    "(param i32 i32) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_scale",     "func", "tensor_scale",     "(param i32 f64) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_save",      "func", "tensor_save",      "(param i32 i32) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_set",       "func", "tensor_set",       "(param i32 i32 i32 i32 i32 i32 i32 i32 f64) (result i32)"),
            new simulizer.ImportDef("tensor", "tensor_get",       "func", "tensor_get",       "(param i32 i32 i32 i32 i32 i32 i32 i32) (result f64)"),
            new simulizer.ImportDef("debug",  "show_mat",         "func", "show_mat",         "(param i32) (result i32)"),
            new simulizer.ImportDef("debug",  "graph_arr_i32",       "func", "graph_arr_i32",       "(param i32 i32)"),
            new simulizer.ImportDef("debug",  "graph_arr_f64",       "func", "graph_arr_f64",       "(param i32 i32)"),
            new simulizer.ImportDef("debug",  "graph_arr_range_i32", "func", "graph_arr_range_i32", "(param i32 i32 f64 f64)"),
            new simulizer.ImportDef("debug",  "graph_arr_range_f64", "func", "graph_arr_range_f64", "(param i32 i32 f64 f64)"),
            new simulizer.ImportDef("tensor", "tensor_perlin",    "func", "tensor_perlin",    "(param i32 i32 i32) (result i32)"),
            new simulizer.ImportDef("matrix", "matrix_create",    "func", "matrix_create",    "(param i32 i32 i32) (result i32)"),
            new simulizer.ImportDef("matrix", "matrix_matmul",    "func", "matrix_matmul",    "(param i32 i32) (result i32)"),
            new simulizer.ImportDef("matrix", "matrix_transpose", "func", "matrix_transpose", "(param i32) (result i32)"),
            new simulizer.ImportDef("matrix", "matrix_inverse",   "func", "matrix_inverse",   "(param i32) (result i32)"),
            new simulizer.ImportDef("matrix", "matrix_det",       "func", "matrix_det",       "(param i32) (result f64)"),
            new simulizer.ImportDef("matrix", "matrix_trace",     "func", "matrix_trace",     "(param i32) (result f64)"),
            new simulizer.ImportDef("matrix", "matrix_identity",  "func", "matrix_identity",  "(param i32) (result i32)"),
            new simulizer.ImportDef("math",   "math_exp",         "func", "math_exp",         "(param f64) (result f64)"),
            new simulizer.ImportDef("math",   "math_ln",          "func", "math_ln",          "(param f64) (result f64)"),
            new simulizer.ImportDef("math",   "math_cos",         "func", "math_cos",         "(param f64) (result f64)"),
            new simulizer.ImportDef("math",   "math_sin",         "func", "math_sin",         "(param f64) (result f64)"),
            new simulizer.ImportDef("math",   "math_rand_int",    "func", "math_rand_int",    "(param i32 i32) (result i32)"),
            new simulizer.ImportDef("math",   "math_rand_range",  "func", "math_rand_range",  "(param f64 f64) (result f64)"),
            new simulizer.ImportDef("math",   "math_rand_unit",   "func", "math_rand_unit",   "(result f64)"),
            new simulizer.ImportDef("io",     "input_i32",        "func", "input_i32",        "(result i32)"),
            new simulizer.ImportDef("io",     "input_f64",        "func", "input_f64",        "(result f64)"),
        ];
        for (const imp of allImports) mod.add_import(imp);

        for (const bd2 of bd2ArraysRef.current) {
            mod.add_data(bd2.offset, new Uint8Array(bd2.data.buffer, bd2.data.byteOffset, bd2.data.byteLength));
        }
        for (const bd3 of bd3ArraysRef.current) {
            mod.add_data(bd3.offset, new Uint8Array(bd3.data.buffer, bd3.data.byteOffset, bd3.data.byteLength));
        }

        const watFull = mod.compile();
        const calledFns = new Set(Array.from(watFull.matchAll(/call \$(\w+)/g), m => m[1]));
        mod.imports = mod.imports.filter(imp => calledFns.has(imp.internalName));

        const wat = mod.compile();
        setWatSource(wat);
        addLog("info", pack.workspace.logs.wat_generated);
        return { wat, mod };
    }, [addLog, pack]);

    useEffect(() => {
        if (!isMobile) return;
        setShowBlocks(false);
        setShowConstMgr(false);
        setShowBdMgr(false);
        setShowLatexOcr(false);
        setShowChatPopover(false);
        setShowToolsMenu(false);
        // Console pane has the most useful info (output + log) — pick that on mobile.
        setRightTab("console");
    }, [isMobile]);

    const handleRun = useCallback(async () => {

        const ws = workspaceRef.current;
        if (!ws) return;

        if (isMobile) setMobileTab("result");

        // Commit edited fields (number inputs, etc.) and close dropdowns
        Blockly.hideChaff();

        setLastRunBackend(tfBackendRef.current);
        setLastRunDurationMs(null);
        runStartedAtRef.current = performance.now();
        setResult(null); setWatSource(""); setRunState("compiling");
        clearLog();

        // Routing: a program containing input (or any Asyncify-requiring block)
        // can't run on the native browser simulation (no suspend) — transpile it
        // to C++ and run it through the emcc/clang Asyncify path instead.
        // Only blocks that actually live inside a function count; blocks sitting
        // loose on the canvas (outside any function) are ignored.
        const inFunction = (b: Blockly.Block) => {
            const root = b.getRootBlock();
            return root.type === "wasm_func_main" || root.type.startsWith("wasm_func_def_");
        };
        const needsEmcc = ws.getAllBlocks(false).some(b => NEEDS_EMCC_BLOCK_TYPES.has(b.type) && inFunction(b));

        try {
            if (needsEmcc) {
                addLog("info", pack.workspace.logs.input_emcc);
                const blocklyJson = JSON.stringify(replaceLatexBlocksInWorkspace(Blockly.serialization.workspaces.save(ws)));
                const res = await fetch(`${API_BASE}/compile/emcc/blocks`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: blocklyJson }),
                });
                if (!res.ok) {
                    let detail = await res.text();
                    try { detail = JSON.parse(detail).detail ?? detail; } catch { /* leave raw */ }
                    throw new Error(detail);
                }
                const wasmBuffer = await res.arrayBuffer();
                setRunState("running");
                const worker = getClangWorker();
                await new Promise<void>((resolve, reject) => {
                    pendingRunRef.current = { resolve, reject };
                    worker.postMessage({ type: "run", wasmBuffer } satisfies ClangWorkerInMsg, [wasmBuffer]);
                });
                return;
            }

            const result = await generateWat();
            if (!result) { setRunState("error"); return; }
            const { mod } = result;

            addLog("info", pack.workspace.logs.wat_compiling);
            setRunState("running");
            const wasm = await mod.generate_wasm();
            addLog("info", pack.workspace.logs.wasm_complete.replace("$0", String(wasm.byteLength)));

            addLog("info", pack.workspace.logs.running_worker);
            setRunState("running");

            const worker = wasmWorkerRef.current;
            if (!worker) throw new Error("Worker not initialized");

            await new Promise<void>((resolve, reject) => {
                pendingRunRef.current = { resolve, reject };
                worker.postMessage({ type: "run", wasmBuffer: wasm.buffer }, [wasm.buffer]);
            });
        } catch (err) {
            if ((err as Error).name !== "AbortError") {
                addLog("error", pack.workspace.logs.error_prefix.replace("$0", err instanceof Error ? err.message : String(err)));
                setRunState("error");
            }
            console.error(err);
        }
    }, [addLog, pack, clearLog, isMobile, getClangWorker]);

    const handleStop = useCallback(() => {
        const oldWorker = wasmWorkerRef.current;
        if (oldWorker) oldWorker.terminate();

        // Tear down an in-flight interactive (clang) run too; recreated on demand.
        if (clangWorkerRef.current) {
            clangWorkerRef.current.terminate();
            clangWorkerRef.current = null;
        }
        setInputRequest(null);

        if (pendingRunRef.current) {
            const abortError = new Error("Execution stopped");
            abortError.name = "AbortError";
            pendingRunRef.current.reject(abortError);
            pendingRunRef.current = null;
        }
        runStartedAtRef.current = null;
        pendingBackendSwitchRef.current = null;

        createWasmWorker();

        setRunState("idle");
        addLog("info", pack.workspace.logs.run_aborted);
    }, [addLog, createWasmWorker]);

    // Submit the value the user typed into the input panel back to the clang
    // worker, which resumes the suspended run with it.
    const submitInput = useCallback(() => {
        if (!inputRequest) return;
        const raw = inputValue.trim();
        let value = inputRequest.kind === "i32" ? parseInt(raw, 10) : parseFloat(raw);
        if (!Number.isFinite(value)) value = 0;
        clangWorkerRef.current?.postMessage({ type: "input-response", value } satisfies ClangWorkerInMsg);
        setInputRequest(null);
        setInputValue("");
    }, [inputRequest, inputValue]);

    // ── Auto-run on URL ?autorun=1 ───────────────────────────────────────
    // Used by the landing-page iframes to show a workspace that already
    // produced a result instead of an empty console.
    const autorunFiredRef = useRef(false);
    const handleRunLatestRef = useRef<typeof handleRun>(handleRun);
    useEffect(() => { handleRunLatestRef.current = handleRun; }, [handleRun]);
    useEffect(() => {
        if (autorunFiredRef.current) return;
        if (searchParams.get("autorun") !== "1") return;
        if (!fileMeta) return;
        if (!workspaceRef.current) return;
        const t = setTimeout(() => {
            if (autorunFiredRef.current) return;
            autorunFiredRef.current = true;
            handleRunLatestRef.current?.();
        }, 1200);
        return () => clearTimeout(t);
    }, [fileMeta, searchParams]);

    const handleCompile = useCallback(async () => {
        const ws = workspaceRef.current;
        if (!ws || compiling) return;
        const rawSave = Blockly.serialization.workspaces.save(ws);
        const processedSave = replaceLatexBlocksInWorkspace(rawSave);
        const blocklyJson = JSON.stringify(processedSave);
        setCompiling(true);
        setCompileProgress({ status: "progress", step: 0, total: 0, message: pack.workspace.progress.sending });
        // "auto" lets the backend pick from the User-Agent; an explicit OS overrides via ?system=.
        const buildUrl = targetOs === "auto"
            ? `${API_BASE}/compile/build`
            : `${API_BASE}/compile/build?system=${targetOs}`;
        try {
            const ctrl = new AbortController();
            let uuid: string | null = null;
            let downloadName = "output";

            const doneUuid = await new Promise<string>((resolve, reject) => {
                fetchEventSource(buildUrl, {
                method: "POST",
                    headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: blocklyJson }),
                    signal: ctrl.signal,
                    openWhenHidden: true,
                    async onopen(res) {
                        if (!res.ok) {
                            const err = await res.json().catch(() => ({ detail: res.statusText }));
                            throw new Error(err.detail ?? "Compile failed");
                        }
                    },
                    onmessage(e) {
                        let payload: { uuid?: string; name?: string; step?: number; total?: number; message?: string; detail?: string };
                        try { payload = JSON.parse(e.data); } catch { return; }
                        if (e.event === "error") {
                            throw new Error(payload.detail ?? "Compile failed");
                        }
                        if (e.event === "done") {
                            const finalUuid = payload.uuid ?? uuid;
                            if (!finalUuid) throw new Error("Compile stream ended without uuid");
                            if (payload.name) downloadName = payload.name;
                            setCompileProgress(prev => ({ status: "progress", step: Math.max(0, (prev?.total ?? prev?.step ?? 0) - 1), total: prev?.total ?? 0, message: pack.workspace.progress.preparing_download }));
                            ctrl.abort();
                            resolve(finalUuid);
                            return;
                        }
                        // default "message" event: progress — total/step driven entirely by server (+1 reserved for download)
                        if (payload.uuid && !uuid) uuid = payload.uuid;
                        if (payload.message) {
                            setCompileProgress(prev => ({
                                status: "progress",
                                step: payload.step ?? prev?.step ?? 0,
                                        total: payload.total !== undefined ? payload.total + 1 : (prev?.total ?? 0),
                                message: payload.message!,
                            }));
                        }
                    },
                    onerror(err) {
                        if ((err as Error)?.name !== "AbortError") {
                            reject(err instanceof Error ? err : new Error(String(err)));
                        }
                        throw err; // stop retries
                    },
                    onclose() {
                        reject(new Error("Compile stream ended without completion"));
                    },
                }).catch(reject);
            });

            const dlRes = await fetch(`${API_BASE}/compile/build/download/${doneUuid}`);
            if (!dlRes.ok) {
                const err = await dlRes.json().catch(() => ({ detail: dlRes.statusText }));
                setCompileProgress(prev => ({ status: "error", step: prev?.step ?? 0, total: prev?.total ?? 0, message: err.detail ?? "Download failed" }));
                return;
            }
            const blob = await dlRes.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = downloadName;
            a.click();
            URL.revokeObjectURL(url);
            setCompileProgress(prev => ({ status: "done", step: prev?.total ?? prev?.step ?? 0, total: prev?.total ?? 0, message: pack.workspace.progress.download_done }));
        } catch (e) {
            setCompileProgress(prev => ({ status: "error", step: prev?.step ?? 0, total: prev?.total ?? 0, message: e instanceof Error ? e.message : String(e) }));
        } finally {
            setCompiling(false);
        }
    }, [watSource, compiling, targetOs]);

    const handleReset = useCallback(() => {
        const ws = workspaceRef.current;
        if (!ws) return;
        ws.clear();
        Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(INITIAL_WORKSPACE_XML), ws);
        setResult(null); setWatSource(""); setRunState("idle");
        clearLog();
    }, [clearLog]);

    const handleBd2FileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const name = newBd2Name.trim() || file.name.replace(/\.bin$/i, "");
        if (!name) { alert(pack.workspace.alerts.name_required); return; }
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) { alert(pack.workspace.alerts.name_charset); return; }
        if (bd2ArraysRef.current.some(b => b.name === name)) { alert(pack.workspace.alerts.name_in_use.replace("$0", name)); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const buf = ev.target?.result as ArrayBuffer;
            if (!buf) return;

            // Detect packF64Arrays format: header[0] (uint32) == number of arrays (expect 8)
            const maybeCount = new Uint32Array(buf, 0, 1)[0];
            let data: Float64Array;
            let count: number;

            if (maybeCount === 8) {
                // packF64Arrays format from boundary page: [t, x, y, dl, tx, ty, nx, ny]
                // Convert to interleaved struct: [t, x, y, tx, ty, nx, ny] × N
                const rawLen   = 1 + 8;
                const padded   = rawLen % 2 === 0 ? rawLen : rawLen + 1; // = 10
                const header   = new Uint32Array(buf, 0, padded);
                const N        = header[1]; // all non-dl arrays have length N
                let off        = padded * 4;
                const arrays: Float64Array[] = [];
                for (let i = 0; i < 8; i++) {
                    const len = header[i + 1];
                    arrays.push(new Float64Array(buf, off, len));
                    off += len * 8;
                }
                // arrays: [t, x, y, dl, tx, ty, nx, ny] — drop dl (index 3)
                const [t, x, y, , tx, ty, nx, ny] = arrays;
                count = N;
                data  = new Float64Array(count * 7);
                for (let i = 0; i < count; i++) {
                    data[i * 7 + 0] = t[i];
                    data[i * 7 + 1] = x[i];
                    data[i * 7 + 2] = y[i];
                    data[i * 7 + 3] = tx[i];
                    data[i * 7 + 4] = ty[i];
                    data[i * 7 + 5] = nx[i];
                    data[i * 7 + 6] = ny[i];
                }
            } else {
                // Legacy interleaved format: 56 bytes per element
                if (buf.byteLength % BD2_ELEM_BYTES !== 0) {
                    alert(pack.workspace.alerts.file_size_invalid.replace("$0", "56").replace("$1", String(buf.byteLength)));
                    return;
                }
                count = buf.byteLength / BD2_ELEM_BYTES;
                data  = new Float64Array(buf.slice(0));
            }

            const prevEnd = bd2ArraysRef.current.reduce(
                (max, bd2) => Math.max(max, bd2.offset + bd2.count * BD2_ELEM_BYTES),
                BD2_BASE_OFFSET,
            );
            const offset = prevEnd;
            const entry: Bd2ArrayEntry = { id: `bd2_${Date.now()}`, name, data, count, offset };
            setBd2Arrays(prev => { const next = [...prev, entry]; bd2ArraysRef.current = next; return next; });
            setNewBd2Name("boundary");
        };
        reader.readAsArrayBuffer(file);
        e.target.value = "";
    }, [newBd2Name]);

    const handleRemoveBd2 = useCallback((id: string) => {
        setBd2Arrays(prev => { const next = prev.filter(b => b.id !== id); bd2ArraysRef.current = next; return next; });
    }, []);

    const handleBd3FileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const name = newBd3Name.trim() || file.name.replace(/\.bin$/i, "");
        if (!name) { alert(pack.workspace.alerts.name_required); return; }
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) { alert(pack.workspace.alerts.name_charset); return; }
        if (bd3ArraysRef.current.some(b => b.name === name)) { alert(pack.workspace.alerts.name_in_use.replace("$0", name)); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const buf = ev.target?.result as ArrayBuffer;
            if (!buf) return;

            let data: Float64Array;
            // packF64Arrays 포맷 감지: 헤더가 가리키는 총 크기가 실제 버퍼와 일치하는지 검증
            const isPacked = (() => {
                if (buf.byteLength < 8) return false;
                const arrCount = new Uint32Array(buf, 0, 1)[0];
                if (arrCount === 0) return false;
                const rawLen   = 1 + arrCount;
                const padLen   = rawLen % 2 === 0 ? rawLen : rawLen + 1;
                if (buf.byteLength < padLen * 4) return false;
                const lens = new Uint32Array(buf, 0, padLen);
                let expected = padLen * 4;
                for (let k = 1; k <= arrCount; k++) expected += lens[k] * 8;
                return expected === buf.byteLength;
            })();
            if (isPacked) {
                // boundary3d 페이지 포맷: surface당 [meta(nu,nv), u, v, x, y, z, dS, nx, ny, nz] 10개 배열
                const arrs = unpackF64Arrays(buf);
                const points: number[] = [];
                for (let i = 0; i + 9 < arrs.length; i += 10) {
                    const u = arrs[i + 1], v = arrs[i + 2];
                    const x = arrs[i + 3], y = arrs[i + 4], z = arrs[i + 5];
                    const dS = arrs[i + 6];
                    const nx = arrs[i + 7], ny = arrs[i + 8], nz = arrs[i + 9];
                    for (let j = 0; j < u.length; j++) {
                        points.push(u[j], v[j], x[j], y[j], z[j], dS[j], nx[j], ny[j], nz[j]);
                    }
                }
                data = new Float64Array(points);
            } else {
                if (buf.byteLength % BD3_ELEM_BYTES !== 0) {
                    alert(pack.workspace.alerts.file_size_invalid.replace("$0", "72").replace("$1", String(buf.byteLength)));
                    return;
                }
                data = new Float64Array(buf.slice(0));
            }

            const count = data.length / 9;
            const prevEnd = bd3ArraysRef.current.reduce(
                (max, bd3) => Math.max(max, bd3.offset + bd3.count * BD3_ELEM_BYTES),
                BD3_BASE_OFFSET,
            );
            const entry: Bd3ArrayEntry = { id: `bd3_${Date.now()}`, name, data, count, offset: prevEnd };
            setBd3Arrays(prev => { const next = [...prev, entry]; bd3ArraysRef.current = next; return next; });
            setNewBd3Name("boundary");
        };
        reader.readAsArrayBuffer(file);
        e.target.value = "";
    }, [newBd3Name]);

    const handleRemoveBd3 = useCallback((id: string) => {
        setBd3Arrays(prev => { const next = prev.filter(b => b.id !== id); bd3ArraysRef.current = next; return next; });
    }, []);

    const handleOpenBlocks = useCallback(() => {
        const ws = workspaceRef.current;
        if (!ws) return;
        const state = Blockly.serialization.workspaces.save(ws);
        setBlockData(JSON.stringify(state));
        setBlockMode("export");
        setShowBlocks(true);
    }, []);

    const handleSaveToServer = useCallback(async () => {
        if (!fileId) return;
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        setSaveStatus("saving");
        try {
            await saveFile(fileId, blockData);
            setSaveStatus("saved");
            const ws = workspaceRef.current;
            if (ws) {
                generateThumbnailBlob(ws).then(blob => { if (blob) uploadThumbnail(fileId, blob).catch(() => {}); });
            }
        } catch {
            addLog("error", pack.workspace.logs.file_save_failed);
            setSaveStatus("error");
        }
    }, [fileId, blockData, addLog]);

    const handleRenameFile = useCallback(async () => {
        if (!fileId) return;
        const trimmed = fileName.trim();
        if (!trimmed) { setFileName(fileName); return; }
        try {
            const updated = await renameFile(fileId, trimmed);
            setFileName(updated.name);
        } catch (err: any) {
            if (err?.status === 409) addLog("error", pack.workspace.logs.file_name_conflict);
        }
    }, [fileId, fileName, addLog]);

    const handleDuplicateToMine = useCallback(async () => {
        if (!fileId || duplicating) return;
        setDuplicating(true);
        try {
            const dup = await duplicateFile(fileId);
            router.push(`/workspace?file=${dup.id}`);
        } catch (err: any) {
            if (err?.status === 401) {
                router.push(`/login?next=${encodeURIComponent(`/workspace?file=${fileId}`)}`);
            } else {
                addLog("error", pack.workspace.ui.share_login_to_duplicate);
            }
        } finally {
            setDuplicating(false);
        }
    }, [fileId, duplicating, router, addLog, pack]);

    useEffect(() => {
        // Hydrate from parent-provided file (the normal ?file= path — parent
        // fetched + dispatched by type). Example mode (?example=…) and the
        // no-param fallback still run their original branches below since
        // those code paths don't go through the parent fetch.
        if (initialFile) {
            const f = initialFile;
            const owner = !!initialOwner;
            setIsOwner(owner);
            isOwnerRef.current = owner;
            setFileMeta(f);
            setFileId(f.id);
            setFileName(f.name);
            setSaveStatus("saved");
            const isEmpty = f.content.trim() === "{}";
            const content = isEmpty ? null : f.content;
            setBlockData(f.content);
            fileLoadCompletedRef.current = true;
            if (wsReadyRef.current) {
                const ws = workspaceRef.current;
                if (ws) {
                    ws.clear();
                    if (content) {
                        try {
                            loadWorkspaceState(ws, JSON.parse(content));
                        } catch {
                            Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(INITIAL_WORKSPACE_XML), ws);
                        }
                    } else {
                        Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(INITIAL_WORKSPACE_XML), ws);
                    }
                }
            } else {
                pendingContentRef.current = content;
            }
            return;
        }
        const fileParam = searchParams.get("file");
        const exampleParam = searchParams.get("example");
        const id = fileParam ?? null;
        if (!id) {
            // System-level docs example (S1+O1): load a repo-bundled JSON
            // into a non-persistent workspace. No fileId is set, so save /
            // rename / duplicate stay disabled — edits live in this tab only.
            if (exampleParam) {
                (async () => {
                    const res = await fetch(
                        `/api/docs/examples/${encodeURIComponent(exampleParam)}`,
                    ).catch(() => null);
                    if (!res || !res.ok) {
                        setFileError("not_found");
                        return;
                    }
                    const content = await res.text();
                    setIsOwner(true);
                    isOwnerRef.current = true;
                    setFileName(`Example: ${exampleParam}`);
                    setSaveStatus("saved");
                    setBlockData(content);
                    fileLoadCompletedRef.current = true;
                    if (wsReadyRef.current) {
                        const ws = workspaceRef.current;
                        if (ws) {
                            ws.clear();
                            try {
                                loadWorkspaceState(ws, JSON.parse(content));
                            } catch {
                                Blockly.Xml.domToWorkspace(
                                    Blockly.utils.xml.textToDom(INITIAL_WORKSPACE_XML),
                                    ws,
                                );
                            }
                        }
                    } else {
                        pendingContentRef.current = content;
                    }
                })();
                return;
            }
            router.replace("/dashboard");
            return;
        }
        (async () => {
            const me = await getMe().catch(() => null);
            const f = await getFile(id).catch((err) => {
                const status = (err as { status?: number }).status;
                setFileError(status === 403 ? "forbidden" : "not_found");
                return null;
            });
            if (!f) return;
            if (f.type === "clangfile") {
                router.replace(`/workspace?file=${f.id}`);
                return;
            }
            const owner = !!(me && me.id === f.author_id);
            setIsOwner(owner);
            isOwnerRef.current = owner;
            setFileMeta(f);
            setFileId(f.id);
            setFileName(f.name);
            setSaveStatus("saved");
            const isEmpty = f.content.trim() === "{}";
            const content = isEmpty ? null : f.content;
            setBlockData(f.content);
            fileLoadCompletedRef.current = true;
            if (wsReadyRef.current) {
                const ws = workspaceRef.current;
                if (ws) {
                    ws.clear();
                    if (content) {
                        try {
                            loadWorkspaceState(ws, JSON.parse(content));
                        } catch {
                            Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(INITIAL_WORKSPACE_XML), ws);
                        }
                    } else {
                        Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(INITIAL_WORKSPACE_XML), ws);
                    }
                }
            } else {
                pendingContentRef.current = content;
            }
        })();
    }, [initialFile, initialOwner, searchParams, router]);

    const isRunning = runState === "compiling" || runState === "running";
    const formatRunDuration = (ms: number | null) => {
        if (ms == null) return "—";
        if (ms < 1000) return `${ms.toFixed(1)} ms`;
        return `${(ms / 1000).toFixed(2)} s`;
    };

    // UI-only state (no business logic)
    const [rightTab, setRightTab]     = useState<"console" | "result" | "infos">("console");
    const [mobileTab, setMobileTab]   = useState<"blocks" | "result">("blocks");
    const [infos, setInfos]           = useState<InfoEntry[]>([]);
    const hasError = infos.some(e => e.level === "error");

    const focusInfoEntry = useCallback((entry: InfoEntry) => {
        if (!entry.blockId) return;

        const ws = workspaceRef.current;
        if (!ws) return;

        setCanvasTab("blocks");
        const block = ws.getBlockById(entry.blockId);
        if (!block) return;
        ws.centerOnBlock(block.id);
        const focusManager = (Blockly as any).getFocusManager?.();
        if (focusManager?.focusNode) {
            focusManager.focusNode(block);
        } else {
            block.select();
        }
    }, []);

    if (fileError) {
        const t = pack.file_error;
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
                            {isForbidden ? t.forbidden_title : t.not_found_title}
                        </div>
                        <div style={{ fontSize: token.font.size.fs13, color: token.color.fgMuted, lineHeight: 1.6 }}>
                            {isForbidden ? t.forbidden_desc : t.not_found_desc}
                        </div>
                    </div>
                    <button
                        onClick={() => router.replace("/dashboard")}
                        style={{ padding: "8px 20px", borderRadius: token.radius.md, background: token.color.accent, color: token.color.fgOnAccent, fontWeight: 600, fontSize: token.font.size.fs13, border: "none", cursor: "pointer" }}
                    >
                        {t.go_dashboard}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: token.color.bg, color: token.color.fg, fontSize: token.font.size.fs13 }}>
            {!langReady && (
                <div style={{ 
                    position: "fixed", inset: 0, zIndex: 99999, 
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", 
                    background: token.color.bg, gap: 24 
                }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                        <Logo size={48} />
                        <div style={{ 
                            fontSize: token.font.size.fs16, fontWeight: 700, 
                            letterSpacing: "0.1em", color: token.color.fgStrong,
                            marginLeft: 4
                        }}>
                            SIMULIZER
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: token.color.fgSubtle, fontSize: token.font.size.fs13, fontFamily: token.font.family.mono }}>
                        <Spinner size="md" />
                        <span>{pack.workspace.ui.initializing}</span>
                    </div>
                </div>
            )}

            {/* ── Topbar ── */}
            <header style={isMobile
                ? { display: "flex", alignItems: "center", gap: 4, padding: "0 12px", height: 48, borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0 }
                : { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 16px", height: 48, borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0 }
            }>
                {/* Brand + filename */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, whiteSpace: "nowrap", flex: isMobile ? 1 : undefined }}>
                    <TopbarBrand compact={isMobile} />

                    {!isMobile && <span style={{ color: token.color.fgSubtle, fontWeight: 300, marginLeft: 4 }}>/</span>}
                    <button onClick={isOwner && !isMobile ? handleOpenBlocks : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: isMobile ? "4px 4px" : "4px 8px", borderRadius: token.radius.sm, background: "none", border: "none", cursor: isOwner && !isMobile ? "pointer" : "default", color: token.color.fgMuted, fontSize: token.font.size.fs12, fontFamily: token.font.family.mono, minWidth: 0, flex: isMobile ? "1 1 0" : undefined, overflow: "hidden" }}>
                        {!isMobile && <Icon.File size={12} />}
                        {isMobile ? (
                            <span style={{ minWidth: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {fileName || "untitled"}
                            </span>
                        ) : (
                            <input
                                value={fileName}
                                onChange={e => isOwner && setFileName(e.target.value)}
                                onBlur={isOwner ? handleRenameFile : undefined}
                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                onClick={e => e.stopPropagation()}
                                placeholder="untitled"
                                readOnly={!isOwner}
                                style={{ background: "transparent", border: "none", outline: "none", color: "inherit", fontFamily: "inherit", fontSize: "inherit", width: 140, cursor: isOwner ? "text" : "default" }}
                            />
                        )}
                        {isOwner && !isMobile && <Icon.Chevron size={11} />}
                    </button>
                    {isOwner === false && (
                        <span style={{
                            marginLeft: 6,
                            padding: "2px 8px",
                            background: token.color.bgSubtle,
                            border: `1px solid ${token.color.border}`,
                            borderRadius: 999,
                            fontSize: token.font.size.fs10,
                            color: token.color.fgMuted,
                            fontFamily: token.font.family.mono,
                            whiteSpace: "nowrap",
                        }}>
                            {pack.workspace.ui.share_readonly_badge}
                        </span>
                    )}
                </div>

                {/* Center — reserved (search bar removed) */}
                {!isMobile && <div />}


                {/* Actions */}
                <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"flex-end" }}>
                    {!isMobile && <>
                    {/* Save button (owner only) */}
                    {isOwner && saveStatus === "unsaved" && (
                        <span style={{ fontSize: token.font.size.fs11, color: token.color.fgSubtle }}>{pack.workspace.ui.save_unsaved}</span>
                    )}
                    {isOwner && saveStatus === "error" && (
                        <span style={{ fontSize: token.font.size.fs11, color: token.color.danger }}>{pack.workspace.ui.save_failed}</span>
                    )}
                    {isOwner && (
                        <Button
                            variant="ghost"
                            size="sm"
                            leading={saveStatus === "saving" ? <Spinner size="sm" /> : <Icon.Save size={11} />}
                            onClick={handleSaveToServer}
                            disabled={saveStatus === "saving" || !fileId}
                        >
                            {saveStatus === "saving" ? pack.workspace.ui.saving : pack.workspace.ui.save}
                        </Button>
                    )}
                    {/* Duplicate-to-mine (non-owner) */}
                    {isOwner === false && (
                        <Button
                            variant="accent"
                            size="sm"
                            onClick={handleDuplicateToMine}
                            disabled={duplicating || !fileId}
                            leading={duplicating ? <Spinner size="sm" /> : undefined}
                        >
                            {pack.workspace.ui.share_duplicate_button}
                        </Button>
                    )}
                    {/* Backend pill */}
                    <div style={{ display:"inline-flex", alignItems:"center", gap:2, padding:"4px 8px", background:token.color.bgSubtle, border:`1px solid ${token.color.border}`, borderRadius:999, fontSize:token.font.size.fs10, color:token.color.fgMuted, fontFamily:token.font.family.mono }}>
                        {(["webgpu", "webgl", "cpu"] as const).map((b, i, arr) => {
                            const isSelected = tfBackend === b;
                            const label = b === "webgpu" ? "WebGPU" : b === "webgl" ? "WebGL" : "CPU";
                            return (
                                <React.Fragment key={b}>
                                    <button 
                                        onClick={() => tfBackend !== "initializing" && handleSwitchBackend(b)}
                                        style={{ 
                                            background: "none", 
                                            border: "none", 
                                            cursor: tfBackend === "initializing" ? "default" : "pointer", 
                                            color: isSelected ? token.color.accent : token.color.fgSubtle, 
                                            fontSize: token.font.size.fs10, 
                                            padding: "0 4px", 
                                            fontWeight: isSelected ? 700 : 500,
                                            opacity: tfBackend === "initializing" ? 0.4 : 1,
                                            transition: "all 0.1s"
                                        }}
                                    >
                                        {label}
                                    </button>
                                    {i < arr.length - 1 && <span style={{ color: token.color.border, opacity: 0.5 }}>|</span>}
                                </React.Fragment>
                            );
                        })}
                    </div>
                    {/* AI button + popover (owner only) */}
                    {isOwner && (
                    <div style={{ position: "relative" }} ref={chatPopoverRef}>
                        <button
                            onClick={() => setShowChatPopover(v => !v)}
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                padding: "6px 12px",
                                borderRadius: token.radius.sm,
                                background: showChatPopover ? token.color.accentSubtle : "none",
                                border: `1px solid ${showChatPopover ? token.color.accent : token.color.accentBorder}`,
                                cursor: "pointer",
                                color: token.color.accent,
                                fontSize: token.font.size.fs12, fontWeight: 600,
                                transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = token.color.accentSubtle;
                                e.currentTarget.style.borderColor = token.color.accent;
                            }}
                            onMouseLeave={(e) => {
                                if (!showChatPopover) {
                                    e.currentTarget.style.background = "none";
                                    e.currentTarget.style.borderColor = token.color.accentBorder;
                                }
                            }}
                        >
                            <Icon.Sparkle size={13} /> AI
                        </button>

                        {isOwner && showChatPopover && (
                            <div style={{
                                position: "absolute",
                                top: "calc(100% + 8px)",
                                right: 0,
                                width: 320,
                                background: token.color.surface,
                                border: `1px solid ${token.color.border}`,
                                borderRadius: token.radius.md,
                                boxShadow: token.shadow.lg,
                                zIndex: 200,
                                padding: 12,
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                            }}>
                                <div style={{ fontSize: token.font.size.fs11, fontWeight: 600, color: token.color.fgMuted, display: "flex", alignItems: "center", gap: 6 }}>
                                    <Icon.Sparkle size={11} />
                                    {pack.workspace.ai.title}
                                </div>
                                {chatStreaming ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", color: token.color.fgMuted, fontSize: token.font.size.fs12 }}>
                                        <Spinner size="sm" />
                                        <span style={{ flex: 1 }}>{pack.workspace.ai.waiting}</span>
                                        <button
                                            onClick={() => chatAbortRef.current?.abort()}
                                            style={{ padding: "2px 8px", border: `1px solid ${token.color.border}`, borderRadius: token.radius.xs, background: "none", cursor: "pointer", color: token.color.fgMuted, fontSize: token.font.size.fs11 }}
                                        >{pack.workspace.ai.abort}</button>
                                    </div>
                                ) : (
                                    <>
                                        <textarea
                                            value={chatPrompt}
                                            onChange={e => setChatPrompt(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    if (!chatStreaming && chatPrompt.trim()) handleChat();
                                                }
                                                if (e.key === "Escape") setShowChatPopover(false);
                                            }}
                                            placeholder={pack.workspace.ai.placeholder}
                                            rows={2}
                                            autoFocus
                                            style={{
                                                width: "100%",
                                                boxSizing: "border-box",
                                                padding: "8px 10px",
                                                borderRadius: token.radius.sm,
                                                border: `1px solid ${token.color.borderStrong}`,
                                                background: token.color.bg,
                                                color: token.color.fg,
                                                fontFamily: token.font.family.mono,
                                                fontSize: token.font.size.fs12,
                                                resize: "none",
                                                outline: "none",
                                                lineHeight: 1.6,
                                            }}
                                        />
                                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                            <Button variant="run" size="sm" onClick={handleChat} disabled={!chatPrompt.trim()}>
                                                {pack.workspace.ai.send}
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    )}
                    </>}
                    {/* Run */}
                    <button onClick={isRunning ? handleStop : handleRun}
                        disabled={!isRunning && hasError}
                        style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"6px 11px", borderRadius:token.radius.sm, background:isRunning ? token.color.danger : token.color.gradient.ai, color:"#fff", fontSize:token.font.size.fs12, fontWeight:600, border:"none", cursor:(!isRunning && hasError) ? "not-allowed" : "pointer", opacity:(!isRunning && hasError) ? 0.45 : 1, boxShadow:"0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)" }}>
                        {isRunning ? <Icon.Square size={10} /> : <Icon.Play size={11} fill />}
                        <span>{isRunning ? pack.workspace.ui.run_button_running : pack.workspace.ui.run_button}</span>
                        {/* <kbd style={{ padding:"1px 5px", background:"rgba(0,0,0,0.25)", borderRadius:3, fontFamily:token.font.family.mono, fontSize:token.font.size.fs10, color:"rgba(255,255,255,0.7)" }}>⌘↵</kbd> */}
                    </button>
                </div>
            </header>

            {/* ── Main 2-column layout ── */}
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 340px", flex:1, minHeight:0 }}>

                {/* Canvas: Blockly (toolbox 포함) */}
                <main style={{ display: isMobile && mobileTab !== "blocks" ? "none" : "flex", flexDirection:"column", minWidth:0, background:token.color.bgCanvas, overflow:"hidden" }}>

                    {/* Canvas toolbar */}
                    <div style={{ display: isMobile ? "none" : "flex", alignItems:"center", padding:"5px 10px", borderBottom:`1px solid ${token.color.border}`, background:token.color.bg, flexShrink:0 }}>
                        {/* Left: block / WAT toggle */}
                        <div style={{ display:"flex", gap:2 }}>
                            {([
                                { id: "blocks" as const, label: <><Icon.Layers size={11} /> {pack.workspace.ui.canvas_tab_blocks}</> },
                                { id: "wat"    as const, label: <><Icon.File size={11} /> {pack.workspace.ui.canvas_tab_wat}</> },
                                { id: "ai"     as const, label: <><Icon.Sparkle size={11} /> AI</> },
                            ]).map(({ id, label }) => (
                                <button key={id} onClick={() => setCanvasTab(id)}
                                    style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", border:"none", borderRadius:token.radius.sm, background: canvasTab===id ? token.color.bgSubtle : "none", cursor:"pointer", color: canvasTab===id ? token.color.fg : token.color.fgMuted, fontSize:token.font.size.fs11, fontWeight: canvasTab===id ? 600 : 400, transition:"all 0.1s" }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        {/* Right: tools dropdown */}
                        <div style={{ marginLeft:"auto", position:"relative" }} ref={toolsMenuRef}>
                            <button onClick={() => setShowToolsMenu(o => !o)}
                                style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 9px", border:`1px solid ${showToolsMenu ? token.color.fg : token.color.border}`, borderRadius:token.radius.sm, background: showToolsMenu ? token.color.bgSubtle : "none", cursor:"pointer", color: showToolsMenu ? token.color.fg : token.color.fgMuted, fontSize:token.font.size.fs11, fontWeight:500, transition:"all 0.1s" }}
                                onMouseEnter={e => { if (!showToolsMenu) { e.currentTarget.style.background = token.color.bgSubtle; e.currentTarget.style.color = token.color.fg; } }}
                                onMouseLeave={e => { if (!showToolsMenu) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = token.color.fgMuted; } }}
                            >
                                <Icon.Settings size={11} />{pack.workspace.ui.tools_label}
                                <span style={{ fontSize:9, marginLeft:2, opacity:0.7 }}>▾</span>
                            </button>
                            {showToolsMenu && (
                                <div style={{ position:"absolute", top:"calc(100% + 4px)", right:0, minWidth:170, background:token.color.bgRaised, border:`1px solid ${token.color.border}`, borderRadius:token.radius.sm, boxShadow:"0 4px 12px rgba(0,0,0,0.25)", padding:4, zIndex:20, display:"flex", flexDirection:"column", gap:1 }}>
                                    {([
                                        { label: pack.workspace.ui.tool_boundary_2d, icon:<Icon.Grid size={12} />,   href:"/tools/boundary/2d" },
                                        { label: pack.workspace.ui.tool_boundary_3d, icon:<Icon.Layers size={12} />, href:"/tools/boundary/3d" },
                                        { label: pack.workspace.ui.tool_track,       icon:<Icon.Play size={12} />,   href:"/tools/track" },
                                    ] as const).map(({ label, icon, href }) => (
                                        <button key={href} onClick={() => { setShowToolsMenu(false); router.push(href); }}
                                            style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"5px 10px", border:"none", borderRadius:token.radius.sm, background:"none", cursor:"pointer", color:token.color.fgMuted, fontSize:token.font.size.fs11, fontWeight:500, textAlign:"left", transition:"all 0.1s" }}
                                            onMouseEnter={e => { e.currentTarget.style.background = token.color.bgSubtle; e.currentTarget.style.color = token.color.fg; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = token.color.fgMuted; }}
                                        >
                                            {icon}{label}
                                        </button>
                                    ))}
                                    {isOwner && fileId && (
                                        <>
                                            <div style={{ height:1, background:token.color.border, margin:"4px 0" }} />
                                            <button
                                                onClick={() => { setShowToolsMenu(false); setExportCppOpen(true); }}
                                                style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"5px 10px", border:"none", borderRadius:token.radius.sm, background:"none", cursor:"pointer", color:token.color.fgMuted, fontSize:token.font.size.fs11, fontWeight:500, textAlign:"left", transition:"all 0.1s" }}
                                                onMouseEnter={e => { e.currentTarget.style.background = token.color.bgSubtle; e.currentTarget.style.color = token.color.fg; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = token.color.fgMuted; }}
                                            >
                                                <Icon.Download size={12} />{pack.workspace.ui.export_cpp_menu}
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Canvas area */}
                    <div style={{ flex:1, position:"relative", overflow:"hidden", display: canvasTab === "blocks" ? undefined : "none" }}>
                        <div ref={blocklyDivRef} style={{ position:"absolute", inset:0 }} />
                    </div>
                    {canvasTab === "wat" && (
                        <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
                            {/* Floating control bar */}
                            <div style={{ position:"absolute", top:8, right:24, zIndex:10, display:"flex", alignItems:"center", gap:4 }}>
                                <select
                                    value={watLang}
                                    onChange={e => setWatLang(e.target.value as "wat" | "cpp" | "py" | "js")}
                                    disabled={translating}
                                    style={{ padding:"3px 6px", fontSize:token.font.size.fs11, border:`1px solid ${token.color.border}`, borderRadius:token.radius.sm, background:token.color.bgRaised, color:token.color.fgMuted, cursor:"pointer", opacity: translating ? 0.5 : 1 }}
                                >
                                    <option value="wat">WAT</option>
                                    <option value="cpp">C++</option>
                                    <option value="py">Python</option>
                                    <option value="js">JavaScript</option>
                                </select>
                                <button
                                    onClick={() => { const src = watLang === "wat" ? watSource : (translatedSource ?? ""); navigator.clipboard.writeText(src); }}
                                    disabled={translating || !(watLang === "wat" ? watSource : translatedSource)}
                                    style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 8px", fontSize:token.font.size.fs11, border:`1px solid ${token.color.border}`, borderRadius:token.radius.sm, background:token.color.bgRaised, color:token.color.fgMuted, cursor:"pointer" }}
                                >
                                    Copy
                                </button>
                                {watLang === "cpp" && (
                                    <div style={{ position:"relative", display:"inline-flex", alignItems:"stretch" }}>
                                    <button
                                        onClick={handleCompile}
                                        disabled={compiling || !watSource}
                                        style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 8px", fontSize:token.font.size.fs11, border:`1px solid ${token.color.border}`, borderRight:"none", borderRadius:`${token.radius.sm} 0 0 ${token.radius.sm}`, background:token.color.bgRaised, color:token.color.fgMuted, cursor:"pointer", opacity: compiling || !watSource ? 0.5 : 1 }}
                                    >
                                        {compiling ? "Compiling…" : (targetOs === "auto" ? "Compile" : `Compile (${OS_LABEL[targetOs]})`)}
                                    </button>
                                    <button
                                        onClick={() => setOsMenuOpen(o => !o)}
                                        disabled={compiling}
                                        title={pack.workspace.ui.build_os_title}
                                        aria-label={pack.workspace.ui.build_os_aria}
                                        style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", padding:"3px 5px", fontSize:token.font.size.fs11, border:`1px solid ${token.color.border}`, borderRadius:`0 ${token.radius.sm} ${token.radius.sm} 0`, background:token.color.bgRaised, color:token.color.fgMuted, cursor:"pointer", opacity: compiling ? 0.5 : 1 }}
                                    >
                                        <Icon.Chevron dir="down" size={11} />
                                    </button>
                                    {osMenuOpen && (
                                        <>
                                            <div onClick={() => setOsMenuOpen(false)} style={{ position:"fixed", inset:0, zIndex:40 }} />
                                            <div style={{ position:"absolute", top:"calc(100% + 4px)", right:0, zIndex:41, minWidth:150, padding:4, background:token.color.bgRaised, border:`1px solid ${token.color.border}`, borderRadius:token.radius.sm, boxShadow:"0 6px 18px rgba(0,0,0,0.35)", display:"flex", flexDirection:"column", gap:2 }}>
                                                {OS_OPTIONS.map(os => (
                                                    <button
                                                        key={os}
                                                        onClick={() => { setTargetOs(os); setOsMenuOpen(false); }}
                                                        style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"5px 8px", fontSize:token.font.size.fs11, border:"none", borderRadius:token.radius.sm, background: targetOs === os ? token.color.surfaceHover : "transparent", color: targetOs === os ? token.color.accent : token.color.fg, cursor:"pointer", fontWeight: targetOs === os ? 700 : 500, textAlign:"left" }}
                                                    >
                                                        <span>{OS_LABEL[os]}</span>
                                                        {targetOs === os && <span>✓</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                    </div>
                                )}
                            </div>
                            {watLang === "cpp" && compileProgress && (
                                <BuildSnackbar
                                    status={compileProgress.status}
                                    message={compileProgress.message}
                                    step={compileProgress.step}
                                    total={compileProgress.total}
                                    onDismiss={() => setCompileProgress(null)}
                                    position="absolute"
                                    zIndex={15}
                                />
                            )}
                            {translating
                                ? <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:token.color.fgSubtle, fontSize:token.font.size.fs12, fontFamily:token.font.family.mono }}>Translating…</div>
                                : watLang === "wat"
                                    ? watSource
                                        ? <Prism language="wasm" style={theme === "dark" ? oneDark : oneLight} customStyle={{ height:"100%", overflowY:"scroll", overflowX:"auto", margin:0, padding:16, fontSize:token.font.size.fs12, fontFamily:token.font.family.mono, color:token.color.fg, lineHeight:1.7, whiteSpace:"pre", background:token.color.bgCanvas }} codeTagProps={{ style: { fontFamily: token.font.family.mono, background: "transparent" } }}>{watSource}</Prism>
                                        : <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:token.color.fgSubtle, fontSize:token.font.size.fs12, fontFamily:token.font.family.mono }}>{pack.workspace.ui.wat_empty}</div>
                                    : translatedSource
                                        ? <Prism language={watLang === "py" ? "python" : watLang === "js" ? "javascript" : "cpp"} style={theme === "dark" ? oneDark : oneLight} customStyle={{ height:"100%", overflowY:"scroll", overflowX:"auto", margin:0, padding:16, fontSize:token.font.size.fs12, fontFamily:token.font.family.mono, color:token.color.fg, lineHeight:1.7, whiteSpace:"pre", background:token.color.bgCanvas }} codeTagProps={{ style: { fontFamily: token.font.family.mono, background: "transparent" } }}>{translatedSource}</Prism>
                                        : <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:token.color.fgSubtle, fontSize:token.font.size.fs12, fontFamily:token.font.family.mono }}>{pack.workspace.ui.wat_empty}</div>
                            }
                        </div>
                    )}
                    {canvasTab === "ai" && (
                        <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0, overflow:"hidden" }}>
                            {chatDiffData ? (
                                <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>
                                    {/* Left: diff Blockly preview */}
                                    <div style={{ flex:1, display:"flex", flexDirection:"column", borderRight:`1px solid ${token.color.border}`, overflow:"hidden" }}>
                                        <div style={{ padding:"5px 12px", background:token.color.bgRaised, borderBottom:`1px solid ${token.color.border}`, display:"flex", gap:14, alignItems:"center"}}>
                                            <Inline style={{flex:1, width:"100%", fontSize:token.font.size.fs13, fontWeight:token.font.weight.black, flexShrink:0 }}>
                                                <span style={{ color: token.color.addBlockColor }}>{pack.workspace.ai.diff_added}</span>
                                                <span style={{ color: token.color.deleteBlockColor }}>{pack.workspace.ai.diff_removed}</span>
                                                <span style={{ color: token.color.nochangeBlockColor }}>{pack.workspace.ai.diff_unchanged}</span>
                                            </Inline>
                                            {/* Action bar */}
                                            {(chatOutput || chatResult) && (
                                                <Inline gap="sp2">
                                                    {chatResult && (
                                                        <Button variant="run" size="sm" onClick={() => {
                                                            const ws = workspaceRef.current;
                                                            if (!ws || !chatResult) return;
                                                            try {
                                                                ws.clear();
                                                                loadWorkspaceState(ws, chatResult as Parameters<typeof Blockly.serialization.workspaces.load>[0]);
                                                                setCanvasTab("blocks");
                                                            } catch (err) {
                                                                showErrorModal(`Block apply error: ${err instanceof Error ? err.message : String(err)}`);
                                                            }
                                                        }}>{pack.workspace.ai.apply}</Button>
                                                    )}
                                                    {/*                                                 {chatOutput && <Button variant="blocks" size="sm" onClick={() => navigator.clipboard.writeText(chatOutput)}>복사</Button>} */}
                                                    <Button variant="danger" size="sm" onClick={() => { setChatOutput(""); setChatResult(null); setChatDiffData(null); }}>{pack.workspace.ai.cancel}</Button>
                                                </Inline>
                                            )}
                                        </div>
                                        <div style={{ flex:1, position:"relative", minHeight:0 }}>
                                            <div ref={chatDiffDivRef} style={{ position:"absolute", inset:0 }} />
                                        </div>
                                    </div>
                                    {/* Right: streaming text */}
                                    <div style={{ width:380, flexShrink:0, overflowY:"auto" }}>
                                        {chatOutput ? (
                                            <pre style={{ margin:0, padding:"16px", fontSize:token.font.size.fs12, color:token.color.fgMuted, lineHeight:1.75, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                                                {chatOutput}{chatStreaming && <span style={{ opacity:0.5 }}>▌</span>}
                                            </pre>
                                        ) : (
                                            <div style={{ padding:"32px 16px", textAlign:"center", color:token.color.fgMuted, fontSize:token.font.size.fs12 }}>
                                                {chatStreaming ? pack.workspace.ai.streaming : pack.workspace.ai.idle}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : chatOutput ? (
                                <pre style={{ flex:1, margin:0, padding:"16px", fontSize:token.font.size.fs12, color:token.color.fgMuted, lineHeight:1.75, whiteSpace:"pre-wrap", wordBreak:"break-word", overflowY:"auto" }}>
                                    {chatOutput}{chatStreaming && <span style={{ opacity:0.5 }}>▌</span>}
                                </pre>
                            ) : (
                                <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:token.color.fgSubtle, fontSize:token.font.size.fs12, fontFamily:token.font.family.mono }}>
                                    {pack.workspace.ai.hint}
                                </div>
                            )}
                            
                        </div>
                    )}
                </main>

                {/* Right panel: console + result */}
                <aside style={{ display: isMobile && mobileTab !== "result" ? "none" : "flex", flexDirection:"column", borderLeft: isMobile ? "none" : `1px solid ${token.color.border}`, background:token.color.bg, overflow:"hidden" }}>
                    {/* Tabs (hidden on mobile — bottom tab bar handles it) */}
                    <div style={{ display: isMobile ? "none" : "flex", padding:"8px 8px 0", gap:2, borderBottom:`1px solid ${token.color.border}` }}>
                        <button onClick={() => setRightTab("console")}
                            style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"7px 12px", fontSize:token.font.size.fs12, border:"none", background:"none", cursor:"pointer", color:rightTab==="console" ? token.color.fg : token.color.fgMuted, fontWeight:500, borderRadius:`${token.radius.sm} ${token.radius.sm} 0 0`, marginBottom:-1, borderBottom:rightTab==="console" ? `2px solid ${token.color.accent}` : "2px solid transparent" }}>
                            <Icon.Terminal size={11}/> {pack.workspace.ui.console_tab}
                        </button>
                        <button onClick={() => setRightTab("result")}
                            style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"7px 12px", fontSize:token.font.size.fs12, border:"none", background:"none", cursor:"pointer", color:rightTab==="result" ? token.color.fg : token.color.fgMuted, fontWeight:500, borderRadius:`${token.radius.sm} ${token.radius.sm} 0 0`, marginBottom:-1, borderBottom:rightTab==="result" ? `2px solid ${token.color.accent}` : "2px solid transparent" }}>
                            {pack.workspace.ui.result_tab}
                        </button>
                        <button onClick={() => setRightTab("infos")}
                            style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"7px 12px", fontSize:token.font.size.fs12, border:"none", background:"none", cursor:"pointer", color:rightTab==="infos" ? token.color.fg : token.color.fgMuted, fontWeight:500, borderRadius:`${token.radius.sm} ${token.radius.sm} 0 0`, marginBottom:-1, borderBottom:rightTab==="infos" ? `2px solid ${token.color.accent}` : "2px solid transparent" }}>
                            {pack.workspace.ui.infos_tab}
                            {infos.filter(i => i.level !== "info").length > 0 && (
                                <span style={{ marginLeft:2, padding:"1px 5px", borderRadius:999, background: infos.some(i => i.level === "error") ? token.color.danger : token.color.warning, color:"#fff", fontSize:token.font.size.fs10, fontWeight:700, lineHeight:1.4 }}>
                                    {infos.filter(i => i.level !== "info").length}
                                </span>
                            )}
                        </button>
                    </div>

                    <div style={{ display: rightTab === "console" ? "flex" : "none", flexDirection:"column", flex:1, minHeight:0 }}>
                            {/* Result card */}
                            <div style={{ padding:14, borderBottom:`1px solid ${token.color.borderSubtle}` }}>
                                <div style={{ padding:14, background:token.color.bgSubtle, border:`1px solid ${token.color.border}`, borderRadius:token.radius.md }}>
                                    <div style={{ fontSize:token.font.size.fs10, textTransform:"uppercase", letterSpacing:"0.06em", color:token.color.fgSubtle, fontWeight:600 }}>{pack.workspace.ui.output_label}</div>
                                    <div style={{ fontFamily:token.font.family.mono, fontSize:result ? token.font.size.fs32 : token.font.size.fs24, fontWeight:500, letterSpacing:"-0.02em", color:result ? token.color.fgStrong : token.color.fgSubtle, lineHeight:1.1, marginTop:4 }}>
                                        {result ?? "—"}
                                    </div>
                                    <div style={{ marginTop:6, fontSize:token.font.size.fs11, color:token.color.success, fontFamily:token.font.family.mono, display:"flex", alignItems:"center", gap:4 }}>
                                        <StatusDot runState={runState} />
                                        {runState==="idle" ? pack.workspace.ui.status_waiting
                                            : runState==="compiling" ? pack.workspace.ui.status_converting
                                            : runState==="running" ? pack.workspace.ui.status_running
                                            : runState==="done" ? pack.workspace.ui.status_done
                                            : pack.workspace.ui.status_error}
                                    </div>
                                </div>
                            </div>
                            {/* Log */}
                            <div className="simulizer-log" style={{ flex:1, overflowY:"auto", padding:"8px 0" }} ref={logAreaRef}>
                                <div data-placeholder style={{ padding:"3px 14px", color:token.color.fgSubtle, fontFamily:token.font.family.mono, fontSize:token.font.size.fs11 }}>
                                    {pack.workspace.ui.log_placeholder}
                                </div>
                            </div>
                            {/* Interactive input prompt (Asyncify run paused on sim_input_*) */}
                            {inputRequest && (
                                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", borderTop:`1px solid ${token.color.border}`, background:token.color.bgSubtle }}>
                                    <span style={{ fontFamily:token.font.family.mono, fontSize:token.font.size.fs11, color:token.color.fgMuted, whiteSpace:"nowrap" }}>
                                        {inputRequest.kind === "i32" ? pack.workspace.input.int_label : pack.workspace.input.float_label}
                                    </span>
                                    <input
                                        autoFocus
                                        type="number"
                                        step={inputRequest.kind === "i32" ? "1" : "any"}
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") submitInput(); }}
                                        style={{ flex:1, minWidth:0, padding:"6px 8px", fontSize:token.font.size.fs12, fontFamily:token.font.family.mono, background:token.color.bg, color:token.color.fg, border:`1px solid ${token.color.border}`, borderRadius:6 }}
                                    />
                                    <Button onClick={submitInput}>{pack.workspace.input.submit}</Button>
                                </div>
                            )}
                            {/* Footer */}
                            <div style={{ padding:"8px 14px", borderTop:`1px solid ${token.color.border}`, fontFamily:token.font.family.mono, fontSize:token.font.size.fs10, color:token.color.fgSubtle, display:"flex", alignItems:"center", gap:6 }}>
                                <span style={{ width:6, height:6, borderRadius:"50%", background:token.color.success, display:"inline-block" }} />
                                {tfBackend === "initializing" ? pack.workspace.ui.backend_initializing : `${tfBackend} · ${pack.workspace.ui.backend_ready}`}
                            </div>
                    </div>

                    {rightTab === "infos" && (
                        <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
                            {infos.length === 0 ? (
                                <div style={{ padding:"3px 14px", color:token.color.fgSubtle, fontFamily:token.font.family.mono, fontSize:token.font.size.fs11 }}>
                                    {pack.workspace.ui.infos_empty}
                                </div>
                            ) : infos.map((entry, i) => {
                                const levelColor = entry.level === "error" ? token.color.danger : entry.level === "warn" ? token.color.warning : token.color.fgMuted;
                                const icon = entry.level === "error" ? "✕" : entry.level === "warn" ? "⚠" : "ℹ";
                                const clickable = Boolean(entry.blockId);
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => focusInfoEntry(entry)}
                                        disabled={!clickable}
                                        title={clickable ? pack.workspace.ui.block_nav_title : undefined}
                                        style={{
                                            display:"flex",
                                            alignItems:"flex-start",
                                            gap:8,
                                            width:"100%",
                                            padding:"3px 14px",
                                            fontFamily:token.font.family.mono,
                                            fontSize:token.font.size.fs11,
                                            lineHeight:1.6,
                                            border:"none",
                                            background:"none",
                                            textAlign:"left",
                                            cursor: clickable ? "pointer" : "default",
                                            opacity: clickable ? 1 : 0.9,
                                        }}
                                    >
                                        <span style={{ color:levelColor, flexShrink:0, marginTop:1 }}>{icon}</span>
                                        <span style={{ color:token.color.fg, flex:1, wordBreak:"break-all" }}>{entry.message}</span>
                                        {entry.kind && (
                                            <span style={{ color:token.color.fgSubtle, flexShrink:0 }}>{{ no_main: "no-main-block", duplicate_decl: "redefinition", compile_fail: "compile-error", no_return: "no-return" }[entry.kind]}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {rightTab === "result" && (
                        <div style={{ padding:"32px 20px", textAlign:"center", display:"flex", flexDirection:"column", gap:8 }}>
                            <div style={{ fontFamily:token.font.family.mono, fontSize:token.font.size.fs72, fontWeight:500, letterSpacing:"-0.02em", color:result ? token.color.fgStrong : token.color.fgSubtle, lineHeight:1 }}>
                                {result ?? "—"}
                            </div>
                            <div style={{ color:token.color.fgMuted, fontFamily:token.font.family.mono, fontSize:token.font.size.fs12 }}>{pack.workspace.ui.output_label}</div>
                            <div style={{ marginTop:24, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:1, background:token.color.border, border:`1px solid ${token.color.border}`, borderRadius:token.radius.md, overflow:"hidden" }}>
                                {[
                                    [pack.workspace.ui.stat_backend, lastRunBackend ?? "—"],
                                    [pack.workspace.ui.stat_status, runState],
                                    [pack.workspace.ui.stat_run_time, formatRunDuration(lastRunDurationMs)],
                                ].map(([label, val]) => (
                                    <div key={label} style={{ padding:"10px 8px", background:token.color.bg, display:"flex", flexDirection:"column", gap:2 }}>
                                        <span style={{ fontSize:token.font.size.fs10, textTransform:"uppercase", letterSpacing:"0.06em", color:token.color.fgSubtle, fontWeight:600 }}>{label}</span>
                                        <b style={{ fontFamily:token.font.family.mono, fontSize:token.font.size.fs13, color:token.color.fg, fontWeight:500 }}>{val}</b>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                </aside>
            </div>

            {/* Mobile bottom tab bar */}
            {isMobile && (
                <div style={{
                    display: "flex",
                    borderTop: `1px solid ${token.color.border}`,
                    background: token.color.bg,
                    flexShrink: 0,
                }}>
                    {([
                        { id: "blocks" as const, icon: <Icon.Layers size={14} />, label: pack.workspace.ui.canvas_tab_blocks },
                        { id: "result" as const, icon: <Icon.Terminal size={14} />, label: pack.workspace.ui.result_tab },
                    ]).map(({ id, icon, label }) => {
                        const active = mobileTab === id;
                        return (
                            <button
                                key={id}
                                onClick={() => setMobileTab(id)}
                                style={{
                                    flex: 1,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 6,
                                    padding: "12px 8px",
                                    background: "none",
                                    border: "none",
                                    borderTop: `2px solid ${active ? token.color.accent : "transparent"}`,
                                    color: active ? token.color.accent : token.color.fgMuted,
                                    fontSize: token.font.size.fs12,
                                    fontWeight: active ? 600 : 500,
                                    cursor: "pointer",
                                }}
                            >
                                {icon}
                                <span>{label}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {!isMobile && <BlockManagerModal
                open={showBlocks}
                mode={blockMode}
                blockData={blockData}
                pack={pack}
                sharePanel={isOwner && fileMeta ? (
                    <ShareControl
                        file={fileMeta}
                        onChange={updated => setFileMeta(prev => prev ? { ...prev, visibility: updated.visibility } : prev)}
                    />
                ) : undefined}
                onClose={() => setShowBlocks(false)}
                onModeChange={setBlockMode}
                onCopyToClipboard={(text) => navigator.clipboard.writeText(text)}
                onResetWorkspace={() => { handleReset(); setShowBlocks(false); }}
            />}

            {!isMobile && <LatexOcrModal
                open={showLatexOcr}
                imageUrl={ocrImageUrl}
                latex={ocrLatex}
                streaming={ocrStreaming}
                fileInputRef={ocrFileInputRef}
                onClose={() => { ocrAbortRef.current?.abort(); setShowLatexOcr(false); }}
                onUpload={handleLatexOcr}
                onApply={() => handleLatexOcrApply(ocrLatex)}
            />}

            {!isMobile && <ConstManagerModal
                open={showConstMgr}
                onClose={() => setShowConstMgr(false)}
                onAdd={handleAddConsts}
                pack={pack}
            />}

            {!isMobile && <BoundaryManagerModal
                open={showBdMgr}
                tab={bdMgrTab}
                arrays2d={bd2Arrays}
                arrays3d={bd3Arrays}
                name2d={newBd2Name}
                name3d={newBd3Name}
                fileInputRef2d={bd2FileInputRef}
                fileInputRef3d={bd3FileInputRef}
                onClose={() => setShowBdMgr(false)}
                onTabChange={setBdMgrTab}
                onName2dChange={setNewBd2Name}
                onName3dChange={setNewBd3Name}
                onFile2d={handleBd2FileInput}
                onFile3d={handleBd3FileInput}
                onRemove2d={handleRemoveBd2}
                onRemove3d={handleRemoveBd3}
            />}

            <ErrorModal
                message={errorModal}
                onClose={() => setErrorModal(null)}
                onCopy={(message) => navigator.clipboard.writeText(message)}
            />

            {exportCppOpen && (
                <Modal width={460} onClose={() => !exporting && setExportCppOpen(false)}>
                    <ModalHeader onClose={() => !exporting && setExportCppOpen(false)}>
                        {pack.workspace.exportCpp.title}
                    </ModalHeader>
                    <ModalBody>
                        <p style={{ margin: 0, fontSize: token.font.size.fs13, color: token.color.fgMuted, lineHeight: 1.55 }}>
                            {pack.workspace.exportCpp.desc_pre}<b>{pack.workspace.exportCpp.desc_bold}</b>{pack.workspace.exportCpp.desc_post.replace("$0", `('${fileName || "untitled"} (C++)')`)}
                        </p>
                        <ul style={{ margin: `${token.space.sp3} 0 0 ${token.space.sp4}`, padding: 0, fontSize: token.font.size.fs12, color: token.color.fgSubtle, lineHeight: 1.7 }}>
                            <li>{pack.workspace.exportCpp.bullet1}</li>
                            <li>{pack.workspace.exportCpp.bullet2}</li>
                            <li>{pack.workspace.exportCpp.bullet3}</li>
                        </ul>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" size="sm" onClick={() => setExportCppOpen(false)} disabled={exporting}>
                            {pack.workspace.exportCpp.cancel}
                        </Button>
                        <Button
                            variant="accent"
                            size="sm"
                            leading={exporting ? <Spinner size="sm" /> : <Icon.Download size={11} />}
                            onClick={handleConfirmExportToCpp}
                            disabled={exporting}
                        >
                            {exporting ? pack.workspace.exportCpp.exporting : pack.workspace.exportCpp.confirm}
                        </Button>
                    </ModalFooter>
                </Modal>
            )}

            {exportToast && (
                <div style={{
                    position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
                    zIndex: 100, display: "inline-flex", alignItems: "center", gap: 12,
                    padding: "10px 14px",
                    background: token.color.bgRaised, border: `1px solid ${token.color.border}`,
                    borderRadius: token.radius.md, boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
                    color: token.color.fg, fontSize: token.font.size.fs12, fontFamily: token.font.family.mono,
                }}>
                    <span>{exportToast.message}</span>
                    {exportToast.href && (
                        <a
                            href={exportToast.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: token.color.accent, textDecoration: "none", fontWeight: 600 }}
                        >
                            {pack.workspace.exportCpp.open}
                        </a>
                    )}
                    <button
                        onClick={() => setExportToast(null)}
                        style={{ marginLeft: 4, background: "none", border: "none", color: token.color.fgSubtle, cursor: "pointer", display: "inline-flex", padding: 0 }}
                    >
                        <Icon.X size={11} />
                    </button>
                </div>
            )}

        </div>
    );
};

export default BlockWorkspace;
