// Choosing a target (docs/sim-spec.md section 8).

import type { OriginId } from '../data/traits.js';
import { compareHexes, distance, type Hex } from '../hex.js';
import type { Team } from '../types.js';

/** What targeting needs to know about a unit. */
export interface Candidate {
  readonly hex: Hex;
  readonly slot: number;
  /** Null for monsters. */
  readonly origin: OriginId | null;
}

export interface TargetingRules {
  /** The chooser is a Burglar and its team's Burglar trait is active. */
  readonly farthest: boolean;
  /** The candidates' team has the Hobbit trait active. */
  readonly hobbitRule: boolean;
}

/**
 * Picks a target for a unit of `team` at `from`: the nearest candidate, or the farthest with
 * `rules.farthest`. Ties go to the lower row, then the lower column, in the team's perspective,
 * then the lower slot. With the Hobbit rule, Hobbits with a non-Hobbit ally next to them are
 * skipped, unless that would skip every candidate. `enemyTeam` is every living unit on the
 * candidates' team, targetable or not, since any of them can stand next to a Hobbit.
 */
export function chooseTarget<C extends Candidate>(
  team: Team,
  from: Hex,
  candidates: readonly C[],
  enemyTeam: readonly Candidate[],
  rules: TargetingRules,
): C | null {
  let pool = candidates;
  if (rules.hobbitRule) {
    const unguarded = candidates.filter((c) => !isGuardedHobbit(c, enemyTeam));
    if (unguarded.length > 0) pool = unguarded;
  }
  const closerFirst = rules.farthest ? -1 : 1;
  let best: C | null = null;
  for (const c of pool) {
    if (
      best === null ||
      (closerFirst * (distance(from, c.hex) - distance(from, best.hex)) ||
        compareHexes(team, c.hex, best.hex) ||
        c.slot - best.slot) < 0
    ) {
      best = c;
    }
  }
  return best;
}

function isGuardedHobbit(unit: Candidate, team: readonly Candidate[]): boolean {
  return (
    unit.origin === 'hobbit' && team.some((ally) => ally.origin !== 'hobbit' && distance(ally.hex, unit.hex) === 1)
  );
}
