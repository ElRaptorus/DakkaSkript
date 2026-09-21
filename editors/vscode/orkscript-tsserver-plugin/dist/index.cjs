var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// orkscript/src/tsserverPluginInit.ts
var tsserverPluginInit_exports = {};
__export(tsserverPluginInit_exports, {
  default: () => tsserverPluginInit_default
});
module.exports = __toCommonJS(tsserverPluginInit_exports);
var typescriptRuntime = __toESM(require("typescript"), 1);

// orkscript/src/languageServicePlugin.ts
var import_node_path = require("node:path");

// orkscript/dictionary.json
var dictionary_default = {
  nob: "function",
  mek: "class",
  loot: "return",
  shuv: "new",
  boss: "this",
  bigga: "extends",
  chomps: "implements",
  grot: "constructor",
  sniky: "private",
  krumpy: "public",
  flashy: "readonly",
  stikky: "static",
  ifz: "if",
  uvver: "else",
  sluggin: "for",
  stompin: "while",
  rukk: "try",
  katch: "catch",
  deffblast: "throw",
  weird: "async",
  waitz: "await",
  nick: "import",
  bark: "export",
  frum: "from",
  stash: "const",
  bit: "let",
  runt: "var",
  wot: "typeof",
  yeah: "true",
  nah: "false",
  nuffin: "null",
  shape: "type",
  face: "interface",
  kount: "number",
  scrawl: "string",
  yeahnah: "boolean",
  Wazza: "Promise",
  Urty: "Error",
  Mob: "Array",
  Rokk: "Object",
  Teef: "Record"
};

// orkscript/src/lex.ts
var dictionary = dictionary_default;
var REGEX_AFTER_TYPESCRIPT_KEYWORDS = /* @__PURE__ */ new Set([
  "return",
  "throw",
  "else",
  "do",
  "case",
  "in",
  "of",
  "typeof",
  "void",
  "delete",
  "new",
  "await",
  "yield",
  "extends",
  "instanceof",
  "break",
  "continue",
  "debugger",
  "default"
]);
var PUNCTUATORS = [
  ">>>=",
  "===",
  "!==",
  ">>>",
  "**=",
  "&&=",
  "||=",
  "??=",
  "...",
  "<<=",
  ">>=",
  "=>",
  "++",
  "--",
  "**",
  "&&",
  "||",
  "??",
  "?.",
  "==",
  "!=",
  "<=",
  ">=",
  "<<",
  ">>",
  "+=",
  "-=",
  "*=",
  "%=",
  "&=",
  "|=",
  "^=",
  "+",
  "-",
  "*",
  "%",
  "=",
  "!",
  "<",
  ">",
  "&",
  "|",
  "^",
  "~",
  "?",
  ":",
  ".",
  ",",
  ";",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "@",
  "#"
];
function isIdentifierStart(character) {
  return /^[\p{ID_Start}$_]$/u.test(character);
}
function isIdentifierContinue(character) {
  return /^[\p{ID_Continue}$_\u200C\u200D]$/u.test(character);
}
function isWhitespace(character) {
  return character === " " || character === "	" || character === "\n" || character === "\r" || character === "\v" || character === "\f";
}
function isDigit(character) {
  return character >= "0" && character <= "9";
}
function allowsRegexAfterIdentifier(identifier) {
  const typescriptToken = dictionary[identifier] ?? identifier;
  return REGEX_AFTER_TYPESCRIPT_KEYWORDS.has(typescriptToken);
}
function isWhitespaceToken(token) {
  return token.kind === "other" && /^\s+$/.test(token.value);
}
function previousSignificantToken(tokens, beforeIndex) {
  let cursor = beforeIndex - 1;
  while (cursor >= 0) {
    const token = tokens[cursor];
    if (token !== void 0 && token.kind !== "comment" && !isWhitespaceToken(token)) {
      return token;
    }
    cursor -= 1;
  }
  return void 0;
}
function previousTokenIsMemberAccess(tokens, identifierIndex) {
  const previous = previousSignificantToken(tokens, identifierIndex);
  return previous !== void 0 && (previous.value === "." || previous.value === "?.");
}
function characterAt(source, index) {
  return source[index] ?? "";
}
function pushToken(state, kind, start, end) {
  const token = {
    kind,
    value: state.source.slice(start, end),
    start,
    end
  };
  state.tokens.push(token);
  return token;
}
function skipLineTerminator(source, index) {
  if (source[index] === "\r" && source[index + 1] === "\n") {
    return index + 2;
  }
  return index + 1;
}
function updateExpressionAllowed(state, token) {
  if (token.kind === "comment") {
    return;
  }
  if (token.kind === "string" || token.kind === "slashRegex") {
    state.expressionAllowed = false;
    return;
  }
  if (token.kind === "template") {
    if (token.value.endsWith("${")) {
      state.expressionAllowed = true;
    } else if (token.value.endsWith("`")) {
      state.expressionAllowed = false;
    }
    return;
  }
  if (token.kind === "identifier") {
    if (previousTokenIsMemberAccess(state.tokens, state.tokens.length - 1)) {
      state.expressionAllowed = false;
      return;
    }
    const name = token.value.startsWith("#") ? token.value.slice(1) : token.value;
    state.expressionAllowed = allowsRegexAfterIdentifier(name);
    return;
  }
  const punctuator = token.value;
  if (punctuator === ")" || punctuator === "]") {
    state.expressionAllowed = false;
    return;
  }
  if (punctuator === "++" || punctuator === "--") {
    return;
  }
  state.expressionAllowed = true;
}
function lexWhitespace(state) {
  const start = state.index;
  while (state.index < state.source.length && isWhitespace(characterAt(state.source, state.index))) {
    state.index += 1;
  }
  pushToken(state, "other", start, state.index);
}
function lexShebang(state) {
  const start = state.index;
  state.index += 2;
  while (state.index < state.source.length) {
    const character = characterAt(state.source, state.index);
    if (character === "\n" || character === "\r") {
      break;
    }
    state.index += 1;
  }
  pushToken(state, "comment", start, state.index);
}
function lexLineComment(state) {
  const start = state.index;
  state.index += 2;
  while (state.index < state.source.length) {
    const character = characterAt(state.source, state.index);
    if (character === "\n" || character === "\r") {
      break;
    }
    state.index += 1;
  }
  pushToken(state, "comment", start, state.index);
}
function lexBlockComment(state) {
  const start = state.index;
  state.index += 2;
  while (state.index < state.source.length) {
    if (characterAt(state.source, state.index) === "*" && characterAt(state.source, state.index + 1) === "/") {
      state.index += 2;
      break;
    }
    state.index += 1;
  }
  pushToken(state, "comment", start, state.index);
}
function lexString(state) {
  const start = state.index;
  const quote = characterAt(state.source, state.index);
  state.index += 1;
  while (state.index < state.source.length) {
    const character = characterAt(state.source, state.index);
    if (character === "\\") {
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
    if (character === "\n" || character === "\r") {
      break;
    }
    state.index += 1;
  }
  const token = pushToken(state, "string", start, state.index);
  updateExpressionAllowed(state, token);
}
function lexIdentifier(state) {
  const start = state.index;
  if (characterAt(state.source, state.index) === "#") {
    state.index += 1;
  }
  state.index += 1;
  while (state.index < state.source.length && isIdentifierContinue(characterAt(state.source, state.index))) {
    state.index += 1;
  }
  const token = pushToken(state, "identifier", start, state.index);
  updateExpressionAllowed(state, token);
}
function lexNumber(state) {
  const start = state.index;
  if (characterAt(state.source, state.index) === "0") {
    const next = characterAt(state.source, state.index + 1).toLowerCase();
    if (next === "x" || next === "b" || next === "o") {
      state.index += 2;
      while (state.index < state.source.length) {
        const character = characterAt(state.source, state.index);
        if (character === "_" || /[0-9a-fA-F]/.test(character)) {
          state.index += 1;
          continue;
        }
        break;
      }
      if (characterAt(state.source, state.index) === "n") {
        state.index += 1;
      }
      const token2 = pushToken(state, "other", start, state.index);
      updateExpressionAllowed(state, token2);
      state.expressionAllowed = false;
      return;
    }
  }
  while (state.index < state.source.length && (isDigit(characterAt(state.source, state.index)) || characterAt(state.source, state.index) === "_")) {
    state.index += 1;
  }
  if (characterAt(state.source, state.index) === "." && isDigit(characterAt(state.source, state.index + 1))) {
    state.index += 1;
    while (state.index < state.source.length && (isDigit(characterAt(state.source, state.index)) || characterAt(state.source, state.index) === "_")) {
      state.index += 1;
    }
  }
  const exponent = characterAt(state.source, state.index).toLowerCase();
  if (exponent === "e") {
    state.index += 1;
    if (characterAt(state.source, state.index) === "+" || characterAt(state.source, state.index) === "-") {
      state.index += 1;
    }
    while (state.index < state.source.length && (isDigit(characterAt(state.source, state.index)) || characterAt(state.source, state.index) === "_")) {
      state.index += 1;
    }
  }
  if (characterAt(state.source, state.index) === "n") {
    state.index += 1;
  }
  const token = pushToken(state, "other", start, state.index);
  updateExpressionAllowed(state, token);
  state.expressionAllowed = false;
}
function lexRegex(state) {
  const start = state.index;
  state.index += 1;
  let inCharacterClass = false;
  while (state.index < state.source.length) {
    const character = characterAt(state.source, state.index);
    if (character === "\\") {
      state.index += 1;
      if (state.index < state.source.length) {
        state.index += 1;
      }
      continue;
    }
    if (character === "[" && !inCharacterClass) {
      inCharacterClass = true;
      state.index += 1;
      continue;
    }
    if (character === "]" && inCharacterClass) {
      inCharacterClass = false;
      state.index += 1;
      continue;
    }
    if (character === "/" && !inCharacterClass) {
      state.index += 1;
      while (state.index < state.source.length && /[A-Za-z]/.test(characterAt(state.source, state.index))) {
        state.index += 1;
      }
      break;
    }
    if (character === "\n" || character === "\r") {
      break;
    }
    state.index += 1;
  }
  const token = pushToken(state, "slashRegex", start, state.index);
  updateExpressionAllowed(state, token);
}
function lexPunctuator(state) {
  for (const punctuator of PUNCTUATORS) {
    if (state.source.startsWith(punctuator, state.index)) {
      if (punctuator === "{" && state.stopAtInterpolationClose) {
        state.interpolationBraceDepth += 1;
      }
      if (punctuator === "}" && state.stopAtInterpolationClose) {
        if (state.interpolationBraceDepth === 0) {
          return false;
        }
        state.interpolationBraceDepth -= 1;
      }
      const start = state.index;
      state.index += punctuator.length;
      const token = pushToken(state, "other", start, state.index);
      updateExpressionAllowed(state, token);
      return true;
    }
  }
  return false;
}
function lexTemplate(state) {
  const source = state.source;
  let chunkStart = state.index;
  state.index += 1;
  while (state.index < source.length) {
    const character = characterAt(source, state.index);
    if (character === "\\") {
      state.index += 1;
      if (state.index < source.length) {
        state.index = skipLineTerminator(source, state.index);
      }
      continue;
    }
    if (character === "`") {
      state.index += 1;
      const token2 = pushToken(state, "template", chunkStart, state.index);
      updateExpressionAllowed(state, token2);
      return;
    }
    if (character === "$" && characterAt(source, state.index + 1) === "{") {
      state.index += 2;
      const head = pushToken(state, "template", chunkStart, state.index);
      updateExpressionAllowed(state, head);
      const inner = lexRange(source, state.index, true);
      for (const token2 of inner.tokens) {
        state.tokens.push(token2);
      }
      state.index = inner.index;
      state.expressionAllowed = inner.expressionAllowed;
      chunkStart = state.index;
      continue;
    }
    state.index += 1;
  }
  const token = pushToken(state, "template", chunkStart, state.index);
  updateExpressionAllowed(state, token);
}
function lexOne(state) {
  if (state.index >= state.source.length) {
    return false;
  }
  if (state.stopAtInterpolationClose && characterAt(state.source, state.index) === "}" && state.interpolationBraceDepth === 0) {
    return false;
  }
  const character = characterAt(state.source, state.index);
  if (isWhitespace(character)) {
    lexWhitespace(state);
    return true;
  }
  if (state.index === 0 && character === "#" && characterAt(state.source, 1) === "!") {
    lexShebang(state);
    return true;
  }
  if (character === "/" && characterAt(state.source, state.index + 1) === "/") {
    lexLineComment(state);
    return true;
  }
  if (character === "/" && characterAt(state.source, state.index + 1) === "*") {
    lexBlockComment(state);
    return true;
  }
  if (character === "/" && state.expressionAllowed) {
    lexRegex(state);
    return true;
  }
  if (character === "/" && characterAt(state.source, state.index + 1) === "=") {
    const start2 = state.index;
    state.index += 2;
    const token2 = pushToken(state, "other", start2, state.index);
    updateExpressionAllowed(state, token2);
    return true;
  }
  if (character === "/") {
    const start2 = state.index;
    state.index += 1;
    const token2 = pushToken(state, "other", start2, state.index);
    updateExpressionAllowed(state, token2);
    return true;
  }
  if (character === "'" || character === '"') {
    lexString(state);
    return true;
  }
  if (character === "`") {
    lexTemplate(state);
    return true;
  }
  if (character === "#" && isIdentifierStart(characterAt(state.source, state.index + 1))) {
    lexIdentifier(state);
    return true;
  }
  if (isIdentifierStart(character)) {
    lexIdentifier(state);
    return true;
  }
  if (isDigit(character) || character === "." && isDigit(characterAt(state.source, state.index + 1))) {
    lexNumber(state);
    return true;
  }
  if (lexPunctuator(state)) {
    return true;
  }
  const start = state.index;
  state.index += 1;
  const token = pushToken(state, "other", start, state.index);
  updateExpressionAllowed(state, token);
  return true;
}
function lexRange(source, from, stopAtInterpolationClose) {
  const state = {
    source,
    index: from,
    tokens: [],
    expressionAllowed: true,
    interpolationBraceDepth: 0,
    stopAtInterpolationClose
  };
  while (lexOne(state)) {
  }
  return {
    tokens: state.tokens,
    index: state.index,
    expressionAllowed: state.expressionAllowed
  };
}
function lex(source) {
  return lexRange(source, 0, false).tokens;
}

// orkscript/src/transliterate.ts
var dictionary2 = dictionary_default;
function shouldRewrite(tokens, index, table) {
  const token = tokens[index];
  if (token === void 0 || token.kind !== "identifier") {
    return false;
  }
  if (token.value.startsWith("#")) {
    return false;
  }
  if (!Object.hasOwn(table, token.value)) {
    return false;
  }
  const previous = previousSignificantToken(tokens, index);
  if (previous !== void 0 && (previous.value === "." || previous.value === "?.")) {
    return false;
  }
  return true;
}
function advancePosition(text, line, column) {
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\r") {
      line += 1;
      column = 0;
      if (text[index + 1] === "\n") {
        index += 1;
      }
    } else if (character === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { line, column };
}
function offsetToPosition(source, offset) {
  return advancePosition(source.slice(0, offset), 0, 0);
}
function lineLengths(text) {
  return text.split(/\r\n|\n|\r/).map((line) => line.length);
}
function cumulativeGeneratedShift(map, line, beforeGeneratedColumn) {
  let delta = 0;
  for (const mapping of map.mappings) {
    if (mapping.generatedLine !== line) {
      continue;
    }
    if (mapping.generatedColumn + mapping.generatedLength <= beforeGeneratedColumn) {
      delta += mapping.generatedLength - mapping.originalLength;
    }
  }
  return delta;
}
function cumulativeOriginalShift(map, line, beforeOriginalColumn) {
  let delta = 0;
  for (const mapping of map.mappings) {
    if (mapping.originalLine !== line) {
      continue;
    }
    if (mapping.originalColumn + mapping.originalLength <= beforeOriginalColumn) {
      delta += mapping.generatedLength - mapping.originalLength;
    }
  }
  return delta;
}
function originalPositionFor(map, generatedLine, generatedColumn) {
  for (const mapping of map.mappings) {
    if (mapping.generatedLine !== generatedLine) {
      continue;
    }
    const start = mapping.generatedColumn;
    const end = start + mapping.generatedLength;
    if (generatedColumn >= start && generatedColumn < end) {
      const offset = generatedColumn - start;
      const clipped = Math.min(offset, Math.max(mapping.originalLength - 1, 0));
      return {
        line: mapping.originalLine,
        column: mapping.originalColumn + clipped
      };
    }
  }
  const shift = cumulativeGeneratedShift(map, generatedLine, generatedColumn);
  let column = generatedColumn - shift;
  const lineLength = map.originalLineLengths[generatedLine];
  if (lineLength !== void 0) {
    column = Math.min(column, lineLength);
  }
  column = Math.max(column, 0);
  return { line: generatedLine, column };
}
function generatedPositionFor(map, originalLine, originalColumn) {
  for (const mapping of map.mappings) {
    if (mapping.originalLine !== originalLine) {
      continue;
    }
    const start = mapping.originalColumn;
    const end = start + mapping.originalLength;
    if (originalColumn >= start && originalColumn < end) {
      const offset = originalColumn - start;
      const clipped = Math.min(offset, Math.max(mapping.generatedLength - 1, 0));
      return {
        line: mapping.generatedLine,
        column: mapping.generatedColumn + clipped
      };
    }
  }
  const shift = cumulativeOriginalShift(map, originalLine, originalColumn);
  let column = originalColumn + shift;
  const lineLength = map.generatedLineLengths[originalLine];
  if (lineLength !== void 0) {
    column = Math.min(column, lineLength);
  }
  column = Math.max(column, 0);
  return { line: originalLine, column };
}
function originalRangeFor(map, generatedLine, generatedStartColumn, generatedLength) {
  const start = originalPositionFor(map, generatedLine, generatedStartColumn);
  if (generatedLength <= 0) {
    return { line: start.line, column: start.column, length: 0 };
  }
  const end = originalPositionFor(map, generatedLine, generatedStartColumn + generatedLength - 1);
  return {
    line: start.line,
    column: start.column,
    length: end.column - start.column + 1
  };
}
function transliterate(source) {
  const tokens = lex(source);
  let typescript = "";
  const mappings = [];
  let generatedLine = 0;
  let generatedColumn = 0;
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    if (token === void 0) {
      continue;
    }
    if (shouldRewrite(tokens, tokenIndex, dictionary2)) {
      const replacement = dictionary2[token.value];
      const original = offsetToPosition(source, token.start);
      mappings.push({
        generatedLine,
        generatedColumn,
        originalLine: original.line,
        originalColumn: original.column,
        originalLength: token.value.length,
        generatedLength: replacement.length
      });
      typescript += replacement;
      generatedColumn += replacement.length;
    } else {
      typescript += token.value;
      const advanced = advancePosition(token.value, generatedLine, generatedColumn);
      generatedLine = advanced.line;
      generatedColumn = advanced.column;
    }
  }
  return {
    typescript,
    map: {
      mappings,
      originalLineLengths: lineLengths(source),
      generatedLineLengths: lineLengths(typescript)
    }
  };
}

// orkscript/src/reversePaint.ts
var dictionary3 = dictionary_default;
function buildReverseDictionary(table) {
  const reversed = {};
  for (const [orkWord, englishWord] of Object.entries(table)) {
    if (Object.hasOwn(reversed, englishWord)) {
      throw new Error(
        `Dictionary values must be unique: "${englishWord}" maps back to both "${reversed[englishWord]}" and "${orkWord}"`
      );
    }
    reversed[englishWord] = orkWord;
  }
  return reversed;
}
var reverseDictionary = buildReverseDictionary(dictionary3);
function reverseTransliterate(source) {
  const tokens = lex(source);
  let output = "";
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    if (token === void 0) {
      continue;
    }
    if (shouldRewrite(tokens, tokenIndex, reverseDictionary)) {
      output += reverseDictionary[token.value];
    } else {
      output += token.value;
    }
  }
  return output;
}
function reversePaint(source) {
  return reverseTransliterate(source);
}

// orkscript/src/languageServicePlugin.ts
var dictionary4 = dictionary_default;
var dictionaryTypeKeys = /* @__PURE__ */ new Set(["Wazza", "Urty", "Mob", "Rokk", "Teef"]);
function isOrkscriptFileName(fileName) {
  return fileName.endsWith(".ork");
}
function advanceLineAndColumn(text, line, column) {
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\r") {
      line += 1;
      column = 0;
      if (text[index + 1] === "\n") {
        index += 1;
      }
    } else if (character === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { line, column };
}
function offsetToLineAndColumn(text, offset) {
  return advanceLineAndColumn(text.slice(0, offset), 0, 0);
}
function lineAndColumnToOffset(text, line, column) {
  let currentLine = 0;
  let index = 0;
  while (currentLine < line && index < text.length) {
    const character = text[index];
    if (character === "\r") {
      index += 1;
      if (text[index] === "\n") {
        index += 1;
      }
      currentLine += 1;
    } else if (character === "\n") {
      index += 1;
      currentLine += 1;
    } else {
      index += 1;
    }
  }
  return Math.min(index + column, text.length);
}
function paintedOffsetForOriginalLineAndColumn(painted, line, column) {
  let currentLine = 0;
  let index = 0;
  while (currentLine < line && index < painted.length) {
    const character = painted[index];
    if (character === "\r") {
      index += 1;
      if (painted[index] === "\n") {
        index += 1;
      }
      currentLine += 1;
    } else if (character === "\n") {
      index += 1;
      currentLine += 1;
    } else {
      index += 1;
    }
  }
  const lineStart = index;
  while (index < painted.length && painted[index] !== "\n" && painted[index] !== "\r") {
    index += 1;
  }
  return lineStart + Math.min(Math.max(column, 0), index - lineStart);
}
function mapGeneratedSpanToSnapshotLine(entry, start, length) {
  const startPosition = offsetToLineAndColumn(entry.typescript, start);
  const originalStart = originalPositionFor(entry.map, startPosition.line, startPosition.column);
  const mappedStart = paintedOffsetForOriginalLineAndColumn(
    entry.typescript,
    originalStart.line,
    originalStart.column
  );
  if (length <= 0) {
    return { start: mappedStart, length: 0 };
  }
  const endPosition = offsetToLineAndColumn(entry.typescript, start + length);
  const originalEnd = originalPositionFor(entry.map, endPosition.line, endPosition.column);
  const mappedEnd = paintedOffsetForOriginalLineAndColumn(entry.typescript, originalEnd.line, originalEnd.column);
  return { start: mappedStart, length: Math.max(mappedEnd - mappedStart, 0) };
}
function mapOriginalOffsetToGenerated(entry, originalOffset) {
  const position = offsetToLineAndColumn(entry.original, originalOffset);
  const generated = generatedPositionFor(entry.map, position.line, position.column);
  return lineAndColumnToOffset(entry.typescript, generated.line, generated.column);
}
function mapGeneratedSpanToOriginal(entry, start, length) {
  const position = offsetToLineAndColumn(entry.typescript, start);
  const range = originalRangeFor(entry.map, position.line, position.column, length);
  return { start: lineAndColumnToOffset(entry.original, range.line, range.column), length: range.length };
}
function mapOriginalSpanToGenerated(entry, start, length) {
  const generatedStart = mapOriginalOffsetToGenerated(entry, start);
  const generatedEnd = mapOriginalOffsetToGenerated(entry, start + length);
  return { start: generatedStart, length: Math.max(generatedEnd - generatedStart, 0) };
}
function resolveOrkscriptModuleSpecifier(specifier, containingFile, knownFileNames) {
  if (!specifier.endsWith(".ork")) {
    return void 0;
  }
  const combined = import_node_path.posix.normalize(import_node_path.posix.join(import_node_path.posix.dirname(containingFile), specifier));
  if (knownFileNames.has(combined)) {
    return combined;
  }
  const base = import_node_path.posix.basename(combined);
  return knownFileNames.has(base) ? base : void 0;
}
function patchLanguageServiceHost(host, ts) {
  const cache = /* @__PURE__ */ new Map();
  const originalGetScriptSnapshot = host.getScriptSnapshot?.bind(host);
  const originalReadFile = host.readFile?.bind(host);
  const originalGetScriptKind = host.getScriptKind?.bind(host);
  const originalGetCompilationSettings = host.getCompilationSettings?.bind(host);
  const originalResolveModuleNameLiterals = host.resolveModuleNameLiterals?.bind(host);
  const originalResolveModuleNames = host.resolveModuleNames?.bind(host);
  let compilationSettingsSource;
  let compilationSettings;
  function paintedEntryFor(fileName, originalText) {
    const version = host.getScriptVersion(fileName);
    const cached = cache.get(fileName);
    if (cached !== void 0 && cached.version === version && cached.original === originalText) {
      return cached;
    }
    const { typescript: paintedTypescript, map } = transliterate(originalText);
    const entry = { original: originalText, typescript: paintedTypescript, map, version };
    cache.set(fileName, entry);
    return entry;
  }
  const overrides = {
    getScriptKind(fileName) {
      if (isOrkscriptFileName(fileName)) {
        return ts.ScriptKind.TS;
      }
      return originalGetScriptKind?.(fileName) ?? ts.ScriptKind.Unknown;
    },
    getCompilationSettings() {
      const current = originalGetCompilationSettings?.() ?? {};
      if (compilationSettings !== void 0 && compilationSettingsSource === current) {
        return compilationSettings;
      }
      compilationSettingsSource = current;
      compilationSettings = current.allowNonTsExtensions ? current : { ...current, allowNonTsExtensions: true };
      return compilationSettings;
    },
    getScriptSnapshot(fileName) {
      const snapshot = originalGetScriptSnapshot?.(fileName);
      if (snapshot === void 0 || !isOrkscriptFileName(fileName)) {
        return snapshot;
      }
      const originalText = snapshot.getText(0, snapshot.getLength());
      return ts.ScriptSnapshot.fromString(paintedEntryFor(fileName, originalText).typescript);
    },
    readFile(fileName, encoding) {
      const text = originalReadFile?.(fileName, encoding);
      if (text === void 0 || !isOrkscriptFileName(fileName)) {
        return text;
      }
      return paintedEntryFor(fileName, text).typescript;
    },
    resolveModuleNameLiterals(moduleLiterals, containingFile, redirectedReference, options, containingSourceFile, reusedNames) {
      const knownFileNames = new Set(host.getScriptFileNames());
      const resolvedByHost = originalResolveModuleNameLiterals === void 0 ? void 0 : originalResolveModuleNameLiterals(
        moduleLiterals,
        containingFile,
        redirectedReference,
        options,
        containingSourceFile,
        reusedNames ?? []
      );
      return moduleLiterals.map((literal, index) => {
        const resolvedFileName = resolveOrkscriptModuleSpecifier(literal.text, containingFile, knownFileNames);
        if (resolvedFileName !== void 0) {
          return {
            resolvedModule: {
              resolvedFileName,
              extension: ts.Extension.Ts,
              isExternalLibraryImport: false
            }
          };
        }
        if (resolvedByHost !== void 0) {
          return resolvedByHost[index] ?? { resolvedModule: void 0 };
        }
        return ts.resolveModuleName(literal.text, containingFile, options, host, void 0, redirectedReference);
      });
    },
    resolveModuleNames(moduleNames, containingFile, reusedNames, redirectedReference, options, containingSourceFile) {
      const knownFileNames = new Set(host.getScriptFileNames());
      const resolvedByHost = originalResolveModuleNames === void 0 ? void 0 : originalResolveModuleNames(
        moduleNames,
        containingFile,
        reusedNames,
        redirectedReference,
        options,
        containingSourceFile
      );
      return moduleNames.map((moduleName, index) => {
        const resolvedFileName = resolveOrkscriptModuleSpecifier(moduleName, containingFile, knownFileNames);
        if (resolvedFileName !== void 0) {
          return { resolvedFileName, extension: ts.Extension.Ts, isExternalLibraryImport: false };
        }
        if (resolvedByHost !== void 0) {
          return resolvedByHost[index];
        }
        return ts.resolveModuleName(moduleName, containingFile, options, host, void 0, redirectedReference).resolvedModule;
      });
    },
    getOrkscriptPaintCacheEntry(fileName) {
      return cache.get(fileName);
    }
  };
  Object.assign(host, overrides);
  return host;
}
function paintCacheEntryFor(host, fileName) {
  if (!isOrkscriptFileName(fileName)) {
    return void 0;
  }
  const orkscriptHost = host;
  const cached = orkscriptHost.getOrkscriptPaintCacheEntry?.(fileName);
  if (cached !== void 0) {
    return cached;
  }
  host.getScriptSnapshot(fileName);
  return orkscriptHost.getOrkscriptPaintCacheEntry?.(fileName);
}
function identifierPrefixBefore(text, offset) {
  let start = offset;
  while (start > 0 && /[$\w]/.test(text[start - 1] ?? "")) {
    start -= 1;
  }
  return text.slice(start, offset);
}
function reversePaintDisplayParts(parts) {
  return parts?.map((part) => ({ ...part, text: reversePaint(part.text) }));
}
function reversePaintDiagnosticMessage(messageText) {
  if (typeof messageText === "string") {
    return reversePaint(messageText);
  }
  return {
    ...messageText,
    messageText: reversePaint(messageText.messageText),
    next: messageText.next?.map(
      (chain) => reversePaintDiagnosticMessage(chain)
    )
  };
}
function decorateLanguageService(languageService, host, ts) {
  function entryFor(fileName) {
    return paintCacheEntryFor(host, fileName);
  }
  function toGeneratedPosition(fileName, position) {
    const entry = entryFor(fileName);
    return entry === void 0 ? position : mapOriginalOffsetToGenerated(entry, position);
  }
  function toGeneratedPositionOrRange(fileName, positionOrRange) {
    if (typeof positionOrRange === "number") {
      return toGeneratedPosition(fileName, positionOrRange);
    }
    return {
      pos: toGeneratedPosition(fileName, positionOrRange.pos),
      end: toGeneratedPosition(fileName, positionOrRange.end)
    };
  }
  function mapDocumentSpan(documentSpan) {
    const entry = entryFor(documentSpan.fileName);
    if (entry === void 0) {
      return documentSpan;
    }
    const mapped = mapGeneratedSpanToOriginal(entry, documentSpan.textSpan.start, documentSpan.textSpan.length);
    return { ...documentSpan, textSpan: { start: mapped.start, length: mapped.length } };
  }
  function mapDefinitionDocumentSpan(documentSpan) {
    const entry = entryFor(documentSpan.fileName);
    if (entry === void 0) {
      return documentSpan;
    }
    const textSpan = mapGeneratedSpanToSnapshotLine(entry, documentSpan.textSpan.start, documentSpan.textSpan.length);
    if (documentSpan.contextSpan === void 0) {
      return { ...documentSpan, textSpan };
    }
    const contextSpan = mapGeneratedSpanToSnapshotLine(
      entry,
      documentSpan.contextSpan.start,
      documentSpan.contextSpan.length
    );
    return { ...documentSpan, textSpan, contextSpan };
  }
  function mapEncodedClassifications(entry, classifications) {
    const mappedSpans = [];
    for (let index = 0; index + 2 < classifications.spans.length; index += 3) {
      const start = classifications.spans[index];
      const length = classifications.spans[index + 1];
      const classification = classifications.spans[index + 2];
      if (start === void 0 || length === void 0 || classification === void 0) {
        continue;
      }
      const mapped = mapGeneratedSpanToOriginal(entry, start, length);
      mappedSpans.push(mapped.start, mapped.length, classification);
    }
    return { ...classifications, spans: mappedSpans };
  }
  function mapSpanInFile(fileName, span) {
    const entry = entryFor(fileName);
    if (entry === void 0) {
      return span;
    }
    const mapped = mapGeneratedSpanToOriginal(entry, span.start, span.length);
    return { start: mapped.start, length: mapped.length };
  }
  function mapTextChange(entry, textChange) {
    const mapped = mapGeneratedSpanToOriginal(entry, textChange.span.start, textChange.span.length);
    return { span: { start: mapped.start, length: mapped.length }, newText: reversePaint(textChange.newText) };
  }
  function mapFileTextChanges(fileTextChanges) {
    const entry = entryFor(fileTextChanges.fileName);
    if (entry === void 0) {
      return fileTextChanges;
    }
    return {
      ...fileTextChanges,
      textChanges: fileTextChanges.textChanges.map((textChange) => mapTextChange(entry, textChange))
    };
  }
  function reversePaintDiagnostic(entry, diagnostic) {
    const messageText = reversePaintDiagnosticMessage(diagnostic.messageText);
    if (diagnostic.start === void 0 || diagnostic.length === void 0) {
      return { ...diagnostic, messageText };
    }
    const mapped = mapGeneratedSpanToOriginal(entry, diagnostic.start, diagnostic.length);
    return { ...diagnostic, start: mapped.start, length: mapped.length, messageText };
  }
  function dictionaryCompletionEntries(prefix) {
    const entries = [];
    for (const orkWord of Object.keys(dictionary4)) {
      if (!orkWord.startsWith(prefix)) {
        continue;
      }
      entries.push({
        name: orkWord,
        kind: dictionaryTypeKeys.has(orkWord) ? ts.ScriptElementKind.typeElement : ts.ScriptElementKind.keyword,
        kindModifiers: "",
        sortText: "0",
        insertText: orkWord
      });
    }
    return entries;
  }
  function dedupeByInsertText(entries) {
    const seen = /* @__PURE__ */ new Set();
    const deduped = [];
    for (const entry of entries) {
      const key = entry.insertText ?? entry.name;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(entry);
    }
    return deduped;
  }
  const overrides = {
    getCompletionsAtPosition(fileName, position, options, formattingSettings) {
      const entry = entryFor(fileName);
      if (entry === void 0) {
        return languageService.getCompletionsAtPosition(fileName, position, options, formattingSettings);
      }
      const generatedPosition = mapOriginalOffsetToGenerated(entry, position);
      const info = languageService.getCompletionsAtPosition(fileName, generatedPosition, options, formattingSettings);
      const prefix = identifierPrefixBefore(entry.original, position);
      const paintedEntries = (info?.entries ?? []).map((completionEntry) => ({
        ...completionEntry,
        name: reversePaint(completionEntry.name),
        insertText: completionEntry.insertText === void 0 ? void 0 : reversePaint(completionEntry.insertText),
        filterText: completionEntry.filterText === void 0 ? void 0 : reversePaint(completionEntry.filterText)
      }));
      const filteredEntries = prefix.length === 0 ? paintedEntries : paintedEntries.filter(
        (completionEntry) => (completionEntry.insertText ?? completionEntry.name).startsWith(prefix)
      );
      const merged = dedupeByInsertText([...filteredEntries, ...dictionaryCompletionEntries(prefix)]);
      const result = {
        isGlobalCompletion: info?.isGlobalCompletion ?? false,
        isMemberCompletion: info?.isMemberCompletion ?? false,
        isNewIdentifierLocation: info?.isNewIdentifierLocation ?? false,
        entries: merged
      };
      return result;
    },
    getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const generatedEntryName = dictionary4[entryName] ?? entryName;
      const details = languageService.getCompletionEntryDetails(
        fileName,
        generatedPosition,
        generatedEntryName,
        formatOptions,
        source,
        preferences,
        data
      );
      if (details === void 0) {
        return void 0;
      }
      return {
        ...details,
        displayParts: reversePaintDisplayParts(details.displayParts) ?? details.displayParts,
        documentation: reversePaintDisplayParts(details.documentation) ?? details.documentation,
        codeActions: details.codeActions?.map((action) => ({
          ...action,
          description: reversePaint(action.description),
          changes: action.changes.map((change) => mapFileTextChanges(change))
        }))
      };
    },
    getQuickInfoAtPosition(fileName, position, maximumLength) {
      const entry = entryFor(fileName);
      if (entry === void 0) {
        return languageService.getQuickInfoAtPosition(fileName, position, maximumLength);
      }
      const generatedPosition = mapOriginalOffsetToGenerated(entry, position);
      const quickInfo = languageService.getQuickInfoAtPosition(fileName, generatedPosition, maximumLength);
      if (quickInfo === void 0) {
        return void 0;
      }
      const mappedSpan = mapGeneratedSpanToOriginal(entry, quickInfo.textSpan.start, quickInfo.textSpan.length);
      return {
        ...quickInfo,
        textSpan: { start: mappedSpan.start, length: mappedSpan.length },
        displayParts: reversePaintDisplayParts(quickInfo.displayParts),
        documentation: reversePaintDisplayParts(quickInfo.documentation)
      };
    },
    getSyntacticDiagnostics(fileName) {
      const entry = entryFor(fileName);
      const diagnostics = languageService.getSyntacticDiagnostics(fileName);
      return entry === void 0 ? diagnostics : diagnostics.map((diagnostic) => reversePaintDiagnostic(entry, diagnostic));
    },
    getSemanticDiagnostics(fileName) {
      const entry = entryFor(fileName);
      const diagnostics = languageService.getSemanticDiagnostics(fileName);
      return entry === void 0 ? diagnostics : diagnostics.map((diagnostic) => reversePaintDiagnostic(entry, diagnostic));
    },
    getSuggestionDiagnostics(fileName) {
      const entry = entryFor(fileName);
      const diagnostics = languageService.getSuggestionDiagnostics(fileName);
      return entry === void 0 ? diagnostics : diagnostics.map((diagnostic) => reversePaintDiagnostic(entry, diagnostic));
    },
    getEncodedSemanticClassifications(fileName, span, format) {
      const entry = entryFor(fileName);
      if (entry === void 0) {
        return languageService.getEncodedSemanticClassifications(fileName, span, format);
      }
      const generatedSpan = mapOriginalSpanToGenerated(entry, span.start, span.length);
      return mapEncodedClassifications(
        entry,
        languageService.getEncodedSemanticClassifications(fileName, generatedSpan, format)
      );
    },
    getEncodedSyntacticClassifications(fileName, span) {
      const entry = entryFor(fileName);
      if (entry === void 0) {
        return languageService.getEncodedSyntacticClassifications(fileName, span);
      }
      const generatedSpan = mapOriginalSpanToGenerated(entry, span.start, span.length);
      return mapEncodedClassifications(
        entry,
        languageService.getEncodedSyntacticClassifications(fileName, generatedSpan)
      );
    },
    getDefinitionAtPosition(fileName, position) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const definitions = languageService.getDefinitionAtPosition(fileName, generatedPosition);
      return definitions?.map((definition) => mapDefinitionDocumentSpan(definition));
    },
    getDefinitionAndBoundSpan(fileName, position) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const result = languageService.getDefinitionAndBoundSpan(fileName, generatedPosition);
      if (result === void 0) {
        return void 0;
      }
      return {
        definitions: result.definitions?.map((definition) => mapDefinitionDocumentSpan(definition)),
        textSpan: mapSpanInFile(fileName, result.textSpan)
      };
    },
    getTypeDefinitionAtPosition(fileName, position) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const definitions = languageService.getTypeDefinitionAtPosition(fileName, generatedPosition);
      return definitions?.map((definition) => mapDefinitionDocumentSpan(definition));
    },
    getImplementationAtPosition(fileName, position) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const implementations = languageService.getImplementationAtPosition(fileName, generatedPosition);
      return implementations?.map((implementation) => mapDefinitionDocumentSpan(implementation));
    },
    getReferencesAtPosition(fileName, position) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const references = languageService.getReferencesAtPosition(fileName, generatedPosition);
      return references?.map((reference) => mapDocumentSpan(reference));
    },
    findReferences(fileName, position) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const symbols = languageService.findReferences(fileName, generatedPosition);
      return symbols?.map((symbol) => ({
        ...symbol,
        references: symbol.references.map((reference) => mapDocumentSpan(reference))
      }));
    },
    getSignatureHelpItems(fileName, position, options) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const items = languageService.getSignatureHelpItems(fileName, generatedPosition, options);
      if (items === void 0) {
        return void 0;
      }
      return {
        ...items,
        applicableSpan: mapSpanInFile(fileName, items.applicableSpan),
        items: items.items.map((item) => ({
          ...item,
          prefixDisplayParts: reversePaintDisplayParts(item.prefixDisplayParts) ?? item.prefixDisplayParts,
          suffixDisplayParts: reversePaintDisplayParts(item.suffixDisplayParts) ?? item.suffixDisplayParts,
          separatorDisplayParts: reversePaintDisplayParts(item.separatorDisplayParts) ?? item.separatorDisplayParts,
          documentation: reversePaintDisplayParts(item.documentation) ?? item.documentation,
          parameters: item.parameters.map((parameter) => ({
            ...parameter,
            displayParts: reversePaintDisplayParts(parameter.displayParts) ?? parameter.displayParts,
            documentation: reversePaintDisplayParts(parameter.documentation) ?? parameter.documentation
          }))
        }))
      };
    },
    getRenameInfo(fileName, position, preferencesOrOptions) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const info = languageService.getRenameInfo(fileName, generatedPosition, preferencesOrOptions);
      if (!info.canRename) {
        return info;
      }
      return { ...info, triggerSpan: mapSpanInFile(fileName, info.triggerSpan) };
    },
    findRenameLocations(fileName, position, findInStrings, findInComments, preferencesOrProvidePrefixAndSuffix) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const locations = languageService.findRenameLocations(
        fileName,
        generatedPosition,
        findInStrings,
        findInComments,
        preferencesOrProvidePrefixAndSuffix
      );
      return locations?.map((location) => mapDocumentSpan(location));
    },
    getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences) {
      const entry = entryFor(fileName);
      if (entry === void 0) {
        return languageService.getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences);
      }
      const generatedStart = mapOriginalOffsetToGenerated(entry, start);
      const generatedEnd = mapOriginalOffsetToGenerated(entry, end);
      const fixes = languageService.getCodeFixesAtPosition(
        fileName,
        generatedStart,
        generatedEnd,
        errorCodes,
        formatOptions,
        preferences
      );
      return fixes.map((fix) => ({
        ...fix,
        description: reversePaint(fix.description),
        changes: fix.changes.map((change) => mapFileTextChanges(change))
      }));
    },
    getDocumentHighlights(fileName, position, filesToSearch) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const documentHighlightsList = languageService.getDocumentHighlights(fileName, generatedPosition, filesToSearch);
      return documentHighlightsList?.map((documentHighlights) => ({
        ...documentHighlights,
        highlightSpans: documentHighlights.highlightSpans.map((highlightSpan) => {
          const highlightSpanFileName = highlightSpan.fileName ?? documentHighlights.fileName;
          const mappedHighlightSpan = {
            ...highlightSpan,
            textSpan: mapSpanInFile(highlightSpanFileName, highlightSpan.textSpan)
          };
          if (highlightSpan.contextSpan !== void 0) {
            mappedHighlightSpan.contextSpan = mapSpanInFile(highlightSpanFileName, highlightSpan.contextSpan);
          }
          return mappedHighlightSpan;
        })
      }));
    },
    getApplicableRefactors(fileName, positionOrRange, preferences, triggerReason, kind, includeInteractiveActions) {
      const generatedPositionOrRange = toGeneratedPositionOrRange(fileName, positionOrRange);
      return languageService.getApplicableRefactors(
        fileName,
        generatedPositionOrRange,
        preferences,
        triggerReason,
        kind,
        includeInteractiveActions
      );
    },
    getEditsForRefactor(fileName, formatOptions, positionOrRange, refactorName, actionName, preferences, interactiveRefactorArguments) {
      const generatedPositionOrRange = toGeneratedPositionOrRange(fileName, positionOrRange);
      const refactorEditInfo = languageService.getEditsForRefactor(
        fileName,
        formatOptions,
        generatedPositionOrRange,
        refactorName,
        actionName,
        preferences,
        interactiveRefactorArguments
      );
      if (refactorEditInfo === void 0) {
        return void 0;
      }
      return {
        ...refactorEditInfo,
        edits: refactorEditInfo.edits.map((fileTextChanges) => mapFileTextChanges(fileTextChanges))
      };
    },
    getCombinedCodeFix(scope, fixId, formatOptions, preferences) {
      const combinedCodeActions = languageService.getCombinedCodeFix(scope, fixId, formatOptions, preferences);
      return {
        ...combinedCodeActions,
        changes: combinedCodeActions.changes.map((fileTextChanges) => mapFileTextChanges(fileTextChanges))
      };
    }
  };
  return new Proxy(languageService, {
    get(target, property, receiver) {
      if (typeof property === "string" && Object.hasOwn(overrides, property)) {
        return overrides[property];
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

// orkscript/src/tsserverPluginInit.ts
function hasClassicQuickInfo(languageService) {
  return typeof languageService.getQuickInfoAtPosition === "function";
}
function init({
  typescript = typescriptRuntime
}) {
  return {
    create(info) {
      if (!hasClassicQuickInfo(info.languageService)) {
        return info.languageService;
      }
      const host = patchLanguageServiceHost(info.languageServiceHost, typescript);
      return decorateLanguageService(info.languageService, host, typescript);
    }
  };
}
var tsserverPluginInit_default = init;
module.exports = module.exports.default;
