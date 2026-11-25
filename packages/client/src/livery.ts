// The colour of each unit's, monster's and summon's livery: the parts of its model in the material
// named `team`, such as cloaks, hoods and shield faces (docs/viewer-spec.md section 4, Livery). A unit
// wears its faction's colour or one of its own, and wears it on both sides: only the health bar tells
// the sides apart. Monsters, always the enemy, each wear a colour of their own, and summons their
// faction's. The colours are in livery.json, which the art tools (art/board.mjs, art/preview.py) read
// too. No Three.js and no DOM, so it can be tested.

import type { OriginId, UnitState } from '@lotr-tactics/sim';
import LIVERY_DATA from './livery.json';

/**
 * Each faction's (origin's) colour, and the livery of each roster unit, monster and summon: the name
 * of a faction, to wear the faction's colour, or a colour of its own. Colours are `#rrggbb`.
 */
export const LIVERY: {
  readonly factions: Readonly<Record<OriginId, string>>;
  readonly units: Readonly<Record<UnitState['unitId'], OriginId | `#${string}`>>;
  readonly default: string;
} = LIVERY_DATA as typeof LIVERY;

/** A `#rrggbb` colour as a number. */
function hex(colour: string): number {
  return Number.parseInt(colour.slice(1), 16);
}

/**
 * For a model named after nothing livery.json lists. Every unit, monster and summon is listed, so in
 * the game this only shows on a study's model in the art tools, which use the same default.
 */
export const DEFAULT_LIVERY = hex(LIVERY.default);

/** The livery colour of a unit's, monster's or summon's model, the same on both sides. */
export function liveryOf(unitId: UnitState['unitId']): number {
  if (!Object.hasOwn(LIVERY.units, unitId)) return DEFAULT_LIVERY;
  const livery = LIVERY.units[unitId];
  return hex(livery.startsWith('#') ? livery : LIVERY.factions[livery as OriginId]);
}
