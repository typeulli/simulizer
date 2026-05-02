import { simulizer } from "../wasm/engine";
import { BlockBuilder, type BlockSet } from "./$base";

export const F64_BLOCKS: BlockSet = {
    CONST: new BlockBuilder("f64_const", "f64", 160, "실수 상수 (64-bit float)")
        .addBody("float %1")
        .addArg("field_number", "VALUE", undefined, 0.0)
        .expr((block, ctx) => simulizer.f64c(parseFloat(block.getFieldValue("VALUE") ?? "0"))),
    FROM_I32: new BlockBuilder("f64_from_i32", "f64", 45, "int → float 변환")
        .addBody("int → float %1")
        .addArgValue("VALUE", "i32")
        .expr((block, ctx) => {
            const v = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            return v ? simulizer.f64ops.convert_i32_s(ctx.coerce(v, simulizer.i32)) : null;
        }),
    TO_I32: new BlockBuilder("i32_from_f64", "i32", 45, "float → int 변환 (truncate)")
        .addBody("float → int %1")
        .addArgValue("VALUE", "f64")
        .expr((block, ctx) => {
            const v = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            return v ? simulizer.i32ops.trunc_f64_s(ctx.coerce(v, simulizer.f64)) : null;
        }),
    BINOP: new BlockBuilder("f64_binop", "f64", 160, "실수 이항 연산")
        .addBody("%1 %2 %3")
        .addArgValue("LHS", "f64")
        .addArgDropdown("OP", [
            ["+", "add"], ["-", "sub"], ["×", "mul"], ["÷", "div"],
            ["min", "min"], ["max", "max"],
        ])
        .addArgValue("RHS", "f64")
        .expr((block, ctx) => {
            const lhs = ctx.blockToExpr(block.getInputTargetBlock("LHS"), ctx);
            const rhs = ctx.blockToExpr(block.getInputTargetBlock("RHS"), ctx);
            if (!lhs || !rhs) return null;
            const op = block.getFieldValue("OP") as keyof typeof simulizer.f64ops;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (simulizer.f64ops[op] as any)(lhs, rhs);
        }),
    UNOP: new BlockBuilder("f64_unop", "f64", 160, "실수 단항 연산")
        .addBody("%1 %2")
        .addArgDropdown("OP", [
            ["abs", "abs"], ["−", "neg"], ["√", "sqrt"],
            ["ceil", "ceil"], ["floor", "floor"],
            ["trunc", "trunc"], ["nearest", "nearest"],
        ])
        .addArgValue("VALUE", "f64")
        .expr((block, ctx) => {
            const v = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            if (!v) return null;
            const op = block.getFieldValue("OP") as keyof typeof simulizer.f64ops;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (simulizer.f64ops[op] as any)(v);
        }),
    CMP: new BlockBuilder("f64_cmp", "bool", 60, "실수 비교 (결과: bool)")
        .addBody("%1 %2 %3")
        .addArgValue("LHS", "f64")
        .addArgDropdown("OP", [
            ["==", "eq"], ["!=", "ne"],
            ["<", "lt"], [">", "gt"], ["<=", "le"], ["≥", "ge"],
        ])
        .addArgValue("RHS", "f64")
        .expr((block, ctx) => {
            const lhs = ctx.blockToExpr(block.getInputTargetBlock("LHS"), ctx);
            const rhs = ctx.blockToExpr(block.getInputTargetBlock("RHS"), ctx);
            if (!lhs || !rhs) return null;
            const op = block.getFieldValue("OP") as keyof typeof simulizer.f64ops;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (simulizer.f64ops[op] as any)(lhs, rhs);
        })
}

export function xmlF64Blocks(cat: string) {
    return `<category name="${cat}" colour="${160}">
    <sep gap="16"></sep>
    <label text="Float"></label>
    <block type="f64_const"></block>
    <block type="f64_binop"></block>
    <block type="f64_unop"></block>
    <block type="f64_cmp"></block>
</category>`;
}