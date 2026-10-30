// Golden hashes: one for each kind of fight, and one for whole bot games. A change that shouldn't
// alter fights or games must leave them all as they are. A change that means to alter them
// updates the hashes (vitest -u), and the diff shows which kinds of fight it altered.

import { describe, expect, it } from 'vitest';
import { playBotGame } from '../src/bots/bot.js';
import { simulateCombat, type CombatInput, type PlacedUnit } from '../src/combat/combat.js';
import { RING_OF_POWER_IDS } from '../src/combat/items.js';
import { hasTrait } from '../src/combat/traits.js';
import { GIFTS, GIFT_IDS, type GiftId } from '../src/data/gifts.js';
import { PVE_ROUNDS } from '../src/data/pve.js';
import { TRAITS, type TraitId } from '../src/data/traits.js';
import { UNITS } from '../src/data/units.js';
import { UNIT_IDS } from '../src/game/pool.js';
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

/** Gifts that act in fights, apart from the crests. */
const FIGHT_GIFTS = GIFT_IDS.filter((id) => GIFTS[id].combat !== undefined && GIFTS[id].combat.crest === undefined);

/** Crest Gifts, each with the trait it counts towards. */
const CRESTS = GIFT_IDS.flatMap((id) => {
  const crest = GIFTS[id].combat?.crest;
  return crest === undefined ? [] : [{ id, trait: crest }];
});

/**
 * Team A for a crest: one unit short of its trait's second breakpoint, so the trait is active with
 * at least two units holding it (Rohan acts only on the others) and the crest raises its level,
 * then two units without the trait next to them, for traits such as Captain that act on
 * neighbours.
 */
function crestBoard(trait: TraitId): PlacedUnit[] {
  const breakpoint = TRAITS[trait].breakpoints[1]!;
  const holders = UNIT_IDS.filter((id) => hasTrait(UNITS[id], trait)).slice(0, breakpoint - 1);
  const others = UNIT_IDS.filter((id) => !hasTrait(UNITS[id], trait)).slice(0, 2);
  return [...holders, ...others].map((id, col) => placed(id, col, 3));
}

/** A crest's fights against the full board, with the crest or without it. */
function crestFights(crest: { id: GiftId; trait: TraitId }, withCrest: boolean): CombatInput[] {
  return [1, 2, 3].map((seed) => ({ ...input(crestBoard(crest.trait), BOARDS.full, seed), gifts: { A: withCrest ? [crest.id] : [], B: [] } }));
}

/** Every PvE round's monsters against two boards, at each stage the round comes in: the later round at two, so monsters grow. */
function monsterFights(): CombatInput[] {
  return Object.entries(PVE_ROUNDS).flatMap(([key, round]) => {
    const monsters = round.monsters.map((m): PlacedUnit => ({ ...m, star: 1, items: [] }));
    const stages = key === 'later' ? [6, 8] : [Number(key.split('-')[0])];
    return stages.flatMap((stage) =>
      [BOARDS.tanks, BOARDS.full].flatMap((board) => [1, 2, 3].map((seed) => ({ ...input(board, monsters, seed), stage }))),
    );
  });
}

describe('golden hashes', () => {
  it('cover every crest Gift and the monsters growing, which change their fights', () => {
    for (const crest of CRESTS) expect(hashFights(crestFights(crest, true)), crest.id).not.toBe(hashFights(crestFights(crest, false)));
    const later = PVE_ROUNDS.later.monsters.map((m): PlacedUnit => ({ ...m, star: 1, items: [] }));
    const at = (stage: number) => hashFights([{ ...input(BOARDS.full, later, 1), stage }]);
    expect(at(8)).not.toBe(at(6));
  });

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
        FIGHT_GIFTS.flatMap((id) => [1, 2, 3].map((seed) => ({ ...input(BOARDS.traits, BOARDS.full, seed), gifts: { A: [id], B: [] } }))),
      ),
      crests: hashFights(CRESTS.flatMap((crest) => crestFights(crest, true))),
      monsters: hashFights(monsterFights()),
    };
    expect(hashes).toMatchInlineSnapshot(`
      {
        "crests": "78e6c4da",
        "gifts": "3a4677cc",
        "itemsAgainstTraits": "e0a9aead",
        "mirrors": "a478804a",
        "monsters": "455ff409",
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
      const ringSupply = RING_OF_POWER_IDS.map((id) => game.state.ringSupply.count(id));
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
