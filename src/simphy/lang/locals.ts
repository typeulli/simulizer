import { simulizer } from "../engine";
import { BlockBuilder, type BlockSet } from "./$base";

const BD2_FIELDS = ["t", "x", "y", "tx", "ty", "nx", "ny"] as const;
const BD3_FIELDS = ["u", "v", "x", "y", "z", "dS", "nx", "ny", "nz"] as const;

export const LOCAL_BLOCKS: BlockSet = {
    LOCAL_DECL_I32: new BlockBuilder("local_decl_i32", undefined, 330, "i32 지역 변수 선언 및 초기화")
        .addBody("i32 변수 %1 = %2")
        .addArg("field_input", "NAME", "x")
        .addArgValue("INIT", "i32")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const init = ctx.blockToExpr(block.getInputTargetBlock("INIT"), ctx);
            if (!init) return null;
            const local = ctx.getOrCreateLocal(ctx, name, simulizer.i32);
            return new simulizer.LocalSet(local, ctx.coerce(init, simulizer.i32));
        }),
    LOCAL_DECL_F64: new BlockBuilder("local_decl_f64", undefined, 330, "f64 지역 변수 선언 및 초기화")
        .addBody("f64 변수 %1 = %2")
        .addArg("field_input", "NAME", "x")
        .addArgValue("INIT", "f64")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const init = ctx.blockToExpr(block.getInputTargetBlock("INIT"), ctx);
            if (!init) return null;
            const local = ctx.getOrCreateLocal(ctx, name, simulizer.f64);
            return new simulizer.LocalSet(local, ctx.coerce(init, simulizer.f64));
        }),
    LOCAL_GET_I32: new BlockBuilder("local_get_i32", "i32", 330, "i32 지역 변수 읽기")
        .addBody("i32 %1")
        .addArg("field_input", "NAME", "x")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            return ctx.getOrCreateLocal(ctx, name, simulizer.i32);
        }),
    LOCAL_GET_F64: new BlockBuilder("local_get_f64", "f64", 330, "f64 지역 변수 읽기")
        .addBody("f64 %1")
        .addArg("field_input", "NAME", "x")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            return ctx.getOrCreateLocal(ctx, name, simulizer.f64);
        }),
    LOCAL_SET_I32: new BlockBuilder("local_set_i32", undefined, 330, "i32 지역 변수 대입")
        .addBody("i32 %1 ← %2")
        .addArg("field_input", "NAME", "x")
        .addArgValue("VALUE", "i32")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const val = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            if (!val) return null;
            const local = ctx.getOrCreateLocal(ctx, name, simulizer.i32);
            return new simulizer.LocalSet(local, ctx.coerce(val, simulizer.i32));
        }),
    LOCAL_SET_F64: new BlockBuilder("local_set_f64", undefined, 330, "f64 지역 변수 대입")
        .addBody("f64 %1 ← %2")
        .addArg("field_input", "NAME", "x")
        .addArgValue("VALUE", "f64")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const val = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            if (!val) return null;
            const local = ctx.getOrCreateLocal(ctx, name, simulizer.f64);
            return new simulizer.LocalSet(local, ctx.coerce(val, simulizer.f64));
        }),
    LOCAL_DECL_BD2: new BlockBuilder("local_decl_bd2", undefined, 200, "boundary2d 반복 변수 선언 (t, x, y, tx, ty, nx, ny)")
        .addBody("bd2 변수 %1 선언")
        .addArg("field_input", "NAME", "p")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            for (const f of BD2_FIELDS) {
                ctx.getOrCreateLocal(ctx, `__bd2_${name}_${f}`, simulizer.f64);
            }
            return null;
        }),
    LOCAL_GET_BD2: new BlockBuilder("local_get_bd2", "f64", 200, "boundary2d 필드 읽기")
        .addBody("bd2 %1 . %2")
        .addArg("field_input", "NAME", "p")
        .addArgDropdown("FIELD", BD2_FIELDS.map(f => [f, f] as [string, string]))
        .expr((block, ctx) => {
            const name  = block.getFieldValue("NAME")  as string;
            const field = block.getFieldValue("FIELD") as typeof BD2_FIELDS[number];
            return ctx.getOrCreateLocal(ctx, `__bd2_${name}_${field}`, simulizer.f64);
        }),
    LOCAL_DECL_BD3: new BlockBuilder("local_decl_bd3", undefined, 160, "boundary3d 반복 변수 선언 (u, v, x, y, z, dS, nx, ny, nz)")
        .addBody("bd3 변수 %1 선언")
        .addArg("field_input", "NAME", "p")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            for (const f of BD3_FIELDS) {
                ctx.getOrCreateLocal(ctx, `__bd3_${name}_${f}`, simulizer.f64);
            }
            return null;
        }),
    LOCAL_GET_BD3: new BlockBuilder("local_get_bd3", "f64", 160, "boundary3d 필드 읽기")
        .addBody("bd3 %1 . %2")
        .addArg("field_input", "NAME", "p")
        .addArgDropdown("FIELD", BD3_FIELDS.map(f => [f, f] as [string, string]))
        .expr((block, ctx) => {
            const name  = block.getFieldValue("NAME")  as string;
            const field = block.getFieldValue("FIELD") as typeof BD3_FIELDS[number];
            return ctx.getOrCreateLocal(ctx, `__bd3_${name}_${field}`, simulizer.f64);
        }),
}

export const XML_LOCAL_BLOCKS = `
<category name="📦 지역 변수" colour="330">
    <block type="local_decl_i32"><value name="INIT"><block type="i32_const"></block></value></block>
    <block type="local_decl_f64"><value name="INIT"><block type="f64_const"></block></value></block>
    <block type="local_set_i32"><value name="VALUE"><block type="i32_const"></block></value></block>
    <block type="local_set_f64"><value name="VALUE"><block type="f64_const"></block></value></block>
    <block type="local_get_i32"></block>
    <block type="local_get_f64"></block>
    <block type="local_decl_bd2"></block>
    <block type="local_get_bd2"></block>
    <block type="local_decl_bd3"></block>
    <block type="local_get_bd3"></block>
</category>`