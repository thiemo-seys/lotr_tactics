// Combat events (docs/sim-spec.md section 14). The renderer animates the fight from these.

import type { BuffStat, DamageType, SummonId, UnitId } from '../data/units.js';
import type { Hex } from '../hex.js';
import type { Star, Team } from '../types.js';
import type { StatusKind } from './statuses.js';

export type Outcome = Team | 'draw';

export interface SpawnEvent {
  readonly type: 'spawn';
  readonly tick: number;
  readonly unit: number;
  readonly unitId: UnitId | SummonId;
  readonly team: Team;
  /** Board coordinates. */
  readonly hex: Hex;
  readonly star: Star;
  readonly summon: boolean;
}

/** A unit starts a step. It already occupies `to`; the renderer animates it until `arriveTick`. */
export interface MoveEvent {
  readonly type: 'move';
  readonly tick: number;
  readonly unit: number;
  readonly from: Hex;
  readonly to: Hex;
  readonly arriveTick: number;
}

/** An instant move from an ability. The renderer animates it; the unit is busy for a moment after. */
export interface DashEvent {
  readonly type: 'dash';
  readonly tick: number;
  readonly unit: number;
  readonly from: Hex;
  readonly to: Hex;
}

/** A basic attack fires. Melee attacks hit now; ranged ones hit at `hitTick` unless the target is gone. */
export interface AttackEvent {
  readonly type: 'attack';
  readonly tick: number;
  readonly unit: number;
  readonly target: number;
  readonly ranged: boolean;
  readonly hitTick: number;
}

export interface DodgeEvent {
  readonly type: 'dodge';
  readonly tick: number;
  /** The defender. */
  readonly unit: number;
  readonly source: number;
}

export interface DamageEvent {
  readonly type: 'damage';
  readonly tick: number;
  readonly source: number;
  readonly target: number;
  /** The final damage, including any part a shield absorbed. */
  readonly amount: number;
  readonly absorbed: number;
  readonly damageType: DamageType;
  readonly crit: boolean;
  readonly kind: 'attack' | 'ability' | 'trait';
}

/** Health actually restored, never 0 (section 9.2). */
export interface HealEvent {
  readonly type: 'heal';
  readonly tick: number;
  readonly source: number;
  readonly target: number;
  readonly amount: number;
}

export interface ShieldEvent {
  readonly type: 'shield';
  readonly tick: number;
  readonly source: number;
  readonly target: number;
  readonly amount: number;
  /** The shield is gone from the start of this tick, if damage hasn't used it up first. */
  readonly expiresTick: number;
}

/** A unit casts its ability. Its effects follow in the same tick, apart from delayed steps. */
export interface CastEvent {
  readonly type: 'cast';
  readonly tick: number;
  readonly unit: number;
  /** The ability's name. */
  readonly ability: string;
}

/** A status starts, or a stun, stun immunity or untargetable is extended. */
export interface StatusEvent {
  readonly type: 'status';
  readonly tick: number;
  readonly source: number;
  readonly target: number;
  readonly status: StatusKind;
  /** The stat a buff or reduction changes; null for the other statuses. */
  readonly stat: BuffStat | null;
  /** A slow's or reduction's percent, or a buff's amount; null for the other statuses. */
  readonly value: number | null;
  /** The status is gone from the start of this tick. */
  readonly expiresTick: number;
}

export interface DeathEvent {
  readonly type: 'death';
  readonly tick: number;
  readonly unit: number;
}

export interface EndEvent {
  readonly type: 'end';
  readonly tick: number;
  readonly outcome: Outcome;
}

export type CombatEvent =
  | SpawnEvent
  | MoveEvent
  | DashEvent
  | AttackEvent
  | DodgeEvent
  | DamageEvent
  | HealEvent
  | ShieldEvent
  | CastEvent
  | StatusEvent
  | DeathEvent
  | EndEvent;
