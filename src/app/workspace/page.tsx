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
import { xmlLatexBlocks } from "@/utils/blockly/latex";
import { xmlI32Blocks } from "@/utils/blockly/i32";
import { xmlLocalBlocks } from "@/utils/blockly/locals";
import { xmlTensorBlocks, registerDynamicTensorBlocks } from "@/utils/blockly/tensor";
import { mat_data_to_image_url, vec_field_to_image_url } from "@/utils/wasm/tensor";
import { CUSTOM_BLOCKS } from "@/utils/blockly/$blocks";

import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";
import { Inline } from "@/components/atoms/layout/Inline";
import { StatusDot } from "@/components/atoms/StatusDot";
import { Icon } from "@/components/atoms/Icons";
import { Logo } from "@/components/atoms/Logo";
import { Spinner } from "@/components/atoms/Spinner";
import { TopbarBrand } from "@/components/organisms/TopbarBrand";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/organisms/Modal";
import { token } from "@/components/tokens";

import { useConsolePanel } from "@/components/console";
import useLanguagePack from "@/hooks/useLanguagePack";
import langpack from "@/lang/lang";
import { xmlF64Blocks } from "@/utils/blockly/f64";
import { xmlFlowBlocks } from "@/utils/blockly/flow";
import { xmlVectorBlocks } from "@/utils/blockly/vector";
import { xmlBoundaryBlocks } from "@/utils/blockly/boundary";
import { generateDiffTree, loadTreeDiff } from "@/lib/treediff/treediff";
import { NormalizeContext, unnormalize, normalize } from "@/lib/treediff/blockdiff";
import { Prism } from "react-syntax-highlighter";
import katex from "katex";
import "katex/dist/katex.min.css";

// Register Blockly locale explicitly to prevent context menu labels from being undefined
Blockly.setLocale(BlocklyEn as { [key: string]: any });

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

function buildSimphyTheme(name: string) {
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
    return [
        ...unpack(translateBlockSet(CUSTOM_BLOCKS, msgs)),
        {
            type: "i32_not",
            message0: "! %1",
            args0: [{ type: "input_value", name: "VALUE", check: "i32" }],
            output: "bool", colour: 60, tooltip: "logical NOT",
            inputsInline: true,
        },
        {
            type: "wasm_return_i32",
            message0: msgs["wasm_return_i32"]?.[0] ?? "return int %1",
            args0: [{ type: "input_value", name: "VALUE", check: "i32" }],
            previousStatement: null, nextStatement: null, colour: 0, tooltip: "return int",
        },
        {
            type: "wasm_return_f64",
            message0: msgs["wasm_return_f64"]?.[0] ?? "return float %1",
            args0: [{ type: "input_value", name: "VALUE", check: "f64" }],
            previousStatement: null, nextStatement: null, colour: 0, tooltip: "return float",
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
            colour: 290, tooltip: "WebAssembly main function",
        },
    ];
}

// Compiler [Blockly → simphy AST]

type SimphyExpr = simulizer.Expr;

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

function registerCustomFuncBlocks(spec: CustomFuncSpec) {
    const { id, name, retType, params } = spec;

    if (!Blockly.Blocks[`wasm_func_def_${id}`]) {
        Blockly.Blocks[`wasm_func_def_${id}`] = {
            init(this: Blockly.Block) {
                this.appendDummyInput()
                    .appendField(`function ${name}`)
                    .appendField(` → ${displayType(retType)}`);
                params.forEach(p =>
                    this.appendDummyInput().appendField(`  param ${p.name}: ${displayType(p.type)}`)
                );
                this.appendStatementInput("BODY").appendField("body");
                this.setColour(290);
                this.setTooltip(`function ${name}`);
            },
        };
    }

    if (!Blockly.Blocks[`wasm_call_${id}`]) {
        Blockly.Blocks[`wasm_call_${id}`] = {
            init(this: Blockly.Block) {
                this.appendDummyInput().appendField(`${name}(`);
                params.forEach((p, i) =>
                    this.appendValueInput(`ARG${i}`).setCheck(p.type).appendField(`${p.name}:`)
                );
                this.appendDummyInput().appendField(")");
                if (retType !== "void") {
                    this.setOutput(true, retType);
                } else {
                    this.setPreviousStatement(true);
                    this.setNextStatement(true);
                }
                this.setColour(290);
                this.setInputsInline(params.length <= 2);
                this.setTooltip(`call ${name}`);
            },
        };
    }
}

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
    const func = new simulizer.FuncDef(spec.name, paramDefs, retType);
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
function coerce(expr: SimphyExpr, target: simulizer.Type): SimphyExpr {
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

/** Expression block → SimphyExpr */
function blockToExpr(block: Blockly.Block | null, ctx: CompileCtx): SimphyExpr | null {
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
        case "select_i32":
        case "select_f64": {
            const cond = blockToExpr(block.getInputTargetBlock("COND"),    ctx);
            const onT    = blockToExpr(block.getInputTargetBlock("TRUE"),    ctx);
            const onF    = blockToExpr(block.getInputTargetBlock("FALSE"), ctx);
            if (!cond || !onT || !onF) return null;
            return new simulizer.Select(coerce(cond, simulizer.i32), onT, onF);
        }
        

        default: {
            // Custom function call (non-void → expr)
            if (block.type.startsWith("wasm_call_")) {
                const id = block.type.slice("wasm_call_".length);
                const spec = _customFuncSpecs.find(f => f.id === id);
                if (spec && spec.retType !== "void") {
                    const args = spec.params.map((p, i) => {
                        const e = blockToExpr(block.getInputTargetBlock(`ARG${i}`), ctx);
                        return e ? coerce(e, p.type === "i32" ? simulizer.i32 : simulizer.f64) : null;
                    }).filter((a): a is SimphyExpr => a !== null);
                    return new simulizer.Call(spec.name, args, retTypeMap[spec.retType]);
                }
            }
            return null;
        }
    }
}

/** Single statement block → SimphyExpr | null */
function stmtBlockToExpr(block: Blockly.Block, ctx: CompileCtx): SimphyExpr | null {

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
            if (block.type.startsWith("wasm_call_")) {
                const id = block.type.slice("wasm_call_".length);
                const spec = _customFuncSpecs.find(f => f.id === id);
                if (spec && spec.retType === "void") {
                    const args = spec.params.map((p, i) => {
                        const e = blockToExpr(block.getInputTargetBlock(`ARG${i}`), ctx);
                        return e ? coerce(e, p.type === "i32" ? simulizer.i32 : simulizer.f64) : null;
                    }).filter((a): a is SimphyExpr => a !== null);
                    return new simulizer.Call(spec.name, args, simulizer.void_);
                }
            }
            const expr = blockToExpr(block, ctx);
            return expr ? new simulizer.Drop(expr) : null;
        }
    }
}

/** Entire statement chain → Expr[] */
function stmtChainToExprs(block: Blockly.Block | null, ctx: CompileCtx): SimphyExpr[] {
    const exprs: SimphyExpr[] = [];
    let cur: Blockly.Block | null = block;
    while (cur) {
        const e = stmtBlockToExpr(cur, ctx);
        if (e) exprs.push(e);
        cur = cur.getNextBlock();
    }
    return exprs;
}

/** wasm_func_main → FuncDef | error message */
function buildFuncDef(
    mainBlock: Blockly.Block,
): { func: simulizer.FuncDef; module: simulizer.ModuleDef } | string {
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

    if (body.length === 0 && !declaredRetType.equals(simulizer.void_)) {
        return "Body is empty. Add a return block.";
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
    ${xmlLocalBlocks(tb.var)}
    ${xmlFlowBlocks(tb.flow)}
    ${xmlArrayBlocks(tb.array)}
    ${xmlTensorBlocks(tb.tensor)}
    ${xmlVectorBlocks(tb.vector)}
    ${xmlBoundaryBlocks(tb.boundary, tb.boundary_btn)}
    ${xmlLatexBlocks("LaTeX")}
    <category name="${tb.cast}" colour="${45}">
        <block type="f64_from_i32"></block>
        <block type="i32_from_f64"></block>
    </category>
    <category name="${tb.func}" colour="${290}">
        <button text="${tb.func_btn}" callbackKey="OPEN_FUNC_MGR"></button>
        <block type="wasm_func_main"></block>
        <block type="wasm_return_i32"></block>
        <block type="wasm_return_f64"></block>
    </category>
</xml>`;
}

function buildToolboxXml(funcs: CustomFuncSpec[], p: langpack): string {
    const base = buildBaseToolboxXml(p);
    if (funcs.length === 0) return base;
    const funcBlocks = funcs.map(f =>
        `<block type="wasm_func_def_${f.id}"></block>\n        <block type="wasm_call_${f.id}"></block>`
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

interface InfoEntry {
    level: "info" | "warn" | "error";
    message: string;
    blockId?: string;
}

const BlocklyWasmIDE: React.FC = () => {
    const blocklyDivRef = useRef<HTMLDivElement>(null);
    const workspaceRef  = useRef<Blockly.WorkspaceSvg | null>(null);
    const wasmWorkerRef = useRef<Worker | null>(null);

    const [runState, setRunState]           = useState<RunState>("idle");
    const [result, setResult]               = useState<string | null>(null);
    const [tfBackend, setTfBackend]         = useState<string>("initializing");
    const [watSource, setWatSource]         = useState<string>("");
    const [customFuncs, setCustomFuncs]     = useState<CustomFuncSpec[]>([]);
    const customFuncsRef                    = useRef<CustomFuncSpec[]>([]);
    const [showFuncMgr, setShowFuncMgr]     = useState(false);
    const [newFuncName, setNewFuncName]     = useState("myFunc");
    const [newFuncRet,  setNewFuncRet]      = useState<"i32"|"f64"|"void">("i32");
    const [newFuncParams, setNewFuncParams] = useState<{name:string;type:"i32"|"f64"}[]>([]);

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

    const [showLatexOcr, setShowLatexOcr] = useState(false);
    const [ocrLatex, setOcrLatex]         = useState("");
    const [ocrStreaming, setOcrStreaming] = useState(false);
    const [ocrImageUrl, setOcrImageUrl]   = useState<string | null>(null);
    const ocrFileInputRef                 = useRef<HTMLInputElement>(null);
    const ocrAbortRef                     = useRef<AbortController | null>(null);

    const [errorModal, setErrorModal] = useState<string | null>(null);
    const showErrorModal = useCallback((msg: string) => setErrorModal(msg), []);

    const [showChatPopover, setShowChatPopover] = useState(false);
    const chatPopoverRef                        = useRef<HTMLDivElement>(null);
    const [canvasTab, setCanvasTab]             = useState<"blocks" | "wat" | "ai">("blocks");
    const [chatPrompt, setChatPrompt]           = useState("");
    const [chatOutput, setChatOutput]           = useState("");
    const [chatResult, setChatResult]           = useState<object | null>(null);
    const [chatStreaming, setChatStreaming]     = useState(false);
    const chatAbortRef                          = useRef<AbortController | null>(null);
    const [chatDiffData, setChatDiffData]       = useState<{ tree: any; modeMap: Record<string, "insert" | "delete" | "common"> } | null>(null);
    const chatPrevStateRef                      = useRef<object | null>(null);
    const chatDiffDivRef                        = useRef<HTMLDivElement>(null);
    const chatDiffWsRef                         = useRef<Blockly.WorkspaceSvg | null>(null);

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
            const res = await fetch("http://localhost:8000/texocr", { method: "POST", body: formData, signal: ctrl.signal });
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
            if (e?.name !== "AbortError") setOcrLatex(prev => prev || "오류가 발생했습니다.");
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
        const clean = latex.trim().replace(/^\$\$|\$\$$/g, "").replace(/^\$|\$$/g, "").trim();
        const block = ws.newBlock("latex_expr");
        block.setFieldValue(clean, "LATEX");
        block.initSvg();
        block.render();
        const metrics = ws.getMetrics();
        block.moveBy(
            metrics.viewLeft + metrics.viewWidth / 2 - 60,
            metrics.viewTop + metrics.viewHeight / 2 - 20,
        );
        ws.centerOnBlock(block.id);
        setShowLatexOcr(false);
    }, []);

    const handleChat = useCallback(async () => {
        const ws = workspaceRef.current;
        if (!ws || !chatPrompt.trim()) return;

        const blocklyJson = JSON.stringify(Blockly.serialization.workspaces.save(ws));

        chatPrevStateRef.current = Blockly.serialization.workspaces.save(ws);
        setChatDiffData(null);

        chatAbortRef.current?.abort();
        const ctrl = new AbortController();
        chatAbortRef.current = ctrl;

        setChatOutput("");
        setChatResult(null);
        setChatStreaming(true);
        let firstChunk = true;

        try {
            const url = new URL("http://127.0.0.1:8000/chat");
            url.searchParams.set("message", chatPrompt.trim());
            url.searchParams.set("blockly_json", blocklyJson);

            const res = await fetch(url.toString(), { signal: ctrl.signal });
            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";

            outer: while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const raw = line.slice(6);
                    if (raw === "[DONE]") break outer;
                    try {
                        const parsed = JSON.parse(raw);
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
                                } catch (e) {
                                    console.error("Diff computation failed:", e);
                                }
                            }
                        }
                    } catch {
                        // JSON이 아닌 라인은 무시
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name !== "AbortError") {
                setChatOutput(prev => prev + `\n\n[오류] ${err instanceof Error ? err.message : String(err)}`);
            }
        } finally {
            setChatStreaming(false);
        }
    }, [chatPrompt]);

    const [showBlocks, setShowBlocks] = useState(false);
    const [blockData, setBlockData]   = useState<string>("");
    const [blockMode, setBlockMode]   = useState<"export" | "import" | "wat">("export");
    const [saveName, setSaveName]     = useState<string>("");
    const fileInputRef                = useRef<HTMLInputElement>(null);
    const [lang, , pack, langReady]   = useLanguagePack();

    const LS_PREFIX = "simphy_blocks_";
    const getSavedList = () =>
        Object.keys(localStorage)
            .filter(k => k.startsWith(LS_PREFIX))
            .map(k => k.slice(LS_PREFIX.length))
            .sort();
    const [savedList, setSavedList] = useState<string[]>(() =>
        typeof window !== "undefined" ? getSavedList() : []
    );

    const { logAreaRef, addLog, addBar, setBar, clearLog, addMatShow, addSeries, logToHolder, visualToHolder } = useConsolePanel();

    // appendToLogArea is used by Worker message handler (visual) to insert DOM directly
    const appendToLogArea = useCallback((el: HTMLElement) => {
        const area = logAreaRef.current;
        if (!area) return;
        const placeholder = area.querySelector("[data-placeholder]");
        if (placeholder) area.removeChild(placeholder);
        area.appendChild(el);
        area.scrollTop = area.scrollHeight;
    }, [logAreaRef]);


    // Create WASM Worker (once on app mount, then reused)
    useEffect(() => {
        const worker = new Worker(
            new URL("@/utils/wasm/wasm-worker.ts", import.meta.url),
            { type: "module" }
        );
        worker.onmessage = (e) => {
            const msg = e.data as import("@/utils/wasm/wasm-worker").WorkerOutMsg;
            if (msg.type === "backend-switched") setTfBackend(msg.backend);
        };
        // Start TF initialization immediately inside Worker
        worker.postMessage({ type: "init" });
        wasmWorkerRef.current = worker;
        return () => {
            worker.terminate();
            wasmWorkerRef.current = null;
        };
    }, []);

    const handleSwitchBackend = useCallback((backend: string) => {
        const worker = wasmWorkerRef.current;
        if (!worker) return;
        setTfBackend("initializing");
        worker.onmessage = (e) => {
            const msg = e.data as import("@/utils/wasm/wasm-worker").WorkerOutMsg;
            if (msg.type === "backend-switched") setTfBackend(msg.backend);
            else if (msg.type === "error") setTfBackend(backend);
        };
        worker.postMessage({ type: "switch-backend", backend });
    }, []);

    // Initialize Blockly
    useEffect(() => {
        registerDynamicTensorBlocks();
        registerDynamicArrayBlocks();
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
            toolbox:  buildBaseToolboxXml(pack),
            grid:     { spacing: 20, length: 3, colour: cssVar("--grid-dot"), snap: true },
            zoom:     { controls: true, wheel: true, startScale: 0.9 },
            trashcan: true,
            theme:    buildSimphyTheme("simphy"),
            renderer: "zelos",
        });

        workspaceRef.current = ws;
        ws.registerButtonCallback("OPEN_FUNC_MGR",   () => setShowFuncMgr(true));
        ws.registerButtonCallback("OPEN_BD2_MGR",    () => { setBdMgrTab("2d"); setShowBdMgr(true); });
        ws.registerButtonCallback("OPEN_BD3_MGR",    () => { setBdMgrTab("3d"); setShowBdMgr(true); });
        ws.registerButtonCallback("OPEN_LATEX_OCR",  () => { setOcrLatex(""); setOcrImageUrl(null); setShowLatexOcr(true); });
        
        const refreshInfo = () => {
            const mainBlock = ws.getAllBlocks(false).find(b => b.type === "wasm_func_main");
            if (!mainBlock) {
                setInfos([{ level: "warn", message: "wasm_func_main 블록이 없습니다." }]);
                return;
            }
            const result = buildFuncDef(mainBlock);
            if (typeof result === "string") {
                setInfos([{ level: "error", message: result }]);
                return;
            }
            const { declarations } = result.func.getLocalTypes();
            const entries: InfoEntry[] = [];
            for (const [name, bucket] of declarations) {
                if (bucket.length > 1) {
                    entries.push({
                        level: "error",
                        message: `변수 '${name}'이(가) ${bucket.length}번 선언되었습니다.`,
                        blockId: bucket[1].blockId,
                    });
                }
            }
            setInfos(entries);
        };
        const handleBlockChange = (event: Blockly.Events.Abstract) => {
            if (event.isUiEvent) return;
            refreshInfo();
        };
        ws.addChangeListener(handleBlockChange);
        
        Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(INITIAL_WORKSPACE_XML), ws);
        return () => {
            ws.removeChangeListener(handleBlockChange);
            ws.dispose();
        };
    }, []);

    // Re-apply Blockly theme when data-theme attribute changes (dark/light mode toggle)
    useEffect(() => {
        const observer = new MutationObserver(() => {
            workspaceRef.current?.setTheme(buildSimphyTheme("simphy"));
            chatDiffWsRef.current?.setTheme(buildSimphyTheme("simphy_diff"));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    // Re-register block text and reload workspace when language changes
    useEffect(() => {
        const ws = workspaceRef.current;
        if (!ws || !langReady) return;
        const defs = buildCustomBlockDefs(pack);
        defs.forEach(def => {
            Blockly.Blocks[(def as { type: string }).type] = {
                init(this: Blockly.Block) { this.jsonInit(def); },
            };
        });
        // Restore dynamic blocks that were overwritten above
        registerDynamicTensorBlocks();
        registerDynamicArrayBlocks();
        const savedXml = Blockly.Xml.workspaceToDom(ws);
        ws.clear();
        Blockly.Xml.domToWorkspace(savedXml, ws);
        ws.updateToolbox(buildToolboxXml(customFuncs, pack));
    }, [lang]);

    // Update toolbox when custom functions change
    useEffect(() => {
        const ws = workspaceRef.current;
        if (!ws) return;
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
            theme:    buildSimphyTheme("simphy_diff"),
        });
        chatDiffWsRef.current = diffWs;

        const { tree, modeMap } = chatDiffData;
        tree.x = 40;
        tree.y = 40;

        try {
            Blockly.serialization.workspaces.load(
                { blocks: { languageVersion: 0, blocks: [tree] } },
                diffWs,
            );
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

    // Compile and run
    const handleRun = useCallback(async () => {
        
        const ws = workspaceRef.current;
        if (!ws) return;

        // Commit edited fields (number inputs, etc.) and close dropdowns
        Blockly.hideChaff();

        setResult(null); setWatSource(""); setRunState("compiling");
        clearLog();

        // Update module-level references so blockToExpr can access them
        _customFuncSpecs = customFuncsRef.current;
        _bd2Arrays = bd2ArraysRef.current;
        _bd3Arrays = bd3ArraysRef.current;
        try {
            const mainBlock = ws.getAllBlocks(false).find((b) => b.type === "wasm_func_main");
            if (!mainBlock) {
                addLog("error", pack.workspace.logs.main_block_not_found);
                setRunState("error"); return;
            }

            addLog("info", pack.workspace.compile.block_to_ast);
            const funcOrErr = buildFuncDef(mainBlock);
            if (typeof funcOrErr === "string") {
                addLog("error", funcOrErr); setRunState("error"); return;
            }
            const { func, module: mod } = funcOrErr;

            addLog("info",
                pack.workspace.logs.ast_complete
                    .replace("$0", func.ret_type.name)
                    .replace("$1", String(func.locals.length))
                    .replace("$2", String(func.body.length))
            );

            // Compile custom functions
            for (const spec of customFuncsRef.current) {
                const defBlock = ws.getAllBlocks(false).find(b => b.type === `wasm_func_def_${spec.id}`);
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
                new simulizer.ImportDef("tensor", "tensor_elemul",    "func", "tensor_elemul",    "(param i32 i32) (result i32)"),
                new simulizer.ImportDef("tensor", "tensor_scale",     "func", "tensor_scale",     "(param i32 f64) (result i32)"),
                new simulizer.ImportDef("tensor", "tensor_save",      "func", "tensor_save",      "(param i32 i32) (result i32)"),
                new simulizer.ImportDef("tensor", "tensor_set",       "func", "tensor_set",       "(param i32 i32 i32 i32 i32 i32 i32 i32 f64) (result i32)"),
                new simulizer.ImportDef("tensor", "tensor_get",       "func", "tensor_get",       "(param i32 i32 i32 i32 i32 i32 i32 i32) (result f64)"),
                new simulizer.ImportDef("debug",  "show_mat",         "func", "show_mat",         "(param i32) (result i32)"),
                new simulizer.ImportDef("tensor", "tensor_perlin",    "func", "tensor_perlin",    "(param i32 i32 i32) (result i32)"),
            ];
            for (const imp of allImports) mod.add_import(imp);

            // bd2/bd3 배열 데이터를 WASM 데이터 세그먼트로 삽입
            for (const bd2 of bd2ArraysRef.current) {
                mod.add_data(bd2.offset, new Uint8Array(bd2.data.buffer, bd2.data.byteOffset, bd2.data.byteLength));
            }
            for (const bd3 of bd3ArraysRef.current) {
                mod.add_data(bd3.offset, new Uint8Array(bd3.data.buffer, bd3.data.byteOffset, bd3.data.byteLength));
            }

            // WAT를 먼저 컴파일해 실제로 call되는 import만 남긴다
            const watFull = mod.compile();
            const calledFns = new Set(Array.from(watFull.matchAll(/call \$(\w+)/g), m => m[1]));
            mod.imports = mod.imports.filter(imp => calledFns.has(imp.internalName));

            const wat = mod.compile();
            setWatSource(wat);
            addLog("info", pack.workspace.logs.wat_generated);

            addLog("info", pack.workspace.logs.wat_compiling);
            setRunState("running");
            const wasm = await mod.generate_wasm();
            addLog("info", pack.workspace.logs.wasm_complete.replace("$0", String(wasm.byteLength)));

            addLog("info", pack.workspace.logs.running_worker);
            setRunState("running");

            const worker = wasmWorkerRef.current;
            if (!worker) throw new Error("Worker not initialized");

            await new Promise<void>((resolve, reject) => {
                worker.onmessage = (e) => {
                    const msg = e.data as import("@/utils/wasm/wasm-worker").WorkerOutMsg;
                    if (msg.type === "ready") {
                        // init 완료 신호 — run 중에는 무시
                    } else if (msg.type === "holder_create") {
                        if (msg.kind === "series") addSeries(msg.holderId);
                    } else if (msg.type === "log") {
                        logToHolder(msg.holderId, msg.kind, msg.text);
                    } else if (msg.type === "bar_create") {
                        addBar(msg.min, msg.max, msg.barId);
                    } else if (msg.type === "bar_set") {
                        setBar(msg.barId, msg.val);
                    } else if (msg.type === "visual_vec") {
                        const imageUrl = vec_field_to_image_url(new Float32Array(msg.dx), new Float32Array(msg.dy), msg.rows, msg.cols);
                        visualToHolder(msg.holderId, imageUrl, msg.rows, msg.cols);
                    } else if (msg.type === "visual") {
                        const imageUrl = mat_data_to_image_url(new Float32Array(msg.data), msg.rows, msg.cols);
                        visualToHolder(msg.holderId, imageUrl, msg.rows, msg.cols);
                    } else if (msg.type === "result") {
                        setResult(msg.value);
                        addLog("success", `🎉 결과: ${msg.value}`);
                    } else if (msg.type === "done") {
                        setRunState("done");
                        resolve();
                    } else if (msg.type === "error") {
                        addLog("error", pack.workspace.logs.error_prefix.replace("$0", msg.message));
                        setRunState("error");
                        reject(new Error(msg.message));
                    }
                };
                worker.onerror = (e) => {
                    addLog("error", pack.workspace.logs.worker_error.replace("$0", e.message));
                    setRunState("error");
                    reject(e);
                };
                worker.postMessage({ type: "run", wasmBuffer: wasm.buffer }, [wasm.buffer]);
            });
        } catch (err) {
            if (runState !== "error") {
                addLog("error", pack.workspace.logs.error_prefix.replace("$0", err instanceof Error ? err.message : String(err)));
                setRunState("error");
            }
            console.error(err);
        }
    }, [addLog, addBar, setBar, addMatShow, addSeries, logToHolder, visualToHolder, appendToLogArea, pack]);

    const handleStop = useCallback(() => {
        const oldWorker = wasmWorkerRef.current;
        if (oldWorker) oldWorker.terminate();

        const worker = new Worker(
            new URL("@/utils/wasm/wasm-worker.ts", import.meta.url),
            { type: "module" }
        );
        worker.postMessage({ type: "init" });
        worker.onmessage = (e) => {
            const msg = e.data as import("@/utils/wasm/wasm-worker").WorkerOutMsg;
            if (msg.type === "backend-switched") setTfBackend(msg.backend);
        };
        worker.onerror = null;
        wasmWorkerRef.current = worker;

        setRunState("idle");
        addLog("info", "실행이 중단되었습니다.");
    }, [addLog]);

    const handleReset = useCallback(() => {
        const ws = workspaceRef.current;
        if (!ws) return;
        ws.clear();
        Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(INITIAL_WORKSPACE_XML), ws);
        setResult(null); setWatSource(""); setRunState("idle");
        clearLog();
    }, [clearLog]);

    const handleAddFunc = useCallback(() => {
        const name = newFuncName.trim();
        if (!name) { alert(pack.workspace.alerts.func_name_required); return; }
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) { alert(pack.workspace.alerts.invalid_identifier); return; }
        if (customFuncs.some(f => f.name === name)) { alert(pack.workspace.alerts.func_name_exists); return; }

        const id = `f${Date.now()}`;
        const spec: CustomFuncSpec = { id, name, retType: newFuncRet, params: newFuncParams.map(p => ({ ...p })) };
        registerCustomFuncBlocks(spec);
        setCustomFuncs(prev => { const next = [...prev, spec]; customFuncsRef.current = next; return next; });

        const ws = workspaceRef.current;
        if (ws) {
            const b = ws.newBlock(`wasm_func_def_${id}`);
            b.initSvg(); b.render();
            b.moveBy(400, 60 + customFuncs.length * 220);
        }
        setNewFuncName("myFunc"); setNewFuncParams([]);
    }, [newFuncName, newFuncRet, newFuncParams, customFuncs, pack]);

    const handleBd2FileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const name = newBd2Name.trim() || file.name.replace(/\.bin$/i, "");
        if (!name) { alert("이름을 입력하세요."); return; }
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) { alert("이름은 영문자/숫자/밑줄로만 구성되어야 합니다."); return; }
        if (bd2ArraysRef.current.some(b => b.name === name)) { alert(`'${name}' 이름이 이미 사용 중입니다.`); return; }
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
                    alert(`파일 크기가 올바르지 않습니다.\n56의 배수여야 합니다 (현재 ${buf.byteLength} 바이트).`);
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
        if (!name) { alert("이름을 입력하세요."); return; }
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) { alert("이름은 영문자/숫자/밑줄로만 구성되어야 합니다."); return; }
        if (bd3ArraysRef.current.some(b => b.name === name)) { alert(`'${name}' 이름이 이미 사용 중입니다.`); return; }
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
                    alert(`파일 크기가 올바르지 않습니다.\n72의 배수여야 합니다 (현재 ${buf.byteLength} 바이트).`);
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

    const handleRemoveFunc = useCallback((id: string) => {
        const ws = workspaceRef.current;
        if (ws) {
            ws.getAllBlocks(false)
                .filter(b => b.type === `wasm_func_def_${id}` || b.type === `wasm_call_${id}`)
                .forEach(b => b.dispose());
        }
        setCustomFuncs(prev => { const next = prev.filter(f => f.id !== id); customFuncsRef.current = next; return next; });
    }, []);


    const handleOpenBlocks = useCallback(() => {
        const ws = workspaceRef.current;
        if (!ws) return;
        const state = Blockly.serialization.workspaces.save(ws);
        setBlockData(JSON.stringify(state));
        setBlockMode("export");
        setShowBlocks(true);
    }, []);

    const handleOpenImport = useCallback(() => {
        setBlockData("");
        setBlockMode("import");
        setShowBlocks(true);
    }, []);

    const applyJson = useCallback((json: string) => {
        const ws = workspaceRef.current;
        if (!ws) return;
        let state: object;
        try {
            state = JSON.parse(json);
        } catch (err) {
            const msg = `JSON parsing error: ${err instanceof Error ? err.message : String(err)}`;
            addLog("error", msg);
            showErrorModal(msg);
            return;
        }
        const prevState = JSON.stringify(Blockly.serialization.workspaces.save(ws));
        ws.clear();
        try {
            Blockly.serialization.workspaces.load(state, ws);
        } catch (err) {
            const msg = `Block loading error: ${err instanceof Error ? err.message : String(err)}`;
            addLog("error", msg);
            showErrorModal(msg);
            // Restore previous state on failure
            try { Blockly.serialization.workspaces.load(JSON.parse(prevState), ws); } catch { /* Ignore restore failure */ }
            return;
        }
        const saved = Blockly.serialization.workspaces.save(ws);
        const newState = JSON.stringify(saved);
        if (newState === prevState) {
            addLog("info", "불러오기 완료 (변경 없음)");
        } else {
            addLog("success", "Blocks loaded successfully.");
        }
        setBlockData(newState);
        setBlockMode("export");
        setShowBlocks(false);
    }, [addLog, showErrorModal]);

    const handleLoadBlocks = useCallback(() => {
        applyJson(blockData);
    }, [blockData, applyJson]);

    const handleSaveToStorage = useCallback(() => {
        const name = saveName.trim();
        if (!name) { alert(pack.workspace.alerts.name_required); return; }
        localStorage.setItem(LS_PREFIX + name, blockData);
        setSavedList(getSavedList());
    }, [saveName, blockData, pack]);

    const handleDeleteFromStorage = useCallback((name: string) => {
        localStorage.removeItem(LS_PREFIX + name);
        setSavedList(getSavedList());
    }, []);

    const handleLoadFromStorage = useCallback((name: string) => {
        const data = localStorage.getItem(LS_PREFIX + name);
        if (!data) return;
        try {
            // JSON 형식 시도, 실패 시 레거시 XML 폴백
            if (data.trimStart().startsWith("{")) {
                applyJson(data);
            } else {
                const ws = workspaceRef.current;
                if (!ws) return;
                const dom = Blockly.utils.xml.textToDom(data);
                ws.clear();
                Blockly.Xml.domToWorkspace(dom, ws);
                const saved = Blockly.serialization.workspaces.save(ws);
                // 마이그레이션: JSON으로 덮어씀
                localStorage.setItem(LS_PREFIX + name, JSON.stringify(saved));
                setBlockData(JSON.stringify(saved));
                setBlockMode("export");
                setShowBlocks(false);
            }
        } catch (err) {
            const msg = pack.workspace.alerts.xml_corrupted.replace("$0", err instanceof Error ? err.message : String(err));
            addLog("error", msg);
            showErrorModal(msg);
        }
    }, [applyJson, addLog, showErrorModal, pack]);

    const handleDownloadFile = useCallback(() => {
        const name = saveName.trim() || "blocks";
        const blob = new Blob([blockData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${name}.simphy`; a.click();
        URL.revokeObjectURL(url);
    }, [saveName, blockData]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setBlockData(ev.target?.result as string);
        };
        reader.readAsText(file);
        e.target.value = "";
    }, []);

    // Common form element styles
    const inputStyle: React.CSSProperties = {
        padding: "4px 8px", borderRadius: token.radius.sm,
        border: `1px solid ${token.color.borderStrong}`,
        background: token.color.bgRaised, color: token.color.fg,
        fontFamily: "inherit", fontSize: token.font.size.fs14, outline: "none",
    };
    const selectStyle: React.CSSProperties = { ...inputStyle };

    const isRunning = runState === "compiling" || runState === "running";

    // UI-only state (no business logic)
    const [rightTab, setRightTab]     = useState<"console" | "result" | "infos">("console");
    const [infos, setInfos]           = useState<InfoEntry[]>([]);

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
                        <span>Initializing...</span>
                    </div>
                </div>
            )}

            {/* ── Topbar ── */}
            <header style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 16px", height: 48, borderBottom: `1px solid ${token.color.border}`, background: token.color.bg, flexShrink: 0 }}>
                {/* Brand + filename */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, whiteSpace: "nowrap" }}>
                    <TopbarBrand onDrafts={handleOpenBlocks} pack={pack} />

                    <span style={{ color: token.color.fgSubtle, fontWeight: 300, marginLeft: 4 }}>/</span>
                    <button onClick={handleOpenBlocks} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: token.radius.sm, background: "none", border: "none", cursor: "pointer", color: token.color.fgMuted, fontSize: token.font.size.fs12, fontFamily: token.font.family.mono }}>
                        <Icon.File size={12} />
                        <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="untitled"
                            onClick={e => e.stopPropagation()}
                            style={{ background: "transparent", border: "none", outline: "none", color: "inherit", fontFamily: "inherit", fontSize: "inherit", width: 140, cursor: "text" }} />
                        <Icon.Chevron size={11} />
                    </button>
                </div>

                {/* Center — cmd search */}
                <div style={{ display:"flex", justifyContent:"center" }}>
                    <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"5px 10px", background:token.color.bgSubtle, border:`1px solid ${token.color.border}`, borderRadius:token.radius.md, color:token.color.fgMuted, fontSize:token.font.size.fs12, minWidth:340, cursor:"text" }}>
                        <Icon.Search size={12} />
                        <span style={{ flex:1 }}>명령 또는 블록 검색</span>
                        <kbd style={{ padding:"1px 6px", background:token.color.bg, border:`1px solid ${token.color.border}`, borderRadius:4, fontFamily:token.font.family.mono, fontSize:token.font.size.fs10, color:token.color.fgSubtle }}>⌘K</kbd>
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"flex-end" }}>
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
                    {/* AI button + popover */}
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

                        {showChatPopover && (
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
                                    AI 어시스턴트
                                </div>
                                {chatStreaming ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", color: token.color.fgMuted, fontSize: token.font.size.fs12 }}>
                                        <Spinner size="sm" />
                                        <span style={{ flex: 1 }}>AI 응답 대기 중...</span>
                                        <button
                                            onClick={() => chatAbortRef.current?.abort()}
                                            style={{ padding: "2px 8px", border: `1px solid ${token.color.border}`, borderRadius: token.radius.xs, background: "none", cursor: "pointer", color: token.color.fgMuted, fontSize: token.font.size.fs11 }}
                                        >중단</button>
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
                                            placeholder="블록 프로그램 수정 요청... (Enter 전송, Shift+Enter 줄바꿈)"
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
                                                전송
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    {/* Run */}
                    <button onClick={isRunning ? handleStop : handleRun}
                        style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"6px 11px", borderRadius:token.radius.sm, background:isRunning ? token.color.danger : token.color.gradient.ai, color:"#fff", fontSize:token.font.size.fs12, fontWeight:600, border:"none", cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)" }}>
                        {isRunning ? <Icon.Square size={10} /> : <Icon.Play size={11} fill />}
                        <span>{isRunning ? pack.workspace.ui.run_button_running : pack.workspace.ui.run_button}</span>
                        {/* <kbd style={{ padding:"1px 5px", background:"rgba(0,0,0,0.25)", borderRadius:3, fontFamily:token.font.family.mono, fontSize:token.font.size.fs10, color:"rgba(255,255,255,0.7)" }}>⌘↵</kbd> */}
                    </button>
                </div>
            </header>

            {/* ── Main 2-column layout ── */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", flex:1, minHeight:0 }}>

                {/* Canvas: Blockly (toolbox 포함) */}
                <main style={{ display:"flex", flexDirection:"column", minWidth:0, background:token.color.bgCanvas, overflow:"hidden" }}>

                    {/* Canvas toolbar */}
                    <div style={{ display:"flex", alignItems:"center", padding:"5px 10px", borderBottom:`1px solid ${token.color.border}`, background:token.color.bg, flexShrink:0 }}>
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
                        {/* Right: shortcuts */}
                        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4 }}>
                            <span style={{ fontSize:token.font.size.fs10, color:token.color.fgSubtle, fontWeight:500, letterSpacing:"0.06em", textTransform:"uppercase", marginRight:4 }}>{pack.workspace.ui.shortcuts_label}</span>
                            {([
                                { label: pack.workspace.ui.shortcut_boundary_2d, icon:<Icon.Grid size={11} />,   href:"/boundary/2d" },
                                { label: pack.workspace.ui.shortcut_boundary_3d, icon:<Icon.Layers size={11} />, href:"/boundary/3d" },
                            ] as const).map(({ label, icon, href }) => (
                                <button key={href} onClick={() => { window.location.href = href; }}
                                    style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 9px", border:`1px solid ${token.color.border}`, borderRadius:token.radius.sm, background:"none", cursor:"pointer", color:token.color.fgMuted, fontSize:token.font.size.fs11, fontWeight:500, transition:"all 0.1s" }}
                                    onMouseEnter={e => { e.currentTarget.style.background = token.color.bgSubtle; e.currentTarget.style.color = token.color.fg; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = token.color.fgMuted; }}
                                >
                                    {icon}{label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Canvas area */}
                    <div style={{ flex:1, position:"relative", overflow:"hidden", display: canvasTab === "blocks" ? undefined : "none" }}>
                        <div ref={blocklyDivRef} style={{ position:"absolute", inset:0 }} />
                    </div>
                    {canvasTab === "wat" && (
                        watSource
                            ? <Prism language="wasm" customStyle={{ flex:1, overflow:"auto", margin:0, padding:16, fontSize:token.font.size.fs12, fontFamily:token.font.family.mono, color:token.color.fg, lineHeight:1.7, whiteSpace:"pre", background:token.color.bgCanvas }}>{watSource}</Prism>
                            : <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:token.color.fgSubtle, fontSize:token.font.size.fs12, fontFamily:token.font.family.mono }}>{pack.workspace.ui.wat_empty}</div>
                    )}
                    {canvasTab === "ai" && (
                        <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0, overflow:"hidden" }}>
                            {chatDiffData ? (
                                <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>
                                    {/* Left: diff Blockly preview */}
                                    <div style={{ flex:1, display:"flex", flexDirection:"column", borderRight:`1px solid ${token.color.border}`, overflow:"hidden" }}>
                                        <div style={{ padding:"5px 12px", background:token.color.bgRaised, borderBottom:`1px solid ${token.color.border}`, display:"flex", gap:14, alignItems:"center"}}>
                                            <Inline style={{flex:1, width:"100%", fontSize:token.font.size.fs13, fontWeight:token.font.weight.black, flexShrink:0 }}>
                                                <span style={{ color: token.color.addBlockColor }}>■ 추가됨</span>
                                                <span style={{ color: token.color.deleteBlockColor }}>■ 삭제됨</span>
                                                <span style={{ color: token.color.nochangeBlockColor }}>■ 변화없음</span>
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
                                                                Blockly.serialization.workspaces.load(chatResult as Parameters<typeof Blockly.serialization.workspaces.load>[0], ws);
                                                                setCanvasTab("blocks");
                                                            } catch (err) {
                                                                showErrorModal(`Block apply error: ${err instanceof Error ? err.message : String(err)}`);
                                                            }
                                                        }}>✦ 워크스페이스에 적용</Button>
                                                    )}
                                                    {/*                                                 {chatOutput && <Button variant="blocks" size="sm" onClick={() => navigator.clipboard.writeText(chatOutput)}>복사</Button>} */}
                                                    <Button variant="danger" size="sm" onClick={() => { setChatOutput(""); setChatResult(null); setChatDiffData(null); }}>취소</Button>
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
                                                {chatStreaming ? "응답 생성 중..." : "응답이 여기에 표시됩니다."}
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
                                    AI에게 블록 프로그램 수정을 요청해 보세요.
                                </div>
                            )}
                            
                        </div>
                    )}
                </main>

                {/* Right panel: console + result */}
                <aside style={{ display:"flex", flexDirection:"column", borderLeft:`1px solid ${token.color.border}`, background:token.color.bg, overflow:"hidden" }}>
                    {/* Tabs */}
                    <div style={{ display:"flex", padding:"8px 8px 0", gap:2, borderBottom:`1px solid ${token.color.border}` }}>
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
                            Infos
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
                            <div className="simphy-log" style={{ flex:1, overflowY:"auto", padding:"8px 0" }} ref={logAreaRef}>
                                <div data-placeholder style={{ padding:"3px 14px", color:token.color.fgSubtle, fontFamily:token.font.family.mono, fontSize:token.font.size.fs11 }}>
                                    {pack.workspace.ui.log_placeholder}
                                </div>
                            </div>
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
                                    블록을 편집하면 정보가 표시됩니다.
                                </div>
                            ) : infos.map((entry, i) => {
                                const levelColor = entry.level === "error" ? token.color.danger : entry.level === "warn" ? token.color.warning : token.color.fgMuted;
                                const icon = entry.level === "error" ? "✕" : entry.level === "warn" ? "⚠" : "ℹ";
                                return (
                                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"3px 14px", fontFamily:token.font.family.mono, fontSize:token.font.size.fs11, lineHeight:1.6 }}>
                                        <span style={{ color:levelColor, flexShrink:0, marginTop:1 }}>{icon}</span>
                                        <span style={{ color:token.color.fg, flex:1, wordBreak:"break-all" }}>{entry.message}</span>
                                        {entry.blockId && (
                                            <span style={{ color:token.color.fgSubtle, flexShrink:0 }}>#{entry.blockId.slice(0,6)}</span>
                                        )}
                                    </div>
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
                                {[[pack.workspace.ui.stat_backend, tfBackend], [pack.workspace.ui.stat_status, runState], [pack.workspace.ui.stat_run, isRunning ? pack.workspace.ui.stat_running : pack.workspace.ui.stat_done]].map(([label, val]) => (
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

            {/* Block management modal */}
            {showBlocks && (
                <Modal onClose={() => setShowBlocks(false)} width="min(700px,90vw)">
                    {/* Tab bar header */}
                    <div style={{ display:"flex", alignItems:"center", padding:"0 16px", borderBottom:`1px solid ${token.color.border}`, background:token.color.bg, flexShrink:0 }}>
                        <div style={{ display:"flex", gap:0, flex:1 }}>
                            {([
                                { mode:"export" as const, label: pack.workspace.ui.export_button, icon: <Icon.File size={11}/> },
                                { mode:"import" as const, label: pack.workspace.ui.import_button, icon: <Icon.Layers size={11}/> },
                                ...(watSource ? [{ mode:"wat" as const, label: pack.workspace.ui.wat_button, icon: <Icon.Terminal size={11}/> }] : []),
                            ]).map(({ mode, label, icon }) => (
                                <button key={mode} onClick={() => mode === "import" ? handleOpenImport() : setBlockMode(mode)}
                                    style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"12px 14px", fontSize:token.font.size.fs12, fontWeight: blockMode===mode ? 600 : 400, border:"none", background:"none", cursor:"pointer", color: blockMode===mode ? token.color.fg : token.color.fgMuted, borderBottom: blockMode===mode ? `2px solid ${token.color.accent}` : "2px solid transparent", marginBottom:-1, transition:"all 0.1s" }}>
                                    {icon}{label}
                                </button>
                            ))}
                        </div>
                        <Button variant="ghost" size="xs" onClick={() => setShowBlocks(false)} style={{ padding: token.space.sp1 }}>
                            <Icon.X size={13} />
                        </Button>
                    </div>

                    <ModalBody style={{ padding:0, display:"flex", flexDirection:"column", minHeight:0 }}>
                        {blockMode === "export" && (<>
                            {/* Toolbar */}
                            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderBottom:`1px solid ${token.color.border}`, flexShrink:0 }}>
                                <Button variant="accent" size="sm" leading={<Icon.Save size={11}/>} onClick={handleSaveToStorage}>{pack.workspace.ui.save_local_button}</Button>
                                <Button variant="ghost"  size="sm" leading={<Icon.Download size={11}/>} onClick={handleDownloadFile}>{pack.workspace.ui.save_file_button}</Button>
                                <Button variant="ghost"  size="sm" leading={<Icon.Check size={11}/>} onClick={() => navigator.clipboard.writeText(blockData)}>{pack.workspace.ui.copy_button}</Button>
                                <div style={{ marginLeft:"auto" }}>
                                    <Button variant="danger" size="sm" onClick={() => { handleReset(); setShowBlocks(false); }}>{pack.workspace.ui.reset_button}</Button>
                                </div>
                            </div>
                            {/* Saved list */}
                            {savedList.length > 0 && (
                                <div style={{ display:"flex", flexWrap:"wrap", gap:4, padding:"8px 16px", borderBottom:`1px solid ${token.color.border}`, flexShrink:0 }}>
                                    {savedList.map(name => (
                                        <span key={name} style={{ display:"inline-flex", alignItems:"center", gap:4, background:token.color.bgCanvas, border:`1px solid ${token.color.border}`, borderRadius:token.radius.sm, padding:"2px 8px 2px 10px", fontSize:token.font.size.fs11, color:token.color.fg, fontFamily:token.font.family.mono }}>
                                            {name}
                                            <button onClick={() => handleDeleteFromStorage(name)}
                                                style={{ display:"flex", alignItems:"center", background:"none", border:"none", color:token.color.fgSubtle, cursor:"pointer", padding:2, borderRadius:3, lineHeight:1 }}
                                                onMouseEnter={e => (e.currentTarget.style.color = token.color.danger)}
                                                onMouseLeave={e => (e.currentTarget.style.color = token.color.fgSubtle)}>
                                                <Icon.X size={10}/>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            {/* Code view */}
                            <pre style={{ overflow:"auto", flex:1, margin:0, padding:"16px", fontSize:token.font.size.fs11, color:token.color.fgMuted, lineHeight:1.7, whiteSpace:"pre-wrap", wordBreak:"break-all", fontFamily:token.font.family.mono, background:token.color.bgCanvas, minHeight:300 }}>{blockData}</pre>
                        </>)}

                        {blockMode === "import" && (<>
                            {/* Toolbar */}
                            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderBottom:`1px solid ${token.color.border}`, flexShrink:0 }}>
                                <Button variant="ghost" size="sm" leading={<Icon.File size={11}/>} onClick={() => fileInputRef.current?.click()}>{pack.workspace.ui.open_file_button}</Button>
                                <input ref={fileInputRef} type="file" accept=".simphy,.json" onChange={handleFileInput} style={{ display:"none" }} />
                                <div style={{ marginLeft:"auto" }}>
                                    <Button variant="ai" size="sm" onClick={handleLoadBlocks}>{pack.workspace.ui.apply_button}</Button>
                                </div>
                            </div>
                            {/* Saved list */}
                            {savedList.length > 0 && (
                                <div style={{ display:"flex", flexWrap:"wrap", gap:4, padding:"8px 16px", borderBottom:`1px solid ${token.color.border}`, flexShrink:0 }}>
                                    {savedList.map(name => (
                                        <button key={name} onClick={() => handleLoadFromStorage(name)}
                                            style={{ display:"inline-flex", alignItems:"center", gap:4, background:token.color.bgCanvas, border:`1px solid ${token.color.border}`, borderRadius:token.radius.sm, padding:"2px 10px", fontSize:token.font.size.fs11, color:token.color.fg, fontFamily:token.font.family.mono, cursor:"pointer", transition:"all 0.1s" }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = token.color.accent; e.currentTarget.style.color = token.color.accent; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = token.color.border; e.currentTarget.style.color = token.color.fg; }}>
                                            <Icon.File size={10}/>{name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <textarea value={blockData} onChange={(e) => setBlockData(e.target.value)}
                                placeholder={pack.workspace.ui.xml_textarea_placeholder} spellCheck={false}
                                style={{ flex:1, margin:0, padding:16, fontSize:token.font.size.fs11, color:token.color.fg, lineHeight:1.7, background:token.color.bgCanvas, border:"none", outline:"none", resize:"none", fontFamily:token.font.family.mono, minHeight:300 }}
                            />
                        </>)}

                        {blockMode === "wat" && (
                            <pre style={{ overflow:"auto", flex:1, margin:0, padding:16, fontSize:token.font.size.fs12, color:token.color.fg, lineHeight:1.7, whiteSpace:"pre", fontFamily:token.font.family.mono, background:token.color.bgCanvas, minHeight:300 }}>{watSource}</pre>
                        )}
                    </ModalBody>
                </Modal>
            )}


            {/* LaTeX OCR modal */}
            {showLatexOcr && (
                <Modal onClose={() => { ocrAbortRef.current?.abort(); setShowLatexOcr(false); }} width="min(560px,95vw)">
                    <ModalHeader onClose={() => { ocrAbortRef.current?.abort(); setShowLatexOcr(false); }}>
                        <Text variant="label" tone="accent">Image → LaTeX OCR</Text>
                    </ModalHeader>
                    <ModalBody style={{ display: "flex", flexDirection: "column", gap: token.space.sp3 }}>
                        {/* Image upload area */}
                        <div
                            onClick={() => ocrFileInputRef.current?.click()}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                                e.preventDefault();
                                const file = e.dataTransfer.files[0];
                                if (file && file.type.startsWith("image/")) handleLatexOcr(file);
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
                            {ocrImageUrl
                                ? <img src={ocrImageUrl} alt="uploaded" style={{ maxHeight: 160, maxWidth: "100%", borderRadius: token.radius.sm, objectFit: "contain" }} />
                                : <>
                                    <Icon.Upload size={22} />
                                    <Text variant="body" tone="muted">클릭, 드래그, 또는 Ctrl+V로 이미지 업로드</Text>
                                  </>
                            }
                        </div>
                        <input
                            ref={ocrFileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleLatexOcr(file);
                                e.target.value = "";
                            }}
                        />

                        {/* LaTeX result with katex preview */}
                        {(ocrLatex || ocrStreaming) && (
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
                                    {ocrLatex}{ocrStreaming && <span style={{ opacity: 0.5, animation: "pulse 1s infinite" }}>▍</span>}
                                </div>

                                {/* KaTeX rendered preview */}
                                {ocrLatex.trim() && (() => {
                                    try {
                                        const raw = ocrLatex.trim().replace(/^\$\$|\$\$$/g, "").replace(/^\$|\$$/g, "").trim();
                                        const html = katex.renderToString(raw, { throwOnError: false, displayMode: true });
                                        return (
                                            <div style={{
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
                                    } catch { return null; }
                                })()}
                            </div>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" size="sm" onClick={() => { ocrAbortRef.current?.abort(); setShowLatexOcr(false); }}>취소</Button>
                        <Button
                            variant="run"
                            size="sm"
                            onClick={() => handleLatexOcrApply(ocrLatex)}
                            disabled={!ocrLatex.trim() || ocrStreaming}
                        >
                            Apply
                        </Button>
                    </ModalFooter>
                </Modal>
            )}

            {/* Custom function management modal */}
            {showFuncMgr && (
                <Modal onClose={() => setShowFuncMgr(false)} width="min(560px,95vw)">
                    <ModalHeader onClose={() => setShowFuncMgr(false)}>
                        <Text variant="label" tone="accent">{pack.workspace.ui.func_mgr_title}</Text>
                    </ModalHeader>

                    <ModalBody>
                        <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:12 }}>
                            {customFuncs.length === 0 && (
                                <Text variant="body" tone="muted">{pack.workspace.ui.func_empty_message}</Text>
                            )}
                            {customFuncs.map(spec => (
                                <div key={spec.id} style={{ background:token.color.bgSubtle, border:`1px solid ${token.color.borderStrong}`, borderRadius:token.radius.md, padding:"8px 12px", display:"flex", alignItems:"center", gap:8 }}>
                                    <div style={{ flex:1, fontSize:token.font.size.fs12 }}>
                                        <span style={{ color:token.color.accent, fontWeight:700 }}>{spec.name}</span>
                                        <span style={{ color:token.color.fgMuted }}> → {spec.retType}</span>
                                        {spec.params.length > 0 && (
                                            <span style={{ color: token.color.info }}>
                                                {"  "}({spec.params.map(p => `${p.name}:${p.type}`).join(", ")})
                                            </span>
                                        )}
                                    </div>
                                    <button onClick={() => handleRemoveFunc(spec.id)}
                                        style={{ background:token.color.dangerSoft, border:`1px solid ${token.color.danger}`, borderRadius:5, color:token.color.danger, cursor:"pointer", fontSize:token.font.size.fs11, padding:"3px 10px" }}>{pack.workspace.ui.delete_button}</button>
                                </div>
                            ))}
                        </div>

                        <div style={{ borderTop:`1px solid ${token.color.border}`, marginBottom:12 }} />

                        <Text variant="label" tone="accent" style={{ marginBottom:8, display:"block" }}>{pack.workspace.ui.add_func_section}</Text>
                        <div style={{ display:"flex", gap:6, marginBottom:8 }}>
                            <input value={newFuncName} onChange={e => setNewFuncName(e.target.value)} placeholder={pack.workspace.ui.func_name_placeholder}
                                style={{ ...inputStyle, flex:2 }} />
                            <select value={newFuncRet} onChange={e => setNewFuncRet(e.target.value as "i32"|"f64"|"void")}
                                style={{ ...selectStyle, flex:1 }}>
                                <option value="i32">i32</option>
                                <option value="f64">f64</option>
                                <option value="void">void</option>
                            </select>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:8 }}>
                            {newFuncParams.map((p, i) => (
                                <div key={i} style={{ display:"flex", gap:6, alignItems:"center" }}>
                                    <input value={p.name}
                                        onChange={e => setNewFuncParams(prev => prev.map((x,j) => j===i ? {...x,name:e.target.value} : x))}
                                        placeholder={`param${i}`} style={{ ...inputStyle, flex:2 }} />
                                    <select value={p.type}
                                        onChange={e => setNewFuncParams(prev => prev.map((x,j) => j===i ? {...x,type:e.target.value as "i32"|"f64"} : x))}
                                        style={{ ...selectStyle, flex:1 }}>
                                        <option value="i32">i32</option>
                                        <option value="f64">f64</option>
                                    </select>
                                    <button onClick={() => setNewFuncParams(prev => prev.filter((_,j) => j!==i))}
                                        style={{ background:"none", border:"none", color:token.color.fgMuted, cursor:"pointer", fontSize:token.font.size.fs16 }}>✕</button>
                                </div>
                            ))}
                            <Button variant="reset" size="sm" style={{ alignSelf:"flex-start" }}
                                onClick={() => setNewFuncParams(prev => [...prev, { name:`p${prev.length}`, type:"i32" }])}>
                                {pack.workspace.ui.add_param_button}
                            </Button>
                        </div>
                        <Button variant="run" style={{ width:"100%" }} onClick={handleAddFunc}>{pack.workspace.ui.add_button}</Button>
                    </ModalBody>
                </Modal>
            )}

            {/* Boundary 2D/3D unified management modal */}
            {showBdMgr && (() => {
                const is2d   = bdMgrTab === "2d";
                const arrays = is2d ? bd2Arrays : bd3Arrays;
                const onRemove = is2d ? handleRemoveBd2 : handleRemoveBd3;
                const nameVal  = is2d ? newBd2Name : newBd3Name;
                const setName  = is2d ? setNewBd2Name : setNewBd3Name;
                const fileRef  = is2d ? bd2FileInputRef : bd3FileInputRef;
                const onFile   = is2d ? handleBd2FileInput : handleBd3FileInput;
                const fmt      = is2d
                    ? "f64 × 7 × N 바이트 (t, x, y, tx, ty, nx, ny 순서)"
                    : "f64 × 10 × N 바이트 (t, x, y, z, tx, ty, tz, nx, ny, nz 순서)";
                const prefix = is2d ? "bd2" : "bd3";
                return (
                    <Modal onClose={() => setShowBdMgr(false)} width="min(560px,95vw)">
                        <ModalHeader onClose={() => setShowBdMgr(false)}>
                            <Inline gap="sp1">
                                <Button variant="secondary" size="sm"
                                    onClick={() => setBdMgrTab("2d")}
                                    style={{ background: bdMgrTab === "2d" ? token.color.border : "none" }}>
                                    🗺 Boundary 2D
                                </Button>
                                <Button variant="secondary" size="sm"
                                    onClick={() => setBdMgrTab("3d")}
                                    style={{ background: bdMgrTab === "3d" ? token.color.border : "none" }}>
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
                                        <Button variant="danger" size="sm" onClick={() => onRemove(entry.id)}>삭제</Button>
                                    </div>
                                ))}
                            </div>

                            <div style={{ borderTop: `1px solid ${token.color.border}`, marginBottom: 12 }} />

                            <Text variant="label" tone="accent" style={{ marginBottom: 8, display: "block" }}>새 배열 업로드</Text>
                            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                                <input value={nameVal} onChange={e => setName(e.target.value)}
                                    placeholder="변수명 (영문)" style={{ ...inputStyle, flex: 1 }} />
                                <Button variant="blocks" size="sm" onClick={() => fileRef.current?.click()}>.bin 파일 선택</Button>
                                <input ref={fileRef} type="file" accept=".bin" onChange={onFile} style={{ display: "none" }} />
                            </div>
                            <Text variant="caption" tone="muted" style={{ lineHeight: 1.6 }}>
                                형식: {fmt}<br />
                                블록 사용: <span style={{ color: token.color.fgMuted }}>{prefix} 변수 선언</span> → <span style={{ color: token.color.fgMuted }}>{prefix} 반복</span>
                            </Text>
                        </ModalBody>
                    </Modal>
                );
            })()}

            {/* Error modal */}
            {errorModal && (
                <Modal onClose={() => setErrorModal(null)} width="min(480px,90vw)">
                    <ModalHeader onClose={() => setErrorModal(null)}>
                        <Text variant="label" tone="danger">⚠ 오류</Text>
                    </ModalHeader>
                    <ModalBody style={{ padding:0 }}>
                        <pre style={{ margin:0, padding:"16px", fontSize:token.font.size.fs12, color:token.color.fgMuted, lineHeight:1.7, whiteSpace:"pre-wrap", wordBreak:"break-all", overflowY:"auto", maxHeight:300 }}>{errorModal}</pre>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="reset" size="sm" onClick={() => navigator.clipboard.writeText(errorModal)}>복사</Button>
                        <Button variant="blocks" size="sm" onClick={() => setErrorModal(null)}>닫기</Button>
                    </ModalFooter>
                </Modal>
            )}


        </div>
    );
};

export default BlocklyWasmIDE;