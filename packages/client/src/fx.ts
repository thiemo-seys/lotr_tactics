// Draws the effects effects.ts says are live (docs/viewer-spec.md section 5, Effects): the punchy
// style, ported from the study in art/effects-study/ (fx.ts there). Each kind of piece is one
// instanced mesh made once, with its material, so a frame draws a few meshes whatever is on screen,
// the first effect of a kind compiles no new shader (the scene compiles them all as it starts, with
// the two point lights the effects light the ground with already in it), and a frame allocates
// nothing: each frame fills the instances afresh from the effects' lists.

import { TICKS_PER_SECOND, type Team } from '@lotr-tactics/sim';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  easeIn,
  easeOut,
  hash,
  kick,
  smooth,
  type Effects,
  type MarkState,
  type MissileState,
  type StunState,
} from './effects.js';
import { BOARD_EXTENT } from './layout.js';
import { EFFECTS } from './look.js';
import type { MutablePoint, Playback } from './playback.js';

const T = TICKS_PER_SECOND;

/** What the effects need to know of the units the scene draws, by their id in the fight. */
export interface FxUnits {
  /** How many units the fight has had so far. */
  count(): number;
  /** The height of its chest, which projectiles leave from and strike, and sparks burst at. */
  chest(unit: number): number;
  /** The way it faces, as an angle about the vertical. */
  facing(unit: number): number;
  /** Its livery colour, for its shards. */
  livery(unit: number): number;
  /** Its team. */
  team(unit: number): Team;
  /** How long after its death it starts to break up, in seconds (animation.ts, sinkDelay). */
  breakDelay(unit: number): number;
  /** Whether it has a shield now, from `combat.state`, so a shield used up is gone. */
  shielded(unit: number): boolean;
  /** How far its shell ripples now (effects.ts, hitInto). */
  ripple(unit: number): number;
}

/**
 * One kind of piece: an instanced mesh whose instances are filled afresh each frame. With `alpha`,
 * each instance has its own opacity too, for pieces painted over the ground rather than added to it,
 * such as the side-coloured edges, which light added to pale stone would wash out.
 */
class Layer {
  readonly mesh: THREE.InstancedMesh;
  private readonly alpha: THREE.InstancedBufferAttribute | null;
  private count = 0;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    readonly capacity: number,
    renderOrder = 0,
    alpha = false,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    // Its instance colours exist from the start, so its shader is the one compiled for it.
    this.mesh.setColorAt(0, WHITE);
    this.mesh.count = 0;
    this.mesh.visible = false;
    if (alpha) {
      this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
      geometry.setAttribute('instanceAlpha', this.alpha);
      withInstanceAlpha(material);
    } else {
      this.alpha = null;
    }
  }

  begin(): void {
    this.count = 0;
  }

  /** Adds an instance, if there is room: drawn with `matrix`, in `colour`, and for a layer with alpha at `opacity`. */
  put(matrix: THREE.Matrix4, colour: THREE.Color, opacity = 1): void {
    if (this.count >= this.capacity) return;
    this.mesh.setMatrixAt(this.count, matrix);
    this.mesh.setColorAt(this.count, colour);
    this.alpha?.setX(this.count, opacity);
    this.count++;
  }

  end(): void {
    const { mesh, count, alpha } = this;
    mesh.count = count;
    mesh.visible = count > 0;
    if (count === 0) return;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.clearUpdateRanges();
    mesh.instanceColor!.addUpdateRange(0, count * 3);
    mesh.instanceColor!.needsUpdate = true;
    if (alpha !== null) {
      alpha.clearUpdateRanges();
      alpha.addUpdateRange(0, count);
      alpha.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

const WHITE = new THREE.Color(0xffffff);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Gives a basic material an opacity per instance, from the geometry's `instanceAlpha`: a small change
 * to its shader, with a cache key of its own, compiled once as the scene starts like the rest.
 */
function withInstanceAlpha(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vInstanceAlpha;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= vInstanceAlpha;\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'instance-alpha';
}

/**
 * Fades a material out across the board's edge, over EFFECTS.shockwave.edgeFade, so a ring round an
 * area near a corner stops at the board rather than running over the arena. Its instances are placed
 * in the board's own frame (the group's), which is what the fade reads.
 */
function withBoardFade(material: THREE.Material): void {
  const f = (n: number): string => n.toFixed(4);
  const fade = EFFECTS.shockwave.edgeFade / 2;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBoard;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvec4 boardPosition = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nboardPosition = instanceMatrix * boardPosition;\n#endif\nvBoard = boardPosition.xz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBoard;')
      .replace(
        '#include <opaque_fragment>',
        `vec2 pastBoard = abs(vBoard) - vec2(${f(BOARD_EXTENT.x)}, ${f(BOARD_EXTENT.z)});\ndiffuseColor.a *= 1.0 - smoothstep(${f(-fade)}, ${f(fade)}, max(pastBoard.x, pastBoard.y));\n#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'board-fade';
}

/** Painted over what is behind, faded by instance: unlit, not writing depth. */
function paint(options: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, ...options });
}

/** Light on: additive, unlit, not writing depth, as glows and flashes are. */
function light(options: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...options });
}

/** Darkening the ground by a colour: white leaves it as it is (premultiplied, so three.js allows MultiplyBlending). */
function shade(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false });
}

/** Faceted and lit like the models, coloured by instance. */
function faceted(options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.75, metalness: 0, ...options });
}

/** A geometry lying on the ground, from one drawn in the xy plane. */
function flatOn(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  return geometry.rotateX(-Math.PI / 2);
}

/** A soft round spot, for glows, built in code so it needs no image or canvas. */
function glowTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      // As the study's gradient: bright at the heart, a soft falloff, nothing at the edge.
      const a = r >= 1 ? 0 : r < 0.25 ? 1 - r : r < 0.6 ? 0.75 - ((r - 0.25) / 0.35) * 0.57 : 0.18 * (1 - (r - 0.6) / 0.4);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** An arrow along +z, its tip at the origin's front: shaft, a metal head and fletching, in vertex colours. */
function arrowGeometry(): THREE.BufferGeometry {
  const part = (geometry: THREE.BufferGeometry, colour: number): THREE.BufferGeometry => {
    const g = geometry.toNonIndexed();
    const c = new THREE.Color(colour);
    const colours = new Float32Array(g.attributes.position!.count * 3);
    for (let i = 0; i < colours.length; i += 3) c.toArray(colours, i);
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    return g;
  };
  const shaft = new THREE.CylinderGeometry(0.022, 0.022, 0.7, 4).rotateX(Math.PI / 2);
  const head = new THREE.ConeGeometry(0.06, 0.16, 4).rotateX(Math.PI / 2).translate(0, 0, 0.42);
  const fletch = new THREE.BoxGeometry(0.12, 0.006, 0.16).translate(0, 0, -0.3);
  const fletch2 = new THREE.BoxGeometry(0.006, 0.12, 0.16).translate(0, 0, -0.3);
  const merged = mergeGeometries([part(shaft, 0x6b4a2e), part(head, 0xffe08a), part(fletch, 0xe8e0d0), part(fletch2, 0xe8e0d0)])!;
  merged.computeVertexNormals();
  return merged;
}

/** A five-pointed star, centred, for stunned units. */
function starGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.45;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false }).translate(0, 0, -0.175);
}

/** A shield's faceted shell's edges, as thin prisms, so they read thicker than a line and can be instanced. */
function shellEdgeGeometry(): THREE.BufferGeometry {
  const edges = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1, 1));
  const position = edges.attributes.position!;
  const parts: THREE.BufferGeometry[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  for (let i = 0; i < position.count; i += 2) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    const length = a.distanceTo(b);
    const prism = new THREE.CylinderGeometry(0.018, 0.018, length, 3, 1, true);
    q.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    prism.applyMatrix4(m);
    prism.deleteAttribute('uv');
    parts.push(prism);
  }
  return mergeGeometries(parts)!;
}

/** How many pieces of each kind can be on screen at once; more are left out. */
const CAPACITY = {
  glows: 320,
  sparks: 900,
  marks: 160,
  edges: 200,
  rings: 40,
  scorches: 8,
  lines: 64,
  streaks: 64,
  arrows: 64,
  orbs: 32,
  stones: 24,
  stars: 72,
  shells: 24,
  shards: 480,
  dust: 160,
  ribbons: 64,
} as const;

/** How many glowing copies trail a fireball or bolt, and how far apart they are in ticks. */
const TRAIL = { fireball: 16, bolt: 8, stone: 5 } as const;
const TRAIL_GAP = 0.55;

/** How many segments a charge's ribbon is drawn in. */
const RIBBON_SEGMENTS = 14;

/** The ground, for marks and rings: just above the tiles' tops, in the order they stack. */
const GROUND = { scorch: 0.022, mark: 0.03, ring: 0.045, status: 0.04 } as const;

export class FxView {
  /** Everything the effects draw, turned with the fight's layer (scene.ts). */
  readonly group = new THREE.Group();
  /** Two point lights, in the scene from the start: a caster's gathering glow, and an impact's flare. */
  readonly lights = [new THREE.PointLight(0xffffff, 0, 7, 1.6), new THREE.PointLight(0xffffff, 0, 9, 1.6)] as const;
  private readonly glows: Layer;
  private readonly sparks: Layer;
  private readonly marks: Layer;
  private readonly edges: Layer;
  private readonly rings: Layer;
  private readonly scorches: Layer;
  private readonly lines: Layer;
  private readonly sideLines: Layer;
  private readonly streakEdges: Layer;
  private readonly streaks: Layer;
  private readonly arrows: Layer;
  private readonly orbs: Layer;
  private readonly stones: Layer;
  private readonly stars: Layer;
  private readonly shellFills: Layer;
  private readonly shellEdges: Layer;
  private readonly shards: Layer;
  private readonly dust: Layer;
  private readonly ribbons: Layer;
  private readonly layers: Layer[];

  // Scratch, so a frame allocates nothing.
  private readonly matrix = new THREE.Matrix4();
  private readonly look = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly billboard = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly p2 = new THREE.Vector3();
  private readonly p3 = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private readonly tint = new THREE.Color();
  private readonly hsl = { h: 0, s: 0, l: 0 };
  private readonly at: MutablePoint = { x: 0, z: 0 };
  private readonly mark: MarkState = { fill: 0, edge: 0 };
  private readonly flight: MissileState = { fromX: 0, fromZ: 0, toX: 0, toZ: 0, share: 0 };
  private readonly stun: StunState = { age: 0, left: 0 };
  /** The side drawn as the near one, whose edges are blue (EFFECTS.sides). */
  side: Team = 'A';
  private drawn = false;

  constructor() {
    const glowMap = glowTexture();
    const disc = new THREE.PlaneGeometry(1, 1);
    this.glows = new Layer(disc, light({ map: glowMap }), CAPACITY.glows, 5);
    this.sparks = new Layer(new THREE.IcosahedronGeometry(1, 0), light(), CAPACITY.sparks, 4);
    this.marks = new Layer(flatOn(new THREE.CircleGeometry(0.84, 6, Math.PI / 2)), light(), CAPACITY.marks, 1);
    // Edges in the sides' colours and rings under units are painted, so they read on pale stone.
    this.edges = new Layer(flatOn(new THREE.RingGeometry(0.76, 0.88, 6, 1, Math.PI / 2)), paint(), CAPACITY.edges, 1, true);
    const ringMaterial = light({ side: THREE.DoubleSide });
    withBoardFade(ringMaterial);
    this.rings = new Layer(flatOn(new THREE.RingGeometry(1 - EFFECTS.shockwave.width, 1, 64)), ringMaterial, CAPACITY.rings, 2);
    this.scorches = new Layer(flatOn(new THREE.CircleGeometry(1, 9)), shade(), CAPACITY.scorches, 1);
    this.lines = new Layer(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), light(), CAPACITY.lines, 3);
    this.sideLines = new Layer(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), paint(), CAPACITY.lines, 3, true);
    // A streak's painted edge, then its bright core over it.
    this.streakEdges = new Layer(new THREE.CylinderGeometry(1, 0.15, 1, 6, 1, true), paint(), CAPACITY.streaks, 3, true);
    this.streaks = new Layer(new THREE.CylinderGeometry(1, 0.15, 1, 6, 1, true), light(), CAPACITY.streaks, 4);
    this.arrows = new Layer(arrowGeometry(), faceted({ vertexColors: true, emissive: 0x3a2400 }), CAPACITY.arrows);
    this.orbs = new Layer(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), CAPACITY.orbs);
    this.stones = new Layer(new THREE.DodecahedronGeometry(1, 0), faceted(), CAPACITY.stones);
    this.stars = new Layer(starGeometry(), faceted({ color: EFFECTS.stun.colour, emissive: EFFECTS.stun.colour, emissiveIntensity: 0.9 }), CAPACITY.stars);
    this.shellFills = new Layer(new THREE.IcosahedronGeometry(1, 1), light({ side: THREE.DoubleSide }), CAPACITY.shells, 6);
    this.shellEdges = new Layer(shellEdgeGeometry(), light(), CAPACITY.shells, 6);
    this.shards = new Layer(new THREE.TetrahedronGeometry(1, 0), faceted(), CAPACITY.shards);
    this.dust = new Layer(new THREE.IcosahedronGeometry(1, 0), faceted({ transparent: true, opacity: 0.35, depthWrite: false }), CAPACITY.dust, 2);
    this.ribbons = new Layer(flatOn(new THREE.PlaneGeometry(1, 1)), light({ side: THREE.DoubleSide }), CAPACITY.ribbons, 3);
    this.layers = [
      this.glows,
      this.sparks,
      this.marks,
      this.edges,
      this.rings,
      this.scorches,
      this.lines,
      this.sideLines,
      this.streakEdges,
      this.streaks,
      this.arrows,
      this.orbs,
      this.stones,
      this.stars,
      this.shellFills,
      this.shellEdges,
      this.shards,
      this.dust,
      this.ribbons,
    ];
    for (const layer of this.layers) this.group.add(layer.mesh);
  }

  /** Every mesh of the effects, all of them, for compiling their shaders before the first is drawn. */
  get meshes(): readonly THREE.Object3D[] {
    return this.layers.map((layer) => layer.mesh);
  }

  /** Draws nothing, as when no fight is shown. Whether that changed what is on screen. */
  hide(): boolean {
    if (!this.drawn) return false;
    for (const layer of this.layers) {
      layer.begin();
      layer.end();
    }
    this.lights[0].intensity = 0;
    this.lights[1].intensity = 0;
    this.drawn = false;
    return true;
  }

  /** Fills every layer from the effects live at the playback's display time. */
  draw(fx: Effects, playback: Playback, units: FxUnits, camera: THREE.Camera): void {
    this.drawn = true;
    const time = playback.time;
    // Billboards face the camera from inside the turned group.
    this.billboard.copy(this.group.quaternion).invert().multiply(camera.quaternion);
    for (let i = 0; i < this.layers.length; i++) this.layers[i]!.begin();
    this.lights[0].intensity = 0;
    this.lights[1].intensity = 0;

    this.drawGathers(fx, playback, units, time);
    this.drawMarks(fx, time);
    this.drawAimLines(fx, playback, units, time);
    this.drawMissiles(fx, units, time);
    this.drawRibbons(fx, playback, units, time);
    this.drawBursts(fx, playback, units, time);
    this.drawGround(fx, playback, time);
    this.drawStatuses(fx, playback, units, time);
    this.drawShards(fx, playback, units, time);

    for (let i = 0; i < this.layers.length; i++) this.layers[i]!.end();
  }

  private drawGathers(fx: Effects, playback: Playback, units: FxUnits, time: number): void {
    const lamp = this.lights[0];
    for (let n = 0; n < fx.gathers.length; n++) {
      const g = fx.gathers[n]!;
      if (!live(g, time)) continue;
      const k = fx.gatherStrength(g, time);
      if (k <= 0.001) continue;
      // At its staff or hand: above its chest, a little ahead of it.
      const { x, z } = playback.positionInto(this.at, g.unit, time);
      const facing = units.facing(g.unit);
      const y = units.chest(g.unit) + 0.45;
      this.p.set(x + Math.sin(facing) * 0.25, y, z + Math.cos(facing) * 0.25);
      this.glow(this.p, EFFECTS.gather.size * (0.3 + 0.7 * k), g.colour, 1.2 * k);
      if (k * 10 > lamp.intensity) this.lamp(lamp, this.p, g.colour, 10 * k);
    }
  }

  private drawMarks(fx: Effects, time: number): void {
    for (let n = 0; n < fx.marks.length; n++) {
      const m = fx.marks[n]!;
      if (!live(m, time)) continue;
      const { fill, edge } = fx.markInto(this.mark, m, time);
      this.flat(this.marks, m.x, GROUND.mark, m.z, 1, 0, m.colour, fill);
      this.paintFlat(this.edges, m.x, GROUND.mark + 0.002, m.z, 1, this.sideColour(m.team), edge);
    }
  }

  private drawAimLines(fx: Effects, playback: Playback, units: FxUnits, time: number): void {
    const { aimLine } = EFFECTS;
    for (let n = 0; n < fx.aimLines.length; n++) {
      const line = fx.aimLines[n]!;
      if (!live(line, time)) continue;
      const k = fx.aimFirmness(line, time);
      const from = playback.positionInto(this.at, line.source, time);
      this.p.set(from.x, units.chest(line.source), from.z);
      const to = playback.positionInto(this.at, line.target, time);
      this.p2.set(to.x, units.chest(line.target), to.z);
      const width = aimLine.from + (aimLine.to - aimLine.from) * k;
      // Edged in the side's colour, with the ability's colour down the middle.
      this.segment(this.sideLines, this.p, this.p2, width, this.sideColour(line.team), 0.25 + 0.6 * k * k, true);
      this.segment(this.lines, this.p, this.p2, width * 0.5, line.colour, 0.3 + 0.7 * k * k);
    }
  }

  private drawMissiles(fx: Effects, units: FxUnits, time: number): void {
    const lamp = this.lights[1];
    for (let n = 0; n < fx.missiles.length; n++) {
      const m = fx.missiles[n]!;
      if (!live(m, time)) continue;
      const f = fx.missileInto(this.flight, m, time);
      // A lob leaves the caster's hand or staff, above its chest, and comes down on the ground.
      const fromY = units.chest(m.from) + (m.lob ? 0.45 : 0);
      const toY = m.to !== null ? units.chest(m.to) : m.lob ? 0.25 : fromY;
      const arc = m.lob ? EFFECTS.lob.arc : 0;
      const span = Math.max(1e-6, m.end - m.start);
      const { arrow, streak, stone } = EFFECTS;
      this.along(this.p, f, fromY, toY, arc, f.share);
      const length = Math.hypot(f.toX - f.fromX, f.toZ - f.fromZ, toY - fromY) || 1;
      switch (m.kind) {
        case 'arrow': {
          this.along(this.p2, f, fromY, toY, arc, Math.min(1, f.share + 0.01));
          this.look.lookAt(this.p2, this.p, UP);
          this.q.setFromRotationMatrix(this.look);
          this.matrix.compose(this.p, this.q, this.s.set(arrow.across, arrow.across, arrow.along));
          this.colour.setHex(0xffffff);
          this.arrows.put(this.matrix, this.colour);
          this.along(this.p3, f, fromY, toY, arc, Math.max(0, f.share - streak.length / length));
          this.streak(this.p3, this.p, m.colour);
          this.glow(this.p, 0.8, m.colour, 1);
          break;
        }
        case 'stone': {
          this.e.set(time * 0.3, time * 0.23, 0);
          this.q.setFromEuler(this.e);
          this.matrix.compose(this.p, this.q, this.s.setScalar(m.lob ? stone.lobSize : stone.size));
          this.colour.setHex(stone.colour);
          this.stones.put(this.matrix, this.colour);
          if (!m.lob) {
            // A thrown stone streaks like an arrow, shorter, so a small one reads on pale stone.
            this.along(this.p3, f, fromY, toY, arc, Math.max(0, f.share - streak.stoneLength / length));
            this.streak(this.p3, this.p, m.colour);
          }
          this.glow(this.p, m.lob ? 1.1 : 0.9, m.colour, 0.9);
          this.trail(f, fromY, toY, arc, span, time, m, TRAIL.stone, m.lob ? 0.9 : 0.7, 0.8);
          break;
        }
        default: {
          // A fireball or a bolt: a bright core with a glowing trail, thick for a lob.
          const fire = m.kind === 'fireball';
          this.e.set(time * 0.3, time * 0.23, 0);
          this.q.setFromEuler(this.e);
          this.matrix.compose(this.p, this.q, this.s.setScalar(fire ? 0.24 : 0.14));
          this.colour.setHex(fire ? 0xffd27a : 0xffffff).lerp(this.tint.setHex(m.colour), fire ? 0 : 0.35);
          this.orbs.put(this.matrix, this.colour);
          this.trail(f, fromY, toY, arc, span, time, m, fire ? TRAIL.fireball : TRAIL.bolt, fire || m.lob ? EFFECTS.lob.trail : 0.6, 0.9);
          if (fire && 14 > lamp.intensity) this.lamp(lamp, this.p, m.colour, 14);
        }
      }
    }
  }

  /**
   * A streak from `tail` to `head`: a wide edge painted in a deep, saturated cut of `colour`, which
   * reads on pale stone and shells, and a bright core of light in `colour` down its middle.
   */
  private streak(tail: THREE.Vector3, head: THREE.Vector3, colour: number): void {
    const { streak } = EFFECTS;
    this.tint.setHex(colour).getHSL(this.hsl);
    this.tint.setHSL(this.hsl.h, Math.max(this.hsl.s, 0.75), streak.edgeLightness);
    this.segment(this.streakEdges, tail, head, streak.edge, this.tint.getHex(), streak.edgeOpacity, true);
    this.segment(this.streaks, tail, head, streak.width, colour, 1);
  }

  /** Glowing copies behind a missile, each further back in time, smaller and fainter. */
  private trail(f: MissileState, fromY: number, toY: number, arc: number, span: number, time: number, m: { start: number; colour: number }, count: number, size: number, strength: number): void {
    for (let i = 0; i < count; i++) {
      const back = time - i * TRAIL_GAP;
      if (back < m.start) break;
      const share = (back - m.start) / span;
      this.along(this.p2, f, fromY, toY, arc, share);
      const fade = 1 - i / count;
      this.glow(this.p2, size * fade, m.colour, strength * fade);
    }
  }

  private drawRibbons(fx: Effects, playback: Playback, units: FxUnits, time: number): void {
    const { ribbon, dust } = EFFECTS;
    for (let n = 0; n < fx.ribbons.length; n++) {
      const r = fx.ribbons[n]!;
      if (!live(r, time)) continue;
      const strength = fx.ribbonStrength(r, time);
      const head = Math.min(time, r.arrive);
      const length = ribbon.seconds * T;
      let last = playback.positionInto(this.at, r.unit, head);
      this.p.set(last.x, 0, last.z);
      for (let i = 1; i <= RIBBON_SEGMENTS; i++) {
        const ti = Math.max(r.start, head - (i / RIBBON_SEGMENTS) * length);
        last = playback.positionInto(this.at, r.unit, ti);
        this.p2.set(last.x, 0, last.z);
        const dx = this.p.x - this.p2.x;
        const dz = this.p.z - this.p2.z;
        const segment = Math.hypot(dx, dz);
        if (segment > 1e-4) {
          const a = 1 - (i - 0.5) / RIBBON_SEGMENTS;
          this.flat(this.ribbons, (this.p.x + this.p2.x) / 2, 0.06, (this.p.z + this.p2.z) / 2, 1, Math.atan2(dx, dz), r.colour, 0.85 * strength * a * a, ribbon.width, segment + 0.02);
        }
        this.p.copy(this.p2);
      }
      // Dust thrown up from the hooves, a puff every few ticks of the charge.
      const every = dust.every * T;
      for (let tk = r.start; tk <= Math.min(time, r.arrive); tk += every) {
        const age = (time - tk) / (dust.seconds * T);
        if (age >= 1) continue;
        const at = playback.positionInto(this.at, r.unit, tk);
        for (let j = 0; j < 2; j++) {
          const h = hash(tk, j + r.unit);
          const size = dust.size * (0.6 + 0.8 * h) * (0.4 + 1.2 * easeOut(age)) * (1 - easeIn(age));
          this.p.set(at.x + (h - 0.5) * 0.7 * (1 + age), 0.08 + 0.5 * easeOut(age), at.z + (hash(j, tk) - 0.5) * 0.7 * (1 + age));
          this.matrix.compose(this.p, this.q.identity(), this.s.setScalar(size));
          this.dust.put(this.matrix, this.colour.setHex(dust.colour));
        }
      }
      if (time < r.arrive) {
        const at = playback.positionInto(this.at, r.unit, time);
        this.p.set(at.x, units.chest(r.unit), at.z);
        this.glow(this.p, 2.2, 0xffe08a, 0.9);
      }
    }
  }

  private drawBursts(fx: Effects, playback: Playback, units: FxUnits, time: number): void {
    const lamp = this.lights[1];
    for (let n = 0; n < fx.bursts.length; n++) {
      const b = fx.bursts[n]!;
      if (!live(b, time)) continue;
      const age = (time - b.start) / T;
      // From the unit's chest where it stood as it was reached, or the point.
      if (b.unit === null) this.p.set(b.x, b.y, b.z);
      else {
        const at = playback.positionInto(this.at, b.unit, b.start);
        this.p.set(at.x, units.chest(b.unit), at.z);
      }
      const life = (b.end - b.start) / T;
      for (let j = 0; j < b.count; j++) {
        const key = b.seed * 13.7 + j;
        const pieceLife = life * (0.45 + 0.55 * hash(key, 5));
        const x = age / pieceLife;
        if (x >= 1) continue;
        const angle = hash(key, 1) * Math.PI * 2;
        const up = (b.unit === null ? 0.35 : 0.5) * (0.5 + hash(key, 2));
        const speed = b.speed * (0.5 + 0.5 * hash(key, 3));
        const norm = Math.hypot(1, up);
        const drag = 2.5;
        const travel = ((1 - Math.exp(-drag * age)) / drag) * speed;
        this.p2.set(
          this.p.x + (Math.cos(angle) / norm) * travel,
          Math.max(0.02, this.p.y + (up / norm) * travel - 0.5 * 4 * age * age),
          this.p.z + (Math.sin(angle) / norm) * travel,
        );
        const size = (0.04 + 0.05 * hash(key, 4)) * (b.unit === null ? 1.3 : 1) * (1 - easeIn(x));
        this.matrix.compose(this.p2, this.q.identity(), this.s.setScalar(size));
        this.sparks.put(this.matrix, this.colour.setHex(b.colour));
      }
      if (b.heart) {
        // The heart of a lob's blast: a big glow, and light on the ground round it.
        const k = kick(time - b.start, 0.5 * T, 0.1);
        this.p2.set(b.x, 0.6, b.z);
        this.glow(this.p2, 4.5, b.colour, 1.4 * k);
        if (40 * k > lamp.intensity) this.lamp(lamp, this.p2, b.colour, 40 * k);
      }
    }
    for (let n = 0; n < fx.glows.length; n++) {
      const g = fx.glows[n]!;
      if (!live(g, time)) continue;
      const k = kick(time - g.start, g.end - g.start, 0.15);
      if (g.unit === null) this.p.set(g.x, g.y, g.z);
      else {
        const at = playback.positionInto(this.at, g.unit, time);
        this.p.set(at.x, units.chest(g.unit), at.z);
      }
      this.glow(this.p, g.size * (0.3 + 0.7 * k), g.colour, k);
    }
  }

  private drawGround(fx: Effects, playback: Playback, time: number): void {
    for (let n = 0; n < fx.rings.length; n++) {
      const r = fx.rings[n]!;
      if (!live(r, time)) continue;
      const x = through(r, time);
      this.flat(this.rings, r.x, GROUND.ring, r.z, r.from + (r.to - r.from) * easeOut(x), 0, r.colour, r.strength * (1 - easeIn(x)));
    }
    const { scorch } = EFFECTS;
    for (let n = 0; n < fx.scorches.length; n++) {
      const s = fx.scorches[n]!;
      if (!live(s, time)) continue;
      const x = through(s, time);
      const strength = scorch.strength * Math.min(1, x * 8) * (1 - easeIn(x));
      this.colour.setHex(0xffffff).lerp(this.tint.setHex(scorch.colour), strength);
      this.p.set(s.x, GROUND.scorch, s.z);
      this.matrix.compose(this.p, this.q.identity(), this.s.setScalar(scorch.radius * (0.7 + 0.3 * easeOut(x * 4))));
      this.scorches.put(this.matrix, this.colour);
    }
    const { rings } = EFFECTS;
    for (let n = 0; n < fx.statusRings.length; n++) {
      const r = fx.statusRings[n]!;
      if (!live(r, time)) continue;
      const g = fx.grow(r, rings.grow, time);
      if (g <= 0.001) continue;
      const { x, z } = playback.positionInto(this.at, r.unit, time);
      // Each kind at its own size, so a buffed and slowed unit shows both.
      const size = r.kind === 'buff' ? 0.86 : r.kind === 'slow' ? 0.76 : 0.96;
      this.paintFlat(this.edges, x, GROUND.status, z, size * (0.7 + 0.3 * g), r.colour, 0.8 * g);
    }
  }

  private drawStatuses(fx: Effects, playback: Playback, units: FxUnits, time: number): void {
    // Stars circling a stunned unit's head.
    const { stun, shield } = EFFECTS;
    for (let unit = 0; unit < units.count(); unit++) {
      if (!fx.stunInto(this.stun, unit, time)) continue;
      const { age, left } = this.stun;
      const grow = easeOut(age / stun.grow) * (1 - smooth((0.2 - left) / 0.2));
      const { x, z } = playback.positionInto(this.at, unit, time);
      const head = units.chest(unit) / 0.85 + 0.3;
      for (let i = 0; i < stun.count; i++) {
        const a = age * stun.turnsPerSecond * Math.PI * 2 + (i / stun.count) * Math.PI * 2;
        this.p.set(x + Math.cos(a) * stun.radius, head + 0.06 * Math.sin(a * 2), z + Math.sin(a) * stun.radius);
        this.e.set(0, -a, 0);
        this.q.setFromEuler(this.e);
        this.matrix.compose(this.p, this.q, this.s.setScalar(stun.size * grow));
        this.stars.put(this.matrix, this.colour.setHex(0xffffff));
      }
    }
    // A shell round a shielded unit, while it has a shield.
    for (let n = 0; n < fx.shells.length; n++) {
      const s = fx.shells[n]!;
      if (!live(s, time) || !units.shielded(s.unit)) continue;
      const g = fx.grow(s, shield.grow, time);
      if (g <= 0.001) continue;
      const pop = fx.shellPop(s, time);
      const ripple = units.ripple(s.unit);
      const { x, z } = playback.positionInto(this.at, s.unit, time);
      const radius = Math.min(shield.maxRadius, units.chest(s.unit) * shield.size + shield.pad);
      const scale = radius * (0.6 + 0.4 * g) * (1 + shield.pop * pop) * (1 + 0.06 * ripple);
      this.p.set(x, radius * 0.8, z);
      this.e.set(0, (time / T) * 0.6, 0);
      this.q.setFromEuler(this.e);
      this.matrix.compose(this.p, this.q, this.s.setScalar(scale));
      this.shellFills.put(this.matrix, this.colour.setHex(shield.colour).multiplyScalar(shield.fill * g * (1 + 1.5 * ripple)));
      this.shellEdges.put(this.matrix, this.colour.setHex(shield.colour).multiplyScalar(shield.edges * g * (1 + ripple)));
    }
  }

  private drawShards(fx: Effects, playback: Playback, units: FxUnits, time: number): void {
    const { shards } = EFFECTS;
    for (let unit = 0; unit < units.count(); unit++) {
      const share = fx.shardsShare(unit, units.breakDelay(unit), time);
      if (share < 0 || share >= 1) continue;
      const age = share * shards.seconds;
      const { x, z } = playback.positionInto(this.at, unit, time);
      const height = units.chest(unit) / 0.85;
      const livery = units.livery(unit);
      for (let i = 0; i < shards.count; i++) {
        const key = unit * 7.31 + i;
        const angle = hash(key, 1) * Math.PI * 2;
        const speed = shards.speed[0] + (shards.speed[1] - shards.speed[0]) * hash(key, 2);
        const up = 0.4 + 0.9 * hash(key, 3);
        const y0 = height * (0.15 + 0.85 * hash(key, 4));
        const drag = 2.5;
        const travel = ((1 - Math.exp(-drag * age)) / drag) * speed;
        this.p.set(x + Math.cos(angle) * travel, Math.max(0.03, y0 + up * travel - 0.5 * shards.gravity * age * age), z + Math.sin(angle) * travel);
        this.e.set(hash(key, 5) * 9 * age + hash(key, 7) * 6, hash(key, 6) * 9 * age, hash(key, 8) * 6);
        this.q.setFromEuler(this.e);
        const size = (shards.size[0] + (shards.size[1] - shards.size[0]) * hash(key, 9)) * (1 - easeIn(share));
        this.matrix.compose(this.p, this.q, this.s.setScalar(size));
        // The livery, and a darker cut of it, so the facets read.
        this.colour.setHex(livery);
        if (i % 3 === 2) this.colour.multiplyScalar(0.55);
        this.shards.put(this.matrix, this.colour);
      }
    }
  }

  // Placing pieces

  /** A point `share` of the way along a missile's path, `arc` above the line at its middle. */
  private along(out: THREE.Vector3, f: MissileState, fromY: number, toY: number, arc: number, share: number): THREE.Vector3 {
    return out.set(f.fromX + (f.toX - f.fromX) * share, fromY + (toY - fromY) * share + arc * 4 * share * (1 - share), f.fromZ + (f.toZ - f.fromZ) * share);
  }

  /** A glow at a point, facing the camera, `size` across, in `colour` at `strength`. */
  private glow(at: THREE.Vector3, size: number, colour: number, strength: number): void {
    if (strength <= 0.001) return;
    this.matrix.compose(at, this.billboard, this.s.setScalar(size));
    this.glows.put(this.matrix, this.colour.setHex(colour).multiplyScalar(Math.min(1.5, strength)));
  }

  /** A piece lying on the ground, turned `yaw` about the vertical, scaled by `scale`, or `sx` across and `sz` along. */
  private flat(layer: Layer, x: number, y: number, z: number, scale: number, yaw: number, colour: number, strength: number, sx = scale, sz = scale): void {
    if (strength <= 0.001) return;
    this.p.set(x, y, z);
    this.e.set(0, yaw, 0);
    this.q.setFromEuler(this.e);
    this.matrix.compose(this.p, this.q, this.s.set(sx, 1, sz));
    layer.put(this.matrix, this.colour.setHex(colour).multiplyScalar(strength));
  }

  /** A piece lying on the ground in a layer with alpha, painted in `colour` at `opacity`. */
  private paintFlat(layer: Layer, x: number, y: number, z: number, scale: number, colour: number, opacity: number): void {
    if (opacity <= 0.001) return;
    this.p.set(x, y, z);
    this.matrix.compose(this.p, this.q.identity(), this.s.set(scale, 1, scale));
    layer.put(this.matrix, this.colour.setHex(colour), Math.min(1, opacity));
  }

  /** A unit cylinder stretched from `a` to `b`, `radius` thick; `painted`, at `strength` opacity. */
  private segment(layer: Layer, a: THREE.Vector3, b: THREE.Vector3, radius: number, colour: number, strength: number, painted = false): void {
    this.d.subVectors(b, a);
    const length = this.d.length();
    if (length < 1e-4 || strength <= 0.001) return;
    this.q.setFromUnitVectors(UP, this.d.divideScalar(length));
    this.mid.copy(a).lerp(b, 0.5);
    this.matrix.compose(this.mid, this.q, this.s.set(radius, length, radius));
    if (painted) layer.put(this.matrix, this.colour.setHex(colour), Math.min(1, strength));
    else layer.put(this.matrix, this.colour.setHex(colour).multiplyScalar(strength));
  }

  /** Puts a point light at a point in the group, in world space. */
  private lamp(lamp: THREE.PointLight, at: THREE.Vector3, colour: number, intensity: number): void {
    lamp.position.copy(at).applyQuaternion(this.group.quaternion);
    lamp.color.setHex(colour);
    lamp.intensity = intensity;
  }

  private sideColour(team: Team): number {
    return EFFECTS.sides[team === this.side ? 'A' : 'B'];
  }

  dispose(): void {
    for (const layer of this.layers) layer.dispose();
  }
}

function live(effect: { start: number; end: number }, time: number): boolean {
  return effect.start <= time && time < effect.end;
}

function through(effect: { start: number; end: number }, time: number): number {
  return (time - effect.start) / (effect.end - effect.start);
}
