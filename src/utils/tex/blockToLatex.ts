import type * as Blockly from "blockly/core";

// ─── Block → LaTeX ────────────────────────────────────────────────────────────
// Inverse of blockgen.ts (LaTeX → block). Renders an assignment statement or a
// value expression block subtree to a LaTeX string for the latex_expr/
// latex_value blocks. Returns null when any descendant has no LaTeX rendering,
// which the context menu surfaces as a disabled "convert to LaTeX" item.
//
// The strictly round-trippable subset (+−×÷, \frac, \sqrt, variables, constants,
// int↔float casts, array/tensor indexing) maps back exactly via blockgen; the
// remaining math ops (min/max, abs, sin/cos/ln/exp, comparisons, bitwise) render
// for display only and may not round-trip.

interface Tex { tex: string; prec: number; }

// Parenthesization precedence. Higher binds tighter; an operand is wrapped when
// its precedence is below the context's required minimum.
const PREC = {
    CMP: 0,
    OR: 1,
    XOR: 2,
    AND: 3,
    SHIFT: 4,
    ADD: 5,
    MUL: 6,
    UNARY: 7,
    ATOM: 100,
};

const ASSIGN_TYPES = new Set([
    "local_set_i32", "local_set_f64",
    "array_set_i32", "array_set_f64",
    "tensor_set_by_index",
    "tensor_save",
]);

// Tensor field-op blocks → their LaTeX command (∇).
const FIELD_CMD: Record<string, string> = {
    tensor_grad: "\\grad",
    tensor_curl: "\\curl",
    tensor_lapl: "\\lapl",
};

const CMP_OPS: Record<string, string> = {
    eq: "=", ne: "\\ne",
    lt: "<", gt: ">", le: "\\le", ge: "\\ge",
    lt_s: "<", gt_s: ">", le_s: "\\le", ge_s: "\\ge",
};

function wrap(t: Tex): string { return `\\left(${t.tex}\\right)`; }
function atMin(t: Tex, min: number): string { return t.prec < min ? wrap(t) : t.tex; }

function ident(name: unknown): string { return String(name ?? ""); }

// Left-associative binary op. The right operand is also wrapped at equal
// precedence for non-associative ops (a − (b − c), a ≪ (b ≪ c), …).
function binary(l: Tex, r: Tex, op: string, prec: number, assoc: boolean): Tex {
    const left = atMin(l, prec);
    const right = (r.prec < prec || (!assoc && r.prec === prec)) ? wrap(r) : r.tex;
    return { tex: `${left} ${op} ${right}`, prec };
}

function frac(l: Tex, r: Tex): Tex {
    return { tex: `\\frac{${l.tex}}{${r.tex}}`, prec: PREC.ATOM };
}

function fn(name: string, a: Tex): Tex {
    return { tex: `${name}\\left(${a.tex}\\right)`, prec: PREC.ATOM };
}

function fn2(name: string, a: Tex, b: Tex): Tex {
    return { tex: `${name}\\left(${a.tex}, ${b.tex}\\right)`, prec: PREC.ATOM };
}

function arrayName(block: Blockly.Block | null): string | null {
    if (!block) return null;
    if (block.type === "local_array_get_i32" || block.type === "local_array_get_f64")
        return ident(block.getFieldValue("NAME"));
    return null;
}

function subscript(name: string, parts: string[]): Tex {
    return { tex: `${name}_{${parts.join(", ")}}`, prec: PREC.ATOM };
}

function tensorIndices(block: Blockly.Block): string[] | null {
    const dim = Math.max(1, parseInt(String(block.getFieldValue("DIM") ?? "1"), 10));
    const parts: string[] = [];
    for (let i = 0; i < dim; i++) {
        const idx = value(block.getInputTargetBlock(`INDEX_${i}`));
        if (!idx) return null;
        parts.push(idx.tex);
    }
    return parts;
}

function binop(op: string, l: Tex, r: Tex): Tex | null {
    switch (op) {
        case "add":   return binary(l, r, "+", PREC.ADD, true);
        case "sub":   return binary(l, r, "-", PREC.ADD, false);
        case "mul":   return binary(l, r, "\\cdot", PREC.MUL, true);
        case "div":               // f64 ÷
        case "div_s": return frac(l, r); // i32 ÷
        case "min":   return fn2("\\min", l, r);
        case "max":   return fn2("\\max", l, r);
        case "rem_s": return binary(l, r, "\\bmod", PREC.MUL, false);
        case "and":   return binary(l, r, "\\mathbin{\\&}", PREC.AND, true);
        case "or":    return binary(l, r, "\\mathbin{|}", PREC.OR, true);
        case "xor":   return binary(l, r, "\\oplus", PREC.XOR, true);
        case "shl":   return binary(l, r, "\\ll", PREC.SHIFT, false);
        case "shr_s": return binary(l, r, "\\gg", PREC.SHIFT, false);
        default:      return null;
    }
}

function unop(op: string, v: Tex): Tex | null {
    switch (op) {
        case "neg":     return { tex: `-${atMin(v, PREC.UNARY)}`, prec: PREC.UNARY };
        case "abs":     return { tex: `\\left|${v.tex}\\right|`, prec: PREC.ATOM };
        case "sqrt":    return { tex: `\\sqrt{${v.tex}}`, prec: PREC.ATOM };
        case "ceil":    return { tex: `\\lceil ${v.tex} \\rceil`, prec: PREC.ATOM };
        case "floor":   return { tex: `\\lfloor ${v.tex} \\rfloor`, prec: PREC.ATOM };
        case "trunc":   return fn("\\operatorname{trunc}", v);
        case "nearest": return fn("\\operatorname{round}", v);
        case "exp":     return { tex: `e^{${v.tex}}`, prec: PREC.ATOM };
        case "ln":      return fn("\\ln", v);
        case "sin":     return fn("\\sin", v);
        case "cos":     return fn("\\cos", v);
        case "clz":     return fn("\\operatorname{clz}", v);
        case "ctz":     return fn("\\operatorname{ctz}", v);
        case "popcnt":  return fn("\\operatorname{popcnt}", v);
        case "eqz":     return { tex: `\\left[${v.tex} = 0\\right]`, prec: PREC.ATOM };
        default:        return null;
    }
}

function value(block: Blockly.Block | null): Tex | null {
    if (!block) return null;
    const child = (name: string) => value(block.getInputTargetBlock(name));

    switch (block.type) {
        case "i32_const":
        case "f64_const": {
            const v = block.getFieldValue("VALUE");
            // Negative literals bind like a unary minus so they parenthesize
            // correctly inside products.
            return { tex: String(v), prec: Number(v) < 0 ? PREC.UNARY : PREC.ATOM };
        }

        case "local_get_i32":
        case "local_get_f64":
            return { tex: ident(block.getFieldValue("NAME")), prec: PREC.ATOM };

        // Numeric conversions are invisible in math notation.
        case "f64_from_i32":
        case "i32_from_f64":
            return child("VALUE");

        case "i32_binop":
        case "f64_binop": {
            const l = child("LHS"), r = child("RHS");
            if (!l || !r) return null;
            return binop(block.getFieldValue("OP"), l, r);
        }

        case "f64_unop":
        case "i32_unop": {
            const v = child("VALUE");
            return v ? unop(block.getFieldValue("OP"), v) : null;
        }

        case "i32_not": {
            const v = child("VALUE");
            return v ? { tex: `\\lnot ${atMin(v, PREC.UNARY)}`, prec: PREC.UNARY } : null;
        }

        case "i32_cmp":
        case "f64_cmp": {
            const l = child("LHS"), r = child("RHS");
            const op = CMP_OPS[block.getFieldValue("OP")];
            if (!l || !r || !op) return null;
            return { tex: `${l.tex} ${op} ${r.tex}`, prec: PREC.CMP };
        }

        case "array_get_i32":
        case "array_get_f64": {
            const arr = arrayName(block.getInputTargetBlock("ARRAY"));
            const idx = child("INDEX");
            if (arr == null || !idx) return null;
            return subscript(arr, [idx.tex]);
        }

        case "tensor_get_by_index": {
            const parts = tensorIndices(block);
            return parts ? subscript(ident(block.getFieldValue("TENSOR_NAME")), parts) : null;
        }

        // Whole-tensor reference by name (the field id) → bare name.
        case "tensor_get":
            return { tex: ident(block.getFieldValue("NAME")), prec: PREC.ATOM };

        // Field operators: \grad{f}, \curl{F}, \lapl{f}.
        case "tensor_grad":
        case "tensor_curl":
        case "tensor_lapl": {
            const v = value(block.getInputTargetBlock("TENSOR"));
            return v ? { tex: `${FIELD_CMD[block.type]}{${v.tex}}`, prec: PREC.ATOM } : null;
        }

        default:
            return null;
    }
}

function assignment(block: Blockly.Block): string | null {
    // tensor_save ("TENSOR out = expr") stores a tensor result under a name.
    if (block.type === "tensor_save") {
        const rhs = value(block.getInputTargetBlock("EXPR"));
        return rhs ? `${ident(block.getFieldValue("NAME"))} = ${rhs.tex}` : null;
    }

    const rhs = value(block.getInputTargetBlock("VALUE"));
    if (!rhs) return null;

    let lhs: string | null = null;
    switch (block.type) {
        case "local_set_i32":
        case "local_set_f64":
            lhs = ident(block.getFieldValue("NAME"));
            break;

        case "array_set_i32":
        case "array_set_f64": {
            const arr = arrayName(block.getInputTargetBlock("ARRAY"));
            const idx = value(block.getInputTargetBlock("INDEX"));
            if (arr == null || !idx) return null;
            lhs = subscript(arr, [idx.tex]).tex;
            break;
        }

        case "tensor_set_by_index": {
            const parts = tensorIndices(block);
            if (!parts) return null;
            lhs = subscript(ident(block.getFieldValue("TENSOR_NAME")), parts).tex;
            break;
        }
    }

    return lhs == null ? null : `${lhs} = ${rhs.tex}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Whether the "convert to LaTeX" item should appear on this block at all: pure
 *  assignment statements and value/expr blocks (but not the LaTeX blocks). */
export function isLatexConvertibleSource(block: Blockly.Block): boolean {
    if (block.type === "latex_value" || block.type === "latex_expr") return false;
    if (ASSIGN_TYPES.has(block.type)) return true;
    return !!block.outputConnection;
}

/** Render an assignment/expr block subtree to LaTeX, or null if not renderable
 *  (→ the menu item is shown disabled). */
export function blockToLatex(block: Blockly.Block): string | null {
    if (ASSIGN_TYPES.has(block.type)) return assignment(block);
    if (block.outputConnection) {
        const t = value(block);
        return t ? t.tex : null;
    }
    return null;
}
