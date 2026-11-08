import type { ServerMessage } from '@lotr-tactics/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocketConnection, savedSeat } from '../src/connection.js';

/** A WebSocket the test opens, closes and sends messages through. */
class FakeSocket extends EventTarget {
  static readonly OPEN = 1;
  static sockets: FakeSocket[] = [];
  readyState = 0;
  readonly sent: unknown[] = [];

  constructor(readonly url: string) {
    super();
    FakeSocket.sockets.push(this);
  }

  send(text: string): void {
    this.sent.push(JSON.parse(text));
  }

  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }

  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }

  receive(message: ServerMessage): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}

const me = { id: 'a1', name: 'Guest 0427', claimed: false, canRename: true, needsName: false, googleEnabled: false };
const flush = () => new Promise((done) => setTimeout(done, 0));

function connect(seat: string | null = null) {
  const store = new Map<string, string>();
  if (seat !== null) store.set('lotr-tactics-seat', JSON.stringify({ code: seat }));
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  const events = { messages: [] as ServerMessage[], closed: [] as string[] };
  const connection = new SocketConnection('ws://test/ws', { message: (m) => events.messages.push(m), closed: (r) => events.closed.push(r) }, { signedIn: true });
  return { connection, events, socket: () => FakeSocket.sockets.at(-1)! };
}

beforeEach(() => {
  FakeSocket.sockets = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SocketConnection', () => {
  it("rejoins the game hello names, after a reload or on another device, and sends what was queued while it opened", () => {
    const { connection, events, socket } = connect();
    connection.send({ type: 'ready' });
    socket().open();
    socket().receive({ type: 'hello', me, game: { code: 'QWERT' } });
    expect(socket().sent).toEqual([{ type: 'ready' }, { type: 'rejoin', code: 'QWERT' }]);
    expect(events.messages.map((m) => m.type)).toEqual(['hello']);
    socket().receive({ type: 'joined', code: 'QWERT', seat: 3 });
    expect([connection.seatCode, savedSeat()?.code]).toEqual(['QWERT', 'QWERT']);
    socket().receive({ type: 'left', reason: 'You left the lobby.' });
    expect([connection.seatCode, savedSeat()]).toEqual([null, null]);
  });

  it("rejoins the tab's own seat as it opens, and doesn't ask again when hello names the same game", () => {
    const { socket } = connect('QWERT');
    socket().open();
    socket().receive({ type: 'hello', me, game: { code: 'QWERT' } });
    expect(socket().sent).toEqual([{ type: 'rejoin', code: 'QWERT' }]);
    // A game that isn't the tab's: the account's seat is there.
    const other = connect('QWERT');
    other.socket().open();
    other.socket().receive({ type: 'hello', me, game: { code: 'ZXCVB' } });
    expect(other.socket().sent).toEqual([
      { type: 'rejoin', code: 'QWERT' },
      { type: 'rejoin', code: 'ZXCVB' },
    ]);
  });

  it('passes replaced on and closes for good, without reconnecting or a closed event', async () => {
    vi.useFakeTimers();
    const { events, socket } = connect('QWERT');
    socket().open();
    socket().receive({ type: 'hello', me, game: { code: 'QWERT' } });
    socket().receive({ type: 'replaced' });
    socket().receive({ type: 'lobby', lobby: { code: 'QWERT', host: 0, ranked: false, started: true, seats: [] } });
    socket().close();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(events.messages.map((m) => m.type)).toEqual(['hello', 'replaced']);
    expect(events.closed).toEqual([]);
    expect(FakeSocket.sockets).toHaveLength(1);
    expect(savedSeat()).toBeNull();
  });

  it('passes signedOut on and closes for good, without reconnecting or a closed event', async () => {
    vi.useFakeTimers();
    const { events, socket } = connect('QWERT');
    socket().open();
    socket().receive({ type: 'hello', me, game: { code: 'QWERT' } });
    socket().receive({ type: 'signedOut', reason: 'everywhere' });
    socket().close();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(events.messages.map((m) => m.type)).toEqual(['hello', 'signedOut']);
    expect(events.closed).toEqual([]);
    expect(FakeSocket.sockets).toHaveLength(1);
    expect(savedSeat()).toBeNull();
  });

  it('reconnects and rejoins its seat when the connection drops in a game', async () => {
    vi.useFakeTimers();
    const { events, socket } = connect();
    socket().open();
    socket().receive({ type: 'joined', code: 'QWERT', seat: 1 });
    socket().close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.sockets).toHaveLength(2);
    socket().open();
    expect(socket().sent).toEqual([{ type: 'rejoin', code: 'QWERT' }]);
    expect(events.closed).toEqual([]);
  });

  it('closes for good when the connection drops on the menu, or the server never answers', async () => {
    const { events, socket } = connect();
    socket().open();
    socket().close();
    expect(events.closed).toEqual(['Lost the connection to the game server.']);
    const never = connect();
    never.socket().close();
    // A refused upgrade loads the account again and tries once more.
    await flush();
    expect(FakeSocket.sockets).toHaveLength(3);
    expect(fetch).toHaveBeenCalledWith('/api/me', { credentials: 'same-origin' });
    never.socket().close();
    expect(never.events.closed).toEqual(["Can't reach the game server. Online play needs it running: pnpm dev or pnpm start."]);
  });
});
