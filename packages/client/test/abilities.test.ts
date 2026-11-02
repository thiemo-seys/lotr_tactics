import { MONSTERS, UNITS, type Star, type UnitId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { describeAbility } from '../src/abilities.js';

const at = (id: UnitId, star: Star = 1, abilityPower = 100) => describeAbility(UNITS[id].ability, { cost: UNITS[id].cost, star, abilityPower, origin: UNITS[id].origin });

describe('ability text', () => {
  it('says what each step does to whom, with the sim’s numbers', () => {
    expect(at('beregond')).toEqual(['Deals 200 physical damage to its target and stuns it for 1s.']);
    expect(at('gimli')).toEqual(['Deals 270 physical damage to adjacent enemies.', 'Gains a 225 shield for 4s.']);
    expect(at('merry')).toEqual(['Deals 200 physical damage to its target and lowers its Armor and Magic Resist by 30% for 4s.']);
    expect(at('elrond')).toEqual(['Heals the 2 most wounded allies for 350 and gives them +30 Magic Resist for 4s.']);
    expect(at('radagast')).toEqual(['Deals 200 magic damage to its target and enemies next to it, and slows their Attack Speed by 25% for 3s.']);
  });

  it('scales with star level and Ability Power', () => {
    expect(at('gimli', 3)[0]).toBe('Deals 608 physical damage to adjacent enemies.');
    expect(at('gimli', 1, 150)[0]).toBe('Deals 405 physical damage to adjacent enemies.');
  });

  it('says once what several steps or effects share', () => {
    // Two steps with the same shield, a shared duration, and two buffs of one size.
    expect(at('sam')).toEqual(['Gives itself and the nearest ally a 150 shield for 4s.']);
    expect(at('ugluk')).toEqual(["Gains a 375 shield and can't be stunned for 4s."]);
    expect(at('hama')).toEqual(['Gains a 200 shield for 4s and +30 Armor for 5s.']);
    expect(at('boromir')[0]).toBe('Gives itself and allies within 2 hexes +25 Armor and Magic Resist for 5s.');
  });

  it('leads with a dash', () => {
    expect(at('grishnakh')).toEqual(['Dashes to the enemy with the least Health and deals 240 physical damage to it.']);
    expect(at('khamul')).toEqual(['Dashes along a 3-hex line, dealing 270 magic damage to enemies on it and slowing their Attack Speed by 25% for 3s.']);
    expect(at('witch-king')[0]).toBe('Dashes to the enemy with the most Health, then deals 400 magic damage to adjacent enemies and slows their Attack Speed by 30% for 3s.');
  });

  it('describes hits, bounces, delays, summons and passives', () => {
    expect(at('gollum')).toEqual(['Hits its target 3 times for 120 physical damage each and heals itself for 50% of the damage dealt.']);
    expect(at('legolas')).toEqual(['Hits its target 5 times for 105 physical damage each (can crit).']);
    expect(at('pippin')).toEqual(['Deals 140 physical damage to its target, bouncing to up to 2 more enemies.']);
    expect(at('eowyn')[1]).toBe('Deals 360 physical damage to its target (double against Nazgûl).');
    expect(at('frodo')).toEqual(['Becomes untargetable for 2s, then deals 325 physical damage to its target.']);
    expect(at('treebeard')).toEqual(['Deals 400 physical damage to the biggest group of enemies (1-hex radius) and stuns them for 1.5s.']);
    expect(at('gothmog')).toEqual(['Summons 2 Orc grunts.', 'Gives itself and Orc allies within 2 hexes +25% Attack Damage for 5s.']);
    expect(at('witch-king').at(-1)).toBe('Passive: takes 50% less damage from Gondor and Rohan units, except Éowyn.');
  });

  it('only counts the caster among allies of an origin if it has that origin', () => {
    const gothmog = UNITS.gothmog;
    const lines = describeAbility(gothmog.ability, { cost: gothmog.cost, star: 1, abilityPower: 100 });
    expect(lines[1]).toBe('Gives Orc allies within 2 hexes +25% Attack Damage for 5s.');
  });

  it('covers every unit and monster without gaps', () => {
    for (const id of Object.keys(UNITS) as UnitId[]) {
      for (const line of at(id)) {
        expect(line).not.toMatch(/undefined|NaN|: \.|, \.| {2}| and and /);
        expect(line).toMatch(/^[A-Z0-9].*\.$/);
      }
    }
    for (const monster of Object.values(MONSTERS)) {
      if (monster.ability !== undefined) expect(describeAbility(monster.ability, { cost: monster.cost, star: 1, abilityPower: 100 }).join('')).not.toMatch(/undefined|NaN/);
    }
  });
});
