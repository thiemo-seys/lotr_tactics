// Whether a player may take an action now, and why not (docs/game-spec.md section 9.3). Pure
// functions of what the player can see, so the game, the bots and the client all ask the same
// rules.

import { combine, isComponent, isRingOfPower } from '../combat/items.js';
import { PLAYER, SHOP, XP } from '../data/economy.js';
import { MAX_ITEMS, type ComponentId, type ItemId } from '../data/items.js';
import { RING } from '../data/ring.js';
import { UNITS } from '../data/units.js';
import type { Action, CouncilState, Phase } from './game.js';
import { isIndex, isPlace, ownedUnits, unitAt, type Place } from './places.js';
import type { PlayerView } from './player.js';
import type { RingView } from './ring.js';

export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export const OK: ActionResult = { ok: true };

export function fail(reason: string): ActionResult {
  return { ok: false, reason };
}

/** What the rules need to know about the game, beyond the player. */
export interface ActionContext {
  readonly phase: Phase;
  readonly council: CouncilState | null;
  readonly ring: RingView;
}

/** Whether a player may take an action now, and why not. The game applies only actions that pass. */
export function checkAction(player: PlayerView, context: ActionContext, action: Action): ActionResult {
  if (player.placement !== null) return fail('That player is out of the game.');
  if (typeof action !== 'object' || action === null) return fail('Unknown action.');
  if (action.type === 'pick') return checkPick(player, context, action.option);
  if (context.phase !== 'planning') return fail('Units can only be bought and moved during planning.');
  switch (action.type) {
    case 'buy':
      return checkBuy(player, action.slot);
    case 'sell':
      return checkSell(player, action.from);
    case 'move':
      return checkMove(player, action.from, action.to);
    case 'reroll':
      return checkReroll(player);
    case 'buyXp':
      return checkBuyXp(player);
    case 'lock':
      return checkLock(action.locked);
    case 'equip':
      return checkEquip(player, action.item, action.to);
    case 'gift':
      return checkGift(player, action.option);
    case 'rerollGifts':
      return checkRerollGifts(player);
    case 'ring':
      return checkGiveRing(player, context.ring, action.to);
    case 'destroyRing':
      return checkDestroyRing(player, context.ring);
    default:
      return fail('Unknown action.');
  }
}

/** A Council pick (section 9.6): in the player's group's turn, once, of an option still there. */
export function checkPick(player: PlayerView, { phase, council }: ActionContext, option: number): ActionResult {
  if (phase !== 'council' || council === null) return fail('There is no Council now.');
  if (!council.groups[council.group]!.includes(player.seat)) return fail("It isn't your turn to pick.");
  if (council.options.some((o) => o.pickedBy === player.seat)) return fail('You have already picked.');
  const chosen = Number.isInteger(option) ? council.options[option] : undefined;
  if (chosen === undefined) return fail('There is no such option.');
  if (chosen.pickedBy !== null) return fail('That option has been taken.');
  return OK;
}

/** Buying needs the gold, and a free bench slot unless the unit merges with two 1★ copies (section 7.2). */
export function checkBuy(player: PlayerView, slot: number): ActionResult {
  if (!isIndex(slot, SHOP.size)) return fail('There is no such shop slot.');
  const unitId = player.shop[slot];
  if (unitId === null || unitId === undefined) return fail('That shop slot is empty.');
  if (player.gold < UNITS[unitId].cost) return fail('Not enough gold.');
  const merges = ownedUnits(player).filter(({ unit }) => unit.unitId === unitId && unit.star === 1).length >= 2;
  if (!player.bench.includes(null) && !merges) return fail('The bench is full.');
  return OK;
}

export function checkSell(player: PlayerView, from: Place): ActionResult {
  if (!isPlace(from)) return fail('There is no such place.');
  if (unitAt(player, from) === null) return fail('There is no unit there.');
  return OK;
}

/** Units can swap anywhere, but a bench unit can only go to a free board place below the level's limit. */
export function checkMove(player: PlayerView, from: Place, to: Place): ActionResult {
  if (!isPlace(from) || !isPlace(to)) return fail('There is no such place.');
  if (unitAt(player, from) === null) return fail('There is no unit there.');
  const fielded = player.board.filter((u) => u !== null).length;
  if (unitAt(player, to) === null && 'bench' in from && !('bench' in to) && fielded >= player.level) {
    return fail('The board is full for this level.');
  }
  return OK;
}

/** A free reroll from a Gift, or the reroll cost. */
export function checkReroll(player: PlayerView): ActionResult {
  return player.freeRerolls > 0 || player.gold >= SHOP.rerollCost ? OK : fail('Not enough gold.');
}

export function checkBuyXp(player: PlayerView): ActionResult {
  if (player.level < XP.buyFromLevel) return fail(`XP can be bought from level ${XP.buyFromLevel}.`);
  if (player.level >= PLAYER.maxLevel) return fail('Already at the top level.');
  if (player.gold < XP.buyCost) return fail('Not enough gold.');
  return OK;
}

export function checkLock(locked: unknown): ActionResult {
  return typeof locked === 'boolean' ? OK : fail('The lock must be on or off.');
}

/** Giving one of the player's items to a unit on the bench or the board (section 7.7). */
export function checkEquip(player: PlayerView, item: number, to: Place): ActionResult {
  if (!isIndex(item, player.items.length)) return fail('There is no such item.');
  if (!isPlace(to)) return fail('There is no such place.');
  const unit = unitAt(player, to);
  if (unit === null) return fail('There is no unit there.');
  const given = player.items[item]!;
  if (isRingOfPower(given) && unit.items.some(isRingOfPower)) return fail('A unit can wear only one Ring of Power.');
  if (addItem(unit.items, given) === null) return fail(`A unit can hold at most ${MAX_ITEMS} items.`);
  return OK;
}

/** Taking one of the Gifts on offer (section 9.10). */
export function checkGift(player: PlayerView, option: number): ActionResult {
  const offer = player.giftOffer;
  if (offer === null) return fail('There is no Gift to pick.');
  if ((Number.isInteger(option) ? offer[option] : undefined) === undefined) return fail('There is no such Gift.');
  return OK;
}

/** One reroll per offer. */
export function checkRerollGifts(player: PlayerView): ActionResult {
  if (player.giftOffer === null) return fail('There is no Gift to reroll.');
  if (player.giftRerolled) return fail('This offer has been rerolled already.');
  return OK;
}

/** The One Ring's holder gives it to any unit it owns (section 9.11). */
export function checkGiveRing(player: PlayerView, ring: RingView, to: Place): ActionResult {
  if (ring.state !== 'held' || ring.holder !== player.seat) return fail("You don't hold the One Ring.");
  if (!isPlace(to)) return fail('There is no such place.');
  if (unitAt(player, to) === null) return fail('There is no unit there.');
  return OK;
}

/** Mount Doom (section 9.11): the holder's bearer is a Hobbit, after enough fights borne by Hobbits. */
export function checkDestroyRing(player: PlayerView, ring: RingView): ActionResult {
  if (ring.state !== 'held' || ring.holder !== player.seat) return fail("You don't hold the One Ring.");
  const bearer = ownedUnits(player).find(({ unit }) => unit.id === ring.bearer)?.unit;
  if (bearer === undefined || UNITS[bearer.unitId].origin !== 'hobbit') return fail('Only a Hobbit can carry the Ring to Mount Doom.');
  if (ring.hobbitFights < RING.destroy.hobbitFights) return fail(`Hobbits must carry the Ring through ${RING.destroy.hobbitFights} fights first.`);
  return OK;
}

/**
 * A unit's items after it is given one (section 7.7): a component combines with a lone component
 * the unit holds, taking its place; otherwise the item goes at the end, if the unit holds fewer
 * than 3. Null if the unit can't take it, which includes a second Ring of Power (section 9.12).
 */
export function addItem(held: readonly ItemId[], item: ItemId): ItemId[] | null {
  if (isRingOfPower(item) && held.some(isRingOfPower)) return null;
  const lone = held.findIndex(isComponent);
  if (isComponent(item) && lone >= 0) {
    const items = [...held];
    items[lone] = combine(held[lone] as ComponentId, item);
    return items;
  }
  return held.length < MAX_ITEMS ? [...held, item] : null;
}
