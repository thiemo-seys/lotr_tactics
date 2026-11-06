// The study's scenes (README.md): one ability each, with the wind-up and travel times proposed for
// the sim, and the basic attacks round it, drawn in either style.

import * as THREE from 'three';
import { add, distance, fromOffset, scale, subtract, toOffset } from '@lotr-tactics/sim';
import { Arrow, Ball, Burst, Chevrons, Daze, Flare, Flight, Glow, HexMarks, Number3D, Ribbon, Ring, Scorch, Shell, easeOut, kick, smooth, stretch, type Timed } from './fx.js';
import { at, type Actor, type ActorSpec, type Ctx } from './study.js';

export interface SceneDef {
  readonly name: string;
  readonly title: string;
  readonly who: string;
  readonly duration: number;
  readonly camera: { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number] };
  readonly cast: readonly ActorSpec[];
  build(c: Ctx): void;
}

/** Projectiles fly at the sim's 12 hexes a second, 1.73 world units a hex. */
const SPEED = 12 * Math.sqrt(3);
/** When a melee blow lands after its attack starts: the strike in the attack clip. */
const STRIKE = 0.22;

const TYPE_COLOUR = { physical: '#ff9a3c', magic: '#6cb6ff', true: '#ffffff', absorbed: '#d6d2ca' } as const;
type DamageType = 'physical' | 'magic' | 'true';

function hexesWithin(col: number, row: number, radius: number): THREE.Vector3[] {
  const centre = fromOffset({ col, row });
  const out: THREE.Vector3[] = [];
  for (let r = 0; r < 8; r++) for (let q = 0; q < 7; q++) if (distance(centre, fromOffset({ col: q, row: r })) <= radius) out.push(at(q, r));
  return out;
}

/** A hit landing: the target's reaction, its number and health, and sparks or dust. */
function impact(c: Ctx, target: Actor, t: number, from: THREE.Vector3, amount: number, frac: number, type: DamageType, o: { power?: number; big?: boolean; sparks?: boolean } = {}): void {
  const S = c.style;
  const power = o.power ?? 0.7;
  target.hit(t, from, power);
  const absorbed = target.damage(t, frac);
  const head = target.position(t).add(new THREE.Vector3(0, target.height + 0.5, 0));
  const shown = absorbed >= frac ? 0 : Math.round(amount * (1 - absorbed / frac));
  if (absorbed > 0) {
    c.add(new Number3D(c.root, { text: String(Math.round((amount * absorbed) / frac)), colour: TYPE_COLOUR.absorbed, at: () => head.clone().add(new THREE.Vector3(-0.35, 0, 0)), start: t, style: S, drift: -0.2 }));
  }
  if (shown > 0) c.add(new Number3D(c.root, { text: String(shown), colour: TYPE_COLOUR[type], at: () => head, start: t, style: S, big: o.big }));
  if (o.sparks === false) return;
  const chest = target.chest(t);
  const away = new THREE.Vector3().subVectors(chest, from).setY(0).normalize();
  if (S.punchy) {
    c.add(new Burst(c.root, { count: o.big ? 16 : 8, at: chest, start: t, colour: type === 'magic' ? 0x8ac8ff : 0xffd27a, size: [0.04, 0.09], speed: [3, 6], life: [0.12, 0.3], up: 0.5, towards: away, spread: 1.4, gravity: 4, glow: true, seed: t * 31 }));
    c.add(new Glow(c.root, () => chest, (x) => kick(x - t, 0.18, 0.15) * (o.big ? 1.4 : 1), o.big ? 1.6 : 1, 0xfff0d0));
  } else if (type === 'physical') {
    c.add(new Burst(c.root, { count: 4, at: chest, start: t, colour: 0x9a8670, size: [0.04, 0.08], speed: [1, 2], life: [0.25, 0.45], up: 0.5, towards: away, spread: 1.2, gravity: 5, opacity: 0.85, seed: t * 31 }));
  }
}

/** A basic melee attack: the clip, and the blow landing at its strike. */
function strike(c: Ctx, attacker: Actor, target: Actor, t: number, amount: number, frac: number): void {
  attacker.play(t, 'attack');
  attacker.face = target.home;
  impact(c, target, t + STRIKE, attacker.home, amount, frac, 'physical', { power: 0.55 });
}

/** A glow at a point above a unit: a staff's tip, a horn. */
function tip(actor: Actor, up: number, forward: number, towards: THREE.Vector3): THREE.Vector3 {
  const p = actor.head(0).add(new THREE.Vector3(0, up, 0));
  const d = new THREE.Vector3().subVectors(towards, actor.home).setY(0).normalize();
  return p.addScaledVector(d, forward);
}

/** A thin line from caster to target that firms up through the wind-up: the punchy style's aim. */
function aimLine(c: Ctx, from: THREE.Vector3, to: THREE.Vector3, start: number, end: number, colour: number): Timed {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 5, 1, true),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  c.root.add(mesh);
  stretch(mesh, from, to, 0.025);
  return {
    update(t) {
      const x = (t - start) / (end - start);
      mesh.visible = x >= 0 && x < 1;
      mesh.material.opacity = 0.15 + 0.5 * x * x;
      mesh.scale.x = mesh.scale.z = 0.012 + 0.02 * x;
    },
  };
}

// ---------------------------------------------------------------------------------------------

const ranger: SceneDef = {
  name: 'ranger',
  title: "Ranger's shot",
  who: 'Faramir · the farthest enemy, a long arrow',
  duration: 2.9,
  camera: { position: [1.4, 10.2, 8.6], target: [0.4, 0, -0.9] },
  cast: [
    { unit: 'faramir', team: 'A', col: 3, row: 0 },
    { unit: 'aragorn', team: 'A', col: 3, row: 3, hp: 0.85 },
    { unit: 'gimli', team: 'A', col: 2, row: 3, hp: 0.75 },
    { unit: 'ugluk', team: 'B', col: 3, row: 4, hp: 0.8 },
    { unit: 'gorbag', team: 'B', col: 2, row: 4, hp: 0.7 },
    { unit: 'lurtz', team: 'B', col: 4, row: 7, hp: 1 },
  ],
  build(c) {
    const S = c.style;
    const [faramir, aragorn, gimli, ugluk, gorbag, lurtz] = this.cast.map((s) => c.actor(s)) as Actor[];
    strike(c, aragorn!, ugluk!, 0.15, 64, 0.08);
    strike(c, ugluk!, aragorn!, 0.7, 58, 0.07);
    strike(c, gimli!, gorbag!, 0.4, 51, 0.07);
    strike(c, gorbag!, gimli!, 1.0, 47, 0.06);
    strike(c, aragorn!, ugluk!, 1.45, 64, 0.08);
    strike(c, gimli!, gorbag!, 1.75, 51, 0.07);
    strike(c, ugluk!, aragorn!, 2.0, 58, 0.07);
    lurtz!.face = faramir!.home;

    const cast = 0.55;
    const release = cast + 0.4;
    faramir!.face = lurtz!.home;
    faramir!.play(cast, 'cast');
    const from = faramir!.chest(release).add(new THREE.Vector3().subVectors(lurtz!.home, faramir!.home).setY(0).normalize().multiplyScalar(0.35));
    const to = lurtz!.chest(1);
    const land = release + from.distanceTo(to) / SPEED;
    const flight = new Flight(from, to, release, land);
    if (S.punchy) {
      c.add(aimLine(c, from, to, cast + 0.05, release, 0xffd56a));
      c.add(new Glow(c.root, () => from, (t) => (t >= cast && t < release ? easeOut((t - cast) / 0.4) : 0), 0.9, 0xffd56a));
      c.add(new Arrow(c.root, flight, { shaft: 0x6b4a2e, head: 0xffe08a, glow: 0xffb030, streakColour: 0xffc850, streakOpacity: 0.85, streakLength: 3.2, streakWidth: 0.07 }));
      c.add(new Glow(c.root, (t) => flight.at(t), () => 1, 0.8, 0xffd56a));
    } else {
      c.add(new Glow(c.root, () => from, (t) => (t >= release - 0.12 && t < release ? 0.35 * Math.sin(((t - release + 0.12) / 0.12) * Math.PI) : 0), 0.35, 0xfff4dc));
      c.add(new Arrow(c.root, flight, { shaft: 0x6b4a2e, head: 0xb8bcc4, streakColour: 0xfff6e8, streakOpacity: 0.35, streakLength: 1.6, streakWidth: 0.03 }));
    }
    impact(c, lurtz!, land, faramir!.home, 312, 0.34, 'physical', { power: 1.25, big: true });
    c.stop(land, 0.8);
    c.shake(land, 0.5);
    if (!S.punchy) c.add(new Burst(c.root, { count: 7, at: to, start: land, colour: 0x6b4a2e, size: [0.03, 0.06], speed: [1.5, 3], life: [0.3, 0.5], up: 0.8, gravity: 8, shard: true, seed: 4 }));
  },
};

// ---------------------------------------------------------------------------------------------

const fire: SceneDef = {
  name: 'fire',
  title: 'Fire of Orthanc',
  who: 'Saruman · a fireball lobbed onto the farthest enemy and the hexes round it',
  duration: 3.4,
  camera: { position: [1.2, 9.8, 8.0], target: [0.3, 0, -1.4] },
  cast: [
    { unit: 'saruman', team: 'A', col: 3, row: 1 },
    { unit: 'ugluk', team: 'A', col: 3, row: 3, hp: 0.75 },
    { unit: 'gorbag', team: 'A', col: 4, row: 3, hp: 0.8 },
    { unit: 'gimli', team: 'B', col: 3, row: 4, hp: 0.75 },
    { unit: 'boromir', team: 'B', col: 4, row: 4, hp: 0.85 },
    { unit: 'aragorn', team: 'B', col: 3, row: 7, hp: 0.9 },
    { unit: 'legolas', team: 'B', col: 4, row: 6, hp: 0.65 },
    { unit: 'faramir', team: 'B', col: 2, row: 7, hp: 0.22 },
  ],
  build(c) {
    const S = c.style;
    const [saruman, ugluk, gorbag, gimli, boromir, aragorn, legolas, faramir] = this.cast.map((s) => c.actor(s)) as Actor[];
    strike(c, ugluk!, gimli!, 0.2, 58, 0.07);
    strike(c, gimli!, ugluk!, 0.8, 51, 0.07);
    strike(c, gorbag!, boromir!, 0.5, 47, 0.06);
    strike(c, boromir!, gorbag!, 1.1, 62, 0.08);
    strike(c, ugluk!, gimli!, 1.6, 58, 0.07);
    strike(c, gimli!, ugluk!, 2.3, 51, 0.07);

    const cast = 0.45;
    const release = cast + 0.5;
    const centre = aragorn!.home;
    saruman!.face = centre;
    saruman!.play(cast, 'cast');
    const staff = tip(saruman!, 0.45, 0.25, centre);
    const flight = new Flight(staff, centre.clone().setY(0.25), release, release + 0.75, S.punchy ? 3.2 : 2.4);
    const land = flight.land;
    // The fire gathers at the staff.
    c.add(new Glow(c.root, () => staff, (t) => (t >= cast && t < release + 0.05 ? (S.punchy ? 1.2 : 0.6) * easeOut((t - cast) / 0.5) : 0), S.punchy ? 1.4 : 0.8, 0xff8a2a));
    c.add({
      update(t) {
        if (t < cast || t >= release) return;
        const light = c.light(0);
        light.position.copy(staff);
        light.color.setHex(0xff8a3a);
        light.intensity = (S.punchy ? 14 : 9) * easeOut((t - cast) / 0.5);
      },
    });
    if (S.punchy) c.add(new HexMarks(c.root, hexesWithin(3, 7, 1), 0xff5a1e, cast, land));
    c.add(
      new Ball(c.root, flight, S.punchy
        ? { radius: 0.24, colour: 0xffd27a, emissive: 0xff7a1a, trailColour: 0xff7a20, trail: 16, trailGap: 0.018, trailSize: 1.1, blending: THREE.AdditiveBlending }
        : { radius: 0.17, colour: 0xffb060, emissive: 0xff5a10, trailColour: 0xff6a18, trail: 9, trailGap: 0.022, trailSize: 0.55, blending: THREE.AdditiveBlending }),
    );
    // Smoke left behind it.
    for (let i = 1; i < 9; i++) {
      const ti = release + (i / 9) * 0.75;
      c.add(new Burst(c.root, { count: 2, at: flight.at(ti)!, start: ti, colour: S.punchy ? 0x6a5a50 : 0x3e3530, size: [0.12, 0.2], speed: [0.1, 0.3], life: [0.5, 0.9], up: 1, gravity: -0.5, shape: 'puff', opacity: S.punchy ? 0.35 : 0.55, seed: i }));
    }
    // The blast.
    c.add(new Flare(c.light(1), centre.clone().setY(1), land, 0.9, S.punchy ? 60 : 40, 0xff8a3a));
    c.add(new Glow(c.root, () => centre.clone().setY(0.6), (t) => kick(t - land, 0.5, 0.1) * (S.punchy ? 1.5 : 1), S.punchy ? 5 : 3, 0xff9a40));
    c.add(new Burst(c.root, { count: S.punchy ? 44 : 28, at: centre.clone().setY(0.3), start: land, colour: 0xffa040, size: [0.05, 0.12], speed: [3, S.punchy ? 9 : 6], life: [0.3, 0.8], up: 0.9, gravity: 5, glow: true, seed: 7 }));
    c.add(new Burst(c.root, { count: S.punchy ? 7 : 12, at: centre.clone().setY(0.4), start: land + 0.05, colour: S.punchy ? 0x6a5a50 : 0x2e2622, size: [0.35, 0.6], speed: [1, 2.2], life: [0.9, 1.6], up: 0.6, gravity: -0.6, drag: 3, shape: 'puff', opacity: S.punchy ? 0.35 : 0.6, stagger: 0.12, seed: 8 }));
    c.add(new Scorch(c.root, centre, 1.5, land, 2.2));
    if (S.punchy) {
      c.add(new Ring(c.root, { at: centre.clone().setY(0.05), start: land, seconds: 0.4, from: 0.3, to: 2.9, colour: 0xff8a2a, opacity: 0.95, width: 0.22, blending: THREE.AdditiveBlending }));
      c.add(new Ring(c.root, { at: centre.clone().setY(0.06), start: land, seconds: 0.25, from: 0.2, to: 2.2, colour: 0xfff0c0, opacity: 0.9, width: 0.08, blending: THREE.AdditiveBlending }));
      c.screen(land, '#ff9a40', 0.18);
    } else {
      c.add(new Ring(c.root, { at: centre.clone().setY(0.05), start: land, seconds: 0.7, from: 0.3, to: 2.6, colour: 0x5a4a3c, opacity: 0.45, width: 0.35 }));
      c.add(new Burst(c.root, { count: 14, at: centre.clone().setY(0.1), start: land, colour: 0x6e5e4c, size: [0.04, 0.09], speed: [2, 4.5], life: [0.4, 0.8], up: 1, gravity: 9, shard: true, seed: 9 }));
    }
    c.stop(land, 1.2);
    c.shake(land, 1);
    for (const target of [aragorn!, legolas!, faramir!]) impact(c, target, land, centre.clone().addScaledVector(new THREE.Vector3().subVectors(saruman!.home, centre).normalize(), 0.01), 186, 0.22, 'magic', { power: target === aragorn ? 1.3 : 1.1, big: true, sparks: false });
    faramir!.dies(land);
    if (S.punchy) {
      faramir!.shatter = true;
      c.add(new Burst(c.root, { count: 22, at: faramir!.chest(land), start: land + 0.3, colour: 0x5d6b47, size: [0.06, 0.13], speed: [2, 4], life: [0.5, 0.9], up: 0.9, gravity: 10, shard: true, seed: 11 }));
      c.add(new Glow(c.root, () => faramir!.chest(land), (t) => kick(t - land - 0.3, 0.3, 0.1), 1.6, 0xfff0d0));
    }
  },
};

// ---------------------------------------------------------------------------------------------

const pass: SceneDef = {
  name: 'pass',
  title: 'You shall not pass',
  who: 'Gandalf · stuns every enemy within 2 hexes of his target',
  duration: 3.5,
  camera: { position: [0.8, 8.2, 7.4], target: [0.2, 0, -0.5] },
  cast: [
    { unit: 'gandalf', team: 'A', col: 3, row: 2 },
    { unit: 'aragorn', team: 'A', col: 2, row: 3, hp: 0.7 },
    { unit: 'gimli', team: 'A', col: 4, row: 3, hp: 0.6 },
    { unit: 'lurtz', team: 'B', col: 3, row: 4, hp: 0.85 },
    { unit: 'ugluk', team: 'B', col: 2, row: 4, hp: 0.75 },
    { unit: 'gorbag', team: 'B', col: 4, row: 4, hp: 0.8 },
    { unit: 'grishnakh', team: 'B', col: 3, row: 6, hp: 0.9 },
    { unit: 'gothmog', team: 'B', col: 5, row: 7, hp: 1 },
  ],
  build(c) {
    const S = c.style;
    const [gandalf, aragorn, gimli, lurtz, ugluk, gorbag, grishnakh, gothmog] = this.cast.map((s) => c.actor(s)) as Actor[];
    strike(c, aragorn!, ugluk!, 0.1, 64, 0.08);
    strike(c, lurtz!, aragorn!, 0.35, 70, 0.09);
    strike(c, gimli!, gorbag!, 0.3, 51, 0.07);
    strike(c, gorbag!, gimli!, 0.6, 47, 0.06);
    strike(c, ugluk!, aragorn!, 0.75, 58, 0.07);
    strike(c, aragorn!, ugluk!, 1.6, 64, 0.08);
    strike(c, gimli!, gorbag!, 1.9, 51, 0.07);
    gothmog!.face = gandalf!.home;

    const cast = 0.45;
    const blow = cast + 0.6;
    const centre = lurtz!.home;
    gandalf!.face = centre;
    gandalf!.play(cast, 'cast');
    const staff = tip(gandalf!, 0.5, 0.2, centre);
    c.add(new Glow(c.root, () => staff, (t) => (t >= cast && t < blow ? (S.punchy ? 1.3 : 0.7) * easeOut((t - cast) / 0.6) : t >= blow ? (S.punchy ? 2 : 1.4) * kick(t - blow, 0.5, 0.05) : 0), S.punchy ? 2.2 : 1.4, 0xeaf2ff));
    c.add({
      update(t) {
        if (t < cast || t >= blow + 0.6) return;
        const light = c.light(0);
        light.position.copy(staff);
        light.color.setHex(0xdfe9ff);
        light.intensity = t < blow ? 8 * easeOut((t - cast) / 0.6) : 40 * kick(t - blow, 0.6, 0.05);
      },
    });
    if (S.punchy) {
      c.add(new HexMarks(c.root, hexesWithin(3, 4, 2), 0x9fd0ff, cast, blow, 0.45));
      // Light drawn into the staff as it winds up.
      c.add(new Burst(c.root, { count: 18, at: staff, start: cast, colour: 0xcfe4ff, size: [0.03, 0.06], speed: [-3, -1.5], life: [0.35, 0.55], up: 0.3, gravity: 0, drag: 0.01, glow: true, stagger: 0.2, seed: 3 }));
    }
    const ground = centre.clone().setY(0.05);
    if (S.punchy) {
      c.add(new Ring(c.root, { at: ground, start: blow, seconds: 0.45, from: 0.3, to: 4.2, colour: 0xbfe0ff, opacity: 1, width: 0.2, blending: THREE.AdditiveBlending }));
      c.add(new Ring(c.root, { at: ground.clone().setY(0.06), start: blow + 0.05, seconds: 0.6, from: 0.3, to: 3.6, colour: 0x6fb0ff, opacity: 0.7, width: 0.5, blending: THREE.AdditiveBlending }));
      c.add(new Burst(c.root, { count: 46, at: ground.clone().setY(0.4), start: blow, colour: 0xd8ecff, size: [0.04, 0.09], speed: [4, 10], life: [0.25, 0.55], up: 0.35, gravity: 2, glow: true, seed: 5 }));
      c.screen(blow, '#dcecff', 0.55, 0.3);
    } else {
      c.add(new Ring(c.root, { at: ground, start: blow, seconds: 0.8, from: 0.3, to: 3.8, colour: 0x7a6e60, opacity: 0.4, width: 0.4 }));
      c.add(new Ring(c.root, { at: ground.clone().setY(0.06), start: blow, seconds: 0.35, from: 0.3, to: 3.4, colour: 0xf4f0e6, opacity: 0.35, width: 0.06 }));
      c.add(new Burst(c.root, { count: 24, at: ground.clone().setY(0.1), start: blow, colour: 0x8a7a66, size: [0.04, 0.1], speed: [2, 5], life: [0.4, 0.8], up: 0.9, gravity: 9, shard: true, seed: 5 }));
      c.add(new Burst(c.root, { count: 10, at: ground.clone().setY(0.2), start: blow, colour: 0x6e6252, size: [0.3, 0.5], speed: [2, 3.5], life: [0.8, 1.3], up: 0.1, gravity: -0.2, drag: 3, shape: 'puff', opacity: 0.45, seed: 6 }));
      c.screen(blow, '#f4f0e8', 0.3, 0.3);
    }
    c.stop(blow, 1.6);
    c.shake(blow, 1.4);
    for (const target of [lurtz!, ugluk!, gorbag!, grishnakh!]) {
      const from = target === lurtz ? gandalf!.home : centre;
      impact(c, target, blow, from, 174, 0.2, 'magic', { power: S.punchy ? 1.3 : 1, big: target === lurtz, sparks: false });
      target.play(blow, 'stun').play(blow + 2, 'idle');
      c.add(
        new Daze(
          c.root,
          S.punchy
            ? { head: () => target.head(0).add(new THREE.Vector3(0, 0.25, 0)), start: blow, end: blow + 2, colour: 0xffd34d, count: 3, size: 0.1, radius: 0.34, stars: true, opacity: 1 }
            : { head: () => target.head(0).add(new THREE.Vector3(0, 0.15, 0)), start: blow, end: blow + 2, colour: 0xe8e4da, count: 3, size: 0.035, radius: 0.28, stars: false, opacity: 0.6 },
        ),
      );
    }
  },
};

// ---------------------------------------------------------------------------------------------

const charge: SceneDef = {
  name: 'charge',
  title: 'Forth Eorlingas!',
  who: 'Théoden · charges 3 hexes through his target, stunning what he rides through',
  duration: 2.9,
  camera: { position: [-2.6, 7.4, 7.6], target: [0.5, 0, 0.1] },
  cast: [
    { unit: 'theoden', team: 'A', col: 3, row: 2 },
    { unit: 'aragorn', team: 'A', col: 1, row: 2, hp: 0.8 },
    { unit: 'gorbag', team: 'B', col: 3, row: 3, hp: 0.8 },
    { unit: 'grishnakh', team: 'B', col: 4, row: 4, hp: 0.75 },
    { unit: 'lurtz', team: 'B', col: 2, row: 3, hp: 0.85 },
    { unit: 'ugluk', team: 'B', col: 5, row: 6, hp: 0.9 },
  ],
  build(c) {
    const S = c.style;
    const [theoden, aragorn, gorbag, grishnakh, lurtz, ugluk] = this.cast.map((s) => c.actor(s)) as Actor[];
    const start = fromOffset({ col: 3, row: 2 });
    const step = subtract(fromOffset({ col: 3, row: 3 }), start);
    const line = [1, 2, 3].map((k) => toOffset(add(start, scale(step, k))));
    const end = at(line[2]!.col, line[2]!.row);
    strike(c, gorbag!, theoden!, 0.1, 47, 0.05);
    strike(c, lurtz!, aragorn!, 0.3, 70, 0.09);
    strike(c, aragorn!, lurtz!, 0.9, 64, 0.08);
    strike(c, lurtz!, aragorn!, 1.7, 70, 0.09);

    const cast = 0.45;
    const go = cast + 0.35;
    const arrive = go + 0.5;
    theoden!.face = end.clone().add(new THREE.Vector3().subVectors(end, theoden!.home));
    theoden!.play(cast, 'cast');
    theoden!.move(go, arrive, end);
    ugluk!.face = end;
    if (S.punchy) c.add(new HexMarks(c.root, line.map((h) => at(h.col, h.row)), 0xffd34d, cast, go, 0.3));
    const dir = new THREE.Vector3().subVectors(end, theoden!.home).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    // Each enemy on the line is struck as he reaches it, and thrown aside.
    [gorbag!, grishnakh!].forEach((target, i) => {
      const t = go + ((i + 1) / 3) * (arrive - go) - 0.03;
      const sign = i === 0 ? 1 : -1;
      const aside = target.home.clone().addScaledVector(side, sign * (S.punchy ? 0.6 : 0.35));
      target.move(t, t + 0.12, aside, { hop: S.punchy ? 0.35 : 0, face: false, clip: false });
      target.move(t + 0.55, t + 0.85, target.home, { face: false, clip: false });
      target.play(t, 'stun').play(t + 1, 'idle');
      impact(c, target, t, target.home.clone().addScaledVector(dir, -1).addScaledVector(side, -sign * 0.5), 160, 0.2, 'physical', { power: 1.2, big: true });
      c.stop(t, 0.7);
      c.shake(t, 0.6);
      c.add(
        new Daze(
          c.root,
          S.punchy
            ? { head: () => target.head(0).add(new THREE.Vector3(0, 0.25, 0)).addScaledVector(side, sign * 0.6), start: t + 0.1, end: t + 1, colour: 0xffd34d, count: 3, size: 0.09, radius: 0.32, stars: true, opacity: 1 }
            : { head: () => target.head(0).add(new THREE.Vector3(0, 0.15, 0)).addScaledVector(side, sign * 0.35), start: t + 0.1, end: t + 1, colour: 0xe8e4da, count: 3, size: 0.035, radius: 0.26, stars: false, opacity: 0.6 },
        ),
      );
    });
    // Dust from the hooves, and in the punchy style a trail of light.
    for (let i = 0; i <= 10; i++) {
      const ti = go + (i / 10) * (arrive - go);
      c.add(new Burst(c.root, { count: 3, at: theoden!.position(ti).setY(0.08), start: ti, colour: 0x8a7660, size: [0.12, 0.22], speed: [0.4, 1], life: [0.5, 0.9], up: 0.5, gravity: -0.3, drag: 3, shape: 'puff', opacity: S.punchy ? 0.35 : 0.55, seed: i + 20 }));
    }
    if (S.punchy) {
      c.add(new Ribbon(c.root, { path: (t) => (t < go ? null : theoden!.position(t)), start: go, end: arrive, length: 0.35, width: 1.1, height: 0.06, colour: 0xffd34d, opacity: 0.85, blending: THREE.AdditiveBlending }));
      c.add(new Glow(c.root, (t) => (t >= go && t < arrive ? theoden!.chest(t) : null), () => 1, 2.2, 0xffe08a));
    }
  },
};

// ---------------------------------------------------------------------------------------------

const horn: SceneDef = {
  name: 'horn',
  title: 'Horn of Gondor',
  who: 'Boromir · armour and magic resist for allies within 2 hexes, a shield for himself',
  duration: 3.2,
  camera: { position: [0.8, 8.0, 8.6], target: [0.4, 0, 1.0] },
  cast: [
    { unit: 'boromir', team: 'A', col: 3, row: 3, hp: 0.6 },
    { unit: 'aragorn', team: 'A', col: 2, row: 3, hp: 0.7 },
    { unit: 'faramir', team: 'A', col: 3, row: 1, hp: 0.9 },
    { unit: 'gimli', team: 'A', col: 4, row: 2, hp: 0.8 },
    { unit: 'legolas', team: 'A', col: 5, row: 1, hp: 1 },
    { unit: 'lurtz', team: 'B', col: 3, row: 4, hp: 0.8 },
    { unit: 'ugluk', team: 'B', col: 4, row: 4, hp: 0.7 },
  ],
  build(c) {
    const S = c.style;
    const [boromir, aragorn, faramir, gimli, legolas, lurtz, ugluk] = this.cast.map((s) => c.actor(s)) as Actor[];
    strike(c, lurtz!, boromir!, 0.15, 70, 0.1);
    strike(c, ugluk!, boromir!, 0.4, 58, 0.08);
    strike(c, aragorn!, lurtz!, 0.6, 64, 0.08);
    lurtz!.face = ugluk!.face = boromir!.home;
    legolas!.face = lurtz!.home;
    faramir!.face = lurtz!.home;
    gimli!.face = ugluk!.home;

    const cast = 0.7;
    const blow = cast + 0.45;
    boromir!.play(cast, 'cast');
    const horn = boromir!.head(0).add(new THREE.Vector3(0, 0.2, 0));
    c.add(new Glow(c.root, () => horn, (t) => (t >= cast && t < blow + 0.3 ? (S.punchy ? 1 : 0.4) * easeOut((t - cast) / 0.45) * (1 - smooth((t - blow) / 0.3)) : 0), S.punchy ? 1.4 : 0.7, 0xffd98a));
    const ground = boromir!.home.clone().setY(0.05);
    const allies = [boromir!, aragorn!, faramir!, gimli!];
    if (S.punchy) {
      c.add(new HexMarks(c.root, hexesWithin(3, 3, 2), 0xffc94d, cast, blow, 0.5));
      c.add(new Ring(c.root, { at: ground, start: blow, seconds: 0.5, from: 0.3, to: 3.9, colour: 0xffd34d, opacity: 1, width: 0.16, blending: THREE.AdditiveBlending }));
      c.add(new Ring(c.root, { at: ground.clone().setY(0.06), start: blow + 0.1, seconds: 0.6, from: 0.3, to: 3.6, colour: 0xffe9a8, opacity: 0.6, width: 0.4, blending: THREE.AdditiveBlending }));
      allies.forEach((ally, i) => {
        const t = blow + 0.05 + 0.04 * ally.home.distanceTo(boromir!.home);
        c.add(new Chevrons(c.root, { feet: () => ally.position(t), start: t, colour: i % 2 === 0 ? 0xffd34d : 0xb89cff, count: 3, height: 1.6, size: 0.16, camera: c.camera }));
        c.add(new Chevrons(c.root, { feet: () => ally.position(t), start: t + 0.06, colour: i % 2 === 0 ? 0xb89cff : 0xffd34d, count: 2, height: 1.4, size: 0.13, camera: c.camera }));
        c.add(new Glow(c.root, () => ally.chest(t), (x) => kick(x - t, 0.4, 0.15), 1.6, 0xffd98a));
        c.add(new Ring(c.root, { at: ally.home.clone().setY(0.04), start: t, seconds: 4, from: 0.78, to: 0.8, colour: 0xffd34d, opacity: 0.6, width: 0.1, blending: THREE.AdditiveBlending, sides: 6 }));
      });
    } else {
      c.add(new Ring(c.root, { at: ground, start: blow, seconds: 0.9, from: 0.3, to: 3.7, colour: 0xe8dcc0, opacity: 0.3, width: 0.25 }));
      allies.forEach((ally, i) => {
        const t = blow + 0.08 * ally.home.distanceTo(boromir!.home);
        c.add(new Glow(c.root, () => ally.chest(t), (x) => 0.45 * kick(x - t, 0.5, 0.2), 1.1, 0xffe2a0));
        c.add(new Burst(c.root, { count: 6, at: ally.chest(t), start: t, colour: 0xffd98a, size: [0.02, 0.04], speed: [0.2, 0.5], life: [0.6, 1], up: 2, gravity: -0.8, drag: 1, glow: true, opacity: 0.7, stagger: 0.2, seed: i + 30 }));
      });
    }
    boromir!.shield(blow, 0.3);
    const shieldHits = [1.65 + STRIKE, 2.15 + STRIKE];
    c.add(
      new Shell(c.root, {
        centre: () => boromir!.position(0).setY(boromir!.height * 0.45),
        radius: boromir!.height * 0.62,
        start: blow,
        end: 4,
        colour: S.punchy ? 0x9fd8ff : 0xfff0d0,
        opacity: S.punchy ? 0.1 : 0.05,
        edgeOpacity: S.punchy ? 0.7 : 0.22,
        pop: S.punchy ? 0.35 : 0,
        blending: S.punchy ? THREE.AdditiveBlending : THREE.NormalBlending,
        hits: shieldHits,
      }),
    );
    strike(c, lurtz!, boromir!, 1.65, 70, 0.1);
    strike(c, ugluk!, boromir!, 2.15, 58, 0.08);
    strike(c, aragorn!, lurtz!, 1.95, 64, 0.08);
  },
};

export const SCENES: readonly SceneDef[] = [ranger, fire, pass, charge, horn];
