// Which fight in a round is a seat's own, and which team it played (docs/game-spec.md section 12).

import type { FightRecord, RoundRecord } from '@lotr-tactics/server';
import type { Team } from '@lotr-tactics/sim';

/** A seat's own fight in a round, if it fought: not a fight against its ghost. */
export function yourFight(round: RoundRecord, seat: number): FightRecord | null {
  return round.fights.find((f) => f.home === seat || (f.kind === 'pvp' && f.away === seat)) ?? null;
}

/** The team a seat played in its fight. */
export function yourTeam(fight: FightRecord, seat: number): Team {
  return fight.home === seat ? 'A' : 'B';
}
