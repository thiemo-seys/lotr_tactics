// How a unit's model and star level are drawn: which file, how big, the base and the label
// (docs/viewer-spec.md section 4, "Models" and "Star levels"). No Three.js, no DOM.

import type { Star } from '@lotr-tactics/sim';

/** The radius the hexes are drawn with, which a model stays within. */
export const HEX_RADIUS = 0.94;

/** How much bigger 2★ and 3★ models are drawn, before clamping to the hex. */
export const STAR_GROW = 1.1;

/** The scale of a Large unit's pawn. Large models are drawn unscaled. */
export const LARGE_PAWN_SCALE = 1.35;

/** The stand under a unit with a model. */
export const BASE = { height: 0.05, radius: 0.8 } as const;

/** Where the label sits above the base, before scaling, and how far above a Large model's top. */
export const LABEL = { height: 1.8, aboveLarge: 0.3 } as const;

/** Colours per star level, 1★ first. */
export const STAR_COLOURS = {
  trim: [0x6b6f74, 0xc9ced4, 0xc4a04a],
  rim: [0x4b4f55, 0xc9ced4, 0xc4a04a],
  pip: [0xb8b2a6, 0xc9ced4, 0xc4a04a],
} as const satisfies Record<string, readonly [number, number, number]>;

/** The stand's stone. */
export const STAND_COLOUR = 0x3d3a35;

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
 * scale 1): 1.8 above the base, times the scale, or 0.3 above a Large model's top if that is higher.
 */
export function modelLabelHeight(scale: number, top: number, large: boolean): number {
  const height = LABEL.height * scale;
  return BASE.height + (large ? Math.max(height, top * scale + LABEL.aboveLarge) : height);
}

/** The pips' offsets along the base's edge, centred, one per star. */
export function pipOffsets(star: Star): number[] {
  const spacing = 0.2;
  return Array.from({ length: star }, (_, i) => (i - (star - 1) / 2) * spacing);
}
