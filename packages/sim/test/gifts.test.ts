// Gifts of Lothlórien in the fight (docs/sim-spec.md section 12.5).

import { describe, expect, it } from 'vitest';
import { Fight, type CombatInput, type UnitState } from '../src/combat/combat.js';
import { finalDamage } from '../src/combat/damage.js';
import { traitLevels } from '../src/combat/traits.js';
import { GIFTS, GIFT_IDS, GIFT_ROUNDS, type GiftId } from '../src/data/gifts.js';
import { TRAITS, type TraitId } from '../src/data/traits.js';
import type { UnitId } from '../src/data/units.js';
import type { Team } from '../src/types.js';
import { input, ofType, placed, stepTo } from './helpers.js';

function unitOf(fight: Fight, unitId: UnitId, team: Team = 'A'): UnitState {
  return fight.state.units.find((u) => u.unitId === unitId && u.team === team)!;
}

function withGifts(fightInput: CombatInput, A: readonly GiftId[], B: readonly GiftId[] = []): CombatInput {
  return { ...fightInput, gifts: { A, B } };
}

const board = [placed('gimli', 3, 3), placed('legolas', 3, 0), placed('aragorn', 2, 1)];
const enemies = [placed('sam', 3, 3)];

describe('gift data', () => {
  it('has 10 Silver, 13 Gold and 16 Mithril Gifts, offered at 2-1, 3-2 and 4-2', () => {
    const count = (tier: string) => GIFT_IDS.filter((id) => GIFTS[id].tier === tier).length;
    expect([count('silver'), count('gold'), count('mithril')]).toEqual([10, 13, 16]);
    expect(GIFT_ROUNDS).toEqual({ '2-1': 'silver', '3-2': 'gold', '4-2': 'mithril' });
  });

  it('has a crest for every trait but the unique ones, classes in Gold and origins in Mithril', () => {
    const crests = GIFT_IDS.flatMap((id) => {
      const trait = GIFTS[id].combat?.crest;
      return trait === undefined ? [] : [{ trait, tier: GIFTS[id].tier }];
    });
    const traits = (Object.keys(TRAITS) as TraitId[]).filter((t) => t !== 'ent' && t !== 'dark-lord');
    expect(crests.map((c) => c.trait).sort()).toEqual([...traits].sort());
    for (const { trait, tier } of crests) expect(tier).toBe(TRAITS[trait].kind === 'class' ? 'gold' : 'mithril');
  });

  it('gives every Gift something to do, in the fight or out of it', () => {
    for (const id of GIFT_IDS) expect(GIFTS[id].combat !== undefined || GIFTS[id].economy !== undefined).toBe(true);
  });
});

describe('gifts in the fight', () => {
  it('throws on an unknown Gift', () => {
    expect(() => new Fight(withGifts(input(board, enemies), ['nope' as GiftId]))).toThrow(/unknown Gift "nope"/);
  });

  it('change nothing without combat effects, or for the other team', () => {
    const plain = new Fight(input(board, enemies));
    const economy = new Fight(withGifts(input(board, enemies), ['bilbos-purse', 'mirror-of-galadriel', 'muster-of-rohan']));
    expect(economy.events).toEqual(plain.events);
    const other = new Fight(withGifts(input(board, enemies), [], ['beorns-honey']));
    expect(unitOf(other, 'gimli').stats).toEqual(unitOf(plain, 'gimli').stats);
  });

  it('give stats to all units, or to the front or back row only', () => {
    const fight = new Fight(withGifts(input(board, enemies), ['beorns-honey', 'shield-wall', 'high-ground', 'march-of-the-ents']));
    const [gimli, legolas, aragorn] = (['gimli', 'legolas', 'aragorn'] as const).map((id) => unitOf(fight, id));
    for (const unit of [gimli!, legolas!, aragorn!]) expect(unit.stats.maxHealth).toBe(unit.base.maxHealth + 420);
    expect(gimli!.health).toBe(gimli!.stats.maxHealth);
    // Gimli is in the front row, Legolas in the back row, Aragorn in neither.
    expect(gimli!.stats.armor).toBe(gimli!.base.armor + 30 + 20);
    expect(aragorn!.stats.armor).toBe(aragorn!.base.armor + 30);
    expect(legolas!.stats.attackDamage).toBeCloseTo((legolas!.base.attackDamage * 115) / 100);
    expect(aragorn!.stats.attackDamage).toBeCloseTo(aragorn!.base.attackDamage);
  });

  it('give starting mana, capped at max mana', () => {
    const fight = new Fight(withGifts(input([placed('gimli', 3, 3), placed('gandalf', 3, 0)], enemies), ['gandalfs-fireworks', 'wisdom-of-the-istari']));
    const gimli = unitOf(fight, 'gimli');
    const gandalf = unitOf(fight, 'gandalf');
    expect(gimli.mana).toBe(Math.min(gimli.base.startMana + 35, gimli.base.maxMana));
    expect(gandalf.mana).toBe(Math.min(gandalf.base.startMana + 35, gandalf.base.maxMana));
    expect(gandalf.stats.abilityPower).toBe(130);
    // A team can't have a Gift twice in a game, but copies stack in the sim: 30 + 70 is capped at 90.
    const twice: GiftId[] = ['gandalfs-fireworks', 'wisdom-of-the-istari', 'gandalfs-fireworks', 'wisdom-of-the-istari'];
    const sam = unitOf(new Fight(withGifts(input([placed('sam', 3, 3)], enemies), twice)), 'sam');
    expect(sam.mana).toBe(sam.base.maxMana);
  });

  it('Light of Valinor: a 200 shield for 8 seconds on each unit at tick 0', () => {
    const fight = new Fight(withGifts(input(board, enemies), ['light-of-valinor']));
    const shields = ofType(fight.events, 'shield').filter((e) => e.amount === 200);
    expect(shields.map((e) => e.target).sort()).toEqual(fight.state.units.filter((u) => u.team === 'A').map((u) => u.id).sort());
    expect(shields.every((e) => e.tick === 0 && e.expiresTick === 240 && e.source === e.target)).toBe(true);
  });

  it('Horn of Helm Hammerhand: stuns every enemy for 1.5 seconds, unless it is immune', () => {
    const fight = new Fight(
      withGifts(input(board, [placed('sam', 3, 3), placed('merry', 2, 3, 1, ['miruvor']), placed('pippin', 0, 0)]), ['horn-of-helm']),
    );
    const stuns = ofType(fight.events, 'status').filter((e) => e.status === 'stun');
    const stunned = stuns.map((e) => fight.state.units[e.target]!.unitId).sort();
    expect(stunned).toEqual(['pippin', 'sam']);
    expect(stuns.every((e) => e.expiresTick === 45 && fight.state.units[e.source]!.team === 'A')).toBe(true);
  });

  it('Hands of the King: units heal 1% of max Health every second', () => {
    const fight = new Fight(withGifts(input([placed('sam', 3, 3)], [placed('gimli', 3, 3, 2)]), ['hands-of-the-king']));
    const sam = unitOf(fight, 'sam');
    const heals = ofType(stepTo(fight, 300), 'heal').filter((e) => e.target === sam.id && e.source === sam.id && e.amount <= 7);
    expect(heals.length).toBeGreaterThan(0);
    expect(heals.every((e) => e.tick % 30 === 0 && e.amount <= Math.round(sam.stats.maxHealth / 100))).toBe(true);
  });

  it('The Last Alliance and The Fellowship: damage amps for the whole team', () => {
    // Gimli (Dwarf), Legolas (Elf) and Aragorn (Gondor) are three origins: 3 × 4% = 12%, plus 8%.
    const fight = new Fight(withGifts(input(board, [placed('beregond', 3, 3)]), ['last-alliance', 'fellowship']));
    const gimli = unitOf(fight, 'gimli');
    const hit = ofType(stepTo(fight, 1), 'damage').find((e) => e.source === gimli.id && e.kind === 'attack')!;
    const target = fight.state.units[hit.target]!;
    const raw = (gimli.stats.attackDamage * (hit.crit ? gimli.stats.critDamagePct : 100)) / 100;
    expect(hit.amount).toBe(finalDamage(raw, 'physical', target.stats, { ampPct: 20, overtimePct: 100, reductionPct: 0 }));
  });

  it('crests count one more unit towards a trait the team has, and none towards one it lacks', () => {
    expect(traitLevels(['sam'], ['guardian'])).toMatchObject({ guardian: 0 });
    expect(traitLevels(['sam', 'beregond', 'hama'], ['guardian'])).toMatchObject({ guardian: 1 });
    expect(traitLevels(['legolas'], ['guardian']).guardian).toBeUndefined();
    // Sam alone has no Guardian shield; with the crest he does.
    const shielded = (gifts: readonly GiftId[]) =>
      ofType(new Fight(withGifts(input([placed('sam', 3, 3)], enemies), gifts)).events, 'shield').some((e) => e.amount === 200);
    expect(shielded([])).toBe(false);
    expect(shielded(['guard-of-the-citadel'])).toBe(true);
  });
});
