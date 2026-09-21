import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { IGrammar, IRawGrammar, Registry as RegistryType } from 'vscode-textmate';
import dictionaryJson from '../dictionary.json' with { type: 'json' };

const dictionary: Record<string, string> = dictionaryJson;
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');
const fixtures = join(here, '../fixtures');
const paintScriptPath = join(here, '../scripts/paint-grammar.mjs');
const textMateGrammarPath = join(repoRoot, 'editors/vscode/syntaxes/orkscript.tmLanguage.json');
const highlightsPath = join(repoRoot, 'editors/zed/languages/orkscript/highlights.scm');
const vscodePackagePath = join(repoRoot, 'editors/vscode/package.json');
const snapshotPath = join(fixtures, 'highlights-snapshot.txt');

const requireFromHere = createRequire(import.meta.url);

const PRIMITIVE_TYPE_WORDS = new Set(['kount', 'scrawl', 'yeahnah']);
const CONSTRUCTOR_WORDS = new Set(['Wazza', 'Urty', 'Mob', 'Rokk', 'Teef']);
const KEYWORD_WORDS = Object.keys(dictionary).filter(
  (orkWord) => !PRIMITIVE_TYPE_WORDS.has(orkWord) && !CONSTRUCTOR_WORDS.has(orkWord),
);
const SACRED_IDENTIFIERS = ['waaagh', 'GetDeffGun', 'Dakka'];

const KEYWORD_SCOPE = /keyword|storage\.(?:type|modifier)|constant\.language|variable\.language/;
const PRIMITIVE_TYPE_SCOPE = /support\.type/;
const CLASS_TYPE_SCOPE = /support\.class|entity\.name\.type/;
const STRING_OR_TEMPLATE_SCOPE = /string|template/;
const COMMENT_SCOPE = /comment/;
const NUMBER_SCOPE = /numeric|number/;
const KEYWORD_OR_TYPE_SCOPE = /keyword|support\.type|support\.class|entity\.name\.type/;

type GrammarToken = {
  lineNumber: number;
  line: string;
  startIndex: number;
  endIndex: number;
  text: string;
  scopes: string[];
};

function loadOnigurumaWasmBytes(): Buffer {
  const wasmPath = requireFromHere.resolve('vscode-oniguruma/release/onig.wasm');
  return readFileSync(wasmPath);
}

async function loadOrkscriptGrammar(): Promise<IGrammar> {
  const vscodeOniguruma = requireFromHere('vscode-oniguruma') as {
    loadWASM: (data: Buffer | ArrayBuffer | Uint8Array) => Promise<void>;
    createOnigScanner: (patterns: string[]) => unknown;
    createOnigString: (value: string) => unknown;
  };
  const vscodeTextmate = requireFromHere('vscode-textmate') as {
    Registry: new (options: {
      onigLib: Promise<{
        createOnigScanner: typeof vscodeOniguruma.createOnigScanner;
        createOnigString: typeof vscodeOniguruma.createOnigString;
      }>;
      loadGrammar: (scopeName: string) => Promise<IRawGrammar | null>;
      parseRawGrammar?: (content: string, filePath: string) => IRawGrammar;
    }) => RegistryType;
    parseRawGrammar: (content: string, filePath: string) => IRawGrammar;
    INITIAL: unknown;
  };

  const wasmBytes = loadOnigurumaWasmBytes();
  await vscodeOniguruma.loadWASM(wasmBytes);

  const registry = new vscodeTextmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: vscodeOniguruma.createOnigScanner,
      createOnigString: vscodeOniguruma.createOnigString,
    }),
    loadGrammar: async (scopeName) => {
      if (scopeName !== 'source.orkscript') {
        return null;
      }
      return vscodeTextmate.parseRawGrammar(readFileSync(textMateGrammarPath, 'utf8'), textMateGrammarPath);
    },
  });

  const grammar = await registry.loadGrammar('source.orkscript');
  assert.ok(grammar, 'failed to load source.orkscript');
  return grammar;
}

function tokenize(grammar: IGrammar, source: string): GrammarToken[] {
  const vscodeTextmate = requireFromHere('vscode-textmate') as { INITIAL: unknown };
  const lines = source.split('\n');
  let ruleStack = vscodeTextmate.INITIAL as Parameters<IGrammar['tokenizeLine']>[1];
  const tokens: GrammarToken[] = [];
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber]!;
    const lineResult = grammar.tokenizeLine(line, ruleStack);
    ruleStack = lineResult.ruleStack;
    for (const token of lineResult.tokens) {
      tokens.push({
        lineNumber,
        line,
        startIndex: token.startIndex,
        endIndex: token.endIndex,
        text: line.slice(token.startIndex, token.endIndex),
        scopes: token.scopes,
      });
    }
  }
  return tokens;
}

function hasScope(token: GrammarToken, pattern: RegExp): boolean {
  return token.scopes.some((scope) => pattern.test(scope));
}

function exactTokens(tokens: GrammarToken[], word: string): GrammarToken[] {
  return tokens.filter((token) => token.text === word);
}

function firstExact(tokens: GrammarToken[], word: string): GrammarToken {
  const matches = exactTokens(tokens, word);
  assert.ok(matches.length > 0, `expected a token exactly equal to ${JSON.stringify(word)}`);
  return matches[0]!;
}

function statementKeywordToken(tokens: GrammarToken[], word: string): GrammarToken {
  const matches = exactTokens(tokens, word).filter((token) => {
    const previous = token.line.slice(0, token.startIndex);
    return !previous.endsWith('.');
  });
  assert.ok(
    matches.length > 0,
    `expected ${JSON.stringify(word)} as a statement/type token, not only after '.'`,
  );
  return matches[0]!;
}

const grammar = await loadOrkscriptGrammar();
const everyWordSource = readFileSync(join(fixtures, 'every-word.ork'), 'utf8');
const gunSnippetSource = readFileSync(join(fixtures, 'gun-snippet.ork'), 'utf8');
const gretchinTemplateSource = readFileSync(join(fixtures, 'gretchin-template.ork'), 'utf8');
const everyWordTokens = tokenize(grammar, everyWordSource);
const gunSnippetTokens = tokenize(grammar, gunSnippetSource);
const gretchinTemplateTokens = tokenize(grammar, gretchinTemplateSource);
const highlights = readFileSync(highlightsPath, 'utf8');
const snapshot = readFileSync(snapshotPath, 'utf8');
const textMateGrammar = readFileSync(textMateGrammarPath, 'utf8');

describe('every-word.ork contains each dictionary key', () => {
  for (const orkWord of Object.keys(dictionary)) {
    test(`${orkWord} appears in every-word.ork`, () => {
      assert.ok(
        new RegExp(`(?<![A-Za-z0-9_])${orkWord}(?![A-Za-z0-9_])`).test(everyWordSource),
        `missing ${orkWord}`,
      );
    });
  }
});

describe('TextMate: structure/control/async keywords are keyword-coloured', () => {
  for (const orkWord of KEYWORD_WORDS) {
    test(`${orkWord} has a keyword/storage/constant/this scope`, () => {
      const token = statementKeywordToken(everyWordTokens, orkWord);
      assert.ok(
        hasScope(token, KEYWORD_SCOPE),
        `${orkWord} scopes: ${token.scopes.join(', ')}`,
      );
    });
  }
});

describe('TextMate: primitive types', () => {
  for (const orkWord of PRIMITIVE_TYPE_WORDS) {
    test(`${orkWord} matches support.type`, () => {
      const token = statementKeywordToken(everyWordTokens, orkWord);
      assert.ok(hasScope(token, PRIMITIVE_TYPE_SCOPE), `${orkWord} scopes: ${token.scopes.join(', ')}`);
    });
  }
});

describe('TextMate: lib constructors / types', () => {
  for (const orkWord of CONSTRUCTOR_WORDS) {
    test(`${orkWord} matches support.class or entity.name.type`, () => {
      const token = statementKeywordToken(everyWordTokens, orkWord);
      assert.ok(hasScope(token, CLASS_TYPE_SCOPE), `${orkWord} scopes: ${token.scopes.join(', ')}`);
    });
  }
});

describe('TextMate: English twins still colour', () => {
  test('function is keyword/storage coloured', () => {
    const token = firstExact(everyWordTokens, 'function');
    assert.ok(hasScope(token, KEYWORD_SCOPE), token.scopes.join(', '));
  });

  test('number matches support.type', () => {
    const token = firstExact(everyWordTokens, 'number');
    assert.ok(hasScope(token, PRIMITIVE_TYPE_SCOPE), token.scopes.join(', '));
  });

  test('Promise matches support.class or entity.name.type', () => {
    const token = firstExact(everyWordTokens, 'Promise');
    assert.ok(hasScope(token, CLASS_TYPE_SCOPE), token.scopes.join(', '));
  });
});

describe('TextMate: gun-snippet.ork strings, comments, numbers', () => {
  test('quoted string has a string scope', () => {
    const stringTokens = gunSnippetTokens.filter((token) => hasScope(token, /string/));
    assert.ok(stringTokens.some((token) => token.text.includes('WAAAGH')));
  });

  test('// line comment has a comment scope', () => {
    const line = gunSnippetTokens.filter((token) => token.line.includes('// line comment'));
    assert.ok(line.some((token) => hasScope(token, COMMENT_SCOPE)));
  });

  test('/* block comment */ has a comment scope', () => {
    const line = gunSnippetTokens.filter((token) => token.line.includes('block comment'));
    assert.ok(line.some((token) => hasScope(token, COMMENT_SCOPE)));
  });

  test('number 41 looks like a number', () => {
    const token = firstExact(gunSnippetTokens, '41');
    assert.ok(hasScope(token, NUMBER_SCOPE), token.scopes.join(', '));
  });
});

describe('TextMate: sacred identifiers are not keyword/type', () => {
  for (const identifier of SACRED_IDENTIFIERS) {
    test(`${identifier} is not keyword/type/class scoped`, () => {
      const matches = exactTokens(everyWordTokens, identifier);
      assert.ok(matches.length > 0, `missing ${identifier}`);
      for (const token of matches) {
        assert.ok(
          !hasScope(token, KEYWORD_OR_TYPE_SCOPE),
          `${identifier} scopes: ${token.scopes.join(', ')}`,
        );
      }
    });
  }
});

describe('TextMate: GRETCHIN template contents are strings', () => {
  const insideTemplate = gretchinTemplateTokens.filter((token) => hasScope(token, STRING_OR_TEMPLATE_SCOPE));

  for (const word of ['const', 'Promise', 'instanceof']) {
    test(`${word} inside backticks is string/template, not keyword/type`, () => {
      const hits = insideTemplate.filter((token) => token.text.includes(word));
      assert.ok(hits.length > 0, `expected ${word} inside the template string`);
      for (const token of hits) {
        assert.ok(hasScope(token, STRING_OR_TEMPLATE_SCOPE), token.scopes.join(', '));
        assert.ok(!hasScope(token, KEYWORD_OR_TYPE_SCOPE), token.scopes.join(', '));
      }
    });
  }
});

describe('TextMate: foo.loot member access', () => {
  test('loot after `.` is not a keyword scope', () => {
    const lineTokens = everyWordTokens.filter((token) => token.line.includes('foo.loot'));
    const lootToken = lineTokens.find((token) => token.text === 'loot');
    assert.ok(lootToken, 'expected loot on the foo.loot line');
    const previous = lootToken.line.slice(0, lootToken.startIndex);
    assert.ok(previous.endsWith('.'), 'loot on foo.loot must follow `.`');
    assert.ok(!hasScope(lootToken, /keyword/), lootToken.scopes.join(', '));
  });
});

describe('VS Code language extensions', () => {
  test('contributes.languages[].extensions is exactly [".ork"]', () => {
    const vscodePackage = JSON.parse(readFileSync(vscodePackagePath, 'utf8')) as {
      contributes: { languages: Array<{ extensions: string[] }> };
    };
    const extensions = vscodePackage.contributes.languages.map((language) => language.extensions);
    assert.deepEqual(extensions, [['.ork']]);
    for (const languageExtensions of extensions) {
      assert.ok(!languageExtensions.includes('.ts'));
      assert.ok(!languageExtensions.includes('.ork.ts'));
    }
  });
});

describe('Zed highlights snapshot', () => {
  test('nob is captured as @keyword', () => {
    assert.match(snapshot, /^nob @keyword$/m);
  });

  test('template contents are @string', () => {
    assert.match(snapshot, /^template contents @string$/m);
  });

  for (const orkWord of Object.keys(dictionary)) {
    test(`${orkWord} appears in highlights.scm`, () => {
      assert.ok(highlights.includes(`"${orkWord}"`), `missing "${orkWord}" in highlights.scm`);
    });
  }

  test('waaagh is not in keyword/type lists', () => {
    assert.ok(!highlights.includes('"waaagh"'));
    assert.ok(!highlights.includes('"GetDeffGun"'));
    assert.ok(!highlights.includes('"Dakka"'));
  });

  test('snapshot lists every dictionary key with the painted capture', () => {
    for (const orkWord of KEYWORD_WORDS) {
      assert.match(snapshot, new RegExp(`^${orkWord} @keyword$`, 'm'));
    }
    for (const orkWord of PRIMITIVE_TYPE_WORDS) {
      assert.match(snapshot, new RegExp(`^${orkWord} @type$`, 'm'));
    }
    for (const orkWord of CONSTRUCTOR_WORDS) {
      assert.match(snapshot, new RegExp(`^${orkWord} @constructor$`, 'm'));
    }
  });
});

describe('stale-grammar: paint-grammar.mjs matches committed files', () => {
  test('every dictionary key appears in both generated grammars', () => {
    for (const orkWord of Object.keys(dictionary)) {
      assert.ok(textMateGrammar.includes(`|${orkWord}`), `tmLanguage missing |${orkWord}`);
      assert.ok(highlights.includes(`"${orkWord}"`), `highlights.scm missing "${orkWord}"`);
    }
  });

  test('running paint-grammar.mjs is byte-equal to committed tmLanguage and highlights.scm', () => {
    const beforeTextMate = readFileSync(textMateGrammarPath);
    const beforeHighlights = readFileSync(highlightsPath);
    const result = spawnSync(process.execPath, [paintScriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(textMateGrammarPath), beforeTextMate);
    assert.deepEqual(readFileSync(highlightsPath), beforeHighlights);
  });
});
