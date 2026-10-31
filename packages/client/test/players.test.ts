import type { RingView } from '@lotr-tactics/sim';
import type { PublicPlayer, SeatView } from '@lotr-tactics/server';
import { describe, expect, it } from 'vitest';
import { hpBand, medal, playerRows } from '../src/players.js';

const player = (seat: number, hp: number, placement: number | null = null, streak = 0): PublicPlayer =>
  ({ seat, hp, level: 3 + seat, streak, placement, gifts: [] }) as unknown as PublicPlayer;

describe('the players list', () => {
  it('orders by standings and marks you, bots, people away and the Ring holder', () => {
    const seats: SeatView[] = [
      { kind: 'person', name: 'Ann', connected: true },
      { kind: 'person', name: 'Bo', connected: false },
      { kind: 'bot', name: 'Bot 2', connected: false },
    ];
    const ring: RingView = { state: 'held', holder: 2, bearer: null, corruption: 3, hobbitFights: 0 };
    const rows = playerRows([player(0, 40, null, -2), player(1, 0, 3), player(2, 85, null, 4)], seats, 0, ring, (s) => (s === 0 ? 'You' : seats[s]!.name));
    expect(rows.map((r) => r.seat)).toEqual([2, 0, 1]);
    expect(rows[0]).toMatchObject({ name: 'Bot 2', bot: true, away: false, ringHolder: true, hpBand: 'high', streak: { kind: 'win', length: 4 } });
    expect(rows[1]).toMatchObject({ name: 'You', you: true, bot: false, away: false, hpShare: 0.4, hpBand: 'mid', streak: { kind: 'loss', length: 2 } });
    expect(rows[2]).toMatchObject({ away: true, placement: 3, hpShare: 0, hpBand: 'low' });
  });

  it('bands HP and gives the top three medals', () => {
    expect([hpBand(1), hpBand(0.61), hpBand(0.6), hpBand(0.31), hpBand(0.3), hpBand(0)]).toEqual(['high', 'high', 'mid', 'mid', 'low', 'low']);
    expect([1, 2, 3, 4, null].map(medal)).toEqual(['gold', 'silver', 'bronze', null, null]);
  });
});
