import { simulizer } from "../engine";
import { BlockBuilder, type BlockSet } from "./$base";

export const XML_F64_BLOCKS = `
<category name="🔣 f64 연산" colour="160">
    <block type="f64_const"></block>
    <block type="f64_binop"></block>
    <block type="f64_unop"></block>
    <block type="f64_cmp"></block>
</category>
`;

export const F64_BLOCKS: BlockSet = {
    CONST: new BlockBuilder("f64_const", "f64", 160, "64-bit floating point constant")
        .addBody("f64 %1")
        .addArg("field_number", "VALUE", undefined, 0.0)
        .expr((block, ctx) => simulizer.f64c(parseFloat(block.getFieldValue("VALUE") ?? "0"))),
    FROM_I32: new BlockBuilder("f64_from_i32", "f64", 45, "i32 → f64 (signed)")
        .addBody("i32→f64 %1")
        .addArgValue("VALUE", "i32")
        .expr((block, ctx) => {
            const v = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            return v ? simulizer.f64ops.convert_i32_s(ctx.coerce(v, simulizer.i32)) : null;
        }),
    TO_I32: new BlockBuilder("i32_from_f64", "i32", 45, "f64 → i32 (truncate)")
        .addBody("f64→i32 %1")
        .addArgValue("VALUE", "f64")
        .expr((block, ctx) => {
            const v = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            return v ? simulizer.i32ops.trunc_f64_s(ctx.coerce(v, simulizer.f64)) : null;
        }),
    BINOP: new BlockBuilder("f64_binop", "f64", 160, "f64 binary operation")
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
    UNOP: new BlockBuilder("f64_unop", "f64", 160, "f64 unary operation")
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
    CMP: new BlockBuilder("f64_cmp", "bool", 60, "f64 comparison (result: i32 0/1)")
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