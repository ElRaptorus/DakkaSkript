import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { SourceMap } from 'node:module';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  collectOrkscriptFiles,
  isOrkscriptSourceFile,
  isTypeScriptOutputFile,
  outputPathForSource,
} from '../src/cliPaths.ts';

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, '../src/cli.ts');
const fixtures = join(here, '../fixtures');
const tempRoot = join(here, '.tmp');

await mkdir(tempRoot, { recursive: true });
const temporaryDirectories: string[] = [];

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tempRoot, 'cli-'));
  temporaryDirectories.push(directory);
  return directory;
}

after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

type SpawnResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

function spawnCli(args: string[], cwd?: string): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function assertOrkError(result: SpawnResult): void {
  assert.notEqual(result.code, 0);
  assert.ok(result.stderr.length > 0);
  assert.doesNotMatch(result.stderr, /^\s*\w+Error:/);
  assert.doesNotMatch(result.stderr, /^\s+at /m);
}

function decodeInlineSourceMap(typescript: string): {
  payload: { sources: string[]; mappings: string; file: string };
  sourceMap: SourceMap;
} {
  const match = typescript.match(
    /\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/,
  );
  assert.ok(match, 'expected inline sourceMappingURL');
  const payload = JSON.parse(Buffer.from(match[1]!, 'base64').toString('utf8'));
  return { payload, sourceMap: new SourceMap(payload) };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('cli path rules', () => {
  test('isOrkscriptSourceFile looks at the last segment, case-insensitive', () => {
    assert.equal(isOrkscriptSourceFile('src/foo.ork'), true);
    assert.equal(isOrkscriptSourceFile('src/foo.ORK'), true);
    assert.equal(isOrkscriptSourceFile('src/foo.ts'), false);
    assert.equal(isOrkscriptSourceFile('src/foo'), false);
    assert.equal(isOrkscriptSourceFile('src/foo.ork.bak'), false);
  });

  test('isTypeScriptOutputFile is only *.ts without a trailing slash', () => {
    assert.equal(isTypeScriptOutputFile('generated/index.ts'), true);
    assert.equal(isTypeScriptOutputFile('painted.TS'), true);
    assert.equal(isTypeScriptOutputFile('generated'), false);
    assert.equal(isTypeScriptOutputFile('generated/'), false);
    assert.equal(isTypeScriptOutputFile('foo.ts/'), false);
    assert.equal(isTypeScriptOutputFile('foo.js'), false);
    assert.equal(isTypeScriptOutputFile('foo.ork'), false);
    assert.equal(isTypeScriptOutputFile('foo.mts'), false);
    assert.equal(isTypeScriptOutputFile('foo.cts'), false);
    assert.equal(isTypeScriptOutputFile('foo.tsx'), false);
  });

  test('outputPathForSource keeps the relative path and swaps the extension', () => {
    assert.equal(
      outputPathForSource(join('/src', 'foo', 'bar.ork'), '/src', '/out'),
      join('/out', 'foo', 'bar.ts'),
    );
  });
});

describe('orkc CLI good paths', () => {
  test('.ork --out writes TypeScript with no leftover Ork identifier keys', async () => {
    const directory = await makeTemporaryDirectory();
    const outputPath = join(directory, 'painted.ts');
    const inputPath = join(fixtures, 'several-words.ork');
    const result = await spawnCli([inputPath, '--out', outputPath]);
    assert.equal(result.code, 0, result.stderr);
    const painted = await readFile(outputPath, 'utf8');
    const body = painted.replace(/\n\/\/# sourceMappingURL=data:application\/json;base64,[A-Za-z0-9+/=]+\n?$/, '');
    assert.match(body, /\bconst\b/);
    assert.match(body, /\btrue\b/);
    assert.match(body, /\blet\b/);
    assert.match(body, /\bfalse\b/);
    assert.match(body, /\bif\b/);
    assert.match(body, /\breturn\b/);
    assert.match(body, /\belse\b/);
    assert.match(body, /\bthrow\b/);
    assert.match(body, /\bnew\b/);
    assert.match(body, /\bError\b/);
    for (const orkWord of [
      'stash',
      'yeah',
      'bit',
      'nah',
      'ifz',
      'loot',
      'uvver',
      'deffblast',
      'shuv',
      'Urty',
    ]) {
      assert.equal(new RegExp(`\\b${orkWord}\\b`).test(body), false, orkWord);
    }
  });

  test('--out creates parent directories', async () => {
    const directory = await makeTemporaryDirectory();
    const outputPath = join(directory, 'deep', 'nested', 'painted.ts');
    const result = await spawnCli([join(fixtures, 'prints-yeah.ork'), '--out', outputPath]);
    assert.equal(result.code, 0, result.stderr);
    const painted = await readFile(outputPath, 'utf8');
    assert.match(painted, /const x = true;/);
  });

  test('no --out prints painted source on stdout and exits 0', async () => {
    const result = await spawnCli([join(fixtures, 'prints-yeah.ork')]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'const x = true; console.log(x)');
    assert.equal(result.stderr, '');
  });

  test('inline VLQ sourcemap is present and sources the original .ork', async () => {
    const directory = await makeTemporaryDirectory();
    const outputPath = join(directory, 'out', 'painted.ts');
    const inputPath = join(fixtures, 'prints-yeah.ork');
    const result = await spawnCli([inputPath, '--out', outputPath]);
    assert.equal(result.code, 0, result.stderr);
    const painted = await readFile(outputPath, 'utf8');
    assert.match(painted, /\/\/# sourceMappingURL=data:application\/json;base64,/);
    const { payload, sourceMap } = decodeInlineSourceMap(painted);
    assert.equal(payload.sources.length, 1);
    assert.ok(payload.sources[0]!.endsWith('prints-yeah.ork'));
    const entry = sourceMap.findEntry(0, 0);
    assert.ok(entry);
    assert.equal(entry.originalSource?.endsWith('prints-yeah.ork'), true);
    assert.equal(entry.originalLine, 0);
    assert.equal(entry.originalColumn, 0);
  });

  test('file + --out directory writes <dir>/<stem>.ts', async () => {
    const directory = await makeTemporaryDirectory();
    const outputDirectory = join(directory, 'generated');
    const result = await spawnCli([join(fixtures, 'prints-yeah.ork'), '--out', outputDirectory]);
    assert.equal(result.code, 0, result.stderr);
    const painted = await readFile(join(outputDirectory, 'prints-yeah.ts'), 'utf8');
    assert.match(painted, /const x = true;/);
    assert.match(painted, /\/\/# sourceMappingURL=data:application\/json;base64,/);
  });

  test('--out foo.ts/ trailing slash + file source is a directory', async () => {
    const directory = await makeTemporaryDirectory();
    const outputDirectory = `${join(directory, 'painted.ts')}/`;
    const result = await spawnCli([join(fixtures, 'prints-yeah.ork'), '--out', outputDirectory]);
    assert.equal(result.code, 0, result.stderr);
    const painted = await readFile(join(directory, 'painted.ts', 'prints-yeah.ts'), 'utf8');
    assert.match(painted, /const x = true;/);
  });

  test('folder + --out mirrors relative .ork paths and leaves other files alone', async () => {
    const directory = await makeTemporaryDirectory();
    const sourceDirectory = join(directory, 'src');
    const outputDirectory = join(directory, 'out');
    await mkdir(join(sourceDirectory, 'nested'), { recursive: true });
    await writeFile(join(sourceDirectory, 'a.ork'), 'stash a = yeah;\n', 'utf8');
    await writeFile(join(sourceDirectory, 'nested', 'b.ork'), 'stash b = nah;\n', 'utf8');
    await writeFile(join(sourceDirectory, 'readme.md'), 'not ork\n', 'utf8');

    const result = await spawnCli([sourceDirectory, '--out', outputDirectory]);
    assert.equal(result.code, 0, result.stderr);

    const paintedA = await readFile(join(outputDirectory, 'a.ts'), 'utf8');
    const paintedB = await readFile(join(outputDirectory, 'nested', 'b.ts'), 'utf8');
    assert.match(paintedA, /const a = true;/);
    assert.match(paintedB, /const b = false;/);
    assert.match(paintedA, /\/\/# sourceMappingURL=data:application\/json;base64,/);
    assert.match(paintedB, /\/\/# sourceMappingURL=data:application\/json;base64,/);
    decodeInlineSourceMap(paintedA);
    decodeInlineSourceMap(paintedB);
    assert.equal(await pathExists(join(outputDirectory, 'readme.md')), false);
  });

  test('--out directory that already exists overwrites .ts', async () => {
    const directory = await makeTemporaryDirectory();
    const sourceDirectory = join(directory, 'src');
    const outputDirectory = join(directory, 'out');
    await mkdir(sourceDirectory, { recursive: true });
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, 'a.ork'), 'stash a = yeah;\n', 'utf8');
    await writeFile(join(outputDirectory, 'a.ts'), 'stale leftover\n', 'utf8');

    const result = await spawnCli([sourceDirectory, '--out', outputDirectory]);
    assert.equal(result.code, 0, result.stderr);
    const painted = await readFile(join(outputDirectory, 'a.ts'), 'utf8');
    assert.match(painted, /const a = true;/);
    assert.doesNotMatch(painted, /stale leftover/);
  });

  test('walk skips node_modules and .git even if they contain a .ork', async () => {
    const directory = await makeTemporaryDirectory();
    const sourceDirectory = join(directory, 'src');
    const outputDirectory = join(directory, 'out');
    await mkdir(join(sourceDirectory, 'node_modules'), { recursive: true });
    await mkdir(join(sourceDirectory, '.git'), { recursive: true });
    await mkdir(join(sourceDirectory, 'lib', 'node_modules'), { recursive: true });
    await writeFile(join(sourceDirectory, 'keep.ork'), 'stash keep = yeah;\n', 'utf8');
    await writeFile(join(sourceDirectory, 'lib', 'keep.ork'), 'stash nested = yeah;\n', 'utf8');
    await writeFile(join(sourceDirectory, 'node_modules', 'hidden.ork'), 'stash hidden = yeah;\n', 'utf8');
    await writeFile(join(sourceDirectory, '.git', 'hidden.ork'), 'stash hidden = yeah;\n', 'utf8');
    await writeFile(join(sourceDirectory, 'lib', 'node_modules', 'hidden.ork'), 'stash nestedHidden = yeah;\n', 'utf8');

    const collected = await collectOrkscriptFiles(sourceDirectory);
    assert.deepEqual(
      collected,
      [join(sourceDirectory, 'keep.ork'), join(sourceDirectory, 'lib', 'keep.ork')].sort((left, right) =>
        left.localeCompare(right),
      ),
    );

    const result = await spawnCli([sourceDirectory, '--out', outputDirectory]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(await pathExists(join(outputDirectory, 'keep.ts')), true);
    assert.equal(await pathExists(join(outputDirectory, 'lib', 'keep.ts')), true);
    assert.equal(await pathExists(join(outputDirectory, 'node_modules')), false);
    assert.equal(await pathExists(join(outputDirectory, '.git')), false);
    assert.equal(await pathExists(join(outputDirectory, 'lib', 'node_modules')), false);
  });

  test('empty folder + --out exits 0 and paints nothing', async () => {
    const directory = await makeTemporaryDirectory();
    const sourceDirectory = join(directory, 'empty');
    const outputDirectory = join(directory, 'out');
    await mkdir(sourceDirectory, { recursive: true });

    const result = await spawnCli([sourceDirectory, '--out', outputDirectory]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Didn't find no \.ork files/i);
    assert.equal(await pathExists(outputDirectory), false);
  });

  test('file + --out into an already-existing directory', async () => {
    const directory = await makeTemporaryDirectory();
    const outputDirectory = join(directory, 'generated');
    await mkdir(outputDirectory, { recursive: true });
    const result = await spawnCli([join(fixtures, 'prints-yeah.ork'), '--out', outputDirectory]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(outputDirectory, 'prints-yeah.ts'), 'utf8'), /const x = true;/);
  });

  test('--out before the source path still paints', async () => {
    const directory = await makeTemporaryDirectory();
    const outputPath = join(directory, 'painted.ts');
    const result = await spawnCli(['--out', outputPath, join(fixtures, 'prints-yeah.ork')]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(outputPath, 'utf8'), /const x = true;/);
  });

  test('relative source and --out are resolved from cwd', async () => {
    const directory = await makeTemporaryDirectory();
    await mkdir(join(directory, 'src'), { recursive: true });
    await writeFile(join(directory, 'src', 'a.ork'), 'stash a = yeah;\n', 'utf8');
    const result = await spawnCli(['src', '--out', 'generated'], directory);
    assert.equal(result.code, 0, result.stderr);
    const painted = await readFile(join(directory, 'generated', 'a.ts'), 'utf8');
    assert.match(painted, /const a = true;/);
    assert.match(painted, /\/\/# sourceMappingURL=data:application\/json;base64,/);
  });

  test('--out . with source src writes relative .ts into cwd', async () => {
    const directory = await makeTemporaryDirectory();
    await mkdir(join(directory, 'src', 'nested'), { recursive: true });
    await writeFile(join(directory, 'src', 'a.ork'), 'stash a = yeah;\n', 'utf8');
    await writeFile(join(directory, 'src', 'nested', 'b.ork'), 'stash b = nah;\n', 'utf8');
    const result = await spawnCli(['src', '--out', '.'], directory);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(directory, 'a.ts'), 'utf8'), /const a = true;/);
    assert.match(await readFile(join(directory, 'nested', 'b.ts'), 'utf8'), /const b = false;/);
  });

  test('--out . with source . writes sibling .ts next to each .ork', async () => {
    const directory = await makeTemporaryDirectory();
    await writeFile(join(directory, 'a.ork'), 'stash a = yeah;\n', 'utf8');
    const result = await spawnCli(['.', '--out', '.'], directory);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(directory, 'a.ts'), 'utf8'), /const a = true;/);
    assert.equal(await pathExists(join(directory, 'a.ork')), true);
  });

  test('--out inside the source tree is allowed', async () => {
    const directory = await makeTemporaryDirectory();
    const sourceDirectory = join(directory, 'src');
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, 'a.ork'), 'stash a = yeah;\n', 'utf8');
    const result = await spawnCli([sourceDirectory, '--out', sourceDirectory]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(sourceDirectory, 'a.ts'), 'utf8'), /const a = true;/);
    assert.equal(await pathExists(join(sourceDirectory, 'a.ork')), true);
  });

  test('orphan .ts files are left alone (no --clean)', async () => {
    const directory = await makeTemporaryDirectory();
    const sourceDirectory = join(directory, 'src');
    const outputDirectory = join(directory, 'out');
    await mkdir(sourceDirectory, { recursive: true });
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, 'a.ork'), 'stash a = yeah;\n', 'utf8');
    await writeFile(join(outputDirectory, 'orphan.ts'), 'leave me\n', 'utf8');
    const result = await spawnCli([sourceDirectory, '--out', outputDirectory]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(outputDirectory, 'a.ts'), 'utf8'), /const a = true;/);
    assert.equal(await readFile(join(outputDirectory, 'orphan.ts'), 'utf8'), 'leave me\n');
  });

  test('uppercase .ORK paints to .ts', async () => {
    const directory = await makeTemporaryDirectory();
    const inputPath = join(directory, 'FOO.ORK');
    await writeFile(inputPath, 'stash a = yeah;\n', 'utf8');
    const result = await spawnCli([inputPath, '--out', join(directory, 'out')]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(directory, 'out', 'FOO.ts'), 'utf8'), /const a = true;/);
  });

  test('--out foo.mts is a directory, not a file', async () => {
    const directory = await makeTemporaryDirectory();
    const outputDirectory = join(directory, 'foo.mts');
    const result = await spawnCli([join(fixtures, 'prints-yeah.ork'), '--out', outputDirectory]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(outputDirectory, 'prints-yeah.ts'), 'utf8'), /const x = true;/);
  });

  test('folder + --out foo.ts/ trailing slash is a directory', async () => {
    const directory = await makeTemporaryDirectory();
    const sourceDirectory = join(directory, 'src');
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, 'a.ork'), 'stash a = yeah;\n', 'utf8');
    const outputDirectory = `${join(directory, 'painted.ts')}/`;
    const result = await spawnCli([sourceDirectory, '--out', outputDirectory]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(directory, 'painted.ts', 'a.ts'), 'utf8'), /const a = true;/);
  });

  test('symlink to a .ork file is followed and painted', async () => {
    const directory = await makeTemporaryDirectory();
    const realPath = join(directory, 'real.ork');
    const linkPath = join(directory, 'link.ork');
    await writeFile(realPath, 'stash a = yeah;\n', 'utf8');
    await symlink(realPath, linkPath);
    const outputPath = join(directory, 'painted.ts');
    const result = await spawnCli([linkPath, '--out', outputPath]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(outputPath, 'utf8'), /const a = true;/);
  });

  test('symlink to a directory is followed once', async () => {
    const directory = await makeTemporaryDirectory();
    const outside = join(directory, 'outside');
    const sourceDirectory = join(directory, 'src');
    await mkdir(join(outside, 'nested'), { recursive: true });
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(outside, 'nested', 'x.ork'), 'stash x = yeah;\n', 'utf8');
    await symlink(outside, join(sourceDirectory, 'sub'));
    const outputDirectory = join(directory, 'out');
    const result = await spawnCli([sourceDirectory, '--out', outputDirectory]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(outputDirectory, 'sub', 'nested', 'x.ts'), 'utf8'), /const x = true;/);
  });

  test('symlink loop does not hang and still paints real files', async () => {
    const directory = await makeTemporaryDirectory();
    const sideA = join(directory, 'a');
    const sideB = join(directory, 'b');
    await mkdir(sideA, { recursive: true });
    await mkdir(sideB, { recursive: true });
    await symlink(sideB, join(sideA, 'loop'));
    await symlink(sideA, join(sideB, 'loop'));
    await writeFile(join(sideA, 'keep.ork'), 'stash keep = yeah;\n', 'utf8');
    const outputDirectory = join(directory, 'out');
    const result = await spawnCli([sideA, '--out', outputDirectory]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(outputDirectory, 'keep.ts'), 'utf8'), /const keep = true;/);
    assert.equal(await pathExists(join(outputDirectory, 'loop', 'loop')), false);
  });
});

describe('orkc CLI bad paths', () => {
  test('missing input path', async () => {
    const result = await spawnCli([]);
    assertOrkError(result);
    assert.match(result.stderr, /nuffin/i);
  });

  test('input file does not exist', async () => {
    const directory = await makeTemporaryDirectory();
    const result = await spawnCli([join(directory, 'no-such.ork')]);
    assertOrkError(result);
    assert.match(result.stderr, /ain't there/i);
  });

  test('folder + no --out is an error', async () => {
    const directory = await makeTemporaryDirectory();
    const result = await spawnCli([directory]);
    assertOrkError(result);
    assert.match(result.stderr, /needs --out/i);
  });

  test('file that is not .ork is an error with or without --out', async () => {
    const directory = await makeTemporaryDirectory();
    for (const fileName of ['humie.ts', 'foo', 'foo.ork.bak']) {
      const inputPath = join(directory, fileName);
      await writeFile(inputPath, 'stash x = yeah;\n', 'utf8');
      const withoutOut = await spawnCli([inputPath]);
      assertOrkError(withoutOut);
      assert.match(withoutOut.stderr, /ain't an \.ork/i, fileName);
      const withOut = await spawnCli([inputPath, '--out', join(directory, `${fileName}.out.ts`)]);
      assertOrkError(withOut);
      assert.match(withOut.stderr, /ain't an \.ork/i, fileName);
    }
  });

  test('folder + --out file.ts is an error', async () => {
    const directory = await makeTemporaryDirectory();
    await writeFile(join(directory, 'a.ork'), 'stash a = yeah;\n', 'utf8');
    const result = await spawnCli([directory, '--out', join(directory, 'bundle.ts')]);
    assertOrkError(result);
    assert.match(result.stderr, /whole folder into one \.ts/i);
  });

  test('--out classified as a directory but is an existing file', async () => {
    const directory = await makeTemporaryDirectory();
    const blockingFile = join(directory, 'generated');
    await writeFile(blockingFile, 'not a folder\n', 'utf8');
    const result = await spawnCli([join(fixtures, 'prints-yeah.ork'), '--out', blockingFile]);
    assertOrkError(result);
    assert.match(result.stderr, /already a file, not a folder/i);
  });

  test('--out foo.ts exists as a directory', async () => {
    const directory = await makeTemporaryDirectory();
    const outputPath = join(directory, 'painted.ts');
    await mkdir(outputPath, { recursive: true });
    const result = await spawnCli([join(fixtures, 'prints-yeah.ork'), '--out', outputPath]);
    assertOrkError(result);
    assert.match(result.stderr, /Can't write dere/i);
  });

  test('extra garbage argv is rejected', async () => {
    const flagged = await spawnCli([join(fixtures, 'prints-yeah.ork'), '--wat']);
    assertOrkError(flagged);
    assert.match(flagged.stderr, /gubbinz/i);

    const extra = await spawnCli([join(fixtures, 'prints-yeah.ork'), 'extra.ork']);
    assertOrkError(extra);
    assert.match(extra.stderr, /gubbinz/i);
  });

  test('--out with no path is an error', async () => {
    const missing = await spawnCli([join(fixtures, 'prints-yeah.ork'), '--out']);
    assertOrkError(missing);
    assert.match(missing.stderr, /didn't say where/i);

    const dashValue = await spawnCli([join(fixtures, 'prints-yeah.ork'), '--out', '--wat']);
    assertOrkError(dashValue);
    assert.match(dashValue.stderr, /didn't say where/i);
  });

  test('folder + --out that is an existing non-.ts file is an error', async () => {
    const directory = await makeTemporaryDirectory();
    await writeFile(join(directory, 'a.ork'), 'stash a = yeah;\n', 'utf8');
    const blockingFile = join(directory, 'generated');
    await writeFile(blockingFile, 'not a folder\n', 'utf8');
    const result = await spawnCli([directory, '--out', blockingFile]);
    assertOrkError(result);
    assert.match(result.stderr, /already a file, not a folder/i);
  });

  test('folder + --out foo.ts still errors when foo.ts is a directory', async () => {
    const directory = await makeTemporaryDirectory();
    await writeFile(join(directory, 'a.ork'), 'stash a = yeah;\n', 'utf8');
    const outputPath = join(directory, 'bundle.ts');
    await mkdir(outputPath, { recursive: true });
    const result = await spawnCli([directory, '--out', outputPath]);
    assertOrkError(result);
    assert.match(result.stderr, /whole folder into one \.ts/i);
  });

  test('two .ork files that would paint onto the same .ts is an error', async () => {
    const directory = await makeTemporaryDirectory();
    const sourceDirectory = join(directory, 'src');
    const outputDirectory = join(directory, 'out');
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, 'a.ork'), 'stash a = yeah;\n', 'utf8');
    await writeFile(join(sourceDirectory, 'a.ORK'), 'stash b = nah;\n', 'utf8');
    const result = await spawnCli([sourceDirectory, '--out', outputDirectory]);
    assertOrkError(result);
    assert.match(result.stderr, /same \.ts/i);
    assert.equal(await pathExists(join(outputDirectory, 'a.ts')), false);
  });
});
