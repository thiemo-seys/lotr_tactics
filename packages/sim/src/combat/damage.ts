// Damage and the rolls of a basic attack (docs/sim-spec.md sections 9 and 9.1).
// Percentages are whole numbers, multiplied together and divided once (section 4).

import { MANA, TICKS_PER_SECOND, TIMING } from '../data/rules.js';
import type { DamageType } from '../data/units.js';
import { roll, type Rng } from '../rng.js';
import { OVERTIME_START_TICK } from './time.js';

export interface AttackRoll {
  readonly dodged: boolean;
  readonly crit: boolean;
}

/**
 * Rolls a basic attack: dodge first, only if the target can dodge, then crit unless it was dodged.
 * Uses one or two numbers from the generator.
 */
export function rollAttack(rng: Rng, critChancePct: number, dodgePct: number): AttackRoll {
  if (dodgePct > 0 && roll(rng, dodgePct / 100)) return { dodged: true, crit: false };
  return { dodged: false, crit: roll(rng, critChancePct / 100) };
}

/** The overtime damage multiplier for a tick: 100 before overtime, then +10 per full second of it. */
export function overtimePct(tick: number): number {
  if (tick < OVERTIME_START_TICK) return 100;
  return 100 + TIMING.overtimeDamagePctPerSecond * Math.floor((tick - OVERTIME_START_TICK) / TICKS_PER_SECOND);
}

export interface DamageModifiers {
  /** The sum of the damage amps on the source. */
  readonly ampPct: number;
  readonly overtimePct: number;
  /** Damage reduction on the target. */
  readonly reductionPct: number;
}

/** Final damage from raw damage (section 9.1): amps and overtime, then resists, then reduction, rounded. */
export function finalDamage(
  raw: number,
  type: DamageType,
  target: { readonly armor: number; readonly magicResist: number },
  modifiers: DamageModifiers,
): number {
  const resist = type === 'physical' ? target.armor : type === 'magic' ? target.magicResist : 0;
  const amount =
    (raw * (100 + modifiers.ampPct) * modifiers.overtimePct * 100 * (100 - modifiers.reductionPct)) /
    (100 * 100 * (100 + resist) * 100);
  return Math.max(0, Math.round(amount));
}

/** Mana a unit gains from one hit of `damage`, counting shield-absorbed damage. */
export function manaFromDamage(damage: number): number {
  return Math.min(Math.floor((damage * MANA.fromDamagePct) / 100), MANA.fromDamageMaxPerHit);
}
