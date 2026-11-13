// How a shop card marks a unit the person already has, and what a click on a card does
// (docs/game-spec.md section 12). No Three.js or DOM, so it can be tested.

import { BENCH_FULL, type ActionResult, type Star } from '@lotr-tactics/sim';

/**
 * How a shop card is marked, from the star levels of the person's copies of its unit on the bench
 * and the board and whether buying it merges at once (the sim's `completesMerge`): `none` without
 * a copy, `owned` with one, and `completes` when buying it makes a 2★ from two 1★ copies now.
 */
export type ShopMark = 'none' | 'owned' | 'completes';

export function shopMark(owned: readonly Star[], merges: boolean): ShopMark {
  if (owned.length === 0) return 'none';
  return merges ? 'completes' : 'owned';
}

/**
 * What a shop card shows and does, from the rules' answer to buying it: `buy` buys it; `bench-full`
 * looks like `buy`, with no reason on the card, and a click shows that the bench is full instead;
 * `refused` is greyed out with the reason on the card, and a click does nothing. A full bench is
 * `refused` too while `ownBench` is false, when another player's bench is on screen.
 */
export type ShopBuy = 'buy' | 'bench-full' | 'refused';

export function shopBuy(result: ActionResult, ownBench: boolean): ShopBuy {
  if (result.ok) return 'buy';
  return result.reason === BENCH_FULL && ownBench ? 'bench-full' : 'refused';
}
