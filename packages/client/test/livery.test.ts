import { TRAITS, UNITS, UNIT_IDS, type OriginId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVERY, LIVERY, liveryOf } from '../src/livery.js';

const COLOUR = /^#[0-9a-f]{6}$/;
const origins = Object.keys(TRAITS).filter((id) => TRAITS[id as keyof typeof TRAITS].kind === 'origin') as OriginId[];

describe('livery.json (viewer-spec.md section 4, Livery)', () => {
  it('gives every faction a colour', () => {
    expect(Object.keys(LIVERY.factions).sort()).toEqual([...origins].sort());
    for (const colour of Object.values(LIVERY.factions)) expect(colour).toMatch(COLOUR);
    expect(LIVERY.default).toMatch(COLOUR);
  });

  it('gives every roster unit, and nothing else, its faction or a colour of its own', () => {
    expect(Object.keys(LIVERY.units).sort()).toEqual([...UNIT_IDS].sort());
    for (const id of UNIT_IDS) {
      const livery = LIVERY.units[id];
      // A faction named here is the unit's own, so the art tools, which can't read the sim, agree with the game.
      if (livery.startsWith('#')) expect(livery, id).toMatch(COLOUR);
      else expect(livery, id).toBe(UNITS[id].origin);
    }
  });
});

describe('liveryOf', () => {
  it("gives a unit named with its faction the faction's colour", () => {
    expect(liveryOf('merry')).toBe(0xa35a33);
    expect(liveryOf('treebeard')).toBe(Number.parseInt(LIVERY.factions.ent.slice(1), 16));
  });

  it('gives a unit with a colour of its own that colour', () => {
    expect(liveryOf('saruman')).toBe(0xc9c6be);
    expect(liveryOf('sam')).toBe(0x844929);
  });

  it('gives summons the default', () => {
    expect(liveryOf('orc-grunt')).toBe(DEFAULT_LIVERY);
  });
});
