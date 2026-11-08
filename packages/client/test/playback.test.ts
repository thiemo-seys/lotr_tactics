import { TICKS_PER_SECOND, createCombat, type Combat, type DashEvent, type PlacedUnit, type UnitId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { PRESETS, fightBoards } from '../src/boards.js';
import { hexToWorld, lerpPoint } from '../src/layout.js';
import { EFFECT_TICKS, Playback, SHOT_DELAY_TICKS, FLOATING_TEXT, facing, textOffset, type FloatingText } from '../src/playback.js';

function placed(unitId: UnitId, col: number, row: number): PlacedUnit {
  return { unitId, star: 1, col, row, items: [] };
}

function playback(A: readonly PlacedUnit[], B: readonly PlacedUnit[], seed = 1): Playback {
  return new Playback(createCombat({ seed, stage: 2, teams: { A, B } }));
}

/** Khamûl (id 0) against two Gimlis, seed 1: he casts Shadow ride on 174 and dashes away. */
function khamulRides(): Combat {
  return createCombat({ seed: 1, stage: 2, teams: { A: [placed('khamul', 3, 3)], B: [placed('gimli', 3, 3), placed('gimli', 4, 3)] } });
}

/** The fight, with a `death` event for `unit` added after the sim's own events on `tick`, which the sim's state doesn't know of. */
function withDeath(fight: Combat, unit: number, tick: number): Combat {
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
}

describe('Playback timing', () => {
  it('steps 30 ticks per second of real time, times the speed', () => {
    const p = playback(PRESETS.full, PRESETS.full);
    p.advance(1);
    expect(p.combat.tick).toBe(TICKS_PER_SECOND);
    p.speed = 2;
    p.advance(0.5);
    expect(p.combat.tick).toBe(2 * TICKS_PER_SECOND);
    // Part of a tick is kept for smooth motion.
    p.advance(0.25 / TICKS_PER_SECOND);
    expect(p.combat.tick).toBe(2 * TICKS_PER_SECOND);
    expect(p.time).toBeCloseTo(2 * TICKS_PER_SECOND + 0.5, 10);
  });

  it('doesn’t move while paused, but can step one tick at a time', () => {
    const p = playback(PRESETS.full, PRESETS.full);
    p.playing = false;
    expect(p.advance(1)).toEqual([]);
    expect(p.combat.tick).toBe(0);
    const events = p.step();
    expect(p.combat.tick).toBe(1);
    expect(p.time).toBe(1);
    expect(events.every((e) => e.tick === 1)).toBe(true);
  });

  it('stops stepping at the end of the fight, and runs display time on a little so effects finish', () => {
    const p = playback(PRESETS.duel, PRESETS.duel);
    while (!p.combat.isOver()) p.advance(1);
    const end = p.combat.tick;
    p.advance(10);
    expect(p.combat.tick).toBe(end);
    expect(p.time).toBeGreaterThan(end);
    expect(p.time).toBeLessThanOrEqual(end + 30);
    expect(p.step()).toEqual([]);
  });
});

describe('what is drawn', () => {
  it('moves a unit smoothly from one hex to the next over its step', () => {
    // Far apart, so Sam (id 0) starts walking on tick 1.
    const p = playback([placed('sam', 3, 0)], [placed('gimli', 3, 0)]);
    p.playing = false;
    const move = p.step().find((e) => e.type === 'move' && e.unit === 0);
    if (move?.type !== 'move') throw new Error('Sam should move on tick 1.');
    const from = hexToWorld(move.from);
    const to = hexToWorld(move.to);
    expect(p.position(0, move.tick)).toEqual(from);
    const halfway = p.position(0, (move.tick + move.arriveTick) / 2);
    expect(halfway.x).toBeCloseTo(lerpPoint(from, to, 0.5).x, 10);
    expect(halfway.z).toBeCloseTo(lerpPoint(from, to, 0.5).z, 10);
    expect(p.position(0, move.arriveTick)).toEqual(to);
  });

  it('holds a dashing unit on its hex through the wind-up, then moves it from departTick to arriveTick', () => {
    // Khamûl (id 0) casts Shadow ride on 174, choosing a hex 3 away. His wind-up ends on 185, when he sets off, and he
    // arrives on 200, at 5 ticks a hex (sim-spec 10.6); the dash comes with the cast (sim-spec 14).
    const p = new Playback(khamulRides());
    p.playing = false;
    while (p.combat.tick < 174) p.step();
    const dash = p.combat.events.find((e) => e.type === 'dash' && e.unit === 0);
    if (dash?.type !== 'dash') throw new Error('Khamûl should dash on 174.');
    expect(dash).toMatchObject({ tick: 174, departTick: 185, arriveTick: 200 });
    const from = hexToWorld(dash.from);
    const to = hexToWorld(dash.to);
    // Section 5, Positions: on `from` until it sets off, even once the dash is known.
    for (const time of [170, 174, 180, 184.5]) expect(p.position(0, time)).toEqual(from);
    while (p.combat.tick < 210) p.step();
    for (const time of [174, 180, 184.5, 185]) expect(p.position(0, time)).toEqual(from);
    // Then evenly to `to`, arriving on 200.
    for (const share of [0.25, 0.5, 0.9]) {
      const at = p.position(0, 185 + 15 * share);
      expect(at.x).toBeCloseTo(lerpPoint(from, to, share).x, 10);
      expect(at.z).toBeCloseTo(lerpPoint(from, to, share).z, 10);
    }
    expect(p.position(0, 200)).toEqual(to);
    expect(p.position(0, 210)).toEqual(to);
    expect(p.history(0).steps).toEqual([{ tick: 185, endTick: 200, dash: true, from, to }]);
  });

  it('never sets off a dash whose unit dies before departTick, and keeps one whose unit dies after', () => {
    // As above, with a death added before Khamûl sets off, on 180, or after, on 190. A unit that dies during its wind-up
    // never sets off (sim-spec 14), and stays on its hex. (Here the sim's state, which the playback reads, has him set
    // off either way; he does only if the death comes after.)
    for (const [deathTick, sets] of [
      [180, false],
      [190, true],
    ] as const) {
      const p = new Playback(withDeath(khamulRides(), 0, deathTick));
      p.playing = false;
      while (p.combat.tick < 210) p.step();
      const dash = p.combat.events.find((e) => e.type === 'dash' && e.unit === 0);
      if (dash?.type !== 'dash') throw new Error('Khamûl should dash on 174.');
      const from = hexToWorld(dash.from);
      const to = hexToWorld(dash.to);
      expect(p.position(0, 184)).toEqual(from);
      // One that dies on the way stops where it was when it died, a third of the way along.
      const stopped = sets ? lerpPoint(from, to, 1 / 3) : from;
      for (const time of [deathTick, 200, 210]) {
        expect(p.position(0, time).x).toBeCloseTo(stopped.x, 10);
        expect(p.position(0, time).z).toBeCloseTo(stopped.z, 10);
      }
      expect(p.history(0).steps.length).toBe(sets ? 1 : 0);
    }
  });

  it('never sets off a dash whose wind-up the fight ends in, though display time runs on', () => {
    // Théoden casts Forth Eorlingas! on 217 (tanks against rings, seed 1), to charge on 228; an ally ends the fight
    // on 227, so the sim never sets him off (sim-spec 13), and the afterglow runs on past 228.
    const p = new Playback(createCombat({ seed: 1, stage: 2, teams: fightBoards('tanks', 'rings', 1) }));
    p.playing = false;
    let dash: DashEvent | undefined;
    while (dash === undefined) dash = p.step().find((e): e is DashEvent => e.type === 'dash' && e.departTick > e.tick);
    const from = hexToWorld(dash.from);
    expect(p.history(dash.unit).steps.at(-1)).toMatchObject({ tick: dash.departTick, dash: true });
    p.playing = true;
    while (!p.combat.isOver()) p.advance(1 / TICKS_PER_SECOND);
    p.advance(10);
    const end = p.combat.tick;
    expect(end).toBeLessThan(dash.departTick);
    expect(p.time).toBe(end + 30);
    expect(p.time).toBeGreaterThan(dash.departTick);
    expect(p.history(dash.unit).steps.some((s) => s.dash && s.tick > end)).toBe(false);
    for (const time of [end, dash.departTick, (dash.departTick + dash.arriveTick) / 2, p.time]) expect(p.position(dash.unit, time)).toEqual(from);
    expect(p.position(dash.unit)).toEqual(hexToWorld(p.combat.state.units[dash.unit]!.hex));
  });

  it('stops a unit that dies mid-step where it was when it died, so it breaks up there', () => {
    // As in the test above, Sam (id 0) starts walking on tick 1; here he dies halfway through the step.
    const fight = createCombat({ seed: 1, stage: 2, teams: { A: [placed('sam', 3, 0)], B: [placed('gimli', 3, 0)] } });
    const p = new Playback(withDeath(fight, 0, 8));
    p.playing = false;
    const move = p.step().find((e) => e.type === 'move' && e.unit === 0);
    if (move?.type !== 'move') throw new Error('Sam should move on tick 1.');
    while (p.combat.tick < 30) p.step();
    const from = hexToWorld(move.from);
    const to = hexToWorld(move.to);
    const share = (8 - move.tick) / (move.arriveTick - move.tick);
    for (const time of [8, 12, move.arriveTick, 30]) {
      expect(p.position(0, time).x).toBeCloseTo(lerpPoint(from, to, share).x, 10);
      expect(p.position(0, time).z).toBeCloseTo(lerpPoint(from, to, share).z, 10);
    }
    // Before it died, it walked as usual.
    expect(p.position(0, 4)).toEqual(lerpPoint(from, to, (4 - move.tick) / (move.arriveTick - move.tick)));
  });

  it('flies projectiles from the archer to the target, landing on the hit tick', () => {
    // Legolas (id 0) and Haldir (id 1) stand 3 apart and shoot on tick 1. The shot leaves 3 ticks
    // later, as the attack clip looses it (viewer-spec section 5, Projectiles), and lands on 9.
    const p = playback([placed('legolas', 3, 1)], [placed('haldir', 3, 3)]);
    p.playing = false;
    p.step();
    const shot = p.projectiles.find((s) => s.source === 0)!;
    expect(shot).toMatchObject({ target: 1, startTick: 4, hitTick: 9 });
    expect(p.projectilePosition(shot, shot.startTick)).toEqual(p.position(0));
    expect(p.projectilePosition(shot, shot.hitTick)).toEqual(p.position(1));
    while (p.combat.tick < shot.hitTick) p.step();
    expect(p.projectiles).not.toContain(shot);
  });

  it('looses a shot at an adjacent target a tick before it lands, when the flight is shorter than the loose', () => {
    // Legolas (id 0) and Haldir (id 1) stand on facing front rows, next to each other, and shoot on
    // tick 1. The arrow flies 3 ticks, landing on 4, so it can't wait for the clip's loose 3 ticks
    // in: it leaves a tick before it lands (viewer-spec section 5, Projectiles).
    const p = playback([placed('legolas', 3, 3)], [placed('haldir', 3, 3)]);
    p.playing = false;
    p.step();
    const shot = p.projectiles.find((s) => s.source === 0)!;
    expect(shot).toMatchObject({ target: 1, startTick: 3, hitTick: 4 });
    expect(shot.startTick).toBeLessThan(1 + SHOT_DELAY_TICKS);
    expect(p.projectilePosition(shot, shot.startTick)).toEqual(p.position(0));
    expect(p.projectilePosition(shot, shot.hitTick)).toEqual(p.position(1));
  });

  it('writes positions into a point it is given, as it gives them', () => {
    const p = playback([placed('legolas', 3, 1)], [placed('haldir', 3, 3)]);
    p.playing = false;
    p.step();
    const shot = p.projectiles.find((s) => s.source === 0)!;
    const out = { x: NaN, z: NaN };
    for (const time of [shot.startTick, 6.5, shot.hitTick]) {
      expect(p.projectilePositionInto(out, shot, time)).toBe(out);
      expect(out).toEqual(p.projectilePosition(shot, time));
      expect(p.positionInto(out, 1, time)).toEqual(p.position(1, time));
    }
  });

  it('keeps the same lists of effects from frame to frame until one ends, so a frame allocates nothing', () => {
    const p = playback(PRESETS.full, PRESETS.traits);
    p.advance(1);
    const { projectiles, texts } = p;
    // A frame between ticks: nothing new, nothing over.
    const events = p.advance(0.1 / TICKS_PER_SECOND);
    expect(events).toEqual([]);
    expect(p.advance(0.1 / TICKS_PER_SECOND)).toBe(events);
    expect(p.projectiles).toBe(projectiles);
    expect(p.texts).toBe(texts);
    // Once an effect ends, it is gone from its list.
    p.advance(1);
    expect(p.texts.every((text) => text.startTick + EFFECT_TICKS.floatingText > p.time)).toBe(true);
    expect(p.projectiles.every((shot) => shot.hitTick > p.time)).toBe(true);
  });

  it('shows damage, absorbed damage and casts as floating text that fades', () => {
    const p = playback(PRESETS.full, PRESETS.traits);
    p.advance(0.1);
    const kinds = new Set<string>();
    for (let i = 0; i < 400 && !p.combat.isOver(); i++) {
      p.advance(1 / TICKS_PER_SECOND);
      for (const text of p.texts) {
        kinds.add(text.kind);
        expect(p.time - text.startTick).toBeLessThan(EFFECT_TICKS.floatingText);
      }
    }
    expect(kinds).toContain('physical');
    expect(kinds).toContain('absorbed');
    expect(kinds).toContain('cast');
  });

  it('starts a text on a unit clear of its others, which rise with it, so a multi-hit’s numbers each read', () => {
    const { gap, rise } = FLOATING_TEXT;
    const life = EFFECT_TICKS.floatingText;
    const text = (unit: number, startTick: number, offset: number): FloatingText => ({ unit, text: '1', kind: 'physical', big: false, startTick, offset });
    // Alone, at the bottom; together, stacked upwards.
    expect(textOffset([], 0, 10)).toBe(0);
    expect(textOffset([text(0, 10, 0)], 0, 10)).toBe(gap);
    // A few ticks apart, as a multi-hit's: just above where the last has risen to.
    expect(textOffset([text(0, 10, 0)], 0, 13)).toBeCloseTo((3 * rise) / life + gap, 10);
    // Once the lowest has risen a gap's height, the bottom is free again; another unit's text never counts.
    expect(textOffset([text(0, 10, 0)], 0, 10 + Math.ceil((gap * life) / rise))).toBe(0);
    expect(textOffset([text(1, 10, 0)], 0, 10)).toBe(0);
    // Into a space between two that is wide enough.
    expect(textOffset([text(0, 10, 0), text(0, 10, 3 * gap)], 0, 10)).toBe(gap);
    // In fights: no two texts of a unit showing together are ever closer than the gap.
    let stacked = 0;
    for (const [a, b] of [
      [PRESETS.archers, PRESETS.tanks],
      [PRESETS.full, PRESETS.traits],
    ] as const) {
      const p = playback(a, b);
      for (let i = 0; i < 600 && !p.combat.isOver(); i++) {
        p.advance(1 / TICKS_PER_SECOND);
        for (const x of p.texts) {
          for (const y of p.texts) {
            if (x === y || x.unit !== y.unit) continue;
            const height = (t: FloatingText) => t.offset + (rise * (p.time - t.startTick)) / life;
            expect(Math.abs(height(x) - height(y))).toBeGreaterThanOrEqual(gap - 1e-9);
            if (x.startTick !== y.startTick && x.offset > 0) stacked++;
          }
        }
      }
    }
    expect(stacked).toBeGreaterThan(0);
  });

  it('turns units to face a point, about the vertical axis', () => {
    expect(facing({ x: 0, z: 0 }, { x: 0, z: 1 })).toBeCloseTo(0, 10);
    expect(facing({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(Math.PI / 2, 10);
    expect(facing({ x: 1, z: 1 }, { x: 1, z: 1 })).toBeNull();
  });
});
