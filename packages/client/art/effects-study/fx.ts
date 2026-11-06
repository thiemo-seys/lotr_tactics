// Effects for the ability-effects study (README.md): two styles and the pieces both are built from.
// Every piece is a pure function of the scene's time, so any frame can be drawn on its own and the
// recordings come out the same each time.

import * as THREE from 'three';

export type StyleName = 'grounded' | 'punchy';

/** What tells the two styles apart. The scenes read these, and branch on `punchy` for the rest. */
export interface Style {
  readonly name: StyleName;
  readonly label: string;
  readonly punchy: boolean;
  /** A hit lights the model up: how bright, for how long, in what colour. */
  readonly flash: { readonly intensity: number; readonly seconds: number; readonly colour: number };
  /** How far a hit pushes the target back, in world units, and over how long. */
  readonly flinch: { readonly distance: number; readonly seconds: number };
  /** Squash and stretch on hits. */
  readonly squash: number;
  /** How long a big impact freezes everything, in seconds. */
  readonly hitStop: number;
  /** Camera shake on a big impact, in world units. */
  readonly shake: number;
  /** Where an area or line ability will land, shown on the ground while it winds up. */
  readonly telegraph: boolean;
  /** Damage numbers: size, and a pop as they appear. */
  readonly numbers: { readonly size: number; readonly pop: number; readonly rise: number; readonly seconds: number };
  /** A trailing white chunk on the health bar that drains after a hit. */
  readonly drainBar: boolean;
  /** Blending for glows: additive light, or plain paint. */
  readonly glow: THREE.Blending;
}

export const STYLES: Record<StyleName, Style> = {
  grounded: {
    name: 'grounded',
    label: 'Grounded',
    punchy: false,
    flash: { intensity: 0.45, seconds: 0.14, colour: 0xffe2c0 },
    flinch: { distance: 0.1, seconds: 0.22 },
    squash: 0,
    hitStop: 0,
    shake: 0,
    telegraph: false,
    numbers: { size: 0.5, pop: 0, rise: 0.55, seconds: 0.85 },
    drainBar: false,
    glow: THREE.NormalBlending,
  },
  punchy: {
    name: 'punchy',
    label: 'Punchy',
    punchy: true,
    flash: { intensity: 1.4, seconds: 0.12, colour: 0xffffff },
    flinch: { distance: 0.22, seconds: 0.2 },
    squash: 0.16,
    hitStop: 0.08,
    shake: 0.14,
    telegraph: true,
    numbers: { size: 0.78, pop: 0.7, rise: 0.75, seconds: 0.9 },
    drainBar: true,
    glow: THREE.AdditiveBlending,
  },
};

/** Something drawn in time: it sets itself up for the scene's time `t`, in seconds. */
export interface Timed {
  update(t: number): void;
}

// ---------------------------------------------------------------------------------------------
// Small helpers

/** A hash of two numbers to [0, 1), for scattering particles the same way every time. */
export function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
export const easeIn = (x: number) => clamp01(x) ** 2;
export const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
/** Up fast, then back down: a hit's push. Rises over the first `rise` of the time, then falls. */
export function kick(age: number, seconds: number, rise = 0.18): number {
  const x = age / seconds;
  if (x < 0 || x >= 1) return 0;
  return x < rise ? easeOut(x / rise) : 1 - smooth((x - rise) / (1 - rise));
}

let glowTexture: THREE.Texture | null = null;
/** A soft round spot, for glows and flashes. */
export function glowMap(): THREE.Texture {
  if (glowTexture !== null) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

const FACET = new THREE.IcosahedronGeometry(1, 0);
const SHARD = new THREE.TetrahedronGeometry(1, 0);
const UP = new THREE.Vector3(0, 1, 0);

/** Sets a unit cylinder (height 1 along y, centred) to run from `a` to `b`. */
export function stretch(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const length = d.length();
  mesh.visible = length > 1e-4;
  if (!mesh.visible) return;
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(length));
  mesh.scale.set(radius, length, radius);
}

// ---------------------------------------------------------------------------------------------
// Pieces

export interface BurstOptions {
  readonly count: number;
  readonly at: THREE.Vector3;
  readonly start: number;
  readonly colour: number;
  /** Size of each piece, from min to max. */
  readonly size: readonly [number, number];
  /** Speed out from `at`, from min to max. */
  readonly speed: readonly [number, number];
  readonly life: readonly [number, number];
  /** How far up the pieces head, 0 for flat out along the ground, 1 for straight up. */
  readonly up?: number;
  /** A direction to head in, mixed with the scatter. */
  readonly towards?: THREE.Vector3;
  readonly spread?: number;
  readonly gravity?: number;
  readonly drag?: number;
  /** How the size changes over a piece's life: 'shrink' to nothing, or 'puff' up then out, for smoke. */
  readonly shape?: 'shrink' | 'puff';
  readonly glow?: boolean;
  readonly opacity?: number;
  readonly shard?: boolean;
  /** How long the pieces take to all set out, so a burst can stream rather than pop. */
  readonly stagger?: number;
  readonly seed?: number;
}

/** A burst of faceted pieces: sparks, embers, debris, dust or smoke. */
export class Burst implements Timed {
  readonly mesh: THREE.InstancedMesh;
  private readonly pieces: { v: THREE.Vector3; size: number; life: number; delay: number; spin: THREE.Vector3 }[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(
    parent: THREE.Object3D,
    private readonly o: BurstOptions,
  ) {
    const material = o.glow
      ? new THREE.MeshBasicMaterial({ color: o.colour, transparent: true, opacity: o.opacity ?? 1, blending: THREE.AdditiveBlending, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color: o.colour, flatShading: true, transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, depthWrite: (o.opacity ?? 1) >= 1 });
    this.mesh = new THREE.InstancedMesh(o.shard ? SHARD : FACET, material, o.count);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    const seed = o.seed ?? 1;
    for (let i = 0; i < o.count; i++) {
      const r = (k: number) => hash(seed * 13.7 + i, k);
      const angle = r(1) * Math.PI * 2;
      const up = (o.up ?? 0.4) * (0.5 + r(2));
      const v = new THREE.Vector3(Math.cos(angle), up, Math.sin(angle)).normalize();
      if (o.towards) v.multiplyScalar(o.spread ?? 1).add(o.towards.clone().normalize()).normalize();
      v.multiplyScalar(o.speed[0] + (o.speed[1] - o.speed[0]) * r(3));
      this.pieces.push({
        v,
        size: o.size[0] + (o.size[1] - o.size[0]) * r(4),
        life: o.life[0] + (o.life[1] - o.life[0]) * r(5),
        delay: (o.stagger ?? 0) * r(6),
        spin: new THREE.Vector3(r(7) - 0.5, r(8) - 0.5, r(9) - 0.5).multiplyScalar(14),
      });
    }
    this.update(-1);
  }

  update(t: number): void {
    const { o } = this;
    const gravity = o.gravity ?? 6;
    const drag = o.drag ?? 2.5;
    let any = false;
    this.pieces.forEach((piece, i) => {
      const age = t - o.start - piece.delay;
      const x = age / piece.life;
      if (age < 0 || x >= 1) {
        this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
        return;
      }
      any = true;
      const travel = (1 - Math.exp(-drag * age)) / drag;
      this.p.copy(o.at).addScaledVector(piece.v, travel);
      this.p.y -= 0.5 * gravity * age * age;
      if (this.p.y < 0.02) this.p.y = 0.02;
      const scale = o.shape === 'puff' ? piece.size * (0.4 + 1.2 * easeOut(x)) * (1 - easeIn(x)) : piece.size * (1 - easeIn(x));
      this.q.setFromEuler(this.e.set(piece.spin.x * age, piece.spin.y * age, piece.spin.z * age));
      this.mesh.setMatrixAt(i, this.matrix.compose(this.p, this.q, this.s.setScalar(Math.max(scale, 0))));
    });
    this.mesh.visible = any;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A soft glow: a flash, a light at a staff's tip, the heart of an explosion. */
export class Glow implements Timed {
  readonly sprite: THREE.Sprite;
  constructor(
    parent: THREE.Object3D,
    private readonly at: (t: number) => THREE.Vector3 | null,
    private readonly curve: (t: number) => number,
    private readonly size: number,
    colour: number,
    blending: THREE.Blending = THREE.AdditiveBlending,
  ) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap(), color: colour, transparent: true, blending, depthWrite: false }));
    this.sprite.renderOrder = 5;
    parent.add(this.sprite);
    this.update(-1);
  }
  update(t: number): void {
    const at = this.at(t);
    const k = this.curve(t);
    this.sprite.visible = at !== null && k > 0.001;
    if (!this.sprite.visible) return;
    this.sprite.position.copy(at!);
    this.sprite.scale.setScalar(this.size * (0.3 + 0.7 * Math.min(1, k)));
    this.sprite.material.opacity = Math.min(1, k);
  }
}

/** A ring along the ground, growing from `from` to `to` in radius: a shockwave, or a wave of dust. */
export class Ring implements Timed {
  readonly mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  constructor(
    parent: THREE.Object3D,
    private readonly o: {
      at: THREE.Vector3;
      start: number;
      seconds: number;
      from: number;
      to: number;
      colour: number;
      opacity: number;
      width: number;
      blending?: THREE.Blending;
      sides?: number;
    },
  ) {
    this.mesh = new THREE.Mesh(
      new THREE.RingGeometry(1 - o.width, 1, o.sides ?? 48, 1, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: o.colour, transparent: true, blending: o.blending ?? THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.copy(o.at);
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
    this.update(-1);
  }
  update(t: number): void {
    const x = (t - this.o.start) / this.o.seconds;
    this.mesh.visible = x >= 0 && x < 1;
    if (!this.mesh.visible) return;
    this.mesh.scale.setScalar(this.o.from + (this.o.to - this.o.from) * easeOut(x));
    this.mesh.material.opacity = this.o.opacity * (1 - easeIn(x));
  }
}

const HEX_FILL = new THREE.CircleGeometry(0.84, 6, Math.PI / 2);
const HEX_EDGE = new THREE.RingGeometry(0.74, 0.88, 6, 1, Math.PI / 2);

/** Hexes lit on the ground: where an ability will land, then the flash as it does. */
export class HexMarks implements Timed {
  private readonly group = new THREE.Group();
  private readonly fill: THREE.MeshBasicMaterial;
  private readonly edge: THREE.MeshBasicMaterial;
  constructor(
    parent: THREE.Object3D,
    points: readonly THREE.Vector3[],
    colour: number,
    private readonly start: number,
    private readonly land: number,
    private readonly linger = 0.35,
  ) {
    this.fill = new THREE.MeshBasicMaterial({ color: colour, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.edge = new THREE.MeshBasicMaterial({ color: colour, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const p of points) {
      for (const [geometry, material] of [
        [HEX_FILL, this.fill],
        [HEX_EDGE, this.edge],
      ] as const) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(p.x, 0.03, p.z);
        mesh.renderOrder = 1;
        this.group.add(mesh);
      }
    }
    parent.add(this.group);
    this.update(-1);
  }
  update(t: number): void {
    const visible = t >= this.start && t < this.land + this.linger;
    this.group.visible = visible;
    if (!visible) return;
    if (t < this.land) {
      // Builds up as it winds up, pulsing faster towards the end.
      const x = (t - this.start) / (this.land - this.start);
      const pulse = 0.5 + 0.5 * Math.sin(x * x * 26);
      this.fill.opacity = 0.08 + 0.14 * x + 0.06 * pulse;
      this.edge.opacity = 0.35 + 0.45 * x;
    } else {
      const x = (t - this.land) / this.linger;
      this.fill.opacity = 0.55 * (1 - easeOut(x));
      this.edge.opacity = 0.9 * (1 - easeOut(x));
    }
  }
}

/** A dark mark left on the ground, fading. */
export class Scorch implements Timed {
  readonly mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  constructor(
    parent: THREE.Object3D,
    at: THREE.Vector3,
    radius: number,
    private readonly start: number,
    private readonly seconds: number,
    colour = 0x1a1008,
    private readonly opacity = 0.55,
  ) {
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 9), new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false }));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(at.x, 0.025, at.z);
    this.mesh.renderOrder = 1;
    parent.add(this.mesh);
    this.update(-1);
  }
  update(t: number): void {
    const x = (t - this.start) / this.seconds;
    this.mesh.visible = x >= 0 && x < 1;
    this.mesh.material.opacity = this.opacity * Math.min(1, x * 8) * (1 - easeIn(x));
    this.mesh.scale.setScalar(0.7 + 0.3 * easeOut(x * 4));
  }
}

/** A point light that flares: fire lighting the ground and the units round it. */
export class Flare implements Timed {
  constructor(
    private readonly light: THREE.PointLight,
    private readonly at: THREE.Vector3,
    private readonly start: number,
    private readonly seconds: number,
    private readonly intensity: number,
    private readonly colour: number,
  ) {}
  update(t: number): void {
    const x = (t - this.start) / this.seconds;
    if (x < 0 || x >= 1) return;
    this.light.position.copy(this.at);
    this.light.color.setHex(this.colour);
    this.light.intensity = Math.max(this.light.intensity, this.intensity * kick(t - this.start, this.seconds, 0.08));
  }
}

/** Something that flies from one place to another, along a straight line or an arc. */
export class Flight {
  constructor(
    readonly from: THREE.Vector3,
    readonly to: THREE.Vector3,
    readonly start: number,
    readonly land: number,
    readonly arc = 0,
  ) {}
  /** Where it is at `t`, or null when it isn't in the air. */
  at(t: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    if (t < this.start || t >= this.land) return null;
    return this.atFraction((t - this.start) / (this.land - this.start), out);
  }
  atFraction(x: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.lerpVectors(this.from, this.to, x);
    out.y += this.arc * 4 * x * (1 - x);
    return out;
  }
}

/** An arrow along a flight, pointing the way it goes, with a streak behind it. */
export class Arrow implements Timed {
  private readonly group = new THREE.Group();
  private readonly streak: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly p = new THREE.Vector3();
  private readonly back = new THREE.Vector3();
  constructor(
    parent: THREE.Object3D,
    private readonly flight: Flight,
    o: { shaft: number; head: number; streakColour: number; streakOpacity: number; streakLength: number; streakWidth: number; glow?: number },
  ) {
    const wood = new THREE.MeshStandardMaterial({ color: o.shaft, flatShading: true });
    const tip = new THREE.MeshStandardMaterial({ color: o.head, flatShading: true, emissive: o.glow ?? 0x000000 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 4), wood);
    shaft.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), tip);
    head.rotation.x = Math.PI / 2;
    head.position.z = 0.41;
    const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.005, 0.14), new THREE.MeshStandardMaterial({ color: 0xe8e0d0, flatShading: true }));
    fletch.position.z = -0.3;
    this.group.add(shaft, head, fletch);
    parent.add(this.group);
    this.streak = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 0.15, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: o.streakColour, transparent: true, opacity: o.streakOpacity, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.streakLength = o.streakLength;
    this.streakWidth = o.streakWidth;
    parent.add(this.streak);
    this.update(-1);
  }
  private readonly streakLength: number;
  private readonly streakWidth: number;
  update(t: number): void {
    const at = this.flight.at(t, this.p);
    this.group.visible = this.streak.visible = at !== null;
    if (at === null) return;
    const span = this.flight.land - this.flight.start;
    const x = (t - this.flight.start) / span;
    const ahead = this.flight.atFraction(Math.min(1, x + 0.01), new THREE.Vector3());
    this.group.position.copy(at);
    this.group.lookAt(ahead);
    const behind = Math.max(0, x - this.streakLength / (this.flight.from.distanceTo(this.flight.to) || 1));
    this.flight.atFraction(behind, this.back);
    stretch(this.streak, this.back, at, this.streakWidth);
  }
}

/** A ball that flies, with a trail of glowing copies behind it: a fireball, a bolt. */
export class Ball implements Timed {
  private readonly core: THREE.Mesh;
  private readonly trail: THREE.Sprite[] = [];
  private readonly p = new THREE.Vector3();
  constructor(
    parent: THREE.Object3D,
    private readonly flight: Flight,
    o: { radius: number; colour: number; emissive: number; trailColour: number; trail: number; trailGap: number; trailSize: number; blending: THREE.Blending },
  ) {
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(o.radius, 0),
      new THREE.MeshStandardMaterial({ color: o.colour, emissive: o.emissive, emissiveIntensity: 1.6, flatShading: true }),
    );
    parent.add(this.core);
    for (let i = 0; i < o.trail; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap(), color: o.trailColour, transparent: true, blending: o.blending, depthWrite: false }));
      sprite.renderOrder = 4;
      sprite.scale.setScalar(o.trailSize * (1 - i / o.trail));
      sprite.material.opacity = 0.9 * (1 - i / o.trail);
      parent.add(sprite);
      this.trail.push(sprite);
    }
    this.gap = o.trailGap;
    this.update(-1);
  }
  private readonly gap: number;
  update(t: number): void {
    const at = this.flight.at(t, this.p);
    this.core.visible = at !== null;
    if (at !== null) {
      this.core.position.copy(at);
      this.core.rotation.set(t * 9, t * 7, 0);
    }
    this.trail.forEach((sprite, i) => {
      const back = t - i * this.gap;
      const p = at === null ? null : this.flight.at(Math.max(back, this.flight.start), new THREE.Vector3());
      sprite.visible = p !== null;
      if (p !== null) sprite.position.copy(p);
    });
  }
}

/** A faceted shell round a unit: a shield. */
export class Shell implements Timed {
  private readonly mesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  private readonly edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  constructor(
    parent: THREE.Object3D,
    private readonly o: {
      centre: () => THREE.Vector3;
      radius: number;
      start: number;
      end: number;
      colour: number;
      opacity: number;
      edgeOpacity: number;
      pop: number;
      blending: THREE.Blending;
      /** Times the shell is hit, when it ripples. */
      hits?: readonly number[];
    },
  ) {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: o.colour,
        emissive: o.colour,
        emissiveIntensity: 0.35,
        flatShading: true,
        transparent: true,
        depthWrite: false,
        blending: o.blending,
        side: THREE.DoubleSide,
      }),
    );
    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: o.colour, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.mesh.renderOrder = this.edges.renderOrder = 6;
    parent.add(this.mesh, this.edges);
    this.update(-1);
  }
  update(t: number): void {
    const { o } = this;
    const visible = t >= o.start && t < o.end;
    this.mesh.visible = this.edges.visible = visible;
    if (!visible) return;
    const grow = easeOut((t - o.start) / 0.22);
    const fade = 1 - smooth((t - (o.end - 0.25)) / 0.25);
    let ripple = 0;
    for (const hit of o.hits ?? []) ripple = Math.max(ripple, kick(t - hit, 0.25, 0.1));
    const pop = 1 + o.pop * kick(t - o.start, 0.35, 0.3);
    const scale = o.radius * (0.6 + 0.4 * grow) * pop * (1 + 0.06 * ripple);
    const centre = o.centre();
    for (const object of [this.mesh, this.edges]) {
      object.position.copy(centre);
      object.scale.setScalar(scale);
      object.rotation.y = t * 0.6;
    }
    this.mesh.material.opacity = o.opacity * grow * fade * (1 + 1.5 * ripple);
    this.edges.material.opacity = o.edgeOpacity * grow * fade * (1 + ripple);
  }
}

const STAR = (() => {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.45;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
})();

/** Things circling a stunned unit's head: stars, or a few faint motes. */
export class Daze implements Timed {
  private readonly pieces: THREE.Mesh[] = [];
  constructor(
    parent: THREE.Object3D,
    private readonly o: { head: () => THREE.Vector3; start: number; end: number; colour: number; count: number; size: number; radius: number; stars: boolean; opacity: number },
  ) {
    const material = new THREE.MeshStandardMaterial({
      color: o.colour,
      emissive: o.colour,
      emissiveIntensity: o.stars ? 0.9 : 0.3,
      flatShading: true,
      transparent: o.opacity < 1,
      opacity: o.opacity,
    });
    for (let i = 0; i < o.count; i++) {
      const mesh = new THREE.Mesh(o.stars ? STAR : FACET, material);
      mesh.scale.setScalar(o.size);
      parent.add(mesh);
      this.pieces.push(mesh);
    }
    this.update(-1);
  }
  update(t: number): void {
    const { o } = this;
    const visible = t >= o.start && t < o.end;
    const grow = easeOut((t - o.start) / 0.15) * (1 - smooth((t - (o.end - 0.2)) / 0.2));
    const head = visible ? o.head() : null;
    this.pieces.forEach((mesh, i) => {
      mesh.visible = visible;
      if (!visible) return;
      const a = (t - o.start) * (o.stars ? 6 : 2.4) + (i / o.count) * Math.PI * 2;
      mesh.position.set(head!.x + Math.cos(a) * o.radius, head!.y + 0.06 * Math.sin(a * 2), head!.z + Math.sin(a) * o.radius);
      mesh.rotation.set(0, -a, 0);
      mesh.scale.setScalar(o.size * grow);
    });
  }
}

const CHEVRON = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-1, -0.2);
  shape.lineTo(0, 0.6);
  shape.lineTo(1, -0.2);
  shape.lineTo(1, -0.75);
  shape.lineTo(0, 0.05);
  shape.lineTo(-1, -0.75);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
})();

/** Chevrons rising round a unit: a buff. */
export class Chevrons implements Timed {
  private readonly pieces: THREE.Mesh[] = [];
  constructor(
    parent: THREE.Object3D,
    private readonly o: { feet: () => THREE.Vector3; start: number; colour: number; count: number; height: number; size: number; camera: THREE.Camera },
  ) {
    const material = new THREE.MeshBasicMaterial({ color: o.colour, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < o.count; i++) {
      const mesh = new THREE.Mesh(CHEVRON, material.clone());
      mesh.renderOrder = 6;
      parent.add(mesh);
      this.pieces.push(mesh);
    }
    this.update(-1);
  }
  update(t: number): void {
    const { o } = this;
    this.pieces.forEach((mesh, i) => {
      const age = t - o.start - i * 0.12;
      const x = age / 0.75;
      mesh.visible = x >= 0 && x < 1;
      if (!mesh.visible) return;
      const feet = o.feet();
      const a = i * 2.4;
      mesh.position.set(feet.x + Math.cos(a) * 0.32, feet.y + 0.3 + o.height * easeOut(x), feet.z + Math.sin(a) * 0.32);
      mesh.quaternion.copy(o.camera.quaternion);
      mesh.scale.setScalar(o.size * (x < 0.15 ? x / 0.15 : 1));
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - easeIn(x));
    });
  }
}

/** A ribbon along a path, fading at its tail: a charge's trail. */
export class Ribbon implements Timed {
  private readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly positions: Float32Array;
  constructor(
    parent: THREE.Object3D,
    private readonly o: { path: (t: number) => THREE.Vector3 | null; start: number; end: number; length: number; width: number; height: number; colour: number; opacity: number; blending: THREE.Blending },
    private readonly segments = 24,
  ) {
    const geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array((segments + 1) * 2 * 3);
    const alpha = new Float32Array((segments + 1) * 2 * 4);
    const index: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const a = 1 - i / segments;
      for (let k = 0; k < 2; k++) alpha.set([1, 1, 1, a * a], (i * 2 + k) * 4);
      if (i < segments) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(alpha, 4));
    geometry.setIndex(index);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: o.colour, vertexColors: true, transparent: true, opacity: o.opacity, blending: o.blending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    parent.add(this.mesh);
    this.update(-1);
  }
  update(t: number): void {
    const { o } = this;
    const fadeOut = 1 - smooth((t - o.end) / 0.35);
    this.mesh.visible = t >= o.start && fadeOut > 0;
    if (!this.mesh.visible) return;
    const head = Math.min(t, o.end);
    let last: THREE.Vector3 | null = null;
    for (let i = 0; i <= this.segments; i++) {
      const ti = Math.max(o.start, head - (i / this.segments) * o.length);
      const p: THREE.Vector3 = o.path(ti) ?? last ?? new THREE.Vector3();
      const next = o.path(Math.max(o.start, ti - 0.02)) ?? p;
      const side = new THREE.Vector3(p.z - next.z, 0, next.x - p.x);
      if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
      side.normalize().multiplyScalar(o.width / 2);
      this.positions.set([p.x - side.x, o.height, p.z - side.z, p.x + side.x, o.height, p.z + side.z], i * 6);
      last = p;
    }
    this.mesh.geometry.attributes.position!.needsUpdate = true;
    this.mesh.material.opacity = o.opacity * fadeOut;
  }
}

/** A floating number, drawn on a canvas once. */
export class Number3D implements Timed {
  private readonly sprite: THREE.Sprite;
  private readonly aspect: number;
  constructor(
    parent: THREE.Object3D,
    private readonly o: { text: string; colour: string; at: () => THREE.Vector3; start: number; style: Style; big?: boolean; drift?: number },
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const g = canvas.getContext('2d')!;
    const weight = o.style.punchy ? 900 : 700;
    g.font = `${weight} ${o.big ? 70 : 60}px "DejaVu Sans", "Liberation Sans", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = o.style.punchy ? 12 : 7;
    g.strokeStyle = 'rgba(20,12,6,0.9)';
    g.strokeText(o.text, 128, 50);
    g.fillStyle = o.colour;
    g.fillText(o.text, 128, 50);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.aspect = canvas.width / canvas.height;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    this.sprite.renderOrder = 20;
    parent.add(this.sprite);
    this.update(-1);
  }
  update(t: number): void {
    const { o } = this;
    const n = o.style.numbers;
    const age = t - o.start;
    const x = age / n.seconds;
    this.sprite.visible = x >= 0 && x < 1;
    if (!this.sprite.visible) return;
    const at = o.at();
    const drift = o.drift ?? 0;
    this.sprite.position.set(at.x + drift * easeOut(x), at.y + n.rise * easeOut(x), at.z);
    const pop = 1 + n.pop * (1 - easeOut(age / 0.14)) * (age < 0.14 ? 1 : 0);
    const size = n.size * (o.big ? 1.35 : 1) * pop;
    this.sprite.scale.set(size * this.aspect * 0.5, size * 0.5 * (o.style.punchy ? 1 + 0.25 * (1 - easeOut(age / 0.1)) : 1), 1);
    this.sprite.material.opacity = 1 - easeIn((x - 0.6) / 0.4);
  }
}
