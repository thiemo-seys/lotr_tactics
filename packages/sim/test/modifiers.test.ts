// Damage amps and reductions, crit immunity, the Ring's grip and the auras (docs/sim-spec.md
// sections 9.1 and 12.3 to 12.7), on units made without running a fight.

import { describe, expect, it } from 'vitest';
import type { PlacedUnit } from '../src/combat/combat.js';
import { createUnit, teamSetup, type Unit } from '../src/combat/fighters.js';
import { auraField, damageAmpPct, damageReductionPct, isCritImmune, isGripped, type AmpContext } from '../src/combat/modifiers.js';
import { activeTrait, type TraitLevels } from '../src/combat/traits.js';
import { ITEMS } from '../src/data/items.js';
import { RING } from '../src/data/ring.js';
import type { Team } from '../src/types.js';
import { placed } from './helpers.js';

/** A team's units as they start a fight, each placement in the team's own perspective. */
function team(side: Team, placements: readonly PlacedUnit[], firstId = 0): Unit[] {
  const setup = teamSetup(placements, []);
  return placements.map((p, i) => createUnit(p, { id: firstId + i, team: side, slot: i, stage: 2, setup, placements }));
}

const NONE: Omit<AmpContext, 'units'> = { traits: {}, giftAmpPct: 0, oneRingCorruption: 0 };

describe('damage amps', () => {
  it('come from a living Captain next to the source while the trait is active', () => {
    const [legolas, aragorn, boromir] = team('A', [placed('legolas', 3, 3), placed('aragorn', 2, 3), placed('boromir', 0, 0)]);
    const [target] = team('B', [placed('sam', 3, 3)], 3);
    const traits: TraitLevels = { captain: 0 };
    const captain = activeTrait(traits, 'captain')!.damageAmpPct;
    const units = [legolas!, aragorn!, boromir!, target!];
    expect(damageAmpPct(legolas!, target!, { ...NONE, traits, units })).toBe(captain);
    // Boromir is a Captain too, but not next to Legolas; a Captain doesn't amp itself.
    expect(damageAmpPct(boromir!, target!, { ...NONE, traits, units })).toBe(0);
    expect(damageAmpPct(legolas!, target!, { ...NONE, units })).toBe(0);
    aragorn!.alive = false;
    expect(damageAmpPct(legolas!, target!, { ...NONE, traits, units })).toBe(0);
  });

  it('add up Black Arrows against healthier targets, Dwarves against large ones, Gifts, the Ring and the Nine', () => {
    const [gimli] = team('A', [placed('gimli', 3, 3, 1, ['black-arrow', 'ring-of-the-nine'])]);
    const [sam, treebeard] = team('B', [placed('sam', 3, 3), placed('treebeard', 2, 3)], 1);
    const units = [gimli!, sam!, treebeard!];
    const arrow = (ITEMS['black-arrow'].effect as { pct: number }).pct;
    const nine = (ITEMS['ring-of-the-nine'].effect as { damagePctPerCorruption: number }).damagePctPerCorruption;
    const dwarf = activeTrait({ dwarf: 0 }, 'dwarf')!.damageVsLargePct;
    expect(sam!.stats.maxHealth).toBeLessThan(gimli!.stats.maxHealth);
    expect(damageAmpPct(gimli!, sam!, { ...NONE, units })).toBe(0);
    expect(damageAmpPct(gimli!, treebeard!, { ...NONE, units })).toBe(arrow);
    expect(damageAmpPct(gimli!, treebeard!, { ...NONE, traits: { dwarf: 0 }, units })).toBe(arrow + dwarf);
    expect(damageAmpPct(gimli!, sam!, { ...NONE, giftAmpPct: 8, oneRingCorruption: 3, units })).toBe(8 + 3 * nine);
    const [bearer] = team('A', [{ ...placed('aragorn', 3, 3), ring: 4 }]);
    expect(damageAmpPct(bearer!, sam!, { ...NONE, units })).toBe(4 * RING.damagePctPerCorruption);
  });

  it('come from the Dark Lord for Orcs and Nazgûl, the Nine included', () => {
    const [gorbag, wraith, legolas] = team('A', [placed('gorbag', 3, 3), placed('boromir', 2, 3, 1, ['ring-of-the-nine']), placed('legolas', 3, 0)]);
    const [sam] = team('B', [placed('sam', 3, 3)], 3);
    const traits: TraitLevels = { 'dark-lord': 0 };
    const amp = activeTrait(traits, 'dark-lord')!.damageAmpPct;
    const units = [gorbag!, wraith!, legolas!, sam!];
    expect([gorbag, wraith, legolas].map((u) => damageAmpPct(u!, sam!, { ...NONE, traits, units }))).toEqual([amp, amp, 0]);
  });
});

describe('damage reductions', () => {
  it("add the Witch-king's passive against Gondor and Rohan, Éowyn aside, and Mithril Shirts, up to all of it", () => {
    const [witchKing, shirted] = team('B', [placed('witch-king', 3, 3), placed('gimli', 2, 3, 1, ['mithril-shirt', 'mithril-shirt', 'mithril-shirt'])]);
    const [boromir, eowyn, legolas] = team('A', [placed('boromir', 3, 3), placed('eowyn', 2, 3), placed('legolas', 3, 0)], 2);
    const shirt = (ITEMS['mithril-shirt'].effect as { pct: number }).pct;
    expect(damageReductionPct(boromir!, witchKing!)).toBe(50);
    expect(damageReductionPct(eowyn!, witchKing!)).toBe(0);
    expect(damageReductionPct(legolas!, witchKing!)).toBe(0);
    expect(damageReductionPct(legolas!, shirted!)).toBe(3 * shirt);
    expect([isCritImmune(shirted!), isCritImmune(witchKing!)]).toEqual([true, false]);
    // The passive and the shirts add up, to all of the damage at most. Four shirts are more than a
    // unit can hold, to pass 100.
    const [armoured] = team('B', [placed('witch-king', 3, 3, 1, ['mithril-shirt', 'mithril-shirt', 'mithril-shirt', 'mithril-shirt'])]);
    expect(50 + 4 * shirt).toBeGreaterThan(100);
    expect(damageReductionPct(boromir!, armoured!)).toBe(100);
    expect(damageReductionPct(legolas!, armoured!)).toBe(4 * shirt);
  });
});

describe("the One Ring's grip", () => {
  it('holds its bearer from the Grip level, less Sam’s relief', () => {
    const at = (ring: number, sam: boolean) => {
      const bearer = { ...placed('aragorn', 3, 3), ring };
      return team('A', [bearer, ...(sam ? [placed('sam', 2, 3)] : [])])[0]!;
    };
    expect(isGripped(at(RING.gripFrom - 1, false))).toBe(false);
    expect(isGripped(at(RING.gripFrom, false))).toBe(true);
    expect(isGripped(at(RING.gripFrom, true))).toBe(false);
    expect(isGripped(team('A', [placed('aragorn', 3, 3)])[0]!)).toBe(false);
  });
});

describe('auras', () => {
  it('slow enemies near a Nazgûl, cut their Magic Resist near a Phial, and hasten allies near Narya', () => {
    const A = team('A', [placed('ringwraith', 3, 3), placed('khamul', 4, 3), placed('gandalf', 3, 0, 1, ['narya']), placed('legolas', 0, 0)]);
    const B = team('B', [placed('sam', 3, 3, 1, ['phial']), placed('gimli', 0, 0)], A.length);
    const traits = { A: { nazgul: 0 }, B: {} };
    const aurasOn = auraField([...A, ...B], traits);
    const nazgul = activeTrait(traits.A, 'nazgul')!;
    const phial = (ITEMS.phial.effect as { pct: number }).pct;
    const narya = (ITEMS.narya.effect as { pct: number }).pct * 1.5;
    const [ringwraith, khamul, gandalf, legolas] = A;
    const [sam, gimli] = B;
    // Sam faces the Nazgûl across the middle; Gimli is far away in B's back corner.
    expect(aurasOn(sam!)).toEqual({ slowPct: nazgul.slowPct, shredPct: 0, hastePct: 0 });
    expect(aurasOn(gimli!)).toEqual({ slowPct: 0, shredPct: 0, hastePct: 0 });
    for (const near of [ringwraith, khamul]) expect(aurasOn(near!)).toEqual({ slowPct: 0, shredPct: phial, hastePct: 0 });
    expect(aurasOn(gandalf!).hastePct).toBe(narya);
    expect(aurasOn(legolas!).hastePct).toBe(0);
    // Without the trait active, no slow.
    expect(auraField([...A, ...B], { A: {}, B: {} })(sam!).slowPct).toBe(0);
  });
});
