import { COMPONENTS, GIFT_IDS, ITEM_IDS, UNITS, type UnitId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { actionTip, giftTip, itemTip, ringTip, traitTip, unitTip } from '../src/tips.js';

describe('tooltips', () => {
  it('lay out items: recipe, stats and effect from the item data', () => {
    expect(itemTip('sting', 'Drag onto a unit.')).toEqual({
      icon: { kind: 'item', id: 'sting' },
      title: 'Sting',
      subtitle: 'Blade + Cloak',
      tone: 'combined',
      recipe: ['blade', 'cloak'],
      stats: ['+15% Attack Damage', '+20 Magic Resist', '+25% Crit Chance'],
      body: [{ text: "The holder's abilities can crit." }],
      note: { text: 'Drag onto a unit.', reason: false },
    });
    for (const id of COMPONENTS) expect(itemTip(id)).toMatchObject({ subtitle: 'Component', tone: 'component', body: [] });
    expect(itemTip('narya').tone).toBe('ring-of-power');
    for (const id of ITEM_IDS) expect(JSON.stringify(itemTip(id))).not.toContain('undefined');
  });

  it('mark the One Ring’s drawbacks and colour it by tier', () => {
    const tip = ringTip(8);
    expect(tip).toMatchObject({ title: 'The One Ring', subtitle: 'Corruption 8 · Grip', tone: 'ring-grip' });
    expect(tip.body!.filter((l) => l.bad).length).toBe(2);
    expect(ringTip(0).body!.some((l) => l.bad)).toBe(false);
  });

  it('give Gifts their tier and every effect', () => {
    expect(giftTip('wisdom-of-the-istari')).toMatchObject({
      icon: { kind: 'icon', name: 'tier-mithril' },
      subtitle: 'Mithril Gift of Lothlórien',
      tone: 'tier-mithril',
      body: [{ text: 'Your units gain +30 Ability Power.' }, { text: 'Your units start combat with 20 more mana.' }],
    });
    for (const id of GIFT_IDS) expect(giftTip(id).body!.length).toBeGreaterThan(0);
  });

  it('show each trait breakpoint and mark the active one', () => {
    const tip = traitTip('guardian', { count: 4, level: 1, tone: 'silver' });
    expect(tip.subtitle).toBe('Class · 4 on your board');
    expect(tip.tone).toBe('trait-silver');
    expect(tip.levels!.map((l) => [l.count, l.active])).toEqual([
      [2, false],
      [4, true],
      [6, false],
    ]);
    expect(traitTip('guardian').levels!.every((l) => !l.active)).toBe(true);
    expect(traitTip('hobbit', { count: 1, level: null, tone: null }).tone).toBeUndefined();
  });

  it('describe units by cost, traits and ability', () => {
    for (const id of Object.keys(UNITS) as UnitId[]) {
      const tip = unitTip(id);
      expect(tip.tone).toBe(`cost-${UNITS[id].cost}`);
      expect(tip.traits).toEqual([UNITS[id].origin, ...UNITS[id].classes]);
      expect(tip.body![0]!.text).toBe(`Ability: ${UNITS[id].ability.name}`);
      expect(tip.stats!.every((s) => !s.includes('NaN'))).toBe(true);
    }
  });

  it('give a disabled action its reason', () => {
    expect(actionTip('Reroll', 'New units in the shop.', 'Not enough gold.', 'D')).toEqual({
      title: 'Reroll',
      body: [{ text: 'New units in the shop.' }],
      key: 'D',
      note: { text: 'Not enough gold.', reason: true },
    });
    expect(actionTip('Ready', 'End planning.', null).note).toBeUndefined();
  });
});
