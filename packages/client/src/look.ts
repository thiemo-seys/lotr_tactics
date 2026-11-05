// How the scene looks round the units (docs/viewer-spec.md section 3): where the camera sits and how
// far the mouse can move it, the arena the board stands in, the lights, the fog, and the blur, grade
// and vignette laid over each frame (post.ts). No Three.js and no DOM, so it can be tested.

/** A point or direction in the scene, as x, y and z. */
export type Vec3 = readonly [number, number, number];

/**
 * Where the camera starts, behind the near side's back row. `board` frames the board alone, for the
 * fight viewer. `bench` stands higher and further back, so the bench in front fits too, for the
 * play page in planning and fights alike. The camera stays where the person puts it: a fight with
 * the person as team B is drawn turned round, so their side is near, rather than the camera moving.
 */
export const CAMERA = {
  board: { position: [0, 12.5, 12.5], target: [0, 0, -0.4] },
  bench: { position: [0, 14, 13], target: [0, 0, 2.4] },
} as const satisfies Record<string, { position: Vec3; target: Vec3 }>;

/** How the camera frames the board: the board alone, or the board and the bench. */
export type Framing = keyof typeof CAMERA;

/**
 * How far the mouse can move the camera, so it always looks down into the arena and never past its
 * edge: the angle from straight down it can tip to, in radians; how near and far it can zoom, in
 * world units from what it looks at; and how far from the board's centre it can pan, along the
 * ground.
 */
export const CAMERA_LIMITS = { maxPolar: 1.05, minDistance: 8, maxDistance: 24, maxPan: 5 } as const;

/** The arena the board stands in: a .glb in public/arenas, built from packages/client/art/arenas. */
export const ARENA = 'ruins';

/**
 * Colour round the arena: the background, which the fog fades into, and the fog's range in world
 * units from the camera. It starts past the board's far corner from any camera the limits allow, so
 * it never dims a unit.
 */
export const ATMOSPHERE = { colour: 0x2a2018, fogNear: 39, fogFar: 85 } as const;

/**
 * The colour of the pawns, on both sides alike: a unit looks the same whichever side it fights for,
 * and only the colour of its health bar tells the sides apart (docs/viewer-spec.md section 4). The
 * models' livery colours are in livery.ts.
 */
export const PAWN_COLOUR = 0x8a8378;

/** Warm, low sunlight from the near left, and a warm sky over a brown ground. */
export const LIGHTS = {
  sky: 0xfff1da,
  ground: 0x5e4b3a,
  ambient: 1.55,
  sun: 0xffe6c0,
  sunIntensity: 1.9,
  sunFrom: [-7, 13, 9] as Vec3,
} as const;

/**
 * The blur round the board, as a lens with a shallow focus has it: none within `inner` of what the
 * camera looks at (the board, the bench and the units on them), along the ground, growing to
 * `maxRadius` CSS pixels at `outer` and beyond, and on the background.
 */
export const BLUR = { inner: 10.5, outer: 20, maxRadius: 8 } as const;

/**
 * The grade laid over the frame, in display colours: warmth multiplies red, green and blue; then
 * saturation and contrast. The board and units get `centre` of it, so the livery and health bars stay true, and
 * the rest of the arena all of it, as the blur grows. The vignette darkens the corners to
 * `1 - vignette`.
 */
export const GRADE = {
  warmth: [1.05, 1.0, 0.88] as Vec3,
  saturation: 0.86,
  contrast: 1.06,
  centre: 0.35,
  vignette: 0.42,
  vignetteInner: 0.35,
  vignetteOuter: 0.95,
} as const;

/** How far a camera view's position is from its target, and its angle from straight down, in radians. */
export function cameraAngles(view: { position: Vec3; target: Vec3 }): { distance: number; polar: number } {
  const [dx, dy, dz] = [0, 1, 2].map((i) => view.position[i]! - view.target[i]!) as [number, number, number];
  const distance = Math.hypot(dx, dy, dz);
  return { distance, polar: Math.acos(dy / distance) };
}

/** How much a point on the ground `distance` from what the camera looks at is blurred, from 0 to 1, as the shader works it out. */
export function blurAt(distance: number): number {
  const t = Math.min(Math.max((distance - BLUR.inner) / (BLUR.outer - BLUR.inner), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * The stone pattern on the board's hexes (tiles.ts), as how far each part moves the tile's colour,
 * up or down, as a share of it: broad mottling, fine grain, hairline cracks (darkening), wear along
 * the edges (darkening, over about `edgeWidth` world units in from them), pale scuffs, and a border
 * carved `borderInset` world units in from the edges (darkening, with a pale lip inside it).
 */
export const TILE_TEXTURE = {
  mottle: 0.2,
  grain: 0.07,
  cracks: 0.38,
  edgeWidth: 0.14,
  edgeDarken: 0.26,
  scuffs: 0.08,
  borderInset: 0.15,
  border: 0.24,
} as const;
