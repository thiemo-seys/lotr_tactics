import { describe, expect, it } from 'vitest';
import { POOL_COPIES } from '../src/data/economy.js';
import { PVE_ROUNDS } from '../src/data/pve.js';
import { UNITS, type UnitId } from '../src/data/units.js';
import { createGame, type Action, type Game, type RoundReport } from '../src/game/game.js';
import type { Player } from '../src/game/player.js';
import { UNIT_IDS, copiesIn, type Pool } from '../src/game/pool.js';
import { createRng, randomInt } from '../src/rng.js';
import type { Star } from '../src/types.js';

const player = (game: Game, seat: number) => game.state.players[seat] as Player;
const pool = (game: Game) => game.state.pool as Pool;

/** Advances until the given round's planning starts. */
function skipTo(game: Game, stage: number, round: number): void {
  while (!(game.state.stage === stage && game.state.round === round && game.state.phase === 'planning')) game.advance();
}

/** Empties a player's bench, board and shop into the pool. */
function clear(game: Game, seat: number): void {
  player(game, seat).returnEverything();
}

/** Gives a player a unit on the board, taking its copies from the pool. */
function field(game: Game, seat: number, unitId: UnitId, col: number, row: number, star: Star = 1): void {
  pool(game).take(unitId, copiesIn(star));
  player(game, seat).board[row * 7 + col] = { id: 1000 + col + row * 7, unitId, star };
}

/** Copies of each unit anywhere: pool, shops, Council options and owned units. */
function copies(game: Game): Map<UnitId, number> {
  const total = new Map(UNIT_IDS.map((id) => [id, game.state.pool.count(id)]));
  const add = (id: UnitId, n: number) => total.set(id, total.get(id)! + n);
  for (const p of game.state.players) {
    for (const id of p.shop) if (id !== null) add(id, 1);
    for (const unit of [...p.bench, ...p.board]) if (unit !== null) add(unit.unitId, copiesIn(unit.star));
  }
  for (const option of game.state.council?.options ?? []) if (option.pickedBy === null) add(option.unitId, 1);
  return total;
}

const STARTING_COPIES = new Map(UNIT_IDS.map((id) => [id, POOL_COPIES[UNITS[id].cost]]));

/** Plays a game to the end with random actions, returning every round report. */
function playRandomly(game: Game, seed: number, check?: () => void): RoundReport[] {
  const rng = createRng(seed);
  const reports: RoundReport[] = [];
  const place = () => (randomInt(rng, 2) ? { bench: randomInt(rng, 9) } : { col: randomInt(rng, 7), row: randomInt(rng, 4) });
  while (!game.isOver()) {
    if (game.state.phase === 'planning') {
      for (const p of game.state.players) {
        if (p.placement !== null) continue;
        for (let i = 0; i < 8; i++) {
          const actions: Action[] = [
            { type: 'buy', slot: randomInt(rng, 5) },
            { type: 'buy', slot: randomInt(rng, 5) },
            { type: 'move', from: place(), to: place() },
            ...(p.gold > 20 ? [{ type: 'reroll' } as const, { type: 'buyXp' } as const] : []),
            ...(randomInt(rng, 10) === 0 ? [{ type: 'sell', from: place() } as const] : []),
          ];
          game.act(p.seat, actions[randomInt(rng, actions.length)]!);
        }
      }
      check?.();
      reports.push(game.advance()!);
    } else {
      if (randomInt(rng, 2) === 0) {
        const council = game.state.council!;
        for (const seat of council.groups[council.group]!) game.act(seat, { type: 'pick', option: randomInt(rng, 9) });
      }
      check?.();
      if (game.state.phase === 'council') game.advance();
    }
  }
  return reports;
}

describe('createGame', () => {
  it('refuses a seed that is not an integer or a player count outside 2–8', () => {
    expect(() => createGame({ seed: 1.5, players: 8 })).toThrow();
    expect(() => createGame({ seed: 1, players: 1 })).toThrow();
    expect(() => createGame({ seed: 1, players: 9 })).toThrow();
  });

  it('starts at 1-1 with the Council, everyone at 100 HP with nothing', () => {
    const game = createGame({ seed: 1, players: 8 });
    expect([game.state.stage, game.state.round, game.state.type, game.state.phase]).toEqual([1, 1, 'council', 'council']);
    expect(game.state.council!.groups).toEqual([[0, 1, 2, 3, 4, 5, 6, 7]]);
    expect(game.state.council!.options).toHaveLength(9);
    for (const p of game.state.players) {
      expect([p.hp, p.gold, p.level, p.xp, p.streak]).toEqual([100, 0, 1, 0, 0]);
      expect(p.shop.every((id) => id === null)).toBe(true);
    }
    expect(copies(game)).toEqual(STARTING_COPIES);
  });
});

describe('the first Council', () => {
  it('lets anyone pick an option still there, once', () => {
    const game = createGame({ seed: 2, players: 8 });
    const option = game.state.council!.options[0]!;
    expect(game.act(0, { type: 'pick', option: 0 })).toEqual({ ok: true });
    expect(game.act(0, { type: 'pick', option: 1 }).ok).toBe(false);
    expect(game.act(1, { type: 'pick', option: 0 }).ok).toBe(false);
    expect(game.act(1, { type: 'pick', option: 9 }).ok).toBe(false);
    expect(game.act(1, { type: 'buy', slot: 0 }).ok).toBe(false);
    expect(player(game, 0).bench[0]).toMatchObject({ unitId: option.unitId, star: 1 });
    expect(player(game, 0).items).toEqual([option.component]);
  });

  it('gives random options to those who haven, t picked when time is up, then starts 1-2', () => {
    const game = createGame({ seed: 3, players: 8 });
    game.act(5, { type: 'pick', option: 4 });
    expect(game.advance()).toBeNull();
    expect([game.state.stage, game.state.round, game.state.phase]).toEqual([1, 2, 'planning']);
    expect(game.state.council).toBeNull();
    for (const p of game.state.players) {
      expect(p.bench.filter((u) => u !== null)).toHaveLength(1);
      expect(p.items).toHaveLength(1);
      expect([p.level, p.gold]).toEqual([2, 2]);
      expect(p.shop.every((id) => id !== null && UNITS[id].cost === 1)).toBe(true);
    }
    expect(copies(game)).toEqual(STARTING_COPIES);
  });

  it('ends as soon as everyone has picked', () => {
    const game = createGame({ seed: 4, players: 2 });
    game.act(0, { type: 'pick', option: 0 });
    game.act(1, { type: 'pick', option: 1 });
    expect([game.state.round, game.state.phase]).toEqual([2, 'planning']);
  });
});

describe('stage 1', () => {
  it('fights the PvE boards, gives loot, income and levels, and reaches level 3 at 2-1', () => {
    const game = createGame({ seed: 5, players: 8 });
    game.advance();
    const report = game.advance()!;
    expect([report.stage, report.round]).toEqual([1, 2]);
    expect(report.fights).toHaveLength(8);
    for (const [seat, fight] of report.fights.entries()) {
      expect(fight).toMatchObject({ kind: 'pve', home: seat, away: null });
      expect(fight.input.teams.B.map((u) => u.unitId)).toEqual(PVE_ROUNDS['1-2'].monsters.map((m) => m.unitId));
      // The Council unit was moved to the board before the fight.
      expect(fight.input.teams.A).toHaveLength(1);
    }
    for (const p of game.state.players) expect(p.items).toHaveLength(2);
    skipTo(game, 2, 1);
    for (const p of game.state.players) {
      // 2 + 2 + 3 base income, 2 gold of loot at 1-4, then 4 at 2-1, and no interest below 10.
      expect([p.level, p.xp, p.gold]).toEqual([3, 2, 13]);
      expect(p.items).toHaveLength(4);
    }
  });

  it('keeps a locked shop', () => {
    const game = createGame({ seed: 6, players: 3 });
    game.advance();
    game.act(0, { type: 'lock', locked: true });
    const locked = [...game.state.players[0]!.shop];
    const other = [...game.state.players[1]!.shop];
    game.advance();
    expect(game.state.players[0]!.shop).toEqual(locked);
    expect(game.state.players[1]!.shop).not.toEqual(other);
  });
});

describe('PvP rounds', () => {
  it('pair every player, record opponents and streaks, and pay win gold', () => {
    const game = createGame({ seed: 7, players: 8 });
    skipTo(game, 2, 1);
    const gold = game.state.players.map((p) => p.gold);
    const report = game.advance()!;
    expect(report.fights).toHaveLength(4);
    expect(report.fights.flatMap((f) => [f.home, f.away]).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const fight of report.fights) {
      const [home, away] = [player(game, fight.home), player(game, fight.away!)];
      expect(home.recentOpponents).toEqual([away.seat]);
      expect(away.recentOpponents).toEqual([home.seat]);
      const outcome = fight.result.outcome;
      expect(home.streak).toBe(outcome === 'A' ? 1 : -1);
      expect(away.streak).toBe(outcome === 'B' ? 1 : -1);
      // The next round's income is already in: interest on the gold held, then 5.
      const after = (seat: number, won: boolean) => {
        const held = gold[seat]! + (won ? 1 : 0);
        return held + Math.min(5, Math.floor(held / 10)) + 5;
      };
      expect(home.gold).toBe(after(home.seat, outcome === 'A'));
      expect(away.gold).toBe(after(away.seat, outcome === 'B'));
    }
  });

  it('deal stage damage plus the survivors to the loser', () => {
    const game = createGame({ seed: 8, players: 2 });
    skipTo(game, 2, 1);
    clear(game, 0);
    clear(game, 1);
    field(game, 0, 'gimli', 3, 3, 2);
    field(game, 0, 'legolas', 3, 0, 1);
    const hp = player(game, 1).hp;
    const report = game.advance()!;
    expect(report.fights[0]!.result.outcome).toBe(report.fights[0]!.home === 0 ? 'A' : 'B');
    // Stage 2 deals 2, plus 2 for the 2★ Gimli and 1 for Legolas.
    expect(report.damage).toEqual([{ seat: 1, amount: 2 + 2 + 1 }]);
    expect(player(game, 1).hp).toBe(hp - 5);
  });

  it('hurt both players in a draw, as a loss', () => {
    const game = createGame({ seed: 9, players: 2 });
    skipTo(game, 2, 1);
    const hp = game.state.players.map((p) => p.hp);
    clear(game, 0);
    clear(game, 1);
    const report = game.advance()!;
    expect(report.fights[0]!.result.outcome).toBe('draw');
    expect(report.damage).toEqual([
      { seat: 0, amount: 2 },
      { seat: 1, amount: 2 },
    ]);
    expect(game.state.players.map((p) => p.hp)).toEqual([hp[0]! - 2, hp[1]! - 2]);
    expect(game.state.players.map((p) => p.streak)).toEqual([-1, -1]);
  });

  it('give one player a ghost with an odd count, whose owner takes no damage from it', () => {
    const game = createGame({ seed: 10, players: 3 });
    skipTo(game, 2, 1);
    const hp = game.state.players.map((p) => p.hp);
    for (const seat of [0, 1, 2]) clear(game, seat);
    const report = game.advance()!;
    expect(report.fights.map((f) => f.kind)).toEqual(['pvp', 'ghost']);
    const ghost = report.fights[1]!;
    expect(player(game, ghost.away!).recentOpponents).not.toContain(ghost.home);
    // Every fight is a draw between empty boards, and each player fought once.
    expect(game.state.players.map((p) => p.hp)).toEqual(hp.map((h) => h! - 2));
  });
});

describe('eliminations', () => {
  it('place the loser and end the game when one player is left', () => {
    const game = createGame({ seed: 11, players: 2 });
    skipTo(game, 2, 1);
    clear(game, 0);
    clear(game, 1);
    field(game, 0, 'gimli', 3, 3);
    player(game, 1).hp = 1;
    const report = game.advance()!;
    expect(report.eliminated).toEqual([1]);
    expect(game.state.players.map((p) => p.placement)).toEqual([1, 2]);
    expect(game.isOver()).toBe(true);
    expect(game.state.phase).toBe('over');
    expect(() => game.advance()).toThrow();
    expect(game.act(0, { type: 'reroll' }).ok).toBe(false);
  });

  it('order players knocked out together by their HP, and return their units to the pool', () => {
    const game = createGame({ seed: 12, players: 4 });
    skipTo(game, 2, 1);
    for (const seat of [0, 1, 2, 3]) clear(game, seat);
    for (const seat of [0, 1, 2, 3]) player(game, seat).rollShop();
    for (const [seat, hp] of [[0, 1], [1, 2], [2, 1], [3, 50]] as const) player(game, seat).hp = hp;
    const report = game.advance()!;
    // Every fight is a draw between empty boards, so everyone takes 2: 0, 1 and 2 are out
    // together, and 1 has the most HP left. 0 and 2 tie, so the seed orders them.
    expect(report.eliminated).toHaveLength(3);
    expect(report.eliminated[0]).toBe(1);
    expect(player(game, 1).placement).toBe(2);
    expect([player(game, 0).placement, player(game, 2).placement].sort()).toEqual([3, 4]);
    expect(player(game, 3).placement).toBe(1);
    expect(game.isOver()).toBe(true);
    expect(game.state.players[0]!.shop.every((id) => id === null)).toBe(true);
    expect(copies(game)).toEqual(STARTING_COPIES);
  });

  it("refuse actions from players who are out, and leave them out of later rounds", () => {
    const game = createGame({ seed: 13, players: 3 });
    skipTo(game, 2, 1);
    player(game, 2).hp = 1;
    clear(game, 2);
    field(game, 0, 'gimli', 3, 3, 3);
    field(game, 1, 'dain', 3, 3, 3);
    game.advance();
    expect(player(game, 2).placement).toBe(3);
    expect(game.act(2, { type: 'reroll' })).toEqual({ ok: false, reason: 'That player is out of the game.' });
    const report = game.advance()!;
    expect(report.fights.flatMap((f) => [f.home, f.away])).not.toContain(2);
  });
});

describe('later Councils', () => {
  it('let players pick in pairs, lowest HP first', () => {
    const game = createGame({ seed: 14, players: 4 });
    skipTo(game, 2, 3);
    for (const [seat, hp] of [[0, 90], [1, 30], [2, 60], [3, 10]] as const) player(game, seat).hp = hp;
    for (const seat of [0, 1, 2, 3]) clear(game, seat);
    for (const seat of [0, 1, 2, 3]) field(game, seat, 'sam', 3, 3);
    game.advance();
    expect([game.state.round, game.state.phase]).toEqual([4, 'council']);
    const hp = game.state.players.map((p) => p.hp);
    const byHp = [0, 1, 2, 3].sort((a, b) => hp[a]! - hp[b]! || 0);
    const { groups } = game.state.council!;
    expect(groups.map((g) => g.length)).toEqual([2, 2]);
    expect(new Set(groups[0])).toEqual(new Set(byHp.slice(0, 2)));
    const [later] = groups[1]!;
    expect(game.act(later!, { type: 'pick', option: 0 })).toEqual({ ok: false, reason: "It isn't your turn to pick." });
    for (const seat of groups[0]!) expect(game.act(seat, { type: 'pick', option: seat }).ok).toBe(true);
    expect(game.state.council!.group).toBe(1);
    expect(game.advance()).toBeNull();
    expect([game.state.round, game.state.phase]).toEqual([5, 'planning']);
    expect(copies(game)).toEqual(STARTING_COPIES);
  });

  it('sell a picked unit that has no room', () => {
    const game = createGame({ seed: 15, players: 2 });
    skipTo(game, 2, 3);
    game.advance();
    const option = game.state.council!.options[0]!;
    const filler = UNIT_IDS.filter((id) => id !== option.unitId).slice(0, 9);
    clear(game, 0);
    filler.forEach((id, slot) => {
      pool(game).take(id);
      player(game, 0).bench[slot] = { id: 2000 + slot, unitId: id, star: 1 };
    });
    const before = game.state.players[0]!.gold;
    const groups = game.state.council!.groups;
    // Let the other player pick first if they are ahead in the order.
    if (groups[0]!.includes(1) && !groups[0]!.includes(0)) game.act(1, { type: 'pick', option: 1 });
    expect(game.act(0, { type: 'pick', option: 0 }).ok).toBe(true);
    expect(player(game, 0).gold).toBe(before + UNITS[option.unitId].cost);
    expect(player(game, 0).items).toContain(option.component);
    expect(copies(game)).toEqual(STARTING_COPIES);
  });
});

describe('whole games', () => {
  it('conserve copies and give out every place once', () => {
    const game = createGame({ seed: 21, players: 8 });
    playRandomly(game, 1, () => expect(copies(game)).toEqual(STARTING_COPIES));
    expect(game.state.players.map((p) => p.placement).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(copies(game)).toEqual(STARTING_COPIES);
  });

  it('are the same for the same seed and the same calls', () => {
    const play = (seed: number) => JSON.stringify(playRandomly(createGame({ seed, players: 5 }), 3));
    expect(play(30)).toBe(play(30));
    expect(play(30)).not.toBe(play(31));
  });
});
