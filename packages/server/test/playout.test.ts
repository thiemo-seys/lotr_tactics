// Playing a match out at once (docs/accounts-spec.md section 12) must give the game it would have
// had on its timers, and the final boards must be the ones the seats fought with (section 9.1).

import { describe, expect, it } from 'vitest';
import type { FightReport, PlacedUnit, RoundReport } from '@lotr-tactics/sim';
import { fightBoards } from '../src/results.js';
import { testMatch, timeOut, type TestMatch } from './helpers.js';

/** A match with people in every seat, all disconnected, so bots play every seat on the timers. */
function idleMatch(seed: number): TestMatch {
  const t = testMatch(seed, [0, 1, 2, 3, 4, 5, 6, 7]);
  for (let seat = 0; seat < 8; seat++) t.match.setConnected(seat, false);
  return t;
}

function places(t: TestMatch): (number | null)[] {
  return t.match.view(0).players.map((p) => p.placement);
}

function onTimers(t: TestMatch): void {
  while (!t.match.isOver()) timeOut(t);
}

describe('playing a match out', () => {
  // With bots in every seat, Councils never wait: bots pick at once.
  for (const kind of ['planning', 'fight'] as const) {
    it(`gives the same game as its timers when it starts in a ${kind} step`, () => {
      for (const seed of [1, 2]) {
        const timed = idleMatch(seed);
        onTimers(timed);

        const played = idleMatch(seed);
        let steps = 0;
        // Past the first few rounds, then on to the next step of the kind asked for.
        while (steps < 6 || played.match.stepKind !== kind) {
          expect(played.match.isOver()).toBe(false);
          timeOut(played);
          steps++;
        }
        played.match.playOut();

        expect(played.match.isOver()).toBe(true);
        expect(places(played)).toEqual(places(timed));
        expect(played.match.finalBoards()).toEqual(timed.match.finalBoards());
      }
    });
  }

  it('keeps the One Ring on the unit that wore it in the fight', () => {
    // Over a few games, whoever is shown wearing the Ring fought with it: it is on their board.
    for (const seed of [1, 2, 3, 4]) {
      const t = idleMatch(seed);
      onTimers(t);
      for (const board of t.match.finalBoards()) {
        if (board === null || board.ringBearer === null) continue;
        expect(board.units.map((u) => u.unit)).toContain(board.ringBearer);
      }
    }
  });
});

describe('boards from a round', () => {
  const fight = (kind: FightReport['kind'], home: number, away: number | null, a: PlacedUnit[], b: PlacedUnit[]): FightReport =>
    ({ kind, home, away, input: { seed: 1, stage: 3, teams: { A: a, B: b } }, result: {} as FightReport['result'] }) as FightReport;
  const unit = (unitId: string, ring?: number): PlacedUnit => ({ unitId, star: 1, col: 0, row: 0, items: ['mail'], ...(ring === undefined ? {} : { ring }) }) as PlacedUnit;

  it('takes each seat its own team, skips ghost copies and monsters, and finds the Ring on the unit wearing it', () => {
    const report = {
      stage: 3,
      round: 2,
      damage: [],
      eliminated: [],
      places: [],
      fights: [
        fight('pvp', 0, 1, [unit('sam'), unit('merry', 2)], [unit('pippin')]),
        // Seat 2 fights a ghost copy of seat 0's board, which isn't seat 0's board.
        fight('ghost', 2, 0, [unit('beregond')], [unit('sam')]),
      ],
    } as RoundReport;
    const boards = fightBoards(report, [4, 5, 6]);
    expect([...boards.keys()].sort()).toEqual([0, 1, 2]);
    expect(boards.get(0)).toMatchObject({ level: 4, ringBearer: 'merry', units: [{ unit: 'sam' }, { unit: 'merry' }] });
    expect(boards.get(1)).toMatchObject({ level: 5, ringBearer: null, units: [{ unit: 'pippin', star: 1, items: ['mail'] }] });
    expect(boards.get(2)).toMatchObject({ level: 6, ringBearer: null, units: [{ unit: 'beregond' }] });
  });
});
