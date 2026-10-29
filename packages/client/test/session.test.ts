import { describe, expect, it } from 'vitest';
import { Session, YOU, yourFight, yourTeam } from '../src/session.js';

describe('Session', () => {
  it('starts at the first Council with the bots picked and the person still to pick', () => {
    const session = new Session(1);
    const council = session.game.state.council!;
    expect(session.yourPick).toBe(true);
    expect(council.options.filter((o) => o.pickedBy !== null)).toHaveLength(7);
    expect(council.options.some((o) => o.pickedBy === YOU)).toBe(false);
  });

  it('moves on to 1-2 once the person picks, with the bots having planned', () => {
    const session = new Session(2);
    const option = session.game.state.council!.options.findIndex((o) => o.pickedBy === null);
    expect(session.pick(option)).toBe(true);
    expect([session.game.state.stage, session.game.state.round, session.game.state.phase]).toEqual([1, 2, 'planning']);
    // Bots buy a unit at 1-2 with their 2 gold, since their boards have room.
    for (const p of session.game.state.players.slice(1)) expect(p.gold).toBeLessThan(2);
    expect(session.game.state.players[YOU]!.gold).toBe(2);
  });

  it('gives the person a random option when their time runs out', () => {
    const session = new Session(3);
    session.endPick();
    expect(session.game.state.phase).toBe('planning');
    expect(session.game.state.players[YOU]!.items).toHaveLength(1);
  });

  it("finds the person's fight and team each round", () => {
    const session = new Session(4);
    session.endPick();
    while (session.game.state.stage < 2 || session.game.state.round < 2) {
      if (session.yourPick) session.endPick();
      const report = session.endPlanning();
      const fight = yourFight(report)!;
      expect(fight).not.toBeNull();
      expect(fight.kind === 'pve' ? fight.home : [fight.home, fight.away]).toEqual(fight.kind === 'pve' ? YOU : expect.arrayContaining([YOU]));
      if (fight.kind !== 'pve') expect(yourTeam(fight)).toBe(fight.home === YOU ? 'A' : 'B');
    }
  });

  it('plays a whole game to the end once the person is out', () => {
    const session = new Session(5);
    // The person never buys or places anything, so they lose.
    while (!session.out) {
      if (session.yourPick) session.endPick();
      else session.endPlanning();
    }
    session.finish();
    expect(session.game.isOver()).toBe(true);
    expect(session.game.state.players.map((p) => p.placement).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
