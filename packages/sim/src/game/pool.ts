// The shared unit pool and shop rolls (docs/game-spec.md section 6).

import { COPIES_PER_STAR, POOL_COPIES, SHOP } from '../data/economy.js';
import { UNITS, type Cost, type UnitId } from '../data/units.js';
import { pickWeighted, type Rng } from '../rng.js';
import type { Star } from '../types.js';

/** Every unit id, in data order. */
export const UNIT_IDS = Object.keys(UNITS) as UnitId[];

const COSTS: readonly Cost[] = [1, 2, 3, 4, 5];

const UNITS_BY_COST: Readonly<Record<Cost, readonly UnitId[]>> = {
  1: UNIT_IDS.filter((id) => UNITS[id].cost === 1),
  2: UNIT_IDS.filter((id) => UNITS[id].cost === 2),
  3: UNIT_IDS.filter((id) => UNITS[id].cost === 3),
  4: UNIT_IDS.filter((id) => UNITS[id].cost === 4),
  5: UNIT_IDS.filter((id) => UNITS[id].cost === 5),
};

/** How many copies a unit at this star level is made of. */
export function copiesIn(star: Star): number {
  return COPIES_PER_STAR[star - 1]!;
}

export class Pool {
  private readonly copies = new Map<UnitId, number>(UNIT_IDS.map((id) => [id, POOL_COPIES[UNITS[id].cost]]));

  count(unitId: UnitId): number {
    return this.copies.get(unitId)!;
  }

  countOfCost(cost: Cost): number {
    let total = 0;
    for (const id of UNITS_BY_COST[cost]) total += this.count(id);
    return total;
  }

  take(unitId: UnitId, copies = 1): void {
    const left = this.count(unitId) - copies;
    if (left < 0) throw new Error(`The pool has no ${copies} copies of ${unitId} left.`);
    this.copies.set(unitId, left);
  }

  put(unitId: UnitId, copies = 1): void {
    this.copies.set(unitId, this.count(unitId) + copies);
  }

  /**
   * Takes one unit for a shop slot (section 6.2): a cost by the level's odds among the costs with
   * copies left, then a unit of that cost by its copies. Returns null, using no numbers, if none
   * of the level's costs has copies left.
   */
  rollShopSlot(level: number, rng: Rng): UnitId | null {
    const odds = SHOP.odds[level - 1]!;
    const costIndex = pickWeighted(
      rng,
      COSTS.map((cost, i) => (this.countOfCost(cost) > 0 ? odds[i]! : 0)),
    );
    return costIndex < 0 ? null : this.takeOfCost(COSTS[costIndex]!, rng);
  }

  /** Takes a unit of `cost`, chosen by its copies left, using one number. The cost must have copies left. */
  takeOfCost(cost: Cost, rng: Rng): UnitId {
    const ids = UNITS_BY_COST[cost];
    const index = pickWeighted(rng, ids.map((id) => this.count(id)));
    if (index < 0) throw new Error(`The pool has no ${cost}-cost units left.`);
    const unitId = ids[index]!;
    this.take(unitId);
    return unitId;
  }
}
