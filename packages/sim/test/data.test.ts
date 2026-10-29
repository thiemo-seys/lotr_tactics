import { describe, expect, it } from 'vitest';
import { SHOP, XP } from '../src/data/economy.js';
import { MAX_STAT_TWEAK_PCT } from '../src/data/templates.js';
import { TRAITS, type TraitId } from '../src/data/traits.js';
import { SUMMONS, UNITS, type AbilityStep, type Effect } from '../src/data/units.js';

const ROSTER = Object.values(UNITS);

function effectsOf(steps: readonly AbilityStep[]): Effect[] {
  return steps.flatMap((s) => ('effects' in s ? s.effects : effectsOf(s.steps)));
}

describe('units', () => {
  it('has the ids from docs/sim-spec.md section 7.1, each matching its key', () => {
    const specIds = (
      'sam, merry, pippin, beregond, hama, grishnakh, sharku, gorbag, frodo, haldir, faramir, gamling, ' +
      'balin, lurtz, radagast, ringwraith, bilbo, gollum, gimli, boromir, eomer, eowyn, ugluk, khamul, ' +
      'legolas, elrond, aragorn, theoden, dain, saruman, gothmog, gandalf, galadriel, witch-king, treebeard, sauron'
    ).split(', ');
    expect(Object.keys(UNITS)).toEqual(specIds);
    for (const [key, unit] of Object.entries(UNITS)) expect(unit.id).toBe(key);
    for (const [key, summon] of Object.entries(SUMMONS)) expect(summon.id).toBe(key);
  });

  it('has 8 / 8 / 8 / 7 / 5 units per cost, as in docs/design.md section 5', () => {
    const perCost = [1, 2, 3, 4, 5].map((cost) => ROSTER.filter((u) => u.cost === cost).length);
    expect(perCost).toEqual([8, 8, 8, 7, 5]);
  });

  it('marks only Treebeard and Sauron as Large', () => {
    expect(ROSTER.filter((u) => u.large).map((u) => u.id)).toEqual(['treebeard', 'sauron']);
  });

  it('keeps stat tweaks within the allowed range', () => {
    for (const unit of ROSTER) {
      for (const pct of Object.values(unit.statTweaks ?? {})) expect(Math.abs(pct)).toBeLessThanOrEqual(MAX_STAT_TWEAK_PCT);
    }
  });

  it('gives every unit an ability with at least one effect and positive numbers', () => {
    for (const unit of ROSTER) {
      const effects = effectsOf(unit.ability.steps);
      expect(effects.length, unit.id).toBeGreaterThan(0);
      for (const effect of effects) {
        for (const [field, value] of Object.entries(effect)) {
          if (typeof value === 'number') expect(value, `${unit.id} ${effect.kind} ${field}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('only summons units that exist', () => {
    for (const unit of ROSTER) {
      for (const effect of effectsOf(unit.ability.steps)) {
        if (effect.kind === 'summon') expect(SUMMONS[effect.unit]).toBeDefined();
      }
    }
  });

  it('only dashes through a line from a line selector', () => {
    for (const unit of ROSTER) {
      for (const step of unit.ability.steps) {
        if ('effects' in step && step.effects.some((e) => e.kind === 'dashThroughLine')) {
          expect(step.select.kind, unit.id).toBe('line');
        }
      }
    }
  });
});

describe('traits', () => {
  it('has the unit counts from docs/design.md section 4', () => {
    const counts = Object.fromEntries(Object.keys(TRAITS).map((id) => [id, 0])) as Record<TraitId, number>;
    for (const unit of ROSTER) for (const trait of [unit.origin, ...unit.classes]) counts[trait]++;
    expect(counts).toEqual({
      hobbit: 6,
      elf: 4,
      dwarf: 3,
      gondor: 4,
      rohan: 5,
      istari: 3,
      orc: 6,
      nazgul: 3,
      ent: 1,
      'dark-lord': 1,
      guardian: 8,
      archer: 6,
      rider: 6,
      burglar: 6,
      captain: 6,
      sorcerer: 6,
    });
  });

  it('uses origins as origins and classes as classes', () => {
    for (const unit of ROSTER) {
      expect(TRAITS[unit.origin].kind).toBe('origin');
      for (const cls of unit.classes) expect(TRAITS[cls].kind).toBe('class');
    }
  });

  it('has one level per breakpoint, rising, and every breakpoint reachable', () => {
    for (const [id, trait] of Object.entries(TRAITS)) {
      const members = ROSTER.filter((u) => u.origin === id || (u.classes as readonly string[]).includes(id)).length;
      expect(trait.levels, id).toHaveLength(trait.breakpoints.length);
      trait.breakpoints.forEach((b, i) => {
        if (i > 0) expect(b, id).toBeGreaterThan(trait.breakpoints[i - 1]!);
      });
      expect(trait.breakpoints.at(-1)!, id).toBeLessThanOrEqual(members);
    }
  });
});

describe('economy', () => {
  it('has shop odds for levels 1 to 9 that add up to 100%', () => {
    expect(SHOP.odds).toHaveLength(9);
    for (const odds of SHOP.odds) expect(odds.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('needs XP for every level from the first one that can be bought to 9', () => {
    for (let level = XP.buyFromLevel + 1; level <= 9; level++) expect(XP.toLevel[level]).toBeGreaterThan(0);
  });
});
