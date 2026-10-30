import type { Host, MatchView, ServerMessage } from '@lotr-tactics/server';
import { describe, expect, it } from 'vitest';
import { GAME_VERSION, LocalConnection, withVersion } from '../src/connection.js';
import { yourFight, yourTeam } from '../src/fights.js';

/** A host whose clock only moves when the test moves it. */
function fakeHost(): Host & { time: number } {
  let tokens = 0;
  return { time: 0, now() { return this.time; }, random: () => 0.5, token: () => `token-${++tokens}` };
}

/** Lets the messages queued as microtasks arrive. */
const flush = () => new Promise((done) => setTimeout(done, 0));

function lastState(inbox: ServerMessage[]): MatchView {
  for (let i = inbox.length - 1; i >= 0; i--) {
    const m = inbox[i]!;
    if (m.type === 'state') return m.state;
  }
  throw new Error('No state yet.');
}

describe('LocalConnection', () => {
  it('starts an offline game with the person as You in seat 0 and bots in the other seats', async () => {
    const inbox: ServerMessage[] = [];
    new LocalConnection(1, { message: (m) => inbox.push(m), closed: () => {} }, { host: fakeHost(), autoUpdate: false });
    expect(inbox).toEqual([]);
    await flush();
    expect(inbox.map((m) => m.type)).toEqual(['joined', 'lobby', 'lobby', 'state']);
    const started = inbox[2]!;
    const lobby = started.type === 'lobby' ? started.lobby : null;
    expect(lobby!.seats.map((s) => s.name)).toEqual(['You', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5', 'Bot 6', 'Bot 7']);
    expect(lastState(inbox).step.kind).toBe('council');
  });

  it('plays an offline game to the end, finding the person\'s fight each round', async () => {
    const host = fakeHost();
    const inbox: ServerMessage[] = [];
    const connection = new LocalConnection(5, { message: (m) => inbox.push(m), closed: () => {} }, { host, autoUpdate: false });
    await flush();
    let fights = 0;
    for (let i = 0; i < 500 && lastState(inbox).step.kind !== 'over'; i++) {
      const state = lastState(inbox);
      const last = inbox.at(-2);
      if (state.step.kind === 'fight' && last?.type === 'round') {
        fights++;
        const fight = yourFight(last.round, 0);
        if (fight !== null) expect(fight.home === 0 ? 'A' : 'B').toBe(yourTeam(fight, 0));
      }
      // The person never buys anything: Ready in planning and after fights, and the timer in Councils.
      if (state.step.kind !== 'council' && state.me.placement === null) connection.send({ type: 'ready' });
      else {
        host.time += state.step.ms!;
        connection.update();
      }
      await flush();
    }
    const over = lastState(inbox);
    expect(over.step.kind).toBe('over');
    expect(over.players.map((p) => p.placement).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(fights).toBeGreaterThan(5);
    connection.close();
  });
});

describe('withVersion', () => {
  it('adds the build to the messages that enter a lobby, and to no others', () => {
    expect(withVersion({ type: 'create', name: 'Frodo' })).toEqual({ type: 'create', name: 'Frodo', version: GAME_VERSION });
    expect(withVersion({ type: 'join', code: 'ABCDE', name: 'Sam' })).toMatchObject({ version: GAME_VERSION });
    expect(withVersion({ type: 'rejoin', code: 'ABCDE', token: 't' })).toMatchObject({ version: GAME_VERSION });
    expect(withVersion({ type: 'ready' })).toEqual({ type: 'ready' });
  });
});
