// Plays a fight back in real time and works out what to draw at each moment
// (docs/viewer-spec.md section 5). It also keeps what each unit did, for animation.ts to work out
// which clip it plays at any display time. No Three.js and no DOM, so it can be tested.

import { TICKS_PER_SECOND, type Combat, type CombatEvent, type DamageType, type Outcome, type Team } from '@lotr-tactics/sim';
import { hexToWorld, pointDistance, type Point } from './layout.js';

/** A point the scene writes into, so drawing a frame allocates nothing. */
export interface MutablePoint {
  x: number;
  z: number;
}

/** How long the viewer's own effects last, in ticks of fight time. */
export const EFFECT_TICKS = {
  /** A melee lunge, at its height halfway through, on the blow's `hitTick` (docs/viewer-spec.md section 5). */
  lunge: 6,
  floatingText: 24,
} as const;

/**
 * How floating texts move, in world units: how far one rises over its life, and how far apart the
 * texts on a unit stay at least (`textOffset`), about a line of numbers at the starting camera.
 */
export const FLOATING_TEXT = { rise: 0.9, gap: 0.32 } as const;

/** How far past the final tick display time runs, so effects can finish. */
const AFTERGLOW_TICKS = 30;

/** How far a melee attacker lunges towards its target, as a share of the distance. */
const LUNGE_SHARE = 0.3;

/**
 * How long after a ranged attack its projectile leaves: the attack clip looses the shot 3 ticks in
 * (docs/viewer-spec.md section 4), so the arrow flies from the loose, not from the draw.
 */
export const SHOT_DELAY_TICKS = 3;

export interface Projectile {
  readonly source: number;
  readonly target: number;
  /** Where the attacker stood when it fired. */
  readonly from: Point;
  /** When it leaves: SHOT_DELAY_TICKS after the attack, or a tick before it lands if that is sooner. */
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
  /** How far above the others' start it starts, in world units, so it doesn't print over its unit's other texts (`textOffset`). */
  readonly offset: number;
}

/** A melee lunge, from `tick` for EFFECT_TICKS.lunge ticks, at its height on the blow's `hitTick`. */
interface Lunge {
  readonly tick: number;
  readonly target: number;
}

/** A unit's attack or cast. A unit acts at most once a tick; a cast on the same tick as an attack wins. */
export interface ActionRecord {
  readonly tick: number;
  readonly cast: boolean;
}

/**
 * A unit's step, from its tick to `endTick`, its arrival; or a dash or charge, from its `departTick`
 * to its `arriveTick`, standing on `from` before it sets off. It goes from the centre of its `from`
 * hex to the centre of its `to` hex.
 */
export interface StepRecord {
  /** When it sets off: a step's tick, or a dash's `departTick`. */
  readonly tick: number;
  readonly endTick: number;
  readonly dash: boolean;
  readonly from: Point;
  readonly to: Point;
}

/** A stretch of being stunned, from `tick` until it is gone at the start of `endTick`. */
export interface StunRecord {
  readonly tick: number;
  readonly endTick: number;
  /**
   * Every tick a stun in the stretch started on, from `tick` on: a stunned unit can't act, so an
   * attack or cast on one of them came before that stun (docs/viewer-spec.md section 5, Stunned).
   */
  readonly starts: readonly number[];
}

/**
 * What a unit did in the fight, in the order it happened, so that animation.ts can work out what it
 * plays at any display time up to the playback's own (docs/viewer-spec.md section 5, Animation).
 */
export interface UnitHistory {
  /** Its team, from its spawn. */
  readonly team: Team | null;
  /** One entry per tick it acted on. */
  readonly actions: readonly ActionRecord[];
  readonly steps: readonly StepRecord[];
  /** A stun that starts while another lasts, or as it ends, extends that stretch instead of starting one. */
  readonly stuns: readonly StunRecord[];
  /** The tick it died on, or null. */
  readonly death: number | null;
}

interface History {
  team: Team | null;
  /** Where it spawned, which is where it stands until its first step. */
  home: Point | null;
  readonly actions: { readonly tick: number; cast: boolean }[];
  readonly steps: StepRecord[];
  readonly stuns: { readonly tick: number; endTick: number; readonly starts: number[] }[];
  /** Its melee lunges, in tick order. */
  readonly lunges: Lunge[];
  death: number | null;
}

const NOTHING: UnitHistory = { team: null, actions: [], steps: [], stuns: [], death: null };

const NO_LUNGES: readonly Lunge[] = [];

/** What `advance` returns when no tick was processed. */
const NO_EVENTS: readonly CombatEvent[] = [];

/** Scratch points for a lunge's ends, so working one out allocates nothing. */
const lungeFrom: MutablePoint = { x: 0, z: 0 };
const lungeTo: MutablePoint = { x: 0, z: 0 };

export class Playback {
  /** Display time in ticks: the last tick processed, plus how far into the next one playback is. */
  time = 0;
  speed = 1;
  playing = true;
  projectiles: Projectile[] = [];
  texts: FloatingText[] = [];
  /** The fight's end, once it has come. */
  ended: { readonly tick: number; readonly outcome: Outcome } | null = null;
  private readonly histories: History[] = [];

  constructor(readonly combat: Combat) {
    this.record(combat.events);
  }

  /**
   * Moves display time on by `seconds` of real time, stepping the fight as needed. Returns the new
   * events: a new list only when a tick was processed, so a frame between ticks allocates nothing.
   */
  advance(seconds: number): readonly CombatEvent[] {
    if (!this.playing) return NO_EVENTS;
    this.time += seconds * TICKS_PER_SECOND * this.speed;
    let events = NO_EVENTS;
    while (!this.combat.isOver() && this.combat.tick + 1 <= this.time) events = events.length === 0 ? this.stepOnce() : events.concat(this.stepOnce());
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

  /**
   * Where a unit is drawn at display time, part-way through a step or dash. Any time up to the
   * playback's own works, from the unit's steps so far. A unit that dies stays where it was when it
   * died, part-way through a step or dash too, so it dies and breaks up there (docs/viewer-spec.md
   * section 4, Death).
   */
  position(unit: number, time = this.time): Point {
    return this.positionInto({ x: 0, z: 0 }, unit, time);
  }

  /** position(), written into `out`. */
  positionInto<T extends MutablePoint>(out: T, unit: number, time = this.time): T {
    const history = this.histories[unit];
    const death = history?.death ?? null;
    if (death !== null && time > death) time = death;
    const steps = history?.steps ?? NOTHING.steps;
    const step = lastStarted(steps, time);
    if (step !== undefined && time < step.endTick) {
      const share = clamp01((time - step.tick) / (step.endTick - step.tick));
      out.x = step.from.x + (step.to.x - step.from.x) * share;
      out.z = step.from.z + (step.to.z - step.from.z) * share;
      return out;
    }
    // Before its first step it stands where that step starts, which is where it spawned.
    const at = step?.to ?? steps[0]?.from ?? history?.home ?? hexToWorld(this.combat.state.units[unit]!.hex);
    out.x = at.x;
    out.z = at.z;
    return out;
  }

  /** The extra offset of a melee attacker lunging at its target. */
  lungeOffset(unit: number, time = this.time): Point {
    return this.lungeInto({ x: 0, z: 0 }, unit, time);
  }

  /** lungeOffset(), written into `out`. */
  lungeInto<T extends MutablePoint>(out: T, unit: number, time = this.time): T {
    out.x = 0;
    out.z = 0;
    const history = this.histories[unit];
    // A unit that dies mid-lunge stops there, as it does mid-step.
    const death = history?.death ?? null;
    if (death !== null && time > death) time = death;
    const lunge = lastStarted(history?.lunges ?? NO_LUNGES, time);
    if (lunge === undefined) return out;
    const progress = (time - lunge.tick) / EFFECT_TICKS.lunge;
    if (progress < 0 || progress >= 1) return out;
    const from = this.positionInto(lungeFrom, unit, time);
    const to = this.positionInto(lungeTo, lunge.target, time);
    const share = Math.sin(Math.PI * progress) * LUNGE_SHARE;
    out.x = (to.x - from.x) * share;
    out.z = (to.z - from.z) * share;
    return out;
  }

  /** Where a projectile is: from where it was fired to where its target is now, landing on its hit tick. */
  projectilePosition(projectile: Projectile, time = this.time): Point {
    return this.projectilePositionInto({ x: 0, z: 0 }, projectile, time);
  }

  /** projectilePosition(), written into `out`. */
  projectilePositionInto<T extends MutablePoint>(out: T, projectile: Projectile, time = this.time): T {
    const progress = clamp01((time - projectile.startTick) / (projectile.hitTick - projectile.startTick));
    const to = this.positionInto(out, projectile.target, time);
    out.x = projectile.from.x + (to.x - projectile.from.x) * progress;
    out.z = projectile.from.z + (to.z - projectile.from.z) * progress;
    return out;
  }

  /** What a unit has done so far in the fight. */
  history(unit: number): UnitHistory {
    return this.histories[unit] ?? NOTHING;
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
        case 'spawn': {
          const history = this.historyOf(e.unit);
          history.team = e.team;
          history.home = hexToWorld(e.hex);
          break;
        }
        case 'move':
          this.addStep(e.unit, { tick: e.tick, endTick: e.arriveTick, dash: false, from: hexToWorld(e.from), to: hexToWorld(e.to) });
          break;
        case 'dash':
          // Emitted at the cast, it sets off at the release: the unit stands on `from` until then.
          this.addStep(e.unit, { tick: e.departTick, endTick: e.arriveTick, dash: true, from: hexToWorld(e.from), to: hexToWorld(e.to) });
          break;
        case 'attack':
          if (e.ranged) {
            const startTick = Math.min(e.tick + SHOT_DELAY_TICKS, e.hitTick - 1);
            this.projectiles.push({ source: e.unit, target: e.target, from: this.position(e.unit, e.tick), startTick, hitTick: e.hitTick });
          } else {
            // At its height when the blow lands.
            this.historyOf(e.unit).lunges.push({ tick: e.hitTick - EFFECT_TICKS.lunge / 2, target: e.target });
          }
          this.addAction(e.unit, e.tick, false);
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
          // The ability's name in its pill; its wind-up, travel and impact are effects.ts's.
          this.addText(e.unit, e.ability, 'cast', false, e.tick);
          this.addAction(e.unit, e.tick, true);
          break;
        case 'status':
          // A stun the unit is immune to, or one that doesn't outlast the current one, has no event.
          if (e.status === 'stun') this.addStun(e.target, e.tick, e.expiresTick ?? Infinity);
          break;
        case 'death': {
          const history = this.historyOf(e.unit);
          history.death = e.tick;
          // A unit that dies before its dash sets off never sets off (sim-spec section 14): it is still
          // on the dash's `from` hex, which the state shows, as nothing moves a dead unit.
          const last = history.steps.at(-1);
          if (last?.dash === true && last.tick >= e.tick && pointDistance(hexToWorld(this.combat.state.units[e.unit]!.hex), last.to) > 1e-6) history.steps.pop();
          break;
        }
        case 'end':
          this.ended = { tick: e.tick, outcome: e.outcome };
          break;
      }
    }
  }

  private historyOf(unit: number): History {
    let history = this.histories[unit];
    if (history === undefined) {
      history = { team: null, home: null, actions: [], steps: [], stuns: [], lunges: [], death: null };
      this.histories[unit] = history;
    }
    return history;
  }

  /** More attacks on a tick are one action, and a cast on the same tick as an attack wins. */
  private addAction(unit: number, tick: number, cast: boolean): void {
    const { actions } = this.historyOf(unit);
    const last = actions.at(-1);
    if (last?.tick === tick) last.cast ||= cast;
    else actions.push({ tick, cast });
  }

  /**
   * Keeps the steps in the order they set off, as a dash comes at its cast and sets off later. The
   * later of two steps setting off on one tick replaces the other, as it does for the unit's position.
   */
  private addStep(unit: number, step: StepRecord): void {
    const { steps } = this.historyOf(unit);
    let at = steps.length;
    while (at > 0 && steps[at - 1]!.tick > step.tick) at--;
    if (steps[at - 1]?.tick === step.tick) steps[at - 1] = step;
    else steps.splice(at, 0, step);
  }

  /** A stun that starts while the unit is stunned, or as its stun ends, carries that stun on. */
  private addStun(unit: number, tick: number, endTick: number): void {
    if (endTick <= tick) return;
    const { stuns } = this.historyOf(unit);
    const last = stuns.at(-1);
    if (last !== undefined && tick <= last.endTick) {
      last.endTick = Math.max(last.endTick, endTick);
      if (last.starts.at(-1) !== tick) last.starts.push(tick);
    } else {
      stuns.push({ tick, endTick, starts: [tick] });
    }
  }

  private addText(unit: number, text: string, kind: TextKind, big: boolean, startTick: number): void {
    this.texts.push({ unit, text, kind, big, startTick, offset: textOffset(this.texts, unit, startTick) });
  }

  /** Drops effects that have finished. A list stays the same list while none of it has. */
  private prune(): void {
    this.projectiles = unfinished(this.projectiles, projectileEnd, this.time);
    this.texts = unfinished(this.texts, textEnd, this.time);
  }
}

/**
 * How far up a text starting on `unit` at `startTick` starts: the lowest height, from 0 or just
 * above one of the unit's texts still showing, at least FLOATING_TEXT.gap from where each of those
 * is then. All texts rise at the same pace, so they stay that far apart for as long as they show:
 * texts that start together stack upwards, so do those of a multi-hit a few ticks apart, and one
 * that has risen out of the way leaves room below it.
 */
export function textOffset(texts: readonly FloatingText[], unit: number, startTick: number): number {
  const { gap } = FLOATING_TEXT;
  /** Where a text of the unit still showing is as this one starts, or NaN for any other. */
  const height = (t: FloatingText): number => {
    const age = startTick - t.startTick;
    return t.unit === unit && age >= 0 && age < EFFECT_TICKS.floatingText ? t.offset + (FLOATING_TEXT.rise * age) / EFFECT_TICKS.floatingText : NaN;
  };
  let best = Infinity;
  // Candidates: the bottom, and just above each text showing.
  for (let c = -1; c < texts.length; c++) {
    const below = c < 0 ? -gap : height(texts[c]!);
    if (Number.isNaN(below)) continue;
    const y = Math.max(0, below + gap);
    if (y >= best) continue;
    let clear = true;
    for (let i = 0; i < texts.length && clear; i++) clear = !(Math.abs(y - height(texts[i]!)) < gap - 1e-9);
    if (clear) best = y;
  }
  return best;
}

const projectileEnd = (projectile: Projectile) => projectile.hitTick;
const textEnd = (text: FloatingText) => text.startTick + EFFECT_TICKS.floatingText;

/** The effects that haven't ended by `time`: the list itself if none has, so most frames allocate nothing. */
function unfinished<T>(list: T[], end: (effect: T) => number, time: number): T[] {
  for (let i = 0; i < list.length; i++) if (end(list[i]!) <= time) return list.filter((effect) => end(effect) > time);
  return list;
}

/** The angle a unit at `from` turns to face `to`, about the vertical axis. */
export function facing(from: Point, to: Point): number | null {
  return pointDistance(from, to) < 1e-6 ? null : Math.atan2(to.x - from.x, to.z - from.z);
}

/** The last of a list in tick order to have started by `time`. */
function lastStarted<T extends { readonly tick: number }>(list: readonly T[], time: number): T | undefined {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (list[middle]!.tick <= time) low = middle + 1;
    else high = middle;
  }
  return low > 0 ? list[low - 1] : undefined;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
