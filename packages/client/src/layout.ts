// Where board hexes sit in the 3D scene (docs/viewer-spec.md section 3).

import { BOARD_COLS, BOARD_ROWS, toOffset, type Hex } from '@lotr-tactics/sim';

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
