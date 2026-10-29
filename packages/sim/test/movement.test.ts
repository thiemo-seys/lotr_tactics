import { describe, expect, it } from 'vitest';
import { MOVE_TICKS, explore, planMove, stepTowards } from '../src/combat/movement.js';
import type { Candidate } from '../src/combat/targeting.js';
import { BOARD_HEXES, boardIndex, distance, fromOffset, hexEquals, mirror, neighbours, type Hex } from '../src/hex.js';

function o(col: number, row: number): Hex {
  return fromOffset({ col, row });
}

function freeExcept(blocked: Hex[]): (hex: Hex) => boolean {
  const taken = new Set(blocked.map(boardIndex));
  return (hex) => !taken.has(boardIndex(hex));
}

/** Row 2 is blocked except for column 6. */
const WALL = [0, 1, 2, 3, 4, 5].map((col) => o(col, 2));

/** Steps from `start` until within `range` of `target`, re-planning every step as units do. */
function walk(start: Hex, target: Hex, range: number, blocked: Hex[]): Hex[] {
  const path: Hex[] = [];
  let at = start;
  while (distance(at, target) > range) {
    const step = stepTowards(explore('A', at, freeExcept([...blocked, target])), target, range);
    if (step === null) throw new Error('no path');
    path.push(step);
    at = step;
  }
  return path;
}

describe('explore', () => {
  it('finds the neighbours first, in the team’s direction order, then the rest of the board', () => {
    const start = o(3, 3);
    const reach = explore('A', start, () => true);
    expect(reach.hexes.slice(0, 6)).toEqual(neighbours('A', start));
    expect(reach.firstSteps.slice(0, 6)).toEqual(neighbours('A', start));
    expect(reach.hexes).toHaveLength(BOARD_HEXES.length - 1);
    for (let i = 1; i < reach.hexes.length; i++) {
      expect(distance(start, reach.hexes[i]!)).toBeGreaterThanOrEqual(distance(start, reach.hexes[i - 1]!));
    }
  });

  it('does not walk through occupied hexes', () => {
    const reach = explore('A', o(0, 0), freeExcept(WALL));
    expect(reach.hexes.some((hex) => WALL.some((w) => hexEquals(w, hex)))).toBe(false);
    expect(reach.hexes).toHaveLength(BOARD_HEXES.length - 1 - WALL.length);
  });

  it('gives team B the mirror image of team A’s search', () => {
    for (const start of BOARD_HEXES.filter((h) => !WALL.some((w) => hexEquals(w, h)))) {
      const a = explore('A', start, freeExcept(WALL));
      const b = explore('B', mirror(start), freeExcept(WALL.map(mirror)));
      expect(b.hexes).toEqual(a.hexes.map(mirror));
      expect(b.firstSteps).toEqual(a.firstSteps.map(mirror));
    }
  });
});

describe('stepTowards', () => {
  it('takes a shortest path around blockers', () => {
    const path = walk(o(0, 0), o(0, 4), 1, WALL);
    // 7 steps to the gap at (6, 2), then 6 more to a hex next to (0, 4).
    expect(path).toHaveLength(13);
    expect(path).toContainEqual(o(6, 2));
  });

  it('stops as soon as the target is in range', () => {
    expect(walk(o(0, 0), o(0, 4), 4, [])).toHaveLength(0);
    expect(walk(o(0, 0), o(0, 7), 4, [])).toHaveLength(3);
  });

  it('returns null when no reachable hex is in range', () => {
    // The corner (0, 0) only touches (1, 0) and (0, 1).
    const reach = explore('A', o(3, 5), freeExcept([o(0, 0), o(1, 0), o(0, 1)]));
    expect(stepTowards(reach, o(0, 0), 1)).toBeNull();
    expect(stepTowards(reach, o(0, 0), 2)).not.toBeNull();
  });
});

describe('planMove', () => {
  const rules = { farthest: false, hobbitRule: false };
  const enemy = (name: string, hex: Hex): Candidate & { name: string } => ({ name, hex, slot: 0, origin: 'orc' });

  it('steps towards the target when it can', () => {
    const target = enemy('target', o(3, 7));
    const plan = planMove('A', o(3, 3), 1, target, [target], [target], rules, freeExcept([target.hex]));
    expect(plan?.target).toBe(target);
    expect(distance(plan!.step!, o(3, 3))).toBe(1);
  });

  it('switches to an enemy it can reach when the target is walled in', () => {
    const trapped = enemy('trapped', o(6, 7));
    // (6, 7) only touches (6, 6) and (5, 7).
    const guards = [enemy('guard1', o(6, 6)), enemy('guard2', o(5, 7))];
    const all = [trapped, ...guards];
    const plan = planMove('A', o(3, 3), 1, trapped, all, all, rules, freeExcept(all.map((e) => e.hex)));
    expect(plan?.target.name).toBe('guard1');
    expect(plan?.step).not.toBeNull();
  });

  it('switches without moving when another enemy is already in range', () => {
    const trapped = enemy('trapped', o(6, 7));
    const near = enemy('near', o(3, 4));
    const guards = [enemy('guard1', o(6, 6)), enemy('guard2', o(5, 7))];
    const all = [trapped, near, ...guards];
    const plan = planMove('A', o(3, 3), 1, trapped, all, all, rules, freeExcept(all.map((e) => e.hex)));
    expect(plan).toEqual({ target: near, step: null });
  });

  it('waits when it can reach no enemy', () => {
    const target = enemy('target', o(3, 7));
    // The unit at (0, 0) is boxed in by allies.
    const plan = planMove('A', o(0, 0), 1, target, [target], [target], rules, freeExcept([o(1, 0), o(0, 1), target.hex]));
    expect(plan).toBeNull();
  });
});

it('takes half a second per step', () => {
  expect(MOVE_TICKS).toBe(15);
});
