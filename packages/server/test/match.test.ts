import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '@lotr-tactics/sim';
import { TIMERS } from '../src/config.js';
import { last, testMatch, timeOut, type TestMatch } from './helpers.js';

function freeOption(t: TestMatch): number {
  return t.match.game.state.council!.options.findIndex((o) => o.pickedBy === null);
}

/** Picks for the person in seat 0 and returns the match at 1-2 planning. */
function toPlanning(seed: number, people = [0]): TestMatch {
  const t = testMatch(seed, people);
  for (const seat of people) expect(t.match.act(seat, { type: 'pick', option: freeOption(t) }).ok).toBe(true);
  expect(t.match.stepKind).toBe('planning');
  return t;
}

describe('Match steps', () => {
  it('starts at the first Council with the bots picked and a timer for the people', () => {
    const t = testMatch(1, [0]);
    const view = last(t.inbox[0]!, 'state')!.state;
    expect(view.step).toEqual({ kind: 'council', ms: TIMERS.councilPick * 1000 });
    expect(view.council!.options.filter((o) => o.pickedBy !== null)).toHaveLength(7);
    expect(view.council!.options.some((o) => o.pickedBy === 0)).toBe(false);
    // Bots get no messages.
    expect(t.inbox[1]).toEqual([]);
  });

  it('moves on to planning once the people pick, with the bots having planned', () => {
    const t = toPlanning(2);
    const view = last(t.inbox[0]!, 'state')!.state;
    expect([view.stage, view.round, view.step]).toEqual([1, 2, { kind: 'planning', ms: TIMERS.planning * 1000 }]);
    // Bots buy a unit at 1-2 with their 2 gold; the person still has theirs.
    for (const p of t.match.game.state.players.slice(1)) expect(p.gold).toBeLessThan(2);
    expect(view.me.gold).toBe(2);
  });

  it('picks for a person whose Council time runs out', () => {
    const t = testMatch(3, [0]);
    t.host.wait(TIMERS.councilPick - 1);
    t.match.update();
    expect(t.match.stepKind).toBe('council');
    t.host.wait(1);
    t.match.update();
    expect(t.match.stepKind).toBe('planning');
    expect(t.match.game.state.players[0]!.items).toHaveLength(1);
  });

  it('runs the fights when planning ends, then waits for the longest fight and the results', () => {
    const t = toPlanning(4);
    t.host.wait(TIMERS.planning);
    t.match.update();
    expect(t.match.stepKind).toBe('fight');
    const round = last(t.inbox[0]!, 'round')!.round;
    expect([round.stage, round.round]).toEqual([1, 2]);
    // The round comes just before the fight step's state.
    expect(t.inbox[0]!.at(-1)!.type).toBe('state');
    const longest = Math.max(...round.fights.map((f) => f.result.finalTick)) / TICKS_PER_SECOND;
    const seconds = longest + TIMERS.fightHold + TIMERS.results + TIMERS.slack;
    const ms = Math.ceil(seconds * 1000);
    expect(t.match.view(0).step.ms).toBe(ms);
    t.host.wait((ms - 1) / 1000);
    t.match.update();
    expect(t.match.stepKind).toBe('fight');
    t.host.wait(0.001);
    t.match.update();
    expect([t.match.stepKind, t.match.game.state.stage, t.match.game.state.round]).toEqual(['planning', 1, 3]);
  });

  it('refuses actions during a fight step', () => {
    const t = toPlanning(5);
    timeOut(t);
    expect(t.match.stepKind).toBe('fight');
    const gold = t.match.game.state.players[0]!.gold;
    expect(t.match.act(0, { type: 'reroll' })).toEqual({ ok: false, reason: 'Wait for the fights to finish.' });
    expect(t.match.game.state.players[0]!.gold).toBe(gold);
  });

  it('refuses Ready in a Council', () => {
    const t = testMatch(6, [0]);
    expect(t.match.ready(0).ok).toBe(false);
  });
});

describe('Ready votes', () => {
  it('gives planning more time while a person has a Gift offer', () => {
    const t = testMatch(25, [0]);
    while (!(t.match.game.state.stage === 2 && t.match.stepKind === 'planning')) timeOut(t);
    expect(t.match.view(0).step.ms).toBe((TIMERS.planning + TIMERS.giftOffer) * 1000);
    expect(t.match.act(0, { type: 'gift', option: 0 }).ok).toBe(true);
    timeOut(t);
    timeOut(t);
    expect([t.match.game.state.round, t.match.stepKind]).toEqual([2, 'planning']);
    expect(t.match.view(0).step.ms).toBe(TIMERS.planning * 1000);
  });

  it('ends planning once every connected person is Ready', () => {
    const t = toPlanning(7, [0, 3]);
    expect(t.match.ready(0).ok).toBe(true);
    expect(t.match.stepKind).toBe('planning');
    expect(last(t.inbox[3]!, 'state')!.state.ready).toEqual([0]);
    t.match.ready(3);
    expect(t.match.stepKind).toBe('fight');
    // Ready resets for the fight step, where it means "finished watching".
    expect(t.match.view(0).ready).toEqual([]);
    t.match.ready(0);
    t.match.ready(3);
    expect(t.match.stepKind).toBe('planning');
  });

  it("doesn't wait for people who are disconnected", () => {
    const t = toPlanning(8, [0, 3]);
    t.match.ready(0);
    t.match.setConnected(3, false);
    expect(t.match.stepKind).toBe('fight');
  });

  it('runs on its timers when nobody is connected', () => {
    const t = toPlanning(9);
    t.match.setConnected(0, false);
    expect(t.match.stepKind).toBe('planning');
    t.host.wait(TIMERS.planning);
    t.match.update();
    expect(t.match.stepKind).toBe('fight');
  });
});

describe('Seats', () => {
  it("plays a disconnected person's seat with its bot, until they rejoin", () => {
    const t = toPlanning(10);
    expect(t.match.game.state.players[0]!.gold).toBe(2);
    t.match.setConnected(0, false);
    // The bot plans at once: it buys a unit with the seat's 2 gold.
    expect(t.match.game.state.players[0]!.gold).toBeLessThan(2);
    t.inbox[0]!.length = 0;
    timeOut(t);
    expect(t.inbox[0]).toEqual([]);
    t.match.setConnected(0, true);
    // Rejoining mid-fight sends the round, then the state.
    expect(t.inbox[0]!.map((m) => m.type)).toEqual(['round', 'state']);
    // The game is already at 1-3 with its income paid; the bot leaves the seat alone from now on.
    const before = JSON.stringify(t.match.view(0).me);
    timeOut(t);
    expect(t.match.stepKind).toBe('planning');
    expect(JSON.stringify(t.match.view(0).me)).toBe(before);
  });

  it('lets the bot pick for a person who disconnects in their Council turn', () => {
    const t = testMatch(11, [0]);
    t.match.setConnected(0, false);
    expect(t.match.stepKind).toBe('planning');
    // The bot picked, then planned at once, which can give the component to the unit.
    const p = t.match.game.state.players[0]!;
    const held = [...p.bench, ...p.board].flatMap((u) => u?.items ?? []);
    expect([...p.items, ...held]).toHaveLength(1);
  });

  it('plays the rest of the game at once when the last person leaves', () => {
    const t = toPlanning(12);
    t.match.leave(0);
    expect(t.match.isOver()).toBe(true);
    const places = t.match.game.state.players.map((p) => p.placement).sort();
    expect(places).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('plays to the end with a person who never does anything but say Ready', () => {
    const t = testMatch(13, [0]);
    let steps = 0;
    while (!t.match.isOver() && steps++ < 500) {
      if (t.match.stepKind === 'council') timeOut(t);
      else if (t.match.game.state.players[0]!.placement === null) t.match.ready(0);
      // Out of the game, the person watches their last fight on the timer.
      else timeOut(t);
    }
    expect(t.match.isOver()).toBe(true);
    const over = last(t.inbox[0]!, 'state')!.state;
    expect(over.step).toEqual({ kind: 'over', ms: null });
    expect(over.players.map((p) => p.placement).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('is the same for the same seed and the same actions', () => {
    const play = () => {
      const t = toPlanning(14, [0, 5]);
      for (let i = 0; i < 12 && !t.match.isOver(); i++) {
        if (t.match.stepKind === 'planning') t.match.act(0, { type: 'buy', slot: 0 });
        timeOut(t);
      }
      return JSON.stringify(t.match.view(0));
    };
    expect(play()).toBe(play());
  });
});
