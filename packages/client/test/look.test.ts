// The camera's limits, the fog and the blur round the board (docs/viewer-spec.md section 3).

import { BOARD_HEXES, PLAYER } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { benchToWorld, hexToWorld, pointDistance, type Point } from '../src/layout.js';
import { ATMOSPHERE, BLUR, CAMERA, CAMERA_LIMITS, blurAt, cameraAngles } from '../src/look.js';

/** How far a hex's corners reach from its centre, as the board draws them. */
const HEX_RADIUS = 0.94;

/** How far a bench tile's corners reach from its centre. */
const BENCH_RADIUS = 0.7 * Math.SQRT2;

const ground = (point: readonly [number, number, number]): Point => ({ x: point[0], z: point[2] });

/** How far the furthest point of the board reaches from a point on the ground. */
function boardReach(from: Point): number {
  return Math.max(...BOARD_HEXES.map((hex) => pointDistance(from, hexToWorld(hex)) + HEX_RADIUS));
}

describe('the camera', () => {
  it('starts every view within the limits the mouse is held to, so none jumps when it is first moved', () => {
    for (const view of Object.values(CAMERA)) {
      const { distance, polar } = cameraAngles(view);
      expect(polar).toBeLessThanOrEqual(CAMERA_LIMITS.maxPolar);
      expect(distance).toBeGreaterThanOrEqual(CAMERA_LIMITS.minDistance);
      expect(distance).toBeLessThanOrEqual(CAMERA_LIMITS.maxDistance);
      expect(Math.hypot(view.target[0], view.target[2])).toBeLessThanOrEqual(CAMERA_LIMITS.maxPan);
    }
  });

  it('never sees the fog on a unit: it starts past the furthest unit, on the board or the bench, from anywhere the camera can go', () => {
    // How far a unit can stand from the board's centre, to the corner of its hex or bench tile.
    const centre = { x: 0, z: 0 };
    let reach = boardReach(centre);
    for (let slot = 0; slot < PLAYER.benchSize; slot++) reach = Math.max(reach, pointDistance(centre, benchToWorld(slot)) + BENCH_RADIUS);
    // The camera sits `distance` from what it looks at, tipped `polar` from straight down, and that
    // point is panned at most maxPan from the centre. Along the ground the camera is then at most
    // distance·sin(polar) + maxPan + reach from a unit, and above it at most distance·cos(polar),
    // which together are furthest at the furthest distance and the widest angle. The fog goes by
    // depth along the camera's view, which is never more than this.
    const { maxDistance, maxPolar, maxPan } = CAMERA_LIMITS;
    const across = maxDistance * Math.sin(maxPolar) + maxPan + reach;
    const up = maxDistance * Math.cos(maxPolar);
    expect(ATMOSPHERE.fogNear).toBeGreaterThan(Math.hypot(across, up));
  });
});

describe('blurAt', () => {
  it('leaves the whole board in focus from where each view looks', () => {
    for (const view of Object.values(CAMERA)) expect(blurAt(boardReach(ground(view.target)))).toBe(0);
  });

  it("leaves the board and the bench in focus from where the play page's view looks", () => {
    const focus = ground(CAMERA.bench.target);
    expect(blurAt(boardReach(focus))).toBe(0);
    for (let slot = 0; slot < PLAYER.benchSize; slot++) {
      expect(blurAt(pointDistance(focus, benchToWorld(slot)) + BENCH_RADIUS)).toBe(0);
    }
  });

  it('grows smoothly to the whole blur', () => {
    expect(blurAt(BLUR.inner)).toBe(0);
    expect(blurAt((BLUR.inner + BLUR.outer) / 2)).toBeCloseTo(0.5, 10);
    expect(blurAt(BLUR.outer)).toBe(1);
    expect(blurAt(BLUR.outer + 50)).toBe(1);
    let last = 0;
    for (let d = BLUR.inner; d <= BLUR.outer; d += 0.5) {
      expect(blurAt(d)).toBeGreaterThanOrEqual(last);
      last = blurAt(d);
    }
  });
});
