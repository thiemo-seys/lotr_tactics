import { COMPONENTS, GIFT_IDS, ITEM_IDS, ITEMS, UNITS, baseStats, createCombat, type UnitId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { actionTip, fighterTip, giftTip, itemTip, ownedUnitTip, ringTip, traitTip, unitTip } from '../src/tips.js';

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
    expect(traitTip('guardian', { count: 2, level: 0, tone: 'bronze' }, 'Bot 3').subtitle).toBe('Class · 2 on Bot 3\'s board');
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
      expect(tip.ability!.name).toBe(UNITS[id].ability.name);
      expect(tip.ability!.lines.length).toBeGreaterThan(0);
      expect(tip.stats!.every((s) => !s.includes('NaN'))).toBe(true);
    }
  });

  it('show an owned unit at its star level with its items, and its ability at that level', () => {
    const plain = ownedUnitTip({ id: 1, unitId: 'gimli', star: 2, items: [] });
    const base = baseStats(UNITS.gimli, 2);
    expect(plain).toMatchObject({ title: 'Gimli', subtitle: '2★ · 3-cost unit', tone: 'cost-3', body: [] });
    expect(plain.stats![0]).toBe(`${base.maxHealth} Health`);
    expect(plain.ability!.lines).toEqual(['Deals 405 physical damage to adjacent enemies.', 'Gains a 338 shield for 4s.']);
    const armed = ownedUnitTip({ id: 1, unitId: 'gimli', star: 2, items: ['mail'] }, 3);
    expect(armed.stats![3]).not.toBe(plain.stats![3]);
    expect(armed.body!.map((l) => l.text)).toEqual([`Items: ${ITEMS.mail.name}.`, 'Bears the One Ring, at Corruption 3.']);
  });

  it('show a fighting unit as it is now', () => {
    const combat = createCombat({
      seed: 1,
      stage: 2,
      teams: { A: [{ unitId: 'gimli', star: 1, col: 3, row: 3, items: [] }], B: [{ unitId: 'goblin', star: 1, col: 3, row: 3, items: [] }] },
    });
    const [gimli, goblin] = combat.state.units;
    const tip = fighterTip(gimli!, 'Gimli');
    expect(tip.stats![0]).toBe(`${gimli!.health}/${gimli!.stats.maxHealth} Health`);
    expect(tip.ability!.name).toBe('And my axe!');
    expect(fighterTip(goblin!, 'Moria goblin')).toMatchObject({ subtitle: 'Monster' });
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
