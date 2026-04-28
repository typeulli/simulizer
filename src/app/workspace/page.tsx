"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";

import * as Blockly from "blockly/core";
import "blockly/blocks";
import * as BlocklyEn from "blockly/msg/en";

import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgpu";

import { simulizer } from "@/simphy/engine";
import { unpackF64Arrays } from "@/utils/ziparray";
import {
    type BlockDef,
    type CompileCtx,
    unpack
} from "@/simphy/lang/$base";
import { XML_ARRAY_BLOCKS, registerDynamicArrayBlocks, compileArrayLiteralBlock } from "@/simphy/lang/array";
import { XML_BOOL_BLOCKS } from "@/simphy/lang/bool";
import { XML_DEBUG_BLOCKS } from "@/simphy/lang/debug";
import { XML_I32_BLOCKS } from "@/simphy/lang/i32";
import { XML_LOCAL_BLOCKS } from "@/simphy/lang/locals";
import {
    XML_TENSOR_BLOCKS,
    mat_data_to_image_url,
    vec_field_to_image_url,
    registerDynamicTensorBlocks,
} from "@/simphy/lang/tensor";
import { CUSTOM_BLOCKS } from "@/simphy/lang/$blocks";

import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";
import { Box } from "@/components/atoms/layout/Box";
import { Inline } from "@/components/atoms/layout/Inline";
import { StatusDot } from "@/components/atoms/StatusDot";
import { darkTheme } from "@/components/tokens";

import { useConsolePanel } from "@/components/console";
import useLanguagePack from "@/hooks/useLanguagePack";
import { XML_F64_BLOCKS } from "@/simphy/lang/f64";
import { XML_FLOW_BLOCKS } from "@/simphy/lang/flow";
import { XML_VECTOR_BLOCKS } from "@/simphy/lang/vector";
import { XML_BOUNDARY_BLOCKS } from "@/simphy/lang/boundary";
import { generateDiffTree, loadTreeDiff } from "@/lib/treediff/treediff";
import { NormalizeContext, unnormalize, normalize } from "@/lib/treediff/blockdiff";

// Register Blockly locale explicitly to prevent context menu labels from being undefined
Blockly.setLocale(BlocklyEn as { [key: string]: any });

function desaturateColor(color: string): string {
    const hex = color.trim().replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    const s = 0;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (pp: number, qq: number, t: number) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return pp + (qq - pp) * 6 * t;
        if (t < 1 / 2) return qq;
        if (t < 2 / 3) return pp + (qq - pp) * (2 / 3 - t) * 6;
        return pp;
    };
    const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
    return `#${toHex(hue2rgb(p, q, h + 1 / 3))}${toHex(hue2rgb(p, q, h))}${toHex(hue2rgb(p, q, h - 1 / 3))}`;
}

// Custom Block Definitions


const CUSTOM_BLOCK_DEFINITIONS: BlockDef[] = [
    ...unpack(CUSTOM_BLOCKS),
    // Logical NOT
    {
        type: "i32_not",
        message0: "! %1",
        args0: [{ type: "input_value", name: "VALUE", check: "i32" }],
        output: "bool", colour: 60, tooltip: "논리 NOT (eqz)",
        inputsInline: true,
    },
    // Local variable declaration
    // Select (ternary)
    // Return
    {
        type: "wasm_return_i32",
        message0: "반환 i32 %1",
        args0: [{ type: "input_value", name: "VALUE", check: "i32" }],
        previousStatement: null, nextStatement: null, colour: 0, tooltip: "i32 반환",
    },
    {
        type: "wasm_return_f64",
        message0: "반환 f64 %1",
        args0: [{ type: "input_value", name: "VALUE", check: "f64" }],
        previousStatement: null, nextStatement: null, colour: 0, tooltip: "f64 반환",
    },
    // Function wrapper
    {
        type: "wasm_func_main",
        message0: "함수 main → %1",
        args0: [
            {
                type: "field_dropdown", name: "RET_TYPE",
                options: [["i32", "i32"], ["f64", "f64"], ["void", "void"]],
            },
        ],
        message1: "본문 %1",
        args1: [{ type: "input_statement", name: "BODY" }],
        colour: 290, tooltip: "WebAssembly main 함수",
    },
];

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

function registerCustomFuncBlocks(spec: CustomFuncSpec) {
    const { id, name, retType, params } = spec;

    if (!Blockly.Blocks[`wasm_func_def_${id}`]) {
        Blockly.Blocks[`wasm_func_def_${id}`] = {
            init(this: Blockly.Block) {
                this.appendDummyInput()
                    .appendField(`함수 ${name}`)
                    .appendField(` → ${retType}`);
                params.forEach(p =>
                    this.appendDummyInput().appendField(`  param ${p.name}: ${p.type}`)
                );
                this.appendStatementInput("BODY").appendField("본문");
                this.setColour(200);
                this.setTooltip(`사용자 정의 함수: ${name}`);
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
                this.setColour(160);
                this.setInputsInline(params.length <= 2);
                this.setTooltip(`${name} 함수 호출`);
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

/** Find or register a new variable in FuncDef */
function getOrCreateLocal(
    ctx: CompileCtx,
    name: string,
    type: simulizer.Type,
): simulizer.Local {
    const existing = ctx.locals.get(name);
    if (existing) return existing.local;
    const local = new simulizer.Local(name, type);
    const def     = ctx.func.add_local(local);
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

const BASE_TOOLBOX_XML = `
<xml xmlns="https://developers.google.com/blockly/xml" id="toolbox">
    ${XML_DEBUG_BLOCKS}
    ${XML_BOOL_BLOCKS}
    ${XML_I32_BLOCKS}
    ${XML_F64_BLOCKS}
    ${XML_LOCAL_BLOCKS}
    ${XML_FLOW_BLOCKS}
    ${XML_ARRAY_BLOCKS}
    ${XML_TENSOR_BLOCKS}
    ${XML_VECTOR_BLOCKS}
    ${XML_BOUNDARY_BLOCKS}
    <category name="🔄 타입 변환" colour="45">
        <block type="f64_from_i32"></block>
        <block type="i32_from_f64"></block>
    </category>
    <category name="🔧 함수" colour="290">
        <button text="⊕ 커스텀 함수 관리" callbackKey="OPEN_FUNC_MGR"></button>
        <block type="wasm_func_main"></block>
        <block type="wasm_return_i32"></block>
        <block type="wasm_return_f64"></block>
    </category>
</xml>
`;

function buildToolboxXml(funcs: CustomFuncSpec[]): string {
    if (funcs.length === 0) return BASE_TOOLBOX_XML;
    const funcBlocks = funcs.map(f =>
        `<block type="wasm_func_def_${f.id}"></block>\n        <block type="wasm_call_${f.id}"></block>`
    ).join("\n        ");
    return BASE_TOOLBOX_XML.replace(
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

const BlocklyWasmIDE: React.FC = () => {
    const blocklyDivRef = useRef<HTMLDivElement>(null);
    const workspaceRef  = useRef<Blockly.WorkspaceSvg | null>(null);
    const wasmWorkerRef = useRef<Worker | null>(null);

    const [runState, setRunState]     = useState<RunState>("idle");
    const [result, setResult]             = useState<string | null>(null);
    const [tfBackend, setTfBackend]       = useState<string>("initializing");
    const [watSource, setWatSource] = useState<string>("");
    const [customFuncs, setCustomFuncs]   = useState<CustomFuncSpec[]>([]);
    const customFuncsRef = useRef<CustomFuncSpec[]>([]);
    const [showFuncMgr, setShowFuncMgr]   = useState(false);
    const [newFuncName, setNewFuncName]   = useState("myFunc");
    const [newFuncRet,  setNewFuncRet]    = useState<"i32"|"f64"|"void">("i32");
    const [newFuncParams, setNewFuncParams] = useState<{name:string;type:"i32"|"f64"}[]>([]);

    const [bd2Arrays, setBd2Arrays]   = useState<Bd2ArrayEntry[]>([]);
    const bd2ArraysRef                = useRef<Bd2ArrayEntry[]>([]);
    const [newBd2Name, setNewBd2Name]  = useState("boundary");
    const bd2FileInputRef              = useRef<HTMLInputElement>(null);

    const [bd3Arrays, setBd3Arrays]   = useState<Bd3ArrayEntry[]>([]);
    const bd3ArraysRef                = useRef<Bd3ArrayEntry[]>([]);
    const [newBd3Name, setNewBd3Name]  = useState("boundary");
    const bd3FileInputRef              = useRef<HTMLInputElement>(null);

    const [showBdMgr, setShowBdMgr]   = useState(false);
    const [bdMgrTab,  setBdMgrTab]    = useState<"2d" | "3d">("2d");

    const [errorModal, setErrorModal] = useState<string | null>(null);
    const showErrorModal = useCallback((msg: string) => setErrorModal(msg), []);

    const [showChat, setShowChat]           = useState(false);
    const [chatPrompt, setChatPrompt]       = useState("");
    const [chatOutput, setChatOutput]       = useState("");
    const [chatResult, setChatResult]       = useState<object | null>(null);
    const [chatStreaming, setChatStreaming]  = useState(false);
    const chatAbortRef                      = useRef<AbortController | null>(null);
    const [chatDiffData, setChatDiffData]   = useState<{ tree: any; modeMap: Record<string, "insert" | "delete" | "common"> } | null>(null);
    const chatPrevStateRef                  = useRef<object | null>(null);
    const chatDiffDivRef                    = useRef<HTMLDivElement>(null);
    const chatDiffWsRef                     = useRef<Blockly.WorkspaceSvg | null>(null);

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
                                        const n2 = normalize(newBlocks, ctx);
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
    const [blockData, setBlockData]     = useState<string>("");
    const [blockMode, setBlockMode]     = useState<"export" | "import" | "wat">("export");
    const [saveName, setSaveName]         = useState<string>("");
    const fileInputRef                  = useRef<HTMLInputElement>(null);
    const [lang, setLang, pack, langReady] = useLanguagePack();

    const LS_PREFIX = "simphy_blocks_";
    const getSavedList = () =>
        Object.keys(localStorage)
            .filter(k => k.startsWith(LS_PREFIX))
            .map(k => k.slice(LS_PREFIX.length))
            .sort();
    const [savedList, setSavedList] = useState<string[]>(() =>
        typeof window !== "undefined" ? getSavedList() : []
    );

    const { logAreaRef, addLog, addBar, setBar, clearLog, addMatShow } = useConsolePanel();

    // appendToLogArea is used by Worker message handler (visual) to insert DOM directly
    const appendToLogArea = useCallback((el: HTMLElement) => {
        const area = logAreaRef.current;
        if (!area) return;
        const placeholder = area.querySelector("[data-placeholder]");
        if (placeholder) area.removeChild(placeholder);
        area.appendChild(el);
        area.scrollTop = area.scrollHeight;
    }, [logAreaRef]);


    // Initialize TF backend (once on app start, main thread only)
    useEffect(() => {
        (async () => {
            const backends = ["webgpu", "webgl", "cpu"] as const;
            for (const backend of backends) {
                try {
                    const ok = await tf.setBackend(backend);
                    if (!ok) continue;
                    await tf.ready();
                    setTfBackend(tf.getBackend() ?? backend);
                    return;
                } catch {
                    // Backend not supported → try next
                }
            }
            setTfBackend("cpu");
        })();
    }, []);

    // Create WASM Worker (once on app mount, then reused)
    useEffect(() => {
        const worker = new Worker(
            new URL("@/simphy/wasm-worker.ts", import.meta.url),
            { type: "module" }
        );
        // Start TF initialization immediately inside Worker
        worker.postMessage({ type: "init" });
        wasmWorkerRef.current = worker;
        return () => {
            worker.terminate();
            wasmWorkerRef.current = null;
        };
    }, []);

    const handleSwitchBackend = useCallback(async (backend: string) => {
        try {
            setTfBackend("initializing");
            const ok = await tf.setBackend(backend);
            if (!ok) throw new Error("setBackend returned false");
            await tf.ready();
            setTfBackend(tf.getBackend() ?? backend);
        } catch {
            setTfBackend(tf.getBackend() ?? "cpu");
        }
    }, []);

    // Initialize Blockly
    useEffect(() => {
        registerDynamicTensorBlocks();
        registerDynamicArrayBlocks();
        CUSTOM_BLOCK_DEFINITIONS.forEach((def) => {
            const d = def as { type: string };
            if (!Blockly.Blocks[d.type]) {
                Blockly.Blocks[d.type] = {
                    init(this: Blockly.Block) { this.jsonInit(def); },
                };
            }
        });

        if (!blocklyDivRef.current) return;

        const blocklyDarkTheme = Blockly.Theme.defineTheme("simphy_dark", {
            name: "simphy_dark",
            base: Blockly.Themes.Classic,
            componentStyles: {
                workspaceBackgroundColour: "#0d0d1a",
                toolboxBackgroundColour:   "#111120",
                toolboxForegroundColour:   "#c4c4e0",
                flyoutBackgroundColour:    "#16162a",
                flyoutForegroundColour:    "#c4c4e0",
                flyoutOpacity:             1,
                scrollbarColour:           "#2a2060",
                insertionMarkerColour:     "#fff",
                insertionMarkerOpacity:    0.3,
                scrollbarOpacity:          0.6,
                cursorColour:              "#a78bfa",
            },
        });

        const ws = Blockly.inject(blocklyDivRef.current, {
            toolbox:  BASE_TOOLBOX_XML,
            grid:     { spacing: 20, length: 3, colour: "#2a2a3a", snap: true },
            zoom:     { controls: true, wheel: true, startScale: 0.9 },
            trashcan: true,
            theme:    blocklyDarkTheme,
            renderer: "zelos",
        });

        workspaceRef.current = ws;
        ws.registerButtonCallback("OPEN_FUNC_MGR", () => setShowFuncMgr(true));
        ws.registerButtonCallback("OPEN_BD2_MGR",  () => { setBdMgrTab("2d"); setShowBdMgr(true); });
        ws.registerButtonCallback("OPEN_BD3_MGR",  () => { setBdMgrTab("3d"); setShowBdMgr(true); });
        Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(INITIAL_WORKSPACE_XML), ws);
        return () => ws.dispose();
    }, []);

    // Update toolbox when custom functions change
    useEffect(() => {
        const ws = workspaceRef.current;
        if (!ws) return;
        ws.updateToolbox(buildToolboxXml(customFuncs));
    }, [customFuncs]);

    // Diff Blockly workspace lifecycle
    useEffect(() => {
        if (!showChat) {
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

        const diffTheme = Blockly.Theme.defineTheme("simphy_dark_diff", {
            name: "simphy_dark_diff",
            base: Blockly.Themes.Classic,
            componentStyles: {
                workspaceBackgroundColour: "#0a0a14",
                toolboxBackgroundColour:   "#111120",
                toolboxForegroundColour:   "#c4c4e0",
                flyoutBackgroundColour:    "#16162a",
                flyoutForegroundColour:    "#c4c4e0",
                flyoutOpacity:             1,
                scrollbarColour:           "#2a2060",
                insertionMarkerColour:     "#fff",
                insertionMarkerOpacity:    0.3,
                scrollbarOpacity:          0.6,
                cursorColour:              "#a78bfa",
            },
        });

        const diffWs = Blockly.inject(chatDiffDivRef.current, {
            zoom:     { controls: true, wheel: true, startScale: 0.7 },
            renderer: "zelos",
            theme:    diffTheme,
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

        for (const [id, mode] of Object.entries(modeMap)) {
            const block = diffWs.getBlockById(id);
            if (!block) continue;
            if (mode === "insert") block.setColour("#16a34a");
            else if (mode === "delete") block.setColour("#dc2626");
            else block.setColour(desaturateColor(block.getColour()));
        }

        diffWs.scrollCenter();
    }, [chatDiffData, showChat]);

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

            mod.add_import(new simulizer.ImportDef("debug",  "log",           "func", "log_i32",       "(param i32)"));
            mod.add_import(new simulizer.ImportDef("debug",  "log",           "func", "log_f64",       "(param f64)"));
            mod.add_import(new simulizer.ImportDef("debug",  "log_ptr",       "func", "log_ptr",       "(param i32)"));
            mod.add_import(new simulizer.ImportDef("debug",  "log_arr_i32",   "func", "log_arr_i32",   "(param i32 i32)"));
            mod.add_import(new simulizer.ImportDef("debug",  "log_arr_f64",   "func", "log_arr_f64",   "(param i32 i32)"));
            mod.add_import(new simulizer.ImportDef("debug",  "log_tensor",    "func", "log_tensor",    "(param i32)"));
            mod.add_import(new simulizer.ImportDef("debug",  "log_vec2",      "func", "log_vec2",      "(param f64 f64)"));
            mod.add_import(new simulizer.ImportDef("debug",  "debug_bar",     "func", "debug_bar",     "(param i32 i32) (result i32)"));
            mod.add_import(new simulizer.ImportDef("debug",  "debug_bar_set", "func", "debug_bar_set", "(param i32 i32)"));
            mod.add_import(new simulizer.ImportDef("tensor", "tensor_random", "func", "tensor_random", "(param i32 i32 f64 f64 i32 i32) (result i32)"));
            mod.add_import(new simulizer.ImportDef("tensor", "tensor_create", "func", "tensor_create", "(param i32 i32 i32) (result i32)"));
            mod.add_import(new simulizer.ImportDef("tensor", "tensor_add",    "func", "tensor_add",    "(param i32 i32) (result i32)"));
            mod.add_import(new simulizer.ImportDef("tensor", "tensor_sub",    "func", "tensor_sub",    "(param i32 i32) (result i32)"));
            mod.add_import(new simulizer.ImportDef("tensor", "tensor_matmul", "func", "tensor_matmul", "(param i32 i32) (result i32)"));
            mod.add_import(new simulizer.ImportDef("tensor", "tensor_neg",    "func", "tensor_neg",    "(param i32) (result i32)"));
            mod.add_import(new simulizer.ImportDef("tensor", "tensor_elemul", "func", "tensor_elemul", "(param i32 i32) (result i32)"));
            mod.add_import(new simulizer.ImportDef("tensor", "tensor_scale",  "func", "tensor_scale",  "(param i32 f64) (result i32)"));
            mod.add_import(new simulizer.ImportDef("tensor", "tensor_save",   "func", "tensor_save",   "(param i32 i32) (result i32)"));
            mod.add_import(new simulizer.ImportDef("tensor", "tensor_set",    "func", "tensor_set",    "(param i32 i32 i32 i32 i32 i32 i32 i32 f64) (result i32)"));
            mod.add_import(new simulizer.ImportDef("tensor", "tensor_get",    "func", "tensor_get",    "(param i32 i32 i32 i32 i32 i32 i32 i32) (result f64)"));
            mod.add_import(new simulizer.ImportDef("tensor", "show_mat",      "func", "show_mat",      "(param i32) (result i32)"));
            mod.add_import(new simulizer.ImportDef("tensor", "tensor_perlin", "func", "tensor_perlin", "(param i32 i32 i32) (result i32)"));

            // bd2/bd3 배열 데이터를 WASM 데이터 세그먼트로 삽입
            for (const bd2 of bd2ArraysRef.current) {
                mod.add_data(bd2.offset, new Uint8Array(bd2.data.buffer, bd2.data.byteOffset, bd2.data.byteLength));
            }
            for (const bd3 of bd3ArraysRef.current) {
                mod.add_data(bd3.offset, new Uint8Array(bd3.data.buffer, bd3.data.byteOffset, bd3.data.byteLength));
            }

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
                    const msg = e.data as import("@/simphy/wasm-worker").WorkerOutMsg;
                    if (msg.type === "ready") {
                        // init 완료 신호 — run 중에는 무시
                    } else if (msg.type === "log") {
                        addLog(msg.kind, msg.text);
                    } else if (msg.type === "bar_create") {
                        addBar(msg.min, msg.max, msg.barId);
                    } else if (msg.type === "bar_set") {
                        setBar(msg.barId, msg.val);
                    } else if (msg.type === "visual_vec") {
                        const imageUrl = vec_field_to_image_url(new Float32Array(msg.dx), new Float32Array(msg.dy), msg.rows, msg.cols);
                        addMatShow(msg.rows, msg.cols, imageUrl);
                    } else if (msg.type === "visual") {
                        const imageUrl = mat_data_to_image_url(new Float32Array(msg.data), msg.rows, msg.cols);
                        addMatShow(msg.rows, msg.cols, imageUrl);
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
    }, [addLog, addBar, setBar, addMatShow, appendToLogArea, pack]);

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
        padding: "4px 8px", borderRadius: darkTheme.borderRadius.sm,
        border: `1px solid ${darkTheme.color.border.strong}`,
        background: darkTheme.color.bg.raised, color: darkTheme.color.text.primary,
        fontFamily: "inherit", fontSize: darkTheme.fontSize.md, outline: "none",
    };
    const selectStyle: React.CSSProperties = { ...inputStyle };

    // Common modal styles
    const modalOverlay: React.CSSProperties = {
        position: "fixed", inset: 0, background: "rgba(0,0,0,.75)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    };
    const modalBox: React.CSSProperties = {
        border: `1px solid ${darkTheme.color.border.strong}`,
        borderRadius: darkTheme.borderRadius.lg,
        width: "min(700px,90vw)", maxHeight: "80vh",
        display: "flex", flexDirection: "column",
    };
    const modalHd: React.CSSProperties = {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px", borderBottom: `1px solid ${darkTheme.color.border.default}`,
    };
    const closeBtn: React.CSSProperties = {
        background: "none", border: "none",
        color: darkTheme.color.text.accent, cursor: "pointer", fontSize: 18,
    };

    const isRunning = runState === "compiling" || runState === "running";

    return (
        <Box bg="root" style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden", fontFamily:darkTheme.font.mono, color:darkTheme.color.text.primary }}>
            {!langReady && (
                <div style={{ position:"fixed", inset:0, zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center", background:"#0d0d1a", color:"#a78bfa", fontSize:14 }}>
                    Loading...
                </div>
            )}
            {/* Header */}
            <Box bg="header" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 20px", borderBottom:`1px solid ${darkTheme.color.border.strong}`, flexShrink:0, gap:12 }}>
                {/* Filename and file button */}
                <Inline gap="sm">
                    <button
                        onClick={handleOpenBlocks}
                        style={{
                            background:"transparent", border:"none", cursor:"pointer",
                            padding:"4px 4px", display:"flex", flexDirection:"column",
                            gap:3, justifyContent:"center", opacity:0.7,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
                    >
                        {[0,1,2].map(i => (
                            <span key={i} style={{ display:"block", width:14, height:1.5, background:darkTheme.color.text.primary, borderRadius:1 }} />
                        ))}
                    </button>
                    <input
                        value={saveName}
                        onChange={e => setSaveName(e.target.value)}
                        placeholder="untitled"
                        style={{
                            background:"transparent", border:"none",
                            outline:"none", color:darkTheme.color.text.primary, fontSize:13,
                            fontFamily:darkTheme.font.mono, width:140, padding:"3px 2px",
                        }}
                    />
                </Inline>
                <Inline gap="sm">
                </Inline>
                <Inline gap="md">
                    <Inline gap="xs">
                        {(["webgpu", "webgl", "cpu"] as const).map((b) => (
                            <button
                                key={b}
                                onClick={() => tfBackend !== b && tfBackend !== "initializing" && handleSwitchBackend(b)}
                                style={{
                                    padding: "2px 7px",
                                    borderRadius: 4,
                                    border: tfBackend === b ? "1px solid transparent" : `1px solid ${darkTheme.color.border.default}`,
                                    background: tfBackend === b
                                        ? b === "webgpu" ? darkTheme.color.text.success
                                        : b === "webgl" ? darkTheme.color.text.warning
                                        : darkTheme.color.border.default
                                        : "transparent",
                                    color: tfBackend === b ? darkTheme.color.bg.root : darkTheme.color.text.muted,
                                    fontSize: 11,
                                    fontWeight: tfBackend === b ? 700 : 400,
                                    cursor: tfBackend === b || tfBackend === "initializing" ? "default" : "pointer",
                                    opacity: tfBackend === "initializing" && b !== "webgpu" ? 0.4 : 1,
                                }}
                            >
                                {b}
                            </button>
                        ))}
                    </Inline>
                    <Inline gap="xs">
                        <StatusDot runState={runState} />
                        <Text variant="label" color="muted">
                            {runState==="idle" ? pack.workspace.ui.status_waiting : runState==="compiling" ? pack.workspace.ui.status_converting
                             : runState==="running" ? pack.workspace.ui.status_running : runState==="done" ? pack.workspace.ui.status_done : pack.workspace.ui.status_error}
                        </Text>
                    </Inline>
                    <Button variant="ai" onClick={() => { setChatOutput(""); setShowChat(true); }}>✦ AI</Button>
                </Inline>
            </Box>

            {/* Main content */}
            <div style={{ display:"flex", flex:1, overflow:"hidden" }}>


                <div style={{ flex:1, position:"relative", minWidth:0, overflow:"hidden" }}>
                    <div ref={blocklyDivRef} style={{ position:"absolute", inset:0 }} />
                </div>

                <Box as="aside" bg="surface" style={{ width:340, display:"flex", flexDirection:"column", borderLeft:`1px solid ${darkTheme.color.border.default}`, overflow:"hidden" }}>
                    <Box bg="raised" style={{ padding:"10px 14px", borderBottom:`1px solid ${darkTheme.color.border.default}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <Text variant="label" color="accent">{pack.workspace.ui.result_header}</Text>
                        <Button variant="run" size="sm" onClick={handleRun} disabled={isRunning}>
                            {isRunning ? pack.workspace.ui.run_button_running : pack.workspace.ui.run_button}
                        </Button>
                    </Box>
                    <Box bg="inset" style={{ padding:"12px 14px", borderBottom:`1px solid ${darkTheme.color.border.default}` }}>
                        <Text variant="label" color="muted" style={{ marginBottom:4, display:"block" }}>{pack.workspace.ui.output_label}</Text>
                        <Text variant="heading" color={result ? "success" : "muted"}>{result ?? "—"}</Text>
                    </Box>
                    <div className="simphy-log" style={{ flex:1, overflowY:"auto", padding:"10px 14px", display:"flex", flexDirection:"column", gap:4 }} ref={logAreaRef}>
                        <div data-placeholder style={{ color:"#374151", fontSize:12 }}>{pack.workspace.ui.log_placeholder}</div>
                    </div>
                </Box>
            </div>

            {/* Block management modal */}
            {showBlocks && (
                <div style={modalOverlay} onClick={() => setShowBlocks(false)}>
                    <Box bg="modal" style={modalBox} onClick={(e) => e.stopPropagation()}>
                        <Box bg="raised" style={modalHd}>
                            <Inline gap="xs">
                                <button onClick={handleOpenBlocks}
                                    style={{ background: blockMode==="export" ? darkTheme.color.border.default : "none", border:`1px solid ${darkTheme.color.border.strong}`, borderRadius:darkTheme.borderRadius.md, color:darkTheme.color.text.accent, cursor:"pointer", fontSize:12, padding:"4px 12px" }}>
                                    {pack.workspace.ui.export_button}
                                </button>
                                <button onClick={handleOpenImport}
                                    style={{ background: blockMode==="import" ? darkTheme.color.border.default : "none", border:`1px solid ${darkTheme.color.border.strong}`, borderRadius:darkTheme.borderRadius.md, color:darkTheme.color.text.accent, cursor:"pointer", fontSize:12, padding:"4px 12px" }}>
                                    {pack.workspace.ui.import_button}
                                </button>
                                {watSource && (
                                    <button onClick={() => setBlockMode("wat")}
                                        style={{ background: blockMode==="wat" ? darkTheme.color.border.default : "none", border:`1px solid ${darkTheme.color.border.strong}`, borderRadius:darkTheme.borderRadius.md, color:darkTheme.color.text.code, cursor:"pointer", fontSize:12, padding:"4px 12px" }}>
                                        {pack.workspace.ui.wat_button}
                                    </button>
                                )}
                            </Inline>
                            <button onClick={() => setShowBlocks(false)} style={closeBtn}>✕</button>
                        </Box>

                        {blockMode === "export" && (<>
                            <div style={{ padding:"8px 12px", borderBottom:`1px solid ${darkTheme.color.border.default}`, display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                                <Button variant="blocks" size="sm" onClick={handleSaveToStorage}>{pack.workspace.ui.save_local_button}</Button>
                                <Button variant="wat"    size="sm" onClick={handleDownloadFile}>{pack.workspace.ui.save_file_button}</Button>
                                <Button variant="reset"  size="sm" onClick={() => navigator.clipboard.writeText(blockData)}>{pack.workspace.ui.copy_button}</Button>
                                <Button variant="reset"  size="sm" onClick={() => { handleReset(); setShowBlocks(false); }}>{pack.workspace.ui.reset_button}</Button>
                            </div>
                            {savedList.length > 0 && (
                                <div style={{ padding:"6px 12px", borderBottom:`1px solid ${darkTheme.color.border.default}`, display:"flex", flexWrap:"wrap", gap:4 }}>
                                    {savedList.map(name => (
                                        <span key={name} style={{ display:"flex", alignItems:"center", gap:3, background:darkTheme.color.border.default, borderRadius:5, padding:"2px 8px", fontSize:11, color:darkTheme.color.text.accent }}>
                                            {name}
                                            <button onClick={() => handleDeleteFromStorage(name)}
                                                style={{ background:"none", border:"none", color:darkTheme.color.text.muted, cursor:"pointer", fontSize:12, lineHeight:1, padding:"0 2px" }}>✕</button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <pre style={{ overflow:"auto", flex:1, margin:0, padding:16, fontSize:11, color:darkTheme.color.text.code, lineHeight:1.7, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>{blockData}</pre>
                        </>)}

                        {blockMode === "import" && (<>
                            <div style={{ padding:"8px 12px", borderBottom:`1px solid ${darkTheme.color.border.default}`, display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                                <Button variant="blocks" size="sm" onClick={() => fileInputRef.current?.click()}>{pack.workspace.ui.open_file_button}</Button>
                                <input ref={fileInputRef} type="file" accept=".simphy,.json" onChange={handleFileInput} style={{ display:"none" }} />
                                <Button variant="run" size="sm" onClick={handleLoadBlocks}>{pack.workspace.ui.apply_button}</Button>
                            </div>
                            {savedList.length > 0 && (
                                <div style={{ padding:"6px 12px", borderBottom:`1px solid ${darkTheme.color.border.default}`, display:"flex", flexWrap:"wrap", gap:4 }}>
                                    {savedList.map(name => (
                                        <button key={name} onClick={() => handleLoadFromStorage(name)}
                                            style={{ background:darkTheme.color.border.default, border:`1px solid ${darkTheme.color.border.strong}`, borderRadius:5, padding:"2px 10px", fontSize:11, color:darkTheme.color.text.accent, cursor:"pointer" }}>
                                            {name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <textarea value={blockData} onChange={(e) => setBlockData(e.target.value)}
                                placeholder={pack.workspace.ui.xml_textarea_placeholder} spellCheck={false}
                                style={{ flex:1, margin:0, padding:16, fontSize:11, color:darkTheme.color.text.code, lineHeight:1.6, background:darkTheme.color.bg.root, border:"none", outline:"none", resize:"none", fontFamily:darkTheme.font.mono, minHeight:340 }}
                            />
                        </>)}

                        {blockMode === "wat" && (
                            <pre style={{ overflow:"auto", flex:1, margin:0, padding:16, fontSize:12, color:darkTheme.color.text.code, lineHeight:1.7, whiteSpace:"pre" }}>{watSource}</pre>
                        )}
                    </Box>
                </div>
            )}


            {/* Custom function management modal */}
            {showFuncMgr && (
                <div style={modalOverlay} onClick={() => setShowFuncMgr(false)}>
                    <Box bg="modal" style={{ ...modalBox, width:"min(560px,95vw)" }} onClick={e => e.stopPropagation()}>
                        <Box bg="raised" style={modalHd}>
                            <Text variant="label" color="accent">{pack.workspace.ui.func_mgr_title}</Text>
                            <button onClick={() => setShowFuncMgr(false)} style={closeBtn}>✕</button>
                        </Box>

                        <div style={{ overflowY:"auto", maxHeight:260, padding:"8px 12px", display:"flex", flexDirection:"column", gap:6 }}>
                            {customFuncs.length === 0 && (
                                <Text variant="body" color="muted">{pack.workspace.ui.func_empty_message}</Text>
                            )}
                            {customFuncs.map(spec => (
                                <div key={spec.id} style={{ background:"#111120", border:`1px solid ${darkTheme.color.border.strong}`, borderRadius:darkTheme.borderRadius.md, padding:"8px 12px", display:"flex", alignItems:"center", gap:8 }}>
                                    <div style={{ flex:1, fontSize:12 }}>
                                        <span style={{ color:darkTheme.color.text.accent, fontWeight:700 }}>{spec.name}</span>
                                        <span style={{ color:darkTheme.color.text.muted }}> → {spec.retType}</span>
                                        {spec.params.length > 0 && (
                                            <span style={{ color:"#38bdf8" }}>
                                                {"  "}({spec.params.map(p => `${p.name}:${p.type}`).join(", ")})
                                            </span>
                                        )}
                                    </div>
                                    <button onClick={() => handleRemoveFunc(spec.id)}
                                        style={{ background:"#2d0f0f", border:`1px solid ${darkTheme.color.text.error}`, borderRadius:5, color:darkTheme.color.text.error, cursor:"pointer", fontSize:11, padding:"3px 10px" }}>{pack.workspace.ui.delete_button}</button>
                                </div>
                            ))}
                        </div>

                        <div style={{ borderTop:`1px solid ${darkTheme.color.border.default}`, margin:"0 12px" }} />

                        <div style={{ padding:"12px" }}>
                            <Text variant="label" color="accent" style={{ marginBottom:8, display:"block" }}>{pack.workspace.ui.add_func_section}</Text>
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
                                            style={{ background:"none", border:"none", color:darkTheme.color.text.muted, cursor:"pointer", fontSize:16 }}>✕</button>
                                    </div>
                                ))}
                                <Button variant="reset" size="sm" style={{ alignSelf:"flex-start" }}
                                    onClick={() => setNewFuncParams(prev => [...prev, { name:`p${prev.length}`, type:"i32" }])}>
                                    {pack.workspace.ui.add_param_button}
                                </Button>
                            </div>
                            <Button variant="run" style={{ width:"100%" }} onClick={handleAddFunc}>{pack.workspace.ui.add_button}</Button>
                        </div>
                    </Box>
                </div>
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
                const tabBtn = (label: string, tab: "2d" | "3d") => (
                    <button onClick={() => setBdMgrTab(tab)} style={{
                        background: bdMgrTab === tab ? darkTheme.color.border.default : "none",
                        border: `1px solid ${darkTheme.color.border.strong}`,
                        borderRadius: darkTheme.borderRadius.md,
                        color: darkTheme.color.text.accent,
                        cursor: "pointer", fontSize: 12, padding: "4px 14px",
                    }}>{label}</button>
                );
                return (
                    <div style={modalOverlay} onClick={() => setShowBdMgr(false)}>
                        <Box bg="modal" style={{ ...modalBox, width: "min(560px,95vw)" }} onClick={e => e.stopPropagation()}>
                            <Box bg="raised" style={modalHd}>
                                <Inline gap="xs">
                                    {tabBtn("🗺 Boundary 2D", "2d")}
                                    {tabBtn("🌐 Boundary 3D", "3d")}
                                </Inline>
                                <button onClick={() => setShowBdMgr(false)} style={closeBtn}>✕</button>
                            </Box>

                            <div style={{ overflowY: "auto", maxHeight: 240, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                                {arrays.length === 0 && (
                                    <Text variant="body" color="muted">업로드된 배열이 없습니다.</Text>
                                )}
                                {arrays.map(entry => (
                                    <div key={entry.id} style={{ background: "#111120", border: `1px solid ${darkTheme.color.border.strong}`, borderRadius: darkTheme.borderRadius.md, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                                        <div style={{ flex: 1, fontSize: 12 }}>
                                            <span style={{ color: darkTheme.color.text.accent, fontWeight: 700 }}>{entry.name}</span>
                                            <span style={{ color: darkTheme.color.text.muted }}> — {entry.count}개 원소</span>
                                            <span style={{ color: darkTheme.color.text.code, fontSize: 11 }}> (0x{entry.offset.toString(16)})</span>
                                        </div>
                                        <button onClick={() => onRemove(entry.id)}
                                            style={{ background: "#2d0f0f", border: `1px solid ${darkTheme.color.text.error}`, borderRadius: 5, color: darkTheme.color.text.error, cursor: "pointer", fontSize: 11, padding: "3px 10px" }}>삭제</button>
                                    </div>
                                ))}
                            </div>

                            <div style={{ borderTop: `1px solid ${darkTheme.color.border.default}`, margin: "0 12px" }} />

                            <div style={{ padding: "12px" }}>
                                <Text variant="label" color="accent" style={{ marginBottom: 8, display: "block" }}>새 배열 업로드</Text>
                                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                                    <input value={nameVal} onChange={e => setName(e.target.value)}
                                        placeholder="변수명 (영문)" style={{ ...inputStyle, flex: 1 }} />
                                    <Button variant="blocks" size="sm" onClick={() => fileRef.current?.click()}>.bin 파일 선택</Button>
                                    <input ref={fileRef} type="file" accept=".bin" onChange={onFile} style={{ display: "none" }} />
                                </div>
                                <div style={{ fontSize: 11, color: darkTheme.color.text.muted, lineHeight: 1.6 }}>
                                    형식: {fmt}<br />
                                    블록 사용: <span style={{ color: darkTheme.color.text.code }}>{prefix} 변수 선언</span> → <span style={{ color: darkTheme.color.text.code }}>{prefix} 반복</span>
                                </div>
                            </div>
                        </Box>
                    </div>
                );
            })()}

            {/* Error modal */}
            {errorModal && (
                <div style={modalOverlay} onClick={() => setErrorModal(null)}>
                    <Box bg="modal" style={{ ...modalBox, width:"min(480px,90vw)", maxHeight:"unset" }} onClick={(e) => e.stopPropagation()}>
                        <Box bg="raised" style={modalHd}>
                            <Text variant="label" color="error">⚠ 오류</Text>
                            <button onClick={() => setErrorModal(null)} style={closeBtn}>✕</button>
                        </Box>
                        <pre style={{ margin:0, padding:"16px", fontSize:12, color:darkTheme.color.text.code, lineHeight:1.7, whiteSpace:"pre-wrap", wordBreak:"break-all", overflowY:"auto", maxHeight:300 }}>{errorModal}</pre>
                        <div style={{ padding:"10px 16px", borderTop:`1px solid ${darkTheme.color.border.default}`, display:"flex", justifyContent:"flex-end", gap:8 }}>
                            <Button variant="reset" size="sm" onClick={() => navigator.clipboard.writeText(errorModal)}>복사</Button>
                            <Button variant="blocks" size="sm" onClick={() => setErrorModal(null)}>닫기</Button>
                        </div>
                    </Box>
                </div>
            )}

            {/* AI chat modal */}
            {showChat && (
                <div style={modalOverlay} onClick={() => { chatAbortRef.current?.abort(); setShowChat(false); }}>
                    <Box bg="modal" style={{ ...modalBox, width: chatDiffData ? "min(1200px,95vw)" : "min(620px,95vw)", maxHeight:"85vh" }} onClick={(e) => e.stopPropagation()}>
                        <Box bg="raised" style={modalHd}>
                            <Text variant="label" color="accent">✦ AI 어시스턴트</Text>
                            <button onClick={() => { chatAbortRef.current?.abort(); setShowChat(false); }} style={closeBtn}>✕</button>
                        </Box>

                        {/* Input area */}
                        <div style={{ padding:"12px 16px", borderBottom:`1px solid ${darkTheme.color.border.default}`, display:"flex", gap:8, flexShrink:0 }}>
                            <textarea
                                value={chatPrompt}
                                onChange={(e) => setChatPrompt(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !chatStreaming) handleChat(); }}
                                placeholder="Ask about the current block program... (Ctrl+Enter to send)"
                                rows={3}
                                style={{ flex:1, padding:"8px 10px", borderRadius:6, border:`1px solid ${darkTheme.color.border.strong}`, background:darkTheme.color.bg.root, color:darkTheme.color.text.primary, fontFamily:darkTheme.font.mono, fontSize:12, resize:"vertical", outline:"none", lineHeight:1.6 }}
                            />
                            <div style={{ display:"flex", flexDirection:"column", gap:6, justifyContent:"flex-end" }}>
                                <Button variant="run" size="sm" onClick={handleChat} disabled={chatStreaming || !chatPrompt.trim()}>
                                    {chatStreaming ? "..." : "전송"}
                                </Button>
                                {chatStreaming && (
                                    <Button variant="reset" size="sm" onClick={() => chatAbortRef.current?.abort()}>중단</Button>
                                )}
                            </div>
                        </div>

                        {/* Output area — split when diff data is available */}
                        {chatDiffData ? (
                            <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:400 }}>
                                {/* Left: diff tree */}
                                <div style={{ flex:1, display:"flex", flexDirection:"column", borderRight:`1px solid ${darkTheme.color.border.default}`, overflow:"hidden" }}>
                                    <div style={{ padding:"5px 12px", background:darkTheme.color.bg.raised, borderBottom:`1px solid ${darkTheme.color.border.default}`, display:"flex", gap:14, alignItems:"center", fontSize:11, flexShrink:0 }}>
                                        <span style={{ color:"#4ade80" }}>■ 추가됨</span>
                                        <span style={{ color:"#f87171" }}>■ 삭제됨</span>
                                        <span style={{ color:"#9ca3af" }}>■ 공통</span>
                                    </div>
                                    <div style={{ flex:1, position:"relative", minHeight:0 }}>
                                        <div ref={chatDiffDivRef} style={{ position:"absolute", inset:0 }} />
                                    </div>
                                </div>
                                {/* Right: streaming text */}
                                <div style={{ width:380, flexShrink:0, overflowY:"auto" }}>
                                    {chatOutput ? (
                                        <pre style={{ margin:0, padding:"16px", fontSize:12, color:darkTheme.color.text.code, lineHeight:1.75, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{chatOutput}{chatStreaming && <span style={{ opacity:0.5 }}>▌</span>}</pre>
                                    ) : (
                                        <div style={{ padding:"32px 16px", textAlign:"center", color:darkTheme.color.text.muted, fontSize:12 }}>
                                            {chatStreaming ? "응답 생성 중..." : "응답이 여기에 표시됩니다."}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div style={{ flex:1, overflowY:"auto", position:"relative" }}>
                                {chatOutput ? (
                                    <pre style={{ margin:0, padding:"16px", fontSize:12, color:darkTheme.color.text.code, lineHeight:1.75, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{chatOutput}{chatStreaming && <span style={{ opacity:0.5 }}>▌</span>}</pre>
                                ) : (
                                    <div style={{ padding:"32px 16px", textAlign:"center", color:darkTheme.color.text.muted, fontSize:12 }}>
                                        {chatStreaming ? "응답 생성 중..." : "응답이 여기에 표시됩니다."}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Bottom buttons */}
                        {(chatOutput || chatResult) && (
                            <div style={{ padding:"10px 16px", borderTop:`1px solid ${darkTheme.color.border.default}`, display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexShrink:0 }}>
                                <div>
                                    {chatResult && (
                                        <Button variant="run" size="sm" onClick={() => {
                                            const ws = workspaceRef.current;
                                            if (!ws || !chatResult) return;
                                            try {
                                                ws.clear();
                                                console.log(chatResult, typeof chatResult);
                                                Blockly.serialization.workspaces.load(chatResult as Parameters<typeof Blockly.serialization.workspaces.load>[0], ws);
                                                setShowChat(false);
                                            } catch (err) {
                                                showErrorModal(`Block apply error: ${err instanceof Error ? err.message : String(err)}`);
                                            }
                                        }}>✦ 워크스페이스에 적용</Button>
                                    )}
                                </div>
                                <div style={{ display:"flex", gap:8 }}>
                                    {chatOutput && <Button variant="reset" size="sm" onClick={() => navigator.clipboard.writeText(chatOutput)}>복사</Button>}
                                    <Button variant="blocks" size="sm" onClick={() => { setChatOutput(""); setChatResult(null); setChatDiffData(null); }}>지우기</Button>
                                </div>
                            </div>
                        )}
                    </Box>
                </div>
            )}

        </Box>
    );
};

export default BlocklyWasmIDE;