import { describe, expect, it } from 'vitest';
import { POOL_COPIES, SHOP } from '../src/data/economy.js';
import type { ItemId } from '../src/data/items.js';
import { UNITS, type UnitId } from '../src/data/units.js';
import { boardSlot, unitAt, type Place } from '../src/game/places.js';
import { Player, baseIncome, streakGold, xpForNextLevel } from '../src/game/player.js';
import { addItem } from '../src/game/rules.js';
import { Pool, UNIT_IDS, copiesIn } from '../src/game/pool.js';
import { createRng, randomInt } from '../src/rng.js';
import type { Star } from '../src/types.js';

function setup(gold = 100, seed = 1) {
  const pool = new Pool();
  let nextId = 0;
  const context = { pool, nextUnitId: () => nextId++ };
  const player = new Player(0, context, createRng(seed), createRng(seed + 1000));
  player.gold = gold;
  return { pool, player, context };
}

/** Puts a unit straight into the shop, taking it from the pool. */
function stock(player: Player, pool: Pool, slot: number, unitId: UnitId): void {
  pool.take(unitId);
  player.shop[slot] = unitId;
}

/** Gives the player a unit at a place, taking its copies from the pool. */
function give(player: Player, pool: Pool, place: Place, unitId: UnitId, star: Star = 1, id = 100, items: readonly ItemId[] = []): void {
  pool.take(unitId, copiesIn(star));
  if ('bench' in place) player.bench[place.bench] = { id, unitId, star, items };
  else player.board[boardSlot(place)] = { id, unitId, star, items };
}

/** Copies of each unit in the pool, the shop and owned units. */
function copies(pool: Pool, players: readonly Player[]): Map<UnitId, number> {
  const total = new Map(UNIT_IDS.map((id) => [id, pool.count(id)]));
  for (const player of players) {
    for (const id of player.shop) if (id !== null) total.set(id, total.get(id)! + 1);
    for (const unit of [...player.bench, ...player.board]) {
      if (unit !== null) total.set(unit.unitId, total.get(unit.unitId)! + copiesIn(unit.star));
    }
  }
  return total;
}

const STARTING_COPIES = new Map(UNIT_IDS.map((id) => [id, POOL_COPIES[UNITS[id].cost]]));

describe('buying', () => {
  it('pays the cost, empties the slot and puts the unit on the lowest free bench slot', () => {
    const { player, pool } = setup(10);
    give(player, pool, { bench: 0 }, 'gimli');
    stock(player, pool, 2, 'frodo');
    expect(player.buy(2)).toEqual({ ok: true });
    expect(player.gold).toBe(8);
    expect(player.shop[2]).toBeNull();
    expect(player.bench[1]).toMatchObject({ unitId: 'frodo', star: 1 });
  });

  it('refuses without enough gold, from an empty or unknown slot, or with a full bench', () => {
    const { player, pool } = setup(1);
    stock(player, pool, 0, 'frodo');
    expect(player.buy(0).ok).toBe(false);
    player.gold = 10;
    expect(player.buy(1).ok).toBe(false);
    expect(player.buy(5).ok).toBe(false);
    expect(player.buy(0.5).ok).toBe(false);
    for (let slot = 0; slot < 9; slot++) give(player, pool, { bench: slot }, 'sam');
    expect(player.buy(0)).toEqual({ ok: false, reason: 'The bench is full.' });
    expect(player.gold).toBe(10);
    expect(player.shop[0]).toBe('frodo');
  });

  it('merges a third copy at once, even with a full bench, onto the board copy', () => {
    const { player, pool } = setup(10);
    give(player, pool, { bench: 4 }, 'sam', 1, 7);
    give(player, pool, { col: 2, row: 3 }, 'sam', 1, 8);
    for (let slot = 0; slot < 9; slot++) if (slot !== 4) give(player, pool, { bench: slot }, 'merry');
    stock(player, pool, 0, 'sam');
    expect(player.buy(0).ok).toBe(true);
    expect(player.gold).toBe(9);
    expect(unitAt(player, { col: 2, row: 3 })).toEqual({ id: 8, unitId: 'sam', star: 2, items: [] });
    expect(player.bench[4]).toBeNull();
  });

  it('keeps the merged unit on the lowest bench slot when no copy is on the board', () => {
    const { player, pool } = setup();
    give(player, pool, { bench: 6 }, 'pippin', 1, 1);
    give(player, pool, { bench: 3 }, 'pippin', 1, 2);
    stock(player, pool, 0, 'pippin');
    player.buy(0);
    expect(player.bench[3]).toEqual({ id: 2, unitId: 'pippin', star: 2, items: [] });
    expect(player.bench[6]).toBeNull();
  });

  it('keeps the board copy with the lowest row, then column, when two are on the board', () => {
    const { player, pool } = setup();
    give(player, pool, { col: 1, row: 2 }, 'pippin', 1, 1);
    give(player, pool, { col: 5, row: 0 }, 'pippin', 1, 2);
    stock(player, pool, 0, 'pippin');
    player.buy(0);
    expect(unitAt(player, { col: 5, row: 0 })).toEqual({ id: 2, unitId: 'pippin', star: 2, items: [] });
    expect(unitAt(player, { col: 1, row: 2 })).toBeNull();
  });

  it('merges twice when the new 2★ is the third', () => {
    const { player, pool } = setup();
    give(player, pool, { bench: 0 }, 'beregond', 2, 1);
    give(player, pool, { col: 3, row: 3 }, 'beregond', 2, 2);
    give(player, pool, { bench: 1 }, 'beregond', 1, 3);
    give(player, pool, { bench: 2 }, 'beregond', 1, 4);
    stock(player, pool, 0, 'beregond');
    player.buy(0);
    expect(unitAt(player, { col: 3, row: 3 })).toEqual({ id: 2, unitId: 'beregond', star: 3, items: [] });
    expect(player.bench.every((u) => u === null)).toBe(true);
    expect(copies(pool, [player])).toEqual(STARTING_COPIES);
  });

  it("doesn't merge 3★ units", () => {
    const { player, pool } = setup();
    give(player, pool, { bench: 0 }, 'sam', 3, 1);
    give(player, pool, { bench: 1 }, 'sam', 3, 2);
    stock(player, pool, 0, 'sam');
    player.buy(0);
    expect(player.bench.slice(0, 3).map((u) => u?.star)).toEqual([3, 3, 1]);
  });

  it('gives new units new ids', () => {
    const { player, pool } = setup();
    stock(player, pool, 0, 'sam');
    stock(player, pool, 1, 'merry');
    player.buy(0);
    player.buy(1);
    expect(player.bench[0]!.id).not.toBe(player.bench[1]!.id);
  });
});

describe('gaining a unit', () => {
  it('returns false and changes nothing when the bench is full and nothing merges', () => {
    const { player, pool } = setup();
    const others: UnitId[] = ['pippin', 'beregond', 'hama', 'grishnakh', 'sharku', 'gorbag', 'frodo'];
    give(player, pool, { bench: 0 }, 'sam');
    give(player, pool, { bench: 1 }, 'sam');
    others.forEach((id, i) => give(player, pool, { bench: i + 2 }, id));
    pool.take('merry');
    const before = player.bench.map((u) => u?.unitId);
    expect(player.gain('merry')).toBe(false);
    expect(player.bench.map((u) => u?.unitId)).toEqual(before);
    pool.take('sam');
    expect(player.gain('sam')).toBe(true);
    expect(player.bench[0]!.star).toBe(2);
  });
});

describe('selling', () => {
  it('refunds the cost of every copy and returns them to the pool', () => {
    const { player, pool } = setup(0);
    give(player, pool, { bench: 0 }, 'sam', 1);
    give(player, pool, { bench: 1 }, 'gimli', 2);
    give(player, pool, { col: 0, row: 0 }, 'sauron', 3);
    expect(player.sell({ bench: 0 }).ok).toBe(true);
    expect(player.sell({ bench: 1 }).ok).toBe(true);
    expect(player.sell({ col: 0, row: 0 }).ok).toBe(true);
    expect(player.gold).toBe(1 + 3 * 3 + 9 * 5);
    expect(copies(pool, [player])).toEqual(STARTING_COPIES);
    expect(pool.count('sauron')).toBe(9);
  });

  it('refuses an empty or invalid place', () => {
    const { player } = setup();
    expect(player.sell({ bench: 0 }).ok).toBe(false);
    expect(player.sell({ bench: 9 }).ok).toBe(false);
    expect(player.sell({ col: 7, row: 0 }).ok).toBe(false);
    expect(player.sell({ col: 0, row: 4 }).ok).toBe(false);
    expect(player.sell(null as unknown as Place).ok).toBe(false);
  });
});

describe('moving', () => {
  it('moves between the bench and the board up to the level', () => {
    const { player, pool } = setup();
    player.level = 2;
    give(player, pool, { bench: 0 }, 'sam', 1, 1);
    give(player, pool, { bench: 1 }, 'merry', 1, 2);
    give(player, pool, { bench: 2 }, 'pippin', 1, 3);
    expect(player.move({ bench: 0 }, { col: 3, row: 3 }).ok).toBe(true);
    expect(player.move({ bench: 1 }, { col: 4, row: 3 }).ok).toBe(true);
    expect(player.move({ bench: 2 }, { col: 5, row: 3 })).toEqual({ ok: false, reason: 'The board is full for this level.' });
    expect(player.boardCount()).toBe(2);
  });

  it('swaps with a unit at the destination, even when the board is full', () => {
    const { player, pool } = setup();
    player.level = 1;
    give(player, pool, { col: 3, row: 3 }, 'sam', 1, 1);
    give(player, pool, { bench: 0 }, 'merry', 1, 2);
    expect(player.move({ bench: 0 }, { col: 3, row: 3 }).ok).toBe(true);
    expect(unitAt(player, { col: 3, row: 3 })!.unitId).toBe('merry');
    expect(player.bench[0]!.unitId).toBe('sam');
    expect(player.move({ col: 3, row: 3 }, { col: 0, row: 0 }).ok).toBe(true);
    expect(player.move({ col: 0, row: 0 }, { bench: 5 }).ok).toBe(true);
    expect(player.boardCount()).toBe(0);
  });

  it('refuses an empty or invalid source and an invalid destination', () => {
    const { player, pool } = setup();
    give(player, pool, { bench: 0 }, 'sam');
    expect(player.move({ bench: 1 }, { bench: 2 }).ok).toBe(false);
    expect(player.move({ bench: 0 }, { col: 3, row: 4 }).ok).toBe(false);
    expect(player.move({ bench: 0 }, { bench: -1 }).ok).toBe(false);
    expect(player.bench[0]!.unitId).toBe('sam');
  });
});

describe('filling the board', () => {
  it('moves the lowest bench units to free places in the fill order, up to the level', () => {
    const { player, pool } = setup();
    player.level = 4;
    give(player, pool, { col: 3, row: 3 }, 'sam', 1, 1);
    give(player, pool, { bench: 5 }, 'merry', 1, 2);
    give(player, pool, { bench: 2 }, 'pippin', 1, 3);
    give(player, pool, { bench: 7 }, 'gorbag', 1, 4);
    give(player, pool, { bench: 8 }, 'sharku', 1, 5);
    player.fillBoard();
    expect(unitAt(player, { col: 2, row: 3 })!.unitId).toBe('pippin');
    expect(unitAt(player, { col: 4, row: 3 })!.unitId).toBe('merry');
    expect(unitAt(player, { col: 1, row: 3 })!.unitId).toBe('gorbag');
    expect(player.bench[8]!.unitId).toBe('sharku');
    expect(player.boardCount()).toBe(4);
  });

  it('gives the board as fight input', () => {
    const { player, pool } = setup();
    give(player, pool, { col: 6, row: 0 }, 'legolas', 2);
    give(player, pool, { col: 3, row: 3 }, 'gimli', 1);
    expect(player.placements()).toEqual([
      { unitId: 'legolas', star: 2, col: 6, row: 0, items: [] },
      { unitId: 'gimli', star: 1, col: 3, row: 3, items: [] },
    ]);
  });
});

describe('items', () => {
  it('combine a component with a lone component, or go at the end, up to 3', () => {
    expect(addItem([], 'blade')).toEqual(['blade']);
    expect(addItem(['blade'], 'cloak')).toEqual(['sting']);
    expect(addItem(['anduril', 'staff'], 'blade')).toEqual(['anduril', 'glamdring']);
    expect(addItem(['anduril'], 'phial')).toEqual(['anduril', 'phial']);
    expect(addItem(['sting'], 'blade')).toEqual(['sting', 'blade']);
    // A full unit still takes a component that completes its lone one.
    expect(addItem(['anduril', 'phial', 'bow'], 'bow')).toEqual(['anduril', 'phial', 'galadhrim-bow']);
    expect(addItem(['anduril', 'phial', 'sting'], 'bow')).toBeNull();
    expect(addItem(['anduril', 'phial', 'bow'], 'grond')).toBeNull();
  });

  it('are given to units on the bench or the board', () => {
    const { player, pool } = setup();
    give(player, pool, { bench: 0 }, 'gimli');
    give(player, pool, { col: 3, row: 3 }, 'sam', 1, 101);
    player.items.push('mail', 'blade', 'mail');
    expect(player.equip(1, { bench: 0 })).toEqual({ ok: true });
    expect(player.items).toEqual(['mail', 'mail']);
    expect(player.equip(0, { col: 3, row: 3 })).toEqual({ ok: true });
    expect(player.equip(0, { col: 3, row: 3 })).toEqual({ ok: true });
    expect(player.items).toEqual([]);
    expect(player.bench[0]!.items).toEqual(['blade']);
    expect(unitAt(player, { col: 3, row: 3 })).toEqual({ id: 101, unitId: 'sam', star: 1, items: ['oakenshield'] });
  });

  it('refuse a missing item, an empty or invalid place, and a full unit', () => {
    const { player, pool } = setup();
    give(player, pool, { bench: 0 }, 'gimli', 1, 100, ['anduril', 'sting', 'phial']);
    player.items.push('blade');
    expect(player.equip(1, { bench: 0 }).ok).toBe(false);
    expect(player.equip(-1, { bench: 0 }).ok).toBe(false);
    expect(player.equip(0, { bench: 1 })).toEqual({ ok: false, reason: 'There is no unit there.' });
    expect(player.equip(0, { bench: 9 }).ok).toBe(false);
    expect(player.equip(0, { bench: 0 })).toEqual({ ok: false, reason: 'A unit can hold at most 3 items.' });
    expect(player.items).toEqual(['blade']);
    expect(player.bench[0]!.items).toEqual(['anduril', 'sting', 'phial']);
  });

  it('move with their unit and go back to the player when it is sold', () => {
    const { player, pool } = setup();
    give(player, pool, { bench: 0 }, 'gimli', 1, 100, ['sting', 'bow']);
    expect(player.move({ bench: 0 }, { col: 3, row: 3 }).ok).toBe(true);
    expect(unitAt(player, { col: 3, row: 3 })!.items).toEqual(['sting', 'bow']);
    player.items.push('staff');
    expect(player.sell({ col: 3, row: 3 }).ok).toBe(true);
    expect(player.items).toEqual(['staff', 'sting', 'bow']);
  });

  it('gather on the merged unit, and any beyond 3 go back to the player', () => {
    const { player, pool } = setup();
    give(player, pool, { col: 3, row: 3 }, 'sam', 1, 100, ['anduril', 'blade']);
    give(player, pool, { bench: 2 }, 'sam', 1, 101, ['cloak', 'phial', 'grond']);
    stock(player, pool, 0, 'sam');
    expect(player.buy(0).ok).toBe(true);
    // The Cloak completes the Blade; the Phial fills the third place, and the Grond goes back.
    expect(unitAt(player, { col: 3, row: 3 })).toEqual({ id: 100, unitId: 'sam', star: 2, items: ['anduril', 'sting', 'phial'] });
    expect(player.bench[2]).toBeNull();
    expect(player.items).toEqual(['grond']);
  });

  it('go into the fight with their units, and are lost when the player is out', () => {
    const { player, pool } = setup();
    give(player, pool, { col: 3, row: 3 }, 'gimli', 1, 100, ['mithril-shirt', 'lembas']);
    give(player, pool, { bench: 0 }, 'sam', 1, 101, ['staff']);
    expect(player.placements()).toEqual([{ unitId: 'gimli', star: 1, col: 3, row: 3, items: ['mithril-shirt', 'lembas'] }]);
    player.items.push('bow');
    player.returnEverything();
    expect(player.items).toEqual([]);
  });
});

describe('the shop', () => {
  it('rerolls for 2 gold, returning the old units to the pool, even while locked', () => {
    const { player, pool } = setup(3);
    player.level = 5;
    player.rollShop();
    const before = [...player.shop];
    player.setLock(true);
    expect(player.reroll().ok).toBe(true);
    expect(player.gold).toBe(1);
    expect(player.shop).not.toEqual(before);
    expect(player.shop.every((id) => id !== null)).toBe(true);
    expect(copies(pool, [player])).toEqual(STARTING_COPIES);
    expect(player.reroll().ok).toBe(false);
    expect(player.shopLocked).toBe(true);
  });

  it('has 5 slots', () => {
    const { player } = setup();
    player.rollShop();
    expect(player.shop).toHaveLength(SHOP.size);
  });
});

describe('XP and levels', () => {
  it('can only buy XP from level 3 to level 8', () => {
    const { player } = setup(100);
    player.level = 2;
    expect(player.buyXp().ok).toBe(false);
    player.level = 9;
    expect(player.buyXp().ok).toBe(false);
    player.level = 3;
    player.gold = 3;
    expect(player.buyXp().ok).toBe(false);
    expect(player.gold).toBe(3);
  });

  it('levels up with the XP from docs/design.md section 8, carrying the rest over', () => {
    const { player } = setup(100);
    player.level = 3;
    player.buyXp();
    expect([player.level, player.xp, player.gold]).toEqual([3, 4, 96]);
    player.buyXp();
    expect([player.level, player.xp]).toEqual([4, 2]);
    player.addXp(10 + 20 + 36 + 48 + 75 - 2);
    expect([player.level, player.xp]).toEqual([8, 75]);
    player.addXp(1);
    expect([player.level, player.xp]).toEqual([9, 0]);
    player.addXp(50);
    expect([player.level, player.xp]).toEqual([9, 0]);
  });

  it('ignores XP before level 3 and drops extra XP at level 9', () => {
    const { player } = setup();
    player.level = 2;
    player.addXp(10);
    expect([player.level, player.xp]).toEqual([2, 0]);
    player.level = 8;
    player.addXp(200);
    expect([player.level, player.xp]).toEqual([9, 0]);
  });

  it('only raises the level when reaching an automatic level', () => {
    const { player } = setup();
    player.reachLevel(2);
    expect(player.level).toBe(2);
    player.level = 5;
    player.reachLevel(3);
    expect(player.level).toBe(5);
  });

  it('lists the XP to the next level', () => {
    expect([2, 3, 4, 5, 6, 7, 8, 9].map(xpForNextLevel)).toEqual([null, 6, 10, 20, 36, 48, 76, null]);
  });
});

describe('gold', () => {
  it('pays 1 interest per 10 gold, up to 5, before base income', () => {
    const cases = [
      [0, 5],
      [9, 14],
      [10, 16],
      [49, 58],
      [50, 60],
      [87, 97],
    ];
    for (const [gold, after] of cases) {
      const { player } = setup(gold);
      player.collectIncome(5);
      expect(player.gold).toBe(after);
    }
  });

  it('pays win gold and streak gold after PvP fights', () => {
    const { player } = setup(0);
    const results = [true, true, true, true, true, true, false, false, false, false, true];
    const gold = results.map((won) => {
      const before = player.gold;
      player.recordPvp(won);
      return [player.streak, player.gold - before];
    });
    expect(gold).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 3],
      [5, 4],
      [6, 4],
      [-1, 0],
      [-2, 1],
      [-3, 1],
      [-4, 2],
      [1, 1],
    ]);
  });

  it('pays the base income from docs/design.md section 8', () => {
    const rounds: [number, number][] = [[1, 2], [1, 3], [1, 4], [2, 1], [2, 2], [2, 7], [5, 3]];
    expect(rounds.map(([stage, round]) => baseIncome(stage, round))).toEqual([2, 2, 3, 4, 5, 5, 5]);
  });

  it('pays the streak bonus from docs/design.md section 8', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(streakGold)).toEqual([0, 0, 1, 1, 2, 3, 3]);
  });
});

describe('copies', () => {
  it('are conserved through random buying, selling, moving, rerolling and elimination', () => {
    const pool = new Pool();
    let nextId = 0;
    const context = { pool, nextUnitId: () => nextId++ };
    const players = [0, 1, 2].map((seat) => new Player(seat, context, createRng(seat), createRng(seat + 1000)));
    const rng = createRng(77);
    const randomPlace = (): Place =>
      randomInt(rng, 2) ? { bench: randomInt(rng, 9) } : { col: randomInt(rng, 7), row: randomInt(rng, 4) };
    for (const player of players) {
      player.level = 3 + player.seat * 3;
      player.rollShop();
    }
    for (let i = 0; i < 5000; i++) {
      const player = players[randomInt(rng, players.length)]!;
      player.gold += randomInt(rng, 4);
      const action = randomInt(rng, 5);
      if (action === 0) player.buy(randomInt(rng, 5));
      else if (action === 1) player.sell(randomPlace());
      else if (action === 2) player.move(randomPlace(), randomPlace());
      else if (action === 3) player.reroll();
      else player.buy(randomInt(rng, 5));
      expect(player.boardCount()).toBeLessThanOrEqual(player.level);
    }
    expect(copies(pool, players)).toEqual(STARTING_COPIES);
    // Merges happen at once, so nobody owns three copies at 1★ or 2★.
    for (const player of players) {
      for (const star of [1, 2]) {
        for (const id of UNIT_IDS) {
          const owned = [...player.bench, ...player.board].filter((u) => u?.unitId === id && u.star === star);
          expect(owned.length).toBeLessThan(3);
        }
      }
    }
    players[1]!.returnEverything();
    expect(copies(pool, players)).toEqual(STARTING_COPIES);
    expect(players[1]!.shop.every((id) => id === null)).toBe(true);
  });
});
