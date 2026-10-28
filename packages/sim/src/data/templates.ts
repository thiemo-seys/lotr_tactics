// Unit stat templates and scaling (docs/design.md section 5, docs/sim-spec.md section 7).
// All numbers are placeholders until balancing. Percentages are whole numbers.

import type { ClassId } from './traits.js';

export type TemplateId = 'tank' | 'fighter' | 'skirmisher' | 'archer' | 'caster';

/** Stats of a 1★, 1-cost unit. */
export interface StatTemplate {
  readonly health: number;
  readonly attackDamage: number;
  /** Attacks per second. */
  readonly attackSpeed: number;
  /** In hexes; 1 is melee. */
  readonly range: number;
  readonly armor: number;
  readonly magicResist: number;
  readonly startMana: number;
  readonly maxMana: number;
}

export const TEMPLATES: Readonly<Record<TemplateId, StatTemplate>> = {
  tank: { health: 650, attackDamage: 45, attackSpeed: 0.6, range: 1, armor: 40, magicResist: 40, startMana: 30, maxMana: 90 },
  fighter: { health: 600, attackDamage: 55, attackSpeed: 0.7, range: 1, armor: 30, magicResist: 30, startMana: 0, maxMana: 60 },
  skirmisher: { health: 500, attackDamage: 55, attackSpeed: 0.8, range: 1, armor: 20, magicResist: 20, startMana: 0, maxMana: 50 },
  archer: { health: 450, attackDamage: 50, attackSpeed: 0.75, range: 4, armor: 15, magicResist: 15, startMana: 0, maxMana: 60 },
  caster: { health: 450, attackDamage: 35, attackSpeed: 0.65, range: 4, armor: 15, magicResist: 15, startMana: 20, maxMana: 70 },
};

/** A unit uses the template of its first class. */
export const CLASS_TEMPLATE: Readonly<Record<ClassId, TemplateId>> = {
  guardian: 'tank',
  rider: 'fighter',
  captain: 'fighter',
  burglar: 'skirmisher',
  archer: 'archer',
  sorcerer: 'caster',
};

/** Stats every unit starts with, whatever its template. */
export const SHARED_STATS = {
  abilityPower: 100,
  critChancePct: 25,
  critDamagePct: 140,
  dodgePct: 0,
} as const;

/** Added for each cost step above 1. */
export const COST_SCALING = {
  healthAndDamagePct: 15,
  armorAndMagicResist: 5,
} as const;

/** Health and Attack Damage multiplier at 1★ / 2★ / 3★. */
export const STAR_PCT = [100, 180, 324] as const;

/** The largest stat tweak a unit may have, in percent either way. */
export const MAX_STAT_TWEAK_PCT = 10;

/** The summon from the Orc trait and Gothmog's ability. Stage-dependent stats grow per stage after 1. */
export const ORC_GRUNT_STATS = {
  health: 300,
  healthPerStage: 100,
  attackDamage: 30,
  attackDamagePerStage: 10,
  attackSpeed: 0.7,
  range: 1,
  armor: 20,
  magicResist: 20,
} as const;
