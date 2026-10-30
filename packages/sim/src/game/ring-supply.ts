// The Rings of Power not in anyone's hands (docs/game-spec.md section 9.12): drawn for Council
// options, and given back by options nobody took and by eliminated players. Every copy is in the
// supply, on a Council option or with a player, until the One Ring's destruction ends the Three
// and the Nine.

import { RING_OF_POWER_IDS, isBoundToTheOne } from '../combat/items.js';
import { ITEMS, type RingOfPowerId } from '../data/items.js';
import { randomInt, type Rng } from '../rng.js';

/** What everyone sees of the supply. */
export interface RingSupplyView {
  /** The copies of a ring left. */
  count(id: RingOfPowerId): number;
}

export class RingSupply implements RingSupplyView {
  private readonly copies = new Map<RingOfPowerId, number>(RING_OF_POWER_IDS.map((id) => [id, ITEMS[id].ringOfPower!.copies]));

  count(id: RingOfPowerId): number {
    return this.copies.get(id)!;
  }

  /** Takes one copy of a ring out of the supply. */
  take(id: RingOfPowerId): void {
    if (this.count(id) === 0) throw new Error(`The supply has no ${id} left.`);
    this.copies.set(id, this.count(id) - 1);
  }

  /** Takes a ring weighted by the copies left, using one number. Null, using none, if the supply is empty. */
  draw(rng: Rng): RingOfPowerId | null {
    const total = RING_OF_POWER_IDS.reduce((sum, id) => sum + this.count(id), 0);
    if (total === 0) return null;
    let roll = randomInt(rng, total);
    const drawn = RING_OF_POWER_IDS.find((id) => (roll -= this.count(id)) < 0)!;
    this.take(drawn);
    return drawn;
  }

  putBack(id: RingOfPowerId): void {
    this.copies.set(id, this.count(id) + 1);
  }

  /** The Three and the Nine leave the game with the One Ring. */
  retireBound(): void {
    for (const id of RING_OF_POWER_IDS) if (isBoundToTheOne(id)) this.copies.set(id, 0);
  }
}
