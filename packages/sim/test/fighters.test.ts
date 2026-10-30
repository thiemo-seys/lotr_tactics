// Units as they start a fight (docs/sim-spec.md sections 6.2, 7 and 12), without running one.

import { describe, expect, it } from 'vitest';
import type { PlacedUnit } from '../src/combat/combat.js';
import { createSummon, createUnit, effectsOf, giftAmpPct, originsOf, teamSetup, type Unit } from '../src/combat/fighters.js';
import { finalStats, gruntStats } from '../src/combat/stats.js';
import { toTicks } from '../src/combat/time.js';
import { GIFTS, type GiftId } from '../src/data/gifts.js';
import { RING } from '../src/data/ring.js';
import { fromPlacement } from '../src/hex.js';
import type { Team } from '../src/types.js';
import { placed } from './helpers.js';

let nextId = 0;

/** A unit as its team's placements and Gifts make it. */
function unit(p: PlacedUnit, options: { placements?: readonly PlacedUnit[]; gifts?: GiftId[]; team?: Team } = {}): Unit {
  const placements = options.placements ?? [p];
  const setup = teamSetup(placements, options.gifts ?? []);
  return createUnit(p, { id: nextId++, team: options.team ?? 'A', slot: 0, stage: 2, setup, placements });
}

describe('starting units', () => {
  it("take Burden off the One Ring's bearer and make it betray, by its Corruption less Sam's relief", () => {
    const plain = unit(placed('aragorn', 3, 3));
    for (const corruption of [0, 3, 4, 6, 8, 9]) {
      for (const sam of [false, true]) {
        const bearer = { ...placed('aragorn', 3, 3), ring: corruption };
        const u = unit(bearer, { placements: [bearer, ...(sam ? [placed('sam', 2, 3)] : [])] });
        const drawback = corruption - (sam ? RING.samRelief : 0);
        const lostPct = drawback < RING.burden.from ? 0 : RING.burden.healthPctPerPoint * (drawback - RING.burden.from + 1);
        expect(u.drawback).toBe(drawback);
        expect(u.stats.maxHealth).toBe(plain.stats.maxHealth - Math.round((plain.stats.maxHealth * lostPct) / 100));
        expect(u.health).toBe(u.stats.maxHealth);
        expect(u.betrayUntil).toBe(drawback >= RING.betrayal.at ? 1 + toTicks(RING.betrayal.seconds) : 0);
      }
    }
  });

  it('take Gift stats by row, and Gift mana up to max mana', () => {
    const front = placed('gimli', 3, 3);
    const back = placed('legolas', 3, 0);
    const placements = [front, back];
    const gifts: GiftId[] = ['shield-wall', 'high-ground', 'gandalfs-fireworks'];
    const [gimli, legolas] = [front, back].map((p) => unit(p, { placements, gifts }));
    const [plainGimli, plainLegolas] = [front, back].map((p) => unit(p, { placements }));
    expect(gimli!.stats.armor).toBe(plainGimli!.stats.armor + GIFTS['shield-wall'].combat!.stats!.armor!);
    expect(gimli!.stats.attackDamage).toBe(plainGimli!.stats.attackDamage);
    expect(legolas!.stats.armor).toBe(plainLegolas!.stats.armor);
    expect(legolas!.stats.attackDamage).toBeCloseTo((plainLegolas!.base.attackDamage * 115) / 100);
    for (const u of [gimli!, legolas!]) expect(u.mana).toBe(u.base.startMana + GIFTS['gandalfs-fireworks'].combat!.startMana!);
    // More Gift mana than the unit can hold fills it to its max mana.
    const setup = { ...teamSetup(placements, []), giftMana: 1000 };
    const full = createUnit(front, { id: nextId++, team: 'A', slot: 0, stage: 2, setup, placements });
    expect(full.mana).toBe(full.base.maxMana);
  });

  it('count a Ring of the Nine as Nazgûl, and crests only for traits the team has', () => {
    const wraiths = [placed('ringwraith', 3, 2), placed('boromir', 3, 3, 1, ['ring-of-the-nine'])];
    expect(teamSetup(wraiths, []).traits.nazgul).toBe(0);
    expect(teamSetup([...wraiths, placed('theoden', 4, 3, 1, ['ring-of-the-nine'])], []).traits.nazgul).toBe(1);
    expect(teamSetup(wraiths, ['captains-horn']).traits.captain).toBe(0);
    expect(teamSetup([placed('legolas', 3, 0)], ['captains-horn']).traits.captain).toBeUndefined();
    const boromir = unit(wraiths[1]!, { placements: wraiths });
    expect([boromir.wraith, originsOf(boromir)]).toEqual([true, ['gondor', 'nazgul']]);
  });

  it("give the Fellowship's amp for each distinct origin, the Nine's Nazgûl included", () => {
    const placements = [placed('boromir', 3, 3, 1, ['ring-of-the-nine']), placed('faramir', 2, 3), placed('legolas', 3, 0)];
    const units = placements.map((p) => unit(p, { placements }));
    const fellowship = GIFTS.fellowship.combat!;
    // Gondor, Nazgûl and Elf.
    expect(giftAmpPct([fellowship], units)).toBe(3 * fellowship.damageAmpPctPerOrigin!);
    expect(giftAmpPct([fellowship, GIFTS['last-alliance'].combat!], units)).toBe(3 * fellowship.damageAmpPctPerOrigin! + GIFTS['last-alliance'].combat!.damageAmpPct!);
  });

  it('list item effects of a kind in the order they are held, with a ring’s kin bonus', () => {
    const elrond = unit(placed('elrond', 3, 0, 1, ['vilya', 'orcrist', 'herugrim']));
    const lowHealth = effectsOf(elrond, 'lowHealth');
    expect(lowHealth).toEqual([elrond.effects[1], elrond.effects[2]]);
    expect(lowHealth[0]).toBe(elrond.effects[1]);
    expect(effectsOf(elrond, 'healPulse')[0]!.pct).toBe(150);
    expect(effectsOf(unit(placed('gimli', 3, 3, 1, ['vilya'])), 'healPulse')[0]!.pct).toBe(100);
    expect(effectsOf(elrond, 'reflect')).toEqual([]);
  });
});

describe('summons', () => {
  it('have their base stats, a slot, and no items, ability or bonuses', () => {
    const hex = fromPlacement('B', { col: 3, row: 3 });
    const grunt = createSummon(7, 'B', 4, 'orc-grunt', hex, gruntStats(3));
    expect(grunt).toMatchObject({ id: 7, team: 'B', slot: 4, hex, summon: true, origin: 'orc', star: 1, ability: null, items: [], effects: [] });
    expect(grunt.stats).toEqual(finalStats(gruntStats(3), {}));
    expect(grunt.health).toBe(grunt.stats.maxHealth);
  });
});
