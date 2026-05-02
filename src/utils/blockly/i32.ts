import { simulizer } from "../wasm/engine";
import { BlockBuilder, type BlockSet } from "./$base";


export const I32_BLOCKS: BlockSet = {
    I32_CONST: new BlockBuilder("i32_const", "i32", 230, "정수 상수 (32-bit signed)")
        .addBody("int %1")
        .addArg("field_number", "VALUE", undefined, 0)
        .expr((block, ctx) => simulizer.i32c(Number(block.getFieldValue("VALUE") ?? 0) | 0)),
    I32_BINOP: new BlockBuilder("i32_binop", "i32", 230, "정수 이항 연산")
        .addBody("int %1 %2 %3")
        .addArgValue("LHS", "i32")
        .addArgDropdown("OP", [
            ["+", "add"], ["-", "sub"], ["×", "mul"],
            ["÷", "div_s"],
            ["%", "rem_s"],
            ["&", "and"], ["|", "or"], ["^", "xor"],
            ["<<", "shl"], [">>", "shr_s"],
        ])
        .addArgValue("RHS", "i32")
        .expr((block, ctx) => {
            const lhs = ctx.blockToExpr(block.getInputTargetBlock("LHS"), ctx);
            const rhs = ctx.blockToExpr(block.getInputTargetBlock("RHS"), ctx);
            if (!lhs || !rhs) return null;
            const op = block.getFieldValue("OP") as keyof typeof simulizer.i32ops;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (simulizer.i32ops[op] as any)(lhs, rhs);
        }),
    I32_UNOP: new BlockBuilder("i32_unop", "i32", 230, "정수 단항 연산")
        .addBody("int %1 %2")
        .addArgDropdown("OP", [
            ["clz", "clz"], ["ctz", "ctz"], ["popcnt", "popcnt"], ["eqz", "eqz"], ["−", "neg"],
        ])
        .addArgValue("VALUE", "i32")
        .stmt((block, ctx) => {
            const v = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            if (!v) return null;
            const op = block.getFieldValue("OP") as keyof typeof simulizer.i32ops;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (simulizer.i32ops[op] as any)(v);
        }),
    I32_CMP: new BlockBuilder("i32_cmp", "bool", 60, "정수 비교 (결과: bool)")
        .addBody("%1 %2 %3")
        .addArgValue("LHS", "i32")
        .addArgDropdown("OP", [
            ["==", "eq"], ["!=", "ne"],
            ["<", "lt_s"],
            [">", "gt_s"],
            ["<=", "le_s"],
            ["≥", "ge_s"],
        ])
        .addArgValue("RHS", "i32")
        .expr((block, ctx) => {
            const lhs = ctx.blockToExpr(block.getInputTargetBlock("LHS"), ctx);
            const rhs = ctx.blockToExpr(block.getInputTargetBlock("RHS"), ctx);
            if (!lhs || !rhs) return null;
            const op = block.getFieldValue("OP") as keyof typeof simulizer.i32ops;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (simulizer.i32ops[op] as any)(lhs, rhs);
        })
}

export function xmlI32Blocks(cat: string) {
    return `<category name="${cat}" colour="${230}">
    <sep gap="16"></sep>
    <label text="Integer"></label>
    <block type="i32_const"></block>
    <block type="i32_binop"></block>
    <block type="i32_unop"></block>
    <block type="i32_cmp"></block>
    <block type="i32_not"></block>
</category>`;
}