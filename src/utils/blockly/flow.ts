import * as Blockly from "blockly/core";
import { simulizer } from "../wasm/engine";
import { BlockBuilder, type BlockSet } from "./$base";

export const FLOW_BLOCKS: BlockSet = {
    FLOW_IF: new BlockBuilder("flow_if", undefined, 120, "조건 분기")
        .addBody("if %1")
        .addArgValue("COND", "bool")
        .addBody("then %1")
        .addArgStmt("THEN")
        .stmt((block, ctx) => {
            const cond = ctx.blockToExpr(block.getInputTargetBlock("COND"), ctx);
            if (!cond) return null;
            const thenExprs = ctx.stmtChainToExprs(block.getInputTargetBlock("THEN"), ctx);
            return new simulizer.If(ctx.coerce(cond, simulizer.i32), thenExprs);
        }),
    FLOW_IF_ELSE: new BlockBuilder("flow_if_else", undefined, 120, "조건 분기 (else)")
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
            
            const cond = simulizer.i32ops.lt_s(local, ctx.coerce(end, simulizer.i32));
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
                    
    FLOW_FOLD_REGION: new BlockBuilder("flow_fold_region", undefined, 120, "코드 영역 (접기 가능)")
        .addBody("region %1")
        .addArg("field_input", "NAME", undefined, "region")
        .addBody("%1")
        .addArgStmt("BODY")
        .stmt((block, ctx) => {
            const rawName = (block.getFieldValue("NAME") as string) || "region";
            const safeName = rawName.replace(/[^a-zA-Z0-9_]/g, "_") || "region";
            const bodyExprs = ctx.stmtChainToExprs(block.getInputTargetBlock("BODY"), ctx);
            return new simulizer.Block(`region_${safeName}`, bodyExprs);
        }),
    FLOW_BREAK: new BlockBuilder("flow_break", undefined, 120, "반복문 탈출 (break)")
        .addBody("break")
        .stmt((_, ctx) => {
            const label = ctx.breakStack[ctx.breakStack.length - 1];
            if (!label) return null;
            return new simulizer.Br(label);
        }),
    FLOW_SELECT_I32: new BlockBuilder("i32_select", "i32", 120, "i32 select (삼항 연산자)")
        .addBody("%1 ? %2 : %3")
        .addArgValue("COND", "bool")
        .addArgValue("THEN", "i32")
        .addArgValue("ELSE", "i32")
        .expr((block, ctx) => {
            const cond = ctx.blockToExpr(block.getInputTargetBlock("COND"), ctx);
            const thenVal = ctx.blockToExpr(block.getInputTargetBlock("THEN"), ctx);
            const elseVal = ctx.blockToExpr(block.getInputTargetBlock("ELSE"), ctx);
            if (!cond || !thenVal || !elseVal) return null;
            return new simulizer.Select(
                ctx.coerce(cond, simulizer.i32),
                ctx.coerce(thenVal, simulizer.i32),
                ctx.coerce(elseVal, simulizer.i32)
            );
        }),
    FLOW_SELECT_F64: new BlockBuilder("f64_select", "f64", 120, "f64 select (삼항 연산자)")
        .addBody("%1 ? %2 : %3")
        .addArgValue("COND", "bool")
        .addArgValue("THEN", "f64")
        .addArgValue("ELSE", "f64")
        .expr((block, ctx) => {
            const cond = ctx.blockToExpr(block.getInputTargetBlock("COND"), ctx);
            const thenVal = ctx.blockToExpr(block.getInputTargetBlock("THEN"), ctx);
            const elseVal = ctx.blockToExpr(block.getInputTargetBlock("ELSE"), ctx);
            if (!cond || !thenVal || !elseVal) return null;
            return new simulizer.Select(
                ctx.coerce(cond, simulizer.i32),
                ctx.coerce(thenVal, simulizer.f64),
                ctx.coerce(elseVal, simulizer.f64)
            );
        }),
}

export function xmlFlowBlocks(cat: string) {
    return `<category name="${cat}" colour="${120}">
    <sep gap="16"></sep>
    <label text="Control Flow"></label>
    <block type="flow_if"></block>
    <block type="flow_if_else"></block>
    <block type="flow_while"></block>
    <block type="flow_for"></block>
    <block type="flow_fold_region"></block>
    <block type="i32_select"></block>
    <block type="f64_select"></block>
</category>`;
}

/**
 * flow_fold_region — 헤더(NAME)는 항상 보이고, 내부 BODY input은 ▼/▶ 토글로 접고 펼 수 있음.
 * BlockBuilder 의 기본 JSON 정의가 등록되기 전에 호출하여 커스텀 init 으로 덮어쓴다.
 */
export function registerFoldRegionBlock() {
    const encode = (svg: string) =>
        "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    const downArrow = encode(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M3 6l5 5 5-5' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>`,
    );
    const rightArrow = encode(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M6 3l5 5-5 5' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>`,
    );

    Blockly.Blocks["flow_fold_region"] = {
        init(this: Blockly.Block) {
            (this as unknown as { _folded: boolean })._folded = false;

            const onToggle = () => {
                const self = this as unknown as { _folded: boolean; _applyFold: () => void };
                self._folded = !self._folded;
                self._applyFold();
            };

            const toggleField = new Blockly.FieldImage(
                downArrow, 14, 14, "fold", onToggle,
            );

            this.appendDummyInput("HEADER")
                .appendField(toggleField, "TOGGLE")
                .appendField("region")
                .appendField(new Blockly.FieldTextInput("region"), "NAME");
            this.appendStatementInput("BODY");

            this.setPreviousStatement(true);
            this.setNextStatement(true);
            this.setColour(120);
            this.setTooltip("code region — fold/unfold the body");
            this.setInputsInline(false);
        },
        saveExtraState(this: Blockly.Block) {
            return { folded: (this as unknown as { _folded?: boolean })._folded ?? false };
        },
        loadExtraState(this: Blockly.Block, state: { folded?: boolean }) {
            const self = this as unknown as { _folded: boolean; _applyFold: () => void };
            self._folded = !!state.folded;
            self._applyFold();
        },
        _applyFold(this: Blockly.Block) {
            const folded = !!(this as unknown as { _folded?: boolean })._folded;
            const body = this.getInput("BODY");
            if (body) body.setVisible(!folded);
            const toggle = this.getField("TOGGLE") as Blockly.FieldImage | null;
            if (toggle) toggle.setValue(folded ? rightArrow : downArrow);
            if ((this as unknown as { rendered?: boolean }).rendered) {
                (this as Blockly.BlockSvg).render();
            }
        },
    };
}