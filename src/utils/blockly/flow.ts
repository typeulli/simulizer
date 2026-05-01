import { simulizer } from "../wasm/engine";
import { BlockBuilder, type BlockSet } from "./$base";

export const FLOW_BLOCKS: BlockSet = {
    FLOW_IF: new BlockBuilder("flow_if", undefined, 120, "조건 분기")
        .addBody("if %1")
        .addArgValue("COND", "bool")
        .addBody("then %1")
        .addArgStmt("THEN")
        .addBody("else %1")
        .addArgStmt("ELSE")
        .stmt((block, ctx) => {
            const cond = ctx.blockToExpr(block.getInputTargetBlock("COND"), ctx);
            if (!cond) return null;
            const thenExprs = ctx.stmtChainToExprs(block.getInputTargetBlock("THEN"), ctx);
            const elseExprs = ctx.stmtChainToExprs(block.getInputTargetBlock("ELSE"), ctx);
            return new simulizer.If(ctx.coerce(cond, simulizer.i32), thenExprs, elseExprs);
        }),
    FLOW_WHILE: new BlockBuilder("flow_while", undefined, 120, "while 반복문")
        .addBody("while %1")
        .addArgValue("COND", "bool")
        .addBody("do %1")
        .addArgStmt("BODY")
        .stmt((block, ctx) => {
        // ── while ─────────────────────────────────────────────────────────────
        // WAT에는 while이 없으므로 Block + Loop + BrIf 조합으로 구현:
        //
        //     (block $brk
        //         (loop $cnt
        //             <cond>
        //             i32.eqz
        //             br_if $brk         ← 조건 거짓이면 block 끝으로 탈출
        //             <body>
        //             br $cnt                ← loop 처음으로 돌아감
        //         )
        //     )
        //
        const cond = ctx.blockToExpr(block.getInputTargetBlock("COND"), ctx);
        if (!cond) return null;
        const uid                     = Math.random().toString(36).slice(2, 7);
        const breakLabel        = `brk_${uid}`;
        const continueLabel = `cnt_${uid}`;

        ctx.breakStack.push(breakLabel);
        const bodyExprsWithBreak = ctx.stmtChainToExprs(block.getInputTargetBlock("BODY"), ctx);
        ctx.breakStack.pop();
        const condCheck = new simulizer.BrIf(breakLabel, simulizer.i32ops.eqz(ctx.coerce(cond, simulizer.i32)));
        const loopBack    = new simulizer.Br(continueLabel);
        const loop            = new simulizer.Loop(continueLabel, [condCheck, ...bodyExprsWithBreak, loopBack]);
        return new simulizer.Block(breakLabel, [loop]);
    }),
    FLOW_FOR: new BlockBuilder("flow_for", undefined, 120, "for 반복문")
        .addBody("var %1 = %2 to %3")
        .addArg("field_input", "VAR", "i")
        .addArgValue("START", "i32")
        .addArgValue("END", "i32")
        .addBody("do %1")
        .addArgStmt("BODY")
        .stmt((block, ctx) => {
            const varName = block.getFieldValue("VAR") as string;
            const start     = ctx.blockToExpr(block.getInputTargetBlock("START"), ctx);
            const end         = ctx.blockToExpr(block.getInputTargetBlock("END"), ctx);
            if (!start || !end) return null;
            const local = ctx.getOrCreateLocal(ctx, varName, simulizer.i32);
            const init = new simulizer.LocalSet(local, ctx.coerce(start, simulizer.i32));
            
            const cond = simulizer.i32ops.le_s(local, ctx.coerce(end, simulizer.i32));
            const incr = new simulizer.LocalSet(local, simulizer.i32ops.add(local, simulizer.i32c(1)));

            const uid                     = Math.random().toString(36).slice(2, 7);
            const breakLabel        = `brk_${uid}`;
            const continueLabel = `cnt_${uid}`;
            ctx.breakStack.push(breakLabel);
            const bodyExprs = ctx.stmtChainToExprs(block.getInputTargetBlock("BODY"), ctx);
            ctx.breakStack.pop();
            const condCheck = new simulizer.BrIf(breakLabel, simulizer.i32ops.eqz(ctx.coerce(cond, simulizer.i32)));
            const loopBack    = new simulizer.Br(continueLabel);
            const loop            = new simulizer.Loop(continueLabel, [condCheck, ...bodyExprs, incr, loopBack]);
            return new simulizer.Block(breakLabel, [init, loop]);
        }),
                    
    FLOW_BREAK: new BlockBuilder("flow_break", undefined, 120, "반복문 탈출 (break)")
        .addBody("break")
        .stmt((_, ctx) => {
            const label = ctx.breakStack[ctx.breakStack.length - 1];
            if (!label) return null;
            return new simulizer.Br(label);
        }),
    FLOW_SELECT_I32: new BlockBuilder("select_i32", "i32", 120, "i32 select (삼항 연산자)")
        .addBody("%1 ? %2 : %3")
        .addArgValue("COND", "bool")
        .addArgValue("TRUE", "i32")
        .addArgValue("FALSE", "i32"),
    FLOW_SELECT_F64: new BlockBuilder("select_f64", "f64", 120, "f64 select (삼항 연산자)")
        .addBody("%1 ? %2 : %3")
        .addArgValue("COND", "bool")
        .addArgValue("TRUE", "f64")
        .addArgValue("FALSE", "f64"),
}

export function xmlFlowBlocks(cat: string) {
    return `<category name="${cat}" colour="${120}">
    <block type="flow_if"></block>
    <block type="flow_while"></block>
    <block type="flow_for"></block>
    <block type="select_i32"></block>
    <block type="select_f64"></block>
</category>`;
}