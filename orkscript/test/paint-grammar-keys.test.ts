import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import dictionaryJson from '../dictionary.json' with { type: 'json' };

const dictionary: Record<string, string> = dictionaryJson;
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');
const paintScriptPath = join(here, '../scripts/paint-grammar.mjs');
const generatedGrammarPath = join(repoRoot, 'editors/vscode/syntaxes/orkscript.tmLanguage.json');
const generatedHighlightsPath = join(repoRoot, 'editors/zed/languages/orkscript/highlights.scm');

describe('painted TextMate grammar contains every dictionary key', () => {
  const grammar = readFileSync(generatedGrammarPath, 'utf8');

  for (const orkWord of Object.keys(dictionary)) {
    test(`|${orkWord} is in orkscript.tmLanguage.json`, () => {
      assert.ok(grammar.includes(`|${orkWord}`), `missing |${orkWord}`);
    });
  }
});

describe('painted Zed highlights contain every dictionary key', () => {
  const highlights = readFileSync(generatedHighlightsPath, 'utf8');

  for (const orkWord of Object.keys(dictionary)) {
    test(`"${orkWord}" is in highlights.scm`, () => {
      assert.ok(highlights.includes(`"${orkWord}"`), `missing "${orkWord}"`);
    });
  }
});

describe('paint-grammar.mjs is byte-stable', () => {
  test('running the script reproduces the committed TextMate grammar and highlights.scm', () => {
    const beforeGrammar = readFileSync(generatedGrammarPath);
    const beforeHighlights = readFileSync(generatedHighlightsPath);
    const result = spawnSync(process.execPath, [paintScriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(generatedGrammarPath), beforeGrammar);
    assert.deepEqual(readFileSync(generatedHighlightsPath), beforeHighlights);
  });
});
