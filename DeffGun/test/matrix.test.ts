import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { GetDeffGun } from '../dist/index.js';

const BROKEN_SHOOTA = 'SHOOTA IZ BROKEN! WHERE HAZ U BEEN PUTTIN IT!?';
const generatedPath = join(dirname(fileURLToPath(import.meta.url)), '../generated/index.ts');

function stripInlineSourceMap(source: string): string {
  return source.replace(/\n\/\/# sourceMappingURL=data:application\/json;base64,[A-Za-z0-9+/=]+\n?$/, '');
}

function generatedBodyOutsideGretchin(): { painted: string; gretchin: string; outside: string } {
  const painted = stripInlineSourceMap(readFileSync(generatedPath, 'utf8'));
  const gretchinMatch = painted.match(/const GRETCHIN = `([\s\S]*?)`;/);
  assert.ok(gretchinMatch, 'generated gun is missing the GRETCHIN worker template');
  const outside = painted.replace(/const GRETCHIN = `[\s\S]*?`;/, '');
  return { painted, gretchin: gretchinMatch[1]!, outside };
}

function hasBareIdentifier(source: string, identifier: string): boolean {
  return new RegExp(`\\b${identifier}\\b`).test(source);
}

describe('dakka math', () => {
  test('GetDeffGun(() => 1).Dakka().Dakka().waaagh() yields two shots', async () => {
    const shots = await GetDeffGun(() => 1).Dakka().Dakka().waaagh();
    assert.deepEqual(shots, [1, 1]);
  });

  test('Dakka(n) adds 1 * times shots', async () => {
    const shots = await GetDeffGun((shotIndex, dakkaCount) => `${shotIndex}/${dakkaCount}`)
      .Dakka(4)
      .waaagh();
    assert.equal(shots.length, 1 * 4);
    assert.deepEqual(shots, ['0/4', '1/4', '2/4', '3/4']);
  });

  test('DakkaDakka(n) adds 2 * times shots', async () => {
    const shots = await GetDeffGun((shotIndex) => shotIndex)
      .DakkaDakka()
      .DakkaDakka(3)
      .waaagh();
    assert.equal(shots.length, 2 * 1 + 2 * 3);
    assert.deepEqual(shots, [0, 1, 2, 3, 4, 5, 6, 7]);
  });

  test('DakkaDakkaDakka(n) adds 3 * times shots', async () => {
    const shots = await GetDeffGun(() => 'boom')
      .DakkaDakkaDakka()
      .DakkaDakkaDakka(2)
      .waaagh();
    assert.equal(shots.length, 3 * 1 + 3 * 2);
  });

  test('mixed Dakka flavours add together', async () => {
    const shots = await GetDeffGun((shotIndex) => shotIndex)
      .Dakka(2)
      .DakkaDakka(2)
      .DakkaDakkaDakka(2)
      .waaagh();
    assert.equal(shots.length, 1 * 2 + 2 * 2 + 3 * 2);
  });

  test('empty dakka yields an empty mob', async () => {
    assert.deepEqual(await GetDeffGun(() => 1).waaagh(), []);
    assert.deepEqual(await GetDeffGun(() => 1).WAAAAGH(), []);
    assert.deepEqual(await GetDeffGun(() => 1).WAAAAAAAAGH(), []);
  });
});

describe('waaagh flavours', () => {
  test('WAAAAGH fires shots in parallel', async () => {
    let inflight = 0;
    let peak = 0;
    const shots = await GetDeffGun(async (shotIndex) => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      await new Promise((resolve) => setTimeout(resolve, 40));
      inflight -= 1;
      return shotIndex;
    })
      .Dakka(4)
      .WAAAAGH();
    assert.deepEqual(shots, [0, 1, 2, 3]);
    assert.ok(peak > 1, `expected overlapping shots, peak was ${peak}`);
  });

  test('WAAAAAAAAGH worker path with a named function shoota', async () => {
    function shoota(shotIndex, dakkaCount) {
      return shotIndex * 10 + dakkaCount;
    }
    const shots = await GetDeffGun(shoota).DakkaDakkaDakka().WAAAAAAAAGH();
    assert.deepEqual(shots, [3, 13, 23]);
  });
});

describe('broken shootas', () => {
  test('native shoota on WAAAAAAAAGH throws the broken-shoota error', async () => {
    await assert.rejects(() => GetDeffGun(Math.abs).Dakka().WAAAAAAAAGH(), { message: BROKEN_SHOOTA });
  });

  test('arrow shoota on WAAAAAAAAGH throws the broken-shoota error', async () => {
    await assert.rejects(() => GetDeffGun(() => 1).Dakka().WAAAAAAAAGH(), { message: BROKEN_SHOOTA });
  });
});

describe('painted output', () => {
  test('generated TypeScript keeps English identifiers and GRETCHIN English', () => {
    const { painted, gretchin, outside } = generatedBodyOutsideGretchin();

    assert.equal(hasBareIdentifier(outside, 'function'), true);
    assert.equal(hasBareIdentifier(outside, 'return'), true);
    assert.equal(hasBareIdentifier(outside, 'Promise'), true);
    assert.equal(hasBareIdentifier(outside, 'Array'), true);

    assert.equal(hasBareIdentifier(outside, 'nob'), false);
    assert.equal(hasBareIdentifier(outside, 'loot'), false);
    assert.equal(hasBareIdentifier(outside, 'Wazza'), false);
    assert.equal(hasBareIdentifier(outside, 'Mob'), false);

    assert.match(gretchin, /\brequire\b/);
    assert.match(gretchin, /\binstanceof\b/);
    assert.match(gretchin, /\bError\b/);
    assert.match(gretchin, /\bconst\b/);
    assert.match(gretchin, /\basync\b/);
    assert.match(gretchin, /ok: true, result: STOMPED_HUMIE/);

    assert.match(painted, /export type Shoota/);
    assert.match(painted, /export interface Blasta/);
    assert.match(painted, /export function GetDeffGun/);
    assert.match(painted, /\bDakka\(/);
    assert.match(painted, /\bwaaagh\(/);
    assert.match(painted, /\bWAAAAGH\(/);
    assert.match(painted, /\bWAAAAAAAAGH\(/);
  });

  test('public export names are unchanged at runtime', () => {
    assert.equal(typeof GetDeffGun, 'function');
    const gun = GetDeffGun(() => 1);
    assert.equal(typeof gun.Dakka, 'function');
    assert.equal(typeof gun.DakkaDakka, 'function');
    assert.equal(typeof gun.DakkaDakkaDakka, 'function');
    assert.equal(typeof gun.waaagh, 'function');
    assert.equal(typeof gun.WAAAAGH, 'function');
    assert.equal(typeof gun.WAAAAAAAAGH, 'function');
  });
});
