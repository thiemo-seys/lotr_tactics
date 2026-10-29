// Pathfinding and the choice of where to step (docs/sim-spec.md sections 8 and 11).

import { MOVEMENT } from '../data/rules.js';
import { boardIndex, distance, isOnBoard, neighbours, type Hex } from '../hex.js';
import type { Team } from '../types.js';
import { chooseTarget, type Candidate, type TargetingRules } from './targeting.js';
import { toTicks } from './time.js';

/** How long one step takes. The unit is busy until it arrives. */
export const MOVE_TICKS = toTicks(MOVEMENT.secondsPerHex);

/** The free hexes a unit can walk to, in breadth-first order, and the first step towards each. */
export interface Reach {
  /** Nearest first, in the team's neighbour order within each distance. Excludes the start. */
  readonly hexes: readonly Hex[];
  /** The first step on the path to the hex with the same index. */
  readonly firstSteps: readonly Hex[];
}

/** Breadth-first search over free hexes from `start`, visiting neighbours in the team's perspective order. */
export function explore(team: Team, start: Hex, isFree: (hex: Hex) => boolean): Reach {
  const seen = new Set([boardIndex(start)]);
  const hexes: Hex[] = [];
  const firstSteps: Hex[] = [];
  const visitNeighbours = (from: Hex, firstStep: Hex | null) => {
    for (const next of neighbours(team, from)) {
      if (!isOnBoard(next) || seen.has(boardIndex(next)) || !isFree(next)) continue;
      seen.add(boardIndex(next));
      hexes.push(next);
      firstSteps.push(firstStep ?? next);
    }
  };
  visitNeighbours(start, null);
  for (let i = 0; i < hexes.length; i++) visitNeighbours(hexes[i]!, firstSteps[i]!);
  return { hexes, firstSteps };
}

/** The first step towards the first reachable hex within `range` of `target`, or null if there is none. */
export function stepTowards(reach: Reach, target: Hex, range: number): Hex | null {
  const i = reach.hexes.findIndex((hex) => distance(hex, target) <= range);
  return i < 0 ? null : reach.firstSteps[i]!;
}

export interface MovePlan<C> {
  readonly target: C;
  /** Null when the unit is already in range of the target. */
  readonly step: Hex | null;
}

/**
 * Plans the move of a unit that is out of range of its target. If no path leads within range of
 * the target, the unit switches to the target it would choose among the enemies it can reach.
 * Returns null when it can reach no enemy, so it waits.
 */
export function planMove<C extends Candidate>(
  team: Team,
  from: Hex,
  range: number,
  target: C,
  candidates: readonly C[],
  enemyTeam: readonly Candidate[],
  rules: TargetingRules,
  isFree: (hex: Hex) => boolean,
): MovePlan<C> | null {
  const reach = explore(team, from, isFree);
  const step = stepTowards(reach, target.hex, range);
  if (step !== null) return { target, step };

  const inRange = (c: C) => distance(from, c.hex) <= range;
  const reachable = candidates.filter((c) => inRange(c) || stepTowards(reach, c.hex, range) !== null);
  const next = chooseTarget(team, from, reachable, enemyTeam, rules);
  if (next === null) return null;
  return { target: next, step: inRange(next) ? null : stepTowards(reach, next.hex, range) };
}
