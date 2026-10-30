// The shop's odds on the play page (docs/game-spec.md section 12), at the level the shop rolls
// with. No Three.js or DOM, so it can be tested.

import { GIFTS, SHOP, shopLevel, type GiftId } from '@lotr-tactics/sim';

export interface ShopOdds {
  /** The level whose odds the shop uses: the player's own, or higher with the Mirror of Galadriel. */
  readonly level: number;
  /** The chance in percent that a slot shows a unit of each cost, 1 to 5. */
  readonly odds: readonly number[];
}

export function shopOdds(level: number, gifts: readonly GiftId[]): ShopOdds {
  const rolls = shopLevel(level, gifts);
  return { level: rolls, odds: SHOP.odds[rolls - 1]! };
}

/** The odds for a tooltip, naming the Gifts that raise them. */
export function oddsText(level: number, gifts: readonly GiftId[]): string {
  const { level: rolls, odds } = shopOdds(level, gifts);
  const raisedBy = gifts.filter((id) => (GIFTS[id].economy?.shopLevels ?? 0) > 0).map((id) => GIFTS[id].name);
  return [
    `Shop odds at level ${rolls}${raisedBy.length > 0 && rolls > level ? ` (${raisedBy.join(', ')})` : ''}`,
    ...odds.map((pct, i) => `${i + 1}-cost: ${pct}%`),
  ].join('\n');
}
