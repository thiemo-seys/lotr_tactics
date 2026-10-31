// Small pieces both pages show: item and ring chips, trait badges and costs. A component shows its
// icon on its colour, a combined item both of its components' icons on their colours, a Ring of
// Power a ring in its gold and stone, and the One Ring its band and Corruption in its tier's colours.

import { ITEMS, TRAITS, isRingOfPower, type ComponentId, type ItemId, type TraitId } from '@lotr-tactics/sim';
import { COMPONENT_ICONS, TRAIT_ICONS } from '../icons.js';
import { COMPONENT_COLOURS, RING_COLOURS } from '../items.js';
import { ringTier } from '../ring.js';
import { itemTip, ringTip } from '../tips.js';
import type { TraitTone } from '../traits.js';
import { el, icon } from './dom.js';
import { setTip } from './tooltip.js';

export type ChipSize = 'sm' | 'md' | 'lg';

/** An item's chip, naming the item for screen readers. `hint` adds a line to its tooltip, `false` leaves the tooltip out. */
export function itemChip(id: ItemId, size: ChipSize = 'md', hint: string | false = ''): HTMLElement {
  const chip = el('span', `chip item ${size}`);
  chip.setAttribute('role', 'img');
  chip.setAttribute('aria-label', ITEMS[id].name);
  const recipe = ITEMS[id].recipe;
  if (isRingOfPower(id)) {
    const [gold, stone] = RING_COLOURS[id];
    chip.classList.add('ring-of-power');
    chip.style.setProperty('--gold', gold);
    chip.style.setProperty('--stone', stone);
    chip.append(icon('ring-of-power'));
  } else if (recipe === null) {
    chip.classList.add('component');
    chip.style.setProperty('--a', COMPONENT_COLOURS[id as ComponentId]);
    chip.append(icon(COMPONENT_ICONS[id as ComponentId]));
  } else {
    chip.classList.add('combined');
    chip.style.setProperty('--a', COMPONENT_COLOURS[recipe[0]]);
    chip.style.setProperty('--b', COMPONENT_COLOURS[recipe[1]]);
    chip.append(icon(COMPONENT_ICONS[recipe[0]], 'a'), icon(COMPONENT_ICONS[recipe[1]], 'b'));
  }
  if (hint !== false) setTip(chip, itemTip(id, hint === '' ? undefined : hint));
  return chip;
}

/** The One Ring's chip with its Corruption, in its tier's colours. */
export function ringChip(corruption: number, size: ChipSize = 'md', hint: string | false = ''): HTMLElement {
  const chip = el('span', `chip item one-ring ${size} ring-${ringTier(corruption).toLowerCase()}`, icon('one-ring'), el('b', 'corruption', String(corruption)));
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
