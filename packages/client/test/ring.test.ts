import { describe, expect, it } from 'vitest';
import { ringText, ringTier } from '../src/ring.js';

describe('ring text', () => {
  it('names the tier of each Corruption', () => {
    expect([0, 3, 4, 6, 7, 8, 9].map(ringTier)).toEqual(['Gift', 'Gift', 'Burden', 'Burden', 'Grip', 'Grip', 'Betrayal']);
  });

  it('lists the drawbacks that apply', () => {
    expect(ringText(2)).toContain('20% more damage');
    expect(ringText(2)).not.toContain('Stretched thin');
    expect(ringText(5)).toContain('−10% max Health');
    expect(ringText(7)).toContain('Mine!');
    expect(ringText(9)).toContain('Betrayal');
    expect(ringText(9).split('\n')[0]).toBe('The One Ring · Corruption 9 (Betrayal)');
  });
});
