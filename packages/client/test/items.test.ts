import { COMBINED_ITEM_IDS, COMPONENTS, ITEM_IDS, ITEMS, RING_OF_POWER_IDS } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { COMPONENT_COLOURS, RING_COLOURS, itemColours, itemInfo, itemText } from '../src/items.js';

describe('item display', () => {
  it('gives Rings of Power their gold and their stone', () => {
    for (const id of RING_OF_POWER_IDS) expect(itemColours(id)).toEqual(RING_COLOURS[id]);
  });

  it("colours an item by its components", () => {
    expect(itemColours('blade')).toEqual([COMPONENT_COLOURS.blade, COMPONENT_COLOURS.blade]);
    expect(itemColours('sting')).toEqual([COMPONENT_COLOURS.blade, COMPONENT_COLOURS.cloak]);
  });

  it('describes each item from its data: recipe, stats and effect', () => {
    expect(itemText('blade')).toBe('Blade (component)\n+15% Attack Damage');
    expect(itemText('sting')).toBe("Sting (Blade + Cloak)\n+15% Attack Damage, +20 Magic Resist, +25% Crit Chance\nThe holder's abilities can crit.");
    expect(itemText('herugrim')).toContain(
      'The first time Health falls below 50%: a shield of 30% of max Health for 5s and +30% Attack Damage for the rest of the fight.',
    );
    expect(itemText('orcrist')).toContain('untargetable for 1s and +40% Attack Speed');
    for (const id of ITEM_IDS) {
      const lines = itemText(id).split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.every((line) => line.length > 0 && !line.includes('undefined'))).toBe(true);
    }
  });

  it('splits each item into the parts a tooltip lays out', () => {
    expect(itemInfo('sting')).toEqual({
      name: 'Sting',
      kind: 'combined',
      kindText: 'Blade + Cloak',
      recipe: ['blade', 'cloak'],
      stats: ['+15% Attack Damage', '+20 Magic Resist', '+25% Crit Chance'],
      effect: "The holder's abilities can crit.",
      kin: null,
    });
    expect(itemInfo('blade')).toMatchObject({ kind: 'component', kindText: 'Component', recipe: null, effect: null });
    expect(itemInfo('vilya')).toMatchObject({ kind: 'ring-of-power', kindText: 'Ring of Power: the Three', recipe: null, stats: [] });
    expect(itemInfo('vilya').kin).toMatch(/stronger on .* bearers\.$|^Double on/);
    for (const id of COMPONENTS) expect(itemInfo(id).stats.length).toBeGreaterThan(0);
    for (const id of COMBINED_ITEM_IDS) expect(itemInfo(id).recipe).toEqual(ITEMS[id].recipe);
    for (const id of RING_OF_POWER_IDS) expect(itemInfo(id).effect).not.toBeNull();
  });
});
