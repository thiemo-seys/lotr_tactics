import {
  TICKS_PER_SECOND,
  createCombat,
  type CastEvent,
  type Combat,
  type CombatEvent,
  type Hex,
  type ItemId,
  type PlacedUnit,
  type Star,
  type UnitId,
} from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { CLIPS, FADE_TICKS, fightFacing, fightPose, planningPose, sinkDelay, type ClipLengths, type ClipName, type Pose } from '../src/animation.js';
import { PRESETS } from '../src/boards.js';
import { Playback, facing } from '../src/playback.js';

// Which clip each unit plays at a display time, and how far into it, and which way it faces (docs/viewer-spec.md
// section 5, Animation). Display times are in ticks, and a tick is 1/30 s. The fights are real ones from createCombat,
// all with seed 1, and each test first pins the events it relies on, so a change in the sim fails there rather than as
// a wrong pose.

/** Clip lengths of our own, in seconds: each a whole number of ticks, and each different, so a mix-up shows. */
const LENGTHS: ClipLengths = { idle: 2.4, move: 0.6, attack: 0.9, cast: 0.7, stun: 0.8, death: 0.4, victory: 0.5 };
// In ticks: idle 72, move 18, attack 27, cast 21, stun 24, death 12, victory 15.

function placed(unitId: UnitId, col: number, row: number, star: Star = 1, items: readonly ItemId[] = []): PlacedUnit {
  return { unitId, star, col, row, items };
}

function combat(A: readonly PlacedUnit[], B: readonly PlacedUnit[]): Combat {
  return createCombat({ seed: 1, stage: 2, teams: { A, B } });
}

/** A fight played to its end, with display time run on after it, so any time in it can be asked about. */
function finished(fight: Combat): Playback {
  const p = new Playback(fight);
  while (!p.combat.isOver()) p.advance(1);
  p.advance(10);
  return p;
}

function pose(p: Playback, unit: number, time: number, still = false): Pose {
  return fightPose(p, unit, LENGTHS, { time, still });
}

/** `clip`, `time` seconds in, at full weight, with nothing fading out. */
function expectPlaying(actual: Pose, clip: ClipName, time: number): void {
  expect({ clip: actual.clip, from: actual.from, weight: actual.weight }).toEqual({ clip, from: null, weight: 1 });
  expect(actual.time).toBeCloseTo(time, 9);
}

/**
 * `clip`, `time` seconds in, fading in over `from`, which is `fromTime` seconds in, at `weight`. A fade is even
 * (section 5, Fades), so its weight is the ticks since the clip changed over the fade's 3.
 */
function expectFading(actual: Pose, clip: ClipName, time: number, from: ClipName, fromTime: number, weight: number): void {
  expect(actual.clip).toBe(clip);
  expect(actual.time).toBeCloseTo(time, 9);
  expect(actual.from?.clip).toBe(from);
  expect(actual.from?.time).toBeCloseTo(fromTime, 9);
  expect(actual.weight).toBeCloseTo(weight, 9);
}

/** The ticks of a unit's events of one kind. */
function ticksOf(p: Playback, type: 'move' | 'dash' | 'attack' | 'cast' | 'death', unit: number): number[] {
  return p.combat.events.filter((e) => e.type === type && 'unit' in e && e.unit === unit).map((e) => e.tick);
}

/** The ticks from `first` to `last`. */
function within(ticks: readonly number[], first: number, last: number): number[] {
  return ticks.filter((t) => t >= first && t <= last);
}

/** A unit's steps, as [tick, arriveTick]. */
function stepsOf(p: Playback, unit: number): [number, number][] {
  return p.combat.events.flatMap((e): [number, number][] => (e.type === 'move' && e.unit === unit ? [[e.tick, e.arriveTick]] : []));
}

/** The stun events on a unit, as [tick, expiresTick]. */
function stunsOf(p: Playback, unit: number): [number, number | null][] {
  return p.combat.events.flatMap((e): [number, number | null][] =>
    e.type === 'status' && e.status === 'stun' && e.target === unit ? [[e.tick, e.expiresTick]] : [],
  );
}

/** Steps or stuns, as [tick, end], that start from `first` to `last`. */
function startingWithin<T extends readonly [number, ...unknown[]]>(spans: readonly T[], first: number, last: number): T[] {
  return spans.filter(([t]) => t >= first && t <= last);
}

function endOf(p: Playback): { tick: number; outcome: string } {
  const end = p.combat.events.find((e) => e.type === 'end');
  if (end?.type !== 'end') throw new Error('The fight should be over.');
  return { tick: end.tick, outcome: end.outcome };
}

function unitsOf(p: Playback): string[] {
  return p.combat.state.units.map((u) => u.unitId);
}

// The fights. Ids are given team A's units first, by slot (sim-spec 6.3).

/** Sam (id 0) and Gimli (id 1) start at either end of the board, step three times to meet and fight. Gimli wins on 697. */
function walkingDuel(): Playback {
  const p = finished(combat([placed('sam', 3, 0)], [placed('gimli', 3, 0)]));
  expect(unitsOf(p)).toEqual(['sam', 'gimli']);
  return p;
}

/** Beregond (id 0) and Gimli (id 1) stand face to face; Beregond's cast stuns Gimli for 1 s. */
function stunningDuel(): Playback {
  const p = finished(combat([placed('beregond', 3, 3)], [placed('gimli', 3, 3)]));
  expect(unitsOf(p)).toEqual(['beregond', 'gimli']);
  return p;
}

/** Two Beregonds (ids 0 and 1) against Sam (id 2): the second Beregond's stun extends the first's. */
function doubleStun(): Playback {
  const p = finished(combat([placed('beregond', 2, 3), placed('beregond', 4, 3)], [placed('sam', 3, 3)]));
  expect(unitsOf(p)).toEqual(['beregond', 'beregond', 'sam']);
  return p;
}

/** The Ringwraith (id 0) and Gandalf (id 1) against Aragorn (id 2), whom Gandalf stuns as he steps. Team A wins on 239. */
function gandalfStunsFight(): Combat {
  return combat([placed('ringwraith', 2, 3), placed('gandalf', 4, 3)], [placed('aragorn', 3, 3)]);
}

function gandalfStuns(): Playback {
  const p = finished(gandalfStunsFight());
  expect(unitsOf(p)).toEqual(['ringwraith', 'gandalf', 'aragorn']);
  return p;
}

/** Bilbo (id 0) with three Bows, attacking faster than his attack clip lasts, against a 2★ Gimli (id 1). */
function fastBilbo(): Playback {
  const p = finished(combat([placed('bilbo', 3, 3, 1, ['bow', 'bow', 'bow'])], [placed('gimli', 3, 3, 2)]));
  expect(unitsOf(p)).toEqual(['bilbo', 'gimli']);
  return p;
}

/** Khamûl (id 0) against two Gimlis (ids 1 and 2); on 174 he casts Shadow ride and dashes away. */
function khamulRidesFight(): Combat {
  return combat([placed('khamul', 3, 3)], [placed('gimli', 3, 3), placed('gimli', 4, 3)]);
}

function khamulRides(): Playback {
  const p = finished(khamulRidesFight());
  expect(unitsOf(p)).toEqual(['khamul', 'gimli', 'gimli']);
  return p;
}

/** Sauron (id 0) against two Gimlis (ids 1 and 2), whom his Sweep stuns. */
function sauronSweeps(): Playback {
  const p = finished(combat([placed('sauron', 3, 3)], [placed('gimli', 3, 3), placed('gimli', 4, 3)]));
  expect(unitsOf(p)).toEqual(['sauron', 'gimli', 'gimli']);
  return p;
}

/** Gandalf (id 0) in team A's back row, and Gimli (id 1), who walks over to him. */
function gandalfWaits(): Playback {
  const p = finished(combat([placed('gandalf', 3, 0)], [placed('gimli', 3, 0)]));
  expect(unitsOf(p)).toEqual(['gandalf', 'gimli']);
  return p;
}

/** Treebeard (id 0) and Aragorn (id 1) face to face; Treebeard's Boulder stuns Aragorn. */
function treebeardThrows(): Playback {
  const p = finished(combat([placed('treebeard', 3, 3)], [placed('aragorn', 3, 3)]));
  expect(unitsOf(p)).toEqual(['treebeard', 'aragorn']);
  return p;
}

/** The full preset on both sides, as the viewer plays #a=full&b=full&seed=1&stage=2. */
function fullBoards(): Playback {
  return finished(combat(PRESETS.full, PRESETS.full));
}

/** The items preset on both sides, seed 1. */
function itemBoards(): Playback {
  return finished(combat(PRESETS.items, PRESETS.items));
}

describe('the clips', () => {
  it('are the seven a rigged model has, and fade over 3 ticks', () => {
    expect(CLIPS).toEqual(['idle', 'move', 'attack', 'cast', 'stun', 'death', 'victory']);
    expect(FADE_TICKS).toBe(3);
  });
});

describe('idle', () => {
  it('plays when nothing else applies, 0.37 s further on for each id', () => {
    const p = walkingDuel();
    // Nobody acts before tick 1 (sim-spec 6.2): both first step on tick 1.
    expect(stepsOf(p, 0)[0]).toEqual([1, 16]);
    expect(stepsOf(p, 1)[0]).toEqual([1, 16]);
    // t / 30 + 0.37 × id: 0.5 / 30 = 0.0167 s for Sam, and 0.0167 + 0.37 = 0.3867 s for Gimli.
    expectPlaying(pose(p, 0, 0.5), 'idle', 0.5 / 30);
    expectPlaying(pose(p, 1, 0.5), 'idle', 0.5 / 30 + 0.37);
  });

  it('picks up where it would have been when a unit goes back to it, wrapped at the clip’s length', () => {
    const p = walkingDuel();
    // Both attack on 46 and 96. The 27-tick attack clip ends on 73, so both idle in between.
    expect(ticksOf(p, 'attack', 0).slice(0, 2)).toEqual([46, 96]);
    expect(ticksOf(p, 'attack', 1).slice(0, 2)).toEqual([46, 96]);
    // At 80: 80 / 30 = 2.6667 s, wrapped at 2.4 s: 0.2667 s, not the 7 ticks since idle came back.
    // Gimli: 2.6667 + 0.37 = 3.0367 s, wrapped: 0.6367 s.
    expectPlaying(pose(p, 0, 80), 'idle', 80 / 30 - 2.4);
    expectPlaying(pose(p, 1, 80), 'idle', 80 / 30 + 0.37 - 2.4);
  });
});

describe('a step', () => {
  it('plays one move cycle per step, and runs on from one step into the next without a seam', () => {
    const p = walkingDuel();
    // Sam steps on 1, 16 and 31, each arriving 15 ticks later (sim-spec 11).
    expect(stepsOf(p, 0)).toEqual([
      [1, 16],
      [16, 31],
      [31, 46],
    ]);
    // The step's progress times 0.6 s: 5 ticks of 15 is 0.2 s, and 14.5 ticks is 0.58 s.
    expectPlaying(pose(p, 0, 6), 'move', 0.2);
    expectPlaying(pose(p, 0, 15.5), 'move', 0.58);
    // The next step starts the cycle again, with no fade: 0.5 ticks in is 0.02 s, and 7.5 ticks in 0.3 s.
    expectPlaying(pose(p, 0, 16.5), 'move', 0.02);
    expectPlaying(pose(p, 0, 23.5), 'move', 0.3);
    expectPlaying(pose(p, 0, 31.5), 'move', 0.02);
  });

  it('fades in over idle when a unit starts to walk, every unit idling before the fight starts', () => {
    const p = walkingDuel();
    expect(stepsOf(p, 0)[0]).toEqual([1, 16]);
    // A step isn't one of the cuts (section 5, Fades), so on 1 the move starts at weight 0 over idle, 1 / 30 s in.
    expectFading(pose(p, 0, 1), 'move', 0, 'idle', 1 / 30, 0);
    // At 2: move 1/15 × 0.6 = 0.04 s in, a tick of the fade's 3, over idle, which carries on: 2 / 30 s for Sam,
    // 2 / 30 + 0.37 s for Gimli.
    expectFading(pose(p, 0, 2), 'move', 0.04, 'idle', 2 / 30, 1 / 3);
    expectFading(pose(p, 1, 2), 'move', 0.04, 'idle', 2 / 30 + 0.37, 1 / 3);
    // 3 ticks in it is all move: 3/15 × 0.6 = 0.12 s.
    expectPlaying(pose(p, 0, 4), 'move', 0.12);
  });

  it('plays when it starts after an action whose clip is still playing', () => {
    const p = gandalfStuns();
    // Aragorn casts on 162, and steps from 177 to 192, while the cast's 21-tick clip would run to 183.
    expect(ticksOf(p, 'cast', 2)).toEqual([162]);
    expect(stepsOf(p, 2)).toEqual([[177, 192]]);
    // The step started last: at 178 move is 1/15 × 0.6 = 0.04 s in, a third of the way through its fade, over the cast
    // carrying on, 16 / 30 s in.
    expectFading(pose(p, 2, 178), 'move', 0.04, 'cast', 16 / 30, 1 / 3);
    // 5 ticks in: 0.2 s.
    expectPlaying(pose(p, 2, 182), 'move', 0.2);
  });
});

describe('a dash', () => {
  it('plays move held at a quarter of its length for the dash’s 4 ticks, at full weight from its tick', () => {
    const p = finished(combat([placed('merry', 2, 0), placed('bilbo', 4, 0)], [placed('gimli', 3, 0)]));
    expect(unitsOf(p)).toEqual(['merry', 'bilbo', 'gimli']);
    // Merry (id 0) and Bilbo (id 1) are Burglars: they leap on tick 0 (sim-spec 6.2), and are busy until 9, when they attack.
    expect(ticksOf(p, 'dash', 0)).toEqual([0]);
    expect(ticksOf(p, 'dash', 1)).toEqual([0]);
    expect(ticksOf(p, 'attack', 0)[0]).toBe(9);
    // A dash's held move is one of the cuts (section 5, Fades): a quarter of 0.6 s, 0.15 s, at full weight from the
    // dash's tick, though every unit counts as idling before the fight, until the dash ends on 4.
    for (const t of [0, 0.5, 1, 2, 3, 3.5]) {
      expectPlaying(pose(p, 0, t), 'move', 0.15);
      expectPlaying(pose(p, 1, t), 'move', 0.15);
    }
    // From 4 Merry idles, fading in: 5 / 30 s by 5, a tick of the fade's 3, over the move still held at 0.15 s.
    expectFading(pose(p, 0, 5), 'idle', 5 / 30, 'move', 0.15, 1 / 3);
    expectPlaying(pose(p, 0, 8), 'idle', 8 / 30);
    expectPlaying(pose(p, 1, 8), 'idle', 8 / 30 + 0.37);
  });

  it('gives way to a cast on the same tick: the action wins a tie', () => {
    const p = finished(combat([placed('grishnakh', 3, 3)], [placed('gimli', 3, 3), placed('legolas', 5, 0)]));
    expect(unitsOf(p)).toEqual(['grishnakh', 'gimli', 'legolas']);
    // Grishnákh (id 0) attacks on 115, then on 116 casts Sneak and dashes next to Legolas.
    expect(ticksOf(p, 'attack', 0)).toContain(115);
    expect(ticksOf(p, 'cast', 0)).toEqual([116]);
    expect(ticksOf(p, 'dash', 0)).toEqual([116]);
    // The cast cuts in at full weight on 116, over the attack still playing, and plays through the dash's 4 ticks.
    expectPlaying(pose(p, 0, 116), 'cast', 0);
    expectPlaying(pose(p, 0, 117), 'cast', 1 / 30);
    expectPlaying(pose(p, 0, 119.5), 'cast', 3.5 / 30);
  });
});

describe('an action', () => {
  it('plays an attack from its event until the clip ends, then fades back to idle over it, held on its last frame', () => {
    const p = walkingDuel();
    expect(ticksOf(p, 'attack', 0).slice(0, 2)).toEqual([46, 96]);
    // 4 ticks in: 4 / 30 s; 26.5 ticks in: 26.5 / 30 s.
    expectPlaying(pose(p, 0, 50), 'attack', 4 / 30);
    expectPlaying(pose(p, 0, 72.5), 'attack', 26.5 / 30);
    // The 0.9 s clip ends 27 ticks in, on 73. At 74 idle is 74 / 30 = 2.4667 s, wrapped at 2.4 s: 0.0667 s, a tick into
    // its fade, and the attack is held on its last frame, 0.9 s.
    expectFading(pose(p, 0, 74), 'idle', 74 / 30 - 2.4, 'attack', 0.9, 1 / 3);
    expectPlaying(pose(p, 0, 77), 'idle', 77 / 30 - 2.4);
  });

  it('cuts in at full weight from idle on its tick, so its first frame, the wind-up, shows', () => {
    const p = walkingDuel();
    // Sam has idled since his first attack's clip ended on 73, and attacks again on 96.
    expect(ticksOf(p, 'attack', 0).slice(0, 2)).toEqual([46, 96]);
    // 95.5 / 30 = 3.1833 s, wrapped at 2.4 s: 0.7833 s.
    expectPlaying(pose(p, 0, 95.5), 'idle', 95.5 / 30 - 2.4);
    // Attack and cast start at full weight on their event's tick (section 5, Cuts), with nothing fading out.
    expectPlaying(pose(p, 0, 96), 'attack', 0);
    expectPlaying(pose(p, 0, 96.5), 'attack', 0.5 / 30);
    expectPlaying(pose(p, 0, 98), 'attack', 2 / 30);
    expectPlaying(pose(p, 1, 96), 'attack', 0);
  });

  it('cuts in at full weight as a step arrives, the step not fading out', () => {
    const p = walkingDuel();
    // Sam's third step runs from 31 to 46, and he attacks as he arrives.
    expect(stepsOf(p, 0)[2]).toEqual([31, 46]);
    expect(ticksOf(p, 'attack', 0)[0]).toBe(46);
    expectPlaying(pose(p, 0, 46), 'attack', 0);
    // At 47.5: the attack 1.5 ticks in, 0.05 s, with the move gone.
    expectPlaying(pose(p, 0, 47.5), 'attack', 0.05);
  });

  it('cuts into a cast at full weight over the attack before it, and plays it until the clip ends', () => {
    const p = walkingDuel();
    // Sam attacks on 246 and casts on 247; his next attack is on 296.
    expect(ticksOf(p, 'attack', 0)).toEqual(expect.arrayContaining([246, 296]));
    expect(ticksOf(p, 'attack', 0).filter((t) => t > 246 && t < 296)).toEqual([]);
    expect(ticksOf(p, 'cast', 0)[0]).toBe(247);
    // The attack would play on to 273, but the cast cuts in on 247.
    expectPlaying(pose(p, 0, 247), 'cast', 0);
    expectPlaying(pose(p, 0, 248), 'cast', 1 / 30);
    expectPlaying(pose(p, 0, 260), 'cast', 13 / 30);
    // The 21-tick clip ends on 268. At 269 idle is 269 / 30 = 8.9667 s, wrapped at 2.4 s: 1.7667 s, a tick into its fade
    // over the cast held at 0.7 s.
    expectFading(pose(p, 0, 269), 'idle', 269 / 30 - 3 * 2.4, 'cast', 0.7, 1 / 3);
  });

  it('cuts back to the start without a fade when the next attack comes before the clip ends', () => {
    const p = fastBilbo();
    // Bilbo attacks every 26 ticks, one tick before the 27-tick clip would end.
    expect(ticksOf(p, 'attack', 0).slice(0, 4)).toEqual([1, 27, 53, 79]);
    expectPlaying(pose(p, 0, 1), 'attack', 0);
    expectPlaying(pose(p, 0, 26.5), 'attack', 25.5 / 30);
    expectPlaying(pose(p, 0, 27.5), 'attack', 0.5 / 30);
    expectPlaying(pose(p, 0, 29), 'attack', 2 / 30);
    expectPlaying(pose(p, 0, 53.5), 'attack', 0.5 / 30);
  });

  it('cuts from one action into another at full weight', () => {
    const p = fastBilbo();
    // Bilbo casts on 101, while the attack from 79 still plays, and attacks on 116, while the cast still plays.
    expect(ticksOf(p, 'attack', 0).slice(3, 5)).toEqual([79, 116]);
    expect(ticksOf(p, 'cast', 0)[0]).toBe(101);
    expectPlaying(pose(p, 0, 101), 'cast', 0);
    expectPlaying(pose(p, 0, 102), 'cast', 1 / 30);
    expectPlaying(pose(p, 0, 116), 'attack', 0);
    expectPlaying(pose(p, 0, 117), 'attack', 1 / 30);
  });

  it('plays one clip at full weight for more attacks on the same tick, such as the Bow of the Galadhrim’s', () => {
    const p = finished(combat([placed('legolas', 3, 0, 1, ['galadhrim-bow'])], [placed('gimli', 2, 3), placed('gimli', 4, 3)]));
    expect(unitsOf(p)).toEqual(['legolas', 'gimli', 'gimli']);
    // Legolas (id 0) shoots at both Gimlis on tick 1, and again on 32.
    expect(ticksOf(p, 'attack', 0).slice(0, 4)).toEqual([1, 1, 32, 32]);
    expectPlaying(pose(p, 0, 1), 'attack', 0);
    expectPlaying(pose(p, 0, 2), 'attack', 1 / 30);
    expectPlaying(pose(p, 0, 27.5), 'attack', 26.5 / 30);
    // The clip from 1 ends on 28: at 29 idle is 29 / 30 s in and a tick into its fade, over the attack held at 0.9 s.
    expectFading(pose(p, 0, 29), 'idle', 29 / 30, 'attack', 0.9, 1 / 3);
    // The next two shots cut in on 32.
    expectPlaying(pose(p, 0, 32), 'attack', 0);
    expectPlaying(pose(p, 0, 33), 'attack', 1 / 30);
  });

  it('plays a cast that comes on the same tick as an attack', () => {
    // The sim never has a unit attack and cast on one tick, since a unit acts once a tick (sim-spec 6.4). So this adds
    // a cast to Sam's first attack, on 46, once after the attack and once before it.
    const cast: CastEvent = { type: 'cast', tick: 46, unit: 0, ability: 'Loyal' };
    for (const before of [false, true]) {
      const p = finished(withEvent(combat([placed('sam', 3, 0)], [placed('gimli', 3, 0)]), cast, before));
      expect(ticksOf(p, 'attack', 0)[0]).toBe(46);
      expect(ticksOf(p, 'cast', 0)[0]).toBe(46);
      // The cast plays from 46, at full weight, and not the attack.
      expectPlaying(pose(p, 0, 46), 'cast', 0);
      expectPlaying(pose(p, 0, 50), 'cast', 4 / 30);
    }
  });

  it('fades back in when it comes back after a step hid it', () => {
    const p = khamulRides();
    // The second Gimli (id 2) attacks on 166, and steps from 174 to 189 after Khamûl rides off. He isn't stunned, and
    // next acts on 216.
    expect(within(ticksOf(p, 'attack', 2), 150, 220)).toEqual([166, 216]);
    expect(within(ticksOf(p, 'cast', 2), 150, 220)).toEqual([]);
    expect(startingWithin(stepsOf(p, 2), 150, 220)).toEqual([[174, 189]]);
    expect(startingWithin(stunsOf(p, 2), 150, 220)).toEqual([]);
    expectPlaying(pose(p, 2, 170), 'attack', 4 / 30);
    // The step started last, so it plays, fading in over the attack: 1/15 × 0.6 = 0.04 s in at 175, over the attack
    // 9 ticks in.
    expectFading(pose(p, 2, 175), 'move', 0.04, 'attack', 9 / 30, 1 / 3);
    expectPlaying(pose(p, 2, 180), 'move', 0.24);
    // The step is over on 189, but the attack's 27-tick clip runs on to 193: the attack comes back, fading in as usual
    // (section 5, Cuts) over the move, which loops on: 16/15 × 0.6 = 0.64 s at 190, wrapped at 0.6 s: 0.04 s.
    expectFading(pose(p, 2, 190), 'attack', 24 / 30, 'move', 0.04, 1 / 3);
    expectFading(pose(p, 2, 190.5), 'attack', 24.5 / 30, 'move', 0.06, 0.5);
    expectPlaying(pose(p, 2, 192), 'attack', 26 / 30);
    // The clip ends on 193, and idle fades in: 194 / 30 + 0.37 × 2 = 7.2067 s at 194, wrapped at 2.4 s: 0.0067 s.
    expectFading(pose(p, 2, 194), 'idle', 194 / 30 + 0.74 - 3 * 2.4, 'attack', 0.9, 1 / 3);
    expectPlaying(pose(p, 2, 216), 'attack', 0);
  });

  it('fades back in when it comes back after a stun hid it', () => {
    // Every stun in the sim lasts at least 1 s, longer than any attack clip in section 4, so here the attack lasts
    // 1.5 s, 45 ticks: animation.ts takes whatever lengths a model gives it.
    const lengths: ClipLengths = { ...LENGTHS, attack: 1.5 };
    const p = sauronSweeps();
    const at = (time: number) => fightPose(p, 2, lengths, { time });
    // The second Gimli (id 2) attacks on 316; Sauron's Sweep stuns him on 317 until 347. He next acts on 366.
    expect(within(ticksOf(p, 'attack', 2), 300, 370)).toEqual([316, 366]);
    expect(within(ticksOf(p, 'cast', 2), 300, 370)).toEqual([]);
    expect(startingWithin(stepsOf(p, 2), 300, 370)).toEqual([]);
    expect(startingWithin(stunsOf(p, 2), 300, 370)).toEqual([[317, 347]]);
    expectPlaying(at(316.5), 'attack', 0.5 / 30);
    // Stunned comes before acting: the stun fades in over the attack, which is 2 ticks in at 318.
    expectFading(at(318), 'stun', 1 / 30, 'attack', 2 / 30, 1 / 3);
    expectPlaying(at(330), 'stun', 13 / 30);
    // The stun is gone on 347, and the attack's clip runs on to 361: the attack comes back, 31 ticks in, fading in as
    // usual over the stun, which loops on: 30 / 30 = 1 s at 347, wrapped at 0.8 s: 0.2 s; 31 / 30 = 1.0333 s at 348:
    // 0.2333 s.
    expectFading(at(347), 'attack', 31 / 30, 'stun', 30 / 30 - 0.8, 0);
    expectFading(at(348), 'attack', 32 / 30, 'stun', 31 / 30 - 0.8, 1 / 3);
    expectFading(at(348.5), 'attack', 32.5 / 30, 'stun', 31.5 / 30 - 0.8, 0.5);
    expectPlaying(at(350), 'attack', 34 / 30);
    // The clip ends on 361 and idle fades in: 362 / 30 + 0.74 = 12.8067 s at 362, wrapped at 2.4 s: 0.8067 s.
    expectFading(at(362), 'idle', 362 / 30 + 0.74 - 5 * 2.4, 'attack', 1.5, 1 / 3);
    expectPlaying(at(366), 'attack', 0);
  });
});

describe('a melee attack', () => {
  it('still lunges at the target, at its height when the blow lands, 3 ticks into the attack', () => {
    // Played an eighth of a tick at a time from tick 44, asking about the playback's own display time each frame.
    const p = new Playback(combat([placed('sam', 3, 0)], [placed('gimli', 3, 0)]));
    p.playing = false;
    while (p.combat.tick < 44) p.step();
    p.playing = true;
    let peak = { time: 0, reach: 0, toward: 0 };
    while (p.time < 60) {
      p.advance(1 / (8 * 30));
      const lunge = p.lungeOffset(0);
      const reach = Math.hypot(lunge.x, lunge.z);
      const [from, to] = [p.position(0), p.position(1)];
      if (reach > peak.reach) peak = { time: p.time, reach, toward: lunge.x * (to.x - from.x) + lunge.z * (to.z - from.z) };
    }
    // Sam's first attack, on 46, is melee. The blow lands 0.1 s (3 ticks) into the attack clip (section 4), which is
    // where the lunge is at its height (section 5): on 49, to within the eighth of a tick sampled.
    const attack = p.combat.events.find((e) => e.type === 'attack' && e.unit === 0);
    expect(attack).toMatchObject({ tick: 46, target: 1, ranged: false });
    expect(ticksOf(p, 'attack', 0)).toEqual([46]);
    expect(peak.reach).toBeGreaterThan(0);
    expect(Math.abs(peak.time - 49)).toBeLessThanOrEqual(1 / 8 + 1e-9);
    // Towards Gimli.
    expect(peak.toward).toBeGreaterThan(0);
  });
});

describe('a stun', () => {
  it('plays from the tick it starts until it expires, over an attack, wrapped at the clip’s length', () => {
    const p = stunningDuel();
    // Gimli attacks on 201; Beregond's cast stuns him on 202 until 232, when he casts.
    expect(ticksOf(p, 'attack', 1)).toContain(201);
    expect(stunsOf(p, 1)).toEqual([[202, 232]]);
    expect(ticksOf(p, 'cast', 1)[0]).toBe(232);
    // Stunned comes before acting: the attack's clip would run to 228, but at 203 stun is 1 tick in, and as much into
    // its fade, over the attack carrying on, 2 ticks in.
    expectFading(pose(p, 1, 203), 'stun', 1 / 30, 'attack', 2 / 30, 1 / 3);
    expectPlaying(pose(p, 1, 210), 'stun', 8 / 30);
    // 28 ticks in: 0.9333 s, wrapped at 0.8 s: 0.1333 s.
    expectPlaying(pose(p, 1, 230), 'stun', 28 / 30 - 0.8);
    // The stun is gone on 232, and the cast on 232 cuts in at full weight.
    expectPlaying(pose(p, 1, 232), 'cast', 0);
    expectPlaying(pose(p, 1, 233), 'cast', 1 / 30);
  });

  it('carries on without restarting when it is extended while it lasts', () => {
    const p = doubleStun();
    // Sam (id 2) is stunned on 252 until 282; on 267 the other Beregond's stun extends it to 297. He attacks on 301.
    expect(stunsOf(p, 2)).toEqual([
      [252, 282],
      [267, 297],
    ]);
    expect(ticksOf(p, 'attack', 2)).toContain(301);
    expect(ticksOf(p, 'attack', 2).filter((t) => t > 251 && t < 301)).toEqual([]);
    expect(ticksOf(p, 'cast', 2).filter((t) => t > 251 && t < 301)).toEqual([]);
    expectPlaying(pose(p, 2, 260), 'stun', 8 / 30);
    // Still timed from 252, with no fade: 16 ticks in at 268, and past the first stun's end, 33 ticks in at 285:
    // 1.1 s, wrapped at 0.8 s: 0.3 s.
    expectPlaying(pose(p, 2, 268), 'stun', 16 / 30);
    expectPlaying(pose(p, 2, 285), 'stun', 33 / 30 - 0.8);
    expectPlaying(pose(p, 2, 296.5), 'stun', 44.5 / 30 - 0.8);
    // Free on 297, he idles: 298 / 30 + 0.37 × 2 = 10.6733 s, wrapped at 2.4 s: 1.0733 s, a tick into its fade over the
    // stun 46 ticks in: 1.5333 s, wrapped at 0.8 s: 0.7333 s.
    expectFading(pose(p, 2, 298), 'idle', 298 / 30 + 0.74 - 4 * 2.4, 'stun', 46 / 30 - 0.8, 1 / 3);
  });

  it('carries on without restarting when another starts on the tick it ends', () => {
    const p = itemBoards();
    // Team A's Aragorn (id 3): team B's Gandalf (id 16) stuns him on 190 until 250, and team B's Dáin (id 10) on 250,
    // before Aragorn can act, until 295, when he casts.
    expect(p.combat.state.units[3]).toMatchObject({ unitId: 'aragorn', team: 'A' });
    expect(startingWithin(stunsOf(p, 3), 150, 340)).toEqual([
      [190, 250],
      [250, 295],
    ]);
    expect(within(ticksOf(p, 'attack', 3), 150, 340)).toEqual([168, 310]);
    expect(within(ticksOf(p, 'cast', 3), 150, 340)).toEqual([295]);
    expect(startingWithin(stepsOf(p, 3), 150, 340)).toEqual([[172, 187]]);
    expectPlaying(pose(p, 3, 200), 'stun', 10 / 30);
    // Still timed from 190, at full weight: 59.5 ticks in at 249.5, 1.9833 s, wrapped twice at 0.8 s: 0.3833 s; 60.5 at
    // 250.5: 0.4167 s; 104.5 at 294.5, 3.4833 s, wrapped four times: 0.2833 s.
    expectPlaying(pose(p, 3, 249.5), 'stun', 59.5 / 30 - 2 * 0.8);
    expectPlaying(pose(p, 3, 250.5), 'stun', 60.5 / 30 - 2 * 0.8);
    expectPlaying(pose(p, 3, 294.5), 'stun', 104.5 / 30 - 4 * 0.8);
    // Free on 295, he casts, at full weight.
    expectPlaying(pose(p, 3, 295), 'cast', 0);
  });

  it('plays over a step that is still sliding to its hex', () => {
    const p = gandalfStuns();
    // Aragorn steps from 177 to 192, and Gandalf stuns him on 190 until 250; the step still completes (sim-spec 12.1).
    // (The Ringwraith's stun, from 116 to 161, was over long before.)
    expect(stepsOf(p, 2)).toEqual([[177, 192]]);
    expect(stunsOf(p, 2)).toEqual([
      [116, 161],
      [190, 250],
    ]);
    // At 191.5 the step has half a tick to go, but stun plays, 1.5 ticks in and halfway through its fade, over the
    // move: 14.5 / 15 × 0.6 = 0.58 s.
    expectFading(pose(p, 2, 191.5), 'stun', 0.05, 'move', 0.58, 0.5);
    expectPlaying(pose(p, 2, 195), 'stun', 5 / 30);
  });
});

describe('an attack or cast on the tick a stun starts', () => {
  it('plays out first, an attack, and stun fades in once its clip ends', () => {
    const p = gandalfWaits();
    // Gimli (id 1) attacks on 211, and Gandalf's You shall not pass stuns him on 211 until 271, when he casts.
    expect(within(ticksOf(p, 'attack', 1), 150, 300)).toEqual([161, 211, 286]);
    expect(within(ticksOf(p, 'cast', 1), 150, 300)).toEqual([271]);
    expect(stunsOf(p, 1)).toEqual([
      [211, 271],
      [436, 496],
    ]);
    expect(startingWithin(stepsOf(p, 1), 62, 300)).toEqual([]);
    // A stunned unit can't act, so the attack came before the stun on 211 and plays out first (section 5, Stunned),
    // cutting in at full weight.
    expectPlaying(pose(p, 1, 211), 'attack', 0);
    expectPlaying(pose(p, 1, 220), 'attack', 9 / 30);
    expectPlaying(pose(p, 1, 237.5), 'attack', 26.5 / 30);
    // Its 27-tick clip ends on 238, and stun shows, timed from 211, fading in over the attack held at 0.9 s: 27 ticks in
    // at 238, 0.9 s, wrapped at 0.8 s: 0.1 s; 28 ticks in at 239: 0.1333 s, a tick into the fade.
    expectFading(pose(p, 1, 238), 'stun', 27 / 30 - 0.8, 'attack', 0.9, 0);
    expectFading(pose(p, 1, 239), 'stun', 28 / 30 - 0.8, 'attack', 0.9, 1 / 3);
    expectPlaying(pose(p, 1, 241), 'stun', 30 / 30 - 0.8);
    // 59.5 ticks in at 270.5: 1.9833 s, wrapped twice: 0.3833 s.
    expectPlaying(pose(p, 1, 270.5), 'stun', 59.5 / 30 - 2 * 0.8);
    // Free on 271, the cast cuts in.
    expectPlaying(pose(p, 1, 271), 'cast', 0);
  });

  it('plays out first, a cast, and stun fades in once its clip ends', () => {
    const p = treebeardThrows();
    // Aragorn (id 1) attacks on 173 and casts Andúril on 174, when Treebeard's Boulder stuns him until 219. He attacks
    // again on 219.
    expect(within(ticksOf(p, 'attack', 1), 150, 230)).toEqual([173, 219]);
    expect(within(ticksOf(p, 'cast', 1), 150, 230)).toEqual([174]);
    expect(stunsOf(p, 1)[0]).toEqual([174, 219]);
    expect(stepsOf(p, 1)).toEqual([]);
    // The cast cuts in at full weight over the attack, and plays out.
    expectPlaying(pose(p, 1, 174), 'cast', 0);
    expectPlaying(pose(p, 1, 180), 'cast', 6 / 30);
    expectPlaying(pose(p, 1, 194.5), 'cast', 20.5 / 30);
    // Its 21-tick clip ends on 195, and stun fades in over it, held at 0.7 s: 21 ticks into the stun, 0.7 s; 22 ticks
    // in at 196, 0.7333 s.
    expectFading(pose(p, 1, 195), 'stun', 21 / 30, 'cast', 0.7, 0);
    expectFading(pose(p, 1, 196), 'stun', 22 / 30, 'cast', 0.7, 1 / 3);
    // 26 ticks in at 200: 0.8667 s, wrapped at 0.8 s: 0.0667 s.
    expectPlaying(pose(p, 1, 200), 'stun', 26 / 30 - 0.8);
    expectPlaying(pose(p, 1, 219), 'attack', 0);
  });

  it('plays out first when the stun carries on one that ended that tick: Gimli’s cast in the play-test', () => {
    const p = fullBoards();
    // Team A's Gimli (id 0) attacks on 151, and Beregond (id 11) stuns him on 152 until 182. On 182 he casts, then Dáin
    // (id 10) stuns him until 227, and Gandalf (id 16) extends that on 190 to 250. He attacks on 250 and steps on 251.
    expect(p.combat.state.units[0]).toMatchObject({ unitId: 'gimli', team: 'A' });
    expect(startingWithin(stunsOf(p, 0), 140, 260)).toEqual([
      [152, 182],
      [182, 227],
      [190, 250],
    ]);
    expect(within(ticksOf(p, 'cast', 0), 140, 260)).toEqual([182]);
    expect(within(ticksOf(p, 'attack', 0), 140, 260)).toEqual([151, 250]);
    expect(startingWithin(stepsOf(p, 0), 140, 260)).toEqual([[251, 266]]);
    // Stunned since 152: 29.5 ticks in at 181.5, 0.9833 s, wrapped at 0.8 s: 0.1833 s.
    expectPlaying(pose(p, 0, 181.5), 'stun', 29.5 / 30 - 0.8);
    // The cast came before Dáin's stun on 182, so it plays out first, cutting in at full weight.
    expectPlaying(pose(p, 0, 182), 'cast', 0);
    expectPlaying(pose(p, 0, 190), 'cast', 8 / 30);
    expectPlaying(pose(p, 0, 202.5), 'cast', 20.5 / 30);
    // Its 21-tick clip ends on 203, and stun fades in over it, held at 0.7 s.
    const fading = pose(p, 0, 204);
    expect(fading).toMatchObject({ clip: 'stun', from: { clip: 'cast' } });
    expect(fading.from?.time).toBeCloseTo(0.7, 9);
    expect(fading.weight).toBeCloseTo(1 / 3, 9);
    // How far into the stun is left open: timed from 152, as the stun carried on from Beregond's, 52 ticks in at 204,
    // 1.7333 s, wrapped twice: 0.1333 s; or from Dáin's on 182, 22 ticks in, 0.7333 s. At 207, at full weight: 55 ticks,
    // 0.2333 s, or 25 ticks, 0.0333 s.
    expectOneOf(fading.time, [52 / 30 - 2 * 0.8, 22 / 30]);
    const stunned = pose(p, 0, 207);
    expect({ clip: stunned.clip, from: stunned.from, weight: stunned.weight }).toEqual({ clip: 'stun', from: null, weight: 1 });
    expectOneOf(stunned.time, [55 / 30 - 2 * 0.8, 25 / 30 - 0.8]);
    // Free on 250, the attack cuts in; the step on 251 fades in over it: 1/15 × 0.6 = 0.04 s at 252, over the attack
    // 2 ticks in.
    expectPlaying(pose(p, 0, 250), 'attack', 0);
    expectFading(pose(p, 0, 252), 'move', 0.04, 'attack', 2 / 30, 1 / 3);
  });

  it('plays out first until its side wins, and victory fades in over it', () => {
    const p = finished(combat([placed('gimli', 2, 3, 2), placed('gimli', 4, 3, 2)], [placed('beregond', 3, 3)]));
    expect(unitsOf(p)).toEqual(['gimli', 'gimli', 'beregond']);
    // The first Gimli (id 0) attacks on 151, and Beregond stuns him on 151 until 181; team A wins on 166.
    expect(within(ticksOf(p, 'attack', 0), 120, 166)).toEqual([151]);
    expect(stunsOf(p, 0)).toEqual([[151, 181]]);
    expect(endOf(p)).toEqual({ tick: 166, outcome: 'A' });
    expectPlaying(pose(p, 0, 165.5), 'attack', 14.5 / 30);
    // At 167: victory 1 tick in, over the attack carrying on, 16 ticks in.
    expectFading(pose(p, 0, 167), 'victory', 1 / 30, 'attack', 16 / 30, 1 / 3);
    // Still stunned at 180, after the attack's clip ended on 178, but won comes before stunned: victory, 14 ticks in.
    expectPlaying(pose(p, 0, 180), 'victory', 14 / 30);
  });
});

describe('death', () => {
  it('plays from the unit’s death, over what it was doing, and holds on its last frame', () => {
    const p = walkingDuel();
    // Sam dies on 697, a tick after his last attack.
    expect(ticksOf(p, 'death', 0)).toEqual([697]);
    expect(ticksOf(p, 'attack', 0).at(-1)).toBe(696);
    // At 698: death 1 tick in, and as far into its fade, over the attack 2 ticks in.
    expectFading(pose(p, 0, 698), 'death', 1 / 30, 'attack', 2 / 30, 1 / 3);
    expectPlaying(pose(p, 0, 703), 'death', 6 / 30);
    // The 12-tick clip ends on 709 and holds.
    expectPlaying(pose(p, 0, 715), 'death', 0.4);
  });

  it('comes before a stun', () => {
    const p = gandalfStuns();
    // Aragorn dies on 239, stunned since 190 until 250.
    expect(stunsOf(p, 2)).toEqual([
      [116, 161],
      [190, 250],
    ]);
    expect(ticksOf(p, 'death', 2)).toEqual([239]);
    // At 239.5: death 0.5 ticks in, a sixth of the way through its fade, over the stun 49.5 ticks in: 1.65 s, wrapped
    // twice at 0.8 s: 0.05 s.
    expectFading(pose(p, 2, 239.5), 'death', 0.5 / 30, 'stun', 49.5 / 30 - 2 * 0.8, 1 / 6);
    expectPlaying(pose(p, 2, 255), 'death', 0.4);
  });
});

describe('sinking after death', () => {
  it('starts halfway through the death clip, or at once without one', () => {
    expect(sinkDelay(LENGTHS)).toBeCloseTo(0.2, 10);
    expect(sinkDelay({ ...LENGTHS, death: 0.5 })).toBeCloseTo(0.25, 10);
    expect(sinkDelay(null)).toBe(0);
  });

  it('is what deathProgress waits for, then the sink and fade take 15 ticks', () => {
    const p = walkingDuel();
    // Sam dies on 697; halfway through his 12-tick death clip is 703, and he has sunk and faded by 718.
    expect(ticksOf(p, 'death', 0)).toEqual([697]);
    const delay = sinkDelay(LENGTHS);
    expect(p.deathProgress(0, 697, delay)).toBe(0);
    expect(p.deathProgress(0, 703, delay)).toBe(0);
    expect(p.deathProgress(0, 703 + 7.5, delay)).toBeCloseTo(0.5, 10);
    expect(p.deathProgress(0, 718, delay)).toBe(1);
    // Without a death clip it starts at once.
    expect(p.deathProgress(0, 697 + 7.5, sinkDelay(null))).toBeCloseTo(0.5, 10);
  });
});

describe('victory', () => {
  it('plays for the living winners from the end, over what they were doing, and holds; dead winners play death', () => {
    const p = gandalfStuns();
    // Team A wins on 239. Gandalf (id 1) last attacked on 236; the Ringwraith (id 0) died on 162.
    expect(endOf(p)).toEqual({ tick: 239, outcome: 'A' });
    expect(ticksOf(p, 'attack', 1).at(-1)).toBe(236);
    expect(ticksOf(p, 'cast', 1).at(-1)).toBeLessThan(236);
    expect(ticksOf(p, 'death', 0)).toEqual([162]);
    // At 240: victory 1 tick in, and as far into its fade, over the attack 4 ticks in.
    expectFading(pose(p, 1, 240), 'victory', 1 / 30, 'attack', 4 / 30, 1 / 3);
    expectPlaying(pose(p, 1, 243), 'victory', 4 / 30);
    // The 15-tick clip ends on 254 and holds.
    expectPlaying(pose(p, 1, 258), 'victory', 0.5);
    // Dead comes before won: the Ringwraith's death clip, long since held on its last frame.
    expectPlaying(pose(p, 0, 245), 'death', 0.4);
  });

  it('comes before a stun', () => {
    const p = finished(combat([placed('aragorn', 2, 3, 2), placed('aragorn', 4, 3, 2)], [placed('ringwraith', 3, 3)]));
    expect(unitsOf(p)).toEqual(['aragorn', 'aragorn', 'ringwraith']);
    // The Ringwraith stuns the first Aragorn (id 0) on 78 until 123, well after his last attack, on 44, whose clip ended
    // on 71. Team A wins on 102.
    expect(stunsOf(p, 0)).toEqual([[78, 123]]);
    expect(ticksOf(p, 'attack', 0)).toEqual([1, 44]);
    expect(ticksOf(p, 'cast', 0)).toEqual([]);
    expect(endOf(p)).toEqual({ tick: 102, outcome: 'A' });
    expectPlaying(pose(p, 0, 90), 'stun', 12 / 30);
    // At 103: victory 1 tick in, over the stun 25 ticks in: 0.8333 s, wrapped at 0.8 s: 0.0333 s.
    expectFading(pose(p, 0, 103), 'victory', 1 / 30, 'stun', 25 / 30 - 0.8, 1 / 3);
    // Still stunned at 110, but playing victory, 8 ticks in; held on its last frame by 120.
    expectPlaying(pose(p, 0, 110), 'victory', 8 / 30);
    expectPlaying(pose(p, 0, 120), 'victory', 0.5);
  });

  it('isn’t played by anyone after a draw', () => {
    const p = finished(combat([placed('elrond', 3, 3)], [placed('elrond', 3, 3)]));
    expect(unitsOf(p)).toEqual(['elrond', 'elrond']);
    // Both Elronds are alive when time runs out on 1349 (sim-spec 6.1), having last attacked on 1317 and not been stunned.
    expect(endOf(p)).toEqual({ tick: 1349, outcome: 'draw' });
    expect(ticksOf(p, 'attack', 0).at(-1)).toBe(1317);
    expect(ticksOf(p, 'attack', 1).at(-1)).toBe(1317);
    expect(ticksOf(p, 'cast', 0).at(-1)).toBeLessThan(1317);
    expect(ticksOf(p, 'cast', 1).at(-1)).toBeLessThan(1317);
    expect([...stunsOf(p, 0), ...stunsOf(p, 1)]).toEqual([]);
    // Their attack clips ended on 1344, so at 1359 they idle: 1359 / 30 = 45.3 s, wrapped at 2.4 s: 2.1 s;
    // and 45.3 + 0.37 = 45.67 s, wrapped: 0.07 s.
    expectPlaying(pose(p, 0, 1359), 'idle', 45.3 - 18 * 2.4);
    expectPlaying(pose(p, 1, 1359), 'idle', 45.67 - 19 * 2.4);
  });
});

describe('fades', () => {
  it('fade a new clip in over 3 ticks, its weight rising evenly from 0 to 1, while the one before carries on', () => {
    const p = walkingDuel();
    // Sam's first attack's clip ends on 73, and idle, which isn't one of the cuts, fades in over it: k ticks later its
    // weight is k / 3, while the attack holds its last frame, 0.9 s, and idle runs on: 73 / 30 = 2.4333 s at 73, wrapped
    // at 2.4 s: 0.0333 s.
    expect(ticksOf(p, 'attack', 0).slice(0, 2)).toEqual([46, 96]);
    for (const k of [0, 0.5, 1, 1.5, 2, 2.75]) {
      expectFading(pose(p, 0, 73 + k), 'idle', (73 + k) / 30 - 2.4, 'attack', 0.9, k / 3);
    }
    expectPlaying(pose(p, 0, 73 + FADE_TICKS), 'idle', 76 / 30 - 2.4);
    // Likewise a step over idle from the fight's start: at 1 + k the move is k / 15 × 0.6 s in, at weight k / 3.
    for (const k of [0, 0.5, 1.5, 2.25]) expectFading(pose(p, 0, 1 + k), 'move', (k / 15) * 0.6, 'idle', (1 + k) / 30, k / 3);
  });

  it('fade the fight’s first clips in over idle, which every unit counts as playing before the fight starts', () => {
    const p = finished(combat([placed('sam', 3, 3, 1, ['elven-rope'])], [placed('gimli', 3, 3)]));
    expect(unitsOf(p)).toEqual(['sam', 'gimli']);
    // Sam's Elven Rope stuns Gimli (id 1) on tick 0 for 3 s, until 90 (sim-spec 6.2); Sam (id 0) attacks on 1.
    expect(stunsOf(p, 1)).toEqual([[0, 90]]);
    expect(ticksOf(p, 'attack', 0)[0]).toBe(1);
    expect(ticksOf(p, 'attack', 1)[0]).toBe(90);
    // Gimli's stun fades in from 0 over idle, which runs from 0.37 × 1 s: k ticks in, k / 30 s over 0.37 + k / 30 s.
    for (const k of [0, 1, 1.5]) expectFading(pose(p, 1, k), 'stun', k / 30, 'idle', 0.37 + k / 30, k / 3);
    expectPlaying(pose(p, 1, 3), 'stun', 3 / 30);
    // Sam's attack cuts in over idle on 1, and Gimli's, as his stun ends, on 90.
    expectPlaying(pose(p, 0, 1), 'attack', 0);
    expectPlaying(pose(p, 1, 90), 'attack', 0);
  });
});

describe('reduced motion', () => {
  it('holds idle and stun on their first frame, and plays the other clips', () => {
    const p = walkingDuel();
    // The same moments as above, with `still`.
    expectPlaying(pose(p, 0, 80, true), 'idle', 0);
    expectPlaying(pose(p, 0, 6, true), 'move', 0.2);
    expectPlaying(pose(p, 0, 50, true), 'attack', 4 / 30);
    expectPlaying(pose(p, 0, 260, true), 'cast', 13 / 30);
    expectPlaying(pose(p, 0, 703, true), 'death', 6 / 30);
    // Gimli has won since 697: 6 ticks in.
    expectPlaying(pose(p, 1, 703, true), 'victory', 6 / 30);
    // Idle fading out holds its first frame too, and so does idle fading in.
    expectFading(pose(p, 0, 2, true), 'move', 0.04, 'idle', 0, 1 / 3);
    expectFading(pose(p, 0, 74, true), 'idle', 0, 'attack', 0.9, 1 / 3);

    const q = stunningDuel();
    expectPlaying(pose(q, 1, 210, true), 'stun', 0);
    // Stun fading in holds its first frame; the cast on 232 cuts in and plays.
    expectFading(pose(q, 1, 203, true), 'stun', 0, 'attack', 2 / 30, 1 / 3);
    expectPlaying(pose(q, 1, 233, true), 'cast', 1 / 30);
    // And so does stun fading out.
    const r = doubleStun();
    expectFading(pose(r, 2, 298, true), 'idle', 0, 'stun', 0, 1 / 3);
  });
});

describe('planning', () => {
  it('idles in real time, 0.37 s further on for each id, wrapped at the clip’s length', () => {
    // seconds + 0.37 × key: 1 s; 1 + 1.11 = 2.11 s; 2 + 1.11 = 3.11 s, wrapped at 2.4 s: 0.71 s;
    // 100.5 + 2.59 = 103.09 s, wrapped: 103.09 − 42 × 2.4 = 2.29 s.
    expectPlaying(planningPose(LENGTHS, 1, 0), 'idle', 1);
    expectPlaying(planningPose(LENGTHS, 1, 3), 'idle', 2.11);
    expectPlaying(planningPose(LENGTHS, 2, 3), 'idle', 0.71);
    expectPlaying(planningPose(LENGTHS, 100.5, 7), 'idle', 2.29);
    // Wrapped at the model's own idle: 1 + 0.74 = 1.74 s, wrapped at 1.5 s: 0.24 s.
    expectPlaying(planningPose({ ...LENGTHS, idle: 1.5 }, 1, 2), 'idle', 0.24);
  });

  it('holds idle on its first frame for reduced motion', () => {
    expectPlaying(planningPose(LENGTHS, 2, 3, true), 'idle', 0);
    expectPlaying(planningPose(LENGTHS, 100.5, 7, true), 'idle', 0);
  });
});

describe('display time', () => {
  it('is the playback’s own unless another is given', () => {
    const p = new Playback(combat([placed('sam', 3, 0)], [placed('gimli', 3, 0)]));
    p.advance(1.505);
    // About 45.15 ticks: Sam's third step, from 31 to 46, is 14.15 ticks in.
    expect(p.time).toBeCloseTo(45.15, 6);
    expect(fightPose(p, 0, LENGTHS)).toEqual(fightPose(p, 0, LENGTHS, { time: p.time }));
    expectPlaying(fightPose(p, 0, LENGTHS), 'move', ((p.time - 31) / 15) * 0.6);
  });

  it('gives the same poses for the same times, however playback got there: frame by frame, at any speed, paused or stepped', () => {
    const fight = () => combat([placed('ringwraith', 2, 3), placed('gandalf', 4, 3)], [placed('aragorn', 3, 3)]);
    const live = new Playback(fight());
    const units = live.combat.state.units.map((u) => u.id);
    const poses = (p: Playback, time?: number) => units.map((u) => fightPose(p, u, LENGTHS, time === undefined ? {} : { time }));
    const seen: { time: number; poses: Pose[] }[] = [];
    const speeds = [1, 0.25, 4, 2, 0.5];
    for (let frame = 0; frame < 1200; frame++) {
      live.speed = speeds[Math.floor(frame / 90) % speeds.length]!;
      if (frame % 200 === 100) {
        // Paused, time stands still and so does every pose; a single step moves on a tick.
        live.playing = false;
        const before = poses(live);
        live.advance(1 / 60);
        expect(poses(live)).toEqual(before);
        live.step();
        seen.push({ time: live.time, poses: poses(live) });
        live.playing = true;
      }
      live.advance(1 / 60);
      seen.push({ time: live.time, poses: poses(live) });
    }
    expect(live.combat.isOver()).toBe(true);
    // Other playbacks, run to the end at once and only then asked, give the same answers: about every one of those
    // times from the last back to the first, and about one time in seven, as a slow frame rate would.
    const backwards = finished(fight());
    for (const { time, poses: then } of [...seen].reverse()) expect(poses(backwards, time)).toEqual(then);
    const sparse = finished(fight());
    for (const { time, poses: then } of seen.filter((_, i) => i % 7 === 3)) expect(poses(sparse, time)).toEqual(then);
  });
});

// Facing (section 5, Facing) is an angle about the vertical, as facing() gives: 0 towards +z and π/2 towards +x. On the
// board (section 3, and layout.ts, which puts team A's rows nearest the camera), a step of one hex in axial (q, r)
// moves x by √3 × (q + r / 2) and z by −1.5 × r, so the six ways a step can go are:
//   (+1, 0): π/2   (+1, −1): π/6   (0, −1): −π/6   (−1, 0): −π/2   (−1, +1): −5π/6   (0, +1): 5π/6
// Section 5 gives an angle only up to whole turns, so the tests compare angles a whole turn apart as equal.

const PI = Math.PI;

/** The shorter way round from one angle to another, between −π and π. */
function turn(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** An angle, the same as `expected` give or take whole turns. */
function expectAngle(actual: number | null, expected: number): void {
  expect(actual, 'an angle').not.toBeNull();
  expect(Math.abs(turn(expected, actual ?? Number.NaN)), `${actual} should be ${expected}, give or take whole turns`).toBeLessThan(1e-9);
}

/** A number that is one of `candidates`. */
function expectOneOf(actual: number, candidates: readonly number[]): void {
  expect(candidates.some((candidate) => Math.abs(actual - candidate) < 1e-9), `${actual} should be one of ${candidates.join(', ')}`).toBe(true);
}

/**
 * A unit `share` of the way through the 3 ticks over which a step turns it from facing its target to the way it goes:
 * evenly, the shorter way round. Section 5 doesn't say whether the way to its target is taken as the step starts
 * (`atStart`) or as the unit moves on (`now`), which differ by under a degree here, so this takes either, or anything
 * between them.
 */
function expectTurningIn(actual: number | null, share: number, atStart: number, now: number, way: number): void {
  const fromStart = atStart + share * turn(atStart, way);
  const fromNow = now + share * turn(now, way);
  const off = turn(fromStart, actual ?? Number.NaN);
  const span = turn(fromStart, fromNow);
  expect(off, `${actual} should be from ${fromStart} to ${fromNow}`).toBeGreaterThanOrEqual(Math.min(0, span) - 1e-9);
  expect(off, `${actual} should be from ${fromStart} to ${fromNow}`).toBeLessThanOrEqual(Math.max(0, span) + 1e-9);
}

/** A new playback of the fight at display time `time`: stepped tick by tick to it, then run on by the part of a tick left. */
function playbackAt(fight: () => Combat, time: number): Playback {
  const p = new Playback(fight());
  p.playing = false;
  while (p.combat.tick < Math.floor(time) && !p.combat.isOver()) p.step();
  p.playing = true;
  if (time > p.time) p.advance((time - p.time) / TICKS_PER_SECOND);
  expect(p.time).toBeCloseTo(time, 9);
  return p;
}

/** The way a unit faces at a display time, given its target in `combat.state` then, which is `target`. */
function facingAt(fight: () => Combat, unit: number, time: number, target: number | null): number | null {
  const p = playbackAt(fight, time);
  expect(p.combat.state.units[unit]?.target, `unit ${unit}'s target at ${time}`).toBe(target);
  return fightFacing(p, unit, target);
}

/** A unit's steps or dashes, with the hexes they go between. */
function motionsOf(p: Playback, type: 'move' | 'dash', unit: number): { tick: number; from: Hex; to: Hex }[] {
  return p.combat.events.flatMap((e) => ((e.type === 'move' || e.type === 'dash') && e.type === type && e.unit === unit ? [{ tick: e.tick, from: e.from, to: e.to }] : []));
}

function spawnHexOf(p: Playback, unit: number): Hex | null {
  const spawn = p.combat.events.find((e) => e.type === 'spawn' && e.unit === unit);
  return spawn?.type === 'spawn' ? spawn.hex : null;
}

describe('facing', () => {
  const duel = () => combat([placed('sam', 3, 0)], [placed('gimli', 3, 0)]);

  it('is the way a step goes while it moves the unit, from its from hex to its to hex, whatever the target', () => {
    const p = walkingDuel();
    expect(stepsOf(p, 0)).toEqual([
      [1, 16],
      [16, 31],
      [31, 46],
    ]);
    expect(motionsOf(p, 'move', 0)).toEqual([
      { tick: 1, from: { q: 3, r: 0 }, to: { q: 2, r: 1 } },
      { tick: 16, from: { q: 2, r: 1 }, to: { q: 1, r: 2 } },
      { tick: 31, from: { q: 1, r: 2 }, to: { q: 1, r: 3 } },
    ]);
    expect(motionsOf(p, 'move', 1)).toEqual([
      { tick: 1, from: { q: 0, r: 7 }, to: { q: 1, r: 6 } },
      { tick: 16, from: { q: 1, r: 6 }, to: { q: 1, r: 5 } },
      { tick: 31, from: { q: 1, r: 5 }, to: { q: 1, r: 4 } },
    ]);
    // Sam's first two steps are (−1, +1), −5π/6, and his third (0, +1), 5π/6; Gimli's first is (+1, −1), π/6, and the
    // other two (0, −1), −π/6. Each faces that way from 3 ticks into the step until it arrives, 15 ticks in.
    expectAngle(facingAt(duel, 0, 10, 1), (-5 * PI) / 6);
    expectAngle(facingAt(duel, 0, 25, 1), (-5 * PI) / 6);
    expectAngle(facingAt(duel, 0, 45.5, 1), (5 * PI) / 6);
    expectAngle(facingAt(duel, 1, 10, 0), PI / 6);
    expectAngle(facingAt(duel, 1, 45.5, 0), -PI / 6);
    // Its target doesn't matter while it steps, nor whether it has one.
    const q = playbackAt(duel, 10);
    expectAngle(fightFacing(q, 0, null), (-5 * PI) / 6);
    expectAngle(fightFacing(q, 1, null), PI / 6);
  });

  it('turns evenly over the first 3 ticks of a step, the shorter way round, from the way the step before went', () => {
    // Sam's second step, on 16, goes the way his first went, so he doesn't turn.
    for (const t of [16, 16.5, 17.5, 18.5, 20]) expectAngle(facingAt(duel, 0, t, 1), (-5 * PI) / 6);
    // His third, on 31, turns him from −5π/6 to 5π/6. The shorter way is π/3 through ±π, where he faces straight down
    // the board, rather than 5π/3 through 0, back at his own side: π/12 for each 3/4 of a tick.
    expectAngle(facingAt(duel, 0, 31, 1), (-5 * PI) / 6);
    expectAngle(facingAt(duel, 0, 31.75, 1), (-11 * PI) / 12);
    expectAngle(facingAt(duel, 0, 32.5, 1), PI);
    expectAngle(facingAt(duel, 0, 33.25, 1), (11 * PI) / 12);
    expectAngle(facingAt(duel, 0, 34, 1), (5 * PI) / 6);
    // Gimli's second step, on 16, turns him from π/6 to −π/6, through 0.
    expectAngle(facingAt(duel, 1, 16, 0), PI / 6);
    expectAngle(facingAt(duel, 1, 16.75, 0), PI / 12);
    expectAngle(facingAt(duel, 1, 17.5, 0), 0);
    expectAngle(facingAt(duel, 1, 18.25, 0), -PI / 12);
    expectAngle(facingAt(duel, 1, 19, 0), -PI / 6);
    // Each arrives on 46 facing the other, the way his last step went, so neither turns back: from (1, 3) Gimli is
    // (0, +1), 5π/6, and from (1, 4) Sam is (0, −1), −π/6.
    for (const t of [46, 47.5, 49, 60]) {
      expectAngle(facingAt(duel, 0, t, 1), (5 * PI) / 6);
      expectAngle(facingAt(duel, 1, t, 0), -PI / 6);
    }
  });

  it('turns evenly from the way to its target as a step starts, and back to its target over the 3 ticks after it', () => {
    const p = khamulRides();
    // Khamûl (id 0) stands on (2, 3) until he dashes on 174. The second Gimli (id 2), on (0, 4), steps to (1, 3) from 1
    // to 16, and next moves on 174.
    expect(spawnHexOf(p, 0)).toEqual({ q: 2, r: 3 });
    expect(motionsOf(p, 'dash', 0)[0]?.tick).toBe(174);
    expect(motionsOf(p, 'move', 0)[0]?.tick).toBeGreaterThan(174);
    expect(motionsOf(p, 'move', 2).slice(0, 2)).toEqual([
      { tick: 1, from: { q: 0, r: 4 }, to: { q: 1, r: 3 } },
      { tick: 174, from: { q: 1, r: 3 }, to: { q: 0, r: 4 } },
    ]);
    expect(stepsOf(p, 2)[0]).toEqual([1, 16]);
    // From (0, 4) Khamûl is (+2, −1): x √3 × 1.5, z 1.5, π/3. The step, (+1, −1), goes π/6. From (1, 3) Khamûl is
    // (+1, 0), π/2. So Gimli faces π/3 on 1, turns by π/6 the shorter way to π/6 by 4, and faces π/6 until he arrives.
    expectAngle(facingAt(khamulRidesFight, 2, 1, 0), PI / 3);
    const q = playbackAt(khamulRidesFight, 2.5);
    expectTurningIn(fightFacing(q, 2, 0), 0.5, facing(q.position(2, 1), q.position(0, 1))!, facing(q.position(2), q.position(0))!, PI / 6);
    expectAngle(facingAt(khamulRidesFight, 2, 4, 0), PI / 6);
    expectAngle(facingAt(khamulRidesFight, 2, 15.5, 0), PI / 6);
    // From 16 he turns back by π/3 to face Khamûl, a third of it a tick: π/4 by 16.75, π/3 by 17.5, 5π/12 by 18.25.
    expectAngle(facingAt(khamulRidesFight, 2, 16, 0), PI / 6);
    expectAngle(facingAt(khamulRidesFight, 2, 16.75, 0), PI / 4);
    expectAngle(facingAt(khamulRidesFight, 2, 17.5, 0), PI / 3);
    expectAngle(facingAt(khamulRidesFight, 2, 18.25, 0), (5 * PI) / 12);
    expectAngle(facingAt(khamulRidesFight, 2, 19, 0), PI / 2);
    expectAngle(facingAt(khamulRidesFight, 2, 100, 0), PI / 2);
  });

  it('turns the same way around a step that a stun cuts into', () => {
    const p = gandalfStuns();
    // Aragorn (id 2) steps from (1, 4) to (2, 4), (+1, 0) at π/2, from 177 to 192, towards Gandalf (id 1), who stands on
    // (3, 3) all fight: (+2, −1) from (1, 4), π/3, and (+1, −1) from (2, 4), π/6. The stun from 190 changes nothing.
    expect(motionsOf(p, 'move', 2)).toEqual([{ tick: 177, from: { q: 1, r: 4 }, to: { q: 2, r: 4 } }]);
    expect(stepsOf(p, 2)).toEqual([[177, 192]]);
    expect(spawnHexOf(p, 1)).toEqual({ q: 3, r: 3 });
    expect(motionsOf(p, 'move', 1)).toEqual([]);
    expect(startingWithin(stunsOf(p, 2), 170, 200)).toEqual([[190, 250]]);
    expectAngle(facingAt(gandalfStunsFight, 2, 177, 1), PI / 3);
    const q = playbackAt(gandalfStunsFight, 178.5);
    expectTurningIn(fightFacing(q, 2, 1), 0.5, facing(q.position(2, 177), q.position(1, 177))!, facing(q.position(2), q.position(1))!, PI / 2);
    expectAngle(facingAt(gandalfStunsFight, 2, 180, 1), PI / 2);
    expectAngle(facingAt(gandalfStunsFight, 2, 191.5, 1), PI / 2);
    // From 192 back by π/3 to Gandalf: π/3 by 193.5.
    expectAngle(facingAt(gandalfStunsFight, 2, 192, 1), PI / 2);
    expectAngle(facingAt(gandalfStunsFight, 2, 193.5, 1), PI / 3);
    expectAngle(facingAt(gandalfStunsFight, 2, 195, 1), PI / 6);
    expectAngle(facingAt(gandalfStunsFight, 2, 200, 1), PI / 6);
  });

  it('is the way a dash goes from 3 ticks into it until it ends, and turns back to its target over the 3 ticks after', () => {
    const leaps = () => combat([placed('merry', 2, 0), placed('bilbo', 4, 0)], [placed('gimli', 3, 0)]);
    const p = finished(leaps());
    expect(unitsOf(p)).toEqual(['merry', 'bilbo', 'gimli']);
    // On tick 0 Merry (id 0) leaps from (2, 0) to (0, 6), and Bilbo (id 1) from (4, 0) to (1, 6), next to Gimli (id 2) on
    // (0, 7), who doesn't move before 10. A dash takes 4 ticks (section 5).
    expect(motionsOf(p, 'dash', 0)).toEqual([{ tick: 0, from: { q: 2, r: 0 }, to: { q: 0, r: 6 } }]);
    expect(motionsOf(p, 'dash', 1)).toEqual([{ tick: 0, from: { q: 4, r: 0 }, to: { q: 1, r: 6 } }]);
    expect(spawnHexOf(p, 2)).toEqual({ q: 0, r: 7 });
    expect(motionsOf(p, 'move', 2).filter((m) => m.tick < 10)).toEqual([]);
    // Bilbo's dash, (−3, +6), moves x by √3 × (−3 + 3) = 0 and z by −9: π, straight down the board. On 0 he faces
    // Gimli, (−4, +7) away: x −√3/2, z −10.5. From (1, 6) Gimli is (−1, +1), −5π/6.
    expectAngle(facingAt(leaps, 1, 0, 2), Math.atan2(-Math.sqrt(3) / 2, -10.5));
    expectAngle(facingAt(leaps, 1, 3, 2), PI);
    expectAngle(facingAt(leaps, 1, 3.5, 2), PI);
    // From 4 he turns back by π/6 to Gimli, the shorter way through ±π rather than 11π/6 through 0: π/24 for each
    // 3/4 of a tick.
    expectAngle(facingAt(leaps, 1, 4, 2), PI);
    expectAngle(facingAt(leaps, 1, 4.75, 2), PI + PI / 24);
    expectAngle(facingAt(leaps, 1, 5.5, 2), PI + PI / 12);
    expectAngle(facingAt(leaps, 1, 6.25, 2), PI + PI / 8);
    expectAngle(facingAt(leaps, 1, 7, 2), (-5 * PI) / 6);
    expectAngle(facingAt(leaps, 1, 8, 2), (-5 * PI) / 6);
    // Merry's, (−2, +6), moves x by √3 and z by −9. On 0 Gimli is (−2, +7) away: x √3 × 1.5, z −10.5. From (0, 6) he is
    // (0, +1), 5π/6, under 20° from the dash, so Merry turns back the direct way.
    const dash = Math.atan2(Math.sqrt(3), -9);
    expectAngle(facingAt(leaps, 0, 0, 2), Math.atan2(1.5 * Math.sqrt(3), -10.5));
    expectAngle(facingAt(leaps, 0, 3.5, 2), dash);
    expectAngle(facingAt(leaps, 0, 4, 2), dash);
    expectAngle(facingAt(leaps, 0, 5.5, 2), dash + ((5 * PI) / 6 - dash) / 2);
    expectAngle(facingAt(leaps, 0, 7, 2), (5 * PI) / 6);
  });

  it('is towards its target otherwise, from its position to the target’s, without the lunge', () => {
    const p = gandalfStuns();
    // The Ringwraith (id 0) on (1, 3) and Gandalf (id 1) on (3, 3) never move. Aragorn (id 2) on (1, 4) steps to (2, 4)
    // from 177 to 192.
    expect([0, 1, 2].map((unit) => spawnHexOf(p, unit))).toEqual([
      { q: 1, r: 3 },
      { q: 3, r: 3 },
      { q: 1, r: 4 },
    ]);
    expect([...motionsOf(p, 'move', 0), ...motionsOf(p, 'move', 1), ...motionsOf(p, 'dash', 0), ...motionsOf(p, 'dash', 1)]).toEqual([]);
    expect(stepsOf(p, 2)).toEqual([[177, 192]]);
    // From Gandalf, Aragorn is (−2, +1): x −√3 × 1.5, z −1.5, −2π/3. From the Ringwraith he is (0, +1), 5π/6.
    expectAngle(facingAt(gandalfStunsFight, 1, 100, 2), (-2 * PI) / 3);
    expectAngle(facingAt(gandalfStunsFight, 0, 100, 2), (5 * PI) / 6);
    // Halfway through his step Aragorn is at (1.5, 4), (−1.5, +1) from Gandalf: x −√3, z −1.5.
    expectAngle(facingAt(gandalfStunsFight, 1, 184.5, 2), Math.atan2(-Math.sqrt(3), -1.5));
    // Aragorn's melee attack on 44 lunges at the Ringwraith, at its height on 47. Gandalf faces where Aragorn stands.
    expect(p.combat.events.find((e) => e.type === 'attack' && e.unit === 2 && e.tick === 44)).toMatchObject({ target: 0, ranged: false });
    const q = playbackAt(gandalfStunsFight, 47);
    const lunge = q.lungeOffset(2);
    expect(Math.hypot(lunge.x, lunge.z)).toBeGreaterThan(0.1);
    expect(q.combat.state.units[1]?.target).toBe(2);
    expectAngle(fightFacing(q, 1, 2), (-2 * PI) / 3);
    // Which the lunge would have turned.
    const lunging = facing(q.position(1), { x: q.position(2).x + lunge.x, z: q.position(2).z + lunge.z })!;
    expect(Math.abs(turn((-2 * PI) / 3, lunging))).toBeGreaterThan(0.05);
  });

  it('has nowhere to face without a target, with the target in its own place, or once dead', () => {
    // Before tick 1 nobody has a target (sim-spec 6.2).
    const start = playbackAt(duel, 0.5);
    expect(start.combat.state.units.map((u) => u.target)).toEqual([null, null]);
    expect(fightFacing(start, 0, null)).toBeNull();
    expect(fightFacing(start, 1, null)).toBeNull();
    // Gandalf, standing still on 100, with no target, or himself as one.
    const q = playbackAt(gandalfStunsFight, 100);
    expect(fightFacing(q, 1, null)).toBeNull();
    expect(fightFacing(q, 1, 1)).toBeNull();
    // The Ringwraith dies on 162: at 161.5 it faces Aragorn, from (1, 3) to (1, 4), 5π/6, and from 162 nowhere, even
    // given a target.
    expect(ticksOf(gandalfStuns(), 'death', 0)).toEqual([162]);
    expectAngle(facingAt(gandalfStunsFight, 0, 161.5, 2), (5 * PI) / 6);
    expect(fightFacing(playbackAt(gandalfStunsFight, 162), 0, 2)).toBeNull();
    expect(fightFacing(playbackAt(gandalfStunsFight, 170), 0, 2)).toBeNull();
    // Sam dies on 697, the last tick; in the afterglow too.
    expect(ticksOf(walkingDuel(), 'death', 0)).toEqual([697]);
    expectAngle(facingAt(duel, 0, 696.5, 1), (5 * PI) / 6);
    expect(fightFacing(playbackAt(duel, 697), 0, 1)).toBeNull();
    expect(fightFacing(playbackAt(duel, 710), 0, 1)).toBeNull();
  });

  it('gives the same angle at a display time however playback got there: frame by frame, at any speed, paused or stepped', () => {
    const live = new Playback(khamulRidesFight());
    const units = live.combat.state.units.map((u) => u.id);
    const angles = (p: Playback) => units.map((u) => fightFacing(p, u, p.combat.state.units[u]?.target ?? null));
    const seen: { time: number; angles: (number | null)[] }[] = [];
    const speeds = [1, 0.25, 4, 2, 0.5];
    // Frames of 1/47 s, which seldom end on a whole tick, at each speed in turn: by frame 360 the fight (over on 316)
    // and its afterglow are done.
    for (let frame = 0; frame < 400; frame++) {
      live.speed = speeds[Math.floor(frame / 90) % speeds.length]!;
      if (frame % 200 === 100) {
        // Paused, time stands still and so does every angle.
        live.playing = false;
        const before = angles(live);
        live.advance(1 / 47);
        expect(angles(live)).toEqual(before);
        live.step();
        live.playing = true;
      }
      live.advance(1 / 47);
      seen.push({ time: live.time, angles: angles(live) });
    }
    expect(live.combat.isOver()).toBe(true);
    // New playbacks brought straight to some of those times give the same angles. (Times within a hair of a whole tick
    // are left out, where rounding could put the two on different ticks.)
    const sampled = seen.filter(({ time }, i) => i % 5 === 2 && Math.abs(time - Math.round(time)) > 1e-6);
    expect(sampled.length).toBeGreaterThan(40);
    for (const { time, angles: then } of sampled) {
      const now = angles(playbackAt(khamulRidesFight, time));
      now.forEach((angle, i) => {
        const before = then[i];
        if (before === null || before === undefined) expect(angle, `unit ${i} at ${time}`).toBeNull();
        else expectAngle(angle, before);
      });
    }
  });
});

/** The fight, with one more event on its tick: after the sim's own events, or just before the unit's attack. */
function withEvent(fight: Combat, extra: CastEvent, beforeAttack: boolean): Combat {
  const events: CombatEvent[] = [...fight.events];
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
      if (fight.tick === extra.tick) {
        const attack = stepped.findIndex((e) => e.type === 'attack' && e.unit === extra.unit);
        stepped.splice(beforeAttack && attack >= 0 ? attack : stepped.length, 0, extra);
      }
      events.push(...stepped);
      return stepped;
    },
    isOver: () => fight.isOver(),
    result: () => fight.result(),
  };
}
