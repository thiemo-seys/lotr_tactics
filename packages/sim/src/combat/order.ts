// Slots and action order (docs/sim-spec.md section 6.3).

import { roll, type Rng } from '../rng.js';
import type { Team } from '../types.js';

/**
 * Ranks a team's starting units: by row in the team's own perspective, front row first, then by
 * column. Returns each placement's slot, in input order. Placements must be on distinct hexes.
 */
export function startingSlots(placements: readonly { readonly col: number; readonly row: number }[]): number[] {
  const ranked = placements.map((p, i) => ({ ...p, i })).sort((a, b) => b.row - a.row || a.col - b.col);
  const slots = new Array<number>(placements.length);
  ranked.forEach((p, slot) => (slots[p.i] = slot));
  return slots;
}

/**
 * Picks the team that goes first within each slot this tick. A fixed alternation would favour
 * one team in mirror matches, because units with the same attack speed always act on ticks of
 * the same parity. Uses one number from the generator.
 */
export function firstTeam(rng: Rng): Team {
  return roll(rng, 0.5) ? 'A' : 'B';
}

/** Sorts units into the order they act: by slot, with `first`'s unit before the other team's in each slot. */
export function actionOrder<U extends { readonly slot: number; readonly team: Team }>(units: readonly U[], first: Team): U[] {
  return [...units].sort((a, b) => a.slot - b.slot || (a.team === b.team ? 0 : a.team === first ? -1 : 1));
}
