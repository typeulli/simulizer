import * as Blockly from "blockly/core";
import type { simulizer } from "../engine";
type BlockArg = {
    type: "input_value" | "input_statement" | "field_number" | "field_input" | "field_dropdown";
    name: string;
    check?: string | string[];
    value?: string | number;
    options?: [string, string][];
}
type BlockBody = {
    message: string;
    args: BlockArg[];
}
export class BlockBuilder {
    type: string;
    output?: string | string[];
    colour?: number;
    body: BlockBody[];
    tooltip?: string;
    inputsInline: boolean;
    builderFn?: (block: Blockly.Block, ctx: CompileCtx) => simulizer.Expr | null;
    buildMode: "stmt" | "expr" | undefined = undefined;

    constructor(type: string, output?: string, colour?: number, tooltip?: string, inputsInline: boolean = true) {
        this.type = type;
        this.output = output;
        this.colour = colour;
        this.body = [];
        this.tooltip = tooltip;
        this.inputsInline = inputsInline;
    }
    addBody(message: string) {
        this.body.push({ message, args: [] });
        return this;
    }
    addArg(type: BlockArg["type"], name: string, check?: string | string[], value?: string | number, options?: [string, string][]) {
        if (this.body.length === 0) {
            throw new Error("addArg() called before addBody()");
        }
        this.body[this.body.length - 1].args.push({ type, name, check, value, options });
        return this;
    }
    addArgValue(name: string, check?: string | string[]) {
        return this.addArg("input_value", name, check);
    }
    addArgConst(name: string, value: string | number) {
        return this.addArg("field_number", name, undefined, value);
    }
    addArgDropdown(name: string, options: [string, string][]) {
        return this.addArg("field_dropdown", name, undefined, undefined, options);
    }
    addArgStmt(name: string) {
        this.inputsInline = false;
        return this.addArg("input_statement", name);
    }
    stmt(fn: (block: Blockly.Block, ctx: CompileCtx) => simulizer.Expr | null) {
        this.builderFn = fn;
        this.buildMode = "stmt";
        return this;
    }
    expr(fn: (block: Blockly.Block, ctx: CompileCtx) => simulizer.Expr | null) {
        this.builderFn = fn;
        this.buildMode = "expr";
        return this;
    }

    docs(): string {
        const lines: string[] = [];
        lines.push(`Block: ${this.type}`);
        lines.push(`Mode: ${this.buildMode ?? "undefined"}`);
        if (this.output) lines.push(`Output type: ${this.output}`);
        if (this.colour !== undefined) lines.push(`Colour: ${this.colour}`);
        if (this.tooltip) lines.push(`Tooltip: ${this.tooltip}`);

        this.body.forEach((b, i) => {
            lines.push(`Message[${i}]: "${b.message}"`);
            b.args.forEach((arg, j) => {
                let argDesc = `  Arg[${j}] name="${arg.name}" type="${arg.type}"`;
                if (arg.check) argDesc += ` check=${JSON.stringify(arg.check)}`;
                if (arg.value !== undefined) argDesc += ` default=${arg.value}`;
                if (arg.options) argDesc += ` options=${JSON.stringify(arg.options)}`;
                lines.push(argDesc);
            });
        });

        return lines.join("\n");
    }

    build() {
        var obj = {
            type: this.type,
        } as any;
        if (this.output) obj["output"] = this.output;
        else obj["previousStatement"] = null, obj["nextStatement"] = null;
        if (this.colour) obj["colour"] = this.colour;
        if (this.tooltip) obj["tooltip"] = this.tooltip;
        if (this.inputsInline) obj["inputsInline"] = this.inputsInline;
        this.body.forEach((b, i) => {
            obj[`message${i}`] = b.message;
            obj[`args${i}`] = b.args.map(arg => {
                switch (arg.type) {
                    case "input_value":
                        return { type: "input_value", name: arg.name, check: arg.check };
                    case "field_number":
                        return { type: "field_number", name: arg.name, value: arg.value };
                    case "field_input":
                        return { type: "field_input", name: arg.name, value: arg.value };
                    case "field_dropdown":
                        return { type: "field_dropdown", name: arg.name, options: arg.options };
                    case "input_statement":
                        return { type: "input_statement", name: arg.name };
                }
            });
        });
        return obj;
    }


}


/**
 * 컴파일 컨텍스트.
 * FuncDef와 지역 변수 맵을 공유합니다.
 */
export interface CompileCtx {
    func:             simulizer.FuncDef;
    locals:           Map<string, { local: simulizer.Local; def: simulizer.LocalDef }>;
    funcRetType?:     simulizer.Type;
    module:           simulizer.ModuleDef;
    nextArrayOffset:  number;
    arrays?:          Map<string, {
        ptr:       simulizer.Local;
        elem:      simulizer.Type;
        ops:       simulizer.ArrayOps;
        def:       simulizer.ArrayDef;
        sizeLocal: simulizer.Local;
    }>;
    bd2Arrays?:       Map<string, { offset: number; count: number }>;
    bd3Arrays?:       Map<string, { offset: number; count: number }>;
    breakStack:       string[];
    blockToExpr:      (block: Blockly.Block | null, ctx: CompileCtx) => simulizer.Expr | null;
    stmtBlockToExpr:  (block: Blockly.Block       , ctx: CompileCtx) => simulizer.Expr | null;
    coerce:           (expr: simulizer.Expr, target: simulizer.Type) => simulizer.Expr;
    stmtChainToExprs: (block: Blockly.Block | null, ctx: CompileCtx) => simulizer.Expr[];
    getOrCreateLocal: (ctx: CompileCtx, name: string, type: simulizer.Type) => simulizer.Local;
}

export type BlockSet = { [type: string]: BlockBuilder };

export function zip(...sets: BlockSet[]): BlockSet {
    const result: BlockSet = {};
    for (const set of sets) {
        for (const [key, value] of Object.entries(set)) {
            if (result[key]) {
                throw new Error(`Duplicate block type: ${key}`);
            }
            result[key] = value;
        }
    }
    return result;
}

export type BlockDef = { type: string } & { [key: string]: unknown };

export function unpack(blockSet: BlockSet): BlockDef[] {
    return Object.values(blockSet).map(block => block.build());
}

export function xml(blockSet: BlockSet): string {
    let xml = "";
    for (const block of Object.values(blockSet)) {
        const blockObj = block.build();
        xml += `<block type="${blockObj.type}">\n`;
        for (let i = 0; blockObj[`message${i === 0 ? "0" : i + 1}`]; i++) {
            const message = blockObj[`message${i === 0 ? "0" : i + 1}`];
            const args = blockObj[`args${i === 0 ? "0" : i + 1}`];
            let argIndex = 0;
            let messageXml = "";
            for (const part of message.split(/(%\d+)/)) {
                if (part.match(/%\d+/)) {
                    const arg = args[argIndex++];
                    switch (arg.type) {
                        case "input_value":
                            messageXml += `<value name="${arg.name}"><block type="simphy_${arg.check}"></block></value>`;
                            break;
                        case "field_number":
                            messageXml += `<field name="${arg.name}">${arg.value}</field>`;
                            break;
                        case "field_input":
                            messageXml += `<field name="${arg.name}">${arg.value}</field>`;
                            break;
                        case "field_dropdown":
                            messageXml += `<field name="${arg.name}"><dropdown>${arg.options.map((option: [string, string]) => `<option value="${option[1]}">${option[0]}</option>`).join("")}</dropdown></field>`;
                            break;
                    }
                } else {
                    messageXml += part;
                }
            }
            xml += messageXml;
        }
        xml += `</block>\n`;
    }
    return xml;
}

const VarIDS: { [key: string]: number } = {};
export function GetVarID(name: string): number {
    if (!VarIDS[name]) {
        const newId = Object.keys(VarIDS).length + 1;
        VarIDS[name] = newId;
    }
    return VarIDS[name];
}
