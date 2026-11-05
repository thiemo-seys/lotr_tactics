// The colour of each unit's livery: the parts of its model in the material named `team`, such as
// cloaks, hoods and shield faces (docs/viewer-spec.md section 4, Livery). A unit wears its faction's
// colour or one of its own, and wears it on both sides: only the health bar tells the sides apart.
// The colours are in livery.json, which the art tools (art/board.mjs, art/preview.py) read too. No
// Three.js and no DOM, so it can be tested.

import type { OriginId, UnitId, UnitState } from '@lotr-tactics/sim';
import LIVERY_DATA from './livery.json';
import { isRosterUnit } from './units.js';

/**
 * Each faction's (origin's) colour, and each roster unit's livery: the name of its faction, to wear
 * the faction's colour, or a colour of its own. Colours are `#rrggbb`.
 */
export const LIVERY: {
  readonly factions: Readonly<Record<OriginId, string>>;
  readonly units: Readonly<Record<UnitId, OriginId | `#${string}`>>;
  readonly default: string;
} = LIVERY_DATA as typeof LIVERY;

/** A `#rrggbb` colour as a number. */
function hex(colour: string): number {
  return Number.parseInt(colour.slice(1), 16);
}

/** For anything not in the roster: monsters and summons have no models yet, so this only shows if one gets one. */
export const DEFAULT_LIVERY = hex(LIVERY.default);

/** The livery colour of a unit's model, the same on both sides. */
export function liveryOf(unitId: UnitState['unitId']): number {
  if (!isRosterUnit(unitId)) return DEFAULT_LIVERY;
  const livery = LIVERY.units[unitId as UnitId];
  return hex(livery.startsWith('#') ? livery : LIVERY.factions[livery as OriginId]);
}
