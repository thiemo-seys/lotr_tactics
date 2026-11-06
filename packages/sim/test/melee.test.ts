// Melee blows (docs/sim-spec.md section 9): they land 7 ticks after the attack fires, and are
// wasted if the attacker has died, or the target has died, become untargetable or left its range.
//
// Boards are in board coordinates: `b` places a team B unit by its board hex.

import { describe, expect, it } from 'vitest';
import { Fight, type PlacedUnit, type UnitState } from '../src/combat/combat.js';
import { manaFromDamage } from '../src/combat/damage.js';
import type { CombatEvent } from '../src/combat/events.js';
import type { ItemId } from '../src/data/items.js';
import type { UnitId } from '../src/data/units.js';
import { fromOffset, type Hex } from '../src/hex.js';
import type { Team } from '../src/types.js';
import { castsOf, input, ofType, placed, stepTo } from './helpers.js';

const at = (col: number, row: number): Hex => fromOffset({ col, row });
const b = (unitId: UnitId, col: number, row: number, items: readonly ItemId[] = []): PlacedUnit => placed(unitId, 6 - col, 7 - row, 1, items);

function unitOf(fight: Fight, unitId: UnitId, team: Team): UnitState {
  return fight.state.units.find((u) => u.unitId === unitId && u.team === team)!;
}

function stunUntil(fight: Fight, unit: UnitState, tick: number): void {
  fight.applyStatus(unit.id, unit.id, { kind: 'stun', seconds: (tick - fight.tick) / 30 });
}

/** Damage and dodges a unit's basic attacks caused: [tick, type, target]. */
function landed(events: readonly CombatEvent[], source: UnitState): [number, string, number][] {
  return events.flatMap((e) => {
    if (e.type === 'damage' && e.source === source.id && e.kind === 'attack') return [[e.tick, 'damage', e.target]];
    if (e.type === 'dodge' && e.source === source.id) return [[e.tick, 'dodge', e.unit]];
    return [];
  });
}

describe('melee blows', () => {
  it('land 7 ticks after the attack, with mana at the attack and the defender’s mana at the blow', () => {
    // Sam (A, id 0) and Gimli (B, id 1) side by side. Both start with 30 mana.
    const fight = new Fight(input([placed('sam', 3, 3)], [placed('gimli', 3, 3)]));
    const [sam, gimli] = fight.state.units as [UnitState, UnitState];
    const tick1 = fight.step();
    expect(ofType(tick1, 'attack')).toEqual(
      expect.arrayContaining([
        { type: 'attack', tick: 1, unit: sam.id, target: gimli.id, ranged: false, hitTick: 8 },
        { type: 'attack', tick: 1, unit: gimli.id, target: sam.id, ranged: false, hitTick: 8 },
      ]),
    );
    expect(tick1.filter((e) => e.type === 'damage' || e.type === 'dodge')).toEqual([]);
    expect([sam.mana, gimli.mana]).toEqual([40, 40]);
    const before = stepTo(fight, 7);
    expect(before.filter((e) => e.type === 'damage' || e.type === 'dodge')).toEqual([]);
    expect([sam.mana, gimli.mana]).toEqual([40, 40]);
    const tick8 = fight.step();
    const taken = (unit: UnitState) => ofType(tick8, 'damage').filter((e) => e.target === unit.id);
    expect(taken(sam)).toHaveLength(1);
    expect(taken(gimli)).toHaveLength(1);
    expect(sam.mana).toBe(40 + manaFromDamage(taken(sam)[0]!.amount));
    expect(gimli.mana).toBe(40 + manaFromDamage(taken(gimli)[0]!.amount));
  });

  it('roll dodge at the blow', () => {
    // Four Elves give each other 20% Dodge; Gimli hits Galadriel, next to him, on 1, 51, 101, …
    // The Elves are stunned, so he lives and keeps attacking.
    let dodges = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const fight = new Fight(input([placed('gimli', 3, 3)], [placed('galadriel', 3, 3), placed('legolas', 0, 0), placed('haldir', 1, 0), placed('elrond', 2, 0)], seed));
      const gimli = unitOf(fight, 'gimli', 'A');
      for (const unit of fight.state.units) if (unit !== gimli) stunUntil(fight, unit, 400);
      const events = stepTo(fight, 300);
      const attacks = ofType(events, 'attack').filter((e) => e.unit === gimli.id);
      for (const dodge of ofType(events, 'dodge').filter((e) => e.source === gimli.id)) {
        expect(attacks.some((a) => a.target === dodge.unit && a.hitTick === dodge.tick && dodge.tick === a.tick + 7)).toBe(true);
        dodges++;
      }
    }
    expect(dodges).toBeGreaterThan(0);
  });

  it('are wasted if the attacker has died, though its mana from the attack stays', () => {
    // Haldir, next to Sam, shoots him on tick 1; the arrow lands on 1 + ceil(2.5) = 4, before Sam's blow on 8.
    const fight = new Fight(input([placed('sam', 3, 3), placed('faramir', 0, 0)], [placed('haldir', 3, 3)]));
    const sam = unitOf(fight, 'sam', 'A');
    Object.assign(sam, { health: 1 });
    const events = stepTo(fight, 1);
    expect(ofType(events, 'attack').filter((e) => e.unit === sam.id)).toMatchObject([{ hitTick: 8 }]);
    expect(sam.mana).toBe(40);
    events.push(...stepTo(fight, 10));
    expect(ofType(events, 'death')).toMatchObject([{ tick: 4, unit: sam.id }]);
    expect(landed(events, sam)).toEqual([]);
  });

  it('are wasted if the target has died', () => {
    // Haldir (A) on (3, 2) is 2 from Gimli: his arrow lands on 1 + 5 = 6 and kills him, before Sam's blow on 8.
    const fight = new Fight(input([placed('sam', 3, 3), placed('haldir', 3, 2)], [b('gimli', 3, 4), b('eomer', 3, 7)]));
    const [sam, gimli] = [unitOf(fight, 'sam', 'A'), unitOf(fight, 'gimli', 'B')];
    Object.assign(gimli, { health: 1 });
    stunUntil(fight, gimli, 20);
    stunUntil(fight, unitOf(fight, 'eomer', 'B'), 20);
    const events = stepTo(fight, 10);
    expect(ofType(events, 'attack').filter((e) => e.unit === sam.id)).toMatchObject([{ tick: 1, target: gimli.id, hitTick: 8 }]);
    expect(ofType(events, 'death')).toMatchObject([{ tick: 6, unit: gimli.id }]);
    expect(landed(events, sam)).toEqual([]);
  });

  it('are wasted if the target has become untargetable', () => {
    const fight = new Fight(input([placed('sam', 3, 3)], [placed('gimli', 3, 3)]));
    const [sam, gimli] = [unitOf(fight, 'sam', 'A'), unitOf(fight, 'gimli', 'B')];
    stepTo(fight, 1);
    fight.applyStatus(gimli.id, gimli.id, { kind: 'untargetable', seconds: 1 });
    const events = stepTo(fight, 10);
    expect(landed(events, sam)).toEqual([]);
    // Gimli's own blow at Sam still lands.
    expect(landed(events, gimli)).toEqual([[8, 'damage', sam.id]]);
  });

  it('are wasted if the target has stepped out of range, and land if it is still in range', () => {
    // Beregond, untargetable, attacks Gimli next to him on tick 1. Gimli, stunned for tick 1, then
    // walks on tick 2 towards an ally of Beregond's 2 hexes off in a straight line, onto the hex
    // between them.
    const walk = (A: PlacedUnit[], B: PlacedUnit[]) => {
      const fight = new Fight(input(A, B));
      const [beregond, gimli] = [unitOf(fight, 'beregond', 'A'), unitOf(fight, 'gimli', 'B')];
      fight.applyStatus(beregond.id, beregond.id, { kind: 'untargetable', seconds: 1 });
      for (const unit of fight.state.units) if (unit !== beregond && unit !== gimli) stunUntil(fight, unit, 40);
      stunUntil(fight, gimli, 2);
      const events = stepTo(fight, 1);
      // His swing doesn't hold him (sim-spec 9), so a stun keeps him from following Gimli; the blow
      // he has swung still lands (sim-spec 12.1).
      stunUntil(fight, beregond, 40);
      events.push(...stepTo(fight, 10));
      expect(ofType(events, 'attack').filter((e) => e.unit === beregond.id)).toMatchObject([{ tick: 1, target: gimli.id, hitTick: 8 }]);
      return { events, beregond, gimli };
    };
    // Out of range: Grishnákh and the Ringwraith, Burglars, leap next to Sam on (3, 7) at tick 0, to
    // (3, 6) and (4, 6). Gimli targets the Ringwraith and steps to (3, 5), 2 from Beregond.
    const away = walk([placed('beregond', 3, 3), placed('grishnakh', 0, 0), placed('ringwraith', 6, 0)], [b('gimli', 3, 4), b('sam', 3, 7)]);
    expect(ofType(away.events, 'move').filter((e) => e.unit === away.gimli.id)).toMatchObject([{ tick: 2, to: at(3, 5) }]);
    expect(landed(away.events, away.beregond)).toEqual([]);
    // In range: Gimli targets Legolas on (2, 2) and steps to (2, 3), still next to Beregond.
    const near = walk([placed('beregond', 3, 3), placed('legolas', 2, 2)], [b('gimli', 3, 4)]);
    expect(ofType(near.events, 'move').filter((e) => e.unit === near.gimli.id)).toMatchObject([{ tick: 2, to: at(2, 3) }]);
    expect(landed(near.events, near.beregond).map(([tick, , target]) => [tick, target])).toEqual([[8, near.gimli.id]]);
  });

  it('don’t hold the attacker, which can cast before its blow lands', () => {
    // Beregond's attack on tick 1 fills his mana (80 + 10), so he casts on tick 2: release 14.
    const fight = new Fight(input([placed('beregond', 3, 3)], [b('gimli', 3, 4)]));
    const [beregond, gimli] = [unitOf(fight, 'beregond', 'A'), unitOf(fight, 'gimli', 'B')];
    stunUntil(fight, gimli, 30);
    Object.assign(beregond, { mana: 80 });
    const events = stepTo(fight, 14);
    expect(castsOf(events)).toMatchObject([{ tick: 2, unit: beregond.id, releaseTick: 14 }]);
    const hits = ofType(events, 'damage').filter((e) => e.source === beregond.id);
    expect(hits.map((e) => [e.tick, e.kind])).toEqual([
      [8, 'attack'],
      [14, 'ability'],
    ]);
  });

  it('give Palantír mana at the attack', () => {
    const fight = new Fight(input([placed('gimli', 3, 3, 1, ['palantir'])], [placed('sam', 3, 3)]));
    stepTo(fight, 1);
    // 30 to start, 10 for the attack and 5 for the Palantír; Sam's blow hasn't landed yet.
    expect(unitOf(fight, 'gimli', 'A').mana).toBe(45);
  });

  it('set off the Oakenshield at the blow', () => {
    const fight = new Fight(input([placed('gimli', 3, 3, 1, ['oakenshield'])], [placed('sam', 3, 3)]));
    const [gimli, sam] = [unitOf(fight, 'gimli', 'A'), unitOf(fight, 'sam', 'B')];
    const events = stepTo(fight, 8);
    const hit = ofType(events, 'damage').find((e) => e.source === sam.id && e.kind === 'attack')!;
    expect(hit.tick).toBe(8);
    expect(events[events.indexOf(hit) + 1]).toMatchObject({ type: 'damage', tick: 8, source: gimli.id, target: sam.id, kind: 'item' });
  });

  it('with the Bow of the Galadhrim, land in the order they fired, wasted once an Oakenshield kills the holder', () => {
    // Gimli's main blow goes to Éomer on (3, 4), first in the tie-break, and the extra one to Haldir
    // on (4, 4). Éomer's Oakenshield deals 30% back and kills Gimli, on 1 Health, so the second is wasted.
    const fight = new Fight(input([placed('gimli', 3, 3, 1, ['galadhrim-bow']), placed('faramir', 0, 0)], [b('eomer', 3, 4, ['oakenshield']), b('haldir', 4, 4)]));
    const gimli = unitOf(fight, 'gimli', 'A');
    const [eomer, haldir] = [unitOf(fight, 'eomer', 'B'), unitOf(fight, 'haldir', 'B')];
    Object.assign(gimli, { health: 1 });
    for (const unit of fight.state.units) if (unit !== gimli) stunUntil(fight, unit, 30);
    const events = stepTo(fight, 10);
    expect(ofType(events, 'attack').filter((e) => e.unit === gimli.id)).toEqual([
      { type: 'attack', tick: 1, unit: gimli.id, target: eomer.id, ranged: false, hitTick: 8 },
      { type: 'attack', tick: 1, unit: gimli.id, target: haldir.id, ranged: false, hitTick: 8 },
    ]);
    expect(ofType(events, 'death')).toMatchObject([{ tick: 8, unit: gimli.id }]);
    expect(landed(events, gimli).map(([tick, , target]) => [tick, target])).toEqual([[8, eomer.id]]);
  });
});
