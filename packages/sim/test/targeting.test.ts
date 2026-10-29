import { describe, expect, it } from 'vitest';
import { chooseTarget, type Candidate } from '../src/combat/targeting.js';
import { traitLevels } from '../src/combat/traits.js';
import type { OriginId } from '../src/data/traits.js';
import { fromOffset, mirror } from '../src/hex.js';

interface Named extends Candidate {
  readonly name: string;
}

function unit(name: string, col: number, row: number, origin: OriginId = 'gondor', slot = 0): Named {
  return { name, hex: fromOffset({ col, row }), slot, origin };
}

const NEAREST = { farthest: false, hobbitRule: false };

describe('chooseTarget', () => {
  const from = fromOffset({ col: 3, row: 3 });

  // 4, 2 and 5 hexes from (3, 3).
  const spread = [unit('d4', 3, 7), unit('d2', 3, 5), unit('d5', 0, 6)];

  it('picks the nearest candidate', () => {
    expect(chooseTarget('A', from, spread, spread, NEAREST)?.name).toBe('d2');
  });

  it('picks the farthest candidate for Burglars', () => {
    expect(chooseTarget('A', from, spread, spread, { farthest: true, hobbitRule: false })?.name).toBe('d5');
  });

  it('breaks distance ties by row, then column, in the chooser’s perspective', () => {
    // All three are next to (3, 3).
    const enemies = [unit('row4col4', 4, 4), unit('row4col3', 3, 4), unit('row3', 2, 3)];
    expect(chooseTarget('A', from, enemies, enemies, NEAREST)?.name).toBe('row3');
    expect(chooseTarget('A', from, enemies.slice(0, 2), enemies, NEAREST)?.name).toBe('row4col3');
    // Team B makes the same choice on the mirrored board.
    const mirrored = enemies.map((e) => ({ ...e, hex: mirror(e.hex) }));
    expect(chooseTarget('B', mirror(from), mirrored, mirrored, NEAREST)?.name).toBe('row3');
    expect(chooseTarget('B', mirror(from), mirrored.slice(0, 2), mirrored, NEAREST)?.name).toBe('row4col3');
  });

  it('breaks the remaining ties by slot', () => {
    const twins = [unit('slot2', 3, 4, 'orc', 2), unit('slot1', 3, 4, 'orc', 1)];
    expect(chooseTarget('A', from, twins, twins, NEAREST)?.name).toBe('slot1');
  });

  it('returns null without candidates', () => {
    expect(chooseTarget('A', from, [], [], NEAREST)).toBeNull();
  });

  describe('Hobbit rule', () => {
    const rules = { farthest: false, hobbitRule: true };

    it('skips a Hobbit with a non-Hobbit ally next to it', () => {
      const sam = unit('sam', 3, 4, 'hobbit');
      const gimli = unit('gimli', 4, 4, 'dwarf');
      const pippin = unit('pippin', 0, 7, 'hobbit');
      const team = [sam, gimli, pippin];
      expect(chooseTarget('A', from, [sam, pippin], team, rules)?.name).toBe('pippin');
      expect(chooseTarget('A', from, [sam, pippin], team, NEAREST)?.name).toBe('sam');
    });

    it('does not count a Hobbit ally as a guard', () => {
      const sam = unit('sam', 3, 4, 'hobbit');
      const frodo = unit('frodo', 4, 4, 'hobbit');
      const far = unit('far', 0, 7, 'orc');
      expect(chooseTarget('A', from, [sam, far], [sam, frodo, far], rules)?.name).toBe('sam');
    });

    it('counts a guard even if the guard can’t be targeted', () => {
      const sam = unit('sam', 3, 4, 'hobbit');
      const guard = unit('guard', 4, 4, 'rohan');
      const far = unit('far', 0, 7, 'orc');
      expect(chooseTarget('A', from, [sam, far], [sam, guard, far], rules)?.name).toBe('far');
    });

    it('is ignored when every candidate would be skipped', () => {
      const sam = unit('sam', 3, 4, 'hobbit');
      const gimli = unit('gimli', 4, 4, 'dwarf');
      expect(chooseTarget('A', from, [sam], [sam, gimli], rules)?.name).toBe('sam');
    });
  });
});

describe('traitLevels', () => {
  it('activates the highest breakpoint reached', () => {
    expect(traitLevels(['sam', 'merry'])).toEqual({ hobbit: 0 });
    expect(traitLevels(['sam', 'merry', 'pippin', 'frodo', 'bilbo', 'gollum'])).toMatchObject({ hobbit: 2, burglar: 1 });
  });

  it('counts each distinct unit once', () => {
    expect(traitLevels(['sam', 'sam'])).toEqual({});
    expect(traitLevels(['sam', 'sam', 'merry'])).toEqual({ hobbit: 0 });
  });

  it('activates single-unit traits with one unit', () => {
    expect(traitLevels(['treebeard'])).toEqual({ ent: 0 });
  });
});
