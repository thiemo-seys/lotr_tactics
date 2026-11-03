// The units' models (docs/viewer-spec.md section 4, "Models", "Star levels" and "In the viewer"). Each
// file is loaded once, and every unit drawn with one gets its own copy on a base that shows its star
// level: the geometry and clips are shared, the materials are its own, with `team` in its side's
// colour, `trim` in its star level's, and every one able to fade. Until a unit's model has loaded,
// or if it has none, the scene draws the unit as a pawn.

import { TICKS_PER_SECOND, UNITS, type Star, type UnitId, type UnitState } from '@lotr-tactics/sim';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import MODEL_FILES from 'virtual:models';
import { CLIPS, type ClipLengths, type ClipName } from './animation.js';
import { BASE, STAND_COLOUR, labelHeight, pickModel, pipOffsets, starColour, starScale, victoryRise } from './stars.js';
import { isLarge } from './units.js';

/** The material every model has that takes its side's colour (section 4, Team colour). */
const TEAM_MATERIAL = 'team';

/** The material of fittings, coloured by star level (section 4, Star levels: Trim). */
const TRIM_MATERIAL = 'trim';

/** How high a unit's chest is, as a share of the height of its `head` bone, which sits at the neck. */
const CHEST_SHARE = 0.85;

/** Where a model without a `head` bone has its chest, as a share of its height: a pawn's. */
const STATIC_CHEST_SHARE = 0.69;

/**
 * How many times a frame a clip is measured for the heights its label clears: on each frame and
 * halfway to the next, since display time shows the clip between its frames too.
 */
const HEIGHT_STEPS = 2;

/** The files in `public/models`, by name without `.glb`, listed when the client is built or served. */
const AVAILABLE: ReadonlySet<string> = new Set(MODEL_FILES);

/**
 * The shader a model's materials need. Every model's materials are of one kind (double-sided,
 * untextured), so one shader serves every rigged model, skinned on the GPU, and one every static one.
 */
export type ModelShader = 'skinned' | 'static';

interface Model {
  /** The unit it is a model of. */
  readonly unitId: UnitState['unitId'];
  readonly scene: THREE.Object3D;
  readonly shader: ModelShader;
  /** Whether it is a Large unit's, whose label clears its top (stars.ts, modelLabelHeight). */
  readonly large: boolean;
  /** Its seven clips, or null when it has no rig or not all of them, so it is drawn static. */
  readonly clips: Readonly<Record<ClipName, THREE.AnimationClip>> | null;
  readonly lengths: ClipLengths | null;
  /**
   * How far it reaches from its centre on the ground, at scale 1, which its star level's scale keeps
   * within the hex: for a model that plays its clips, the furthest any frame of any clip takes it,
   * from its armature's `reach`; for a static one, as it stands.
   */
  readonly reach: number;
  /** The height of its top as it stands, at scale 1. */
  readonly top: number;
  /** The highest it reaches in `attack` and `cast`, which its label clears; never below `top`, and `top` for a static model. */
  readonly strike: number;
  /**
   * The highest it reaches in `victory`, with its weapon raised, which a winner's label rises to
   * clear; never below `top`, and `top` for a static model.
   */
  readonly raised: number;
  /** The height of its chest as it stands, at scale 1, from its `head` bone; null for a model without one. */
  readonly chest: number | null;
}

/** Models by file name once loaded; null for a file that didn't load. */
const models = new Map<string, Model | null>();
/** Files asked for, loaded or not. */
const requested = new Set<string>();
let loaded = 0;
let loader: GLTFLoader | null = null;
/** The shaders the models loaded so far need, in the order first needed, and the first model to need each. */
const shaders: ModelShader[] = [];
const samples = new Map<ModelShader, Model>();

/**
 * Starts loading every unit's 1★ model, once, in the background. A unit's 2★ and 3★ models load once
 * it is drawn (`request`).
 */
export function loadModels(): void {
  for (const id of Object.keys(UNITS) as UnitId[]) {
    const name = pickModel(id, 1, AVAILABLE);
    if (name !== null) load(name, id);
  }
}

/** How many models have loaded so far. The scene swaps pawns for models when it goes up. */
export function modelsLoaded(): number {
  return loaded;
}

/** The shaders the models loaded so far need, in the order they were first needed. */
export function modelShaders(): readonly ModelShader[] {
  return shaders;
}

/**
 * The shader the model for a unit at a star level needs, or null if it has none or it hasn't loaded
 * yet. Starts loading it, if it hasn't, and the model for the next star level.
 */
export function modelShader(unitId: UnitState['unitId'], star: Star): ModelShader | null {
  return request(unitId, star)?.shader ?? null;
}

/**
 * A copy of the model for a unit at a star level, on its base, with `team` in `teamColour` and `trim`
 * in the star level's colour; null if it has none or it hasn't loaded yet.
 */
export function copyModel(unitId: UnitState['unitId'], star: Star, teamColour: number): ModelCopy | null {
  const model = request(unitId, star);
  return model === null ? null : new ModelCopy(model, star, teamColour);
}

/**
 * A copy of the first model to load that needs a shader, on a base. The scene compiles the shader
 * from it before it draws any model that needs it.
 */
export function shaderSample(shader: ModelShader, teamColour: number): ModelCopy {
  return new ModelCopy(samples.get(shader)!, 1, teamColour);
}

/**
 * A unit's model at a star level, the level below standing in while one doesn't exist (stars.ts,
 * pickModel), or null if it has none or it is still loading. Starts loading it, if it hasn't, and the
 * next star level's, so a unit that is upgraded has its model sooner.
 */
function request(unitId: UnitState['unitId'], star: Star): Model | null {
  const name = pickModel(unitId, star, AVAILABLE);
  if (name === null) return null;
  load(name, unitId);
  if (star < 3) {
    const next = pickModel(unitId, (star + 1) as Star, AVAILABLE);
    if (next !== null) load(next, unitId);
  }
  return models.get(name) ?? null;
}

function load(name: string, unitId: UnitState['unitId']): void {
  if (requested.has(name)) return;
  requested.add(name);
  loader ??= new GLTFLoader();
  // Relative to the page, so the built client works from any folder.
  loader
    .loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`)
    .then((gltf) => {
      const model = prepare(name, unitId, gltf.scene, gltf.animations);
      models.set(name, model);
      if (!samples.has(model.shader)) {
        samples.set(model.shader, model);
        shaders.push(model.shader);
      }
      loaded++;
    })
    .catch((error: unknown) => {
      models.set(name, null);
      console.warn(`The model ${name} didn't load, so its unit is drawn as a pawn.`, error);
    });
}

function prepare(name: string, unitId: UnitState['unitId'], scene: THREE.Object3D, animations: readonly THREE.AnimationClip[]): Model {
  const meshes = skinnedMeshes(scene);
  const skinned = meshes.length > 0;
  const clips: Partial<Record<ClipName, THREE.AnimationClip>> = {};
  for (const clip of animations) if ((CLIPS as readonly string[]).includes(clip.name)) clips[clip.name as ClipName] = clip;
  const missing = CLIPS.filter((clip) => clips[clip] === undefined);
  if (skinned && missing.length > 0) console.warn(`The model ${name} has no ${missing.join(', ')} clip, so it is drawn static.`);
  const complete = skinned && missing.length === 0 ? (clips as Record<ClipName, THREE.AnimationClip>) : null;
  scene.updateMatrixWorld(true);
  const rest = measure(scene);
  let strike = rest.top;
  let raised = rest.top;
  let reach = rest.reach;
  if (complete !== null) {
    const posed = new PosedCopy(scene, meshes);
    strike = Math.max(rest.top, posed.highest([complete.attack, complete.cast]));
    raised = Math.max(rest.top, posed.highest([complete.victory]));
    posed.dispose();
    const extra = armatureReach(scene);
    if (extra === null) console.warn(`The model ${name} has no reach in its armature's extras, so it is scaled by its reach as it stands.`);
    else reach = extra;
    boundPoses(meshes, reach, Math.max(strike, raised));
  }
  const head = scene.getObjectByName('head');
  return {
    unitId,
    scene,
    shader: skinned ? 'skinned' : 'static',
    large: isLarge(unitId),
    clips: complete,
    lengths: complete === null ? null : lengthsOf(complete),
    reach,
    top: rest.top,
    strike,
    raised,
    chest: head instanceof THREE.Bone ? CHEST_SHARE * head.getWorldPosition(new THREE.Vector3()).y : null,
  };
}

/**
 * The height of a model's chest as it stands, at scale 1: from its own `head` bone, or else its
 * unit's 1★ model's, since a gear or book model keeps the unit's build, if that has loaded with one;
 * otherwise a share of its height, as a pawn's.
 */
function chestOf(model: Model): number {
  return model.chest ?? models.get(model.unitId)?.chest ?? STATIC_CHEST_SHARE * model.top;
}

/**
 * How high a model's top is as it stands, and how far it reaches from its centre on the ground,
 * vertex by vertex. A rigged model stands as built, in its bind pose, so its vertices are where its
 * mesh puts them.
 */
function measure(scene: THREE.Object3D): { top: number; reach: number } {
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
  return { top, reach };
}

/**
 * The `reach` the rig kit writes into a rigged model's armature node (art/rig.py): the furthest from
 * its centre any frame of any clip takes it, on frames or between them. GLTFLoader puts a node's
 * extras in its userData. null if the model has none.
 */
function armatureReach(scene: THREE.Object3D): number | null {
  let reach: number | null = null;
  scene.traverse((node) => {
    const value: unknown = node.userData.reach;
    if (reach === null && typeof value === 'number' && value > 0) reach = value;
  });
  return reach;
}

/** How much room the bounds of a rigged model's meshes leave round the column its clips keep to. */
const BOUNDS_MARGIN = 1.1;

/**
 * Gives a rigged model's skinned meshes bounds that hold every pose its clips give it: a sphere round
 * the column it keeps to, `reach` from its centre and `height` tall, with a margin. A raycast, as
 * hovering a unit makes, tests a mesh against its bounds before its triangles, and Three.js would
 * otherwise work them out once, in whatever pose the mesh is first hit in, and miss a blow that
 * reaches further. Its copies are given them with the rest of the mesh.
 */
function boundPoses(meshes: readonly THREE.SkinnedMesh[], reach: number, height: number): void {
  const inverse = new THREE.Matrix4();
  for (const mesh of meshes) {
    const bounds = new THREE.Sphere(new THREE.Vector3(0, height / 2, 0), BOUNDS_MARGIN * Math.hypot(reach, height / 2));
    // Skinned as it is drawn, a mesh's vertices are in its own space, not the model's.
    mesh.boundingSphere = bounds.applyMatrix4(inverse.copy(mesh.matrixWorld).invert());
  }
}

/** The skinned meshes of a model, in the order a traversal visits them. */
function skinnedMeshes(scene: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) meshes.push(node);
  });
  return meshes;
}

/**
 * A copy of a rigged model to pose and measure as it loads, so the model itself stays as built for
 * the copies made from it.
 */
class PosedCopy {
  private readonly copy: THREE.Object3D;
  private readonly parts: SkinnedPart[];
  private readonly mixer: THREE.AnimationMixer;
  private readonly matrix = new THREE.Matrix4();

  constructor(scene: THREE.Object3D, meshes: readonly THREE.SkinnedMesh[]) {
    this.copy = cloneSkinned(scene);
    // The copy's skinned meshes share the model's geometry, and its vertices with them.
    this.parts = skinnedMeshes(this.copy).map((mesh, i) => skinnedPart(mesh, verticesOf(meshes[i]!.geometry)));
    this.mixer = new THREE.AnimationMixer(this.copy);
  }

  /**
   * The highest the model reaches in any of these clips: posed HEIGHT_STEPS times a frame, from its
   * first frame to its last.
   */
  highest(clips: readonly THREE.AnimationClip[]): number {
    let top = -Infinity;
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip).play();
      const steps = Math.round(clip.duration * TICKS_PER_SECOND * HEIGHT_STEPS);
      for (let step = 0; step <= steps; step++) {
        // With no time passing, the mixer poses the clip at the time set, its end included.
        action.time = Math.min(step / (TICKS_PER_SECOND * HEIGHT_STEPS), clip.duration);
        this.mixer.update(0);
        this.copy.updateMatrixWorld(true);
        for (const part of this.parts) top = Math.max(top, skinnedTop(part, this.matrix));
      }
      action.stop();
    }
    return top;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.copy);
  }
}

/** A skinned mesh's vertices, with up to four bones and weights each, read once. */
interface Vertices {
  readonly positions: Float32Array;
  readonly bones: Uint16Array;
  readonly weights: Float32Array;
}

function verticesOf(geometry: THREE.BufferGeometry): Vertices {
  const position = geometry.getAttribute('position');
  const index = geometry.getAttribute('skinIndex');
  const weight = geometry.getAttribute('skinWeight');
  const positions = new Float32Array(3 * position.count);
  const bones = new Uint16Array(4 * position.count);
  const weights = new Float32Array(4 * position.count);
  for (let i = 0; i < position.count; i++) {
    positions[3 * i] = position.getX(i);
    positions[3 * i + 1] = position.getY(i);
    positions[3 * i + 2] = position.getZ(i);
    for (let k = 0; k < 4; k++) {
      bones[4 * i + k] = index.getComponent(i, k);
      weights[4 * i + k] = weight.getComponent(i, k);
    }
  }
  return { positions, bones, weights };
}

/** A skinned mesh of a posed copy, with its vertices. */
interface SkinnedPart extends Vertices {
  readonly mesh: THREE.SkinnedMesh;
  /** For each bone, the row of its whole transform that gives a vertex's height. */
  readonly rows: Float64Array;
}

function skinnedPart(mesh: THREE.SkinnedMesh, vertices: Vertices): SkinnedPart {
  return { mesh, ...vertices, rows: new Float64Array(4 * mesh.skeleton.bones.length) };
}

/**
 * The height of a skinned mesh's highest vertex as its bones stand now, skinned as the GPU draws
 * it. Only heights are needed, so each vertex costs a dot product per bone it follows.
 */
function skinnedTop({ mesh, positions, bones, weights, rows }: SkinnedPart, matrix: THREE.Matrix4): number {
  const { skeleton } = mesh;
  for (let b = 0; b < skeleton.bones.length; b++) {
    matrix
      .multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse)
      .multiply(skeleton.bones[b]!.matrixWorld)
      .multiply(skeleton.boneInverses[b]!)
      .multiply(mesh.bindMatrix);
    // The second row, from Three.js's column-major elements.
    const e = matrix.elements;
    rows[4 * b] = e[1]!;
    rows[4 * b + 1] = e[5]!;
    rows[4 * b + 2] = e[9]!;
    rows[4 * b + 3] = e[13]!;
  }
  let top = -Infinity;
  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[3 * i]!;
    const y = positions[3 * i + 1]!;
    const z = positions[3 * i + 2]!;
    let height = 0;
    for (let k = 0; k < 4; k++) {
      const w = weights[4 * i + k]!;
      if (w === 0) continue;
      const r = 4 * bones[4 * i + k]!;
      height += w * (rows[r]! * x + rows[r + 1]! * y + rows[r + 2]! * z + rows[r + 3]!);
    }
    if (height > top) top = height;
  }
  return top;
}

function lengthsOf(clips: Readonly<Record<ClipName, THREE.AnimationClip>>): ClipLengths {
  const lengths = {} as Record<ClipName, number>;
  for (const name of CLIPS) lengths[name] = clips[name].duration;
  return lengths;
}

/** One unit's copy of its model, standing on its base. */
export class ModelCopy {
  /** The model on its base, which the scene adds to the unit's group. */
  readonly object = new THREE.Group();
  /**
   * The model, standing on the base and scaled for its star level, which turns to face; its clips
   * play on it.
   */
  readonly model: THREE.Object3D;
  /** The base, lined up with its tile, its pips towards the other team's half: turn it half round for team B. */
  readonly base: THREE.Object3D;
  /** Its seven clips, shared with the other copies; null for a static model. */
  readonly clips: Readonly<Record<ClipName, THREE.AnimationClip>> | null;
  readonly lengths: ClipLengths | null;
  /** How much bigger than built it is drawn, for its star level (stars.ts, starScale). */
  readonly scale: number;
  /** Where its label's bottom edge sits, above the ground (stars.ts, labelHeight). */
  readonly labelHeight: number;
  /** How much higher its label goes once `victory` has faded in (stars.ts, victoryRise). */
  readonly labelRise: number;
  /** The height of its chest as it stands on its base, which projectiles leave from and strike. */
  readonly chest: number;
  /** Every material of the copy and its base, all its own. */
  private readonly materials: readonly THREE.MeshStandardMaterial[];
  private readonly skeletons: readonly THREE.Skeleton[];
  private opacity = 1;

  constructor(model: Model, star: Star, teamColour: number) {
    this.clips = model.clips;
    this.lengths = model.lengths;
    this.scale = starScale(star, model.reach);
    this.labelHeight = labelHeight(this.scale, model.top, model.large, model.strike);
    this.labelRise = victoryRise(this.scale, model.top, model.large, model.strike, model.raised);
    this.chest = BASE.height + this.scale * chestOf(model);
    this.model = model.shader === 'skinned' ? cloneRig(model.scene) : model.scene.clone();
    this.model.scale.setScalar(this.scale);
    this.model.position.y = BASE.height;
    const materials = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    const skeletons = new Set<THREE.Skeleton>();
    const own = (material: THREE.Material) => {
      let copy = materials.get(material);
      if (copy === undefined) {
        copy = (material as THREE.MeshStandardMaterial).clone();
        if (copy.name === TEAM_MATERIAL) copy.color.setHex(teamColour);
        if (copy.name === TRIM_MATERIAL) copy.color.setHex(starColour('trim', star));
        fadeable(copy);
        materials.set(material, copy);
      }
      return copy;
    };
    this.model.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.material = Array.isArray(node.material) ? node.material.map(own) : own(node.material);
      if (node instanceof THREE.SkinnedMesh) {
        skeletons.add(node.skeleton);
        // Three.js works out its bounds once, as it stands; a clip shouldn't make it vanish at the edge of the view.
        node.frustumCulled = false;
      }
    });
    const base = createBase(star);
    this.base = base.object;
    this.object.add(this.base, this.model);
    this.materials = [...materials.values(), ...base.materials];
    this.skeletons = [...skeletons];
  }

  /** Fades every material together, the base's too, for untargetable and dying units. */
  fade(opacity: number): void {
    if (opacity === this.opacity) return;
    this.opacity = opacity;
    for (const material of this.materials) material.opacity = opacity;
  }

  /** Frees what is the copy's own: its materials and its skeleton's bone texture. */
  dispose(): void {
    for (const material of this.materials) material.dispose();
    for (const skeleton of this.skeletons) skeleton.dispose();
  }
}

/**
 * Makes a material able to fade without a new shader: drawn as transparent all along, as the pawns
 * are, which looks the same at full opacity. Three.js would draw a transparent double-sided part
 * twice a frame, setting its shader up again each time; once is enough for a see-through unit.
 */
function fadeable(material: THREE.Material): void {
  material.transparent = true;
  material.forceSinglePass = true;
}

/**
 * A copy of a rigged model, with its own bones. SkeletonUtils gives each skinned part a skeleton
 * of its own; the parts of one model share one again, so its bones are worked out and sent to the
 * GPU once a frame rather than once for each part.
 */
function cloneRig(source: THREE.Object3D): THREE.Object3D {
  const copy = cloneSkinned(source);
  const shared = new Map<THREE.Skeleton, THREE.Skeleton>();
  pair(source, copy, (from, to) => {
    if (!(from instanceof THREE.SkinnedMesh) || !(to instanceof THREE.SkinnedMesh)) return;
    const skeleton = shared.get(from.skeleton);
    if (skeleton === undefined) shared.set(from.skeleton, to.skeleton);
    else to.bind(skeleton, to.bindMatrix);
  });
  return copy;
}

/** Visits a tree and its copy together. */
function pair(a: THREE.Object3D, b: THREE.Object3D, visit: (a: THREE.Object3D, b: THREE.Object3D) => void): void {
  visit(a, b);
  for (let i = 0; i < a.children.length; i++) pair(a.children[i]!, b.children[i]!, visit);
}

const baseGeometry = {
  stand: new THREE.CylinderGeometry(BASE.radius, BASE.radius + 0.03, BASE.height, 6),
  rim: new THREE.CylinderGeometry(BASE.radius + 0.035, BASE.radius + 0.06, BASE.height * 0.8, 6, 1, true),
  pip: new THREE.OctahedronGeometry(0.075, 0),
};

/**
 * The low hexagonal stand a unit with a model stands on, lined up with its tile, with its rim and
 * pips in the star's colours. The pips are on the edge towards the other team's half as team A has
 * it, at −z, since team A's half is at +z; turned half round, the base is team B's. Returns the base
 * and the materials it owns, which fade with the unit.
 */
function createBase(star: Star): { object: THREE.Group; materials: THREE.MeshStandardMaterial[] } {
  const stone = new THREE.MeshStandardMaterial({ color: STAND_COLOUR, roughness: 0.9, flatShading: true });
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: starColour('rim', star),
    roughness: 0.5,
    metalness: 0.1,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const pipMaterial = new THREE.MeshStandardMaterial({ color: starColour('pip', star), roughness: 0.5, metalness: 0.1, flatShading: true });
  const materials = [stone, rimMaterial, pipMaterial];
  for (const material of materials) fadeable(material);
  const group = new THREE.Group();
  const stand = new THREE.Mesh(baseGeometry.stand, stone);
  stand.position.y = BASE.height / 2;
  const rim = new THREE.Mesh(baseGeometry.rim, rimMaterial);
  rim.position.y = BASE.height * 0.4;
  group.add(stand, rim);
  const edge = -BASE.radius * 0.84;
  for (const offset of pipOffsets(star)) {
    const pip = new THREE.Mesh(baseGeometry.pip, pipMaterial);
    pip.scale.set(1, 0.6, 1);
    pip.position.set(-offset, BASE.height + 0.02, edge);
    group.add(pip);
  }
  return { object: group, materials };
}
