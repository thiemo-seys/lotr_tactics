// Where board hexes sit in the 3D scene (docs/viewer-spec.md section 3).

import { BOARD_COLS, BOARD_ROWS, PLAYER, TEAM_ROWS, fromOffset, toOffset, type Hex, type Place } from '@lotr-tactics/sim';

/** A point on the ground plane. */
export interface Point {
  readonly x: number;
  readonly z: number;
}

const SQRT3 = Math.sqrt(3);

/** Half the board's size, so its centre sits at the origin. */
const HALF = { x: (SQRT3 * (BOARD_COLS - 0.5)) / 2, z: (1.5 * (BOARD_ROWS - 1)) / 2 };

/**
 * The centre of a hex. Pointy-top hexes with a circumradius of 1, odd rows shifted right. Team A's
 * rows (0–3) are nearest the camera, which looks along −z, so columns run left to right on screen.
 */
export function hexToWorld(hex: Hex): Point {
  const { col, row } = toOffset(hex);
  return { x: SQRT3 * (col + 0.5 * (row & 1)) - HALF.x, z: HALF.z - 1.5 * row };
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

export function pointDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Bench slots sit in a row in front of team A's back row, this far apart. */
export const BENCH_SPACING = 1.6;

/** The bench row's distance in front of team A's back row. */
const BENCH_GAP = 2.2;

export function benchToWorld(slot: number): Point {
  return { x: (slot - (PLAYER.benchSize - 1) / 2) * BENCH_SPACING, z: HALF.z + BENCH_GAP };
}

/**
 * The place under a point on the ground while planning: a bench slot, or a hex on team A's half
 * (the person's own, in their perspective), or null if the point is near neither.
 */
export function placeAtPoint(point: Point): Place | null {
  const bench = benchToWorld(0);
  if (Math.abs(point.z - bench.z) < BENCH_SPACING / 2) {
    const slot = Math.round((point.x - bench.x) / BENCH_SPACING);
    return slot >= 0 && slot < PLAYER.benchSize ? { bench: slot } : null;
  }
  let best: { col: number; row: number } | null = null;
  let bestDistance = 0.95;
  for (let row = 0; row < TEAM_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const d = pointDistance(point, hexToWorld(fromOffset({ col, row })));
      if (d < bestDistance) {
        best = { col, row };
        bestDistance = d;
      }
    }
  }
  return best;
}
