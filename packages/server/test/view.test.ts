import { describe, expect, it } from 'vitest';
import { simulateCombat } from '@lotr-tactics/sim';
import { last, testMatch, timeOut } from './helpers.js';

describe('views', () => {
  it("hide other players' shops, shop locks and XP, the pool and the seed", () => {
    const t = testMatch(21, [0, 2]);
    timeOut(t);
    const view = t.match.view(0);
    expect(view.me.shop).toHaveLength(5);
    expect(view.me).toHaveProperty('xp');
    for (const p of view.players) {
      expect(p).not.toHaveProperty('shop');
      expect(p).not.toHaveProperty('shopLocked');
      expect(p).not.toHaveProperty('xp');
    }
    expect(view.ring).toEqual({ state: 'waiting', holder: null, bearer: null, corruption: 0, hobbitFights: 0 });
    const json = JSON.stringify(view);
    expect(json).not.toContain('pool');
    expect(json).not.toContain('seed');
    // Each person gets their own view.
    expect(last(t.inbox[2]!, 'state')!.state.you).toBe(2);
  });

  it("hide other players' Gift offers", () => {
    const t = testMatch(24, [0]);
    while (!(t.match.game.state.stage === 2 && t.match.stepKind === 'planning')) timeOut(t);
    const view = t.match.view(0);
    expect(view.me.giftOffer).toHaveLength(3);
    expect(view.me.giftRerolled).toBe(false);
    for (const p of view.players) {
      expect(p).not.toHaveProperty('giftOffer');
      expect(p).not.toHaveProperty('giftRerolled');
      expect(p).toHaveProperty('gifts');
    }
    // The bots have already picked theirs.
    expect(view.players.filter((p) => p.seat !== 0).every((p) => p.gifts.length === 1)).toBe(true);
  });

  it("are copies that don't change as the game goes on", () => {
    const t = testMatch(22, [0]);
    const council = t.match.view(0);
    timeOut(t);
    expect(council.council!.options.some((o) => o.pickedBy === 0)).toBe(false);
    expect(council.me.bench.every((u) => u === null)).toBe(true);
    expect(t.match.view(0).me.bench.some((u) => u !== null)).toBe(true);
  });

  it('send rounds without events, and replaying a fight gives the recorded result', () => {
    const t = testMatch(23, [0]);
    timeOut(t);
    timeOut(t);
    const round = last(t.inbox[0]!, 'round')!.round;
    expect(round.fights.length).toBeGreaterThan(0);
    for (const fight of round.fights) {
      expect(fight.result).not.toHaveProperty('events');
      const replay = simulateCombat(fight.input);
      expect({ outcome: replay.outcome, survivors: replay.survivors, finalTick: replay.finalTick }).toEqual(fight.result);
    }
  });
});
