import type { RingView, UnitId } from '@lotr-tactics/sim';
import type { PublicPlayer, SeatView } from '@lotr-tactics/server';
import { describe, expect, it } from 'vitest';
import { LIVERY } from '../src/livery.js';
import { crestOf, hpBand, medal, playerRows } from '../src/players.js';

const player = (seat: number, hp: number, placement: number | null = null, streak = 0, board: UnitId[] = [], gifts: string[] = []): PublicPlayer =>
  ({ seat, hp, level: 3 + seat, streak, placement, gifts, board: board.map((unitId) => ({ unitId, items: [] })) }) as unknown as PublicPlayer;

describe('the players list', () => {
  it('orders by standings and marks you, bots, people away and the Ring holder', () => {
    const seats: SeatView[] = [
      { kind: 'person', name: 'Ann', connected: true },
      { kind: 'person', name: 'Bo', connected: false },
      { kind: 'bot', name: 'Bot 2', connected: false },
    ];
    const ring: RingView = { state: 'held', holder: 2, bearer: null, corruption: 3, hobbitFights: 0 };
    // Bot 2's Gondor and Hobbit tie, until its Shire Folk crest makes the Hobbits active.
    const bot = player(2, 85, null, 4, ['beregond', 'sam'], ['shire-folk']);
    const rows = playerRows([player(0, 40, null, -2), player(1, 0, 3), bot], seats, 0, ring, (s) => (s === 0 ? 'You' : seats[s]!.name));
    expect(rows.map((r) => r.seat)).toEqual([2, 0, 1]);
    expect(rows[0]).toMatchObject({ name: 'Bot 2', bot: true, away: false, ringHolder: true, hpBand: 'high', streak: { kind: 'win', length: 4 }, crest: { origin: 'hobbit', colour: LIVERY.factions.hobbit } });
    expect(rows[1]).toMatchObject({ name: 'You', you: true, bot: false, away: false, hpShare: 0.4, hpBand: 'mid', streak: { kind: 'loss', length: 2 }, crest: null });
    expect(rows[2]).toMatchObject({ away: true, placement: 3, hpShare: 0, hpBand: 'low' });
  });

  it('gives each player the crest of the faction their board leans on, in its livery', () => {
    const unit = (unitId: UnitId) => ({ unitId, items: [] });
    // Two Guardians are active too, but a crest is a faction: the active Hobbits win.
    expect(crestOf([unit('beregond'), null, unit('sam'), unit('merry')], [])).toEqual({ origin: 'hobbit', colour: LIVERY.factions.hobbit });
    // With no faction active, the first the trait tracker lists.
    expect(crestOf([unit('sam'), unit('beregond')], [])?.origin).toBe('gondor');
    expect(crestOf([null, null], [])).toBeNull();
  });

  it('bands HP and gives the top three medals', () => {
    expect([hpBand(1), hpBand(0.61), hpBand(0.6), hpBand(0.31), hpBand(0.3), hpBand(0)]).toEqual(['high', 'high', 'mid', 'mid', 'low', 'low']);
    expect([1, 2, 3, 4, null].map(medal)).toEqual(['gold', 'silver', 'bronze', null, null]);
  });
});
