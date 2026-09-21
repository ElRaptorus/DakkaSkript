import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const loaderPath = join(here, '../src/loader.ts');
const fixtures = join(here, '../fixtures');
const tempRoot = join(here, '.tmp');

await mkdir(tempRoot, { recursive: true });
const temporaryDirectories: string[] = [];

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tempRoot, 'loader-'));
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

function spawnWithLoader(entryPath: string, cwd?: string): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', loaderPath, entryPath], {
      cwd,
      env: { ...process.env, FORCE_COLOR: '0' },
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

describe('orkscript loader good paths', () => {
  test('--import paints prints-yeah.ork so it prints true', async () => {
    const result = await spawnWithLoader(join(fixtures, 'prints-yeah.ork'));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'true');
  });

  test('relative nick of another .ork works', async () => {
    const result = await spawnWithLoader(join(fixtures, 'imports-other.ork'));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'waaagh');
  });
});

describe('orkscript loader bad paths', () => {
  test('does not paint ordinary .js so loot stays loot', async () => {
    const directory = await makeTemporaryDirectory();
    const javascriptPath = join(directory, 'loot-stays.js');
    await writeFile(javascriptPath, "const loot = 'untouched';\nconsole.log(loot);\n", 'utf8');
    const result = await spawnWithLoader(javascriptPath);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'untouched');
  });

  test('syntax error after paint exits non-zero', async () => {
    const result = await spawnWithLoader(join(fixtures, 'syntax-error.ork'));
    assert.notEqual(result.code, 0);
    assert.ok(result.stderr.length > 0);
  });
});
