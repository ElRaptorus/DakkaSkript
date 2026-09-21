import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import dictionaryJson from '../dictionary.json' with { type: 'json' };
import { transliterate } from '../src/transliterate.ts';

const dictionary: Record<string, string> = dictionaryJson;

const FROZEN_DICTIONARY_KEYS = [
  'nob',
  'mek',
  'loot',
  'shuv',
  'boss',
  'bigga',
  'chomps',
  'grot',
  'sniky',
  'krumpy',
  'flashy',
  'stikky',
  'ifz',
  'uvver',
  'sluggin',
  'stompin',
  'rukk',
  'katch',
  'deffblast',
  'weird',
  'waitz',
  'nick',
  'bark',
  'frum',
  'stash',
  'bit',
  'runt',
  'wot',
  'yeah',
  'nah',
  'nuffin',
  'shape',
  'face',
  'kount',
  'scrawl',
  'yeahnah',
  'Wazza',
  'Urty',
  'Mob',
  'Rokk',
  'Teef',
] as const;

const FROZEN_DICTIONARY: Record<(typeof FROZEN_DICTIONARY_KEYS)[number], string> = {
  nob: 'function',
  mek: 'class',
  loot: 'return',
  shuv: 'new',
  boss: 'this',
  bigga: 'extends',
  chomps: 'implements',
  grot: 'constructor',
  sniky: 'private',
  krumpy: 'public',
  flashy: 'readonly',
  stikky: 'static',
  ifz: 'if',
  uvver: 'else',
  sluggin: 'for',
  stompin: 'while',
  rukk: 'try',
  katch: 'catch',
  deffblast: 'throw',
  weird: 'async',
  waitz: 'await',
  nick: 'import',
  bark: 'export',
  frum: 'from',
  stash: 'const',
  bit: 'let',
  runt: 'var',
  wot: 'typeof',
  yeah: 'true',
  nah: 'false',
  nuffin: 'null',
  shape: 'type',
  face: 'interface',
  kount: 'number',
  scrawl: 'string',
  yeahnah: 'boolean',
  Wazza: 'Promise',
  Urty: 'Error',
  Mob: 'Array',
  Rokk: 'Object',
  Teef: 'Record',
};

describe('dictionary.json locked table', () => {
  test('frozen expected-key list matches Object.keys(dictionary.json)', () => {
    assert.deepEqual(Object.keys(dictionary), [...FROZEN_DICTIONARY_KEYS]);
  });

  test('frozen table values match dictionary.json', () => {
    assert.deepEqual(dictionary, FROZEN_DICTIONARY);
  });

  test('on-disk JSON parses to the same object', () => {
    const onDisk = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../dictionary.json'), 'utf8'),
    );
    assert.deepEqual(onDisk, FROZEN_DICTIONARY);
  });
});

describe('every dictionary key rewrites as a bare identifier', () => {
  for (const [orkWord, typescriptToken] of Object.entries(dictionary)) {
    test(` ${orkWord}  →  ${typescriptToken} `, () => {
      const { typescript } = transliterate(` ${orkWord} `);
      assert.equal(typescript, ` ${typescriptToken} `);
    });
  }
});

describe('lib types in type position', () => {
  const rows: Array<{ input: string; output: string }> = [
    { input: 'shot: kount', output: 'shot: number' },
    { input: 'x: Wazza<scrawl>', output: 'x: Promise<string>' },
    { input: 'Teef<scrawl, kount>', output: 'Record<string, number>' },
  ];

  for (const row of rows) {
    test(`${row.input} → ${row.output}`, () => {
      assert.equal(transliterate(row.input).typescript, row.output);
    });
  }
});

describe('lib types in value position', () => {
  const rows: Array<{ input: string; output: string }> = [
    { input: 'Wazza.all', output: 'Promise.all' },
    { input: 'Mob.from', output: 'Array.from' },
    { input: 'shuv Urty(...)', output: 'new Error(...)' },
    { input: 'Rokk.keys', output: 'Object.keys' },
  ];

  for (const row of rows) {
    test(`${row.input} → ${row.output}`, () => {
      assert.equal(transliterate(row.input).typescript, row.output);
    });
  }
});

describe('keywords in real syntax', () => {
  const rows: Array<{ input: string; output: string }> = [
    { input: 'bark nob', output: 'export function' },
    { input: 'bark weird nob', output: 'export async function' },
    { input: 'mek X chomps Y', output: 'class X implements Y' },
    { input: 'mek X bigga Y', output: 'class X extends Y' },
    { input: 'rukk {} katch (e)', output: 'try {} catch (e)' },
    { input: 'ifz {} uvver {}', output: 'if {} else {}' },
    { input: 'sluggin (bit i = 0; i < 1; i++) {}', output: 'for (let i = 0; i < 1; i++) {}' },
    { input: 'stompin (yeah)', output: 'while (true)' },
    { input: 'stash', output: 'const' },
    { input: 'bit', output: 'let' },
    { input: 'runt', output: 'var' },
    { input: 'wot x', output: 'typeof x' },
    { input: 'yeah', output: 'true' },
    { input: 'nah', output: 'false' },
    { input: 'nuffin', output: 'null' },
    { input: 'shape', output: 'type' },
    { input: 'face', output: 'interface' },
    { input: 'sniky', output: 'private' },
    { input: 'krumpy', output: 'public' },
    { input: 'flashy', output: 'readonly' },
    { input: 'stikky', output: 'static' },
    { input: 'grot', output: 'constructor' },
    { input: 'boss', output: 'this' },
    { input: 'shuv', output: 'new' },
    { input: 'loot', output: 'return' },
    { input: 'deffblast', output: 'throw' },
    { input: 'nick', output: 'import' },
    { input: 'frum', output: 'from' },
    { input: 'waitz', output: 'await' },
  ];

  for (const row of rows) {
    test(`${row.input} → ${row.output}`, () => {
      assert.equal(transliterate(row.input).typescript, row.output);
    });
  }
});

describe('words not in the dictionary are copied verbatim', () => {
  const untouched = [
    'instanceof',
    'any',
    'void',
    'never',
    'unknown',
    'undefined',
    'iz',
    'true',
    'function',
  ];

  for (const word of untouched) {
    test(word, () => {
      assert.equal(transliterate(word).typescript, word);
    });
  }
});

describe('wrong case stays', () => {
  const untouched = ['Nob', 'LOOT', 'wazza', 'mob'];

  for (const word of untouched) {
    test(word, () => {
      assert.equal(transliterate(word).typescript, word);
    });
  }
});

describe('sacred identifiers never rewrite', () => {
  const sacred = [
    'Dakka',
    'DakkaDakka',
    'DakkaDakkaDakka',
    'waaagh',
    'WAAAAGH',
    'WAAAAAAAAGH',
    'GetDeffGun',
  ];

  for (const word of sacred) {
    test(word, () => {
      assert.equal(transliterate(word).typescript, word);
    });
  }
});

describe('substrings stay', () => {
  const untouched = ['lootbox', 'nobGoblin', 'dakkaKount', 'bossy', 'kounter'];

  for (const word of untouched) {
    test(word, () => {
      assert.equal(transliterate(word).typescript, word);
    });
  }
});
