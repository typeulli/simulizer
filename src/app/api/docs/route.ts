import { NextResponse } from "next/server";
import { I32_BLOCKS } from "@/simphy/lang/i32";
import { F64_BLOCKS } from "@/simphy/lang/f64";
import { FLOW_BLOCKS } from "@/simphy/lang/flow";
import { LOCAL_BLOCKS } from "@/simphy/lang/locals";
import { ARRAY_BLOCKS } from "@/simphy/lang/array";
import { DEBUG_BLOCKS } from "@/simphy/lang/debug";
import { TENSOR_BLOCKS } from "@/simphy/lang/tensor";
import { zip } from "@/simphy/lang/$base";
import { CUSTOM_BLOCKS } from "@/simphy/lang/$blocks";


export function GET() {
    const docs = Object.fromEntries(
        Object.entries(CUSTOM_BLOCKS).map(([type, block]) => [type, block.docs()])
    );
    return NextResponse.json(docs);
}
