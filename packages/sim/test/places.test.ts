// Places on a player's bench and board (docs/game-spec.md section 7).

import { describe, expect, it } from 'vitest';
import { PLAYER } from '../src/data/economy.js';
import { BOARD_COLS } from '../src/hex.js';
import { TEAM_ROWS, boardPlace, boardSlot, isPlace, ownedUnits, placeOf, samePlace, unitAt, type OwnedUnit } from '../src/game/places.js';

const unit = (id: number): OwnedUnit => ({ id, unitId: 'sam', star: 1, items: [] });

/** A bench and board with unit 1 on the board at (2, 3), unit 2 at (0, 0) and unit 3 on bench slot 4. */
function owner() {
  const board = new Array<OwnedUnit | null>(BOARD_COLS * TEAM_ROWS).fill(null);
  const bench = new Array<OwnedUnit | null>(PLAYER.benchSize).fill(null);
  board[boardSlot({ col: 2, row: 3 })] = unit(1);
  board[boardSlot({ col: 0, row: 0 })] = unit(2);
  bench[4] = unit(3);
  return { board, bench };
}

describe('board places', () => {
  it('map to every board index once, row by row', () => {
    const slots = Array.from({ length: BOARD_COLS * TEAM_ROWS }, (_, i) => boardSlot(boardPlace(i)));
    expect(slots).toEqual(Array.from({ length: BOARD_COLS * TEAM_ROWS }, (_, i) => i));
    expect(boardPlace(BOARD_COLS + 2)).toEqual({ col: 2, row: 1 });
  });

  it('find units on the board and the bench, and the places of units', () => {
    const o = owner();
    expect(unitAt(o, { col: 2, row: 3 })?.id).toBe(1);
    expect(unitAt(o, { bench: 4 })?.id).toBe(3);
    expect(unitAt(o, { col: 3, row: 3 })).toBeNull();
    expect(placeOf(o, 1)).toEqual({ col: 2, row: 3 });
    expect(placeOf(o, 3)).toEqual({ bench: 4 });
    expect(placeOf(o, 99)).toBeNull();
  });

  it('list owned units by board index, then bench slot', () => {
    expect(ownedUnits(owner()).map(({ unit, place }) => [unit.id, place])).toEqual([
      [2, { col: 0, row: 0 }],
      [1, { col: 2, row: 3 }],
      [3, { bench: 4 }],
    ]);
  });

  it('compare places', () => {
    expect(samePlace({ bench: 1 }, { bench: 1 })).toBe(true);
    expect(samePlace({ bench: 1 }, { bench: 2 })).toBe(false);
    expect(samePlace({ bench: 1 }, { col: 1, row: 0 })).toBe(false);
    expect(samePlace({ col: 1, row: 2 }, { col: 1, row: 2 })).toBe(true);
    expect(samePlace({ col: 1, row: 2 }, { col: 2, row: 1 })).toBe(false);
  });

  it('accept only bench slots and places on the player’s own half', () => {
    expect(isPlace({ bench: PLAYER.benchSize - 1 })).toBe(true);
    expect(isPlace({ col: BOARD_COLS - 1, row: TEAM_ROWS - 1 })).toBe(true);
    for (const bad of [{ bench: PLAYER.benchSize }, { bench: 1.5 }, { col: 0, row: TEAM_ROWS }, { col: -1, row: 0 }, { col: 0 }, null, 'bench', 3]) {
      expect(isPlace(bad)).toBe(false);
    }
  });
});
