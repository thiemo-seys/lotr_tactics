// One player's bench, board, shop, gold and XP (docs/game-spec.md sections 5–8).

import type { PlacedUnit } from '../combat/combat.js';
import { INCOME, PLAYER, SHOP, STREAK_GOLD, XP } from '../data/economy.js';
import type { ComponentId } from '../data/items.js';
import { UNITS, type UnitId } from '../data/units.js';
import { BOARD_COLS, BOARD_ROWS } from '../hex.js';
import type { Rng } from '../rng.js';
import type { Star } from '../types.js';
import { copiesIn, type Pool } from './pool.js';

/** Rows on one player's half of the board. */
export const TEAM_ROWS = BOARD_ROWS / 2;

/** A bench slot, or a board place in the player's own perspective (row 3 is the front). */
export type Place = { readonly bench: number } | { readonly col: number; readonly row: number };

export interface OwnedUnit {
  /** Unique in the game, so a client can follow a unit as it moves or merges. */
  readonly id: number;
  readonly unitId: UnitId;
  readonly star: Star;
}

export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** What a player shares with the rest of the game. */
export interface PlayerContext {
  readonly pool: Pool;
  nextUnitId(): number;
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
  readonly items: readonly ComponentId[];
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
  readonly items: ComponentId[] = [];
  readonly recentOpponents: number[] = [];
  placement: number | null = null;

  constructor(
    readonly seat: number,
    private readonly context: PlayerContext,
    private readonly shopRng: Rng,
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
    if (this.gold < SHOP.rerollCost) return fail('Not enough gold.');
    this.gold -= SHOP.rerollCost;
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
    this.bench[free] = { id: this.context.nextUnitId(), unitId, star: 1 };
    return true;
  }

  /** Puts the unbought shop units back in the pool. */
  returnShop(): void {
    this.shop.forEach((unitId, slot) => {
      if (unitId !== null) this.context.pool.put(unitId);
      this.shop[slot] = null;
    });
  }

  /** Fills every shop slot from the pool. The shop must be empty. */
  rollShop(): void {
    for (let slot = 0; slot < SHOP.size; slot++) this.shop[slot] = this.context.pool.rollShopSlot(this.level, this.shopRng);
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
    const interest = Math.min(INCOME.maxInterest, Math.floor(this.gold / INCOME.goldPerInterest));
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

  /** The board as fight input. */
  placements(): PlacedUnit[] {
    const placed: PlacedUnit[] = [];
    this.board.forEach((unit, i) => {
      if (unit !== null) placed.push({ unitId: unit.unitId, star: unit.star, col: i % BOARD_COLS, row: Math.floor(i / BOARD_COLS), items: [] });
    });
    return placed;
  }

  /** Puts every owned unit and the shop back in the pool, for an eliminated player. */
  returnEverything(): void {
    for (const units of [this.bench, this.board]) {
      units.forEach((unit, i) => {
        if (unit !== null) this.release(unit);
        units[i] = null;
      });
    }
    this.returnShop();
  }

  // Internals

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
   * stays in the first place, which `find` lists board first, and keeps that copy's id.
   */
  private merge(unitId: UnitId, star: Star, places: readonly Place[]): void {
    const [keep, ...others] = places;
    const kept = this.unitAt(keep!)!;
    for (const place of others) this.setAt(place, null);
    const merged = (star + 1) as Star;
    this.setAt(keep!, { id: kept.id, unitId, star: merged });
    const same = this.find(unitId, merged);
    if (merged < 3 && same.length >= 3) this.merge(unitId, merged, same);
  }
}

function isPlace(place: unknown): place is Place {
  if (typeof place !== 'object' || place === null) return false;
  if ('bench' in place) return isIndex(place.bench, PLAYER.benchSize);
  return 'col' in place && 'row' in place && isIndex(place.col, BOARD_COLS) && isIndex(place.row, TEAM_ROWS);
}

function isIndex(value: unknown, length: number): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;
}
