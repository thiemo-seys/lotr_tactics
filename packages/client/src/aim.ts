// Which way a model shoots, where that isn't straight ahead (docs/viewer-spec.md section 5, Facing).
// No Three.js and no DOM, so it can be tested.

/**
 * How many degrees to its own left an archer's model points its arrow, by model name: its script's
 * AIM_YAW (packages/client/art/units/), the gear model's its 1★ model's. An archer is built in an open
 * stance, its arrow turned this far from straight ahead so its bow shows its curve to the camera
 * rather than standing edge-on; the viewer turns the model this far back to its right as it faces its
 * target, so the arrow points at the target. Models not listed shoot straight ahead.
 */
export const AIM_YAWS: Readonly<Record<string, number>> = {
  faramir: 52,
  'faramir-2': 52,
  gorbag: 60,
  'gorbag-2': 60,
  'gorbag-3': 60,
  haldir: 50,
  'haldir-2': 50,
  'haldir-3': 50,
  legolas: 50,
  'legolas-2': 50,
  'legolas-3': 56,
  lurtz: 66,
  'lurtz-2': 66,
  'lurtz-3': 66,
};

/**
 * How far to its left the model named shoots, as an angle about the vertical in radians, the way
 * `facing()` in playback.ts measures: what to take off the way it faces for it to shoot at its target.
 */
export function aimOf(name: string): number {
  return ((AIM_YAWS[name] ?? 0) * Math.PI) / 180;
}
