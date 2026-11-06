// Combat events (docs/sim-spec.md section 14). The renderer animates the fight from these.

import type { FighterId } from '../data/monsters.js';
import type { BuffStat, DamageType, Selector, SummonId } from '../data/units.js';
import type { Hex } from '../hex.js';
import type { Star, Team } from '../types.js';
import type { StatusKind } from './statuses.js';

export type Outcome = Team | 'draw';

export interface SpawnEvent {
  readonly type: 'spawn';
  readonly tick: number;
  readonly unit: number;
  readonly unitId: FighterId | SummonId;
  readonly team: Team;
  /** Board coordinates. */
  readonly hex: Hex;
  readonly star: Star;
  readonly summon: boolean;
  /** For a summon, the unit that made it: the Orc for trait grunts, the caster for an ability's. Null otherwise, and for the Eye's Nazgûl. */
  readonly owner: number | null;
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

/**
 * A dash, leap or charge, emitted when its destination is chosen and claimed (section 10.4): at the
 * cast for an ability's, right after the `cast` event, or at tick 0 for a Burglar leap or Rider
 * charge. The unit's hex becomes `to` on `departTick`, and it arrives on `arriveTick`. If the
 * caster dies before `departTick`, it never sets off.
 */
export interface DashEvent {
  readonly type: 'dash';
  readonly tick: number;
  readonly unit: number;
  readonly from: Hex;
  readonly to: Hex;
  readonly departTick: number;
  readonly arriveTick: number;
}

/**
 * A basic attack fires. A melee blow lands on `hitTick`, 7 ticks later, and a ranged attack's
 * projectile arrives then (section 9). One that is wasted emits nothing more; one that lands emits
 * its `dodge` or `damage` on `hitTick`.
 */
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
  readonly kind: 'attack' | 'ability' | 'trait' | 'item';
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

/** A unit a cast's step locked, and the tick the step reaches it (section 14, Aims). */
export interface AimUnit {
  readonly unit: number;
  readonly landTick: number;
}

/** A board hex a cast's step locked, in board coordinates, and the tick the step reaches it. */
export interface AimHex {
  readonly hex: Hex;
  readonly landTick: number;
}

/** How a step lands (section 14, Aims). Steps on the caster and its allies are always `strike`. */
export type AimDelivery = 'strike' | 'projectile' | 'lob' | 'dash' | 'charge';

/** What one of a cast's steps locked, and when it lands (section 14, Aims). */
export interface CastAim {
  /** The step's index in the ability's steps. Delayed steps have no aim. */
  readonly step: number;
  readonly select: Selector['kind'];
  /** Whom the step affects. */
  readonly side: 'enemy' | 'ally';
  readonly delivery: AimDelivery;
  /** For a unit selector, the locked units in the selection's order; empty for a hex selector. */
  readonly units: readonly AimUnit[];
  /**
   * For a hex selector, the locked hexes on the board: a line's or charge's from the caster
   * outwards, a cone's in its order, others by board row, then column. Empty for a unit selector.
   */
  readonly hexes: readonly AimHex[];
  /** The number of hits of a multi-hit `damage` in the step, otherwise 1. */
  readonly hits: number;
  /** Ticks between hits, after the first's `landTick`: 0 for a step with one hit. */
  readonly hitGap: number;
  /** For `area`, the hex it is around; for the selectors round the caster, its hex or its dash's destination. Null otherwise. */
  readonly centre: Hex | null;
}

/**
 * A unit casts its ability (section 10.6). Its targets and areas are locked now; the effects land
 * from `releaseTick`, the end of the wind-up, on the `landTick`s of `aims`, and the caster acts
 * again on `readyTick`. Delayed steps come later and have no aim.
 */
export interface CastEvent {
  readonly type: 'cast';
  readonly tick: number;
  readonly unit: number;
  /** The ability's name. */
  readonly ability: string;
  readonly releaseTick: number;
  readonly readyTick: number;
  readonly aims: readonly CastAim[];
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
  /** The status is gone from the start of this tick; null if it lasts the rest of the fight (trait buffs). */
  readonly expiresTick: number | null;
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
