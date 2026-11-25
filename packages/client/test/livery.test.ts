import { MONSTERS, SUMMONS, TRAITS, UNITS, UNIT_IDS, type MonsterId, type OriginId, type SummonId } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVERY, LIVERY, liveryOf } from '../src/livery.js';

const COLOUR = /^#[0-9a-f]{6}$/;
const origins = Object.keys(TRAITS).filter((id) => TRAITS[id as keyof typeof TRAITS].kind === 'origin') as OriginId[];
const MONSTER_IDS = Object.keys(MONSTERS) as MonsterId[];
const SUMMON_IDS = Object.keys(SUMMONS) as SummonId[];

describe('livery.json (viewer-spec.md section 4, Livery)', () => {
  it('gives every faction a colour', () => {
    expect(Object.keys(LIVERY.factions).sort()).toEqual([...origins].sort());
    for (const colour of Object.values(LIVERY.factions)) expect(colour).toMatch(COLOUR);
    expect(LIVERY.default).toMatch(COLOUR);
  });

  it('lists every roster unit, monster and summon, and nothing else', () => {
    expect(Object.keys(LIVERY.units).sort()).toEqual([...UNIT_IDS, ...MONSTER_IDS, ...SUMMON_IDS].sort());
  });

  it('gives every roster unit its faction or a colour of its own', () => {
    for (const id of UNIT_IDS) {
      const livery = LIVERY.units[id];
      // A faction named here is the unit's own, so the art tools, which can't read the sim, agree with the game.
      if (livery.startsWith('#')) expect(livery, id).toMatch(COLOUR);
      else expect(livery, id).toBe(UNITS[id].origin);
    }
  });

  it('gives every monster a colour of its own, since a team colour means nothing on the enemy', () => {
    for (const id of MONSTER_IDS) expect(LIVERY.units[id], id).toMatch(COLOUR);
  });

  it("gives every summon its faction's colour", () => {
    for (const id of SUMMON_IDS) expect(LIVERY.units[id], id).toBe(SUMMONS[id].origin);
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

  it("gives Moria's goblins, goblin archers, wargs and Cave Troll one rust, as one warband, and the other monsters their own", () => {
    for (const id of ['goblin', 'goblin-archer', 'warg', 'cave-troll'] as const) expect(liveryOf(id), id).toBe(0x7a3f2a);
    expect(liveryOf('watcher')).toBe(0x4d6b5c);
    expect(liveryOf('mumak')).toBe(0x8a2a22);
    expect(liveryOf('balrog')).toBe(0xb0471c);
  });

  it("gives summons their faction's colour: the Orc grunt the Orcs', the Eye's Nazgûl the Nazgûl's", () => {
    expect(liveryOf('orc-grunt')).toBe(0x6b6a2c);
    expect(liveryOf('eye-nazgul')).toBe(0x25252a);
  });

  it('gives every unit, monster and summon its own livery rather than the default', () => {
    for (const id of [...UNIT_IDS, ...MONSTER_IDS, ...SUMMON_IDS]) expect(liveryOf(id), id).not.toBe(DEFAULT_LIVERY);
  });
});
