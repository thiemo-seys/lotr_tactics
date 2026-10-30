// Rings of Power in the game (docs/game-spec.md section 9.12).

import { describe, expect, it } from 'vitest';
import { Bot } from '../src/bots/bot.js';
import { RING_OF_POWER_IDS, isBoundToTheOne, isRingOfPower } from '../src/combat/items.js';
import { ITEMS, type ItemId, type RingOfPowerId } from '../src/data/items.js';
import { RING } from '../src/data/ring.js';
import { createGame, type Game } from '../src/game/game.js';
import type { Player } from '../src/game/player.js';
import { field, giveItems, holdRing, playerOf, poolOf, skipTo, supplyOf } from './fixtures.js';

/** Every copy of each ring: in the supply, on Council options, and with players. */
function count(game: Game): Record<RingOfPowerId, number> {
  const counts = Object.fromEntries(RING_OF_POWER_IDS.map((id) => [id, game.state.ringSupply.count(id)])) as Record<RingOfPowerId, number>;
  for (const option of game.state.council?.options ?? []) {
    if (option.pickedBy === null && option.item !== null && isRingOfPower(option.item)) counts[option.item]++;
  }
  for (const p of game.state.players) for (const id of (p as Player).ringsOfPower()) counts[id]++;
  return counts;
}

/** Gives seat 0 the One Ring on a Hobbit who has carried it through enough fights for Mount Doom. */
function destroyable(game: Game, hobbit: number): void {
  const ring = holdRing(game, 0, hobbit);
  for (let i = 0; i < RING.destroy.hobbitFights; i++) ring.foughtByHobbit();
}

const ALL = Object.fromEntries(RING_OF_POWER_IDS.map((id) => [id, ITEMS[id].ringOfPower!.copies]));

describe('Rings of Power at the Council', () => {
  it('come on the last two options from 2-4, never on the One Ring, and go back to the supply unpicked', () => {
    const game = createGame({ seed: 21, players: 2 });
    expect(game.state.council!.options.some((o) => o.item !== null && isRingOfPower(o.item))).toBe(false);
    skipTo(game, 2, 4);
    const rings = (g: Game) => g.state.council!.options.map((o) => o.item !== null && isRingOfPower(o.item));
    expect(rings(game)).toEqual([false, false, false, false, false, false, false, true, true]);
    expect(RING_OF_POWER_IDS.reduce((total, id) => total + game.state.ringSupply.count(id), 0)).toBe(19 - 2);
    expect(count(game)).toEqual(ALL);
    skipTo(game, 3, 4);
    expect(rings(game)).toEqual([false, false, false, false, false, false, true, true, false]);
    expect(game.state.council!.options.at(-1)!.ring).toBe(true);
    expect(count(game)).toEqual(ALL);
    skipTo(game, 3, 5);
    expect(count(game)).toEqual(ALL);
  });

  it('go to the picker\'s items', () => {
    const game = createGame({ seed: 21, players: 2 });
    skipTo(game, 2, 4);
    const council = game.state.council!;
    const seat = council.groups[0]![0]!;
    const option = council.options.at(-1)!;
    expect(game.act(seat, { type: 'pick', option: council.options.length - 1 }).ok).toBe(true);
    expect(playerOf(game, seat).items).toContain(option.item);
    expect(count(game)).toEqual(ALL);
  });

  it('are drawn from what is left, by copies', () => {
    const game = createGame({ seed: 22, players: 2 });
    for (const id of RING_OF_POWER_IDS) while (game.state.ringSupply.count(id) > (id === 'vilya' ? 1 : 0)) supplyOf(game).take(id);
    skipTo(game, 2, 4);
    const rings = game.state.council!.options.flatMap((o) => (o.item !== null && isRingOfPower(o.item) ? [o.item] : []));
    expect(rings).toEqual(['vilya']);
    expect(game.state.ringSupply.count('vilya')).toBe(0);
  });
});

describe('wearing Rings of Power', () => {
  it('is one per unit, when given and when merging', () => {
    const game = createGame({ seed: 23, players: 2 });
    skipTo(game, 2, 1);
    const p = playerOf(game, 0);
    p.returnEverything();
    field(game, 0, 'gimli', { bench: 0 }, { items: ['narya'] });
    field(game, 0, 'gimli', { bench: 1 }, { items: ['ring-of-the-nine', 'blade'] });
    giveItems(game, 0, 'ring-of-the-seven');
    expect(game.act(0, { type: 'equip', item: 0, to: { bench: 0 } })).toEqual({ ok: false, reason: 'A unit can wear only one Ring of Power.' });
    // A third Gimli merges the two: the Nine goes back to the player.
    poolOf(game).take('gimli');
    expect(p.gain('gimli')).toBe(true);
    expect(p.bench[0]!.items).toEqual(['narya', 'blade']);
    expect(p.items).toEqual(['ring-of-the-seven', 'ring-of-the-nine']);
  });
});

describe('the Seven', () => {
  it('pay 1 gold after each round for each on the board, 2 on a Dwarf', () => {
    const goldAfter = (items: Record<string, ItemId[]>) => {
      const game = createGame({ seed: 24, players: 2 });
      skipTo(game, 2, 1);
      playerOf(game, 0).returnEverything();
      field(game, 0, 'gimli', { col: 3, row: 3 }, { items: items.gimli });
      field(game, 0, 'legolas', { col: 2, row: 0 }, { items: items.legolas });
      field(game, 0, 'beregond', { col: 4, row: 3 });
      // The board is full for level 3, so Sam stays on the bench.
      field(game, 0, 'sam', { bench: 0 }, { items: items.sam });
      expect(playerOf(game, 0).level).toBe(3);
      game.advance();
      return playerOf(game, 0).gold;
    };
    const plain = goldAfter({});
    expect(goldAfter({ legolas: ['ring-of-the-seven'] })).toBe(plain + 1);
    expect(goldAfter({ gimli: ['ring-of-the-seven'], legolas: ['ring-of-the-seven'] })).toBe(plain + 3);
    // Not from the bench.
    expect(goldAfter({ sam: ['ring-of-the-seven'] })).toBe(plain);
  });
});

describe('the Nine and the One Ring', () => {
  it("get the One Ring's Corruption in every fight while it is held", () => {
    const game = createGame({ seed: 25, players: 4 });
    skipTo(game, 2, 1);
    expect(game.advance()!.fights.every((f) => f.input.oneRingCorruption === undefined)).toBe(true);
    holdRing(game, 1, null, 3);
    const report = game.advance()!;
    // The Ring's bearer gained a point at the start of the round.
    expect(report.fights.every((f) => f.input.oneRingCorruption === game.state.ring.corruption)).toBe(true);
  });

  it('take the Three and the Nine out of the game when the One is destroyed, and leave the Seven', () => {
    const game = createGame({ seed: 26, players: 2 });
    skipTo(game, 2, 1);
    const frodo = field(game, 0, 'frodo', { col: 3, row: 3 }, { items: ['vilya'] });
    field(game, 1, 'gimli', { col: 3, row: 3 }, { items: ['ring-of-the-nine'] });
    field(game, 1, 'dain', { bench: 0 }, { items: ['ring-of-the-seven', 'blade'] });
    giveItems(game, 0, 'narya', 'ring-of-the-seven');
    destroyable(game, frodo);
    expect(game.act(0, { type: 'destroyRing' })).toEqual({ ok: true });
    for (const p of game.state.players) expect((p as Player).ringsOfPower().some(isBoundToTheOne)).toBe(false);
    expect(playerOf(game, 0).firstOwned('frodo')!.items).toEqual([]);
    expect(playerOf(game, 1).firstOwned('dain')!.items).toEqual(['ring-of-the-seven', 'blade']);
    expect(playerOf(game, 0).items.filter(isRingOfPower)).toEqual(['ring-of-the-seven']);
    expect(RING_OF_POWER_IDS.filter((id) => game.state.ringSupply.count(id) > 0)).toEqual(['ring-of-the-seven']);
    skipTo(game, 2, 4);
    const offered = game.state.council!.options.flatMap((o) => (o.item !== null && isRingOfPower(o.item) ? [o.item] : []));
    expect(offered).toEqual(['ring-of-the-seven', 'ring-of-the-seven']);
  });
});

describe('eliminated players', () => {
  it('give their Rings of Power back to the supply', () => {
    const game = createGame({ seed: 27, players: 3 });
    skipTo(game, 2, 1);
    playerOf(game, 0).returnEverything();
    field(game, 0, 'gimli', { bench: 0 }, { items: ['nenya', 'blade'] });
    giveItems(game, 0, 'ring-of-the-nine');
    playerOf(game, 0).hp = 1;
    while (playerOf(game, 0).placement === null) game.advance();
    expect(playerOf(game, 0).items).toEqual([]);
    expect(count(game)).toEqual(ALL);
  });
});

describe('bots and Rings of Power', () => {
  it('want a Ring of Power at the Council', () => {
    const game = createGame({ seed: 28, players: 2 });
    skipTo(game, 2, 4);
    const seat = game.state.council!.groups[0]![0]!;
    new Bot(seat, 28).pick(game);
    const picked = game.state.council!.options.find((o) => o.pickedBy === seat)!;
    expect(picked.item !== null && isRingOfPower(picked.item)).toBe(true);
  });

  it('give a ring to a unit of its kin first', () => {
    const game = createGame({ seed: 29, players: 2 });
    skipTo(game, 2, 1);
    playerOf(game, 0).returnEverything();
    field(game, 0, 'gimli', { bench: 0 });
    field(game, 0, 'legolas', { bench: 1 });
    field(game, 0, 'beregond', { bench: 2 });
    giveItems(game, 0, 'vilya', 'ring-of-the-seven');
    new Bot(0, 29).plan(game);
    expect(playerOf(game, 0).firstOwned('legolas')!.items).toContain('vilya');
    expect(playerOf(game, 0).firstOwned('gimli')!.items).toContain('ring-of-the-seven');
  });

  it("don't destroy the One Ring while it would cost them the Three or the Nine", () => {
    for (const [items, destroyed] of [
      [[], true],
      [['ring-of-the-seven'], true],
      [['ring-of-the-nine'], false],
    ] as const) {
      const game = createGame({ seed: 30, players: 2 });
      skipTo(game, 2, 1);
      const frodo = field(game, 0, 'frodo', { col: 3, row: 3 }, { items: [...items] });
      destroyable(game, frodo);
      new Bot(0, 30).plan(game);
      expect(game.state.ring.state === 'destroyed').toBe(destroyed);
    }
  });
});
