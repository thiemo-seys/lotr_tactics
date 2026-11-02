import { describe, expect, it } from 'vitest';
import { shopMark } from '../src/shop.js';

describe('shop cards', () => {
  it('mark a unit the person has, and glow when buying it makes a 2★ from two 1★ copies', () => {
    expect(shopMark([])).toBe('none');
    expect(shopMark([1])).toBe('owned');
    expect(shopMark([1, 1])).toBe('completes');
    expect(shopMark([2, 1])).toBe('owned');
    expect(shopMark([2, 2])).toBe('owned');
    expect(shopMark([3])).toBe('owned');
    expect(shopMark([2, 1, 1])).toBe('completes');
  });
});
