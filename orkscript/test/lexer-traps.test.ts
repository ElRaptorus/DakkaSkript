import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { transliterate } from '../src/transliterate.ts';

const gretchinBlob = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../fixtures/gretchin-blob.ork'),
  'utf8',
);

const rows: Array<{ name: string; input: string; output: string }> = [
  {
    name: 'single-quoted string',
    input: "'loot nob mek Wazza'",
    output: "'loot nob mek Wazza'",
  },
  {
    name: 'double-quoted string',
    input: '"loot nob mek Wazza"',
    output: '"loot nob mek Wazza"',
  },
  {
    name: 'template static text',
    input: '`loot ${1} nob`',
    output: '`loot ${1} nob`',
  },
  {
    name: 'interpolation does rewrite',
    input: '`x ${loot 1}`',
    output: '`x ${return 1}`',
  },
  {
    name: 'nested interpolation',
    input: '`a ${`b ${loot 1}`}`',
    output: '`a ${`b ${return 1}`}`',
  },
  {
    name: 'escaped single quote',
    input: "'it\\'s loot'",
    output: "'it\\'s loot'",
  },
  {
    name: 'escaped double quote',
    input: '"say \\"nob\\""',
    output: '"say \\"nob\\""',
  },
  {
    name: 'line comment',
    input: '// loot nob mek Wazza Promise',
    output: '// loot nob mek Wazza Promise',
  },
  {
    name: 'block comment then stash',
    input: '/* loot nob */ stash x = 1',
    output: '/* loot nob */ const x = 1',
  },
  {
    name: 'JSDoc',
    input: '/** @loot nob */',
    output: '/** @loot nob */',
  },
  {
    name: 'regex /loot/g',
    input: '/loot/g',
    output: '/loot/g',
  },
  {
    name: 'regex /nob mek/',
    input: '/nob mek/',
    output: '/nob mek/',
  },
  {
    name: 'replace regex',
    input: "x.replace(/loot/g, 'z')",
    output: "x.replace(/loot/g, 'z')",
  },
  {
    name: 'HTML in comment',
    input: '// <div class="loot">nob mek</div>',
    output: '// <div class="loot">nob mek</div>',
  },
  {
    name: 'XML in string',
    input: "'<mek>loot</mek>'",
    output: "'<mek>loot</mek>'",
  },
  {
    name: 'division rewrites loot',
    input: 'a / loot',
    output: 'a / return',
  },
  {
    name: 'spread Mob',
    input: '...Mob',
    output: '...Array',
  },
  {
    name: 'spread Mob.from',
    input: '[...Mob.from(x)]',
    output: '[...Array.from(x)]',
  },
  {
    name: 'object spread Rokk',
    input: '{...Rokk}',
    output: '{...Object}',
  },
  {
    name: 'member loot then division loot',
    input: 'foo.loot / loot',
    output: 'foo.loot / return',
  },
  {
    name: 'member loot then division kount',
    input: 'foo.loot / kount',
    output: 'foo.loot / number',
  },
  {
    name: 'member loot stays',
    input: 'foo.loot',
    output: 'foo.loot',
  },
  {
    name: 'boss.loot paints only boss',
    input: 'boss.loot',
    output: 'this.loot',
  },
  {
    name: 'Mob.from',
    input: 'Mob.from',
    output: 'Array.from',
  },
  {
    name: 'Wazza.all',
    input: 'Wazza.all',
    output: 'Promise.all',
  },
  {
    name: 'optional chaining loot stays',
    input: 'foo?.loot',
    output: 'foo?.loot',
  },
  {
    name: 'optional chaining paints boss only',
    input: 'boss?.shoota',
    output: 'this?.shoota',
  },
  {
    name: 'private field #loot',
    input: '#loot',
    output: '#loot',
  },
  {
    name: 'computed string key',
    input: "foo['loot']",
    output: "foo['loot']",
  },
  {
    name: 'tagged template paints tag',
    input: 'loot`x`',
    output: 'return`x`',
  },
  {
    name: 'empty',
    input: '',
    output: '',
  },
  {
    name: 'whitespace-only',
    input: '   \t  ',
    output: '   \t  ',
  },
  {
    name: 'trailing newline',
    input: 'stash x = 1\n',
    output: 'const x = 1\n',
  },
  {
    name: 'Windows CRLF',
    input: 'stash x\r\nbit y\r\n',
    output: 'const x\r\nlet y\r\n',
  },
  {
    name: 'shebang untouched',
    input: '#!/usr/bin/env node',
    output: '#!/usr/bin/env node',
  },
  {
    name: 'shebang then ork',
    input: '#!/usr/bin/env node\nstash x',
    output: '#!/usr/bin/env node\nconst x',
  },
  {
    name: 'unicode löot is not loot',
    input: 'löot',
    output: 'löot',
  },
  {
    name: 'emoji in comments stay',
    input: '// 🔥 loot nob',
    output: '// 🔥 loot nob',
  },
];

describe('lexer traps', () => {
  for (const row of rows) {
    test(row.name, () => {
      assert.equal(transliterate(row.input).typescript, row.output);
    });
  }
});

describe('GRETCHIN worker template fixture', () => {
  test('zero replacements inside the gun worker template', () => {
    const { typescript, map } = transliterate(gretchinBlob);
    assert.equal(typescript, gretchinBlob);
    assert.equal(map.mappings.length, 0);
  });

  test('Ork outside the template paints only the outside', () => {
    const input = `bark nob wrap() {\n${gretchinBlob}\n  loot 1;\n}`;
    const output = `export function wrap() {\n${gretchinBlob}\n  return 1;\n}`;
    assert.equal(transliterate(input).typescript, output);
  });
});
