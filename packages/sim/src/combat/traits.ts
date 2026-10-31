// Trait counting and the trait bonuses that don't change during a fight (docs/sim-spec.md
// section 12). The trait effects that happen during the fight live in combat.ts.

import { TRAITS, type TraitId, type TraitLevels as TraitValues } from '../data/traits.js';
import { UNITS, type UnitDef, type UnitId } from '../data/units.js';
import type { StatModifiers } from './stats.js';

/** Each active trait's level: 0 at its first breakpoint, 1 at its second, and so on. Inactive traits are left out. */
export type TraitLevels = Partial<Record<TraitId, number>>;

/** How many count towards each trait a team has, active or not. Traits nobody counts towards are left out. */
export type TraitCounts = Partial<Record<TraitId, number>>;

/** A trait a unit has from an item, such as the Nazgûl origin from a Ring of the Nine (sim-spec.md section 12.7). */
export interface Emblem {
  readonly unitId: UnitId;
  readonly trait: TraitId;
}

/**
 * How many count towards each trait among a team's non-summon units (sim-spec.md section 12.2).
 * Each distinct unit counts once per trait, its emblems included, and each crest Gift adds one to
 * a trait the team has (section 12.5).
 */
export function traitCounts(unitIds: readonly UnitId[], crests: readonly TraitId[] = [], emblems: readonly Emblem[] = []): TraitCounts {
  const traitsOf = new Map<UnitId, Set<TraitId>>();
  for (const id of unitIds) if (!traitsOf.has(id)) traitsOf.set(id, new Set([UNITS[id].origin, ...UNITS[id].classes]));
  for (const { unitId, trait } of emblems) traitsOf.get(unitId)?.add(trait);
  const counts: TraitCounts = {};
  for (const traits of traitsOf.values()) for (const trait of traits) counts[trait] = (counts[trait] ?? 0) + 1;
  for (const trait of crests) {
    const count = counts[trait];
    if (count !== undefined) counts[trait] = count + 1;
  }
  return counts;
}

/** The active traits from their counts: each trait's highest breakpoint reached. */
export function traitLevelsOf(counts: TraitCounts): TraitLevels {
  const levels: TraitLevels = {};
  for (const [trait, count] of Object.entries(counts) as [TraitId, number][]) {
    const level = TRAITS[trait].breakpoints.findLastIndex((breakpoint) => breakpoint <= count);
    if (level >= 0) levels[trait] = level;
  }
  return levels;
}

/** The active traits for a team's non-summon units, counted as `traitCounts` counts them. */
export function traitLevels(unitIds: readonly UnitId[], crests: readonly TraitId[] = [], emblems: readonly Emblem[] = []): TraitLevels {
  return traitLevelsOf(traitCounts(unitIds, crests, emblems));
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
