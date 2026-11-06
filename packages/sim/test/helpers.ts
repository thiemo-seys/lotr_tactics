import type { Combat, CombatInput, PlacedUnit } from '../src/combat/combat.js';
import type { CombatEvent } from '../src/combat/events.js';
import type { ItemId } from '../src/data/items.js';
import type { UnitId } from '../src/data/units.js';
import type { Hex } from '../src/hex.js';
import type { Star } from '../src/types.js';

export function placed(unitId: UnitId, col: number, row: number, star: Star = 1, items: readonly ItemId[] = []): PlacedUnit {
  return { unitId, star, col, row, items };
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
  /** All 21 combined items. */
  items: [
    placed('gimli', 2, 3, 1, ['oakenshield', 'dragon-helm', 'mithril-shirt']),
    placed('dain', 3, 3, 1, ['star-of-elendil', 'elven-cloak', 'ent-draught']),
    placed('beregond', 4, 3, 1, ['miruvor', 'kings-banner', 'herugrim']),
    placed('aragorn', 1, 2, 1, ['anduril', 'black-arrow', 'orcrist']),
    placed('theoden', 3, 2, 1, ['glamdring', 'grond']),
    placed('boromir', 5, 2, 1, ['elven-rope', 'phial']),
    placed('legolas', 0, 0, 1, ['galadhrim-bow', 'palantir']),
    placed('gandalf', 3, 0, 1, ['wizards-staff', 'athelas', 'sting']),
    placed('haldir', 6, 0, 1, ['blade', 'staff']),
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

/** A unit a cast's step locked, and the tick the step reaches it (sim-spec section 14, Aims). */
export interface AimUnit {
  readonly unit: number;
  readonly landTick: number;
}

/** A board hex a cast's step locked, in board coordinates, and the tick the step reaches it. */
export interface AimHex {
  readonly hex: Hex;
  readonly landTick: number;
}

/** What one of a cast's steps locked, and when it lands (sim-spec section 14, Aims). */
export interface Aim {
  readonly step: number;
  readonly select: string;
  readonly side: 'enemy' | 'ally';
  readonly delivery: 'strike' | 'projectile' | 'lob' | 'dash' | 'charge';
  readonly units: readonly AimUnit[];
  readonly hexes: readonly AimHex[];
  readonly hits: number;
  readonly hitGap: number;
  readonly centre: Hex | null;
}

/** A `cast` event with the timing fields of sim-spec section 14. */
export type TimedCast = Extract<CombatEvent, { type: 'cast' }> & {
  readonly releaseTick: number;
  readonly readyTick: number;
  readonly aims: readonly Aim[];
};

/** A `dash` event with the timing fields of sim-spec section 14. */
export type TimedDash = Extract<CombatEvent, { type: 'dash' }> & {
  readonly departTick: number;
  readonly arriveTick: number;
};

/** The `cast` events, read with their timing fields. */
export function castsOf(events: readonly CombatEvent[]): TimedCast[] {
  return ofType(events, 'cast') as unknown as TimedCast[];
}

/** The `dash` events, read with their timing fields. */
export function dashesOf(events: readonly CombatEvent[]): TimedDash[] {
  return ofType(events, 'dash') as unknown as TimedDash[];
}

/** FNV-1a hash of a string, in hex. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}

/** A hash of an event log. */
export function hashEvents(events: readonly CombatEvent[]): string {
  return hash(JSON.stringify(events));
}
