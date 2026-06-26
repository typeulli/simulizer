import moo from 'moo';
import { lexer } from './lexer';

export interface ASTNode {
    type: string;
    value?: string | number;
    children?: ASTNode[];
}

const PASS_THROUGH_COMMANDS = new Set([
    '\\matthub',
    '\\mathrm',
    '\\mathbf',
    '\\mathit',
    '\\mathtt',
]);

// Commands that behave as functions applied to a single argument, e.g. \sin(t).
// When no brace group follows, the next "(...)", "{...}" or single term is taken
// as the argument. Brace-only commands like \frac are intentionally excluded.
const FUNCTION_COMMANDS = new Set([
    '\\sin', '\\cos', '\\tan', '\\cot', '\\sec', '\\csc',
    '\\arcsin', '\\arccos', '\\arctan',
    '\\sinh', '\\cosh', '\\tanh',
    '\\exp', '\\ln', '\\log',
    '\\sqrt', '\\abs', '\\sign', '\\floor', '\\ceil',
]);

class LatexParser {
    private tokens: moo.Token[] = [];
    private pos = 0;

    parse(input: string): ASTNode {
        this.tokens = Array.from(lexer.reset(input));
        this.pos = 0;
        return this.parseExpression();
    }

    private current(): moo.Token | undefined {
        return this.tokens[this.pos];
    }

    private advance(): moo.Token | undefined {
        return this.tokens[this.pos++];
    }

    private skipWhitespace(): void {
        while (this.current()?.type === 'whitespace') this.advance();
    }

    private parseExpression(): ASTNode {
        const children: ASTNode[] = [];

        while (this.current()) {
            const token = this.current()!;

            if (token.type === 'whitespace') {
                this.advance();
                continue;
            }

            if (token.type === 'rbrace' || token.type === 'rparen' || token.type === 'comma') {
                break;
            }

            const node = this.parseTerm();
            if (node) children.push(node);
        }

        if (children.length === 1) return children[0];
        return { type: 'expression', children };
    }

    private parseIndexList(): ASTNode[] {
        const indices: ASTNode[] = [];
        this.skipWhitespace();

        if (!this.current()) return indices;

        indices.push(this.parseExpression());

        while (this.current()?.type === 'comma') {
            this.advance();
            indices.push(this.parseExpression());
        }

        return indices;
    }

    private parseTerm(): ASTNode | null {
        return this.maybePower(this.parsePrimary());
    }

    // After a primary term, fold a trailing "^" superscript into a power node.
    private maybePower(base: ASTNode | null): ASTNode | null {
        if (!base) return base;
        this.skipWhitespace();
        if (this.current()?.type === 'caret') {
            this.advance();
            const exponent = this.parseExponent();
            return { type: 'power', children: [base, exponent ?? { type: 'number', value: '1' }] };
        }
        return base;
    }

    // Exponent after "^": a braced group "{...}" or a single primary term.
    private parseExponent(): ASTNode | null {
        this.skipWhitespace();
        if (this.current()?.type === 'lbrace') {
            this.advance();
            const inner = this.parseExpression();
            if (this.current()?.type === 'rbrace') this.advance();
            return inner;
        }
        return this.maybePower(this.parsePrimary());
    }

    private parsePrimary(): ASTNode | null {
        const token = this.current();
        if (!token) return null;

        if (token.type === 'command') return this.parseCommand();

        if (token.type === 'operator') {
            return { type: 'operator', value: this.advance()!.value };
        }

        if (token.type === 'number') {
            return { type: 'number', value: this.advance()!.value };
        }

        if (token.type === 'text') {
            const varName = this.advance()!.value;
            this.skipWhitespace();

            if (this.current()?.type === 'underscore') {
                this.advance();
                this.skipWhitespace();
                if (this.current()?.type === 'lbrace') {
                    this.advance();
                    const indices = this.parseIndexList();
                    if (this.current()?.type === 'rbrace') this.advance();
                    return { type: 'subscript', value: varName, children: indices };
                }
                return { type: 'text', value: varName };
            }

            if (this.current()?.type === 'lparen') {
                this.advance();
                const indices = this.parseIndexList();
                if (this.current()?.type === 'rparen') this.advance();
                return { type: 'subscript', value: varName, children: indices };
            }

            return { type: 'text', value: varName };
        }

        if (token.type === 'lparen') {
            this.advance();
            const inner = this.parseExpression();
            if (this.current()?.type === 'rparen') this.advance();
            return inner;
        }

        this.advance();
        return null;
    }

    private parseCommand(): ASTNode {
        const cmdName = this.advance()!.value;
        const children: ASTNode[] = [];

        while (this.current()?.type === 'lbrace') {
            this.advance();
            const content = this.parseExpression();
            if (this.current()?.type === 'rbrace') this.advance();
            children.push(content);
        }

        // Function-style argument capture: \sin(t), \cos t, \sqrt(x) …
        if (FUNCTION_COMMANDS.has(cmdName) && children.length === 0) {
            this.skipWhitespace();
            if (this.current()?.type === 'lparen') {
                this.advance();
                const arg = this.parseExpression();
                if (this.current()?.type === 'rparen') this.advance();
                children.push(arg);
            } else if (this.current()?.type === 'lbrace') {
                this.advance();
                const arg = this.parseExpression();
                if (this.current()?.type === 'rbrace') this.advance();
                children.push(arg);
            } else {
                const arg = this.parseTerm();
                if (arg) children.push(arg);
            }
        }

        if (cmdName === '\\times') return { type: 'operator', value: '*' };

        if (PASS_THROUGH_COMMANDS.has(cmdName)) {
            if (children.length === 1) return children[0];
            if (children.length > 1) return { type: 'expression', children };
            return { type: 'expression', children: [] };
        }

        return { type: 'command', value: cmdName, children: children.length > 0 ? children : undefined };
    }
}

// Operator precedence climbing
const OP_PREC: Record<string, number> = { '=': 1, '+': 2, '-': 2, '*': 3, '/': 3 };
const RIGHT_ASSOC = new Set(['=']);

function flattenOperators(node: ASTNode): ASTNode {
    if (!node.children || node.children.length < 2) return node;

    const children = node.children;
    let pos = 0;

    function climb(minPrec: number): ASTNode {
        if (pos >= children.length) return { type: 'number', value: '0' };
        let lhs = children[pos++];

        // Unary minus: if lhs is itself an operator node, treat as negation
        if (lhs && lhs.type === 'operator' && lhs.value === '-' && !lhs.children && pos < children.length) {
            const operand = climb(4); // higher than any binary prec
            lhs = { type: 'operator', value: '-', children: [{ type: 'number', value: '0' }, operand] };
        }

        while (pos < children.length) {
            const opNode = children[pos];
            if (opNode.type !== 'operator') break;
            const opStr = String(opNode.value);
            const prec = OP_PREC[opStr] ?? 2;
            if (prec < minPrec) break;

            pos++;
            const rhs = climb(RIGHT_ASSOC.has(opStr) ? prec : prec + 1);
            lhs = { type: 'operator', value: opStr, children: [lhs, rhs] };
        }

        return lhs;
    }

    return climb(0);
}

function postProcess(node: ASTNode): ASTNode {
    if (node.children) node.children = node.children.map(postProcess);
    if (node.type === 'expression' && node.children) return flattenOperators(node);
    return node;
}

export function parseLatex(input: string): ASTNode {
    return postProcess(new LatexParser().parse(input));
}

export function astToString(node: ASTNode, indent = 0): string {
    const prefix = '    '.repeat(indent);
    let result = `${prefix}${node.type}`;
    if (node.value) result += ` (${node.value})`;
    result += '\n';
    if (node.children) {
        for (const child of node.children) result += astToString(child, indent + 1);
    }
    return result;
}
