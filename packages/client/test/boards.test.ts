import { MAX_ITEMS, createCombat, isComponent } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { BOARD_CHOICES, PRESETS, RANDOM_BOARD_SIZE, boardFor, isBoardChoice, randomBoard } from '../src/boards.js';

describe('boards', () => {
  it('offers every preset and a random board', () => {
    expect(BOARD_CHOICES).toEqual([...Object.keys(PRESETS), 'random']);
    expect(isBoardChoice('full')).toBe(true);
    expect(isBoardChoice('nonsense')).toBe(false);
  });

  it('gives boards the sim accepts', () => {
    for (const a of BOARD_CHOICES) {
      for (const seed of [1, 2, 3]) {
        expect(() => createCombat({ seed, stage: 2, teams: { A: boardFor(a, seed, 'A'), B: boardFor('full', seed, 'B') } })).not.toThrow();
      }
    }
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
    expect(items.every((list) => list.length <= MAX_ITEMS && list.every((id) => !isComponent(id)))).toBe(true);
    expect(items.some((list) => list.length > 0)).toBe(true);
  });

  it('makes the same random board for the same seed and team, and different ones otherwise', () => {
    expect(randomBoard(7, 'A')).toEqual(randomBoard(7, 'A'));
    expect(randomBoard(7, 'A')).not.toEqual(randomBoard(7, 'B'));
    expect(randomBoard(7, 'A')).not.toEqual(randomBoard(8, 'A'));
  });
});
