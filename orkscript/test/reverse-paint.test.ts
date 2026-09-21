import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import dictionaryJson from '../dictionary.json' with { type: 'json' };

const dictionary: Record<string, string> = dictionaryJson;

async function loadReversePaint(): Promise<(source: string) => string> {
  const module = (await import('../src/reversePaint.ts')) as {
    reversePaint: (source: string) => string;
  };
  return module.reversePaint;
}

describe('dictionary values are unique (reverse-paint precondition)', () => {
  test('every English value maps back to exactly one Ork key', () => {
    assert.equal(new Set(Object.values(dictionary)).size, Object.keys(dictionary).length);
  });
});

describe('reverse paint: every dictionary value paints back to its Ork key', () => {
  for (const [orkWord, englishWord] of Object.entries(dictionary)) {
    test(`${englishWord} → ${orkWord}`, async () => {
      const reversePaint = await loadReversePaint();
      assert.equal(reversePaint(englishWord), orkWord);
    });
  }
});

describe('reverse paint: real syntax with non-dictionary identifiers', () => {
  test('function GetDeffGun<T>(): Promise<T> → nob GetDeffGun<T>(): Wazza<T>', async () => {
    const reversePaint = await loadReversePaint();
    assert.equal(
      reversePaint('function GetDeffGun<T>(): Promise<T>'),
      'nob GetDeffGun<T>(): Wazza<T>',
    );
  });
});

describe('reverse paint: strings stay untouched', () => {
  test("'function' stays", async () => {
    const reversePaint = await loadReversePaint();
    assert.equal(reversePaint("'function'"), "'function'");
  });

  test('"Promise" stays', async () => {
    const reversePaint = await loadReversePaint();
    assert.equal(reversePaint('"Promise"'), '"Promise"');
  });

  test('`Array` stays', async () => {
    const reversePaint = await loadReversePaint();
    assert.equal(reversePaint('`Array`'), '`Array`');
  });
});

describe('reverse paint: comments stay untouched', () => {
  test('// function stays', async () => {
    const reversePaint = await loadReversePaint();
    assert.equal(reversePaint('// function'), '// function');
  });

  test('/* Promise */ stays', async () => {
    const reversePaint = await loadReversePaint();
    assert.equal(reversePaint('/* Promise */'), '/* Promise */');
  });
});

describe('reverse paint: member access after a dot', () => {
  test('foo.function stays', async () => {
    const reversePaint = await loadReversePaint();
    assert.equal(reversePaint('foo.function'), 'foo.function');
  });

  test('foo?.Promise stays', async () => {
    const reversePaint = await loadReversePaint();
    assert.equal(reversePaint('foo?.Promise'), 'foo?.Promise');
  });

  test('Array.from → Mob.from', async () => {
    const reversePaint = await loadReversePaint();
    assert.equal(reversePaint('Array.from'), 'Mob.from');
  });
});

describe('reverse paint: private names stay untouched', () => {
  test('#function stays', async () => {
    const reversePaint = await loadReversePaint();
    assert.equal(reversePaint('#function'), '#function');
  });
});

describe('reverse paint: a keyword glued to punctuation still paints', () => {
  test('(function → (nob', async () => {
    const reversePaint = await loadReversePaint();
    assert.equal(reversePaint('(function'), '(nob');
  });

  test('Promise< → Wazza<', async () => {
    const reversePaint = await loadReversePaint();
    assert.equal(reversePaint('Promise<'), 'Wazza<');
  });
});
