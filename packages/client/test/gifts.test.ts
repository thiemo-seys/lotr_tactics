import { GIFT_IDS } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { giftEffect, giftEffects, giftText } from '../src/gifts.js';

describe('gift text', () => {
  it('describes every Gift from its data', () => {
    for (const id of GIFT_IDS) {
      const effect = giftEffect(id);
      expect(effect.length).toBeGreaterThan(0);
      expect(effect).not.toContain('undefined');
      expect(effect.endsWith('.')).toBe(true);
    }
  });

  it('reads naturally for each kind of Gift', () => {
    expect(giftText('bilbos-purse')).toBe("Bilbo's Purse (Silver)\nGain 12 gold.");
    expect(giftEffect('shield-wall')).toBe('Your front-row units gain +20 Armor, +20 Magic Resist.');
    expect(giftEffect('wisdom-of-the-istari')).toBe('Your units gain +30 Ability Power. Your units start combat with 20 more mana.');
    expect(giftEffect('muster-of-rohan')).toBe('Gain 2 random 3-cost units.');
    expect(giftEffect('return-of-the-king')).toBe('Gain a random 5-cost unit.');
    expect(giftEffect('elven-smiths')).toBe('Gain a random combined item.');
    expect(giftEffect('second-breakfast')).toBe('Your first reroll each round is free.');
    expect(giftEffect('mirror-of-galadriel')).toBe('Your shop rolls with the odds of one level higher.');
    expect(giftEffect('horse-lords')).toBe('Crest: counts one more Rider, if you have one.');
  });
});

describe('gift effects', () => {
  it('list one sentence per effect, the same sentences giftEffect joins', () => {
    expect(giftEffects('wisdom-of-the-istari')).toEqual(['Your units gain +30 Ability Power.', 'Your units start combat with 20 more mana.']);
    for (const id of GIFT_IDS) expect(giftEffects(id).join(' ')).toBe(giftEffect(id));
  });
});
