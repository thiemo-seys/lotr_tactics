// How the play page talks to a game (docs/server-spec.md section 10): a WebSocket to the game
// server, or lobbies running in the page for offline games. No Three.js and no DOM apart from
// WebSocket and session storage, so the offline connection can be tested.

import { Lobbies, SERVER, type Client, type ClientMessage, type Host, type ServerMessage } from '@lotr-tactics/server';

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
  token: () => crypto.randomUUID(),
};

export interface LocalOptions {
  readonly host?: Host;
  /** False to run the timers only through `update()`, for tests. */
  readonly autoUpdate?: boolean;
}

/** An offline game: one person, called You, and 7 bots, in a lobby that runs in the page. */
export class LocalConnection implements Connection {
  private readonly lobbies: Lobbies;
  private readonly client: Client;
  private readonly timer: ReturnType<typeof setInterval> | null;

  constructor(seed: number, events: ConnectionEvents, options: LocalOptions = {}) {
    this.lobbies = new Lobbies(options.host ?? browserHost, { seed: () => seed });
    this.client = {
      // Through JSON and a moment later, as messages from a server would arrive.
      send: (message) => {
        const copy = JSON.parse(JSON.stringify(message)) as ServerMessage;
        queueMicrotask(() => events.message(copy));
      },
    };
    this.timer = options.autoUpdate === false ? null : setInterval(() => this.update(), SERVER.updateSeconds * 1000);
    this.send({ type: 'create', name: 'You' });
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

/** A seat to rejoin: the lobby code and the token from `joined`. */
export interface Seat {
  readonly code: string;
  readonly token: string;
}

/** The build this page is, set by Vite from GAME_VERSION; empty without one. */
declare const __GAME_VERSION__: string;
export const GAME_VERSION = __GAME_VERSION__;

/** Adds the build to the messages that enter a lobby, so the server can ask an outdated page to reload. */
export function withVersion(message: ClientMessage): ClientMessage {
  return message.type === 'create' || message.type === 'join' || message.type === 'rejoin' ? { ...message, version: GAME_VERSION } : message;
}

const SEAT_KEY = 'lotr-tactics-seat';

/** Seconds to wait before each attempt to reconnect. */
const RETRY_SECONDS = [1, 2, 4, 8];

/** The seat this tab is in, kept so a reload or a lost connection can rejoin it. */
export function savedSeat(): Seat | null {
  try {
    const text = sessionStorage.getItem(SEAT_KEY);
    return text === null ? null : (JSON.parse(text) as Seat);
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

/** A WebSocket to the game server that reconnects and rejoins its seat if the connection drops. */
export class SocketConnection implements Connection {
  private socket: WebSocket | null = null;
  /** Messages sent while connecting. */
  private readonly queue: string[] = [];
  private seat: Seat | null = savedSeat();
  private retries = 0;
  private connected = false;
  private closing = false;

  constructor(
    private readonly url: string,
    private readonly events: ConnectionEvents,
  ) {
    this.open(false);
  }

  send(message: ClientMessage): void {
    const text = JSON.stringify(withVersion(message));
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(text);
    else this.queue.push(text);
  }

  close(): void {
    this.closing = true;
    this.setSeat(null);
    this.socket?.close();
  }

  private open(rejoin: boolean): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.connected = true;
      if (rejoin && this.seat !== null) socket.send(JSON.stringify(withVersion({ type: 'rejoin', ...this.seat })));
      for (const text of this.queue.splice(0)) socket.send(text);
    });
    socket.addEventListener('message', (event) => {
      if (this.closing) return;
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === 'joined') {
        this.setSeat({ code: message.code, token: message.token });
        this.retries = 0;
      } else if (message.type === 'left' || (message.type === 'refused' && message.request === 'rejoin')) {
        this.setSeat(null);
      }
      this.events.message(message);
    });
    socket.addEventListener('close', () => {
      if (this.closing) return;
      if (this.seat !== null && this.retries < RETRY_SECONDS.length) {
        setTimeout(() => this.open(true), RETRY_SECONDS[this.retries++]! * 1000);
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
