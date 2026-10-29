import { MAX_ITEMS, createCombat, isCombined } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { BOARD_CHOICES, PRESETS, RANDOM_BOARD_SIZE, fightBoards, isBoardChoice, randomBoard } from '../src/boards.js';

describe('boards', () => {
  it('offers every preset and a random board', () => {
    expect(BOARD_CHOICES).toEqual([...Object.keys(PRESETS), 'random']);
    expect(isBoardChoice('full')).toBe(true);
    expect(isBoardChoice('nonsense')).toBe(false);
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
