// Seeded random generator (docs/sim-spec.md section 4). The sim's only source of randomness.

/** Returns the next number in [0, 1). */
export type Rng = () => number;

/** mulberry32, seeded with a 32-bit integer. The seed is read as unsigned, so -1 and 0xffffffff are the same seed. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A roll succeeds when the next number is below `chance`. Always uses one number from the generator. */
export function roll(rng: Rng, chance: number): boolean {
  return rng() < chance;
}

/**
 * The seed of one independent stream of a game's randomness (docs/game-spec.md section 4): a fixed
 * integer hash of the game seed and the stream number, the murmur3 finaliser. Returns an
 * unsigned 32-bit integer.
 */
export function deriveSeed(seed: number, stream: number): number {
  let h = (seed ^ Math.imul(stream + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** An integer in [0, count). Uses one number from the generator. */
export function randomInt(rng: Rng, count: number): number {
  return Math.floor(rng() * count);
}

/** An unsigned 32-bit integer, for seeding another generator. Uses one number from the generator. */
export function randomSeed(rng: Rng): number {
  return randomInt(rng, 0x100000000);
}

/**
 * Picks an index with chance proportional to its whole-number weight. Uses one number from the
 * generator, or none and returns -1 when every weight is 0.
 */
export function pickWeighted(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  if (total === 0) return -1;
  let x = randomInt(rng, total);
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i]!;
    if (x < 0) return i;
  }
  throw new Error('unreachable');
}

/** Shuffles a copy of `items` (Fisher–Yates, from the end). Uses one number per item after the first. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
