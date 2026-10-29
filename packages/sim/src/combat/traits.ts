// Trait counting and the trait bonuses that don't change during a fight (docs/sim-spec.md
// section 12). The trait effects that happen during the fight live in combat.ts.

import { TRAITS, type TraitId, type TraitLevels as TraitValues } from '../data/traits.js';
import { UNITS, type UnitDef, type UnitId } from '../data/units.js';
import type { StatModifiers } from './stats.js';

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

/** The values of a trait at the team's active level, or undefined if the trait isn't active. */
export function activeTrait<K extends TraitId>(levels: TraitLevels, trait: K): Readonly<TraitValues[K]> | undefined {
  const level = levels[trait];
  return level === undefined ? undefined : TRAITS[trait].levels[level];
}

/** Whether a unit has a trait as its origin or one of its classes. */
export function hasTrait(unit: UnitDef, trait: TraitId): boolean {
  return unit.origin === trait || (unit.classes as readonly TraitId[]).includes(trait);
}

/**
 * A unit's bonuses from its team's active traits that hold for the whole fight (sections 6.2 and
 * 12.3): Hobbit Health, Elf Attack Speed and Dodge, Dwarf Armor, Burglar Crit Damage, Sorcerer
 * Ability Power, and Gondor Armor and Magic Resist for any ally that starts in the front row.
 */
export function traitModifiers(unit: UnitDef, levels: TraitLevels, inFrontRow: boolean): Partial<StatModifiers> {
  const hobbit = hasTrait(unit, 'hobbit') ? activeTrait(levels, 'hobbit') : undefined;
  const elf = hasTrait(unit, 'elf') ? activeTrait(levels, 'elf') : undefined;
  const dwarf = hasTrait(unit, 'dwarf') ? activeTrait(levels, 'dwarf') : undefined;
  const burglar = hasTrait(unit, 'burglar') ? activeTrait(levels, 'burglar') : undefined;
  const sorcerer = hasTrait(unit, 'sorcerer') ? activeTrait(levels, 'sorcerer') : undefined;
  const gondor = inFrontRow ? activeTrait(levels, 'gondor') : undefined;
  return {
    health: hobbit?.health ?? 0,
    attackSpeedPct: elf?.attackSpeedPct ?? 0,
    dodgePct: elf?.dodgePct ?? 0,
    armor: (dwarf?.armor ?? 0) + (gondor?.armor ?? 0),
    magicResist: gondor?.magicResist ?? 0,
    critDamagePct: burglar?.critDamagePct ?? 0,
    abilityPower: sorcerer?.abilityPower ?? 0,
  };
}
