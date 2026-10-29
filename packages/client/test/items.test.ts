import { COMBINED_ITEM_IDS, COMPONENTS, ITEM_IDS } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { COMPONENT_COLOURS, itemColours, itemTag, itemText } from '../src/items.js';

describe('item display', () => {
  it('gives components and combined items distinct two-letter tags', () => {
    const components = COMPONENTS.map(itemTag);
    const combined = COMBINED_ITEM_IDS.map(itemTag);
    for (const tags of [components, combined]) {
      expect(new Set(tags).size).toBe(tags.length);
      for (const tag of tags) expect(tag).toHaveLength(2);
    }
    expect(itemTag('black-arrow')).toBe('BA');
    expect(itemTag('galadhrim-bow')).toBe('BG');
    expect(itemTag('anduril')).toBe('An');
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
});
