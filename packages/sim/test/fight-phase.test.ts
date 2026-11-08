// The fight phase (docs/game-spec.md sections 9.3 and 9.4): between a round's fights and the next
// round, players shop and use their bench while the fights play, and the board stays as it fought.

import { describe, expect, it } from 'vitest';
import { UNITS } from '../src/data/units.js';
import { UNIT_IDS } from '../src/game/pool.js';
import { createGame, type Action, type Game } from '../src/game/game.js';
import type { OwnedUnit } from '../src/game/places.js';
import { field, giveItems, playerOf, poolOf, skipTo } from './fixtures.js';

/** A game at 2-1, a PvP round, with each player's board and bench cleared and a shop rolled. */
function pvpGame(seed: number): Game {
  const game = createGame({ seed, players: 2 });
  skipTo(game, 2, 1);
  // 2-1 offers Gifts: each player takes one that gives no gold.
  for (const p of game.state.players) game.act(p.seat, { type: 'gift', option: p.giftOffer!.findIndex((g) => g !== 'bilbos-purse') });
  for (const seat of [0, 1]) playerOf(game, seat).returnEverything();
  for (const seat of [0, 1]) playerOf(game, seat).rollShop();
  return game;
}

/** What a game's players hold, to compare two games: units by what they are, as test units' ids differ. */
function holdings(game: Game) {
  const unit = (u: OwnedUnit | null) => (u === null ? null : { unitId: u.unitId, star: u.star, items: u.items });
  return game.state.players.map((p) => ({
    gold: p.gold,
    hp: p.hp,
    level: p.level,
    xp: p.xp,
    streak: p.streak,
    bench: p.bench.map(unit),
    board: p.board.map(unit),
    items: p.items,
    shop: p.shop,
  }));
}

describe('the fight phase', () => {
  it('runs the fights from planning and stays in the round until advance()', () => {
    const game = pvpGame(21);
    field(game, 0, 'gimli', { col: 3, row: 3 }, { star: 2 });
    const report = game.fight();
    expect(report.fights).toHaveLength(1);
    expect([game.state.stage, game.state.round, game.state.phase]).toEqual([2, 1, 'fight']);
    // The fights' damage and streaks are in already.
    expect(playerOf(game, 1).hp).toBeLessThan(100);
    expect(playerOf(game, 0).streak).toBe(1);
    expect(game.advance()).toBeNull();
    expect([game.state.stage, game.state.round, game.state.phase]).toEqual([2, 2, 'planning']);
  });

  it('plays out the same as advance() from planning when nobody acts', () => {
    const one = pvpGame(22);
    const two = pvpGame(22);
    for (const game of [one, two]) field(game, 0, 'legolas', { col: 3, row: 3 });
    const report = one.advance();
    expect(two.fight()).toEqual(report);
    two.advance();
    expect(holdings(two)).toEqual(holdings(one));
    expect([two.state.stage, two.state.round]).toEqual([one.state.stage, one.state.round]);
  });

  it("pays win gold and streak gold when the fight phase ends, before the next round's interest", () => {
    const game = pvpGame(23);
    field(game, 0, 'gimli', { col: 3, row: 3 }, { star: 2 });
    playerOf(game, 0).gold = 29;
    game.fight();
    expect(playerOf(game, 0).gold).toBe(29);
    game.advance();
    // 1 for the win, so 30 held: 3 interest and 5 base income.
    expect(playerOf(game, 0).gold).toBe(30 + 3 + 5);
  });

  it('gives PvE loot when the fight phase ends', () => {
    const game = createGame({ seed: 24, players: 2 });
    skipTo(game, 1, 2);
    const items = playerOf(game, 0).items.length;
    game.fight();
    expect(playerOf(game, 0).items).toHaveLength(items);
    game.advance();
    expect(playerOf(game, 0).items).toHaveLength(items + 1);
  });

  it('lets players shop, buy XP and use their bench and items', () => {
    const game = pvpGame(25);
    const p = playerOf(game, 0);
    p.gold = 50;
    // A full board for level 3, so the bench isn't moved onto it before the fight.
    for (const [unitId, col] of [['gimli', 2], ['dain', 3], ['sam', 4]] as const) field(game, 0, unitId, { col, row: 3 });
    field(game, 0, 'legolas', { bench: 0 });
    giveItems(game, 0, 'blade', 'bow', 'cloak');
    game.fight();
    const slot = p.shop.findIndex((id) => id !== null);
    const cost = UNITS[p.shop[slot]!].cost;
    const ok = (action: Action) => expect(game.act(0, action)).toEqual({ ok: true });
    ok({ type: 'buy', slot });
    expect(p.gold).toBe(50 - cost);
    expect(p.bench[1]).not.toBeNull();
    ok({ type: 'move', from: { bench: 1 }, to: { bench: 5 } });
    ok({ type: 'equip', item: 0, to: { bench: 0 } });
    expect(p.bench[0]!.items).toEqual(['blade']);
    ok({ type: 'combine', item: 0, with: 1 });
    ok({ type: 'sell', from: { bench: 5 } });
    ok({ type: 'lock', locked: true });
    ok({ type: 'reroll' });
    ok({ type: 'buyXp' });
  });

  it('keeps the board as it fought, and leaves Gifts and the One Ring for planning', () => {
    const game = pvpGame(26);
    field(game, 0, 'gimli', { col: 3, row: 3 });
    field(game, 0, 'legolas', { bench: 0 });
    giveItems(game, 0, 'blade');
    game.fight();
    const board = [...playerOf(game, 0).board];
    const fighting = { ok: false, reason: 'Units on the board are fighting.' };
    expect(game.act(0, { type: 'sell', from: { col: 3, row: 3 } })).toEqual(fighting);
    expect(game.act(0, { type: 'move', from: { bench: 0 }, to: { col: 0, row: 0 } })).toEqual(fighting);
    expect(game.act(0, { type: 'move', from: { col: 3, row: 3 }, to: { bench: 3 } })).toEqual(fighting);
    expect(game.act(0, { type: 'equip', item: 0, to: { col: 3, row: 3 } })).toEqual(fighting);
    expect(game.act(0, { type: 'gift', option: 0 })).toEqual({ ok: false, reason: 'Wait for the fights to finish.' });
    expect(game.act(0, { type: 'ring', to: { bench: 0 } })).toEqual({ ok: false, reason: 'Wait for the fights to finish.' });
    expect(game.act(0, { type: 'destroyRing' })).toEqual({ ok: false, reason: 'Wait for the fights to finish.' });
    expect(playerOf(game, 0).board).toEqual(board);
  });

  it('keeps a bought copy on the bench until the fights end, then merges it with the board copy, where that stands', () => {
    const game = pvpGame(27);
    const p = playerOf(game, 0);
    p.gold = 50;
    // A full board, so the fights don't fill it from the bench.
    p.level = 1;
    const unitId = p.shop.find((id) => id !== null)!;
    const id = field(game, 0, unitId, { col: 2, row: 3 });
    field(game, 0, unitId, { bench: 4 });
    game.fight();
    const board = [...p.board];
    expect(game.act(0, { type: 'buy', slot: p.shop.indexOf(unitId) })).toEqual({ ok: true });
    expect(p.board).toEqual(board);
    expect(p.bench[0]).toMatchObject({ unitId, star: 1 });
    expect(p.bench[4]).toMatchObject({ unitId, star: 1 });
    game.advance();
    expect(p.board.find((u) => u?.id === id)).toMatchObject({ unitId, star: 2 });
    expect(p.bench[0]).toBeNull();
    expect(p.bench[4]).toBeNull();
  });

  it('merges copies on the bench at once while the fights play, and with the board copies once they end', () => {
    const game = pvpGame(30);
    const p = playerOf(game, 0);
    p.gold = 50;
    // A full board, so the fights don't fill it from the bench.
    p.level = 1;
    const unitId = p.shop.find((id) => id !== null)!;
    const id = field(game, 0, unitId, { col: 2, row: 3 }, { star: 2 });
    field(game, 0, unitId, { bench: 1 }, { star: 2 });
    field(game, 0, unitId, { bench: 2 });
    field(game, 0, unitId, { bench: 5 });
    game.fight();
    expect(game.act(0, { type: 'buy', slot: p.shop.indexOf(unitId) })).toEqual({ ok: true });
    // The three 1★ copies make a 2★ on the bench; the board's 2★ waits.
    expect(p.bench.filter((u) => u !== null).map((u) => u!.star)).toEqual([2, 2]);
    expect(p.board.find((u) => u?.id === id)).toMatchObject({ star: 2 });
    game.advance();
    expect(p.board.find((u) => u?.id === id)).toMatchObject({ unitId, star: 3 });
    expect(p.bench.every((u) => u === null)).toBe(true);
  });

  it('merges only three of four waiting copies once the fights end, board copies first', () => {
    const game = pvpGame(32);
    const p = playerOf(game, 0);
    p.gold = 50;
    p.level = 2;
    const unitId = p.shop.find((id) => id !== null)!;
    const id = field(game, 0, unitId, { col: 2, row: 3 });
    field(game, 0, unitId, { col: 4, row: 3 });
    field(game, 0, unitId, { bench: 3 });
    game.fight();
    expect(game.act(0, { type: 'buy', slot: p.shop.indexOf(unitId) })).toEqual({ ok: true });
    game.advance();
    const copies = [...p.board, ...p.bench].filter((u) => u?.unitId === unitId);
    expect(copies.map((u) => u!.star)).toEqual([2, 1]);
    expect(p.board.find((u) => u?.id === id)).toMatchObject({ star: 2 });
    expect(p.bench[0]).toBeNull();
    expect(p.bench[3]).toMatchObject({ star: 1 });
  });

  it('makes the waiting 1★ merges before the 2★ ones', () => {
    const game = pvpGame(33);
    const p = playerOf(game, 0);
    p.gold = 50;
    // A full board, so the fights don't fill it from the bench.
    p.level = 3;
    const unitId = p.shop.find((id) => id !== null)!;
    const id = field(game, 0, unitId, { col: 1, row: 3 }, { star: 2 });
    field(game, 0, unitId, { col: 3, row: 3 });
    field(game, 0, unitId, { col: 5, row: 3 });
    field(game, 0, unitId, { bench: 1 }, { star: 2 });
    field(game, 0, unitId, { bench: 2 }, { star: 2 });
    game.fight();
    expect(game.act(0, { type: 'buy', slot: p.shop.indexOf(unitId) })).toEqual({ ok: true });
    game.advance();
    // The 1★ copies make a 2★ on the board, which merges with the board 2★ and the first bench
    // 2★ into a 3★, leaving the spare 2★ on the bench. 2★ first would leave it on the board.
    expect(p.board.filter((u) => u?.unitId === unitId)).toEqual([expect.objectContaining({ id, star: 3 })]);
    expect(p.bench.filter((u) => u?.unitId === unitId).map((u) => u!.star)).toEqual([2]);
  });

  it("doesn't let a full bench buy a copy that would merge only with a board copy while the fights play", () => {
    const game = pvpGame(31);
    const p = playerOf(game, 0);
    p.gold = 50;
    // A full board, so the fights don't fill it from the bench.
    p.level = 1;
    const unitId = p.shop.find((id) => id !== null)!;
    const others = UNIT_IDS.filter((id) => id !== unitId);
    field(game, 0, unitId, { col: 2, row: 3 });
    field(game, 0, unitId, { bench: 0 });
    for (let bench = 1; bench < p.bench.length; bench++) field(game, 0, others[bench]!, { bench });
    game.fight();
    expect(game.act(0, { type: 'buy', slot: p.shop.indexOf(unitId) })).toEqual({ ok: false, reason: 'The bench is full.' });
  });

  it('lets a unit waiting for room onto the bench while the fights play, merging with board copies only once they end', () => {
    const game = pvpGame(34);
    const p = playerOf(game, 0);
    // A full board, so the fights don't fill it from the bench.
    p.level = 1;
    const unitId = p.shop.find((id) => id !== null)!;
    const others = UNIT_IDS.filter((id) => id !== unitId);
    const id = field(game, 0, unitId, { col: 2, row: 3 });
    field(game, 0, unitId, { bench: 0 });
    for (let bench = 1; bench < p.bench.length; bench++) field(game, 0, others[bench]!, { bench });
    game.fight();
    // A copy waiting for room, as a Council or Gift unit with a full bench would be.
    poolOf(game).take(unitId);
    p.waiting.push(unitId);
    const board = [...p.board];
    expect(game.act(0, { type: 'sell', from: { bench: 5 } })).toEqual({ ok: true });
    expect(p.waiting).toEqual([]);
    expect(p.bench[5]).toMatchObject({ unitId, star: 1 });
    expect(p.board).toEqual(board);
    game.advance();
    expect(p.board.find((u) => u?.id === id)).toMatchObject({ unitId, star: 2 });
    expect(p.bench.filter((u) => u?.unitId === unitId)).toEqual([]);
  });

  it('only starts from planning', () => {
    const game = createGame({ seed: 28, players: 2 });
    skipTo(game, 2, 4);
    expect(game.state.phase).toBe('council');
    expect(() => game.fight()).toThrow();
    while (game.state.phase === 'council') game.advance();
    game.fight();
    expect(() => game.fight()).toThrow();
  });

  it('places players the fights knock out only when the fight phase ends, so they can shop until then', () => {
    const game = createGame({ seed: 29, players: 3 });
    skipTo(game, 2, 1);
    for (const p of game.state.players) game.act(p.seat, { type: 'gift', option: p.giftOffer!.findIndex((g) => g !== 'bilbos-purse') });
    for (const seat of [0, 1, 2]) playerOf(game, seat).returnEverything();
    for (const seat of [0, 1, 2]) playerOf(game, seat).rollShop();
    // Every fight is a draw between empty boards, so everyone takes 2: seat 2 is knocked out.
    playerOf(game, 2).hp = 1;
    const out = playerOf(game, 2);
    out.gold = 20;
    const report = game.fight();
    expect([report.eliminated, report.places]).toEqual([[2], [3]]);
    expect(out.placement).toBeNull();
    const slot = out.shop.findIndex((id) => id !== null);
    const bought = out.shop[slot]!;
    // The copies of the unit they buy that aren't in other hands: in the pool or their shop.
    const free = game.state.pool.count(bought) + out.shop.filter((id) => id === bought).length;
    expect(game.act(2, { type: 'buy', slot })).toEqual({ ok: true });
    expect(game.act(2, { type: 'reroll' })).toEqual({ ok: true });
    game.advance();
    expect(out.placement).toBe(3);
    expect(game.act(2, { type: 'reroll' })).toEqual({ ok: false, reason: 'That player is out of the game.' });
    // What they bought went back to the pool with everything else they owned.
    expect([...out.bench, ...out.board].every((u) => u === null)).toBe(true);
    expect(game.state.pool.count(bought)).toBe(free);
  });

  it('ends the game when the fight phase ends, if the fights leave one player', () => {
    const game = pvpGame(30);
    field(game, 0, 'gimli', { col: 3, row: 3 }, { star: 3 });
    playerOf(game, 1).hp = 1;
    const report = game.fight();
    expect([report.eliminated, report.places]).toEqual([[1], [2]]);
    expect([game.state.phase, game.isOver()]).toEqual(['fight', false]);
    expect(game.act(1, { type: 'reroll' }).ok).toBe(true);
    expect(game.advance()).toBeNull();
    expect([game.state.phase, game.isOver()]).toEqual(['over', true]);
    expect(game.state.players.map((p) => p.placement)).toEqual([1, 2]);
  });
});
