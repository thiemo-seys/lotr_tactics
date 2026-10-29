// The Three.js scene: board, units, overlays and effects (docs/viewer-spec.md sections 3–5).

import { BOARD_HEXES, UNITS, toOffset, type Team, type UnitState } from '@lotr-tactics/sim';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { hexToWorld } from './layout.js';
import { unitName } from './log.js';
import { EFFECT_TICKS, facing, type CastRing, type FloatingText, type Playback, type Projectile } from './playback.js';

const TEAM_COLOURS: Record<Team, number> = { A: 0x4a90d9, B: 0xd9534f };

/** Each half of the board in two shades, alternating by column. */
const BOARD_COLOURS: Record<Team, readonly [number, number]> = { A: [0x2b3d55, 0x31465f], B: [0x553230, 0x5f3936] };

/** How high a floating number rises over its life, in world units. */
const TEXT_RISE = 0.9;

/** Opacity of an untargetable unit. */
const UNTARGETABLE_OPACITY = 0.35;

interface UnitView {
  readonly group: THREE.Group;
  readonly material: THREE.MeshStandardMaterial;
  readonly label: CSS2DObject;
  readonly health: HTMLElement;
  readonly shield: HTMLElement;
  readonly mana: HTMLElement | null;
  readonly tags: HTMLElement;
}

const geometry = {
  hex: new THREE.CylinderGeometry(0.94, 0.94, 0.12, 6),
  body: new THREE.CylinderGeometry(0.3, 0.42, 0.9, 6),
  head: new THREE.IcosahedronGeometry(0.25, 0),
  nose: new THREE.ConeGeometry(0.09, 0.28, 4),
  projectile: new THREE.IcosahedronGeometry(0.11, 0),
  ring: new THREE.RingGeometry(0.5, 0.62, 24),
};

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

  constructor(private readonly container: HTMLElement) {
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.labels.domElement.className = 'labels';
    container.append(this.renderer.domElement, this.labels.domElement);

    // Behind team A's back row, looking across the board.
    this.camera.position.set(0, 12.5, 12.5);
    // The label layer sits on top of the canvas, so it takes the mouse.
    this.controls = new OrbitControls(this.camera, this.labels.domElement);
    this.controls.target.set(0, 0, -0.4);
    this.controls.maxPolarAngle = Math.PI * 0.45;
    this.controls.update();

    this.scene.background = new THREE.Color(0x12161c);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(5, 12, 8);
    this.scene.add(sun);
    this.buildBoard();
    this.scene.add(this.fightLayer);
    this.resize();
  }

  /** Shows a new fight, replacing the current one. */
  show(playback: Playback): void {
    // Removing the layer doesn't take its labels out of the page, so remove them here.
    this.fightLayer.traverse((object) => {
      if (object instanceof CSS2DObject) object.element.remove();
    });
    this.scene.remove(this.fightLayer);
    for (const { material } of this.units) material.dispose();
    this.fightLayer = new THREE.Group();
    this.scene.add(this.fightLayer);
    this.playback = playback;
    this.units = [];
    this.projectiles.clear();
    this.texts.clear();
    this.rings.clear();
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
      this.updateBars(view, unit);
    });
  }

  private updateBars(view: UnitView, unit: UnitState): void {
    const shield = unit.statuses.shield;
    const total = Math.max(unit.stats.maxHealth, unit.health + shield);
    view.health.style.width = `${(100 * unit.health) / total}%`;
    view.shield.style.width = `${(100 * shield) / total}%`;
    if (view.mana !== null) view.mana.style.width = `${(100 * unit.mana) / unit.base.maxMana}%`;
    const tags = [
      unit.statuses.has('stun') ? 'Stun' : null,
      unit.statuses.has('stunImmune') ? 'Immune' : null,
      unit.statuses.has('untargetable') ? 'Untargetable' : null,
    ]
      .filter((t) => t !== null)
      .join(' · ');
    if (view.tags.textContent !== tags) view.tags.textContent = tags;
  }

  private createUnit(unit: UnitState): UnitView {
    const large = unit.unitId in UNITS && UNITS[unit.unitId as keyof typeof UNITS].large === true;
    const material = new THREE.MeshStandardMaterial({ color: TEAM_COLOURS[unit.team], flatShading: true, transparent: true });
    const body = new THREE.Mesh(geometry.body, material);
    body.position.y = 0.45;
    const head = new THREE.Mesh(geometry.head, material);
    head.position.y = 1.1;
    // Points where the unit faces.
    const nose = new THREE.Mesh(geometry.nose, noseMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.1, 0.3);

    const element = document.createElement('div');
    element.className = `unit-label team-${unit.team}`;
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = unit.summon ? '' : `${unitName(unit).replace(/ \([AB]\)$/, '')} ${'★'.repeat(unit.star)}`;
    const healthBar = bar('health');
    const shield = document.createElement('div');
    shield.className = 'shield';
    healthBar.bar.append(shield);
    const manaBar = unit.base.maxMana > 0 ? bar('mana') : null;
    const tags = document.createElement('div');
    tags.className = 'tags';
    element.append(name, healthBar.bar, ...(manaBar === null ? [] : [manaBar.bar]), tags);

    const label = new CSS2DObject(element);
    label.position.set(0, 1.8, 0);
    const group = new THREE.Group();
    group.add(body, head, nose, label);
    group.scale.setScalar(large ? 1.35 : unit.summon ? 0.75 : 1);
    this.fightLayer.add(group);
    return { group, material, label, health: healthBar.fill, shield, mana: manaBar?.fill ?? null, tags };
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
        const material = new THREE.MeshBasicMaterial({ color: TEAM_COLOURS[team], transparent: true, side: THREE.DoubleSide });
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

function bar(kind: string): { bar: HTMLElement; fill: HTMLElement } {
  const element = document.createElement('div');
  element.className = `bar ${kind}`;
  const fill = document.createElement('div');
  fill.className = 'fill';
  element.append(fill);
  return { bar: element, fill };
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
