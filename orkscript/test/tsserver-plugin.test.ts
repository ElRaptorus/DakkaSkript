import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');
const bundlePath = join(repoRoot, 'editors/vscode/orkscript-tsserver-plugin/dist/index.cjs');
const require = createRequire(import.meta.url);

type TsserverPluginModule = (options: { typescript: unknown }) => any;

function loadBundle(): TsserverPluginModule {
  return require(bundlePath) as TsserverPluginModule;
}

describe('tsserver plugin bundle', () => {
  test('the bundle exists and module.exports is a function', () => {
    assert.ok(existsSync(bundlePath), `missing bundle at ${bundlePath}`);
    const init = loadBundle();
    assert.equal(typeof init, 'function');
  });

  test('init({ typescript }) returns an object whose only tsserver-relevant own key is create, no getExternalFiles', () => {
    const init = loadBundle();
    const pluginModule = init({ typescript: require('typescript') });
    assert.equal(typeof pluginModule.create, 'function');
    assert.equal(pluginModule.getExternalFiles, undefined, 'must not implement getExternalFiles');
  });

  test('create(info) wraps a classic language service (getQuickInfoAtPosition present) with a different object', () => {
    const init = loadBundle();
    const pluginModule = init({ typescript: require('typescript') });
    const classicLanguageService = { getQuickInfoAtPosition: () => undefined };
    const info = {
      languageService: classicLanguageService,
      languageServiceHost: {},
      project: {},
    };
    const wrapped = pluginModule.create(info);
    assert.notEqual(wrapped, classicLanguageService);
  });

  test('create(info) returns info.languageService unchanged when the classic surface is missing (tsgo stand-in)', () => {
    const init = loadBundle();
    const pluginModule = init({ typescript: require('typescript') });
    const tsgoStandInLanguageService = {};
    const info = {
      languageService: tsgoStandInLanguageService,
      languageServiceHost: {},
      project: {},
    };
    const wrapped = pluginModule.create(info);
    assert.equal(wrapped, tsgoStandInLanguageService);
  });

  test('the bundle source requires typescript externally and does not inline createLanguageService', () => {
    const source = readFileSync(bundlePath, 'utf8');
    assert.match(source, /require\((['"])typescript\1\)/, 'expected an external require("typescript")');
    assert.doesNotMatch(
      source,
      /function createLanguageService/,
      'must not bundle the TypeScript package createLanguageService implementation',
    );
  });
});

describe('editors/vscode/package.json contributes the tsserver plugin', () => {
  test('typescriptServerPlugins names orkscript-tsserver-plugin for the orkscript language', () => {
    const packageJsonPath = join(repoRoot, 'editors/vscode/package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      activationEvents?: string[];
      main?: string;
      contributes?: {
        typescriptServerPlugins?: Array<{ name?: string; languages?: string[] }>;
      };
    };
    assert.ok(
      packageJson.activationEvents?.includes('onLanguage:orkscript'),
      'opening an .ork file must activate the extension',
    );
    assert.equal(packageJson.main, './extension.js');
    const plugins = packageJson.contributes?.typescriptServerPlugins ?? [];
    const plugin = plugins.find((entry) => entry.name === 'orkscript-tsserver-plugin');
    assert.ok(plugin, 'missing typescriptServerPlugins entry named orkscript-tsserver-plugin');
    assert.ok(
      plugin?.languages?.includes('orkscript'),
      'expected languages to include orkscript',
    );
  });
});

describe('orkscript-tsserver-plugin resolves from the extension folder', () => {
  test('createRequire from editors/vscode can require.resolve orkscript-tsserver-plugin to the CJS bundle', () => {
    const extensionRequire = createRequire(join(repoRoot, 'editors/vscode/package.json'));
    const resolvedPath = extensionRequire.resolve('orkscript-tsserver-plugin');
    assert.ok(
      resolvedPath.endsWith('orkscript-tsserver-plugin/dist/index.cjs'),
      `expected resolution to end with orkscript-tsserver-plugin/dist/index.cjs, got ${resolvedPath}`,
    );
  });
});

