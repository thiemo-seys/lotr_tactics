import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../src/protocol.js';
import { startServer, type RunningServer } from '../src/server.js';

let server: RunningServer;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lotr-client-'));
  writeFileSync(join(dir, 'index.html'), '<p>The fight viewer</p>');
  writeFileSync(join(dir, 'play.js'), 'export {};');
  server = await startServer({ port: 0, clientDir: dir });
});

afterAll(() => server.close());

const base = () => `http://127.0.0.1:${server.port}`;

/** A WebSocket client that waits for messages by type. */
async function connect() {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  const inbox: ServerMessage[] = [];
  const waiting: (() => void)[] = [];
  ws.on('message', (data) => {
    inbox.push(JSON.parse(String(data)) as ServerMessage);
    for (const wake of waiting.splice(0)) wake();
  });
  await new Promise((done) => ws.once('open', done));
  let read = 0;
  return {
    send: (message: ClientMessage) => ws.send(JSON.stringify(message)),
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
        await new Promise<void>((wake) => waiting.push(wake));
      }
    },
    close: () => ws.close(),
  };
}

describe('the Node server', () => {
  it('serves the client build and nothing outside it', async () => {
    const page = await fetch(`${base()}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('fight viewer');
    expect((await fetch(`${base()}/play.js`)).headers.get('content-type')).toContain('text/javascript');
    expect((await fetch(`${base()}/missing.html`)).status).toBe(404);
    expect((await fetch(`${base()}/%2e%2e/%2e%2e/etc/passwd`)).status).toBe(404);
    expect((await fetch(`${base()}/..%2F..%2Fpackage.json`)).status).toBe(404);
  });

  it('lets two people join one lobby, start, and see the same Council', async () => {
    const frodo = await connect();
    const sam = await connect();
    frodo.send({ type: 'create', name: 'Frodo' });
    const { code } = await frodo.next('joined');
    sam.send({ type: 'join', code, name: 'Sam' });
    expect((await sam.next('joined')).seat).toBe(1);
    frodo.send({ type: 'start' });
    const [a, b] = await Promise.all([frodo.next('state'), sam.next('state')]);
    expect(a.state.step.kind).toBe('council');
    expect(a.state.council).toEqual(b.state.council);
    sam.close();
    const away = await frodo.next('lobby', (m) => !m.lobby.seats[1]!.connected);
    expect(away.lobby.seats[1]).toEqual({ kind: 'person', name: 'Sam', connected: false });
    frodo.close();
  });
});
