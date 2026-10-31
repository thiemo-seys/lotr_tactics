import { TRAITS, type OwnedUnit, type TraitId, type UnitId, type ItemId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { TRAIT_IDS, traitInfo, traitRows } from '../src/traits.js';

let nextId = 1;
const unit = (unitId: UnitId, items: ItemId[] = []): OwnedUnit => ({ id: nextId++, unitId, star: 1, items });

describe('trait text', () => {
  it('says what every trait does at each breakpoint, from its data', () => {
    for (const trait of TRAIT_IDS) {
      const info = traitInfo(trait);
      expect(info.name).toBe(TRAITS[trait].name);
      expect(info.levels.map((l) => l.count)).toEqual(TRAITS[trait].breakpoints);
      for (const { text } of info.levels) {
        expect(text).not.toContain('undefined');
        expect(text.endsWith('.')).toBe(true);
      }
    }
    expect(traitInfo('hobbit').levels.map((l) => l.text)).toEqual(['Hobbits gain +150 Health.', 'Hobbits gain +350 Health.', 'Hobbits gain +600 Health.']);
    expect(traitInfo('elf').levels[1]!.text).toBe('Elves gain +45% Attack Speed and 20% Dodge.');
    expect(traitInfo('elf').levels[0]!.text).toBe('Elves gain +20% Attack Speed.');
    expect(traitInfo('orc').levels.map((l) => l.text)[0]).toBe('An Orc grunt spawns at combat start.');
    expect(traitInfo('burglar')).toMatchObject({ kind: 'Class', rule: expect.stringContaining('farthest enemy') });
    expect(traitInfo('ent')).toMatchObject({ kind: 'Origin', rule: 'Treebeard is Large.' });
  });
});

describe('the trait tracker', () => {
  it('shows the board as the sim counts it: distinct units, crests and the Nine', () => {
    const board = [unit('sam'), unit('sam'), unit('merry'), null, unit('ringwraith'), unit('boromir', ['ring-of-the-nine'])];
    const rows = traitRows(board, ['shire-folk']);
    const byTrait = Object.fromEntries(rows.map((r) => [r.trait, r]));
    expect(byTrait.hobbit).toMatchObject({ count: 3, level: 0, tone: 'bronze', breakpoints: [2, 4, 6] });
    expect(byTrait.nazgul).toMatchObject({ count: 2, level: 0, tone: 'bronze' });
    expect(byTrait.burglar).toMatchObject({ count: 2, level: 0 });
    expect(byTrait.gondor).toMatchObject({ count: 1, level: null, tone: null });
    expect(byTrait.elf).toBeUndefined();
  });

  it('puts active traits first, by tone and then count, and the rest by count', () => {
    const elves: UnitId[] = ['legolas', 'haldir', 'elrond', 'galadriel'];
    const board = [...elves.map((id) => unit(id)), unit('treebeard'), unit('gimli'), unit('dain'), unit('frodo')];
    const rows = traitRows(board, []);
    const tones = rows.map((r) => r.tone);
    expect(rows[0]).toMatchObject({ trait: 'ent', tone: 'unique' });
    expect(rows.find((r) => r.trait === 'elf')).toMatchObject({ count: 4, level: 1, tone: 'gold' });
    expect(rows.find((r) => r.trait === 'dwarf')).toMatchObject({ count: 2, level: 0, tone: 'bronze' });
    const firstInactive = tones.indexOf(null);
    expect(tones.slice(firstInactive).every((t) => t === null)).toBe(true);
    const inactive = rows.slice(firstInactive).map((r) => r.count);
    expect(inactive).toEqual([...inactive].sort((a, b) => b - a));
  });

  it('is empty for an empty board', () => {
    expect(traitRows([null, null], ['shire-folk'])).toEqual([]);
    const lone: TraitId[] = traitRows([unit('sam')], []).map((r) => r.trait);
    expect(lone.sort()).toEqual(['guardian', 'hobbit']);
  });
});
