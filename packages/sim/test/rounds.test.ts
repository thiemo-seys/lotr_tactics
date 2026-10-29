import { describe, expect, it } from 'vitest';
import { createCombat } from '../src/combat/combat.js';
import { POOL_COPIES } from '../src/data/economy.js';
import { PVE_ROUNDS } from '../src/data/pve.js';
import { UNITS } from '../src/data/units.js';
import { pickGroups, rollCouncilOptions } from '../src/game/council.js';
import { pairPlayers } from '../src/game/matchmaking.js';
import { Pool } from '../src/game/pool.js';
import { councilCosts, nextRound, playerDamage, pveRound, roundType, roundsInStage, stageDamage } from '../src/game/schedule.js';
import { createRng } from '../src/rng.js';

describe('schedule', () => {
  it('follows docs/design.md section 9', () => {
    expect([1, 2, 3, 4].map((round) => roundType(1, round))).toEqual(['council', 'pve', 'pve', 'pve']);
    for (const stage of [2, 3, 7]) {
      expect([1, 2, 3, 4, 5, 6, 7].map((round) => roundType(stage, round))).toEqual(['pvp', 'pvp', 'pvp', 'council', 'pvp', 'pvp', 'pve']);
    }
    expect([roundsInStage(1), roundsInStage(2)]).toEqual([4, 7]);
    expect(() => roundType(1, 5)).toThrow();
  });

  it('moves on to the next stage after its last round', () => {
    expect(nextRound(1, 3)).toEqual([1, 4]);
    expect(nextRound(1, 4)).toEqual([2, 1]);
    expect(nextRound(2, 7)).toEqual([3, 1]);
  });

  it('deals stage damage plus 1, 2 or 3 per surviving enemy', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9].map(stageDamage)).toEqual([0, 2, 5, 8, 10, 12, 17, 17]);
    const survivors = [
      { unitId: 'sam', star: 1 },
      { unitId: 'gimli', star: 2 },
      { unitId: 'sauron', star: 3 },
    ] as const;
    expect(playerDamage(4, survivors)).toBe(8 + 6);
    expect(playerDamage(1, [{ unitId: 'goblin', star: 1 }])).toBe(1);
  });

  it('offers Council costs by stage', () => {
    expect([1, 2, 3, 4, 5, 8].map((stage) => councilCosts(stage))).toEqual([[1], [1, 2], [2, 3], [3, 4], [3, 4, 5], [3, 4, 5]]);
  });

  it('has a valid fight board for every PvE round', () => {
    for (const [stage, round] of [[1, 2], [1, 3], [1, 4], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [9, 7]] as const) {
      const { monsters } = pveRound(stage, round);
      const B = monsters.map((m) => ({ ...m, star: 1 as const, items: [] }));
      expect(() => createCombat({ seed: 1, stage, teams: { A: [], B } })).not.toThrow();
    }
    expect(pveRound(8, 7)).toBe(PVE_ROUNDS.later);
    expect(() => pveRound(2, 1)).toThrow();
  });
});

describe('matchmaking', () => {
  const none = () => [];

  it('pairs every player once with an even count', () => {
    const pairings = pairPlayers([0, 1, 2, 3, 4, 5, 6, 7], none, createRng(1));
    expect(pairings).toHaveLength(4);
    expect(pairings.every((p) => !p.ghost)).toBe(true);
    expect(pairings.flatMap((p) => [p.home, p.away]).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('gives exactly one ghost fight with an odd count, against another living player', () => {
    for (let seed = 0; seed < 50; seed++) {
      const pairings = pairPlayers([0, 2, 5, 6, 7], none, createRng(seed));
      const ghosts = pairings.filter((p) => p.ghost);
      expect(ghosts).toHaveLength(1);
      expect(ghosts[0]!.away).not.toBe(ghosts[0]!.home);
      expect([0, 2, 5, 6, 7]).toContain(ghosts[0]!.away);
      const fighting = pairings.flatMap((p) => (p.ghost ? [p.home] : [p.home, p.away])).sort();
      expect(fighting).toEqual([0, 2, 5, 6, 7]);
    }
  });

  it('avoids the last 3 opponents when it can', () => {
    // Everyone has fought their neighbours on the circle of 8; plenty of others are left.
    const recent = (seat: number) => [(seat + 1) % 8, (seat + 7) % 8, (seat + 4) % 8];
    for (let seed = 0; seed < 50; seed++) {
      for (const { home, away } of pairPlayers([0, 1, 2, 3, 4, 5, 6, 7], recent, createRng(seed))) {
        expect(recent(home)).not.toContain(away);
      }
    }
  });

  it('avoids recent opponents with an odd count too, ghosts included', () => {
    // 0 and 1 just met, so one of them fights 2 and the other fights 2's ghost.
    const recent = (seat: number) => (seat === 0 ? [1] : seat === 1 ? [0] : []);
    for (let seed = 0; seed < 30; seed++) {
      const pairings = pairPlayers([0, 1, 2], recent, createRng(seed));
      const [real, ghost] = pairings;
      expect([real!.home, real!.away]).toContain(2);
      expect(ghost).toMatchObject({ away: 2, ghost: true });
    }
  });

  it('still pairs everyone when every pairing repeats', () => {
    expect(pairPlayers([3, 4], () => [3, 4], createRng(1))).toHaveLength(1);
    const everyone = [0, 1, 2, 3, 4, 5, 6];
    const pairings = pairPlayers(everyone, () => everyone, createRng(1));
    expect(pairings).toHaveLength(4);
    expect(pairings[3]!.ghost).toBe(true);
  });

  it('is the same for the same seed', () => {
    expect(pairPlayers([0, 1, 2, 3, 4, 5, 6], none, createRng(9))).toEqual(pairPlayers([0, 1, 2, 3, 4, 5, 6], none, createRng(9)));
  });
});

describe('Council', () => {
  it('offers 9 units of the stage costs, each with a component, taken from the pool', () => {
    const pool = new Pool();
    const options = rollCouncilOptions(pool, 3, createRng(1));
    expect(options).toHaveLength(9);
    for (const option of options) {
      expect([2, 3]).toContain(UNITS[option.unitId].cost);
      expect(option.pickedBy).toBeNull();
    }
    const taken = options.filter((o) => o.unitId === options[0]!.unitId).length;
    expect(pool.count(options[0]!.unitId)).toBe(POOL_COPIES[UNITS[options[0]!.unitId].cost] - taken);
  });

  it('skips costs with no copies left', () => {
    const pool = new Pool();
    for (const id of Object.keys(UNITS) as (keyof typeof UNITS)[]) if (UNITS[id].cost === 2) pool.take(id, pool.count(id));
    for (const option of rollCouncilOptions(pool, 2, createRng(4))) expect(UNITS[option.unitId].cost).toBe(1);
  });

  it('lets everyone pick at once at the first Council, then pairs by HP, lowest first', () => {
    const players = [
      { seat: 0, hp: 50 },
      { seat: 1, hp: 20 },
      { seat: 2, hp: 80 },
      { seat: 3, hp: 20 },
      { seat: 4, hp: 65 },
    ];
    expect(pickGroups(players, true, createRng(1))).toEqual([[0, 1, 2, 3, 4]]);
    const groups = pickGroups(players, false, createRng(1));
    expect(groups.map((g) => g.length)).toEqual([2, 2, 1]);
    expect([...groups[0]!].sort()).toEqual([1, 3]);
    expect(groups.slice(1)).toEqual([[0, 4], [2]]);
  });

  it('breaks HP ties with the seed', () => {
    const tied = [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, hp: 40 }));
    const firsts = new Set(Array.from({ length: 30 }, (_, seed) => pickGroups(tied, false, createRng(seed))[0]![0]));
    expect(firsts.size).toBeGreaterThan(2);
  });
});
