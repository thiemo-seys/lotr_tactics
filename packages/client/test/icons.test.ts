import { COMPONENTS, GIFT_IDS, GIFTS, TRAITS, type TraitId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { COMPONENT_ICONS, GIFT_TIER_ICONS, ICONS, ROUND_ICONS, STATUS_ICONS, TRAIT_ICONS, iconSvg, type IconName } from '../src/icons.js';

describe('icons', () => {
  it('give every trait its own icon', () => {
    const traits = Object.keys(TRAITS) as TraitId[];
    expect(traits).toHaveLength(16);
    for (const trait of traits) expect(Object.hasOwn(ICONS, TRAIT_ICONS[trait])).toBe(true);
    expect(new Set(traits.map((t) => TRAIT_ICONS[t])).size).toBe(traits.length);
    expect(Object.keys(TRAIT_ICONS).sort()).toEqual([...traits].sort());
  });

  it('give every item component its own icon, apart from the traits', () => {
    for (const id of COMPONENTS) expect(Object.hasOwn(ICONS, COMPONENT_ICONS[id])).toBe(true);
    const icons = COMPONENTS.map((id) => COMPONENT_ICONS[id]);
    expect(new Set(icons).size).toBe(COMPONENTS.length);
    for (const icon of icons) expect(Object.values(TRAIT_ICONS)).not.toContain(icon);
    expect(Object.keys(COMPONENT_ICONS).sort()).toEqual([...COMPONENTS].sort());
  });

  it('cover every Gift tier, round type and label status', () => {
    for (const id of GIFT_IDS) expect(Object.hasOwn(ICONS, GIFT_TIER_ICONS[GIFTS[id].tier])).toBe(true);
    expect(new Set(Object.values(GIFT_TIER_ICONS)).size).toBe(3);
    for (const name of [...Object.values(ROUND_ICONS), ...Object.values(STATUS_ICONS)]) expect(Object.hasOwn(ICONS, name)).toBe(true);
  });

  it('draw every icon on the same grid, in currentColor, hidden from screen readers', () => {
    for (const name of Object.keys(ICONS) as IconName[]) {
      const svg = iconSvg(name);
      expect(svg).toMatch(/^<svg class="icon icon-[a-z-]+" viewBox="0 0 24 24" fill="none" stroke="currentColor" /);
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
      expect(ICONS[name].length).toBeGreaterThan(20);
    }
  });
});
