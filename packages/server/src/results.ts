// What a finished match reports (docs/accounts-spec.md section 9.1): every seat's place and the
// board it fought its last fight with.

import { teamTraitCounts, traitLevelsOf, type ItemId, type PlayerView, type RingView, type Star, type TraitId, type UnitId } from '@lotr-tactics/sim';

export interface FinalUnit {
  readonly unit: UnitId;
  readonly star: Star;
  readonly items: readonly ItemId[];
}

export interface FinalTrait {
  readonly trait: TraitId;
  readonly count: number;
  /** 1 at the trait's first breakpoint, 2 at its second, and so on. */
  readonly tier: number;
}

export interface FinalBoard {
  readonly level: number;
  /** The board, not the bench, in board-slot order. */
  readonly units: readonly FinalUnit[];
  /** Active traits only, most units first, then by id. */
  readonly traits: readonly FinalTrait[];
  /** The unit that wore the One Ring, if this seat had it. */
  readonly ringBearer: UnitId | null;
}

export interface SeatResult {
  readonly seat: number;
  /** The account id, or null for a bot. */
  readonly player: string | null;
  /** As shown in the game. */
  readonly name: string;
  /** 1 to 8. */
  readonly place: number;
  /** Left the game for good. */
  readonly left: boolean;
  readonly board: FinalBoard;
}

export interface MatchResult {
  readonly kind: 'ranked' | 'private';
  /** From the start of the game to its end, by the host's clock. */
  readonly durationMs: number;
  readonly lastRound: { readonly stage: number; readonly round: number };
  /** Every seat, in seat order. */
  readonly seats: readonly SeatResult[];
}

/** A player's board as it stands, with its active traits and the One Ring's bearer. */
export function finalBoard(player: PlayerView, ring: RingView): FinalBoard {
  const board = player.board.filter((u) => u !== null);
  const counts = teamTraitCounts(board, player.gifts);
  const levels = traitLevelsOf(counts);
  const traits = (Object.entries(levels) as [TraitId, number][])
    .map(([trait, level]) => ({ trait, count: counts[trait]!, tier: level + 1 }))
    .sort((a, b) => b.count - a.count || (a.trait < b.trait ? -1 : a.trait > b.trait ? 1 : 0));
  const bearer =
    ring.holder === player.seat && ring.bearer !== null
      ? [...board, ...player.bench].find((u) => u?.id === ring.bearer)?.unitId ?? null
      : null;
  return {
    level: player.level,
    units: board.map((u) => ({ unit: u.unitId, star: u.star, items: [...u.items] })),
    traits,
    ringBearer: bearer,
  };
}
