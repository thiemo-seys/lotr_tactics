// Trait counting and the trait bonuses that don't change during a fight (docs/sim-spec.md
// section 12). The trait effects that happen during the fight live in combat.ts.

import { TRAITS, type TraitId, type TraitLevels as TraitValues } from '../data/traits.js';
import { UNITS, type UnitDef, type UnitId } from '../data/units.js';
import type { StatModifiers } from './stats.js';

/** Each active trait's level: 0 at its first breakpoint, 1 at its second, and so on. Inactive traits are left out. */
export type TraitLevels = Partial<Record<TraitId, number>>;

/** How many count towards each trait a team has, in the order the team's units first have them. Traits it lacks are left out. */
export type TraitCounts = Partial<Record<TraitId, number>>;

/** A trait a unit has from an item, such as the Nazgûl origin from a Ring of the Nine (sim-spec.md section 12.7). */
export interface Emblem {
  readonly unitId: UnitId;
  readonly trait: TraitId;
}

/**
 * What counts towards the traits of a team's non-summon units. Each distinct unit counts once per
 * trait, its emblems included, and each crest Gift adds one to a trait the team has (sim-spec.md
 * section 12.5).
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

/** A trait's level at a count: 0 at its first breakpoint, 1 at its second, and so on, or -1 below the first. */
export function traitLevel(trait: TraitId, count: number): number {
  return TRAITS[trait].breakpoints.findLastIndex((breakpoint) => breakpoint <= count);
}

/** The active traits at these counts, in the same order. */
export function levelsOf(counts: TraitCounts): TraitLevels {
  const levels: TraitLevels = {};
  for (const [trait, count] of Object.entries(counts) as [TraitId, number][]) {
    const level = traitLevel(trait, count);
    if (level >= 0) levels[trait] = level;
  }
  return levels;
}

/** The active traits for a team's non-summon units, counted as by `traitCounts`. */
export function traitLevels(unitIds: readonly UnitId[], crests: readonly TraitId[] = [], emblems: readonly Emblem[] = []): TraitLevels {
  return levelsOf(traitCounts(unitIds, crests, emblems));
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
