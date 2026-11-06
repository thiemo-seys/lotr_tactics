// Which effects of abilities, hits and statuses are live at a display time, and how far through
// they are (docs/viewer-spec.md section 5, Effects): the punchy style. It reads the fight's events as
// the playback processes them and keeps a list of each kind of effect; the scene draws them. Every
// effect is a function of display time, so pausing, single steps and the speed control move it as
// they move everything else, and the frame rate changes nothing. Effects come only on the ticks of
// the events that make them, so on frames between ticks this allocates nothing: the lists keep
// their arrays, ended effects are dropped in place, and the queries write into what they are given.
// No Three.js and no DOM, so it can be tested.

import {
  MONSTERS,
  TICKS_PER_SECOND,
  UNITS,
  distance,
  type AbilityDef,
  type AbilityStep,
  type BuffStat,
  type CastAim,
  type CastEvent,
  type CombatEvent,
  type DamageType,
  type Hex,
  type Team,
  type UnitState,
} from '@lotr-tactics/sim';
import { hexToWorld, type Point } from './layout.js';
import { ABILITY_LOOKS, EFFECTS, type AbilityLook, type ProjectileKind } from './look.js';
import type { MutablePoint, Playback } from './playback.js';

const T = TICKS_PER_SECOND;

/** Seconds of the look's times as ticks of display time. */
const ticks = (seconds: number): number => seconds * T;

/** Something drawn from `start` until it ends at `end`, in ticks: live while start ≤ t < end. */
export interface Timed {
  readonly start: number;
  /** Brought forward if the caster dies before it comes (`cancel`). */
  end: number;
}

/** The glow gathering at a caster through its wind-up, until just after its release. */
export interface Gather extends Timed {
  readonly unit: number;
  readonly colour: number;
  readonly release: number;
}

/**
 * A hex an enemy aim locked (a telegraph): lit from the cast, building and pulsing faster towards
 * `land`, when it flashes and fades. Its fill is the ability's colour and its edge the caster's side's.
 */
export interface HexMark extends Timed {
  readonly x: number;
  readonly z: number;
  readonly land: number;
  readonly colour: number;
  /** The caster's team; the scene edges it in the colour of the side it is drawn as. */
  readonly team: Team;
}

/** A thin line from a caster to a unit its projectile will fly to, firming up through the wind-up. */
export interface AimLine extends Timed {
  readonly source: number;
  readonly target: number;
  readonly colour: number;
  readonly team: Team;
}

/**
 * Something an ability looses or lobs: from `from`'s position at `start` (the caster, or for a
 * bounce's later hops the unit it hopped from) to `to` wherever it is, or to a point on the board,
 * landing at `end`.
 */
export interface Missile extends Timed {
  readonly kind: ProjectileKind;
  readonly colour: number;
  /** The unit it leaves from, which it leaves at the height of: the caster, or the unit a bounce hops from. */
  readonly from: number;
  /** The unit it flies to, or null for a point. */
  readonly to: number | null;
  readonly toX: number;
  readonly toZ: number;
  /** A lob, in an arc from the caster's hand or staff to the ground. */
  readonly lob: boolean;
}

/** The ribbon of light a charge leaves behind it, fading once it arrives. */
export interface Ribbon extends Timed {
  readonly unit: number;
  arrive: number;
  readonly colour: number;
}

/** A burst of sparks: at a unit's chest where it stood at `start`, or at a point at `y`. */
export interface Burst extends Timed {
  readonly unit: number | null;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly colour: number;
  readonly count: number;
  /** How far out the sparks fly, in world units a second at first. */
  readonly speed: number;
  /** Scatters each burst's sparks its own way. */
  readonly seed: number;
  /** A lob's blast, with a big glow at its heart that lights the ground round it. */
  readonly heart: boolean;
}

/** A glow: at a unit's chest, following it, or at a point at `y`. */
export interface Glow extends Timed {
  readonly unit: number | null;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly colour: number;
  readonly size: number;
}

/** A ring on the ground growing from `from` to `to` in radius: a shockwave, or an ally wave. */
export interface GroundRing extends Timed {
  readonly x: number;
  readonly z: number;
  readonly from: number;
  readonly to: number;
  readonly colour: number;
  /** How bright it starts, from 0 to 1. */
  readonly strength: number;
}

/** A dark mark a lob leaves on the ground. */
export interface Scorch extends Timed {
  readonly x: number;
  readonly z: number;
}

/** A hit, from a `damage` event: the target flashes, is pushed and squashes, and its bar drains. */
export interface Hit extends Timed {
  readonly target: number;
  readonly source: number;
  /** The health it took. */
  readonly lost: number;
  /** What a shield absorbed, which ripples the shell. */
  readonly absorbed: number;
  /**
   * How white it flashes at first, from 0 to 1: all the way, unless the unit was hit less than
   * EFFECTS.hit.flashRecover before, when it flashes as far as that share of it, so a volley doesn't
   * keep it white.
   */
  readonly flash: number;
}

/** Chevrons rising round a unit as a buff starts. `phase` sets apart the buffs that start together. */
export interface Chevrons extends Timed {
  readonly unit: number;
  readonly colour: number;
  readonly phase: number;
}

/** A thin ring under a unit while a buff, slow or reduction lasts. A reduction's darkens the ground. */
export interface StatusRing extends Timed {
  readonly unit: number;
  readonly kind: 'buff' | 'slow' | 'reduce';
  readonly colour: number;
}

/**
 * The shell round a shielded unit, from its first shield until the last expires; the scene shows it
 * only while the unit has a shield, so one used up is gone. A new shield while it lasts pops it again.
 */
export interface Shell extends Timed {
  readonly unit: number;
  /** The last tick a shield came, which it pops from. */
  pop: number;
}

/** A big moment's camera shake, by up to `amplitude`. */
export interface Shake extends Timed {
  readonly amplitude: number;
}

/** The caster and the units a big moment reached hold their pose from `start`, then catch up. */
export interface HitStop extends Timed {
  readonly units: readonly number[];
}

/** The whole screen flashing, faintly, in an ability's colour. */
export interface ScreenFlash extends Timed {
  readonly colour: number;
  readonly strength: number;
}

/** How a hit leaves a unit at a moment (`hitInto`). */
export interface HitState {
  /** How white it flashes, from 0 to 1. */
  flash: number;
  /** How far it is pushed, along the ground. */
  x: number;
  z: number;
  /** How far it squashes, from 0 to 1 of the look's squash. */
  squash: number;
  /** How far its shell ripples, from 0 to 1. */
  ripple: number;
}

/** How bright a telegraphed hex is (`markInto`): its fill and its edge, from 0 to 1. */
export interface MarkState {
  fill: number;
  edge: number;
}

/** Where a missile is going (`missileInto`): along the ground from and to, and how far along. */
export interface MissileState {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  /** From 0 as it leaves to 1 as it lands. */
  share: number;
}

/** A shake's offset, or anything else in three dimensions. */
export interface Vec3Out {
  x: number;
  y: number;
  z: number;
}

/** The screen's flash at a moment (`screenInto`). */
export interface ScreenState {
  colour: number;
  strength: number;
}

/** A stun at a moment (`stunInto`): seconds since it started, and until it ends. */
export interface StunState {
  age: number;
  left: number;
}

/** Ticks a hit-stop holds, and then takes to catch up at twice the speed. */
export const HIT_STOP_TICKS = ticks(EFFECTS.big.hitStop);

/** The look of an ability: from the table by its name, or its damage type's default. */
export function abilityLook(name: string, damageType: DamageType = 'physical'): AbilityLook {
  return ABILITY_LOOKS[name] ?? EFFECTS.abilityDefault[damageType];
}

/** A unit's or monster's ability, if it has one. */
export function abilityOf(unitId: UnitState['unitId']): AbilityDef | null {
  if (unitId in UNITS) return UNITS[unitId as keyof typeof UNITS].ability;
  if (unitId in MONSTERS) return MONSTERS[unitId as keyof typeof MONSTERS].ability ?? null;
  return null;
}

/** The damage type of an ability's first damage, physical if it deals none. */
export function damageTypeOf(ability: AbilityDef | null): DamageType {
  const first = (steps: readonly AbilityStep[]): DamageType | null => {
    for (const step of steps) {
      if ('steps' in step) {
        const type = first(step.steps);
        if (type !== null) return type;
        continue;
      }
      for (const effect of step.effects) if (effect.kind === 'damage') return effect.type;
    }
    return null;
  };
  return (ability === null ? null : first(ability.steps)) ?? 'physical';
}

/** A landing of a cast: the units its events reached on that tick, which decide its sparks and whether it is big. */
interface Landing {
  readonly tick: number;
  /** An area of radius `big.flashRadius` or more, or a lob: a big one flashes the screen. */
  flash: boolean;
  readonly reached: number[];
  /** For each unit reached, its damage type if the ability damaged it, or null. */
  readonly types: (DamageType | null)[];
  done: boolean;
}

/** An effect that needs its caster alive until `needs`: one that hasn't come by the caster's death never does. */
interface Owned {
  readonly effect: Timed;
  readonly needs: number;
}

/** A cast whose landings are still to come. */
interface CastFx {
  readonly unit: number;
  readonly team: Team;
  readonly look: AbilityLook;
  readonly tick: number;
  readonly release: number;
  readonly charge: boolean;
  readonly landings: Landing[];
  readonly owned: Owned[];
}

/** How far a shockwave reaches past the centre of the furthest hex: about half a hex. */
const HEX_REACH = 0.9;

/** How far apart neighbouring hexes' centres are: a cone's sweep starts at the nearest. */
const HEX_WIDTH = Math.sqrt(3);

/** Scratch points, so the queries allocate nothing. */
const at: MutablePoint = { x: 0, z: 0 };
const other: MutablePoint = { x: 0, z: 0 };

export class Effects {
  /** Reduced motion: no shake, hit-stop, screen flash or squash (section 5, Effects). */
  still = false;
  readonly gathers: Gather[] = [];
  readonly marks: HexMark[] = [];
  readonly aimLines: AimLine[] = [];
  readonly missiles: Missile[] = [];
  readonly ribbons: Ribbon[] = [];
  readonly bursts: Burst[] = [];
  readonly glows: Glow[] = [];
  readonly rings: GroundRing[] = [];
  readonly scorches: Scorch[] = [];
  readonly hits: Hit[] = [];
  readonly chevrons: Chevrons[] = [];
  readonly statusRings: StatusRing[] = [];
  readonly shells: Shell[] = [];
  readonly shakes: Shake[] = [];
  readonly hitStops: HitStop[] = [];
  readonly flashes: ScreenFlash[] = [];
  /** How many of the fight's events have been read. */
  private read = 0;
  /** Casts with landings still to come. */
  private readonly pending: CastFx[] = [];
  /** Each unit's latest cast, while it lasts, by unit id. */
  private readonly casting: (CastFx | undefined)[] = [];
  /** Counts bursts, to scatter each one's sparks its own way. */
  private bursted = 0;
  /** The tick each unit was last hit on, by unit id, for how far a new hit flashes it. */
  private readonly lastHit: number[] = [];

  constructor(readonly playback: Playback) {
    this.update();
  }

  /**
   * Reads the events of the ticks processed since the last call, settles the landings that have come
   * and drops the effects that have ended. The scene calls it each frame before drawing.
   */
  update(): void {
    const { events } = this.playback.combat;
    for (; this.read < events.length; this.read++) this.record(events[this.read]!);
    this.settle(this.playback.combat.tick);
    const time = this.playback.time;
    for (let i = 0; i < this.lists.length; i++) prune(this.lists[i]!, time);
  }

  private readonly lists: readonly Timed[][] = [
    this.gathers,
    this.marks,
    this.aimLines,
    this.missiles,
    this.ribbons,
    this.bursts,
    this.glows,
    this.rings,
    this.scorches,
    this.hits,
    this.chevrons,
    this.statusRings,
    this.shells,
    this.shakes,
    this.hitStops,
    this.flashes,
  ];

  // Queries, for the scene to draw a frame. Each writes into what it is given, or returns a number.

  /** How bright a telegraphed hex is at `time`: building and pulsing faster towards its landing, then flashing and fading. */
  markInto(out: MarkState, mark: HexMark, time = this.playback.time): MarkState {
    if (time < mark.land) {
      const x = clamp01((time - mark.start) / Math.max(1, mark.land - mark.start));
      const pulse = 0.5 + 0.5 * Math.sin(x * x * 26);
      out.fill = 0.08 + 0.14 * x + 0.06 * pulse;
      out.edge = 0.35 + 0.45 * x;
    } else {
      const fade = 1 - easeOut((time - mark.land) / ticks(EFFECTS.telegraph.linger));
      out.fill = 0.55 * fade;
      out.edge = 0.9 * fade;
    }
    return out;
  }

  /** How firm an aim line is, from 0 as the wind-up starts to 1 at its end. */
  aimFirmness(line: AimLine, time = this.playback.time): number {
    return clamp01((time - line.start) / Math.max(1, line.end - line.start));
  }

  /** How strong the glow gathering at a caster is: up through the wind-up, then out just after the release. */
  gatherStrength(gather: Gather, time = this.playback.time): number {
    if (time < gather.release) return easeOut((time - gather.start) / Math.max(1, gather.release - gather.start));
    return 1 - clamp01((time - gather.release) / Math.max(1e-6, gather.end - gather.release));
  }

  /** Where a missile flies from and to along the ground at `time`, and how far along it is. */
  missileInto(out: MissileState, missile: Missile, time = this.playback.time): MissileState {
    const from = this.playback.positionInto(at, missile.from, missile.start);
    out.fromX = from.x;
    out.fromZ = from.z;
    if (missile.to === null) {
      out.toX = missile.toX;
      out.toZ = missile.toZ;
    } else {
      const to = this.playback.positionInto(other, missile.to, Math.min(time, missile.end));
      out.toX = to.x;
      out.toZ = to.z;
    }
    out.share = clamp01((time - missile.start) / Math.max(1e-6, missile.end - missile.start));
    return out;
  }

  /** How much of a ribbon shows: 1 while its charge rides, fading once it arrives. */
  ribbonStrength(ribbon: Ribbon, time = this.playback.time): number {
    return 1 - smooth((time - ribbon.arrive) / Math.max(1e-6, ribbon.end - ribbon.arrive));
  }

  /** How a unit's hits leave it at `time`: its flash, push, squash and its shell's ripple. */
  hitInto(out: HitState, unit: number, time = this.playback.time): HitState {
    out.flash = 0;
    out.x = 0;
    out.z = 0;
    out.squash = 0;
    out.ripple = 0;
    const { hit } = EFFECTS;
    const flashTicks = ticks(hit.flashSeconds);
    const pushTicks = ticks(hit.pushSeconds);
    const squashTicks = ticks(hit.squashSeconds);
    const rippleTicks = ticks(EFFECTS.shield.ripple);
    let pushX = 0;
    let pushZ = 0;
    for (let i = 0; i < this.hits.length; i++) {
      const h = this.hits[i]!;
      if (h.target !== unit) continue;
      const age = time - h.start;
      if (age < 0) continue;
      // The strongest flash, not their sum: a hit that comes while the unit still flashes flashes less (Hit, flash).
      if (age < flashTicks) out.flash = Math.max(out.flash, h.flash * (1 - age / flashTicks) ** 2);
      if (!this.still) out.squash = Math.max(out.squash, kick(age, squashTicks, 0.25));
      if (h.absorbed > 0) out.ripple = Math.max(out.ripple, kick(age, rippleTicks, 0.1));
      const push = kick(age, pushTicks, 0.18);
      if (push <= 0 || h.source === unit) continue;
      // Away from where the source stood as it struck, from where the unit stood then.
      const self = this.playback.positionInto(at, unit, h.start);
      const source = this.playback.positionInto(other, h.source, h.start);
      const dx = self.x - source.x;
      const dz = self.z - source.z;
      const length = Math.hypot(dx, dz);
      if (length < 1e-6) continue;
      pushX += (dx / length) * push;
      pushZ += (dz / length) * push;
    }
    // Several hits at once push no further than one.
    const length = Math.hypot(pushX, pushZ);
    const scale = length > 1 ? hit.push / length : hit.push;
    out.x = pushX * scale;
    out.z = pushZ * scale;
    return out;
  }

  /** How much health a unit's draining chunk shows at `time`: what it just lost, held, then draining. */
  drain(unit: number, time = this.playback.time): number {
    const hold = ticks(EFFECTS.drain.hold);
    const drain = ticks(EFFECTS.drain.seconds);
    let total = 0;
    for (let i = 0; i < this.hits.length; i++) {
      const h = this.hits[i]!;
      if (h.target !== unit || h.lost <= 0) continue;
      const age = time - h.start;
      if (age < 0) continue;
      total += h.lost * (age < hold ? 1 : 1 - clamp01((age - hold) / drain));
    }
    return total;
  }

  /**
   * The display time a unit's clip is posed at: `time`, except through a big moment's hit-stop that
   * holds it, which holds its pose for HIT_STOP_TICKS from the moment, then catches it up at twice
   * the speed, so it is back in step HIT_STOP_TICKS later. Under reduced motion, `time`.
   */
  poseTime(unit: number, time = this.playback.time): number {
    if (this.still) return time;
    for (let i = this.hitStops.length - 1; i >= 0; i--) {
      const stop = this.hitStops[i]!;
      const into = time - stop.start;
      if (into < 0 || into >= 2 * HIT_STOP_TICKS || !stop.units.includes(unit)) continue;
      return into < HIT_STOP_TICKS ? stop.start : stop.start + 2 * (into - HIT_STOP_TICKS);
    }
    return time;
  }

  /** How far the camera is shaken at `time`; nothing under reduced motion. */
  shakeInto(out: Vec3Out, time = this.playback.time): Vec3Out {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    if (this.still) return out;
    let amplitude = 0;
    for (let i = 0; i < this.shakes.length; i++) {
      const shake = this.shakes[i]!;
      const age = (time - shake.start) / T;
      if (age < 0 || time >= shake.end) continue;
      amplitude += shake.amplitude * Math.exp(-age * 11);
    }
    if (amplitude === 0) return out;
    // Big moments together shake no further than one.
    amplitude = Math.min(amplitude, EFFECTS.big.shake);
    const seconds = time / T;
    out.x = amplitude * Math.sin(seconds * 97);
    out.y = amplitude * 0.7 * Math.sin(seconds * 131 + 1.3);
    out.z = amplitude * 0.4 * Math.sin(seconds * 71 + 2.1);
    return out;
  }

  /** The screen's flash at `time`: the strongest live one; none under reduced motion. */
  screenInto(out: ScreenState, time = this.playback.time): ScreenState {
    out.strength = 0;
    if (this.still) return out;
    for (let i = 0; i < this.flashes.length; i++) {
      const flash = this.flashes[i]!;
      if (time < flash.start || time >= flash.end) continue;
      const strength = flash.strength * (1 - (time - flash.start) / (flash.end - flash.start)) ** 2;
      if (strength > out.strength) {
        out.strength = strength;
        out.colour = flash.colour;
      }
    }
    return out;
  }

  /** How big a floating number is, from EFFECTS.numbers.pop times its size as it starts to its size. */
  numberScale(startTick: number, time = this.playback.time): number {
    const x = (time - startTick) / ticks(EFFECTS.numbers.seconds);
    return x < 0 || x >= 1 ? 1 : 1 + (EFFECTS.numbers.pop - 1) * (1 - easeOut(x));
  }

  /** Whether a unit is stunned at `time`, and if so, for how long it has been and will be, in seconds. */
  stunInto(out: StunState, unit: number, time = this.playback.time): boolean {
    const { stuns, death } = this.playback.history(unit);
    if (death !== null && death <= time) return false;
    for (let i = stuns.length - 1; i >= 0; i--) {
      const stun = stuns[i]!;
      if (stun.tick > time) continue;
      if (time >= stun.endTick) return false;
      out.age = (time - stun.tick) / T;
      out.left = (stun.endTick - time) / T;
      return true;
    }
    return false;
  }

  /** How far into its rise a chevron is, `index` of the look's count, from 0 to 1; outside it, below 0 or 1 and above. */
  chevronShare(chevrons: Chevrons, index: number, time = this.playback.time): number {
    const { buff } = EFFECTS;
    return (time - chevrons.start - ticks(buff.gap * (index + chevrons.phase * 0.5))) / ticks(buff.seconds);
  }

  /** How big a status ring or shell is, from 0 as it starts to 1, and back to 0 as it ends. */
  grow(effect: Timed, seconds: number, time = this.playback.time): number {
    const span = ticks(seconds);
    return easeOut((time - effect.start) / span) * (1 - smooth((time - (effect.end - span)) / span));
  }

  /** How far a shell's pop is, from 1 as a shield comes, to 0. */
  shellPop(shell: Shell, time = this.playback.time): number {
    return kick(time - shell.pop, ticks(EFFECTS.shield.popSeconds), 0.3);
  }

  /**
   * How far a dead unit has broken up, from 0 as it breaks, where it would start to sink,
   * `delaySeconds` after its death (section 5, Death), to 1 once its shards have gone; below 0
   * before, and always below 0 for a living unit.
   */
  shardsShare(unit: number, delaySeconds: number, time = this.playback.time): number {
    const { death } = this.playback.history(unit);
    if (death === null) return -1;
    return (time - death - ticks(delaySeconds)) / ticks(EFFECTS.shards.seconds);
  }

  // Recording

  private record(e: CombatEvent): void {
    switch (e.type) {
      case 'cast':
        this.cast(e);
        break;
      case 'dash': {
        // A charge's ribbon, from its cast.
        const cast = this.casting[e.unit];
        if (cast?.charge === true && cast.tick === e.tick) {
          const ribbon: Ribbon = { start: e.departTick, end: e.arriveTick + ticks(EFFECTS.ribbon.fade), arrive: e.arriveTick, unit: e.unit, colour: cast.look.colour };
          this.ribbons.push(ribbon);
          cast.owned.push({ effect: ribbon, needs: e.departTick });
        }
        break;
      }
      case 'damage': {
        const { hit, drain, shield } = EFFECTS;
        const lasts = ticks(Math.max(hit.pushSeconds, hit.squashSeconds, hit.flashSeconds, drain.hold + drain.seconds, shield.ripple));
        const since = e.tick - (this.lastHit[e.target] ?? -Infinity);
        this.lastHit[e.target] = e.tick;
        const flash = clamp01(since / ticks(hit.flashRecover));
        this.hits.push({ start: e.tick, end: e.tick + lasts, target: e.target, source: e.source, lost: e.amount - e.absorbed, absorbed: e.absorbed, flash });
        if (e.kind === 'ability') this.reach(e.source, e.target, e.tick, e.damageType);
        break;
      }
      case 'heal':
        this.reach(e.source, e.target, e.tick, null);
        break;
      case 'shield': {
        this.reach(e.source, e.target, e.tick, null);
        const shell = this.shells.find((s) => s.unit === e.target && s.end > e.tick);
        if (shell === undefined) this.shells.push({ start: e.tick, end: e.expiresTick, unit: e.target, pop: e.tick });
        else {
          shell.end = Math.max(shell.end, e.expiresTick);
          shell.pop = e.tick;
        }
        break;
      }
      case 'status':
        this.reach(e.source, e.target, e.tick, null);
        // A dead unit shows no status (and the sim gives it none); its marks ended as it died.
        if (this.dead(e.target, e.tick)) break;
        if (e.status === 'buff' && e.stat !== null) {
          const colour = EFFECTS.buff.colours[e.stat as BuffStat];
          const phase = this.chevrons.filter((c) => c.unit === e.target && c.start === e.tick).length;
          this.chevrons.push({ start: e.tick, end: e.tick + ticks(EFFECTS.buff.gap * (EFFECTS.buff.count + phase) + EFFECTS.buff.seconds), unit: e.target, colour, phase });
          // Buffs for the rest of the fight (traits and items) rise as they start, and keep no ring.
          if (e.expiresTick !== null) this.statusRing(e.target, 'buff', colour, e.tick, e.expiresTick);
        } else if (e.status === 'slow' && e.expiresTick !== null) {
          this.statusRing(e.target, 'slow', EFFECTS.rings.slow, e.tick, e.expiresTick);
        } else if (e.status === 'reduce' && e.expiresTick !== null) {
          this.statusRing(e.target, 'reduce', EFFECTS.rings.reduce, e.tick, e.expiresTick);
        }
        break;
      case 'death': {
        const cast = this.casting[e.unit];
        if (cast !== undefined) this.cancel(cast, e.tick);
        this.endStatuses(e.unit, e.tick);
        break;
      }
      default:
        break;
    }
  }

  /** Whether a unit has died by `tick`. */
  private dead(unit: number, tick: number): boolean {
    const { death } = this.playback.history(unit);
    return death !== null && death <= tick;
  }

  /**
   * A unit died on `tick`: its status marks end with it, rather than on its empty hex until the
   * status would have expired. Its rings shrink away over EFFECTS.rings.grow from the death, as they
   * would at their end; its chevrons stop. Stun stars and shells read the unit's state and history
   * (`stunInto`, and the scene's `shielded`), so they are gone already.
   */
  private endStatuses(unit: number, tick: number): void {
    const shrink = ticks(EFFECTS.rings.grow);
    for (const ring of this.statusRings) if (ring.unit === unit) ring.end = Math.max(ring.start, Math.min(ring.end, tick + shrink));
    for (const chevrons of this.chevrons) if (chevrons.unit === unit) chevrons.end = Math.max(chevrons.start, Math.min(chevrons.end, tick));
  }

  /** A ring under a unit, or the one it has of that kind lasting longer. */
  private statusRing(unit: number, kind: StatusRing['kind'], colour: number, tick: number, end: number): void {
    const ring = this.statusRings.find((r) => r.unit === unit && r.kind === kind && r.end > tick);
    if (ring === undefined) this.statusRings.push({ start: tick, end, unit, kind, colour });
    else ring.end = Math.max(ring.end, end);
  }

  /** What a cast shows from its wind-up to its landings, from its aims (sim-spec section 14, Aims). */
  private cast(e: CastEvent): void {
    const { playback } = this;
    const unit = playback.combat.state.units[e.unit]!;
    const look = abilityLook(e.ability, damageTypeOf(abilityOf(unit.unitId)));
    const team = playback.history(e.unit).team ?? unit.team;
    const caster = playback.position(e.unit, e.tick);
    const cast: CastFx = {
      unit: e.unit,
      team,
      look,
      tick: e.tick,
      release: e.releaseTick,
      charge: e.aims.some((aim) => aim.delivery === 'charge'),
      landings: [],
      owned: [],
    };
    const own = <E extends Timed>(list: E[], effect: E, needs: number): void => {
      list.push(effect);
      cast.owned.push({ effect, needs });
    };
    own(this.gathers, { start: e.tick, end: e.releaseTick + ticks(EFFECTS.gather.fade), unit: e.unit, colour: look.colour, release: e.releaseTick }, Infinity);

    for (const aim of e.aims) {
      // Projectiles and lobs that have left land if the caster dies; strikes, dashes and charges need it.
      const flies = aim.delivery === 'projectile' || aim.delivery === 'lob';
      const area = aim.select === 'area' && aim.centre !== null && aim.hexes.some((h) => distance(h.hex, aim.centre!) >= EFFECTS.big.flashRadius);
      for (const h of aim.hexes) this.landing(cast, h.landTick, area || aim.delivery === 'lob');
      for (const u of aim.units) for (let k = 0; k < aim.hits; k++) this.landing(cast, u.landTick + k * aim.hitGap, false);

      if (aim.side === 'ally') {
        // A wave on the ground from the caster through the hexes; the units reached glow as they are.
        if (aim.hexes.length > 0) {
          const centre = aim.centre === null ? caster : hexToWorld(aim.centre);
          const land = aim.hexes[0]!.landTick;
          const { wave } = EFFECTS;
          own(this.rings, { start: land, end: land + ticks(wave.seconds), x: centre.x, z: centre.z, from: 0.3, to: reach(centre, aim.hexes), colour: look.colour, strength: wave.strength }, land);
        }
        continue;
      }

      // Telegraph: the hexes, lit until each lands.
      for (const h of aim.hexes) {
        const { x, z } = hexToWorld(h.hex);
        own(this.marks, { start: e.tick, end: h.landTick + ticks(EFFECTS.telegraph.linger), x, z, land: h.landTick, colour: look.colour, team }, flies ? e.releaseTick : h.landTick);
      }

      if (aim.delivery === 'projectile' && aim.units.length > 0) this.projectiles(cast, aim, e, own);
      else if (aim.delivery === 'projectile' && aim.hexes.length > 0) {
        // A line projectile flies along its hexes, from the caster to the last.
        const last = aim.hexes.at(-1)!;
        const to = hexToWorld(last.hex);
        own(this.missiles, { start: e.releaseTick, end: last.landTick, kind: look.projectile ?? 'arrow', colour: look.colour, from: e.unit, to: null, toX: to.x, toZ: to.z, lob: false }, e.releaseTick);
      } else if (aim.delivery === 'lob' && aim.hexes.length > 0) {
        const centre = hexToWorld(aim.centre ?? aim.hexes[0]!.hex);
        const land = aim.hexes[0]!.landTick;
        own(this.missiles, { start: e.releaseTick, end: land, kind: look.projectile ?? 'fireball', colour: look.colour, from: e.unit, to: null, toX: centre.x, toZ: centre.z, lob: true }, e.releaseTick);
        const { scorch } = EFFECTS;
        own(this.scorches, { start: land, end: land + ticks(scorch.seconds), x: centre.x, z: centre.z }, e.releaseTick);
      }

      // Impact: a shockwave out to the hexes, from the centre; or at each hex of a line or charge as it
      // lands, and of a cone in a sweep out from the caster, so a cone shows its hexes, not a circle.
      if (aim.hexes.length === 0) continue;
      const { shockwave } = EFFECTS;
      const needs = flies ? e.releaseTick : 0;
      if (aim.select === 'line' || aim.select === 'cone') {
        const cone = aim.select === 'cone';
        for (const h of aim.hexes) {
          const { x, z } = hexToWorld(h.hex);
          const start = h.landTick + (cone ? ticks(shockwave.sweep) * Math.max(0, Math.hypot(x - caster.x, z - caster.z) - HEX_WIDTH) : 0);
          own(this.rings, { start, end: start + ticks(shockwave.seconds) * 0.7, x, z, from: 0.2, to: 1.1, colour: look.colour, strength: 1 }, needs || h.landTick);
        }
      } else {
        const centre = aim.centre === null ? caster : hexToWorld(aim.centre);
        const land = aim.hexes[0]!.landTick;
        const to = reach(centre, aim.hexes);
        own(this.rings, { start: land, end: land + ticks(shockwave.seconds), x: centre.x, z: centre.z, from: 0.3, to, colour: look.colour, strength: 1 }, needs || land);
        // A second ring a moment behind the first, not as far.
        own(this.rings, { start: land + 1.5, end: land + 1.5 + ticks(shockwave.seconds) * 1.2, x: centre.x, z: centre.z, from: 0.3, to: to * 0.85, colour: look.colour, strength: 0.3 }, needs || land);
        const heart = aim.delivery === 'lob';
        own(this.bursts, { start: land, end: land + ticks(0.6), unit: null, x: centre.x, y: 0.35, z: centre.z, colour: look.colour, count: Math.min(46, 10 + 6 * aim.hexes.length), speed: 4 + 2 * to, seed: this.bursted++, heart }, needs || land);
      }
    }
    this.pending.push(cast);
    this.casting[e.unit] = cast;
  }

  /** An aim of units by projectile: an aim line to each, and one projectile a hit, or a bounce hopping along them. */
  private projectiles(cast: CastFx, aim: CastAim, e: CastEvent, own: <E extends Timed>(list: E[], effect: E, needs: number) => void): void {
    const { look, team } = cast;
    const kind = look.projectile ?? 'arrow';
    const bounce = aim.select === 'bounce';
    for (let i = 0; i < aim.units.length; i++) {
      const u = aim.units[i]!;
      if (!bounce || i === 0) own(this.aimLines, { start: e.tick, end: e.releaseTick, source: e.unit, target: u.unit, colour: look.colour, team }, Infinity);
      if (bounce) {
        // Hop `i` from the unit before, as that one is reached.
        const start = i === 0 ? e.releaseTick : aim.units[i - 1]!.landTick;
        const from = i === 0 ? e.unit : aim.units[i - 1]!.unit;
        own(this.missiles, { start, end: u.landTick, kind, colour: look.colour, from, to: u.unit, toX: 0, toZ: 0, lob: false }, e.releaseTick);
        continue;
      }
      for (let k = 0; k < aim.hits; k++) {
        const start = e.releaseTick + k * aim.hitGap;
        own(this.missiles, { start, end: u.landTick + k * aim.hitGap, kind, colour: look.colour, from: e.unit, to: u.unit, toX: 0, toZ: 0, lob: false }, start);
      }
    }
  }

  private landing(cast: CastFx, tick: number, flash: boolean): void {
    const landing = cast.landings.find((l) => l.tick === tick);
    if (landing === undefined) cast.landings.push({ tick, flash, reached: [], types: [], done: false });
    else landing.flash ||= flash;
  }

  /** A unit an event of a cast's landing reached: its sparks and glow, and whether the landing is big, come once the tick is over. */
  private reach(source: number, target: number, tick: number, type: DamageType | null): void {
    const cast = this.casting[source];
    const landing = cast?.landings.find((l) => l.tick === tick && !l.done);
    if (landing === undefined) return;
    const i = landing.reached.indexOf(target);
    if (i < 0) {
      landing.reached.push(target);
      landing.types.push(type);
    } else if (type !== null) {
      landing.types[i] = type;
    }
  }

  /** Settles the landings of the ticks processed: sparks and glows at the units they reached, and the big moments. */
  private settle(tick: number): void {
    for (let c = 0; c < this.pending.length; c++) {
      const cast = this.pending[c]!;
      let left = 0;
      for (let l = 0; l < cast.landings.length; l++) {
        const landing = cast.landings[l]!;
        if (landing.done) continue;
        if (landing.tick > tick) {
          left++;
          continue;
        }
        landing.done = true;
        this.land(cast, landing);
      }
      if (left === 0) {
        this.pending.splice(c--, 1);
        if (this.casting[cast.unit] === cast) this.casting[cast.unit] = undefined;
      }
    }
  }

  private land(cast: CastFx, landing: Landing): void {
    const { big, sparks, impactGlow } = EFFECTS;
    let enemies = 0;
    for (const unit of landing.reached) if (this.playback.history(unit).team !== cast.team) enemies++;
    const isBig = enemies >= big.units || (enemies > 0 && cast.release - cast.tick >= Math.round(ticks(big.windup)));
    const { tick } = landing;
    for (let i = 0; i < landing.reached.length; i++) {
      const unit = landing.reached[i]!;
      const type = landing.types[i]!;
      if (this.playback.history(unit).team !== cast.team) {
        const colour = type === null ? cast.look.colour : sparks[type];
        this.bursts.push({ start: tick, end: tick + ticks(sparks.seconds), unit, x: 0, y: 0, z: 0, colour, count: isBig ? sparks.bigCount : sparks.count, speed: sparks.speed, seed: this.bursted++, heart: false });
        this.glows.push({ start: tick, end: tick + ticks(impactGlow.seconds), unit, x: 0, y: 0, z: 0, colour: 0xfff0d0, size: isBig ? impactGlow.bigSize : impactGlow.size });
      } else {
        this.glows.push({ start: tick, end: tick + ticks(0.4), unit, x: 0, y: 0, z: 0, colour: cast.look.colour, size: 1.6 });
      }
    }
    if (!isBig) return;
    this.shakes.push({ start: tick, end: tick + ticks(big.shakeSeconds), amplitude: big.shake });
    this.hitStops.push({ start: tick, end: tick + 2 * HIT_STOP_TICKS, units: [cast.unit, ...landing.reached] });
    if (landing.flash) this.flashes.push({ start: tick, end: tick + ticks(big.flashSeconds), colour: cast.look.colour, strength: big.flash });
  }

  /** The caster died on `tick`: what of its cast needed it alive from then on never comes, and what is showing ends. */
  private cancel(cast: CastFx, tick: number): void {
    for (const { effect, needs } of cast.owned) {
      if (needs > tick) effect.end = Math.min(effect.end, Math.max(tick, effect.start));
    }
    for (const ribbon of this.ribbons) if (ribbon.unit === cast.unit && ribbon.arrive > tick) ribbon.arrive = Math.max(tick, ribbon.start);
    this.casting[cast.unit] = undefined;
    const i = this.pending.indexOf(cast);
    if (i >= 0) this.pending.splice(i, 1);
  }
}

/** How far a ring from `centre` reaches to cover the hexes: past the furthest hex's centre by about half a hex. */
function reach(centre: Point, hexes: readonly { readonly hex: Hex }[]): number {
  let far = 0;
  for (const h of hexes) {
    const { x, z } = hexToWorld(h.hex);
    far = Math.max(far, Math.hypot(x - centre.x, z - centre.z));
  }
  return far + HEX_REACH;
}

/** Drops the effects that have ended by `time`, in place, so the list stays the same array. */
function prune(list: Timed[], time: number): void {
  let kept = 0;
  for (let i = 0; i < list.length; i++) {
    const effect = list[i]!;
    if (effect.end > time) list[kept++] = effect;
  }
  list.length = kept;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function easeOut(x: number): number {
  return 1 - (1 - clamp01(x)) ** 3;
}

export function easeIn(x: number): number {
  return clamp01(x) ** 2;
}

export function smooth(x: number): number {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
}

/** Up fast, then back down, over `span`: a hit's push. Rises over the first `rise` of it, then falls; 0 outside it. */
export function kick(age: number, span: number, rise = 0.18): number {
  const x = age / span;
  if (x < 0 || x >= 1) return 0;
  return x < rise ? easeOut(x / rise) : 1 - smooth((x - rise) / (1 - rise));
}

/** A hash of two numbers to [0, 1), for scattering sparks and shards the same way every time. */
export function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
