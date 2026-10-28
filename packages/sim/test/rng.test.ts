import { describe, expect, it } from 'vitest';
import { createRng, roll } from '../src/rng.js';

function take(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng());
}

describe('createRng', () => {
  it('matches the reference mulberry32 code in docs/sim-spec.md', () => {
    expect(take(0, 5)).toEqual([
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111,
      0.46732782293111086,
    ]);
    expect(take(42, 5)).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693,
      0.17481389874592423,
    ]);
  });

  it('reads the seed as an unsigned 32-bit integer', () => {
    expect(take(-1, 5)).toEqual(take(0xffffffff, 5));
  });

  it('gives the same sequence for the same seed and a different one for another seed', () => {
    expect(take(1234, 100)).toEqual(take(1234, 100));
    expect(take(1234, 100)).not.toEqual(take(1235, 100));
  });

  it('returns numbers in [0, 1) that average about 0.5', () => {
    const values = take(99, 10_000);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });
});

describe('roll', () => {
  it('succeeds only when the next number is below the chance', () => {
    // The first number for seed 42 is 0.6011037519201636.
    expect(roll(createRng(42), 0.6011037519201636)).toBe(false);
    expect(roll(createRng(42), 0.6011037519201637)).toBe(true);
  });

  it('never succeeds at chance 0 and always succeeds at chance 1', () => {
    const rng = createRng(5);
    for (let i = 0; i < 1000; i++) {
      expect(roll(rng, 0)).toBe(false);
      expect(roll(rng, 1)).toBe(true);
    }
  });

  it('uses exactly one number per roll', () => {
    const rolled = createRng(7);
    const plain = createRng(7);
    roll(rolled, 0.5);
    plain();
    expect(rolled()).toBe(plain());
  });
});
