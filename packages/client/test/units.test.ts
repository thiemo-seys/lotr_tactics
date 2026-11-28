import { MONSTERS, SUMMONS, UNIT_IDS, type MonsterId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { FIGHTER_IDS, displayName, hasAbility, isLarge, isRosterUnit, modelStar } from '../src/units.js';

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

describe('what a fighter needs of its model', () => {
  it('has an ability for every roster unit, the monsters given one, and no summon', () => {
    expect(UNIT_IDS.every((id) => hasAbility(id))).toBe(true);
    for (const id of Object.keys(MONSTERS) as MonsterId[]) expect(hasAbility(id), id).toBe(MONSTERS[id].ability !== undefined);
    // docs/animation-plan.md, Workflow 3: the goblins, goblin archers, wargs and both summons never cast.
    for (const id of ['goblin', 'goblin-archer', 'warg', 'orc-grunt', 'eye-nazgul'] as const) expect(hasAbility(id), id).toBe(false);
    for (const id of ['cave-troll', 'watcher', 'mumak', 'balrog'] as const) expect(hasAbility(id), id).toBe(true);
  });

  it("draws monsters and summons with their 1★ model, and roster units with their star level's", () => {
    expect(([1, 2, 3] as const).map((star) => modelStar('aragorn', star))).toEqual([1, 2, 3]);
    for (const id of ['goblin', 'balrog', 'orc-grunt', 'eye-nazgul'] as const) expect(modelStar(id, 2), id).toBe(1);
  });

  it('lists every roster unit, monster and summon once', () => {
    expect([...FIGHTER_IDS].sort()).toEqual([...UNIT_IDS, ...Object.keys(MONSTERS), ...Object.keys(SUMMONS)].sort());
    expect(new Set(FIGHTER_IDS).size).toBe(FIGHTER_IDS.length);
  });
});
