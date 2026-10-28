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
