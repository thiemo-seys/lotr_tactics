import { describe, expect, it } from 'vitest';
import { POOL_COPIES, SHOP } from '../src/data/economy.js';
import { UNITS, type Cost } from '../src/data/units.js';
import { Pool, UNIT_IDS, copiesIn } from '../src/game/pool.js';
import { createRng } from '../src/rng.js';

const COSTS: Cost[] = [1, 2, 3, 4, 5];

function emptyCost(pool: Pool, cost: Cost): void {
  for (const id of UNIT_IDS) if (UNITS[id].cost === cost) pool.take(id, pool.count(id));
}

describe('Pool', () => {
  it('starts with the copies from docs/design.md section 8', () => {
    const pool = new Pool();
    for (const id of UNIT_IDS) expect(pool.count(id)).toBe(POOL_COPIES[UNITS[id].cost]);
    expect(COSTS.map((cost) => pool.countOfCost(cost))).toEqual([8 * 22, 8 * 20, 8 * 17, 7 * 10, 5 * 9]);
  });

  it('takes and puts back copies, and refuses to take more than it has', () => {
    const pool = new Pool();
    pool.take('sam', 3);
    expect(pool.count('sam')).toBe(19);
    pool.put('sam', 2);
    expect(pool.count('sam')).toBe(21);
    expect(() => pool.take('sauron', 10)).toThrow();
    expect(pool.count('sauron')).toBe(9);
  });

  it('counts 1, 3 and 9 copies in a 1★, 2★ and 3★ unit', () => {
    expect([copiesIn(1), copiesIn(2), copiesIn(3)]).toEqual([1, 3, 9]);
  });
});

describe('shop rolls', () => {
  it('shows each cost with the odds of the level', () => {
    const rolls = 20_000;
    for (const level of [3, 5, 7, 9]) {
      const pool = new Pool();
      const rng = createRng(level);
      const seen = [0, 0, 0, 0, 0];
      for (let i = 0; i < rolls; i++) {
        const id = pool.rollShopSlot(level, rng)!;
        seen[UNITS[id].cost - 1]!++;
        pool.put(id);
      }
      SHOP.odds[level - 1]!.forEach((pct, i) => expect(Math.abs((100 * seen[i]!) / rolls - pct)).toBeLessThan(1.5));
    }
  });

  it('only shows 1-cost units at levels 1 and 2', () => {
    const pool = new Pool();
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      const id = pool.rollShopSlot(i % 2 ? 1 : 2, rng)!;
      expect(UNITS[id].cost).toBe(1);
      pool.put(id);
    }
  });

  it('takes the shown unit out of the pool', () => {
    const pool = new Pool();
    const id = pool.rollShopSlot(1, createRng(1))!;
    expect(pool.count(id)).toBe(21);
  });

  it('picks units of a cost by their copies left', () => {
    const pool = new Pool();
    for (const id of UNIT_IDS) if (UNITS[id].cost === 1 && id !== 'merry') pool.take(id, pool.count(id));
    const rng = createRng(9);
    for (let i = 0; i < 22; i++) expect(pool.rollShopSlot(1, rng)).toBe('merry');
    expect(pool.rollShopSlot(1, rng)).toBeNull();
  });

  it('skips sold out costs', () => {
    const pool = new Pool();
    emptyCost(pool, 1);
    const rng = createRng(3);
    // Level 3 is 75% 1-cost and 25% 2-cost.
    for (let i = 0; i < 100; i++) expect(UNITS[pool.rollShopSlot(3, rng)!].cost).toBe(2);
  });

  it('leaves a slot empty, using no numbers, when every cost of the level is sold out', () => {
    const pool = new Pool();
    emptyCost(pool, 1);
    const rng = createRng(4);
    const reference = createRng(4);
    expect(pool.rollShopSlot(1, rng)).toBeNull();
    expect(rng()).toBe(reference());
  });

  it('is the same for the same seed', () => {
    const roll = (seed: number) => {
      const pool = new Pool();
      const rng = createRng(seed);
      return Array.from({ length: 50 }, () => pool.rollShopSlot(7, rng));
    };
    expect(roll(11)).toEqual(roll(11));
    expect(roll(11)).not.toEqual(roll(12));
  });
});
