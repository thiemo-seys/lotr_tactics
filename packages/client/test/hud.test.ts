import { PLAYER, SHOP, XP, roundType, roundsInStage, type OwnedUnit, type PlayerView } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { URGENT_SECONDS, hudStats, ringStatus, shopOddsView, stageTrack, streakOf, timerView } from '../src/hud.js';

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

describe('the shop odds', () => {
  it("shows the level's odds and the next level's", () => {
    expect(shopOddsView(player({ level: 5 }))).toEqual({
      rows: [
        { label: '5', percents: SHOP.odds[4], now: true, trend: [null, null, null, null, null] },
        { label: '6', percents: SHOP.odds[5], now: false, trend: ['down', 'up', 'up', 'up', null] },
      ],
      note: null,
    });
  });

  it('leaves out the next level when its odds are the same', () => {
    expect(shopOddsView(player({ level: 1 })).rows).toHaveLength(1);
  });

  it('shows only the odds now at the top level', () => {
    expect(shopOddsView(player({ level: PLAYER.maxLevel })).rows).toEqual([{ label: `${PLAYER.maxLevel}`, percents: SHOP.odds[PLAYER.maxLevel - 1], now: true, trend: [null, null, null, null, null] }]);
  });

  it('shows the odds a Mirror of Galadriel gives, and says why', () => {
    const view = shopOddsView(player({ level: 5, gifts: ['mirror-of-galadriel'] }));
    expect(view.rows.map((r) => r.percents)).toEqual([SHOP.odds[5], SHOP.odds[6]]);
    expect(view.note).toBe('Mirror of Galadriel: your shop rolls with the odds of level 6.');
    // One level from the top, the Mirror already gives the top level's odds, so a level up changes nothing.
    expect(shopOddsView(player({ level: PLAYER.maxLevel - 1, gifts: ['mirror-of-galadriel'] })).rows).toHaveLength(1);
  });
});

describe('the stage tracker', () => {
  it('lists every round of the stage with its type, marking those played, the one on screen and those to come', () => {
    const track = stageTrack(2, 3, (stage, round) => (stage === 2 && round === 1 ? 'Victory' : round === 2 ? 'Defeat' : null));
    expect(track).toHaveLength(roundsInStage(2));
    expect(track.map((n) => n.type)).toEqual(track.map((n) => roundType(2, n.round)));
    expect(track.map((n) => n.state)).toEqual(['done', 'done', 'current', ...Array(track.length - 3).fill('next')]);
    expect(track.slice(0, 3).map((n) => n.outcome)).toEqual(['Victory', 'Defeat', null]);
  });

  it('never shows a result for a round to come', () => {
    expect(stageTrack(1, 1, () => 'Victory').slice(1).every((n) => n.outcome === null)).toBe(true);
  });
});
