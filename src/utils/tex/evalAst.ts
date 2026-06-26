import { parseLatex, type ASTNode } from './parser';

/** Variable name → value, used while numerically evaluating a LaTeX AST. */
export type VarScope = Record<string, number>;

// Single-argument functions (LaTeX command → JS implementation).
const FN1: Record<string, (x: number) => number> = {
    '\\sin': Math.sin,
    '\\cos': Math.cos,
    '\\tan': Math.tan,
    '\\cot': (x) => 1 / Math.tan(x),
    '\\sec': (x) => 1 / Math.cos(x),
    '\\csc': (x) => 1 / Math.sin(x),
    '\\arcsin': Math.asin,
    '\\arccos': Math.acos,
    '\\arctan': Math.atan,
    '\\sinh': Math.sinh,
    '\\cosh': Math.cosh,
    '\\tanh': Math.tanh,
    '\\exp': Math.exp,
    '\\ln': Math.log,
    '\\log': Math.log10,
    '\\sqrt': Math.sqrt,
    '\\abs': Math.abs,
    '\\sign': Math.sign,
    '\\floor': Math.floor,
    '\\ceil': Math.ceil,
};

// Named constants.
const CONST: Record<string, number> = {
    '\\pi': Math.PI,
    '\\tau': Math.PI * 2,
    '\\e': Math.E,
};

function evalNode(node: ASTNode, scope: VarScope): number {
    switch (node.type) {
        case 'number':
            return parseFloat(String(node.value));

        case 'text': {
            const name = String(node.value);
            if (name in scope) return scope[name];
            if (name === 'pi') return Math.PI;
            if (name === 'e') return Math.E;
            throw new Error(`Unknown variable "${name}"`);
        }

        case 'operator': {
            const op = String(node.value);
            if (!node.children || node.children.length < 2) {
                throw new Error(`Operator "${op}" needs two operands`);
            }
            const l = evalNode(node.children[0], scope);
            const r = evalNode(node.children[1], scope);
            switch (op) {
                case '+': return l + r;
                case '-': return l - r;
                case '*': return l * r;
                case '/': return l / r;
            }
            throw new Error(`Unsupported operator "${op}"`);
        }

        case 'power': {
            if (!node.children || node.children.length < 2) {
                throw new Error('Power needs a base and an exponent');
            }
            return Math.pow(
                evalNode(node.children[0], scope),
                evalNode(node.children[1], scope),
            );
        }

        case 'command': {
            const cmd = String(node.value);
            if (cmd === '\\frac') {
                if (!node.children || node.children.length < 2) {
                    throw new Error('\\frac needs a numerator and denominator');
                }
                return evalNode(node.children[0], scope) / evalNode(node.children[1], scope);
            }
            if (cmd in CONST) return CONST[cmd];
            const fn = FN1[cmd];
            if (fn) {
                if (!node.children || node.children.length < 1) {
                    throw new Error(`${cmd} needs an argument, e.g. ${cmd}(t)`);
                }
                return fn(evalNode(node.children[0], scope));
            }
            throw new Error(`Unsupported command "${cmd}"`);
        }

        case 'expression': {
            const kids = node.children ?? [];
            if (kids.length === 1) return evalNode(kids[0], scope);
            if (kids.length > 1) {
                // Best-effort implicit multiplication of adjacent factors.
                return kids.reduce((acc, c) => acc * evalNode(c, scope), 1);
            }
            throw new Error('Empty expression');
        }

        case 'subscript':
            throw new Error('Subscripts are not supported in boundary formulas');

        default:
            throw new Error(`Unsupported expression node "${node.type}"`);
    }
}

/**
 * Parses a LaTeX expression in terms of a single free variable and returns a
 * numeric function of that variable. A leading "lhs =" (e.g. "y = x^2") is
 * stripped — only the right-hand side is evaluated.
 *
 * Reuses the project's LaTeX parser (utils/tex) and evaluates the AST directly
 * in JS, so trig/exp/log/powers are all available (unlike the WAT pipeline).
 */
export function compileLatexFn(latex: string, varName: string): (v: number) => number {
    let ast = parseLatex(latex.trim());
    if (ast.type === 'operator' && ast.value === '=' && ast.children?.length === 2) {
        ast = ast.children[1];
    }
    return (v: number) => evalNode(ast, { [varName]: v });
}

/**
 * Like {@link compileLatexFn} but for two free variables (e.g. surfaces in u, v).
 */
export function compileLatexFn2(
    latex: string,
    varA: string,
    varB: string,
): (a: number, b: number) => number {
    let ast = parseLatex(latex.trim());
    if (ast.type === 'operator' && ast.value === '=' && ast.children?.length === 2) {
        ast = ast.children[1];
    }
    return (a: number, b: number) => evalNode(ast, { [varA]: a, [varB]: b });
}

/** Returns the trimmed left-hand side variable name of "name = …", or null. */
export function lhsVariable(latex: string): string | null {
    const ast = parseLatex(latex.trim());
    if (ast.type === 'operator' && ast.value === '=' && ast.children?.length === 2) {
        const lhs = ast.children[0];
        if (lhs.type === 'text') return String(lhs.value);
    }
    return null;
}
