// The Three.js scene: board, units, overlays and effects (docs/viewer-spec.md sections 3–5), and
// the marker that shows where a dragged unit or item would go while planning.

import {
  BOARD_HEXES,
  PLAYER,
  boardPlace,
  fromPlacement,
  toOffset,
  type FighterId,
  type ItemId,
  type OwnedUnit,
  type Place,
  type PlayerView,
  type Star,
  type Team,
  type UnitState,
} from '@lotr-tactics/sim';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { benchToWorld, hexToWorld, type Point } from './layout.js';
import type { PlanningRing } from './flow.js';
import { EFFECT_TICKS, facing, type CastRing, type FloatingText, type Playback, type Projectile } from './playback.js';
import { UnitLabel } from './ui/labels.js';
import { displayName, isLarge } from './units.js';

/** Units on the side the camera looks from are drawn as team A: blue, with green health. */
const TEAM_COLOURS: Record<Team, number> = { A: 0x4a90d9, B: 0xd9534f };

/** Where the camera sits and looks, behind a team's back row or over the planning board and bench. */
const CAMERA = {
  A: { position: [0, 12.5, 12.5], target: [0, 0, -0.4] },
  B: { position: [0, 12.5, -12.5], target: [0, 0, 0.4] },
  planning: { position: [0, 14, 13], target: [0, 0, 2.4] },
} as const;

/** Each half of the board in two shades, alternating by column. */
const BOARD_COLOURS: Record<Team, readonly [number, number]> = { A: [0x2b3d55, 0x31465f], B: [0x553230, 0x5f3936] };

/** How high a floating number rises over its life, in world units. */
const TEXT_RISE = 0.9;

/** Opacity of an untargetable unit. */
const UNTARGETABLE_OPACITY = 0.35;

/** The drop marker's colours: where a drag can go, and where it can't. */
const MARKER_COLOURS = { ok: 0xf3d27a, no: 0xe35d5b } as const;

interface UnitView {
  readonly group: THREE.Group;
  readonly material: THREE.MeshStandardMaterial;
  readonly label: CSS2DObject;
  readonly overlay: UnitLabel;
}

const geometry = {
  hex: new THREE.CylinderGeometry(0.94, 0.94, 0.12, 6),
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
  private readonly projectiles = new Map<Projectile, THREE.Mesh>();
  private readonly texts = new Map<FloatingText, { object: CSS2DObject; stack: number }>();
  private readonly rings = new Map<CastRing, THREE.Mesh>();
  /** The team drawn as the near side. */
  private side: Team = 'A';
  /** Bench tiles, shown while planning. */
  private readonly bench = new THREE.Group();
  /** Planning pawns by owned unit id. */
  private planning = new Map<number, THREE.Group>();
  private planningKey = '';
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
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.labels.domElement.className = 'labels';
    container.append(this.renderer.domElement, this.labels.domElement);

    // The label layer sits on top of the canvas, so it takes the mouse.
    this.controls = new OrbitControls(this.camera, this.labels.domElement);
    this.controls.maxPolarAngle = Math.PI * 0.45;
    // Behind team A's back row, looking across the board.
    this.aim('A');

    this.scene.background = new THREE.Color(0x12161c);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(5, 12, 8);
    this.scene.add(sun);
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

  /** Shows a new fight, replacing what was shown. `side` is drawn as the near team, in blue. */
  show(playback: Playback, side: Team = 'A'): void {
    this.clear();
    this.playback = playback;
    this.side = side;
    this.aim(side);
  }

  /**
   * Shows a player's board and bench for planning, in their own perspective. `ring` marks the One
   * Ring's bearer among them, if the player holds it.
   */
  showPlanning(player: PlayerView, force = false, ring: PlanningRing | null = null): void {
    const key = JSON.stringify([player.board, player.bench, ring]);
    if (!force && this.playback === null && key === this.planningKey) return;
    const entering = this.playback !== null || this.planningKey === '';
    this.clear();
    this.planningKey = key;
    this.side = 'A';
    this.bench.visible = true;
    if (entering) this.aim('planning');
    const add = (unit: OwnedUnit, at: Point) => {
      const corruption = ring !== null && ring.bearer === unit.id ? ring.corruption : null;
      const pawn = this.createPawn(unit.unitId, unit.star, 'A', 'A', false, unit.items, corruption).group;
      pawn.userData.unitId = unit.id;
      pawn.position.set(at.x, 0, at.z);
      this.fightLayer.add(pawn);
      this.planning.set(unit.id, pawn);
    };
    player.board.forEach((unit, i) => {
      if (unit !== null) add(unit, hexToWorld(fromPlacement('A', boardPlace(i))));
    });
    player.bench.forEach((unit, slot) => {
      if (unit !== null) add(unit, benchToWorld(slot));
    });
  }

  /** Moves a planning pawn to a point, lifted, while it is dragged. */
  drag(unitId: number, point: Point): void {
    this.planning.get(unitId)?.position.set(point.x, 0.4, point.z);
  }

  /** Marks the hex or bench tile a drag would go to, in gold if it can go there and in red if not; null hides the marker. */
  markPlace(place: Place | null, ok = true): void {
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
    const label = (id: number | null) => {
      const pawn = id === null ? undefined : this.planning.get(id);
      const object = pawn?.children.find((c) => c instanceof CSS2DObject);
      return object instanceof CSS2DObject ? object.element : null;
    };
    label(this.marked)?.classList.remove('drop-target');
    label(unitId)?.classList.add('drop-target');
    this.marked = unitId;
  }

  /** The point on the ground under a screen position, or null if the ray misses it. */
  groundPoint(clientX: number, clientY: number): Point | null {
    this.aimRay(clientX, clientY);
    const hit = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    return hit === null ? null : { x: hit.x, z: hit.z };
  }

  /** The id of the planning unit whose pawn is under a screen position, if any. */
  planningUnitAt(clientX: number, clientY: number): number | null {
    this.aimRay(clientX, clientY);
    for (const hit of this.raycaster.intersectObjects([...this.planning.values()], true)) {
      for (let object: THREE.Object3D | null = hit.object; object !== null; object = object.parent) {
        if (typeof object.userData.unitId === 'number') return object.userData.unitId;
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
    for (const { material } of this.units) material.dispose();
    this.fightLayer = new THREE.Group();
    this.scene.add(this.fightLayer);
    this.playback = null;
    this.units = [];
    this.projectiles.clear();
    this.texts.clear();
    this.rings.clear();
    this.planning = new Map();
    this.planningKey = '';
    this.marked = null;
    this.bench.visible = false;
  }

  resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    this.renderer.setSize(width, height);
    this.labels.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    if (this.playback !== null) {
      this.updateUnits(this.playback);
      this.updateProjectiles(this.playback);
      this.updateTexts(this.playback);
      this.updateRings(this.playback);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  private buildBoard(): void {
    const materials = new Map<number, THREE.MeshStandardMaterial>();
    for (const hex of BOARD_HEXES) {
      const { col, row } = toOffset(hex);
      const colour = BOARD_COLOURS[row < 4 ? 'A' : 'B'][col % 2]!;
      if (!materials.has(colour)) materials.set(colour, new THREE.MeshStandardMaterial({ color: colour, flatShading: true }));
      const tile = new THREE.Mesh(geometry.hex, materials.get(colour));
      const { x, z } = hexToWorld(hex);
      tile.position.set(x, -0.06, z);
      this.scene.add(tile);
    }
  }

  private buildBench(): void {
    const material = new THREE.MeshStandardMaterial({ color: 0x2a313d, flatShading: true });
    const tile = new THREE.BoxGeometry(BENCH_TILE, 0.1, BENCH_TILE);
    for (let slot = 0; slot < PLAYER.benchSize; slot++) {
      const mesh = new THREE.Mesh(tile, material);
      const { x, z } = benchToWorld(slot);
      mesh.position.set(x, -0.05, z);
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
    units.forEach((unit, id) => {
      const view = this.units[id]!;
      const death = playback.deathProgress(id);
      view.group.visible = death < 1;
      if (!view.group.visible) return;

      const position = playback.position(id);
      const lunge = playback.lungeOffset(id);
      view.group.position.set(position.x + lunge.x, -0.6 * death, position.z + lunge.z);
      if (unit.alive && unit.target !== null) {
        const angle = facing(position, playback.position(unit.target));
        if (angle !== null) view.group.rotation.y = angle;
      }
      const opacity = unit.statuses.has('untargetable') ? UNTARGETABLE_OPACITY : 1;
      view.material.opacity = opacity * (1 - death);

      view.label.visible = unit.alive;
      if (unit.alive) view.overlay.update(unit);
    });
  }

  private createUnit(unit: UnitState): UnitView {
    const look = unit.team === this.side ? 'A' : 'B';
    const view = this.createPawn(unit.unitId, unit.star, unit.team, look, unit.summon, unit.items, unit.ring, true, unit.base.maxMana > 0);
    this.fightLayer.add(view.group);
    return view;
  }

  /**
   * A pawn with its label above it, facing the other team, coloured as the near (`look` A) or far
   * team. Summons are smaller and unnamed, apart from the Eye's Nazgûl. `bars` adds health, mana
   * and statuses for fights.
   */
  private createPawn(
    unitId: FighterId | UnitState['unitId'],
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
    const material = new THREE.MeshStandardMaterial({ color: TEAM_COLOURS[look], flatShading: true, transparent: true });
    const body = new THREE.Mesh(geometry.body, material);
    body.position.y = 0.45;
    const head = new THREE.Mesh(geometry.head, material);
    head.position.y = 1.1;
    // Points where the unit faces.
    const nose = new THREE.Mesh(geometry.nose, noseMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.1, 0.3);

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
    label.position.set(0, 1.8, 0);

    const group = new THREE.Group();
    group.add(body, head, nose, label);
    group.scale.setScalar(isLarge(unitId) ? 1.35 : minor ? 0.75 : 1);
    // Team A's half is at +z, so it faces −z.
    group.rotation.y = team === 'A' ? Math.PI : 0;
    return { group, material, label, overlay };
  }

  private updateProjectiles(playback: Playback): void {
    sync(this.projectiles, playback.projectiles, () => {
      const mesh = new THREE.Mesh(geometry.projectile, projectileMaterial);
      this.fightLayer.add(mesh);
      return mesh;
    }, (mesh) => this.fightLayer.remove(mesh));
    for (const [projectile, mesh] of this.projectiles) {
      const { x, z } = playback.projectilePosition(projectile);
      mesh.position.set(x, 0.9, z);
    }
  }

  private updateTexts(playback: Playback): void {
    sync(
      this.texts,
      playback.texts,
      (text) => {
        const element = document.createElement('div');
        element.className = `float ${text.kind}${text.big ? ' big' : ''}`;
        element.textContent = text.text;
        const object = new CSS2DObject(element);
        this.fightLayer.add(object);
        // Numbers that start together stack upwards instead of overlapping.
        const stack = [...this.texts.keys()].filter((t) => t.unit === text.unit && Math.abs(t.startTick - text.startTick) < 3).length;
        return { object, stack };
      },
      ({ object }) => this.fightLayer.remove(object),
    );
    for (const [text, { object, stack }] of this.texts) {
      const progress = playback.progress(text.startTick, EFFECT_TICKS.floatingText);
      const { x, z } = playback.position(text.unit);
      object.position.set(x, 2.3 + 0.32 * stack + TEXT_RISE * progress, z);
      object.element.style.opacity = String(1 - progress * progress);
    }
  }

  private updateRings(playback: Playback): void {
    sync(
      this.rings,
      playback.casts,
      (cast) => {
        const team = playback.combat.state.units[cast.unit]!.team;
        const look = team === this.side ? 'A' : 'B';
        const material = new THREE.MeshBasicMaterial({ color: TEAM_COLOURS[look], transparent: true, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(geometry.ring, material);
        ring.rotation.x = -Math.PI / 2;
        this.fightLayer.add(ring);
        return ring;
      },
      (ring) => {
        this.fightLayer.remove(ring);
        (ring.material as THREE.Material).dispose();
      },
    );
    for (const [cast, ring] of this.rings) {
      const progress = playback.progress(cast.startTick, EFFECT_TICKS.castRing);
      const { x, z } = playback.position(cast.unit);
      ring.position.set(x, 0.02, z);
      ring.scale.setScalar(1 + 1.5 * progress);
      (ring.material as THREE.MeshBasicMaterial).opacity = 1 - progress;
    }
  }
}

/** Adds a view for each new item and removes the views of items that are gone. */
function sync<K, V>(views: Map<K, V>, items: readonly K[], create: (item: K) => V, remove: (view: V) => void): void {
  const live = new Set(items);
  for (const [item, view] of views) {
    if (!live.has(item)) {
      remove(view);
      views.delete(item);
    }
  }
  for (const item of items) if (!views.has(item)) views.set(item, create(item));
}
