import dictionaryJson from '../dictionary.json' with { type: 'json' };

const dictionary: Record<string, string> = dictionaryJson;

export type TokenKind =
  | 'identifier'
  | 'string'
  | 'template'
  | 'comment'
  | 'slashRegex'
  | 'other';

export type Token = {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
};

const REGEX_AFTER_TYPESCRIPT_KEYWORDS = new Set([
  'return',
  'throw',
  'else',
  'do',
  'case',
  'in',
  'of',
  'typeof',
  'void',
  'delete',
  'new',
  'await',
  'yield',
  'extends',
  'instanceof',
  'break',
  'continue',
  'debugger',
  'default',
]);

const PUNCTUATORS = [
  '>>>=',
  '===',
  '!==',
  '>>>',
  '**=',
  '&&=',
  '||=',
  '??=',
  '...',
  '<<=',
  '>>=',
  '=>',
  '++',
  '--',
  '**',
  '&&',
  '||',
  '??',
  '?.',
  '==',
  '!=',
  '<=',
  '>=',
  '<<',
  '>>',
  '+=',
  '-=',
  '*=',
  '%=',
  '&=',
  '|=',
  '^=',
  '+',
  '-',
  '*',
  '%',
  '=',
  '!',
  '<',
  '>',
  '&',
  '|',
  '^',
  '~',
  '?',
  ':',
  '.',
  ',',
  ';',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '@',
  '#',
];

function isIdentifierStart(character: string): boolean {
  return /^[\p{ID_Start}$_]$/u.test(character);
}

function isIdentifierContinue(character: string): boolean {
  return /^[\p{ID_Continue}$_\u200C\u200D]$/u.test(character);
}

function isWhitespace(character: string): boolean {
  return (
    character === ' ' ||
    character === '\t' ||
    character === '\n' ||
    character === '\r' ||
    character === '\v' ||
    character === '\f'
  );
}

function isDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

function allowsRegexAfterIdentifier(identifier: string): boolean {
  const typescriptToken = dictionary[identifier] ?? identifier;
  return REGEX_AFTER_TYPESCRIPT_KEYWORDS.has(typescriptToken);
}

function isWhitespaceToken(token: Token): boolean {
  return token.kind === 'other' && /^\s+$/.test(token.value);
}

export function previousSignificantToken(tokens: Token[], beforeIndex: number): Token | undefined {
  let cursor = beforeIndex - 1;
  while (cursor >= 0) {
    const token = tokens[cursor];
    if (token !== undefined && token.kind !== 'comment' && !isWhitespaceToken(token)) {
      return token;
    }
    cursor -= 1;
  }
  return undefined;
}

function previousTokenIsMemberAccess(tokens: Token[], identifierIndex: number): boolean {
  const previous = previousSignificantToken(tokens, identifierIndex);
  return previous !== undefined && (previous.value === '.' || previous.value === '?.');
}

function characterAt(source: string, index: number): string {
  return source[index] ?? '';
}

type LexerState = {
  source: string;
  index: number;
  tokens: Token[];
  expressionAllowed: boolean;
  interpolationBraceDepth: number;
  stopAtInterpolationClose: boolean;
};

function pushToken(state: LexerState, kind: TokenKind, start: number, end: number): Token {
  const token: Token = {
    kind,
    value: state.source.slice(start, end),
    start,
    end,
  };
  state.tokens.push(token);
  return token;
}

function skipLineTerminator(source: string, index: number): number {
  if (source[index] === '\r' && source[index + 1] === '\n') {
    return index + 2;
  }
  return index + 1;
}

function updateExpressionAllowed(state: LexerState, token: Token): void {
  if (token.kind === 'comment') {
    return;
  }
  if (token.kind === 'string' || token.kind === 'slashRegex') {
    state.expressionAllowed = false;
    return;
  }
  if (token.kind === 'template') {
    if (token.value.endsWith('${')) {
      state.expressionAllowed = true;
    } else if (token.value.endsWith('`')) {
      state.expressionAllowed = false;
    }
    return;
  }
  if (token.kind === 'identifier') {
    if (previousTokenIsMemberAccess(state.tokens, state.tokens.length - 1)) {
      state.expressionAllowed = false;
      return;
    }
    const name = token.value.startsWith('#') ? token.value.slice(1) : token.value;
    state.expressionAllowed = allowsRegexAfterIdentifier(name);
    return;
  }

  const punctuator = token.value;
  if (punctuator === ')' || punctuator === ']') {
    state.expressionAllowed = false;
    return;
  }
  if (punctuator === '++' || punctuator === '--') {
    return;
  }
  state.expressionAllowed = true;
}

function lexWhitespace(state: LexerState): void {
  const start = state.index;
  while (state.index < state.source.length && isWhitespace(characterAt(state.source, state.index))) {
    state.index += 1;
  }
  pushToken(state, 'other', start, state.index);
}

function lexShebang(state: LexerState): void {
  const start = state.index;
  state.index += 2;
  while (state.index < state.source.length) {
    const character = characterAt(state.source, state.index);
    if (character === '\n' || character === '\r') {
      break;
    }
    state.index += 1;
  }
  pushToken(state, 'comment', start, state.index);
}

function lexLineComment(state: LexerState): void {
  const start = state.index;
  state.index += 2;
  while (state.index < state.source.length) {
    const character = characterAt(state.source, state.index);
    if (character === '\n' || character === '\r') {
      break;
    }
    state.index += 1;
  }
  pushToken(state, 'comment', start, state.index);
}

function lexBlockComment(state: LexerState): void {
  const start = state.index;
  state.index += 2;
  while (state.index < state.source.length) {
    if (characterAt(state.source, state.index) === '*' && characterAt(state.source, state.index + 1) === '/') {
      state.index += 2;
      break;
    }
    state.index += 1;
  }
  pushToken(state, 'comment', start, state.index);
}

function lexString(state: LexerState): void {
  const start = state.index;
  const quote = characterAt(state.source, state.index);
  state.index += 1;
  while (state.index < state.source.length) {
    const character = characterAt(state.source, state.index);
    if (character === '\\') {
      state.index += 1;
      if (state.index < state.source.length) {
        state.index = skipLineTerminator(state.source, state.index);
      }
      continue;
    }
    if (character === quote) {
      state.index += 1;
      break;
    }
    if (character === '\n' || character === '\r') {
      break;
    }
    state.index += 1;
  }
  const token = pushToken(state, 'string', start, state.index);
  updateExpressionAllowed(state, token);
}

function lexIdentifier(state: LexerState): void {
  const start = state.index;
  if (characterAt(state.source, state.index) === '#') {
    state.index += 1;
  }
  state.index += 1;
  while (state.index < state.source.length && isIdentifierContinue(characterAt(state.source, state.index))) {
    state.index += 1;
  }
  const token = pushToken(state, 'identifier', start, state.index);
  updateExpressionAllowed(state, token);
}

function lexNumber(state: LexerState): void {
  const start = state.index;
  if (characterAt(state.source, state.index) === '0') {
    const next = characterAt(state.source, state.index + 1).toLowerCase();
    if (next === 'x' || next === 'b' || next === 'o') {
      state.index += 2;
      while (state.index < state.source.length) {
        const character = characterAt(state.source, state.index);
        if (character === '_' || /[0-9a-fA-F]/.test(character)) {
          state.index += 1;
          continue;
        }
        break;
      }
      if (characterAt(state.source, state.index) === 'n') {
        state.index += 1;
      }
      const token = pushToken(state, 'other', start, state.index);
      updateExpressionAllowed(state, token);
      state.expressionAllowed = false;
      return;
    }
  }

  while (state.index < state.source.length && (isDigit(characterAt(state.source, state.index)) || characterAt(state.source, state.index) === '_')) {
    state.index += 1;
  }
  if (characterAt(state.source, state.index) === '.' && isDigit(characterAt(state.source, state.index + 1))) {
    state.index += 1;
    while (state.index < state.source.length && (isDigit(characterAt(state.source, state.index)) || characterAt(state.source, state.index) === '_')) {
      state.index += 1;
    }
  }
  const exponent = characterAt(state.source, state.index).toLowerCase();
  if (exponent === 'e') {
    state.index += 1;
    if (characterAt(state.source, state.index) === '+' || characterAt(state.source, state.index) === '-') {
      state.index += 1;
    }
    while (state.index < state.source.length && (isDigit(characterAt(state.source, state.index)) || characterAt(state.source, state.index) === '_')) {
      state.index += 1;
    }
  }
  if (characterAt(state.source, state.index) === 'n') {
    state.index += 1;
  }
  const token = pushToken(state, 'other', start, state.index);
  updateExpressionAllowed(state, token);
  state.expressionAllowed = false;
}

function lexRegex(state: LexerState): void {
  const start = state.index;
  state.index += 1;
  let inCharacterClass = false;
  while (state.index < state.source.length) {
    const character = characterAt(state.source, state.index);
    if (character === '\\') {
      state.index += 1;
      if (state.index < state.source.length) {
        state.index += 1;
      }
      continue;
    }
    if (character === '[' && !inCharacterClass) {
      inCharacterClass = true;
      state.index += 1;
      continue;
    }
    if (character === ']' && inCharacterClass) {
      inCharacterClass = false;
      state.index += 1;
      continue;
    }
    if (character === '/' && !inCharacterClass) {
      state.index += 1;
      while (state.index < state.source.length && /[A-Za-z]/.test(characterAt(state.source, state.index))) {
        state.index += 1;
      }
      break;
    }
    if (character === '\n' || character === '\r') {
      break;
    }
    state.index += 1;
  }
  const token = pushToken(state, 'slashRegex', start, state.index);
  updateExpressionAllowed(state, token);
}

function lexPunctuator(state: LexerState): boolean {
  for (const punctuator of PUNCTUATORS) {
    if (state.source.startsWith(punctuator, state.index)) {
      if (punctuator === '{' && state.stopAtInterpolationClose) {
        state.interpolationBraceDepth += 1;
      }
      if (punctuator === '}' && state.stopAtInterpolationClose) {
        if (state.interpolationBraceDepth === 0) {
          return false;
        }
        state.interpolationBraceDepth -= 1;
      }
      const start = state.index;
      state.index += punctuator.length;
      const token = pushToken(state, 'other', start, state.index);
      updateExpressionAllowed(state, token);
      return true;
    }
  }
  return false;
}

function lexTemplate(state: LexerState): void {
  const source = state.source;
  let chunkStart = state.index;
  state.index += 1;

  while (state.index < source.length) {
    const character = characterAt(source, state.index);
    if (character === '\\') {
      state.index += 1;
      if (state.index < source.length) {
        state.index = skipLineTerminator(source, state.index);
      }
      continue;
    }
    if (character === '`') {
      state.index += 1;
      const token = pushToken(state, 'template', chunkStart, state.index);
      updateExpressionAllowed(state, token);
      return;
    }
    if (character === '$' && characterAt(source, state.index + 1) === '{') {
      state.index += 2;
      const head = pushToken(state, 'template', chunkStart, state.index);
      updateExpressionAllowed(state, head);
      const inner = lexRange(source, state.index, true);
      for (const token of inner.tokens) {
        state.tokens.push(token);
      }
      state.index = inner.index;
      state.expressionAllowed = inner.expressionAllowed;
      chunkStart = state.index;
      continue;
    }
    state.index += 1;
  }

  const token = pushToken(state, 'template', chunkStart, state.index);
  updateExpressionAllowed(state, token);
}

function lexOne(state: LexerState): boolean {
  if (state.index >= state.source.length) {
    return false;
  }

  if (
    state.stopAtInterpolationClose &&
    characterAt(state.source, state.index) === '}' &&
    state.interpolationBraceDepth === 0
  ) {
    return false;
  }

  const character = characterAt(state.source, state.index);

  if (isWhitespace(character)) {
    lexWhitespace(state);
    return true;
  }

  if (state.index === 0 && character === '#' && characterAt(state.source, 1) === '!') {
    lexShebang(state);
    return true;
  }

  if (character === '/' && characterAt(state.source, state.index + 1) === '/') {
    lexLineComment(state);
    return true;
  }

  if (character === '/' && characterAt(state.source, state.index + 1) === '*') {
    lexBlockComment(state);
    return true;
  }

  if (character === '/' && state.expressionAllowed) {
    lexRegex(state);
    return true;
  }

  if (character === '/' && characterAt(state.source, state.index + 1) === '=') {
    const start = state.index;
    state.index += 2;
    const token = pushToken(state, 'other', start, state.index);
    updateExpressionAllowed(state, token);
    return true;
  }

  if (character === '/') {
    const start = state.index;
    state.index += 1;
    const token = pushToken(state, 'other', start, state.index);
    updateExpressionAllowed(state, token);
    return true;
  }

  if (character === "'" || character === '"') {
    lexString(state);
    return true;
  }

  if (character === '`') {
    lexTemplate(state);
    return true;
  }

  if (character === '#' && isIdentifierStart(characterAt(state.source, state.index + 1))) {
    lexIdentifier(state);
    return true;
  }

  if (isIdentifierStart(character)) {
    lexIdentifier(state);
    return true;
  }

  if (isDigit(character) || (character === '.' && isDigit(characterAt(state.source, state.index + 1)))) {
    lexNumber(state);
    return true;
  }

  if (lexPunctuator(state)) {
    return true;
  }

  const start = state.index;
  state.index += 1;
  const token = pushToken(state, 'other', start, state.index);
  updateExpressionAllowed(state, token);
  return true;
}

function lexRange(
  source: string,
  from: number,
  stopAtInterpolationClose: boolean,
): { tokens: Token[]; index: number; expressionAllowed: boolean } {
  const state: LexerState = {
    source,
    index: from,
    tokens: [],
    expressionAllowed: true,
    interpolationBraceDepth: 0,
    stopAtInterpolationClose,
  };

  while (lexOne(state)) {
    // walk
  }

  return {
    tokens: state.tokens,
    index: state.index,
    expressionAllowed: state.expressionAllowed,
  };
}

export function lex(source: string): Token[] {
  return lexRange(source, 0, false).tokens;
}
