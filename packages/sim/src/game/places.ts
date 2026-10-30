// Places on a player's bench and board (docs/game-spec.md section 7). The one module that knows
// how a board place maps to an index of a player's `board`.

import { PLAYER } from '../data/economy.js';
import type { ItemId } from '../data/items.js';
import type { UnitId } from '../data/units.js';
import { BOARD_COLS, BOARD_ROWS } from '../hex.js';
import type { Star } from '../types.js';

/** Rows on one player's half of the board. */
export const TEAM_ROWS = BOARD_ROWS / 2;

/** A board place in the player's own perspective (row 3 is the front). */
export interface BoardPlace {
  readonly col: number;
  readonly row: number;
}

/** A bench slot, or a board place in the player's own perspective. */
export type Place = { readonly bench: number } | BoardPlace;

export interface OwnedUnit {
  /** Unique in the game, so a client can follow a unit as it moves or merges. */
  readonly id: number;
  readonly unitId: UnitId;
  readonly star: Star;
  /** The items it holds, in order (section 7.7). */
  readonly items: readonly ItemId[];
}

/** A player's bench and board, which places point into. */
export interface Owner {
  readonly bench: readonly (OwnedUnit | null)[];
  /** Indexed by `boardSlot`. */
  readonly board: readonly (OwnedUnit | null)[];
}

/** The index of a board place in a player's `board`. */
export function boardSlot(place: BoardPlace): number {
  return place.row * BOARD_COLS + place.col;
}

/** The board place at an index of a player's `board`. */
export function boardPlace(slot: number): BoardPlace {
  return { col: slot % BOARD_COLS, row: Math.floor(slot / BOARD_COLS) };
}

export function unitAt(owner: Owner, place: Place): OwnedUnit | null {
  return ('bench' in place ? owner.bench[place.bench] : owner.board[boardSlot(place)]) ?? null;
}

/** The place of an owned unit by its id, or null. */
export function placeOf(owner: Owner, id: number): Place | null {
  const board = owner.board.findIndex((u) => u?.id === id);
  if (board >= 0) return boardPlace(board);
  const bench = owner.bench.findIndex((u) => u?.id === id);
  return bench >= 0 ? { bench } : null;
}

/** Every owned unit with its place: board places in index order, then bench slots in order. */
export function ownedUnits(owner: Owner): { unit: OwnedUnit; place: Place }[] {
  const units: { unit: OwnedUnit; place: Place }[] = [];
  owner.board.forEach((unit, i) => {
    if (unit !== null) units.push({ unit, place: boardPlace(i) });
  });
  owner.bench.forEach((unit, bench) => {
    if (unit !== null) units.push({ unit, place: { bench } });
  });
  return units;
}

export function samePlace(a: Place, b: Place): boolean {
  if ('bench' in a || 'bench' in b) return 'bench' in a && 'bench' in b && a.bench === b.bench;
  return a.col === b.col && a.row === b.row;
}

/** Whether a value is a bench slot or a place on a player's half of the board. */
export function isPlace(place: unknown): place is Place {
  if (typeof place !== 'object' || place === null) return false;
  if ('bench' in place) return isIndex(place.bench, PLAYER.benchSize);
  return 'col' in place && 'row' in place && isIndex(place.col, BOARD_COLS) && isIndex(place.row, TEAM_ROWS);
}

export function isIndex(value: unknown, length: number): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;
}
