import { TIMERS, type ClientMessage, type FightRecord, type Host, type LobbyView, type RoundRecord } from '@lotr-tactics/server';
import type { Team } from '@lotr-tactics/sim';
import { describe, expect, it } from 'vitest';
import { LocalConnection } from '../src/connection.js';
import { yourFight, yourTeam } from '../src/fights.js';
import { PlayFlow, ordinal, outcomeText, standings, type FlowHooks } from '../src/flow.js';

/** A host whose clock only moves when the test moves it. */
function fakeHost(): Host & { time: number } {
  let tokens = 0;
  return { time: 0, now() { return this.time; }, random: () => 0.5, token: () => `token-${++tokens}` };
}

/** Lets the messages queued as microtasks arrive. */
const flush = () => new Promise((done) => setTimeout(done, 0));

/** A flow that records what it asks of the page. */
function recorded(send: (message: ClientMessage) => void = () => {}) {
  const calls = { sent: [] as ClientMessage[], fights: [] as Team[], menus: [] as string[], joined: [] as string[] };
  const hooks: FlowHooks = {
    send: (message) => {
      calls.sent.push(message);
      send(message);
    },
    fight: (_, team) => calls.fights.push(team),
    menu: (message) => calls.menus.push(message),
    joined: (code) => calls.joined.push(code),
  };
  return { flow: new PlayFlow(hooks), calls };
}

const lobby = (started: boolean): LobbyView => ({
  code: 'ABCDE',
  host: 0,
  started,
  seats: [{ kind: 'person', name: 'Ann', connected: true }, { kind: 'person', name: 'Bo', connected: false }],
});

describe('the play flow', () => {
  it('joins a lobby, shows it until the game starts, and goes back to the menu when told', () => {
    const { flow, calls } = recorded();
    flow.receive({ type: 'joined', code: 'ABCDE', seat: 1, token: 't' }, 0);
    expect([flow.you, calls.joined]).toEqual([1, ['ABCDE']]);
    flow.receive({ type: 'lobby', lobby: lobby(false) }, 0);
    expect(flow.show.kind).toBe('lobby');
    expect([flow.seatName(0), flow.seatName(1), flow.seatName(5)]).toEqual(['Ann', 'You', 'Seat 6']);
    flow.receive({ type: 'refused', request: 'start', reason: 'Only the host can start the game.' }, 0);
    expect(flow.lobbyMessage).toBe('Only the host can start the game.');
    flow.receive({ type: 'lobby', lobby: lobby(true) }, 0);
    expect(flow.show.kind).toBe('lobby');
    flow.receive({ type: 'refused', request: 'act', reason: 'Not enough gold.' }, 0);
    expect(calls.menus).toEqual([]);
    flow.receive({ type: 'left', reason: 'You left the lobby.' }, 0);
    flow.receive({ type: 'left', reason: 'You joined this game from somewhere else.' }, 0);
    flow.receive({ type: 'refused', request: 'join', reason: 'That lobby is full.' }, 0);
    expect(calls.menus).toEqual(['', 'You joined this game from somewhere else.', 'That lobby is full.']);
  });

  it('sends only picks in a Council, and nothing outside the game', () => {
    const { flow, calls } = recorded();
    flow.act({ type: 'reroll' });
    flow.show = { kind: 'council' };
    flow.act({ type: 'reroll' });
    flow.act({ type: 'pick', option: 2 });
    flow.show = { kind: 'planning' };
    flow.act({ type: 'reroll' });
    expect(calls.sent).toEqual([
      { type: 'act', action: { type: 'pick', option: 2 } },
      { type: 'act', action: { type: 'reroll' } },
    ]);
  });

  it('goes straight to the results of a round with no fight of yours, as when only your ghost fought', () => {
    const { flow, calls } = recorded();
    const fight = (kind: FightRecord['kind'], home: number, away: number | null): FightRecord => ({
      kind,
      home,
      away,
      input: { seed: 1, stage: 2, teams: { A: [], B: [] } },
      result: { outcome: 'A', survivors: { A: [], B: [] }, finalTick: 0 },
    });
    const round: RoundRecord = { stage: 2, round: 1, fights: [fight('pvp', 1, 2), fight('ghost', 3, 0)], damage: [], eliminated: [] };
    flow.receive({ type: 'round', round }, 5000);
    expect(flow.show).toEqual({ kind: 'results', round, until: 5000 + TIMERS.results * 1000 });
    expect(calls.fights).toEqual([]);
  });

  it('plays an offline game: your fight from your side, then the results, then Ready once while still in', async () => {
    const host = fakeHost();
    let connection: LocalConnection | null = null;
    const { flow, calls } = recorded((message) => connection!.send(message));
    connection = new LocalConnection(5, { message: (m) => flow.receive(m, host.time), closed: () => {} }, { host, autoUpdate: false });
    await flush();
    expect([flow.show.kind, flow.you, flow.inGame]).toEqual(['council', 0, true]);
    expect(flow.secondsLeft(host.time)).toBe(Math.ceil(flow.state!.step.ms! / 1000));

    let rounds = 0;
    let readies = 0;
    for (let i = 0; i < 3000 && flow.show.kind !== 'over'; i++) {
      const { show } = flow;
      if (show.kind === 'council') {
        host.time += flow.state!.step.ms!;
        connection.update();
      } else if (show.kind === 'planning') {
        flow.ready();
      } else if (show.kind === 'fight') {
        rounds++;
        expect(calls.fights.at(-1)).toBe(yourTeam(show.fight, 0));
        expect(show.fight).toBe(yourFight(show.round, 0));
        flow.update(1000, host.time);
        expect(flow.show.kind).toBe('results');
      } else if (show.kind === 'results') {
        expect(flow.resultLines(show.round, false)[0]).toMatch(new RegExp(`^${show.round.stage}-${show.round.round}: (Victory|Defeat|Draw|No fight)`));
        const before = calls.sent.length;
        flow.update(0, show.until - 1);
        expect(flow.show.kind).toBe('results');
        flow.update(0, show.until);
        expect(flow.show.kind).toBe('waiting');
        const sent = calls.sent.slice(before);
        expect(sent).toEqual(flow.me().placement === null ? [{ type: 'ready' }] : []);
        readies += sent.length;
      } else if (show.kind === 'waiting') {
        // Out of the game, nobody waits for the person: the step runs out.
        host.time += flow.state!.step.ms ?? 0;
        connection.update();
      }
      await flush();
    }
    expect(flow.show.kind).toBe('over');
    expect(flow.me().placement).not.toBeNull();
    expect(rounds).toBeGreaterThan(5);
    expect(readies).toBeGreaterThan(5);
    connection.close();
  });
});

describe('scouting', () => {
  it("shows another living player's board in a Council or planning, until the next step", async () => {
    const host = fakeHost();
    let connection: LocalConnection | null = null;
    const { flow, calls } = recorded((message) => connection!.send(message));
    connection = new LocalConnection(5, { message: (m) => flow.receive(m, host.time), closed: () => {} }, { host, autoUpdate: false });
    await flush();
    expect(flow.show.kind).toBe('council');

    flow.scout(3);
    expect([flow.scouting, flow.shownPlayer().seat]).toEqual([3, 3]);
    expect(flow.shownPlayer()).toBe(flow.state!.players[3]);
    // The same player again, yourself, or nobody: back to your own board.
    flow.scout(3);
    expect([flow.scouting, flow.shownPlayer()]).toEqual([null, flow.state!.me]);
    flow.scout(3);
    flow.scout(0);
    expect(flow.scouting).toBeNull();
    flow.scout(3);
    flow.scout(null);
    expect(flow.scouting).toBeNull();

    // A new step goes back to your own board.
    flow.scout(2);
    host.time += flow.state!.step.ms!;
    connection.update();
    await flush();
    expect([flow.show.kind, flow.scouting]).toEqual(['planning', null]);

    // While scouting, your units and items stay put, but the shop works.
    flow.scout(4);
    const sent = calls.sent.length;
    flow.act({ type: 'move', from: { bench: 0 }, to: { col: 3, row: 3 } });
    flow.act({ type: 'sell', from: { bench: 0 } });
    flow.act({ type: 'equip', item: 0, to: { bench: 0 } });
    flow.act({ type: 'ring', to: { bench: 0 } });
    expect(calls.sent.length).toBe(sent);
    flow.act({ type: 'reroll' });
    expect(calls.sent.slice(sent)).toEqual([{ type: 'act', action: { type: 'reroll' } }]);

    // A fight ends scouting, and there is nothing to scout until the next Council or planning.
    flow.ready();
    await flush();
    expect([flow.show.kind, flow.scouting]).toEqual(['fight', null]);
    flow.scout(4);
    expect(flow.scouting).toBeNull();
    connection.close();
  });

  it("can't scout a player who is out, and goes back when the scouted player is knocked out", async () => {
    const { flow } = recorded();
    const connection = new LocalConnection(5, { message: (m) => flow.receive(m, 0), closed: () => {} }, { host: fakeHost(), autoUpdate: false });
    await flush();
    const knockOut = (seat: number) => {
      flow.state = { ...flow.state!, players: flow.state!.players.map((p) => (p.seat === seat ? { ...p, placement: 8 } : p)) };
    };
    knockOut(6);
    flow.scout(6);
    expect(flow.scouting).toBeNull();
    flow.scout(5);
    knockOut(5);
    expect(flow.shownPlayer()).toBe(flow.state!.me);
    expect(flow.ringOf(5)).toBeNull();
    connection.close();
  });
});

describe('results', () => {
  it('name outcomes for the team played, order standings and write places', () => {
    expect([outcomeText('A', 'A'), outcomeText('B', 'A'), outcomeText('draw', 'B')]).toEqual(['Victory', 'Defeat', 'Draw']);
    const players = [
      { seat: 0, placement: 3, hp: -4 },
      { seat: 1, placement: null, hp: 20 },
      { seat: 2, placement: 2, hp: 0 },
      { seat: 3, placement: null, hp: 60 },
    ];
    expect(standings(players).map((p) => p.seat)).toEqual([3, 1, 2, 0]);
    expect([1, 2, 3, 4, 11].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th']);
  });
});
