// Ability timing cases the spec's own tests don't cover (docs/sim-spec.md sections 10.6 and 12.3).
// Boards are in board coordinates: `b` places a team B unit by its board hex.

import { describe, expect, it } from 'vitest';
import { Fight, type PlacedUnit, type UnitState } from '../src/combat/combat.js';
import type { UnitId } from '../src/data/units.js';
import { castsOf, dashesOf, input, ofType, placed, stepTo } from './helpers.js';
import type { Team } from '../src/types.js';

const b = (unitId: UnitId, col: number, row: number): PlacedUnit => placed(unitId, 6 - col, 7 - row);

function unitOf(fight: Fight, unitId: UnitId, team: Team): UnitState {
  return fight.state.units.find((u) => u.unitId === unitId && u.team === team)!;
}

function stunUntil(fight: Fight, unit: UnitState, tick: number): void {
  fight.applyStatus(unit.id, unit.id, { kind: 'stun', seconds: (tick - fight.tick) / 30 });
}

describe('wind-up and delivery', () => {
  it('lands a dash at the release when the caster is already next to the unit, with no dash event', () => {
    // Merry, on 100 Health, is next to Grishnákh: he stays put, strikes at 1 + 11 = 12 and is ready on 15.
    const fight = new Fight(input([placed('grishnakh', 3, 3)], [b('merry', 3, 4), b('gimli', 3, 7)]));
    const [grishnakh, merry] = [unitOf(fight, 'grishnakh', 'A'), unitOf(fight, 'merry', 'B')];
    Object.assign(merry, { health: 100 });
    for (const unit of fight.state.units) if (unit.team === 'B') stunUntil(fight, unit, 20);
    Object.assign(grishnakh, { mana: grishnakh.base.maxMana });
    const events = stepTo(fight, 15);
    expect(castsOf(events)).toMatchObject([{ tick: 1, releaseTick: 12, readyTick: 15, aims: [{ delivery: 'dash', units: [{ unit: merry.id, landTick: 12 }] }] }]);
    expect(dashesOf(events)).toEqual([]);
    expect(ofType(events, 'damage').filter((e) => e.source === grishnakh.id).map((e) => [e.tick, e.target])).toEqual([[12, merry.id]]);
  });

  it('does nothing more to a target with a multi-hit step once a hit has missed it', () => {
    // Gorbag's arrows land on 16, 19 and 22. Gimli is untargetable on ticks 18 and 19 only, so the
    // arrow on 19 misses him, and the one on 22 does nothing though he can be targeted again.
    const fight = new Fight(input([placed('gorbag', 3, 3)], [b('gimli', 3, 4)]));
    const [gorbag, gimli] = [unitOf(fight, 'gorbag', 'A'), unitOf(fight, 'gimli', 'B')];
    stunUntil(fight, gimli, 40);
    Object.assign(gorbag, { mana: gorbag.base.maxMana });
    const events = stepTo(fight, 17);
    // Applied after tick 17, it expires at the start of tick 20 (sim-spec 12.1).
    fight.applyStatus(gimli.id, gimli.id, { kind: 'untargetable', seconds: 3 / 30 });
    events.push(...stepTo(fight, 22));
    expect(gimli.statuses.has('untargetable')).toBe(false);
    expect(ofType(events, 'damage').filter((e) => e.source === gorbag.id).map((e) => e.tick)).toEqual([16]);
  });

  it('holds an ability’s summons until the tick after the release', () => {
    const fight = new Fight(input([placed('gothmog', 3, 3)], [b('eomer', 3, 7)]));
    const gothmog = unitOf(fight, 'gothmog', 'A');
    stunUntil(fight, unitOf(fight, 'eomer', 'B'), 40);
    Object.assign(gothmog, { mana: gothmog.base.maxMana });
    const events = stepTo(fight, 14);
    const grunts = ofType(events, 'spawn').map((e) => e.unit);
    expect(ofType(events, 'spawn').map((e) => e.tick)).toEqual([13, 13]);
    const acted = (tick: number) => events.filter((e) => (e.type === 'move' || e.type === 'attack') && e.tick === tick && grunts.includes(e.unit));
    expect(acted(13)).toEqual([]);
    expect(acted(14)).toHaveLength(2);
  });
});

describe('Rider charges', () => {
  it('deal no damage from a Rider that dies before it arrives', () => {
    // Sharku and Gamling charge next to Gimli and arrive on 15 (as in the traits tests).
    const fight = new Fight(input([placed('sharku', 2, 0), placed('gamling', 4, 0)], [placed('gimli', 3, 3), placed('haldir', 3, 0)]));
    const [sharku, gamling] = [unitOf(fight, 'sharku', 'A'), unitOf(fight, 'gamling', 'A')];
    // Nothing can reach Sharku on the way, so stand in for a death.
    Object.assign(sharku, { alive: false });
    const charges = ofType(stepTo(fight, 15), 'damage').filter((e) => e.kind === 'trait');
    expect(charges.map((e) => [e.tick, e.source])).toEqual([[15, gamling.id]]);
  });
});
