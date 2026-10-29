import { describe, expect, it } from 'vitest';
import {
  bestClusterHex,
  dashHex,
  lineDashHex,
  onOwnHalf,
  select,
  summonHex,
  type AbilityUnit,
  type SelectionContext,
} from '../src/combat/abilities.js';
import { Fight, type PlacedUnit, type UnitState } from '../src/combat/combat.js';
import { finalDamage, manaFromDamage } from '../src/combat/damage.js';
import type { CombatEvent } from '../src/combat/events.js';
import { abilityValue, gruntStats, type Stats } from '../src/combat/stats.js';
import type { OriginId } from '../src/data/traits.js';
import { UNITS, type DamageType, type Selector, type UnitId } from '../src/data/units.js';
import { BOARD_HEXES, distance, fromOffset, fromPlacement, hexEquals, mirror, toOffset, type Hex } from '../src/hex.js';
import type { Team } from '../src/types.js';
import { BOARDS, input, mirrorMatch, ofType, placed, stepTo } from './helpers.js';

/** Board offset coordinates. */
function at(col: number, row: number): Hex {
  return fromOffset({ col, row });
}

describe('selectors', () => {
  let slot = 0;
  /** A unit for selector tests, at board offset (col, row). */
  function unit(team: Team, col: number, row: number, options: { health?: number; maxHealth?: number; origin?: OriginId } = {}) {
    const maxHealth = options.maxHealth ?? 500;
    return { team, hex: at(col, row), slot: slot++, origin: options.origin ?? 'dwarf', health: options.health ?? maxHealth, stats: { maxHealth } };
  }

  function pick(selector: Selector, caster: AbilityUnit, allies: AbilityUnit[], enemies: AbilityUnit[], target: AbilityUnit | null = null) {
    const ctx: SelectionContext<AbilityUnit> = { caster, allies: [caster, ...allies], enemies, target: () => target };
    return select(selector, ctx).units;
  }

  const caster = unit('A', 3, 3);

  it('picks the farthest, lowest-Health and highest-Health enemy, breaking ties by distance, then the section 5 order', () => {
    const near = unit('B', 3, 4, { health: 200 });
    const mid = unit('B', 3, 5, { health: 200 });
    const farLeft = unit('B', 0, 7, { health: 400 });
    const farRight = unit('B', 6, 7, { health: 400 });
    const enemies = [farRight, mid, farLeft, near];
    expect(pick({ kind: 'farthestEnemy' }, caster, [], enemies)).toEqual([farLeft]);
    expect(pick({ kind: 'lowestHealthEnemy' }, caster, [], enemies)).toEqual([near]);
    expect(pick({ kind: 'highestHealthEnemy' }, caster, [], enemies)).toEqual([farLeft]);
    expect(pick({ kind: 'nearestEnemies', count: 3 }, caster, [], enemies)).toEqual([near, mid, farLeft]);
  });

  it('picks the nearest other ally, and the lowest Health % allies with the caster included', () => {
    const self = unit('A', 3, 3, { health: 300, maxHealth: 600 });
    const half = unit('A', 2, 3, { health: 250, maxHealth: 500 });
    const quarter = unit('A', 0, 0, { health: 100, maxHealth: 400 });
    expect(pick({ kind: 'nearestAlly' }, self, [quarter, half], [])).toEqual([half]);
    expect(pick({ kind: 'nearestAlly' }, self, [], [])).toEqual([]);
    // The caster and `half` are both at 50%; the caster is nearer to itself.
    expect(pick({ kind: 'lowestHealthPctAllies', count: 2 }, self, [half, quarter], [])).toEqual([quarter, self]);
  });

  it('picks allies within a radius, the caster included, optionally of one origin', () => {
    const self = unit('A', 3, 3, { origin: 'orc' });
    const orcNear = unit('A', 1, 3, { origin: 'orc' });
    const orcFar = unit('A', 0, 0, { origin: 'orc' });
    const elfNear = unit('A', 2, 3, { origin: 'elf' });
    const allies = [orcFar, elfNear, orcNear];
    expect(pick({ kind: 'alliesWithin', radius: 2 }, self, allies, [])).toEqual([self, orcNear, elfNear]);
    expect(pick({ kind: 'alliesWithin', radius: 2, origin: 'orc' }, self, allies, [])).toEqual([self, orcNear]);
    expect(pick({ kind: 'adjacentAllies' }, self, allies, [])).toEqual([elfNear]);
  });

  it('bounces to the nearest enemy not yet hit within the jump, and stops when none is in range', () => {
    const target = unit('B', 3, 4);
    const second = unit('B', 3, 6); // 2 from the target
    const third = unit('B', 0, 6); // 3 from the second, 4 from the target
    const outOfReach = unit('B', 6, 4); // 3 from the target, 4 from the second
    const enemies = [outOfReach, third, second, target];
    expect(pick({ kind: 'bounce', count: 5, jump: 3 }, caster, [], enemies, target)).toEqual([target, second, third]);
    expect(pick({ kind: 'bounce', count: 2, jump: 3 }, caster, [], enemies, target)).toEqual([target, second]);
    expect(pick({ kind: 'bounce', count: 3, jump: 3 }, caster, [], enemies, null)).toEqual([]);
  });

  it('takes the enemies on a line in order from the caster, with the line’s hexes', () => {
    // From (3, 3) through (3, 4), the line runs (3, 4), (2, 5), (2, 6), (1, 7).
    const first = unit('B', 3, 4);
    const second = unit('B', 2, 5);
    const beyond = unit('B', 2, 6);
    const off = unit('B', 4, 5);
    const ctx: SelectionContext<AbilityUnit> = { caster, allies: [caster], enemies: [off, beyond, second, first], target: () => first };
    const { units, hexes } = select({ kind: 'line', length: 2 }, ctx);
    expect(units).toEqual([first, second]);
    expect(hexes).toEqual([at(3, 4), at(2, 5)]);
  });

  it('finds the hex with the most enemies around it, nearest the target on a tie, then by the section 5 order', () => {
    // Three enemies on mutually adjacent hexes: each of those hexes has all three within 1.
    const cluster = [unit('B', 3, 6), unit('B', 4, 6), unit('B', 3, 7), unit('B', 0, 0)];
    expect(bestClusterHex('A', cluster, 1, null)).toEqual(at(3, 6));
    expect(bestClusterHex('A', cluster, 1, at(5, 6))).toEqual(at(4, 6));
    // Team B sees the mirrored board.
    const mirrored = cluster.map((u) => ({ ...u, hex: mirror(u.hex) }));
    expect(bestClusterHex('B', mirrored, 1, null)).toEqual(mirror(at(3, 6)));
  });
});

describe('dash and summon placement', () => {
  const free = (taken: Hex[]) => (hex: Hex) => !taken.some((t) => hexEquals(t, hex));

  it('dashes to the free hex next to the unit that is nearest the caster', () => {
    const caster = at(3, 3);
    const target = at(3, 7);
    // (3, 6) and (4, 6) are both 3 from the caster; (3, 6) comes first in the tie-break.
    expect(dashHex('A', caster, target, free([caster, target]))).toEqual(at(3, 6));
    expect(dashHex('A', caster, target, free([caster, target, at(3, 6)]))).toEqual(at(4, 6));
    expect(dashHex('B', mirror(caster), mirror(target), free([mirror(caster), mirror(target)]))).toEqual(mirror(at(3, 6)));
  });

  it('falls back to the free hex nearest the unit, and stays put when nothing is free', () => {
    const caster = at(3, 3);
    const target = at(3, 7);
    const ring = [at(2, 7), at(4, 7), at(3, 6), at(4, 6)];
    // Of the hexes 2 from the target, (2, 5), (3, 5) and (4, 5) are nearest the caster; (2, 5) comes first.
    expect(dashHex('A', caster, target, free([caster, target, ...ring]))).toEqual(at(2, 5));
    expect(dashHex('A', caster, target, () => false)).toBeNull();
  });

  it('stays put when the caster is already next to the unit and its own hex counts as free', () => {
    const caster = at(3, 3);
    const target = at(3, 4);
    expect(dashHex('A', caster, target, free([target]))).toEqual(caster);
  });

  it('dashes through a line to its farthest free hex on the board', () => {
    const line = [at(3, 4), at(2, 5), at(2, 6), { q: 99, r: 99 }];
    expect(lineDashHex(line, free([at(3, 4)]))).toEqual(at(2, 6));
    expect(lineDashHex(line, free([at(2, 6)]))).toEqual(at(2, 5));
    expect(lineDashHex(line, () => false)).toBeNull();
  });

  it('places a summon on the first free neighbour on its own half, in perspective order', () => {
    const owner = at(3, 3);
    const placed = summonHex('A', owner, free([owner]));
    expect(placed).not.toBeNull();
    expect(distance(placed!, owner)).toBe(1);
    expect(onOwnHalf('A', placed!)).toBe(true);
    expect(summonHex('B', mirror(owner), free([mirror(owner)]))).toEqual(mirror(placed!));
  });

  it('places a summon on the nearest free hex of its half when no neighbour is, and nowhere when the half is full', () => {
    const owner = at(3, 3);
    const ownHalf = BOARD_HEXES.filter((hex) => onOwnHalf('A', hex));
    expect(ownHalf).toHaveLength(28);
    const neighbourhood = ownHalf.filter((hex) => distance(hex, owner) <= 1);
    const fallback = summonHex('A', owner, free(neighbourhood));
    expect(distance(fallback!, owner)).toBe(2);
    expect(onOwnHalf('A', fallback!)).toBe(true);
    expect(summonHex('A', owner, free(ownHalf))).toBeNull();
  });
});

interface Cast {
  readonly fight: Fight;
  readonly caster: UnitState;
  /** Tick 1's events from the cast on: everything the ability did. */
  readonly events: CombatEvent[];
  /** The unit placed at (col, row) in `team`'s perspective. */
  at(team: Team, col: number, row: number): UnitState;
  /** Expected damage of `pct` of D from the caster, using the stats both had before the cast. */
  damage(target: UnitState, pct: number, type?: DamageType, multiplierPct?: number): number;
  /** The caster's ability value (section 10.2). */
  value(base: 'D' | 'S' | 'H', pct: number): number;
}

/** The units that have cast in a `castBy` scenario. */
const covered = new Set<string>();

/**
 * Fills the mana of the unit placed first on team A and steps tick 1. Every other unit is stunned
 * for that tick, so tick 1's events from the cast on all come from the ability. `prepare` runs
 * first, on tick 0.
 */
function castBy(
  A: readonly PlacedUnit[],
  B: readonly PlacedUnit[],
  options: { prepare?: (fight: Fight, find: Cast['at']) => void; seed?: number } = {},
): Cast {
  const fight = new Fight(input(A, B, options.seed));
  const find = (team: Team, col: number, row: number) =>
    fight.state.units.find((u) => u.team === team && hexEquals(u.hex, fromPlacement(team, { col, row })))!;
  const caster = find('A', A[0]!.col, A[0]!.row);
  covered.add(caster.unitId);
  options.prepare?.(fight, find);
  for (const unit of fight.state.units) {
    if (unit !== caster) fight.applyStatus(unit.id, unit.id, { kind: 'stun', seconds: 2 / 30 });
  }
  Object.assign(caster, { mana: caster.base.maxMana });
  // Stats are replaced, not changed in place, so these stay as they were.
  const before = new Map<number, Stats>(fight.state.units.map((u) => [u.id, u.stats]));
  const tick1 = fight.step();
  const events = tick1.slice(tick1.findIndex((e) => e.type === 'cast'));
  const def = UNITS[caster.unitId as UnitId];
  expect(events[0]).toEqual({ type: 'cast', tick: 1, unit: caster.id, ability: def.ability.name });
  const cost = def.cost;
  const value = (base: 'D' | 'S' | 'H', pct: number) => abilityValue(base, pct, cost, caster.star, before.get(caster.id)!.abilityPower);
  return {
    fight,
    caster,
    events,
    at: find,
    value,
    damage: (target, pct, type = 'physical', multiplierPct = 100) =>
      finalDamage((value('D', pct) * multiplierPct) / 100, type, before.get(target.id)!, { ampPct: 0, overtimePct: 100, reductionPct: 0 }),
  };
}

const damages = (c: Cast) => ofType(c.events, 'damage').map((e) => [e.target, e.amount]);
const shields = (c: Cast) => ofType(c.events, 'shield').map((e) => [e.target, e.amount, e.expiresTick]);
const statuses = (c: Cast) => ofType(c.events, 'status').map((e) => [e.target, e.status, e.stat, e.value, e.expiresTick]);
const heals = (c: Cast) => ofType(c.events, 'heal').map((e) => [e.target, e.amount]);

describe('casting', () => {
  it('casts at full mana instead of attacking, then is busy for 15 ticks and gains no mana', () => {
    // Háma (id 0) and Haldir (id 1) stand 3 apart, so Haldir's first arrow lands on tick 9.
    const fight = new Fight(input([placed('hama', 3, 3)], [placed('haldir', 3, 1)]));
    const hama = fight.state.units[0]!;
    Object.assign(hama, { mana: hama.base.maxMana });
    const tick1 = fight.step();
    expect(ofType(tick1, 'cast')).toEqual([{ type: 'cast', tick: 1, unit: 0, ability: 'Doorward' }]);
    expect(ofType(tick1, 'attack').filter((e) => e.unit === 0)).toEqual([]);
    expect(hama.mana).toBe(0);

    const during = stepTo(fight, 15);
    const hit = ofType(during, 'damage').find((e) => e.target === 0)!;
    expect(hit.tick).toBe(9);
    expect(manaFromDamage(hit.amount)).toBeGreaterThan(0);
    expect(hama.mana).toBe(0);
    expect(during.some((e) => (e.type === 'move' || e.type === 'attack') && e.unit === 0)).toBe(false);
    expect(ofType(fight.step(), 'move').map((e) => e.unit)).toContain(0);
  });

  it('casts instead of moving when its target is out of range', () => {
    const c = castBy([placed('beregond', 3, 3)], [placed('gimli', 3, 0)]);
    const gimli = c.at('B', 3, 0);
    expect(distance(c.caster.hex, gimli.hex)).toBe(4);
    expect(damages(c)).toEqual([[gimli.id, 133]]);
    expect(ofType(c.events, 'move')).toEqual([]);
  });

  it('waits out a stun at full mana, then casts', () => {
    const fight = new Fight(input([placed('beregond', 3, 3)], [placed('gimli', 3, 3)]));
    const beregond = fight.state.units[0]!;
    Object.assign(beregond, { mana: beregond.base.maxMana });
    fight.applyStatus(1, 0, { kind: 'stun', seconds: 1 });
    expect(ofType(stepTo(fight, 29), 'cast')).toEqual([]);
    expect(ofType(fight.step(), 'cast')).toMatchObject([{ tick: 30, unit: 0 }]);
  });

  it('skips delayed steps once the caster has died', () => {
    const fight = new Fight(input([placed('frodo', 3, 3), placed('sam', 0, 0)], [placed('gimli', 3, 3)]));
    const frodo = fight.state.units[0]!;
    Object.assign(frodo, { mana: frodo.base.maxMana });
    fight.step();
    // Nothing can hit Frodo while he is untargetable, so stand in for a death.
    Object.assign(frodo, { alive: false });
    const events = stepTo(fight, 61);
    expect(ofType(events, 'damage').filter((e) => e.source === frodo.id)).toEqual([]);
  });

  it('never hits untargetable enemies', () => {
    const board = [placed('gimli', 3, 3), placed('haldir', 2, 3)];
    expect(damages(castBy([placed('gandalf', 3, 3)], board))).toHaveLength(2);
    const c = castBy([placed('gandalf', 3, 3)], board, {
      prepare: (fight, find) => {
        const haldir = find('B', 2, 3);
        fight.applyStatus(haldir.id, haldir.id, { kind: 'untargetable', seconds: 1 });
      },
    });
    expect(damages(c).map(([id]) => id)).toEqual([c.at('B', 3, 3).id]);
  });

  it('only crits when the ability says so', () => {
    let legolasCrits = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const fight = new Fight(mirrorMatch(BOARDS.full, seed));
      while (!fight.isOver()) fight.step();
      for (const e of ofType(fight.events, 'damage')) {
        if (e.kind !== 'ability' || !e.crit) continue;
        expect(fight.state.units[e.source]!.unitId).toBe('legolas');
        legolasCrits++;
      }
    }
    expect(legolasCrits).toBeGreaterThan(0);
  });

  it('lets the Witch-king take half damage from Gondor and Rohan units other than Éowyn', () => {
    const firstHit = (attacker: PlacedUnit['unitId']) => {
      const fight = new Fight(input([placed(attacker, 3, 3)], [placed('witch-king', 3, 3)]));
      const hit = ofType(fight.step(), 'damage').find((e) => e.source === 0)!;
      const [source, target] = fight.state.units;
      return { hit, source: source!, target: target! };
    };
    for (const [attacker, reductionPct] of [
      ['beregond', 50],
      ['hama', 50],
      ['eowyn', 0],
      ['gimli', 0],
    ] as const) {
      const { hit, source, target } = firstHit(attacker);
      const raw = (source.stats.attackDamage * (hit.crit ? source.stats.critDamagePct : 100)) / 100;
      expect(hit.amount).toBe(finalDamage(raw, 'physical', target.stats, { ampPct: 0, overtimePct: 100, reductionPct }));
    }
    // Ability damage too: 200 physical against Armor 50, halved.
    const c = castBy([placed('beregond', 3, 3)], [placed('witch-king', 3, 3)]);
    expect(damages(c)).toEqual([[c.at('B', 3, 3).id, 67]]);
  });

  it('doesn’t summon when its own half is full', () => {
    const fillers = BOARD_HEXES.filter((hex) => onOwnHalf('A', hex) && !hexEquals(hex, at(3, 3))).map((hex) => {
      const { col, row } = toOffset(hex);
      return placed('sam', col, row);
    });
    const c = castBy([placed('gothmog', 3, 3), ...fillers], [placed('gimli', 3, 3)]);
    expect(ofType(c.events, 'spawn')).toEqual([]);
    expect(statuses(c)).toEqual([[c.caster.id, 'buff', 'attackDamagePct', 25, 151]]);
  });
});

describe('abilities', () => {
  it('Sam shields himself and the nearest ally', () => {
    const c = castBy([placed('sam', 3, 3), placed('haldir', 2, 3), placed('eomer', 0, 0)], [placed('gimli', 3, 3)]);
    expect(shields(c)).toEqual([
      [c.caster.id, 150, 121],
      [c.at('A', 2, 3).id, 150, 121],
    ]);
  });

  it('Merry damages the target and lowers its Armor and Magic Resist', () => {
    const c = castBy([placed('merry', 3, 3)], [placed('gimli', 3, 3), placed('haldir', 2, 3)]);
    const gimli = c.at('B', 3, 3);
    expect(damages(c)).toEqual([[gimli.id, 133]]);
    expect(statuses(c)).toEqual([
      [gimli.id, 'reduce', 'armor', 30, 121],
      [gimli.id, 'reduce', 'magicResist', 30, 121],
    ]);
    expect([gimli.stats.armor, gimli.stats.magicResist]).toEqual([35, 35]);
  });

  it('Pippin’s stone bounces from the target to the nearest enemy within 3, three times', () => {
    const c = castBy(
      [placed('pippin', 3, 3)],
      [placed('gimli', 3, 3), placed('haldir', 3, 1), placed('eomer', 3, 0), placed('radagast', 0, 0)],
    );
    const hit = [c.at('B', 3, 3), c.at('B', 3, 1), c.at('B', 3, 0)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 70)]));
  });

  it('Beregond damages and stuns the target, choosing one first', () => {
    const c = castBy([placed('beregond', 3, 3)], [placed('gimli', 3, 3)]);
    const gimli = c.at('B', 3, 3);
    expect(damages(c)).toEqual([[gimli.id, 133]]);
    expect(statuses(c)).toEqual([[gimli.id, 'stun', null, null, 31]]);
    expect(c.caster.target).toBe(gimli.id);
  });

  it('Háma shields himself and gains Armor', () => {
    const c = castBy([placed('hama', 3, 3)], [placed('gimli', 3, 3)]);
    expect(shields(c)).toEqual([[c.caster.id, 200, 121]]);
    expect(statuses(c)).toEqual([[c.caster.id, 'buff', 'armor', 30, 151]]);
    expect(c.caster.stats.armor).toBe(70);
  });

  it('Grishnákh dashes next to the enemy with the lowest Health and strikes it', () => {
    const c = castBy([placed('grishnakh', 3, 3)], [placed('gimli', 3, 3), placed('haldir', 3, 0), placed('eomer', 0, 0)]);
    const haldir = c.at('B', 3, 0);
    expect(ofType(c.events, 'dash')).toEqual([{ type: 'dash', tick: 1, unit: c.caster.id, from: at(3, 3), to: at(3, 6) }]);
    expect(damages(c)).toEqual([[haldir.id, 200]]);
    expect(c.caster.target).toBe(haldir.id);
  });

  it('Sharku damages and slows the target', () => {
    const c = castBy([placed('sharku', 3, 3)], [placed('gimli', 3, 3)]);
    const gimli = c.at('B', 3, 3);
    expect(damages(c)).toEqual([[gimli.id, 133]]);
    expect(statuses(c)).toEqual([[gimli.id, 'slow', null, 30, 91]]);
    expect(gimli.stats.attackSpeed).toBeCloseTo(0.42, 10);
  });

  it('Gorbag hits the target three times', () => {
    const c = castBy([placed('gorbag', 3, 3)], [placed('gimli', 3, 3)]);
    const gimli = c.at('B', 3, 3);
    expect(damages(c)).toEqual([
      [gimli.id, 53],
      [gimli.id, 53],
      [gimli.id, 53],
    ]);
  });

  it('Frodo turns untargetable for 2 seconds, then strikes the target', () => {
    const c = castBy([placed('frodo', 3, 3)], [placed('gimli', 3, 3)]);
    const gimli = c.at('B', 3, 3);
    expect(statuses(c)).toEqual([[c.caster.id, 'untargetable', null, null, 61]]);
    expect(damages(c)).toEqual([]);
    const later = stepTo(c.fight, 61);
    // Gimli can't target Frodo until the start of tick 61.
    expect(ofType(later, 'attack').filter((e) => e.unit === gimli.id).map((e) => e.tick)).toEqual([61]);
    const strike = ofType(later, 'damage').filter((e) => e.kind === 'ability');
    expect(strike).toMatchObject([{ tick: 61, source: c.caster.id, target: gimli.id, amount: c.damage(gimli, 130) }]);
  });

  it('Haldir shoots the three nearest enemies', () => {
    const c = castBy(
      [placed('haldir', 3, 3)],
      [placed('gimli', 3, 3), placed('eomer', 2, 3), placed('radagast', 3, 2), placed('boromir', 0, 0)],
    );
    const hit = [c.at('B', 3, 3), c.at('B', 2, 3), c.at('B', 3, 2)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 70)]));
  });

  it('Faramir shoots the farthest enemy', () => {
    // Eomer and Radagast are both 5 away; Radagast comes first in the tie-break. 375 × 100 / 120 = 312.5 rounds up.
    const c = castBy([placed('faramir', 3, 3)], [placed('gimli', 3, 3), placed('eomer', 0, 0), placed('radagast', 6, 0)]);
    expect(damages(c)).toEqual([[c.at('B', 6, 0).id, 313]]);
  });

  it('Gamling speeds up allies within 2, himself included', () => {
    const c = castBy(
      [placed('gamling', 3, 3), placed('haldir', 2, 3), placed('radagast', 1, 3), placed('gimli', 0, 0)],
      [placed('eomer', 3, 3)],
    );
    expect(statuses(c)).toEqual(
      [c.at('A', 1, 3), c.at('A', 2, 3), c.caster].map((u) => [u.id, 'buff', 'attackSpeedPct', 30, 121]),
    );
  });

  it('Balin shields himself and adjacent allies', () => {
    // 0.6 S at cost 2 is 187.5, which rounds to 188.
    const c = castBy([placed('balin', 3, 3), placed('haldir', 2, 3), placed('radagast', 1, 3)], [placed('eomer', 3, 3)]);
    expect(shields(c)).toEqual([
      [c.caster.id, 188, 121],
      [c.at('A', 2, 3).id, 188, 121],
    ]);
  });

  it('Lurtz shoots every enemy on the line through the target, to the edge', () => {
    const c = castBy(
      [placed('lurtz', 3, 3)],
      [placed('gimli', 3, 3), placed('haldir', 4, 2), placed('eomer', 4, 1), placed('radagast', 2, 2)],
    );
    const hit = [c.at('B', 3, 3), c.at('B', 4, 2), c.at('B', 4, 1)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 100)]));
  });

  it('Radagast damages and slows the target and the enemies next to it', () => {
    const c = castBy([placed('radagast', 3, 0)], [placed('gimli', 3, 3), placed('eomer', 2, 3), placed('boromir', 3, 1)]);
    const hit = [c.at('B', 2, 3), c.at('B', 3, 3)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 80, 'magic')]));
    expect(statuses(c)).toEqual(hit.map((u) => [u.id, 'slow', null, 25, 91]));
  });

  it('Ringwraith deals magic damage and stuns the target', () => {
    const c = castBy([placed('ringwraith', 3, 3)], [placed('gimli', 3, 3)]);
    const gimli = c.at('B', 3, 3);
    expect(damages(c)).toEqual([[gimli.id, 167]]);
    expect(statuses(c)).toEqual([[gimli.id, 'stun', null, null, 46]]);
  });

  it('Bilbo stuns the target, then stabs it', () => {
    const c = castBy([placed('bilbo', 3, 3)], [placed('gimli', 3, 3)]);
    const gimli = c.at('B', 3, 3);
    expect(c.events.slice(1).map((e) => e.type)).toEqual(['status', 'damage']);
    expect(statuses(c)).toEqual([[gimli.id, 'stun', null, null, 61]]);
    expect(damages(c)).toEqual([[gimli.id, 200]]);
  });

  it('Gollum hits three times and heals for half the damage dealt, up to max Health', () => {
    const wounded = (missing: number) =>
      castBy([placed('gollum', 3, 3)], [placed('gimli', 3, 3)], {
        prepare: (_, find) => {
          const gollum = find('A', 3, 3);
          Object.assign(gollum, { health: gollum.stats.maxHealth - missing });
        },
      });
    const c = wounded(200);
    const gimli = c.at('B', 3, 3);
    expect(damages(c)).toEqual([
      [gimli.id, 80],
      [gimli.id, 80],
      [gimli.id, 80],
    ]);
    expect(heals(c)).toEqual([[c.caster.id, 120]]);
    expect(heals(wounded(50))).toEqual([[c.caster.id, 50]]);
    expect(heals(wounded(0))).toEqual([]);
  });

  it('Gimli hits adjacent enemies and shields himself', () => {
    const c = castBy([placed('gimli', 3, 3)], [placed('eomer', 3, 3), placed('haldir', 2, 3), placed('radagast', 3, 2)]);
    const hit = [c.at('B', 2, 3), c.at('B', 3, 3)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 90)]));
    expect(shields(c)).toEqual([[c.caster.id, 225, 121]]);
  });

  it('Boromir gives allies within 2 Armor and Magic Resist, and shields himself', () => {
    const c = castBy([placed('boromir', 3, 3), placed('haldir', 2, 3), placed('gimli', 0, 0)], [placed('eomer', 3, 3)]);
    const buffed = [c.at('A', 2, 3), c.caster];
    expect(statuses(c)).toEqual([
      ...buffed.map((u) => [u.id, 'buff', 'armor', 25, 151]),
      ...buffed.map((u) => [u.id, 'buff', 'magicResist', 25, 151]),
    ]);
    expect(shields(c)).toEqual([[c.caster.id, 375, 121]]);
  });

  it('Éomer hits the enemies on the first 4 hexes of the line through the target', () => {
    const c = castBy(
      [placed('eomer', 3, 3)],
      [placed('gimli', 3, 3), placed('haldir', 4, 2), placed('radagast', 5, 0), placed('boromir', 2, 2)],
    );
    const hit = [c.at('B', 3, 3), c.at('B', 4, 2), c.at('B', 5, 0)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 100)]));
  });

  it('Éowyn shields herself and strikes the target, for double damage against a Nazgûl', () => {
    const nazgul = castBy([placed('eowyn', 3, 3)], [placed('ringwraith', 3, 3)]);
    expect(shields(nazgul)).toEqual([[nazgul.caster.id, 225, 121]]);
    expect(damages(nazgul)).toEqual([[nazgul.at('B', 3, 3).id, 576]]);
    const dwarf = castBy([placed('eowyn', 3, 3)], [placed('gimli', 3, 3)]);
    expect(damages(dwarf)).toEqual([[dwarf.at('B', 3, 3).id, 240]]);
  });

  it('Uglúk shields himself and can’t be stunned for 4 seconds', () => {
    const c = castBy([placed('ugluk', 3, 3)], [placed('gimli', 3, 3)]);
    expect(shields(c)).toEqual([[c.caster.id, 375, 121]]);
    expect(statuses(c)).toEqual([[c.caster.id, 'stunImmune', null, null, 121]]);
    c.fight.applyStatus(1, c.caster.id, { kind: 'stun', seconds: 1 });
    expect(c.caster.statuses.has('stun')).toBe(false);
  });

  it('Khamûl rides through 3 hexes, damaging and slowing the enemies there, and ends on the farthest free one', () => {
    const c = castBy([placed('khamul', 3, 3)], [placed('gimli', 3, 3), placed('haldir', 4, 2), placed('radagast', 2, 2)]);
    const hit = [c.at('B', 3, 3), c.at('B', 4, 2)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 90, 'magic')]));
    expect(statuses(c)).toEqual(hit.map((u) => [u.id, 'slow', null, 25, 91]));
    expect(c.events.at(-1)).toEqual({ type: 'dash', tick: 1, unit: c.caster.id, from: at(3, 3), to: at(2, 6) });
  });

  it('Legolas shoots the target five times, and each arrow can crit', () => {
    let crits = 0;
    for (const seed of [1, 2, 3, 4]) {
      const c = castBy([placed('legolas', 3, 3)], [placed('gimli', 3, 3)], { seed });
      const hits = ofType(c.events, 'damage');
      expect(hits).toHaveLength(5);
      // 0.3 D at cost 4 is 105, or 147 on a crit, against Armor 50.
      for (const hit of hits) expect(hit.amount).toBe(hit.crit ? 98 : 70);
      crits += hits.filter((h) => h.crit).length;
    }
    expect(crits).toBeGreaterThan(0);
  });

  it('Elrond heals the two allies with the lowest Health % and gives them Magic Resist', () => {
    const c = castBy(
      [placed('elrond', 3, 0), placed('gimli', 3, 3), placed('eomer', 2, 3), placed('merry', 1, 3)],
      [placed('boromir', 0, 0)],
      {
        prepare: (_, find) => {
          Object.assign(find('A', 3, 3), { health: 422 }); // 50% of 845
          Object.assign(find('A', 2, 3), { health: 546 }); // 70% of 780
        },
      },
    );
    const [gimli, eomer] = [c.at('A', 3, 3), c.at('A', 2, 3)];
    expect(heals(c)).toEqual([
      [gimli.id, 350],
      [eomer.id, 234],
    ]);
    expect(statuses(c)).toEqual([gimli, eomer].map((u) => [u.id, 'buff', 'magicResist', 30, 121]));
  });

  it('Aragorn strikes the target and gives allies within 2 Attack Damage', () => {
    const c = castBy([placed('aragorn', 3, 3), placed('haldir', 2, 3), placed('gimli', 0, 0)], [placed('eomer', 3, 3)]);
    expect(damages(c)).toEqual([[c.at('B', 3, 3).id, 325]]);
    expect(statuses(c)).toEqual([c.at('A', 2, 3), c.caster].map((u) => [u.id, 'buff', 'attackDamagePct', 25, 121]));
  });

  it('Théoden rides through 3 hexes, damaging and stunning the enemies there, and ends on the farthest free one', () => {
    const c = castBy([placed('theoden', 3, 3)], [placed('gimli', 3, 3), placed('haldir', 4, 1), placed('radagast', 2, 2)]);
    const hit = [c.at('B', 3, 3), c.at('B', 4, 1)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 100)]));
    expect(statuses(c)).toEqual(hit.map((u) => [u.id, 'stun', null, null, 31]));
    expect(c.events.at(-1)).toEqual({ type: 'dash', tick: 1, unit: c.caster.id, from: at(3, 3), to: at(2, 5) });
  });

  it('Dáin damages and stuns adjacent enemies', () => {
    const c = castBy([placed('dain', 3, 3)], [placed('eomer', 3, 3), placed('haldir', 2, 3), placed('radagast', 3, 2)]);
    const hit = [c.at('B', 2, 3), c.at('B', 3, 3)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 90)]));
    expect(statuses(c)).toEqual(hit.map((u) => [u.id, 'stun', null, null, 46]));
  });

  it('Saruman blasts the farthest enemy and the enemies next to it', () => {
    const c = castBy(
      [placed('saruman', 3, 3)],
      [placed('gimli', 3, 3), placed('eomer', 3, 0), placed('haldir', 2, 0), placed('radagast', 3, 2)],
    );
    const hit = [c.at('B', 2, 0), c.at('B', 3, 0)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 120, 'magic')]));
  });

  it('Gothmog summons two grunts next to him, then gives Orcs within 2 Attack Damage', () => {
    const c = castBy([placed('gothmog', 3, 3), placed('haldir', 2, 3)], [placed('eomer', 3, 3)]);
    const spawns = ofType(c.events, 'spawn');
    expect(spawns).toMatchObject([
      { unit: 3, unitId: 'orc-grunt', team: 'A', star: 1, summon: true },
      { unit: 4, unitId: 'orc-grunt', team: 'A', star: 1, summon: true },
    ]);
    const grunts = spawns.map((e) => c.fight.state.units[e.unit]!);
    for (const grunt of grunts) {
      expect(distance(grunt.hex, c.caster.hex)).toBe(1);
      expect(onOwnHalf('A', grunt.hex)).toBe(true);
      expect(grunt.base).toEqual(gruntStats(2));
    }
    expect(grunts.map((g) => g.slot)).toEqual([2, 3]);
    expect(statuses(c)).toEqual([c.caster, ...grunts].map((u) => [u.id, 'buff', 'attackDamagePct', 25, 151]));
    expect(grunts[0]!.stats.attackDamage).toBe(50);
    // Grunts act from the next tick.
    const tick2 = c.fight.step();
    for (const grunt of grunts) expect(tick2.some((e) => (e.type === 'attack' || e.type === 'move') && e.unit === grunt.id)).toBe(true);
  });

  it('Gandalf damages and stuns enemies within 2 of the target', () => {
    const c = castBy([placed('gandalf', 3, 3)], [placed('gimli', 3, 3), placed('haldir', 3, 1), placed('eomer', 6, 0)]);
    const hit = [c.at('B', 3, 3), c.at('B', 3, 1)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 100, 'magic')]));
    expect(statuses(c)).toEqual(hit.map((u) => [u.id, 'stun', null, null, 61]));
  });

  it('Galadriel shields every ally and damages enemies within 3', () => {
    const c = castBy([placed('galadriel', 3, 3), placed('gimli', 0, 0)], [placed('eomer', 3, 3), placed('haldir', 3, 1), placed('radagast', 3, 0)]);
    expect(shields(c)).toEqual([c.caster, c.at('A', 0, 0)].map((u) => [u.id, 250, 121]));
    const hit = [c.at('B', 3, 3), c.at('B', 3, 1)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 80, 'magic')]));
  });

  it('the Witch-king leaps next to the enemy with the most Health, then damages and slows adjacent enemies', () => {
    const c = castBy([placed('witch-king', 3, 3)], [placed('haldir', 3, 3), placed('gimli', 3, 0), placed('eomer', 2, 1)]);
    const [gimli, eomer] = [c.at('B', 3, 0), c.at('B', 2, 1)];
    expect(ofType(c.events, 'dash')).toEqual([{ type: 'dash', tick: 1, unit: c.caster.id, from: at(3, 3), to: at(3, 6) }]);
    expect(damages(c)).toEqual([eomer, gimli].map((u) => [u.id, c.damage(u, 100, 'magic')]));
    expect(statuses(c)).toEqual([eomer, gimli].map((u) => [u.id, 'slow', null, 30, 91]));
    expect(c.caster.target).toBe(gimli.id);
  });

  it('Treebeard throws a boulder at the biggest group of enemies', () => {
    const c = castBy(
      [placed('treebeard', 3, 3)],
      [placed('gimli', 6, 3), placed('haldir', 3, 1), placed('eomer', 2, 1), placed('radagast', 3, 0)],
    );
    const hit = [c.at('B', 2, 1), c.at('B', 3, 1), c.at('B', 3, 0)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 100)]));
    expect(statuses(c)).toEqual(hit.map((u) => [u.id, 'stun', null, null, 46]));
  });

  it('Sauron sweeps the cone in front of him, damaging and stunning', () => {
    const c = castBy(
      [placed('sauron', 3, 3)],
      [placed('gimli', 3, 3), placed('haldir', 2, 3), placed('eomer', 4, 2), placed('radagast', 3, 1)],
    );
    const hit = [c.at('B', 2, 3), c.at('B', 3, 3), c.at('B', 4, 2)];
    expect(damages(c)).toEqual(hit.map((u) => [u.id, c.damage(u, 120)]));
    expect(statuses(c)).toEqual(hit.map((u) => [u.id, 'stun', null, null, 31]));
  });

  it('has a scenario for every unit', () => {
    expect([...covered].sort()).toEqual(Object.keys(UNITS).sort());
  });
});
