import dictionaryJson from '../dictionary.json' with { type: 'json' };
import { lex, previousSignificantToken, type Token } from './lex.ts';

const dictionary: Record<string, string> = dictionaryJson;

export type SourceMapping = {
  generatedLine: number;
  generatedColumn: number;
  originalLine: number;
  originalColumn: number;
  originalLength: number;
  generatedLength: number;
};

export type SourceMap = {
  mappings: SourceMapping[];
  originalLineLengths: number[];
  generatedLineLengths: number[];
};

export type TransliterateResult = {
  typescript: string;
  map: SourceMap;
};

export function shouldRewrite(tokens: Token[], index: number, table: Record<string, string>): boolean {
  const token = tokens[index];
  if (token === undefined || token.kind !== 'identifier') {
    return false;
  }
  if (token.value.startsWith('#')) {
    return false;
  }
  if (!Object.hasOwn(table, token.value)) {
    return false;
  }
  const previous = previousSignificantToken(tokens, index);
  if (previous !== undefined && (previous.value === '.' || previous.value === '?.')) {
    return false;
  }
  return true;
}

function advancePosition(
  text: string,
  line: number,
  column: number,
): { line: number; column: number } {
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\r') {
      line += 1;
      column = 0;
      if (text[index + 1] === '\n') {
        index += 1;
      }
    } else if (character === '\n') {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function offsetToPosition(source: string, offset: number): { line: number; column: number } {
  return advancePosition(source.slice(0, offset), 0, 0);
}

function lineLengths(text: string): number[] {
  return text.split(/\r\n|\n|\r/).map((line) => line.length);
}

function cumulativeGeneratedShift(
  map: SourceMap,
  line: number,
  beforeGeneratedColumn: number,
): number {
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

function cumulativeOriginalShift(
  map: SourceMap,
  line: number,
  beforeOriginalColumn: number,
): number {
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

export function originalPositionFor(
  map: SourceMap,
  generatedLine: number,
  generatedColumn: number,
): { line: number; column: number } {
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
        column: mapping.originalColumn + clipped,
      };
    }
  }
  const shift = cumulativeGeneratedShift(map, generatedLine, generatedColumn);
  let column = generatedColumn - shift;
  const lineLength = map.originalLineLengths[generatedLine];
  if (lineLength !== undefined) {
    column = Math.min(column, lineLength);
  }
  column = Math.max(column, 0);
  return { line: generatedLine, column };
}

export function generatedPositionFor(
  map: SourceMap,
  originalLine: number,
  originalColumn: number,
): { line: number; column: number } {
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
        column: mapping.generatedColumn + clipped,
      };
    }
  }
  const shift = cumulativeOriginalShift(map, originalLine, originalColumn);
  let column = originalColumn + shift;
  const lineLength = map.generatedLineLengths[originalLine];
  if (lineLength !== undefined) {
    column = Math.min(column, lineLength);
  }
  column = Math.max(column, 0);
  return { line: originalLine, column };
}

export function originalRangeFor(
  map: SourceMap,
  generatedLine: number,
  generatedStartColumn: number,
  generatedLength: number,
): { line: number; column: number; length: number } {
  const start = originalPositionFor(map, generatedLine, generatedStartColumn);
  if (generatedLength <= 0) {
    return { line: start.line, column: start.column, length: 0 };
  }
  const end = originalPositionFor(map, generatedLine, generatedStartColumn + generatedLength - 1);
  return {
    line: start.line,
    column: start.column,
    length: end.column - start.column + 1,
  };
}

export function transliterate(source: string): TransliterateResult {
  const tokens = lex(source);
  let typescript = '';
  const mappings: SourceMapping[] = [];
  let generatedLine = 0;
  let generatedColumn = 0;

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    if (token === undefined) {
      continue;
    }
    if (shouldRewrite(tokens, tokenIndex, dictionary)) {
      const replacement = dictionary[token.value];
      const original = offsetToPosition(source, token.start);
      mappings.push({
        generatedLine,
        generatedColumn,
        originalLine: original.line,
        originalColumn: original.column,
        originalLength: token.value.length,
        generatedLength: replacement.length,
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
      generatedLineLengths: lineLengths(typescript),
    },
  };
}
