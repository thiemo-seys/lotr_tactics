import { TICKS_PER_SECOND, createCombat, type PlacedUnit, type UnitId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { PRESETS } from '../src/boards.js';
import { hexToWorld, lerpPoint } from '../src/layout.js';
import { EFFECT_TICKS, Playback, facing } from '../src/playback.js';

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
    // Legolas (id 0) and Haldir (id 1) stand 3 apart and shoot on tick 1.
    const p = playback([placed('legolas', 3, 1)], [placed('haldir', 3, 3)]);
    p.playing = false;
    p.step();
    const shot = p.projectiles.find((s) => s.source === 0)!;
    expect(shot).toMatchObject({ target: 1, startTick: 1, hitTick: 9 });
    expect(p.projectilePosition(shot, shot.startTick)).toEqual(p.position(0));
    expect(p.projectilePosition(shot, shot.hitTick)).toEqual(p.position(1));
    while (p.combat.tick < shot.hitTick) p.step();
    expect(p.projectiles).not.toContain(shot);
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

  it('turns units to face a point, about the vertical axis', () => {
    expect(facing({ x: 0, z: 0 }, { x: 0, z: 1 })).toBeCloseTo(0, 10);
    expect(facing({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(Math.PI / 2, 10);
    expect(facing({ x: 1, z: 1 }, { x: 1, z: 1 })).toBeNull();
  });
});
