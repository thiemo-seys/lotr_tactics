import { describe, expect, it } from 'vitest';
import { Fight } from '../src/combat/combat.js';
import { manaFromDamage } from '../src/combat/damage.js';
import type { CombatEvent } from '../src/combat/events.js';
import { baseStats, finalStats } from '../src/combat/stats.js';
import { Statuses } from '../src/combat/statuses.js';
import { UNITS } from '../src/data/units.js';
import { input, placed } from './helpers.js';

describe('Statuses', () => {
  it('extends a stun, stun immunity or untargetable only if the new one lasts longer', () => {
    const statuses = new Statuses();
    expect(statuses.extend('stun', 60)).toBe(true);
    expect(statuses.extend('stun', 45)).toBe(false);
    expect(statuses.extend('stun', 60)).toBe(false);
    expect(statuses.extend('stun', 90)).toBe(true);
    expect(statuses.extend('untargetable', 30)).toBe(true);
    statuses.expire(89);
    expect(statuses.has('stun')).toBe(true);
    expect(statuses.has('untargetable')).toBe(false);
    statuses.expire(90);
    expect(statuses.has('stun')).toBe(false);
  });

  it('ignores new stuns while immune, but keeps a stun already in place', () => {
    const statuses = new Statuses();
    statuses.extend('stun', 30);
    statuses.extend('stunImmune', 120);
    expect(statuses.extend('stun', 60)).toBe(false);
    expect(statuses.has('stun')).toBe(true);
    statuses.expire(30);
    expect(statuses.has('stun')).toBe(false);
    statuses.expire(120);
    expect(statuses.extend('stun', 150)).toBe(true);
  });

  it('applies only the strongest slow, then the next strongest once it expires', () => {
    const statuses = new Statuses();
    statuses.addSlow(30, 90);
    statuses.addSlow(25, 150);
    expect(statuses.modifiers().slowPct).toBe(30);
    expect(statuses.expire(89)).toBe(false);
    expect(statuses.expire(90)).toBe(true);
    expect(statuses.modifiers().slowPct).toBe(25);
    statuses.expire(150);
    expect(statuses.modifiers().slowPct).toBe(0);
    // A status added after everything expired still expires on time.
    statuses.addSlow(10, 200);
    expect(statuses.expire(199)).toBe(false);
    expect(statuses.expire(200)).toBe(true);
  });

  it('applies only the strongest reduction of each stat', () => {
    const statuses = new Statuses();
    statuses.addReduction('armor', 30, 120);
    statuses.addReduction('armor', 50, 60);
    statuses.addReduction('magicResist', 20, 120);
    expect(statuses.modifiers()).toMatchObject({ armorReductionPct: 50, magicResistReductionPct: 20 });
    statuses.expire(60);
    expect(statuses.modifiers()).toMatchObject({ armorReductionPct: 30, magicResistReductionPct: 20 });
  });

  it('adds buffs together, each with its own duration', () => {
    const statuses = new Statuses();
    statuses.addBuff('attackSpeedPct', 30, 60);
    statuses.addBuff('attackSpeedPct', 30, 120);
    statuses.addBuff('armor', 25, 150);
    expect(statuses.modifiers()).toMatchObject({ attackSpeedPct: 60, armor: 25, attackDamagePct: 0, magicResist: 0 });
    statuses.expire(60);
    expect(statuses.modifiers()).toMatchObject({ attackSpeedPct: 30, armor: 25 });
  });

  it('gives modifiers that finalStats applies', () => {
    const statuses = new Statuses();
    statuses.addBuff('attackDamagePct', 20, 60);
    statuses.addBuff('armor', 10, 60);
    statuses.addSlow(50, 60);
    statuses.addReduction('armor', 50, 60);
    const base = baseStats(UNITS.sam, 1);
    expect(finalStats(base, statuses.modifiers())).toMatchObject({ attackDamage: 54, attackSpeed: 0.3, armor: 25, magicResist: 40 });
  });

  it('absorbs damage with the earliest-expiring shield first, then the oldest', () => {
    const statuses = new Statuses();
    statuses.addShield(100, 120);
    statuses.addShield(50, 60);
    statuses.addShield(30, 60);
    expect(statuses.shield).toBe(180);
    // The 50 goes first, then 20 of the 30.
    expect(statuses.absorb(70)).toBe(70);
    expect(statuses.shield).toBe(110);
    // The rest of the 30 expires at tick 60, leaving the 100.
    expect(statuses.expire(60)).toBe(false);
    expect(statuses.shield).toBe(100);
    expect(statuses.absorb(150)).toBe(100);
    expect(statuses.shield).toBe(0);
    expect(statuses.absorb(10)).toBe(0);
  });
});

/** Steps the fight up to and including `tick`, returning those ticks' events. */
function stepTo(fight: Fight, tick: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  while (fight.tick < tick) events.push(...fight.step());
  return events;
}

function ofType<T extends CombatEvent['type']>(events: readonly CombatEvent[], type: T): Extract<CombatEvent, { type: T }>[] {
  return events.filter((e): e is Extract<CombatEvent, { type: T }> => e.type === type);
}

function ticksOf(events: readonly CombatEvent[], type: 'attack' | 'move', unit: number): number[] {
  return ofType(events, type).flatMap((e) => (e.unit === unit ? [e.tick] : []));
}

/** Sam (A, id 0) and Gimli (B, id 1) side by side, so they only attack. */
const DUEL = input([placed('sam', 3, 3)], [placed('gimli', 3, 3)]);

describe('statuses in a fight', () => {
  it('stops a stunned unit acting until the start of the stun’s expiry tick', () => {
    const fight = new Fight(DUEL);
    fight.applyStatus(1, 0, { kind: 'stun', seconds: 2 });
    expect(fight.events.at(-1)).toEqual({
      type: 'status',
      tick: 0,
      source: 1,
      target: 0,
      status: 'stun',
      stat: null,
      value: null,
      expiresTick: 60,
    });
    // A shorter stun changes nothing.
    const eventCount = fight.events.length;
    fight.applyStatus(1, 0, { kind: 'stun', seconds: 1 });
    expect(fight.events).toHaveLength(eventCount);

    const events = stepTo(fight, 59);
    expect(fight.state.units[0]!.statuses.has('stun')).toBe(true);
    expect(ticksOf(events, 'attack', 0)).toEqual([]);
    expect(ticksOf(events, 'attack', 1)).toEqual([1, 51]);
    expect(ticksOf(fight.step(), 'attack', 0)).toEqual([60]);
    expect(fight.state.units[0]!.statuses.has('stun')).toBe(false);
  });

  it('ignores stuns on a stun-immune unit', () => {
    const fight = new Fight(DUEL);
    fight.applyStatus(0, 0, { kind: 'stunImmune', seconds: 4 });
    const eventCount = fight.events.length;
    fight.applyStatus(1, 0, { kind: 'stun', seconds: 2 });
    expect(fight.events).toHaveLength(eventCount);
    expect(ticksOf(stepTo(fight, 1), 'attack', 0)).toEqual([1]);
  });

  it('lets a step under way finish, then holds the unit until the stun ends', () => {
    // Far apart, so both walk towards each other.
    const fight = new Fight(input([placed('sam', 3, 0)], [placed('gimli', 3, 0)]));
    const move = ofType(fight.step(), 'move').find((e) => e.unit === 0)!;
    expect(move).toMatchObject({ tick: 1, arriveTick: 16 });
    fight.applyStatus(1, 0, { kind: 'stun', seconds: 1 });
    expect(fight.state.units[0]!.hex).toEqual(move.to);
    expect(ticksOf(stepTo(fight, 40), 'move', 0)).toEqual([31]);
  });

  it('slows attacks with only the strongest slow, from the next attack on', () => {
    const fight = new Fight(DUEL);
    fight.applyStatus(0, 1, { kind: 'slow', pct: 50, seconds: 3 });
    fight.applyStatus(0, 1, { kind: 'slow', pct: 25, seconds: 5 });
    expect(fight.events.at(-1)).toMatchObject({ type: 'status', status: 'slow', stat: null, value: 25, expiresTick: 150 });
    const gimli = fight.state.units[1]!;
    expect(gimli.stats.attackSpeed).toBe(0.3);

    const events = stepTo(fight, 89);
    expect(gimli.stats.attackSpeed).toBe(0.3);
    stepTo(fight, 90);
    expect(gimli.stats.attackSpeed).toBeCloseTo(0.45, 10);
    events.push(...stepTo(fight, 200));
    expect(gimli.stats.attackSpeed).toBe(0.6);
    // 1 + 30 / 0.3 = 101, then 101 + 30 / 0.45 = 167.67, then 168 + 30 / 0.6 = 218.
    expect(ticksOf(events, 'attack', 1)).toEqual([1, 101, 168]);
  });

  it('lowers Armor and Magic Resist with the strongest reduction of each, for its duration', () => {
    const fight = new Fight(DUEL);
    fight.applyStatus(0, 1, { kind: 'reduce', stats: ['armor'], pct: 50, seconds: 4 });
    fight.applyStatus(0, 1, { kind: 'reduce', stats: ['armor', 'magicResist'], pct: 30, seconds: 2 });
    expect(ofType(fight.events, 'status').map((e) => [e.stat, e.value, e.expiresTick])).toEqual([
      ['armor', 50, 120],
      ['armor', 30, 60],
      ['magicResist', 30, 60],
    ]);
    const gimli = fight.state.units[1]!;
    expect([gimli.stats.armor, gimli.stats.magicResist]).toEqual([25, 35]);

    // Sam's 45 Attack Damage (63 on a crit) against Armor 25 until tick 120, then 50.
    const hits = ofType(stepTo(fight, 200), 'damage').filter((e) => e.source === 0);
    expect(hits.map((h) => h.tick)).toEqual([1, 51, 101, 151]);
    for (const hit of hits) {
      const expected = hit.tick < 120 ? (hit.crit ? 50 : 36) : hit.crit ? 42 : 30;
      expect(hit.amount).toBe(expected);
    }
    expect([gimli.stats.armor, gimli.stats.magicResist]).toEqual([50, 50]);
  });

  it('adds buffs together, each ending on its own', () => {
    const fight = new Fight(DUEL);
    fight.applyStatus(0, 0, { kind: 'buff', stat: 'attackDamagePct', amount: 20, seconds: 2 });
    fight.applyStatus(0, 0, { kind: 'buff', stat: 'attackDamagePct', amount: 20, seconds: 4 });
    const sam = fight.state.units[0]!;
    expect(sam.stats.attackDamage).toBe(63);
    stepTo(fight, 60);
    expect(sam.stats.attackDamage).toBe(54);
    stepTo(fight, 120);
    expect(sam.stats.attackDamage).toBe(45);
  });

  it('takes damage off shields first, earliest-expiring first, until they expire', () => {
    const fight = new Fight(DUEL);
    fight.addShield(0, 0, 100.4, 4);
    expect(fight.events.at(-1)).toEqual({ type: 'shield', tick: 0, source: 0, target: 0, amount: 100, expiresTick: 120 });
    // A shield that rounds to 0 isn't added.
    const eventCount = fight.events.length;
    fight.addShield(0, 0, 0.4, 4);
    expect(fight.events).toHaveLength(eventCount);

    const sam = fight.state.units[0]!;
    let shield = 100;
    let health = sam.health;
    const hits = ofType(stepTo(fight, 200), 'damage').filter((e) => e.target === 0);
    expect(hits.map((h) => h.tick)).toEqual([1, 51, 101, 151]);
    for (const hit of hits) {
      const absorbed = hit.tick < 120 ? Math.min(hit.amount, shield) : 0;
      expect(hit.absorbed).toBe(absorbed);
      shield -= absorbed;
      health -= hit.amount - absorbed;
    }
    expect(sam.health).toBe(health);
    expect(sam.statuses.shield).toBe(0);
  });

  it('gives the defender mana from damage its shield absorbed', () => {
    const fight = new Fight(DUEL);
    fight.addShield(0, 0, 1000, 4);
    const hit = ofType(fight.step(), 'damage').find((e) => e.target === 0)!;
    expect(hit.absorbed).toBe(hit.amount);
    const sam = fight.state.units[0]!;
    expect(sam.health).toBe(sam.stats.maxHealth);
    expect(sam.mana).toBe(30 + 10 + manaFromDamage(hit.amount));
  });

  it('makes enemies drop an untargetable unit at once and choose another target', () => {
    // Sam (id 0) starts next to Gimli (id 1); Legolas (id 2) stands at the back.
    const fight = new Fight(input([placed('sam', 3, 3)], [placed('gimli', 3, 3), placed('legolas', 3, 0)]));
    const sam = fight.state.units[0]!;
    stepTo(fight, 1);
    expect(sam.target).toBe(1);
    fight.applyStatus(1, 1, { kind: 'untargetable', seconds: 1 });
    expect(fight.events.at(-1)).toMatchObject({ type: 'status', status: 'untargetable', expiresTick: 31 });
    expect(sam.target).toBeNull();

    const events = stepTo(fight, 2);
    expect(sam.target).toBe(2);
    expect(ticksOf(events, 'move', 0)).toEqual([2]);
    // It keeps its new target after the status ends, while Gimli keeps attacking.
    events.push(...stepTo(fight, 60));
    expect(sam.target).toBe(2);
    expect(ofType(events, 'damage').some((e) => e.source === 0 && e.target === 1)).toBe(false);
    expect(ticksOf(events, 'attack', 1)).toEqual([51]);
  });

  it('wastes projectiles at an untargetable unit, and waits while no enemy is targetable', () => {
    // Legolas (A, id 0) and Haldir (B, id 1) stand 3 hexes apart: projectiles take 8 ticks.
    const fight = new Fight(input([placed('legolas', 3, 1)], [placed('haldir', 3, 3)]));
    stepTo(fight, 1);
    fight.applyStatus(1, 1, { kind: 'untargetable', seconds: 1 });
    const events = stepTo(fight, 30);
    const landed = (source: number) => events.some((e) => (e.type === 'damage' || e.type === 'dodge') && e.source === source && e.tick === 9);
    expect(landed(0)).toBe(false);
    expect(landed(1)).toBe(true);
    expect(fight.state.units[0]!.target).toBeNull();
    expect(ticksOf(events, 'attack', 0)).toEqual([]);
    // From tick 31 Haldir can be targeted again; Legolas's next attack is ready at 1 + 30 / 0.75 = 41.
    expect(ticksOf(stepTo(fight, 41), 'attack', 0)).toEqual([41]);
  });

  it('expires statuses before resolving the queue', () => {
    // Haldir is untargetable until the start of tick 9, when Legolas's projectile is due, so it lands.
    const fight = new Fight(input([placed('legolas', 3, 1)], [placed('haldir', 3, 3)]));
    stepTo(fight, 1);
    fight.applyStatus(1, 1, { kind: 'untargetable', seconds: 8 / 30 });
    const events = stepTo(fight, 9);
    expect(events.some((e) => (e.type === 'damage' || e.type === 'dodge') && e.source === 0 && e.tick === 9)).toBe(true);
  });
});
