// The colour of each unit's livery: the parts of its model in the material named `team`, such as
// cloaks, hoods and shield faces (docs/viewer-spec.md section 4, Livery). A unit wears its faction's
// colour, unless it has one of its own, and wears it on both sides: only the health bar tells the
// sides apart. No Three.js and no DOM, so it can be tested.

import { UNITS, type OriginId, type UnitId, type UnitState } from '@lotr-tactics/sim';
import { isRosterUnit } from './units.js';

/** Each faction's (origin's) livery colour. */
export const FACTION_LIVERY: Readonly<Record<OriginId, number>> = {
  hobbit: 0xa35a33, // hearth red
  gondor: 0x5d6a7c, // steel blue-grey
  rohan: 0x3f6b3a, // Rohan green
  orc: 0x6b6a2c, // bile olive
  elf: 0x8c9590, // Lórien silver
  dwarf: 0x3f5d8a, // Durin blue
  istari: 0x8a8c8e, // grey, though each of the Istari has his own below
  nazgul: 0x25252a, // black
  ent: 0x4f6b3a, // moss green
  'dark-lord': 0x7a2a1e, // ember red
};

/** Units whose livery isn't their faction's. */
export const UNIT_LIVERY: Readonly<Partial<Record<UnitId, number>>> = {
  radagast: 0x7a5530, // brown
  saruman: 0xc9c6be, // white
  gandalf: 0x8a8c8e, // grey
};

/** For anything not in the roster: monsters and summons have no models yet, so this only shows if one gets one. */
export const DEFAULT_LIVERY = 0x6a5a86;

/** The livery colour of a unit's model, the same on both sides. */
export function liveryOf(unitId: UnitState['unitId']): number {
  if (!isRosterUnit(unitId)) return DEFAULT_LIVERY;
  const id = unitId as UnitId;
  return UNIT_LIVERY[id] ?? FACTION_LIVERY[UNITS[id].origin];
}
