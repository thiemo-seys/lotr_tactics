import { UNITS, UNIT_IDS } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVERY, FACTION_LIVERY, UNIT_LIVERY, liveryOf } from '../src/livery.js';

describe('liveryOf (viewer-spec.md section 4, Livery)', () => {
  it("gives a unit without a colour of its own its faction's", () => {
    const plain = UNIT_IDS.filter((id) => UNIT_LIVERY[id] === undefined);
    expect(plain.length).toBeGreaterThan(0);
    for (const id of plain) expect(liveryOf(id), id).toBe(FACTION_LIVERY[UNITS[id].origin]);
  });

  it("gives a unit with a colour of its own that colour, not its faction's", () => {
    const own = UNIT_IDS.filter((id) => UNIT_LIVERY[id] !== undefined);
    expect(own).toContain('gandalf');
    for (const id of own) expect(liveryOf(id), id).toBe(UNIT_LIVERY[id]);
    expect(liveryOf('saruman')).not.toBe(FACTION_LIVERY[UNITS.saruman.origin]);
  });

  it('gives summons the default', () => {
    expect(liveryOf('orc-grunt')).toBe(DEFAULT_LIVERY);
  });
});
