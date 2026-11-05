import { UNITS, UNIT_IDS } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVERY, FACTION_LIVERY, UNIT_LIVERY, liveryOf } from '../src/livery.js';

describe('liveryOf (viewer-spec.md section 4, Livery)', () => {
  it('gives a unit its faction colour', () => {
    expect(liveryOf('sam')).toBe(FACTION_LIVERY.hobbit);
    expect(liveryOf('aragorn')).toBe(FACTION_LIVERY.gondor);
    expect(liveryOf('sauron')).toBe(FACTION_LIVERY['dark-lord']);
  });

  it("gives a unit with a colour of its own that colour, not its faction's", () => {
    expect(liveryOf('gandalf')).toBe(UNIT_LIVERY.gandalf);
    expect(liveryOf('saruman')).toBe(0xc9c6be);
    expect(liveryOf('saruman')).not.toBe(FACTION_LIVERY[UNITS.saruman.origin]);
  });

  it('gives every roster unit a colour', () => {
    for (const id of UNIT_IDS) expect(liveryOf(id), id).toBeTypeOf('number');
  });

  it('gives summons the default', () => {
    expect(liveryOf('orc-grunt')).toBe(DEFAULT_LIVERY);
  });
});
