import { simulizer } from "../wasm/engine";
import { BlockBuilder, type BlockSet } from "./$base";

export const LOCAL_BLOCKS: BlockSet = {
    LOCAL_DECL_I32: new BlockBuilder("local_decl_i32", undefined, 330, "int 변수 선언")
        .addBody("int var %1 = %2")
        .addArg("field_input", "NAME", "x")
        .addArgValue("INIT", "i32")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const init = ctx.blockToExpr(block.getInputTargetBlock("INIT"), ctx);
            if (!init) return null;
            const local = ctx.declareLocal(ctx, name, simulizer.i32, block.id);
            return new simulizer.LocalSet(local, ctx.coerce(init, simulizer.i32));
        }),
    LOCAL_DECL_F64: new BlockBuilder("local_decl_f64", undefined, 330, "float 변수 선언")
        .addBody("float var %1 = %2")
        .addArg("field_input", "NAME", "x")
        .addArgValue("INIT", "f64")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const init = ctx.blockToExpr(block.getInputTargetBlock("INIT"), ctx);
            if (!init) return null;
            const local = ctx.declareLocal(ctx, name, simulizer.f64, block.id);
            return new simulizer.LocalSet(local, ctx.coerce(init, simulizer.f64));
        }),
    LOCAL_GET_I32: new BlockBuilder("local_get_i32", "i32", 330, "int 변수 읽기")
        .addBody("int %1")
        .addArg("field_input", "NAME", "x")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            return ctx.getOrCreateLocal(ctx, name, simulizer.i32);
        }),
    LOCAL_GET_F64: new BlockBuilder("local_get_f64", "f64", 330, "float 변수 읽기")
        .addBody("float %1")
        .addArg("field_input", "NAME", "x")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            return ctx.getOrCreateLocal(ctx, name, simulizer.f64);
        }),
    LOCAL_SET_I32: new BlockBuilder("local_set_i32", undefined, 330, "int 변수 대입")
        .addBody("int %1 ← %2")
        .addArg("field_input", "NAME", "x")
        .addArgValue("VALUE", "i32")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const val = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            if (!val) return null;
            const local = ctx.getOrCreateLocal(ctx, name, simulizer.i32);
            return new simulizer.LocalSet(local, ctx.coerce(val, simulizer.i32));
        }),
    LOCAL_SET_F64: new BlockBuilder("local_set_f64", undefined, 330, "float 변수 대입")
        .addBody("float %1 ← %2")
        .addArg("field_input", "NAME", "x")
        .addArgValue("VALUE", "f64")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const val = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            if (!val) return null;
            const local = ctx.getOrCreateLocal(ctx, name, simulizer.f64);
            return new simulizer.LocalSet(local, ctx.coerce(val, simulizer.f64));
        }),
}

export function xmlLocalBlocks(cat: string) {
    return `<category name="${cat}" colour="${330}">
    <sep gap="16"></sep>
    <label text="Variable"></label>
    <block type="local_decl_i32"><value name="INIT"><block type="i32_const"></block></value></block>
    <block type="local_decl_f64"><value name="INIT"><block type="f64_const"></block></value></block>
    <block type="local_set_i32"><value name="VALUE"><block type="i32_const"></block></value></block>
    <block type="local_set_f64"><value name="VALUE"><block type="f64_const"></block></value></block>
    <block type="local_get_i32"></block>
    <block type="local_get_f64"></block>
</category>`;
}
