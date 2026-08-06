import { describe, expect, it } from 'vitest';
import { hashSeed, seededRng, shuffle, weightedShuffle } from '../random';

describe('seededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = seededRng(1);
    const b = seededRng(2);
    expect(a()).not.toBe(b());
  });

  it('returns values in [0, 1)', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 100; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('preserves all elements', () => {
    const items = [1, 2, 3, 4, 5];
    const result = shuffle(items, seededRng(1));
    expect(result.slice().sort()).toEqual(items.slice().sort());
  });

  it('does not mutate the input array', () => {
    const items = [1, 2, 3];
    const copy = items.slice();
    shuffle(items, seededRng(1));
    expect(items).toEqual(copy);
  });

  it('is deterministic for a given seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(items, seededRng(99));
    const b = shuffle(items, seededRng(99));
    expect(a).toEqual(b);
  });
});

describe('weightedShuffle', () => {
  it('preserves all elements', () => {
    const items = [{ w: 1 }, { w: 2 }, { w: 3 }];
    const result = weightedShuffle(items, (i) => i.w, seededRng(3));
    expect(result).toHaveLength(3);
    expect(new Set(result)).toEqual(new Set(items));
  });

  it('biases heavier items toward the front over many trials', () => {
    const items = [
      { id: 'light', w: 0.1 },
      { id: 'heavy', w: 10 },
    ];
    let heavyFirstCount = 0;
    const trials = 200;
    for (let i = 0; i < trials; i += 1) {
      const result = weightedShuffle(items, (item) => item.w, seededRng(i));
      if (result[0]?.id === 'heavy') heavyFirstCount += 1;
    }
    expect(heavyFirstCount).toBeGreaterThan(trials * 0.8);
  });
});

describe('hashSeed', () => {
  it('is deterministic for the same string', () => {
    expect(hashSeed('hello')).toBe(hashSeed('hello'));
  });

  it('differs for different strings', () => {
    expect(hashSeed('hello')).not.toBe(hashSeed('world'));
  });
});
