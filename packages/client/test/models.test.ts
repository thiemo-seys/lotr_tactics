import { existsSync, readFileSync } from 'node:fs';
import { ABILITIES, ATTACKS, CLASS_TEMPLATE, TEMPLATES, TICKS_PER_SECOND, UNITS, toTicks, type UnitId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { SHOT_DELAY_TICKS } from '../src/playback.js';

// The committed model files in public/models (docs/viewer-spec.md section 4, Models and Rigs and clips; section 7).
// CI has no Blender to rebuild them, so this reads the .glb files themselves, without a glTF library.

const UNIT_IDS = Object.keys(UNITS) as UnitId[];

/** A unit's gear model, its model at 2★ (section 4, Star levels). */
function gearModel(id: UnitId): string {
  return `${id}-2`;
}

/** The bones every rigged model has, named for the model's own left and right (section 4, Bones). */
const BONES = [
  'root',
  'hips',
  'spine',
  'head',
  'upper_arm_l',
  'forearm_l',
  'hand_l',
  'upper_arm_r',
  'forearm_r',
  'hand_r',
  'thigh_l',
  'shin_l',
  'foot_l',
  'thigh_r',
  'shin_r',
  'foot_r',
];

/**
 * A model's own bones are in lower case with digits and underscores, named after what they move, such as `cape`,
 * `beard`, `tail`, `robe_2` or `mount_neck` (section 4, Bones): words of letters and digits joined by single
 * underscores, the first word starting with a letter.
 */
const BONE_NAME = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/** Each clip's length in seconds, and whether it loops (section 4, the table of clips; the lengths are placeholders). */
const CLIPS = {
  idle: { min: 1.5, max: 3, loops: true },
  move: { min: 0.4, max: 1, loops: true },
  attack: { min: 0.4, max: 0.9, loops: false },
  cast: { min: 0.55, max: 1, loops: false },
  stun: { min: 0.5, max: 1.5, loops: true },
  death: { min: 0.3, max: 0.5, loops: false },
  victory: { min: 0.5, max: 1, loops: false },
} as const;
type Clip = keyof typeof CLIPS;

/** Riders ride (section 4, Riders), and Large units are built at their full size (section 4, Large units). */
function isRider(id: UnitId): boolean {
  return UNITS[id].classes.includes('rider');
}

function isLargeUnit(id: UnitId): boolean {
  return UNITS[id].large === true;
}

/** At most 24 bones on foot, 32 for a Large unit and 40 for a mounted one (section 4, Bones). */
function boneBudget(id: UnitId): number {
  if (isRider(id)) return 40;
  if (isLargeUnit(id)) return 32;
  return 24;
}

/** Section 4, Limits: a rigged unit's .glb stays under 200,000 bytes, or 300,000 for a Rider or a Large unit. */
function maxBytes(id: UnitId): number {
  return isRider(id) || isLargeUnit(id) ? 300_000 : 200_000;
}

/** A gear model's triangle budget is 12.5% above its unit's, and so is its size limit: 225,000 bytes, or 337,500 (art/rig.py, GEAR_BYTES). */
function gearMaxBytes(id: UnitId): number {
  return (maxBytes(id) * 9) / 8;
}

// What this reads of glTF 2.0.

interface GltfNode {
  readonly name?: string;
  readonly extras?: { readonly reach?: unknown; readonly strike?: unknown; readonly hits?: unknown };
  readonly children?: readonly number[];
  readonly mesh?: number;
  readonly skin?: number;
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
  readonly matrix?: readonly number[];
}

interface GltfPrimitive {
  readonly attributes: Readonly<Record<string, number>>;
  readonly material?: number;
}

interface GltfAnimation {
  readonly name?: string;
  readonly channels: readonly { readonly sampler: number; readonly target: { readonly node?: number; readonly path: string } }[];
  readonly samplers: readonly { readonly input: number; readonly output: number; readonly interpolation?: string }[];
}

interface GltfAccessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly normalized?: boolean;
  readonly count: number;
  readonly type: string;
  readonly sparse?: unknown;
}

interface Gltf {
  readonly nodes?: readonly GltfNode[];
  readonly meshes?: readonly { readonly primitives: readonly GltfPrimitive[] }[];
  readonly materials?: readonly { readonly name?: string }[];
  readonly skins?: readonly { readonly joints: readonly number[] }[];
  readonly animations?: readonly GltfAnimation[];
  readonly accessors?: readonly GltfAccessor[];
  readonly bufferViews?: readonly { readonly buffer: number; readonly byteOffset?: number; readonly byteStride?: number }[];
}

interface Glb {
  /** The model's name: a unit's id, or `<id>-2` for its gear model. */
  readonly id: string;
  readonly bytes: number;
  readonly json: Gltf;
  readonly bin: DataView | null;
}

const MODELS = new URL('../public/models/', import.meta.url);

function modelFile(id: string): URL {
  return new URL(`${id}.glb`, MODELS);
}

const read = new Map<string, Glb>();

/** A model's .glb: a 12-byte header (magic "glTF", version 2, length), then a JSON chunk and a binary chunk. */
function glb(id: string): Glb {
  const cached = read.get(id);
  if (cached) return cached;
  const file = readFileSync(modelFile(id));
  const data = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (data.getUint32(0, true) !== 0x46546c67) throw new Error(`${id}.glb isn't glTF binary.`);
  if (data.getUint32(4, true) !== 2) throw new Error(`${id}.glb isn't glTF 2.`);
  if (data.getUint32(8, true) !== file.byteLength) throw new Error(`${id}.glb's header gives the wrong length.`);
  let json: Gltf | null = null;
  let bin: DataView | null = null;
  for (let at = 12; at + 8 <= file.byteLength; ) {
    const length = data.getUint32(at, true);
    const type = data.getUint32(at + 4, true);
    const start = at + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(file.subarray(start, start + length))) as Gltf;
    if (type === 0x004e4942) bin = new DataView(file.buffer, file.byteOffset + start, length);
    at = start + length;
  }
  if (json === null) throw new Error(`${id}.glb has no JSON chunk.`);
  const model = { id, bytes: file.byteLength, json, bin };
  read.set(id, model);
  return model;
}

/** Whether a model has a rig. A missing or broken file fails its own test below, not every test in this file. */
function isRigged(id: string): boolean {
  try {
    return (glb(id).json.skins?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

const COMPONENT_BYTES: Readonly<Record<number, number>> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function component(bin: DataView, at: number, type: number, normalized: boolean): number {
  switch (type) {
    case 5126:
      return bin.getFloat32(at, true);
    case 5125:
      return bin.getUint32(at, true);
    case 5123:
      return normalized ? bin.getUint16(at, true) / 65535 : bin.getUint16(at, true);
    case 5121:
      return normalized ? bin.getUint8(at) / 255 : bin.getUint8(at);
    case 5122:
      return normalized ? Math.max(bin.getInt16(at, true) / 32767, -1) : bin.getInt16(at, true);
    case 5120:
      return normalized ? Math.max(bin.getInt8(at) / 127, -1) : bin.getInt8(at);
    default:
      throw new Error(`Unknown component type ${type}.`);
  }
}

/** An accessor's values from the binary chunk, one row per element. */
function values(model: Glb, index: number): number[][] {
  const accessor = model.json.accessors?.[index];
  if (!accessor || accessor.bufferView === undefined || accessor.sparse !== undefined) throw new Error(`${model.id}: can't read accessor ${index}.`);
  const view = model.json.bufferViews?.[accessor.bufferView];
  if (!view || view.buffer !== 0 || !model.bin) throw new Error(`${model.id}: accessor ${index} isn't in the binary chunk.`);
  const size = COMPONENTS[accessor.type]!;
  const bytes = COMPONENT_BYTES[accessor.componentType]!;
  const stride = view.byteStride ?? size * bytes;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const rows: number[][] = [];
  for (let i = 0; i < accessor.count; i++) {
    const row: number[] = [];
    for (let c = 0; c < size; c++) row.push(component(model.bin, start + i * stride + c * bytes, accessor.componentType, accessor.normalized ?? false));
    rows.push(row);
  }
  return rows;
}

function skinOf(model: Glb): { readonly joints: readonly number[] } {
  const skin = model.json.skins?.[0];
  if (!skin) throw new Error(`${model.id} has no rig.`);
  return skin;
}

function nameOf(model: Glb, node: number): string {
  return model.json.nodes?.[node]?.name ?? `node ${node}`;
}

function boneNames(model: Glb): string[] {
  return skinOf(model).joints.map((joint) => nameOf(model, joint));
}

function parentsOf(model: Glb): Map<number, number> {
  const parents = new Map<number, number>();
  (model.json.nodes ?? []).forEach((node, index) => {
    for (const child of node.children ?? []) parents.set(child, index);
  });
  return parents;
}

/** Where a node's origin is in the scene, from its own transform and its parents'. */
function scenePosition(model: Glb, node: number): number[] {
  const parents = parentsOf(model);
  let point = [0, 0, 0];
  for (let at: number | undefined = node; at !== undefined; at = parents.get(at)) {
    point = transform(model.json.nodes?.[at] ?? {}, point);
  }
  return point;
}

/** A point through a node's matrix, or its scale, rotation (a unit quaternion) and translation. */
function transform(node: GltfNode, [x, y, z]: number[]): number[] {
  if (node.matrix) {
    const m = node.matrix;
    return [0, 1, 2].map((r) => m[r]! * x! + m[4 + r]! * y! + m[8 + r]! * z! + m[12 + r]!);
  }
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const v = [x! * sx!, y! * sy!, z! * sz!];
  // v + 2w(q × v) + 2 q × (q × v)
  const c = cross([qx!, qy!, qz!], v);
  const cc = cross([qx!, qy!, qz!], c);
  return [v[0]! + 2 * qw! * c[0]! + 2 * cc[0]! + tx!, v[1]! + 2 * qw! * c[1]! + 2 * cc[1]! + ty!, v[2]! + 2 * qw! * c[2]! + 2 * cc[2]! + tz!];
}

function cross(a: number[], b: number[]): number[] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}

/** A clip's keyframe times, over all its channels. */
function keyTimes(model: Glb, animation: GltfAnimation): number[] {
  return animation.samplers.flatMap((sampler) => values(model, sampler.input).map((row) => row[0]!));
}

/** The armature, the node above the root bone, whose extras the rig kit writes (art/rig.py). */
function armatureOf(model: Glb): GltfNode {
  const root = skinOf(model).joints[boneNames(model).indexOf('root')];
  const armature = root === undefined ? undefined : parentsOf(model).get(root);
  const node = armature === undefined ? undefined : model.json.nodes?.[armature];
  if (!node) throw new Error(`${model.id} has no armature above root.`);
  return node;
}

/**
 * When a unit's attack strikes and its cast is at its height, in ticks, each a frame of its clip (section 4, Rigs and
 * clips): a melee blow lands 7 ticks after the attack (the sim's hitTick) and a ranged attack's shot leaves when the
 * viewer looses it; an ability's hits are struck or loosed at its release, its wind-up after the cast, and every 3
 * ticks after for several hits (sim-spec section 10.6). A unit uses the template of its first class.
 */
function timingOf(id: UnitId): { strike: number; hits: number[] } {
  const unit = UNITS[id];
  const melee = TEMPLATES[CLASS_TEMPLATE[unit.classes[0]!]].range === 1;
  const release = toTicks(unit.ability.windupSeconds);
  const counts = [...JSON.stringify(unit.ability.steps).matchAll(/"hits":(\d+)/g)].map((match) => Number(match[1]));
  const hits = Math.max(1, ...counts);
  const gap = toTicks(ABILITIES.multiHitSeconds);
  return {
    strike: melee ? toTicks(ATTACKS.meleeHitSeconds) : SHOT_DELAY_TICKS,
    hits: Array.from({ length: hits }, (_, k) => release + k * gap),
  };
}

/** A model's clip by name. */
function clipOf(model: Glb, name: Clip): GltfAnimation {
  const animation = model.json.animations?.find((a) => a.name === name);
  if (!animation) throw new Error(`${model.id} has no ${name} clip.`);
  return animation;
}

const CLIP_NAMES = Object.keys(CLIPS) as Clip[];

describe('unit models', () => {
  it.each(UNIT_IDS)('%s has a .glb of one mesh with a team material on it', (id) => {
    expect(existsSync(modelFile(id)), `public/models/${id}.glb`).toBe(true);
    const { json } = glb(id);
    expect(json.meshes ?? []).toHaveLength(1);
    // Section 4, Livery: a material named `team`, on parts of the model, that the viewer gives the livery colour.
    const team = (json.materials ?? []).findIndex((material) => material.name === 'team');
    expect(team, 'a material named team').toBeGreaterThanOrEqual(0);
    expect(json.meshes?.[0]?.primitives.some((primitive) => primitive.material === team), 'the team material on part of the mesh').toBe(true);
  });

  // Workflow 2 of docs/animation-plan.md rigged them all, so a model that lost its rig is a regression.
  it.each(UNIT_IDS)('%s is rigged', (id) => {
    expect(isRigged(id), `${id} has a rig`).toBe(true);
  });
});

/**
 * The checks of a rigged model, `name`, which is unit `id`'s model or its gear model, the .glb staying under `limit`
 * bytes: called inside a describe block.
 */
function checkRigged(name: string, id: UnitId, limit: number, what: string): void {
  it('is one skinned mesh on one armature', () => {
    const { json } = glb(name);
    expect(json.skins ?? [], 'one skin').toHaveLength(1);
    const meshes = (json.nodes ?? []).filter((node) => node.mesh !== undefined);
    expect(meshes).toHaveLength(1);
    expect(meshes[0]?.skin, 'the mesh is skinned').toBe(0);
  });

  it('has the 16 bones, any of its own named in lower case with digits and underscores, within its budget', () => {
    const names = boneNames(glb(name));
    for (const bone of BONES) expect(names).toContain(bone);
    expect(new Set(names).size, 'no two bones with one name').toBe(names.length);
    for (const name of names) expect(name).toMatch(BONE_NAME);
    expect(names.length).toBeLessThanOrEqual(boneBudget(id));
  });

  it.skipIf(!isRider(id))('hangs a rider’s hips from its mount, whose bones are named mount_…', () => {
    const model = glb(name);
    const hips = skinOf(model).joints[boneNames(model).indexOf('hips')];
    if (hips === undefined) throw new Error(`${name} has no hips bone.`);
    const parents = parentsOf(model);
    const above: string[] = [];
    for (let at = parents.get(hips); at !== undefined; at = parents.get(at)) above.push(nameOf(model, at));
    expect(above.some((name) => name.startsWith('mount_')), `the bones above the hips: ${above.join(', ')}`).toBe(true);
  });

  // Section 4, Models: a rigged model's meshes are bounded by how far its clips reach, which the rig kit
  // works out and writes on the armature, the node above root.
  it('carries its reach in its armature’s extras', () => {
    const reach = armatureOf(glb(name)).extras?.reach;
    expect(typeof reach, 'a number').toBe('number');
    expect(reach as number).toBeGreaterThan(0);
  });

  // Section 4, Rigs and clips: the attack's blow lands 7 ticks in, or its shot leaves 3 ticks in, and the cast is at
  // its height at the end of its wind-up and strikes or looses again every 3 ticks for several hits. The rig kit
  // writes the frames it keys them on into the armature's extras.
  it('strikes and casts on the ticks the sim and the viewer have them, and plays on past them', () => {
    const model = glb(name);
    const { extras } = armatureOf(model);
    const { strike, hits } = timingOf(id);
    expect(extras?.strike, 'the frame its attack strikes on').toBe(strike);
    expect(extras?.hits, 'the frames its cast strikes or looses on').toEqual(hits);
    const length = (clip: Clip) => Math.max(...keyTimes(model, clipOf(model, clip))) * TICKS_PER_SECOND;
    expect(length('attack'), 'the attack recovers after its strike').toBeGreaterThan(strike + 3);
    expect(length('cast'), 'the cast follows through after its last hit').toBeGreaterThan(hits[hits.length - 1]! + 3);
  });

  it('has root on the ground at the origin, and every other bone below it', () => {
    const model = glb(name);
    const { joints } = skinOf(model);
    const root = joints[boneNames(model).indexOf('root')];
    if (root === undefined) throw new Error(`${name} has no root bone.`);
    const parents = parentsOf(model);
    for (const joint of joints) {
      if (joint === root) continue;
      let at = parents.get(joint);
      while (at !== undefined && at !== root) at = parents.get(at);
      expect(at, `${nameOf(model, joint)} hangs from root`).toBe(root);
    }
    for (const coordinate of scenePosition(model, root)) expect(Math.abs(coordinate)).toBeLessThan(1e-4);
  });

  it('has exactly the seven clips, each turning its bones, with lengths in range', () => {
    const model = glb(name);
    const animations = model.json.animations ?? [];
    expect(animations.map((animation) => animation.name).sort()).toEqual(Object.keys(CLIPS).sort());
    const bones = new Set(skinOf(model).joints);
    for (const animation of animations) {
      const { min, max } = CLIPS[animation.name as Clip];
      // A clip's length is its last keyframe's time. Keyframe times are 32-bit floats, hence the 0.1 ms slack.
      const length = Math.max(...keyTimes(model, animation));
      expect(length, `${animation.name}'s length`).toBeGreaterThanOrEqual(min - 1e-4);
      expect(length, `${animation.name}'s length`).toBeLessThanOrEqual(max + 1e-4);
      for (const { target } of animation.channels) {
        expect(target.node !== undefined && bones.has(target.node), `${animation.name} moves ${nameOf(model, target.node ?? -1)}, a bone`).toBe(true);
        expect(['rotation', 'translation', 'scale']).toContain(target.path);
      }
    }
  });

  it('keys its clips at 30 frames a second, one frame per tick, each starting at frame 0', () => {
    const model = glb(name);
    for (const clip of CLIP_NAMES) {
      const times = keyTimes(model, clipOf(model, clip));
      // Its first keyframe is at 0, neither before nor after: 32-bit float times, hence the 0.1 ms slack.
      expect(Math.abs(Math.min(...times)), `${clip} starts at frame 0`).toBeLessThan(1e-4);
      const between = times.filter((time) => Math.abs(time * 30 - Math.round(time * 30)) > 1e-3);
      expect(between, `${clip}'s keyframes between frames`).toEqual([]);
    }
  });

  it('ends each looping clip where it starts', () => {
    const model = glb(name);
    for (const clip of CLIP_NAMES.filter((each) => CLIPS[each].loops)) {
      const animation = clipOf(model, clip);
      for (const { sampler: index, target } of animation.channels) {
        const sampler = animation.samplers[index]!;
        const keys = values(model, sampler.input).length;
        const outputs = values(model, sampler.output);
        // A cubic spline keeps an in-tangent, the value and an out-tangent for each keyframe.
        const value = (key: number) => outputs[sampler.interpolation === 'CUBICSPLINE' ? 3 * key + 1 : key]!;
        const [first, last] = [value(0), value(keys - 1)];
        const what = `${animation.name}: ${nameOf(model, target.node ?? -1)}'s ${target.path} ends where it starts`;
        if (target.path === 'rotation') {
          // Unit quaternions, where q and −q turn alike: 1 − |q · q′| under 1e-6 is within about 0.2°.
          expect(1 - Math.abs(first.reduce((sum, v, i) => sum + v * last[i]!, 0)), what).toBeLessThan(1e-6);
        } else {
          // Within 0.1 mm, or a scale within 0.01%.
          expect(Math.max(...first.map((v, i) => Math.abs(v - last[i]!))), what).toBeLessThan(1e-4);
        }
      }
    }
  });

  it('puts every vertex on exactly one bone, with weight 1', () => {
    const model = glb(name);
    const bones = skinOf(model).joints.length;
    for (const primitive of model.json.meshes?.[0]?.primitives ?? []) {
      const sets = Object.keys(primitive.attributes).filter((name) => name.startsWith('WEIGHTS_'));
      expect(sets, 'weights').toContain('WEIGHTS_0');
      expect(Object.keys(primitive.attributes), 'joints').toContain('JOINTS_0');
      const weights = sets.map((set) => values(model, primitive.attributes[set]!));
      const joints = sets.map((set) => values(model, primitive.attributes[set.replace('WEIGHTS_', 'JOINTS_')]!));
      const vertices = model.json.accessors?.[primitive.attributes.POSITION!]?.count ?? 0;
      const wrong: string[] = [];
      for (let v = 0; v < vertices; v++) {
        // Every bone the vertex follows, as [joint, weight], over all its sets of four.
        const on: [number, number][] = [];
        for (let s = 0; s < sets.length; s++) {
          const row = weights[s]![v]!;
          for (let c = 0; c < row.length; c++) if (row[c] !== 0) on.push([joints[s]![v]![c]!, row[c]!]);
        }
        const one = on.length === 1 && Math.abs(on[0]![1] - 1) < 1e-6 && on[0]![0] < bones;
        if (!one) wrong.push(`vertex ${v}: ${JSON.stringify(on)}`);
      }
      expect(wrong.slice(0, 5), `${wrong.length} vertices not on exactly one bone with weight 1`).toEqual([]);
    }
  });

  it(`stays under ${limit.toLocaleString('en')} bytes, as ${what}`, () => {
    expect(glb(name).bytes).toBeLessThan(limit);
  });
}

function kindOf(id: UnitId): string {
  return isRider(id) ? 'Rider' : isLargeUnit(id) ? 'Large unit' : 'unit on foot';
}

/** Every unit's model is rigged, and each is checked in full. */
describe.each(UNIT_IDS)('%s, rigged', (id) => {
  checkRigged(id, id, maxBytes(id), `a ${kindOf(id)}`);
});

describe('gear models', () => {
  // Each 2★ gear model is its 1★ model with the gear on, finished with the 1★ model's rig (art/README.md, Gear models).
  it.each(UNIT_IDS)('%s’s is rigged', (id) => {
    expect(isRigged(gearModel(id)), `${gearModel(id)} has a rig`).toBe(true);
  });
});

/** Every gear model is rigged, and each is checked in full. */
describe.each(UNIT_IDS)('%s’s gear model, rigged', (id) => {
  const name = gearModel(id);
  checkRigged(name, id, gearMaxBytes(id), `the gear model of a ${kindOf(id)}`);

  // It is its unit's model with its gear on, finished with that model's rig (art/README.md, Gear models).
  it('has its unit model’s bones, each hanging from the same one, and its clips, each as long', () => {
    const tree = (model: Glb) => {
      const parents = parentsOf(model);
      return Object.fromEntries(skinOf(model).joints.map((joint) => [nameOf(model, joint), nameOf(model, parents.get(joint) ?? -1)]));
    };
    const [one, two] = [glb(id), glb(name)];
    expect(tree(two)).toEqual(tree(one));
    for (const clip of CLIP_NAMES) {
      const length = (model: Glb) => Math.max(...keyTimes(model, clipOf(model, clip)));
      expect(length(two), `${clip}'s length`).toBeCloseTo(length(one), 4);
    }
  });
});

describe('the size limit', () => {
  it('is 300,000 bytes for Riders and Large units, and 200,000 for the rest (section 4, Limits)', () => {
    // Riders ride (section 4, Riders): Éomer, Théoden, Gamling, Khamûl and the Witch-king on horses, and Sharku on a
    // warg (docs/animation-plan.md, Workflow 2). Large: Treebeard and Sauron (section 4, Large units). Éowyn, Háma and
    // the Ringwraith are on foot.
    for (const id of ['eomer', 'theoden', 'gamling', 'khamul', 'witch-king', 'sharku', 'treebeard', 'sauron'] as const) {
      expect(maxBytes(id), id).toBe(300_000);
    }
    for (const id of ['gimli', 'frodo', 'eowyn', 'hama', 'ringwraith', 'gandalf'] as const) expect(maxBytes(id), id).toBe(200_000);
  });

  it('is 337,500 bytes for the gear models of Riders and Large units, and 225,000 for the rest (art/rig.py, GEAR_BYTES)', () => {
    for (const id of ['eomer', 'sharku', 'treebeard', 'sauron'] as const) expect(gearMaxBytes(id), id).toBe(337_500);
    for (const id of ['gimli', 'eowyn', 'ringwraith'] as const) expect(gearMaxBytes(id), id).toBe(225_000);
  });
});
