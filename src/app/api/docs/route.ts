import { NextResponse } from "next/server";
import { CUSTOM_BLOCKS } from "@/simphy/lang/$blocks";


export function GET() {
    const docs = Object.fromEntries(
        Object.entries(CUSTOM_BLOCKS).map(([type, block]) => [type, block.docs()])
    );
    return NextResponse.json(docs);
}
