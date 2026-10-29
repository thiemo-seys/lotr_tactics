// Combat events (docs/sim-spec.md section 14). The renderer animates the fight from these.

import type { SummonId, UnitId } from '../data/units.js';
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

export interface EndEvent {
  readonly type: 'end';
  readonly tick: number;
  readonly outcome: Outcome;
}

export type CombatEvent = SpawnEvent | MoveEvent | EndEvent;
