// One player's bench, board, shop, gold and XP (docs/game-spec.md sections 5–8).

import type { PlacedUnit } from '../combat/combat.js';
import { COMBINED_ITEM_IDS, combine, isRingOfPower, itemEffects } from '../combat/items.js';
import { INCOME, PLAYER, SHOP, STREAK_GOLD, XP } from '../data/economy.js';
import { GIFTS, type GiftId, type GiftTier } from '../data/gifts.js';
import { COMPONENTS, type ComponentId, type ItemId, type RingOfPowerId } from '../data/items.js';
import { UNITS, type Cost, type UnitId } from '../data/units.js';
import { BOARD_COLS } from '../hex.js';
import { randomInt, type Rng } from '../rng.js';
import type { Star } from '../types.js';
import { giftBonus, rollGiftOffer } from './gifts.js';
import { TEAM_ROWS, boardPlace, boardSlot, placeOf, unitAt, type BoardPlace, type OwnedUnit, type Place } from './places.js';
import { copiesIn, type Pool } from './pool.js';
import type { Ring } from './ring.js';
import {
  OK,
  addItem,
  checkBuy,
  checkBuyXp,
  checkCombine,
  checkEquip,
  checkGift,
  checkLock,
  checkMove,
  checkReroll,
  checkRerollGifts,
  checkSell,
  type ActionResult,
} from './rules.js';

/** What a player shares with the rest of the game. */
export interface PlayerContext {
  readonly pool: Pool;
  nextUnitId(): number;
  /** The game's One Ring, if the game has one. */
  readonly ring?: Ring;
}

/** A read-only view of a player. */
export interface PlayerView {
  readonly seat: number;
  readonly hp: number;
  readonly gold: number;
  readonly level: number;
  /** XP towards the next level. */
  readonly xp: number;
  /** Consecutive PvP results: positive for wins, negative for losses. */
  readonly streak: number;
  readonly bench: readonly (OwnedUnit | null)[];
  /** Indexed by `boardSlot`, in the player's own perspective. */
  readonly board: readonly (OwnedUnit | null)[];
  /**
   * Units gained with no room on the bench, oldest first (section 7.2). Each goes to the bench, or
   * merges, as soon as it can.
   */
  readonly waiting: readonly UnitId[];
  readonly shop: readonly (UnitId | null)[];
  readonly shopLocked: boolean;
  /** Items not on a unit, in the order the player got them. */
  readonly items: readonly ItemId[];
  /** Gifts of Lothlórien picked so far, in order (section 9.10). */
  readonly gifts: readonly GiftId[];
  /** The Gifts on offer, or null when there is no offer. */
  readonly giftOffer: readonly GiftId[] | null;
  /** Whether the current offer has been rerolled. */
  readonly giftRerolled: boolean;
  /** Free rerolls left this round. */
  readonly freeRerolls: number;
  /** The last players fought, oldest first. */
  readonly recentOpponents: readonly number[];
  /** Set when the player is eliminated or wins. */
  readonly placement: number | null;
}

/** The order free board places are filled in before a fight (section 7.6). */
const FILL_ORDER: readonly BoardPlace[] = [3, 2, 1, 0].flatMap((row) =>
  [3, 2, 4, 1, 5, 0, 6].map((col) => ({ col, row })),
);

/** XP needed to reach the level after `level`, or null at the top level or before XP counts. */
export function xpForNextLevel(level: number): number | null {
  return XP.toLevel[level + 1] ?? null;
}

/** The level whose shop odds a player's shop rolls with: their level, plus one per Mirror of Galadriel, up to the top level (section 6.3). */
export function shopOddsLevel(level: number, gifts: readonly GiftId[]): number {
  return Math.min(level + giftBonus(gifts, 'shopLevels'), PLAYER.maxLevel);
}

/** The odds in percent that a shop slot shows a 1- to 5-cost unit, for a player of this level with these Gifts. */
export function shopOdds(level: number, gifts: readonly GiftId[]): readonly number[] {
  return SHOP.odds[shopOddsLevel(level, gifts) - 1]!;
}

/** Base income at the start of a PvP or PvE round (section 8.1). */
export function baseIncome(stage: number, round: number): number {
  return INCOME.base[`${stage}-${round}`] ?? INCOME.standard;
}

/** Bonus gold for a streak of this many results. */
export function streakGold(length: number): number {
  let gold = 0;
  for (const step of STREAK_GOLD) if (length >= step.from) gold = step.gold;
  return gold;
}

export class Player implements PlayerView {
  hp: number = PLAYER.startingHp;
  gold = 0;
  level = 1;
  xp = 0;
  streak = 0;
  readonly bench: (OwnedUnit | null)[] = new Array<OwnedUnit | null>(PLAYER.benchSize).fill(null);
  readonly board: (OwnedUnit | null)[] = new Array<OwnedUnit | null>(BOARD_COLS * TEAM_ROWS).fill(null);
  readonly waiting: UnitId[] = [];
  readonly shop: (UnitId | null)[] = new Array<UnitId | null>(SHOP.size).fill(null);
  shopLocked = false;
  readonly items: ItemId[] = [];
  readonly gifts: GiftId[] = [];
  giftOffer: GiftId[] | null = null;
  giftRerolled = false;
  freeRerolls = 0;
  readonly recentOpponents: number[] = [];
  placement: number | null = null;
  /** The tier of the current Gift offer. */
  private giftTier: GiftTier | null = null;

  constructor(
    readonly seat: number,
    private readonly context: PlayerContext,
    private readonly shopRng: Rng,
    private readonly giftRng: Rng,
  ) {}

  get eliminated(): boolean {
    return this.hp <= 0;
  }

  boardCount(): number {
    return this.board.filter((u) => u !== null).length;
  }

  // Actions (section 9.3). Each checks its rules in rules.ts, and returns ok: false and changes
  // nothing when it isn't allowed.

  /** `fighting` is true while the fights play, when copies on the board don't merge (section 9.4). */
  buy(slot: number, fighting = false): ActionResult {
    const check = checkBuy(this, slot, fighting);
    if (!check.ok) return check;
    const unitId = this.shop[slot]!;
    this.gold -= UNITS[unitId].cost;
    this.shop[slot] = null;
    this.gain(unitId, fighting);
    return OK;
  }

  /** `fighting` is true while the fights play, when units waiting for room don't merge with board copies. */
  sell(from: Place, fighting = false): ActionResult {
    const check = checkSell(this, from);
    if (!check.ok) return check;
    const unit = unitAt(this, from)!;
    this.setAt(from, null);
    this.release(unit);
    this.gold += UNITS[unit.unitId].cost * copiesIn(unit.star);
    this.items.push(...unit.items);
    // Selling the bearer leaves the Ring with the player, unworn.
    this.context.ring?.unitSold(this.seat, unit.id);
    this.placeWaiting(fighting);
    return OK;
  }

  /** `fighting` as for `sell`. */
  move(from: Place, to: Place, fighting = false): ActionResult {
    const check = checkMove(this, from, to);
    if (!check.ok) return check;
    const unit = unitAt(this, from)!;
    this.setAt(from, unitAt(this, to));
    this.setAt(to, unit);
    this.placeWaiting(fighting);
    return OK;
  }

  reroll(): ActionResult {
    const check = checkReroll(this);
    if (!check.ok) return check;
    if (this.freeRerolls > 0) this.freeRerolls--;
    else this.gold -= SHOP.rerollCost;
    this.returnShop();
    this.rollShop();
    return OK;
  }

  buyXp(): ActionResult {
    const check = checkBuyXp(this);
    if (!check.ok) return check;
    this.gold -= XP.buyCost;
    this.addXp(XP.buyAmount);
    return OK;
  }

  /** Gives one of the player's items to a unit on the bench or the board (section 7.7). */
  equip(item: number, to: Place): ActionResult {
    const check = checkEquip(this, item, to);
    if (!check.ok) return check;
    const unit = unitAt(this, to)!;
    const items = addItem(unit.items, this.items[item]!)!;
    this.items.splice(item, 1);
    this.setAt(to, { ...unit, items });
    return OK;
  }

  /** Combines two of the player's components: the item takes the place of the one at `other` (section 7.7). */
  combineItems(item: number, other: number): ActionResult {
    const check = checkCombine(this, item, other);
    if (!check.ok) return check;
    this.items[other] = combine(this.items[other] as ComponentId, this.items[item] as ComponentId);
    this.items.splice(item, 1);
    return OK;
  }

  /** Takes one of the Gifts on offer, and anything it gives right away (section 9.10). */
  pickGift(option: number): ActionResult {
    const check = checkGift(this, option);
    if (!check.ok) return check;
    const gift = this.giftOffer![option]!;
    this.giftOffer = null;
    this.giftTier = null;
    this.gifts.push(gift);
    this.receive(gift);
    return OK;
  }

  /** Replaces the Gifts on offer with new ones, once per offer. */
  rerollGifts(): ActionResult {
    const check = checkRerollGifts(this);
    if (!check.ok) return check;
    this.giftRerolled = true;
    // An offer always has its tier.
    this.giftOffer = rollGiftOffer(this.giftTier!, new Set([...this.gifts, ...this.giftOffer!]), this.giftRng);
    return OK;
  }

  setLock(locked: boolean): ActionResult {
    const check = checkLock(locked);
    if (!check.ok) return check;
    this.shopLocked = locked;
    return OK;
  }

  // Changes made by the game.

  /**
   * Gains a 1★ unit already taken from the pool (section 7.2): it merges with two copies the
   * player owns, or goes to the lowest free bench slot. With neither possible it waits for room,
   * behind any units already waiting. While the fights play (`fighting`), only copies on the bench
   * merge; the rest wait for `mergeWaiting`.
   */
  gain(unitId: UnitId, fighting = false): void {
    this.waiting.push(unitId);
    this.placeWaiting(fighting);
  }

  /**
   * Places the units waiting for room, oldest first, each that can merge or find a free bench
   * slot. A merge frees slots, so it goes round again until nothing more can be placed. While the
   * fights play (`fighting`), only copies on the bench merge.
   */
  placeWaiting(fighting = false): void {
    for (let i = 0; i < this.waiting.length; ) {
      if (this.place(this.waiting[i]!, fighting)) {
        this.waiting.splice(i, 1);
        i = 0;
      } else i++;
    }
  }

  /**
   * Makes the merges that waited for the fights to end (section 7.3): while any unit has three
   * copies at 1★ or 2★, the first three found merge, 1★ before 2★, units in the order `find` lists
   * their copies. The slots they free let units waiting for room in.
   */
  mergeWaiting(): void {
    for (;;) {
      const triple = this.firstTriple();
      if (triple === null) break;
      this.merge(triple.unitId, triple.star, triple.places);
    }
    this.placeWaiting();
  }

  private firstTriple(): { unitId: UnitId; star: Star; places: Place[] } | null {
    for (const star of [1, 2] as const) {
      for (const unit of [...this.board, ...this.bench]) {
        if (unit === null || unit.star !== star) continue;
        const places = this.find(unit.unitId, star);
        if (places.length >= 3) return { unitId: unit.unitId, star, places: places.slice(0, 3) };
      }
    }
    return null;
  }

  /** Puts the unbought shop units back in the pool. */
  returnShop(): void {
    this.shop.forEach((unitId, slot) => {
      if (unitId !== null) this.context.pool.put(unitId);
      this.shop[slot] = null;
    });
  }

  /** Fills every shop slot from the pool, with the odds of the level and any Mirror of Galadriel. The shop must be empty. */
  rollShop(): void {
    const level = shopOddsLevel(this.level, this.gifts);
    for (let slot = 0; slot < SHOP.size; slot++) this.shop[slot] = this.context.pool.rollShopSlot(level, this.shopRng);
  }

  /** Offers Gifts of a tier the player doesn't have (section 9.10). */
  offerGifts(tier: GiftTier): void {
    this.giftTier = tier;
    this.giftRerolled = false;
    this.giftOffer = rollGiftOffer(tier, new Set(this.gifts), this.giftRng);
  }

  /** Takes a random Gift from an offer left unpicked when planning ends. */
  autoPickGift(): void {
    if (this.giftOffer !== null && this.giftOffer.length > 0) this.pickGift(randomInt(this.giftRng, this.giftOffer.length));
  }

  /** The free rerolls and extra XP the player's Gifts give at the start of a round (section 9.2). */
  startRound(): void {
    this.freeRerolls = giftBonus(this.gifts, 'freeRerollsPerRound');
  }

  /** Extra XP each round from Gifts. */
  giftXp(): number {
    return giftBonus(this.gifts, 'xpPerRound');
  }

  /** Moves bench units to free board places until the board is full for the level (section 7.6). */
  fillBoard(): void {
    for (let slot = 0; slot < this.bench.length && this.boardCount() < this.level; slot++) {
      const unit = this.bench[slot]!;
      if (unit === null) continue;
      const place = FILL_ORDER.find((p) => unitAt(this, p) === null)!;
      this.bench[slot] = null;
      this.setAt(place, unit);
    }
    this.placeWaiting();
  }

  /** Interest on the gold held, then base income (section 8.1). */
  collectIncome(base: number): void {
    const maxInterest = INCOME.maxInterest + giftBonus(this.gifts, 'maxInterest');
    const interest = Math.min(maxInterest, Math.floor(this.gold / INCOME.goldPerInterest));
    this.gold += interest + base;
  }

  /**
   * Updates the streak after a PvP fight and returns the win and streak gold it earns, which the
   * game pays when the fight phase ends (section 8.2). A draw is a loss.
   */
  recordPvp(won: boolean): number {
    if (won) this.streak = this.streak > 0 ? this.streak + 1 : 1;
    else this.streak = this.streak < 0 ? this.streak - 1 : -1;
    return (won ? INCOME.pvpWin : 0) + streakGold(Math.abs(this.streak));
  }

  reachLevel(level: number): void {
    if (this.level < level) this.level = level;
  }

  /** Adds XP and levels up (section 8.3). There is no XP before level 3, and none past the top level. */
  addXp(amount: number): void {
    if (this.level < XP.buyFromLevel || this.level >= PLAYER.maxLevel) return;
    this.xp += amount;
    for (let need = xpForNextLevel(this.level); need !== null && this.xp >= need; need = xpForNextLevel(this.level)) {
      this.xp -= need;
      this.level++;
    }
    if (this.level >= PLAYER.maxLevel) this.xp = 0;
  }

  /** The board as fight input. The Ring's bearer carries its Corruption. */
  placements(): PlacedUnit[] {
    const placed: PlacedUnit[] = [];
    const ring = this.context.ring;
    this.board.forEach((unit, i) => {
      if (unit === null) return;
      const place = { unitId: unit.unitId, star: unit.star, ...boardPlace(i), items: [...unit.items] };
      placed.push(ring?.isBorneBy(this.seat, unit.id) === true ? { ...place, ring: ring.corruption } : place);
    });
    return placed;
  }

  /** The first owned unit with a unit id, at any star level: board places in order, then the bench. */
  firstOwned(unitId: UnitId): OwnedUnit | null {
    return [...this.board, ...this.bench].find((u) => u?.unitId === unitId) ?? null;
  }

  /** The first unit on the board with a unit id, in the order the board fills (section 7.6). */
  firstOnBoard(unitId: UnitId): OwnedUnit | null {
    for (const place of FILL_ORDER) {
      const unit = unitAt(this, place);
      if (unit?.unitId === unitId) return unit;
    }
    return null;
  }

  /** The Rings of Power the player has, in their items and on their units (section 9.12). */
  ringsOfPower(): RingOfPowerId[] {
    const units = [...this.board, ...this.bench].filter((u) => u !== null);
    return [...this.items, ...units.flatMap((u) => u.items)].filter(isRingOfPower);
  }

  /** Takes items out of the game: from the player's items and from every owned unit. */
  dropItems(drop: (item: ItemId) => boolean): void {
    const kept = this.items.filter((item) => !drop(item));
    this.items.splice(0, this.items.length, ...kept);
    for (const units of [this.bench, this.board]) {
      units.forEach((unit, i) => {
        if (unit !== null && unit.items.some(drop)) units[i] = { ...unit, items: unit.items.filter((item) => !drop(item)) };
      });
    }
  }

  /** The Seven's gold: for each Ring of the Seven on a board unit, more on its kin (section 9.12). */
  ringGold(): number {
    let gold = 0;
    for (const unit of this.board) {
      if (unit === null) continue;
      for (const { effect, pct } of itemEffects(unit.items, UNITS[unit.unitId].origin)) {
        if (effect.kind === 'goldPerRound') gold += Math.floor((effect.gold * pct) / 100);
      }
    }
    return gold;
  }

  /** Removes an owned unit for good: its copies go back to the pool and its items to the player. */
  remove(id: number): void {
    const place = placeOf(this, id);
    if (place === null) return;
    const unit = unitAt(this, place)!;
    this.setAt(place, null);
    this.release(unit);
    this.items.push(...unit.items);
    this.placeWaiting();
  }

  /** Puts every owned unit and the shop back in the pool, for an eliminated player. Their items are lost. */
  returnEverything(): void {
    for (const units of [this.bench, this.board]) {
      units.forEach((unit, i) => {
        if (unit !== null) this.release(unit);
        units[i] = null;
      });
    }
    for (const unitId of this.waiting) this.context.pool.put(unitId);
    this.waiting.length = 0;
    this.returnShop();
    this.items.length = 0;
    this.gifts.length = 0;
    this.giftOffer = null;
    this.giftTier = null;
  }

  // Internals

  /** What a Gift gives right away: gold, components, combined items and units (section 9.10). */
  private receive(gift: GiftId): void {
    const economy = GIFTS[gift].economy;
    if (economy === undefined) return;
    this.gold += economy.gold ?? 0;
    for (let i = 0; i < (economy.components ?? 0); i++) this.items.push(COMPONENTS[randomInt(this.giftRng, COMPONENTS.length)]!);
    for (let i = 0; i < (economy.combinedItems ?? 0); i++) this.items.push(COMBINED_ITEM_IDS[randomInt(this.giftRng, COMBINED_ITEM_IDS.length)]!);
    for (let i = 0; i < (economy.units?.count ?? 0); i++) this.gainFromPool(economy.units!.cost);
  }

  /**
   * Gains a unit of a cost from the pool, drawn like a Council unit, or of the next lower cost
   * with copies left.
   */
  private gainFromPool(cost: Cost): void {
    const { pool } = this.context;
    for (let c = cost; c >= 1; c--) {
      if (pool.countOfCost(c as Cost) === 0) continue;
      this.gain(pool.takeOfCost(c as Cost, this.giftRng));
      return;
    }
  }

  /**
   * Merges a new 1★ unit with two copies the player owns (only on the bench while `fighting`), or
   * puts it in the lowest free bench slot. Returns false, changing nothing, if neither is possible.
   */
  private place(unitId: UnitId, fighting: boolean): boolean {
    const pair = this.find(unitId, 1, fighting);
    if (pair.length >= 2) {
      this.merge(unitId, 1, pair.slice(0, 2), fighting);
      return true;
    }
    const free = this.bench.indexOf(null);
    if (free < 0) return false;
    this.bench[free] = { id: this.context.nextUnitId(), unitId, star: 1, items: [] };
    return true;
  }

  private setAt(place: Place, unit: OwnedUnit | null): void {
    if ('bench' in place) this.bench[place.bench] = unit;
    else this.board[boardSlot(place)] = unit;
  }

  private release(unit: OwnedUnit): void {
    this.context.pool.put(unit.unitId, copiesIn(unit.star));
  }

  /**
   * The places of the copies of a unit at a star level: board places first, then bench slots, each
   * in order. Only bench slots if `benchOnly`.
   */
  private find(unitId: UnitId, star: Star, benchOnly = false): Place[] {
    const places: Place[] = [];
    if (!benchOnly) {
      this.board.forEach((u, i) => {
        if (u?.unitId === unitId && u.star === star) places.push(boardPlace(i));
      });
    }
    this.bench.forEach((u, i) => {
      if (u?.unitId === unitId && u.star === star) places.push({ bench: i });
    });
    return places;
  }

  /**
   * Merges copies at `star` into one a star higher (section 7.3). `places` are the owned copies
   * taking part; a merge from a new 1★ copy passes the two it already owns. The merged unit
   * stays in the first place, which `find` lists board first, and keeps that copy's id and items.
   * The other copies' items are given to it in turn, and any it can't take go to the player. If
   * that makes three copies at the new star level, they merge too, only on the bench if `benchOnly`.
   */
  private merge(unitId: UnitId, star: Star, places: readonly Place[], benchOnly = false): void {
    const [keep, ...others] = places;
    const kept = unitAt(this, keep!)!;
    let items: readonly ItemId[] = kept.items;
    for (const place of others) {
      // The merged unit bears the Ring if one of the copies did.
      this.context.ring?.unitsMerged(this.seat, unitAt(this, place)!.id, kept.id);
      for (const item of unitAt(this, place)!.items) {
        const next = addItem(items, item);
        if (next === null) this.items.push(item);
        else items = next;
      }
      this.setAt(place, null);
    }
    const merged = (star + 1) as Star;
    this.setAt(keep!, { id: kept.id, unitId, star: merged, items });
    const same = this.find(unitId, merged, benchOnly);
    if (merged < 3 && same.length >= 3) this.merge(unitId, merged, same.slice(0, 3), benchOnly);
  }
}
