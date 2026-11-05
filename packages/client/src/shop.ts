// How a shop card marks a unit the person already has (docs/game-spec.md section 12). No Three.js
// or DOM, so it can be tested.

import type { Star } from '@lotr-tactics/sim';

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
