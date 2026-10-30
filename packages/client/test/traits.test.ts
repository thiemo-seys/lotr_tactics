import { TRAITS, type OwnedUnit, type TraitId, type UnitId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { traitEffect, traitRows, traitText, unitsWith } from '../src/traits.js';

let nextId = 0;
const owned = (unitId: UnitId, items: OwnedUnit['items'] = []): OwnedUnit => ({ id: nextId++, unitId, star: 1, items });

describe('the trait tracker', () => {
  it('counts each distinct board unit once, active traits first by tier, then by count', () => {
    const board = [owned('frodo'), owned('frodo'), owned('sam'), owned('merry'), owned('bilbo'), owned('gimli'), null, owned('legolas')];
    expect(traitRows(board, []).map((r) => [r.trait, r.count, r.level])).toEqual([
      ['hobbit', 4, 1],
      ['burglar', 3, 0],
      ['guardian', 2, 0],
      ['elf', 1, -1],
      ['dwarf', 1, -1],
      ['archer', 1, -1],
    ]);
    expect(traitRows([], [])).toEqual([]);
  });

  it('counts crests for traits the board has, and the Nine as Nazgûl, as fights do', () => {
    const board = [owned('boromir', ['ring-of-the-nine']), owned('ringwraith'), owned('faramir')];
    const rows = traitRows(board, ['captains-horn', 'shire-folk']);
    expect(rows.find((r) => r.trait === 'nazgul')).toMatchObject({ count: 2, level: 0 });
    expect(rows.find((r) => r.trait === 'captain')).toMatchObject({ count: 2, level: 0 });
    expect(rows.some((r) => r.trait === 'hobbit')).toBe(false);
  });

  it('puts a trait at its top breakpoint before one with more units at a lower one', () => {
    const board = [owned('gimli'), owned('balin'), owned('dain'), owned('sam'), owned('merry'), owned('pippin'), owned('frodo')];
    expect(traitRows(board, []).slice(0, 3).map((r) => [r.trait, r.count, r.tier])).toEqual([
      ['dwarf', 3, 'gold'],
      ['hobbit', 4, 'silver'],
      ['guardian', 3, 'bronze'],
    ]);
    expect(traitRows([owned('treebeard')], []).map((r) => [r.trait, r.tier])).toEqual([
      ['ent', 'gold'],
      ['guardian', null],
    ]);
  });
});

describe('trait text', () => {
  it('describes every trait from its data, with a value for each breakpoint', () => {
    for (const trait of Object.keys(TRAITS) as TraitId[]) {
      const effect = traitEffect(trait);
      expect(effect).not.toContain('undefined');
      expect(effect.endsWith('.')).toBe(true);
      expect(unitsWith(trait).length).toBeGreaterThan(0);
    }
    expect(traitEffect('hobbit')).toContain('+150 / +350 / +600 Health');
    expect(traitEffect('elf')).toBe('Elves gain +20% / +45% Attack Speed, plus 20% Dodge at 4.');
    expect(traitEffect('nazgul')).toBe('Enemies within 2 hexes of a Nazgûl attack 15% / 30% slower.');
    expect(traitEffect('guardian')).toBe('Guardians start combat with a 200 / 400 / 700 shield for 8 seconds.');
  });

  it('names the breakpoints and the units, cheapest first, and the Nine for Nazgûl', () => {
    expect(traitText('dwarf').split('\n')).toEqual([
      'Dwarf (2 / 3)',
      traitEffect('dwarf'),
      'Units: Balin, Gimli, Dáin.',
    ]);
    expect(traitText('nazgul')).toContain('Units: Ringwraith, Khamûl, Witch-king, and any unit wearing a Ring of the Nine.');
  });
});
