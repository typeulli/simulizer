import { parseLatex, type ASTNode } from './parser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlockJSON {
    type: string;
    fields?: Record<string, string | number>;
    inputs?: Record<string, { block?: BlockJSON }>;
    next?: { block: BlockJSON };
    extraState?: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WJson = Record<string, any>;

type BType = 'i32' | 'f64';

// ─── Type inference ───────────────────────────────────────────────────────────

function isFloat(value: string): boolean {
    return value.includes('.');
}

function inferNodeType(node: ASTNode): BType {
    switch (node.type) {
        case 'number':
            return isFloat(String(node.value)) ? 'f64' : 'i32';
        case 'text':
            return 'i32';
        case 'subscript':
            return 'f64';
        case 'operator': {
            if (!node.children || node.children.length < 2) return 'i32';
            const lt = inferNodeType(node.children[0]);
            const rt = inferNodeType(node.children[1]);
            return (lt === 'f64' || rt === 'f64') ? 'f64' : 'i32';
        }
        case 'command': {
            const cmd = String(node.value);
            if (cmd === '\\frac' || cmd === '\\sqrt') return 'f64';
            return 'i32';
        }
        case 'expression':
            if (node.children?.length === 1) return inferNodeType(node.children[0]);
            return 'i32';
        default:
            return 'i32';
    }
}

// ─── Coercion ─────────────────────────────────────────────────────────────────

function coerce(block: BlockJSON, from: BType, to: BType): BlockJSON {
    if (from === to) return block;
    if (from === 'i32' && to === 'f64')
        return { type: 'f64_from_i32', inputs: { VALUE: { block } } };
    if (from === 'f64' && to === 'i32')
        return { type: 'i32_from_f64', inputs: { VALUE: { block } } };
    return block;
}

// ─── Tensor field operators (∇) ───────────────────────────────────────────────
// \grad{f} / \curl{F} / \lapl{f} → tensor field-op blocks whose TENSOR input is a
// tensor reference (tensor_get by name, or a nested field op).
const FIELD_OP_BLOCKS: Record<string, string> = {
    '\\grad': 'tensor_grad',
    '\\curl': 'tensor_curl',
    '\\lapl': 'tensor_lapl',
    '\\laplacian': 'tensor_lapl',
};

/** Build the TENSOR-input block for a field op: a bare field name → tensor_get,
 *  a nested field op → its block. */
function buildTensorIdBlock(node: ASTNode): BlockJSON | null {
    if (node.type === 'expression' && node.children?.length === 1) {
        return buildTensorIdBlock(node.children[0]);
    }
    if (node.type === 'text') {
        return { type: 'tensor_get', fields: { NAME: String(node.value) } };
    }
    if (node.type === 'command') {
        const t = FIELD_OP_BLOCKS[String(node.value)];
        const arg = node.children?.[0];
        if (t && arg) {
            const inner = buildTensorIdBlock(arg);
            return inner ? { type: t, inputs: { TENSOR: { block: inner } } } : null;
        }
    }
    return null;
}

// ─── Value block builder ──────────────────────────────────────────────────────

function buildValueBlock(node: ASTNode, targetType: BType): BlockJSON | null {
    switch (node.type) {
        case 'number': {
            const v = String(node.value);
            if (targetType === 'f64')
                return { type: 'f64_const', fields: { VALUE: parseFloat(v) } };
            return { type: 'i32_const', fields: { VALUE: parseInt(v, 10) } };
        }

        case 'text': {
            const name = String(node.value);
            const block: BlockJSON = targetType === 'f64'
                ? { type: 'local_get_f64', fields: { NAME: name } }
                : { type: 'local_get_i32', fields: { NAME: name } };
            return block;
        }

        case 'subscript': {
            const name = String(node.value);
            const indices = node.children ?? [];

            // Single index → array element read
            if (indices.length === 1) {
                const idxBlock = buildValueBlock(indices[0], 'i32');
                if (!idxBlock) return null;

                const arrType = targetType === 'i32' ? 'i32' : 'f64';
                const getBlock: BlockJSON = {
                    type: `array_get_${arrType}`,
                    inputs: {
                        ARRAY: { block: { type: `local_array_get_${arrType}`, fields: { NAME: name } } },
                        INDEX: { block: idxBlock },
                    },
                };
                return coerce(getBlock, arrType, targetType);
            }

            // Multi-index → tensor element read (always f64)
            if (indices.length < 1) return null;
            const dim = indices.length;
            const inputs: Record<string, { block?: BlockJSON }> = {};
            for (let i = 0; i < dim; i++) {
                const idxBlock = buildValueBlock(indices[i], 'i32');
                if (!idxBlock) return null;
                inputs[`INDEX_${i}`] = { block: idxBlock };
            }
            const getBlock: BlockJSON = {
                type: 'tensor_get_by_index',
                extraState: { dim },
                fields: { TENSOR_NAME: name, DIM: dim },
                inputs,
            };
            return coerce(getBlock, 'f64', targetType);
        }

        case 'operator': {
            if (!node.children || node.children.length < 2) return null;
            const op = String(node.value);
            if (op === '=') return null;

            const lt = inferNodeType(node.children[0]);
            const rt = inferNodeType(node.children[1]);
            const resolved: BType = (lt === 'f64' || rt === 'f64' || targetType === 'f64') ? 'f64' : 'i32';

            const lhsRaw = buildValueBlock(node.children[0], resolved);
            const rhsRaw = buildValueBlock(node.children[1], resolved);
            if (!lhsRaw || !rhsRaw) return null;

            const opMaps: Record<BType, Record<string, string>> = {
                i32: { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div_s' },
                f64: { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' },
            };
            const opCode = opMaps[resolved][op];
            if (!opCode) return null;

            const result: BlockJSON = {
                type: resolved === 'f64' ? 'f64_binop' : 'i32_binop',
                fields: { OP: opCode },
                inputs: { LHS: { block: lhsRaw }, RHS: { block: rhsRaw } },
            };
            return coerce(result, resolved, targetType);
        }

        case 'command': {
            const cmd = String(node.value);
            const fieldType = FIELD_OP_BLOCKS[cmd];
            if (fieldType) {
                const arg = node.children?.[0];
                if (!arg) return null;
                const inner = buildTensorIdBlock(arg);
                if (!inner) return null;
                // Field ops yield a tensor id (i32).
                return coerce({ type: fieldType, inputs: { TENSOR: { block: inner } } }, 'i32', targetType);
            }
            if (cmd === '\\frac') {
                if (!node.children || node.children.length < 2) return null;
                const num = buildValueBlock(node.children[0], 'f64');
                const den = buildValueBlock(node.children[1], 'f64');
                if (!num || !den) return null;
                const divBlock: BlockJSON = {
                    type: 'f64_binop',
                    fields: { OP: 'div' },
                    inputs: { LHS: { block: num }, RHS: { block: den } },
                };
                return coerce(divBlock, 'f64', targetType);
            }
            if (cmd === '\\sqrt') {
                if (!node.children || node.children.length < 1) return null;
                const radicand = buildValueBlock(node.children[0], 'f64');
                if (!radicand) return null;
                const sqrtBlock: BlockJSON = {
                    type: 'f64_unop',
                    fields: { OP: 'sqrt' },
                    inputs: { VALUE: { block: radicand } },
                };
                return coerce(sqrtBlock, 'f64', targetType);
            }
            return null;
        }

        case 'expression':
            if (node.children?.length === 1) return buildValueBlock(node.children[0], targetType);
            return null;

        default:
            return null;
    }
}

// ─── Statement block builder ──────────────────────────────────────────────────

function buildStmtBlock(node: ASTNode): BlockJSON | null {
    if (node.type !== 'operator' || node.value !== '=' || node.children?.length !== 2) return null;

    const lhsNode = node.children[0];
    const rhsNode = node.children[1];

    // Tensor-valued RHS (field op) → tensor_save under the LHS name.
    if (lhsNode.type === 'text' && rhsNode.type === 'command' && FIELD_OP_BLOCKS[String(rhsNode.value)]) {
        const exprBlock = buildValueBlock(rhsNode, 'i32');
        if (!exprBlock) return null;
        return {
            type: 'tensor_save',
            fields: { NAME: String(lhsNode.value) },
            inputs: { EXPR: { block: exprBlock } },
        };
    }

    // subscript LHS
    if (lhsNode.type === 'subscript') {
        const name = String(lhsNode.value);
        const indices = lhsNode.children ?? [];
        if (indices.length < 1) return null;

        // Single index: arr_{k} = rhs  →  array_set_f64/i32
        if (indices.length === 1) {
            const idxBlock = buildValueBlock(indices[0], 'i32');
            if (!idxBlock) return null;

            const rhsType = inferNodeType(rhsNode);
            const rhsBlock = buildValueBlock(rhsNode, rhsType);
            if (!rhsBlock) return null;

            const arrType = rhsType === 'i32' ? 'i32' : 'f64';
            return {
                type: `array_set_${arrType}`,
                inputs: {
                    ARRAY: { block: { type: `local_array_get_${arrType}`, fields: { NAME: name } } },
                    INDEX: { block: idxBlock },
                    VALUE: { block: coerce(rhsBlock, rhsType, arrType) },
                },
            };
        }

        // Multi-index: T_{i,j} = rhs  →  tensor_set_by_index (value is f64)
        const dim = indices.length;
        const inputs: Record<string, { block?: BlockJSON }> = {};
        for (let i = 0; i < dim; i++) {
            const idxBlock = buildValueBlock(indices[i], 'i32');
            if (!idxBlock) return null;
            inputs[`INDEX_${i}`] = { block: idxBlock };
        }
        const rhsType = inferNodeType(rhsNode);
        const rhsBlock = buildValueBlock(rhsNode, rhsType);
        if (!rhsBlock) return null;
        inputs.VALUE = { block: coerce(rhsBlock, rhsType, 'f64') };

        return {
            type: 'tensor_set_by_index',
            extraState: { dim },
            fields: { TENSOR_NAME: name, DIM: dim },
            inputs,
        };
    }

    if (lhsNode.type !== 'text') return null;

    const name = String(lhsNode.value);
    const rhsType = inferNodeType(rhsNode);
    const rhsBlock = buildValueBlock(rhsNode, rhsType);
    if (!rhsBlock) return null;

    return {
        type: rhsType === 'f64' ? 'local_set_f64' : 'local_set_i32',
        fields: { NAME: name },
        inputs: { VALUE: { block: rhsBlock } },
    };
}

// ─── Workspace-level block replacement ───────────────────────────────────────

function replaceBlock(block: WJson): WJson {
    if (block.type === 'latex_value') {
        const latex = (block.fields?.LATEX as string) ?? '';
        const replacement = latexToValueBlock(latex);
        return (replacement as WJson) ?? block;
    }

    if (block.type === 'latex_expr') {
        const latex = (block.fields?.LATEX as string) ?? '';
        const replacement = latexToStmtBlock(latex);
        if (replacement) {
            const result: WJson = { ...replacement };
            if (block.next?.block) {
                result.next = { block: replaceBlock(block.next.block) };
            }
            return result;
        }
        // Replacement failed — fall through to recurse inside the original
    }

    const result: WJson = { ...block };

    if (block.inputs) {
        result.inputs = Object.fromEntries(
            Object.entries(block.inputs as Record<string, WJson>).map(([key, slot]) => {
                if (slot?.block) return [key, { ...slot, block: replaceBlock(slot.block) }];
                return [key, slot];
            })
        );
    }

    if (block.next?.block) {
        result.next = { block: replaceBlock(block.next.block) };
    }

    return result;
}

export function replaceLatexBlocksInWorkspace(workspace: WJson): WJson {
    const blockList = workspace?.blocks?.blocks;
    if (!Array.isArray(blockList)) return workspace;
    return {
        ...workspace,
        blocks: {
            ...workspace.blocks,
            blocks: (blockList as WJson[]).map(replaceBlock),
        },
    };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function latexToValueBlock(latex: string): BlockJSON | null {
    const ast = parseLatex(latex.trim());
    const t = inferNodeType(ast);
    return buildValueBlock(ast, t);
}

export function latexToStmtBlock(latex: string): BlockJSON | null {
    const ast = parseLatex(latex.trim());
    return buildStmtBlock(ast);
}
