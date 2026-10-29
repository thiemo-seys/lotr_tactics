// One player's bench, board, shop, gold and XP (docs/game-spec.md sections 5–8).

import type { PlacedUnit } from '../combat/combat.js';
import { COMBINED_ITEM_IDS, combine, isComponent } from '../combat/items.js';
import { INCOME, PLAYER, SHOP, STREAK_GOLD, XP } from '../data/economy.js';
import { GIFTS, type GiftId, type GiftTier } from '../data/gifts.js';
import { COMPONENTS, MAX_ITEMS, type ComponentId, type ItemId } from '../data/items.js';
import { UNITS, type Cost, type UnitId } from '../data/units.js';
import { BOARD_COLS, BOARD_ROWS } from '../hex.js';
import { randomInt, type Rng } from '../rng.js';
import type { Star } from '../types.js';
import { giftBonus, rollGiftOffer } from './gifts.js';
import { copiesIn, type Pool } from './pool.js';
import type { Ring } from './ring.js';

/** Rows on one player's half of the board. */
export const TEAM_ROWS = BOARD_ROWS / 2;

/** A bench slot, or a board place in the player's own perspective (row 3 is the front). */
export type Place = { readonly bench: number } | { readonly col: number; readonly row: number };

export interface OwnedUnit {
  /** Unique in the game, so a client can follow a unit as it moves or merges. */
  readonly id: number;
  readonly unitId: UnitId;
  readonly star: Star;
  /** The items it holds, in order (section 7.7). */
  readonly items: readonly ItemId[];
}

export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

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
  /** Indexed by `row * BOARD_COLS + col`, in the player's own perspective. */
  readonly board: readonly (OwnedUnit | null)[];
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

const OK: ActionResult = { ok: true };

function fail(reason: string): ActionResult {
  return { ok: false, reason };
}

/** The order free board places are filled in before a fight (section 7.6). */
const FILL_ORDER: readonly { col: number; row: number }[] = [3, 2, 1, 0].flatMap((row) =>
  [3, 2, 4, 1, 5, 0, 6].map((col) => ({ col, row })),
);

/** XP needed to reach the level after `level`, or null at the top level or before XP counts. */
export function xpForNextLevel(level: number): number | null {
  return XP.toLevel[level + 1] ?? null;
}

/** Base income at the start of a PvP or PvE round (section 8.1). */
export function baseIncome(stage: number, round: number): number {
  return INCOME.base[`${stage}-${round}`] ?? INCOME.standard;
}

/**
 * A unit's items after it is given one (section 7.7): a component combines with a lone component
 * the unit holds, taking its place; otherwise the item goes at the end, if the unit holds fewer
 * than 3. Null if the unit can't take it.
 */
export function addItem(held: readonly ItemId[], item: ItemId): ItemId[] | null {
  const lone = held.findIndex(isComponent);
  if (isComponent(item) && lone >= 0) {
    const items = [...held];
    items[lone] = combine(held[lone] as ComponentId, item);
    return items;
  }
  return held.length < MAX_ITEMS ? [...held, item] : null;
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

  unitAt(place: Place): OwnedUnit | null {
    return 'bench' in place ? this.bench[place.bench]! : this.board[place.row * BOARD_COLS + place.col]!;
  }

  boardCount(): number {
    return this.board.filter((u) => u !== null).length;
  }

  // Actions (section 9.3). Each returns ok: false and changes nothing when it isn't allowed.

  buy(slot: number): ActionResult {
    if (!Number.isInteger(slot) || slot < 0 || slot >= SHOP.size) return fail('There is no such shop slot.');
    const unitId = this.shop[slot];
    if (unitId === null || unitId === undefined) return fail('That shop slot is empty.');
    const cost = UNITS[unitId].cost;
    if (this.gold < cost) return fail('Not enough gold.');
    if (!this.bench.includes(null) && this.find(unitId, 1).length < 2) return fail('The bench is full.');
    this.gold -= cost;
    this.shop[slot] = null;
    this.gain(unitId);
    return OK;
  }

  sell(from: Place): ActionResult {
    if (!isPlace(from)) return fail('There is no such place.');
    const unit = this.unitAt(from);
    if (unit === null) return fail('There is no unit there.');
    this.setAt(from, null);
    this.release(unit);
    this.gold += UNITS[unit.unitId].cost * copiesIn(unit.star);
    this.items.push(...unit.items);
    // Selling the bearer leaves the Ring with the player, unworn.
    const ring = this.context.ring;
    if (ring?.isBorneBy(this.seat, unit.id) === true) ring.bearer = null;
    return OK;
  }

  move(from: Place, to: Place): ActionResult {
    if (!isPlace(from) || !isPlace(to)) return fail('There is no such place.');
    const unit = this.unitAt(from);
    if (unit === null) return fail('There is no unit there.');
    const other = this.unitAt(to);
    if (other === null && 'bench' in from && !('bench' in to) && this.boardCount() >= this.level) {
      return fail('The board is full for this level.');
    }
    this.setAt(from, other);
    this.setAt(to, unit);
    return OK;
  }

  reroll(): ActionResult {
    if (this.freeRerolls > 0) this.freeRerolls--;
    else if (this.gold < SHOP.rerollCost) return fail('Not enough gold.');
    else this.gold -= SHOP.rerollCost;
    this.returnShop();
    this.rollShop();
    return OK;
  }

  buyXp(): ActionResult {
    if (this.level < XP.buyFromLevel) return fail(`XP can be bought from level ${XP.buyFromLevel}.`);
    if (this.level >= PLAYER.maxLevel) return fail('Already at the top level.');
    if (this.gold < XP.buyCost) return fail('Not enough gold.');
    this.gold -= XP.buyCost;
    this.addXp(XP.buyAmount);
    return OK;
  }

  /** Gives one of the player's items to a unit on the bench or the board (section 7.7). */
  equip(item: number, to: Place): ActionResult {
    if (!isIndex(item, this.items.length)) return fail('There is no such item.');
    if (!isPlace(to)) return fail('There is no such place.');
    const unit = this.unitAt(to);
    if (unit === null) return fail('There is no unit there.');
    const items = addItem(unit.items, this.items[item]!);
    if (items === null) return fail(`A unit can hold at most ${MAX_ITEMS} items.`);
    this.items.splice(item, 1);
    this.setAt(to, { ...unit, items });
    return OK;
  }

  /** Takes one of the Gifts on offer, and anything it gives right away (section 9.10). */
  pickGift(option: number): ActionResult {
    const offer = this.giftOffer;
    if (offer === null) return fail('There is no Gift to pick.');
    const gift = Number.isInteger(option) ? offer[option] : undefined;
    if (gift === undefined) return fail('There is no such Gift.');
    this.giftOffer = null;
    this.giftTier = null;
    this.gifts.push(gift);
    this.receive(gift);
    return OK;
  }

  /** Replaces the Gifts on offer with new ones, once per offer. */
  rerollGifts(): ActionResult {
    if (this.giftOffer === null || this.giftTier === null) return fail('There is no Gift to reroll.');
    if (this.giftRerolled) return fail('This offer has been rerolled already.');
    this.giftRerolled = true;
    this.giftOffer = rollGiftOffer(this.giftTier, new Set([...this.gifts, ...this.giftOffer]), this.giftRng);
    return OK;
  }

  setLock(locked: boolean): ActionResult {
    if (typeof locked !== 'boolean') return fail('The lock must be on or off.');
    this.shopLocked = locked;
    return OK;
  }

  // Changes made by the game.

  /**
   * Gains a 1★ unit already taken from the pool (section 7.2): it merges with two copies the
   * player owns, or goes to the lowest free bench slot. Returns false, changing nothing, if
   * neither is possible.
   */
  gain(unitId: UnitId): boolean {
    const pair = this.find(unitId, 1);
    if (pair.length >= 2) {
      this.merge(unitId, 1, pair);
      return true;
    }
    const free = this.bench.indexOf(null);
    if (free < 0) return false;
    this.bench[free] = { id: this.context.nextUnitId(), unitId, star: 1, items: [] };
    return true;
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
    const level = Math.min(this.level + giftBonus(this.gifts, 'shopLevels'), PLAYER.maxLevel);
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
      const place = FILL_ORDER.find((p) => this.unitAt(p) === null)!;
      this.bench[slot] = null;
      this.setAt(place, unit);
    }
  }

  /** Interest on the gold held, then base income (section 8.1). */
  collectIncome(base: number): void {
    const maxInterest = INCOME.maxInterest + giftBonus(this.gifts, 'maxInterest');
    const interest = Math.min(maxInterest, Math.floor(this.gold / INCOME.goldPerInterest));
    this.gold += interest + base;
  }

  /** Updates the streak and pays win and streak gold after a PvP fight (section 8.2). A draw is a loss. */
  recordPvp(won: boolean): void {
    if (won) this.streak = this.streak > 0 ? this.streak + 1 : 1;
    else this.streak = this.streak < 0 ? this.streak - 1 : -1;
    if (won) this.gold += INCOME.pvpWin;
    this.gold += streakGold(Math.abs(this.streak));
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
      const place = { unitId: unit.unitId, star: unit.star, col: i % BOARD_COLS, row: Math.floor(i / BOARD_COLS), items: [...unit.items] };
      placed.push(ring?.isBorneBy(this.seat, unit.id) === true ? { ...place, ring: ring.corruption } : place);
    });
    return placed;
  }

  /** The place of an owned unit by its id, or null. */
  placeOf(id: number): Place | null {
    const board = this.board.findIndex((u) => u?.id === id);
    if (board >= 0) return { col: board % BOARD_COLS, row: Math.floor(board / BOARD_COLS) };
    const bench = this.bench.findIndex((u) => u?.id === id);
    return bench >= 0 ? { bench } : null;
  }

  /** The first owned unit with a unit id, at any star level: board places in order, then the bench. */
  firstOwned(unitId: UnitId): OwnedUnit | null {
    return [...this.board, ...this.bench].find((u) => u?.unitId === unitId) ?? null;
  }

  /** The first unit on the board with a unit id, in the order the board fills (section 7.6). */
  firstOnBoard(unitId: UnitId): OwnedUnit | null {
    for (const place of FILL_ORDER) {
      const unit = this.unitAt(place);
      if (unit?.unitId === unitId) return unit;
    }
    return null;
  }

  /** Removes an owned unit for good: its copies go back to the pool and its items to the player. */
  remove(id: number): void {
    const place = this.placeOf(id);
    if (place === null) return;
    const unit = this.unitAt(place)!;
    this.setAt(place, null);
    this.release(unit);
    this.items.push(...unit.items);
  }

  /** Puts every owned unit and the shop back in the pool, for an eliminated player. Their items are lost. */
  returnEverything(): void {
    for (const units of [this.bench, this.board]) {
      units.forEach((unit, i) => {
        if (unit !== null) this.release(unit);
        units[i] = null;
      });
    }
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
   * with copies left. One with no room is sold at once.
   */
  private gainFromPool(cost: Cost): void {
    const { pool } = this.context;
    for (let c = cost; c >= 1; c--) {
      if (pool.countOfCost(c as Cost) === 0) continue;
      const unitId = pool.takeOfCost(c as Cost, this.giftRng);
      if (!this.gain(unitId)) {
        this.gold += UNITS[unitId].cost;
        pool.put(unitId);
      }
      return;
    }
  }

  private setAt(place: Place, unit: OwnedUnit | null): void {
    if ('bench' in place) this.bench[place.bench] = unit;
    else this.board[place.row * BOARD_COLS + place.col] = unit;
  }

  private release(unit: OwnedUnit): void {
    this.context.pool.put(unit.unitId, copiesIn(unit.star));
  }

  /** The places of the copies of a unit at a star level: board places first, then bench slots, each in order. */
  private find(unitId: UnitId, star: Star): Place[] {
    const places: Place[] = [];
    this.board.forEach((u, i) => {
      if (u?.unitId === unitId && u.star === star) places.push({ col: i % BOARD_COLS, row: Math.floor(i / BOARD_COLS) });
    });
    this.bench.forEach((u, i) => {
      if (u?.unitId === unitId && u.star === star) places.push({ bench: i });
    });
    return places;
  }

  /**
   * Merges copies at `star` into one a star higher (section 7.3). `places` are the owned copies
   * taking part; a merge from a new 1★ copy passes the two it already owns. The merged unit
   * stays in the first place, which `find` lists board first, and keeps that copy's id and items.
   * The other copies' items are given to it in turn, and any it can't take go to the player.
   */
  private merge(unitId: UnitId, star: Star, places: readonly Place[]): void {
    const [keep, ...others] = places;
    const kept = this.unitAt(keep!)!;
    let items: readonly ItemId[] = kept.items;
    const ring = this.context.ring;
    for (const place of others) {
      // The merged unit bears the Ring if one of the copies did.
      if (ring?.isBorneBy(this.seat, this.unitAt(place)!.id) === true) ring.bearer = kept.id;
      for (const item of this.unitAt(place)!.items) {
        const next = addItem(items, item);
        if (next === null) this.items.push(item);
        else items = next;
      }
      this.setAt(place, null);
    }
    const merged = (star + 1) as Star;
    this.setAt(keep!, { id: kept.id, unitId, star: merged, items });
    const same = this.find(unitId, merged);
    if (merged < 3 && same.length >= 3) this.merge(unitId, merged, same);
  }
}

export function isPlace(place: unknown): place is Place {
  if (typeof place !== 'object' || place === null) return false;
  if ('bench' in place) return isIndex(place.bench, PLAYER.benchSize);
  return 'col' in place && 'row' in place && isIndex(place.col, BOARD_COLS) && isIndex(place.row, TEAM_ROWS);
}

function isIndex(value: unknown, length: number): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;
}
