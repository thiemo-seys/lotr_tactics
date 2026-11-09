// HTTP and WebSocket clients for tests against a running server.

import { expect } from 'vitest';
import { WebSocket } from 'ws';
import type { AccountView, ClientMessage, ServerMessage } from '../src/protocol.js';

export interface Request {
  method?: string;
  cookie?: string | null;
  origin?: string | null;
  body?: unknown;
  /** The address a proxy says the request is from. */
  from?: string;
}

export interface Response {
  readonly status: number;
  readonly body: Record<string, unknown>;
  /** The Set-Cookie headers, each as sent. */
  readonly cookies: string[];
  /** The first Set-Cookie header, or null. */
  readonly setCookie: string | null;
  readonly location: string | null;
}

let addresses = 0;

/** Clients for the server on a port, whose page is at `origin`. */
export function web(port: () => number, origin: string) {
  const base = () => `http://127.0.0.1:${port()}`;

  /** A request that doesn't follow redirects. A body that isn't JSON is `{}`. */
  async function request(path: string, { method = 'GET', cookie = null, origin: from = origin, body, from: address = `10.0.${Math.floor(++addresses / 250)}.${addresses % 250}` }: Request = {}): Promise<Response> {
    const headers: Record<string, string> = { 'x-forwarded-for': `${address}, 172.16.0.1` };
    if (cookie !== null) headers.cookie = cookie;
    if (from !== null) headers.origin = from;
    const response = await fetch(`${base()}${path}`, { method, headers, redirect: 'manual', body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Not JSON, such as a redirect.
    }
    const cookies = response.headers.getSetCookie();
    return { status: response.status, body: json, cookies, setCookie: cookies[0] ?? null, location: response.headers.get('location') };
  }

  /** A new guest: its account and its session cookie. */
  async function guest(): Promise<{ me: AccountView; cookie: string }> {
    const response = await request('/api/me');
    expect(response.status).toBe(200);
    return { me: response.body as unknown as AccountView, cookie: response.setCookie!.split(';')[0]! };
  }

  /** Opens a WebSocket, resolving to a client, or to the HTTP status of a refused upgrade. */
  function open(cookie: string | null, from: string = origin): Promise<SocketClient | number> {
    const ws = new WebSocket(`ws://127.0.0.1:${port()}/ws`, { origin: from, headers: cookie === null ? {} : { cookie } });
    const client = socketClient(ws);
    return new Promise((done) => {
      ws.once('open', () => done(client));
      ws.on('error', () => {});
      ws.once('unexpected-response', (req, res) => {
        done(res.statusCode ?? 0);
        req.destroy();
      });
    });
  }

  async function connect(cookie: string): Promise<SocketClient> {
    const client = await open(cookie);
    if (typeof client === 'number') throw new Error(`The upgrade was refused with ${client}.`);
    return client;
  }

  return { base, request, guest, open, connect };
}

export type SocketClient = ReturnType<typeof socketClient>;

/** A WebSocket client that waits for messages by type. */
export function socketClient(ws: WebSocket) {
  const inbox: ServerMessage[] = [];
  const waiting: (() => void)[] = [];
  let closed = false;
  const listeners: ((message: ServerMessage) => void)[] = [];
  ws.on('message', (data) => {
    const message = JSON.parse(String(data)) as ServerMessage;
    inbox.push(message);
    for (const listen of listeners) listen(message);
    for (const wake of waiting.splice(0)) wake();
  });
  ws.on('close', () => {
    closed = true;
    for (const wake of waiting.splice(0)) wake();
  });
  let read = 0;
  return {
    inbox,
    get closed() {
      return closed;
    },
    send: (message: ClientMessage) => ws.send(JSON.stringify(message)),
    listen: (listen: (message: ServerMessage) => void) => listeners.push(listen),
    /** The next message of a type, after the last one returned, that passes a test. */
    async next<T extends ServerMessage['type']>(
      type: T,
      test: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    ): Promise<Extract<ServerMessage, { type: T }>> {
      for (;;) {
        const i = inbox.findIndex((m, index) => index >= read && m.type === type && test(m as Extract<ServerMessage, { type: T }>));
        if (i >= 0) {
          read = i + 1;
          return inbox[i] as Extract<ServerMessage, { type: T }>;
        }
        if (closed) throw new Error(`The connection closed before a ${type} message.`);
        await new Promise<void>((wake) => waiting.push(wake));
      }
    },
    /** Resolves once the connection has closed. */
    async gone(): Promise<void> {
      while (!closed) await new Promise<void>((wake) => waiting.push(wake));
    },
    close: () => ws.close(),
  };
}
