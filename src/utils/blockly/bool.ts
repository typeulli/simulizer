import { simulizer } from "../wasm/engine";
import { BlockBuilder, type BlockSet } from "./$base";

export const BOOL_BLOCKS: BlockSet = {
    BOOL_CONST: new BlockBuilder("bool_const", "bool", 60, "불리언 상수 (true=1, false=0)")
        .addBody("%1")
        .addArgDropdown("VALUE", [["true", "1"], ["false", "0"]])
        .expr((block) => simulizer.i32c(Number(block.getFieldValue("VALUE")))),

    BOOL_BINOP: new BlockBuilder("bool_binop", "bool", 60, "논리 이항 연산 (AND / OR / XOR)")
        .addBody("%1 %2 %3")
        .addArgValue("LHS", "bool")
        .addArgDropdown("OP", [["&&", "and"], ["||", "or"], ["XOR", "xor"]])
        .addArgValue("RHS", "bool")
        .expr((block, ctx) => {
            const lhs = ctx.blockToExpr(block.getInputTargetBlock("LHS"), ctx);
            const rhs = ctx.blockToExpr(block.getInputTargetBlock("RHS"), ctx);
            if (!lhs || !rhs) return null;
            const l = simulizer.i32ops.ne(ctx.coerce(lhs, simulizer.i32), simulizer.i32c(0));
            const r = simulizer.i32ops.ne(ctx.coerce(rhs, simulizer.i32), simulizer.i32c(0));
            const op = block.getFieldValue("OP");
            if (op === "and") return simulizer.i32ops.and(l, r);
            if (op === "or")  return simulizer.i32ops.or(l, r);
            return simulizer.i32ops.xor(l, r);
        }),

    BOOL_NOT: new BlockBuilder("bool_not", "bool", 60, "논리 NOT")
        .addBody("! %1")
        .addArgValue("VALUE", "bool")
        .expr((block, ctx) => {
            const v = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            if (!v) return null;
            return simulizer.i32ops.eqz(ctx.coerce(v, simulizer.i32));
        }),
}

export function xmlBoolBlocks(cat: string) {
    return `<category name="${cat}" colour="${60}">
    <sep gap="16"></sep>
    <label text="Boolean"></label>
    <block type="bool_const"></block>
    <block type="bool_binop"></block>
    <block type="bool_not"></block>
</category>`;
}
