// Small pieces both pages show: item and ring chips, trait badges and costs. An item's chip is its
// art (item-art.ts): a part in a bronze frame, a finished item in a gold one, a Ring of Power in a
// round one; the One Ring's burns hotter at each Corruption tier and carries its Corruption.

import { ITEMS, TRAITS, isComponent, isRingOfPower, type ItemId, type TraitId } from '@lotr-tactics/sim';
import { TRAIT_ICONS } from '../icons.js';
import { itemArtUrl, oneRingArtUrl } from '../item-art.js';
import { ringTier } from '../ring.js';
import { itemTip, ringTip } from '../tips.js';
import type { TraitTone } from '../traits.js';
import { el, icon } from './dom.js';
import { setTip } from './tooltip.js';

export type ChipSize = 'sm' | 'md' | 'lg';

/** A chip's picture: decorative, since the chip names what it shows. */
function art(src: string): HTMLImageElement {
  const img = el('img', 'chip-art');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  return img;
}

/** An item's chip, naming the item for screen readers. `hint` adds a line to its tooltip, `false` leaves the tooltip out. */
export function itemChip(id: ItemId, size: ChipSize = 'md', hint: string | false = ''): HTMLElement {
  const chip = el('span', `chip item ${size}`);
  chip.setAttribute('role', 'img');
  chip.setAttribute('aria-label', ITEMS[id].name);
  chip.classList.add(isRingOfPower(id) ? 'ring-of-power' : isComponent(id) ? 'component' : 'combined');
  chip.append(art(itemArtUrl(id)));
  if (hint !== false) setTip(chip, itemTip(id, hint === '' ? undefined : hint));
  return chip;
}

/** The One Ring's chip with its Corruption, in its tier's colours. */
export function ringChip(corruption: number, size: ChipSize = 'md', hint: string | false = ''): HTMLElement {
  const tier = ringTier(corruption);
  const chip = el('span', `chip item one-ring ${size} ring-${tier.toLowerCase()}`, art(oneRingArtUrl(tier)), el('b', 'corruption', String(corruption)));
  chip.setAttribute('role', 'img');
  chip.setAttribute('aria-label', `The One Ring, Corruption ${corruption}`);
  if (hint !== false) setTip(chip, ringTip(corruption, hint === '' ? undefined : hint));
  return chip;
}

/** A trait's icon on a hexagon, coloured by its tone when active and grey when not. */
export function traitBadge(trait: TraitId, tone: TraitTone | null, className = ''): HTMLElement {
  const badge = el('span', `trait-badge ${tone === null ? 'inactive' : `tone-${tone}`}${className === '' ? '' : ` ${className}`}`, icon(TRAIT_ICONS[trait]));
  badge.setAttribute('aria-hidden', 'true');
  return badge;
}

/** A trait's icon and name, as unit cards list them. */
export function traitTag(trait: TraitId): HTMLElement {
  return el('span', 'trait-tag', icon(TRAIT_ICONS[trait]), el('span', '', TRAITS[trait].name));
}

/** A cost in gold, with the coin icon. */
export function goldCost(amount: number | string, className = ''): HTMLElement {
  return el('span', `gold-cost${className === '' ? '' : ` ${className}`}`, icon('coin'), el('span', '', String(amount)));
}
