// Names and sizes of everything that can be in a fight: units, monsters and summons.

import { MONSTERS, SUMMONS, UNITS, type MonsterId, type Star, type SummonId, type UnitId, type UnitState } from '@lotr-tactics/sim';

type Id = UnitState['unitId'];

/** Every id that can be in a fight: the roster's units, then the monsters, then the summons. */
export const FIGHTER_IDS: readonly Id[] = [
  ...(Object.keys(UNITS) as UnitId[]),
  ...(Object.keys(MONSTERS) as MonsterId[]),
  ...(Object.keys(SUMMONS) as SummonId[]),
];

function definition(id: Id): { readonly name: string; readonly large?: boolean } {
  if (Object.hasOwn(UNITS, id)) return UNITS[id as keyof typeof UNITS];
  if (Object.hasOwn(MONSTERS, id)) return MONSTERS[id as keyof typeof MONSTERS];
  return SUMMONS[id as keyof typeof SUMMONS];
}

export function displayName(id: Id): string {
  return definition(id).name;
}

export function isLarge(id: Id): boolean {
  return definition(id).large === true;
}

/** Whether an id is one of the roster's units, rather than a monster or summon. */
export function isRosterUnit(id: Id): boolean {
  return Object.hasOwn(UNITS, id);
}

/**
 * Whether it has an ability, and so casts: every roster unit, the monsters given one in the sim's data,
 * and no summon (sim-spec section 7.5). One without never casts, so its model needs no `cast` clip
 * (docs/viewer-spec.md section 4, Rigs and clips).
 */
export function hasAbility(id: Id): boolean {
  if (isRosterUnit(id)) return true;
  if (Object.hasOwn(MONSTERS, id)) return MONSTERS[id as MonsterId].ability !== undefined;
  return false;
}

/**
 * The star level whose model it is drawn with: its own for a roster unit, and 1★ for monsters and
 * summons, which are always 1★ and have one model each (docs/viewer-spec.md section 4, Models).
 */
export function modelStar(id: Id, star: Star): Star {
  return isRosterUnit(id) ? star : 1;
}
