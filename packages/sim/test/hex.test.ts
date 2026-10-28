import { describe, expect, it } from 'vitest';
import {
  BOARD_HEXES,
  DIRECTIONS,
  add,
  compareHexes,
  cone,
  direction,
  distance,
  fromOffset,
  fromPlacement,
  hexEquals,
  isOnBoard,
  line,
  mirror,
  neighbours,
  perspective,
  toOffset,
  type Hex,
} from '../src/hex.js';

/** Board hex from offset (col, row), which is easier to picture than axial. */
function o(col: number, row: number): Hex {
  return fromOffset({ col, row });
}

const PAIRS: [Hex, Hex][] = BOARD_HEXES.flatMap((a) =>
  BOARD_HEXES.filter((b) => !hexEquals(a, b)).map((b): [Hex, Hex] => [a, b]),
);

describe('coordinates', () => {
  it('converts offset to axial', () => {
    expect(o(0, 0)).toEqual({ q: 0, r: 0 });
    expect(o(0, 1)).toEqual({ q: 0, r: 1 });
    expect(o(0, 2)).toEqual({ q: -1, r: 2 });
    expect(o(3, 5)).toEqual({ q: 1, r: 5 });
  });

  it('round-trips between offset and axial, including off the board', () => {
    for (let row = -3; row <= 10; row++) {
      for (let col = -3; col <= 10; col++) {
        expect(toOffset(fromOffset({ col, row }))).toEqual({ col, row });
      }
    }
  });

  it('has 56 distinct hexes on the 7 × 8 board', () => {
    expect(BOARD_HEXES).toHaveLength(56);
    expect(new Set(BOARD_HEXES.map((h) => `${h.q},${h.r}`)).size).toBe(56);
    expect(BOARD_HEXES.every(isOnBoard)).toBe(true);
    for (const hex of [o(-1, 0), o(7, 0), o(0, -1), o(0, 8)]) expect(isOnBoard(hex)).toBe(false);
  });
});

describe('distance', () => {
  it('measures hex steps on the odd-r grid', () => {
    expect(distance(o(0, 0), o(0, 1))).toBe(1);
    expect(distance(o(0, 1), o(1, 0))).toBe(1);
    expect(distance(o(0, 0), o(0, 2))).toBe(2);
    expect(distance(o(0, 0), o(1, 1))).toBe(2);
    expect(distance(o(0, 0), o(6, 7))).toBe(10);
  });

  it('is symmetric and zero only for the same hex', () => {
    for (const [a, b] of PAIRS) {
      expect(distance(a, b)).toBe(distance(b, a));
      expect(distance(a, b)).toBeGreaterThan(0);
    }
  });
});

describe('directions and neighbours', () => {
  it('wraps direction indices', () => {
    expect(direction(-1)).toEqual(DIRECTIONS[5]);
    expect(direction(6)).toEqual(DIRECTIONS[0]);
  });

  it('lists team A neighbours in direction order', () => {
    const centre = o(3, 3);
    expect(neighbours('A', centre)).toEqual(DIRECTIONS.map((d) => add(centre, d)));
  });

  it('gives six distinct neighbours at distance 1', () => {
    for (const team of ['A', 'B'] as const) {
      const result = neighbours(team, o(3, 4));
      expect(new Set(result.map((h) => `${h.q},${h.r}`)).size).toBe(6);
      expect(result.every((h) => distance(h, o(3, 4)) === 1)).toBe(true);
    }
  });

  it('gives team B the mirror image of team A’s neighbour order', () => {
    for (const hex of BOARD_HEXES) {
      expect(neighbours('B', mirror(hex))).toEqual(neighbours('A', hex).map(mirror));
    }
  });
});

describe('mirror and perspective', () => {
  it('maps offset (c, r) to (6 − c, 7 − r)', () => {
    for (const hex of BOARD_HEXES) {
      const { col, row } = toOffset(hex);
      expect(mirror(hex)).toEqual(o(6 - col, 7 - row));
    }
  });

  it('is its own inverse and maps the board onto itself', () => {
    for (const hex of BOARD_HEXES) {
      expect(mirror(mirror(hex))).toEqual(hex);
      expect(isOnBoard(mirror(hex))).toBe(true);
    }
  });

  it('preserves distance, so it is a rotation of the hex grid', () => {
    for (const [a, b] of PAIRS) expect(distance(mirror(a), mirror(b))).toBe(distance(a, b));
  });

  it('only changes team B’s view', () => {
    expect(perspective('A', o(1, 2))).toEqual(o(1, 2));
    expect(perspective('B', o(1, 2))).toEqual(o(5, 5));
  });

  it('places units in their own half', () => {
    expect(fromPlacement('A', { col: 2, row: 3 })).toEqual(o(2, 3));
    expect(fromPlacement('B', { col: 0, row: 0 })).toEqual(o(6, 7));
    expect(fromPlacement('B', { col: 2, row: 3 })).toEqual(o(4, 4));
  });
});

describe('compareHexes', () => {
  it('puts lower rows first, then lower columns, for team A', () => {
    expect(compareHexes('A', o(5, 0), o(0, 1))).toBeLessThan(0);
    expect(compareHexes('A', o(2, 3), o(3, 3))).toBeLessThan(0);
    expect([...BOARD_HEXES].reverse().sort((a, b) => compareHexes('A', a, b))).toEqual(BOARD_HEXES);
  });

  it('uses team B’s own rows and columns', () => {
    // Team B's back row is board row 7, and its column 0 is board column 6.
    expect(compareHexes('B', o(0, 7), o(0, 6))).toBeLessThan(0);
    expect(compareHexes('B', o(6, 7), o(0, 7))).toBeLessThan(0);
  });

  it('never ties distinct hexes and mirrors between teams', () => {
    for (const [a, b] of PAIRS) {
      const order = compareHexes('A', a, b);
      expect(order).not.toBe(0);
      expect(Math.sign(compareHexes('B', mirror(a), mirror(b)))).toBe(Math.sign(order));
    }
  });
});

describe('line', () => {
  it('runs straight along a row', () => {
    expect(line('A', o(0, 0), o(2, 0), 3)).toEqual([o(1, 0), o(2, 0), o(3, 0)]);
    expect(line('A', o(0, 0), o(2, 0), 'edge')).toEqual([o(1, 0), o(2, 0), o(3, 0), o(4, 0), o(5, 0), o(6, 0)]);
  });

  it('uses the nudge to break ties between two hexes', () => {
    expect(line('A', o(0, 0), o(1, 1), 'edge')).toEqual([
      o(0, 1),
      o(1, 1),
      o(2, 2),
      o(3, 2),
      o(3, 3),
      o(4, 3),
      o(5, 4),
      o(6, 4),
      o(6, 5),
    ]);
  });

  it('skips off-board hexes along the jagged side edge instead of stopping', () => {
    // Odd rows stick out on the right, so this line alternates between column 6 and the off-board column 7.
    expect(line('A', o(6, 1), o(6, 3), 4)).toEqual([o(7, 2), o(6, 3), o(7, 4), o(6, 5)]);
    expect(line('A', o(6, 1), o(6, 3), 'edge')).toEqual([o(6, 3), o(6, 5), o(6, 7)]);
  });

  it('is a connected path that passes through the target and runs off the board', () => {
    for (const [from, to] of PAIRS) {
      const hexes = line('A', from, to, 100);
      expect(hexes[distance(from, to) - 1]).toEqual(to);
      hexes.forEach((hex, i) => expect(distance(hex, i === 0 ? from : hexes[i - 1]!)).toBe(1));
      expect(isOnBoard(hexes.at(-1)!)).toBe(false);
    }
  });

  it('takes the first n hexes, or every on-board hex for edge', () => {
    for (const [from, to] of PAIRS) {
      const hexes = line('A', from, to, 100);
      expect(line('A', from, to, 4)).toEqual(hexes.slice(0, 4));
      expect(line('A', from, to, 'edge')).toEqual(hexes.filter(isOnBoard));
      expect(line('A', from, to, 'edge')).toContainEqual(to);
    }
  });

  it('gives team B the mirror image of team A’s line', () => {
    for (const [from, to] of PAIRS) {
      expect(line('B', mirror(from), mirror(to), 'edge')).toEqual(line('A', from, to, 'edge').map(mirror));
      expect(line('B', mirror(from), mirror(to), 4)).toEqual(line('A', from, to, 4).map(mirror));
    }
  });

  it('is empty when the target is the start', () => {
    expect(line('A', o(3, 3), o(3, 3), 'edge')).toEqual([]);
  });
});

describe('cone', () => {
  const centre = o(3, 3); // axial (2, 3)

  it('covers three hexes at distance 1 and three at distance 2', () => {
    // Facing direction 0, (+1, 0).
    expect(cone('A', centre, o(5, 3))).toEqual([
      { q: 3, r: 3 },
      { q: 2, r: 4 },
      { q: 3, r: 2 },
      { q: 4, r: 3 },
      { q: 3, r: 4 },
      { q: 4, r: 2 },
    ]);
  });

  it('faces the earlier direction when two are equally close', () => {
    // Axial (4, 2) is 1 hex from both the direction-0 and direction-1 neighbours.
    expect(cone('A', centre, { q: 4, r: 2 })).toEqual(cone('A', centre, o(5, 3)));
  });

  it('gives team B the mirror image of team A’s cone', () => {
    for (const [origin, toward] of PAIRS) {
      expect(cone('B', mirror(origin), mirror(toward))).toEqual(cone('A', origin, toward).map(mirror));
    }
  });
});
