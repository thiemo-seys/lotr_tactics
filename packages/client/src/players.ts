// The players list on the play page (docs/game-spec.md section 12, docs/server-spec.md section
// 10): one row per player in standings order, from what the game's view shows of them. No Three.js
// or DOM, so it can be tested.

import { PLAYER, type GiftId, type RingView } from '@lotr-tactics/sim';
import type { PublicPlayer, SeatView } from '@lotr-tactics/server';
import { standings } from './flow.js';
import { streakOf, type Streak } from './hud.js';

export type HpBand = 'high' | 'mid' | 'low';

export interface PlayerRow {
  readonly seat: number;
  readonly name: string;
  readonly you: boolean;
  readonly hp: number;
  /** HP as a share of the starting HP, from 0 to 1. */
  readonly hpShare: number;
  readonly hpBand: HpBand;
  readonly level: number;
  readonly streak: Streak | null;
  readonly ringHolder: boolean;
  readonly bot: boolean;
  /** A person who has lost their connection; a bot plays for them meanwhile. */
  readonly away: boolean;
  /** Set once the player is out, or has won. */
  readonly placement: number | null;
  readonly gifts: readonly GiftId[];
}

/** HP shares above these are high, then middling; the rest are low. */
const BANDS = { high: 0.6, mid: 0.3 } as const;

export function hpBand(share: number): HpBand {
  return share > BANDS.high ? 'high' : share > BANDS.mid ? 'mid' : 'low';
}

export function playerRows(
  players: readonly PublicPlayer[],
  seats: readonly SeatView[] | undefined,
  you: number,
  ring: RingView,
  name: (seat: number) => string,
): PlayerRow[] {
  return standings(players).map((p) => {
    const seat = seats?.[p.seat];
    const hpShare = Math.min(1, Math.max(0, p.hp / PLAYER.startingHp));
    return {
      seat: p.seat,
      name: name(p.seat),
      you: p.seat === you,
      hp: p.hp,
      hpShare,
      hpBand: hpBand(hpShare),
      level: p.level,
      streak: streakOf(p.streak),
      ringHolder: ring.state === 'held' && ring.holder === p.seat,
      bot: seat?.kind === 'bot',
      away: seat?.kind === 'person' && !seat.connected,
      placement: p.placement,
      gifts: p.gifts,
    };
  });
}

/** Medals for the first three places. */
export function medal(placement: number | null): 'gold' | 'silver' | 'bronze' | null {
  return placement === 1 ? 'gold' : placement === 2 ? 'silver' : placement === 3 ? 'bronze' : null;
}
