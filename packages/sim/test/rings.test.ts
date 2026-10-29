// Rings of Power in the fight (docs/sim-spec.md section 12.7).

import { describe, expect, it } from 'vitest';
import { Fight, type CombatInput, type PlacedUnit, type UnitState } from '../src/combat/combat.js';
import { finalDamage } from '../src/combat/damage.js';
import { COMBINED_ITEM_IDS, RING_OF_POWER_IDS, isCombined, isComponent, isRingOfPower, itemStats } from '../src/combat/items.js';
import { traitLevels } from '../src/combat/traits.js';
import { ITEMS } from '../src/data/items.js';
import type { UnitId } from '../src/data/units.js';
import { distance } from '../src/hex.js';
import type { Team } from '../src/types.js';
import { input, ofType, placed, stepTo } from './helpers.js';

function unitOf(fight: Fight, unitId: UnitId, team: Team = 'A'): UnitState {
  return fight.state.units.find((u) => u.unitId === unitId && u.team === team)!;
}

/** The first basic attack a unit lands, and the damage it should deal with a given amp. */
function firstHit(fight: Fight, unitId: UnitId, ampPct: number): { amount: number; expected: number } {
  const source = unitOf(fight, unitId);
  const hit = ofType(stepTo(fight, 60), 'damage').find((e) => e.source === source.id && e.kind === 'attack')!;
  const target = fight.state.units[hit.target]!;
  const raw = (source.stats.attackDamage * (hit.crit ? source.stats.critDamagePct : 100)) / 100;
  return { amount: hit.amount, expected: finalDamage(raw, 'physical', target.stats, { ampPct, overtimePct: 100, reductionPct: 0 }) };
}

describe('ring data', () => {
  it('has the Three once each, 7 of the Seven and 9 of the Nine, with no stats, never components or combined items', () => {
    expect(RING_OF_POWER_IDS.map((id) => [id, ITEMS[id].ringOfPower!.family, ITEMS[id].ringOfPower!.copies])).toEqual([
      ['narya', 'three', 1],
      ['nenya', 'three', 1],
      ['vilya', 'three', 1],
      ['ring-of-the-seven', 'seven', 7],
      ['ring-of-the-nine', 'nine', 9],
    ]);
    for (const id of RING_OF_POWER_IDS) {
      expect([isComponent(id), isCombined(id), isRingOfPower(id)]).toEqual([false, false, true]);
      expect(itemStats(id)).toEqual({});
    }
    expect(COMBINED_ITEM_IDS).toHaveLength(21);
  });

  it('throws on two Rings of Power on a unit, or a bad One Ring Corruption', () => {
    const fight = (fightInput: CombatInput) => () => new Fight(fightInput);
    expect(fight(input([placed('gimli', 3, 3, 1, ['narya', 'ring-of-the-nine'])], [placed('sam', 3, 3)]))).toThrow(/one Ring of Power/);
    expect(fight(input([placed('gimli', 3, 3, 1, ['narya', 'blade', 'blade'])], [placed('sam', 3, 3)]))).not.toThrow();
    for (const bad of [-1, 10, 1.5]) {
      expect(fight({ ...input([placed('gimli', 3, 3)], [placed('sam', 3, 3)]), oneRingCorruption: bad })).toThrow(/Corruption/);
    }
    expect(fight({ ...input([placed('gimli', 3, 3)], [placed('sam', 3, 3)]), oneRingCorruption: 9 })).not.toThrow();
  });
});

describe('the Three', () => {
  it('Narya: +20% Attack Speed to the bearer and allies within 2 hexes, +30% on an Elf or Istari', () => {
    const team = (bearer: UnitId): PlacedUnit[] => [placed(bearer, 3, 3, 1, ['narya']), placed('sam', 2, 3), placed('pippin', 0, 0)];
    const plain = new Fight(input([placed('gimli', 3, 3), placed('sam', 2, 3), placed('pippin', 0, 0)], [placed('beregond', 3, 3)]));
    const fight = new Fight(input(team('gimli'), [placed('beregond', 3, 3)]));
    expect(distance(unitOf(fight, 'pippin').hex, unitOf(fight, 'gimli').hex)).toBeGreaterThan(2);
    expect(unitOf(fight, 'gimli').stats.attackSpeed).toBeCloseTo((unitOf(plain, 'gimli').stats.attackSpeed * 120) / 100);
    expect(unitOf(fight, 'sam').stats.attackSpeed).toBeCloseTo((unitOf(plain, 'sam').stats.attackSpeed * 120) / 100);
    expect(unitOf(fight, 'pippin').stats.attackSpeed).toBe(unitOf(plain, 'pippin').stats.attackSpeed);
    expect(unitOf(fight, 'beregond', 'B').stats.attackSpeed).toBe(unitOf(plain, 'beregond', 'B').stats.attackSpeed);
    const elf = new Fight(input(team('haldir'), [placed('beregond', 3, 3)]));
    expect(unitOf(elf, 'sam').stats.attackSpeed).toBeCloseTo((unitOf(plain, 'sam').stats.attackSpeed * 130) / 100);
  });

  it('Narya: lasts only while its bearer lives', () => {
    const fight = new Fight(input([placed('pippin', 3, 3, 1, ['narya']), placed('gimli', 2, 3)], [placed('dain', 3, 3, 3), placed('gimli', 2, 3, 3)]));
    const pippin = unitOf(fight, 'pippin');
    const gimli = unitOf(fight, 'gimli');
    const hasted = gimli.stats.attackSpeed;
    while (pippin.alive) fight.step();
    expect(gimli.stats.attackSpeed).toBe(hasted);
    // Auras are updated at the start of the next tick.
    fight.step();
    expect(gimli.alive).toBe(true);
    expect(gimli.stats.attackSpeed).toBeCloseTo((hasted * 100) / 120);
  });

  it('Nenya: a 120 shield for 6 seconds to the bearer and allies within 2 hexes, at tick 0 and every 6 seconds', () => {
    const fight = new Fight(input([placed('gimli', 3, 3, 1, ['nenya']), placed('hama', 2, 3), placed('pippin', 0, 0)], [placed('beregond', 3, 3)]));
    const gimli = unitOf(fight, 'gimli');
    const nenya = (events: ReturnType<typeof stepTo>) => ofType(events, 'shield').filter((e) => e.source === gimli.id && e.amount === 120);
    const first = nenya(fight.events);
    expect(first.map((e) => fight.state.units[e.target]!.unitId).sort()).toEqual(['gimli', 'hama']);
    expect(first.every((e) => e.tick === 0 && e.expiresTick === 180)).toBe(true);
    const later = nenya(stepTo(fight, 180));
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((e) => e.tick === 180 && e.expiresTick === 360)).toBe(true);
    const elf = new Fight(input([placed('elrond', 3, 0, 1, ['nenya'])], [placed('beregond', 3, 3)]));
    expect(ofType(elf.events, 'shield').map((e) => e.amount)).toEqual([180]);
  });

  it('Vilya: heals the ally with the lowest Health % every 2 seconds, for 80, or 120 on an Elf or Istari', () => {
    const heals = (bearer: UnitId) => {
      const fight = new Fight(input([placed(bearer, 3, 0, 1, ['vilya']), placed('hama', 3, 3)], [placed('gimli', 3, 3, 3), placed('dain', 2, 3, 2)]));
      const source = unitOf(fight, bearer).id;
      while (!fight.isOver()) fight.step();
      return ofType(fight.events, 'heal').filter((e) => e.source === source);
    };
    const plain = heals('pippin');
    expect(plain.every((e) => e.tick % 60 === 0 && e.amount <= 80)).toBe(true);
    expect(plain.some((e) => e.amount === 80)).toBe(true);
    const kin = heals('haldir');
    expect(kin.every((e) => e.tick % 60 === 0 && e.amount <= 120)).toBe(true);
    expect(kin.some((e) => e.amount > 80)).toBe(true);
  });
});

describe('the Seven', () => {
  it('change nothing in the fight', () => {
    const board = [placed('gimli', 3, 3), placed('legolas', 2, 0)];
    const plain = new Fight(input(board, [placed('beregond', 3, 3)]));
    const seven = new Fight(input([placed('gimli', 3, 3, 1, ['ring-of-the-seven']), board[1]!], [placed('beregond', 3, 3)]));
    while (!plain.isOver()) plain.step();
    while (!seven.isOver()) seven.step();
    expect(seven.events).toEqual(plain.events);
  });
});

describe('the Nine', () => {
  it('count their bearer towards Nazgûl, once per unit, and not again for a Nazgûl', () => {
    const nine = [{ unitId: 'gimli', trait: 'nazgul' }] as const;
    expect(traitLevels(['gimli', 'ringwraith']).nazgul).toBeUndefined();
    expect(traitLevels(['gimli', 'ringwraith'], [], nine).nazgul).toBe(0);
    expect(traitLevels(['gimli', 'gimli', 'ringwraith'], [], [...nine, ...nine]).nazgul).toBe(0);
    expect(traitLevels(['ringwraith', 'khamul'], [], [{ unitId: 'ringwraith', trait: 'nazgul' }]).nazgul).toBe(0);
    expect(traitLevels(['gimli', 'ringwraith'], [], nine).dwarf).toBeUndefined();
  });

  it('make their bearer spread the Nazgûl slow', () => {
    const enemy = (items: readonly ('ring-of-the-nine' | 'blade')[]) =>
      unitOf(new Fight(input([placed('gimli', 3, 3, 1, items), placed('ringwraith', 2, 0)], [placed('beregond', 3, 3)])), 'beregond', 'B');
    const plain = enemy([]);
    expect(enemy(['ring-of-the-nine']).stats.attackSpeed).toBeCloseTo((plain.stats.attackSpeed * 85) / 100);
  });

  it("give their bearer Sauron's amp, and 5% damage per point of the One Ring's Corruption while it is held", () => {
    const board = [placed('gimli', 3, 3, 1, ['ring-of-the-nine']), placed('sauron', 0, 0)];
    const held = firstHit(new Fight({ ...input(board, [placed('beregond', 3, 3)]), oneRingCorruption: 4 }), 'gimli', 35);
    expect(held.amount).toBe(held.expected);
    const unheld = firstHit(new Fight(input(board, [placed('beregond', 3, 3)])), 'gimli', 15);
    expect(unheld.amount).toBe(unheld.expected);
    // Without the Nine, the One Ring's Corruption does nothing for Gimli.
    const plain = firstHit(new Fight({ ...input([placed('gimli', 3, 3), placed('sauron', 0, 0)], [placed('beregond', 3, 3)]), oneRingCorruption: 4 }), 'gimli', 0);
    expect(plain.amount).toBe(plain.expected);
  });

  it('add Nazgûl to The Fellowship\'s origins', () => {
    const fellowship = (items: readonly 'ring-of-the-nine'[]) =>
      firstHit(
        new Fight({ ...input([placed('gimli', 3, 3, 1, items), placed('legolas', 2, 0)], [placed('beregond', 3, 3)]), gifts: { A: ['fellowship'], B: [] } }),
        'gimli',
        items.length === 0 ? 8 : 12,
      );
    for (const hit of [fellowship([]), fellowship(['ring-of-the-nine'])]) expect(hit.amount).toBe(hit.expected);
  });

  it("let Éowyn deal double ability damage to their bearer", () => {
    const shieldmaiden = (items: readonly 'ring-of-the-nine'[]) => {
      // Four Fireworks fill Éowyn's mana, so she casts at once.
      const fight = new Fight({
        ...input([placed('gimli', 3, 3, 1, items)], [placed('eowyn', 3, 3)]),
        gifts: { A: [], B: ['gandalfs-fireworks', 'gandalfs-fireworks', 'gandalfs-fireworks', 'gandalfs-fireworks'] },
      });
      const eowyn = unitOf(fight, 'eowyn', 'B');
      return ofType(stepTo(fight, 1), 'damage').find((e) => e.source === eowyn.id && e.kind === 'ability')!.amount;
    };
    const plain = shieldmaiden([]);
    expect(Math.abs(shieldmaiden(['ring-of-the-nine']) - 2 * plain)).toBeLessThanOrEqual(1);
  });
});
