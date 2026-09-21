import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  generatedPositionFor,
  originalPositionFor,
  originalRangeFor,
  transliterate,
} from '../src/transliterate.ts';

function indexToPosition(source: string, index: number): { line: number; column: number } {
  let line = 0;
  let column = 0;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === '\r') {
      line += 1;
      column = 0;
      if (source[cursor + 1] === '\n') {
        cursor += 1;
      }
    } else if (source[cursor] === '\n') {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

describe('source map', () => {
  test('one replacement: generated column of function maps back to nob', () => {
    const source = 'nob';
    const { typescript, map } = transliterate(source);
    assert.equal(typescript, 'function');
    assert.equal(map.mappings.length, 1);
    assert.deepEqual(map.mappings[0], {
      generatedLine: 0,
      generatedColumn: 0,
      originalLine: 0,
      originalColumn: 0,
      originalLength: 3,
      generatedLength: 8,
    });
    const generated = indexToPosition(typescript, typescript.indexOf('function'));
    const original = originalPositionFor(map, generated.line, generated.column);
    assert.deepEqual(original, { line: 0, column: 0 });
  });

  test('several on one line: bark nob → export function', () => {
    const source = 'bark nob';
    const { typescript, map } = transliterate(source);
    assert.equal(typescript, 'export function');
    assert.equal(map.mappings.length, 2);

    assert.deepEqual(map.mappings[0], {
      generatedLine: 0,
      generatedColumn: 0,
      originalLine: 0,
      originalColumn: 0,
      originalLength: 4,
      generatedLength: 6,
    });
    assert.deepEqual(map.mappings[1], {
      generatedLine: 0,
      generatedColumn: 7,
      originalLine: 0,
      originalColumn: 5,
      originalLength: 3,
      generatedLength: 8,
    });

    const exportPosition = indexToPosition(typescript, typescript.indexOf('export'));
    assert.deepEqual(originalPositionFor(map, exportPosition.line, exportPosition.column), {
      line: 0,
      column: 0,
    });

    const functionPosition = indexToPosition(typescript, typescript.indexOf('function'));
    assert.deepEqual(originalPositionFor(map, functionPosition.line, functionPosition.column), {
      line: 0,
      column: 5,
    });
  });

  test('line with no replacements maps 1:1', () => {
    const source = 'instanceof foo';
    const { typescript, map } = transliterate(source);
    assert.equal(typescript, source);
    assert.equal(map.mappings.length, 0);
    for (let column = 0; column < source.length; column += 1) {
      assert.deepEqual(originalPositionFor(map, 0, column), { line: 0, column });
    }
  });

  test('multi-line replacements stay on the same line', () => {
    const source = 'nob x(){\n  loot 1;\n}';
    const { typescript, map } = transliterate(source);
    assert.equal(typescript, 'function x(){\n  return 1;\n}');
    const originalNewlines = source.split(/\r\n|\n|\r/).length;
    const generatedNewlines = typescript.split(/\r\n|\n|\r/).length;
    assert.equal(generatedNewlines, originalNewlines);
    for (const mapping of map.mappings) {
      assert.equal(mapping.generatedLine, mapping.originalLine);
    }
    assert.equal(map.mappings[0]?.originalLine, 0);
    assert.equal(map.mappings[1]?.originalLine, 1);
  });

  test('different deltas: nob(3)→function(8) and kount(5)→number(6)', () => {
    const source = 'nob kount';
    const { typescript, map } = transliterate(source);
    assert.equal(typescript, 'function number');
    assert.deepEqual(map.mappings[0], {
      generatedLine: 0,
      generatedColumn: 0,
      originalLine: 0,
      originalColumn: 0,
      originalLength: 3,
      generatedLength: 8,
    });
    assert.deepEqual(map.mappings[1], {
      generatedLine: 0,
      generatedColumn: 9,
      originalLine: 0,
      originalColumn: 4,
      originalLength: 5,
      generatedLength: 6,
    });
  });

  test('nob x → function x: x maps back and forth around a rewrite', () => {
    const source = 'nob x';
    const { typescript } = transliterate(source);
    assert.equal(typescript, 'function x');
    const { map } = transliterate(source);

    assert.deepEqual(originalPositionFor(map, 0, 9), { line: 0, column: 4 });
    assert.deepEqual(generatedPositionFor(map, 0, 4), { line: 0, column: 9 });
  });

  test('bark nob → export function: the space between words maps both ways', () => {
    const source = 'bark nob';
    const { typescript, map } = transliterate(source);
    assert.equal(typescript, 'export function');

    assert.deepEqual(originalPositionFor(map, 0, 6), { line: 0, column: 4 });
    assert.deepEqual(generatedPositionFor(map, 0, 4), { line: 0, column: 6 });
  });

  test('originalRangeFor on the generated span of function returns the original span of nob', () => {
    const source = 'nob';
    const { typescript, map } = transliterate(source);
    assert.equal(typescript, 'function');
    assert.deepEqual(originalRangeFor(map, 0, 0, typescript.length), {
      line: 0,
      column: 0,
      length: 3,
    });
  });

  test('nob kount x: a column after two rewrites maps with the cumulative delta, not 1:1', () => {
    const source = 'nob kount x';
    const { typescript, map } = transliterate(source);
    assert.equal(typescript, 'function number x');

    const generatedXColumn = typescript.indexOf('x');
    const originalXColumn = source.indexOf('x');
    assert.notEqual(generatedXColumn, originalXColumn);
    assert.deepEqual(originalPositionFor(map, 0, generatedXColumn), {
      line: 0,
      column: originalXColumn,
    });
  });

  test('a line with zero rewrites stays 1:1 in both directions', () => {
    const source = 'instanceof foo';
    const { map } = transliterate(source);
    for (let column = 0; column < source.length; column += 1) {
      assert.deepEqual(originalPositionFor(map, 0, column), { line: 0, column });
      assert.deepEqual(generatedPositionFor(map, 0, column), { line: 0, column });
    }
  });

  test('an out-of-range column past EOL does not throw and clamps to the line length', () => {
    const source = 'nob';
    const { map } = transliterate(source);
    assert.doesNotThrow(() => originalPositionFor(map, 0, 999));
    assert.deepEqual(originalPositionFor(map, 0, 999), { line: 0, column: source.length });
  });
});
