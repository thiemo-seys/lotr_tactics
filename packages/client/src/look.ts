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

/** How high over the bench, in world units, the note that it is full stands (docs/game-spec.md section 12). */
export const BENCH_NOTE_HEIGHT = 2.6;

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

// ---------------------------------------------------------------------------------------------
// Effects (docs/viewer-spec.md section 5, Effects): the punchy style, from the study in
// art/effects-study/ (its `STYLES.punchy`). Colours are sRGB hex, sizes world units, times seconds.

/** What an ability's projectile is, when it has one. */
export type ProjectileKind = 'arrow' | 'bolt' | 'stone' | 'fireball';

/** How an ability looks: its colour, and its projectile's kind if it looses or lobs one. */
export interface AbilityLook {
  readonly colour: number;
  readonly projectile?: ProjectileKind;
}

/**
 * Each ability's look, by its name: every unit's and every monster's (a test checks there is one for
 * each, with a projectile for those delivered by `projectile` or `lob`). An ability missing from the
 * table takes its damage type's default (`EFFECTS.abilityDefault`).
 */
export const ABILITY_LOOKS: Readonly<Record<string, AbilityLook>> = {
  // 1-cost
  Loyal: { colour: 0xffd98a },
  'Barrow-blade': { colour: 0xbfe0ff },
  'Stone toss': { colour: 0xe8c890, projectile: 'stone' },
  'Shield bash': { colour: 0xdfe6f0 },
  Doorward: { colour: 0xffc94d },
  Sneak: { colour: 0xa6c75a },
  'Warg bite': { colour: 0xe0573e },
  Volley: { colour: 0xe08a3c, projectile: 'arrow' },
  // 2-cost
  'Slip away': { colour: 0xd8e4ff },
  'Lórien volley': { colour: 0xd4ecb0, projectile: 'arrow' },
  "Ranger's shot": { colour: 0xffd56a, projectile: 'arrow' },
  'Horn of the Hornburg': { colour: 0xffd34d },
  'Lord of Moria': { colour: 0x9fc0ff },
  'Piercing arrow': { colour: 0xff7a3c, projectile: 'arrow' },
  Flock: { colour: 0xb6d97a, projectile: 'bolt' },
  'Black Breath': { colour: 0x9fe6c0, projectile: 'bolt' },
  // 3-cost
  'Riddles in the Dark': { colour: 0xc8a8ff },
  'My precious': { colour: 0xf0c040 },
  'And my axe!': { colour: 0xffa040 },
  'Horn of Gondor': { colour: 0xffc94d },
  'Spear thrust': { colour: 0xd8e070 },
  Shieldmaiden: { colour: 0xfff0c0 },
  'Bred for war': { colour: 0xd04a2a },
  'Shadow ride': { colour: 0x8fdcb0 },
  // 4-cost
  Flurry: { colour: 0xe8f0ff, projectile: 'arrow' },
  'Healer of Rivendell': { colour: 0x9cf0b0 },
  Andúril: { colour: 0xcfe6ff },
  'Forth Eorlingas!': { colour: 0xffd34d },
  'Iron Hills': { colour: 0xff8a3c },
  'Fire of Orthanc': { colour: 0xff7a2a, projectile: 'fireball' },
  'Unleash the Orcs': { colour: 0xe06a2a },
  // 5-cost
  'You shall not pass': { colour: 0x9fd0ff },
  'Light of the Eldar': { colour: 0xe8f4ff },
  'Morgul mace': { colour: 0x9ae06a },
  Boulder: { colour: 0xb8a070, projectile: 'stone' },
  Sweep: { colour: 0xff5a1e },
  // Monsters
  Smash: { colour: 0xd09050 },
  Tentacles: { colour: 0x6ad0c0 },
  Trample: { colour: 0xe0b070 },
  'Whip of flame': { colour: 0xff6a1a },
};

export const EFFECTS = {
  /** An ability not in ABILITY_LOOKS: physical gold, magic blue-white, true white. */
  abilityDefault: {
    physical: { colour: 0xffc850, projectile: 'arrow' },
    magic: { colour: 0xbfe0ff, projectile: 'bolt' },
    true: { colour: 0xffffff, projectile: 'bolt' },
  },
  /** Sparks at a unit an ability reaches, by damage type; more for a big moment. */
  sparks: { physical: 0xffd27a, magic: 0x8ac8ff, true: 0xffffff, count: 8, bigCount: 16, seconds: 0.3, speed: 6 },
  /** The edges of telegraphs and aim lines: the near side's (A) blue and the far side's red, as the name plates' borders. */
  sides: { A: 0x4a90d9, B: 0xe0503e },
  /** The glow gathering at a caster through its wind-up, fading out this long after the release. */
  gather: { size: 1.4, fade: 0.1 },
  /** A telegraphed hex flashes for this long after it lands. */
  telegraph: { linger: 0.35 },
  /** An aim line's width, from the start of the wind-up to its end. */
  aimLine: { from: 0.012, to: 0.032 },
  /**
   * A lob's arc above the line from caster to landing: low enough that it stays below the name
   * plates of the units between caster and target from the starting camera, rather than behind them.
   */
  lob: { arc: 1.3, trail: 1.1 },
  /** How much bigger an arrow is drawn than its model, across and along: thick enough to read in a volley. */
  arrow: { across: 1.9, along: 1.3 },
  /**
   * The streak behind an arrow or a thrown stone: a bright core in the ability's colour, light added
   * to what is behind, over a wider edge painted at `edgeOpacity` in a deep, saturated cut of that
   * colour (`edgeLightness`), so it reads on pale stone and shells too, where added light washes out.
   */
  streak: { length: 3.2, width: 0.08, edge: 0.15, edgeOpacity: 0.6, edgeLightness: 0.3, stoneLength: 1.6 },
  /** A thrown stone's size (a lobbed one's is bigger) and colour, dark, to stand out from the sandstone. */
  stone: { size: 0.28, lobSize: 0.34, colour: 0x5e5244 },
  /** A charge's ribbon: how far back it trails, in seconds of the charge, how wide, and its fade after. */
  ribbon: { seconds: 0.35, width: 1.1, fade: 0.35 },
  /**
   * A shockwave ring on landing, out to the aim's hexes; its band as a share of its radius; and for a
   * cone, how long after its nearest hex's ring each further hex's comes, in seconds per world unit.
   * Rings fade out over `edgeFade` world units across the board's edge, half inside it and half past it.
   */
  shockwave: { seconds: 0.45, width: 0.07, sweep: 0.025, edgeFade: 0.5 },
  /** A lob's scorch on the ground. */
  scorch: { colour: 0x1a1008, strength: 0.55, seconds: 2.2, radius: 1.5 },
  /** A wave on the ground from the caster, for an ally aim: dimmer than a shockwave, as it threatens nothing. */
  wave: { seconds: 0.5, strength: 0.4 },
  /** A glow at a unit an ability reaches. */
  impactGlow: { seconds: 0.18, size: 1, bigSize: 1.6 },
  /**
   * Every hit: a white flash, a push away from the source and back, a squash that springs back. The
   * flash peaks at `flashIntensity`, light added over the model, so its shading and livery still show.
   * A hit `flashRecover` or more after the unit's last one flashes it fully; a sooner one, only that
   * share of the way, so a volley doesn't keep it white.
   */
  hit: { flashSeconds: 4 / 30, flashIntensity: 0.55, flashRecover: 0.3, push: 0.22, pushSeconds: 6 / 30, squash: 0.16, squashSeconds: 0.22 },
  /** The health bar's pale chunk for health just lost: it holds, then drains. */
  drain: { hold: 0.25, seconds: 0.35 },
  /** Floating numbers pop in from this many times their size over `seconds`. */
  numbers: { pop: 1.7, seconds: 4 / 30 },
  /**
   * Big moments: an ability reaching `units` or more enemies on one landing, or reaching one with a
   * wind-up of `windup` seconds or more. The camera shakes by up to `shake`, dying away over
   * `shakeSeconds`; the caster and the units reached hold their pose `hitStop` seconds, then catch
   * up at twice the speed; an area of radius `flashRadius` or a lob flashes the screen.
   */
  big: { units: 3, windup: 0.5, shake: 0.14, shakeSeconds: 0.5, hitStop: 0.08, flashRadius: 2, flash: 0.22, flashSeconds: 0.3 },
  /** Gold stars circling a stunned unit's head. */
  stun: { colour: 0xffd34d, count: 3, size: 0.13, radius: 0.36, turnsPerSecond: 1, grow: 0.15 },
  /** The thin ring under a unit while a buff lasts, in its stat's colour. */
  buff: {
    colours: { attackDamagePct: 0xff8a4a, attackSpeedPct: 0xffd34d, armor: 0xffc94d, magicResist: 0xb89cff },
  },
  /** Thin rings under slowed and reduced units, icy blue and dark red. */
  rings: { slow: 0x9fd8ff, reduce: 0x8a1f1a, grow: 0.15 },
  /**
   * The shell round a shielded unit: it pops in, and ripples when it absorbs damage. Faint, so the
   * unit and its swing read through it: the faceted edges carry the look. Its radius is `size` times
   * the unit's chest height, plus `pad`, at most `maxRadius`.
   */
  shield: { colour: 0x9fd8ff, fill: 0.035, edges: 0.4, size: 0.85, pad: 0.05, maxRadius: 0.82, pop: 0.35, popSeconds: 0.35, grow: 0.22, ripple: 0.25 },
  /** A dying unit breaks into shards in its livery colour, which fall and fade. */
  shards: { count: 16, seconds: 0.7, size: [0.06, 0.14], speed: [1.5, 3.5], gravity: 10 },
  /** Dust thrown up behind a charge, a puff every `every` seconds of it. */
  dust: { colour: 0x8a7660, every: 0.1, seconds: 0.8, size: 0.2 },
} as const;
