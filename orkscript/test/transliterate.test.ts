import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { transliterate } from '../src/transliterate.ts';

const snippets: Array<{ name: string; input: string; output: string }> = [
  {
    name: 'function with return',
    input: 'nob x(){ loot 1 }',
    output: 'function x(){ return 1 }',
  },
  {
    name: 'boss member access paints only boss',
    input: 'boss.shoota',
    output: 'this.shoota',
  },
  {
    name: 'module import and export',
    input: "nick { Wazza } frum 'node:timers';\nbark stash ready = yeah;",
    output: "import { Promise } from 'node:timers';\nexport const ready = true;",
  },
  {
    name: 'class with modifiers and constructor',
    input:
      'bark mek Gun chomps Blasta {\n  sniky grot() {}\n  krumpy stikky flashy kount = 1;\n  nob shoot(){ loot boss; }\n}',
    output:
      'export class Gun implements Blasta {\n  private constructor() {}\n  public static readonly number = 1;\n  function shoot(){ return this; }\n}',
  },
  {
    name: 'class extends',
    input: 'mek Choppa bigga Gun {}',
    output: 'class Choppa extends Gun {}',
  },
  {
    name: 'control flow',
    input: 'ifz (yeah) { stompin (nah) { } } uvver { sluggin (bit i = 0; i < 1; i++) { } }',
    output: 'if (true) { while (false) { } } else { for (let i = 0; i < 1; i++) { } }',
  },
  {
    name: 'try catch throw new Error',
    input: 'rukk { deffblast shuv Urty("e"); } katch (e) {}',
    output: 'try { throw new Error("e"); } catch (e) {}',
  },
  {
    name: 'generics and lib types',
    input:
      'shape Shot = Teef<scrawl, kount>;\nface Box { x: Wazza<scrawl>; y: yeahnah; z: Mob<kount>; }\nstash p = Wazza.all;\nstash m = Mob.from;\nstash k = Rokk.keys;',
    output:
      'type Shot = Record<string, number>;\ninterface Box { x: Promise<string>; y: boolean; z: Array<number>; }\nconst p = Promise.all;\nconst m = Array.from;\nconst k = Object.keys;',
  },
  {
    name: 'async await Promise',
    input: 'bark weird nob run(){ loot waitz Wazza.resolve(1); }',
    output: 'export async function run(){ return await Promise.resolve(1); }',
  },
  {
    name: 'var typeof null undefined-adjacent',
    input: 'runt x = nuffin; wot x;',
    output: 'var x = null; typeof x;',
  },
];

describe('composed transliterate snippets', () => {
  for (const snippet of snippets) {
    test(snippet.name, () => {
      assert.equal(transliterate(snippet.input).typescript, snippet.output);
    });
  }
});
