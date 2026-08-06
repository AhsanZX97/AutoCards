/** Returns a float in `[0, 1)`. */
export type Rng = () => number;

/**
 * Deterministic 32-bit PRNG (mulberry32). Used so shuffles can be replayed in
 * tests and so a session's card order is stable across a page reload.
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turns any string into a seed for `seededRng`. */
export function hashSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Fisher–Yates. Returns a new array; the input is not mutated. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * Shuffle biased by weight — higher-weighted items tend toward the front.
 * Implemented as an Efraimidis–Spirakis weighted sample: each item gets the
 * key `rng() ** (1 / weight)` and items sort by descending key.
 */
export function weightedShuffle<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  rng: Rng = Math.random,
): T[] {
  return items
    .map((item) => {
      const weight = Math.max(weightOf(item), 0.0001);
      return { item, key: Math.pow(rng() || Number.EPSILON, 1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.item);
}

export function pick<T>(items: readonly T[], rng: Rng = Math.random): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(rng() * items.length)];
}
