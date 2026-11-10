// The animation inspector's 3D view (dev/anim.html): one unit's model on a hex, posed at the
// playhead by Three.js as the game poses it, with its onion skin, the paths its hands, feet and head
// trace through the clip, its skeleton, the limit it keeps within and its label's height. The model
// is the game's own copy (src/models.ts), in its livery and at its star level's scale.

import { fromOffset } from '@lotr-tactics/sim';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CLIPS, type ClipName } from '../../src/animation.js';
import { loadArena } from '../../src/arena.js';
import { hexToWorld } from '../../src/layout.js';
import { ATMOSPHERE, LIGHTS } from '../../src/look.js';
import type { ModelCopy } from '../../src/models.js';
import { HEX_RADIUS } from '../../src/stars.js';
import { FPS, STEPS_PER_FRAME, lastFrame, orbitFromOffset, orbitOffset, type Orbit, type Trail } from './state.js';

/** The board's pale stone, as team A's hexes are drawn (src/scene.ts). */
const TILE_COLOUR = 0xc9ac84;
const GROUND_COLOUR = 0x3a3026;
const LIMIT_COLOUR = 0xf3d27a;
const OUTSIDE_COLOUR = new THREE.Color(0xff3b3b);
/** The onion skin's ghosts: those before the playhead are cool, those after it warm. */
const GHOST_COLOURS = { before: 0x62aef0, after: 0xf0a33a } as const;
const GHOST_OPACITY = 0.2;

/** How far past the limit a point may be before its path turns red: a 2★ model is scaled to reach exactly the limit, give or take rounding. */
const SLACK = 0.0005;

/** How far under the ground a point may dip before its path turns red, as finish() allows (art/clips.py, SUNK). */
export const SUNK = -0.005;

/** The board's hex the unit stands on when the arena is shown: in the middle of the near side's front row. */
const ARENA_HEX = fromOffset({ col: 3, row: 3 });

/** The points traced for each trail: bones, the colour of their path, and which end of what each bone carries is followed. */
const TRACKED: Record<Trail, readonly { bone: string; colour: number; end: 'far' | 'low' }[]> = {
  hands: [
    { bone: 'hand_r', colour: 0xf0a33a, end: 'far' },
    { bone: 'hand_l', colour: 0x62aef0, end: 'far' },
  ],
  feet: [
    { bone: 'foot_r', colour: 0x5bc782, end: 'low' },
    { bone: 'foot_l', colour: 0xb276f5, end: 'low' },
  ],
  head: [{ bone: 'head', colour: 0xf3d27a, end: 'far' }],
};

/** A mount's feet, traced in place of its rider's, which sit in the stirrups. */
const MOUNT_FEET = ['mount_fore_foot_r', 'mount_fore_foot_l', 'mount_hind_foot_r', 'mount_hind_foot_l'];
const MOUNT_FOOT_COLOURS = [0x5bc782, 0xb276f5, 0x3fbd9a, 0xd98cf0];

/** How far out from the model's centre it reaches on the ground, and how low and high it goes. */
export interface Extent {
  readonly reach: number;
  readonly low: number;
  readonly high: number;
}

/** How far a clip takes the model, posed STEPS_PER_FRAME times a frame, and on which frames. */
export interface ClipExtent extends Extent {
  readonly reachFrame: number;
  readonly lowFrame: number;
  readonly highFrame: number;
}

/** A point on the model followed through a clip: one vertex of a skinned mesh. */
interface Tracked {
  readonly trail: Trail;
  readonly mesh: THREE.SkinnedMesh;
  readonly index: number;
  readonly colour: number;
}

/** A copy's clips on a mixer of its own, posed at a time without the mixer's clock running. */
class Poser {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipName, THREE.AnimationAction>();

  constructor(
    private readonly copy: ModelCopy,
    clips: Readonly<Record<ClipName, THREE.AnimationClip>>,
  ) {
    this.mixer = new THREE.AnimationMixer(copy.model);
    for (const name of CLIPS) {
      const action = this.mixer.clipAction(clips[name]);
      action.weight = 0;
      action.play();
      this.actions.set(name, action);
    }
  }

  pose(clip: ClipName, seconds: number): void {
    for (const [name, action] of this.actions) {
      action.weight = name === clip ? 1 : 0;
      action.time = name === clip ? seconds : 0;
    }
    // With no time passing, the mixer poses the clip at the time set, its end included.
    this.mixer.update(0);
    this.copy.object.updateMatrixWorld(true);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.copy.model);
  }
}

/** A copy of the model with its poser, null for a static model. */
interface Posed {
  readonly copy: ModelCopy;
  readonly poser: Poser | null;
}

export interface Overlays {
  readonly hex: boolean;
  readonly bones: boolean;
  readonly label: boolean;
  readonly arena: boolean;
  readonly trails: readonly Trail[];
}

export class Stage {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
  private readonly controls: OrbitControls;
  private readonly hex = new THREE.Group();
  private readonly ground: THREE.Mesh;
  private readonly labelRing: THREE.LineLoop;
  private readonly trailLayer = new THREE.Group();
  private readonly ghostLayer = new THREE.Group();
  private readonly ghostMaterials = {
    before: ghostMaterial(GHOST_COLOURS.before),
    after: ghostMaterial(GHOST_COLOURS.after),
  };
  private readonly dots: THREE.Mesh[] = [];
  private arena: THREE.Object3D | null = null;
  private arenaWanted = false;
  private arenaLoading = false;
  private make: (() => ModelCopy | null) | null = null;
  private main: Posed | null = null;
  /** A copy kept out of the scene, posed to trace and measure clips. */
  private probe: Posed | null = null;
  private ghosts: Posed[] = [];
  private skeleton: THREE.SkeletonHelper | null = null;
  private tracked: Tracked[] = [];
  private trails: readonly Trail[] = [];
  private tracedClip: ClipName | null = null;
  private traced: ClipExtent | null = null;
  private target = 0.9;
  private readonly v = new THREE.Vector3();

  constructor(
    private readonly container: HTMLElement,
    onOrbit: (orbit: Orbit) => void,
  ) {
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 40;
    this.controls.addEventListener('end', () => onOrbit(this.orbit()));

    this.scene.background = new THREE.Color(ATMOSPHERE.colour);
    this.scene.add(new THREE.HemisphereLight(LIGHTS.sky, LIGHTS.ground, LIGHTS.ambient));
    const sun = new THREE.DirectionalLight(LIGHTS.sun, LIGHTS.sunIntensity);
    sun.position.set(...LIGHTS.sunFrom);
    this.scene.add(sun);

    this.ground = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: GROUND_COLOUR }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.004;
    this.scene.add(this.ground);
    this.buildHex();
    this.labelRing = ring(0.3, LIMIT_COLOUR, false);
    this.scene.add(this.hex, this.labelRing, this.ghostLayer, this.trailLayer);

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  /** Whether a model is shown, rather than still loading. */
  get ready(): boolean {
    return this.main !== null;
  }

  /** Whether the model plays clips, rather than standing static. */
  get rigged(): boolean {
    return this.main?.poser != null;
  }

  /** How long each clip is, in seconds; null for a static model. */
  get lengths(): Readonly<Record<ClipName, number>> | null {
    return this.main?.copy.lengths ?? null;
  }

  /** The armature's extras: the rig kit's reach, strike and hits (art/rig.py). */
  get extras(): Readonly<Record<string, unknown>> {
    let extras: Record<string, unknown> = {};
    this.main?.copy.model.traverse((node) => {
      if (typeof node.userData.reach === 'number') extras = node.userData;
    });
    return extras;
  }

  /** How far the current clip takes the model, traced as Three.js poses it; null for a static model. */
  get extent(): ClipExtent | null {
    return this.traced;
  }

  /** How high the label sits above the ground, and its star level's scale. */
  get label(): { height: number; scale: number } | null {
    return this.main === null ? null : { height: this.main.copy.labelHeight, scale: this.main.copy.scale };
  }

  /**
   * Shows the model `make` copies, once it can: it gives null until the model has loaded, so `show`
   * keeps asking each frame (`render`).
   */
  show(make: () => ModelCopy | null): void {
    this.clearModel();
    this.make = make;
  }

  /** Poses the model at `seconds` into `clip`, and traces the clip if it is new. */
  pose(clip: ClipName, seconds: number): void {
    const main = this.main;
    if (main === null || main.poser === null) return;
    if (clip !== this.tracedClip) this.trace(clip);
    main.poser.pose(clip, seconds);
    this.placeDots();
  }

  /** Shows the onion skin's ghosts, posed at their times: before the playhead (negative offsets) and after it. */
  setGhosts(clip: ClipName, list: readonly { offset: number; seconds: number }[]): void {
    while (this.ghosts.length < list.length) {
      const ghost = this.copy();
      if (ghost === null) return;
      this.ghostLayer.add(ghost.copy.object);
      this.ghosts.push(ghost);
    }
    for (let i = 0; i < this.ghosts.length; i++) {
      const ghost = this.ghosts[i]!;
      const item = list[i];
      ghost.copy.object.visible = item !== undefined;
      if (item === undefined) continue;
      const material = item.offset < 0 ? this.ghostMaterials.before : this.ghostMaterials.after;
      ghost.copy.model.traverse((node) => {
        if (node instanceof THREE.Mesh) node.material = material;
      });
      ghost.poser?.pose(clip, item.seconds);
    }
  }

  setOverlays({ hex, bones, label, arena, trails }: Overlays): void {
    this.hex.visible = hex;
    this.labelRing.visible = label && this.main !== null;
    if (this.main !== null) this.labelRing.position.y = this.main.copy.labelHeight;
    this.skeletonShown(bones);
    this.arenaWanted = arena;
    this.ground.visible = !arena || this.arena === null;
    if (this.arena !== null) this.arena.visible = arena;
    else if (arena && !this.arenaLoading) this.loadArena();
    if (trails.join() !== this.trails.join()) {
      this.trails = [...trails];
      if (this.tracedClip !== null) this.trace(this.tracedClip);
    }
  }

  /** Puts the camera on an orbit round the model. */
  setOrbit(orbit: Orbit): void {
    const [x, y, z] = orbitOffset(orbit);
    this.controls.target.set(0, this.target, 0);
    this.camera.position.set(x, this.target + y, z);
    this.controls.update();
  }

  /** The orbit the camera is on now. */
  orbit(): Orbit {
    const { position, target } = { position: this.camera.position, target: this.controls.target };
    return orbitFromOffset(position.x - target.x, position.y - target.y, position.z - target.z);
  }

  /** How far the model reaches, low and high it goes as it is posed now. */
  measure(): Extent | null {
    return this.main === null ? null : extentOf(this.main.copy, this.v);
  }

  /** Draws a frame, first putting the model in if it has just loaded. Returns whether the model came in. */
  render(): boolean {
    let arrived = false;
    if (this.main === null && this.make !== null) {
      const main = this.copy();
      if (main !== null) {
        this.main = main;
        this.probe = this.copy();
        this.scene.add(main.copy.object);
        this.tracked = trackedPoints(main.copy);
        this.target = 0.75 * main.copy.chest;
        arrived = true;
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    return arrived;
  }

  private copy(): Posed | null {
    const copy = this.make?.() ?? null;
    if (copy === null) return null;
    copy.object.updateMatrixWorld(true);
    return { copy, poser: copy.clips === null ? null : new Poser(copy, copy.clips) };
  }

  private clearModel(): void {
    for (const posed of [this.main, this.probe, ...this.ghosts]) {
      if (posed === null) continue;
      posed.copy.object.removeFromParent();
      posed.poser?.dispose();
      posed.copy.dispose();
    }
    this.main = this.probe = null;
    this.ghosts = [];
    this.tracked = [];
    this.tracedClip = null;
    this.traced = null;
    this.skeletonShown(false);
    this.clearTrails();
  }

  private skeletonShown(shown: boolean): void {
    if (shown && this.skeleton === null && this.main?.poser != null) {
      this.skeleton = new THREE.SkeletonHelper(this.main.copy.model);
      const material = this.skeleton.material as THREE.LineBasicMaterial;
      material.depthTest = false;
      material.transparent = true;
      this.skeleton.renderOrder = 2;
      this.scene.add(this.skeleton);
    } else if (!shown && this.skeleton !== null) {
      this.skeleton.removeFromParent();
      this.skeleton.dispose();
      this.skeleton = null;
    }
  }

  /**
   * Follows the clip from its first frame to its last, STEPS_PER_FRAME times a frame as Three.js
   * poses it: how far the whole model reaches and how low and high it goes, and the paths of the
   * points the trails follow, red where they leave the limit or go under the ground.
   */
  private trace(clip: ClipName): void {
    this.tracedClip = clip;
    this.clearTrails();
    const probe = this.probe;
    if (probe === null || probe.poser === null || probe.copy.lengths === null) return;
    const length = probe.copy.lengths[clip];
    const steps = Math.max(1, lastFrame(length) * STEPS_PER_FRAME);
    const points = trackedPoints(probe.copy).filter((point) => this.trails.includes(point.trail));
    const paths = points.map(() => [] as number[]);
    let extent: ClipExtent = { reach: 0, low: Infinity, high: -Infinity, reachFrame: 0, lowFrame: 0, highFrame: 0 };
    for (let step = 0; step <= steps; step++) {
      const seconds = Math.min((step / steps) * length, length);
      const frame = seconds * FPS;
      probe.poser.pose(clip, seconds);
      const now = extentOf(probe.copy, this.v);
      extent = {
        reach: Math.max(extent.reach, now.reach),
        reachFrame: now.reach > extent.reach ? frame : extent.reachFrame,
        low: Math.min(extent.low, now.low),
        lowFrame: now.low < extent.low ? frame : extent.lowFrame,
        high: Math.max(extent.high, now.high),
        highFrame: now.high > extent.high ? frame : extent.highFrame,
      };
      points.forEach((point, i) => {
        const p = vertexAt(point, this.v);
        paths[i]!.push(p.x, p.y, p.z);
      });
    }
    this.traced = extent;
    points.forEach((point, i) => this.trailLayer.add(trailOf(paths[i]!, point.colour)));
    // The dots that ride on the points at the playhead.
    for (const point of this.tracked) {
      if (!this.trails.includes(point.trail)) continue;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: point.colour, depthTest: false }));
      dot.renderOrder = 3;
      dot.userData.point = point;
      this.dots.push(dot);
      this.trailLayer.add(dot);
    }
  }

  private placeDots(): void {
    for (const dot of this.dots) dot.position.copy(vertexAt(dot.userData.point as Tracked, this.v));
  }

  private clearTrails(): void {
    for (const child of [...this.trailLayer.children]) {
      child.removeFromParent();
      if (child instanceof THREE.Line || child instanceof THREE.Points || child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
      for (const inner of child.children) {
        if (inner instanceof THREE.Points) {
          inner.geometry.dispose();
          (inner.material as THREE.Material).dispose();
        }
      }
    }
    this.dots.length = 0;
  }

  private buildHex(): void {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = HEX_RADIUS * Math.sin(angle);
      const y = HEX_RADIUS * Math.cos(angle);
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const tile = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: TILE_COLOUR }));
    tile.rotation.x = -Math.PI / 2;
    // The limit a model keeps within, on every frame and between them: a circle as far out as the hex's corners.
    const limit = ring(HEX_RADIUS, LIMIT_COLOUR, true);
    limit.position.y = 0.004;
    this.hex.add(tile, limit);
  }

  private loadArena(): void {
    this.arenaLoading = true;
    void loadArena().then((loaded) => {
      if (loaded === null) return;
      // The arena is moved, not the unit, so the unit stands on one of its hexes and the camera's orbits stay round it.
      const arena = new THREE.Group().add(loaded);
      const { x, z } = hexToWorld(ARENA_HEX);
      arena.position.set(-x, 0, -z);
      this.arena = arena;
      arena.visible = this.arenaWanted;
      this.ground.visible = !this.arenaWanted;
      this.scene.add(arena);
    });
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}

/** How far a copy reaches as it is posed now, vertex by vertex, skinned as the GPU draws it. */
function extentOf(copy: ModelCopy, v: THREE.Vector3): Extent {
  let reach = 0;
  let low = Infinity;
  let high = -Infinity;
  copy.model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const count = (node.geometry as THREE.BufferGeometry).getAttribute('position').count;
    for (let i = 0; i < count; i++) {
      if (node instanceof THREE.SkinnedMesh) node.getVertexPosition(i, v);
      else v.fromBufferAttribute((node.geometry as THREE.BufferGeometry).getAttribute('position'), i);
      v.applyMatrix4(node.matrixWorld);
      reach = Math.max(reach, Math.hypot(v.x, v.z));
      low = Math.min(low, v.y);
      high = Math.max(high, v.y);
    }
  });
  return { reach, low, high };
}

function vertexAt(point: Tracked, v: THREE.Vector3): THREE.Vector3 {
  return point.mesh.getVertexPosition(point.index, v).applyMatrix4(point.mesh.matrixWorld);
}

/**
 * The points a copy's trails follow, found as it stands, before it is posed: for a hand or the head,
 * the vertex furthest from its bone, the tip of what it holds or wears; for a foot, its lowest
 * vertex, the sole. A Rider's trail follows its mount's feet.
 */
function trackedPoints(copy: ModelCopy): Tracked[] {
  const meshes: THREE.SkinnedMesh[] = [];
  copy.model.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) meshes.push(node);
  });
  if (meshes.length === 0) return [];
  copy.object.updateMatrixWorld(true);
  const bones = new Set(meshes.flatMap((mesh) => mesh.skeleton.bones.map((bone) => bone.name)));
  const wanted: { trail: Trail; bone: string; colour: number; end: 'far' | 'low' }[] = [];
  for (const trail of Object.keys(TRACKED) as Trail[]) {
    if (trail === 'feet' && bones.has(MOUNT_FEET[0]!)) {
      MOUNT_FEET.forEach((bone, i) => wanted.push({ trail, bone, colour: MOUNT_FOOT_COLOURS[i]!, end: 'low' }));
    } else {
      for (const item of TRACKED[trail]) wanted.push({ trail, ...item });
    }
  }
  const v = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const points: Tracked[] = [];
  for (const { trail, bone, colour, end } of wanted) {
    let best: { mesh: THREE.SkinnedMesh; index: number; score: number } | null = null;
    for (const mesh of meshes) {
      const b = mesh.skeleton.bones.findIndex((candidate) => candidate.name === bone);
      if (b < 0) continue;
      mesh.skeleton.bones[b]!.getWorldPosition(origin);
      const index = mesh.geometry.getAttribute('skinIndex');
      const weight = mesh.geometry.getAttribute('skinWeight');
      for (let i = 0; i < index.count; i++) {
        // The bone the vertex mostly follows: with rigid skinning, the only one.
        let top = 0;
        let most = -1;
        for (let k = 0; k < 4; k++) {
          if (weight.getComponent(i, k) > top) {
            top = weight.getComponent(i, k);
            most = index.getComponent(i, k);
          }
        }
        if (most !== b) continue;
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
        const far = v.distanceTo(origin);
        const score = end === 'far' ? far : -v.y * 1000 + far;
        if (best === null || score > best.score) best = { mesh, index: i, score };
      }
    }
    if (best !== null) points.push({ trail, mesh: best.mesh, index: best.index, colour });
  }
  return points;
}

/** A path, red where it leaves the limit or dips under the ground, with a dot on each whole frame. */
function trailOf(path: readonly number[], colour: number): THREE.Line {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(path, 3));
  const colours: number[] = [];
  const base = new THREE.Color(colour);
  for (let i = 0; i < path.length; i += 3) {
    const outside = Math.hypot(path[i]!, path[i + 2]!) > HEX_RADIUS + SLACK || path[i + 1]! < SUNK;
    const c = outside ? OUTSIDE_COLOUR : base;
    colours.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 }));
  line.renderOrder = 2;
  const frames: number[] = [];
  for (let i = 0; i < path.length / 3; i += STEPS_PER_FRAME) frames.push(path[3 * i]!, path[3 * i + 1]!, path[3 * i + 2]!);
  const dots = new THREE.BufferGeometry();
  dots.setAttribute('position', new THREE.Float32BufferAttribute(frames, 3));
  const points = new THREE.Points(dots, new THREE.PointsMaterial({ color: colour, size: 5, sizeAttenuation: false, depthTest: false }));
  points.renderOrder = 2;
  line.add(points);
  return line;
}

/** A level circle on the ground, dashed or not. */
function ring(radius: number, colour: number, dashed: boolean): THREE.LineLoop {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 96; i++) {
    const angle = (i / 96) * 2 * Math.PI;
    points.push(new THREE.Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle)));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color: colour, dashSize: 0.06, gapSize: 0.04, transparent: true, opacity: 0.9 })
    : new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.9 });
  const loop = new THREE.LineLoop(geometry, material);
  if (dashed) loop.computeLineDistances();
  return loop;
}

function ghostMaterial(colour: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: GHOST_OPACITY, depthWrite: false });
}
