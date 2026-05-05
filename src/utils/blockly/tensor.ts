import * as Blockly from "blockly/core";
import { simulizer } from "../wasm/engine";
import { BlockBuilder, GetVarID, type BlockSet, type CompileCtx } from "./$base";
import { MAX_DIM } from "../wasm/tensor";

function buildTensorNewCall(block: Blockly.Block, ctx: CompileCtx): simulizer.Expr | null {
    const tensorName = `__tensor_${block.id}`;
    const dim = Math.max(1, parseInt(block.getFieldValue("DIM") || "1", 10));

    const uid = Math.random().toString(36).slice(2, 7);
    const arrayType = simulizer.i32Array;

    const baseOffset = ctx.nextArrayOffset ?? 0x1000;
    ctx.nextArrayOffset = baseOffset + arrayType.totalBytes(dim);

    const arrDef = new simulizer.ArrayDef(`__tensor_new_${uid}`, arrayType, dim, baseOffset);
    const ptr = arrDef.register(ctx.module);

    const ptrLocal = ctx.getOrCreateLocal(ctx, `__tensor_new_ptr_${uid}`, simulizer.i32);

    const ops = new simulizer.ArrayOps(arrayType);
    const exprs: simulizer.Expr[] = [new simulizer.LocalSet(ptrLocal, ptr)];

    for (let i = 0; i < dim; i++) {
        const dimBlock = block.getInputTargetBlock(`DIM_${i}`);
        const dimExpr = dimBlock ? ctx.blockToExpr(dimBlock, ctx) : simulizer.i32c(1);
        if (!dimExpr) return null;
        exprs.push(ops.set(
            ctx.coerce(ptrLocal, simulizer.i32),
            simulizer.i32c(i),
            ctx.coerce(dimExpr, simulizer.i32),
        ));
    }

    exprs.push(
        new simulizer.Call(
            "tensor_create",
            [
                simulizer.i32c(GetVarID(tensorName)),
                ctx.coerce(ptrLocal, simulizer.i32),
                simulizer.i32c(dim),
            ],
            simulizer.i32,
        ),
    );

    return new simulizer.Block(`tensor_new_${uid}`, exprs, simulizer.i32);
}

function buildTensorRandomCall(block: Blockly.Block, ctx: CompileCtx): simulizer.Call | null {
    const name = `__tensor_${block.id}`;
    const distType = parseInt(block.getFieldValue("DIST") as string, 10);

    const param1Block = block.getInputTargetBlock("PARAM1");
    const param2Block = block.getInputTargetBlock("PARAM2");
    const arrBlock = block.getInputTargetBlock("ARRAY");
    if (!param1Block || !param2Block || !arrBlock) return null;

    const param1Expr = ctx.blockToExpr(param1Block, ctx);
    const param2Expr = ctx.blockToExpr(param2Block, ctx);
    const arrExpr = ctx.blockToExpr(arrBlock, ctx);
    if (!param1Expr || !param2Expr || !arrExpr) return null;

    const arrName = arrBlock.getFieldValue("NAME") as string;
    const arrInfo = ctx.arrays?.get(arrName);
    const capacity = arrInfo ? arrInfo.def.capacity : 0;

    return new simulizer.Call(
        "tensor_random",
        [
            simulizer.i32c(GetVarID(name)),
            simulizer.i32c(distType),
            ctx.coerce(param1Expr, simulizer.f64),
            ctx.coerce(param2Expr, simulizer.f64),
            ctx.coerce(arrExpr, simulizer.i32),
            simulizer.i32c(capacity),
        ],
        simulizer.i32,
    );
}

function buildTensorGetCall(block: Blockly.Block): simulizer.Const {
    const srcName = block.getFieldValue("NAME") as string;
    return simulizer.i32c(GetVarID(srcName));
}

function buildTensorSaveCall(block: Blockly.Block, ctx: CompileCtx): simulizer.Expr | null {
    const name = block.getFieldValue("NAME") as string;
    const exprBlock = block.getInputTargetBlock("EXPR");

    if (!exprBlock) return null;

    const exprExpr = ctx.blockToExpr(exprBlock, ctx);
    if (!exprExpr) return null;

    return new simulizer.Drop(new simulizer.Call(
        "tensor_save",
        [
            simulizer.i32c(GetVarID(name)),
            ctx.coerce(exprExpr, simulizer.i32),
        ],
        simulizer.i32,
    ));
}

function buildTensorSetByIndexCall(block: Blockly.Block, ctx: CompileCtx): simulizer.Expr | null {
    const tensorName = block.getFieldValue("TENSOR_NAME") as string;
    const dim = Math.max(1, parseInt(block.getFieldValue("DIM") || "1", 10));
    const valueBlock = block.getInputTargetBlock("VALUE");
    if (!valueBlock) return null;
    const valueExpr = ctx.blockToExpr(valueBlock, ctx);
    if (!valueExpr) return null;

    const indexArgs: simulizer.Expr[] = [];
    for (let i = 0; i < MAX_DIM; i++) {
        const idxBlock = i < dim ? block.getInputTargetBlock(`INDEX_${i}`) : null;
        const idxExpr = idxBlock ? ctx.blockToExpr(idxBlock, ctx) : null;
        indexArgs.push(idxExpr ? ctx.coerce(idxExpr, simulizer.i32) : simulizer.i32c(0));
    }

    return new simulizer.Drop(new simulizer.Call(
        "tensor_set",
        [simulizer.i32c(GetVarID(tensorName)), simulizer.i32c(dim), ...indexArgs, ctx.coerce(valueExpr, simulizer.f64)],
        simulizer.i32,
    ));
}

function buildTensorGetByIndexCall(block: Blockly.Block, ctx: CompileCtx): simulizer.Call | null {
    const tensorName = block.getFieldValue("TENSOR_NAME") as string;
    const dim = Math.max(1, parseInt(block.getFieldValue("DIM") || "1", 10));

    const indexArgs: simulizer.Expr[] = [];
    for (let i = 0; i < MAX_DIM; i++) {
        const idxBlock = i < dim ? block.getInputTargetBlock(`INDEX_${i}`) : null;
        const idxExpr = idxBlock ? ctx.blockToExpr(idxBlock, ctx) : null;
        indexArgs.push(idxExpr ? ctx.coerce(idxExpr, simulizer.i32) : simulizer.i32c(0));
    }

    return new simulizer.Call(
        "tensor_get",
        [simulizer.i32c(GetVarID(tensorName)), simulizer.i32c(dim), ...indexArgs],
        simulizer.f64,
    );
}

export const TENSOR_BLOCKS: BlockSet = {
    TENSOR_RANDOM: new BlockBuilder("tensor_random", "i32", 160,"랜덤 텐서 생성 (id 반환)")
        .addBody("TENSOR_RANDOM dist:%1 p1:%2 p2:%3 shape:%4")
        .addArgDropdown("DIST", [["uniform", "0"], ["normal", "1"], ["truncNormal", "2"]])
        .addArgValue("PARAM1", "f64")
        .addArgValue("PARAM2", "f64")
        .addArgValue("ARRAY", "i32*")
        .expr((block, ctx) => buildTensorRandomCall(block, ctx)),
    TENSOR_NEW: new BlockBuilder("tensor_new", "i32", 160,"텐서 초기화 (id 반환)")
        .addBody("dummy — registered directly via Blockly.Blocks")
        .expr((block, ctx) => buildTensorNewCall(block, ctx)),
    TENSOR_GET: new BlockBuilder("tensor_get", "i32", 160,"텐서 가져오기 (id 반환)")
        .addBody("TENSOR_GET %1")
        .addArg("field_input", "NAME", "t")
        .expr((block) => buildTensorGetCall(block)),
    TENSOR_SAVE: new BlockBuilder("tensor_save", undefined, 160,"텐서 저장 TENSOR %1 = %2")
        .addBody("TENSOR %1 = %2")
        .addArg("field_input", "NAME", "out")
        .addArgValue("EXPR", "i32")
        .stmt((block, ctx) => buildTensorSaveCall(block, ctx)),
    TENSOR_BINOP: new BlockBuilder("tensor_binop", "i32", 160,"텐서 이항 연산")
        .addBody("%1 %2 %3")
        .addArgValue("LHS", "i32")
        .addArgDropdown("OP", [["+", "add"], ["-", "sub"], ["@", "matmul"], ["⊙", "elemul"]])
        .addArgValue("RHS", "i32")
        .expr((block, ctx) => {
            const lhsBlock = block.getInputTargetBlock("LHS");
            const rhsBlock = block.getInputTargetBlock("RHS");
            if (!lhsBlock || !rhsBlock) return null;
            const lhsExpr = ctx.blockToExpr(lhsBlock, ctx);
            const rhsExpr = ctx.blockToExpr(rhsBlock, ctx);
            if (!lhsExpr || !rhsExpr) return null;
            const op = block.getFieldValue("OP") as string;
            return new simulizer.Call(`tensor_${op}`,
                [ctx.coerce(lhsExpr, simulizer.i32), ctx.coerce(rhsExpr, simulizer.i32)],
                simulizer.i32);
        }),
    TENSOR_UNOP: new BlockBuilder("tensor_unop", "i32", 160,"텐서 단항 연산")
        .addBody("%1 %2")
        .addArgDropdown("OP", [["neg", "neg"]])
        .addArgValue("TENSOR", "i32")
        .expr((block, ctx) => {
            const tensorBlock = block.getInputTargetBlock("TENSOR");
            if (!tensorBlock) return null;
            const tensorExpr = ctx.blockToExpr(tensorBlock, ctx);
            if (!tensorExpr) return null;
            const op = block.getFieldValue("OP") as string;
            return new simulizer.Call(`tensor_${op}`,
                [ctx.coerce(tensorExpr, simulizer.i32)],
                simulizer.i32);
        }),
    TENSOR_SCALE: new BlockBuilder("tensor_scale", "i32", 160,"텐서 상수배 %1 × %2")
        .addBody("%1 × %2")
        .addArgValue("TENSOR", "i32")
        .addArgValue("SCALAR", "f64")
        .expr((block, ctx) => {
            const tensorBlock = block.getInputTargetBlock("TENSOR");
            const scalarBlock = block.getInputTargetBlock("SCALAR");
            if (!tensorBlock || !scalarBlock) return null;
            const tensorExpr = ctx.blockToExpr(tensorBlock, ctx);
            const scalarExpr = ctx.blockToExpr(scalarBlock, ctx);
            if (!tensorExpr || !scalarExpr) return null;
            return new simulizer.Call(
                "tensor_scale",
                [
                    ctx.coerce(tensorExpr, simulizer.i32),
                    ctx.coerce(scalarExpr, simulizer.f64),
                ],
                simulizer.i32,
            );
        }),
    TENSOR_SET_BY_INDEX: new BlockBuilder("tensor_set_by_index", undefined, 160,"텐서 요소 설정")
        .addBody("dummy — registered directly via Blockly.Blocks")
        .stmt((block, ctx) => buildTensorSetByIndexCall(block, ctx)),
    TENSOR_GET_BY_INDEX: new BlockBuilder("tensor_get_by_index", "f64", 160,"텐서 요소 읽기")
        .addBody("dummy — registered directly via Blockly.Blocks")
        .expr((block, ctx) => buildTensorGetByIndexCall(block, ctx)),
    TENSOR_PERLIN: new BlockBuilder("tensor_perlin", "i32", 160,"Perlin Noise 벡터장 텐서 생성 (2, rows, cols)")
        .addBody("PERLIN_NOISE rows:%1 cols:%2")
        .addArgValue("ROWS", "i32")
        .addArgValue("COLS", "i32")
        .expr((block, ctx) => {
            const name = `__tensor_${block.id}`;
            const rowsBlock = block.getInputTargetBlock("ROWS");
            const colsBlock = block.getInputTargetBlock("COLS");
            if (!rowsBlock || !colsBlock) return null;
            const rowsExpr = ctx.blockToExpr(rowsBlock, ctx);
            const colsExpr = ctx.blockToExpr(colsBlock, ctx);
            if (!rowsExpr || !colsExpr) return null;
            return new simulizer.Call(
                "tensor_perlin",
                [
                    simulizer.i32c(GetVarID(name)),
                    ctx.coerce(rowsExpr, simulizer.i32),
                    ctx.coerce(colsExpr, simulizer.i32),
                ],
                simulizer.i32,
            );
        }),
    TENSOR_SHOW_MAT: new BlockBuilder("tensor_show_mat", undefined, 160,"2D 텐서 시각화")
        .addBody("show_mat %1")
        .addArgValue("TENSOR_ID", "i32")
        .stmt((block, ctx) => {
            const tensorIdBlock = block.getInputTargetBlock("TENSOR_ID");
            if (!tensorIdBlock) return null;
            const tensorIdExpr = ctx.blockToExpr(tensorIdBlock, ctx);
            if (!tensorIdExpr) return null;
            return new simulizer.Drop(new simulizer.Call(
                "show_mat",
                [ctx.coerce(tensorIdExpr, simulizer.i32)],
                simulizer.i32,
            ));
        }),
}

export function registerDynamicTensorBlocks() {
    Blockly.Blocks["tensor_set_by_index"] = {
            init(this: Blockly.Block) {
                this.appendDummyInput()
                    .appendField(new Blockly.FieldTextInput("t"), "TENSOR_NAME")
                    .appendField("[");
                this.appendDummyInput()
                    .appendField("]")
                    .appendField("=");
                this.appendValueInput("VALUE").setCheck("f64");
                this.appendDummyInput()
                    .appendField(new Blockly.FieldNumber(1, 1, MAX_DIM, 1), "DIM");
                this.setInputsInline(true);
                this.setPreviousStatement(true, null);
                this.setNextStatement(true, null);
                this.setColour(160);
                this.setTooltip("텐서 요소 설정");
                const dimField = this.getField("DIM");
                if (dimField) {
                    dimField.setValidator((val: number) => {
                        (this as any).updateShape_(val);
                        return val;
                    });
                }
                this.setOnChange(() => (this as any).updateShape_());
                (this as any).updateShape_();
            },
            mutationToDom(this: Blockly.Block) {
                const el = document.createElement("mutation");
                el.setAttribute("dim", String(Math.max(1, parseInt(this.getFieldValue("DIM") || "1", 10))));
                return el;
            },
            domToMutation(this: Blockly.Block, xmlElement: Element) {
                const dim = Math.max(1, parseInt(xmlElement.getAttribute("dim") || "1", 10));
                (this as any).updateShape_(dim);
            },
            saveExtraState(this: Blockly.Block) {
                return { dim: Math.max(1, parseInt(this.getFieldValue("DIM") || "1", 10)) };
            },
            loadExtraState(this: Blockly.Block, state: { dim: number }) {
                (this as any).updateShape_(state.dim);
            },
            updateShape_(this: Blockly.Block, targetDim?: number) {
                const dim = targetDim ?? Math.max(1, parseInt(this.getFieldValue("DIM") || "1", 10));
                const existing = this.inputList.filter(i => i.name.startsWith("INDEX_")).length;
                if (dim > existing) {
                    for (let i = existing; i < dim; i++) {
                        this.appendValueInput(`INDEX_${i}`).setCheck("i32");
                        if (i < dim - 1) {
                            this.appendDummyInput(`COMMA_${i}`)
                                .appendField(",");
                        }
                        // Move before the "]=" input
                        const inputs = this.inputList.map(inp => inp.name);
                        const closeBracketIndex = inputs.findIndex(n => n.startsWith("dummy") && 
                            this.getInput(n) && 
                            (this.getInput(n) as any).fieldRow.some((f: any) => f.text === "]"));
                        if (closeBracketIndex > 0) {
                            const closeBracketName = inputs[closeBracketIndex];
                            this.moveInputBefore(`INDEX_${i}`, closeBracketName);
                            if (i < dim - 1) {
                                this.moveInputBefore(`COMMA_${i}`, closeBracketName);
                            }
                        }
                    }
                } else {
                    for (let i = existing - 1; i > dim - 1; i--) {
                        this.removeInput(`INDEX_${i}`);
                        if (this.getInput(`COMMA_${i}`)) {
                            this.removeInput(`COMMA_${i}`);
                        }
                    }
                }
            },
        };

    Blockly.Blocks["tensor_get_by_index"] = {
            init(this: Blockly.Block) {
                this.appendDummyInput()
                    .appendField("TENSOR")
                    .appendField(new Blockly.FieldTextInput("t"), "TENSOR_NAME")
                    .appendField("[");
                this.appendValueInput("INDEX_0").setCheck("i32");
                this.appendDummyInput()
                    .appendField("]");
                this.appendDummyInput()
                    .appendField("dims:")
                    .appendField(new Blockly.FieldNumber(1, 1, MAX_DIM, 1), "DIM");
                this.setInputsInline(true);
                this.setOutput(true, "f64");
                this.setColour(160);
                this.setTooltip("텐서 요소 읽기");
                const dimField = this.getField("DIM");
                if (dimField) {
                    dimField.setValidator((val: number) => {
                        (this as any).updateShape_(val);
                        return val;
                    });
                }
                this.setOnChange(() => (this as any).updateShape_());
                (this as any).updateShape_();
            },
            mutationToDom(this: Blockly.Block) {
                const el = document.createElement("mutation");
                el.setAttribute("dim", String(Math.max(1, parseInt(this.getFieldValue("DIM") || "1", 10))));
                return el;
            },
            domToMutation(this: Blockly.Block, xmlElement: Element) {
                const dim = Math.max(1, parseInt(xmlElement.getAttribute("dim") || "1", 10));
                (this as any).updateShape_(dim);
            },
            saveExtraState(this: Blockly.Block) {
                return { dim: Math.max(1, parseInt(this.getFieldValue("DIM") || "1", 10)) };
            },
            loadExtraState(this: Blockly.Block, state: { dim: number }) {
                (this as any).updateShape_(state.dim);
            },
            updateShape_(this: Blockly.Block, targetDim?: number) {
                const dim = targetDim ?? Math.max(1, parseInt(this.getFieldValue("DIM") || "1", 10));
                const existing = this.inputList.filter(i => i.name.startsWith("INDEX_")).length;
                if (dim > existing) {
                    for (let i = existing; i < dim; i++) {
                        this.appendValueInput(`INDEX_${i}`).setCheck("i32");
                        // Move to appropriate position
                        const inputs = this.inputList.map(inp => inp.name);
                        const closeBracketIndex = inputs.findIndex(n => !n.startsWith("INDEX_") && n !== `INDEX_0`);
                        if (closeBracketIndex > 0) {
                            const closeBracketName = inputs[closeBracketIndex];
                            this.moveInputBefore(`INDEX_${i}`, closeBracketName);
                        }
                    }
                } else {
                    for (let i = existing - 1; i > dim - 1; i--) {
                        this.removeInput(`INDEX_${i}`);
                    }
                }
            },
        };

    Blockly.Blocks["tensor_new"] = {
        init(this: Blockly.Block) {
            this.appendDummyInput("HEADER")
                .appendField("[tensor]")
                .appendField("차원:")
                .appendField(new Blockly.FieldNumber(2, 1, MAX_DIM, 1), "DIM");
            this.appendValueInput("DIM_0")
                .setCheck("i32")
                .appendField("dim[0]");
            this.setInputsInline(true);
            this.setOutput(true, "i32");
            this.setColour(160);
            this.setTooltip("텐서 생성 — 차원 크기를 지정하면 텐서 id를 반환합니다");
            this.setOnChange(() => (this as any).updateShape_());
            (this as any).updateShape_();
        },
        mutationToDom(this: Blockly.Block) {
            const el = document.createElement("mutation");
            el.setAttribute("dim", String(Math.max(1, parseInt(this.getFieldValue("DIM") || "1", 10))));
            return el;
        },
        domToMutation(this: Blockly.Block, xmlElement: Element) {
            const dim = Math.max(1, parseInt(xmlElement.getAttribute("dim") || "1", 10));
            (this as any).updateShape_(dim);
        },
        updateShape_(this: Blockly.Block, targetDim?: number) {
            const dim = targetDim ?? Math.max(1, parseInt(this.getFieldValue("DIM") || "1", 10));
            const existing = this.inputList.filter(i => i.name.startsWith("DIM_")).length;
            if (dim > existing) {
                for (let i = existing; i < dim; i++) {
                    this.appendValueInput(`DIM_${i}`)
                        .setCheck("i32")
                        .appendField(`dim[${i}]`);
                }
            } else {
                for (let i = existing - 1; i > dim - 1; i--) {
                    this.removeInput(`DIM_${i}`);
                }
            }
        },
    };
}

export function xmlTensorBlocks(cat: string) {
    return `<category name="${cat}" colour="${160}">
    <sep gap="16"></sep>
    <label text="Tensor"></label>
    <block type="tensor_new"></block>
    <block type="tensor_get"></block>
    <block type="tensor_binop">
        <value name="LHS"><block type="tensor_get"></block></value>
        <value name="RHS"><block type="tensor_get"></block></value>
    </block>
    <block type="tensor_unop">
        <value name="TENSOR"><block type="tensor_get"></block></value>
    </block>
    <block type="tensor_scale">
        <value name="TENSOR"><block type="tensor_get"></block></value>
        <value name="SCALAR"><block type="f64_const"><field name="VALUE">2</field></block></value>
    </block>
    <block type="tensor_save">
        <value name="EXPR"><block type="tensor_binop"></block></value>
    </block>
    <block type="tensor_random">
        <value name="PARAM1"><block type="f64_const"><field name="VALUE">0</field></block></value>
        <value name="PARAM2"><block type="f64_const"><field name="VALUE">1</field></block></value>
        <value name="ARRAY"><block type="local_array_get_i32"></block></value>
    </block>
    <block type="tensor_perlin">
        <value name="ROWS"><block type="i32_const"><field name="VALUE">16</field></block></value>
        <value name="COLS"><block type="i32_const"><field name="VALUE">16</field></block></value>
    </block>
    <block type="tensor_set_by_index"></block>
    <block type="tensor_get_by_index"></block>
    <block type="tensor_show_mat">
        <value name="TENSOR_ID"><block type="tensor_get"></block></value>
    </block>
</category>`;
}
