import type { Combat, CombatInput, PlacedUnit } from '../src/combat/combat.js';
import type { CombatEvent } from '../src/combat/events.js';
import type { UnitId } from '../src/data/units.js';
import type { Star } from '../src/types.js';

export function placed(unitId: UnitId, col: number, row: number, star: Star = 1): PlacedUnit {
  return { unitId, star, col, row, items: [] };
}

export function input(A: readonly PlacedUnit[], B: readonly PlacedUnit[], seed = 1): CombatInput {
  return { seed, stage: 2, teams: { A, B } };
}

/** A board fighting its own mirror image: both teams place the same units in their own perspective. */
export function mirrorMatch(board: readonly PlacedUnit[], seed: number): CombatInput {
  return input(board, board, seed);
}

/** Sample boards, in each team's own perspective. */
export const BOARDS = {
  duel: [placed('sam', 3, 3)],
  tanks: [placed('sam', 2, 3), placed('gimli', 3, 3), placed('hama', 4, 3)],
  archers: [placed('legolas', 1, 1), placed('haldir', 3, 1), placed('faramir', 5, 1)],
  mixed: [placed('boromir', 3, 3), placed('legolas', 2, 0), placed('eomer', 1, 3), placed('saruman', 5, 0)],
  full: [
    placed('gimli', 2, 3),
    placed('dain', 3, 3),
    placed('beregond', 4, 3),
    placed('aragorn', 1, 2),
    placed('theoden', 3, 2),
    placed('boromir', 5, 2),
    placed('legolas', 0, 0),
    placed('gandalf', 3, 0),
    placed('haldir', 6, 0),
  ],
  /** Riders charge, Burglars leap, Nazgûl slow, an Orc grunt spawns and the Istari gain mana. */
  traits: [
    placed('khamul', 2, 3),
    placed('eomer', 3, 3),
    placed('sharku', 4, 3),
    placed('ringwraith', 3, 2),
    placed('merry', 1, 1),
    placed('grishnakh', 5, 1),
    placed('gandalf', 2, 0),
    placed('sauron', 3, 0),
    placed('saruman', 4, 0),
  ],
} satisfies Record<string, PlacedUnit[]>;

/** Steps the fight up to and including `tick`, returning those ticks' events. */
export function stepTo(combat: Combat, tick: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  while (combat.tick < tick) events.push(...combat.step());
  return events;
}

export function ofType<T extends CombatEvent['type']>(events: readonly CombatEvent[], type: T): Extract<CombatEvent, { type: T }>[] {
  return events.filter((e): e is Extract<CombatEvent, { type: T }> => e.type === type);
}
