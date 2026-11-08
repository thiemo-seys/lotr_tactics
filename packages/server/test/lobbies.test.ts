import { describe, expect, it } from 'vitest';
import { LOBBY, TIMERS } from '../src/config.js';
import { Lobbies, type LobbiesOptions } from '../src/lobbies.js';
import type { Client } from '../src/lobby.js';
import { localPlayer, type Player } from '../src/players.js';
import type { AccountView, ServerMessage } from '../src/protocol.js';
import type { MatchResult } from '../src/results.js';
import { FakeHost, last } from './helpers.js';

/** A connection that keeps what it's sent, as JSON would deliver it. */
class FakeClient implements Client {
  readonly inbox: ServerMessage[] = [];
  readonly player: Player;
  closed = false;

  /** A connection for an account, by default one named after its id. */
  constructor(id: string = `account-${++accounts}`, name: string = id) {
    this.player = { id, name, claimed: false, rating: null };
  }

  close(): void {
    this.closed = true;
  }

  send(message: ServerMessage): void {
    this.inbox.push(JSON.parse(JSON.stringify(message)) as ServerMessage);
  }

  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return last(this.inbox, type);
  }
}

let accounts = 0;

function me(client: Client): AccountView {
  return { id: client.player.id, name: client.player.name, claimed: client.player.claimed, canRename: true, needsName: false, googleEnabled: false };
}

function setup(options: LobbiesOptions = {}) {
  const host = new FakeHost();
  const results: MatchResult[] = [];
  const lobbies = new Lobbies(host, { onResult: (r) => results.push(r), ...options });
  const say = (client: Client, message: object | string) =>
    lobbies.receive(client, typeof message === 'string' ? message : JSON.stringify(message));
  const connect = (client: FakeClient) => {
    lobbies.connect(client, me(client));
    return client;
  };
  return { host, lobbies, say, connect, results };
}

/** A lobby with people in it, named and with account ids as given, the first being the host. */
function lobbyOf(names: string[], options: LobbiesOptions = {}) {
  const t = setup(options);
  const clients = names.map((name) => t.connect(new FakeClient(name, name)));
  t.say(clients[0]!, { type: 'create' });
  const code = clients[0]!.last('joined')!.code;
  for (let i = 1; i < names.length; i++) t.say(clients[i]!, { type: 'join', code });
  return { ...t, clients, code };
}

/** Plays a started lobby to its end with the timers alone. */
function playToEnd(t: { host: FakeHost; lobbies: Lobbies }, done: () => boolean): void {
  for (let i = 0; i < 2000 && !done(); i++) {
    t.host.wait(60);
    t.lobbies.update();
  }
  expect(done()).toBe(true);
}

describe('lobbies', () => {
  it('creates a lobby with a 5-character code and the creator as host in seat 0', () => {
    const { clients, code } = lobbyOf(['Frodo']);
    const joined = clients[0]!.last('joined')!;
    expect(joined.seat).toBe(0);
    expect(code).toMatch(new RegExp(`^[${LOBBY.codeAlphabet}]{5}$`));
    const lobby = clients[0]!.last('lobby')!.lobby;
    expect(lobby).toMatchObject({ code, host: 0, ranked: false, started: false });
    expect(lobby.seats[0]).toEqual({ kind: 'person', name: 'Frodo', connected: true, player: 'Frodo', guest: true });
    expect(lobby.seats[1]).toEqual({ kind: 'empty', name: '', connected: false, player: null, guest: false });
    expect(lobby.seats.slice(1).every((s) => s.kind === 'empty')).toBe(true);
  });

  it('seats people in the lowest free seat, and codes ignore case', () => {
    const { clients, code, say } = lobbyOf(['Frodo', 'Sam', 'Merry']);
    expect(clients.map((c) => c.last('joined')!.seat)).toEqual([0, 1, 2]);
    say(clients[1]!, { type: 'leave' });
    expect(clients[1]!.last('left')).toBeDefined();
    const pippin = new FakeClient('Pippin');
    say(pippin, { type: 'join', code: ` ${code.toLowerCase()} ` });
    expect(pippin.last('joined')!.seat).toBe(1);
    expect(clients[0]!.last('lobby')!.lobby.seats.map((s) => s.name).slice(0, 3)).toEqual(['Frodo', 'Pippin', 'Merry']);
  });

  it('refuses unknown codes, full lobbies and started games', () => {
    const { clients, code, say } = lobbyOf(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    const late = new FakeClient();
    say(late, { type: 'join', code: 'ZZZZZ' });
    expect(late.last('refused')).toEqual({ type: 'refused', request: 'join', reason: 'There is no lobby with that code.' });
    say(late, { type: 'join', code });
    expect(late.last('refused')!.reason).toBe('That lobby is full.');
    say(clients[7]!, { type: 'leave' });
    say(clients[0]!, { type: 'start' });
    say(late, { type: 'join', code });
    expect(late.last('refused')!.reason).toBe('That game has already started.');
  });

  it('refuses creating or joining from a connection already in a lobby', () => {
    const { clients, code, say } = lobbyOf(['Frodo']);
    say(clients[0]!, { type: 'join', code });
    expect(clients[0]!.last('refused')!.reason).toBe('Leave your lobby first.');
    say(clients[0]!, { type: 'create' });
    expect(clients[0]!.last('refused')!.reason).toBe('Leave your lobby first.');
  });

  it('takes names from accounts, and shows a rename in the lobby', () => {
    const { clients, lobbies, code } = lobbyOf(['frodo', 'sam']);
    expect(clients[1]!.last('lobby')!.lobby.seats.map((s) => s.name).slice(0, 2)).toEqual(['frodo', 'sam']);
    lobbies.updatePlayer('sam', { name: 'Samwise' });
    expect(clients[0]!.last('lobby')!.lobby).toMatchObject({ code });
    expect(clients[0]!.last('lobby')!.lobby.seats[1]).toMatchObject({ name: 'Samwise', player: 'sam' });
    expect(clients[1]!.player.name).toBe('Samwise');
  });

  it('drops the guest mark when a person claims their account', () => {
    const { clients, lobbies } = lobbyOf(['frodo', 'sam']);
    expect(clients[0]!.last('lobby')!.lobby.seats[1]).toMatchObject({ guest: true });
    const sent = clients[0]!.inbox.length;
    lobbies.updatePlayer('sam', { claimed: true });
    expect(clients[0]!.last('lobby')!.lobby.seats[1]).toMatchObject({ name: 'sam', guest: false });
    expect(clients[1]!.player.claimed).toBe(true);
    // Nothing changed, nothing sent.
    const after = clients[0]!.inbox.length;
    expect(after).toBeGreaterThan(sent);
    lobbies.updatePlayer('sam', { claimed: true, name: 'sam' });
    expect(clients[0]!.inbox.length).toBe(after);
  });
});

describe('guest marks', () => {
  it('are for people without a claimed account, but not the offline player, who has no account', () => {
    const { connect, say } = setup();
    const guest = connect(new FakeClient('ann', 'Ann'));
    say(guest, { type: 'create' });
    expect(guest.last('lobby')!.lobby.seats[0]).toMatchObject({ kind: 'person', guest: true });
    const offline = new FakeClient();
    (offline as { player: Player }).player = localPlayer();
    connect(offline);
    say(offline, { type: 'create' });
    expect(offline.last('lobby')!.lobby.seats[0]).toMatchObject({ kind: 'person', name: 'You', player: 'local', guest: false });
  });
});

describe('signing out and deleting', () => {
  it('know which lobby an account has a seat in, until it leaves or the game ends', () => {
    const { clients, lobbies, code, say } = lobbyOf(['frodo', 'sam']);
    expect(lobbies.seatCode('sam')).toBe(code);
    expect(lobbies.seatCode('merry')).toBeNull();
    say(clients[1]!, { type: 'leave' });
    expect(lobbies.seatCode('sam')).toBeNull();
  });

  it("tell the account's connection it was signed out, then close it as a disconnect", () => {
    const { clients, lobbies, say, code } = lobbyOf(['frodo', 'sam']);
    say(clients[0]!, { type: 'start' });
    lobbies.signedOut('sam', 'everywhere');
    expect(clients[1]!.last('signedOut')).toEqual({ type: 'signedOut', reason: 'everywhere' });
    expect(clients[1]!.closed).toBe(true);
    expect(lobbies.client('sam')).toBeUndefined();
    // Disconnected, not gone: the seat is still the account's, and its bot plays it.
    expect(clients[0]!.last('lobby')!.lobby.seats[1]).toMatchObject({ kind: 'person', connected: false });
    expect(lobbies.seatCode('sam')).toBe(code);
    // Nothing more comes from it.
    const sent = clients[1]!.inbox.length;
    lobbies.signedOut('sam', 'deleted');
    expect(clients[1]!.inbox.length).toBe(sent);
  });
});

describe('starting', () => {
  it('passes the host on when the host leaves before the start', () => {
    const { clients, say } = lobbyOf(['Frodo', 'Sam', 'Merry']);
    say(clients[1]!, { type: 'start' });
    expect(clients[1]!.last('refused')!.reason).toBe('Only the host can start the game.');
    say(clients[0]!, { type: 'leave' });
    expect(clients[1]!.last('lobby')!.lobby.host).toBe(1);
    say(clients[1]!, { type: 'start' });
    expect(clients[2]!.last('lobby')!.lobby.started).toBe(true);
  });

  it('fills the empty seats with bots and starts the game for everyone', () => {
    const { clients, say } = lobbyOf(['Frodo', 'Sam']);
    say(clients[0]!, { type: 'start' });
    const lobby = clients[1]!.last('lobby')!.lobby;
    expect(lobby.seats.map((s) => s.name)).toEqual(['Frodo', 'Sam', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5', 'Bot 6']);
    expect(lobby.seats.slice(2).every((s) => s.kind === 'bot')).toBe(true);
    const [a, b] = [clients[0]!.last('state')!.state, clients[1]!.last('state')!.state];
    expect([a.you, b.you]).toEqual([0, 1]);
    expect(a.step).toEqual({ kind: 'planning', ms: TIMERS.planning * 1000 });
    expect([a.stage, a.round, a.type]).toEqual([1, 1, 'start']);
    expect(a.players).toEqual(b.players);
    // The lobby says the game started before the first state arrives.
    expect(clients[0]!.inbox.findIndex((m) => m.type === 'state')).toBeGreaterThan(clients[0]!.inbox.findLastIndex((m) => m.type === 'lobby'));
    say(clients[0]!, { type: 'start' });
    expect(clients[0]!.last('refused')!.reason).toBe('The game has already started.');
  });

  it('routes actions and Ready to the match, and refuses them before the start', () => {
    const { clients, say } = lobbyOf(['Frodo']);
    say(clients[0]!, { type: 'ready' });
    expect(clients[0]!.last('refused')).toEqual({ type: 'refused', request: 'ready', reason: 'The game has not started.' });
    say(clients[0]!, { type: 'start' });
    say(clients[0]!, { type: 'act', action: { type: 'reroll' } });
    expect(clients[0]!.last('refused')!.reason).toBe('The shop opens next round.');
    say(clients[0]!, { type: 'act', action: { type: 'equip', item: 0, to: { bench: 0 } } });
    expect(clients[0]!.last('state')!.state.me.bench[0]!.items).toHaveLength(1);
    // The start round has no fight: Ready goes straight on to 1-2.
    say(clients[0]!, { type: 'ready' });
    expect(clients[0]!.last('state')!.state.round).toBe(2);
    expect(clients[0]!.last('round')).toBeUndefined();
    say(clients[0]!, { type: 'ready' });
    expect(clients[0]!.last('round')).toBeDefined();
    expect(clients[0]!.last('state')!.state.step.kind).toBe('fight');
  });
});

describe('seats by account', () => {
  it('gives a person their seat back on a new connection of the same account, and no one else', () => {
    const { clients, code, lobbies, say, connect } = lobbyOf(['Frodo', 'Sam']);
    say(clients[0]!, { type: 'start' });
    lobbies.disconnect(clients[1]!);
    expect(clients[0]!.last('lobby')!.lobby.seats[1]).toEqual({ kind: 'person', name: 'Sam', connected: false, player: 'Sam', guest: true });
    const stranger = connect(new FakeClient('Gollum'));
    say(stranger, { type: 'rejoin', code });
    expect(stranger.last('refused')!.reason).toBe('You have no seat in that lobby.');
    const again = connect(new FakeClient('Sam'));
    // The greeting says which game the account is in, and the page rejoins it.
    expect(again.inbox[0]).toEqual({ type: 'hello', me: me(again), game: { code } });
    say(again, { type: 'rejoin', code });
    expect(again.inbox.map((m) => m.type)).toEqual(['hello', 'joined', 'lobby', 'state']);
    expect(again.last('joined')).toEqual({ type: 'joined', code, seat: 1 });
    expect(clients[0]!.last('lobby')!.lobby.seats[1]!.connected).toBe(true);
    // Rejoining again from the same connection only sends the seat again.
    say(again, { type: 'rejoin', code });
    expect(again.last('refused')).toBeUndefined();
  });

  it('greets a connection with no game when the account has no seat', () => {
    const { connect } = setup();
    const frodo = connect(new FakeClient('Frodo'));
    expect(frodo.inbox).toEqual([{ type: 'hello', me: me(frodo), game: null }]);
  });

  it('keeps an account to one lobby, whichever connection it uses', () => {
    const { clients, code, lobbies, say, connect } = lobbyOf(['Frodo']);
    lobbies.disconnect(clients[0]!);
    const tab = connect(new FakeClient('Frodo'));
    say(tab, { type: 'create' });
    expect(tab.last('refused')!.reason).toBe(`You already have a seat in lobby ${code}.`);
    say(tab, { type: 'join', code });
    expect(tab.last('refused')!.reason).toBe(`You already have a seat in lobby ${code}.`);
    expect(lobbies.count).toBe(1);
    // Rejoining and leaving frees the account.
    say(tab, { type: 'rejoin', code });
    say(tab, { type: 'leave' });
    say(tab, { type: 'create' });
    expect(tab.last('joined')!.code).not.toBe(code);
  });

  it('frees the account when it leaves a started game for good, and keeps it out of that game', () => {
    const { clients, code, say } = lobbyOf(['Frodo', 'Sam']);
    say(clients[0]!, { type: 'start' });
    say(clients[1]!, { type: 'leave' });
    say(clients[1]!, { type: 'rejoin', code });
    expect(clients[1]!.last('refused')!.reason).toBe('You have no seat in that lobby.');
    say(clients[1]!, { type: 'create' });
    expect(clients[1]!.last('joined')!.code).not.toBe(code);
  });

  it('replaces the older connection of an account, which hands over its seat without its bot stepping in', () => {
    const { clients, code, say, connect } = lobbyOf(['Frodo', 'Sam']);
    say(clients[0]!, { type: 'start' });
    const before = clients[1]!.inbox.length;
    const seen = clients[0]!.inbox.length;
    const tab = connect(new FakeClient('Sam'));
    expect(clients[1]!.inbox.slice(before)).toEqual([{ type: 'replaced' }]);
    expect(clients[1]!.closed).toBe(true);
    expect(tab.inbox.map((m) => m.type)).toEqual(['hello', 'joined', 'lobby', 'state']);
    expect(tab.inbox[0]).toMatchObject({ game: { code } });
    // The seat stayed connected throughout.
    const lobbies = clients[0]!.inbox.slice(seen).filter((m) => m.type === 'lobby');
    expect(lobbies.length).toBeGreaterThan(0);
    expect(lobbies.every((m) => m.type === 'lobby' && m.lobby.seats[1]!.connected)).toBe(true);
    say(clients[1]!, { type: 'ready' });
    expect(clients[1]!.last('refused')!.reason).toBe("You aren't in a lobby.");
    say(tab, { type: 'ready' });
    expect(tab.last('refused')).toBeUndefined();
  });

  it('replaces a seat still connected elsewhere when it rejoins', () => {
    const t = lobbyOf(['Frodo']);
    // Without connect(), as a host that doesn't greet connections might do.
    const tab = new FakeClient('Frodo');
    t.say(tab, { type: 'rejoin', code: t.code });
    expect(t.clients[0]!.last('replaced')).toEqual({ type: 'replaced' });
    t.say(t.clients[0]!, { type: 'start' });
    expect(t.clients[0]!.last('refused')!.reason).toBe("You aren't in a lobby.");
    t.say(tab, { type: 'start' });
    expect(tab.last('state')).toBeDefined();
  });
});

describe('closing lobbies', () => {
  it('closes a lobby that has not started 60 seconds after its last person disconnects', () => {
    const { clients, lobbies, host, results } = lobbyOf(['Frodo']);
    lobbies.disconnect(clients[0]!);
    lobbies.update();
    host.wait(LOBBY.idleSeconds - 1);
    lobbies.update();
    expect(lobbies.count).toBe(1);
    host.wait(1);
    lobbies.update();
    expect(lobbies.count).toBe(0);
    expect(results).toEqual([]);
  });

  it('plays a started game out with bots 60 seconds after its last person disconnects, and reports it', () => {
    const { clients, lobbies, host, say, results } = lobbyOf(['Frodo', 'Sam']);
    say(clients[0]!, { type: 'start' });
    lobbies.disconnect(clients[0]!);
    lobbies.disconnect(clients[1]!);
    lobbies.update();
    host.wait(LOBBY.idleSeconds - 1);
    lobbies.update();
    expect([lobbies.count, results.length]).toEqual([1, 0]);
    host.wait(1);
    lobbies.update();
    expect(lobbies.count).toBe(0);
    expect(results).toHaveLength(1);
    const [result] = results;
    expect(result!.seats.map((s) => s.place).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Disconnected people's places count for them; they didn't leave.
    expect(result!.seats.slice(0, 2).map((s) => [s.player, s.left])).toEqual([
      ['Frodo', false],
      ['Sam', false],
    ]);
  });

  it('keeps a lobby open while someone comes back in time', () => {
    const { clients, code, lobbies, host, say } = lobbyOf(['Frodo']);
    lobbies.disconnect(clients[0]!);
    lobbies.update();
    host.wait(LOBBY.idleSeconds - 1);
    say(new FakeClient('Frodo'), { type: 'rejoin', code });
    host.wait(10);
    lobbies.update();
    expect(lobbies.count).toBe(1);
  });

  it('closes at once when everyone has left, or the game is over and nobody is connected', () => {
    const left = lobbyOf(['Frodo']);
    left.say(left.clients[0]!, { type: 'leave' });
    left.lobbies.update();
    expect(left.lobbies.count).toBe(0);

    const over = lobbyOf(['Frodo', 'Sam']);
    over.say(over.clients[0]!, { type: 'start' });
    // Sam leaves, then Frodo: once nobody is in, the bots finish the game at once.
    over.say(over.clients[1]!, { type: 'leave' });
    over.say(over.clients[0]!, { type: 'leave' });
    over.lobbies.update();
    expect(over.lobbies.count).toBe(0);
  });

  it('refuses new lobbies when the server is full', () => {
    const { lobbies, say } = setup();
    for (let i = 0; i < LOBBY.maxLobbies; i++) say(new FakeClient(), { type: 'create' });
    expect(lobbies.count).toBe(LOBBY.maxLobbies);
    const late = new FakeClient();
    say(late, { type: 'create' });
    expect(late.last('refused')!.reason).toBe('The server is full. Try again later.');
  });
});

describe('messages', () => {
  it('refuses malformed messages without changing anything', () => {
    const { clients, say } = lobbyOf(['Frodo']);
    say(clients[0]!, { type: 'start' });
    // Every change sends a new state, so getting only a refusal means nothing changed.
    const bad = [
      'not json',
      '[]',
      '{}',
      { type: 'join' },
      { type: 'join', code: 5 },
      { type: 'join', code: 'x'.repeat(201) },
      { type: 'rejoin' },
      { type: 'act' },
      { type: 'act', action: 5 },
      { type: 'act', action: { slot: 0 } },
      { type: 'shout' },
    ];
    for (const message of bad) {
      clients[0]!.inbox.length = 0;
      say(clients[0]!, message);
      expect(clients[0]!.inbox).toEqual([{ type: 'refused', request: 'unknown', reason: "That message isn't understood." }]);
    }
    const odd = [
      { type: 'buy', slot: 99 },
      { type: 'buy', slot: '0' },
      { type: 'move', from: { bench: -1 }, to: { col: 0, row: 0 } },
      { type: 'lock', locked: 'yes' },
      { type: 'pick', option: 1.5 },
      { type: 'constructor' },
    ];
    for (const action of odd) {
      clients[0]!.inbox.length = 0;
      say(clients[0]!, { type: 'act', action });
      expect(clients[0]!.inbox.map((m) => m.type)).toEqual(['refused']);
    }
    const stranger = new FakeClient();
    say(stranger, { type: 'act', action: { type: 'reroll' } });
    expect(stranger.inbox).toEqual([{ type: 'refused', request: 'act', reason: "You aren't in a lobby." }]);
  });
});

describe('results', () => {
  it('reports a finished private game: 8 seats with places 1 to 8, names and final boards', () => {
    const t = lobbyOf(['Frodo', 'Sam']);
    t.say(t.clients[0]!, { type: 'start' });
    const startedAt = t.host.time;
    playToEnd(t, () => t.results.length > 0);
    expect(t.results).toHaveLength(1);
    const result = t.results[0]!;
    expect(result.kind).toBe('private');
    expect(result.durationMs).toBe(t.host.time - startedAt);
    expect(result.lastRound.stage).toBeGreaterThan(1);
    expect(result.seats.map((s) => s.seat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.seats.map((s) => s.place).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.seats.map((s) => s.player)).toEqual(['Frodo', 'Sam', null, null, null, null, null, null]);
    expect(result.seats.map((s) => s.name)).toEqual(['Frodo', 'Sam', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5', 'Bot 6']);
    // Every seat fought with units on its board, though the game empties a seat's board when it places it.
    for (const seat of result.seats) {
      expect(seat.board.units.length).toBeGreaterThan(0);
      expect(seat.board.level).toBeGreaterThan(1);
      for (const trait of seat.board.traits) expect(trait.tier).toBeGreaterThan(0);
    }
    const winner = result.seats.find((s) => s.place === 1)!;
    expect(t.lobbies.count).toBe(1);
    // The final standings match the game's.
    const state = t.clients[0]!.last('state')!.state;
    expect(state.step.kind).toBe('over');
    expect(state.players.map((p) => p.placement)).toEqual(result.seats.map((s) => s.place));
    expect(winner.board.units).toEqual(
      expect.arrayContaining([expect.objectContaining({ unit: expect.any(String), star: expect.any(Number), items: expect.any(Array) })]),
    );
  });

  it("reports a leaver's place, and boards from the bots' play-out once everyone has left", () => {
    const t = lobbyOf(['Frodo', 'Sam']);
    t.say(t.clients[0]!, { type: 'start' });
    t.say(t.clients[1]!, { type: 'leave' });
    expect(t.results).toEqual([]);
    t.say(t.clients[0]!, { type: 'leave' });
    expect(t.results).toHaveLength(1);
    const result = t.results[0]!;
    expect(result.seats.slice(0, 2).map((s) => [s.player, s.left])).toEqual([
      ['Frodo', true],
      ['Sam', true],
    ]);
    expect(result.seats.map((s) => s.place).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const seat of result.seats) expect(seat.board.units.length).toBeGreaterThan(0);
    // Reported once only.
    t.lobbies.update();
    expect(t.results).toHaveLength(1);
  });

  it('reports nothing without onResult, as in an offline game', () => {
    const t = lobbyOf(['local'], { onResult: undefined });
    t.say(t.clients[0]!, { type: 'start' });
    t.say(t.clients[0]!, { type: 'leave' });
    expect(t.results).toEqual([]);
    expect(t.lobbies.count).toBe(1);
    t.lobbies.update();
    expect(t.lobbies.count).toBe(0);
  });

  it('reports nothing for a lobby that never started', () => {
    const t = lobbyOf(['Frodo']);
    t.say(t.clients[0]!, { type: 'leave' });
    t.lobbies.update();
    expect(t.results).toEqual([]);
  });
});
