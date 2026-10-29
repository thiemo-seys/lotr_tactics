// Acceptance criteria from docs/sim-spec.md section 15: determinism, fairness and speed.

import { describe, expect, it } from 'vitest';
import { simulateCombat } from '../src/combat/combat.js';
import type { CombatEvent } from '../src/combat/events.js';
import { BOARDS, input, mirrorMatch, placed } from './helpers.js';

/** FNV-1a hash of the event log. */
function hashEvents(events: readonly CombatEvent[]): string {
  const text = JSON.stringify(events);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16);
}

describe('determinism', () => {
  const fight = input(BOARDS.full, [placed('saruman', 3, 0), ...BOARDS.tanks, ...BOARDS.archers]);

  it('gives an identical event log for the same input', () => {
    for (const seed of [1, 99, 123456]) {
      expect(hashEvents(simulateCombat({ ...fight, seed }).events)).toBe(hashEvents(simulateCombat({ ...fight, seed }).events));
    }
  });

  it('can give a different fight for a different seed', () => {
    expect(hashEvents(simulateCombat({ ...fight, seed: 1 }).events)).not.toBe(hashEvents(simulateCombat({ ...fight, seed: 2 }).events));
  });
});

describe('fairness', () => {
  // Over 1,000 seeds, the standard deviation of a 50% win share is about 1.6%. A thousand 9 v 9
  // fights take a few seconds, more with other test files running alongside, so these tests get
  // more time than the default 5 s; the performance test below checks speed.
  it.each(Object.entries(BOARDS))('gives a %s board about even odds against its own mirror', { timeout: 30_000 }, (_, board) => {
    let winsA = 0;
    let winsB = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const { outcome } = simulateCombat(mirrorMatch(board, seed));
      if (outcome === 'A') winsA++;
      else if (outcome === 'B') winsB++;
    }
    const shareA = winsA / (winsA + winsB);
    expect(shareA).toBeGreaterThan(0.45);
    expect(shareA).toBeLessThan(0.55);
  });
});

describe('performance', () => {
  it('runs a 9 v 9 fight in well under 10 ms', () => {
    const fights = Array.from({ length: 60 }, (_, seed) => mirrorMatch(BOARDS.full, seed + 1));
    for (const fight of fights.slice(0, 10)) simulateCombat(fight); // Warm up the JIT.
    const start = Date.now();
    for (const fight of fights.slice(10)) simulateCombat(fight);
    const msPerFight = (Date.now() - start) / 50;
    expect(msPerFight).toBeLessThan(10);
  });
});
