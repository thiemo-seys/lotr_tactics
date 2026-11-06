// Which effects are live at a display time, and how far through (docs/viewer-spec.md section 5, Effects).

import { MONSTERS, TICKS_PER_SECOND, UNITS, createCombat, type CastEvent, type Combat, type CombatEvent, type DamageEvent } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { fightBoards, type BoardChoice } from '../src/boards.js';
import { Effects, HIT_STOP_TICKS, abilityLook, type HitState, type StatusRing, type MarkState, type MissileState, type ScreenState, type StunState, type Vec3Out } from '../src/effects.js';
import { hexToWorld } from '../src/layout.js';
import { ABILITY_LOOKS, EFFECTS } from '../src/look.js';
import { Playback } from '../src/playback.js';

const T = TICKS_PER_SECOND;

/** A fight between two boards, with its effects, stepped by hand. */
function fight(a: BoardChoice, b: BoardChoice, seed: number, wrap: (combat: Combat) => Combat = (c) => c, stage = 2): { p: Playback; fx: Effects } {
  const p = new Playback(wrap(createCombat({ seed, stage, teams: fightBoards(a, b, seed) })));
  p.playing = false;
  return { p, fx: new Effects(p) };
}

/** Steps a fight to the first cast of an ability, and returns it. */
function toCast(p: Playback, fx: Effects, ability: string): CastEvent {
  for (;;) {
    const cast = p.step().find((e): e is CastEvent => e.type === 'cast' && e.ability === ability);
    fx.update();
    if (cast !== undefined) return cast;
    if (p.combat.isOver()) throw new Error(`no ${ability}`);
  }
}

/** Steps a fight to a tick. */
function stepTo(p: Playback, fx: Effects, tick: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  while (p.combat.tick < tick && !p.combat.isOver()) events.push(...p.step());
  // Past the end, display time runs on through the afterglow.
  if (p.time < tick) p.time = tick;
  fx.update();
  return events;
}

/** The fight, with a `death` event for `unit` added after the sim's own events on `tick`. */
function withDeath(unit: number, tick: number): (fight: Combat) => Combat {
  return (fight) => {
    const events = [...fight.events];
    return {
      get tick() {
        return fight.tick;
      },
      get state() {
        return fight.state;
      },
      get events() {
        return events;
      },
      step() {
        const stepped = fight.step();
        if (fight.tick === tick) stepped.push({ type: 'death', tick, unit });
        events.push(...stepped);
        return stepped;
      },
      isOver: () => fight.isOver(),
      result: () => fight.result(),
    };
  };
}

const mark = (): MarkState => ({ fill: 0, edge: 0 });
const flight = (): MissileState => ({ fromX: 0, fromZ: 0, toX: 0, toZ: 0, share: 0 });
const hitState = (): HitState => ({ flash: 0, x: 0, z: 0, squash: 0, ripple: 0 });

describe('ability looks', () => {
  it('has a colour for every unit’s and monster’s ability, and a projectile for those it looses or lobs', () => {
    const abilities = [...Object.values(UNITS).map((u) => u.ability), ...Object.values(MONSTERS).flatMap((m) => (m.ability === undefined ? [] : [m.ability]))];
    for (const ability of abilities) {
      const look = ABILITY_LOOKS[ability.name];
      expect(look, ability.name).toBeDefined();
      if (ability.delivery !== 'strike') expect(look!.projectile, ability.name).toBeDefined();
    }
  });

  it('gives an ability not in the table its damage type’s look: physical gold, magic blue-white', () => {
    expect(abilityLook('Not an ability', 'physical')).toBe(EFFECTS.abilityDefault.physical);
    expect(abilityLook('Not an ability', 'magic')).toBe(EFFECTS.abilityDefault.magic);
    expect(abilityLook('Fire of Orthanc', 'magic')).toBe(ABILITY_LOOKS['Fire of Orthanc']);
  });
});

describe('wind-up', () => {
  it('lights an area’s hexes from the cast, building towards each one’s landTick, then flashes them and fades', () => {
    const { p, fx } = fight('full', 'traits', 1);
    const cast = toCast(p, fx, 'You shall not pass');
    const aim = cast.aims[0]!;
    // Saruman casts on the same tick; these are Gandalf's.
    const marks = fx.marks.filter((m) => m.start === cast.tick && m.colour === ABILITY_LOOKS['You shall not pass']!.colour);
    expect(marks.length).toBe(aim.hexes.length);
    for (const [i, h] of aim.hexes.entries()) {
      const m = marks[i]!;
      expect(hexToWorld(h.hex)).toEqual({ x: m.x, z: m.z });
      expect(m).toMatchObject({ start: cast.tick, land: h.landTick, team: p.combat.state.units[cast.unit]!.team, colour: ABILITY_LOOKS['You shall not pass']!.colour });
    }
    const m = marks[0]!;
    // The edge firms up through the wind-up; the fill builds, pulsing.
    const early = fx.markInto(mark(), m, cast.tick + 1).edge;
    const late = fx.markInto(mark(), m, m.land - 0.5).edge;
    expect(late).toBeGreaterThan(early);
    expect(fx.markInto(mark(), m, m.land - 0.5).fill).toBeGreaterThan(fx.markInto(mark(), m, cast.tick).fill - 0.06);
    // A flash on the landing, brighter than the wind-up, fading to nothing over 0.35 s.
    expect(fx.markInto(mark(), m, m.land)).toEqual({ fill: 0.55, edge: 0.9 });
    expect(fx.markInto(mark(), m, m.land + 0.35 * T).fill).toBeCloseTo(0, 10);
    expect(m.end).toBeCloseTo(m.land + 0.35 * T, 10);
    // Gone from the list once over.
    stepTo(p, fx, Math.ceil(m.end));
    expect(fx.marks).not.toContain(m);
  });

  it('draws an aim line from the caster to the unit its projectile flies to, firming up until the release', () => {
    const { p, fx } = fight('tanks', 'archers', 1);
    const cast = toCast(p, fx, "Ranger's shot");
    const target = cast.aims[0]!.units[0]!.unit;
    const lines = fx.aimLines.filter((l) => l.source === cast.unit);
    expect(lines).toEqual([expect.objectContaining({ source: cast.unit, target, start: cast.tick, end: cast.releaseTick })]);
    const line = lines[0]!;
    expect(fx.aimFirmness(line, cast.tick)).toBe(0);
    expect(fx.aimFirmness(line, (cast.tick + cast.releaseTick) / 2)).toBeCloseTo(0.5, 10);
    stepTo(p, fx, cast.releaseTick);
    expect(fx.aimLines).not.toContain(line);
  });

  it('gathers a glow at the caster through the wind-up, gone just after the release', () => {
    const { p, fx } = fight('tanks', 'mixed', 1);
    const cast = toCast(p, fx, 'Fire of Orthanc');
    const gather = fx.gathers.find((g) => g.unit === cast.unit)!;
    expect(gather).toMatchObject({ start: cast.tick, release: cast.releaseTick, colour: ABILITY_LOOKS['Fire of Orthanc']!.colour });
    expect(fx.gatherStrength(gather, cast.tick)).toBe(0);
    expect(fx.gatherStrength(gather, cast.releaseTick)).toBe(1);
    expect(fx.gatherStrength(gather, gather.end)).toBe(0);
  });

  it('shows nothing more of a cast whose caster dies in its wind-up', () => {
    // Gandalf casts on 143 (full against traits, seed 1); here he dies 5 ticks later, before his release.
    const probe = fight('full', 'traits', 1);
    const cast = toCast(probe.p, probe.fx, 'You shall not pass');
    const { p, fx } = fight('full', 'traits', 1, withDeath(cast.unit, cast.tick + 5));
    toCast(p, fx, 'You shall not pass');
    const marks = fx.marks.filter((m) => m.start === cast.tick && m.colour === ABILITY_LOOKS['You shall not pass']!.colour);
    expect(marks.length).toBeGreaterThan(0);
    stepTo(p, fx, cast.tick + 5);
    expect(marks.every((m) => m.end <= cast.tick + 5)).toBe(true);
    stepTo(p, fx, cast.tick + 6);
    expect(fx.marks.filter((m) => marks.includes(m))).toEqual([]);
    expect(fx.gathers.filter((g) => g.unit === cast.unit)).toEqual([]);
    // Its landing never comes: no shockwave, shake or hit-stop.
    stepTo(p, fx, cast.releaseTick + 2);
    expect(fx.rings.filter((r) => r.colour === ABILITY_LOOKS['You shall not pass']!.colour)).toEqual([]);
    expect(fx.hitStops.filter((s) => s.units[0] === cast.unit)).toEqual([]);
  });
});

describe('travel', () => {
  it('flies a projectile from the caster’s release to its unit, wherever it is, landing on its landTick', () => {
    const { p, fx } = fight('tanks', 'archers', 1);
    const cast = toCast(p, fx, "Ranger's shot");
    const { unit: target, landTick } = cast.aims[0]!.units[0]!;
    const missiles = fx.missiles.filter((m) => m.start >= cast.releaseTick);
    expect(missiles).toEqual([expect.objectContaining({ kind: 'arrow', from: cast.unit, to: target, start: cast.releaseTick, end: landTick, lob: false })]);
    const missile = missiles[0]!;
    stepTo(p, fx, landTick - 1);
    const half = (cast.releaseTick + landTick) / 2;
    const out = fx.missileInto(flight(), missile, half);
    expect(out.share).toBeCloseTo(0.5, 10);
    expect({ x: out.fromX, z: out.fromZ }).toEqual(p.position(cast.unit, cast.releaseTick));
    expect({ x: out.toX, z: out.toZ }).toEqual(p.position(target, half));
  });

  it('looses one projectile a hit, hitGap ticks apart, for a multi-hit ability', () => {
    const { p, fx } = fight('tanks', 'archers', 1);
    const cast = toCast(p, fx, 'Flurry');
    const aim = cast.aims[0]!;
    expect(aim.hits).toBe(5);
    const own = fx.missiles.filter((m) => m.from === cast.unit);
    const starts = own.map((m) => m.start);
    const ends = own.map((m) => m.end);
    expect(starts).toEqual([0, 1, 2, 3, 4].map((k) => cast.releaseTick + k * aim.hitGap));
    expect(ends).toEqual([0, 1, 2, 3, 4].map((k) => aim.units[0]!.landTick + k * aim.hitGap));
  });

  it('hops a bounce from unit to unit, landing on each one’s landTick, with an aim line to the first only', () => {
    const { p, fx } = fight('tanks', 'random', 2);
    const cast = toCast(p, fx, 'Stone toss');
    const units = cast.aims[0]!.units;
    expect(units.length).toBeGreaterThan(1);
    expect(fx.missiles.filter((m) => m.start >= cast.releaseTick).map((m) => ({ from: m.from, to: m.to, start: m.start, end: m.end, kind: m.kind }))).toEqual(
      units.map((u, i) => ({
        from: i === 0 ? cast.unit : units[i - 1]!.unit,
        to: u.unit,
        start: i === 0 ? cast.releaseTick : units[i - 1]!.landTick,
        end: u.landTick,
        kind: 'stone',
      })),
    );
    expect(fx.aimLines.filter((l) => l.source === cast.unit).map((l) => l.target)).toEqual([units[0]!.unit]);
  });

  it('lobs to the aim’s centre in an arc, landing with its hexes, and leaves a scorch', () => {
    const { p, fx } = fight('tanks', 'mixed', 1);
    const cast = toCast(p, fx, 'Fire of Orthanc');
    const aim = cast.aims[0]!;
    const centre = hexToWorld(aim.centre!);
    const land = aim.hexes[0]!.landTick;
    expect(fx.missiles.filter((m) => m.from === cast.unit)).toEqual([expect.objectContaining({ kind: 'fireball', lob: true, to: null, toX: centre.x, toZ: centre.z, start: cast.releaseTick, end: land })]);
    expect(fx.scorches).toContainEqual(expect.objectContaining({ x: centre.x, z: centre.z, start: land }));
    // The telegraph holds until the lob lands.
    expect(fx.marks.every((m) => m.land === land)).toBe(true);
  });

  it('trails a ribbon behind a charge from departTick to arriveTick, and lights its hexes in turn', () => {
    const { p, fx } = fight('tanks', 'rings', 1);
    const cast = toCast(p, fx, 'Forth Eorlingas!');
    const dash = p.combat.events.find((e) => e.type === 'dash' && e.unit === cast.unit && e.tick === cast.tick);
    if (dash?.type !== 'dash') throw new Error('Théoden should charge');
    expect(fx.ribbons.filter((r) => r.unit === cast.unit)).toEqual([expect.objectContaining({ unit: cast.unit, start: dash.departTick, arrive: dash.arriveTick })]);
    const ribbon = fx.ribbons.find((r) => r.unit === cast.unit)!;
    expect(fx.ribbonStrength(ribbon, dash.departTick + 1)).toBe(1);
    expect(fx.ribbonStrength(ribbon, ribbon.end)).toBe(0);
    expect(fx.marks.filter((m) => m.start === cast.tick).map((m) => m.land)).toEqual(cast.aims[0]!.hexes.map((h) => h.landTick));
  });
});

describe('impact', () => {
  it('bursts sparks at each unit reached, in its damage type’s colour, once the landing comes', () => {
    const { p, fx } = fight('full', 'traits', 1);
    const cast = toCast(p, fx, 'You shall not pass');
    const events = stepTo(p, fx, cast.releaseTick);
    const reached = events.filter((e): e is DamageEvent => e.type === 'damage' && e.source === cast.unit && e.kind === 'ability').map((e) => e.target);
    expect(reached.length).toBeGreaterThan(0);
    // The Ringwraith's Black Breath lands on the same tick, with sparks of its own.
    for (const unit of reached) expect(fx.bursts).toContainEqual(expect.objectContaining({ unit, start: cast.releaseTick, colour: EFFECTS.sparks.magic }));
    // And a shockwave out to the aim's hexes from its centre, with a burst there.
    const centre = hexToWorld(cast.aims[0]!.centre!);
    expect(fx.rings.some((r) => r.x === centre.x && r.z === centre.z && r.start === cast.releaseTick && r.to > 3)).toBe(true);
  });

  it('sweeps a ring over each of a cone’s hexes, out from the caster, rather than a circle round it', () => {
    // Sauron's Sweep, random against random, seed 3, stage 3.
    const { p, fx } = fight('random', 'random', 3, undefined, 3);
    const cast = toCast(p, fx, 'Sweep');
    const aim = cast.aims[0]!;
    expect(aim.select).toBe('cone');
    const rings = fx.rings.filter((r) => r.colour === ABILITY_LOOKS.Sweep!.colour);
    expect(rings.map((r) => ({ x: r.x, z: r.z }))).toEqual(aim.hexes.map((h) => hexToWorld(h.hex)));
    // None reaches past its own hex.
    expect(rings.every((r) => r.to <= 1.1)).toBe(true);
    // The nearest first, from its landing; further ones after.
    const caster = p.position(cast.unit, cast.tick);
    const away = rings.map((r) => Math.hypot(r.x - caster.x, r.z - caster.z));
    const near = Math.min(...away);
    for (const [i, r] of rings.entries()) {
      if (away[i]! < near + 0.1) expect(r.start).toBe(aim.hexes[i]!.landTick);
      else expect(r.start).toBeGreaterThan(aim.hexes[i]!.landTick);
    }
  });

  it('sends a wave over the ground from the caster for an ally aim, dimmer than a shockwave, and a glow at each ally reached', () => {
    const { p, fx } = fight('tanks', 'mixed', 1);
    const cast = toCast(p, fx, 'Horn of Gondor');
    const centre = hexToWorld(cast.aims[0]!.centre!);
    expect(fx.rings.filter((r) => r.colour === ABILITY_LOOKS['Horn of Gondor']!.colour)).toEqual([expect.objectContaining({ x: centre.x, z: centre.z, start: cast.releaseTick, strength: EFFECTS.wave.strength })]);
    expect(EFFECTS.wave.strength).toBeLessThan(1);
    const events = stepTo(p, fx, cast.releaseTick);
    const buffed = new Set(events.filter((e) => e.type === 'status' && e.source === cast.unit).map((e) => (e.type === 'status' ? e.target : -1)));
    expect(new Set(fx.glows.filter((g) => g.start === cast.releaseTick && g.colour === ABILITY_LOOKS['Horn of Gondor']!.colour).map((g) => g.unit))).toEqual(buffed);
  });
});

describe('hits', () => {
  it('flashes, pushes and squashes the target, and holds then drains its lost health', () => {
    const { p, fx } = fight('duel', 'duel', 1);
    let hit: DamageEvent | undefined;
    while (hit === undefined) {
      hit = p.step().find((e): e is DamageEvent => e.type === 'damage' && e.amount > e.absorbed);
      fx.update();
    }
    const { target, tick } = hit;
    const lost = hit.amount - hit.absorbed;
    const out = hitState();
    fx.hitInto(out, target, tick);
    expect(out.flash).toBe(1);
    expect(fx.hitInto(hitState(), target, tick + 4).flash).toBe(0);
    // Pushed 0.22 away at its furthest, and back over 6 ticks.
    const pushes = [1, 1.5, 2, 3].map((dt) => {
      const s = fx.hitInto(hitState(), target, tick + dt);
      return Math.hypot(s.x, s.z);
    });
    expect(Math.max(...pushes)).toBeLessThanOrEqual(EFFECTS.hit.push + 1e-9);
    expect(Math.max(...pushes)).toBeGreaterThan(0.15);
    expect(Math.hypot(fx.hitInto(hitState(), target, tick + 6).x, fx.hitInto(hitState(), target, tick + 6).z)).toBe(0);
    // Away from the attacker.
    const s = fx.hitInto(hitState(), target, tick + 1.2);
    const self = p.position(target, tick);
    const source = p.position(hit.source, tick);
    expect(s.x * (self.x - source.x) + s.z * (self.z - source.z)).toBeGreaterThan(0);
    expect(fx.hitInto(hitState(), target, tick + 1.5).squash).toBeGreaterThan(0);
    // The chunk holds 0.25 s, then drains over 0.35 s.
    expect(fx.drain(target, tick + 0.2 * T)).toBe(lost);
    expect(fx.drain(target, tick + (0.25 + 0.175) * T)).toBeCloseTo(lost / 2, 6);
    expect(fx.drain(target, tick + 0.6 * T)).toBe(0);
  });

  it('flashes a unit hit again while it still flashes only part of the way, so a volley doesn’t keep it white', () => {
    // Legolas's Flurry: 5 arrows into one unit, hitGap ticks apart.
    const { p, fx } = fight('tanks', 'archers', 1);
    const cast = toCast(p, fx, 'Flurry');
    const aim = cast.aims[0]!;
    const target = aim.units[0]!.unit;
    const first = aim.units[0]!.landTick;
    const last = first + (aim.hits - 1) * aim.hitGap;
    stepTo(p, fx, last + 1);
    const hits = fx.hits.filter((h) => h.target === target && h.source === cast.unit);
    expect(hits.length).toBe(aim.hits);
    // Each arrow after the first flashes it only as far as the share of the recovery time since the last hit.
    for (const h of hits.slice(1)) expect(h.flash).toBeLessThanOrEqual(aim.hitGap / (EFFECTS.hit.flashRecover * T) + 1e-9);
    // Through the volley, after the first arrow's flash, it never sits at the peak: the strongest of the flashes, not their sum.
    let most = 0;
    let total = 0;
    let samples = 0;
    for (let t = first + EFFECTS.hit.flashSeconds * T; t <= last + EFFECTS.hit.flashSeconds * T; t += 0.25) {
      const flash = fx.hitInto(hitState(), target, t).flash;
      most = Math.max(most, flash);
      total += flash;
      samples++;
    }
    expect(most).toBeLessThan(0.5);
    expect(total / samples).toBeLessThan(0.2);
    // A hit once the unit has recovered flashes it fully again.
    expect(fx.hitInto(hitState(), target, first).flash).toBe(1);
  });

  it('flashes white at most at an intensity that leaves the model’s shading and livery showing', () => {
    expect(EFFECTS.hit.flashIntensity).toBeGreaterThanOrEqual(0.4);
    expect(EFFECTS.hit.flashIntensity).toBeLessThanOrEqual(0.6);
  });

  it('pops numbers in from 1.7 times their size to their size over 4 ticks', () => {
    const { fx } = fight('duel', 'duel', 1);
    expect(fx.numberScale(10, 10)).toBeCloseTo(1.7, 10);
    expect(fx.numberScale(10, 12)).toBeGreaterThan(1);
    expect(fx.numberScale(10, 12)).toBeLessThan(1.7);
    expect(fx.numberScale(10, 14)).toBe(1);
    expect(fx.numberScale(10, 30)).toBe(1);
  });
});

describe('big moments', () => {
  it('shakes the camera, holds the caster’s and the units reached’s poses, and flashes the screen for an area of radius 2', () => {
    const { p, fx } = fight('full', 'traits', 1);
    const cast = toCast(p, fx, 'You shall not pass');
    stepTo(p, fx, cast.releaseTick);
    const land = cast.releaseTick;
    expect(fx.shakes).toContainEqual(expect.objectContaining({ start: land, amplitude: EFFECTS.big.shake }));
    expect(fx.flashes).toContainEqual(expect.objectContaining({ start: land, colour: ABILITY_LOOKS['You shall not pass']!.colour }));
    const stop = fx.hitStops.find((s) => s.units[0] === cast.unit)!;
    expect(stop.start).toBe(land);
    expect(stop.units[0]).toBe(cast.unit);
    const shake: Vec3Out = { x: 0, y: 0, z: 0 };
    // By up to 0.14, even with the Ringwraith's big moment on the same tick.
    let most = 0;
    for (let dt = 0; dt < 15; dt += 0.25) {
      fx.shakeInto(shake, land + dt);
      most = Math.max(most, Math.abs(shake.x), Math.abs(shake.y), Math.abs(shake.z));
    }
    expect(most).toBeGreaterThan(0.05);
    expect(most).toBeLessThanOrEqual(EFFECTS.big.shake);
    fx.shakeInto(shake, land + 0.5 * T);
    expect(shake).toEqual({ x: 0, y: 0, z: 0 });
    const screen: ScreenState = { colour: 0, strength: 0 };
    expect(fx.screenInto(screen, land).strength).toBeCloseTo(EFFECTS.big.flash, 10);
    expect(fx.screenInto(screen, stop.start + EFFECTS.big.flashSeconds * T).strength).toBe(0);
    // Hit-stop: the pose holds 0.08 s, then catches up at twice the speed, back in step 0.16 s after.
    for (const unit of stop.units) {
      expect(fx.poseTime(unit, land + 1)).toBe(land);
      expect(fx.poseTime(unit, land + HIT_STOP_TICKS - 0.01)).toBe(land);
      expect(fx.poseTime(unit, land + 1.5 * HIT_STOP_TICKS)).toBeCloseTo(land + HIT_STOP_TICKS, 10);
      expect(fx.poseTime(unit, land + 2 * HIT_STOP_TICKS)).toBe(land + 2 * HIT_STOP_TICKS);
    }
    // Other units don't hold, nor does anything else.
    const bystander = p.combat.state.units.findIndex((u, i) => !stop.units.includes(i));
    expect(fx.poseTime(bystander, land + 1)).toBe(land + 1);
  });

  it('keeps a small ability small: no shake, hit-stop or flash', () => {
    const { p, fx } = fight('tanks', 'items', 1);
    const cast = toCast(p, fx, 'Shield bash');
    stepTo(p, fx, cast.releaseTick + 1);
    expect(fx.shakes.filter((s) => s.start === cast.releaseTick)).toEqual([]);
    expect(fx.hitStops.filter((s) => s.units[0] === cast.unit)).toEqual([]);
    expect(fx.flashes.filter((s) => s.start === cast.releaseTick)).toEqual([]);
  });

  it('has no shake, hit-stop, screen flash or squash under reduced motion, and keeps the rest', () => {
    const { p, fx } = fight('full', 'traits', 1);
    const cast = toCast(p, fx, 'You shall not pass');
    stepTo(p, fx, cast.releaseTick);
    fx.still = true;
    const land = cast.releaseTick;
    expect(fx.shakeInto({ x: 0, y: 0, z: 0 }, land + 1)).toEqual({ x: 0, y: 0, z: 0 });
    expect(fx.screenInto({ colour: 0, strength: 0 }, land).strength).toBe(0);
    expect(fx.poseTime(cast.unit, land + 1)).toBe(land + 1);
    const target = fx.hitStops.find((s) => s.units[0] === cast.unit)!.units[1]!;
    const out = fx.hitInto(hitState(), target, land + 1);
    expect(out.squash).toBe(0);
    expect(out.flash).toBeGreaterThan(0);
    expect(fx.marks.length).toBeGreaterThan(0);
    expect(fx.bursts.length).toBeGreaterThan(0);
  });
});

describe('statuses', () => {
  it('circles stars round a stunned unit’s head while its stun lasts', () => {
    const { p, fx } = fight('full', 'traits', 1);
    const cast = toCast(p, fx, 'You shall not pass');
    const events = stepTo(p, fx, cast.releaseTick);
    const stun = events.find((e) => e.type === 'status' && e.status === 'stun' && e.source === cast.unit);
    if (stun?.type !== 'status') throw new Error('Gandalf should stun');
    const out: StunState = { age: 0, left: 0 };
    expect(fx.stunInto(out, stun.target, stun.tick + 3)).toBe(true);
    expect(out.age).toBeCloseTo(3 / T, 10);
    expect(fx.stunInto(out, stun.target, stun.tick - 1)).toBe(false);
  });

  it('raises chevrons in the stat’s colour as a buff starts, and keeps a ring under the unit while it lasts', () => {
    const { p, fx } = fight('tanks', 'mixed', 1);
    const cast = toCast(p, fx, 'Horn of Gondor');
    const events = stepTo(p, fx, cast.releaseTick);
    const buffs = events.filter((e) => e.type === 'status' && e.status === 'buff' && e.source === cast.unit);
    expect(buffs.length).toBeGreaterThan(0);
    for (const b of buffs) {
      if (b.type !== 'status') continue;
      expect(fx.chevrons.some((c) => c.unit === b.target && c.colour === EFFECTS.buff.colours[b.stat!] && c.start === b.tick)).toBe(true);
      expect(fx.statusRings.some((r) => r.unit === b.target && r.kind === 'buff' && r.end === b.expiresTick)).toBe(true);
    }
    // Armour and Magic Resist start together, so their chevrons are set apart.
    const target = (buffs[0] as { target: number }).target;
    expect(fx.chevrons.filter((c) => c.unit === target && c.start === cast.releaseTick).map((c) => c.phase)).toEqual([0, 1]);
    const first = fx.chevrons.find((c) => c.unit === target)!;
    expect(fx.chevronShare(first, 0, first.start)).toBe(0);
    expect(fx.chevronShare(first, 0, first.start + EFFECTS.buff.seconds * T)).toBe(1);
  });

  it('keeps a ring under a slowed unit while the slow lasts', () => {
    const { p, fx } = fight('full', 'traits', 1);
    const cast = toCast(p, fx, 'Warg bite');
    const events = stepTo(p, fx, cast.releaseTick);
    const slow = events.find((e) => e.type === 'status' && e.status === 'slow' && e.source === cast.unit);
    if (slow?.type !== 'status') throw new Error('Sharku should slow');
    expect(fx.statusRings).toContainEqual(expect.objectContaining({ unit: slow.target, kind: 'slow', start: slow.tick, end: slow.expiresTick }));
  });

  it('ends every status mark of a unit as it dies: buff, slow and reduction rings, and chevrons', () => {
    // Legolas dies at 161 under Merry's reduction (full against traits, seed 1), which lasts to about 279.
    const { p, fx } = fight('full', 'traits', 1);
    const shrink = EFFECTS.rings.grow * T;
    const cut: StatusRing[] = [];
    while (!p.combat.isOver()) {
      const events = p.step();
      fx.update();
      for (const e of events) {
        if (e.type !== 'death') continue;
        for (const r of fx.statusRings) {
          if (r.unit !== e.unit) continue;
          expect(r.end).toBeLessThanOrEqual(e.tick + shrink);
          // Still there as the unit dies, then shrinking away as it would at its end.
          if (r.start < e.tick) expect(fx.grow(r, EFFECTS.rings.grow, e.tick)).toBeGreaterThan(0);
          expect(fx.grow(r, EFFECTS.rings.grow, e.tick + shrink)).toBe(0);
          cut.push(r);
        }
        for (const c of fx.chevrons) if (c.unit === e.unit) expect(c.end).toBeLessThanOrEqual(e.tick);
      }
      // Nothing new comes for a dead unit either.
      for (const r of fx.statusRings) {
        const { death } = p.history(r.unit);
        if (death !== null) expect(r.end).toBeLessThanOrEqual(death + shrink);
      }
    }
    const legolas = p.combat.state.units.findIndex((u) => u.unitId === 'legolas' && u.team === 'A');
    expect(p.history(legolas).death).toBe(161);
    expect(cut).toContainEqual(expect.objectContaining({ unit: legolas, kind: 'reduce', end: 161 + shrink }));
  });

  it('puts a shell round a shielded unit until its shield expires, popping as it comes', () => {
    const { p, fx } = fight('duel', 'duel', 1);
    const cast = toCast(p, fx, 'Loyal');
    const events = stepTo(p, fx, cast.releaseTick);
    const shields = events.filter((e) => e.type === 'shield' && e.source === cast.unit);
    expect(shields.length).toBeGreaterThan(0);
    for (const s of shields) {
      if (s.type !== 'shield') continue;
      expect(fx.shells).toContainEqual(expect.objectContaining({ unit: s.target, start: s.tick, end: s.expiresTick, pop: s.tick }));
    }
    const shell = fx.shells[0]!;
    expect(fx.shellPop(shell, shell.pop + 1)).toBeGreaterThan(0);
    expect(fx.shellPop(shell, shell.pop + EFFECTS.shield.popSeconds * T)).toBe(0);
  });
});

describe('deaths and frames', () => {
  it('breaks a dead unit into shards where it would start to sink, over the look’s time', () => {
    const { p, fx } = fight('duel', 'duel', 1);
    let death: CombatEvent | undefined;
    while (death === undefined) {
      death = p.step().find((e) => e.type === 'death');
      fx.update();
    }
    const unit = (death as { unit: number }).unit;
    expect(fx.shardsShare(unit, 0.2, death.tick)).toBeLessThan(0);
    expect(fx.shardsShare(unit, 0.2, death.tick + 0.2 * T)).toBe(0);
    expect(fx.shardsShare(unit, 0.2, death.tick + (0.2 + EFFECTS.shards.seconds) * T)).toBeCloseTo(1, 10);
    const living = p.combat.state.units.findIndex((u) => u.alive);
    expect(fx.shardsShare(living, 0.2, death.tick + 10)).toBeLessThan(0);
  });

  it('lets a unit that dies on the last tick finish a half-second death clip and its shards before the afterglow ends', () => {
    const { p, fx } = fight('duel', 'duel', 1);
    p.playing = true;
    while (!p.combat.isOver()) p.advance(1);
    p.advance(10);
    // The fight ends with its last death (sim-spec 13).
    const last = p.combat.events.findLast((e) => e.type === 'death');
    if (last?.type !== 'death') throw new Error('A Sam should die.');
    expect(last.tick).toBe(p.combat.tick);
    // A death clip lasts at most 0.5 s, and the unit breaks up halfway through it: the shards are gone within the
    // second of afterglow the viewer runs after the fight, at the display time it ends on.
    expect(p.time).toBeCloseTo(last.tick + T, 6);
    expect(fx.shardsShare(last.unit, 0.25)).toBeGreaterThanOrEqual(1);
  });

  it('keeps the same lists from frame to frame between ticks, so a frame allocates nothing', () => {
    const { p, fx } = fight('full', 'traits', 1);
    p.playing = true;
    p.advance(8);
    fx.update();
    const lists = [fx.marks, fx.missiles, fx.hits, fx.bursts, fx.rings, fx.glows, fx.statusRings, fx.shells, fx.chevrons];
    const lengths = lists.map((l) => l.length);
    expect(lengths.some((n) => n > 0)).toBe(true);
    // A frame between ticks: nothing new, nothing over.
    const tick = p.combat.tick;
    p.time = tick + 0.01;
    p.advance(0.1 / T);
    expect(p.combat.tick).toBe(tick);
    fx.update();
    [fx.marks, fx.missiles, fx.hits, fx.bursts, fx.rings, fx.glows, fx.statusRings, fx.shells, fx.chevrons].forEach((list, i) => expect(list).toBe(lists[i]));
    lists.forEach((list, i) => expect(list.length).toBe(lengths[i]));
    // Later, effects that have ended are gone, from the same lists.
    p.advance(2);
    fx.update();
    expect(fx.hits).toBe(lists[2]);
    expect(fx.hits.every((h) => h.end > p.time)).toBe(true);
  });
});
