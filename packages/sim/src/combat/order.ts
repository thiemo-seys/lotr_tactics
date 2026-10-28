// Slots and action order (docs/sim-spec.md section 6.3).

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

/** Sorts units into the order they act on a tick: by slot, with team A first on even ticks and team B first on odd ticks. */
export function actionOrder<U extends { readonly slot: number; readonly team: Team }>(units: readonly U[], tick: number): U[] {
  const first: Team = tick % 2 === 0 ? 'A' : 'B';
  return [...units].sort((a, b) => a.slot - b.slot || (a.team === b.team ? 0 : a.team === first ? -1 : 1));
}
