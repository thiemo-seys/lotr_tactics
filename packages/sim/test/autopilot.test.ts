// Bots driving a game, and the game's turn counter (docs/game-spec.md section 11).

import { describe, expect, it, vi } from 'vitest';
import { Autopilot } from '../src/bots/autopilot.js';
import { createGame } from '../src/game/game.js';
import { skipTo } from './fixtures.js';

describe('the turn counter', () => {
  it('goes up at each Council group, each planning and the end, and not for actions', () => {
    const game = createGame({ seed: 3, players: 4 });
    expect(game.state.turn).toBe(1);
    // The first Council is one group of everyone: picking for all four moves on to planning.
    game.advance();
    expect([game.state.phase, game.state.turn]).toEqual(['planning', 2]);
    game.act(0, { type: 'lock', locked: true });
    expect(game.state.turn).toBe(2);
    skipTo(game, 2, 4);
    const turn = game.state.turn;
    const groups = game.state.council!.groups.length;
    for (let group = 1; group < groups; group++) {
      game.advance();
      expect([game.state.council!.group, game.state.turn]).toEqual([group, turn + group]);
    }
    game.advance();
    expect([game.state.phase, game.state.turn]).toEqual(['planning', turn + groups]);
    while (!game.isOver()) {
      const before = game.state.turn;
      game.advance();
      // A Council group, a new round, or the end of the game: one more turn each time.
      expect(game.state.turn).toBe(before + 1);
    }
    expect(game.state.phase).toBe('over');
  });
});

describe('the autopilot', () => {
  it("says whether the bots' picks ended the Council turn", () => {
    const game = createGame({ seed: 4, players: 4 });
    const autopilot = new Autopilot(game, 4);
    expect(autopilot.pick((seat) => seat !== 2)).toBe(false);
    expect(game.state.council!.options.filter((o) => o.pickedBy !== null)).toHaveLength(3);
    expect(autopilot.pick()).toBe(true);
    expect(game.state.phase).toBe('planning');
  });

  it('plans starting one seat later each round, for the seats it plays', () => {
    const game = createGame({ seed: 5, players: 4 });
    const autopilot = new Autopilot(game, 5);
    const order: number[] = [];
    autopilot.bots.forEach((bot, seat) => vi.spyOn(bot, 'plan').mockImplementation(() => void order.push(seat)));
    autopilot.plan();
    autopilot.plan((seat) => seat !== 3);
    expect(order).toEqual([1, 2, 3, 0, 2, 0, 1]);
  });

  it('plays on until told to stop, returning the rounds fought', () => {
    const game = createGame({ seed: 6, players: 4 });
    const reports = new Autopilot(game, 6).playUntil(() => game.state.stage === 2 && game.state.round === 2);
    expect([game.state.stage, game.state.round, game.state.phase]).toEqual([2, 2, 'planning']);
    // 1-2, 1-3, 1-4 and 2-1.
    expect(reports.map((r) => `${r.stage}-${r.round}`)).toEqual(['1-2', '1-3', '1-4', '2-1']);
  });
});
