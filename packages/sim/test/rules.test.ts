// Whether an action is allowed (docs/game-spec.md section 9.3), checked on plain views without a game.

import { describe, expect, it } from 'vitest';
import { PLAYER, SHOP, XP } from '../src/data/economy.js';
import { RING } from '../src/data/ring.js';
import type { ItemId } from '../src/data/items.js';
import type { UnitId } from '../src/data/units.js';
import type { Action, CouncilState } from '../src/game/game.js';
import { BOARD_COLS } from '../src/hex.js';
import { TEAM_ROWS, type OwnedUnit } from '../src/game/places.js';
import type { PlayerView } from '../src/game/player.js';
import type { RingView } from '../src/game/ring.js';
import { checkAction, type ActionContext } from '../src/game/rules.js';

const NO_RING: RingView = { state: 'waiting', holder: null, bearer: null, corruption: 0, hobbitFights: 0 };
const PLANNING: ActionContext = { phase: 'planning', council: null, ring: NO_RING };

const owned = (id: number, unitId: UnitId, items: ItemId[] = []): OwnedUnit => ({ id, unitId, star: 1, items });

/** Seat 0 at level 5 with 10 gold, Sam in shop slot 0, and nothing owned. */
function view(changes: Partial<PlayerView> = {}): PlayerView {
  return {
    seat: 0,
    hp: 100,
    gold: 10,
    level: 5,
    xp: 0,
    streak: 0,
    bench: new Array<OwnedUnit | null>(PLAYER.benchSize).fill(null),
    board: new Array<OwnedUnit | null>(BOARD_COLS * TEAM_ROWS).fill(null),
    shop: ['sam', null, null, null, null],
    shopLocked: false,
    items: [],
    gifts: [],
    giftOffer: null,
    giftRerolled: false,
    freeRerolls: 0,
    recentOpponents: [],
    placement: null,
    ...changes,
  };
}

/** A board with units on its first places. */
function board(...units: OwnedUnit[]): (OwnedUnit | null)[] {
  const places = new Array<OwnedUnit | null>(BOARD_COLS * TEAM_ROWS).fill(null);
  units.forEach((u, i) => (places[i] = u));
  return places;
}

/** The reason an action is refused, or 'ok'. */
function reason(player: PlayerView, action: Action, context: ActionContext = PLANNING): string {
  const result = checkAction(player, context, action);
  return result.ok ? 'ok' : result.reason;
}

describe('checking actions', () => {
  it('needs a player still in the game, and planning for anything but a pick', () => {
    expect(reason(view({ placement: 3 }), { type: 'reroll' })).toBe('That player is out of the game.');
    expect(reason(view(), { type: 'reroll' }, { ...PLANNING, phase: 'council' })).toBe('Units can only be bought and moved during planning.');
    expect(reason(view(), { type: 'fly' } as unknown as Action)).toBe('Unknown action.');
    expect(reason(view(), null as unknown as Action)).toBe('Unknown action.');
  });

  it('buys with the gold and a free bench slot, or a merge', () => {
    expect(reason(view(), { type: 'buy', slot: SHOP.size })).toBe('There is no such shop slot.');
    expect(reason(view(), { type: 'buy', slot: 0.5 })).toBe('There is no such shop slot.');
    expect(reason(view(), { type: 'buy', slot: 1 })).toBe('That shop slot is empty.');
    expect(reason(view({ gold: 0 }), { type: 'buy', slot: 0 })).toBe('Not enough gold.');
    const full = new Array<OwnedUnit | null>(PLAYER.benchSize).fill(null).map((_, i) => owned(i, 'merry'));
    expect(reason(view({ bench: full }), { type: 'buy', slot: 0 })).toBe('The bench is full.');
    // Two 1★ Sams, one on the board and one on the bench, merge with a third.
    const sams = [owned(100, 'sam'), ...full.slice(1)];
    expect(reason(view({ bench: sams, board: board(owned(101, 'sam')) }), { type: 'buy', slot: 0 })).toBe('ok');
  });

  it('moves a bench unit to a free board place only below the level’s limit', () => {
    const p = view({ level: 1, board: board(owned(1, 'sam')), bench: [owned(2, 'merry'), ...view().bench.slice(1)] });
    expect(reason(p, { type: 'move', from: { bench: 0 }, to: { col: 3, row: 3 } })).toBe('The board is full for this level.');
    expect(reason(p, { type: 'move', from: { bench: 0 }, to: { col: 0, row: 0 } })).toBe('ok');
    expect(reason(p, { type: 'move', from: { bench: 1 }, to: { col: 0, row: 0 } })).toBe('There is no unit there.');
    expect(reason(p, { type: 'sell', from: { col: 0, row: TEAM_ROWS } })).toBe('There is no such place.');
  });

  it('rerolls free or for gold, and buys XP from level 3 below the top', () => {
    expect(reason(view({ gold: SHOP.rerollCost - 1 }), { type: 'reroll' })).toBe('Not enough gold.');
    expect(reason(view({ gold: 0, freeRerolls: 1 }), { type: 'reroll' })).toBe('ok');
    expect(reason(view({ level: XP.buyFromLevel - 1 }), { type: 'buyXp' })).toBe(`XP can be bought from level ${XP.buyFromLevel}.`);
    expect(reason(view({ level: PLAYER.maxLevel }), { type: 'buyXp' })).toBe('Already at the top level.');
    expect(reason(view({ gold: XP.buyCost - 1 }), { type: 'buyXp' })).toBe('Not enough gold.');
    expect(reason(view(), { type: 'lock', locked: 'yes' as unknown as boolean })).toBe('The lock must be on or off.');
  });

  it('gives items a unit can take: three at most, one Ring of Power, and a component that combines', () => {
    const items: ItemId[] = ['bow', 'narya', 'nenya'];
    const p = view({ items, board: board(owned(1, 'sam', ['blade', 'anduril', 'sting']), owned(2, 'merry', ['vilya'])) });
    const sam = { col: 0, row: 0 };
    const merry = { col: 1, row: 0 };
    expect(reason(p, { type: 'equip', item: 3, to: sam })).toBe('There is no such item.');
    expect(reason(p, { type: 'equip', item: 0, to: sam })).toBe('ok');
    expect(reason(p, { type: 'equip', item: 1, to: sam })).toBe('A unit can hold at most 3 items.');
    expect(reason(p, { type: 'equip', item: 1, to: merry })).toBe('A unit can wear only one Ring of Power.');
  });

  it('picks and rerolls Gifts only from an offer, rerolling once', () => {
    expect(reason(view(), { type: 'gift', option: 0 })).toBe('There is no Gift to pick.');
    expect(reason(view(), { type: 'rerollGifts' })).toBe('There is no Gift to reroll.');
    const offered = view({ giftOffer: ['bilbos-purse', 'pocketses'] });
    expect(reason(offered, { type: 'gift', option: 2 })).toBe('There is no such Gift.');
    expect(reason(offered, { type: 'gift', option: 1 })).toBe('ok');
    expect(reason({ ...offered, giftRerolled: true }, { type: 'rerollGifts' })).toBe('This offer has been rerolled already.');
  });

  it('takes the One Ring to Mount Doom only on a Hobbit, after enough Hobbit fights', () => {
    const p = view({ board: board(owned(1, 'gimli')), bench: [owned(2, 'frodo'), ...view().bench.slice(1)] });
    const held = (bearer: number, hobbitFights: number = RING.destroy.hobbitFights): ActionContext => ({
      ...PLANNING,
      ring: { state: 'held', holder: 0, bearer, corruption: 2, hobbitFights },
    });
    expect(reason(p, { type: 'destroyRing' })).toBe("You don't hold the One Ring.");
    expect(reason(p, { type: 'destroyRing' }, held(1))).toBe('Only a Hobbit can carry the Ring to Mount Doom.');
    expect(reason(p, { type: 'destroyRing' }, held(2, RING.destroy.hobbitFights - 1))).toBe(
      `Hobbits must carry the Ring through ${RING.destroy.hobbitFights} fights first.`,
    );
    expect(reason(p, { type: 'destroyRing' }, held(2))).toBe('ok');
    expect(reason(p, { type: 'ring', to: { bench: 0 } }, held(1))).toBe('ok');
    expect(reason(p, { type: 'ring', to: { bench: 1 } }, held(1))).toBe('There is no unit there.');
  });

  it('picks at the Council in the player’s group’s turn, once, an option still there', () => {
    const option = (pickedBy: number | null) => ({ unitId: 'sam' as const, item: 'blade' as const, ring: false, pickedBy });
    const council = (options: CouncilState['options'], group = 0): ActionContext => ({
      phase: 'council',
      council: { options, groups: [[0, 1], [2, 3]], group },
      ring: NO_RING,
    });
    expect(reason(view(), { type: 'pick', option: 0 })).toBe('There is no Council now.');
    expect(reason(view(), { type: 'pick', option: 0 }, council([option(null)], 1))).toBe("It isn't your turn to pick.");
    expect(reason(view(), { type: 'pick', option: 1 }, council([option(0), option(null)]))).toBe('You have already picked.');
    expect(reason(view(), { type: 'pick', option: 0 }, council([option(1), option(null)]))).toBe('That option has been taken.');
    expect(reason(view(), { type: 'pick', option: 2 }, council([option(1), option(null)]))).toBe('There is no such option.');
    expect(reason(view(), { type: 'pick', option: 1 }, council([option(1), option(null)]))).toBe('ok');
  });
});
