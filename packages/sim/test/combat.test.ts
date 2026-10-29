import { describe, expect, it } from 'vitest';
import { createCombat, Fight, simulateCombat, type Combat, type CombatResult, type UnitState } from '../src/combat/combat.js';
import { finalDamage, manaFromDamage, overtimePct } from '../src/combat/damage.js';
import type { CombatEvent } from '../src/combat/events.js';
import { actionOrder, firstTeam, startingSlots } from '../src/combat/order.js';
import { baseStats, finalStats, type Stats } from '../src/combat/stats.js';
import { LAST_TICK, OVERTIME_START_TICK } from '../src/combat/time.js';
import { UNITS, type UnitId } from '../src/data/units.js';
import { boardIndex, distance, fromOffset } from '../src/hex.js';
import { createRng } from '../src/rng.js';
import type { Star } from '../src/types.js';
import { BOARDS, input, mirrorMatch, placed } from './helpers.js';

/** Runs a fight to the end, calling `check` with each tick's events. */
function run(combat: Combat, check: (events: CombatEvent[]) => void = () => {}): CombatResult {
  while (!combat.isOver()) check(combat.step());
  return combat.result();
}

const FIGHT = input([placed('sam', 2, 3, 2), placed('legolas', 0, 0)], [placed('gimli', 2, 3), placed('saruman', 6, 0)]);

/** Sam (A, id 0) and Gimli (B, id 1) side by side, so they only attack. */
const DUEL = input([placed('sam', 3, 3)], [placed('gimli', 3, 3)]);

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

  it('goes by slot, with the first team’s unit first in each slot', () => {
    expect(actionOrder(units, 'A').map((u) => u.name)).toEqual(['A0', 'B0', 'A1', 'B1', 'A2']);
    expect(actionOrder(units, 'B').map((u) => u.name)).toEqual(['B0', 'A0', 'B1', 'A1', 'A2']);
  });

  it('does not depend on the input order', () => {
    expect(actionOrder([...units].reverse(), 'B')).toEqual(actionOrder(units, 'B'));
  });
});

describe('firstTeam', () => {
  it('uses one number from the generator', () => {
    const rng = createRng(42);
    const reference = createRng(42);
    // The first number for seed 42 is 0.6011..., which is not below 0.5.
    expect(firstTeam(rng)).toBe('B');
    reference();
    expect(rng()).toBe(reference());
  });

  it('picks each team about half the time', () => {
    const rng = createRng(7);
    const picksA = Array.from({ length: 10_000 }, () => firstTeam(rng)).filter((team) => team === 'A').length;
    expect(picksA).toBeGreaterThan(4800);
    expect(picksA).toBeLessThan(5200);
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
  it('ends on the tick the last enemy dies, with nothing after it', () => {
    const combat = createCombat(DUEL);
    const result = run(combat);
    const [death, end] = result.events.slice(-2);
    expect(death).toMatchObject({ type: 'death', tick: result.finalTick });
    expect(end).toEqual({ type: 'end', tick: result.finalTick, outcome: result.outcome });
    const loser = result.outcome === 'A' ? 'B' : 'A';
    expect(combat.state.units.filter((u) => u.team === loser).every((u) => !u.alive)).toBe(true);
    expect(result.finalTick).toBeLessThan(LAST_TICK);
  });

  it('is a draw when both teams are still alive after tick 1349', () => {
    // Neither side can target the other, so nobody attacks.
    const combat = new Fight(input([placed('sam', 3, 0)], [placed('gimli', 3, 0)]));
    combat.applyStatus(0, 0, { kind: 'untargetable', seconds: 60 });
    combat.applyStatus(1, 1, { kind: 'untargetable', seconds: 60 });
    const result = run(combat);
    expect(result).toMatchObject({ outcome: 'draw', finalTick: LAST_TICK });
    expect(result.events.filter((e) => e.type === 'end')).toEqual([{ type: 'end', tick: LAST_TICK, outcome: 'draw' }]);
    expect(result.survivors.A.length).toBeGreaterThan(0);
    expect(result.survivors.B.length).toBeGreaterThan(0);
  });

  it('lists the surviving non-summon units in slot order', () => {
    const combat = createCombat(FIGHT);
    const result = run(combat);
    for (const team of ['A', 'B'] as const) {
      const alive = combat.state.units.filter((u) => u.team === team && u.alive).sort((a, b) => a.slot - b.slot);
      expect(result.survivors[team]).toEqual(alive.map((u) => ({ unitId: u.unitId, star: u.star })));
    }
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
    expect(simulateCombat(FIGHT)).toEqual(run(createCombat(FIGHT)));
  });
});

describe('targeting and movement', () => {
  it('moves units in action order, with the tick’s first team first in each slot', () => {
    // Ids: sam 0, legolas 1, gimli 2, saruman 3. Nobody starts in range.
    const a = [placed('sam', 3, 0), placed('legolas', 0, 0)];
    const b = [placed('gimli', 3, 0), placed('saruman', 6, 0)];
    // Tick 0 takes the first number from the generator for its leaps and charges; tick 1 the second.
    const tick1First = (seed: number) => {
      const rng = createRng(seed);
      firstTeam(rng);
      return firstTeam(rng);
    };
    const seeds = Array.from({ length: 50 }, (_, i) => i + 1);
    const seedA = seeds.find((s) => tick1First(s) === 'A')!;
    const seedB = seeds.find((s) => tick1First(s) === 'B')!;
    const movers = (seed: number) => createCombat(input(a, b, seed)).step().map((e) => (e.type === 'move' ? e.unit : null));
    expect(movers(seedA)).toEqual([0, 2, 1, 3]);
    expect(movers(seedB)).toEqual([2, 0, 3, 1]);
  });

  it('walks living units one step at a time, never two on a hex, and attacks only in range', () => {
    for (const seed of [1, 2, 3]) {
      const combat = createCombat(mirrorMatch(BOARDS.full, seed));
      const arrives = new Map<number, number>();
      let moves = 0;
      run(combat, (events) => {
        const units = combat.state.units;
        for (const e of events) {
          if (e.type === 'move') {
            moves++;
            expect(distance(e.from, e.to)).toBe(1);
            expect(e.arriveTick).toBe(e.tick + 15);
            expect(e.tick).toBeGreaterThanOrEqual(arrives.get(e.unit) ?? 1);
            arrives.set(e.unit, e.arriveTick);
          }
        }
        const hexes = units.filter((u) => u.alive).map((u) => boardIndex(u.hex));
        expect(new Set(hexes).size).toBe(hexes.length);
      });
      expect(moves).toBeGreaterThan(0);
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

describe('basic attacks', () => {
  function attackTicks(events: readonly CombatEvent[], unit: number): number[] {
    return events.flatMap((e) => (e.type === 'attack' && e.unit === unit ? [e.tick] : []));
  }

  it('fires on tick 1, then every 30 / Attack Speed ticks, keeping the fraction', () => {
    // Boromir has Attack Speed 0.7 (42.86 ticks), Gimli 0.6 (50 ticks).
    const events = run(createCombat(input([placed('boromir', 3, 3)], [placed('gimli', 3, 3)]))).events;
    expect(attackTicks(events, 0).slice(0, 4)).toEqual([1, 44, 87, 130]);
    expect(attackTicks(events, 1).slice(0, 4)).toEqual([1, 51, 101, 151]);
  });

  it('deals physical damage reduced by Armor, with crits', () => {
    // Sam has 45 Attack Damage, Gimli 59 (45 × 1.3 = 58.5); Armor 40 and 50; Crit Damage 140%.
    const events = run(createCombat(DUEL)).events;
    const hits = events.flatMap((e) => (e.type === 'damage' && e.kind === 'attack' && e.tick < OVERTIME_START_TICK ? [e] : []));
    for (const hit of hits) {
      const expected = hit.source === 0 ? (hit.crit ? 42 : 30) : hit.crit ? 59 : 42;
      expect(hit).toMatchObject({ amount: expected, damageType: 'physical' });
    }
    expect(hits.some((h) => h.crit)).toBe(true);
    expect(hits.some((h) => !h.crit)).toBe(true);
  });

  it('gives the attacker 10 mana and the defender 6% of the damage taken', () => {
    const combat = createCombat(DUEL);
    const tick1 = combat.step();
    const taken = (unit: number) => tick1.flatMap((e) => (e.type === 'damage' && e.target === unit ? [e.amount] : []));
    const [sam, gimli] = combat.state.units;
    expect(taken(0)).toHaveLength(1);
    expect(sam!.mana).toBe(30 + 10 + manaFromDamage(taken(0)[0]!));
    expect(gimli!.mana).toBe(30 + 10 + manaFromDamage(taken(1)[0]!));
  });

  it('never lets mana go above max mana', () => {
    const combat = createCombat(DUEL);
    let reachedMax = false;
    run(combat, () => {
      for (const u of combat.state.units) {
        expect(u.mana).toBeLessThanOrEqual(u.base.maxMana);
        if (u.mana === u.base.maxMana) reachedMax = true;
      }
    });
    // Units at full mana cast on their next action.
    expect(reachedMax).toBe(true);
  });

  it('fires projectiles from ranged units that land after travelling 12 hexes per second', () => {
    // Legolas and Haldir stand 3 hexes apart, both in range, so neither moves: 3 × 30 / 12 = 7.5 ticks.
    const { events, finalTick } = run(createCombat(input([placed('legolas', 3, 1)], [placed('haldir', 3, 3)])));
    const attacks = events.flatMap((e) => (e.type === 'attack' ? [e] : []));
    expect(attacks.length).toBeGreaterThan(5);
    for (const attack of attacks) {
      expect(attack).toMatchObject({ ranged: true, hitTick: attack.tick + 8 });
      const landed = events.some((e) => (e.type === 'damage' || e.type === 'dodge') && e.tick === attack.hitTick && e.source === attack.unit);
      // Once the fight is over, nothing else lands. Both archers' last shots can be due on the final tick.
      if (attack.hitTick < finalTick) expect(landed).toBe(true);
      if (attack.hitTick > finalTick) expect(landed).toBe(false);
    }
  });
});

/**
 * A unit's stats when event `index` happened, rebuilt from the status events before it: buffs add
 * up, and only the strongest slow and reduction of each stat counts (section 12.1). It leaves out
 * static trait bonuses, so use it on boards without them.
 */
function statsAt(events: readonly CombatEvent[], index: number, unit: UnitState): Stats {
  const tick = events[index]!.tick;
  const active = events
    .slice(0, index)
    .flatMap((e) => (e.type === 'status' && e.target === unit.id && (e.expiresTick === null || e.expiresTick > tick) ? [e] : []));
  const total = (stat: string) => active.reduce((sum, e) => sum + (e.status === 'buff' && e.stat === stat ? e.value! : 0), 0);
  const strongest = (status: string, stat: string | null) =>
    active.reduce((max, e) => (e.status === status && e.stat === stat ? Math.max(max, e.value!) : max), 0);
  return finalStats(unit.base, {
    attackDamagePct: total('attackDamagePct'),
    attackSpeedPct: total('attackSpeedPct'),
    armor: total('armor'),
    magicResist: total('magicResist'),
    slowPct: strongest('slow', null),
    armorReductionPct: strongest('reduce', 'armor'),
    magicResistReductionPct: strongest('reduce', 'magicResist'),
  });
}

describe('fight invariants', () => {
  /** Fights with melee and ranged units, buffs and shields. The tank fights tend to reach overtime. */
  const fights = [BOARDS.full, BOARDS.tanks].flatMap((board) =>
    [1, 2, 3, 4].map((seed) => {
      const combat = createCombat(mirrorMatch(board, seed));
      const result = run(combat);
      return { units: combat.state.units, result };
    }),
  );

  it('never hits a dead unit, and never hits after the fight is over', () => {
    for (const { result } of fights) {
      const deaths = new Map<number, number>();
      for (const e of result.events) {
        if (e.type === 'damage' || e.type === 'dodge') {
          const target = e.type === 'damage' ? e.target : e.unit;
          expect(deaths.has(target)).toBe(false);
          expect(e.tick).toBeLessThanOrEqual(result.finalTick);
        }
        if (e.type === 'death') deaths.set(e.unit, e.tick);
      }
    }
  });

  it('runs every basic attack through the damage pipeline, with the stats of the moment and overtime', () => {
    // Boards with no trait that changes stats or damage: the tanks only get Guardian shields, and
    // the mixed board activates no trait, but Boromir buffs Armor and Magic Resist.
    const plainFights = [BOARDS.mixed, BOARDS.tanks].flatMap((board) =>
      [1, 2, 3, 4].map((seed) => {
        const combat = createCombat(mirrorMatch(board, seed));
        return { units: combat.state.units, result: run(combat) };
      }),
    );
    let overtimeHits = 0;
    let buffedHits = 0;
    for (const { units, result } of plainFights) {
      result.events.forEach((e, i) => {
        if (e.type !== 'damage' || e.kind !== 'attack') return;
        const source = statsAt(result.events, i, units[e.source]!);
        const target = statsAt(result.events, i, units[e.target]!);
        const raw = (source.attackDamage * (e.crit ? source.critDamagePct : 100)) / 100;
        const expected = finalDamage(raw, 'physical', target, { ampPct: 0, overtimePct: overtimePct(e.tick), reductionPct: 0 });
        expect(e.amount).toBe(expected);
        if (e.tick >= OVERTIME_START_TICK + 30) overtimeHits++;
        if (source.attackDamage !== units[e.source]!.base.attackDamage || target.armor !== units[e.target]!.base.armor) buffedHits++;
      });
    }
    expect(overtimeHits).toBeGreaterThan(0);
    expect(buffedHits).toBeGreaterThan(0);
  });

  it('changes each unit’s Health by exactly the damage its shields didn’t absorb and the healing it got', () => {
    for (const { units, result } of fights) {
      for (const unit of units) {
        let change = 0;
        for (const e of result.events) {
          if (e.type === 'damage' && e.target === unit.id) change -= e.amount - e.absorbed;
          if (e.type === 'heal' && e.target === unit.id) change += e.amount;
        }
        if (unit.alive) expect(unit.health).toBe(unit.stats.maxHealth + change);
        else expect(-change).toBeGreaterThanOrEqual(unit.stats.maxHealth);
      }
    }
  });

  it('lands projectiles whose attacker died on the way, and wastes those whose target did', () => {
    let landedAfterDeath = 0;
    let wasted = 0;
    for (const { result } of fights) {
      const deathTick = new Map<number, number>();
      for (const e of result.events) if (e.type === 'death') deathTick.set(e.unit, e.tick);
      for (const attack of result.events) {
        if (attack.type !== 'attack' || !attack.ranged || attack.hitTick >= result.finalTick) continue;
        const sourceDied = (deathTick.get(attack.unit) ?? Infinity) < attack.hitTick;
        const targetDied = (deathTick.get(attack.target) ?? Infinity) < attack.hitTick;
        const landed = result.events.some(
          (e) =>
            e.tick === attack.hitTick &&
            ((e.type === 'damage' && e.source === attack.unit && e.target === attack.target) ||
              (e.type === 'dodge' && e.source === attack.unit && e.unit === attack.target)),
        );
        if (targetDied) {
          expect(landed).toBe(false);
          wasted++;
        } else if (sourceDied && (deathTick.get(attack.target) ?? Infinity) > attack.hitTick) {
          expect(landed).toBe(true);
          landedAfterDeath++;
        }
      }
    }
    expect(landedAfterDeath).toBeGreaterThan(0);
    expect(wasted).toBeGreaterThan(0);
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
