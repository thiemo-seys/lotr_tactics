// Every item's three designs, and the One Ring's, from the files in designs/.

import oneRing from './designs/one-ring.mjs';
import parts from './designs/parts.mjs';
import bladeItems from './designs/blade-items.mjs';
import bowItems from './designs/bow-items.mjs';
import mailCloakItems from './designs/mail-cloak-items.mjs';
import staffItemsAndRings from './designs/staff-items-and-rings.mjs';

/** Each item: { id, name, kind: 'component' | 'combined' | 'ring', recipe, bg?, variants: [{ title, draw(p), bg? }] }. */
export const ITEM_DESIGNS = [...parts, ...bladeItems, ...bowItems, ...mailCloakItems, ...staffItemsAndRings];

/** The One Ring's designs, each drawn at a Corruption tier: [{ title, draw(p, tier) }]. */
export const ONE_RING_DESIGNS = oneRing;
