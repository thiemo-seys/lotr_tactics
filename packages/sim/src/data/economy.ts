// Gold, XP, levels, the shop and the pool (docs/design.md section 8, docs/game-spec.md sections 5–8).
// All numbers are placeholders until balancing. Percentages are whole numbers.

import type { Cost } from './units.js';

export const PLAYER = {
  startingHp: 100,
  benchSize: 9,
  maxLevel: 9,
} as const;

/** Copies of each unit in the shared pool, by cost. */
export const POOL_COPIES: Readonly<Record<Cost, number>> = { 1: 22, 2: 20, 3: 17, 4: 10, 5: 9 };

/** How many copies of a unit make one at each star level. */
export const COPIES_PER_STAR = [1, 3, 9] as const;

export const SHOP = {
  size: 5,
  rerollCost: 2,
  /** The odds in percent that a slot shows a 1- to 5-cost unit, at levels 1 to 9. */
  odds: [
    [100, 0, 0, 0, 0],
    [100, 0, 0, 0, 0],
    [75, 25, 0, 0, 0],
    [55, 30, 15, 0, 0],
    [45, 33, 20, 2, 0],
    [30, 40, 25, 5, 0],
    [19, 35, 35, 10, 1],
    [18, 25, 32, 22, 3],
    [10, 20, 25, 35, 10],
  ] as readonly (readonly number[])[],
} as const;

export const INCOME = {
  /** Base income in the rounds that differ from `standard`, keyed by "stage-round". */
  base: { '1-2': 2, '1-3': 2, '1-4': 3, '2-1': 4 } as Readonly<Record<string, number>>,
  standard: 5,
  goldPerInterest: 10,
  maxInterest: 5,
  pvpWin: 1,
} as const;

/** Streak bonus gold: the bonus of the last entry whose `from` the streak length reaches. */
export const STREAK_GOLD: readonly { readonly from: number; readonly gold: number }[] = [
  { from: 2, gold: 1 },
  { from: 4, gold: 2 },
  { from: 5, gold: 3 },
];

export const XP = {
  buyCost: 4,
  buyAmount: 4,
  /** The first level at which XP can be bought. Levels below it come only automatically. */
  buyFromLevel: 3,
  perRound: 2,
  perRoundFromStage: 2,
  /** XP needed to go from the level below to this one. */
  toLevel: { 4: 6, 5: 10, 6: 20, 7: 36, 8: 48, 9: 76 } as Readonly<Record<number, number>>,
  /** Levels reached automatically at the start of a round. */
  automatic: [
    { stage: 1, round: 2, level: 2 },
    { stage: 2, round: 1, level: 3 },
  ],
} as const;
