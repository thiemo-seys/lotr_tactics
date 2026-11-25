import { MAX_ITEMS, MONSTERS, PVE_ROUNDS, createCombat, isCombined, pveRound } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import {
  BOARD_CHOICES,
  BOARD_GROUPS,
  PRESETS,
  PVE_CHOICES,
  RANDOM_BOARD_SIZE,
  boardFor,
  boardLabel,
  fightBoards,
  isBoardChoice,
  randomBoard,
} from '../src/boards.js';

describe('boards', () => {
  it('offers every preset, every PvE round and a random board', () => {
    expect(PVE_CHOICES).toEqual(Object.keys(PVE_ROUNDS).map((key) => `pve-${key}`));
    expect(PVE_CHOICES).toEqual(['pve-1-1', 'pve-1-2', 'pve-1-3', 'pve-2-7', 'pve-3-7', 'pve-4-7', 'pve-5-7', 'pve-later']);
    expect(BOARD_CHOICES).toEqual([...Object.keys(PRESETS), ...PVE_CHOICES, 'random']);
    expect(isBoardChoice('full')).toBe(true);
    expect(isBoardChoice('pve-later')).toBe(true);
    expect(isBoardChoice('pve-9-9')).toBe(false);
    expect(isBoardChoice('nonsense')).toBe(false);
  });

  it('groups the pickers into boards and PvE rounds, with every choice once', () => {
    expect(BOARD_GROUPS.map((g) => g.label)).toEqual(['Boards', 'PvE rounds']);
    expect(BOARD_GROUPS[1]!.choices).toEqual(PVE_CHOICES);
    expect(BOARD_GROUPS.flatMap((g) => g.choices).toSorted()).toEqual([...BOARD_CHOICES].toSorted());
    expect(boardLabel('pve-1-1')).toBe('PvE 1-1');
    expect(boardLabel('pve-later')).toBe('PvE later');
    expect(boardLabel('full')).toBe('full');
  });

  it('puts each PvE round’s monsters on a side as the game does: 1★, no items, on the data’s hexes', () => {
    for (const choice of PVE_CHOICES) {
      const round = PVE_ROUNDS[choice.slice('pve-'.length) as keyof typeof PVE_ROUNDS];
      const board = boardFor(choice, 1, 'A');
      expect(board).toEqual(round.monsters.map((m) => ({ ...m, star: 1, items: [] })));
      expect(boardFor(choice, 2, 'B')).toEqual(board);
      expect(board.every((p) => Object.hasOwn(MONSTERS, p.unitId))).toBe(true);
    }
    // The same monsters as the game's own PvE rounds, from stage 6 on for `later`.
    expect(boardFor('pve-1-1', 1, 'B')).toEqual(pveRound(1, 1).monsters.map((m) => ({ ...m, star: 1, items: [] })));
    expect(boardFor('pve-later', 1, 'B')).toEqual(pveRound(6, 7).monsters.map((m) => ({ ...m, star: 1, items: [] })));
    expect(boardFor('pve-later', 1, 'B').map((p) => p.unitId)).toContain('balrog');
  });

  it('plays a PvE round to its end on either side', () => {
    for (const choice of PVE_CHOICES) {
      for (const teams of [fightBoards('full', choice, 1), fightBoards(choice, 'full', 1)]) {
        const combat = createCombat({ seed: 1, stage: 6, teams });
        while (!combat.isOver()) combat.step();
        expect(['A', 'B', 'draw']).toContain(combat.result().outcome);
      }
    }
  });

  it('gives boards the sim accepts, whichever two are chosen', () => {
    for (const a of BOARD_CHOICES) {
      for (const b of BOARD_CHOICES) {
        expect(() => createCombat({ seed: 1, stage: 2, teams: fightBoards(a, b, 1) })).not.toThrow();
      }
    }
  });

  it('lets only team A bear the One Ring when both boards have it', () => {
    const { A, B } = fightBoards('ring', 'ring', 1);
    expect(A.filter((p) => p.ring !== undefined)).toHaveLength(1);
    expect(B.some((p) => p.ring !== undefined)).toBe(false);
    expect(fightBoards('full', 'ring', 1).B.filter((p) => p.ring !== undefined)).toHaveLength(1);
  });

  it('makes random boards of distinct units on distinct hexes of the team’s half', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const board = randomBoard(seed, 'A');
      expect(board).toHaveLength(RANDOM_BOARD_SIZE);
      expect(new Set(board.map((p) => p.unitId)).size).toBe(RANDOM_BOARD_SIZE);
      expect(new Set(board.map((p) => `${p.col},${p.row}`)).size).toBe(RANDOM_BOARD_SIZE);
      for (const p of board) {
        expect(p.row).toBeLessThan(4);
        expect([1, 2, 3]).toContain(p.star);
      }
    }
  });

  it('gives random boards up to 3 combined items per unit', () => {
    const items = Array.from({ length: 20 }, (_, i) => randomBoard(i + 1, 'A')).flatMap((board) => board.map((p) => p.items));
    expect(items.every((list) => list.length <= MAX_ITEMS && list.every(isCombined))).toBe(true);
    expect(items.some((list) => list.length > 0)).toBe(true);
  });

  it('makes the same random board for the same seed and team, and different ones otherwise', () => {
    expect(randomBoard(7, 'A')).toEqual(randomBoard(7, 'A'));
    expect(randomBoard(7, 'A')).not.toEqual(randomBoard(7, 'B'));
    expect(randomBoard(7, 'A')).not.toEqual(randomBoard(8, 'A'));
  });
});
