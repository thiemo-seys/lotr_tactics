// The committed arena in public/arenas (docs/viewer-spec.md section 3, Arena; section 7).

import { BOARD_HEXES } from '@lotr-tactics/sim';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hexToWorld } from '../src/layout.js';
import { ARENA } from '../src/look.js';

/** The arena's triangle budget (placeholder; art/arena.py, ARENA_BUDGET). */
const BUDGET = 48000;

/**
 * Where the arena leaves room, as |x| and |z| in the game (art/arena.py, COURT and LOW_BAND): the
 * court round the board and the bench, where nothing stands higher than a pebble or a tuft of grass,
 * and the band round it, where nothing stands higher than about the knee.
 */
const COURT = { x: 8.6, z: 9.6, height: 0.3 };
const LOW_BAND = { x: 10.6, z: 11.2, height: 1.2 };

/** The radius the board's hexes are drawn with. */
const HEX_RADIUS = 0.94;

interface Accessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
}

interface Gltf {
  readonly meshes: readonly { readonly primitives: readonly { readonly attributes: Readonly<Record<string, number>>; readonly indices?: number }[] }[];
  readonly accessors: readonly Accessor[];
  readonly bufferViews: readonly { readonly byteOffset?: number; readonly byteStride?: number }[];
}

/** The arena's .glb: a 12-byte header, then a JSON chunk and a binary chunk. */
function load(): { json: Gltf; bin: DataView } {
  const file = readFileSync(new URL(`../public/arenas/${ARENA}.glb`, import.meta.url));
  const data = new DataView(file.buffer, file.byteOffset, file.byteLength);
  expect(data.getUint32(0, true)).toBe(0x46546c67);
  expect(data.getUint32(4, true)).toBe(2);
  let json: Gltf | null = null;
  let bin: DataView | null = null;
  for (let at = 12; at + 8 <= file.byteLength; ) {
    const length = data.getUint32(at, true);
    const type = data.getUint32(at + 4, true);
    const start = at + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(file.subarray(start, start + length))) as Gltf;
    if (type === 0x004e4942) bin = new DataView(file.buffer, file.byteOffset + start, length);
    at = start + length;
  }
  if (json === null || bin === null) throw new Error(`${ARENA}.glb has no JSON or no binary chunk.`);
  return { json, bin };
}

/** The positions of an accessor of float VEC3s, as x, y, z. */
function positions(gltf: { json: Gltf; bin: DataView }, index: number): [number, number, number][] {
  const accessor = gltf.json.accessors[index]!;
  expect(accessor.type).toBe('VEC3');
  expect(accessor.componentType).toBe(5126);
  const view = gltf.json.bufferViews[accessor.bufferView!]!;
  const stride = view.byteStride ?? 12;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const points: [number, number, number][] = [];
  for (let i = 0; i < accessor.count; i++) {
    const at = start + i * stride;
    points.push([gltf.bin.getFloat32(at, true), gltf.bin.getFloat32(at + 4, true), gltf.bin.getFloat32(at + 8, true)]);
  }
  return points;
}

describe(`the arena (${ARENA})`, () => {
  const gltf = load();
  const primitives = gltf.json.meshes.flatMap((mesh) => mesh.primitives);

  it('is within its triangle budget', () => {
    let triangles = 0;
    for (const primitive of primitives) triangles += gltf.json.accessors[primitive.indices!]!.count / 3;
    expect(triangles).toBeLessThanOrEqual(BUDGET);
  });

  it('has its baked occlusion and no normals, so the client shades it flat', () => {
    for (const primitive of primitives) {
      expect(primitive.attributes.COLOR_0).toBeDefined();
      expect(primitive.attributes.NORMAL).toBeUndefined();
    }
  });

  it('keeps the court round the board and the bench clear, and the band round it low, so the cameras see past them', () => {
    let tallestInCourt = -Infinity;
    let tallestInBand = -Infinity;
    for (const primitive of primitives) {
      for (const [x, y, z] of positions(gltf, primitive.attributes.POSITION!)) {
        if (Math.abs(x) < COURT.x && Math.abs(z) < COURT.z) tallestInCourt = Math.max(tallestInCourt, y);
        else if (Math.abs(x) < LOW_BAND.x && Math.abs(z) < LOW_BAND.z) tallestInBand = Math.max(tallestInBand, y);
      }
    }
    expect(tallestInCourt).toBeLessThanOrEqual(COURT.height);
    expect(tallestInBand).toBeLessThanOrEqual(LOW_BAND.height);
  });

  it('lies under the board: nothing under a hex reaches its top, at 0', () => {
    const centres = BOARD_HEXES.map((hex) => hexToWorld(hex));
    // Pointy-top hexes, drawn with a radius of 0.94: corners towards ±z, flat sides towards ±x.
    const underHex = (x: number, z: number) =>
      centres.some((c) => {
        const dx = Math.abs(x - c.x);
        const dz = Math.abs(z - c.z);
        return dx <= HEX_RADIUS * (Math.sqrt(3) / 2) && dz <= HEX_RADIUS - dx / Math.sqrt(3);
      });
    let highest = -Infinity;
    for (const primitive of primitives) {
      for (const [x, y, z] of positions(gltf, primitive.attributes.POSITION!)) {
        if (underHex(x, z)) highest = Math.max(highest, y);
      }
    }
    expect(highest).toBeLessThan(0);
  });
});
