import { BOARD_HEXES, distance, fromOffset, mirror, neighbours } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { BENCH_SPACING, benchToWorld, hexToWorld, lerpPoint, placeAtPoint, pointDistance } from '../src/layout.js';

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

describe('placeAtPoint', () => {
  it('finds every hex on the near half and every bench slot from its centre', () => {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 7; col++) expect(placeAtPoint(hexToWorld(fromOffset({ col, row })))).toEqual({ col, row });
    }
    for (let slot = 0; slot < 9; slot++) expect(placeAtPoint(benchToWorld(slot))).toEqual({ bench: slot });
  });

  it('finds a hex a little off its centre', () => {
    const { x, z } = hexToWorld(fromOffset({ col: 2, row: 1 }));
    expect(placeAtPoint({ x: x + 0.4, z: z - 0.3 })).toEqual({ col: 2, row: 1 });
  });

  it('finds nothing on the far half, behind the bench or past its ends', () => {
    expect(placeAtPoint(hexToWorld(fromOffset({ col: 3, row: 5 })))).toBeNull();
    const first = benchToWorld(0);
    expect(placeAtPoint({ x: first.x - BENCH_SPACING, z: first.z })).toBeNull();
    expect(placeAtPoint({ x: 0, z: first.z + BENCH_SPACING })).toBeNull();
  });

  it('puts the bench in front of the back row, centred', () => {
    expect(benchToWorld(4).x).toBeCloseTo(0, 10);
    expect(benchToWorld(0).z).toBeGreaterThan(hexToWorld(fromOffset({ col: 0, row: 0 })).z + 1);
  });
});
