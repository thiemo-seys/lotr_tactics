// Golden hashes: one for each kind of fight, and one for whole bot games. A change that shouldn't
// alter fights or games must leave them all as they are. A change that means to alter them
// updates the hashes (vitest -u), and the diff shows which kinds of fight it altered.

import { describe, expect, it } from 'vitest';
import { playBotGame } from '../src/bots/bot.js';
import { simulateCombat, type CombatInput, type PlacedUnit } from '../src/combat/combat.js';
import { RING_OF_POWER_IDS } from '../src/combat/items.js';
import { GIFTS, GIFT_IDS } from '../src/data/gifts.js';
import { PVE_ROUNDS } from '../src/data/pve.js';
import { BOARDS, hash, hashEvents, input, mirrorMatch, placed } from './helpers.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** One hash for the event logs of a list of fights. */
function hashFights(fights: readonly CombatInput[]): string {
  return hash(fights.map((fight) => hashEvents(simulateCombat(fight).events)).join(','));
}

/** Aragorn bears the One Ring, with Sam next to him or not. */
function ringBoard(corruption: number, sam: boolean): PlacedUnit[] {
  return [
    { ...placed('aragorn', 3, 3), ring: corruption },
    ...(sam ? [placed('sam', 2, 3)] : []),
    placed('gimli', 4, 3),
    placed('legolas', 1, 0),
    placed('gandalf', 4, 0),
  ];
}

/** The Three on their own bearers, a Ring of the Seven, and two Rings of the Nine. */
const RINGS_OF_POWER: PlacedUnit[] = [
  placed('gimli', 2, 3, 1, ['ring-of-the-seven']),
  placed('boromir', 3, 3, 1, ['ring-of-the-nine']),
  placed('theoden', 4, 3, 1, ['ring-of-the-nine']),
  placed('ringwraith', 3, 2),
  placed('galadriel', 2, 0, 1, ['nenya']),
  placed('gandalf', 3, 0, 1, ['narya']),
  placed('elrond', 4, 0, 1, ['vilya']),
];

/** Units holding several items that act at the same moment, so the order they act in shows. */
const STACKED: PlacedUnit[] = [
  placed('gimli', 3, 3, 1, ['elven-cloak', 'dragon-helm', 'vilya']),
  placed('dain', 2, 3, 1, ['star-of-elendil', 'kings-banner', 'nenya']),
  placed('beregond', 4, 3, 1, ['orcrist', 'herugrim', 'oakenshield']),
  placed('theoden', 2, 2, 1, ['miruvor', 'ring-of-the-nine', 'elven-cloak']),
  placed('aragorn', 3, 2, 1, ['glamdring', 'anduril', 'black-arrow']),
  placed('boromir', 5, 2, 1, ['phial', 'mithril-shirt', 'elven-rope']),
  placed('legolas', 1, 0, 1, ['galadhrim-bow', 'grond', 'palantir']),
  placed('gandalf', 3, 0, 1, ['athelas', 'sting', 'narya']),
];

describe('golden hashes', () => {
  it('of fights', () => {
    const hashes = {
      mirrors: hashFights(Object.values(BOARDS).flatMap((board) => SEEDS.map((seed) => mirrorMatch(board, seed)))),
      itemsAgainstTraits: hashFights(SEEDS.map((seed) => input(BOARDS.items, BOARDS.traits, seed))),
      oneRing: hashFights(
        [true, false].flatMap((sam) =>
          [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((corruption) => [
            input(ringBoard(corruption, sam), BOARDS.full, corruption + 1),
            input(BOARDS.full, ringBoard(corruption, sam), corruption + 1),
          ]),
        ),
      ),
      ringsOfPower: hashFights(
        [0, 6].flatMap((oneRingCorruption) =>
          SEEDS.slice(0, 5).map((seed) => ({ ...input(RINGS_OF_POWER, BOARDS.full, seed), oneRingCorruption })),
        ),
      ),
      stackedItems: hashFights(SEEDS.flatMap((seed) => [mirrorMatch(STACKED, seed), input(STACKED, BOARDS.items, seed)])),
      gifts: hashFights(
        GIFT_IDS.filter((id) => GIFTS[id].combat !== undefined).flatMap((id) =>
          [1, 2, 3].map((seed) => ({ ...input(BOARDS.traits, BOARDS.full, seed), gifts: { A: [id], B: [] } })),
        ),
      ),
      monsters: hashFights(
        Object.entries(PVE_ROUNDS).flatMap(([key, round]) => {
          const monsters = round.monsters.map((m): PlacedUnit => ({ ...m, star: 1, items: [] }));
          const stage = key === 'later' ? 6 : Number(key.split('-')[0]);
          return [BOARDS.tanks, BOARDS.full].flatMap((board) => [1, 2, 3].map((seed) => ({ ...input(board, monsters, seed), stage })));
        }),
      ),
    };
    expect(hashes).toMatchInlineSnapshot(`
      {
        "gifts": "8a2db844",
        "itemsAgainstTraits": "e0a9aead",
        "mirrors": "a478804a",
        "monsters": "53205603",
        "oneRing": "a839fa51",
        "ringsOfPower": "e47b81b7",
        "stackedItems": "726a5448",
      }
    `);
  });

  it('of bot games', { timeout: 60_000 }, () => {
    const games = [1, 2, 3].map((seed) => {
      const { game, reports } = playBotGame(seed);
      const rounds = reports.map((r) => ({
        ...r,
        // The fight hashes above cover the events.
        fights: r.fights.map(({ result, ...fight }) => ({ ...fight, result: { ...result, events: undefined } })),
      }));
      const players = game.state.players.map((p) => ({
        seat: p.seat,
        hp: p.hp,
        gold: p.gold,
        level: p.level,
        board: p.board,
        bench: p.bench,
        items: p.items,
        gifts: p.gifts,
        placement: p.placement,
      }));
      const { state, holder, bearer, corruption, hobbitFights } = game.state.ring;
      const ring = { state, holder, bearer, corruption, hobbitFights };
      const ringSupply = RING_OF_POWER_IDS.map((id) => game.state.ringSupply[id]);
      return hash(JSON.stringify({ rounds, players, ring, ringSupply }));
    });
    expect(games).toMatchInlineSnapshot(`
      [
        "e62c64d1",
        "8ded05a3",
        "b01f082",
      ]
    `);
  });
});
