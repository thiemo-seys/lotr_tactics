import { MONSTERS, UNITS, baseStats, monsterStats, type MonsterId, type OwnedUnit, type UnitId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { abilityLines, baseNumbers, boardPlacements, ownedNumbers, traitNames, unitInfo } from '../src/info.js';

let nextId = 0;
const owned = (unitId: UnitId, items: OwnedUnit['items'] = [], star: OwnedUnit['star'] = 1): OwnedUnit => ({ id: nextId++, unitId, star, items });

const lines = (id: UnitId, star: 1 | 2 | 3 = 1, abilityPower = 100) => abilityLines(UNITS[id].ability, UNITS[id].cost, star, abilityPower);

describe('ability text', () => {
  it('describes every ability of every unit and monster from its data', () => {
    const all = [
      ...(Object.keys(UNITS) as UnitId[]).map((id) => lines(id)),
      ...(Object.keys(MONSTERS) as MonsterId[]).flatMap((id) => {
        const { ability, cost } = MONSTERS[id];
        return ability === undefined ? [] : [abilityLines(ability, cost, 1, 100)];
      }),
    ];
    for (const sentences of all) {
      expect(sentences.length).toBeGreaterThan(0);
      for (const s of sentences) {
        expect(s).not.toMatch(/undefined|NaN/);
        expect(s).toMatch(/^[A-Z].*\.$/);
      }
    }
  });

  it('reads naturally for each kind of step', () => {
    expect(lines('sam')).toEqual(['Gains a 150 shield for 4s.', 'Gives the nearest ally a 150 shield for 4s.']);
    expect(lines('merry')).toEqual(['Deals 200 physical damage to its target and lowers its Armor and Magic Resist by 30% for 4s.']);
    expect(lines('hama')).toEqual(['Gains a 200 shield for 4s and +30 Armor for 5s.']);
    expect(lines('grishnakh')).toEqual(['Dashes next to the enemy with the lowest Health and deals 240 physical damage to it.']);
    expect(lines('frodo')).toEqual(['Becomes untargetable for 2s.', 'After 2s, deals 325 physical damage to its target.']);
    expect(lines('boromir')[0]).toBe('Gives allies within 2 hexes +25 Armor and +25 Magic Resist for 5s.');
    expect(lines('khamul')).toEqual([
      'Deals 270 magic damage to every enemy in a 3-hex line through its target, makes them attack 25% slower for 3s, and rides through the line.',
    ]);
    expect(lines('eowyn')[1]).toBe('Deals 360 physical damage to its target, double against Nazgûl.');
    expect(lines('legolas')).toEqual(['Deals 5 × 105 physical damage to its target; each hit can crit.']);
    expect(lines('gothmog')[0]).toBe('Summons 2 Orc grunts.');
    expect(lines('witch-king').at(-1)).toBe('Passive: takes 50% less damage from Gondor and Rohan units, except Éowyn.');
  });

  it('gives values at the unit’s star and Ability Power', () => {
    expect(lines('beregond', 1)[0]).toContain('200 physical damage');
    expect(lines('beregond', 2)[0]).toContain('300 physical damage');
    expect(lines('beregond', 1, 150)[0]).toContain('300 physical damage');
  });
});

describe('unit info', () => {
  it('shows a shop unit with its base stats at its star, and no bonuses', () => {
    const info = unitInfo('bilbo', 2, [], baseNumbers('bilbo', 2));
    const base = baseStats(UNITS.bilbo, 2);
    expect(info).toMatchObject({ name: 'Bilbo', stars: '★★', cost: 3, traits: 'Hobbit · Burglar' });
    expect(info.stats.find((s) => s.name === 'Health')).toEqual({ name: 'Health', value: String(Math.round(base.maxHealth)), change: null });
    expect(info.stats.every((s) => s.change === null)).toBe(true);
    expect(info.ability).toEqual({ name: 'Riddles in the Dark', mana: base.maxMana, lines: lines('bilbo', 2) });
  });

  it('shows a board unit with the stats it would start a fight with, and a bench unit with its base stats', () => {
    const frodo = owned('frodo', ['blade']);
    const bench = owned('pippin');
    const board: (OwnedUnit | null)[] = new Array(28).fill(null);
    board[24] = frodo;
    board[25] = owned('merry');
    const info = unitInfo('frodo', 1, frodo.items, ownedNumbers(board, frodo, ['beorns-honey'], null));
    const change = (name: string) => info.stats.find((s) => s.name === name)!.change;
    // Hobbit Health, Beorn's Honey, the Blade's Attack Damage and Burglar Crit Damage.
    expect([change('Health'), change('Attack Damage'), change('Crit Damage'), change('Armor')]).toEqual(['bonus', 'bonus', 'bonus', null]);
    expect(ownedNumbers(board, bench, ['beorns-honey'], null)).toEqual(baseNumbers('pippin', 1));
    // Without the second Burglar, no Crit Damage.
    board[25] = null;
    expect(unitInfo('frodo', 1, frodo.items, ownedNumbers(board, frodo, [], null)).stats.find((s) => s.name === 'Crit Damage')!.change).toBeNull();
  });

  it("marks the One Ring's Burden on its bearer as a penalty", () => {
    const aragorn = owned('aragorn');
    const board: (OwnedUnit | null)[] = [aragorn];
    const worn = unitInfo('aragorn', 1, [], ownedNumbers(board, aragorn, [], { bearer: aragorn.id, corruption: 6 }));
    expect(worn.stats.find((s) => s.name === 'Health')!.change).toBe('penalty');
    expect(boardPlacements(board, { bearer: aragorn.id, corruption: 6 })).toEqual([{ unitId: 'aragorn', star: 1, col: 0, row: 0, items: [], ring: 6 }]);
  });

  it('shows a fighter’s current Health, and monsters and summons for what they are', () => {
    const base = monsterStats(MONSTERS['cave-troll'], 3);
    const troll = unitInfo('cave-troll', 1, [], { base, stats: base, mana: 10, health: 1000 });
    expect(troll).toMatchObject({ name: 'Cave Troll', stars: '', cost: null, traits: 'Monster' });
    expect(troll.stats[0]).toEqual({ name: 'Health', value: `1000 / ${base.maxHealth}`, change: null });
    expect(troll.ability!.name).toBe('Smash');
    const goblin = monsterStats(MONSTERS.goblin, 1);
    expect(unitInfo('goblin', 1, [], { base: goblin, stats: goblin, mana: 0 }).ability).toBeNull();
    const grunt = unitInfo('orc-grunt', 1, [], { base: goblin, stats: goblin, mana: 0 });
    expect([grunt.traits, grunt.ability]).toEqual(['Summon', null]);
  });

  it("adds the Nazgûl a Ring of the Nine makes its wearer", () => {
    expect(traitNames('boromir', ['ring-of-the-nine'])).toBe('Gondor · Captain · Nazgûl');
    expect(traitNames('ringwraith', ['ring-of-the-nine'])).toBe('Nazgûl · Burglar');
    expect(traitNames('theoden')).toBe('Rohan · Rider · Captain');
  });
});
