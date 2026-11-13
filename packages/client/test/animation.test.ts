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
import { Effects } from '../src/effects.js';
import { EFFECTS } from '../src/look.js';
import { PRESETS } from '../src/boards.js';
import { Playback, facing } from '../src/playback.js';

// Which clip each unit plays at a display time, and how far into it, and which way it faces (docs/viewer-spec.md
// section 5, Animation). Display times are in ticks, and a tick is 1/30 s. The fights are real ones from createCombat,
// with seed 1 unless a test says otherwise, and each test first pins the events it relies on, so a change in the sim
// fails there rather than as a wrong pose. A few rules cover moments the sim no longer makes, such as an attack on the
// tick a stun starts, now that abilities and blows land before units act (sim-spec 6.4); those tests add the event to a
// real fight.

/** Clip lengths of our own, in seconds: each a whole number of ticks, and each different, so a mix-up shows. */
const LENGTHS: ClipLengths = { idle: 2.4, move: 0.6, attack: 0.9, cast: 0.7, stun: 0.8, death: 0.4, victory: 0.5 };
// In ticks: idle 72, move 18, attack 27, cast 21, stun 24, death 12, victory 15.

function placed(unitId: UnitId, col: number, row: number, star: Star = 1, items: readonly ItemId[] = []): PlacedUnit {
  return { unitId, star, col, row, items };
}

function combat(A: readonly PlacedUnit[], B: readonly PlacedUnit[], seed = 1): Combat {
  return createCombat({ seed, stage: 2, teams: { A, B } });
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

/** A stun on `target` from `tick` until it is gone on `expiresTick`, as the sim's `status` event has it. */
function stunEvent(target: number, tick: number, expiresTick: number, source: number): CombatEvent {
  return { type: 'status', tick, source, target, status: 'stun', stat: null, value: null, expiresTick };
}

/** A unit's `dash` events. */
function dashesOf(p: Playback, unit: number): { tick: number; departTick: number; arriveTick: number }[] {
  return p.combat.events.flatMap((e) => (e.type === 'dash' && e.unit === unit ? [{ tick: e.tick, departTick: e.departTick, arriveTick: e.arriveTick }] : []));
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

/** Sam (id 0) and Gimli (id 1) start at either end of the board, step three times to meet and fight. Gimli wins on 753. */
function walkingDuel(): Playback {
  const p = finished(combat([placed('sam', 3, 0)], [placed('gimli', 3, 0)]));
  expect(unitsOf(p)).toEqual(['sam', 'gimli']);
  return p;
}

/** Beregond (id 0) and Gimli (id 1) stand face to face; Beregond's Shield bash stuns Gimli for 1 s. */
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

/**
 * The Ringwraith (id 0) and Gandalf (id 1) against Aragorn (id 2), whom the Ringwraith's Black Breath stuns. Nobody
 * moves. Team A wins on 208.
 */
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

/** Khamûl (id 0) against two Gimlis (ids 1 and 2); on 174 he casts Shadow ride, and dashes away from 185 to 200. */
function khamulRidesFight(): Combat {
  return combat([placed('khamul', 3, 3)], [placed('gimli', 3, 3), placed('gimli', 4, 3)]);
}

function khamulRides(): Playback {
  const p = finished(khamulRidesFight());
  expect(unitsOf(p)).toEqual(['khamul', 'gimli', 'gimli']);
  return p;
}

/** Sauron (id 0) against two Gimlis (ids 1 and 2), whom his Sweep stuns. Team B wins on 405, the first Gimli dead. */
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


/** The full preset on both sides, as the viewer plays #a=full&b=full&seed=1&stage=2. */
function fullBoards(): Playback {
  return finished(combat(PRESETS.full, PRESETS.full));
}

/** The items preset on both sides, seed 1. */
function itemBoards(): Playback {
  return finished(combat(PRESETS.items, PRESETS.items));
}

/** Two presets, team A's and team B's, with a seed. */
function presets(a: keyof typeof PRESETS, b: keyof typeof PRESETS, seed = 1): Playback {
  return finished(combat(PRESETS[a], PRESETS[b], seed));
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
    const p = khamulRides();
    // The second Gimli (id 2) attacks on 166, and steps from 185 to 200, while the attack's 27-tick clip would run to 193,
    // and on from 200 to 215.
    expect(within(ticksOf(p, 'attack', 2), 150, 200)).toEqual([166]);
    expect(within(ticksOf(p, 'cast', 2), 150, 200)).toEqual([]);
    expect(startingWithin(stepsOf(p, 2), 150, 200)).toEqual([
      [185, 200],
      [200, 215],
    ]);
    // The step started last: at 186 move is 1/15 × 0.6 = 0.04 s in, a third of the way through its fade, over the
    // attack carrying on, 20 / 30 s in.
    expectFading(pose(p, 2, 186), 'move', 0.04, 'attack', 20 / 30, 1 / 3);
    // 5 ticks in: 0.2 s.
    expectPlaying(pose(p, 2, 190), 'move', 0.2);
  });
});

describe('a dash', () => {
  it('plays move at twice its speed from when it sets off until it arrives, cutting in at full weight', () => {
    const p = finished(combat([placed('merry', 2, 0), placed('bilbo', 4, 0)], [placed('gimli', 3, 0)]));
    expect(unitsOf(p)).toEqual(['merry', 'bilbo', 'gimli']);
    // Merry (id 0) and Bilbo (id 1) are Burglars: they leap 6 hexes on tick 0 (sim-spec 6.2), setting off at once and
    // arriving on 30, at 5 ticks a hex (sim-spec 10.6), and first attack on 33.
    expect(dashesOf(p, 0)).toEqual([{ tick: 0, departTick: 0, arriveTick: 30 }]);
    expect(dashesOf(p, 1)).toEqual([{ tick: 0, departTick: 0, arriveTick: 30 }]);
    expect(ticksOf(p, 'attack', 0)[0]).toBe(33);
    expect(ticksOf(p, 'attack', 1)[0]).toBe(33);
    // A dash's move is one of the cuts (section 5, Fades): at full weight from its departTick, though every unit counts as
    // idling before the fight, from the start of the clip, at twice its pace: 2t / 30 s, wrapped at 0.6 s. So 0.5 ticks
    // in is 1/30 s, 4.5 ticks 0.3 s, 20 ticks 1.3333 s, wrapped twice: 0.1333 s, and 29.5 ticks 1.9667 s, wrapped three
    // times: 0.1667 s.
    for (const unit of [0, 1]) {
      expectPlaying(pose(p, unit, 0), 'move', 0);
      expectPlaying(pose(p, unit, 0.5), 'move', 1 / 30);
      expectPlaying(pose(p, unit, 4.5), 'move', 0.3);
      expectPlaying(pose(p, unit, 20), 'move', 40 / 30 - 2 * 0.6);
      expectPlaying(pose(p, unit, 29.5), 'move', 59 / 30 - 3 * 0.6);
    }
    // It arrives on 30, and Merry idles, fading in over the move looping on at its pace: at 31 idle is 31 / 30 s in, a
    // tick of the fade's 3, over move 62 / 30 s in, wrapped three times: 0.2667 s.
    expectFading(pose(p, 0, 30), 'idle', 1, 'move', 60 / 30 - 3 * 0.6, 0);
    expectFading(pose(p, 0, 31), 'idle', 31 / 30, 'move', 62 / 30 - 3 * 0.6, 1 / 3);
    expectFading(pose(p, 1, 32), 'idle', 32 / 30 + 0.37, 'move', 64 / 30 - 3 * 0.6, 2 / 3);
    // Their attacks on 33 cut in.
    expectPlaying(pose(p, 0, 33), 'attack', 0);
  });

  it('plays the cast through the wind-up, then cuts to move from when it sets off, and idles after it arrives', () => {
    const p = finished(combat([placed('grishnakh', 3, 3)], [placed('gimli', 3, 3), placed('legolas', 5, 0)]));
    expect(unitsOf(p)).toEqual(['grishnakh', 'gimli', 'legolas']);
    // Grishnákh (id 0) attacks on 115, and on 116 casts Sneak, choosing a hex 3 away next to Legolas. His wind-up ends on
    // 127, when he sets off, and he arrives on 142, at 5 ticks a hex (sim-spec 10.6). He next attacks on 153.
    expect(within(ticksOf(p, 'attack', 0), 100, 160)).toEqual([115, 153]);
    expect(p.combat.events.find((e) => e.type === 'cast' && e.unit === 0)).toMatchObject({ tick: 116, releaseTick: 127, readyTick: 145 });
    expect(dashesOf(p, 0)).toEqual([{ tick: 116, departTick: 127, arriveTick: 142 }]);
    expect(stepsOf(p, 0)).toEqual([]);
    // The cast cuts in at full weight on 116, over the attack still playing, and plays through the wind-up.
    expectPlaying(pose(p, 0, 116), 'cast', 0);
    expectPlaying(pose(p, 0, 120), 'cast', 4 / 30);
    expectPlaying(pose(p, 0, 126.5), 'cast', 10.5 / 30);
    // On 127 move cuts in, at full weight from the start of the clip, at twice its pace: 2 / 30 s a tick, wrapped at 0.6 s.
    expectPlaying(pose(p, 0, 127), 'move', 0);
    expectPlaying(pose(p, 0, 128), 'move', 2 / 30);
    expectPlaying(pose(p, 0, 134.5), 'move', 0.5);
    expectPlaying(pose(p, 0, 141.5), 'move', 29 / 30 - 0.6);
    // The cast's 21-tick clip ended on 137, under the move, so from 142 he idles: 143 / 30 = 4.7667 s, wrapped at 2.4 s:
    // 2.3667 s at 143, a tick into its fade over the move, 32 / 30 s in, wrapped: 0.4667 s.
    expectFading(pose(p, 0, 143), 'idle', 143 / 30 - 2.4, 'move', 32 / 30 - 0.6, 1 / 3);
    expectPlaying(pose(p, 0, 153), 'attack', 0);
    // A longer cast clip, of 1 s, still plays when he arrives, and comes back, fading in as usual (section 5, Cuts) over
    // the move: 27 ticks in at 143.
    const lengths: ClipLengths = { ...LENGTHS, cast: 1 };
    expectPlaying(fightPose(p, 0, lengths, { time: 126.5 }), 'cast', 10.5 / 30);
    expectPlaying(fightPose(p, 0, lengths, { time: 127 }), 'move', 0);
    expectFading(fightPose(p, 0, lengths, { time: 143 }), 'cast', 27 / 30, 'move', 32 / 30 - 0.6, 1 / 3);
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
    // Sam attacks on 246 and casts on 253; his next attack is on 296.
    expect(ticksOf(p, 'attack', 0)).toEqual(expect.arrayContaining([246, 296]));
    expect(ticksOf(p, 'attack', 0).filter((t) => t > 246 && t < 296)).toEqual([]);
    expect(ticksOf(p, 'cast', 0)[0]).toBe(253);
    // The attack would play on to 273, but the cast cuts in on 253.
    expectPlaying(pose(p, 0, 253), 'cast', 0);
    expectPlaying(pose(p, 0, 254), 'cast', 1 / 30);
    expectPlaying(pose(p, 0, 266), 'cast', 13 / 30);
    // The 21-tick clip ends on 274. At 275 idle is 275 / 30 = 9.1667 s, wrapped at 2.4 s: 1.9667 s, a tick into its fade
    // over the cast held at 0.7 s.
    expectFading(pose(p, 0, 275), 'idle', 275 / 30 - 3 * 2.4, 'cast', 0.7, 1 / 3);
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
    // A cast clip of 0.9 s, 27 ticks, so the next attack comes while it plays: animation.ts takes whatever lengths a
    // model gives it.
    const lengths: ClipLengths = { ...LENGTHS, cast: 0.9 };
    const p = fastBilbo();
    const at = (time: number) => fightPose(p, 0, lengths, { time });
    // Bilbo casts on 80, while the attack from 79 still plays, and attacks on 105, while the cast still plays.
    expect(ticksOf(p, 'attack', 0).slice(3, 5)).toEqual([79, 105]);
    expect(ticksOf(p, 'cast', 0)[0]).toBe(80);
    expectPlaying(at(80), 'cast', 0);
    expectPlaying(at(81), 'cast', 1 / 30);
    expectPlaying(at(104.5), 'cast', 24.5 / 30);
    expectPlaying(at(105), 'attack', 0);
    expectPlaying(at(106), 'attack', 1 / 30);
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
    const cast: CastEvent = { type: 'cast', tick: 46, unit: 0, ability: 'Loyal', releaseTick: 58, readyTick: 61, aims: [] };
    for (const before of [false, true]) {
      const p = finished(withEvents(combat([placed('sam', 3, 0)], [placed('gimli', 3, 0)]), [cast], before));
      expect(ticksOf(p, 'attack', 0)[0]).toBe(46);
      expect(ticksOf(p, 'cast', 0)[0]).toBe(46);
      // The cast plays from 46, at full weight, and not the attack.
      expectPlaying(pose(p, 0, 46), 'cast', 0);
      expectPlaying(pose(p, 0, 50), 'cast', 4 / 30);
    }
  });

  it('fades back in when it comes back after a step hid it', () => {
    const p = presets('tanks', 'items');
    // Team B's Aragorn (id 6) attacks on 92, and steps from 95 to 110. He isn't stunned, and next acts on 130.
    expect(p.combat.state.units[6]).toMatchObject({ unitId: 'aragorn', team: 'B' });
    expect(within(ticksOf(p, 'attack', 6), 80, 135)).toEqual([92, 130]);
    expect(within(ticksOf(p, 'cast', 6), 80, 135)).toEqual([]);
    expect(startingWithin(stepsOf(p, 6), 80, 135)).toEqual([[95, 110]]);
    expect(startingWithin(stunsOf(p, 6), 80, 135)).toEqual([]);
    expectPlaying(pose(p, 6, 93), 'attack', 1 / 30);
    // The step started last, so it plays, fading in over the attack: 1/15 × 0.6 = 0.04 s in at 96, over the attack
    // 4 ticks in.
    expectFading(pose(p, 6, 96), 'move', 0.04, 'attack', 4 / 30, 1 / 3);
    expectPlaying(pose(p, 6, 100), 'move', 0.2);
    // The step is over on 110, but the attack's 27-tick clip runs on to 119: the attack comes back, fading in as usual
    // (section 5, Cuts) over the move, which loops on: 16/15 × 0.6 = 0.64 s at 111, wrapped at 0.6 s: 0.04 s.
    expectFading(pose(p, 6, 111), 'attack', 19 / 30, 'move', 0.04, 1 / 3);
    expectFading(pose(p, 6, 111.5), 'attack', 19.5 / 30, 'move', 0.06, 0.5);
    expectPlaying(pose(p, 6, 113), 'attack', 21 / 30);
    // The clip ends on 119, and idle fades in: 120 / 30 + 0.37 × 6 = 6.22 s at 120, wrapped at 2.4 s: 1.42 s.
    expectFading(pose(p, 6, 120), 'idle', 120 / 30 + 6 * 0.37 - 2 * 2.4, 'attack', 0.9, 1 / 3);
    expectPlaying(pose(p, 6, 130), 'attack', 0);
  });

  it('fades back in when it comes back after a stun hid it', () => {
    // Every stun in the sim lasts at least 1 s, longer than any attack clip in section 4, so here the attack lasts
    // 1.5 s, 45 ticks: animation.ts takes whatever lengths a model gives it.
    const lengths: ClipLengths = { ...LENGTHS, attack: 1.5 };
    const p = itemBoards();
    const at = (time: number) => fightPose(p, 0, lengths, { time });
    // Team A's Gimli (id 0) attacks on 101; team B's Beregond (id 11) stuns him on 111 until 141. He next acts on 151.
    expect(p.combat.state.units[0]).toMatchObject({ unitId: 'gimli', team: 'A' });
    expect(within(ticksOf(p, 'attack', 0), 90, 160)).toEqual([101, 151]);
    expect(within(ticksOf(p, 'cast', 0), 90, 160)).toEqual([]);
    expect(startingWithin(stepsOf(p, 0), 90, 160)).toEqual([]);
    expect(startingWithin(stunsOf(p, 0), 90, 160)).toEqual([[111, 141]]);
    expectPlaying(at(101.5), 'attack', 0.5 / 30);
    // Stunned comes before acting: the stun fades in over the attack, which is 11 ticks in at 112.
    expectFading(at(112), 'stun', 1 / 30, 'attack', 11 / 30, 1 / 3);
    expectPlaying(at(124), 'stun', 13 / 30);
    // The stun is gone on 141, and the attack's clip runs on to 146: the attack comes back, 40 ticks in, fading in as
    // usual over the stun, which loops on: 30 / 30 = 1 s at 141, wrapped at 0.8 s: 0.2 s; 31 / 30 = 1.0333 s at 142:
    // 0.2333 s.
    expectFading(at(141), 'attack', 40 / 30, 'stun', 30 / 30 - 0.8, 0);
    expectFading(at(142), 'attack', 41 / 30, 'stun', 31 / 30 - 0.8, 1 / 3);
    expectFading(at(142.5), 'attack', 41.5 / 30, 'stun', 31.5 / 30 - 0.8, 0.5);
    expectPlaying(at(144), 'attack', 43 / 30);
    // The clip ends on 146 and idle fades in: 147 / 30 = 4.9 s at 147, wrapped at 2.4 s: 0.1 s.
    expectFading(at(147), 'idle', 147 / 30 - 2 * 2.4, 'attack', 1.5, 1 / 3);
    expectPlaying(at(151), 'attack', 0);
  });
});

describe('a melee attack', () => {
  it('still lunges at the target, at its height when the blow lands, on its hitTick, 7 ticks into the attack', () => {
    // Played an eighth of a tick at a time from tick 44, asking about the playback's own display time each frame.
    const p = new Playback(combat([placed('sam', 3, 0)], [placed('gimli', 3, 0)]));
    p.playing = false;
    while (p.combat.tick < 44) p.step();
    p.playing = true;
    let peak = { time: 0, reach: 0, toward: 0 };
    let still = true;
    while (p.time < 70) {
      p.advance(1 / (8 * 30));
      const lunge = p.lungeOffset(0);
      const reach = Math.hypot(lunge.x, lunge.z);
      const [from, to] = [p.position(0), p.position(1)];
      if (reach > peak.reach) peak = { time: p.time, reach, toward: lunge.x * (to.x - from.x) + lunge.z * (to.z - from.z) };
      // It starts no sooner than 3 ticks before the blow, and is over 3 ticks after it.
      if (p.time <= 50 || p.time >= 56) still &&= reach === 0;
    }
    // Sam's first attack, on 46, is melee. The blow lands on its hitTick, 53, 0.22 s (7 ticks) into the attack clip
    // (section 4), which is where the lunge is at its height (section 5): on 53, to within the eighth of a tick sampled.
    const attack = p.combat.events.find((e) => e.type === 'attack' && e.unit === 0);
    expect(attack).toMatchObject({ tick: 46, target: 1, ranged: false, hitTick: 53 });
    expect(p.combat.events.find((e) => e.type === 'damage' && e.source === 0)).toMatchObject({ tick: 53, target: 1, kind: 'attack' });
    expect(ticksOf(p, 'attack', 0)).toEqual([46]);
    expect(peak.reach).toBeGreaterThan(0);
    expect(Math.abs(peak.time - 53)).toBeLessThanOrEqual(1 / 8 + 1e-9);
    expect(still).toBe(true);
    // Towards Gimli.
    expect(peak.toward).toBeGreaterThan(0);
  });
});

describe('a stun', () => {
  it('plays from the tick it starts until it expires, over an attack, wrapped at the clip’s length', () => {
    const p = stunningDuel();
    // Gimli attacks on 201; Beregond's Shield bash, cast on 208, stuns him on its release, 220, until 250, when he casts.
    expect(within(ticksOf(p, 'attack', 1), 190, 250)).toEqual([201]);
    expect(ticksOf(p, 'cast', 0)[0]).toBe(208);
    expect(stunsOf(p, 1)).toEqual([[220, 250]]);
    expect(ticksOf(p, 'cast', 1)[0]).toBe(250);
    // Stunned comes before acting: the attack's clip would run to 228, but at 221 stun is 1 tick in, and as much into
    // its fade, over the attack carrying on, 20 ticks in.
    expectFading(pose(p, 1, 221), 'stun', 1 / 30, 'attack', 20 / 30, 1 / 3);
    expectPlaying(pose(p, 1, 228), 'stun', 8 / 30);
    // 28 ticks in: 0.9333 s, wrapped at 0.8 s: 0.1333 s.
    expectPlaying(pose(p, 1, 248), 'stun', 28 / 30 - 0.8);
    // The stun is gone on 250, and the cast on 250 cuts in at full weight.
    expectPlaying(pose(p, 1, 250), 'cast', 0);
    expectPlaying(pose(p, 1, 251), 'cast', 1 / 30);
  });

  it('carries on without restarting when it is extended while it lasts', () => {
    const p = doubleStun();
    // Sam (id 2) is stunned on 264 until 294; on 279 the other Beregond's stun extends it to 309. He attacks on 309.
    expect(stunsOf(p, 2)).toEqual([
      [264, 294],
      [279, 309],
    ]);
    expect(ticksOf(p, 'attack', 2)).toContain(309);
    expect(ticksOf(p, 'attack', 2).filter((t) => t > 251 && t < 309)).toEqual([]);
    expect(ticksOf(p, 'cast', 2).filter((t) => t > 251 && t < 309)).toEqual([]);
    expectPlaying(pose(p, 2, 272), 'stun', 8 / 30);
    // Still timed from 264, with no fade: 16 ticks in at 280, and past the first stun's end, 33 ticks in at 297:
    // 1.1 s, wrapped at 0.8 s: 0.3 s.
    expectPlaying(pose(p, 2, 280), 'stun', 16 / 30);
    expectPlaying(pose(p, 2, 297), 'stun', 33 / 30 - 0.8);
    expectPlaying(pose(p, 2, 308.5), 'stun', 44.5 / 30 - 0.8);
    // Free on 309, he attacks at once, cutting in at full weight.
    expectPlaying(pose(p, 2, 309), 'attack', 0);
  });

  it('carries on without restarting when another starts on the tick it ends', () => {
    const p = presets('items', 'stars');
    // Team B's second Aragorn (id 13): team A's Gandalf (id 7) stuns him on 208 until 268, and team A's Beregond (id 2)
    // on 268, before Aragorn can act, until 298, when he casts.
    expect(p.combat.state.units[13]).toMatchObject({ unitId: 'aragorn', team: 'B' });
    expect(startingWithin(stunsOf(p, 13), 150, 300)).toEqual([
      [208, 268],
      [268, 298],
    ]);
    expect(within(ticksOf(p, 'attack', 13), 150, 300)).toEqual([177]);
    expect(within(ticksOf(p, 'cast', 13), 150, 300)).toEqual([298]);
    expect(startingWithin(stepsOf(p, 13), 150, 300)).toEqual([]);
    expectPlaying(pose(p, 13, 218), 'stun', 10 / 30);
    // Still timed from 208, at full weight: 59.5 ticks in at 267.5, 1.9833 s, wrapped twice at 0.8 s: 0.3833 s; 60.5 at
    // 268.5: 0.4167 s; 89.5 at 297.5, 2.9833 s, wrapped three times: 0.5833 s.
    expectPlaying(pose(p, 13, 267.5), 'stun', 59.5 / 30 - 2 * 0.8);
    expectPlaying(pose(p, 13, 268.5), 'stun', 60.5 / 30 - 2 * 0.8);
    expectPlaying(pose(p, 13, 297.5), 'stun', 89.5 / 30 - 3 * 0.8);
    // Free on 298, he casts, at full weight.
    expectPlaying(pose(p, 13, 298), 'cast', 0);
  });

  it('plays over a step that is still sliding to its hex', () => {
    const p = fullBoards();
    // Team A's Aragorn (id 3) steps from 208 to 223, and team B's Dáin (id 10) stuns him on 218 until 263; the step
    // still completes (sim-spec 12.1). He casts on 263.
    expect(p.combat.state.units[3]).toMatchObject({ unitId: 'aragorn', team: 'A' });
    expect(startingWithin(stepsOf(p, 3), 190, 270)).toEqual([[208, 223]]);
    expect(startingWithin(stunsOf(p, 3), 0, 270)).toEqual([[218, 263]]);
    expect(within(ticksOf(p, 'cast', 3), 190, 270)).toEqual([263]);
    // At 219.5 the step has 3.5 ticks to go, but stun plays, 1.5 ticks in and halfway through its fade, over the
    // move: 11.5 / 15 × 0.6 = 0.46 s.
    expectFading(pose(p, 3, 219.5), 'stun', 0.05, 'move', 0.46, 0.5);
    expectPlaying(pose(p, 3, 225), 'stun', 7 / 30);
  });
});

describe('an attack or cast on the tick a stun starts', () => {
  // Abilities and blows now land before units act (sim-spec 6.4), so a unit stunned on a tick no longer acts on it in
  // the sim's fights. Section 5 still says what an action on such a tick plays, so these tests add the stun to a real
  // fight, on the tick of a real attack or cast.
  const duel = () => combat([placed('sam', 3, 0)], [placed('gimli', 3, 0)]);

  it('plays out first, an attack, and stun fades in once its clip ends', () => {
    // Sam (id 0) attacks on 96, and next on 146; here Gimli stuns him on 96 until 140.
    const p = finished(withEvents(duel(), [stunEvent(0, 96, 140, 1)]));
    expect(within(ticksOf(p, 'attack', 0), 50, 150)).toEqual([96, 146]);
    expect(within(ticksOf(p, 'cast', 0), 50, 150)).toEqual([]);
    expect(stunsOf(p, 0)).toEqual([[96, 140]]);
    // A stunned unit can't act, so the attack came before the stun on 96 and plays out first (section 5, Stunned),
    // cutting in at full weight.
    expectPlaying(pose(p, 0, 96), 'attack', 0);
    expectPlaying(pose(p, 0, 105), 'attack', 9 / 30);
    expectPlaying(pose(p, 0, 122.5), 'attack', 26.5 / 30);
    // Its 27-tick clip ends on 123, and stun shows, timed from 96, fading in over the attack held at 0.9 s: 27 ticks in
    // at 123, 0.9 s, wrapped at 0.8 s: 0.1 s; 28 ticks in at 124: 0.1333 s, a tick into the fade.
    expectFading(pose(p, 0, 123), 'stun', 27 / 30 - 0.8, 'attack', 0.9, 0);
    expectFading(pose(p, 0, 124), 'stun', 28 / 30 - 0.8, 'attack', 0.9, 1 / 3);
    expectPlaying(pose(p, 0, 126), 'stun', 30 / 30 - 0.8);
    // 43.5 ticks in at 139.5: 1.45 s, wrapped: 0.65 s.
    expectPlaying(pose(p, 0, 139.5), 'stun', 43.5 / 30 - 0.8);
    // Free on 140, he idles until his attack on 146 cuts in.
    expect(pose(p, 0, 142).clip).toBe('idle');
    expectPlaying(pose(p, 0, 146), 'attack', 0);
  });

  it('plays out first, a cast, and stun fades in once its clip ends', () => {
    // Sam (id 0) casts Loyal on 253, and next attacks on 296; here Gimli stuns him on 253 until 290.
    const p = finished(withEvents(duel(), [stunEvent(0, 253, 290, 1)]));
    expect(within(ticksOf(p, 'cast', 0), 240, 300)).toEqual([253]);
    expect(within(ticksOf(p, 'attack', 0), 250, 300)).toEqual([296]);
    expect(stunsOf(p, 0)).toEqual([[253, 290]]);
    // The cast cuts in at full weight over the attack from 246, and plays out.
    expectPlaying(pose(p, 0, 253), 'cast', 0);
    expectPlaying(pose(p, 0, 259), 'cast', 6 / 30);
    expectPlaying(pose(p, 0, 273.5), 'cast', 20.5 / 30);
    // Its 21-tick clip ends on 274, and stun fades in over it, held at 0.7 s: 21 ticks into the stun, 0.7 s; 22 ticks
    // in at 275, 0.7333 s.
    expectFading(pose(p, 0, 274), 'stun', 21 / 30, 'cast', 0.7, 0);
    expectFading(pose(p, 0, 275), 'stun', 22 / 30, 'cast', 0.7, 1 / 3);
    // 26 ticks in at 279: 0.8667 s, wrapped at 0.8 s: 0.0667 s.
    expectPlaying(pose(p, 0, 279), 'stun', 26 / 30 - 0.8);
    expectPlaying(pose(p, 0, 296), 'attack', 0);
  });

  it('plays out first when the stun carries on one that ended that tick', () => {
    // As in a play-test: Sam (id 0) attacks on 246 and casts on 253. Here Gimli stuns him on 248 until 253, and again on
    // 253, the tick that stun ends, until 290, which carries it on. Sam next attacks on 296.
    const p = finished(withEvents(duel(), [stunEvent(0, 248, 253, 1), stunEvent(0, 253, 290, 1)]));
    expect(within(ticksOf(p, 'attack', 0), 240, 300)).toEqual([246, 296]);
    expect(within(ticksOf(p, 'cast', 0), 240, 300)).toEqual([253]);
    expect(stunsOf(p, 0)).toEqual([
      [248, 253],
      [253, 290],
    ]);
    // Stunned since 248, over the attack: 3 ticks in at 251, at full weight.
    expectPlaying(pose(p, 0, 251), 'stun', 3 / 30);
    // The cast came before the second stun on 253, so it plays out first, cutting in at full weight.
    expectPlaying(pose(p, 0, 253), 'cast', 0);
    expectPlaying(pose(p, 0, 261), 'cast', 8 / 30);
    expectPlaying(pose(p, 0, 273.5), 'cast', 20.5 / 30);
    // Its 21-tick clip ends on 274, and stun fades in over it, held at 0.7 s.
    const fading = pose(p, 0, 275);
    expect(fading).toMatchObject({ clip: 'stun', from: { clip: 'cast' } });
    expect(fading.from?.time).toBeCloseTo(0.7, 9);
    expect(fading.weight).toBeCloseTo(1 / 3, 9);
    // How far into the stun is left open: timed from 248, as the stun carried on from the first, 27 ticks in at 275,
    // 0.9 s, wrapped: 0.1 s; or from the second on 253, 22 ticks in, 0.7333 s. At 278, at full weight: 30 ticks, 0.2 s,
    // or 25 ticks, 0.0333 s.
    expectOneOf(fading.time, [27 / 30 - 0.8, 22 / 30]);
    const stunned = pose(p, 0, 278);
    expect({ clip: stunned.clip, from: stunned.from, weight: stunned.weight }).toEqual({ clip: 'stun', from: null, weight: 1 });
    expectOneOf(stunned.time, [30 / 30 - 0.8, 25 / 30 - 0.8]);
    // Free on 290; the attack on 296 cuts in.
    expectPlaying(pose(p, 0, 296), 'attack', 0);
  });

  it('plays out first until its side wins, and victory fades in over it', () => {
    const fight = () => combat([placed('gimli', 2, 3, 2), placed('gimli', 4, 3, 2)], [placed('beregond', 3, 3)]);
    // The first Gimli (id 0) casts on 202, and team A wins on 208; here Beregond stuns him on 202 until 240.
    const p = finished(withEvents(fight(), [stunEvent(0, 202, 240, 2)]));
    expect(unitsOf(p)).toEqual(['gimli', 'gimli', 'beregond']);
    expect(within(ticksOf(p, 'cast', 0), 150, 208)).toEqual([202]);
    expect(within(ticksOf(p, 'attack', 0), 202, 208)).toEqual([]);
    expect(startingWithin(stunsOf(p, 0), 195, 240)).toEqual([[202, 240]]);
    expect(endOf(p)).toEqual({ tick: 208, outcome: 'A' });
    expectPlaying(pose(p, 0, 207.5), 'cast', 5.5 / 30);
    // At 209: victory 1 tick in, over the cast carrying on, 7 ticks in.
    expectFading(pose(p, 0, 209), 'victory', 1 / 30, 'cast', 7 / 30, 1 / 3);
    // Still stunned at 225, after the cast's clip ended on 223, but won comes before stunned: victory, held on its last
    // frame since 223.
    expectPlaying(pose(p, 0, 220), 'victory', 12 / 30);
    expectPlaying(pose(p, 0, 225), 'victory', 0.5);
  });
});

describe('death', () => {
  it('plays from the unit’s death, over what it was doing, and holds on its last frame', () => {
    const p = walkingDuel();
    // Sam dies on 753, as the blow of Gimli's attack on 746 lands, and 7 ticks after his own last attack.
    expect(ticksOf(p, 'death', 0)).toEqual([753]);
    expect(ticksOf(p, 'attack', 0).at(-1)).toBe(746);
    expect(ticksOf(p, 'cast', 0).at(-1)).toBeLessThan(746);
    // At 754: death 1 tick in, and as far into its fade, over the attack 8 ticks in.
    expectFading(pose(p, 0, 754), 'death', 1 / 30, 'attack', 8 / 30, 1 / 3);
    expectPlaying(pose(p, 0, 759), 'death', 6 / 30);
    // The 12-tick clip ends on 765 and holds.
    expectPlaying(pose(p, 0, 770), 'death', 0.4);
  });

  it('comes before a stun', () => {
    const p = gandalfWaits();
    // Gimli (id 1) dies on 492, stunned by You shall not pass since 486 until 546.
    expect(stunsOf(p, 1).at(-1)).toEqual([486, 546]);
    expect(ticksOf(p, 'death', 1)).toEqual([492]);
    // At 492.5: death 0.5 ticks in, a sixth of the way through its fade, over the stun 6.5 ticks in.
    expectFading(pose(p, 1, 492.5), 'death', 0.5 / 30, 'stun', 6.5 / 30, 1 / 6);
    expectPlaying(pose(p, 1, 510), 'death', 0.4);
  });
});

describe('breaking up after death', () => {
  it('starts halfway through the death clip, or at once without one', () => {
    expect(sinkDelay(LENGTHS)).toBeCloseTo(0.2, 10);
    expect(sinkDelay({ ...LENGTHS, death: 0.5 })).toBeCloseTo(0.25, 10);
    expect(sinkDelay(null)).toBe(0);
  });

  it('is what the shards wait for (effects.ts), then they fall and fade', () => {
    const p = walkingDuel();
    const fx = new Effects(p);
    // Sam dies on 753; halfway through his 12-tick death clip is 759, when he breaks up.
    expect(ticksOf(p, 'death', 0)).toEqual([753]);
    const delay = sinkDelay(LENGTHS);
    const shards = EFFECTS.shards.seconds * 30;
    expect(fx.shardsShare(0, delay, 753)).toBeLessThan(0);
    expect(fx.shardsShare(0, delay, 758.9)).toBeLessThan(0);
    expect(fx.shardsShare(0, delay, 759)).toBe(0);
    expect(fx.shardsShare(0, delay, 759 + shards / 2)).toBeCloseTo(0.5, 10);
    expect(fx.shardsShare(0, delay, 759 + shards)).toBeCloseTo(1, 10);
    // Without a death clip it breaks up at once.
    expect(fx.shardsShare(0, sinkDelay(null), 753)).toBe(0);
  });
});

describe('victory', () => {
  it('plays for the living winners from the end, over what they were doing, and holds; dead winners play death', () => {
    const p = sauronSweeps();
    // Team B wins on 405. The second Gimli (id 2) last attacked on 398; the first (id 1) died on 318.
    expect(endOf(p)).toEqual({ tick: 405, outcome: 'B' });
    expect(ticksOf(p, 'attack', 2).at(-1)).toBe(398);
    expect(ticksOf(p, 'cast', 2).at(-1)).toBeLessThan(398);
    expect(stunsOf(p, 2).at(-1)?.[1]).toBeLessThan(398);
    expect(ticksOf(p, 'death', 1)).toEqual([318]);
    expect(ticksOf(p, 'death', 2)).toEqual([]);
    // At 406: victory 1 tick in, and as far into its fade, over the attack 8 ticks in.
    expectFading(pose(p, 2, 406), 'victory', 1 / 30, 'attack', 8 / 30, 1 / 3);
    expectPlaying(pose(p, 2, 409), 'victory', 4 / 30);
    // The 15-tick clip ends on 420 and holds.
    expectPlaying(pose(p, 2, 424), 'victory', 0.5);
    // Dead comes before won: the first Gimli's death clip, long since held on its last frame.
    expectPlaying(pose(p, 1, 410), 'death', 0.4);
  });

  it('comes before a stun', () => {
    const p = presets('rings', 'items', 6);
    // With seed 6, team B's Gimli (id 7) is stunned on 524 until 584, well after his last attack, on 491, whose clip
    // ended on 518. Team B wins on 576.
    expect(p.combat.state.units[7]).toMatchObject({ unitId: 'gimli', team: 'B' });
    expect(startingWithin(stunsOf(p, 7), 480, 600)).toEqual([[524, 584]]);
    expect(within(ticksOf(p, 'attack', 7), 480, 600)).toEqual([491]);
    expect(within(ticksOf(p, 'cast', 7), 480, 600)).toEqual([]);
    expect(startingWithin(stepsOf(p, 7), 491, 600)).toEqual([]);
    expect(endOf(p)).toEqual({ tick: 576, outcome: 'B' });
    expectPlaying(pose(p, 7, 540), 'stun', 16 / 30);
    // At 577: victory 1 tick in, over the stun 53 ticks in: 1.77 s, wrapped twice at 0.8 s: 0.17 s.
    expectFading(pose(p, 7, 577), 'victory', 1 / 30, 'stun', 53 / 30 - 1.6, 1 / 3);
    // Still stunned at 583, but playing victory, 7 ticks in; held on its last frame by 595.
    expectPlaying(pose(p, 7, 583), 'victory', 7 / 30);
    expectPlaying(pose(p, 7, 595), 'victory', 0.5);
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
    expectPlaying(pose(p, 0, 266, true), 'cast', 13 / 30);
    expectPlaying(pose(p, 0, 759, true), 'death', 6 / 30);
    // Gimli has won since 753: 6 ticks in.
    expectPlaying(pose(p, 1, 759, true), 'victory', 6 / 30);
    // Idle fading out holds its first frame too, and so does idle fading in.
    expectFading(pose(p, 0, 2, true), 'move', 0.04, 'idle', 0, 1 / 3);
    expectFading(pose(p, 0, 74, true), 'idle', 0, 'attack', 0.9, 1 / 3);

    const q = stunningDuel();
    expectPlaying(pose(q, 1, 228, true), 'stun', 0);
    // Stun fading in holds its first frame; the cast on 250 cuts in and plays.
    expectFading(pose(q, 1, 221, true), 'stun', 0, 'attack', 20 / 30, 1 / 3);
    expectPlaying(pose(q, 1, 251, true), 'cast', 1 / 30);
    // And so does stun fading out: team A's Gimli (id 0) in the items fight is stunned until 141, when he idles, his
    // attack's clip from 101 long over, until he attacks on 151.
    const r = itemBoards();
    expect(startingWithin(stunsOf(r, 0), 90, 160)).toEqual([[111, 141]]);
    expect(within(ticksOf(r, 'attack', 0), 90, 160)).toEqual([101, 151]);
    expectFading(pose(r, 0, 142, true), 'idle', 0, 'stun', 0, 1 / 3);
    expectFading(pose(r, 0, 142), 'idle', 142 / 30 - 2.4, 'stun', 31 / 30 - 0.8, 1 / 3);
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
    // Khamûl (id 0) stands on (2, 3) until his dash sets off on 185. The second Gimli (id 2), on (0, 4), steps to (1, 3)
    // from 1 to 16, and next moves on 185.
    expect(spawnHexOf(p, 0)).toEqual({ q: 2, r: 3 });
    expect(dashesOf(p, 0)[0]).toEqual({ tick: 174, departTick: 185, arriveTick: 200 });
    expect(motionsOf(p, 'move', 0)).toEqual([]);
    expect(motionsOf(p, 'move', 2).slice(0, 2)).toEqual([
      { tick: 1, from: { q: 0, r: 4 }, to: { q: 1, r: 3 } },
      { tick: 185, from: { q: 1, r: 3 }, to: { q: 0, r: 4 } },
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

  it("turns a model that shoots to its left, by its aim, so its shot goes at its target, but not while it steps", () => {
    const p = khamulRides();
    // As above, with the second Gimli (id 2) shooting π/4 to his left: π/3 to Khamûl less π/4 on 1, the step's π/6 from
    // 4 until he arrives on 16, then back to π/2 less π/4 by 19, a third of the way a tick from π/6.
    expect(stepsOf(p, 2)[0]).toEqual([1, 16]);
    const aimed = (t: number) => fightFacing(playbackAt(khamulRidesFight, t), 2, 0, PI / 4);
    expectAngle(aimed(1), PI / 12);
    expectAngle(aimed(4), PI / 6);
    expectAngle(aimed(15.5), PI / 6);
    expectAngle(aimed(17.5), (5 * PI) / 24);
    expectAngle(aimed(19), PI / 4);
    expectAngle(aimed(100), PI / 4);
  });

  it("turns an archer a little further, so its arrow's line, to the side of its centre, goes through its target", () => {
    // The second Gimli (id 2) on (1, 3) faces Khamûl on (2, 3), √3 away at π/2, from 19 on (above). With his arrow π/4 to
    // his left, on a line √3/2 to the side of his centre, he turns a further asin(1/2), π/6: to π/12.
    const p = playbackAt(khamulRidesFight, 100);
    expect(Math.hypot(p.position(0).x - p.position(2).x, p.position(0).z - p.position(2).z)).toBeCloseTo(Math.sqrt(3));
    expectAngle(fightFacing(p, 2, 0, PI / 4, Math.sqrt(3) / 2), PI / 12);
    // A line wider than the way to the target turns him as far as a line along its edge would.
    expectAngle(fightFacing(p, 2, 0, 0, 10), 0);
  });

  it('turns the same way around a step that a stun cuts into', () => {
    const fight = () => combat(PRESETS.full, PRESETS.full);
    const p = fullBoards();
    // Team A's Aragorn (id 3) steps from (0, 3) to (0, 4), (0, +1) at 5π/6, from 208 to 223, towards team B's Dáin (id 10),
    // who stands on (1, 4): (+1, +1) from (0, 3), 2π/3, and (+1, 0) from (0, 4), π/2. Dáin's stun from 218 changes nothing.
    expect(p.combat.state.units[3]).toMatchObject({ unitId: 'aragorn', team: 'A' });
    expect(p.combat.state.units[10]).toMatchObject({ unitId: 'dain', team: 'B' });
    expect(motionsOf(p, 'move', 3).filter((m) => m.tick > 100 && m.tick < 240)).toEqual([{ tick: 208, from: { q: 0, r: 3 }, to: { q: 0, r: 4 } }]);
    expect(startingWithin(stepsOf(p, 3), 100, 240)).toEqual([[208, 223]]);
    expect(spawnHexOf(p, 10)).toEqual({ q: 1, r: 4 });
    expect(motionsOf(p, 'move', 10).filter((m) => m.tick < 240)).toEqual([]);
    expect(startingWithin(stunsOf(p, 3), 200, 240)).toEqual([[218, 263]]);
    expectAngle(facingAt(fight, 3, 208, 10), (2 * PI) / 3);
    const q = playbackAt(fight, 209.5);
    expectTurningIn(fightFacing(q, 3, 10), 0.5, facing(q.position(3, 208), q.position(10, 208))!, facing(q.position(3), q.position(10))!, (5 * PI) / 6);
    expectAngle(facingAt(fight, 3, 211, 10), (5 * PI) / 6);
    expectAngle(facingAt(fight, 3, 222.5, 10), (5 * PI) / 6);
    // From 223 back by π/3 to Dáin: 2π/3 by 224.5.
    expectAngle(facingAt(fight, 3, 223, 10), (5 * PI) / 6);
    expectAngle(facingAt(fight, 3, 224.5, 10), (2 * PI) / 3);
    expectAngle(facingAt(fight, 3, 226, 10), PI / 2);
    expectAngle(facingAt(fight, 3, 240, 10), PI / 2);
  });

  it('is the way a dash goes from 3 ticks after it sets off until it arrives, and turns back to its target over the 3 ticks after', () => {
    const leaps = () => combat([placed('merry', 2, 0), placed('bilbo', 4, 0)], [placed('gimli', 3, 0)]);
    const p = finished(leaps());
    expect(unitsOf(p)).toEqual(['merry', 'bilbo', 'gimli']);
    // On tick 0 Merry (id 0) leaps from (2, 0) to (0, 6), and Bilbo (id 1) from (4, 0) to (1, 6), next to Gimli (id 2) on
    // (0, 7), who doesn't move. They set off at once, and arrive on 30, at 5 ticks a hex (sim-spec 10.6).
    expect(motionsOf(p, 'dash', 0)).toEqual([{ tick: 0, from: { q: 2, r: 0 }, to: { q: 0, r: 6 } }]);
    expect(motionsOf(p, 'dash', 1)).toEqual([{ tick: 0, from: { q: 4, r: 0 }, to: { q: 1, r: 6 } }]);
    expect(dashesOf(p, 1)).toEqual([{ tick: 0, departTick: 0, arriveTick: 30 }]);
    expect(spawnHexOf(p, 2)).toEqual({ q: 0, r: 7 });
    expect(motionsOf(p, 'move', 2)).toEqual([]);
    // Bilbo's dash, (−3, +6), moves x by √3 × (−3 + 3) = 0 and z by −9: π, straight down the board. On 0 he faces
    // Gimli, (−4, +7) away: x −√3/2, z −10.5. From (1, 6) Gimli is (−1, +1), −5π/6.
    expectAngle(facingAt(leaps, 1, 0, 2), Math.atan2(-Math.sqrt(3) / 2, -10.5));
    expectAngle(facingAt(leaps, 1, 3, 2), PI);
    expectAngle(facingAt(leaps, 1, 29.5, 2), PI);
    // From 30 he turns back by π/6 to Gimli, the shorter way through ±π rather than 11π/6 through 0: π/24 for each
    // 3/4 of a tick.
    expectAngle(facingAt(leaps, 1, 30, 2), PI);
    expectAngle(facingAt(leaps, 1, 30.75, 2), PI + PI / 24);
    expectAngle(facingAt(leaps, 1, 31.5, 2), PI + PI / 12);
    expectAngle(facingAt(leaps, 1, 32.25, 2), PI + PI / 8);
    expectAngle(facingAt(leaps, 1, 33, 2), (-5 * PI) / 6);
    expectAngle(facingAt(leaps, 1, 34, 2), (-5 * PI) / 6);
    // Merry's, (−2, +6), moves x by √3 and z by −9. On 0 Gimli is (−2, +7) away: x √3 × 1.5, z −10.5. From (0, 6) he is
    // (0, +1), 5π/6, under 20° from the dash, so Merry turns back the direct way.
    const dash = Math.atan2(Math.sqrt(3), -9);
    expectAngle(facingAt(leaps, 0, 0, 2), Math.atan2(1.5 * Math.sqrt(3), -10.5));
    expectAngle(facingAt(leaps, 0, 3.5, 2), dash);
    expectAngle(facingAt(leaps, 0, 30, 2), dash);
    expectAngle(facingAt(leaps, 0, 31.5, 2), dash + ((5 * PI) / 6 - dash) / 2);
    expectAngle(facingAt(leaps, 0, 33, 2), (5 * PI) / 6);
  });

  it('faces its target through an ability’s wind-up, and turns into its dash from when it sets off', () => {
    const fight = () => combat(PRESETS.full, PRESETS.traits);
    const p = finished(fight());
    // Team B's Grishnákh (id 14), a Burglar, leaps on tick 0 to (5, 1). On 132 he casts Sneak at team A's Beregond (id 2)
    // on (3, 3), who doesn't move. The dash, to (4, 3), sets off on 143, at the release, and Grishnákh dies on its way,
    // on 145.
    expect(p.combat.state.units[14]).toMatchObject({ unitId: 'grishnakh', team: 'B' });
    expect(p.combat.state.units[2]).toMatchObject({ unitId: 'beregond', team: 'A' });
    expect(p.combat.events.find((e) => e.type === 'cast' && e.unit === 14)).toMatchObject({ tick: 132, releaseTick: 143 });
    expect(motionsOf(p, 'dash', 14).map((m) => m.tick)).toEqual([0, 132]);
    expect(motionsOf(p, 'dash', 14)[1]).toEqual({ tick: 132, from: { q: 5, r: 1 }, to: { q: 4, r: 3 } });
    expect(dashesOf(p, 14)[1]).toEqual({ tick: 132, departTick: 143, arriveTick: 153 });
    expect(dashesOf(p, 14)[0]!.arriveTick).toBeLessThan(100);
    expect(motionsOf(p, 'move', 14).filter((m) => m.tick > 100)).toEqual([]);
    expect(spawnHexOf(p, 2)).toEqual({ q: 3, r: 3 });
    expect(motionsOf(p, 'move', 2)).toEqual([]);
    expect(ticksOf(p, 'death', 14)).toEqual([145]);
    // Beregond is (−2, +2) from him: x −√3, z −3, −5π/6. The dash goes (−1, +2): x 0, z −3, π. Through the wind-up he faces
    // Beregond, and from 143 turns by π/6 the shorter way, through −11π/12 by 144.5, to face the way he dashes.
    for (const t of [132, 135, 140, 142.5, 143]) expectAngle(facingAt(fight, 14, t, 2), (-5 * PI) / 6);
    expectAngle(facingAt(fight, 14, 144, 2), (-5 * PI) / 6 - PI / 18);
    expectAngle(facingAt(fight, 14, 144.5, 2), (-11 * PI) / 12);
    // He dies on 145, and has nowhere to face.
    expect(fightFacing(playbackAt(fight, 145), 14, 2)).toBeNull();
  });

  it('is towards its target otherwise, from its position to the target’s, without the lunge', () => {
    const p = gandalfStuns();
    // The Ringwraith (id 0) on (1, 3), Gandalf (id 1) on (3, 3) and Aragorn (id 2) on (1, 4) never move.
    expect([0, 1, 2].map((unit) => spawnHexOf(p, unit))).toEqual([
      { q: 1, r: 3 },
      { q: 3, r: 3 },
      { q: 1, r: 4 },
    ]);
    expect([0, 1, 2].flatMap((unit) => [...motionsOf(p, 'move', unit), ...motionsOf(p, 'dash', unit)])).toEqual([]);
    // From Gandalf, Aragorn is (−2, +1): x −√3 × 1.5, z −1.5, −2π/3. From the Ringwraith he is (0, +1), 5π/6.
    expectAngle(facingAt(gandalfStunsFight, 1, 100, 2), (-2 * PI) / 3);
    expectAngle(facingAt(gandalfStunsFight, 0, 100, 2), (5 * PI) / 6);
    // Aragorn's melee attack on 44 lunges at the Ringwraith, at its height on its hitTick, 51. Gandalf faces where
    // Aragorn stands.
    expect(p.combat.events.find((e) => e.type === 'attack' && e.unit === 2 && e.tick === 44)).toMatchObject({ target: 0, ranged: false, hitTick: 51 });
    const q = playbackAt(gandalfStunsFight, 51);
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
    // In the Khamûl fight the first Gimli (id 1) dies on 279, the last tick: at 278.5 he faces Khamûl (id 0), from (0, 5)
    // to (−1, 6), −5π/6, and from 279 nowhere, even given a target; in the afterglow too.
    const k = khamulRides();
    expect(ticksOf(k, 'death', 0)).toEqual([279]);
    expect(dashesOf(k, 0)[0]?.arriveTick).toBe(200);
    expect(motionsOf(k, 'move', 1).at(-1)).toEqual({ tick: 185, from: { q: 1, r: 4 }, to: { q: 0, r: 5 } });
    expect(motionsOf(k, 'move', 0)).toEqual([]);
    expectAngle(facingAt(khamulRidesFight, 1, 278.5, 0), (-5 * PI) / 6);
    // Khamûl, who dies on 279, faces him the other way, π/6, and then nowhere.
    expectAngle(facingAt(khamulRidesFight, 0, 278.5, 1), PI / 6);
    expect(fightFacing(playbackAt(khamulRidesFight, 279), 0, 1)).toBeNull();
    expect(fightFacing(playbackAt(khamulRidesFight, 290), 0, 1)).toBeNull();
    // Sam dies on 753, the last tick; in the afterglow too.
    expect(ticksOf(walkingDuel(), 'death', 0)).toEqual([753]);
    expectAngle(facingAt(duel, 0, 752.5, 1), (5 * PI) / 6);
    expect(fightFacing(playbackAt(duel, 753), 0, 1)).toBeNull();
    expect(fightFacing(playbackAt(duel, 766), 0, 1)).toBeNull();
  });

  it('gives the same angle at a display time however playback got there: frame by frame, at any speed, paused or stepped', () => {
    const live = new Playback(khamulRidesFight());
    const units = live.combat.state.units.map((u) => u.id);
    const angles = (p: Playback) => units.map((u) => fightFacing(p, u, p.combat.state.units[u]?.target ?? null));
    const seen: { time: number; angles: (number | null)[] }[] = [];
    const speeds = [1, 0.25, 4, 2, 0.5];
    // Frames of 1/47 s, which seldom end on a whole tick, at each speed in turn: by frame 360 the fight (over on 279)
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

/**
 * The fight, with more events, each on its tick: after the sim's own events, or just before the attack of the unit it
 * is about. Only for ticks after 0.
 */
function withEvents(fight: Combat, extras: readonly CombatEvent[], beforeAttack = false): Combat {
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
      for (const extra of extras) {
        if (extra.tick !== fight.tick) continue;
        const unit = 'unit' in extra ? extra.unit : 'target' in extra ? extra.target : null;
        const attack = stepped.findIndex((e) => e.type === 'attack' && e.unit === unit);
        stepped.splice(beforeAttack && attack >= 0 ? attack : stepped.length, 0, extra);
      }
      events.push(...stepped);
      return stepped;
    },
    isOver: () => fight.isOver(),
    result: () => fight.result(),
  };
}
