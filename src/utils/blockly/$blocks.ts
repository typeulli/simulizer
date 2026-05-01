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
import { LATEX_BLOCKS } from "./latex";


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
    LATEX_BLOCKS,
)