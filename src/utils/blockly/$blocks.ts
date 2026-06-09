import { BlockSet, zip } from "./$base";
import { ARRAY_BLOCKS } from "./array";
import { BOOL_BLOCKS } from "./bool";
import { DEBUG_BLOCKS } from "./debug";
import { F64_BLOCKS } from "./f64";
import { FLOW_BLOCKS } from "./flow";
import { I32_BLOCKS } from "./i32";
import { LOCAL_BLOCKS } from "./locals";
import { TENSOR_BLOCKS } from "./tensor";
import { VECTOR_BLOCKS } from "./vector";
import { BOUNDARY_BLOCKS } from "./boundary";
import { UTIL_BLOCKS } from "./util";


/**
 * Block types whose execution requires the Asyncify-capable C++ (emcc/clang)
 * run path — they can suspend mid-run waiting on the host (e.g. interactive
 * input). The native browser simulation (wabt → wasm-worker) cannot pause a
 * synchronous run, so a program containing any of these must be routed to the
 * emcc path. Keep this in sync with the backend's ASYNCIFY_IMPORTS list.
 */
export const NEEDS_EMCC_BLOCK_TYPES: ReadonlySet<string> = new Set([
    "input_i32",
    "input_f64",
]);

export const CUSTOM_BLOCKS: BlockSet = zip(
    DEBUG_BLOCKS,
    BOOL_BLOCKS,
    I32_BLOCKS,
    F64_BLOCKS,
    LOCAL_BLOCKS,
    FLOW_BLOCKS,
    ARRAY_BLOCKS,
    TENSOR_BLOCKS,
    VECTOR_BLOCKS,
    BOUNDARY_BLOCKS,
    UTIL_BLOCKS,
)