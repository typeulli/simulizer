import { parseLatex, type ASTNode } from './parser';
import { GetVarID, type CompileCtx } from '../blockly/$base';
import { simulizer } from '../wasm/engine';
import { MAX_DIM } from '../wasm/tensor';

// ─── Type inference ──────────────────────────────────────────────────────────

function isFloat(value: string): boolean {
    return value.includes('.');
}

function inferNodeType(node: ASTNode, ctx: CompileCtx): simulizer.Type {
    switch (node.type) {
        case 'number':
            return isFloat(String(node.value)) ? simulizer.f64 : simulizer.i32;

        case 'text': {
            const name = String(node.value);
            const local = ctx.locals.get(name);
            if (local) return local.local.type;
            return simulizer.i32;
        }

        case 'subscript': {
            const name = String(node.value);
            const indices = node.children ?? [];
            // Single numeric-literal index → array element
            if (indices.length === 1 && indices[0].type === 'number') {
                const arr = ctx.arrays?.get(name);
                if (arr) return arr.elem;
            }
            // Multi-index or variable index → tensor element (always f64)
            return simulizer.f64;
        }

        case 'operator': {
            if (!node.children || node.children.length < 2) return simulizer.i32;
            const lt = inferNodeType(node.children[0], ctx);
            const rt = inferNodeType(node.children[1], ctx);
            return (lt.equals(simulizer.f64) || rt.equals(simulizer.f64))
                ? simulizer.f64 : simulizer.i32;
        }

        case 'command': {
            const cmd = String(node.value);
            if (cmd === '\\frac') return simulizer.f64;
            if (cmd === '\\sqrt') return simulizer.f64;
            return simulizer.i32;
        }

        case 'expression':
            if (node.children?.length === 1) return inferNodeType(node.children[0], ctx);
            return simulizer.i32;

        default:
            return simulizer.i32;
    }
}

// ─── Index args builder (pads to MAX_DIM with zeros) ─────────────────────────

function buildIndexArgs(
    indices: ASTNode[],
    ctx: CompileCtx,
): simulizer.Expr[] | null {
    const args: simulizer.Expr[] = [];
    for (let i = 0; i < MAX_DIM; i++) {
        if (i < indices.length) {
            const expr = buildExpr(indices[i], ctx, simulizer.i32);
            if (!expr) return null;
            args.push(expr);
        } else {
            args.push(simulizer.i32c(0));
        }
    }
    return args;
}

// ─── Expression builder ───────────────────────────────────────────────────────

function buildExpr(
    node: ASTNode,
    ctx: CompileCtx,
    targetType: simulizer.Type,
): simulizer.Expr | null {
    switch (node.type) {
        case 'number': {
            const v = String(node.value);
            if (targetType.equals(simulizer.f64)) return simulizer.f64c(parseFloat(v));
            return simulizer.i32c(parseInt(v, 10));
        }

        case 'text': {
            const name = String(node.value);
            const local = ctx.locals.get(name);
            if (!local) return null;
            return ctx.coerce(local.local, targetType);
        }

        case 'subscript': {
            const name = String(node.value);
            const indices = node.children ?? [];

            // Single constant index → array element read
            if (indices.length === 1 && indices[0].type === 'number') {
                const arr = ctx.arrays?.get(name);
                if (arr) {
                    const idx = parseInt(String(indices[0].value), 10);
                    const elem = arr.ops.get(arr.ptr, simulizer.i32c(idx));
                    return ctx.coerce(elem, targetType);
                }
            }

            // Otherwise → tensor element read: tensor_get(id, n, i0..i5)
            const dim = Math.min(indices.length, MAX_DIM);
            if (dim < 1) return null;
            const indexArgs = buildIndexArgs(indices, ctx);
            if (!indexArgs) return null;
            const call = new simulizer.Call(
                'tensor_get',
                [simulizer.i32c(GetVarID(name)), simulizer.i32c(dim), ...indexArgs],
                simulizer.f64,
            );
            return ctx.coerce(call, targetType);
        }

        case 'operator': {
            if (!node.children || node.children.length < 2) return null;
            const op = String(node.value);
            const lhsRaw = buildExpr(node.children[0], ctx, targetType);
            const rhsRaw = buildExpr(node.children[1], ctx, targetType);
            if (!lhsRaw || !rhsRaw) return null;
            return buildBinOp(op, targetType, lhsRaw, rhsRaw);
        }

        case 'command': {
            const cmd = String(node.value);
            if (cmd === '\\frac') {
                if (!node.children || node.children.length < 2) return null;
                const num = buildExpr(node.children[0], ctx, simulizer.f64);
                const den = buildExpr(node.children[1], ctx, simulizer.f64);
                if (!num || !den) return null;
                return ctx.coerce(simulizer.f64ops.div(num, den), targetType);
            }
            if (cmd === '\\sqrt') {
                if (!node.children || node.children.length < 1) return null;
                const radicand = buildExpr(node.children[0], ctx, simulizer.f64);
                if (!radicand) return null;
                // \sqrt{x}{n}: only n=2 (square root) supported natively via f64.sqrt
                if (node.children.length >= 2) {
                    const nNode = node.children[1];
                    const nVal = nNode.type === 'number' ? parseFloat(String(nNode.value)) : NaN;
                    if (nVal !== 2) return null;
                }
                return ctx.coerce(simulizer.f64ops.sqrt(radicand), targetType);
            }
            return null;
        }

        case 'expression':
            if (node.children?.length === 1) return buildExpr(node.children[0], ctx, targetType);
            return null;

        default:
            return null;
    }
}

function buildBinOp(
    op: string,
    type: simulizer.Type,
    l: simulizer.Expr,
    r: simulizer.Expr,
): simulizer.Expr | null {
    if (type.equals(simulizer.i32)) {
        switch (op) {
            case '+': return simulizer.i32ops.add(l, r);
            case '-': return simulizer.i32ops.sub(l, r);
            case '*': return simulizer.i32ops.mul(l, r);
            case '/': return simulizer.i32ops.div_s(l, r);
        }
    } else if (type.equals(simulizer.f64)) {
        switch (op) {
            case '+': return simulizer.f64ops.add(l, r);
            case '-': return simulizer.f64ops.sub(l, r);
            case '*': return simulizer.f64ops.mul(l, r);
            case '/': return simulizer.f64ops.div(l, r);
        }
    }
    return null;
}

// ─── Assignment builder ───────────────────────────────────────────────────────

function buildAssignment(
    lhsNode: ASTNode,
    rhsNode: ASTNode,
    ctx: CompileCtx,
): simulizer.Expr | null {
    // subscript assignment: arr_{0} = rhs  or  T_{1,4,x} = rhs
    if (lhsNode.type === 'subscript') {
        const name = String(lhsNode.value);
        const indices = lhsNode.children ?? [];

        // Single constant index → array element set
        if (indices.length === 1 && indices[0].type === 'number') {
            const arr = ctx.arrays?.get(name);
            if (arr) {
                const idx = parseInt(String(indices[0].value), 10);
                const rhs = buildExpr(rhsNode, ctx, arr.elem);
                if (!rhs) return null;
                return arr.ops.set(arr.ptr, simulizer.i32c(idx), ctx.coerce(rhs, arr.elem));
            }
        }

        // Otherwise → tensor element set: tensor_set(id, n, i0..i5, value)
        const dim = Math.min(indices.length, MAX_DIM);
        if (dim < 1) return null;
        const indexArgs = buildIndexArgs(indices, ctx);
        if (!indexArgs) return null;
        const rhs = buildExpr(rhsNode, ctx, simulizer.f64);
        if (!rhs) return null;
        return new simulizer.Drop(new simulizer.Call(
            'tensor_set',
            [simulizer.i32c(GetVarID(name)), simulizer.i32c(dim), ...indexArgs, ctx.coerce(rhs, simulizer.f64)],
            simulizer.i32,
        ));
    }

    if (lhsNode.type !== 'text') return null;
    const name = String(lhsNode.value);

    // scalar local assignment: name = rhs
    const rhsType = inferNodeType(rhsNode, ctx);
    const local = ctx.getOrCreateLocal(ctx, name, rhsType);
    const rhs = buildExpr(rhsNode, ctx, rhsType);
    if (!rhs) return null;
    return new simulizer.LocalSet(local, ctx.coerce(rhs, rhsType));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function latexToValueExpr(latex: string, ctx: CompileCtx): simulizer.Expr | null {
    const ast = parseLatex(latex.trim());
    const t = inferNodeType(ast, ctx);
    return buildExpr(ast, ctx, t);
}

export function latexToExpr(latex: string, ctx: CompileCtx): simulizer.Expr | null {
    const ast = parseLatex(latex.trim());

    // Root is assignment
    if (ast.type === 'operator' && ast.value === '=' && ast.children?.length === 2) {
        return buildAssignment(ast.children[0], ast.children[1], ctx);
    }

    // Root is bare expression (read-only; result is dropped by caller)
    const t = inferNodeType(ast, ctx);
    return buildExpr(ast, ctx, t);
}
