// The board's hexes as worn stone tiles (docs/viewer-spec.md section 3, Board): their colour
// mottled, grained, crossed by a few hairline cracks, darker and chipped towards their edges and
// with a border carved in from them, worked out in the shader from each point on the tile, so it
// stays sharp at any zoom and needs no image. Each tile has its own pattern, from where it stands.
// The numbers are in look.ts.

import * as THREE from 'three';
import { TILE_TEXTURE } from './look.js';

const NOISE = /* glsl */ `
  varying vec3 vTile;
  varying vec2 vTileSeed;

  float tileHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // Value noise, smoothly between the hashes at whole-number points.
  float tileNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = tileHash(i);
    float b = tileHash(i + vec2(1.0, 0.0));
    float c = tileHash(i + vec2(0.0, 1.0));
    float d = tileHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float tileFbm(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amplitude * tileNoise(p);
      p = p * 2.03 + vec2(17.1, 9.7);
      amplitude *= 0.5;
    }
    return sum;
  }
`;

/**
 * Lays the stone pattern over `material`'s colour, for an InstancedMesh of the hex tile, whose
 * corners are `radius` from its centre and point along ±z.
 */
export function stoneTiles(material: THREE.MeshStandardMaterial, radius: number): void {
  const t = TILE_TEXTURE;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vTile;\nvarying vec2 vTileSeed;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTile = position;
        #ifdef USE_INSTANCING
          vTileSeed = instanceMatrix[3].xz;
        #else
          vTileSeed = vec2(0.0);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}`).replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec2 p = vTile.xz;
        vec2 seed = vTileSeed * 7.31 + vec2(3.7, 1.3);
        // How far in from the nearest of the six sides: flat sides face ±x, corners point along ±z.
        vec2 a = abs(p);
        float apothem = ${radius.toFixed(4)} * 0.8660254;
        float edge = apothem - max(a.x, dot(a, vec2(0.5, 0.8660254)));

        float shade = 1.0;
        // Mottled stone, and fine grain.
        shade *= 1.0 + ${t.mottle.toFixed(3)} * (tileFbm(p * 2.6 + seed) * 2.0 - 1.0);
        shade *= 1.0 + ${t.grain.toFixed(3)} * (tileNoise(p * 38.0 + seed * 3.1) * 2.0 - 1.0);
        // A few hairline cracks: where a noise crosses its middle, in the parts another lets through.
        float vein = abs(tileNoise(p * 3.4 + seed * 1.7) - 0.5);
        float crack = (1.0 - smoothstep(0.0, 0.018, vein)) * smoothstep(0.55, 0.75, tileNoise(p * 1.3 - seed));
        shade *= 1.0 - ${t.cracks.toFixed(3)} * crack;
        // Worn, chipped edges, darker where dirt has gathered.
        float wear = ${t.edgeWidth.toFixed(3)} * (0.55 + 0.9 * tileNoise(p * 9.0 + seed * 2.3));
        shade *= mix(1.0 - ${t.edgeDarken.toFixed(3)}, 1.0, smoothstep(0.0, wear, edge));
        // A border carved in from the edges: a dark groove, with a pale lip inside it, worn away in places.
        float along = abs(edge - ${t.borderInset.toFixed(3)});
        float kept = smoothstep(0.2, 0.35, tileNoise(p * 5.0 + seed * 1.9));
        shade *= 1.0 - ${t.border.toFixed(3)} * kept * (1.0 - smoothstep(0.006, 0.016, along));
        shade *= 1.0 + 0.35 * ${t.border.toFixed(3)} * kept * (1.0 - smoothstep(0.0, 0.012, abs(edge - ${t.borderInset.toFixed(3)} - 0.022)));
        // Pale scuffs, where feet have worn it smooth.
        shade *= 1.0 + ${t.scuffs.toFixed(3)} * smoothstep(0.62, 0.8, tileFbm(p * 1.7 + seed * 0.7));
        diffuseColor.rgb *= shade;
      }`,
    );
  };
  // The pattern is part of the shader, so a copy keyed apart from plain materials.
  material.customProgramCacheKey = () => 'stone-tiles';
  material.needsUpdate = true;
}
