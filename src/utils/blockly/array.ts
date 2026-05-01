import * as Blockly from "blockly/core";
import { simulizer } from "../wasm/engine";
import { BlockBuilder, type BlockSet } from "./$base";

export const ARRAY_BLOCKS: BlockSet = {
    LOCAL_ARRAY_DECL_I32: new BlockBuilder("local_array_decl_i32", undefined, 120, "int 배열 선언")
        .addBody("int arr %1[%2]")
        .addArg("field_input", "NAME", "arr")
        .addArgValue("SIZE", "i32")
        .stmt((block, ctx) => {
            const name =
                (block.getFieldValue("NAME") as string) ||
                (block.getFieldValue("VAR") as string) ||
                (block.getFieldValue("ARRAY") as string);
            const sizeBlock = ctx.blockToExpr(block.getInputTargetBlock("SIZE"), ctx);
            if (!name || !sizeBlock) return null;

            const arrayType = simulizer.i32Array;

            const capacity = sizeBlock instanceof simulizer.Const
                ? Number(sizeBlock.value)
                : 256;

            const baseOffset = ctx.nextArrayOffset ?? 0x1000;
            ctx.nextArrayOffset = baseOffset + arrayType.totalBytes(capacity);

            const arrDef = new simulizer.ArrayDef(name, arrayType, capacity, baseOffset);
            const ptr = arrDef.register(ctx.module);

            const ptrLocal = ctx.getOrCreateLocal(ctx, `__arr_${name}`, simulizer.i32);
            const sizeLocal = ctx.getOrCreateLocal(ctx, `__arr_${name}_size`, simulizer.i32);

            ctx.arrays ??= new Map();
            ctx.arrays.set(name, {
                ptr: ptrLocal,
                elem: simulizer.i32,
                ops: new simulizer.ArrayOps(arrayType),
                def: arrDef,
                sizeLocal,
            });

            return new simulizer.Block(`arr_decl_${name}`, [
                new simulizer.LocalSet(sizeLocal, sizeBlock),
                new simulizer.LocalSet(ptrLocal, ptr),
            ], simulizer.void_);
        }),
    LOCAL_ARRAY_DECL_F64: new BlockBuilder("local_array_decl_f64", undefined, 120, "float 배열 선언")
        .addBody("float arr %1[%2]")
        .addArg("field_input", "NAME", "arr")
        .addArgValue("SIZE", "i32")
        .stmt((block, ctx) => {
            const name =
                (block.getFieldValue("NAME") as string) ||
                (block.getFieldValue("VAR") as string) ||
                (block.getFieldValue("ARRAY") as string);
            const sizeBlock = ctx.blockToExpr(block.getInputTargetBlock("SIZE"), ctx);
            if (!name || !sizeBlock) return null;

            const arrayType = simulizer.f64Array;

            const capacity = sizeBlock instanceof simulizer.Const
                ? Number(sizeBlock.value)
                : 256;

            const baseOffset = ctx.nextArrayOffset ?? 0x1000;
            ctx.nextArrayOffset = baseOffset + arrayType.totalBytes(capacity);

            const arrDef = new simulizer.ArrayDef(name, arrayType, capacity, baseOffset);
            const ptr = arrDef.register(ctx.module);

            const ptrLocal = ctx.getOrCreateLocal(ctx, `__arr_${name}`, simulizer.i32);
            const sizeLocal = ctx.getOrCreateLocal(ctx, `__arr_${name}_size`, simulizer.i32);

            ctx.arrays ??= new Map();
            ctx.arrays.set(name, {
                ptr: ptrLocal,
                elem: simulizer.f64,
                ops: new simulizer.ArrayOps(arrayType),
                def: arrDef,
                sizeLocal,
            });

            return new simulizer.Block(`arr_decl_${name}`, [
                new simulizer.LocalSet(sizeLocal, sizeBlock),
                new simulizer.LocalSet(ptrLocal, ptr),
            ], simulizer.void_);
        }),
    ARRAY_GET_I32: new BlockBuilder("array_get_i32", "i32", 120, "int 배열 읽기")
        .addBody("%1[%2]")
        .addArgValue("ARRAY", "i32*")
        .addArgValue("INDEX", "i32")
        .expr((block, ctx) => {
            const arrExpr = ctx.blockToExpr(block.getInputTargetBlock("ARRAY"), ctx);
            const idx = ctx.blockToExpr(block.getInputTargetBlock("INDEX"), ctx);
            if (!arrExpr || !idx) return null;
            const ops = new simulizer.ArrayOps(simulizer.i32Array);
            return ops.get(ctx.coerce(arrExpr, simulizer.i32), ctx.coerce(idx, simulizer.i32));
        }),
    ARRAY_GET_F64: new BlockBuilder("array_get_f64", "f64", 120, "float 배열 읽기")
        .addBody("%1[%2]")
        .addArgValue("ARRAY", "f64*")
        .addArgValue("INDEX", "i32")
        .expr((block, ctx) => {
            const arrExpr = ctx.blockToExpr(block.getInputTargetBlock("ARRAY"), ctx);
            const idx = ctx.blockToExpr(block.getInputTargetBlock("INDEX"), ctx);
            if (!arrExpr || !idx) return null;
            const ops = new simulizer.ArrayOps(simulizer.f64Array);
            return ops.get(ctx.coerce(arrExpr, simulizer.i32), ctx.coerce(idx, simulizer.i32));
        }),
    ARRAY_SET_I32: new BlockBuilder("array_set_i32", undefined, 120, "int 배열 쓰기")
        .addBody("%1[%2] ← %3")
        .addArgValue("ARRAY", "i32*")
        .addArgValue("INDEX", "i32")
        .addArgValue("VALUE", "i32")
        .stmt((block, ctx) => {
            const arrExpr = ctx.blockToExpr(block.getInputTargetBlock("ARRAY"), ctx);
            const idx = ctx.blockToExpr(block.getInputTargetBlock("INDEX"), ctx);
            const val = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            if (!arrExpr || !idx || !val) return null;
            const ops = new simulizer.ArrayOps(simulizer.i32Array);
            return ops.set(
                ctx.coerce(arrExpr, simulizer.i32),
                ctx.coerce(idx, simulizer.i32),
                ctx.coerce(val, simulizer.i32),
            );
        }),
    ARRAY_SET_F64: new BlockBuilder("array_set_f64", undefined, 120, "float 배열 쓰기")
        .addBody("%1[%2] ← %3")
        .addArgValue("ARRAY", "f64*")
        .addArgValue("INDEX", "i32")
        .addArgValue("VALUE", "f64")
        .stmt((block, ctx) => {
            const arrExpr = ctx.blockToExpr(block.getInputTargetBlock("ARRAY"), ctx);
            const idx = ctx.blockToExpr(block.getInputTargetBlock("INDEX"), ctx);
            const val = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            if (!arrExpr || !idx || !val) return null;
            const ops = new simulizer.ArrayOps(simulizer.f64Array);
            return ops.set(
                ctx.coerce(arrExpr, simulizer.i32),
                ctx.coerce(idx, simulizer.i32),
                ctx.coerce(val, simulizer.f64),
            );
        }),
    ARRAY_ASSIGN_I32: new BlockBuilder("array_assign_i32", undefined, 120, "int* 대입")
        .addBody("int* %1 ← %2")
        .addArg("field_input", "NAME", "arr")
        .addArgValue("PTR", "i32*")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            if (!name) return null;
            const ptrBlock = block.getInputTargetBlock("PTR");
            const ptrExpr = ctx.blockToExpr(ptrBlock, ctx);
            if (!ptrExpr) return null;
            const local = ctx.getOrCreateLocal(ctx, `__arr_${name}`, simulizer.i32);
            if (ptrBlock?.type === "array_literal_i32") {
                const capacity = Math.max(1, parseInt(ptrBlock.getFieldValue("SIZE") || "1", 10));
                ctx.arrays ??= new Map();
                const sizeLocal_i32 = ctx.getOrCreateLocal(ctx, `__arr_${name}_size`, simulizer.i32);
                ctx.arrays.set(name, {
                    ptr: local,
                    elem: simulizer.i32,
                    ops: new simulizer.ArrayOps(simulizer.i32Array),
                    def: new simulizer.ArrayDef(name, simulizer.i32Array, capacity, 0),
                    sizeLocal: sizeLocal_i32,
                });
            }
            return new simulizer.LocalSet(local, ctx.coerce(ptrExpr, simulizer.i32));
        }),
    ARRAY_ASSIGN_F64: new BlockBuilder("array_assign_f64", undefined, 120, "float* 대입")
        .addBody("float* %1 ← %2")
        .addArg("field_input", "NAME", "arr")
        .addArgValue("PTR", "f64*")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            if (!name) return null;
            const ptrBlock = block.getInputTargetBlock("PTR");
            const ptrExpr = ctx.blockToExpr(ptrBlock, ctx);
            if (!ptrExpr) return null;
            const local = ctx.getOrCreateLocal(ctx, `__arr_${name}`, simulizer.i32);
            if (ptrBlock?.type === "array_literal_f64") {
                const capacity = Math.max(1, parseInt(ptrBlock.getFieldValue("SIZE") || "1", 10));
                ctx.arrays ??= new Map();
                const sizeLocal_f64 = ctx.getOrCreateLocal(ctx, `__arr_${name}_size`, simulizer.i32);
                ctx.arrays.set(name, {
                    ptr: local,
                    elem: simulizer.f64,
                    ops: new simulizer.ArrayOps(simulizer.f64Array),
                    def: new simulizer.ArrayDef(name, simulizer.f64Array, capacity, 0),
                    sizeLocal: sizeLocal_f64,
                });
            }
            return new simulizer.LocalSet(local, ctx.coerce(ptrExpr, simulizer.i32));
        }),
    LOCAL_ARRAY_GET_I32: new BlockBuilder("local_array_get_i32", "i32*", 120, "int* 변수")
        .addBody("int* %1")
        .addArg("field_input", "NAME", "arr")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            return ctx.getOrCreateLocal(ctx, `__arr_${name}`, simulizer.i32);
        }),
    LOCAL_ARRAY_GET_F64: new BlockBuilder("local_array_get_f64", "f64*", 120, "float* 변수")
        .addBody("float* %1")
        .addArg("field_input", "NAME", "arr")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            return ctx.getOrCreateLocal(ctx, `__arr_${name}`, simulizer.i32);
        }),
}

const MAX_LITERAL_SIZE = 32;

function buildArrayLiteralBlock(
    blockType: string,
    elemType: "i32" | "f64",
    colour: string | number,
) {
    Blockly.Blocks[blockType] = {
        init(this: Blockly.Block) {
            const label = elemType === "i32" ? "int" : "float";
            this.appendDummyInput("HEADER")
                .appendField(`[${label}]`)
                .appendField("크기:")
                .appendField(new Blockly.FieldNumber(3, 1, MAX_LITERAL_SIZE, 1), "SIZE");
            this.appendValueInput("VAL_0")
                .setCheck(elemType)
                .appendField("[0]");
            this.appendValueInput("VAL_1")
                .setCheck(elemType)
                .appendField("[1]");
            this.appendValueInput("VAL_2")
                .setCheck(elemType)
                .appendField("[2]");
            this.setInputsInline(true);
            this.setOutput(true, elemType === "i32" ? "i32*" : "f64*");
            this.setColour(colour);
            this.setTooltip(`${label}* 리터럴 — 값을 채운 뒤 포인터를 반환합니다`);
            this.setOnChange(() => (this as any).updateShape_());
        },
        mutationToDom(this: Blockly.Block) {
            const el = document.createElement("mutation");
            el.setAttribute("size", String(Math.max(1, parseInt(this.getFieldValue("SIZE") || "1", 10))));
            return el;
        },
        domToMutation(this: Blockly.Block, xmlElement: Element) {
            const size = Math.max(1, parseInt(xmlElement.getAttribute("size") || "1", 10));
            (this as any).updateShape_(size);
        },
        updateShape_(this: Blockly.Block, targetSize?: number) {
            const size = targetSize ?? Math.max(1, parseInt(this.getFieldValue("SIZE") || "1", 10));
            const existing = this.inputList.filter(i => i.name.startsWith("VAL_")).length;
            if (size > existing) {
                for (let i = existing; i < size; i++) {
                    this.appendValueInput(`VAL_${i}`)
                        .setCheck(elemType)
                        .appendField(`[${i}]`);
                }
            } else {
                for (let i = existing - 1; i >= size; i--) {
                    this.removeInput(`VAL_${i}`);
                }
            }
        },
    };
}

/** array_literal_i32 / array_literal_f64 동적 블록 등록 */
export function registerDynamicArrayBlocks() {
    if (!Blockly.Blocks["array_literal_i32"]) {
        buildArrayLiteralBlock("array_literal_i32", "i32", 120);
    }
    if (!Blockly.Blocks["array_literal_f64"]) {
        buildArrayLiteralBlock("array_literal_f64", "f64", 120);
    }
}

/** 배열 리터럴 블록의 컴파일 함수 — 익명 포인터를 expr로 반환 */
export function compileArrayLiteralBlock(
    block: Blockly.Block,
    ctx: import("./$base").CompileCtx,
    elemType: "i32" | "f64",
): simulizer.Expr | null {
    const uid  = Math.random().toString(36).slice(2, 7);
    const size = Math.max(1, parseInt(block.getFieldValue("SIZE") || "1", 10));

    const arrayType = elemType === "i32" ? simulizer.i32Array : simulizer.f64Array;
    const simType   = elemType === "i32" ? simulizer.i32 : simulizer.f64;

    const baseOffset = ctx.nextArrayOffset ?? 0x1000;
    ctx.nextArrayOffset = baseOffset + arrayType.totalBytes(size);

    const arrDef = new simulizer.ArrayDef(`__lit_${uid}`, arrayType, size, baseOffset);
    const ptr    = arrDef.register(ctx.module);

    const ptrLocal = ctx.getOrCreateLocal(ctx, `__lit_ptr_${uid}`, simulizer.i32);

    const ops   = new simulizer.ArrayOps(arrayType);
    const exprs: simulizer.Expr[] = [new simulizer.LocalSet(ptrLocal, ptr)];

    for (let i = 0; i < size; i++) {
        const valBlock = block.getInputTargetBlock(`VAL_${i}`);
        if (!valBlock) continue;
        const valExpr = ctx.blockToExpr(valBlock, ctx);
        if (!valExpr) continue;
        exprs.push(
            ops.set(
                ctx.coerce(ptrLocal, simulizer.i32),
                simulizer.i32c(i),
                ctx.coerce(valExpr, simType),
            ),
        );
    }

    // 마지막에 ptrLocal을 push → Block이 포인터 값을 반환
    exprs.push(ptrLocal);
    return new simulizer.Block(`arr_lit_${uid}`, exprs, simulizer.i32);
}

export function xmlArrayBlocks(cat: string) {
    return `<category name="${cat}" colour="${120}">
    <block type="local_array_decl_i32"><value name="SIZE"><block type="i32_const"></block></value></block>
    <block type="local_array_decl_f64"><value name="SIZE"><block type="i32_const"></block></value></block>
    <block type="array_get_i32">
        <value name="ARRAY"><block type="local_array_get_i32"></block></value>
        <value name="INDEX"><block type="i32_const"></block></value>
    </block>
    <block type="array_get_f64">
        <value name="ARRAY"><block type="local_array_get_f64"></block></value>
        <value name="INDEX"><block type="i32_const"></block></value>
    </block>
    <block type="array_set_i32">
        <value name="ARRAY"><block type="local_array_get_i32"></block></value>
        <value name="INDEX"><block type="i32_const"></block></value>
        <value name="VALUE"><block type="i32_const"></block></value>
    </block>
    <block type="array_set_f64">
        <value name="ARRAY"><block type="local_array_get_f64"></block></value>
        <value name="INDEX"><block type="i32_const"></block></value>
        <value name="VALUE"><block type="f64_const"></block></value>
    </block>
    <block type="local_array_get_i32"></block>
    <block type="local_array_get_f64"></block>
    <block type="array_literal_i32"></block>
    <block type="array_literal_f64"></block>
    <block type="array_assign_i32">
        <value name="PTR"><block type="array_literal_i32"></block></value>
    </block>
    <block type="array_assign_f64">
        <value name="PTR"><block type="array_literal_f64"></block></value>
    </block>
</category>`;
}
