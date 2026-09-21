import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import typescript from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDirectory = join(here, 'fixtures/brains');

function readFixture(name: string): string {
  return readFileSync(join(fixturesDirectory, name), 'utf8');
}

type Files = Record<string, string>;

async function createOrkLanguageService(files: Files): Promise<{
  languageService: typescript.LanguageService;
}> {
  const brains = (await import('../src/languageServicePlugin.ts')) as {
    patchLanguageServiceHost: (
      host: typescript.LanguageServiceHost,
      ts: typeof typescript,
    ) => typescript.LanguageServiceHost;
    decorateLanguageService: (
      languageService: typescript.LanguageService,
      host: typescript.LanguageServiceHost,
      ts: typeof typescript,
    ) => typescript.LanguageService;
  };
  const { patchLanguageServiceHost, decorateLanguageService } = brains;

  const fileNames = Object.keys(files);
  const versions = new Map(fileNames.map((fileName) => [fileName, '0']));

  const rawHost: typescript.LanguageServiceHost = {
    getScriptFileNames: () => fileNames,
    getScriptVersion: (fileName) => versions.get(fileName) ?? '0',
    getScriptSnapshot: (fileName) => {
      const text = files[fileName];
      return text === undefined ? undefined : typescript.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => fixturesDirectory,
    getCompilationSettings: () => ({
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ES2022,
      moduleResolution: typescript.ModuleResolutionKind.Bundler,
      strict: true,
    }),
    getDefaultLibFileName: (options) => typescript.getDefaultLibFilePath(options),
    fileExists: (fileName) => files[fileName] !== undefined || typescript.sys.fileExists(fileName),
    readFile: (fileName) => files[fileName] ?? typescript.sys.readFile(fileName),
  };

  const host = patchLanguageServiceHost(rawHost, typescript);
  const languageService = decorateLanguageService(
    typescript.createLanguageService(host, typescript.createDocumentRegistry()),
    host,
    typescript,
  );

  return { languageService };
}

describe('language service: hover paints display text', () => {
  test('getQuickInfoAtPosition on GetDeffGun shows nob and Wazza, never function or Promise', async () => {
    const source = readFixture('hover.ork');
    const { languageService } = await createOrkLanguageService({ 'hover.ork': source });
    const position = source.indexOf('GetDeffGun');
    const quickInfo = languageService.getQuickInfoAtPosition('hover.ork', position);
    assert.ok(quickInfo, 'expected quick info at GetDeffGun');
    const displayText = quickInfo!.displayParts?.map((part) => part.text).join('') ?? '';
    assert.ok(displayText.includes('nob'), `expected 'nob' in display text: ${displayText}`);
    assert.ok(displayText.includes('Wazza'), `expected 'Wazza' in display text: ${displayText}`);
    assert.ok(!displayText.includes('function'), `unexpected 'function' in display text: ${displayText}`);
    assert.ok(!displayText.includes('Promise'), `unexpected 'Promise' in display text: ${displayText}`);
  });
});

describe('language service: completions', () => {
  test('empty type slot after "stash x: " offers a Wazza completion', async () => {
    const source = 'stash x: ';
    const { languageService } = await createOrkLanguageService({ 'slot.ork': source });
    const completions = languageService.getCompletionsAtPosition('slot.ork', source.length, {});
    const names = completions?.entries.map((entry) => entry.insertText ?? entry.name) ?? [];
    assert.ok(names.includes('Wazza'), `expected 'Wazza' among: ${names.join(', ')}`);
  });

  test('cursor after "Waz" completes to Wazza, not Promise, and no leftover Pro… filter', async () => {
    const source = 'stash x: Waz';
    const { languageService } = await createOrkLanguageService({ 'prefix.ork': source });
    const completions = languageService.getCompletionsAtPosition('prefix.ork', source.length, {});
    const names = completions?.entries.map((entry) => entry.insertText ?? entry.name) ?? [];
    assert.ok(names.includes('Wazza'), `expected 'Wazza' among: ${names.join(', ')}`);
    assert.ok(!names.includes('Promise'), `unexpected leftover 'Promise' among: ${names.join(', ')}`);
    assert.ok(
      !names.some((name) => name.startsWith('Pro') && name !== 'Wazza'),
      `unexpected leftover 'Pro…' filter among: ${names.join(', ')}`,
    );
  });
});

describe('language service: squiggle columns', () => {
  test("stash x: kount = 'nope' diagnostic maps to the .ork column of x or 'nope', not a shifted column", async () => {
    const source = "stash x: kount = 'nope';";
    const { languageService } = await createOrkLanguageService({ 'squiggle.ork': source });
    const diagnostics = languageService.getSemanticDiagnostics('squiggle.ork');
    assert.ok(diagnostics.length > 0, 'expected at least one semantic diagnostic');
    const [diagnostic] = diagnostics;
    const start = diagnostic?.start ?? -1;
    const xColumn = source.indexOf('x');
    const nopeColumn = source.indexOf("'nope'");
    assert.ok(
      start === xColumn || start === nopeColumn,
      `diagnostic start ${start} did not map to the .ork column of 'x' (${xColumn}) or "'nope'" (${nopeColumn})`,
    );
  });
});

describe('language service: two-file navigation', () => {
  test('getDefinitionAtPosition on greeting lands in other.ork; references span both files', async () => {
    const mainSource = readFixture('main.ork');
    const otherSource = readFixture('other.ork');
    const { languageService } = await createOrkLanguageService({
      'main.ork': mainSource,
      'other.ork': otherSource,
    });

    const importPosition = mainSource.indexOf('greeting');
    const definitions = languageService.getDefinitionAtPosition('main.ork', importPosition);
    assert.ok(definitions && definitions.length > 0, 'expected a definition for greeting');
    assert.ok(
      definitions!.every((definition) => definition.fileName.endsWith('.ork')),
      'definition file names must stay .ork',
    );
    assert.ok(
      definitions!.some((definition) => definition.fileName.endsWith('other.ork')),
      'expected the definition to land in other.ork',
    );

    const declarationPosition = otherSource.indexOf('greeting');
    const references = languageService.getReferencesAtPosition('other.ork', declarationPosition);
    assert.ok(references && references.length > 0, 'expected references');
    const referenceFiles = new Set(references!.map((reference) => reference.fileName));
    assert.ok(referenceFiles.has('main.ork'), 'expected a reference in main.ork');
    assert.ok(referenceFiles.has('other.ork'), 'expected a reference in other.ork');
  });
});

function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  const upto = text.slice(0, offset);
  const lines = upto.split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

describe('language service: go to definition keeps the Ork line', () => {
  test('a call after several longer English keywords lands on the declaration, not an earlier line', async () => {
    const source = [
      'bark nob a(): kount { loot 1; }',
      'bark nob b(): kount { loot 1; }',
      'bark nob c(): kount { loot 1; }',
      'bark nob target(): kount { loot 1; }',
      'bark nob caller(): kount { loot target(); }',
      '',
    ].join('\n');
    const { languageService } = await createOrkLanguageService({ 'defs.ork': source });
    const call = source.lastIndexOf('target');
    const declaration = source.indexOf('target');
    const definitions = languageService.getDefinitionAtPosition('defs.ork', call);
    assert.ok(definitions && definitions.length > 0, 'expected a definition for target');
    const painted = languageService.getProgram()?.getSourceFile('defs.ork')?.getFullText() ?? '';
    const reported = lineAndColumn(painted, definitions![0]!.textSpan.start);
    const expected = lineAndColumn(source, declaration);
    assert.equal(reported.line, expected.line);
    assert.equal(reported.column, expected.column);
    const reportedEnd = lineAndColumn(painted, definitions![0]!.textSpan.start + definitions![0]!.textSpan.length);
    assert.equal(reportedEnd.line, expected.line);
    assert.equal(reportedEnd.column, expected.column + 'target'.length);
    const contextSpan = definitions![0]!.contextSpan;
    assert.ok(contextSpan, 'expected the declaration context span');
    assert.equal(lineAndColumn(painted, contextSpan.start).line, expected.line);
  });
});

describe('language service: inserted text stays Ork', () => {
  test('a Wazza completion entry never inserts Promise or function', async () => {
    const source = 'stash x: Wazz';
    const { languageService } = await createOrkLanguageService({ 'insert.ork': source });
    const completions = languageService.getCompletionsAtPosition('insert.ork', source.length, {});
    const wazza = completions?.entries.find((entry) => entry.name === 'Wazza');
    assert.ok(wazza, 'expected a Wazza completion entry to inspect its insert text');
    const insertText = wazza!.insertText ?? wazza!.name;
    assert.ok(insertText.includes('Wazza') || insertText.includes('nob'));
    assert.ok(!insertText.includes('Promise'));
    assert.ok(!insertText.includes('function'));
  });
});

describe('language service: tsserver builds the service before the plugin runs', () => {
  test('a service created on the raw host still typechecks painted TypeScript after the host is patched', async () => {
    const brains = (await import('../src/languageServicePlugin.ts')) as {
      patchLanguageServiceHost: (
        host: typescript.LanguageServiceHost,
        ts: typeof typescript,
      ) => typescript.LanguageServiceHost;
      decorateLanguageService: (
        languageService: typescript.LanguageService,
        host: typescript.LanguageServiceHost,
        ts: typeof typescript,
      ) => typescript.LanguageService;
    };
    const source = 'bark nob GetDeffGun(): Wazza<kount> { loot 1; }\n';
    const fileName = 'late.ork';
    const rawHost: typescript.LanguageServiceHost = {
      getScriptFileNames: () => [fileName],
      getScriptVersion: () => '0',
      getScriptSnapshot: (name) =>
        name === fileName ? typescript.ScriptSnapshot.fromString(source) : undefined,
      getCurrentDirectory: () => fixturesDirectory,
      getCompilationSettings: () => ({
        target: typescript.ScriptTarget.ES2022,
        module: typescript.ModuleKind.ES2022,
        moduleResolution: typescript.ModuleResolutionKind.Bundler,
        strict: true,
      }),
      getDefaultLibFileName: (options) => typescript.getDefaultLibFilePath(options),
      fileExists: (name) => typescript.sys.fileExists(name),
      readFile: (name) => typescript.sys.readFile(name),
    };

    const alreadyBuilt = typescript.createLanguageService(rawHost, typescript.createDocumentRegistry());
    const patchedHost = brains.patchLanguageServiceHost(rawHost, typescript);
    const languageService = brains.decorateLanguageService(alreadyBuilt, patchedHost, typescript);

    const checked = languageService.getProgram()?.getSourceFile(fileName)?.getFullText() ?? '';
    assert.match(checked, /export function GetDeffGun/);
    assert.match(checked, /Promise<number>/);
    assert.match(checked, /return 1/);
    assert.doesNotMatch(checked, /\bnob\b/);
    assert.doesNotMatch(checked, /\bloot\b/);
    assert.doesNotMatch(checked, /\bbark\b/);

    const diagnostics = [
      ...languageService.getSyntacticDiagnostics(fileName),
      ...languageService.getSemanticDiagnostics(fileName),
    ];
    const messages = diagnostics.map((diagnostic) =>
      typeof diagnostic.messageText === 'string' ? diagnostic.messageText : diagnostic.messageText.messageText,
    );
    assert.deepEqual(
      messages.filter((message) => /\b(nick|nob|bark|loot|frum|stash)\b/.test(message)),
      [],
    );
  });
});

describe('language service: tsserver resolves one file in one batch', () => {
  test('splitting specifiers does not clear a deferred non-relative watch', async () => {
    const brains = (await import('../src/languageServicePlugin.ts')) as {
      patchLanguageServiceHost: (
        host: typescript.LanguageServiceHost,
        ts: typeof typescript,
      ) => typescript.LanguageServiceHost;
      decorateLanguageService: (
        languageService: typescript.LanguageService,
        host: typescript.LanguageServiceHost,
        ts: typeof typescript,
      ) => typescript.LanguageService;
    };
    const source = "nick { Worker } frum 'node:worker_threads';\nnick { greeting } frum './other.ork';\n";
    const files: Files = {
      'batch.ork': source,
      'other.ork': "bark stash greeting = 'ello';\n",
    };
    const fileNames = Object.keys(files);
    const compilationSettings = {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ES2022,
      moduleResolution: typescript.ModuleResolutionKind.Bundler,
      strict: true,
    };
    type TrackedResolution = { name: string; files: Set<string> | undefined };
    const deferredNonRelativeResolutions: TrackedResolution[] = [];
    const resolutionsPerFile = new Map<string, Map<string, TrackedResolution>>();
    const batches: string[][] = [];

    const rawHost: typescript.LanguageServiceHost = {
      getScriptFileNames: () => fileNames,
      getScriptVersion: () => '0',
      getScriptSnapshot: (fileName) => {
        const text = files[fileName];
        return text === undefined ? undefined : typescript.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => fixturesDirectory,
      getCompilationSettings: () => compilationSettings,
      getDefaultLibFileName: (options) => typescript.getDefaultLibFilePath(options),
      fileExists: (fileName) => files[fileName] !== undefined || typescript.sys.fileExists(fileName),
      readFile: (fileName) => files[fileName] ?? typescript.sys.readFile(fileName),
      resolveModuleNameLiterals(moduleLiterals, containingFile) {
        const names = moduleLiterals.map((literal) => literal.text);
        batches.push(names);
        const seen = new Set(names);
        const existing = resolutionsPerFile.get(containingFile) ?? new Map<string, TrackedResolution>();
        resolutionsPerFile.set(containingFile, existing);
        for (const name of names) {
          if (existing.has(name)) {
            continue;
          }
          const tracked: TrackedResolution = { name, files: new Set([containingFile]) };
          existing.set(name, tracked);
          if (!name.startsWith('.')) {
            deferredNonRelativeResolutions.push(tracked);
          }
        }
        if (existing.size !== seen.size) {
          for (const [name, tracked] of existing) {
            if (!seen.has(name)) {
              tracked.files?.delete(containingFile);
              if (tracked.files?.size === 0) {
                tracked.files = undefined;
              }
              existing.delete(name);
            }
          }
        }
        for (const tracked of deferredNonRelativeResolutions) {
          if (!tracked.files?.size) {
            throw new Error(`Debug Failure. False expression. (${tracked.name})`);
          }
        }
        return moduleLiterals.map(() => ({ resolvedModule: undefined }));
      },
    };

    const alreadyBuilt = typescript.createLanguageService(rawHost, typescript.createDocumentRegistry());
    const patchedHost = brains.patchLanguageServiceHost(rawHost, typescript);
    const languageService = brains.decorateLanguageService(alreadyBuilt, patchedHost, typescript);
    languageService.getSemanticDiagnostics('batch.ork');

    assert.ok(
      batches.some((batch) => batch.includes('node:worker_threads') && batch.includes('./other.ork')),
      `expected one batch containing both specifiers, got ${JSON.stringify(batches)}`,
    );
    const firstSettings = patchedHost.getCompilationSettings();
    const secondSettings = patchedHost.getCompilationSettings();
    assert.equal(firstSettings, secondSettings);
    assert.equal(firstSettings.allowNonTsExtensions, true);
  });
});

describe('language service: classification spans stay on the Ork words', () => {
  function classifiedPieces(source: string, spans: number[]): string[] {
    const pieces: string[] = [];
    for (let index = 0; index + 2 < spans.length; index += 3) {
      const start = spans[index] ?? 0;
      const length = spans[index + 1] ?? 0;
      pieces.push(source.slice(start, start + length));
    }
    return pieces;
  }

  test('syntactic colors use the Ork spelling, including a word past the painted-file length difference', async () => {
    const source = 'nick nick nick nick nick Shoota\n';
    const { languageService } = await createOrkLanguageService({ 'color.ork': source });
    const classifications = languageService.getEncodedSyntacticClassifications('color.ork', {
      start: 0,
      length: source.length,
    });
    const pieces = classifiedPieces(source, classifications.spans);
    assert.equal(pieces.filter((piece) => piece === 'nick').length, 5);
    assert.ok(pieces.includes('Shoota'));
    assert.ok(!pieces.some((piece) => piece.includes('import')));
  });

  test('semantic colors cover Wazza, not the longer Promise spelling', async () => {
    const source = 'bark nob GetDeffGun(): Wazza<kount> { loot 1; }\n';
    const { languageService } = await createOrkLanguageService({ 'semantic.ork': source });
    const classifications = languageService.getEncodedSemanticClassifications(
      'semantic.ork',
      { start: 0, length: source.length },
      typescript.SemanticClassificationFormat.TwentyTwenty,
    );
    const pieces = classifiedPieces(source, classifications.spans);
    assert.ok(pieces.includes('GetDeffGun'), `expected GetDeffGun among ${pieces.join(', ')}`);
    assert.ok(pieces.includes('Wazza'), `expected Wazza among ${pieces.join(', ')}`);
    assert.equal(pieces.find((piece) => piece === 'Wazza')?.length, 'Wazza'.length);
  });
});

describe('language service: non-ork files pass through untouched', () => {
  test('a .ts snapshot is not painted and not reverse-painted', async () => {
    const source = 'const nob = 1;\nfunction real() { return nob; }\n';
    const { languageService } = await createOrkLanguageService({ 'plain.ts': source });
    const snapshot = languageService.getProgram()?.getSourceFile('plain.ts')?.getFullText();
    assert.equal(snapshot, source);
  });
});
