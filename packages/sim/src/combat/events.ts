// Combat events (docs/sim-spec.md section 14). The renderer animates the fight from these.

import type { DamageType, SummonId, UnitId } from '../data/units.js';
import type { Hex } from '../hex.js';
import type { Star, Team } from '../types.js';

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

export type CombatEvent = SpawnEvent | MoveEvent | AttackEvent | DodgeEvent | DamageEvent | DeathEvent | EndEvent;
