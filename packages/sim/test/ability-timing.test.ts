// Ability wind-up and delivery (docs/sim-spec.md section 10.6), the cast and dash events' timing
// fields (section 14) and the "Ability timing" tests of section 15.
//
// Boards are given in board coordinates: team A's own coordinates are the board's, and `b` places
// a team B unit by its board hex. Axial coordinates in comments are (q, r).

import { describe, expect, it } from 'vitest';
import { Fight, simulateCombat, type CombatInput, type PlacedUnit, type UnitState } from '../src/combat/combat.js';
import { manaFromDamage } from '../src/combat/damage.js';
import type { CombatEvent } from '../src/combat/events.js';
import { toTicks } from '../src/combat/time.js';
import type { ItemId } from '../src/data/items.js';
import { MONSTERS, type MonsterId } from '../src/data/monsters.js';
import { ABILITIES, ATTACKS, MOVEMENT } from '../src/data/rules.js';
import { UNITS, type AbilityDef, type AbilityStep, type UnitId } from '../src/data/units.js';
import { distance, fromOffset, hexEquals, type Hex } from '../src/hex.js';
import type { Team } from '../src/types.js';
import { BOARDS, castsOf, dashesOf, input, mirrorMatch, ofType, placed, stepTo, type Aim, type TimedCast } from './helpers.js';

/** A hex by its board (col, row). */
const at = (col: number, row: number): Hex => fromOffset({ col, row });

/** A team B unit placed on board hex (col, row): its own (6 − col, 7 − row) (sim-spec 5). */
const b = (unitId: UnitId, col: number, row: number, items: readonly ItemId[] = []): PlacedUnit => placed(unitId, 6 - col, 7 - row, 1, items);

function unitOf(fight: Fight, unitId: UnitId, team: Team): UnitState {
  return fight.state.units.find((u) => u.unitId === unitId && u.team === team)!;
}

/** Stuns a unit so that it acts again on `tick` (its stun's expiry tick, sim-spec 12.1). */
function stunUntil(fight: Fight, unit: UnitState, tick: number): void {
  fight.applyStatus(unit.id, unit.id, { kind: 'stun', seconds: (tick - fight.tick) / 30 });
}

function fill(unit: UnitState): void {
  Object.assign(unit, { mana: unit.base.maxMana });
}

/** What a unit did on its action steps: [tick, type] of its attacks, moves and casts. */
function actions(events: readonly CombatEvent[], unit: UnitState): [number, string][] {
  return events.flatMap((e) => ((e.type === 'attack' || e.type === 'move' || e.type === 'cast') && e.unit === unit.id ? [[e.tick, e.type]] : []));
}

/** [tick, target, amount] of the ability damage a unit dealt. */
function abilityHits(events: readonly CombatEvent[], source: UnitState): [number, number, number][] {
  return ofType(events, 'damage').flatMap((e) => (e.source === source.id && e.kind === 'ability' ? [[e.tick, e.target, e.amount]] : []));
}

/** The ability's timing fields, which `AbilityDef` doesn't declare yet. */
function timingOf(ability: AbilityDef): { windupSeconds?: number; delivery?: string } {
  return ability as unknown as { windupSeconds?: number; delivery?: string };
}

type Delivery = 'strike' | 'projectile' | 'lob';

/** sim-spec 10.5: each unit's wind-up and delivery ("dash" and "charge" mark a strike). */
const UNIT_TIMING: Readonly<Record<UnitId, readonly [number, Delivery]>> = {
  sam: [0.4, 'strike'],
  merry: [0.4, 'strike'],
  pippin: [0.4, 'projectile'],
  beregond: [0.4, 'strike'],
  hama: [0.4, 'strike'],
  grishnakh: [0.35, 'strike'],
  sharku: [0.4, 'strike'],
  gorbag: [0.4, 'projectile'],
  frodo: [0.4, 'strike'],
  haldir: [0.4, 'projectile'],
  faramir: [0.4, 'projectile'],
  gamling: [0.4, 'strike'],
  balin: [0.4, 'strike'],
  lurtz: [0.4, 'projectile'],
  radagast: [0.5, 'lob'],
  ringwraith: [0.5, 'projectile'],
  bilbo: [0.4, 'strike'],
  gollum: [0.4, 'strike'],
  gimli: [0.4, 'strike'],
  boromir: [0.4, 'strike'],
  eomer: [0.4, 'strike'],
  eowyn: [0.4, 'strike'],
  ugluk: [0.4, 'strike'],
  khamul: [0.35, 'strike'],
  legolas: [0.4, 'projectile'],
  elrond: [0.5, 'strike'],
  aragorn: [0.4, 'strike'],
  theoden: [0.35, 'strike'],
  dain: [0.4, 'strike'],
  saruman: [0.5, 'lob'],
  gothmog: [0.4, 'strike'],
  gandalf: [0.6, 'strike'],
  galadriel: [0.6, 'strike'],
  'witch-king': [0.35, 'strike'],
  treebeard: [0.5, 'lob'],
  sauron: [0.5, 'strike'],
};

/** sim-spec 7.6: the monsters' wind-ups and deliveries. */
const MONSTER_TIMING: Readonly<Partial<Record<MonsterId, readonly [number, Delivery]>>> = {
  'cave-troll': [0.5, 'strike'],
  watcher: [0.5, 'strike'],
  mumak: [0.35, 'strike'],
  balrog: [0.5, 'strike'],
};

/** sim-spec 10.6: Math.round(windupSeconds × 30). */
const WINDUP_TICKS: Readonly<Record<number, number>> = { 0.35: 11, 0.4: 12, 0.5: 15, 0.6: 18 };

describe('timing data', () => {
  it('gives the tick counts of sim-spec 10.6', () => {
    const abilities = ABILITIES as unknown as Record<string, number>;
    const movement = MOVEMENT as unknown as Record<string, number>;
    const attacks = ATTACKS as unknown as Record<string, number>;
    // Wind-ups: 0.35 × 30 = 10.5 rounds up to 11; 0.4 s is 12, 0.5 s is 15 and 0.6 s is 18.
    for (const [seconds, ticks] of Object.entries(WINDUP_TICKS)) expect(toTicks(Number(seconds)), seconds).toBe(ticks);
    // Recovery 0.1 s = 3 ticks; a lob 0.75 s = 22.5, rounded up to 23; multi-hit gaps 0.1 s = 3.
    expect(toTicks(abilities.recoverySeconds!)).toBe(3);
    expect(toTicks(abilities.lobSeconds!)).toBe(23);
    expect(toTicks(abilities.multiHitSeconds!)).toBe(3);
    // Dashes, leaps and charges: 6 hexes a second, so 5 ticks a hex, and 0.1 s of recovery.
    expect(movement.dashHexesPerSecond).toBe(6);
    expect(30 / movement.dashHexesPerSecond!).toBe(5);
    expect(toTicks(movement.dashRecoverySeconds!)).toBe(3);
    // Melee blows: 0.22 × 30 = 6.6, rounded to 7.
    expect(toTicks(attacks.meleeHitSeconds!)).toBe(7);
    // Projectiles: 12 hexes a second, ceil(d × 30 / 12) ticks for d hexes.
    expect(attacks.projectileHexesPerSecond).toBe(12);
    expect([1, 2, 3, 4, 5].map((d) => Math.ceil((d * 30) / attacks.projectileHexesPerSecond!))).toEqual([3, 5, 8, 10, 13]);
  });

  it('gives every unit’s ability the wind-up and delivery of sim-spec 10.5', () => {
    for (const unit of Object.values(UNITS)) {
      const { windupSeconds, delivery } = timingOf(unit.ability);
      expect([windupSeconds, delivery], unit.id).toEqual(UNIT_TIMING[unit.id]);
      expect(WINDUP_TICKS[windupSeconds!], unit.id).toBe(toTicks(windupSeconds!));
    }
  });

  it('gives every monster’s ability the wind-up and delivery of sim-spec 7.6', () => {
    for (const monster of Object.values(MONSTERS)) {
      if (monster.ability === undefined) {
        expect(MONSTER_TIMING[monster.id], monster.id).toBeUndefined();
        continue;
      }
      const { windupSeconds, delivery } = timingOf(monster.ability);
      expect([windupSeconds, delivery], monster.id).toEqual(MONSTER_TIMING[monster.id]);
    }
  });

  it('has no lob with an enemy step chosen by a unit selector, and no projectile with a hex selector other than a line', () => {
    const enemyUnitSelectors = ['target', 'farthestEnemy', 'lowestHealthEnemy', 'highestHealthEnemy', 'nearestEnemies', 'bounce'];
    const enemyHexSelectors = ['area', 'cone', 'enemiesWithin', 'adjacentEnemies'];
    const stepsOf = (steps: readonly AbilityStep[]): { select: { kind: string } }[] =>
      steps.flatMap((s) => ('select' in s ? [s] : stepsOf(s.steps)));
    const abilities = [...Object.values(UNITS), ...Object.values(MONSTERS)].flatMap((def) =>
      def.ability === undefined ? [] : [{ id: def.id, ability: def.ability }],
    );
    for (const { id, ability } of abilities) {
      const kinds = stepsOf(ability.steps).map((s) => s.select.kind);
      const { delivery } = timingOf(ability);
      if (delivery === 'lob') expect(kinds.filter((k) => enemyUnitSelectors.includes(k)), id).toEqual([]);
      if (delivery === 'projectile') expect(kinds.filter((k) => enemyHexSelectors.includes(k)), id).toEqual([]);
    }
  });
});

describe('release and ready', () => {
  it('a strike lands at the release, and the caster acts again 3 ticks later', () => {
    // Beregond casts on tick 1: release 1 + 12 = 13, ready 13 + 3 = 16 (sim-spec 10.6).
    const fight = new Fight(input([placed('beregond', 3, 3)], [b('gimli', 3, 4)]));
    const [beregond, gimli] = [unitOf(fight, 'beregond', 'A'), unitOf(fight, 'gimli', 'B')];
    stunUntil(fight, gimli, 14);
    fill(beregond);
    const events = stepTo(fight, 16);
    expect(castsOf(events)).toMatchObject([{ tick: 1, unit: beregond.id, ability: 'Shield bash', releaseTick: 13, readyTick: 16 }]);
    const effects = events.filter((e) => (e.type === 'damage' || e.type === 'status') && e.source === beregond.id);
    expect(effects.map((e) => [e.tick, e.type])).toEqual([
      [13, 'damage'],
      [13, 'status'],
    ]);
    expect(actions(events, beregond)).toEqual([
      [1, 'cast'],
      [16, 'attack'],
    ]);
  });

  it('a projectile leaves at the release and lands ceil(d × 2.5) ticks later, d measured at the cast', () => {
    // Faramir to Radagast: axial (2, 3) to (−3, 7) is 5 hexes, so 13 + ceil(12.5) = 26. Ready on 16.
    const fight = new Fight(input([placed('faramir', 3, 3)], [b('gimli', 3, 4), b('radagast', 0, 7)]));
    const [faramir, gimli, radagast] = [unitOf(fight, 'faramir', 'A'), unitOf(fight, 'gimli', 'B'), unitOf(fight, 'radagast', 'B')];
    expect(distance(faramir.hex, radagast.hex)).toBe(5);
    stunUntil(fight, gimli, 30);
    stunUntil(fight, radagast, 30);
    fill(faramir);
    const events = stepTo(fight, 26);
    expect(castsOf(events)).toMatchObject([{ tick: 1, releaseTick: 13, readyTick: 16 }]);
    // 1.5 D at cost 2 is 375 physical, against Armor 20: 312.5, which rounds to 313.
    expect(abilityHits(events, faramir)).toEqual([[26, radagast.id, 313]]);
    expect(actions(events, faramir)).toEqual([
      [1, 'cast'],
      [16, 'attack'],
    ]);
  });

  it('a lob lands 23 ticks after the release, whatever the distance', () => {
    for (const [row, hexes] of [
      [0, 4],
      [3, 1],
    ] as const) {
      const fight = new Fight(input([placed('radagast', 3, row)], [b('gimli', 3, 4)]));
      const [radagast, gimli] = [unitOf(fight, 'radagast', 'A'), unitOf(fight, 'gimli', 'B')];
      expect(distance(radagast.hex, gimli.hex)).toBe(hexes);
      stunUntil(fight, gimli, 40);
      fill(radagast);
      const events = stepTo(fight, 39);
      // Release 1 + 15 = 16, landing 16 + 23 = 39, ready 19. 0.8 D at cost 2 is 200 magic, against Magic Resist 50.
      expect(castsOf(events)).toMatchObject([{ tick: 1, releaseTick: 16, readyTick: 19 }]);
      expect(abilityHits(events, radagast)).toEqual([[39, gimli.id, 133]]);
      expect(actions(events, radagast)).toEqual([
        [1, 'cast'],
        [19, 'attack'],
      ]);
    }
  });

  it('a dash keeps the caster on its hex through the wind-up, sets off at the release and lands its strike on arrival', () => {
    // Grishnákh dashes from (3, 3) to (3, 6), 3 hexes: he sets off on 12 and arrives on 12 + 15 = 27, ready on 30.
    const fight = new Fight(input([placed('grishnakh', 3, 3)], [b('gimli', 3, 4), b('haldir', 3, 7), b('eomer', 6, 7)]));
    const grishnakh = unitOf(fight, 'grishnakh', 'A');
    const haldir = unitOf(fight, 'haldir', 'B');
    for (const unit of fight.state.units) if (unit.team === 'B') stunUntil(fight, unit, 31);
    fill(grishnakh);
    const tick1 = fight.step();
    expect(castsOf(tick1)).toMatchObject([{ tick: 1, releaseTick: 12, readyTick: 30 }]);
    expect(dashesOf(tick1)).toEqual([{ type: 'dash', tick: 1, unit: grishnakh.id, from: at(3, 3), to: at(3, 6), departTick: 12, arriveTick: 27 }]);
    expect(grishnakh.target).toBe(haldir.id);
    const windUp = stepTo(fight, 11);
    expect(grishnakh.hex).toEqual(at(3, 3));
    const rest = stepTo(fight, 12);
    expect(grishnakh.hex).toEqual(at(3, 6));
    rest.push(...stepTo(fight, 30));
    // 1.2 D at cost 1 is 240, against Armor 20.
    expect(abilityHits([...windUp, ...rest], grishnakh)).toEqual([[27, haldir.id, 200]]);
    expect(actions([...tick1, ...windUp, ...rest], grishnakh)).toEqual([
      [1, 'cast'],
      [30, 'attack'],
    ]);
  });

  it('a charge strikes line hex i at release + 5i, past its destination too (the Théoden example)', () => {
    // Line (3, 4), (2, 5), (2, 6); Gimli on the first, Haldir on the third, so he claims (2, 5).
    // Release 12; hexes reached on 17, 22 and 27; he arrives on 22 and is ready on 27 + 3 = 30.
    const fight = new Fight(input([placed('theoden', 3, 3)], [b('gimli', 3, 4), b('haldir', 2, 6), b('radagast', 4, 5)]));
    const theoden = unitOf(fight, 'theoden', 'A');
    const [gimli, haldir] = [unitOf(fight, 'gimli', 'B'), unitOf(fight, 'haldir', 'B')];
    for (const unit of fight.state.units) if (unit.team === 'B') stunUntil(fight, unit, 28);
    fill(theoden);
    const tick1 = fight.step();
    expect(castsOf(tick1)).toMatchObject([{ tick: 1, releaseTick: 12, readyTick: 30 }]);
    expect(dashesOf(tick1)).toEqual([{ type: 'dash', tick: 1, unit: theoden.id, from: at(3, 3), to: at(2, 5), departTick: 12, arriveTick: 22 }]);
    stepTo(fight, 11);
    expect(theoden.hex).toEqual(at(3, 3));
    const events = stepTo(fight, 12);
    expect(theoden.hex).toEqual(at(2, 5));
    events.push(...stepTo(fight, 30));
    // 1.0 D at cost 4 is 350 physical: 233 against Armor 50, 292 against Armor 20.
    expect(abilityHits(events, theoden)).toEqual([
      [17, gimli.id, 233],
      [27, haldir.id, 292],
    ]);
    expect(ofType(events, 'status').filter((e) => e.source === theoden.id).map((e) => [e.tick, e.target, e.status, e.expiresTick])).toEqual([
      [17, gimli.id, 'stun', 47],
      [27, haldir.id, 'stun', 57],
    ]);
    expect(actions(events, theoden)).toEqual([[30, 'attack']]);
  });
});

describe('what a cast locks', () => {
  it('reaches an enemy that steps into a locked hex, counting a unit mid-step on its destination', () => {
    // Beregond (B) at (4, 5), axial (2, 5), walks to Gimli at axial (2, 3). The only hex next to
    // both is (4, 4), axial (2, 4): he starts that step on tick 2 and arrives on 17.
    const fight = new Fight(input([placed('gimli', 3, 3)], [b('beregond', 4, 5)]));
    const [gimli, beregond] = [unitOf(fight, 'gimli', 'A'), unitOf(fight, 'beregond', 'B')];
    stunUntil(fight, beregond, 2);
    fill(gimli);
    const events = stepTo(fight, 13);
    expect(ofType(events, 'move').filter((e) => e.unit === beregond.id)).toMatchObject([{ tick: 2, from: at(4, 5), to: at(4, 4), arriveTick: 17 }]);
    // 0.9 D at cost 3 is 270, against Armor 40: 192.86, which rounds to 193.
    expect(abilityHits(events, gimli)).toEqual([[13, beregond.id, 193]]);
  });

  it('misses an enemy that steps out of the locked hexes', () => {
    // Radagast's target is Beregond on (3, 4): Sharku on (4, 4) is as far, but comes later in the
    // tie-break. Sharku, next to Beregond, walks to Gimli on (5, 2) through (4, 3), the only hex next
    // to both, which is 2 from Beregond: out of the area once he steps, on tick 2. The lob lands on 39.
    const fight = new Fight(input([placed('radagast', 3, 0), placed('gimli', 5, 2)], [b('beregond', 3, 4), b('sharku', 4, 4)]));
    const radagast = unitOf(fight, 'radagast', 'A');
    const [beregond, sharku] = [unitOf(fight, 'beregond', 'B'), unitOf(fight, 'sharku', 'B')];
    stunUntil(fight, unitOf(fight, 'gimli', 'A'), 41);
    stunUntil(fight, beregond, 41);
    stunUntil(fight, sharku, 2);
    fill(radagast);
    const events = stepTo(fight, 39);
    expect(radagast.target).toBe(beregond.id);
    expect(ofType(events, 'move').filter((e) => e.unit === sharku.id)).toMatchObject([{ tick: 2, from: at(4, 4), to: at(4, 3) }]);
    // 200 magic against Magic Resist 40: 142.86, which rounds to 143.
    expect(abilityHits(events, radagast)).toEqual([[39, beregond.id, 143]]);
  });

  it('misses a locked target that has died by the landing', () => {
    // Legolas's arrow lands on Haldir on 1 + ceil(4 × 2.5) = 11, before Beregond's release on 13.
    const fight = new Fight(input([placed('beregond', 3, 3), placed('legolas', 3, 0)], [b('haldir', 3, 4), b('eomer', 3, 7)]));
    const beregond = unitOf(fight, 'beregond', 'A');
    const haldir = unitOf(fight, 'haldir', 'B');
    Object.assign(haldir, { health: 1 });
    stunUntil(fight, haldir, 20);
    stunUntil(fight, unitOf(fight, 'eomer', 'B'), 20);
    fill(beregond);
    const events = stepTo(fight, 13);
    expect(castsOf(events)).toMatchObject([{ aims: [{ units: [{ unit: haldir.id, landTick: 13 }] }] }]);
    expect(ofType(events, 'death')).toMatchObject([{ tick: 11, unit: haldir.id }]);
    expect(events.filter((e) => (e.type === 'damage' || e.type === 'status') && e.source === beregond.id)).toEqual([]);
  });

  it('misses a locked target that has become untargetable by the landing', () => {
    const fight = new Fight(input([placed('beregond', 3, 3)], [b('gimli', 3, 4)]));
    const [beregond, gimli] = [unitOf(fight, 'beregond', 'A'), unitOf(fight, 'gimli', 'B')];
    stunUntil(fight, gimli, 14);
    fill(beregond);
    const events = stepTo(fight, 1);
    fight.applyStatus(gimli.id, gimli.id, { kind: 'untargetable', seconds: 1 });
    events.push(...stepTo(fight, 13));
    expect(events.filter((e) => (e.type === 'damage' || e.type === 'status') && e.source === beregond.id)).toEqual([]);
  });

  /**
   * Team A's caster on (3, 3), untargetable, with Grishnákh and the Ringwraith, two Burglars, who
   * leap at tick 0 next to Sam on (3, 7): Grishnákh to (3, 6), the Ringwraith to (4, 6). Gimli, on
   * (3, 4) next to the caster, targets the Ringwraith (both are 2 away; (4, 6) is team B's own
   * (2, 1), first in its tie-break) and steps on tick 2 to (3, 5), the only hex next to both,
   * 2 from the caster.
   */
  function gimliStepsAway(caster: UnitId) {
    const fight = new Fight(input([placed(caster, 3, 3), placed('grishnakh', 0, 0), placed('ringwraith', 6, 0)], [b('gimli', 3, 4), b('sam', 3, 7)]));
    const self = unitOf(fight, caster, 'A');
    const gimli = unitOf(fight, 'gimli', 'B');
    expect(dashesOf(fight.events).map((e) => [e.unit, e.to])).toEqual([
      [unitOf(fight, 'grishnakh', 'A').id, at(3, 6)],
      [unitOf(fight, 'ringwraith', 'A').id, at(4, 6)],
    ]);
    fight.applyStatus(self.id, self.id, { kind: 'untargetable', seconds: 1 });
    stunUntil(fight, unitOf(fight, 'sam', 'B'), 40);
    stunUntil(fight, gimli, 2);
    fill(self);
    return { fight, self, gimli };
  }

  it('reaches a locked target that has stepped away, out of range', () => {
    const { fight, self: beregond, gimli } = gimliStepsAway('beregond');
    const events = stepTo(fight, 13);
    expect(ofType(events, 'move').filter((e) => e.unit === gimli.id)).toMatchObject([{ tick: 2, to: at(3, 5) }]);
    expect(distance(beregond.hex, gimli.hex)).toBe(2);
    expect(abilityHits(events, beregond)).toEqual([[13, gimli.id, 133]]);
  });

  it('times a projectile by the distance at the cast, and follows its target as it moves', () => {
    // Legolas's arrows leave on 13, 16, 19, 22 and 25, and fly the 1 hex Gimli was away at the cast:
    // 3 ticks each, though he is 2 away by then.
    const { fight, self: legolas, gimli } = gimliStepsAway('legolas');
    const events = stepTo(fight, 28);
    expect(abilityHits(events, legolas).map(([tick, target]) => [tick, target])).toEqual([16, 19, 22, 25, 28].map((tick) => [tick, gimli.id]));
  });

  it('wastes a bounce hop whose unit is missed, and the later hops still land', () => {
    // Hops at 16, 21 and 23, as in Pippin's scenario; Haldir, the second, is untargetable from tick 5.
    const fight = new Fight(input([placed('pippin', 3, 3)], [b('gimli', 3, 4), b('haldir', 3, 6), b('eomer', 3, 7), b('radagast', 6, 7)]));
    const pippin = unitOf(fight, 'pippin', 'A');
    for (const unit of fight.state.units) if (unit.team === 'B') stunUntil(fight, unit, 30);
    fill(pippin);
    const events = stepTo(fight, 5);
    const haldir = unitOf(fight, 'haldir', 'B');
    fight.applyStatus(haldir.id, haldir.id, { kind: 'untargetable', seconds: 1 });
    events.push(...stepTo(fight, 23));
    expect(abilityHits(events, pippin).map(([tick, target]) => [tick, target])).toEqual([
      [16, unitOf(fight, 'gimli', 'B').id],
      [23, unitOf(fight, 'eomer', 'B').id],
    ]);
  });

  it('misses an enemy that leaves a charge’s line before it is reached', () => {
    // Théoden, untargetable, charges through (3, 4), (2, 5), (2, 6) and claims (2, 5). Beregond, on
    // (3, 4), walks to Gimli on (2, 2) through (2, 3), off the line, on tick 2. Haldir, past the
    // destination, is rammed on 27.
    const fight = new Fight(input([placed('theoden', 3, 3), placed('gimli', 2, 2)], [b('beregond', 3, 4), b('haldir', 2, 6)]));
    const theoden = unitOf(fight, 'theoden', 'A');
    const [beregond, haldir] = [unitOf(fight, 'beregond', 'B'), unitOf(fight, 'haldir', 'B')];
    fight.applyStatus(theoden.id, theoden.id, { kind: 'untargetable', seconds: 1 });
    stunUntil(fight, unitOf(fight, 'gimli', 'A'), 40);
    stunUntil(fight, haldir, 40);
    stunUntil(fight, beregond, 2);
    fill(theoden);
    const events = stepTo(fight, 27);
    expect(dashesOf(events)).toMatchObject([{ tick: 1, to: at(2, 5), departTick: 12, arriveTick: 22 }]);
    expect(ofType(events, 'move').filter((e) => e.unit === beregond.id)).toMatchObject([{ tick: 2, from: at(3, 4), to: at(2, 3) }]);
    expect(abilityHits(events, theoden)).toEqual([[27, haldir.id, 292]]);
  });

  it('reaches only the allies locked at the cast with allAllies', () => {
    // Gothmog's grunts appear at his release, 13, after Galadriel locked her allies on tick 1;
    // her shields land at her release, 19. 0.5 S at cost 5 is 250.
    const fight = new Fight(input([placed('gothmog', 3, 3), placed('galadriel', 3, 0)], [b('eomer', 3, 7)]));
    const [gothmog, galadriel] = [unitOf(fight, 'gothmog', 'A'), unitOf(fight, 'galadriel', 'A')];
    stunUntil(fight, unitOf(fight, 'eomer', 'B'), 30);
    fill(gothmog);
    fill(galadriel);
    const events = stepTo(fight, 19);
    expect(ofType(events, 'spawn').map((e) => e.tick)).toEqual([13, 13]);
    expect(ofType(events, 'shield').filter((e) => e.source === galadriel.id).map((e) => [e.tick, e.target, e.amount])).toEqual([
      [19, gothmog.id, 250],
      [19, galadriel.id, 250],
    ]);
  });

  it('claims a dash’s destination at the cast, so no other unit steps onto it', () => {
    // Grishnákh, untargetable, dashes next to Merry on (2, 5), the enemy with the least Health: to
    // (3, 4), 1 hex away. Sharku on (3, 5) targets Gimli on (2, 3); (3, 4) is the only hex next to
    // both, but it is claimed until Grishnákh takes it on 12.
    const fight = new Fight(input([placed('grishnakh', 3, 3), placed('gimli', 2, 3)], [b('merry', 2, 5), b('sharku', 3, 5)]));
    const grishnakh = unitOf(fight, 'grishnakh', 'A');
    const [merry, sharku] = [unitOf(fight, 'merry', 'B'), unitOf(fight, 'sharku', 'B')];
    Object.assign(merry, { health: 100 });
    fight.applyStatus(grishnakh.id, grishnakh.id, { kind: 'untargetable', seconds: 1 });
    stunUntil(fight, unitOf(fight, 'gimli', 'A'), 40);
    stunUntil(fight, merry, 40);
    stunUntil(fight, sharku, 2);
    fill(grishnakh);
    const events = fight.step();
    expect(dashesOf(events)).toMatchObject([{ tick: 1, to: at(3, 4), departTick: 12, arriveTick: 17 }]);
    for (let tick = 2; tick <= 11; tick++) {
      events.push(...fight.step());
      expect(hexEquals(sharku.hex, at(3, 4)), `tick ${tick}`).toBe(false);
    }
    expect(ofType(events, 'move').filter((e) => hexEquals(e.to, at(3, 4)))).toEqual([]);
    fight.step();
    expect(grishnakh.hex).toEqual(at(3, 4));
  });
});

describe('a caster interrupted', () => {
  it('lands nothing if it dies during its wind-up: no dash, its claim freed, no Athelas, and its mana stays spent', () => {
    // As above, Grishnákh would dash to (3, 4). Beregond on (4, 4) attacks him on tick 2, and the
    // blow lands on 9, killing him. Sharku, stunned until 10, then steps onto (3, 4), free again.
    const fight = new Fight(
      input([placed('grishnakh', 3, 3, 1, ['athelas']), placed('gimli', 2, 3)], [b('merry', 2, 5), b('sharku', 3, 5), b('beregond', 4, 4)]),
    );
    const [grishnakh, gimli] = [unitOf(fight, 'grishnakh', 'A'), unitOf(fight, 'gimli', 'A')];
    const [merry, sharku, beregond] = [unitOf(fight, 'merry', 'B'), unitOf(fight, 'sharku', 'B'), unitOf(fight, 'beregond', 'B')];
    Object.assign(grishnakh, { health: 1 });
    Object.assign(gimli, { health: gimli.stats.maxHealth - 300 });
    Object.assign(merry, { health: 100 });
    stunUntil(fight, gimli, 60);
    stunUntil(fight, merry, 60);
    stunUntil(fight, sharku, 10);
    stunUntil(fight, beregond, 2);
    fill(grishnakh);
    const events = stepTo(fight, 2);
    expect(dashesOf(events)).toMatchObject([{ tick: 1, unit: grishnakh.id, to: at(3, 4), departTick: 12 }]);
    expect(ofType(events, 'attack').filter((e) => e.unit === beregond.id)).toMatchObject([{ tick: 2, target: grishnakh.id, hitTick: 9 }]);
    stunUntil(fight, beregond, 60);
    events.push(...stepTo(fight, 11));
    expect(ofType(events, 'death')).toMatchObject([{ tick: 9, unit: grishnakh.id }]);
    expect(grishnakh.mana).toBe(0);
    events.push(...stepTo(fight, 30));
    expect(ofType(events, 'move').filter((e) => e.unit === sharku.id)).toMatchObject([{ tick: 10, from: at(3, 5), to: at(3, 4) }]);
    expect(abilityHits(events, grishnakh)).toEqual([]);
    expect(ofType(events, 'heal')).toEqual([]);
  });

  it('runs no step and no delayed step if it dies during its wind-up', () => {
    // Frodo would turn untargetable on 13 and strike on 73. Beregond's blow from tick 2 kills him on 9.
    const fight = new Fight(input([placed('frodo', 3, 3), placed('sam', 0, 0)], [b('beregond', 4, 4)]));
    const frodo = unitOf(fight, 'frodo', 'A');
    Object.assign(frodo, { health: 1 });
    stunUntil(fight, unitOf(fight, 'sam', 'A'), 90);
    stunUntil(fight, unitOf(fight, 'beregond', 'B'), 2);
    fill(frodo);
    const events = stepTo(fight, 80);
    expect(ofType(events, 'death')).toMatchObject([{ tick: 9, unit: frodo.id }]);
    expect(events.filter((e) => (e.type === 'status' || e.type === 'damage') && e.source === frodo.id)).toEqual([]);
  });

  it('isn’t interrupted by a stun during its wind-up, which only holds it once it is ready', () => {
    const fight = new Fight(input([placed('beregond', 3, 3)], [b('gimli', 3, 4)]));
    const [beregond, gimli] = [unitOf(fight, 'beregond', 'A'), unitOf(fight, 'gimli', 'B')];
    stunUntil(fight, gimli, 14);
    fill(beregond);
    const events = stepTo(fight, 5);
    // Stunned on 5 until 35.
    fight.applyStatus(gimli.id, beregond.id, { kind: 'stun', seconds: 1 });
    events.push(...stepTo(fight, 40));
    expect(abilityHits(events, beregond)).toEqual([[13, gimli.id, 133]]);
    expect(ofType(events, 'status').filter((e) => e.source === beregond.id).map((e) => [e.tick, e.status, e.expiresTick])).toEqual([[13, 'stun', 43]]);
    expect(actions(events, beregond)).toEqual([
      [1, 'cast'],
      [35, 'attack'],
    ]);
  });

  it('dashes and strikes on arrival though stunned during its wind-up and its dash', () => {
    const fight = new Fight(input([placed('grishnakh', 3, 3)], [b('gimli', 3, 4), b('haldir', 3, 7), b('eomer', 6, 7)]));
    const grishnakh = unitOf(fight, 'grishnakh', 'A');
    for (const unit of fight.state.units) if (unit.team === 'B') stunUntil(fight, unit, 31);
    fill(grishnakh);
    const events = stepTo(fight, 5);
    // Stunned on 5 until 35: through the wind-up and the whole dash.
    fight.applyStatus(grishnakh.id, grishnakh.id, { kind: 'stun', seconds: 1 });
    events.push(...stepTo(fight, 12));
    expect(grishnakh.hex).toEqual(at(3, 6));
    events.push(...stepTo(fight, 35));
    expect(abilityHits(events, grishnakh)).toEqual([[27, unitOf(fight, 'haldir', 'B').id, 200]]);
    expect(actions(events, grishnakh)).toEqual([
      [1, 'cast'],
      [35, 'attack'],
    ]);
  });

  it('lands a projectile that has left after the caster dies', () => {
    // Faramir's arrow leaves on 13 and lands on 26. Gimli, stunned until 13, attacks him then, and
    // the blow kills him on 20.
    const fight = new Fight(input([placed('faramir', 3, 3), placed('sam', 0, 0)], [b('gimli', 3, 4), b('radagast', 0, 7)]));
    const faramir = unitOf(fight, 'faramir', 'A');
    Object.assign(faramir, { health: 1 });
    stunUntil(fight, unitOf(fight, 'sam', 'A'), 60);
    stunUntil(fight, unitOf(fight, 'radagast', 'B'), 60);
    stunUntil(fight, unitOf(fight, 'gimli', 'B'), 13);
    fill(faramir);
    const events = stepTo(fight, 30);
    expect(ofType(events, 'death')).toMatchObject([{ tick: 20, unit: faramir.id }]);
    expect(abilityHits(events, faramir)).toEqual([[26, unitOf(fight, 'radagast', 'B').id, 313]]);
  });

  it('lands a lob that has left after the caster dies', () => {
    // Saruman's lob leaves on 16 and lands on Éomer, the farthest enemy, on 39. Gimli's blow from
    // tick 18 kills him on 25. 1.2 D at cost 4 is 420 magic, against Magic Resist 40: 300.
    const fight = new Fight(input([placed('saruman', 3, 3), placed('sam', 0, 0)], [b('gimli', 3, 4), b('eomer', 3, 7)]));
    const saruman = unitOf(fight, 'saruman', 'A');
    Object.assign(saruman, { health: 1 });
    stunUntil(fight, unitOf(fight, 'sam', 'A'), 60);
    stunUntil(fight, unitOf(fight, 'eomer', 'B'), 60);
    stunUntil(fight, unitOf(fight, 'gimli', 'B'), 18);
    fill(saruman);
    const events = stepTo(fight, 40);
    expect(ofType(events, 'death')).toMatchObject([{ tick: 25, unit: saruman.id }]);
    expect(abilityHits(events, saruman)).toEqual([[39, unitOf(fight, 'eomer', 'B').id, 300]]);
  });

  it('lands nothing after a dash whose caster dies on the way', () => {
    // Grishnákh sets off on 12 and is on (3, 6), next to Haldir, from then. Haldir shoots him on 15;
    // the arrow lands on 18, before his arrival on 27.
    const fight = new Fight(input([placed('grishnakh', 3, 3), placed('sam', 0, 0)], [b('gimli', 3, 4), b('haldir', 3, 7), b('eomer', 6, 7)]));
    const grishnakh = unitOf(fight, 'grishnakh', 'A');
    Object.assign(grishnakh, { health: 1 });
    stunUntil(fight, unitOf(fight, 'sam', 'A'), 60);
    stunUntil(fight, unitOf(fight, 'gimli', 'B'), 40);
    stunUntil(fight, unitOf(fight, 'eomer', 'B'), 40);
    stunUntil(fight, unitOf(fight, 'haldir', 'B'), 15);
    fill(grishnakh);
    const events = stepTo(fight, 30);
    expect(ofType(events, 'death')).toMatchObject([{ tick: 18, unit: grishnakh.id }]);
    expect(abilityHits(events, grishnakh)).toEqual([]);
  });

  it('strikes no more hexes once the charger dies mid-charge', () => {
    // Théoden strikes Gimli on 17. Haldir shoots him on 20, from next to (2, 5), and the arrow kills
    // him on 23, before he reaches Haldir's hex on 27.
    const fight = new Fight(input([placed('theoden', 3, 3), placed('sam', 0, 0)], [b('gimli', 3, 4), b('haldir', 2, 6)]));
    const theoden = unitOf(fight, 'theoden', 'A');
    const gimli = unitOf(fight, 'gimli', 'B');
    Object.assign(theoden, { health: 1 });
    stunUntil(fight, unitOf(fight, 'sam', 'A'), 60);
    stunUntil(fight, gimli, 18);
    stunUntil(fight, unitOf(fight, 'haldir', 'B'), 20);
    fill(theoden);
    const events = stepTo(fight, 30);
    expect(ofType(events, 'death')).toMatchObject([{ tick: 23, unit: theoden.id }]);
    expect(abilityHits(events, theoden)).toEqual([[17, gimli.id, 233]]);
  });
});

describe('multi-hit', () => {
  it('keeps the caster busy until its last arrow has gone', () => {
    // Gorbag's arrows leave on 13, 16 and 19 and land on 16, 19 and 22; he is ready on 19 + 3 = 22.
    const fight = new Fight(input([placed('gorbag', 3, 3)], [b('gimli', 3, 4)]));
    const [gorbag, gimli] = [unitOf(fight, 'gorbag', 'A'), unitOf(fight, 'gimli', 'B')];
    stunUntil(fight, gimli, 30);
    fill(gorbag);
    const events = stepTo(fight, 22);
    expect(castsOf(events)).toMatchObject([{ tick: 1, releaseTick: 13, readyTick: 22 }]);
    expect(abilityHits(events, gorbag)).toEqual([16, 19, 22].map((tick) => [tick, gimli.id, 53]));
    expect(actions(events, gorbag)).toEqual([
      [1, 'cast'],
      [22, 'attack'],
    ]);
  });

  it('stops when the target dies', () => {
    const fight = new Fight(input([placed('gorbag', 3, 3)], [b('gimli', 3, 4), b('eomer', 3, 7)]));
    const [gorbag, gimli] = [unitOf(fight, 'gorbag', 'A'), unitOf(fight, 'gimli', 'B')];
    Object.assign(gimli, { health: 1 });
    stunUntil(fight, gimli, 30);
    stunUntil(fight, unitOf(fight, 'eomer', 'B'), 30);
    fill(gorbag);
    const events = stepTo(fight, 25);
    expect(ofType(events, 'death')).toMatchObject([{ tick: 16, unit: gimli.id }]);
    expect(abilityHits(events, gorbag)).toEqual([[16, gimli.id, 53]]);
  });

  it('loses the arrows not yet loosed when the caster dies, and lands those already loosed', () => {
    // Gimli, stunned until 7, attacks Gorbag then; the blow kills him on 14, after his first arrow
    // left on 13 and before the second would on 16.
    const fight = new Fight(input([placed('gorbag', 3, 3), placed('sam', 0, 0)], [b('gimli', 3, 4)]));
    const [gorbag, gimli] = [unitOf(fight, 'gorbag', 'A'), unitOf(fight, 'gimli', 'B')];
    Object.assign(gorbag, { health: 1 });
    stunUntil(fight, unitOf(fight, 'sam', 'A'), 60);
    stunUntil(fight, gimli, 7);
    fill(gorbag);
    const events = stepTo(fight, 30);
    expect(ofType(events, 'death')).toMatchObject([{ tick: 14, unit: gorbag.id }]);
    expect(abilityHits(events, gorbag)).toEqual([[16, gimli.id, 53]]);
  });
});

describe('delayed steps', () => {
  it('are due from the release and choose their target when they run', () => {
    // Frodo's strike is due on 13 + 60 = 73. Gimli, his target, turns untargetable on 60, so Frodo
    // chooses Haldir, whom the strike hits wherever he is: 1.3 D at cost 2 is 325, against Armor 20.
    const fight = new Fight(input([placed('frodo', 3, 3)], [b('gimli', 3, 4), b('haldir', 3, 7)]));
    const frodo = unitOf(fight, 'frodo', 'A');
    const [gimli, haldir] = [unitOf(fight, 'gimli', 'B'), unitOf(fight, 'haldir', 'B')];
    stunUntil(fight, gimli, 14);
    stunUntil(fight, haldir, 90);
    fill(frodo);
    const events = stepTo(fight, 60);
    fight.applyStatus(gimli.id, gimli.id, { kind: 'untargetable', seconds: 1 });
    events.push(...stepTo(fight, 73));
    expect(ofType(events, 'status').filter((e) => e.source === frodo.id).map((e) => [e.tick, e.status, e.expiresTick])).toEqual([
      [13, 'untargetable', 73],
    ]);
    expect(abilityHits(events, frodo)).toEqual([[73, haldir.id, 271]]);
  });
});

describe('Athelas', () => {
  it('heals at the release, after the strike’s effects', () => {
    const fight = new Fight(input([placed('beregond', 3, 3, 1, ['athelas'])], [b('gimli', 3, 4)]));
    const [beregond, gimli] = [unitOf(fight, 'beregond', 'A'), unitOf(fight, 'gimli', 'B')];
    Object.assign(beregond, { health: beregond.stats.maxHealth - 300 });
    stunUntil(fight, gimli, 14);
    fill(beregond);
    const events = stepTo(fight, 13).filter((e) => e.tick === 13 && 'source' in e && e.source === beregond.id);
    expect(events.map((e) => e.type)).toEqual(['damage', 'status', 'heal']);
    expect(events[2]).toMatchObject({ target: beregond.id, amount: 200 });
  });

  it('heals at the release, before a projectile lands', () => {
    const fight = new Fight(input([placed('faramir', 3, 3, 1, ['athelas'])], [b('gimli', 3, 4), b('radagast', 0, 7)]));
    const faramir = unitOf(fight, 'faramir', 'A');
    Object.assign(faramir, { health: faramir.stats.maxHealth - 300 });
    for (const unit of fight.state.units) if (unit.team === 'B') stunUntil(fight, unit, 30);
    fill(faramir);
    const events = stepTo(fight, 26);
    expect(ofType(events, 'heal').map((e) => [e.tick, e.source, e.target, e.amount])).toEqual([[13, faramir.id, faramir.id, 200]]);
    expect(abilityHits(events, faramir).map(([tick]) => tick)).toEqual([26]);
  });
});

describe('busy and mana', () => {
  it('gains no mana during the recovery', () => {
    // Háma casts on 1 and recovers on 13 to 15. Haldir, 3 away and stunned until 6, shoots him on 6;
    // the arrow lands on 6 + ceil(7.5) = 14.
    const fight = new Fight(input([placed('hama', 3, 3)], [b('haldir', 3, 6)]));
    const [hama, haldir] = [unitOf(fight, 'hama', 'A'), unitOf(fight, 'haldir', 'B')];
    stunUntil(fight, haldir, 6);
    fill(hama);
    const events = stepTo(fight, 15);
    const hit = ofType(events, 'damage').find((e) => e.target === hama.id)!;
    expect(hit.tick).toBe(14);
    expect(manaFromDamage(hit.amount)).toBeGreaterThan(0);
    expect(hama.mana).toBe(0);
  });

  it('gives the Istari no mana on a whole second during the recovery', () => {
    // Saruman casts on 13: release 28, ready 31. Tick 30 is in his recovery, so only Radagast gains 3.
    const fight = new Fight(input([placed('radagast', 3, 0), placed('saruman', 4, 0)], [b('gimli', 3, 4)]));
    const [radagast, saruman, gimli] = [unitOf(fight, 'radagast', 'A'), unitOf(fight, 'saruman', 'A'), unitOf(fight, 'gimli', 'B')];
    // Nobody can attack, so mana only comes from the trait.
    fight.applyStatus(gimli.id, gimli.id, { kind: 'stun', seconds: 45 });
    fight.applyStatus(gimli.id, gimli.id, { kind: 'untargetable', seconds: 45 });
    stepTo(fight, 12);
    fill(saruman);
    expect(castsOf(stepTo(fight, 13))).toMatchObject([{ tick: 13, unit: saruman.id, releaseTick: 28, readyTick: 31 }]);
    stepTo(fight, 30);
    expect([radagast.mana, saruman.mana]).toEqual([23, 0]);
    stepTo(fight, 60);
    expect([radagast.mana, saruman.mana]).toEqual([26, 3]);
  });
});

describe('worked out at the landing', () => {
  it('applies the overtime of the landing tick', () => {
    // Cast on 925 (overtime ×1.0), landing on 937 (×1.1): 200 × 1.1 = 220 physical against Armor 50, 146.67 → 147.
    const fight = new Fight(input([placed('beregond', 3, 3)], [b('gimli', 3, 4)]));
    const [beregond, gimli] = [unitOf(fight, 'beregond', 'A'), unitOf(fight, 'gimli', 'B')];
    stunUntil(fight, beregond, 925);
    stunUntil(fight, gimli, 950);
    stepTo(fight, 924);
    fill(beregond);
    const events = stepTo(fight, 937);
    expect(castsOf(events)).toMatchObject([{ tick: 925, releaseTick: 937 }]);
    expect(abilityHits(events, beregond)).toEqual([[937, gimli.id, 147]]);
  });

  it('applies the Captain amp only if a Captain stands next to the caster at the landing', () => {
    // Balin and Boromir make the Captain trait active (+10%). Balin stands next to Beregond. With
    // Haldir stunned, Balin lives: 200 × 1.1 = 220 against Armor 50, 146.67 → 147. Otherwise Haldir,
    // next to Balin, shoots him on tick 1 and kills him on 4, before the release on 13: 133.
    const strike = (balinDies: boolean) => {
      const fight = new Fight(input([placed('beregond', 3, 3), placed('balin', 2, 3), placed('boromir', 0, 0)], [b('gimli', 3, 4), b('haldir', 2, 4)]));
      const [beregond, balin, gimli, haldir] = [
        unitOf(fight, 'beregond', 'A'),
        unitOf(fight, 'balin', 'A'),
        unitOf(fight, 'gimli', 'B'),
        unitOf(fight, 'haldir', 'B'),
      ];
      stunUntil(fight, gimli, 14);
      stunUntil(fight, unitOf(fight, 'boromir', 'A'), 14);
      if (balinDies) Object.assign(balin, { health: 1 });
      else stunUntil(fight, haldir, 14);
      fill(beregond);
      const events = stepTo(fight, 13);
      expect(ofType(events, 'death').map((e) => [e.tick, e.unit])).toEqual(balinDies ? [[4, balin.id]] : []);
      return abilityHits(events, beregond).map(([tick, target, amount]) => [tick, target === gimli.id ? 'gimli' : target, amount]);
    };
    expect(strike(false)).toEqual([[13, 'gimli', 147]]);
    expect(strike(true)).toEqual([[13, 'gimli', 133]]);
  });
});

describe('cast and dash events', () => {
  /** Fills the mana of the first unit on team A and steps tick 1, with every other unit stunned. */
  function castOnTick1(A: readonly PlacedUnit[], B: readonly PlacedUnit[], prepare?: (fight: Fight) => void) {
    const fight = new Fight(input(A, B));
    const caster = unitOf(fight, A[0]!.unitId as UnitId, 'A');
    for (const unit of fight.state.units) if (unit !== caster) stunUntil(fight, unit, 60);
    prepare?.(fight);
    fill(caster);
    const cast = castsOf(fight.step())[0]!;
    expect(cast).toMatchObject({ tick: 1, unit: caster.id });
    const id = (unitId: UnitId, team: Team = 'B') => unitOf(fight, unitId, team).id;
    return { fight, cast, caster, id };
  }

  const aim = (fields: Partial<Aim> & Pick<Aim, 'step' | 'select' | 'side' | 'delivery'>): Aim => ({
    units: [],
    hexes: [],
    hits: 1,
    hitGap: 0,
    centre: null,
    ...fields,
  });
  const hexes = (landTick: number, ...offsets: [number, number][]) => offsets.map(([col, row]) => ({ hex: at(col, row), landTick }));

  it('an area lobbed at the target: its hexes by row, then column, landing together, around the target', () => {
    const { cast } = castOnTick1([placed('radagast', 3, 0)], [b('gimli', 3, 4)]);
    expect(cast.aims).toEqual([
      aim({
        step: 0,
        select: 'area',
        side: 'enemy',
        delivery: 'lob',
        hexes: hexes(39, [2, 3], [3, 3], [2, 4], [3, 4], [4, 4], [2, 5], [3, 5]),
        centre: at(3, 4),
      }),
    ]);
  });

  it('a piercing line: its hexes from the caster outwards, each landing by its distance', () => {
    const { cast } = castOnTick1([placed('lurtz', 3, 3)], [b('gimli', 3, 4)]);
    // (3, 4), (2, 5), (2, 6) and (1, 7) are 1 to 4 hexes away: 13 + 3, 5, 8 and 10.
    expect(cast.aims).toEqual([
      aim({ step: 0, select: 'line', side: 'enemy', delivery: 'projectile', hexes: [...hexes(16, [3, 4]), ...hexes(18, [2, 5]), ...hexes(21, [2, 6]), ...hexes(23, [1, 7])] }),
    ]);
  });

  it('a cone: its hexes in the order of sim-spec 10.4', () => {
    // Sauron at axial (2, 3) faces direction 4, (−1, +1), towards Gimli at (1, 4): C + D4, C + D3,
    // C + D5, then C + 2·D4, C + D4 + D3, C + D4 + D5.
    const { cast } = castOnTick1([placed('sauron', 3, 3)], [b('gimli', 3, 4)]);
    expect(cast.aims).toEqual([
      aim({ step: 0, select: 'cone', side: 'enemy', delivery: 'strike', hexes: hexes(16, [3, 4], [2, 3], [4, 4], [2, 5], [2, 4], [3, 5]) }),
    ]);
  });

  it('a bounce: its chain in hit order, each hop by the distance flown so far', () => {
    const { cast, id } = castOnTick1([placed('pippin', 3, 3)], [b('gimli', 3, 4), b('haldir', 3, 6), b('eomer', 3, 7), b('radagast', 6, 7)]);
    expect(cast.aims).toEqual([
      aim({
        step: 0,
        select: 'bounce',
        side: 'enemy',
        delivery: 'projectile',
        units: [
          { unit: id('gimli'), landTick: 16 },
          { unit: id('haldir'), landTick: 21 },
          { unit: id('eomer'), landTick: 23 },
        ],
      }),
    ]);
  });

  it('the nearest enemies: nearest first, each arrow by its distance', () => {
    const { cast, id } = castOnTick1([placed('haldir', 3, 3)], [b('gimli', 3, 4), b('eomer', 2, 5), b('radagast', 2, 6), b('boromir', 6, 7)]);
    expect(cast.aims).toEqual([
      aim({
        step: 0,
        select: 'nearestEnemies',
        side: 'enemy',
        delivery: 'projectile',
        units: [
          { unit: id('gimli'), landTick: 16 },
          { unit: id('eomer'), landTick: 18 },
          { unit: id('radagast'), landTick: 21 },
        ],
      }),
    ]);
  });

  it('allies: struck at the release, lowest Health % first', () => {
    const { cast, id } = castOnTick1(
      [placed('elrond', 3, 0), placed('gimli', 3, 3), placed('eomer', 2, 3), placed('merry', 1, 3)],
      [b('boromir', 6, 7)],
      (fight) => {
        Object.assign(unitOf(fight, 'gimli', 'A'), { health: 422 });
        Object.assign(unitOf(fight, 'eomer', 'A'), { health: 546 });
      },
    );
    expect(cast.aims).toEqual([
      aim({
        step: 0,
        select: 'lowestHealthPctAllies',
        side: 'ally',
        delivery: 'strike',
        units: [
          { unit: id('gimli', 'A'), landTick: 16 },
          { unit: id('eomer', 'A'), landTick: 16 },
        ],
      }),
    ]);
  });

  it('adjacent enemies around the caster, then the caster itself', () => {
    const { cast, caster } = castOnTick1([placed('gimli', 3, 3)], [b('eomer', 3, 4)]);
    expect(cast.aims).toEqual([
      aim({ step: 0, select: 'adjacentEnemies', side: 'enemy', delivery: 'strike', hexes: hexes(13, [3, 2], [4, 2], [2, 3], [4, 3], [3, 4], [4, 4]), centre: at(3, 3) }),
      aim({ step: 1, select: 'self', side: 'ally', delivery: 'strike', units: [{ unit: caster.id, landTick: 13 }] }),
    ]);
  });

  it('several hits: the first landing, and the gap between hits', () => {
    const { cast, id } = castOnTick1([placed('gorbag', 3, 3)], [b('gimli', 3, 4)]);
    expect(cast.aims).toEqual([
      aim({ step: 0, select: 'target', side: 'enemy', delivery: 'projectile', units: [{ unit: id('gimli'), landTick: 16 }], hits: 3, hitGap: 3 }),
    ]);
  });

  it('a charge: its hexes from the caster outwards, each reached 5 ticks after the last', () => {
    const { cast } = castOnTick1([placed('theoden', 3, 3)], [b('gimli', 3, 4), b('haldir', 2, 6), b('radagast', 4, 5)]);
    expect(cast.aims).toEqual([aim({ step: 0, select: 'line', side: 'enemy', delivery: 'charge', hexes: [...hexes(17, [3, 4]), ...hexes(22, [2, 5]), ...hexes(27, [2, 6])] })]);
  });

  it('a dash, then the hexes round its destination, landing on arrival', () => {
    const { cast, id } = castOnTick1([placed('witch-king', 3, 3)], [b('haldir', 3, 4), b('gimli', 3, 7), b('eomer', 4, 6)]);
    expect(cast.aims).toEqual([
      aim({ step: 0, select: 'highestHealthEnemy', side: 'enemy', delivery: 'dash', units: [{ unit: id('gimli'), landTick: 27 }] }),
      aim({
        step: 1,
        select: 'adjacentEnemies',
        side: 'enemy',
        delivery: 'strike',
        hexes: hexes(27, [2, 5], [3, 5], [2, 6], [4, 6], [2, 7], [3, 7]),
        centre: at(3, 6),
      }),
    ]);
  });

  it('a dash to a unit, landing on arrival', () => {
    const { cast, id } = castOnTick1([placed('grishnakh', 3, 3)], [b('gimli', 3, 4), b('haldir', 3, 7), b('eomer', 6, 7)]);
    expect(cast.aims).toEqual([aim({ step: 0, select: 'lowestHealthEnemy', side: 'enemy', delivery: 'dash', units: [{ unit: id('haldir'), landTick: 27 }] })]);
  });

  it('leaves delayed steps out of the aims', () => {
    const { cast, caster } = castOnTick1([placed('frodo', 3, 3)], [b('gimli', 3, 4)]);
    expect(cast).toMatchObject({ releaseTick: 13, readyTick: 16 });
    expect(cast.aims).toEqual([aim({ step: 0, select: 'self', side: 'ally', delivery: 'strike', units: [{ unit: caster.id, landTick: 13 }] })]);
  });
});

/** Whole fights without items or Gifts: their cast and dash events match what then happens (sim-spec 15, Ability timing). */
describe('whole fights', () => {
  const FIGHTS: CombatInput[] = [
    ...[1, 2, 3].map((seed) => mirrorMatch(BOARDS.full, seed)),
    ...[1, 2, 3].map((seed) => input(BOARDS.traits, BOARDS.full, seed)),
    ...[1, 2].map((seed) => mirrorMatch(BOARDS.archers, seed)),
    ...[1, 2].map((seed) => mirrorMatch(BOARDS.mixed, seed)),
  ];

  /** Where each unit stands when the queue resolves on each tick, from its spawn, moves (from the tick after) and dashes (on their departTick). */
  function positions(events: readonly CombatEvent[]): (unit: number, tick: number) => Hex | undefined {
    const changes = new Map<number, { tick: number; hex: Hex }[]>();
    const add = (unit: number, tick: number, hex: Hex) => {
      const list = changes.get(unit) ?? [];
      list.push({ tick, hex });
      changes.set(unit, list);
    };
    for (const e of events) {
      if (e.type === 'spawn') add(e.unit, e.tick, e.hex);
      // A step starts in the units' action step, after the queue's landings that tick (sim-spec 6.4).
      if (e.type === 'move') add(e.unit, e.tick + 1, e.to);
    }
    for (const e of dashesOf(events)) add(e.unit, e.departTick, e.to);
    for (const list of changes.values()) list.sort((x, y) => x.tick - y.tick);
    return (unit, tick) => changes.get(unit)?.filter((c) => c.tick <= tick).at(-1)?.hex;
  }

  /** Whether an aim reaches `target` on `tick`, standing on `hex`. */
  function reaches(aim: Aim, target: number, tick: number, hex: Hex | undefined): boolean {
    const byUnit = aim.units.some((u) => u.unit === target && tick >= u.landTick && (tick - u.landTick) % Math.max(aim.hitGap, 1) === 0 && (tick - u.landTick) / Math.max(aim.hitGap, 1) < aim.hits);
    const byHex = hex !== undefined && aim.hexes.some((h) => h.landTick === tick && hexEquals(h.hex, hex));
    return byUnit || byHex;
  }

  it('times every cast by its wind-up, and holds the caster until it is ready', () => {
    let casts = 0;
    for (const fight of FIGHTS) {
      const { events } = simulateCombat(fight);
      const unitIds = new Map(ofType(events, 'spawn').map((e) => [e.unit, e.unitId]));
      for (const cast of castsOf(events)) {
        casts++;
        const [seconds] = UNIT_TIMING[unitIds.get(cast.unit) as UnitId];
        expect(cast.releaseTick - cast.tick).toBe(WINDUP_TICKS[seconds]);
        expect(cast.readyTick).toBeGreaterThanOrEqual(cast.releaseTick + 3);
        const acted = events.filter((e) => (e.type === 'attack' || e.type === 'move' || e.type === 'cast') && e.unit === cast.unit && e.tick > cast.tick && e.tick < cast.readyTick);
        expect(acted).toEqual([]);
      }
    }
    expect(casts).toBeGreaterThan(20);
  });

  it('sets dashes off on the release and lands them 5 ticks a hex later', () => {
    for (const fight of FIGHTS) {
      const { events } = simulateCombat(fight);
      for (const dash of dashesOf(events)) {
        expect(dash.arriveTick - dash.departTick).toBe(5 * distance(dash.from, dash.to));
        if (dash.tick === 0) expect(dash.departTick).toBe(0);
        else expect(castsOf(events).find((c) => c.tick === dash.tick && c.unit === dash.unit)?.releaseTick).toBe(dash.departTick);
      }
    }
  });

  it('lands every damage, heal, shield and status from a cast on a landTick of its aims', () => {
    let checked = 0;
    for (const fight of FIGHTS) {
      const { events } = simulateCombat(fight);
      const hexAt = positions(events);
      const casts = castsOf(events);
      for (const e of events) {
        if (e.tick === 0) continue;
        const fromCast =
          (e.type === 'damage' && e.kind === 'ability') || e.type === 'heal' || e.type === 'shield' || (e.type === 'status' && e.expiresTick !== null);
        if (!fromCast) continue;
        const { source, target } = e as { source: number; target: number };
        const found = casts.some((c) => c.unit === source && c.tick < e.tick && c.aims.some((a) => reaches(a, target, e.tick, hexAt(target, e.tick))));
        expect(found, `${e.type} on tick ${e.tick} from ${source} to ${target}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('gives the same events, timing fields included, for the same input', () => {
    for (const fight of FIGHTS.slice(0, 4)) {
      const first = simulateCombat(fight).events;
      expect(simulateCombat(fight).events).toEqual(first);
      const casts: TimedCast[] = castsOf(first);
      expect(casts.length).toBeGreaterThan(0);
      for (const cast of casts) expect([typeof cast.releaseTick, typeof cast.readyTick, Array.isArray(cast.aims)]).toEqual(['number', 'number', true]);
    }
  });
});
