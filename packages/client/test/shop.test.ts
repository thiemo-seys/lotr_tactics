import { describe, expect, it } from 'vitest';
import { BENCH_FULL, UNITS } from '@lotr-tactics/sim';
import { saleOffer, shopBuy, shopMark } from '../src/shop.js';

describe('shop cards', () => {
  it('mark a unit the person has, and glow when buying it makes a 2★ at once', () => {
    expect(shopMark([], false)).toBe('none');
    expect(shopMark([1], false)).toBe('owned');
    expect(shopMark([1, 1], true)).toBe('completes');
    // While the fights play, a pair with a copy on the board merges only once they end.
    expect(shopMark([1, 1], false)).toBe('owned');
    expect(shopMark([2, 2], false)).toBe('owned');
    expect(shopMark([3], false)).toBe('owned');
    expect(shopMark([2, 1, 1], true)).toBe('completes');
  });

  it("don't show a full bench, which a click says instead, but show other reasons", () => {
    expect(shopBuy({ ok: true }, true)).toBe('buy');
    expect(shopBuy({ ok: false, reason: BENCH_FULL }, true)).toBe('bench-full');
    expect(shopBuy({ ok: false, reason: 'Not enough gold.' }, true)).toBe('refused');
    expect(shopBuy({ ok: false, reason: 'That shop slot is empty.' }, true)).toBe('refused');
  });

  it("show a full bench on the card while another player's bench is on screen", () => {
    expect(shopBuy({ ok: false, reason: BENCH_FULL }, false)).toBe('refused');
    expect(shopBuy({ ok: true }, false)).toBe('buy');
  });
});

describe('the sale offered while a unit is dragged', () => {
  it('names the unit, its price as the sim pays it, and the gold after', () => {
    const cost = UNITS.gimli.cost;
    expect(saleOffer({ unitId: 'merry', star: 1 }, 4, { ok: true })).toEqual({ name: 'Merry', price: 1, goldAfter: 5 });
    expect(saleOffer({ unitId: 'gimli', star: 2 }, 4, { ok: true })).toEqual({ name: 'Gimli', price: 3 * cost, goldAfter: 4 + 3 * cost });
    expect(saleOffer({ unitId: 'gimli', star: 3 }, 0, { ok: true })?.price).toBe(9 * cost);
  });

  it("offers nothing when the rules don't allow the sale", () => {
    expect(saleOffer({ unitId: 'merry', star: 1 }, 4, { ok: false, reason: 'Units on the board are fighting.' })).toBeNull();
  });
});
