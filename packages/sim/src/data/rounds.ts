// Round schedule, player damage, the Council of Elrond and matchmaking (docs/design.md section 9,
// docs/game-spec.md section 9). All numbers are placeholders until balancing.

import type { Cost } from './units.js';

export type RoundType = 'council' | 'pvp' | 'pve';

export const SCHEDULE: { readonly firstStage: readonly RoundType[]; readonly laterStages: readonly RoundType[] } = {
  firstStage: ['council', 'pve', 'pve', 'pve'],
  laterStages: ['pvp', 'pvp', 'pvp', 'council', 'pvp', 'pvp', 'pve'],
};

/** Stage damage for losing a fight, from stage 1. The last entry holds for every later stage. */
export const STAGE_DAMAGE: readonly number[] = [0, 2, 5, 8, 10, 12, 17];

/** Damage for each surviving enemy unit at 1★, 2★ and 3★. */
export const SURVIVOR_DAMAGE = [1, 2, 3] as const;

export const COUNCIL = {
  options: 9,
  /** Players pick in groups of this size, lowest HP first, after the first Council. */
  groupSize: 2,
  /** The unit costs offered, from stage 1. The last entry holds for every later stage. */
  costs: [[1], [1, 2], [2, 3], [3, 4], [3, 4, 5]] as readonly (readonly Cost[])[],
} as const;

export const MATCHMAKING = {
  /** A player avoids this many of their last opponents. */
  recentOpponents: 3,
} as const;
