import { TICKS_PER_SECOND, createCombat, type PlacedUnit, type UnitId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { PRESETS } from '../src/boards.js';
import { hexToWorld, lerpPoint } from '../src/layout.js';
import { EFFECT_TICKS, Playback, SHOT_DELAY_TICKS, facing } from '../src/playback.js';

function placed(unitId: UnitId, col: number, row: number): PlacedUnit {
  return { unitId, star: 1, col, row, items: [] };
}

function playback(A: readonly PlacedUnit[], B: readonly PlacedUnit[], seed = 1): Playback {
  return new Playback(createCombat({ seed, stage: 2, teams: { A, B } }));
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
    const { projectiles, texts, casts } = p;
    // A frame between ticks: nothing new, nothing over.
    const events = p.advance(0.1 / TICKS_PER_SECOND);
    expect(events).toEqual([]);
    expect(p.advance(0.1 / TICKS_PER_SECOND)).toBe(events);
    expect(p.projectiles).toBe(projectiles);
    expect(p.texts).toBe(texts);
    expect(p.casts).toBe(casts);
    // Once an effect ends, it is gone from its list.
    p.advance(1);
    expect(p.texts.every((text) => text.startTick + EFFECT_TICKS.floatingText > p.time)).toBe(true);
    expect(p.casts.every((cast) => cast.startTick + EFFECT_TICKS.castRing > p.time)).toBe(true);
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

  it('fades dead units out over half a second', () => {
    const p = playback(PRESETS.duel, PRESETS.duel);
    while (!p.combat.isOver()) p.advance(1);
    const dead = p.combat.state.units.find((u) => !u.alive)!;
    const deathTick = p.combat.events.find((e) => e.type === 'death')!.tick;
    expect(p.deathProgress(dead.id, deathTick)).toBe(0);
    expect(p.deathProgress(dead.id, deathTick + EFFECT_TICKS.death / 2)).toBeCloseTo(0.5, 10);
    expect(p.deathProgress(dead.id, deathTick + EFFECT_TICKS.death)).toBe(1);
  });

  it('holds a dying unit for a delay, then sinks and fades it over half a second', () => {
    const p = playback(PRESETS.duel, PRESETS.duel);
    while (!p.combat.isOver()) p.advance(1);
    p.advance(10);
    const death = p.combat.events.find((e) => e.type === 'death');
    if (death?.type !== 'death') throw new Error('A Sam should die.');
    const { unit, tick } = death;
    // viewer-spec 5: 0 until delaySeconds after the death, then rising to 1 over the 15 ticks of the sink. (The scene
    // passes half the death clip's length.) A delay of 0.4 s is 12 ticks, so the sink runs from tick + 12 to tick + 27.
    expect(p.deathProgress(unit, tick - 30, 0.4)).toBe(0);
    expect(p.deathProgress(unit, tick, 0.4)).toBe(0);
    expect(p.deathProgress(unit, tick + 6, 0.4)).toBe(0);
    expect(p.deathProgress(unit, tick + 11.5, 0.4)).toBe(0);
    expect(p.deathProgress(unit, tick + 12 + 7.5, 0.4)).toBeCloseTo(0.5, 10);
    expect(p.deathProgress(unit, tick + 27, 0.4)).toBeCloseTo(1, 10);
    expect(p.deathProgress(unit, tick + 29, 0.4)).toBe(1);
    // With no delay the sink starts at once, as without a death clip.
    expect(p.deathProgress(unit, tick + 7.5, 0)).toBeCloseTo(0.5, 10);
    expect(p.deathProgress(unit, tick + 7.5)).toBeCloseTo(0.5, 10);
    // The Sam that lives never sinks.
    const living = p.combat.state.units.find((u) => u.alive)!;
    expect(p.deathProgress(living.id, tick + 20, 0.4)).toBe(0);
  });

  it('lets a unit that dies on the last tick finish a half-second death clip and its fade before the afterglow ends', () => {
    const p = playback(PRESETS.duel, PRESETS.duel);
    while (!p.combat.isOver()) p.advance(1);
    p.advance(10);
    // The fight ends with its last death (sim-spec 13).
    const last = p.combat.events.findLast((e) => e.type === 'death');
    if (last?.type !== 'death') throw new Error('A Sam should die.');
    expect(last.tick).toBe(p.combat.tick);
    // viewer-spec 5: a death clip lasts at most 0.5 s (15 ticks), and the 15-tick sink starts halfway through it, so the
    // scene passes a delay of at most 0.25 s and the sink is over 22.5 ticks after the death. Even a delay of the whole
    // clip ends the sink 30 ticks after it: within the second of afterglow the viewer runs after the fight, at the
    // display time it ends on.
    expect(p.time).toBeCloseTo(last.tick + TICKS_PER_SECOND, 6);
    expect(p.deathProgress(last.unit, undefined, 0.25)).toBe(1);
    expect(p.deathProgress(last.unit, undefined, 0.5)).toBeCloseTo(1, 10);
  });

  it('turns units to face a point, about the vertical axis', () => {
    expect(facing({ x: 0, z: 0 }, { x: 0, z: 1 })).toBeCloseTo(0, 10);
    expect(facing({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(Math.PI / 2, 10);
    expect(facing({ x: 1, z: 1 }, { x: 1, z: 1 })).toBeNull();
  });
});
