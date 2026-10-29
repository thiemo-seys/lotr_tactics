// The One Ring in the fight (docs/sim-spec.md section 12.6).

import { describe, expect, it } from 'vitest';
import { Fight, type CombatInput, type PlacedUnit, type UnitState } from '../src/combat/combat.js';
import { finalDamage } from '../src/combat/damage.js';
import { RING } from '../src/data/ring.js';
import type { UnitId } from '../src/data/units.js';
import { distance } from '../src/hex.js';
import type { Team } from '../src/types.js';
import { input, ofType, placed, stepTo } from './helpers.js';

function unitOf(fight: Fight, unitId: string, team: Team = 'A'): UnitState {
  return fight.state.units.find((u) => u.unitId === unitId && u.team === team)!;
}

function bearing(unitId: UnitId, col: number, row: number, corruption: number): PlacedUnit {
  return { ...placed(unitId, col, row), ring: corruption };
}

describe('the One Ring', () => {
  it('throws on two bearers, a monster bearer and a Corruption outside 0–9', () => {
    const fight = (A: PlacedUnit[], B: PlacedUnit[]) => () => new Fight(input(A, B));
    expect(fight([bearing('gimli', 3, 3, 1)], [bearing('sam', 3, 3, 1)])).toThrow(/Only one unit/);
    expect(fight([placed('gimli', 3, 3)], [{ unitId: 'warg', star: 1, col: 3, row: 3, items: [], ring: 1 }])).toThrow(/monster/);
    expect(fight([bearing('gimli', 3, 3, 10)], [placed('sam', 3, 3)])).toThrow(/Corruption/);
    expect(fight([bearing('gimli', 3, 3, 9)], [placed('sam', 3, 3)])).not.toThrow();
  });

  it('makes its bearer untargetable for the first 3 seconds', () => {
    const fight = new Fight(input([bearing('gimli', 3, 3, 0)], [placed('sam', 3, 3)]));
    const gimli = unitOf(fight, 'gimli');
    expect(gimli.ring).toBe(0);
    const hidden = ofType(fight.events, 'status').find((e) => e.target === gimli.id && e.status === 'untargetable');
    expect(hidden).toMatchObject({ tick: 0, expiresTick: 90 });
  });

  it('gives its bearer 10% more damage per point of Corruption', () => {
    const fight = new Fight(input([bearing('gimli', 3, 3, 3)], [placed('beregond', 3, 3)]));
    const gimli = unitOf(fight, 'gimli');
    const hit = ofType(stepTo(fight, 1), 'damage').find((e) => e.source === gimli.id)!;
    const target = fight.state.units[hit.target]!;
    const raw = (gimli.stats.attackDamage * (hit.crit ? gimli.stats.critDamagePct : 100)) / 100;
    expect(hit.amount).toBe(finalDamage(raw, 'physical', target.stats, { ampPct: 30, overtimePct: 100, reductionPct: 0 }));
  });

  it('Burden: lowers max Health by 5% per point above 3, unless Sam stands by', () => {
    const plain = unitOf(new Fight(input([placed('gimli', 3, 3)], [placed('beregond', 3, 3)])), 'gimli');
    const burdened = unitOf(new Fight(input([bearing('gimli', 3, 3, 5)], [placed('beregond', 3, 3)])), 'gimli');
    expect(burdened.stats.maxHealth).toBe(plain.stats.maxHealth - Math.round((plain.stats.maxHealth * 10) / 100));
    expect(burdened.health).toBe(burdened.stats.maxHealth);
    // Sam next to the bearer: the drawbacks act as if Corruption were 2 lower, so no Burden at 5.
    const helped = new Fight(input([bearing('gimli', 3, 3, 5), placed('sam', 2, 3)], [placed('beregond', 3, 3)]));
    expect(unitOf(helped, 'gimli').stats.maxHealth).toBe(plain.stats.maxHealth);
    // Sam further away doesn't help.
    const far = new Fight(input([bearing('gimli', 3, 3, 5), placed('sam', 0, 0)], [placed('beregond', 3, 3)]));
    expect(unitOf(far, 'gimli').stats.maxHealth).toBe(burdened.stats.maxHealth);
  });

  it("Grip: allies' shields and heals don't reach the bearer, its own still do", () => {
    const A = [bearing('gimli', 3, 3, 7), placed('aragorn', 2, 3, 1, ['star-of-elendil'])];
    const fight = new Fight({ ...input(A, [placed('beregond', 3, 3)]), gifts: { A: ['light-of-valinor'], B: [] } });
    const gimli = unitOf(fight, 'gimli');
    const aragorn = unitOf(fight, 'aragorn');
    const shields = ofType(fight.events, 'shield');
    expect(shields.filter((e) => e.target === gimli.id).map((e) => e.source)).toEqual([gimli.id]);
    expect(shields.some((e) => e.source === aragorn.id && e.target === aragorn.id)).toBe(true);
    // At Corruption 6 the Star of Elendil still reaches him.
    const below = new Fight(input([bearing('gimli', 3, 3, 6), placed('aragorn', 2, 3, 1, ['star-of-elendil'])], [placed('beregond', 3, 3)]));
    expect(ofType(below.events, 'shield').some((e) => e.target === unitOf(below, 'gimli').id && e.amount === 300)).toBe(true);
  });

  it('Betrayal: attacks the nearest ally and never casts or hits an enemy for the first 3 seconds', () => {
    const fight = new Fight(input([bearing('gimli', 3, 3, 9), placed('hama', 2, 3)], [placed('beregond', 3, 3)]));
    const gimli = unitOf(fight, 'gimli');
    const hama = unitOf(fight, 'hama');
    const early = stepTo(fight, 90);
    const attacks = ofType(early, 'attack').filter((e) => e.unit === gimli.id);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((e) => e.target === hama.id)).toBe(true);
    expect(ofType(early, 'cast').some((e) => e.unit === gimli.id)).toBe(false);
    // Afterwards it fights the enemy again.
    const later = stepTo(fight, 200);
    expect(ofType(later, 'attack').some((e) => e.unit === gimli.id && fight.state.units[e.target]!.team === 'B')).toBe(true);
  });

  it('Betrayal: waits when no ally is in range', () => {
    const fight = new Fight(input([bearing('gimli', 3, 3, 9), placed('sam', 0, 0)], [placed('beregond', 3, 3)]));
    const gimli = unitOf(fight, 'gimli');
    expect(ofType(stepTo(fight, 90), 'attack').filter((e) => e.unit === gimli.id)).toHaveLength(0);
  });

  it("The Eye's Nazgûl: appears next to the bearer for the other team and hunts it through its invisibility", () => {
    const fight = new Fight(input([bearing('gimli', 3, 3, 4), placed('dain', 2, 3)], [placed('beregond', 3, 3), placed('sam', 0, 0)]));
    const gimli = unitOf(fight, 'gimli');
    const eye = unitOf(fight, 'eye-nazgul', 'B');
    expect(eye).toMatchObject({ summon: true, origin: 'nazgul', ring: null });
    expect(distance(eye.hex, gimli.hex)).toBe(1);
    expect(eye.stats.maxHealth).toBe(RING.eye.health + 4 * RING.eye.healthPerCorruption);
    expect(eye.stats.attackDamage).toBe(RING.eye.attackDamage + 4 * RING.eye.attackDamagePerCorruption);
    const early = stepTo(fight, 89);
    const attacks = ofType(early, 'attack').filter((e) => e.unit === eye.id);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((e) => e.target === gimli.id)).toBe(true);
    // Nobody else attacks the invisible bearer.
    expect(ofType(early, 'attack').filter((e) => e.target === gimli.id && e.unit !== eye.id)).toHaveLength(0);
  });

  it("The Eye's Nazgûl: doesn't come for monsters, for an empty board, or without a bearer", () => {
    const eyes = (fightInput: CombatInput) => new Fight(fightInput).state.units.filter((u) => u.unitId === 'eye-nazgul').length;
    expect(eyes(input([bearing('gimli', 3, 3, 4)], [{ unitId: 'warg', star: 1, col: 3, row: 3, items: [] }]))).toBe(0);
    expect(eyes(input([bearing('gimli', 3, 3, 4)], []))).toBe(0);
    expect(eyes(input([placed('gimli', 3, 3)], [placed('sam', 3, 3)]))).toBe(0);
    expect(eyes(input([placed('sam', 3, 3)], [bearing('gimli', 3, 3, 0)]))).toBe(1);
  });
});
