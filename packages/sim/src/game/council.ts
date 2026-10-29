// The Council of Elrond: options and pick order (docs/game-spec.md section 9.6).

import { COMPONENTS, type ComponentId } from '../data/items.js';
import { COUNCIL } from '../data/rounds.js';
import type { UnitId } from '../data/units.js';
import { randomInt, shuffle, type Rng } from '../rng.js';
import type { Pool } from './pool.js';
import { councilCosts } from './schedule.js';

export interface CouncilOption {
  unitId: UnitId;
  /** Null for the option that brings the One Ring instead. */
  component: ComponentId | null;
  /** Whether this option brings the One Ring (section 9.11). */
  ring: boolean;
  /** The seat that picked it, or null while it is still there. */
  pickedBy: number | null;
}

/**
 * Rolls the options, taking their units out of the pool: for each, a cost drawn evenly from the
 * stage's costs that have copies left, then a unit as in a shop roll, then a component.
 */
export function rollCouncilOptions(pool: Pool, stage: number, rng: Rng): CouncilOption[] {
  const options: CouncilOption[] = [];
  for (let i = 0; i < COUNCIL.options; i++) {
    const costs = councilCosts(stage).filter((cost) => pool.countOfCost(cost) > 0);
    if (costs.length === 0) break;
    const unitId = pool.takeOfCost(costs[randomInt(rng, costs.length)]!, rng);
    options.push({ unitId, component: COMPONENTS[randomInt(rng, COMPONENTS.length)]!, ring: false, pickedBy: null });
  }
  return options;
}

/**
 * The groups that pick in turn. The first Council is one group of everyone; later ones go by HP,
 * lowest first, ties in a seeded order, in groups of two.
 */
export function pickGroups(players: readonly { readonly seat: number; readonly hp: number }[], first: boolean, rng: Rng): number[][] {
  if (first) return [players.map((p) => p.seat)];
  // The shuffle settles ties; the sort is stable.
  const order = shuffle(rng, players).sort((a, b) => a.hp - b.hp);
  const groups: number[][] = [];
  for (let i = 0; i < order.length; i += COUNCIL.groupSize) groups.push(order.slice(i, i + COUNCIL.groupSize).map((p) => p.seat));
  return groups;
}
