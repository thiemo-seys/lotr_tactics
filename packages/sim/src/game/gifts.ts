// Gift offers and the lasting bonuses of Gifts (docs/game-spec.md section 9.10).

import { GIFTS, GIFT_IDS, GIFT_OFFER, type GiftEconomy, type GiftId, type GiftTier } from '../data/gifts.js';
import { randomInt, type Rng } from '../rng.js';

function isCrest(id: GiftId): boolean {
  return GIFTS[id].combat?.crest !== undefined;
}

/**
 * Draws an offer of a tier's Gifts, none of them in `exclude`: each draw is even among those
 * left, and once a crest is drawn, the other crests are left out. Fewer if too few are left.
 */
export function rollGiftOffer(tier: GiftTier, exclude: ReadonlySet<GiftId>, rng: Rng): GiftId[] {
  let left = GIFT_IDS.filter((id) => GIFTS[id].tier === tier && !exclude.has(id));
  const offer: GiftId[] = [];
  let crests = 0;
  while (offer.length < GIFT_OFFER.options && left.length > 0) {
    const gift = left[randomInt(rng, left.length)]!;
    offer.push(gift);
    if (isCrest(gift)) crests++;
    left = left.filter((id) => id !== gift && (crests < GIFT_OFFER.maxCrests || !isCrest(id)));
  }
  return offer;
}

/** The total of one lasting bonus over a player's Gifts. */
export function giftBonus(gifts: readonly GiftId[], key: keyof Omit<GiftEconomy, 'units'>): number {
  return gifts.reduce((total, id) => total + (GIFTS[id].economy?.[key] ?? 0), 0);
}
