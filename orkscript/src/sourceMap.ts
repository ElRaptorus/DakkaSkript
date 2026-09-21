import type { SourceMap } from './transliterate.ts';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export type StandardSourceMap = {
  version: 3;
  file: string;
  sources: string[];
  sourcesContent: string[];
  names: string[];
  mappings: string;
};

type MappingSegment = {
  generatedColumn: number;
  originalLine: number;
  originalColumn: number;
};

function encodeVlq(value: number): string {
  let quantity = value < 0 ? (-value << 1) | 1 : value << 1;
  let encoded = '';
  do {
    let digit = quantity & 31;
    quantity >>>= 5;
    if (quantity !== 0) {
      digit |= 32;
    }
    encoded += BASE64[digit];
  } while (quantity !== 0);
  return encoded;
}

function lineCount(text: string): number {
  let count = 1;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\r') {
      count += 1;
      if (text[index + 1] === '\n') {
        index += 1;
      }
    } else if (character === '\n') {
      count += 1;
    }
  }
  return count;
}

function segmentsByLine(map: SourceMap, generated: string): MappingSegment[][] {
  const lines: Array<Map<number, MappingSegment>> = Array.from(
    { length: lineCount(generated) },
    () => new Map(),
  );

  for (let line = 0; line < lines.length; line += 1) {
    lines[line]!.set(0, { generatedColumn: 0, originalLine: line, originalColumn: 0 });
  }

  for (const mapping of map.mappings) {
    const lineSegments = lines[mapping.generatedLine];
    if (lineSegments === undefined) {
      continue;
    }
    lineSegments.set(mapping.generatedColumn, {
      generatedColumn: mapping.generatedColumn,
      originalLine: mapping.originalLine,
      originalColumn: mapping.originalColumn,
    });
    lineSegments.set(mapping.generatedColumn + mapping.generatedLength, {
      generatedColumn: mapping.generatedColumn + mapping.generatedLength,
      originalLine: mapping.originalLine,
      originalColumn: mapping.originalColumn + mapping.originalLength,
    });
  }

  return lines.map((lineSegments) =>
    [...lineSegments.values()].sort((left, right) => left.generatedColumn - right.generatedColumn),
  );
}

function encodeMappings(lines: MappingSegment[][]): string {
  let previousOriginalLine = 0;
  let previousOriginalColumn = 0;
  const encodedLines: string[] = [];

  for (const line of lines) {
    let previousGeneratedColumn = 0;
    const encodedSegments: string[] = [];
    for (const segment of line) {
      encodedSegments.push(
        encodeVlq(segment.generatedColumn - previousGeneratedColumn) +
          encodeVlq(0) +
          encodeVlq(segment.originalLine - previousOriginalLine) +
          encodeVlq(segment.originalColumn - previousOriginalColumn),
      );
      previousGeneratedColumn = segment.generatedColumn;
      previousOriginalLine = segment.originalLine;
      previousOriginalColumn = segment.originalColumn;
    }
    encodedLines.push(encodedSegments.join(','));
  }

  return encodedLines.join(';');
}

export function toStandardSourceMap(options: {
  map: SourceMap;
  generated: string;
  originalSource: string;
  originalPath: string;
  generatedFileName: string;
}): StandardSourceMap {
  return {
    version: 3,
    file: options.generatedFileName,
    sources: [options.originalPath],
    sourcesContent: [options.originalSource],
    names: [],
    mappings: encodeMappings(segmentsByLine(options.map, options.generated)),
  };
}

export function appendInlineSourceMappingUrl(generated: string, sourceMap: StandardSourceMap): string {
  const base64 = Buffer.from(JSON.stringify(sourceMap), 'utf8').toString('base64');
  const comment = `//# sourceMappingURL=data:application/json;base64,${base64}`;
  const prefix = generated.endsWith('\n') ? generated : `${generated}\n`;
  return `${prefix}${comment}\n`;
}
