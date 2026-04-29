import { simulizer } from "../engine";
import { BlockBuilder, type BlockSet } from "./$base";
import { vec3Type } from "./vector";

export const DEBUG_BLOCKS: BlockSet = {
    DEBUG_LOG: new BlockBuilder("debug_log", undefined, 0, "콘솔에 값 출력", false)
        .addBody("log %1")
        .addArgValue("VALUE", ["i32", "f64", "i32*", "f64*", "vec2", "vec3"])
        .stmt((block, ctx) => {
            const valBlock = block.getInputTargetBlock("VALUE");
            if (!valBlock) return null;

            // If tensor block, use tensor-specific log import
            if (valBlock.type === "tensor_create" || valBlock.type === "tensor_binop" || valBlock.type === "tensor_get" || valBlock.type === "tensor_unop" || valBlock.type === "tensor_scale" || valBlock.type === "tensor_perlin") {
                const tid = ctx.blockToExpr(valBlock, ctx);
                if (!tid) return null;
                return new simulizer.Call("log_tensor", [ctx.coerce(tid, simulizer.i32)], simulizer.void_);
            }

            // If array pointer block, use dedicated import (pass ptr + capacity)
            if (valBlock.type === "local_array_get_i32" || valBlock.type === "local_array_get_f64") {
                const isI32 = valBlock.type === "local_array_get_i32";
                const arrName = valBlock.getFieldValue("NAME") as string;
                const arrInfo = ctx.arrays?.get(arrName);
                const sizeArg = arrInfo?.sizeLocal
                    ? arrInfo.sizeLocal
                    : simulizer.i32c(arrInfo?.def.capacity ?? 0);
                const val = ctx.blockToExpr(valBlock, ctx);
                if (!val) return null;
                const fnName = isI32 ? "log_arr_i32" : "log_arr_f64";
                return new simulizer.Call(fnName, [ctx.coerce(val, simulizer.i32), ctx.coerce(sizeArg, simulizer.i32)], simulizer.void_);
            }

            // Array literal block (array_literal_i32 / array_literal_f64)
            if (valBlock.type === "array_literal_i32" || valBlock.type === "array_literal_f64") {
                const isI32 = valBlock.type === "array_literal_i32";
                const capacity = Math.max(1, parseInt(valBlock.getFieldValue("SIZE") || "1", 10));
                const val = ctx.blockToExpr(valBlock, ctx);
                if (!val) return null;
                const fnName = isI32 ? "log_arr_i32" : "log_arr_f64";
                return new simulizer.Call(fnName, [ctx.coerce(val, simulizer.i32), simulizer.i32c(capacity)], simulizer.void_);
            }

            const val = ctx.blockToExpr(valBlock, ctx);
            if (!val) return null;
            const t = val.inferType();

            if (t.equals(simulizer.i32)) {
                return new simulizer.Call("log_i32", [val], simulizer.void_);
            }
            if (t.equals(simulizer.f64)) {
                return new simulizer.Call("log_f64", [val], simulizer.void_);
            }
            if (t.name === "vec2") {
                return new simulizer.Call("log_vec2", [val], simulizer.void_);
            }
            if (t.equals(vec3Type)) {
                return new simulizer.Call("log_vec3", [val], simulizer.void_);
            }
            // pointer → log_ptr (i32로 coerce)
            return new simulizer.Call("log_ptr", [ctx.coerce(val, simulizer.i32)], simulizer.void_);
        }),
    DEBUG_BAR: new BlockBuilder("debug_bar", "i32", 0, "프로그레스 바 생성 (id 반환)")
        .addBody("progress_bar min:%1 max:%2")
        .addArgValue("MIN", "i32")
        .addArgValue("MAX", "i32")
        .expr((block, ctx) => {
            const minBlock = block.getInputTargetBlock("MIN");
            const maxBlock = block.getInputTargetBlock("MAX");
            if (!minBlock || !maxBlock) return null;
            const minExpr = ctx.blockToExpr(minBlock, ctx);
            const maxExpr = ctx.blockToExpr(maxBlock, ctx);
            if (!minExpr || !maxExpr) return null;
            return new simulizer.Call("debug_bar", [ctx.coerce(minExpr, simulizer.i32), ctx.coerce(maxExpr, simulizer.i32)], simulizer.i32);
        }),
    DEBUG_BAR_SET: new BlockBuilder("debug_bar_set", undefined, 0, "프로그레스 바 값 설정")
        .addBody("bar_set id:%1 val:%2")
        .addArgValue("ID", "i32")
        .addArgValue("VALUE", "i32")
        .stmt((block, ctx) => {
            const idBlock = block.getInputTargetBlock("ID");
            const valBlock = block.getInputTargetBlock("VALUE");
            if (!idBlock || !valBlock) return null;
            const idExpr = ctx.blockToExpr(idBlock, ctx);
            const valExpr = ctx.blockToExpr(valBlock, ctx);
            if (!idExpr || !valExpr) return null;
            return new simulizer.Call("debug_bar_set", [ctx.coerce(idExpr, simulizer.i32), ctx.coerce(valExpr, simulizer.i32)], simulizer.void_);
        }),
}

export function xmlDebugBlocks(cat: string) {
    return `<category name="${cat}" colour="${0}">
    <block type="debug_log"><value name="VALUE"><block type="i32_const"></block></value></block>
    <block type="debug_log"><value name="VALUE"><block type="vec2_literal"><value name="X"><block type="f64_const"></block></value><value name="Y"><block type="f64_const"></block></value></block></value></block>
    <block type="debug_log"><value name="VALUE"><block type="vec3_literal"><value name="X"><block type="f64_const"></block></value><value name="Y"><block type="f64_const"></block></value><value name="Z"><block type="f64_const"></block></value></block></value></block>
    <block type="debug_bar">
        <value name="MIN"><block type="i32_const"><field name="VALUE">0</field></block></value>
        <value name="MAX"><block type="i32_const"><field name="VALUE">100</field></block></value>
    </block>
    <block type="debug_bar_set">
        <value name="ID"><block type="i32_const"><field name="VALUE">0</field></block></value>
        <value name="VALUE"><block type="i32_const"><field name="VALUE">0</field></block></value>
    </block>
</category>`;
}