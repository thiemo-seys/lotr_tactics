// Plays a fight back in real time and works out what to draw at each moment
// (docs/viewer-spec.md section 5). No Three.js and no DOM, so it can be tested.

import { TICKS_PER_SECOND, type Combat, type CombatEvent, type DamageType } from '@lotr-tactics/sim';
import { hexToWorld, lerpPoint, pointDistance, type Point } from './layout.js';

/** How long the viewer's own effects last, in ticks of fight time. */
export const EFFECT_TICKS = {
  dash: 4,
  lunge: 6,
  floatingText: 24,
  castRing: 15,
  death: 15,
} as const;

/** How far past the final tick display time runs, so effects can finish. */
const AFTERGLOW_TICKS = 30;

/** How far a melee attacker lunges towards its target, as a share of the distance. */
const LUNGE_SHARE = 0.3;

interface Motion {
  readonly from: Point;
  readonly to: Point;
  readonly startTick: number;
  readonly endTick: number;
}

export interface Projectile {
  readonly source: number;
  readonly target: number;
  /** Where the attacker stood when it fired. */
  readonly from: Point;
  readonly startTick: number;
  readonly hitTick: number;
}

export type TextKind = DamageType | 'heal' | 'absorbed' | 'cast';

export interface FloatingText {
  readonly unit: number;
  readonly text: string;
  readonly kind: TextKind;
  readonly big: boolean;
  readonly startTick: number;
}

export interface CastRing {
  readonly unit: number;
  readonly startTick: number;
}

interface Lunge {
  readonly target: number;
  readonly startTick: number;
}

export class Playback {
  /** Display time in ticks: the last tick processed, plus how far into the next one playback is. */
  time = 0;
  speed = 1;
  playing = true;
  projectiles: Projectile[] = [];
  texts: FloatingText[] = [];
  casts: CastRing[] = [];
  private readonly motions = new Map<number, Motion>();
  private readonly lunges = new Map<number, Lunge>();
  private readonly deaths = new Map<number, number>();

  constructor(readonly combat: Combat) {
    this.record(combat.events);
  }

  /** Moves display time on by `seconds` of real time, stepping the fight as needed. Returns the new events. */
  advance(seconds: number): CombatEvent[] {
    if (!this.playing) return [];
    this.time += seconds * TICKS_PER_SECOND * this.speed;
    const events: CombatEvent[] = [];
    while (!this.combat.isOver() && this.combat.tick + 1 <= this.time) events.push(...this.stepOnce());
    if (this.combat.isOver()) this.time = Math.min(this.time, this.combat.tick + AFTERGLOW_TICKS);
    this.prune();
    return events;
  }

  /** Steps exactly one tick, for single-stepping while paused. */
  step(): CombatEvent[] {
    if (this.combat.isOver()) return [];
    const events = this.stepOnce();
    this.time = this.combat.tick;
    this.prune();
    return events;
  }

  /** Where a unit is drawn at display time, part-way through a step or dash. */
  position(unit: number, time = this.time): Point {
    const motion = this.motions.get(unit);
    if (motion === undefined) return hexToWorld(this.combat.state.units[unit]!.hex);
    if (time >= motion.endTick) return motion.to;
    return lerpPoint(motion.from, motion.to, clamp01((time - motion.startTick) / (motion.endTick - motion.startTick)));
  }

  /** The extra offset of a melee attacker lunging at its target. */
  lungeOffset(unit: number, time = this.time): Point {
    const lunge = this.lunges.get(unit);
    if (lunge === undefined) return { x: 0, z: 0 };
    const progress = (time - lunge.startTick) / EFFECT_TICKS.lunge;
    if (progress < 0 || progress >= 1) return { x: 0, z: 0 };
    const from = this.position(unit, time);
    const to = this.position(lunge.target, time);
    const share = Math.sin(Math.PI * progress) * LUNGE_SHARE;
    return { x: (to.x - from.x) * share, z: (to.z - from.z) * share };
  }

  /** Where a projectile is: from where it was fired to where its target is now, landing on its hit tick. */
  projectilePosition(projectile: Projectile, time = this.time): Point {
    const progress = clamp01((time - projectile.startTick) / (projectile.hitTick - projectile.startTick));
    return lerpPoint(projectile.from, this.position(projectile.target, time), progress);
  }

  /** From 0 when the unit died to 1 once it has faded out; 0 for living units. */
  deathProgress(unit: number, time = this.time): number {
    const tick = this.deaths.get(unit);
    return tick === undefined ? 0 : clamp01((time - tick) / EFFECT_TICKS.death);
  }

  /** From 0 when an effect started to 1 when it ends. */
  progress(startTick: number, durationTicks: number, time = this.time): number {
    return clamp01((time - startTick) / durationTicks);
  }

  private stepOnce(): CombatEvent[] {
    const events = this.combat.step();
    this.record(events);
    return events;
  }

  private record(events: readonly CombatEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'move':
          this.motions.set(e.unit, { from: hexToWorld(e.from), to: hexToWorld(e.to), startTick: e.tick, endTick: e.arriveTick });
          break;
        case 'dash':
          this.motions.set(e.unit, {
            from: hexToWorld(e.from),
            to: hexToWorld(e.to),
            startTick: e.tick,
            endTick: e.tick + EFFECT_TICKS.dash,
          });
          break;
        case 'attack':
          if (e.ranged) {
            this.projectiles.push({ source: e.unit, target: e.target, from: this.position(e.unit, e.tick), startTick: e.tick, hitTick: e.hitTick });
          } else {
            this.lunges.set(e.unit, { target: e.target, startTick: e.tick });
          }
          break;
        case 'damage': {
          const toHealth = e.amount - e.absorbed;
          if (toHealth > 0) this.addText(e.target, String(toHealth), e.damageType, e.crit, e.tick);
          if (e.absorbed > 0) this.addText(e.target, String(e.absorbed), 'absorbed', e.crit, e.tick);
          break;
        }
        case 'heal':
          this.addText(e.target, `+${e.amount}`, 'heal', false, e.tick);
          break;
        case 'cast':
          this.casts.push({ unit: e.unit, startTick: e.tick });
          this.addText(e.unit, e.ability, 'cast', false, e.tick);
          break;
        case 'death':
          this.deaths.set(e.unit, e.tick);
          break;
      }
    }
  }

  private addText(unit: number, text: string, kind: TextKind, big: boolean, startTick: number): void {
    this.texts.push({ unit, text, kind, big, startTick });
  }

  /** Drops effects that have finished. */
  private prune(): void {
    this.projectiles = this.projectiles.filter((p) => p.hitTick > this.time);
    this.texts = this.texts.filter((t) => t.startTick + EFFECT_TICKS.floatingText > this.time);
    this.casts = this.casts.filter((c) => c.startTick + EFFECT_TICKS.castRing > this.time);
  }
}

/** The angle a unit at `from` turns to face `to`, about the vertical axis. */
export function facing(from: Point, to: Point): number | null {
  return pointDistance(from, to) < 1e-6 ? null : Math.atan2(to.x - from.x, to.z - from.z);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
