// Stat derivation and modifiers (docs/sim-spec.md sections 7 and 10.2).
//
// Percentages are whole numbers. Formulas multiply them and divide once at the end, so a result
// that should be exactly x.5 is exactly x.5 and rounds as it would by hand.

import { ABILITIES, STAT_LIMITS } from '../data/rules.js';
import {
  CLASS_TEMPLATE,
  COST_SCALING,
  ORC_GRUNT_STATS,
  SHARED_STATS,
  STAR_PCT,
  TEMPLATES,
} from '../data/templates.js';
import type { MonsterDef } from '../data/monsters.js';
import type { Cost, UnitDef } from '../data/units.js';
import type { Star } from '../types.js';

export interface Stats {
  readonly maxHealth: number;
  readonly attackDamage: number;
  /** Attacks per second. */
  readonly attackSpeed: number;
  readonly range: number;
  readonly armor: number;
  readonly magicResist: number;
  readonly abilityPower: number;
  readonly critChancePct: number;
  readonly critDamagePct: number;
  readonly dodgePct: number;
}

export interface BaseStats extends Stats {
  readonly startMana: number;
  readonly maxMana: number;
}

/**
 * Everything currently changing a unit's stats, already combined: bonuses are summed, while for
 * slows and reductions only the strongest one counts (section 12.1). Missing fields are 0.
 */
export interface StatModifiers {
  readonly health: number;
  readonly attackDamagePct: number;
  readonly attackSpeedPct: number;
  readonly slowPct: number;
  readonly armor: number;
  readonly magicResist: number;
  readonly armorReductionPct: number;
  readonly magicResistReductionPct: number;
  readonly abilityPower: number;
  readonly critChancePct: number;
  readonly critDamagePct: number;
  readonly dodgePct: number;
}

const NO_MODIFIERS: StatModifiers = {
  health: 0,
  attackDamagePct: 0,
  attackSpeedPct: 0,
  slowPct: 0,
  armor: 0,
  magicResist: 0,
  armorReductionPct: 0,
  magicResistReductionPct: 0,
  abilityPower: 0,
  critChancePct: 0,
  critDamagePct: 0,
  dodgePct: 0,
};

/** Modifiers where only the strongest counts (section 12.1); every other modifier adds up. */
const STRONGEST_ONLY: ReadonlySet<keyof StatModifiers> = new Set(['slowPct', 'armorReductionPct', 'magicResistReductionPct']);

/** Combines modifiers from several sources, such as traits and statuses. */
export function combineModifiers(...parts: readonly Partial<StatModifiers>[]): StatModifiers {
  const combined: { -readonly [K in keyof StatModifiers]: number } = { ...NO_MODIFIERS };
  for (const part of parts) {
    for (const key of Object.keys(part) as (keyof StatModifiers)[]) {
      const value = part[key] ?? 0;
      combined[key] = STRONGEST_ONLY.has(key) ? Math.max(combined[key], value) : combined[key] + value;
    }
  }
  return combined;
}

/** Stats for a unit at a star level, before traits, buffs and statuses (section 7.3). */
export function baseStats(unit: UnitDef, star: Star): BaseStats {
  const template = TEMPLATES[CLASS_TEMPLATE[unit.classes[0]]];
  const tweaks = unit.statTweaks ?? {};
  const costSteps = unit.cost - 1;
  const scalePct = (100 + COST_SCALING.healthAndDamagePct * costSteps) * STAR_PCT[star - 1]!;
  const resistBonus = COST_SCALING.armorAndMagicResist * costSteps;
  return {
    maxHealth: Math.round((template.health * scalePct * (100 + (tweaks.health ?? 0))) / 1_000_000),
    attackDamage: Math.round((template.attackDamage * scalePct * (100 + (tweaks.attackDamage ?? 0))) / 1_000_000),
    attackSpeed: (template.attackSpeed * (100 + (tweaks.attackSpeed ?? 0))) / 100,
    range: template.range,
    armor: ((template.armor + resistBonus) * (100 + (tweaks.armor ?? 0))) / 100,
    magicResist: ((template.magicResist + resistBonus) * (100 + (tweaks.magicResist ?? 0))) / 100,
    abilityPower: SHARED_STATS.abilityPower,
    critChancePct: SHARED_STATS.critChancePct,
    critDamagePct: SHARED_STATS.critDamagePct,
    dodgePct: SHARED_STATS.dodgePct,
    startMana: template.startMana,
    maxMana: template.maxMana,
  };
}

/** Stats for a PvE monster at a stage, before buffs and statuses (game-spec.md section 9.8). */
export function monsterStats(monster: MonsterDef, stage: number): BaseStats {
  const s = monster.stats;
  const growth = monster.growth;
  const pct = 100 + (growth === undefined ? 0 : growth.pctPerStage * Math.max(0, stage - growth.afterStage));
  return {
    maxHealth: Math.round((s.health * pct) / 100),
    attackDamage: Math.round((s.attackDamage * pct) / 100),
    attackSpeed: s.attackSpeed,
    range: s.range,
    armor: s.armor,
    magicResist: s.magicResist,
    abilityPower: SHARED_STATS.abilityPower,
    critChancePct: SHARED_STATS.critChancePct,
    critDamagePct: SHARED_STATS.critDamagePct,
    dodgePct: SHARED_STATS.dodgePct,
    startMana: s.startMana,
    maxMana: s.maxMana,
  };
}

/** Stats for an Orc grunt at a stage (section 7.5). Grunts have no ability, so their mana is unused. */
export function gruntStats(stage: number): BaseStats {
  const g = ORC_GRUNT_STATS;
  const stagesAfterFirst = stage - 1;
  return {
    maxHealth: g.health + g.healthPerStage * stagesAfterFirst,
    attackDamage: g.attackDamage + g.attackDamagePerStage * stagesAfterFirst,
    attackSpeed: g.attackSpeed,
    range: g.range,
    armor: g.armor,
    magicResist: g.magicResist,
    abilityPower: SHARED_STATS.abilityPower,
    critChancePct: SHARED_STATS.critChancePct,
    critDamagePct: SHARED_STATS.critDamagePct,
    dodgePct: SHARED_STATS.dodgePct,
    startMana: 0,
    maxMana: 0,
  };
}

/** Stats with modifiers applied (section 7.4). */
export function finalStats(base: Stats, modifiers: Partial<StatModifiers>): Stats {
  const m = { ...NO_MODIFIERS, ...modifiers };
  const attackSpeed = (base.attackSpeed * (100 + m.attackSpeedPct) * (100 - m.slowPct)) / 10_000;
  return {
    maxHealth: base.maxHealth + m.health,
    attackDamage: (base.attackDamage * (100 + m.attackDamagePct)) / 100,
    attackSpeed: Math.min(Math.max(attackSpeed, STAT_LIMITS.minAttackSpeed), STAT_LIMITS.maxAttackSpeed),
    range: base.range,
    armor: ((base.armor + m.armor) * (100 - m.armorReductionPct)) / 100,
    magicResist: ((base.magicResist + m.magicResist) * (100 - m.magicResistReductionPct)) / 100,
    abilityPower: base.abilityPower + m.abilityPower,
    critChancePct: Math.min(base.critChancePct + m.critChancePct, STAT_LIMITS.maxCritChancePct),
    critDamagePct: base.critDamagePct + m.critDamagePct,
    dodgePct: Math.min(base.dodgePct + m.dodgePct, STAT_LIMITS.maxDodgePct),
  };
}

/**
 * An ability's damage, shield or heal value (section 10.2), before amps and resists and not yet
 * rounded. `pct` is the ability's number as a percent of the base value: 1.0 D is 100.
 */
export function abilityValue(base: 'D' | 'S' | 'H', pct: number, cost: Cost, star: Star, abilityPower: number): number {
  const costPct = 100 + ABILITIES.costPctPerCost * (cost - 1);
  return (ABILITIES.base[base] * pct * costPct * ABILITIES.starPct[star - 1]! * abilityPower) / 100_000_000;
}
