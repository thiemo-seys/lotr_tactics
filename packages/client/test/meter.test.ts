import { fromOffset, simulateCombat, type CombatEvent, type SpawnEvent } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { meterRows } from '../src/meter.js';

const hex = fromOffset({ col: 0, row: 0 });
const spawn = (unit: number, unitId: SpawnEvent['unitId'], team: 'A' | 'B', owner: number | null = null): SpawnEvent => ({
  type: 'spawn',
  tick: 0,
  unit,
  unitId,
  team,
  hex,
  star: 1,
  summon: owner !== null || unitId === 'eye-nazgul',
  owner,
});
const damage = (source: number, target: number, amount: number, damageType: 'physical' | 'magic' | 'true' = 'physical', absorbed = 0): CombatEvent => ({
  type: 'damage',
  tick: 1,
  source,
  target,
  amount,
  absorbed,
  damageType,
  crit: false,
  kind: 'attack',
});

// Team A: Gothmog (0) with a grunt (3), and Sam (1). Team B: Gimli (2) and the Eye's Nazgûl (4).
const events: CombatEvent[] = [
  spawn(0, 'gothmog', 'A'),
  spawn(1, 'sam', 'A'),
  spawn(2, 'gimli', 'B'),
  spawn(3, 'orc-grunt', 'A', 0),
  spawn(4, 'eye-nazgul', 'B'),
  damage(0, 2, 100, 'magic'),
  damage(3, 2, 30),
  damage(1, 2, 50, 'true', 20),
  damage(2, 3, 40),
  damage(4, 1, 70),
  { type: 'heal', tick: 2, source: 1, target: 1, amount: 25 },
  { type: 'shield', tick: 2, source: 3, target: 0, amount: 60, expiresTick: 100 },
  { type: 'death', tick: 3, unit: 1 },
];

describe('damage meter', () => {
  it("counts damage dealt in full, with a summon's in its owner's row, most first", () => {
    expect(meterRows(events, 'A', 'dealt')).toEqual([
      { unit: 0, unitId: 'gothmog', star: 1, dead: false, total: 130, parts: [{ part: 'physical', amount: 30 }, { part: 'magic', amount: 100 }] },
      { unit: 1, unitId: 'sam', star: 1, dead: true, total: 50, parts: [{ part: 'true', amount: 50 }] },
    ]);
  });

  it('counts damage taken, with what a summon took in its owner’s row', () => {
    expect(meterRows(events, 'A', 'taken').map((r) => [r.unitId, r.total])).toEqual([
      ['sam', 70],
      ['gothmog', 40],
    ]);
  });

  it('counts healing and shielding', () => {
    expect(meterRows(events, 'A', 'healing').map((r) => [r.unitId, r.parts])).toEqual([
      ['gothmog', [{ part: 'shield', amount: 60 }]],
      ['sam', [{ part: 'heal', amount: 25 }]],
    ]);
  });

  it("gives a summon with no owner, the Eye's Nazgûl, its own row, and lists units that did nothing", () => {
    expect(meterRows(events, 'B', 'dealt').map((r) => [r.unitId, r.total])).toEqual([
      ['eye-nazgul', 70],
      ['gimli', 40],
    ]);
  });

  it('breaks ties by unit id', () => {
    expect(meterRows(events.slice(0, 5), 'A', 'dealt').map((r) => r.unit)).toEqual([0, 1]);
  });

  it("adds up to a real fight's damage, Gothmog's grunts included", () => {
    const result = simulateCombat({
      seed: 3,
      stage: 2,
      teams: {
        A: [{ unitId: 'gothmog', star: 3, col: 3, row: 3, items: [] }],
        B: [{ unitId: 'gimli', star: 1, col: 3, row: 3, items: [] }],
      },
    });
    const dealt = result.events.filter((e) => e.type === 'damage' && result.events.some((s) => s.type === 'spawn' && s.unit === e.source && s.team === 'A'));
    // The grunts do some of it.
    expect(dealt.some((e) => e.type === 'damage' && e.source !== 0)).toBe(true);
    const rows = meterRows(result.events, 'A', 'dealt');
    expect(rows.map((r) => r.unitId)).toEqual(['gothmog']);
    expect(rows[0]!.total).toBe(dealt.reduce((sum, e) => sum + (e.type === 'damage' ? e.amount : 0), 0));
  });
});
