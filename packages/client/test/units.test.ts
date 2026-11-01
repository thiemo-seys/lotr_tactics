import { describe, expect, it } from 'vitest';
import { displayName, isLarge, isRosterUnit } from '../src/units.js';

describe('unit names and sizes', () => {
  it('cover units, monsters and summons', () => {
    expect(['sam', 'balrog', 'orc-grunt'].map((id) => displayName(id as 'sam'))).toEqual(['Sam', 'The Balrog', 'Orc grunt']);
  });

  it('mark Treebeard, Sauron and the big monsters as Large', () => {
    const ids = ['treebeard', 'sauron', 'cave-troll', 'balrog', 'sam', 'goblin', 'orc-grunt'] as const;
    expect(ids.map((id) => isLarge(id))).toEqual([true, true, true, true, false, false, false]);
  });

  it("tell the roster's units from monsters and summons", () => {
    const ids = ['frodo', 'treebeard', 'balrog', 'goblin', 'orc-grunt', 'eye-nazgul'] as const;
    expect(ids.map((id) => isRosterUnit(id))).toEqual([true, true, false, false, false, false]);
  });
});
