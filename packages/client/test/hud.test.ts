import { PLAYER, XP, type OwnedUnit, type PlayerView } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { URGENT_SECONDS, hudStats, ringStatus, streakOf, timerView } from '../src/hud.js';

const unit: OwnedUnit = { id: 1, unitId: 'sam', star: 1, items: [] };

function player(over: Partial<PlayerView>): PlayerView {
  return {
    seat: 0,
    hp: 100,
    gold: 10,
    level: 1,
    xp: 0,
    streak: 0,
    bench: new Array<OwnedUnit | null>(PLAYER.benchSize).fill(null),
    board: new Array<OwnedUnit | null>(28).fill(null),
    shop: [],
    shopLocked: false,
    items: [],
    gifts: [],
    giftOffer: null,
    giftRerolled: false,
    freeRerolls: 0,
    recentOpponents: [],
    placement: null,
    ...over,
  };
}

describe('the HUD', () => {
  it('shows XP only once it counts, and not at the top level', () => {
    expect(hudStats(player({ level: XP.buyFromLevel - 1 })).xp).toBeNull();
    expect(hudStats(player({ level: 4, xp: 3 })).xp).toEqual({ have: 3, need: XP.toLevel[5] });
    expect(hudStats(player({ level: PLAYER.maxLevel }))).toMatchObject({ xp: null, topLevel: true });
  });

  it('draws attention to the board only when it has room and the bench a unit', () => {
    const board = new Array<OwnedUnit | null>(28).fill(null);
    board[3] = unit;
    const bench = [unit, ...new Array<OwnedUnit | null>(PLAYER.benchSize - 1).fill(null)];
    expect(hudStats(player({ level: 2, board, bench })).board).toEqual({ fielded: 1, max: 2, room: true });
    expect(hudStats(player({ level: 2, board })).board.room).toBe(false);
    expect(hudStats(player({ level: 1, board, bench })).board.room).toBe(false);
  });

  it('never shows HP below 0', () => {
    expect([hudStats(player({ hp: -4 })).hp, hudStats(player({ hp: 37 })).hp]).toEqual([0, 37]);
  });

  it('reads streaks both ways', () => {
    expect([streakOf(0), streakOf(3), streakOf(-2)]).toEqual([null, { kind: 'win', length: 3 }, { kind: 'loss', length: 2 }]);
  });

  it('makes the timer urgent in its last seconds', () => {
    expect(timerView(null, null)).toBeNull();
    expect(timerView(URGENT_SECONDS + 1, 0.5)).toEqual({ seconds: URGENT_SECONDS + 1, fraction: 0.5, urgent: false });
    expect(timerView(URGENT_SECONDS, null)).toEqual({ seconds: URGENT_SECONDS, fraction: 1, urgent: true });
  });

  it("shows the One Ring's tier and whether it is worn", () => {
    expect(ringStatus(null)).toBeNull();
    expect(ringStatus({ bearer: null, corruption: 7 })).toEqual({ corruption: 7, tier: 'Grip', unworn: true });
    expect(ringStatus({ bearer: 4, corruption: 1 })).toEqual({ corruption: 1, tier: 'Gift', unworn: false });
  });
});
