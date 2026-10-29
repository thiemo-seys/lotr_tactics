// How bots play (docs/game-spec.md section 11). These tune the bots, not the game.

import type { ComponentId, RingOfPowerId } from './items.js';

/** Which of a bot's board units gets an item: its attacker, its caster or its tank. */
export type ItemRole = 'attacker' | 'caster' | 'tank';

export const BOT = {
  /** Gold a bot keeps for interest, from stage 1. The last entry holds for later stages. */
  goldFloor: [0, 10, 20, 30, 50] as readonly number[],
  /** Below this HP a bot spends everything. */
  panicHp: 40,
  /** The level a bot buys XP towards, from each of these rounds on. */
  levelTargets: [
    { stage: 2, round: 1, level: 4 },
    { stage: 2, round: 5, level: 5 },
    { stage: 3, round: 2, level: 6 },
    { stage: 4, round: 1, level: 7 },
    { stage: 5, round: 1, level: 8 },
    { stage: 6, round: 1, level: 9 },
  ],
  /** From this stage, a bot at its target level rerolls for upgrades. */
  rollFromStage: 4,
  /** Gold kept back when rerolling, unless below `panicHp`. */
  rollFloor: 20,
  maxRerollsPerRound: 8,
  /** How much a bot wants a unit: completing a merge, adding a copy to one it owns, per focus trait, per cost. */
  want: { merge: 100, copy: 30, focusTrait: 20, perCost: 2 },
  /** A bot buys units it wants at least this much, or anything while its board has room. */
  buyThreshold: 20,
  /** A bot keeps this many bench slots free, selling its least useful units. */
  freeBenchSlots: 2,
  focusTraits: 2,
  /** Focus traits are chosen at the start of each stage from this one on. */
  focusFromStage: 2,
  /** The most a bot's seeded taste for a trait can add to the units it owns of that trait. */
  tasteWeight: 1.5,
  /**
   * How much a bot wants a Gift: a crest of one of its focus traits or of another trait, a combat
   * Gift, or an economy Gift, which it wants more while its HP is at least `greedHp`. It rerolls an
   * offer whose best Gift scores below `rerollBelow`.
   */
  gifts: { focusCrest: 40, otherCrest: 5, combat: 20, economy: 15, greedHp: 70, greedBonus: 10, rerollBelow: 20 },
  /** A bot takes the One Ring's Council option at or below this HP, and never above it. */
  ringTakeBelowHp: 60,
  /** How much a Ring of Power adds to a Council option's score. */
  ringOfPowerWant: 40,
  /**
   * The unit each component and Ring of Power goes to. A combined item goes where its first
   * component would; a ring goes to a unit of its kin first.
   */
  itemRoles: {
    blade: 'attacker',
    bow: 'attacker',
    mail: 'tank',
    cloak: 'tank',
    lembas: 'tank',
    staff: 'caster',
    narya: 'attacker',
    nenya: 'tank',
    vilya: 'caster',
    'ring-of-the-seven': 'tank',
    'ring-of-the-nine': 'attacker',
  } as Readonly<Record<ComponentId | RingOfPowerId, ItemRole>>,
} as const;
