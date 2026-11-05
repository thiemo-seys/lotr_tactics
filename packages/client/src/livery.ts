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
  // Hobbits
  sam: 0x844929, // darker hearth red
  pippin: 0xc57144, // lighter hearth red
  frodo: 0x844929, // darker hearth red
  bilbo: 0xb8902f, // golden yellow
  gollum: 0x844929, // darker hearth red
  // Gondor
  faramir: 0x4a5e3a, // Ranger green
  boromir: 0x4c5665, // darker steel blue-grey
  aragorn: 0x6a5536, // Strider brown
  // Rohan
  eomer: 0x2f512c, // darker Rohan green
  eowyn: 0xc8c4bc, // shieldmaiden white
  theoden: 0xb8922e, // royal gold
  // Orcs
  grishnakh: 0x8f8e3b, // lighter bile olive
  sharku: 0x9c8f74, // bone
  gorbag: 0x7f9a86, // Morgul pallid green
  gothmog: 0x7a2e22, // Mordor red
  // Elves
  legolas: 0x4f6b3a, // Mirkwood green
  elrond: 0x7a2f3a, // Rivendell burgundy
  galadriel: 0xa7adaa, // lighter Lórien silver
  // Dwarves
  gimli: 0x8a3b2a, // iron red
  dain: 0x5a5f66, // Iron Hills steel
  // Istari
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
