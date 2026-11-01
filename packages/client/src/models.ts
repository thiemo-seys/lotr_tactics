// Unit models: loading each .glb once, and dressing a copy per unit with its team colour, trim and
// base (docs/viewer-spec.md section 4, "Models" and "Star levels").

import type { Star } from '@lotr-tactics/sim';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import MODEL_FILES from 'virtual:models';
import { BASE, STAND_COLOUR, pickModel, pipOffsets, starColour } from './stars.js';

/** A loaded model, shared by every unit drawn with it. */
export interface ModelTemplate {
  readonly scene: THREE.Object3D;
  /** How far it reaches from its centre on the ground plane, at scale 1. */
  readonly reach: number;
  /** The height of its top, at scale 1. */
  readonly top: number;
}

/** The files in `public/models`, by name without `.glb`, listed when the client is built or served. */
const AVAILABLE: ReadonlySet<string> = new Set(MODEL_FILES);

/** Loads models on first use, each once; a file that fails to load counts as no model. */
export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly templates = new Map<string, ModelTemplate | null>();
  /** Goes up whenever a model finishes loading, so views waiting on one know to look again. */
  version = 0;

  constructor(private readonly available: ReadonlySet<string> = AVAILABLE) {}

  /** Whether a unit has a model at all, loaded or not. */
  has(unitId: string, star: Star): boolean {
    return this.file(unitId, star) !== null;
  }

  /**
   * The model for a unit at a star level: the template if it has loaded, `'loading'` while it loads
   * (starting the load if needed), or null if there is none.
   */
  get(unitId: string, star: Star): ModelTemplate | 'loading' | null {
    const name = this.file(unitId, star);
    if (name === null) return null;
    if (this.templates.has(name)) return this.templates.get(name)!;
    this.load(name);
    return 'loading';
  }

  /** Starts loading the models of these units, so they are ready sooner. */
  preload(units: Iterable<{ readonly unitId: string; readonly star: Star }>): void {
    for (const { unitId, star } of units) this.get(unitId, star);
  }

  private file(unitId: string, star: Star): string | null {
    return pickModel(unitId, star, this.available);
  }

  private readonly loading = new Set<string>();

  private load(name: string): void {
    if (this.loading.has(name)) return;
    this.loading.add(name);
    this.loader
      .loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`)
      .then((gltf) => this.templates.set(name, measure(gltf.scene)))
      .catch(() => this.templates.set(name, null))
      .finally(() => {
        this.loading.delete(name);
        this.version++;
      });
  }
}

function measure(scene: THREE.Object3D): ModelTemplate {
  scene.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let reach = 0;
  let top = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = (object.geometry as THREE.BufferGeometry).getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
      reach = Math.max(reach, Math.hypot(v.x, v.z));
      top = Math.max(top, v.y);
    }
  });
  return { scene, reach, top };
}

/**
 * A copy of a model for one unit, sharing its geometry but with its own materials: `team` in the
 * team colour and `trim` in the star's colour. Returns the copy and the materials it owns.
 */
export function dressModel(template: ModelTemplate, teamColour: number, star: Star): { object: THREE.Object3D; materials: THREE.Material[] } {
  const object = template.scene.clone(true);
  const materials: THREE.Material[] = [];
  const dress = (source: THREE.Material) => {
    const material = source.clone();
    if (material instanceof THREE.MeshStandardMaterial) {
      if (material.name === 'team') material.color.setHex(teamColour);
      if (material.name === 'trim') material.color.setHex(starColour('trim', star));
    }
    materials.push(material);
    return material;
  };
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = Array.isArray(child.material) ? child.material.map(dress) : dress(child.material);
    }
  });
  return { object, materials };
}

const baseGeometry = {
  stand: new THREE.CylinderGeometry(BASE.radius, BASE.radius + 0.03, BASE.height, 6),
  rim: new THREE.CylinderGeometry(BASE.radius + 0.035, BASE.radius + 0.06, BASE.height * 0.8, 6, 1, true),
  pip: new THREE.OctahedronGeometry(0.075, 0),
};

/**
 * The low hexagonal stand a unit with a model stands on, lined up with its tile, with its rim and
 * pips in the star's colours. The pips are on the edge towards the other team's half: −z for team A,
 * whose half is at +z. Returns the base and the materials it owns.
 */
export function createBase(star: Star, team: 'A' | 'B'): { object: THREE.Group; materials: THREE.Material[] } {
  const stone = new THREE.MeshStandardMaterial({ color: STAND_COLOUR, roughness: 0.9, flatShading: true });
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: starColour('rim', star),
    roughness: 0.5,
    metalness: 0.1,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const pipMaterial = new THREE.MeshStandardMaterial({ color: starColour('pip', star), roughness: 0.5, metalness: 0.1, flatShading: true });
  const group = new THREE.Group();
  const stand = new THREE.Mesh(baseGeometry.stand, stone);
  stand.position.y = BASE.height / 2;
  const rim = new THREE.Mesh(baseGeometry.rim, rimMaterial);
  rim.position.y = BASE.height * 0.4;
  group.add(stand, rim);
  const edge = (team === 'A' ? -1 : 1) * BASE.radius * 0.84;
  for (const offset of pipOffsets(star)) {
    const pip = new THREE.Mesh(baseGeometry.pip, pipMaterial);
    pip.scale.set(1, 0.6, 1);
    pip.position.set(team === 'A' ? -offset : offset, BASE.height + 0.02, edge);
    group.add(pip);
  }
  return { object: group, materials: [stone, rimMaterial, pipMaterial] };
}
