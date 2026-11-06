// Which clip each unit's model plays at a display time, and how far into it, and which way each
// unit faces (docs/viewer-spec.md section 5, Animation), from what Playback recorded of the fight's
// events. A pose depends only on the display time and the events up to it, so pausing, single steps
// and the speed control move animation as they move everything else, the frame rate changes
// nothing, and any earlier time gives the pose it gave then. No Three.js and no DOM, so it can be
// tested.

import { TICKS_PER_SECOND } from '@lotr-tactics/sim';
import { facing, type MutablePoint, type Playback, type StepRecord, type UnitHistory } from './playback.js';

export const CLIPS = ['idle', 'move', 'attack', 'cast', 'stun', 'death', 'victory'] as const;
export type ClipName = (typeof CLIPS)[number];
/** Each clip's length in seconds, from the unit's model. */
export type ClipLengths = Readonly<Record<ClipName, number>>;
/** How long a fade between two clips lasts, in ticks. */
export const FADE_TICKS = 3;

export interface Pose {
  readonly clip: ClipName;
  /** Seconds into `clip`. */
  readonly time: number;
  /** The clip fading out, and how far into it; null when not fading. */
  readonly from: { readonly clip: ClipName; readonly time: number } | null;
  /** The weight of `clip`: from 0 to 1 over a fade, 1 otherwise. `from` has the rest. */
  readonly weight: number;
}

export interface PoseOptions {
  /** Display time in ticks: the playback's own by default. Any time up to it works. */
  readonly time?: number;
  /** Reduced motion: `idle` and `stun` hold their first frame. */
  readonly still?: boolean;
}

/** A pose the scene writes into each frame, so drawing one allocates nothing. */
export interface PoseBuffer {
  clip: ClipName;
  time: number;
  /** The clip fading out, or null when not fading. */
  fromClip: ClipName | null;
  fromTime: number;
  weight: number;
}

/** How much further on each unit's idle is, in seconds per id, so units don't breathe together. */
const IDLE_STAGGER = 0.37;

/** How much faster than its own pace a dash or charge plays `move`, from the start of the clip. */
const DASH_PACE = 2;

/** How far through its death clip a unit starts to sink and fade out. */
const SINK_SHARE = 0.5;

/** How long a unit takes to turn into a step or dash, and back to its target after one, in ticks. */
const TURN_TICKS = 3;

/** What a unit plays at a display time in a fight. */
export function fightPose(playback: Playback, unit: number, lengths: ClipLengths, options: PoseOptions = {}): Pose {
  return toPose(fightPoseInto(newPose(), playback, unit, lengths, options.time ?? playback.time, options.still ?? false));
}

/** What a unit plays on the planning board or bench, `seconds` of real time in, staggered by `key`, the unit's id. */
export function planningPose(lengths: ClipLengths, seconds: number, key: number, still = false): Pose {
  return toPose(planningPoseInto(newPose(), lengths, seconds, key, still));
}

export function newPose(): PoseBuffer {
  return { clip: 'idle', time: 0, fromClip: null, fromTime: 0, weight: 1 };
}

/** fightPose, written into `out`. */
export function fightPoseInto(
  out: PoseBuffer,
  playback: Playback,
  unit: number,
  lengths: ClipLengths,
  time = playback.time,
  still = false,
): PoseBuffer {
  const history = playback.history(unit);
  const { ended } = playback;
  // The winners are the living units of the winning team: a dead one plays its death first.
  const won = ended !== null && ended.outcome === history.team ? ended.tick : null;
  const idleOffset = IDLE_STAGGER * unit;
  const now = classify(current, history, won, lengths, time, false);
  out.clip = now.clip;
  out.time = timeInto(now, time, lengths, idleOffset, still);
  out.fromClip = null;
  out.fromTime = 0;
  out.weight = 1;
  const into = time - now.shown;
  if (into < FADE_TICKS && !cutsIn(now)) {
    // A new clip fades in over the one before, which carries on as it would have. The same clip
    // starting again, a step following a step or a stun carried on, cuts without a fade.
    const before = classify(previous, history, won, lengths, now.shown, true);
    if (before.clip !== now.clip) {
      out.fromClip = before.clip;
      out.fromTime = timeInto(before, time, lengths, idleOffset, still);
      out.weight = into / FADE_TICKS;
    }
  }
  return out;
}

/**
 * How long after its death a unit starts to sink and fade out, in seconds, for
 * Playback.deathProgress: halfway through its death clip, or at once for a model or pawn without one.
 */
export function sinkDelay(lengths: ClipLengths | null): number {
  return lengths === null ? 0 : lengths.death * SINK_SHARE;
}

/** planningPose, written into `out`. */
export function planningPoseInto(out: PoseBuffer, lengths: ClipLengths, seconds: number, key: number, still = false): PoseBuffer {
  out.clip = 'idle';
  out.time = still ? 0 : wrap(seconds + IDLE_STAGGER * key, lengths.idle);
  out.fromClip = null;
  out.fromTime = 0;
  out.weight = 1;
  return out;
}

function toPose(pose: PoseBuffer): Pose {
  return {
    clip: pose.clip,
    time: pose.time,
    from: pose.fromClip === null ? null : { clip: pose.fromClip, time: pose.fromTime },
    weight: pose.weight,
  };
}

/** What a unit plays over a stretch of the fight. */
interface Segment {
  clip: ClipName;
  /** For `move`: a dash's or charge's, at twice the clip's pace, rather than a step's. */
  dash: boolean;
  /** The tick its time counts from: its event, the start of the stun, or when the step or dash set off. */
  start: number;
  /** For `move`: the step's arrival, which sets the pace of its cycle. */
  end: number;
  /** When it started to show, which a fade is timed from. Only worked out for the present. */
  shown: number;
}

/** Scratch segments for the present and for the moment before a change, so a pose allocates nothing. */
const current: Segment = { clip: 'idle', dash: false, start: 0, end: 0, shown: 0 };
const previous: Segment = { clip: 'idle', dash: false, start: 0, end: 0, shown: 0 };

/**
 * Whether a segment starts at full weight rather than fading in (section 5, Cuts): an attack or a
 * cast on its event's tick, or a dash's move on its `departTick`, so its first frame shows. One that
 * comes back after a stun or step hid it fades in as usual.
 */
function cutsIn(segment: Segment): boolean {
  if (segment.shown !== segment.start) return false;
  return segment.clip === 'attack' || segment.clip === 'cast' || (segment.clip === 'move' && segment.dash);
}

/**
 * What a unit plays at display time `t`, written into `out`: the first of section 5's rules that
 * applies. With `just` it is what played just before `t`, which a fade carries on from: what
 * started before `t`, and what lasted until `t` or later.
 */
function classify(out: Segment, history: UnitHistory, won: number | null, lengths: ClipLengths, t: number, just: boolean): Segment {
  // 1. Dead.
  const { death } = history;
  if (death !== null && started(death, t, just)) return set(out, 'death', false, death, death, death);
  // 2. Won.
  if (won !== null && started(won, t, just)) return set(out, 'victory', false, won, won, won);

  const action = latest(history.actions, t, just);
  const actionClip = action?.cast === true ? 'cast' : 'attack';
  const actionEnd = action === undefined ? -Infinity : action.tick + lengths[actionClip] * TICKS_PER_SECOND;
  const acting = action !== undefined && lasts(actionEnd, t, just);

  // 3. Stunned. A stunned unit can't act, so an action on a tick a stun of the stretch starts on came
  // before that stun: it plays out first, and the stun shows once its clip ends.
  const stun = latest(history.stuns, t, just);
  const stunEnd = stun === undefined ? -Infinity : stun.endTick;
  const first = action !== undefined && stun !== undefined && stun.starts.includes(action.tick);
  if (stun !== undefined && lasts(stunEnd, t, just)) {
    if (first && acting) return set(out, actionClip, false, action.tick, actionEnd, action.tick);
    return set(out, 'stun', false, stun.tick, stun.endTick, first ? Math.max(stun.tick, actionEnd) : stun.tick);
  }

  // 4. Acting or moving, whichever started last, or the action if they started on the same tick.
  const step = latest(history.steps, t, just);
  const stepEnd = step === undefined ? -Infinity : step.endTick;
  const moving = step !== undefined && lasts(stepEnd, t, just);
  if (acting && (!moving || action.tick >= step.tick)) {
    // It shows from its event, or from when a later step, or a stun that came after it, hid it.
    const hidden = Math.max(step !== undefined && step.tick > action.tick ? stepEnd : -Infinity, !first && stunEnd > action.tick ? stunEnd : -Infinity);
    return set(out, actionClip, false, action.tick, actionEnd, Math.max(action.tick, hidden));
  }
  if (moving) {
    // It shows from its start, or from when an action from then on or a stun that hid it ended.
    const shown = Math.max(step.tick, action !== undefined && action.tick >= step.tick ? actionEnd : -Infinity, stunEnd > step.tick ? stunEnd : -Infinity);
    return set(out, 'move', step.dash, step.tick, step.endTick, shown);
  }

  // 5. Otherwise idle, since the last of these ended.
  return set(out, 'idle', false, 0, 0, Math.max(0, actionEnd, stepEnd, stunEnd));
}

/** How far into a segment's clip a unit is at display time `t`, in seconds, carrying on past the segment's end. */
function timeInto(segment: Segment, t: number, lengths: ClipLengths, idleOffset: number, still: boolean): number {
  switch (segment.clip) {
    case 'idle':
      return still ? 0 : wrap(t / TICKS_PER_SECOND + idleOffset, lengths.idle);
    case 'stun':
      return still ? 0 : wrap((t - segment.start) / TICKS_PER_SECOND, lengths.stun);
    case 'move': {
      // A dash at twice the clip's pace from when it sets off; a step one cycle per step. Either loops
      // on at its pace while it fades out.
      if (segment.dash) return wrap((DASH_PACE * (t - segment.start)) / TICKS_PER_SECOND, lengths.move);
      const span = segment.end - segment.start;
      return span > 0 ? wrap(((t - segment.start) / span) * lengths.move, lengths.move) : 0;
    }
    default:
      // attack, cast, death and victory play once and hold on their last frame.
      return Math.min((t - segment.start) / TICKS_PER_SECOND, lengths[segment.clip]);
  }
}

function set(out: Segment, clip: ClipName, dash: boolean, start: number, end: number, shown: number): Segment {
  out.clip = clip;
  out.dash = dash;
  out.start = start;
  out.end = end;
  out.shown = shown;
  return out;
}

/** Whether something that started on `tick` has started at `t`, or just before it. */
function started(tick: number, t: number, just: boolean): boolean {
  return just ? tick < t : tick <= t;
}

/** Whether something that ends at `endTick` still lasts at `t`, or just before it. */
function lasts(endTick: number, t: number, just: boolean): boolean {
  return just ? endTick >= t : endTick > t;
}

/** The last of a list in tick order that has started at `t`, or just before it. */
function latest<T extends { readonly tick: number }>(list: readonly T[], t: number, just: boolean): T | undefined {
  return list[latestIndex(list, t, just)];
}

/** The index of the last of a list in tick order that has started at `t`, or just before it; −1 if none has. */
function latestIndex(list: readonly { readonly tick: number }[], t: number, just: boolean): number {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (started(list[middle]!.tick, t, just)) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

function wrap(seconds: number, length: number): number {
  return length > 0 ? seconds % length : 0;
}

/**
 * The way a living unit faces at the playback's display time (section 5, Facing), given its target in
 * `combat.state`: an angle about the vertical, as `facing()` gives. null when it has nowhere to face
 * or is dead, and the scene keeps the way it faced.
 */
export function fightFacing(playback: Playback, unit: number, target: number | null): number | null {
  const { death, steps } = playback.history(unit);
  const { time } = playback;
  if (death !== null && death <= time) return null;
  return faceAt(playback, unit, target, steps, latestIndex(steps, time, false), time);
}

/**
 * The way a unit faces at `t`, from its steps up to the `k`th, the last of them to start by `t`, and
 * its target. While a step or dash moves it, the way it goes, turning into it over its first ticks
 * from the way it faced as it started; for a few ticks after, turning back from that way to its
 * target; otherwise towards its target.
 */
function faceAt(playback: Playback, unit: number, target: number | null, steps: readonly StepRecord[], k: number, t: number): number | null {
  const step = steps[k];
  if (step === undefined) return towards(playback, unit, target, t);
  // Every step and dash goes to another hex.
  const way = facing(step.from, step.to) ?? 0;
  if (t < step.endTick) {
    const share = (t - step.tick) / TURN_TICKS;
    if (share >= 1) return way;
    // The way it faced as the step started: the way the step before went if it ended then, or else
    // towards its target, or part of the way between if the step before ended just before.
    const from = faceAt(playback, unit, target, steps, k - 1, step.tick);
    return from === null ? way : turnBetween(from, way, share);
  }
  const share = (t - step.endTick) / TURN_TICKS;
  const to = towards(playback, unit, target, t);
  if (share >= 1) return to;
  // With nowhere to face it keeps the way it went.
  return to === null ? way : turnBetween(way, to, share);
}

/** Scratch points for a unit and its target, so facing allocates nothing. */
const self: MutablePoint = { x: 0, z: 0 };
const other: MutablePoint = { x: 0, z: 0 };

/** The way from a unit to its target at `t`, from where they are drawn without the lunge; null with no target, or one in its place. */
function towards(playback: Playback, unit: number, target: number | null, t: number): number | null {
  if (target === null) return null;
  return facing(playback.positionInto(self, unit, t), playback.positionInto(other, target, t));
}

const FULL_TURN = 2 * Math.PI;

/** `share` of the way from one angle to another, the shorter way round, as an angle in (−π, π]. */
function turnBetween(from: number, to: number, share: number): number {
  return wrapAngle(from + wrapAngle(to - from) * share);
}

/** The same angle, give or take whole turns, in (−π, π]. */
function wrapAngle(angle: number): number {
  return angle - FULL_TURN * Math.ceil((angle - Math.PI) / FULL_TURN);
}
