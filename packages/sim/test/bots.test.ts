import { describe, expect, it } from 'vitest';
import { Bot, playBotGame } from '../src/bots/bot.js';
import { UNITS } from '../src/data/units.js';
import { createGame, type Game } from '../src/game/game.js';
import type { Player } from '../src/game/player.js';
import { copiesIn, type Pool } from '../src/game/pool.js';

/** Plays bots until the given round's planning starts, without letting them plan it. */
function botsUntil(seed: number, stage: number, round: number, players = 8): { game: Game; bots: Bot[] } {
  const game = createGame({ seed, players });
  const bots = Array.from({ length: players }, (_, seat) => new Bot(seat, seed));
  while (!(game.state.stage === stage && game.state.round === round && game.state.phase === 'planning')) {
    if (game.state.phase === 'council') {
      for (const bot of bots) bot.pick(game);
      if (game.state.phase === 'council') game.advance();
    } else {
      for (const bot of bots) bot.plan(game);
      game.advance();
    }
  }
  return { game, bots };
}

/** The board's units with their rows. */
function boardRows(game: Game, seat: number) {
  return game.state.players[seat]!.board.flatMap((u, i) => (u === null ? [] : [{ unit: u, row: Math.floor(i / 7) }]));
}

describe('bots', () => {
  it('play a whole 8-player game, giving out every place once, ending around stage 6', () => {
    const { game, reports } = playBotGame(1);
    expect(game.isOver()).toBe(true);
    expect(game.state.players.map((p) => p.placement).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const last = reports.at(-1)!;
    expect(last.stage).toBeGreaterThanOrEqual(4);
    expect(last.stage).toBeLessThanOrEqual(8);
  });

  it('play the same game for the same seed', () => {
    const summary = (seed: number) =>
      playBotGame(seed, 6).reports.map((r) => r.fights.map((f) => `${f.home}-${f.away}:${f.result.outcome}@${f.result.finalTick}`).join(','));
    expect(summary(3)).toEqual(summary(3));
    expect(summary(3)).not.toEqual(summary(4));
  });

  it('show the state to a watcher once a round, after planning and before the fights', () => {
    const watched: string[] = [];
    const { reports } = playBotGame(1, 8, (state) => {
      expect(state.phase).toBe('planning');
      watched.push(`${state.stage}-${state.round}`);
    });
    expect(watched).toEqual(reports.map((r) => `${r.stage}-${r.round}`));
  });

  it('level towards their target and fill the board up to their level', () => {
    const { game, bots } = botsUntil(5, 2, 1);
    for (const bot of bots) bot.plan(game);
    for (const p of game.state.players) {
      expect(p.level).toBe(4);
      const owned = [...p.bench, ...p.board].filter((u) => u !== null).length;
      expect(boardRows(game, p.seat)).toHaveLength(Math.min(p.level, owned));
    }
  });

  it('put Guardians at the front and Archers and Sorcerers at the back', () => {
    const { game, bots } = botsUntil(6, 2, 1, 2);
    const me = game.state.players[0] as Player;
    const pool = game.state.pool as Pool;
    me.returnEverything();
    me.level = 4;
    for (const [slot, id] of (['legolas', 'gimli', 'saruman', 'aragorn'] as const).entries()) {
      pool.take(id, copiesIn(1));
      me.bench[slot] = { id: 500 + slot, unitId: id, star: 1, items: [] };
    }
    bots[0]!.plan(game);
    const rowOf = (id: string) => boardRows(game, 0).find((b) => b.unit.unitId === id)?.row;
    expect(rowOf('gimli')).toBe(3);
    expect(rowOf('aragorn')).toBe(2);
    expect(rowOf('legolas')).toBe(0);
    expect(rowOf('saruman')).toBe(0);
  });

  it('give items to their attacker, caster and tank by role', () => {
    const { game, bots } = botsUntil(6, 2, 1, 2);
    const me = game.state.players[0] as Player;
    const pool = game.state.pool as Pool;
    me.returnEverything();
    me.level = 4;
    for (const [slot, id] of (['legolas', 'gimli', 'saruman', 'aragorn'] as const).entries()) {
      pool.take(id, copiesIn(1));
      me.bench[slot] = { id: 500 + slot, unitId: id, star: 1, items: [] };
    }
    me.items.push('blade', 'staff', 'mail', 'bow', 'cloak', 'phial', 'ent-draught', 'mail');
    bots[0]!.plan(game);
    const itemsOf = (id: string) => boardRows(game, 0).find((b) => b.unit.unitId === id)!.unit.items;
    // With Captain as a focus trait, Aragorn is the strongest attacker.
    expect(bots[0]!.focus).toContain('captain');
    expect(itemsOf('aragorn')).toEqual(['black-arrow']);
    // A combined item goes by its first component: the Phial (Cloak + Staff) to the tank.
    expect(itemsOf('gimli')).toEqual(['mithril-shirt', 'phial', 'ent-draught']);
    // The tank is full, so the last Mail goes to the strongest unit that can take it: Saruman,
    // where it completes his Staff.
    expect(itemsOf('saruman')).toEqual(['star-of-elendil']);
    expect(itemsOf('legolas')).toEqual([]);
    expect(me.items).toEqual([]);
  });

  it('use items in whole games', () => {
    const { reports } = playBotGame(2);
    const last = reports.at(-1)!;
    expect(last.fights.some((f) => f.input.teams.A.some((u) => u.items.length > 0))).toBe(true);
  });

  it('keep bench slots free', () => {
    const { game, bots } = botsUntil(7, 3, 2);
    for (const bot of bots) bot.plan(game);
    for (const p of game.state.players) {
      if (p.placement === null) expect(p.bench.filter((u) => u === null).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('pick the Council option that completes a merge', () => {
    const game = createGame({ seed: 8, players: 2 });
    const option = game.state.council!.options[4]!;
    const me = game.state.players[0] as Player;
    const pool = game.state.pool as Pool;
    for (const slot of [0, 1]) {
      pool.take(option.unitId);
      me.bench[slot] = { id: 600 + slot, unitId: option.unitId, star: 1, items: [] };
    }
    // Make sure no earlier option is the same unit, so the choice is clear.
    const firstSame = game.state.council!.options.findIndex((o) => o.unitId === option.unitId);
    new Bot(0, 8).pick(game);
    expect(game.state.council!.options[firstSame]!.pickedBy).toBe(0);
    expect(me.bench.find((u) => u?.unitId === option.unitId)!.star).toBe(2);
    expect(UNITS[option.unitId]).toBeDefined();
  });

  it('play a whole game in well under 2 seconds', () => {
    const start = Date.now();
    for (let seed = 10; seed < 13; seed++) playBotGame(seed);
    expect((Date.now() - start) / 3).toBeLessThan(2000);
  });
});
