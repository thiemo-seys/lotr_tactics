// Trait counting (docs/sim-spec.md section 12.2).

import { TRAITS, type TraitId } from '../data/traits.js';
import { UNITS, type UnitId } from '../data/units.js';

/** Each active trait's level: 0 at its first breakpoint, 1 at its second, and so on. Inactive traits are left out. */
export type TraitLevels = Partial<Record<TraitId, number>>;

/** The active traits for a team's non-summon units. Each distinct unit counts once per trait. */
export function traitLevels(unitIds: readonly UnitId[]): TraitLevels {
  const counts = new Map<TraitId, number>();
  for (const id of new Set(unitIds)) {
    const unit = UNITS[id];
    for (const trait of [unit.origin, ...unit.classes]) counts.set(trait, (counts.get(trait) ?? 0) + 1);
  }
  const levels: TraitLevels = {};
  for (const [trait, count] of counts) {
    const level = TRAITS[trait].breakpoints.findLastIndex((breakpoint) => breakpoint <= count);
    if (level >= 0) levels[trait] = level;
  }
  return levels;
}
