// The One Ring in the game (docs/game-spec.md section 9.11).

import { describe, expect, it } from 'vitest';
import { Bot } from '../src/bots/bot.js';
import { RING } from '../src/data/ring.js';
import type { UnitId } from '../src/data/units.js';
import { createGame, type Game } from '../src/game/game.js';
import { boardSlot, placeOf } from '../src/game/places.js';
import type { Player } from '../src/game/player.js';
import { copiesIn, type Pool } from '../src/game/pool.js';
import type { Ring } from '../src/game/ring.js';
import type { Star } from '../src/types.js';

const player = (game: Game, seat: number) => game.state.players[seat] as Player;
const pool = (game: Game) => game.state.pool as Pool;
const ringOf = (game: Game) => game.state.ring as Ring;

/** Advances until the given round's planning or Council starts. */
function skipTo(game: Game, stage: number, round: number): void {
  while (!(game.state.stage === stage && game.state.round === round && game.state.phase !== 'over')) game.advance();
}

/** Ends planning, then plays through any Council, until the next planning. */
function nextPlanning(game: Game): void {
  game.advance();
  while (game.state.phase === 'council') game.advance();
}

let nextId = 5000;

/** Puts a unit on a player's board or bench, taking its copies from the pool. Returns its id. */
function field(game: Game, seat: number, unitId: UnitId, place: { col: number; row: number } | { bench: number }, star: Star = 1): number {
  pool(game).take(unitId, copiesIn(star));
  const id = nextId++;
  const unit = { id, unitId, star, items: [] };
  const p = player(game, seat);
  if ('bench' in place) p.bench[place.bench] = unit;
  else p.board[boardSlot(place)] = unit;
  return id;
}

/** Gives a player the Ring, borne by a unit. */
function hold(game: Game, seat: number, bearer: number | null, corruption = 0): Ring {
  const ring = ringOf(game);
  Object.assign(ring, { state: 'held', holder: seat, bearer, corruption });
  return ring;
}

describe('the One Ring arriving', () => {
  it('comes with Bilbo at the 3-4 Council, not before, and nobody is made to take it', () => {
    const game = createGame({ seed: 8, players: 2 });
    skipTo(game, 2, 4);
    expect(game.state.council!.options.some((o) => o.ring)).toBe(false);
    skipTo(game, 3, 4);
    const options = game.state.council!.options;
    const ring = options.at(-1)!;
    expect(ring).toMatchObject({ ring: true, item: null, unitId: 'bilbo' });
    expect(options.filter((o) => o.ring)).toHaveLength(1);
    expect(game.state.ring.state).toBe('offered');
    // Time runs out for every group: the Ring is never picked automatically, and waits.
    while (game.state.phase === 'council') game.advance();
    expect(ring.pickedBy).toBeNull();
    expect(game.state.ring.state).toBe('waiting');
    skipTo(game, 4, 4);
    expect(game.state.council!.options.at(-1)!.ring).toBe(true);
  });

  it('is held by whoever picks it, borne by their Bilbo', () => {
    const game = createGame({ seed: 8, players: 2 });
    skipTo(game, 3, 4);
    const council = game.state.council!;
    const seat = council.groups[0]![0]!;
    expect(game.act(seat, { type: 'pick', option: council.options.length - 1 }).ok).toBe(true);
    const ring = game.state.ring;
    expect([ring.state, ring.holder]).toEqual(['held', seat]);
    expect(ring.bearer).toBe(player(game, seat).firstOwned('bilbo')!.id);
  });
});

describe('Corruption', () => {
  it('rises each round the Ring has a bearer, every other round for a Hobbit', () => {
    const game = createGame({ seed: 9, players: 2 });
    skipTo(game, 2, 1);
    const gimli = field(game, 0, 'gimli', { col: 3, row: 3 });
    const ring = hold(game, 0, gimli);
    nextPlanning(game);
    expect(ring.corruption).toBe(1);
    ring.bearer = field(game, 0, 'frodo', { col: 2, row: 3 });
    nextPlanning(game);
    expect(ring.corruption).toBe(1);
    // The 2-4 Council doesn't count; 2-5 is Frodo's second round.
    nextPlanning(game);
    expect([game.state.round, ring.corruption]).toEqual([5, 2]);
    // Unworn with nobody on the board to take it, the Ring gains nothing.
    player(game, 0).returnEverything();
    ring.bearer = null;
    nextPlanning(game);
    expect([ring.bearer, ring.corruption]).toEqual([null, 2]);
  });

  it('consumes the bearer at 10: its copies return, its items go to the player, and the Ring waits with none', () => {
    const game = createGame({ seed: 9, players: 2 });
    skipTo(game, 2, 1);
    const gimli = field(game, 0, 'gimli', { col: 3, row: 3 });
    const slot = boardSlot({ col: 3, row: 3 });
    player(game, 0).board[slot] = { ...player(game, 0).board[slot]!, items: ['anduril'] };
    const before = pool(game).count('gimli');
    const ring = hold(game, 0, gimli, RING.consumedAt - 1);
    game.advance();
    expect(placeOf(player(game, 0), gimli)).toBeNull();
    expect(pool(game).count('gimli')).toBe(before + 1);
    expect(player(game, 0).items).toContain('anduril');
    expect([ring.state, ring.holder, ring.corruption]).toEqual(['waiting', null, 0]);
  });
});

describe('the bearer', () => {
  it('fights with the Ring, and a Ring without one equips itself on a board unit', () => {
    const game = createGame({ seed: 10, players: 2 });
    skipTo(game, 2, 1);
    const ring = hold(game, 0, null, 3);
    const report = game.advance()!;
    const fight = report.fights.find((f) => f.home === 0 || f.away === 0)!;
    const side = fight.home === 0 ? 'A' : 'B';
    const bearers = fight.input.teams[side].filter((p) => p.ring !== undefined);
    expect(bearers).toHaveLength(1);
    expect(bearers[0]!.ring).toBe(3);
    expect(placeOf(player(game, 0), ring.bearer!)).not.toBeNull();
  });

  it('is chosen by the holder, and selling or merging moves the Ring along', () => {
    const game = createGame({ seed: 11, players: 2 });
    skipTo(game, 2, 1);
    const a = field(game, 0, 'gimli', { bench: 5 });
    const b = field(game, 0, 'gimli', { bench: 6 });
    const ring = hold(game, 0, null);
    expect(game.act(1, { type: 'ring', to: { bench: 5 } }).ok).toBe(false);
    expect(game.act(0, { type: 'ring', to: { bench: 7 } })).toEqual({ ok: false, reason: 'There is no unit there.' });
    expect(game.act(0, { type: 'ring', to: null as never }).ok).toBe(false);
    expect(game.act(0, { type: 'ring', to: { bench: 6 } }).ok).toBe(true);
    expect(ring.bearer).toBe(b);
    // A third Gimli merges the two; the merged unit keeps the first's id and bears the Ring.
    pool(game).take('gimli');
    player(game, 0).gold = 0;
    expect(player(game, 0).gain('gimli')).toBe(true);
    expect(ring.bearer).toBe(a);
    expect(game.act(0, { type: 'sell', from: placeOf(player(game, 0), a)! }).ok).toBe(true);
    expect([ring.state, ring.holder, ring.bearer]).toEqual(['held', 0, null]);
  });
});

describe('leaving the holder', () => {
  it('is destroyed in Mount Doom by a Hobbit bearer after 3 Hobbit fights, for a reward', () => {
    const game = createGame({ seed: 12, players: 2 });
    skipTo(game, 2, 1);
    const frodo = field(game, 0, 'frodo', { col: 3, row: 3 });
    const ring = hold(game, 0, frodo);
    expect(game.act(0, { type: 'destroyRing' }).ok).toBe(false);
    for (let i = 0; i < RING.destroy.hobbitFights; i++) nextPlanning(game);
    expect(ring.hobbitFights).toBe(RING.destroy.hobbitFights);
    const gold = player(game, 0).gold;
    const items = player(game, 0).items.length;
    expect(game.act(0, { type: 'destroyRing' })).toEqual({ ok: true });
    expect(ring.state).toBe('destroyed');
    expect(player(game, 0).gold).toBe(gold + RING.destroy.gold);
    expect(player(game, 0).items).toHaveLength(items + RING.destroy.combinedItems);
    skipTo(game, 3, 4);
    expect(game.state.council!.options.some((o) => o.ring)).toBe(false);
  });

  it('refuses Mount Doom for a bearer who is not a Hobbit', () => {
    const game = createGame({ seed: 12, players: 2 });
    skipTo(game, 2, 1);
    const ring = hold(game, 0, field(game, 0, 'gimli', { col: 3, row: 3 }));
    ring.hobbitFights = 5;
    expect(game.act(0, { type: 'destroyRing' })).toEqual({ ok: false, reason: 'Only a Hobbit can carry the Ring to Mount Doom.' });
  });

  it("is stolen by an opponent's Gollum who survives the fight", () => {
    const game = createGame({ seed: 13, players: 2 });
    skipTo(game, 2, 1);
    player(game, 0).returnEverything();
    player(game, 1).returnEverything();
    const sam = field(game, 0, 'sam', { col: 3, row: 3 });
    field(game, 1, 'gollum', { col: 3, row: 0 }, 3);
    field(game, 1, 'gimli', { col: 3, row: 3 }, 3);
    const ring = hold(game, 0, sam, 2);
    game.advance();
    expect(ring.holder).toBe(1);
    expect(ring.bearer).toBe(player(game, 1).firstOnBoard('gollum')!.id);
    expect(ring.corruption).toBe(2);
  });

  it("waits for the next Council, Corruption kept, when its holder is eliminated", () => {
    const game = createGame({ seed: 14, players: 3 });
    skipTo(game, 2, 1);
    const ring = hold(game, 0, field(game, 0, 'gimli', { col: 3, row: 3 }), 4);
    player(game, 0).hp = 1;
    player(game, 0).returnEverything();
    while (player(game, 0).placement === null) game.advance();
    expect([ring.state, ring.holder, ring.corruption]).toEqual(['waiting', null, 4]);
  });
});

describe('bots and the Ring', () => {
  it('take it at or below 60 HP, and never above', () => {
    for (const [hp, takes] of [
      [60, true],
      [61, false],
    ] as const) {
      const game = createGame({ seed: 15, players: 2 });
      skipTo(game, 3, 4);
      const seat = game.state.council!.groups[0]![0]!;
      player(game, seat).hp = hp;
      new Bot(seat, 15).pick(game);
      expect(game.state.ring.holder === seat).toBe(takes);
    }
  });

  it('keep it on a Hobbit on the board if they have one', () => {
    const game = createGame({ seed: 16, players: 2 });
    skipTo(game, 2, 1);
    player(game, 0).returnEverything();
    field(game, 0, 'gimli', { bench: 0 });
    const merry = field(game, 0, 'merry', { bench: 1 });
    const ring = hold(game, 0, null);
    new Bot(0, 16).plan(game);
    expect(ring.bearer).toBe(merry);
  });
});
