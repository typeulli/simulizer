import { simulizer } from "../engine";
import { BlockBuilder, type BlockSet } from "./$base";
import { Vec2Load, Vec3Load } from "./vector";

const BD2_FIELDS = ["t", "x", "y", "tx", "ty", "nx", "ny"] as const;
const BD3_FIELDS = ["u", "v", "x", "y", "z", "dS", "nx", "ny", "nz"] as const;

export const BOUNDARY_BLOCKS: BlockSet = {

    // ── bd2 변수 ───────────────────────────────────────────────────────────────

    BD2_DECL: new BlockBuilder("local_decl_bd2", undefined, 200, "boundary2d 반복 변수 선언 (t, x, y, tx, ty, nx, ny)")
        .addBody("bd2 변수 %1 선언")
        .addArg("field_input", "NAME", "p")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            for (const f of BD2_FIELDS) {
                ctx.getOrCreateLocal(ctx, `__bd2_${name}_${f}`, simulizer.f64);
            }
            return null;
        }),

    BD2_GET: new BlockBuilder("local_get_bd2", "f64", 200, "boundary2d 필드 읽기")
        .addBody("bd2 %1 . %2")
        .addArg("field_input", "NAME", "p")
        .addArgDropdown("FIELD", BD2_FIELDS.map(f => [f, f] as [string, string]))
        .expr((block, ctx) => {
            const name  = block.getFieldValue("NAME")  as string;
            const field = block.getFieldValue("FIELD") as typeof BD2_FIELDS[number];
            return ctx.getOrCreateLocal(ctx, `__bd2_${name}_${field}`, simulizer.f64);
        }),

    BD2_POINT: new BlockBuilder("local_get_bd2_point", "vec2", 200, "boundary2d 위치 벡터 (x, y) → vec2")
        .addBody("bd2 %1 .point")
        .addArg("field_input", "NAME", "p")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const lx = ctx.getOrCreateLocal(ctx, `__bd2_${name}_x`, simulizer.f64);
            const ly = ctx.getOrCreateLocal(ctx, `__bd2_${name}_y`, simulizer.f64);
            return new Vec2Load(lx, ly);
        }),

    BD2_TANGENT: new BlockBuilder("local_get_bd2_tangent", "vec2", 200, "boundary2d 접선 벡터 (tx, ty) → vec2")
        .addBody("bd2 %1 .tangent")
        .addArg("field_input", "NAME", "p")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const lx = ctx.getOrCreateLocal(ctx, `__bd2_${name}_tx`, simulizer.f64);
            const ly = ctx.getOrCreateLocal(ctx, `__bd2_${name}_ty`, simulizer.f64);
            return new Vec2Load(lx, ly);
        }),

    BD2_NORMAL: new BlockBuilder("local_get_bd2_normal", "vec2", 200, "boundary2d 법선 벡터 (nx, ny) → vec2")
        .addBody("bd2 %1 .normal")
        .addArg("field_input", "NAME", "p")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const lx = ctx.getOrCreateLocal(ctx, `__bd2_${name}_nx`, simulizer.f64);
            const ly = ctx.getOrCreateLocal(ctx, `__bd2_${name}_ny`, simulizer.f64);
            return new Vec2Load(lx, ly);
        }),

    // ── bd3 변수 ───────────────────────────────────────────────────────────────

    BD3_DECL: new BlockBuilder("local_decl_bd3", undefined, 160, "boundary3d 반복 변수 선언 (u, v, x, y, z, dS, nx, ny, nz)")
        .addBody("bd3 변수 %1 선언")
        .addArg("field_input", "NAME", "p")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            for (const f of BD3_FIELDS) {
                ctx.getOrCreateLocal(ctx, `__bd3_${name}_${f}`, simulizer.f64);
            }
            return null;
        }),

    BD3_POINT: new BlockBuilder("local_get_bd3_point", "vec3", 160, "boundary3d 위치 벡터 (x, y, z) → vec3")
        .addBody("bd3 %1 .point")
        .addArg("field_input", "NAME", "p")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            return new Vec3Load(
                ctx.getOrCreateLocal(ctx, `__bd3_${name}_x`, simulizer.f64),
                ctx.getOrCreateLocal(ctx, `__bd3_${name}_y`, simulizer.f64),
                ctx.getOrCreateLocal(ctx, `__bd3_${name}_z`, simulizer.f64),
            );
        }),

    BD3_NORMAL: new BlockBuilder("local_get_bd3_normal", "vec3", 160, "boundary3d 법선 벡터 (nx, ny, nz) → vec3")
        .addBody("bd3 %1 .normal")
        .addArg("field_input", "NAME", "p")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            return new Vec3Load(
                ctx.getOrCreateLocal(ctx, `__bd3_${name}_nx`, simulizer.f64),
                ctx.getOrCreateLocal(ctx, `__bd3_${name}_ny`, simulizer.f64),
                ctx.getOrCreateLocal(ctx, `__bd3_${name}_nz`, simulizer.f64),
            );
        }),

    BD3_GET: new BlockBuilder("local_get_bd3", "f64", 160, "boundary3d 필드 읽기")
        .addBody("bd3 %1 . %2")
        .addArg("field_input", "NAME", "p")
        .addArgDropdown("FIELD", BD3_FIELDS.map(f => [f, f] as [string, string]))
        .expr((block, ctx) => {
            const name  = block.getFieldValue("NAME")  as string;
            const field = block.getFieldValue("FIELD") as typeof BD3_FIELDS[number];
            return ctx.getOrCreateLocal(ctx, `__bd3_${name}_${field}`, simulizer.f64);
        }),

    // ── 순회 ──────────────────────────────────────────────────────────────────

    FOR_BD2: new BlockBuilder("flow_for_bd2", undefined, 200, "boundary2d 배열 원소 순회")
        .addBody("bd2 %1 에서 %2 반복")
        .addArg("field_input", "VAR", "p")
        .addArg("field_input", "BD",  "boundary")
        .addBody("반복 %1")
        .addArgStmt("BODY")
        .stmt((block, ctx) => {
            const bdName  = block.getFieldValue("BD")  as string;
            const varName = block.getFieldValue("VAR") as string;

            const bdInfo = ctx.bd2Arrays?.get(bdName);
            if (!bdInfo) {
                console.warn(`[flow_for_bd2] boundary2d '${bdName}' 를 찾을 수 없습니다.`);
                return null;
            }

            const { offset: baseOffset, count } = bdInfo;
            const fields = ["t", "x", "y", "tx", "ty", "nx", "ny"] as const;

            const uid           = Math.random().toString(36).slice(2, 7);
            const breakLabel    = `brk_${uid}`;
            const continueLabel = `cnt_${uid}`;

            const counterLocal = ctx.getOrCreateLocal(ctx, `__bd2_i_${uid}`,   simulizer.i32);
            const ptrLocal     = ctx.getOrCreateLocal(ctx, `__bd2_ptr_${uid}`, simulizer.i32);

            const initCounter = new simulizer.LocalSet(counterLocal, simulizer.i32c(0));

            const condCheck = new simulizer.BrIf(
                breakLabel,
                simulizer.i32ops.ge_s(counterLocal, simulizer.i32c(count)),
            );

            const computePtr = new simulizer.LocalSet(
                ptrLocal,
                simulizer.i32ops.add(
                    simulizer.i32c(baseOffset),
                    simulizer.i32ops.mul(counterLocal, simulizer.i32c(56)),
                ),
            );

            const loadExprs = fields.map((field, i) => {
                const fieldLocal = ctx.getOrCreateLocal(ctx, `__bd2_${varName}_${field}`, simulizer.f64);
                const load = new simulizer.Load(simulizer.f64, ptrLocal, { memArg: { offset: i * 8 } });
                return new simulizer.LocalSet(fieldLocal, load);
            });

            const incrCounter = new simulizer.LocalSet(
                counterLocal,
                simulizer.i32ops.add(counterLocal, simulizer.i32c(1)),
            );

            ctx.breakStack.push(breakLabel);
            const bodyExprs = ctx.stmtChainToExprs(block.getInputTargetBlock("BODY"), ctx);
            ctx.breakStack.pop();

            const loop = new simulizer.Loop(continueLabel, [
                condCheck,
                computePtr,
                ...loadExprs,
                ...bodyExprs,
                incrCounter,
                new simulizer.Br(continueLabel),
            ]);
            return new simulizer.Block(breakLabel, [initCounter, loop]);
        }),

    FOR_BD3: new BlockBuilder("flow_for_bd3", undefined, 160, "boundary3d 배열 원소 순회")
        .addBody("bd3 %1 에서 %2 반복")
        .addArg("field_input", "VAR", "p")
        .addArg("field_input", "BD",  "boundary")
        .addBody("반복 %1")
        .addArgStmt("BODY")
        .stmt((block, ctx) => {
            const bdName  = block.getFieldValue("BD")  as string;
            const varName = block.getFieldValue("VAR") as string;

            const bdInfo = ctx.bd3Arrays?.get(bdName);
            if (!bdInfo) {
                console.warn(`[flow_for_bd3] boundary3d '${bdName}' 를 찾을 수 없습니다.`);
                return null;
            }

            const { offset: baseOffset, count } = bdInfo;
            const fields = ["u", "v", "x", "y", "z", "dS", "nx", "ny", "nz"] as const;

            const uid           = Math.random().toString(36).slice(2, 7);
            const breakLabel    = `brk_${uid}`;
            const continueLabel = `cnt_${uid}`;

            const counterLocal = ctx.getOrCreateLocal(ctx, `__bd3_i_${uid}`,   simulizer.i32);
            const ptrLocal     = ctx.getOrCreateLocal(ctx, `__bd3_ptr_${uid}`, simulizer.i32);

            const initCounter = new simulizer.LocalSet(counterLocal, simulizer.i32c(0));

            const condCheck = new simulizer.BrIf(
                breakLabel,
                simulizer.i32ops.ge_s(counterLocal, simulizer.i32c(count)),
            );

            const computePtr = new simulizer.LocalSet(
                ptrLocal,
                simulizer.i32ops.add(
                    simulizer.i32c(baseOffset),
                    simulizer.i32ops.mul(counterLocal, simulizer.i32c(72)),
                ),
            );

            const loadExprs = fields.map((field, i) => {
                const fieldLocal = ctx.getOrCreateLocal(ctx, `__bd3_${varName}_${field}`, simulizer.f64);
                const load = new simulizer.Load(simulizer.f64, ptrLocal, { memArg: { offset: i * 8 } });
                return new simulizer.LocalSet(fieldLocal, load);
            });

            const incrCounter = new simulizer.LocalSet(
                counterLocal,
                simulizer.i32ops.add(counterLocal, simulizer.i32c(1)),
            );

            ctx.breakStack.push(breakLabel);
            const bodyExprs = ctx.stmtChainToExprs(block.getInputTargetBlock("BODY"), ctx);
            ctx.breakStack.pop();

            const loop = new simulizer.Loop(continueLabel, [
                condCheck,
                computePtr,
                ...loadExprs,
                ...bodyExprs,
                incrCounter,
                new simulizer.Br(continueLabel),
            ]);
            return new simulizer.Block(breakLabel, [initCounter, loop]);
        }),
}

export const XML_BOUNDARY_BLOCKS = `
<category name="🗺 경계 데이터" colour="200">
    <button text="⊕ 경계 데이터 관리" callbackKey="OPEN_BD2_MGR"></button>
    <category name="2D" colour="200">
        <block type="local_decl_bd2"></block>
        <block type="local_get_bd2"></block>
        <block type="local_get_bd2_point"></block>
        <block type="local_get_bd2_tangent"></block>
        <block type="local_get_bd2_normal"></block>
        <block type="flow_for_bd2"></block>
    </category>
    <category name="3D" colour="160">
        <block type="local_decl_bd3"></block>
        <block type="local_get_bd3"></block>
        <block type="local_get_bd3_point"></block>
        <block type="local_get_bd3_normal"></block>
        <block type="flow_for_bd3"></block>
    </category>
</category>`
