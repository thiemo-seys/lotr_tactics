import { SHOP } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { oddsText, shopOdds } from '../src/odds.js';

describe('shop odds', () => {
  it("are the level's odds, or a level higher with the Mirror of Galadriel, up to the top level", () => {
    expect(shopOdds(5, [])).toEqual({ level: 5, odds: SHOP.odds[4] });
    expect(shopOdds(5, ['mirror-of-galadriel'])).toEqual({ level: 6, odds: SHOP.odds[5] });
    expect(shopOdds(9, ['mirror-of-galadriel']).level).toBe(9);
  });

  it('name each cost, and the Gift that raises them', () => {
    expect(oddsText(3, ['bilbos-purse'])).toBe('Shop odds at level 3\n1-cost: 75%\n2-cost: 25%\n3-cost: 0%\n4-cost: 0%\n5-cost: 0%');
    expect(oddsText(4, ['mirror-of-galadriel']).split('\n')[0]).toBe('Shop odds at level 5 (Mirror of Galadriel)');
    expect(oddsText(9, ['mirror-of-galadriel']).split('\n')[0]).toBe('Shop odds at level 9');
  });
});
