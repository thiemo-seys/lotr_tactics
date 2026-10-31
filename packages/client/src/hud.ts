// What the play page's HUD shows (docs/game-spec.md section 12): the person's stats as the game's
// view gives them, the streak, the timer and the One Ring's status. No Three.js or DOM, so it can
// be tested.

import { PLAYER, XP, xpForNextLevel, type PlayerView } from '@lotr-tactics/sim';
import type { PlanningRing } from './flow.js';
import { ringTier, type RingTier } from './ring.js';

/** Consecutive PvP wins or losses. */
export interface Streak {
  readonly kind: 'win' | 'loss';
  readonly length: number;
}

/** A streak from `PlayerView.streak`: positive for wins, negative for losses. */
export function streakOf(streak: number): Streak | null {
  return streak === 0 ? null : { kind: streak > 0 ? 'win' : 'loss', length: Math.abs(streak) };
}

export interface HudStats {
  /** HP left, never below 0: a player knocked out can end on less. */
  readonly hp: number;
  readonly gold: number;
  readonly level: number;
  /** XP towards the next level, or null before XP counts and at the top level. */
  readonly xp: { readonly have: number; readonly need: number } | null;
  readonly topLevel: boolean;
  readonly board: {
    readonly fielded: number;
    /** The level's limit. */
    readonly max: number;
    /** The board has room and the bench has a unit that could fill it. */
    readonly room: boolean;
  };
  readonly streak: Streak | null;
}

export function hudStats(p: PlayerView): HudStats {
  const need = xpForNextLevel(p.level);
  const fielded = p.board.filter((u) => u !== null).length;
  return {
    hp: Math.max(0, p.hp),
    gold: p.gold,
    level: p.level,
    xp: p.level < XP.buyFromLevel || need === null ? null : { have: p.xp, need },
    topLevel: p.level >= PLAYER.maxLevel,
    board: { fielded, max: p.level, room: fielded < p.level && p.bench.some((u) => u !== null) },
    streak: streakOf(p.streak),
  };
}

/** The last seconds of a timer, which the HUD makes urgent. */
export const URGENT_SECONDS = 5;

export interface TimerView {
  readonly seconds: number;
  /** How much of the step's time is left, from 1 to 0. */
  readonly fraction: number;
  readonly urgent: boolean;
}

export function timerView(seconds: number | null, fraction: number | null): TimerView | null {
  if (seconds === null) return null;
  return { seconds, fraction: fraction ?? 1, urgent: seconds <= URGENT_SECONDS };
}

/** The One Ring in the HUD of the player holding it. */
export interface RingStatus {
  readonly corruption: number;
  readonly tier: RingTier;
  readonly unworn: boolean;
}

export function ringStatus(ring: PlanningRing | null): RingStatus | null {
  return ring === null ? null : { corruption: ring.corruption, tier: ringTier(ring.corruption), unworn: ring.bearer === null };
}

/** A whole number of HP or damage as the HUD writes it. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
