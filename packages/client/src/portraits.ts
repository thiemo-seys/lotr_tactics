// The units' portraits on the shop's unit cards (docs/viewer-spec.md section 4, Portraits): images
// in public/portraits, rendered from each unit's 1★ model by art/portraits/. No Three.js or DOM, so it
// can be tested.

import PORTRAIT_FILES from 'virtual:portraits';
import type { UnitId } from '@lotr-tactics/sim';

const AVAILABLE: ReadonlySet<string> = new Set(PORTRAIT_FILES);

/** The URL of a unit's portrait, or null if it has none, when its card shows its origin's emblem instead. */
export function portraitUrl(unitId: UnitId, available: ReadonlySet<string> = AVAILABLE): string | null {
  return available.has(unitId) ? `${import.meta.env.BASE_URL}portraits/${unitId}.webp` : null;
}
