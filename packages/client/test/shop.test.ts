import { describe, expect, it } from 'vitest';
import { BENCH_FULL } from '@lotr-tactics/sim';
import { shopBuy, shopMark } from '../src/shop.js';

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
