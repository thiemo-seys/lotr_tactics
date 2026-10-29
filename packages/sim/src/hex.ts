// Hex maths for the board (docs/sim-spec.md sections 5 and 10.4).
//
// Positions are axial (q, r). Offset (col, row) is only used for placement input and for checking
// whether a hex is on the board. Functions that make a geometric choice (neighbour order,
// tie-breaks, lines, cones) take the acting team and make that choice in the team's own
// perspective, so a board fighting its own mirror image behaves identically on both sides.

import type { Team } from './types.js';

export const BOARD_COLS = 7;
export const BOARD_ROWS = 8;

/** Axial coordinates. */
export interface Hex {
  readonly q: number;
  readonly r: number;
}

/** Odd-r offset coordinates: odd rows are shifted half a hex to the right. */
export interface OffsetHex {
  readonly col: number;
  readonly row: number;
}

export function fromOffset({ col, row }: OffsetHex): Hex {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function toOffset({ q, r }: Hex): OffsetHex {
  return { col: q + (r - (r & 1)) / 2, row: r };
}

/** Every hex on the board, row by row. */
export const BOARD_HEXES: readonly Hex[] = Array.from({ length: BOARD_COLS * BOARD_ROWS }, (_, i) =>
  fromOffset({ col: i % BOARD_COLS, row: Math.floor(i / BOARD_COLS) }),
);

export function isOnBoard(hex: Hex): boolean {
  const { col, row } = toOffset(hex);
  return col >= 0 && col < BOARD_COLS && row >= 0 && row < BOARD_ROWS;
}

/** A hex's position in `BOARD_HEXES`, for indexing arrays and sets. Only for hexes on the board. */
export function boardIndex(hex: Hex): number {
  const { col, row } = toOffset(hex);
  return row * BOARD_COLS + col;
}

/** Neighbour directions in perspective order. */
export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** The direction with index `i`, wrapping around, so -1 is direction 5. */
export function direction(i: number): Hex {
  return DIRECTIONS[((i % 6) + 6) % 6]!;
}

export function add(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function subtract(a: Hex, b: Hex): Hex {
  return { q: a.q - b.q, r: a.r - b.r };
}

export function scale(hex: Hex, k: number): Hex {
  return { q: hex.q * k, r: hex.r * k };
}

export function hexEquals(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * The 180° rotation of the board onto itself: offset (c, r) ↔ (6 − c, 7 − r).
 * It preserves adjacency and distance, and is its own inverse.
 */
export function mirror(hex: Hex): Hex {
  const { col, row } = toOffset(hex);
  return fromOffset({ col: BOARD_COLS - 1 - col, row: BOARD_ROWS - 1 - row });
}

/**
 * Converts a board hex into the team's own perspective, or back: team A sees the board as it is,
 * team B sees its mirror. Applying it twice returns the original hex.
 */
export function perspective(team: Team, hex: Hex): Hex {
  return team === 'A' ? hex : mirror(hex);
}

/** The board hex for a unit placed at (col, row) in its team's own perspective (row 0 = back, 3 = front). */
export function fromPlacement(team: Team, placement: OffsetHex): Hex {
  return perspective(team, fromOffset(placement));
}

/** The six neighbours, in the team's perspective direction order. They may be off the board. */
export function neighbours(team: Team, hex: Hex): Hex[] {
  // Mirroring reverses every direction, so team B's direction i is the board's direction i + 3.
  const first = team === 'A' ? 0 : 3;
  return DIRECTIONS.map((_, i) => add(hex, direction(first + i)));
}

/**
 * Tie-break order (section 5): lower row, then lower column, in the team's perspective.
 * Negative when `a` comes first. Hexes never compare equal unless they are the same hex.
 */
export function compareHexes(team: Team, a: Hex, b: Hex): number {
  // Within a row, column order is q order. Mirroring reverses both, so team B uses the opposite order.
  const order = a.r - b.r || a.q - b.q;
  return team === 'A' ? order : -order;
}

/** How far a line is extended past its target, in hexes (section 10.4). */
const LINE_REACH = 16;

/** Fixed nudge added before rounding a line point, so points exactly between two hexes round consistently. */
const LINE_NUDGE = { q: 1e-6, r: 2e-6, s: -3e-6 };

/**
 * The hexes on the line from `from` through `to` (section 10.4), excluding `from`:
 * the first `length` hexes, which may be off the board, or with 'edge' every hex that is on the board.
 */
export function line(team: Team, from: Hex, to: Hex, length: number | 'edge'): Hex[] {
  const start = perspective(team, from);
  const target = perspective(team, to);
  const dist = distance(start, target);
  if (dist === 0) return [];

  const end = add(start, scale(subtract(target, start), Math.ceil(LINE_REACH / dist)));
  const steps = distance(start, end);
  const limit = length === 'edge' ? steps : Math.min(length, steps);
  const hexes: Hex[] = [];
  for (let i = 1; i <= limit; i++) {
    const t = i / steps;
    const hex = perspective(
      team,
      cubeRound(
        lerp(start.q, end.q, t) + LINE_NUDGE.q,
        lerp(start.r, end.r, t) + LINE_NUDGE.r,
        lerp(-start.q - start.r, -end.q - end.r, t) + LINE_NUDGE.s,
      ),
    );
    // Along the jagged side edge a line can step off the board and back on, so skip rather than stop.
    if (length !== 'edge' || isOnBoard(hex)) hexes.push(hex);
  }
  return hexes;
}

/**
 * The 6-hex cone in front of `origin`, facing `toward` (section 10.4): three hexes at distance 1,
 * then three at distance 2. They may be off the board.
 */
export function cone(team: Team, origin: Hex, toward: Hex): Hex[] {
  const centre = perspective(team, origin);
  const f = facing(centre, perspective(team, toward));
  const forward = direction(f);
  const left = direction(f - 1);
  const right = direction(f + 1);
  const front = add(centre, forward);
  return [
    front,
    add(centre, left),
    add(centre, right),
    add(front, forward),
    add(front, left),
    add(front, right),
  ].map((hex) => perspective(team, hex));
}

/** The index of the direction whose neighbour is closest to `toward`. Ties go to the earlier direction. */
function facing(origin: Hex, toward: Hex): number {
  let best = 0;
  let bestDistance = Infinity;
  DIRECTIONS.forEach((dir, i) => {
    const d = distance(add(origin, dir), toward);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Rounds fractional cube coordinates (q, r, s with q + r + s = 0) to the nearest hex. */
function cubeRound(q: number, r: number, s: number): Hex {
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  // Adding 0 turns -0 into 0, so equal hexes are also equal under Object.is.
  return { q: rq + 0, r: rr + 0 };
}
