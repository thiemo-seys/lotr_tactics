import { describe, expect, it } from 'vitest';
import { ringInfo, ringText, ringTier } from '../src/ring.js';

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

describe('ring info', () => {
  it('marks the drawbacks that apply after what the Ring gives', () => {
    expect(ringInfo(2).effects.map((e) => e.drawback)).toEqual([false]);
    expect(ringInfo(9).effects.map((e) => e.drawback)).toEqual([false, true, true, true]);
    expect(ringInfo(7)).toMatchObject({ corruption: 7, tier: 'Grip' });
    expect(ringText(5).split('\n')).toEqual(['The One Ring · Corruption 5 (Burden)', ...ringInfo(5).effects.map((e) => e.text), ringInfo(5).note]);
  });
});
