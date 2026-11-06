// The ability-effects study (README.md): the game's arena, board, lights, grade and rigged models,
// playing scripted ability timelines in two styles. Not part of the game: the timelines here are
// proposals, with wind-up and travel times the sim doesn't have yet.
//
// Open /art/effects-study/index.html in `pnpm dev`, with #scene=<name>&style=<grounded|punchy>.
// `record.mjs` drives it frame by frame through `window.study`.

import * as THREE from 'three';
import { BOARD_HEXES, TEAM_ROWS, fromOffset, toOffset, type Star, type UnitId } from '@lotr-tactics/sim';
import { CLIPS, type ClipName } from '../../src/animation.js';
import { loadArena } from '../../src/arena.js';
import { hexToWorld } from '../../src/layout.js';
import { ATMOSPHERE, LIGHTS } from '../../src/look.js';
import { copyModel, loadModels, type ModelCopy } from '../../src/models.js';
import { Post } from '../../src/post.js';
import { stoneTiles } from '../../src/tiles.js';
import { STYLES, kick, type Style, type StyleName, type Timed } from './fx.js';
import { SCENES, type SceneDef } from './scenes.js';

// ---------------------------------------------------------------------------------------------
// The board, as scene.ts draws it.

const BOARD_COLOURS = { A: [0xc9ac84, 0xbfa17a], B: [0x9e7a62, 0x94705a] } as const;
const HEX_TILE_RADIUS = 0.94;
const TILE_HEIGHT = 0.16;
const TILE_BEVEL = 0.05;

function tileGeometry(radius: number): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(radius, -TILE_HEIGHT),
    new THREE.Vector2(radius, -TILE_BEVEL),
    new THREE.Vector2(radius - TILE_BEVEL, 0),
    new THREE.Vector2(0, 0),
  ];
  return new THREE.LatheGeometry(profile, 6);
}

function buildBoard(): THREE.InstancedMesh {
  const material = new THREE.MeshStandardMaterial({ flatShading: true, transparent: true, opacity: 0.72 });
  stoneTiles(material, HEX_TILE_RADIUS);
  const board = new THREE.InstancedMesh(tileGeometry(HEX_TILE_RADIUS), material, BOARD_HEXES.length);
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  BOARD_HEXES.forEach((hex, i) => {
    const { x, z } = hexToWorld(hex);
    board.setMatrixAt(i, matrix.makeTranslation(x, 0, z));
    const { col, row } = toOffset(hex);
    board.setColorAt(i, colour.setHex(BOARD_COLOURS[row < TEAM_ROWS ? 'A' : 'B'][col % 2]!));
  });
  board.renderOrder = -1;
  return board;
}

/** The ground point at a hex, by column and row. */
export function at(col: number, row: number): THREE.Vector3 {
  const { x, z } = hexToWorld(fromOffset({ col, row }));
  return new THREE.Vector3(x, 0, z);
}

// ---------------------------------------------------------------------------------------------
// Units

const TEAM_BAR = { A: 0x4f9be8, B: 0xe0503e } as const;
const BAR = { width: 1.05, height: 0.11 } as const;
/** How long a change of clip takes to fade in. */
const FADE = 0.1;
const LOOPS = new Set<ClipName>(['idle', 'move', 'stun']);

interface ClipKey {
  readonly t: number;
  readonly clip: ClipName;
  readonly speed: number;
}
interface Segment {
  readonly t0: number;
  readonly t1: number;
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
  /** Height of a hop over the segment, for a knock-up. */
  readonly hop: number;
  /** Turn to face the way it goes. */
  readonly face: boolean;
}
interface Hit {
  readonly t: number;
  readonly from: THREE.Vector3;
  readonly power: number;
}
interface BarKey {
  readonly t: number;
  readonly hp: number;
  readonly shield: number;
}

export interface ActorSpec {
  readonly unit: UnitId;
  readonly star?: Star;
  readonly team: 'A' | 'B';
  readonly col: number;
  readonly row: number;
  /** Health at the start, from 0 to 1. */
  readonly hp?: number;
}

/** A unit in a scene, with everything it does over the scene's time. */
export class Actor {
  readonly group = new THREE.Group();
  private readonly turn = new THREE.Group();
  private readonly squash = new THREE.Group();
  readonly home: THREE.Vector3;
  readonly team: 'A' | 'B';
  private readonly mixer: THREE.AnimationMixer | null;
  private readonly actions = new Map<ClipName, THREE.AnimationAction>();
  private readonly clipKeys: ClipKey[] = [{ t: -100, clip: 'idle', speed: 1 }];
  private readonly segments: Segment[] = [];
  private readonly hits: Hit[] = [];
  private readonly bars: BarKey[];
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  /** Each material's own emissive colour, which a hit's flash is added to. */
  private readonly emissive: THREE.Color[] = [];
  /** Where it looks when it isn't going anywhere. */
  face: THREE.Vector3 | null = null;
  death: number | null = null;
  /** Whether it breaks into shards as it dies, rather than sinking. */
  shatter = false;
  private readonly bg: THREE.Sprite;
  private readonly fill: THREE.Sprite;
  private readonly shieldBar: THREE.Sprite;
  private readonly drain: THREE.Sprite;
  private readonly idleOffset: number;

  constructor(
    readonly copy: ModelCopy,
    spec: ActorSpec,
    index: number,
  ) {
    this.team = spec.team;
    this.home = at(spec.col, spec.row);
    this.group.add(this.turn);
    this.turn.add(this.squash);
    this.squash.add(copy.object);
    this.turn.rotation.y = spec.team === 'A' ? Math.PI : 0;
    this.idleOffset = 0.37 * index;
    this.bars = [{ t: -100, hp: spec.hp ?? 1, shield: 0 }];
    copy.object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
        if (m instanceof THREE.MeshStandardMaterial && !this.materials.includes(m)) {
          this.materials.push(m);
          this.emissive.push(m.emissive.clone());
        }
      }
    });
    if (copy.clips !== null) {
      this.mixer = new THREE.AnimationMixer(copy.model);
      for (const name of CLIPS) {
        const action = this.mixer.clipAction(copy.clips[name]);
        action.weight = 0;
        action.play();
        this.actions.set(name, action);
      }
    } else {
      this.mixer = null;
    }
    const sprite = (colour: number, order: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: colour, depthTest: false, depthWrite: false, transparent: true }));
      s.renderOrder = order;
      s.position.y = copy.labelHeight + 0.1;
      this.group.add(s);
      return s;
    };
    this.bg = sprite(0x1b1410, 10);
    this.bg.scale.set(BAR.width + 0.06, BAR.height + 0.06, 1);
    this.fill = sprite(TEAM_BAR[spec.team], 11);
    this.drain = sprite(0xfff4e0, 11);
    this.shieldBar = sprite(0xf2efe8, 12);
  }

  /** Where it stands at `t`. */
  position(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.copy(this.home);
    for (const s of this.segments) {
      if (t < s.t0) break;
      const x = Math.min(1, (t - s.t0) / (s.t1 - s.t0));
      out.lerpVectors(s.from, s.to, x);
      out.y = s.hop * 4 * x * (1 - x);
    }
    return out;
  }
  chest(t: number): THREE.Vector3 {
    const p = this.position(t);
    p.y += this.copy.chest;
    return p;
  }
  head(t: number): THREE.Vector3 {
    const p = this.position(t);
    p.y += this.copy.labelHeight - 0.25;
    return p;
  }
  get height(): number {
    return this.copy.labelHeight;
  }

  play(t: number, clip: ClipName, speed = 1): this {
    this.clipKeys.push({ t, clip, speed });
    this.clipKeys.sort((a, b) => a.t - b.t);
    return this;
  }
  /** Goes from where it is to `to`, between `t0` and `t1`. */
  move(t0: number, t1: number, to: THREE.Vector3, o: { hop?: number; face?: boolean; clip?: boolean } = {}): this {
    const from = this.position(t0);
    from.y = 0;
    this.segments.push({ t0, t1, from, to: to.clone(), hop: o.hop ?? 0, face: o.face ?? true });
    this.segments.sort((a, b) => a.t0 - b.t0);
    if (o.clip ?? true) {
      // One stride a hex, as the game's steps go.
      const length = this.copy.lengths?.move ?? 1;
      this.play(t0, 'move', (length * Math.max(1, from.distanceTo(to) / 1.73)) / (t1 - t0));
      this.play(t1, 'idle');
    }
    return this;
  }
  hit(t: number, from: THREE.Vector3, power = 1): this {
    this.hits.push({ t, from: from.clone(), power });
    return this;
  }
  /** Loses `amount` of its health, shield first. Returns how much the shield took. */
  damage(t: number, amount: number): number {
    const last = this.barAt(t);
    const absorbed = Math.min(last.shield, amount);
    this.bars.push({ t, hp: Math.max(0, last.hp - (amount - absorbed)), shield: last.shield - absorbed });
    this.bars.sort((a, b) => a.t - b.t);
    return absorbed;
  }
  shield(t: number, amount: number): this {
    const last = this.barAt(t);
    this.bars.push({ t, hp: last.hp, shield: last.shield + amount });
    this.bars.sort((a, b) => a.t - b.t);
    return this;
  }
  dies(t: number): this {
    this.death = t;
    this.play(t, 'death');
    return this;
  }
  private barAt(t: number): BarKey {
    let last = this.bars[0]!;
    for (const b of this.bars) if (b.t <= t) last = b;
    return last;
  }
  private barBefore(t: number): BarKey {
    let last = this.bars[0]!;
    for (const b of this.bars) if (b.t < t) last = b;
    return last;
  }

  update(t: number, style: Style): void {
    // Where it is, with the push of hits.
    const p = this.position(t);
    let push = 0;
    let flash = 0;
    let squash = 0;
    const away = new THREE.Vector3();
    for (const hit of this.hits) {
      const age = t - hit.t;
      if (age < 0) continue;
      const k = kick(age, style.flinch.seconds) * hit.power;
      if (k > 0) {
        const d = new THREE.Vector3().subVectors(p, hit.from).setY(0);
        if (d.lengthSq() > 1e-6) away.addScaledVector(d.normalize(), k);
        push = Math.max(push, k);
      }
      if (age < style.flash.seconds) flash = Math.max(flash, (1 - age / style.flash.seconds) ** 2 * Math.min(1.3, hit.power));
      squash = Math.max(squash, kick(age, 0.22, 0.25) * Math.min(1.2, hit.power));
    }
    this.group.position.copy(p).addScaledVector(away, style.flinch.distance);
    // Squash on the hit, then stretch back.
    const s = style.squash * squash;
    this.squash.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5);
    // Flash.
    this.materials.forEach((m, i) => m.emissive.setHex(style.flash.colour).multiplyScalar(flash * style.flash.intensity).add(this.emissive[i]!));

    // Facing: the way it goes, or towards what it faces.
    let facing: number | null = null;
    for (const seg of this.segments) {
      if (t >= seg.t0 && t < seg.t1 && seg.face) facing = Math.atan2(seg.to.x - seg.from.x, seg.to.z - seg.from.z);
    }
    if (facing === null && this.face !== null) {
      const d = new THREE.Vector3().subVectors(this.face, p);
      if (d.lengthSq() > 1e-4) facing = Math.atan2(d.x, d.z);
    }
    if (facing !== null) {
      let delta = facing - this.turn.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.turn.rotation.y += delta;
    }

    // Clips: the latest started, fading in from the one before.
    if (this.mixer !== null) {
      let i = 0;
      for (let k = 0; k < this.clipKeys.length; k++) if (this.clipKeys[k]!.t <= t) i = k;
      const now = this.clipKeys[i]!;
      const before = i > 0 ? this.clipKeys[i - 1]! : null;
      const time = (key: ClipKey) => {
        const length = this.copy.lengths![key.clip];
        let s = (t - key.t) * key.speed;
        if (key.clip === 'idle') s = t + this.idleOffset;
        return LOOPS.has(key.clip) ? s % length : Math.min(s, length - 1e-4);
      };
      const weight = before === null || now.clip === 'attack' || now.clip === 'cast' ? 1 : Math.min(1, (t - now.t) / FADE);
      for (const [name, action] of this.actions) {
        action.weight = 0;
        if (before !== null && name === before.clip && weight < 1) {
          action.time = time(before);
          action.weight = 1 - weight;
        }
        if (name === now.clip) {
          action.time = time(now);
          action.weight = weight;
        }
      }
      this.mixer.update(0);
    }

    // Death: sink and fade, or break up.
    let opacity = 1;
    if (this.death !== null && t >= this.death) {
      const age = t - this.death;
      if (this.shatter) {
        opacity = age < 0.3 ? 1 : 0;
      } else {
        const delay = (this.copy.lengths?.death ?? 0) / 2;
        const x = Math.max(0, Math.min(1, (age - delay) / 0.5));
        opacity = 1 - x;
        this.group.position.y -= 0.4 * x;
      }
    }
    this.copy.fade(opacity);
    this.copy.object.visible = opacity > 0.001;

    // Health bar, with the shield after it, and a draining chunk in the punchy style.
    const bar = this.barAt(t);
    const showBar = opacity > 0.001;
    const total = Math.max(1, bar.hp + bar.shield);
    const W = BAR.width;
    const hpW = (W * bar.hp) / total;
    const shieldW = (W * bar.shield) / total;
    const place = (sprite: THREE.Sprite, left: number, width: number) => {
      sprite.visible = showBar && width > 0.002;
      if (!sprite.visible) return;
      sprite.scale.set(width, BAR.height, 1);
      sprite.center.set((W / 2 - left) / width, 0.5);
    };
    this.bg.visible = showBar;
    this.bg.material.opacity = opacity;
    place(this.fill, 0, hpW);
    place(this.shieldBar, hpW, shieldW);
    let drainW = 0;
    if (style.drainBar) {
      const last = this.bars.filter((b) => b.t <= t).at(-1)!;
      const prev = this.barBefore(last.t);
      if (last.t > -100 && prev.hp > last.hp) {
        const age = t - last.t;
        const k = age < 0.25 ? 1 : 1 - Math.min(1, (age - 0.25) / 0.35);
        drainW = ((W * (prev.hp - last.hp)) / total) * k;
      }
    }
    place(this.drain, hpW + shieldW, drainW);
  }
}

// ---------------------------------------------------------------------------------------------
// A scene being built

export interface Ctx {
  readonly style: Style;
  readonly root: THREE.Group;
  readonly camera: THREE.PerspectiveCamera;
  actor(spec: ActorSpec): Actor;
  add<T extends Timed>(timed: T): T;
  /** A freeze of everything for the style's hit-stop, at a time in the scene. */
  stop(t: number, scale?: number): void;
  shake(t: number, scale?: number): void;
  /** A flash of the whole screen. */
  screen(t: number, colour: string, strength: number, seconds?: number): void;
  /** A point light for fire and flashes, already in the scene so it costs no new shader. */
  light(i: number): THREE.PointLight;
}

interface Built {
  readonly def: SceneDef;
  readonly style: Style;
  readonly root: THREE.Group;
  readonly actors: Actor[];
  readonly timed: Timed[];
  readonly stops: { t: number; d: number }[];
  readonly shakes: { t: number; a: number }[];
  readonly screens: { t: number; colour: string; strength: number; seconds: number }[];
  /** Length in display time, with the stops. */
  readonly duration: number;
}

const container = document.getElementById('view')!;
const flashEl = document.getElementById('flash')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
container.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const post = new Post();
const focus = new THREE.Vector3();
const lights = [0, 1].map(() => {
  const light = new THREE.PointLight(0xffffff, 0, 7, 1.6);
  scene.add(light);
  return light;
});

scene.background = new THREE.Color(ATMOSPHERE.colour);
scene.fog = new THREE.Fog(ATMOSPHERE.colour, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar);
scene.add(new THREE.HemisphereLight(LIGHTS.sky, LIGHTS.ground, LIGHTS.ambient));
const sun = new THREE.DirectionalLight(LIGHTS.sun, LIGHTS.sunIntensity);
sun.position.set(...LIGHTS.sunFrom);
scene.add(sun);
scene.add(buildBoard());

function resize(): void {
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.setSize(width, height);
  post.setSize(width, height, renderer.getPixelRatio());
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

loadModels();
const arena = loadArena().then((object) => {
  if (object !== null) scene.add(object);
});

/** Waits for every model a scene needs. */
async function models(specs: readonly ActorSpec[]): Promise<void> {
  for (let tries = 0; tries < 600; tries++) {
    if (specs.every((s) => copyModel(s.unit, s.star ?? 1) !== null)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('models did not load');
}

let built: Built | null = null;

async function load(name: string, styleName: StyleName): Promise<number> {
  const def = SCENES.find((s) => s.name === name) ?? SCENES[0]!;
  const style = STYLES[styleName];
  await arena;
  await models(def.cast);
  if (built !== null) scene.remove(built.root);
  const root = new THREE.Group();
  scene.add(root);
  const actors: Actor[] = [];
  const timed: Timed[] = [];
  const stops: { t: number; d: number }[] = [];
  const shakes: { t: number; a: number }[] = [];
  const screens: Built['screens'] = [];
  const ctx: Ctx = {
    style,
    root,
    camera,
    actor(spec) {
      const actor = new Actor(copyModel(spec.unit, spec.star ?? 1)!, spec, actors.length);
      root.add(actor.group);
      actors.push(actor);
      return actor;
    },
    add(t) {
      timed.push(t);
      return t;
    },
    stop(t, scale = 1) {
      if (style.hitStop > 0) stops.push({ t, d: style.hitStop * scale });
    },
    shake(t, scale = 1) {
      if (style.shake > 0) shakes.push({ t, a: style.shake * scale });
    },
    screen(t, colour, strength, seconds = 0.25) {
      screens.push({ t, colour, strength, seconds });
    },
    light: (i) => lights[i]!,
  };
  def.build(ctx);
  // Face the nearest of the other side, unless the scene says otherwise.
  for (const a of actors) {
    if (a.face !== null) continue;
    let best: Actor | null = null;
    for (const b of actors) if (b.team !== a.team && (best === null || a.home.distanceTo(b.home) < a.home.distanceTo(best.home))) best = b;
    a.face = best?.home ?? null;
  }
  stops.sort((a, b) => a.t - b.t);
  const duration = def.duration + stops.reduce((sum, s) => sum + s.d, 0);
  built = { def, style, root, actors, timed, stops, shakes, screens, duration };
  document.getElementById('style')!.textContent = style.label;
  document.getElementById('title')!.textContent = def.title;
  document.getElementById('who')!.textContent = def.who;
  document.body.dataset.style = style.name;
  draw(0);
  return duration;
}

/** The scene's own time at a display time: display time less the hit-stops before it. */
function sceneTime(b: Built, display: number): number {
  let offset = 0;
  for (const s of b.stops) {
    const start = s.t + offset;
    if (display < start) break;
    if (display < start + s.d) return s.t;
    offset += s.d;
  }
  return display - offset;
}

function draw(display: number): void {
  const b = built;
  if (b === null) return;
  const t = sceneTime(b, display);
  for (const light of lights) light.intensity = 0;
  for (const a of b.actors) a.update(t, b.style);
  for (const x of b.timed) x.update(t);

  // Camera, shaken in display time, so it shakes through a hit-stop.
  const { position, target } = b.def.camera;
  let shake = 0;
  for (const s of b.shakes) {
    const ds = s.t + b.stops.filter((x) => x.t < s.t).reduce((sum, x) => sum + x.d, 0);
    const age = display - ds;
    if (age >= 0) shake += s.a * Math.exp(-age * 11) * (age < 0.5 ? 1 : 0);
  }
  camera.position.set(position[0] + shake * Math.sin(display * 97), position[1] + shake * 0.7 * Math.sin(display * 131 + 1.3), position[2] + shake * 0.4 * Math.sin(display * 71 + 2.1));
  focus.set(target[0], target[1], target[2]);
  camera.lookAt(focus);

  // The whole screen's flash.
  let flash = 0;
  let colour = '#ffffff';
  for (const s of b.screens) {
    const age = t - s.t;
    if (age < 0 || age >= s.seconds) continue;
    const k = s.strength * (1 - age / s.seconds) ** 2;
    if (k > flash) {
      flash = k;
      colour = s.colour;
    }
  }
  flashEl.style.opacity = String(flash);
  flashEl.style.background = colour;

  post.render(renderer, scene, camera, focus);
}

// ---------------------------------------------------------------------------------------------
// Live view and the recorder's hooks

const params = new URLSearchParams(location.hash.slice(1));
const recording = params.has('record');
const ready = load(params.get('scene') ?? SCENES[0]!.name, (params.get('style') as StyleName) ?? 'grounded');

declare global {
  interface Window {
    study: {
      ready: Promise<number>;
      scenes: readonly string[];
      load(name: string, style: StyleName): Promise<number>;
      draw(seconds: number): void;
    };
  }
}
window.study = { ready, scenes: SCENES.map((s) => s.name), load, draw };

if (!recording) {
  const start = performance.now();
  const loop = () => {
    if (built !== null) draw((((performance.now() - start) / 1000) % (built.duration + 0.6)) - 0.3);
    requestAnimationFrame(loop);
  };
  void ready.then(() => requestAnimationFrame(loop));
  window.addEventListener('hashchange', () => {
    const p = new URLSearchParams(location.hash.slice(1));
    void load(p.get('scene') ?? SCENES[0]!.name, (p.get('style') as StyleName) ?? 'grounded');
  });
}
