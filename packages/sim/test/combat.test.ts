import { describe, expect, it } from 'vitest';
import { createCombat, simulateCombat, type CombatInput, type PlacedUnit } from '../src/combat/combat.js';
import { actionOrder, startingSlots } from '../src/combat/order.js';
import { baseStats } from '../src/combat/stats.js';
import { LAST_TICK, OVERTIME_START_TICK } from '../src/combat/time.js';
import { UNITS, type UnitId } from '../src/data/units.js';
import { boardIndex, distance, fromOffset } from '../src/hex.js';
import type { Star } from '../src/types.js';

function placed(unitId: UnitId, col: number, row: number, star: Star = 1): PlacedUnit {
  return { unitId, star, col, row, items: [] };
}

function input(A: PlacedUnit[], B: PlacedUnit[]): CombatInput {
  return { seed: 1, stage: 2, teams: { A, B } };
}

const FIGHT = input([placed('sam', 2, 3, 2), placed('legolas', 0, 0)], [placed('gimli', 2, 3), placed('saruman', 6, 0)]);

describe('timing', () => {
  it('runs 30 seconds plus 15 seconds of overtime at 30 ticks per second', () => {
    expect(OVERTIME_START_TICK).toBe(900);
    expect(LAST_TICK).toBe(1349);
  });
});

describe('startingSlots', () => {
  it('ranks the front row first, then by column', () => {
    const slots = startingSlots([placed('sam', 0, 0), placed('merry', 5, 3), placed('pippin', 1, 3), placed('frodo', 2, 1)]);
    expect(slots).toEqual([3, 1, 0, 2]);
  });
});

describe('actionOrder', () => {
  const units = [
    { name: 'A0', team: 'A', slot: 0 },
    { name: 'A1', team: 'A', slot: 1 },
    { name: 'A2', team: 'A', slot: 2 },
    { name: 'B0', team: 'B', slot: 0 },
    { name: 'B1', team: 'B', slot: 1 },
  ] as const;

  it('goes by slot, with team A first on even ticks and team B first on odd ticks', () => {
    expect(actionOrder(units, 2).map((u) => u.name)).toEqual(['A0', 'B0', 'A1', 'B1', 'A2']);
    expect(actionOrder(units, 1).map((u) => u.name)).toEqual(['B0', 'A0', 'B1', 'A1', 'A2']);
  });

  it('does not depend on the input order', () => {
    expect(actionOrder([...units].reverse(), 7)).toEqual(actionOrder(units, 7));
  });
});

describe('createCombat', () => {
  it('processes tick 0 on creation and spawns units in board coordinates', () => {
    const combat = createCombat(FIGHT);
    expect(combat.tick).toBe(0);
    expect(combat.isOver()).toBe(false);
    expect(combat.events).toEqual([
      { type: 'spawn', tick: 0, unit: 0, unitId: 'sam', team: 'A', hex: fromOffset({ col: 2, row: 3 }), star: 2, summon: false },
      { type: 'spawn', tick: 0, unit: 1, unitId: 'legolas', team: 'A', hex: fromOffset({ col: 0, row: 0 }), star: 1, summon: false },
      // Team B's own (2, 3) is board (4, 4), and its (6, 0) is board (0, 7).
      { type: 'spawn', tick: 0, unit: 2, unitId: 'gimli', team: 'B', hex: fromOffset({ col: 4, row: 4 }), star: 1, summon: false },
      { type: 'spawn', tick: 0, unit: 3, unitId: 'saruman', team: 'B', hex: fromOffset({ col: 0, row: 7 }), star: 1, summon: false },
    ]);
  });

  it('gives ids in slot order, team A first, whatever the input order', () => {
    const reordered = input([placed('legolas', 0, 0), placed('sam', 2, 3, 2)], [placed('saruman', 6, 0), placed('gimli', 2, 3)]);
    expect(createCombat(reordered).events).toEqual(createCombat(FIGHT).events);
    expect(createCombat(FIGHT).state.units.map((u) => [u.id, u.team, u.slot])).toEqual([
      [0, 'A', 0],
      [1, 'A', 1],
      [2, 'B', 0],
      [3, 'B', 1],
    ]);
  });

  it('starts units alive, at full health and starting mana', () => {
    const [sam, legolas] = createCombat(FIGHT).state.units;
    expect(sam!.base).toEqual(baseStats(UNITS.sam, 2));
    expect(sam!.stats.maxHealth).toBe(1170);
    expect(sam!).toMatchObject({ alive: true, health: 1170, mana: 30, summon: false });
    expect(legolas!).toMatchObject({ health: baseStats(UNITS.legolas, 1).maxHealth, mana: 0 });
  });
});

describe('end of combat', () => {
  it('is a draw when both teams are still alive after tick 1349', () => {
    // Two melee units side by side, so nothing moves.
    const combat = createCombat(input([placed('sam', 3, 3)], [placed('gimli', 3, 3)]));
    expect(combat.step()).toEqual([]);
    expect(combat.tick).toBe(1);
    while (combat.tick < LAST_TICK - 1) expect(combat.step()).toEqual([]);
    expect(combat.step()).toEqual([{ type: 'end', tick: 1349, outcome: 'draw' }]);
    expect(combat.isOver()).toBe(true);
    expect(combat.result()).toMatchObject({ outcome: 'draw', finalTick: 1349 });
  });

  it('lists the surviving units in slot order', () => {
    expect(simulateCombat(FIGHT).survivors).toEqual({
      A: [
        { unitId: 'sam', star: 2 },
        { unitId: 'legolas', star: 1 },
      ],
      B: [
        { unitId: 'gimli', star: 1 },
        { unitId: 'saruman', star: 1 },
      ],
    });
  });

  it('ends at once when a team has no units', () => {
    const combat = createCombat(input([placed('sam', 0, 3)], []));
    expect(combat.isOver()).toBe(true);
    expect(combat.result()).toMatchObject({ outcome: 'A', finalTick: 0, survivors: { A: [{ unitId: 'sam', star: 1 }], B: [] } });
    expect(combat.events.at(-1)).toEqual({ type: 'end', tick: 0, outcome: 'A' });
    expect(simulateCombat(input([], [placed('sam', 0, 3)])).outcome).toBe('B');
    expect(simulateCombat(input([], [])).outcome).toBe('draw');
  });

  it('refuses to step a finished fight or give a result before the end', () => {
    expect(() => createCombat(FIGHT).result()).toThrow(/not over/);
    expect(() => createCombat(input([], [])).step()).toThrow(/over/);
  });

  it('gives the same result from simulateCombat as from stepping', () => {
    const combat = createCombat(FIGHT);
    while (!combat.isOver()) combat.step();
    expect(simulateCombat(FIGHT)).toEqual(combat.result());
  });
});

describe('targeting and movement', () => {
  it('moves units in action order, team B first on odd ticks', () => {
    // Ids: sam 0, legolas 1, gimli 2, saruman 3. Nobody starts in range.
    const fight = input([placed('sam', 3, 0), placed('legolas', 0, 0)], [placed('gimli', 3, 0), placed('saruman', 6, 0)]);
    const tick1 = createCombat(fight).step();
    expect(tick1.map((e) => (e.type === 'move' ? e.unit : null))).toEqual([2, 0, 3, 1]);
  });

  it('walks units into range one step at a time, never sharing a hex', () => {
    const combat = createCombat(
      input([placed('sam', 3, 0), placed('legolas', 0, 0), placed('aragorn', 6, 1)], [placed('gimli', 3, 0), placed('saruman', 6, 0), placed('eomer', 1, 1)]),
    );
    const arrives = new Map<number, number>();
    let moves = 0;
    while (!combat.isOver()) {
      for (const e of combat.step()) {
        if (e.type !== 'move') continue;
        moves++;
        expect(distance(e.from, e.to)).toBe(1);
        expect(e.arriveTick).toBe(e.tick + 15);
        expect(e.tick).toBeGreaterThanOrEqual(arrives.get(e.unit) ?? 1);
        arrives.set(e.unit, e.arriveTick);
      }
      const hexes = combat.state.units.map((u) => boardIndex(u.hex));
      expect(new Set(hexes).size).toBe(hexes.length);
    }
    expect(moves).toBeGreaterThan(0);
    for (const u of combat.state.units) {
      const target = combat.state.units[u.target!]!;
      expect(distance(u.hex, target.hex)).toBeLessThanOrEqual(u.stats.range);
    }
  });

  it('applies the Hobbit rule only while the defending team has the Hobbit trait', () => {
    // Legolas is 4 hexes from both Sam and Haldir, and Sam comes first in the tie-break.
    // Haldir stands next to Sam and is in range of Legolas, so he doesn't move away.
    const legolas = [placed('legolas', 3, 0)];
    const withTrait = createCombat(input(legolas, [placed('sam', 3, 3), placed('haldir', 2, 3), placed('merry', 0, 0)]));
    const withoutTrait = createCombat(input(legolas, [placed('sam', 3, 3), placed('haldir', 2, 3), placed('hama', 0, 0)]));
    withTrait.step();
    withoutTrait.step();
    const targetOf = (c: typeof withTrait) => c.state.units[c.state.units[0]!.target!]!.unitId;
    expect(targetOf(withTrait)).toBe('haldir');
    expect(targetOf(withoutTrait)).toBe('sam');
  });

  it('makes Burglars target the farthest enemy only while their team has the Burglar trait', () => {
    const enemies = [placed('beregond', 3, 3), placed('hama', 0, 0)];
    const withTrait = createCombat(input([placed('merry', 3, 3), placed('grishnakh', 0, 0)], enemies));
    const withoutTrait = createCombat(input([placed('merry', 3, 3), placed('sam', 0, 0)], enemies));
    withTrait.step();
    withoutTrait.step();
    const targetOf = (c: typeof withTrait) => c.state.units[c.state.units[0]!.target!]!.unitId;
    expect(targetOf(withTrait)).toBe('hama');
    expect(targetOf(withoutTrait)).toBe('beregond');
  });
});

describe('input validation', () => {
  const sam = placed('sam', 0, 0);

  it('rejects unknown units and bad star levels', () => {
    expect(() => createCombat(input([placed('smeagol' as UnitId, 0, 0)], []))).toThrow(/unknown unit "smeagol"/);
    expect(() => createCombat(input([{ ...sam, star: 4 as Star }], []))).toThrow(/star/);
  });

  it('rejects placements outside the team’s half and two units on one hex', () => {
    for (const [col, row] of [
      [0, 4],
      [7, 0],
      [-1, 0],
      [1.5, 0],
    ] as const) {
      expect(() => createCombat(input([], [placed('sam', col, row)]))).toThrow(/half/);
    }
    expect(() => createCombat(input([sam, placed('merry', 0, 0)], []))).toThrow(/two units on one hex/);
  });

  it('rejects a seed or stage that is not a whole number', () => {
    expect(() => createCombat({ ...input([sam], []), seed: 1.5 })).toThrow(/seed/);
    expect(() => createCombat({ ...input([sam], []), stage: 0 })).toThrow(/stage/);
  });
});
