// The item chips' art (docs/viewer-spec.md section 2, Item art): an SVG per item in public/items,
// written by art/items/ from the design picked for it, framed for its kind, and one per Corruption
// tier for the One Ring. No Three.js or DOM, so it can be tested.

import type { ItemId } from '@lotr-tactics/sim';
import type { RingTier } from './ring.js';

/** The URL of an item's art. */
export function itemArtUrl(id: ItemId): string {
  return `${import.meta.env.BASE_URL}items/${id}.svg`;
}

/** The URL of the One Ring's art at a Corruption tier: it burns hotter at each. */
export function oneRingArtUrl(tier: RingTier): string {
  return `${import.meta.env.BASE_URL}items/one-ring-${tier.toLowerCase()}.svg`;
}
