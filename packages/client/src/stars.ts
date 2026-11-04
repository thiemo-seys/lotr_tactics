// How a unit's model and star level are drawn: which file, how big, its trim and the label
// (docs/viewer-spec.md section 4, "Models" and "Star levels"). No Three.js, no DOM.

import type { Star } from '@lotr-tactics/sim';

/** The radius the hexes are drawn with, which a model stays within. */
export const HEX_RADIUS = 0.94;

/** How much bigger 2★ and 3★ models are drawn, before clamping to the hex. */
export const STAR_GROW = 1.1;

/** The scale of a Large unit's pawn. Large models are drawn unscaled. */
export const LARGE_PAWN_SCALE = 1.35;

/**
 * Where the label sits above the ground, before scaling; how far above a Large model's top; and how far
 * above the highest point a model reaches in its attack, cast and victory clips.
 */
export const LABEL = { height: 1.8, aboveLarge: 0.3, clear: 0.15 } as const;

/** Colours per star level, 1★ first. */
export const STAR_COLOURS = {
  trim: [0x6b6f74, 0xc9ced4, 0xc4a04a],
} as const satisfies Record<string, readonly [number, number, number]>;

/** The colour of a star-level part. */
export function starColour(part: keyof typeof STAR_COLOURS, star: Star): number {
  return STAR_COLOURS[part][star - 1]!;
}

/** The model files to try for a unit at a star level, best first: `<id>-3`, `<id>-2`, `<id>`. */
export function modelCandidates(unitId: string, star: Star): string[] {
  const names: string[] = [];
  for (let s = star; s > 1; s--) names.push(`${unitId}-${s}`);
  names.push(unitId);
  return names;
}

/** The model to draw for a unit at a star level, out of the ones that exist, or null if none does. */
export function pickModel(unitId: string, star: Star, available: ReadonlySet<string>): string | null {
  return modelCandidates(unitId, star).find((name) => available.has(name)) ?? null;
}

/**
 * The scale of a model with the given reach from its centre: 1 at 1★, and at 2★ and 3★ the smaller of
 * 1.1 and what fits the hex, but never below 1. Large models start from 1 too.
 */
export function starScale(star: Star, reach: number): number {
  if (star === 1) return 1;
  const fit = reach > 0 ? HEX_RADIUS / reach : STAR_GROW;
  return Math.max(1, Math.min(STAR_GROW, fit));
}

/**
 * The label's height above the ground for a model with the given scale and top (its height at
 * scale 1): 1.8 above the ground, times the scale, or 0.3 above a Large model's top if that is higher.
 */
export function modelLabelHeight(scale: number, top: number, large: boolean): number {
  const height = LABEL.height * scale;
  return large ? Math.max(height, top * scale + LABEL.aboveLarge) : height;
}

/**
 * Where the bottom edge of a model's label sits above the ground, holding still through planning and
 * fights: modelLabelHeight, or clear of `strike`, the highest point the model reaches in its attack
 * and cast clips at scale 1 (its top for a static model), times its scale, if that is higher.
 */
export function labelHeight(scale: number, top: number, large: boolean, strike: number): number {
  return Math.max(modelLabelHeight(scale, top, large), clearOf(scale, strike));
}

/**
 * How much higher a winner's label goes once `victory` has faded in, to clear `raised`, the highest
 * point its victory reaches at scale 1, times its scale: 0 when the label already clears it.
 */
export function victoryRise(scale: number, top: number, large: boolean, strike: number, raised: number): number {
  return Math.max(0, clearOf(scale, raised) - labelHeight(scale, top, large, strike));
}

/** Where a label's bottom edge goes to clear a point `height` up a model at scale 1. */
function clearOf(scale: number, height: number): number {
  return scale * height + LABEL.clear;
}
