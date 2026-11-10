// What the animation inspector shows (dev/anim.html): the unit, star level and clip, where the
// playhead is, the camera and the overlays, read from and written to the page's URL, and the frame
// arithmetic its controls need. No Three.js and no DOM, so it can be tested. It's a dev tool, served
// by `pnpm dev` only (docs/animation-plan.md, Tools).

import type { Star } from '@lotr-tactics/sim';
import { CLIPS, type ClipName } from '../../src/animation.js';
import { CAMERA } from '../../src/look.js';

/** The clips' frame rate: one frame per tick of the sim (art/rig.py, FPS). */
export const FPS = 30;

/** How many times a frame Three.js is asked for a pose when the inspector traces a clip: as finish() checks it (art/rig.py, BETWEEN). */
export const STEPS_PER_FRAME = 4;

/** The clips that loop in a fight. The others play once and hold their last frame (src/animation.ts). */
export const LOOPING: ReadonlySet<ClipName> = new Set(['idle', 'move', 'stun']);

/** How long a clip that plays once holds its last frame before it plays again, in seconds. */
export const HOLD_SECONDS = 0.6;

export const SPEEDS = [0.1, 0.25, 0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

/** How many ghosts the onion skin shows on each side of the playhead, and how many frames apart. */
export const ONION_COUNTS = [0, 1, 2, 3] as const;
export const ONION_GAPS = [1, 2, 4] as const;

/** The points whose paths can be traced through a clip. */
export const TRAILS = ['hands', 'feet', 'head'] as const;
export type Trail = (typeof TRAILS)[number];

/** Where the camera is: an angle round the model (0 in front of it, 90 on its left), an angle up from level, both in degrees, and a distance. */
export interface Orbit {
  readonly azimuth: number;
  readonly elevation: number;
  readonly distance: number;
}

/** The game's camera: its distance from what it looks at, and its angle down, from look.ts. */
const GAME = (() => {
  const { position, target } = CAMERA.board;
  const across = Math.hypot(position[0] - target[0], position[2] - target[2]);
  const up = position[1] - target[1];
  return { elevation: (Math.atan2(up, across) * 180) / Math.PI, distance: Math.hypot(across, up) };
})();

/**
 * The camera's presets. `game-front` and `game-back` stand as far off and as high as the game's
 * camera, with its field of view, so a unit is drawn as big as on the board: in front of it, as the
 * far side is seen, and behind it, as the near side is. The others look closely, from nearly level.
 */
export const CAMERAS = {
  'game-front': { azimuth: 0, elevation: GAME.elevation, distance: GAME.distance },
  'game-back': { azimuth: 180, elevation: GAME.elevation, distance: GAME.distance },
  hero: { azimuth: 35, elevation: 15, distance: 4 },
  front: { azimuth: 0, elevation: 6, distance: 4 },
  left: { azimuth: 90, elevation: 6, distance: 4 },
  back: { azimuth: 180, elevation: 6, distance: 4 },
  right: { azimuth: -90, elevation: 6, distance: 4 },
} as const satisfies Record<string, Orbit>;
export type CameraName = keyof typeof CAMERAS;
export const CAMERA_NAMES = Object.keys(CAMERAS) as CameraName[];

export interface InspectorState {
  readonly unit: string;
  readonly star: Star;
  readonly clip: ClipName;
  /** Where the playhead is, in frames: a fraction for a pose between two. */
  readonly frame: number;
  readonly playing: boolean;
  readonly speed: Speed;
  /** A preset, or where the mouse put the camera. */
  readonly camera: CameraName | Orbit;
  readonly onion: (typeof ONION_COUNTS)[number];
  readonly gap: (typeof ONION_GAPS)[number];
  readonly trails: readonly Trail[];
  /** The hex and the limit a model keeps within. */
  readonly hex: boolean;
  readonly bones: boolean;
  /** The height the unit's label sits at. */
  readonly label: boolean;
  readonly arena: boolean;
}

export const DEFAULTS: Omit<InspectorState, 'unit'> = {
  star: 1,
  clip: 'attack',
  frame: 0,
  playing: true,
  speed: 1,
  camera: 'hero',
  onion: 0,
  gap: 2,
  trails: [],
  hex: true,
  bones: false,
  label: false,
  arena: false,
};

/**
 * The state a URL's hash gives, for one of `units`, the first if it names none of them. Anything it
 * leaves out or gets wrong takes the default. A link with a frame opens paused on it, unless it says
 * `play=1`.
 */
export function parseState(hash: string, units: readonly string[]): InspectorState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const get = (name: string) => params.get(name);
  const unit = units.includes(get('unit') ?? '') ? get('unit')! : (units[0] ?? '');
  const frame = Number(get('frame'));
  const hasFrame = get('frame') !== null && Number.isFinite(frame) && frame >= 0;
  return {
    unit,
    star: oneOf([1, 2, 3] as const, Number(get('star')), DEFAULTS.star),
    clip: oneOf(CLIPS, get('clip'), DEFAULTS.clip),
    frame: hasFrame ? frame : DEFAULTS.frame,
    playing: get('play') === null ? !hasFrame : get('play') === '1',
    speed: oneOf(SPEEDS, Number(get('speed')), DEFAULTS.speed),
    camera: parseCamera(get('cam'), get('view')),
    onion: oneOf(ONION_COUNTS, Number(get('onion')), DEFAULTS.onion),
    gap: oneOf(ONION_GAPS, Number(get('gap')), DEFAULTS.gap),
    trails: TRAILS.filter((trail) => (get('trails') ?? '').split(',').includes(trail)),
    hex: flag(get('hex'), DEFAULTS.hex),
    bones: flag(get('bones'), DEFAULTS.bones),
    label: flag(get('label'), DEFAULTS.label),
    arena: flag(get('arena'), DEFAULTS.arena),
  };
}

/**
 * The hash for a state, without what is as the defaults have it. A paused state keeps its frame,
 * so a link opens on the same pose; a playing one leaves it out.
 */
export function formatState(state: InspectorState): string {
  const params = new URLSearchParams();
  params.set('unit', state.unit);
  if (state.star !== DEFAULTS.star) params.set('star', String(state.star));
  if (state.clip !== DEFAULTS.clip) params.set('clip', state.clip);
  if (!state.playing) params.set('frame', String(round(state.frame, 2)));
  if (state.speed !== DEFAULTS.speed) params.set('speed', String(state.speed));
  if (typeof state.camera === 'string') {
    if (state.camera !== DEFAULTS.camera) params.set('cam', state.camera);
  } else {
    params.set('view', formatOrbit(state.camera));
  }
  if (state.onion !== DEFAULTS.onion) params.set('onion', String(state.onion));
  if (state.gap !== DEFAULTS.gap) params.set('gap', String(state.gap));
  if (state.trails.length > 0) params.set('trails', state.trails.join(','));
  for (const name of ['hex', 'bones', 'label', 'arena'] as const) {
    if (state[name] !== DEFAULTS[name]) params.set(name, state[name] ? '1' : '0');
  }
  // Commas read better in a link than %2C.
  return `#${params.toString().replaceAll('%2C', ',')}`;
}

/** Where a camera named or placed by a URL is: a preset by name, or an orbit as `azimuth,elevation,distance`. */
function parseCamera(name: string | null, view: string | null): CameraName | Orbit {
  if (view !== null) {
    const orbit = parseOrbit(view);
    if (orbit !== null) return orbit;
  }
  return name !== null && Object.hasOwn(CAMERAS, name) ? (name as CameraName) : (DEFAULTS.camera as CameraName);
}

export function parseOrbit(text: string): Orbit | null {
  const parts = text.split(',').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isFinite)) return null;
  const [azimuth, elevation, distance] = parts as [number, number, number];
  if (distance <= 0 || Math.abs(elevation) > 90) return null;
  return { azimuth, elevation, distance };
}

export function formatOrbit({ azimuth, elevation, distance }: Orbit): string {
  return `${round(azimuth, 0)},${round(elevation, 0)},${round(distance, 1)}`;
}

/** The orbit of a camera, by name or as placed. */
export function orbitOf(camera: CameraName | Orbit): Orbit {
  return typeof camera === 'string' ? CAMERAS[camera] : camera;
}

/** Where a camera on an orbit stands, from what it looks at: x to the model's left, y up and z in front of it. */
export function orbitOffset({ azimuth, elevation, distance }: Orbit): readonly [number, number, number] {
  const a = (azimuth * Math.PI) / 180;
  const e = (elevation * Math.PI) / 180;
  return [distance * Math.cos(e) * Math.sin(a), distance * Math.sin(e), distance * Math.cos(e) * Math.cos(a)];
}

/** The orbit a camera is on, from where it stands relative to what it looks at: orbitOffset turned round. */
export function orbitFromOffset(x: number, y: number, z: number): Orbit {
  const distance = Math.hypot(x, y, z);
  return {
    azimuth: (Math.atan2(x, z) * 180) / Math.PI,
    elevation: distance > 0 ? (Math.asin(y / distance) * 180) / Math.PI : 0,
    distance,
  };
}

/** A clip's last frame: its length in frames, which its final key sits on. */
export function lastFrame(seconds: number): number {
  return Math.round(seconds * FPS);
}

/**
 * The frame a step from `frame` lands on, one way or the other: the next whole frame, wrapping
 * round the clip's ends, so a step from between two frames goes to one of them.
 */
export function stepFrame(frame: number, direction: 1 | -1, last: number): number {
  if (last <= 0) return 0;
  const next = direction > 0 ? Math.floor(frame + 1e-6) + 1 : Math.ceil(frame - 1e-6) - 1;
  if (next > last) return 0;
  if (next < 0) return last;
  return next;
}

/**
 * The playhead `seconds` of the clip's time on from `clock`, its own time, in seconds: a looping clip
 * wraps round, and one that plays once runs past its end by HOLD_SECONDS, holding its last frame,
 * and then starts again.
 */
export function advance(clock: number, seconds: number, length: number, looping: boolean): number {
  if (length <= 0) return 0;
  const span = looping ? length : length + HOLD_SECONDS;
  const next = (clock + seconds) % span;
  return next < 0 ? next + span : next;
}

/** The time a clip is posed at for a playhead: never past its end. */
export function shownTime(clock: number, length: number): number {
  return Math.min(Math.max(clock, 0), length);
}

export interface Ghost {
  /** How many gaps before (negative) or after the playhead it is. */
  readonly offset: number;
  /** The frame it shows. */
  readonly frame: number;
}

/**
 * The onion skin's ghosts round the playhead: `count` either side, `gap` frames apart. A looping
 * clip's wrap round its ends; one that plays once has none past its first or last frame.
 */
export function ghosts(frame: number, count: number, gap: number, last: number, looping: boolean): Ghost[] {
  const out: Ghost[] = [];
  if (last <= 0) return out;
  for (let k = -count; k <= count; k++) {
    if (k === 0) continue;
    let at = frame + k * gap;
    if (looping) at = ((at % last) + last) % last;
    else if (at < 0 || at > last) continue;
    out.push({ offset: k, frame: at });
  }
  return out;
}

/** What the rig kit writes into a rigged model's armature (art/rig.py): when its attack strikes and its cast's hits, in frames. */
export interface RigTiming {
  readonly strike: number | null;
  readonly hits: readonly number[];
}

/** The timing in an armature's extras, as GLTFLoader puts them in its userData. */
export function rigTiming(extras: Readonly<Record<string, unknown>>): RigTiming {
  const strike = typeof extras.strike === 'number' ? extras.strike : null;
  const hits = Array.isArray(extras.hits) ? extras.hits.filter((hit): hit is number => typeof hit === 'number') : [];
  return { strike, hits };
}

export interface Marker {
  readonly frame: number;
  readonly label: string;
}

/**
 * The moments the sim and the viewer time a clip by, marked on the timeline: where an attack's blow
 * lands or its shot leaves, a cast's height and each later hit, and where a dying unit breaks into
 * shards (`shards`, in seconds).
 */
export function markers(clip: ClipName, timing: RigTiming, shards: number): Marker[] {
  if (clip === 'attack' && timing.strike !== null) return [{ frame: timing.strike, label: 'Strike' }];
  if (clip === 'cast') return timing.hits.map((frame, i) => ({ frame, label: i === 0 ? 'Height' : `Hit ${i + 1}` }));
  if (clip === 'death' && shards > 0) return [{ frame: shards * FPS, label: 'Shards' }];
  return [];
}

/** The marker after or before a frame, wrapping round, or null if there are none. */
export function nextMarker(frame: number, list: readonly Marker[], direction: 1 | -1): Marker | null {
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a.frame - b.frame);
  if (direction > 0) return sorted.find((marker) => marker.frame > frame + 1e-6) ?? sorted[0]!;
  return [...sorted].reverse().find((marker) => marker.frame < frame - 1e-6) ?? sorted[sorted.length - 1]!;
}

function oneOf<T extends string | number>(values: readonly T[], value: unknown, fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

function flag(value: string | null, fallback: boolean): boolean {
  if (value === '1') return true;
  if (value === '0') return false;
  return fallback;
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  const rounded = Math.round(value * scale) / scale;
  return Object.is(rounded, -0) ? 0 : rounded;
}
