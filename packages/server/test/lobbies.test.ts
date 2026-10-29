import { describe, expect, it } from 'vitest';
import { LOBBY, TIMERS } from '../src/config.js';
import { Lobbies } from '../src/lobbies.js';
import { cleanName, type Client } from '../src/lobby.js';
import type { ServerMessage } from '../src/protocol.js';
import { FakeHost, last } from './helpers.js';

/** A connection that keeps what it's sent, as JSON would deliver it. */
class FakeClient implements Client {
  readonly inbox: ServerMessage[] = [];

  send(message: ServerMessage): void {
    this.inbox.push(JSON.parse(JSON.stringify(message)) as ServerMessage);
  }

  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return last(this.inbox, type);
  }
}

function setup() {
  const host = new FakeHost();
  const lobbies = new Lobbies(host);
  const say = (client: Client, message: object | string) =>
    lobbies.receive(client, typeof message === 'string' ? message : JSON.stringify(message));
  return { host, lobbies, say };
}

/** A lobby with people in it, the first being the host. Returns their connections and the code. */
function lobbyOf(names: string[]) {
  const t = setup();
  const clients = names.map(() => new FakeClient());
  t.say(clients[0]!, { type: 'create', name: names[0] });
  const code = clients[0]!.last('joined')!.code;
  for (let i = 1; i < names.length; i++) t.say(clients[i]!, { type: 'join', code, name: names[i] });
  return { ...t, clients, code };
}

describe('lobbies', () => {
  it('creates a lobby with a 5-character code and the creator as host in seat 0', () => {
    const { clients, code } = lobbyOf(['Frodo']);
    const joined = clients[0]!.last('joined')!;
    expect(joined.seat).toBe(0);
    expect(code).toMatch(new RegExp(`^[${LOBBY.codeAlphabet}]{5}$`));
    const lobby = clients[0]!.last('lobby')!.lobby;
    expect(lobby).toMatchObject({ code, host: 0, started: false });
    expect(lobby.seats[0]).toEqual({ kind: 'person', name: 'Frodo', connected: true });
    expect(lobby.seats.slice(1).every((s) => s.kind === 'empty')).toBe(true);
  });

  it('seats people in the lowest free seat, and codes ignore case', () => {
    const { clients, code, say } = lobbyOf(['Frodo', 'Sam', 'Merry']);
    expect(clients.map((c) => c.last('joined')!.seat)).toEqual([0, 1, 2]);
    say(clients[1]!, { type: 'leave' });
    expect(clients[1]!.last('left')).toBeDefined();
    const pippin = new FakeClient();
    say(pippin, { type: 'join', code: ` ${code.toLowerCase()} `, name: 'Pippin' });
    expect(pippin.last('joined')!.seat).toBe(1);
    expect(clients[0]!.last('lobby')!.lobby.seats.map((s) => s.name).slice(0, 3)).toEqual(['Frodo', 'Pippin', 'Merry']);
  });

  it('refuses unknown codes, full lobbies and started games', () => {
    const { clients, code, say } = lobbyOf(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    const late = new FakeClient();
    say(late, { type: 'join', code: 'ZZZZZ', name: 'Late' });
    expect(late.last('refused')).toEqual({ type: 'refused', request: 'join', reason: 'There is no lobby with that code.' });
    say(late, { type: 'join', code, name: 'Late' });
    expect(late.last('refused')!.reason).toBe('That lobby is full.');
    say(clients[7]!, { type: 'leave' });
    say(clients[0]!, { type: 'start' });
    say(late, { type: 'join', code, name: 'Late' });
    expect(late.last('refused')!.reason).toBe('That game has already started.');
  });

  it('refuses creating or joining from a connection already in a lobby', () => {
    const { clients, code, say } = lobbyOf(['Frodo']);
    say(clients[0]!, { type: 'join', code, name: 'Frodo' });
    expect(clients[0]!.last('refused')!.reason).toBe('Leave your lobby first.');
    say(clients[0]!, { type: 'create', name: 'Frodo' });
    expect(clients[0]!.last('refused')!.reason).toBe('Leave your lobby first.');
  });

  it('cleans names', () => {
    expect(cleanName('  Gandalf\u0007 the Grey  ', 0)).toBe('Gandalf the Grey');
    expect(cleanName('x'.repeat(50), 0)).toHaveLength(LOBBY.nameLength);
    expect(cleanName(' \n ', 4)).toBe('Player 5');
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

  it('fills the empty seats with bots and starts the first Council for everyone', () => {
    const { clients, say } = lobbyOf(['Frodo', 'Sam']);
    say(clients[0]!, { type: 'start' });
    const lobby = clients[1]!.last('lobby')!.lobby;
    expect(lobby.seats.map((s) => s.name)).toEqual(['Frodo', 'Sam', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5', 'Bot 6']);
    expect(lobby.seats.slice(2).every((s) => s.kind === 'bot')).toBe(true);
    const [a, b] = [clients[0]!.last('state')!.state, clients[1]!.last('state')!.state];
    expect([a.you, b.you]).toEqual([0, 1]);
    expect(a.step).toEqual({ kind: 'council', ms: TIMERS.councilPick * 1000 });
    expect(a.council).toEqual(b.council);
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
    expect(clients[0]!.last('refused')!.reason).toBe('Units can only be bought and moved during planning.');
    const option = clients[0]!.last('state')!.state.council!.options.findIndex((o) => o.pickedBy === null);
    say(clients[0]!, { type: 'act', action: { type: 'pick', option } });
    expect(clients[0]!.last('state')!.state.step.kind).toBe('planning');
    say(clients[0]!, { type: 'ready' });
    expect(clients[0]!.last('round')).toBeDefined();
    expect(clients[0]!.last('state')!.state.step.kind).toBe('fight');
  });
});

describe('rejoining', () => {
  it('gives a person their seat back with their token after a disconnect', () => {
    const { clients, code, lobbies, say } = lobbyOf(['Frodo', 'Sam']);
    say(clients[0]!, { type: 'start' });
    const token = clients[1]!.last('joined')!.token;
    lobbies.disconnect(clients[1]!);
    expect(clients[0]!.last('lobby')!.lobby.seats[1]).toEqual({ kind: 'person', name: 'Sam', connected: false });
    const again = new FakeClient();
    say(again, { type: 'rejoin', code, token: 'wrong' });
    expect(again.last('refused')!.reason).toBe('Your seat in that lobby is gone.');
    say(again, { type: 'rejoin', code, token });
    expect(again.inbox.map((m) => m.type)).toEqual(['refused', 'joined', 'lobby', 'state']);
    expect(again.last('joined')!.seat).toBe(1);
    expect(clients[0]!.last('lobby')!.lobby.seats[1]!.connected).toBe(true);
  });

  it('drops the older connection when a seat rejoins from somewhere else', () => {
    const { clients, code, say } = lobbyOf(['Frodo']);
    const token = clients[0]!.last('joined')!.token;
    const tab = new FakeClient();
    say(tab, { type: 'rejoin', code, token });
    expect(clients[0]!.last('left')!.reason).toBe('You joined this game from somewhere else.');
    say(clients[0]!, { type: 'start' });
    expect(clients[0]!.last('refused')!.reason).toBe("You aren't in a lobby.");
    say(tab, { type: 'start' });
    expect(tab.last('state')).toBeDefined();
  });

  it("doesn't let someone who left a started game back in", () => {
    const { clients, code, say } = lobbyOf(['Frodo', 'Sam']);
    say(clients[0]!, { type: 'start' });
    const token = clients[1]!.last('joined')!.token;
    say(clients[1]!, { type: 'leave' });
    say(clients[1]!, { type: 'rejoin', code, token });
    expect(clients[1]!.last('refused')!.reason).toBe('Your seat in that lobby is gone.');
  });
});

describe('closing lobbies', () => {
  it('closes a lobby 60 seconds after its last person disconnects', () => {
    const { clients, lobbies, host, say } = lobbyOf(['Frodo']);
    say(clients[0]!, { type: 'start' });
    lobbies.disconnect(clients[0]!);
    lobbies.update();
    host.wait(LOBBY.idleSeconds - 1);
    lobbies.update();
    expect(lobbies.count).toBe(1);
    host.wait(1);
    lobbies.update();
    expect(lobbies.count).toBe(0);
  });

  it('keeps a lobby open while someone comes back in time', () => {
    const { clients, code, lobbies, host, say } = lobbyOf(['Frodo']);
    const token = clients[0]!.last('joined')!.token;
    lobbies.disconnect(clients[0]!);
    lobbies.update();
    host.wait(LOBBY.idleSeconds - 1);
    say(new FakeClient(), { type: 'rejoin', code, token });
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
    for (let i = 0; i < LOBBY.maxLobbies; i++) say(new FakeClient(), { type: 'create', name: `P${i}` });
    expect(lobbies.count).toBe(LOBBY.maxLobbies);
    const late = new FakeClient();
    say(late, { type: 'create', name: 'Late' });
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
      { type: 'join', code: 5, name: 'x' },
      { type: 'create', name: 'x'.repeat(201) },
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
