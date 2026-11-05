import { describe, expect, it } from 'vitest';
import { shopMark } from '../src/shop.js';

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
});
