import { parseLatex, type ASTNode } from './parser';

// Generates C++ source from a LaTeX formula, reusing the shared utils/tex
// parser. Mirrors the node coverage of evalAst.ts (trig/exp/log/powers/frac),
// but emits C++ expressions/statements instead of evaluating numerically.
//
// Functions and constants map onto <cmath> (std::sin, M_PI, …), so generated
// code that uses them needs `#include <cmath>`.

// LaTeX command → C++ <cmath> function (single argument).
const FN1: Record<string, string> = {
    '\\sin': 'std::sin',
    '\\cos': 'std::cos',
    '\\tan': 'std::tan',
    '\\arcsin': 'std::asin',
    '\\arccos': 'std::acos',
    '\\arctan': 'std::atan',
    '\\sinh': 'std::sinh',
    '\\cosh': 'std::cosh',
    '\\tanh': 'std::tanh',
    '\\exp': 'std::exp',
    '\\ln': 'std::log',
    '\\log': 'std::log10',
    '\\sqrt': 'std::sqrt',
    '\\abs': 'std::fabs',
    '\\floor': 'std::floor',
    '\\ceil': 'std::ceil',
};

// Reciprocal trig commands (no direct cmath fn) → 1.0 / base(arg).
const FN1_RECIP: Record<string, string> = {
    '\\cot': 'std::tan',
    '\\sec': 'std::cos',
    '\\csc': 'std::sin',
};

// Named constants → C++ <cmath> macros.
const CONST: Record<string, string> = {
    '\\pi': 'M_PI',
    '\\tau': '(2 * M_PI)',
    '\\e': 'M_E',
};

// Binary operator precedence (higher binds tighter); used to minimise parens.
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

function gen(node: ASTNode, parentPrec: number): string {
    switch (node.type) {
        case 'number':
            return String(node.value);

        case 'text':
            return String(node.value);

        case 'subscript': {
            // a_{i} → a[i],  T_{i,j} → T[i][j]
            const name = String(node.value);
            const indices = node.children ?? [];
            return name + indices.map(i => `[${gen(i, 0)}]`).join('');
        }

        case 'operator': {
            if (!node.children || node.children.length < 2) {
                throw new Error(`Operator "${node.value}" needs two operands`);
            }
            const op = String(node.value);
            // Unary minus, encoded by the parser as "0 - operand".
            if (op === '-' && node.children[0].type === 'number' && Number(node.children[0].value) === 0) {
                return `-${gen(node.children[1], 3)}`;
            }
            const prec = PREC[op] ?? 1;
            const l = gen(node.children[0], prec);
            // For non-associative ops (- and /) the right operand needs a higher
            // threshold so same-precedence siblings get parenthesised.
            const r = gen(node.children[1], op === '-' || op === '/' ? prec + 1 : prec);
            const s = `${l} ${op} ${r}`;
            return prec < parentPrec ? `(${s})` : s;
        }

        case 'power': {
            if (!node.children || node.children.length < 2) {
                throw new Error('Power needs a base and an exponent');
            }
            return `std::pow(${gen(node.children[0], 0)}, ${gen(node.children[1], 0)})`;
        }

        case 'command': {
            const cmd = String(node.value);
            const kids = node.children ?? [];

            if (cmd === '\\frac') {
                if (kids.length < 2) throw new Error('\\frac needs a numerator and a denominator');
                const prec = PREC['/'];
                const s = `${gen(kids[0], prec)} / ${gen(kids[1], prec + 1)}`;
                return prec < parentPrec ? `(${s})` : s;
            }

            if (cmd in CONST) return CONST[cmd];

            if (cmd in FN1) {
                if (kids.length < 1) throw new Error(`${cmd} needs an argument, e.g. ${cmd}(x)`);
                return `${FN1[cmd]}(${gen(kids[0], 0)})`;
            }

            if (cmd in FN1_RECIP) {
                if (kids.length < 1) throw new Error(`${cmd} needs an argument, e.g. ${cmd}(x)`);
                const prec = PREC['/'];
                const s = `1.0 / ${FN1_RECIP[cmd]}(${gen(kids[0], 0)})`;
                return prec < parentPrec ? `(${s})` : s;
            }

            if (cmd === '\\sign') {
                if (kids.length < 1) throw new Error('\\sign needs an argument');
                const arg = gen(kids[0], 4);
                return `((${arg} > 0) - (${arg} < 0))`;
            }

            throw new Error(`Unsupported command "${cmd}"`);
        }

        case 'expression': {
            const kids = node.children ?? [];
            if (kids.length === 1) return gen(kids[0], parentPrec);
            if (kids.length === 0) throw new Error('Empty expression');
            // Adjacent factors → implicit multiplication.
            const prec = PREC['*'];
            const s = kids.map(k => gen(k, prec)).join(' * ');
            return prec < parentPrec ? `(${s})` : s;
        }

        default:
            throw new Error(`Unsupported expression node "${node.type}"`);
    }
}

/**
 * Converts a LaTeX formula to C++ source.
 *
 * - An equation `lhs = rhs` becomes a statement: a scalar lhs declares a new
 *   `double` (`double y = …;`), a subscript lhs assigns an element
 *   (`a[i] = …;`).
 * - A bare formula becomes a C++ expression fragment (no trailing semicolon),
 *   so it can drop into a larger expression at the cursor.
 *
 * Throws on unsupported LaTeX constructs.
 */
export function latexToCpp(latex: string): string {
    const ast = parseLatex(latex.trim());

    if (ast.type === 'operator' && ast.value === '=' && ast.children?.length === 2) {
        const [lhs, rhs] = ast.children;
        const rhsCode = gen(rhs, 0);
        if (lhs.type === 'text') {
            return `double ${String(lhs.value)} = ${rhsCode};`;
        }
        // Element assignment: a_{i} = …  →  a[i] = …;
        return `${gen(lhs, 0)} = ${rhsCode};`;
    }

    return gen(ast, 0);
}
