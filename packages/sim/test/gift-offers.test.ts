// Gift offers, picks and rewards in the game (docs/game-spec.md section 9.10).

import { describe, expect, it } from 'vitest';
import { Bot } from '../src/bots/bot.js';
import { isComponent } from '../src/combat/items.js';
import { GIFTS, GIFT_IDS, type GiftId } from '../src/data/gifts.js';
import { UNITS, type UnitId } from '../src/data/units.js';
import { createGame, type Game } from '../src/game/game.js';
import { rollGiftOffer } from '../src/game/gifts.js';
import { Player } from '../src/game/player.js';
import { Pool, copiesIn } from '../src/game/pool.js';
import { createRng } from '../src/rng.js';

const isCrest = (id: GiftId) => GIFTS[id].combat?.crest !== undefined;

function setup(gold = 0) {
  const pool = new Pool();
  let nextId = 0;
  const player = new Player(0, { pool, nextUnitId: () => nextId++ }, createRng(1), createRng(2));
  player.gold = gold;
  return { pool, player };
}

/** Gives a player Gifts as if picked, without their rewards. */
function hold(player: Player, ...gifts: GiftId[]): void {
  player.gifts.push(...gifts);
}

function skipTo(game: Game, stage: number, round: number): void {
  while (!(game.state.stage === stage && game.state.round === round && game.state.phase === 'planning')) game.advance();
}

describe('gift offers', () => {
  it('hold 3 different Gifts of the tier, none already held, and at most one crest', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const held = new Set<GiftId>(['captains-horn', 'smaugs-hoard']);
      const offer = rollGiftOffer('gold', held, createRng(seed));
      expect(offer).toHaveLength(3);
      expect(new Set(offer).size).toBe(3);
      expect(offer.every((id) => GIFTS[id].tier === 'gold' && !held.has(id))).toBe(true);
      expect(offer.filter(isCrest).length).toBeLessThanOrEqual(1);
    }
  });

  it('hold fewer when too few are left', () => {
    const silver = GIFT_IDS.filter((id) => GIFTS[id].tier === 'silver');
    expect(rollGiftOffer('silver', new Set(silver.slice(2)), createRng(1)).sort()).toEqual(silver.slice(0, 2).sort());
  });

  it('are rerolled once, to Gifts other than the ones shown or held', () => {
    const { player } = setup();
    hold(player, 'bilbos-purse');
    player.offerGifts('silver');
    const first = [...player.giftOffer!];
    expect(first).not.toContain('bilbos-purse');
    expect(player.rerollGifts()).toEqual({ ok: true });
    expect(player.giftOffer!.some((id) => first.includes(id) || id === 'bilbos-purse')).toBe(false);
    expect(player.rerollGifts()).toEqual({ ok: false, reason: 'This offer has been rerolled already.' });
    player.offerGifts('gold');
    expect(player.giftRerolled).toBe(false);
  });

  it('are picked once, and refuse a missing offer or option', () => {
    const { player } = setup();
    expect(player.pickGift(0).ok).toBe(false);
    expect(player.rerollGifts().ok).toBe(false);
    player.offerGifts('silver');
    const chosen = player.giftOffer![1]!;
    expect(player.pickGift(3).ok).toBe(false);
    expect(player.pickGift(1)).toEqual({ ok: true });
    expect(player.gifts).toEqual([chosen]);
    expect(player.giftOffer).toBeNull();
    expect(player.pickGift(0).ok).toBe(false);
  });

  it('are picked at random when left', () => {
    const { player } = setup();
    player.offerGifts('mithril');
    const offer = [...player.giftOffer!];
    player.autoPickGift();
    expect(offer).toContain(player.gifts[0]);
    expect(player.giftOffer).toBeNull();
  });
});

describe('gift rewards', () => {
  /** Picks a Gift by offering exactly it. */
  function take(player: Player, gift: GiftId): void {
    player.giftOffer = [gift];
    expect(player.pickGift(0)).toEqual({ ok: true });
  }

  it('give gold, components and combined items right away', () => {
    const { player } = setup(3);
    take(player, 'bilbos-purse');
    expect(player.gold).toBe(15);
    take(player, 'pocketses');
    take(player, 'celebrimbors-forge');
    expect(player.items).toHaveLength(4);
    expect(player.items.slice(0, 2).every(isComponent)).toBe(true);
    expect(player.items.slice(2).some(isComponent)).toBe(false);
  });

  it('give units from the pool, falling back to a lower cost, and sell those with no room', () => {
    const { player, pool } = setup();
    take(player, 'muster-of-rohan');
    const units = player.bench.filter((u) => u !== null);
    expect(units.map((u) => UNITS[u.unitId].cost)).toEqual([3, 3]);
    // Empty the 5-cost pool: Return of the King gives a 4-cost.
    for (const id of Object.keys(UNITS) as UnitId[]) if (UNITS[id].cost === 5) pool.take(id, pool.count(id));
    take(player, 'return-of-the-king');
    expect(player.bench.filter((u) => u !== null).map((u) => UNITS[u.unitId].cost)).toEqual([3, 3, 4]);
    // A full bench: the unit is sold at once.
    const full = setup();
    for (let slot = 0; slot < 9; slot++) {
      full.pool.take('gimli', copiesIn(1));
      full.player.bench[slot] = { id: 100 + slot, unitId: slot % 2 === 0 ? 'gimli' : 'legolas', star: 1, items: [] };
    }
    const before = full.pool.countOfCost(5);
    take(full.player, 'return-of-the-king');
    expect(full.player.gold).toBe(5);
    expect(full.pool.countOfCost(5)).toBe(before);
  });

  it('give free rerolls each round, used before gold', () => {
    const { player } = setup(4);
    hold(player, 'second-breakfast');
    player.startRound();
    expect(player.freeRerolls).toBe(1);
    expect(player.reroll().ok).toBe(true);
    expect([player.gold, player.freeRerolls]).toEqual([4, 0]);
    expect(player.reroll().ok).toBe(true);
    expect(player.gold).toBe(2);
  });

  it('raise interest and shop odds', () => {
    const { player } = setup(80);
    hold(player, 'treasure-of-erebor');
    player.collectIncome(0);
    expect(player.gold).toBe(88);
    // Level 2 shops only show 1-costs; with the Mirror they roll with level 3 odds.
    const costs = (gifts: GiftId[]) => {
      const { player: p } = setup();
      hold(p, ...gifts);
      p.level = 2;
      const seen = new Set<number>();
      for (let i = 0; i < 20; i++) {
        p.returnShop();
        p.rollShop();
        for (const id of p.shop) if (id !== null) seen.add(UNITS[id].cost);
      }
      return [...seen].sort();
    };
    expect(costs([])).toEqual([1]);
    expect(costs(['mirror-of-galadriel'])).toEqual([1, 2]);
  });
});

describe('gifts in the game', () => {
  it('are offered at 2-1, 3-2 and 4-2 only, Silver, Gold and Mithril', () => {
    const game = createGame({ seed: 3, players: 2 });
    const seen: string[] = [];
    while (!game.isOver() && game.state.stage < 5) {
      const p = game.state.players[0]!;
      if (game.state.phase === 'planning' && p.giftOffer !== null) {
        seen.push(`${game.state.stage}-${game.state.round} ${GIFTS[p.giftOffer[0]!].tier}`);
      }
      game.advance();
    }
    expect(seen).toEqual(['2-1 silver', '3-2 gold', '4-2 mithril']);
  });

  it('take a random Gift when planning ends, and go into the fights', () => {
    const game = createGame({ seed: 4, players: 2 });
    skipTo(game, 2, 1);
    expect(game.act(0, { type: 'gift', option: 0 }).ok).toBe(true);
    const offered = [...game.state.players[1]!.giftOffer!];
    const report = game.advance()!;
    const p1 = game.state.players[1]!;
    expect(p1.gifts).toHaveLength(1);
    expect(offered).toContain(p1.gifts[0]);
    const fight = report.fights[0]!;
    expect(fight.input.gifts).toEqual({ A: [...game.state.players[fight.home]!.gifts], B: [...game.state.players[fight.away!]!.gifts] });
  });

  it('give more XP each round with The Road Goes Ever On', () => {
    const game = createGame({ seed: 5, players: 2 });
    skipTo(game, 2, 1);
    const p = game.state.players[0] as Player;
    p.giftOffer = ['road-goes-ever-on'];
    game.act(0, { type: 'gift', option: 0 });
    // 2 passive XP and 2 from the Gift at the start of 2-2, short of level 4's 6.
    p.xp = 0;
    game.advance();
    expect([p.level, p.xp]).toEqual([3, 4]);
  });

  it('are picked by bots', () => {
    const game = createGame({ seed: 6, players: 4 });
    const bots = [0, 1, 2, 3].map((seat) => new Bot(seat, 6));
    skipTo(game, 2, 1);
    for (const bot of bots) bot.plan(game);
    for (const p of game.state.players) {
      expect(p.giftOffer).toBeNull();
      expect(p.gifts).toHaveLength(1);
    }
  });
});
