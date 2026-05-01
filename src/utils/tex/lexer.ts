import moo from 'moo';

export const lexer = moo.compile({
    whitespace: { match: /\s+/, lineBreaks: true },
    lbrace: /\{/,
    rbrace: /\}/,
    lparen: /\(/,
    rparen: /\)/,
    command: /\\[a-zA-Z]+/,
    number: /\d+(?:\.\d+)?/,
    comma: /,/,
    underscore: /_/,
    operator: /[+\-*/=]/,
    text: /[^\\{}+\-*/=()\s\d_,][^\\{}+\-*/=()\s_,]*/,
});

export type TokenType =
    | 'whitespace' | 'lbrace' | 'rbrace' | 'lparen' | 'rparen'
    | 'command' | 'number' | 'comma' | 'underscore' | 'operator' | 'text';
