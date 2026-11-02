import { MONSTERS, UNITS, type Star, type UnitId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { describeAbility } from '../src/abilities.js';

const at = (id: UnitId, star: Star = 1, abilityPower = 100) => describeAbility(UNITS[id].ability, { cost: UNITS[id].cost, star, abilityPower });

describe('ability text', () => {
  it('says what each step does to whom, with the sim’s numbers', () => {
    expect(at('sam')).toEqual(['Itself: a 150 shield for 4s.', 'The nearest ally: a 150 shield for 4s.']);
    expect(at('gimli')).toEqual(['Adjacent enemies: 270 physical damage.', 'Itself: a 225 shield for 4s.']);
    expect(at('merry')).toEqual(['Its target: 200 physical damage, −30% Armor and Magic Resist for 4s.']);
  });

  it('scales with star level and Ability Power', () => {
    expect(at('gimli', 3)[0]).toBe('Adjacent enemies: 608 physical damage.');
    expect(at('gimli', 1, 150)[0]).toBe('Adjacent enemies: 405 physical damage.');
  });

  it('describes hits, delays, summons and passives', () => {
    expect(at('gollum')).toEqual(['Its target: 120 physical damage 3 times, heals itself for 50% of the damage.']);
    expect(at('frodo')).toEqual(['Itself: untargetable for 2s.', '2s later, its target: 325 physical damage.']);
    expect(at('gothmog')[0]).toBe('Itself: summons 2 Orc grunts.');
    expect(at('gothmog')[1]).toMatch(/^Orc allies within 2 hexes, itself included: \+25% Attack Damage for 5s\.$/);
    expect(at('witch-king').at(-1)).toBe('Passive: takes 50% less damage from Gondor and Rohan units, apart from Éowyn.');
  });

  it('covers every unit and monster without gaps', () => {
    for (const id of Object.keys(UNITS) as UnitId[]) {
      for (const line of at(id)) {
        expect(line).not.toMatch(/undefined|NaN|: \.|, \./);
        expect(line).toMatch(/^[A-Z0-9].*\.$/);
      }
    }
    for (const monster of Object.values(MONSTERS)) {
      if (monster.ability !== undefined) expect(describeAbility(monster.ability, { cost: monster.cost, star: 1, abilityPower: 100 }).join('')).not.toMatch(/undefined|NaN/);
    }
  });
});
