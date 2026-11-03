// The Three.js scene: board, units, overlays and effects (docs/viewer-spec.md sections 3–5), the
// marker that shows where a dragged unit or item would go while planning, and which unit is under
// the pointer, for its hover card and for dragging. Units are drawn as the model for their star
// level on its base once loaded (models.ts), playing the clips animation.ts picks if it is rigged,
// and as pawns until then.

import {
  BOARD_HEXES,
  PLAYER,
  TEAM_ROWS,
  boardPlace,
  fromPlacement,
  toOffset,
  type ItemId,
  type OwnedUnit,
  type Place,
  type Star,
  type Team,
  type UnitState,
} from '@lotr-tactics/sim';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { loadArena } from './arena.js';
import { CLIPS, fightFacing, fightPoseInto, newPose, planningPoseInto, sinkDelay, type ClipLengths, type ClipName, type PoseBuffer } from './animation.js';
import { benchToWorld, hexToWorld, type Point } from './layout.js';
import { ModelSwaps, Redraws } from './drawing.js';
import type { PlanningRing } from './flow.js';
import { copyModel, loadModels, modelShader, modelShaders, modelsLoaded, shaderSample, type ModelCopy, type ModelShader } from './models.js';
import { EFFECT_TICKS, type CastRing, type FloatingText, type MutablePoint, type Playback, type Projectile } from './playback.js';
import { ATMOSPHERE, CAMERA, CAMERA_LIMITS, LIGHTS } from './look.js';
import { Post } from './post.js';
import { stoneTiles } from './tiles.js';
import { LABEL, LARGE_PAWN_SCALE } from './stars.js';
import { UnitLabel } from './ui/labels.js';
import { displayName, isLarge } from './units.js';

/** Units on the side the camera looks from are drawn as team A: blue, with green health. */
const TEAM_COLOURS: Record<Team, number> = { A: 0x4a90d9, B: 0xd9534f };

/**
 * Each half of the board in two shades of stone, alternating by column: the near side's half as A,
 * pale sandstone, and the other as B, a darker, redder stone.
 */
const BOARD_COLOURS: Record<Team, readonly [number, number]> = { A: [0xc9ac84, 0xbfa17a], B: [0x9e7a62, 0x94705a] };

/** How far a board hex's corners are from its centre. */
const HEX_TILE_RADIUS = 0.94;

/** How opaque the board's hexes are, so the paving under them shows through a little and they sit in the arena. */
const BOARD_OPACITY = 0.72;

/** The bench's tiles: darker stone, set into the paving. */
const BENCH_COLOUR = 0x5f4c3b;

/** How far a board hex and a bench tile stand, from the paving up to their tops at 0, and how much their top edges are bevelled. */
const TILE_HEIGHT = 0.16;
const TILE_BEVEL = 0.05;

/** How high a floating number rises over its life, in world units. */
const TEXT_RISE = 0.9;

/** The space between a unit's label and the floating numbers above it, in pixels. */
const TEXT_GAP = 2;

/** Opacity of an untargetable unit. */
const UNTARGETABLE_OPACITY = 0.35;

/** The drop marker's colours: where a drag can go, and where it can't. */
const MARKER_COLOURS = { ok: 0xf3d27a, no: 0xe35d5b } as const;

/** How high a pawn's chest is, before the pawn is scaled: where projectiles leave it and strike it. */
const PAWN_CHEST = 0.9;

/** How far a unit sinks as it fades out after its death. */
const DEATH_SINK = 0.6;

/** The longest the models wait for a shader to compile in the background, in milliseconds. */
const COMPILE_WAIT_MS = 3000;

/** A player's board and bench, as their view gives them. */
export interface PlanningBoard {
  readonly board: readonly (OwnedUnit | null)[];
  readonly bench: readonly (OwnedUnit | null)[];
}

interface UnitView {
  /**
   * Placed and sunk by the scene; holds the body and the label. Only the body's model or pawn turns,
   * so a base stays lined up with its tile.
   */
  readonly group: THREE.Group;
  readonly unitId: UnitState['unitId'];
  readonly star: Star;
  /** The team whose half it faces from, which its base's pips point away from. */
  readonly team: Team;
  readonly look: Team;
  /** Summons, which have no models. */
  readonly summon: boolean;
  /** Summons without a name, which are drawn smaller. */
  readonly minor: boolean;
  /** The unit's id: its index in the fight, or its owned unit's id while planning. */
  readonly key: number;
  body: Body;
  readonly label: CSS2DObject;
  readonly overlay: UnitLabel;
}

/** What draws an effect, marked with the last frame its effect was in the playback's lists (`sync`). */
interface EffectView {
  seen: number;
}

interface ProjectileView extends EffectView {
  readonly mesh: THREE.Mesh;
}

interface CastRingView extends EffectView {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly look: Team;
}

/** A floating number or cast name. */
interface TextView extends EffectView {
  readonly object: CSS2DObject;
  /** How many of its unit's numbers that started with it are below it. */
  readonly stack: number;
  /** How far up it is moved, in pixels, to clear its unit's label. */
  lift: number;
  /** The opacity it was last given, so a paused fight doesn't write it again. */
  opacity: number;
}

/**
 * What draws a unit: its model on its base, or a pawn for monsters, summons and units whose model
 * isn't there.
 */
interface Body {
  /** What the unit's group holds: the model on its base, or the pawn. */
  readonly object: THREE.Object3D;
  /** What turns to face: the model or the pawn. */
  readonly turn: THREE.Object3D;
  /** The base under a model, lined up with its tile; null for a pawn. */
  readonly base: THREE.Object3D | null;
  /** Whether it is the unit's model rather than a pawn. */
  readonly model: boolean;
  /**
   * Whose model it is, at which star level and in which look, so another view of that unit can take
   * it up again; null for a pawn.
   */
  readonly unitId: UnitState['unitId'] | null;
  readonly star: Star | null;
  readonly look: Team;
  /**
   * Where the bottom edge of the unit's label goes, holding still through planning and fights: 1.8
   * above the base, times the model's scale, clear of what it reaches in its attacks and casts
   * (stars.ts, labelHeight).
   */
  readonly labelHeight: number;
  /** How much higher the label goes in `victory`, to clear the weapon the unit raises. */
  readonly labelRise: number;
  /** The height of its chest as it stands, which projectiles leave from and strike. */
  readonly chest: number;
  /** Plays a rigged model's clips; null for a static model or a pawn. */
  readonly animator: Animator | null;
  /** Fades the whole body, for untargetable and dying units. */
  fade(opacity: number): void;
  /** Makes a body taken off the scene ready to show again, unfaded and posed afresh. */
  reset(): void;
  dispose(): void;
}

/** A unit under the pointer: one in the fight by its id, or a planning unit by its owned id, with its label. */
export type UnitPick =
  | { readonly kind: 'fight'; readonly id: number; readonly label: HTMLElement }
  | { readonly kind: 'planning'; readonly id: number; readonly label: HTMLElement };

/**
 * A tile with its top at 0 and its top edge bevelled: a prism of `sides` sides, `radius` from its
 * centre to a corner, the first corner towards +z (pointy-top for a hex).
 */
function tile(radius: number, sides: number, phase = 0): THREE.BufferGeometry {
  // From the bottom edge up and in, so the faces point out.
  const profile = [
    new THREE.Vector2(radius, -TILE_HEIGHT),
    new THREE.Vector2(radius, -TILE_BEVEL),
    new THREE.Vector2(radius - TILE_BEVEL, 0),
    new THREE.Vector2(0, 0),
  ];
  return new THREE.LatheGeometry(profile, sides, phase);
}

const geometry = {
  hex: tile(HEX_TILE_RADIUS, 6),
  body: new THREE.CylinderGeometry(0.3, 0.42, 0.9, 6),
  head: new THREE.IcosahedronGeometry(0.25, 0),
  nose: new THREE.ConeGeometry(0.09, 0.28, 4),
  projectile: new THREE.IcosahedronGeometry(0.11, 0),
  ring: new THREE.RingGeometry(0.5, 0.62, 24),
  // Drop markers: a hex outline and fill matching the board's pointy-top hexes, and a square for bench tiles.
  hexOutline: new THREE.RingGeometry(0.78, 0.94, 6, 1, Math.PI / 2),
  hexFill: new THREE.CircleGeometry(0.78, 6, Math.PI / 2),
  tileOutline: new THREE.RingGeometry(0.84, 0.99, 4, 1, Math.PI / 4),
  tileFill: new THREE.CircleGeometry(0.84, 4, Math.PI / 4),
};

/** The size of a bench tile. */
const BENCH_TILE = 1.4;

const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xfde68a });
const noseMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, flatShading: true });

export class FightScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly labels = new CSS2DRenderer();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  private readonly controls: OrbitControls;
  /** Everything that belongs to the current fight. */
  private fightLayer = new THREE.Group();
  private playback: Playback | null = null;
  private units: UnitView[] = [];
  private readonly projectiles = new Map<Projectile, ProjectileView>();
  private readonly texts = new Map<FloatingText, TextView>();
  /**
   * Each fight label's height in pixels, which floating numbers rise from above. A ResizeObserver
   * keeps it, so reading it never makes the page lay itself out again mid-frame.
   */
  private readonly labelHeights = new WeakMap<Element, number>();
  private readonly labelSizes = new ResizeObserver((entries) => {
    for (const entry of entries) this.labelHeights.set(entry.target, entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height);
  });
  private readonly rings = new Map<CastRing, CastRingView>();
  /**
   * Cast ring materials not in use, by look. They are kept for the next cast rather than disposed
   * of, so a cast doesn't set up a shader again once the last ring has gone.
   */
  private readonly spareRings: Record<Team, THREE.MeshBasicMaterial[]> = { A: [], B: [] };
  /** The team drawn as the near side. */
  private side: Team = 'A';
  /** The board's hexes, tinted for the near side by `tintBoard`. */
  private readonly board = new THREE.InstancedMesh(
    geometry.hex,
    new THREE.MeshStandardMaterial({ flatShading: true, transparent: true, opacity: BOARD_OPACITY }),
    BOARD_HEXES.length,
  );
  /** The side the board is tinted for. */
  private boardSide: Team | null = null;
  /** Bench tiles, shown while planning. */
  private readonly bench = new THREE.Group();
  /** The blur, grade and vignette laid over each frame. */
  private readonly post = new Post();
  /** Planning units by owned unit id. */
  private planning = new Map<number, UnitView>();
  /** Each unit's view by its group, to find the unit a ray hits from the mesh it hits (`viewAt`). */
  private readonly viewOf = new WeakMap<THREE.Object3D, UnitView>();
  private planningKey = '';
  /**
   * The shaders the models need, one for rigged models and one for static ones, each set up in the
   * background before the first model that needs it is drawn, so the frame that draws it doesn't
   * stall to compile it (`compileShaders`). Until its shader is ready, a unit is a pawn.
   */
  private readonly shaders = new Map<ModelShader, 'compiling' | 'ready'>();
  /** How many of the shaders are ready. */
  private shadersReady = 0;
  /** When pawns swap for their models: once their shader is ready, a few a frame. */
  private readonly swaps = new ModelSwaps();
  /**
   * Whether a frame has anything new to show. One with nothing new draws nothing, so a paused or
   * finished fight, planning under reduced motion, and the board behind the menu cost next to nothing.
   */
  private readonly redraws = new Redraws();
  /**
   * How many planning units play `idle`, as the last frame drawn counted them. Whatever changes the
   * planning units changes what is on screen too, so the frame after it counts them afresh.
   */
  private idlers = 0;
  /**
   * Bodies taken off the scene, disposed of once the next frame is drawn: by then the bodies that
   * replace them use the same shaders, so the renderer keeps them rather than building them again.
   * Until then a new view of the same unit in the same look takes its model up again, as when
   * planning gives way to a fight or a unit is moved, rather than copying it and setting up its
   * materials anew.
   */
  private readonly retired: Body[] = [];
  /** The board, One Ring and look the planning view was last built for, so an unchanged one isn't compared again. */
  private planningFor: {
    readonly player: PlanningBoard;
    readonly bearer: number | null;
    readonly corruption: number | null;
    readonly look: Team;
  } | null = null;
  /** Counts frames, to mark the views of effects still in the playback's lists (`sync`). */
  private frame = 0;
  /** The pose each rigged unit is set to, written afresh for each, so a frame allocates nothing. */
  private readonly pose = newPose();
  /** Where a unit, text or ring is drawn, and a unit's lunge, written afresh for each likewise. */
  private readonly at: MutablePoint = { x: 0, z: 0 };
  private readonly lunge: MutablePoint = { x: 0, z: 0 };
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  /** Where a dragged unit or item would go while planning. */
  private readonly marker = new THREE.Group();
  private readonly markerOutline = new THREE.MeshBasicMaterial({ color: MARKER_COLOURS.ok, transparent: true, opacity: 0.95, depthWrite: false });
  private readonly markerFill = new THREE.MeshBasicMaterial({ color: MARKER_COLOURS.ok, transparent: true, opacity: 0.22, depthWrite: false });
  private readonly hexMarker = new THREE.Group();
  private readonly tileMarker = new THREE.Group();
  /** The planning unit whose label is marked as where a dragged item would go. */
  private marked: number | null = null;
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();

  constructor(private readonly container: HTMLElement) {
    // Units are pawns until their models arrive.
    loadModels();
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.labels.domElement.className = 'labels';
    container.append(this.renderer.domElement, this.labels.domElement);

    // The label layer sits on top of the canvas, so it takes the mouse.
    this.controls = new OrbitControls(this.camera, this.labels.domElement);
    // It always looks down into the arena, and never past its edge.
    this.controls.maxPolarAngle = CAMERA_LIMITS.maxPolar;
    this.controls.minDistance = CAMERA_LIMITS.minDistance;
    this.controls.maxDistance = CAMERA_LIMITS.maxDistance;
    this.controls.maxTargetRadius = CAMERA_LIMITS.maxPan;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('change', () => this.redraws.change());
    this.reducedMotion.addEventListener('change', () => this.redraws.change());
    // A WebGL context restored after it was lost starts with a cleared canvas, as a resize does, so
    // the frame is drawn again, even where nothing moves: a paused or finished fight, or the results.
    this.renderer.domElement.addEventListener('webglcontextrestored', () => this.redraws.change());
    // Behind team A's back row, looking across the board.
    this.aim('A');

    this.scene.background = new THREE.Color(ATMOSPHERE.colour);
    this.scene.fog = new THREE.Fog(ATMOSPHERE.colour, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar);
    this.scene.add(new THREE.HemisphereLight(LIGHTS.sky, LIGHTS.ground, LIGHTS.ambient));
    const sun = new THREE.DirectionalLight(LIGHTS.sun, LIGHTS.sunIntensity);
    sun.position.set(...LIGHTS.sunFrom);
    this.scene.add(sun);
    void loadArena().then((arena) => {
      if (arena === null) return;
      this.scene.add(arena);
      this.redraws.change();
    });
    this.buildBoard();
    this.buildBench();
    this.buildMarker();
    this.scene.add(this.fightLayer);
    this.resize();
    // Panels such as the shop bar change the container's size without resizing the window.
    new ResizeObserver(() => this.resize()).observe(container);
  }

  /** The element that takes the mouse, for dragging units. */
  get pointerTarget(): HTMLElement {
    return this.labels.domElement;
  }

  /** Turns the mouse controls on or off, so dragging a unit doesn't also turn the camera. */
  set cameraControls(enabled: boolean) {
    this.controls.enabled = enabled;
  }

  /** Whether a fight is shown, rather than the planning board and bench. */
  get showsFight(): boolean {
    return this.playback !== null;
  }

  /** Shows a new fight, replacing what was shown. `side` is drawn as the near team, in blue, on the pale half. */
  show(playback: Playback, side: Team = 'A'): void {
    this.clear();
    this.playback = playback;
    this.side = side;
    this.tintBoard(side);
    this.aim(side);
  }

  /**
   * Shows a player's board and bench for planning, in their own perspective. `ring` marks the One
   * Ring's bearer among them, if the player holds it. `look` is A for the person's own units, in
   * blue, and B for another player's, in red.
   */
  showPlanning(player: PlanningBoard, force = false, ring: PlanningRing | null = null, look: Team = 'A'): void {
    const last = this.planningFor;
    const bearer = ring?.bearer ?? null;
    const corruption = ring?.corruption ?? null;
    // The same view of the player as last frame shows the same board, without comparing it again.
    if (
      !force &&
      this.playback === null &&
      last !== null &&
      last.player === player &&
      last.bearer === bearer &&
      last.corruption === corruption &&
      last.look === look
    ) {
      return;
    }
    this.planningFor = { player, bearer, corruption, look };
    const key = JSON.stringify([player.board, player.bench, ring, look]);
    if (!force && this.playback === null && key === this.planningKey) return;
    const entering = this.playback !== null || this.planningKey === '';
    this.clear();
    this.planningKey = key;
    this.side = 'A';
    this.tintBoard('A');
    this.bench.visible = true;
    if (entering) this.aim('planning');
    const add = (unit: OwnedUnit, at: Point) => {
      const corruption = ring !== null && ring.bearer === unit.id ? ring.corruption : null;
      const view = this.createView(unit.id, unit.unitId, unit.star, 'A', look, false, unit.items, corruption);
      view.group.position.set(at.x, 0, at.z);
      this.fightLayer.add(view.group);
      this.planning.set(unit.id, view);
    };
    player.board.forEach((unit, i) => {
      if (unit !== null) add(unit, hexToWorld(fromPlacement('A', boardPlace(i))));
    });
    player.bench.forEach((unit, slot) => {
      if (unit !== null) add(unit, benchToWorld(slot));
    });
  }

  /**
   * Shows the board alone, as when the page opens: no fight and no units, so nothing on it moves and
   * no frame is drawn until something changes. The play page shows it behind the menu and the lobby.
   */
  showBoard(): void {
    if (this.playback === null && this.planningKey === '') return;
    this.clear();
    // The next planning view is built afresh, even from the same view of the player.
    this.planningFor = null;
    this.side = 'A';
    this.tintBoard('A');
    this.aim('A');
  }

  /** Moves a planning unit to a point, lifted, while it is dragged. */
  drag(unitId: number, point: Point): void {
    this.planning.get(unitId)?.group.position.set(point.x, 0.4, point.z);
    this.redraws.change();
  }

  /** Marks the hex or bench tile a drag would go to, in gold if it can go there and in red if not; null hides the marker. */
  markPlace(place: Place | null, ok = true): void {
    this.redraws.change();
    this.marker.visible = place !== null;
    if (place === null) return;
    const bench = 'bench' in place;
    this.hexMarker.visible = !bench;
    this.tileMarker.visible = bench;
    const { x, z } = bench ? benchToWorld(place.bench) : hexToWorld(fromPlacement('A', place));
    this.marker.position.set(x, 0.015, z);
    const colour = ok ? MARKER_COLOURS.ok : MARKER_COLOURS.no;
    this.markerOutline.color.setHex(colour);
    this.markerFill.color.setHex(colour);
  }

  /** Marks the label of the planning unit a dragged item would go to, or none. */
  markUnit(unitId: number | null): void {
    if (unitId === this.marked) return;
    const label = (id: number | null) => (id === null ? null : (this.planning.get(id)?.label.element ?? null));
    label(this.marked)?.classList.remove('drop-target');
    label(unitId)?.classList.add('drop-target');
    this.marked = unitId;
  }

  /**
   * The unit under a screen position, in the fight or on the planning board and bench: its model, its
   * base or its pawn as the last frame drew them, or its label when `target`, the element under the
   * pointer, is in one, as an item chip on it is. Null if there is none, or it is dead or dying.
   */
  unitAt(clientX: number, clientY: number, target: EventTarget | null = null): UnitPick | null {
    const label = target instanceof Element ? target.closest('.unit-label') : null;
    if (label !== null) {
      for (const view of this.shownViews()) if (view.overlay.element === label) return this.pickOf(view);
      return null;
    }
    return this.viewAt(clientX, clientY, this.pickOf);
  }

  /** The point on the ground under a screen position, or null if the ray misses it. */
  groundPoint(clientX: number, clientY: number): Point | null {
    this.aimRay(clientX, clientY);
    const hit = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    return hit === null ? null : { x: hit.x, z: hit.z };
  }

  /** The id of the planning unit whose model, base or pawn is under a screen position, if any. */
  planningUnitAt(clientX: number, clientY: number): number | null {
    return this.playback === null ? this.viewAt(clientX, clientY, (view) => view.key) : null;
  }

  /** The units on screen: the fight's, or the planning board's and bench's. */
  private shownViews(): Iterable<UnitView> {
    return this.playback !== null ? this.units : this.planning.values();
  }

  /** A unit the pointer is on: a planning unit, or one in the fight while it lives. */
  private readonly pickOf = (view: UnitView): UnitPick | null => {
    if (!view.group.visible) return null;
    const label = view.overlay.element;
    if (this.playback === null) return { kind: 'planning', id: view.key, label };
    return this.playback.combat.state.units[view.key]?.alive === true ? { kind: 'fight', id: view.key, label } : null;
  };

  /**
   * What `pick` makes of the nearest unit on screen under a screen position that it takes: the ray
   * hits its model, base or pawn as the last frame drew them, a rigged model in its pose then. A
   * unit `pick` passes over, such as a dying one, lets the ray go on to the units behind it.
   */
  private viewAt<T>(clientX: number, clientY: number, pick: (view: UnitView) => T | null): T | null {
    this.aimRay(clientX, clientY);
    const groups: THREE.Object3D[] = [];
    for (const view of this.shownViews()) if (view.group.visible) groups.push(view.group);
    for (const hit of this.raycaster.intersectObjects(groups, true)) {
      for (let object: THREE.Object3D | null = hit.object; object !== null; object = object.parent) {
        const view = this.viewOf.get(object);
        if (view === undefined) continue;
        const picked = pick(view);
        if (picked !== null) return picked;
        break;
      }
    }
    return null;
  }

  private aimRay(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private aim(view: keyof typeof CAMERA): void {
    const { position, target } = CAMERA[view];
    this.camera.position.set(position[0], position[1], position[2]);
    this.controls.target.set(target[0], target[1], target[2]);
    this.controls.update();
  }

  /** Removes the fight or planning units. */
  private clear(): void {
    // Removing the layer doesn't take its labels out of the page, so remove them here.
    this.fightLayer.traverse((object) => {
      if (object instanceof CSS2DObject) object.element.remove();
    });
    this.scene.remove(this.fightLayer);
    for (const view of this.units) this.retired.push(view.body);
    for (const view of this.planning.values()) this.retired.push(view.body);
    for (const ring of this.rings.values()) this.spareRings[ring.look].push(ring.material);
    this.fightLayer = new THREE.Group();
    this.scene.add(this.fightLayer);
    this.labelSizes.disconnect();
    this.playback = null;
    this.units = [];
    this.projectiles.clear();
    this.texts.clear();
    this.rings.clear();
    this.planning = new Map();
    this.planningKey = '';
    this.marked = null;
    this.bench.visible = false;
    this.redraws.change();
  }

  resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    // Resizing the canvas clears it.
    this.redraws.change();
    this.renderer.setSize(width, height);
    this.post.setSize(width, height, this.renderer.getPixelRatio());
    this.labels.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Draws a frame, if it has something new to show: a fight whose display time has moved, planning
   * units idling, or a change. Otherwise the canvas keeps the last one.
   */
  render(): void {
    this.swapInModels();
    if (!this.redraws.due(this.playback, this.idlers, this.reducedMotion.matches)) return;
    this.frame++;
    if (this.playback !== null) {
      this.updateUnits(this.playback);
      this.updateProjectiles(this.playback);
      this.updateTexts(this.playback);
      this.updateRings(this.playback);
    } else {
      this.updatePlanning();
    }
    this.controls.update();
    this.post.render(this.renderer, this.scene, this.camera, this.controls.target);
    // The renderer has just brought every matrix up to date, so the labels needn't do it again.
    this.scene.matrixWorldAutoUpdate = false;
    this.labels.render(this.scene, this.camera);
    this.scene.matrixWorldAutoUpdate = true;
    for (const body of this.retired) body.dispose();
    this.retired.length = 0;
  }

  private buildBoard(): void {
    stoneTiles(this.board.material as THREE.MeshStandardMaterial, HEX_TILE_RADIUS);
    const matrix = new THREE.Matrix4();
    BOARD_HEXES.forEach((hex, i) => {
      const { x, z } = hexToWorld(hex);
      this.board.setMatrixAt(i, matrix.makeTranslation(x, 0, z));
    });
    this.tintBoard('A');
    // Translucent, it is drawn first of what is, before faded units and the drop marker, which stand on it.
    this.board.renderOrder = -1;
    this.scene.add(this.board);
  }

  /**
   * Colours the half of the board nearest the camera, `side`'s, in the near stone and the other
   * half in the far one, as units are coloured, so a person playing team B sees their blue units
   * on the pale half.
   */
  private tintBoard(side: Team): void {
    if (side === this.boardSide) return;
    this.boardSide = side;
    const colour = new THREE.Color();
    BOARD_HEXES.forEach((hex, i) => {
      const { col, row } = toOffset(hex);
      const half: Team = row < TEAM_ROWS ? 'A' : 'B';
      this.board.setColorAt(i, colour.setHex(BOARD_COLOURS[half === side ? 'A' : 'B'][col % 2]!));
    });
    this.board.instanceColor!.needsUpdate = true;
  }

  private buildBench(): void {
    const material = new THREE.MeshStandardMaterial({ color: BENCH_COLOUR, flatShading: true });
    // A square tile is a four-sided one with its corners on the diagonals.
    const shape = tile((BENCH_TILE / 2) * Math.SQRT2, 4, Math.PI / 4);
    for (let slot = 0; slot < PLAYER.benchSize; slot++) {
      const mesh = new THREE.Mesh(shape, material);
      const { x, z } = benchToWorld(slot);
      mesh.position.set(x, 0, z);
      this.bench.add(mesh);
    }
    this.bench.visible = false;
    this.scene.add(this.bench);
  }

  private buildMarker(): void {
    const flat = (shape: THREE.BufferGeometry, material: THREE.Material) => {
      const mesh = new THREE.Mesh(shape, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 1;
      return mesh;
    };
    this.hexMarker.add(flat(geometry.hexFill, this.markerFill), flat(geometry.hexOutline, this.markerOutline));
    this.tileMarker.add(flat(geometry.tileFill, this.markerFill), flat(geometry.tileOutline, this.markerOutline));
    this.marker.add(this.hexMarker, this.tileMarker);
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  private updateUnits(playback: Playback): void {
    const units = playback.combat.state.units;
    // Summons appear during the fight.
    while (this.units.length < units.length) this.units.push(this.createUnit(units[this.units.length]!));
    const still = this.reducedMotion.matches;
    for (let id = 0; id < units.length; id++) {
      const unit = units[id]!;
      const view = this.units[id]!;
      const { body } = view;
      const { animator } = body;
      // A unit with a death clip starts to sink and fade halfway through it.
      const death = playback.deathProgress(id, playback.time, sinkDelay(animator?.lengths ?? null));
      view.group.visible = death < 1;
      if (!view.group.visible) continue;

      const position = playback.positionInto(this.at, id);
      const lunge = playback.lungeInto(this.lunge, id);
      view.group.position.set(position.x + lunge.x, -DEATH_SINK * death, position.z + lunge.z);
      // The way it goes while it steps or dashes, otherwise towards its target; with nowhere to face,
      // and once dead, the way it last faced. Its base stays lined up with the tiles.
      const angle = fightFacing(playback, id, unit.target);
      if (angle !== null) body.turn.rotation.y = angle;
      body.fade((unit.statuses.has('untargetable') ? UNTARGETABLE_OPACITY : 1) * (1 - death));
      let labelHeight = body.labelHeight;
      if (animator !== null) {
        const pose = fightPoseInto(this.pose, playback, id, animator.lengths, playback.time, still);
        animator.pose(pose);
        // A winner's label rises as `victory` fades in, ahead of the weapon it raises, if it doesn't
        // clear it already.
        if (pose.clip === 'victory') labelHeight += body.labelRise * pose.weight;
      }
      view.label.position.y = labelHeight;

      view.label.visible = unit.alive;
      if (unit.alive) view.overlay.update(unit);
    }
  }

  /**
   * Planning units idle in real time, each further on by its id. Counts the ones that do, which
   * hold still under reduced motion, so planning is drawn every frame only while one moves.
   */
  private updatePlanning(): void {
    const seconds = performance.now() / 1000;
    const still = this.reducedMotion.matches;
    let idlers = 0;
    for (const view of this.planning.values()) {
      const { animator } = view.body;
      if (animator === null) continue;
      animator.pose(planningPoseInto(this.pose, animator.lengths, seconds, view.key, still));
      idlers++;
    }
    this.idlers = idlers;
  }

  /**
   * Swaps pawns for their models once their shader is ready (`compileShaders`), a few a frame: the
   * pawns of units whose models have loaded since, and of units added while it compiled.
   */
  private swapInModels(): void {
    this.compileShaders();
    // Pawns are tried again when more models have loaded or another shader is ready.
    const progress = modelsLoaded() + this.shadersReady;
    if (!this.swaps.due(this.shadersReady > 0, progress)) return;
    const views = this.playback === null ? this.planning.values() : this.units;
    if (this.swaps.swapIn(progress, views, this.swapInModel) > 0) this.redraws.change();
  }

  /**
   * Starts setting up each shader the models loaded so far need, once, from a copy of the first model
   * to need it, on a base, so that models can be drawn without a frame stalling to compile it. Every
   * unit whose model needs it is a pawn until it is done: in the background where the browser can
   * (KHR_parallel_shader_compile), for up to COMPILE_WAIT_MS, and otherwise a frame ahead, which gives
   * the GPU a start on it. One shader serves every rigged model and one every static one (models.ts),
   * and their bases' come with the first.
   */
  private compileShaders(): void {
    const needed = modelShaders();
    if (needed.length === this.shaders.size) return;
    for (const shader of needed) {
      if (this.shaders.has(shader)) continue;
      this.shaders.set(shader, 'compiling');
      const ready = () => {
        if (this.shaders.get(shader) === 'ready') return;
        this.shaders.set(shader, 'ready');
        this.shadersReady++;
      };
      // The copy is never drawn, nor disposed of, so the renderer keeps the shader even while no model
      // that needs it is on screen. A shader that fails shows when a model is drawn, as it would anyway.
      const copy = shaderSample(shader, TEAM_COLOURS.A);
      // Compiled for what the scene is drawn into (post.ts), not the canvas, or the first real draw
      // would need another program and compile it then. Both calls choose the program at once.
      this.renderer.setRenderTarget(this.post.target);
      if (this.renderer.extensions.has('KHR_parallel_shader_compile')) {
        this.renderer.compileAsync(copy.object, this.camera, this.scene).then(ready, ready);
        // In case it never says so, as when the WebGL context is lost meanwhile.
        setTimeout(ready, COMPILE_WAIT_MS);
      } else {
        this.renderer.compile(copy.object, this.camera, this.scene);
        // Ready once this frame is over, so units added later in it are pawns as well.
        queueMicrotask(ready);
      }
      this.renderer.setRenderTarget(null);
    }
  }

  /** Whether the model for a unit at a star level has loaded and its shader is ready, so it can be drawn. */
  private modelReady(unitId: UnitState['unitId'], star: Star): boolean {
    const shader = modelShader(unitId, star);
    return shader !== null && this.shaders.get(shader) === 'ready';
  }

  /**
   * Swaps a unit's pawn for its model, if it has loaded and its shader is ready. Whether it did. A
   * unit that has died keeps the body it died as, so it sinks and fades once: a model swapped in then
   * would start again, after its death clip.
   */
  private readonly swapInModel = (view: UnitView): boolean => {
    if (view.body.model || view.summon) return false;
    if (this.playback !== null && this.playback.history(view.key).death !== null) return false;
    if (!this.modelReady(view.unitId, view.star)) return false;
    const copy = copyModel(view.unitId, view.star, TEAM_COLOURS[view.look]);
    if (copy === null) return false;
    const facing = view.body.turn.rotation.y;
    view.group.remove(view.body.object);
    this.retired.push(view.body);
    view.body = modelBody(copy, view.unitId, view.star, view.look);
    stand(view.body, view.team);
    view.body.turn.rotation.y = facing;
    view.group.add(view.body.object);
    view.label.position.y = view.body.labelHeight;
    return true;
  };

  /**
   * A body for a unit at a star level in a look: the model of one just taken off the scene if there
   * is one, else a copy of its model, or a pawn until that has loaded and its shader is ready, which
   * `swapInModels` then swaps for the model. Summons are always pawns.
   */
  private bodyFor(unitId: UnitState['unitId'], star: Star, look: Team, summon: boolean, minor: boolean): Body {
    if (!summon) {
      const i = this.retired.findIndex((body) => body.model && body.unitId === unitId && body.star === star && body.look === look);
      if (i >= 0) {
        const body = this.retired.splice(i, 1)[0]!;
        body.reset();
        return body;
      }
      const copy = this.modelReady(unitId, star) ? copyModel(unitId, star, TEAM_COLOURS[look]) : null;
      if (copy !== null) return modelBody(copy, unitId, star, look);
    }
    return pawnBody(look, isLarge(unitId) ? LARGE_PAWN_SCALE : minor ? 0.75 : 1);
  }

  private createUnit(unit: UnitState): UnitView {
    const look = unit.team === this.side ? 'A' : 'B';
    const view = this.createView(unit.id, unit.unitId, unit.star, unit.team, look, unit.summon, unit.items, unit.ring, true, unit.base.maxMana > 0);
    this.fightLayer.add(view.group);
    return view;
  }

  /**
   * A unit's model for its star level on its base, or a pawn until it has loaded, with its label
   * above it, facing the other team, coloured as the near (`look` A) or far team. Summons have no
   * model and are smaller pawns, unnamed apart from the Eye's Nazgûl. `bars` adds health, mana and
   * statuses for fights.
   */
  private createView(
    key: number,
    unitId: UnitState['unitId'],
    star: Star,
    team: Team,
    look: Team,
    summon: boolean,
    items: readonly ItemId[],
    ring: number | null,
    bars = false,
    mana = false,
  ): UnitView {
    const minor = summon && unitId !== 'eye-nazgul';
    const body = this.bodyFor(unitId, star, look, summon, minor);

    const overlay = new UnitLabel({
      name: minor ? null : displayName(unitId),
      star: summon ? null : star,
      look,
      items,
      ring,
      bars,
      mana,
    });
    const label = new CSS2DObject(overlay.element);
    // Its bottom edge on the point, rather than its middle.
    label.center.set(0.5, 1);
    label.position.set(0, body.labelHeight, 0);
    if (bars) this.labelSizes.observe(overlay.element);

    const group = new THREE.Group();
    group.add(body.object, label);
    stand(body, team);
    const view: UnitView = { group, unitId, star, team, look, summon, minor, key, body, label, overlay };
    this.viewOf.set(group, view);
    return view;
  }

  private updateProjectiles(playback: Playback): void {
    const { projectiles } = playback;
    sync(this.projectiles, projectiles, this.frame, this.addProjectile, this.removeProjectile);
    for (let i = 0; i < projectiles.length; i++) {
      const projectile = projectiles[i]!;
      const { mesh } = this.projectiles.get(projectile)!;
      // It leaves as the shooter's attack clip looses it.
      mesh.visible = playback.time >= projectile.startTick;
      const { x, z } = playback.projectilePositionInto(this.at, projectile);
      // From the shooter's chest to the target's, so it strikes a Hobbit and an Ent alike.
      const from = this.units[projectile.source]?.body.chest ?? PAWN_CHEST;
      const to = this.units[projectile.target]?.body.chest ?? PAWN_CHEST;
      mesh.position.set(x, from + (to - from) * playback.progress(projectile.startTick, projectile.hitTick - projectile.startTick), z);
    }
  }

  private readonly addProjectile = (): ProjectileView => {
    const mesh = new THREE.Mesh(geometry.projectile, projectileMaterial);
    this.fightLayer.add(mesh);
    return { mesh, seen: 0 };
  };

  private readonly removeProjectile = ({ mesh }: ProjectileView): void => {
    this.fightLayer.remove(mesh);
  };

  private updateTexts(playback: Playback): void {
    const { texts } = playback;
    sync(this.texts, texts, this.frame, this.addText, this.removeText);
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]!;
      const view = this.texts.get(text)!;
      const { object } = view;
      const progress = playback.progress(text.startTick, EFFECT_TICKS.floatingText);
      const { x, z } = playback.positionInto(this.at, text.unit);
      // They rise from the bottom of their unit's label, lifted by its height: above the label.
      const unit = this.units[text.unit];
      const base = unit === undefined ? LABEL.height : unit.label.position.y;
      object.position.set(x, base + 0.32 * view.stack + TEXT_RISE * progress, z);
      // Never lower again, so the killing blow's number stays put as its unit's label goes.
      const lift = unit === undefined ? 0 : (this.labelHeights.get(unit.label.element) ?? 0) + TEXT_GAP;
      if (lift > view.lift) {
        view.lift = lift;
        object.element.style.translate = `0 ${-lift}px`;
      }
      const opacity = 1 - progress * progress;
      if (opacity !== view.opacity) {
        view.opacity = opacity;
        object.element.style.opacity = String(opacity);
      }
    }
  }

  private readonly addText = (text: FloatingText): TextView => {
    const element = document.createElement('div');
    element.className = `float ${text.kind}${text.big ? ' big' : ''}`;
    element.textContent = text.text;
    const object = new CSS2DObject(element);
    // Its bottom edge on the point, which is moved up to clear its unit's label.
    object.center.set(0.5, 1);
    this.fightLayer.add(object);
    // Numbers that start together stack upwards instead of overlapping.
    const stack = [...this.texts.keys()].filter((t) => t.unit === text.unit && Math.abs(t.startTick - text.startTick) < 3).length;
    return { object, stack, lift: 0, opacity: -1, seen: 0 };
  };

  private readonly removeText = ({ object }: TextView): void => {
    this.fightLayer.remove(object);
  };

  private updateRings(playback: Playback): void {
    const { casts } = playback;
    sync(this.rings, casts, this.frame, this.addRing, this.removeRing);
    for (let i = 0; i < casts.length; i++) {
      const cast = casts[i]!;
      const { mesh, material } = this.rings.get(cast)!;
      const progress = playback.progress(cast.startTick, EFFECT_TICKS.castRing);
      const { x, z } = playback.positionInto(this.at, cast.unit);
      mesh.position.set(x, 0.02, z);
      mesh.scale.setScalar(1 + 1.5 * progress);
      material.opacity = 1 - progress;
    }
  }

  private readonly addRing = (cast: CastRing): CastRingView => {
    const team = this.playback!.combat.state.units[cast.unit]!.team;
    const look: Team = team === this.side ? 'A' : 'B';
    const material = this.spareRings[look].pop() ?? ringMaterial(look);
    const mesh = new THREE.Mesh(geometry.ring, material);
    mesh.rotation.x = -Math.PI / 2;
    this.fightLayer.add(mesh);
    return { mesh, material, look, seen: 0 };
  };

  private readonly removeRing = (ring: CastRingView): void => {
    this.fightLayer.remove(ring.mesh);
    this.spareRings[ring.look].push(ring.material);
  };
}

/** A cast ring's material: flat, so drawn in one pass from either side. */
function ringMaterial(look: Team): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: TEAM_COLOURS[look], transparent: true, side: THREE.DoubleSide });
  material.forceSinglePass = true;
  return material;
}

/**
 * Turns a body to face the other team's half from `team`'s, and its base, if it has one, to point
 * its pips that way. Team A's half is at +z, so it faces −z.
 */
function stand(body: Body, team: Team): void {
  body.turn.rotation.y = team === 'A' ? Math.PI : 0;
  if (body.base !== null) body.base.rotation.y = team === 'A' ? 0 : Math.PI;
}

/** A low-poly pawn in the look's colour, `scale` times its usual size, with a nose where it faces. */
function pawnBody(look: Team, scale: number): Body {
  const material = new THREE.MeshStandardMaterial({ color: TEAM_COLOURS[look], flatShading: true, transparent: true });
  const body = new THREE.Mesh(geometry.body, material);
  body.position.y = 0.45;
  const head = new THREE.Mesh(geometry.head, material);
  head.position.y = 1.1;
  // Points where the unit faces.
  const nose = new THREE.Mesh(geometry.nose, noseMaterial);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.1, 0.3);
  const object = new THREE.Group();
  object.add(body, head, nose);
  object.scale.setScalar(scale);
  return {
    object,
    turn: object,
    base: null,
    model: false,
    unitId: null,
    star: null,
    look,
    // Where a model's label would be, so it hardly moves when the model takes the pawn's place.
    labelHeight: LABEL.height * scale,
    labelRise: 0,
    chest: PAWN_CHEST * scale,
    animator: null,
    fade: (opacity) => (material.opacity = opacity),
    reset: () => (material.opacity = 1),
    dispose: () => material.dispose(),
  };
}

/**
 * A unit's own copy of its model for its star level, on its base, playing its clips if it is
 * rigged. Its label holds still above it, and rises in `victory` if it has to, so it doesn't cover
 * the weapon the unit raises.
 */
function modelBody(copy: ModelCopy, unitId: UnitState['unitId'], star: Star, look: Team): Body {
  const animator = copy.clips === null || copy.lengths === null ? null : new Animator(copy.model, copy.clips, copy.lengths);
  return {
    object: copy.object,
    turn: copy.model,
    base: copy.base,
    model: true,
    unitId,
    star,
    look,
    labelHeight: copy.labelHeight,
    labelRise: copy.labelRise,
    chest: copy.chest,
    animator,
    fade: (opacity) => copy.fade(opacity),
    reset: () => {
      copy.fade(1);
      animator?.reset();
    },
    dispose: () => {
      animator?.dispose();
      copy.dispose();
    },
  };
}

/**
 * A rigged copy's clips on a mixer of its own, one action per clip. Each frame the scene sets it to
 * a pose: every action's time and weight, with display time deciding both, so the mixer's own clock
 * never runs.
 */
class Animator {
  private readonly mixer: THREE.AnimationMixer;
  /** In the order of CLIPS. */
  private readonly actions: readonly THREE.AnimationAction[];
  /** The pose last applied, so a paused fight doesn't pose its units again. */
  private readonly shown = newPose();

  constructor(
    private readonly root: THREE.Object3D,
    clips: Readonly<Record<ClipName, THREE.AnimationClip>>,
    readonly lengths: ClipLengths,
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = CLIPS.map((name) => {
      const action = this.mixer.clipAction(clips[name]);
      action.weight = 0;
      action.play();
      return action;
    });
    this.shown.weight = -1;
  }

  /** Poses it afresh next time, whatever it was last set to. */
  reset(): void {
    this.shown.weight = -1;
  }

  pose(pose: PoseBuffer): void {
    const shown = this.shown;
    if (
      pose.clip === shown.clip &&
      pose.time === shown.time &&
      pose.fromClip === shown.fromClip &&
      pose.fromTime === shown.fromTime &&
      pose.weight === shown.weight
    ) {
      return;
    }
    shown.clip = pose.clip;
    shown.time = pose.time;
    shown.fromClip = pose.fromClip;
    shown.fromTime = pose.fromTime;
    shown.weight = pose.weight;
    for (let i = 0; i < CLIPS.length; i++) {
      const clip = CLIPS[i];
      const action = this.actions[i]!;
      if (clip === pose.clip) {
        action.time = pose.time;
        action.weight = pose.weight;
      } else if (clip === pose.fromClip) {
        action.time = pose.fromTime;
        action.weight = 1 - pose.weight;
      } else {
        action.weight = 0;
      }
    }
    // With no time passing, the mixer only blends the clips at the times just set.
    this.mixer.update(0);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}

/**
 * Removes the views of items that are gone, then adds a view for each new item. Views are marked
 * with the frame their item was last seen in, so a frame in which nothing comes or goes, as most
 * don't, allocates nothing.
 */
function sync<K, V extends EffectView>(views: Map<K, V>, items: readonly K[], frame: number, create: (item: K) => V, remove: (view: V) => void): void {
  let kept = 0;
  for (let i = 0; i < items.length; i++) {
    const view = views.get(items[i]!);
    if (view === undefined) continue;
    view.seen = frame;
    kept++;
  }
  if (kept < views.size) {
    for (const [item, view] of views) {
      if (view.seen === frame) continue;
      remove(view);
      views.delete(item);
    }
  }
  if (kept === items.length) return;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (views.has(item)) continue;
    const view = create(item);
    view.seen = frame;
    views.set(item, view);
  }
}
