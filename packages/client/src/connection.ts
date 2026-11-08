// How the play page talks to a game (docs/server-spec.md section 10): a WebSocket to the game
// server, or lobbies running in the page for offline games. No Three.js and no DOM apart from
// WebSocket, fetch and session storage, so the offline connection can be tested. Online, the page
// has a guest or signed-in account from GET /api/me (docs/accounts-spec.md section 6.1), and seats
// belong to the account.

import { Lobbies, SERVER, localPlayer, type Client, type ClientMessage, type Host, type ServerMessage } from '@lotr-tactics/server';

export interface ConnectionEvents {
  message(message: ServerMessage): void;
  /** The connection is gone for good, and why. */
  closed(reason: string): void;
}

export interface Connection {
  send(message: ClientMessage): void;
  /** Closes the connection on purpose: no reconnecting, and no `closed` event. */
  close(): void;
}

const browserHost: Host = {
  now: () => performance.now(),
  random: () => Math.random(),
};

export interface LocalOptions {
  readonly host?: Host;
  /** False to run the timers only through `update()`, for tests. */
  readonly autoUpdate?: boolean;
}

/** An offline game: one person, called You, and 7 bots, in a lobby that runs in the page and reports nothing. */
export class LocalConnection implements Connection {
  private readonly lobbies: Lobbies;
  private readonly client: Client;
  private readonly timer: ReturnType<typeof setInterval> | null;

  constructor(seed: number, events: ConnectionEvents, options: LocalOptions = {}) {
    this.lobbies = new Lobbies(options.host ?? browserHost, { seed: () => seed });
    this.client = {
      player: localPlayer(),
      // Through JSON and a moment later, as messages from a server would arrive.
      send: (message) => {
        const copy = JSON.parse(JSON.stringify(message)) as ServerMessage;
        queueMicrotask(() => events.message(copy));
      },
    };
    this.timer = options.autoUpdate === false ? null : setInterval(() => this.update(), SERVER.updateSeconds * 1000);
    this.send({ type: 'create' });
    this.send({ type: 'start' });
  }

  send(message: ClientMessage): void {
    this.lobbies.receive(this.client, JSON.stringify(message));
  }

  /** Runs the match's timers. */
  update(): void {
    this.lobbies.update();
  }

  close(): void {
    if (this.timer !== null) clearInterval(this.timer);
  }
}

/** A seat to rejoin: the code of the lobby the account has a seat in. */
export interface Seat {
  readonly code: string;
}

const SEAT_KEY = 'lotr-tactics-seat';

/** Seconds to wait before each attempt to reconnect. */
const RETRY_SECONDS = [1, 2, 4, 8];

/** The seat this tab is in, kept so a reload or a lost connection can rejoin it. */
export function savedSeat(): Seat | null {
  try {
    const text = sessionStorage.getItem(SEAT_KEY);
    const seat = text === null ? null : (JSON.parse(text) as Partial<Seat>);
    return typeof seat?.code === 'string' ? { code: seat.code } : null;
  } catch {
    return null;
  }
}

function saveSeat(seat: Seat | null): void {
  try {
    if (seat === null) sessionStorage.removeItem(SEAT_KEY);
    else sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat));
  } catch {
    // Without storage, a reload can't rejoin, but the game still works.
  }
}

/** The game server's WebSocket, on the page's own origin. */
export function socketUrl(): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

/**
 * Makes sure the browser has a session: GET /api/me makes a guest if it hasn't. The WebSocket's
 * upgrade carries the session cookie (docs/accounts-spec.md section 6.1).
 */
async function signIn(): Promise<void> {
  try {
    await fetch('/api/me', { credentials: 'same-origin' });
  } catch {
    // The WebSocket fails too, and says so.
  }
}

/** A WebSocket to the game server that reconnects and rejoins its seat if the connection drops. */
export class SocketConnection implements Connection {
  private socket: WebSocket | null = null;
  /** Messages sent while connecting. */
  private readonly queue: string[] = [];
  private seat: Seat | null = savedSeat();
  private retries = 0;
  private connected = false;
  private closing = false;
  /** Whether a refused upgrade has been tried again after GET /api/me. */
  private signedInAgain = false;

  constructor(
    private readonly url: string,
    private readonly events: ConnectionEvents,
  ) {
    void this.open(false);
  }

  send(message: ClientMessage): void {
    const text = JSON.stringify(message);
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(text);
    else this.queue.push(text);
  }

  close(): void {
    this.closing = true;
    this.setSeat(null);
    this.socket?.close();
  }

  private async open(rejoin: boolean): Promise<void> {
    await signIn();
    if (this.closing) return;
    const socket = new WebSocket(this.url);
    this.socket = socket;
    let opened = false;
    socket.addEventListener('open', () => {
      opened = true;
      this.connected = true;
      if (rejoin && this.seat !== null) socket.send(JSON.stringify({ type: 'rejoin', code: this.seat.code }));
      for (const text of this.queue.splice(0)) socket.send(text);
    });
    socket.addEventListener('message', (event) => {
      if (this.closing) return;
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === 'hello') {
        // The account has a seat somewhere this page doesn't know of, after a reload or on another device.
        if (message.game !== null && message.game.code !== this.seat?.code) socket.send(JSON.stringify({ type: 'rejoin', code: message.game.code }));
      } else if (message.type === 'joined') {
        this.setSeat({ code: message.code });
        this.retries = 0;
      } else if (message.type === 'left' || (message.type === 'refused' && message.request === 'rejoin')) {
        this.setSeat(null);
      } else if (message.type === 'replaced') {
        // Another page took over the account's connection; reconnecting would take it back.
        this.closing = true;
        this.setSeat(null);
        this.events.closed('You opened the game somewhere else.');
        return;
      }
      this.events.message(message);
    });
    socket.addEventListener('close', () => {
      if (this.closing) return;
      // A refused upgrade: the session may have gone, so sign in again and try once more.
      if (!opened && !this.signedInAgain) {
        this.signedInAgain = true;
        void this.open(rejoin);
        return;
      }
      if (this.seat !== null && this.retries < RETRY_SECONDS.length) {
        setTimeout(() => void this.open(true), RETRY_SECONDS[this.retries++]! * 1000);
        return;
      }
      this.closing = true;
      this.events.closed(
        this.connected
          ? 'Lost the connection to the game server.'
          : "Can't reach the game server. Online play needs it running: pnpm dev or pnpm start.",
      );
    });
  }

  private setSeat(seat: Seat | null): void {
    this.seat = seat;
    saveSeat(seat);
  }
}
