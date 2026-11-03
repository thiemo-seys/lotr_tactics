// What the play page's HUD shows (docs/game-spec.md section 12): the person's stats as the game's
// view gives them, the streak, the timer and the One Ring's status. No Three.js or DOM, so it can
// be tested.

import { GIFTS, PLAYER, XP, roundType, roundsInStage, shopOdds, shopOddsLevel, xpForNextLevel, type PlayerView, type RoundType } from '@lotr-tactics/sim';
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

/** One level's shop odds in the level and Buy XP tooltips. */
export interface OddsRow {
  /** The level, as its badge shows it. */
  readonly label: string;
  /** The chance in percent that a shop slot shows a 1- to 5-cost unit. */
  readonly percents: readonly number[];
  /** The odds the person's shop rolls with now. */
  readonly now: boolean;
  /** For the next level, whether each cost's odds go up or down from now; null when they stay. */
  readonly trend: readonly ('up' | 'down' | null)[];
}

export interface ShopOddsView {
  /** The odds now, then at the next level if they differ. */
  readonly rows: readonly OddsRow[];
  /** Why the odds are a higher level's, if a Gift makes them so. */
  readonly note: string | null;
}

/** The odds the person's shop rolls with, as the shop rolls them (with any Mirror of Galadriel), and those a level up would bring. */
export function shopOddsView(p: PlayerView): ShopOddsView {
  const now = shopOdds(p.level, p.gifts);
  const rows: OddsRow[] = [{ label: `${p.level}`, percents: now, now: true, trend: now.map(() => null) }];
  const next = p.level < PLAYER.maxLevel ? shopOdds(p.level + 1, p.gifts) : null;
  if (next !== null && next.some((pct, i) => pct !== now[i])) {
    const trend = next.map((pct, i) => (pct > now[i]! ? 'up' : pct < now[i]! ? 'down' : null));
    rows.push({ label: `${p.level + 1}`, percents: next, now: false, trend });
  }
  const oddsLevel = shopOddsLevel(p.level, p.gifts);
  const note = oddsLevel === p.level ? null : `${GIFTS['mirror-of-galadriel'].name}: your shop rolls with the odds of level ${oddsLevel}.`;
  return { rows, note };
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

/** How the person's fight in a round went, once its results have been shown. */
export type RoundOutcome = 'Victory' | 'Defeat' | 'Draw';

/** One round of a stage in the stage tracker. */
export interface StageNode {
  readonly round: number;
  readonly type: RoundType;
  /** Played, the one on screen, or still to come. */
  readonly state: 'done' | 'current' | 'next';
  /** The person's result in a round played or on screen, if they fought in it and it has been shown. */
  readonly outcome: RoundOutcome | null;
}

/** Every round of the stage on screen, in order, each with its type and how far the game has come. */
export function stageTrack(stage: number, round: number, outcome: (stage: number, round: number) => RoundOutcome | null): StageNode[] {
  return Array.from({ length: roundsInStage(stage) }, (_, i) => {
    const r = i + 1;
    const state = r < round ? 'done' : r === round ? 'current' : 'next';
    return { round: r, type: roundType(stage, r), state, outcome: state === 'next' ? null : outcome(stage, r) };
  });
}

/** A whole number of HP or damage as the HUD writes it. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
