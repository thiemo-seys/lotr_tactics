// Names and sizes of everything that can be in a fight: units, monsters and summons.

import { MONSTERS, SUMMONS, UNITS, type UnitState } from '@lotr-tactics/sim';

type Id = UnitState['unitId'];

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
