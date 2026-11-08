// What a finished match reports (docs/accounts-spec.md section 9.1): every seat's place and the
// board it fought its last fight with.

import { teamTraitCounts, traitLevelsOf, type CombatInput, type ItemId, type RoundReport, type Star, type Team, type TraitId, type UnitId } from '@lotr-tactics/sim';

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
  /** The board, not the bench, in the order the fight placed it. */
  readonly units: readonly FinalUnit[];
  /** Active traits only, most units first, then by id. */
  readonly traits: readonly FinalTrait[];
  /** The unit that wore the One Ring in that fight, if any. */
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

/**
 * The boards seats fought with in a round, from its fights' input, so the One Ring's bearer is the
 * unit that wore it in the fight. A seat's own team is its board: team A for the home seat, team B
 * for the away seat of a PvP fight. A ghost fight's away team is a copy, and PvE's team B monsters,
 * so neither is anyone's board. `levels` gives each seat's level, in seat order.
 */
export function fightBoards(report: RoundReport, levels: readonly number[]): Map<number, FinalBoard> {
  const boards = new Map<number, FinalBoard>();
  for (const fight of report.fights) {
    boards.set(fight.home, finalBoard(fight.input, 'A', levels[fight.home]!));
    if (fight.kind === 'pvp' && fight.away !== null) boards.set(fight.away, finalBoard(fight.input, 'B', levels[fight.away]!));
  }
  return boards;
}

/** One team's board in a fight, with its active traits and the One Ring's bearer. */
export function finalBoard(input: CombatInput, team: Team, level: number): FinalBoard {
  // A player's team holds only units: monsters fight only as PvE's team B, and summons aren't placed.
  const placed = input.teams[team];
  const counts = teamTraitCounts(placed, input.gifts?.[team] ?? []);
  const levels = traitLevelsOf(counts);
  const traits = (Object.entries(levels) as [TraitId, number][])
    .map(([trait, tier]) => ({ trait, count: counts[trait]!, tier: tier + 1 }))
    .sort((a, b) => b.count - a.count || (a.trait < b.trait ? -1 : a.trait > b.trait ? 1 : 0));
  const bearer = placed.find((u) => u.ring !== undefined);
  return {
    level,
    units: placed.map((u) => ({ unit: u.unitId as UnitId, star: u.star, items: [...u.items] })),
    traits,
    ringBearer: bearer === undefined ? null : (bearer.unitId as UnitId),
  };
}
