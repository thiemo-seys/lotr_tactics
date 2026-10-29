import { BOARD_HEXES, distance, fromOffset, mirror, neighbours } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { hexToWorld, lerpPoint, pointDistance } from '../src/layout.js';

describe('hexToWorld', () => {
  it('puts neighbouring hexes √3 apart, so the tiles meet', () => {
    for (const hex of BOARD_HEXES) {
      for (const next of neighbours('A', hex)) {
        expect(pointDistance(hexToWorld(hex), hexToWorld(next))).toBeCloseTo(Math.sqrt(3), 10);
      }
    }
  });

  it('centres the board, so the mirror image of a hex is its point reflection', () => {
    for (const hex of BOARD_HEXES) {
      const { x, z } = hexToWorld(hex);
      const mirrored = hexToWorld(mirror(hex));
      expect(mirrored.x).toBeCloseTo(-x, 10);
      expect(mirrored.z).toBeCloseTo(-z, 10);
    }
  });

  it('puts team A’s rows nearest the camera, with columns running left to right', () => {
    const backLeft = hexToWorld(fromOffset({ col: 0, row: 0 }));
    const backRight = hexToWorld(fromOffset({ col: 6, row: 0 }));
    const farRow = hexToWorld(fromOffset({ col: 0, row: 7 }));
    expect(backRight.x).toBeGreaterThan(backLeft.x);
    expect(farRow.z).toBeLessThan(backLeft.z);
  });

  it('keeps distances in proportion to hex distance along a row', () => {
    const a = fromOffset({ col: 0, row: 2 });
    const b = fromOffset({ col: 4, row: 2 });
    expect(pointDistance(hexToWorld(a), hexToWorld(b))).toBeCloseTo(distance(a, b) * Math.sqrt(3), 10);
  });
});

describe('lerpPoint', () => {
  it('runs from the first point to the second', () => {
    const a = { x: 0, z: 0 };
    const b = { x: 2, z: -4 };
    expect(lerpPoint(a, b, 0)).toEqual(a);
    expect(lerpPoint(a, b, 0.5)).toEqual({ x: 1, z: -2 });
    expect(lerpPoint(a, b, 1)).toEqual(b);
  });
});
