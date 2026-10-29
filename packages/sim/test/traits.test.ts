import { describe, expect, it } from 'vitest';
import { onOwnHalf } from '../src/combat/abilities.js';
import { Fight, type CombatInput, type UnitState } from '../src/combat/combat.js';
import { finalDamage } from '../src/combat/damage.js';
import { abilityValue, combineModifiers } from '../src/combat/stats.js';
import { activeTrait, traitModifiers } from '../src/combat/traits.js';
import { UNITS, type UnitId } from '../src/data/units.js';
import { distance } from '../src/hex.js';
import type { Team } from '../src/types.js';
import { input, ofType, placed, stepTo } from './helpers.js';

function unitOf(fight: Fight, unitId: string, team: Team = 'A'): UnitState {
  return fight.state.units.find((u) => u.unitId === unitId && u.team === team)!;
}

/** The first basic attack `attacker` lands, with the damage it should deal given its damage amp. */
function firstHit(fightInput: CombatInput, attacker: UnitId, ampPct: number) {
  const fight = new Fight(fightInput);
  const source = unitOf(fight, attacker);
  const events = stepTo(fight, 1);
  const hit = ofType(events, 'damage').find((e) => e.source === source.id && e.kind === 'attack')!;
  const target = fight.state.units[hit.target]!;
  const raw = (source.stats.attackDamage * (hit.crit ? source.stats.critDamagePct : 100)) / 100;
  return { amount: hit.amount, expected: finalDamage(raw, 'physical', target.stats, { ampPct, overtimePct: 100, reductionPct: 0 }) };
}

describe('trait levels and bonuses', () => {
  it('gives the values of the active level, or nothing', () => {
    expect(activeTrait({ hobbit: 1 }, 'hobbit')).toEqual({ health: 350 });
    expect(activeTrait({}, 'hobbit')).toBeUndefined();
  });

  it('gives each static bonus at each breakpoint, only to units with the trait', () => {
    expect([0, 1, 2].map((level) => traitModifiers(UNITS.sam, { hobbit: level }, false).health)).toEqual([150, 350, 600]);
    expect(traitModifiers(UNITS.gimli, { hobbit: 2 }, false).health).toBe(0);
    expect([0, 1].map((level) => traitModifiers(UNITS.legolas, { elf: level }, false))).toMatchObject([
      { attackSpeedPct: 20, dodgePct: 0 },
      { attackSpeedPct: 45, dodgePct: 20 },
    ]);
    expect([0, 1].map((level) => traitModifiers(UNITS.gimli, { dwarf: level }, false).armor)).toEqual([30, 60]);
    expect([0, 1, 2].map((level) => traitModifiers(UNITS.merry, { burglar: level }, false).critDamagePct)).toEqual([20, 45, 75]);
    expect([0, 1, 2].map((level) => traitModifiers(UNITS.gandalf, { sorcerer: level }, false).abilityPower)).toEqual([20, 45, 80]);
    expect(traitModifiers(UNITS.legolas, { dwarf: 1, burglar: 2, sorcerer: 2 }, false)).toMatchObject({
      armor: 0,
      critDamagePct: 0,
      abilityPower: 0,
    });
  });

  it('gives the Gondor bonus to any ally in the front row, Gondor or not', () => {
    expect([0, 1].map((level) => traitModifiers(UNITS.gimli, { gondor: level }, true))).toMatchObject([
      { armor: 20, magicResist: 20 },
      { armor: 45, magicResist: 45 },
    ]);
    expect(traitModifiers(UNITS.beregond, { gondor: 1 }, false)).toMatchObject({ armor: 0, magicResist: 0 });
    // A front-row Dwarf gets both.
    expect(traitModifiers(UNITS.gimli, { gondor: 0, dwarf: 0 }, true).armor).toBe(50);
  });

  it('adds bonuses together and keeps only the strongest slow and reduction', () => {
    expect(combineModifiers({ armor: 20, slowPct: 15 }, { armor: 30, slowPct: 30, armorReductionPct: 10 }, { slowPct: 25 })).toMatchObject({
      armor: 50,
      slowPct: 30,
      armorReductionPct: 10,
      attackDamagePct: 0,
    });
  });
});

describe('traits at combat start', () => {
  it('Hobbit: starts Hobbits at full Health, bonus included', () => {
    const fight = new Fight(input([placed('sam', 3, 3), placed('merry', 2, 3), placed('gimli', 0, 0)], [placed('eomer', 3, 3)]));
    for (const id of ['sam', 'merry']) {
      const hobbit = unitOf(fight, id);
      expect(hobbit.stats.maxHealth).toBe(hobbit.base.maxHealth + 150);
      expect(hobbit.health).toBe(hobbit.stats.maxHealth);
    }
    expect(unitOf(fight, 'gimli').stats.maxHealth).toBe(unitOf(fight, 'gimli').base.maxHealth);
  });

  it('Gondor: front-row allies gain Armor and Magic Resist; the back row doesn’t', () => {
    const fight = new Fight(input([placed('beregond', 3, 3), placed('gimli', 2, 3), placed('faramir', 3, 0)], [placed('eomer', 3, 3)]));
    for (const [id, bonus] of [
      ['beregond', 20],
      ['gimli', 20],
      ['faramir', 0],
    ] as const) {
      const unit = unitOf(fight, id);
      expect([unit.stats.armor, unit.stats.magicResist]).toEqual([unit.base.armor + bonus, unit.base.magicResist + bonus]);
    }
  });

  it('Guardian: Guardians start with a shield for 8 seconds', () => {
    const fight = new Fight(input([placed('sam', 3, 3), placed('beregond', 2, 3), placed('legolas', 0, 0)], [placed('eomer', 3, 3)]));
    const [sam, beregond] = [unitOf(fight, 'sam'), unitOf(fight, 'beregond')];
    // Beregond comes first in slot order.
    expect(ofType(fight.events, 'shield').map((e) => [e.source, e.target, e.amount, e.expiresTick])).toEqual([
      [beregond.id, beregond.id, 200, 240],
      [sam.id, sam.id, 200, 240],
    ]);
  });

  it.each([
    [2, 1],
    [4, 2],
    [6, 4],
  ])('Orc: with %i Orcs, spawns %i grunts, round-robin next to the Orcs in slot order', (orcCount, grunts) => {
    const orcs = (['grishnakh', 'sharku', 'gorbag', 'lurtz', 'ugluk', 'gothmog'] as const).slice(0, orcCount);
    const fight = new Fight(input(orcs.map((id, col) => placed(id, col, 1)), [placed('gimli', 3, 3)]));
    const owners = fight.state.units.filter((u) => u.team === 'A' && !u.summon).sort((a, b) => a.slot - b.slot);
    const spawns = ofType(fight.events, 'spawn').filter((e) => e.summon);
    expect(spawns).toHaveLength(grunts);
    spawns.forEach((spawn, i) => {
      expect(spawn).toMatchObject({ tick: 0, unitId: 'orc-grunt', team: 'A' });
      expect(distance(spawn.hex, owners[i % owners.length]!.hex)).toBe(1);
      expect(onOwnHalf('A', spawn.hex)).toBe(true);
    });
  });

  it('Burglar: Burglars leap next to the farthest enemy, target it, gain Crit Damage and wait 9 ticks', () => {
    const fight = new Fight(input([placed('merry', 3, 3), placed('grishnakh', 2, 3)], [placed('gimli', 3, 3), placed('haldir', 3, 0)]));
    const haldir = unitOf(fight, 'haldir', 'B');
    const burglars = [unitOf(fight, 'merry'), unitOf(fight, 'grishnakh')];
    expect(ofType(fight.events, 'dash').map((e) => e.unit).sort()).toEqual(burglars.map((u) => u.id).sort());
    for (const burglar of burglars) {
      expect(distance(burglar.hex, haldir.hex)).toBe(1);
      expect(burglar.target).toBe(haldir.id);
      expect(burglar.stats.critDamagePct).toBe(160);
    }
    const events = stepTo(fight, 9);
    const acted = (e: (typeof events)[number]) => (e.type === 'attack' || e.type === 'move') && burglars.some((b) => b.id === e.unit);
    expect(events.filter((e) => acted(e) && e.tick < 9)).toEqual([]);
    expect(events.filter((e) => acted(e) && e.tick === 9)).toHaveLength(2);
  });

  it('Rider: Riders charge next to the nearest enemy for trait damage that can’t crit, then wait 9 ticks', () => {
    const fight = new Fight(input([placed('sharku', 2, 0), placed('gamling', 4, 0)], [placed('gimli', 3, 3), placed('haldir', 3, 0)]));
    const gimli = unitOf(fight, 'gimli', 'B');
    const riders = [unitOf(fight, 'sharku'), unitOf(fight, 'gamling')];
    const charges = ofType(fight.events, 'damage');
    // 100 physical against Armor 50.
    expect(charges.map((e) => [e.source, e.target, e.amount, e.crit, e.kind]).sort()).toEqual(
      riders.map((r) => [r.id, gimli.id, 67, false, 'trait']).sort(),
    );
    for (const rider of riders) expect(distance(rider.hex, gimli.hex)).toBe(1);
    const events = stepTo(fight, 9);
    expect(ofType(events, 'attack').filter((e) => e.tick < 9 && riders.some((r) => r.id === e.unit))).toEqual([]);
    expect(ofType(events, 'attack').filter((e) => e.tick === 9 && riders.some((r) => r.id === e.unit))).toHaveLength(2);
  });

  it('ends the fight at tick 0 if the charges wipe a team out', () => {
    // Four Riders charge for 220 each: 176 against Frodo's Armor 25, so the last one kills him.
    const riders = [placed('sharku', 1, 0), placed('gamling', 2, 0), placed('eomer', 4, 0), placed('khamul', 5, 0)];
    const fight = new Fight(input(riders, [placed('frodo', 3, 0)]));
    expect(fight.isOver()).toBe(true);
    expect(ofType(fight.events, 'damage').map((e) => e.amount)).toEqual([176, 176, 176, 176]);
    expect(ofType(fight.events, 'end')).toEqual([{ type: 'end', tick: 0, outcome: 'A' }]);
    expect(fight.result()).toMatchObject({ outcome: 'A', finalTick: 0 });
  });
});

describe('traits during the fight', () => {
  it('Elf: Elves attack faster', () => {
    const fight = new Fight(input([placed('legolas', 3, 1), placed('haldir', 2, 1)], [placed('gimli', 3, 3)]));
    for (const id of ['legolas', 'haldir']) {
      const elf = unitOf(fight, id);
      expect(elf.stats.attackSpeed).toBeCloseTo(elf.base.attackSpeed * 1.2, 10);
    }
  });

  it('Dwarf: Dwarves gain Armor and deal more damage to Large units only', () => {
    const vsLarge = firstHit(input([placed('gimli', 3, 3), placed('dain', 0, 0)], [placed('treebeard', 3, 3)]), 'gimli', 20);
    expect(vsLarge.amount).toBe(vsLarge.expected);
    const vsSmall = firstHit(input([placed('gimli', 3, 3), placed('dain', 0, 0)], [placed('beregond', 3, 3)]), 'gimli', 0);
    expect(vsSmall.amount).toBe(vsSmall.expected);
    const gimli = unitOf(new Fight(input([placed('gimli', 3, 3), placed('dain', 0, 0)], [placed('beregond', 3, 3)])), 'gimli');
    expect(gimli.stats.armor).toBe(gimli.base.armor + 30);
  });

  it('Captain: a unit next to an allied Captain deals more damage; several Captains don’t stack', () => {
    // Merry fights Gimli with Balin and Boromir, both Captains, next to him or far away.
    const nextToBoth = firstHit(
      input([placed('merry', 3, 3), placed('balin', 2, 3), placed('boromir', 4, 3)], [placed('gimli', 3, 3)]),
      'merry',
      10,
    );
    expect(nextToBoth.amount).toBe(nextToBoth.expected);
    const alone = firstHit(input([placed('merry', 3, 3), placed('balin', 0, 0), placed('boromir', 6, 0)], [placed('gimli', 3, 3)]), 'merry', 0);
    expect(alone.amount).toBe(alone.expected);
  });

  it('Dark Lord: Orc and Nazgûl allies deal more damage, others don’t', () => {
    const orc = firstHit(input([placed('grishnakh', 3, 3), placed('sauron', 0, 0)], [placed('gimli', 3, 3)]), 'grishnakh', 15);
    expect(orc.amount).toBe(orc.expected);
    const hobbit = firstHit(input([placed('merry', 3, 3), placed('sauron', 0, 0)], [placed('gimli', 3, 3)]), 'merry', 0);
    expect(hobbit.amount).toBe(hobbit.expected);
  });

  it('Sorcerer: Sorcerers gain Ability Power, which scales their abilities', () => {
    const fight = new Fight(input([placed('radagast', 3, 0), placed('elrond', 2, 0)], [placed('gimli', 3, 3)]));
    const radagast = unitOf(fight, 'radagast');
    expect(radagast.stats.abilityPower).toBe(120);
    Object.assign(radagast, { mana: radagast.base.maxMana });
    const hit = ofType(fight.step(), 'damage').find((e) => e.source === radagast.id && e.kind === 'ability')!;
    const gimli = unitOf(fight, 'gimli', 'B');
    expect(hit.amount).toBe(finalDamage(abilityValue('D', 80, 2, 1, 120), 'magic', gimli.stats, { ampPct: 0, overtimePct: 100, reductionPct: 0 }));
  });

  it('Nazgûl: enemies within 2 of a Nazgûl are slowed, without stacking, and the strongest slow wins', () => {
    const fight = new Fight(input([placed('ringwraith', 3, 3), placed('khamul', 2, 3)], [placed('gimli', 3, 3), placed('haldir', 3, 0)]));
    const [gimli, haldir] = [unitOf(fight, 'gimli', 'B'), unitOf(fight, 'haldir', 'B')];
    // Both Nazgûl are next to Gimli; Haldir is out of reach.
    expect(gimli.stats.attackSpeed).toBeCloseTo(0.6 * 0.85, 10);
    expect(haldir.stats.attackSpeed).toBe(haldir.base.attackSpeed);
    fight.applyStatus(0, gimli.id, { kind: 'slow', pct: 10, seconds: 3 });
    expect(gimli.stats.attackSpeed).toBeCloseTo(0.6 * 0.85, 10);
    fight.applyStatus(0, gimli.id, { kind: 'slow', pct: 30, seconds: 3 });
    expect(gimli.stats.attackSpeed).toBeCloseTo(0.6 * 0.7, 10);
  });

  it('Archer: each attack gives an Archer a permanent Attack Speed stack, up to 15, counted in the next cooldown', () => {
    const fight = new Fight(input([placed('pippin', 3, 1), placed('gorbag', 4, 1)], [placed('gimli', 3, 3)]));
    const [pippin, gimli] = [unitOf(fight, 'pippin'), unitOf(fight, 'gimli', 'B')];
    // Gimli stands still behind a shield that outlasts the fight, so the Archers keep shooting.
    fight.applyStatus(gimli.id, gimli.id, { kind: 'stun', seconds: 45 });
    fight.addShield(gimli.id, gimli.id, 1_000_000, 45);
    while (!fight.isOver()) fight.step();
    const stacks = ofType(fight.events, 'status').filter((e) => e.target === pippin.id);
    expect(stacks).toHaveLength(15);
    expect(stacks[0]).toEqual({
      type: 'status',
      tick: 1,
      source: pippin.id,
      target: pippin.id,
      status: 'buff',
      stat: 'attackSpeedPct',
      value: 3,
      expiresTick: null,
    });
    // 1 + 30 / (0.75 × 1.03) = 39.8, then + 30 / (0.75 × 1.06) = 77.6.
    const attacks = ofType(fight.events, 'attack').filter((e) => e.unit === pippin.id);
    expect(attacks.slice(0, 3).map((e) => e.tick)).toEqual([1, 40, 78]);
    expect(attacks.length).toBeGreaterThan(15);
    expect(pippin.stats.attackSpeed).toBeCloseTo(0.75 * 1.45, 10);
  });

  it('Rohan: when a Rohan unit falls, the other Rohan units gain Attack Speed for the rest of the fight', () => {
    const fallen = (ally: UnitId) => {
      const fight = new Fight(input([placed('hama', 3, 3), placed(ally, 0, 0)], [placed('gimli', 3, 3)]));
      Object.assign(unitOf(fight, 'hama'), { health: 1 });
      const events = stepTo(fight, 1);
      return { fight, events: events.slice(events.findIndex((e) => e.type === 'death')) };
    };
    const { fight, events } = fallen('eomer');
    const [hama, eomer] = [unitOf(fight, 'hama'), unitOf(fight, 'eomer')];
    expect(events.slice(0, 2)).toEqual([
      { type: 'death', tick: 1, unit: hama.id },
      { type: 'status', tick: 1, source: hama.id, target: eomer.id, status: 'buff', stat: 'attackSpeedPct', value: 10, expiresTick: null },
    ]);
    expect(eomer.stats.attackSpeed).toBeCloseTo(eomer.base.attackSpeed * 1.1, 10);
    // Without the trait, nothing happens.
    expect(ofType(fallen('beregond').events, 'status')).toEqual([]);
  });

  it('Istari: Istari gain mana on ticks 30, 60, 90, …, but not while casting', () => {
    const fight = new Fight(input([placed('radagast', 3, 0), placed('saruman', 4, 0)], [placed('gimli', 3, 3)]));
    const [radagast, saruman, gimli] = [unitOf(fight, 'radagast'), unitOf(fight, 'saruman'), unitOf(fight, 'gimli', 'B')];
    // Nobody can attack, so mana only comes from the trait.
    fight.applyStatus(gimli.id, gimli.id, { kind: 'stun', seconds: 45 });
    fight.applyStatus(gimli.id, gimli.id, { kind: 'untargetable', seconds: 45 });
    stepTo(fight, 29);
    expect([radagast.mana, saruman.mana]).toEqual([20, 20]);
    stepTo(fight, 30);
    expect([radagast.mana, saruman.mana]).toEqual([23, 23]);
    // Saruman casts on tick 51, at nothing, and is still casting on tick 60.
    stepTo(fight, 50);
    Object.assign(saruman, { mana: saruman.base.maxMana });
    stepTo(fight, 60);
    expect([radagast.mana, saruman.mana]).toEqual([26, 0]);
    stepTo(fight, 90);
    expect([radagast.mana, saruman.mana]).toEqual([29, 3]);
  });

  it('Ent: Treebeard heals 2% of his max Health every second, up to max Health', () => {
    const fight = new Fight(input([placed('treebeard', 3, 0)], [placed('gimli', 3, 3)]));
    const [treebeard, gimli] = [unitOf(fight, 'treebeard'), unitOf(fight, 'gimli', 'B')];
    fight.applyStatus(gimli.id, gimli.id, { kind: 'stun', seconds: 45 });
    fight.applyStatus(gimli.id, gimli.id, { kind: 'untargetable', seconds: 45 });
    Object.assign(treebeard, { health: treebeard.stats.maxHealth - 30 });
    // 2% of 1,040 is 20.8, which rounds to 21; the second heal only has 9 left to restore.
    expect(ofType(stepTo(fight, 90), 'heal').map((e) => [e.tick, e.source, e.target, e.amount])).toEqual([
      [30, treebeard.id, treebeard.id, 21],
      [60, treebeard.id, treebeard.id, 9],
    ]);
  });
});
