// The Node server: HTTP for the built client and the API, and WebSockets for games
// (docs/server-spec.md section 9, docs/accounts-spec.md sections 6.1 and 11).

import { randomInt } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { extname, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, type WebSocket } from 'ws';
import { ACCOUNTS, SERVER } from './config.js';
import type { Host } from './host.js';
import { Lobbies } from './lobbies.js';
import type { Client } from './lobby.js';
import { Api } from './node/api.js';
import { recordResult } from './node/record.js';
import { Sessions } from './node/sessions.js';
import type { Account, Store } from './node/store.js';
import type { Player } from './players.js';

/** 2⁴⁸ − 1, the widest range `crypto.randomInt` takes. */
const RANDOM_RANGE = 0xffffffffffff;

export const nodeHost: Host = {
  now: () => performance.now(),
  random: () => randomInt(RANDOM_RANGE) / RANDOM_RANGE,
};

export interface ServerOptions {
  /** 0 picks a free port. */
  readonly port: number;
  /** The built client to serve, or null to serve no files. */
  readonly clientDir: string | null;
  readonly store: Store;
  /** The site's own origin, such as https://tactics.example.com: for the Origin check and Secure cookies. */
  readonly publicUrl: string;
  /** Behind a proxy that sets X-Forwarded-For, such as Caddy. */
  readonly trustProxy?: boolean;
  /** The seed for each new lobby's game, for tests. By default, a random one. */
  readonly seed?: () => number;
}

export interface RunningServer {
  readonly port: number;
  readonly lobbies: Lobbies;
  /** Closes every connection and stops the server, which ends every game. The store stays open. */
  close(): Promise<void>;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
};

export function startServer(options: ServerOptions): Promise<RunningServer> {
  const { store } = options;
  const origin = new URL(options.publicUrl).origin;
  const lobbies = new Lobbies(nodeHost, {
    seed: options.seed,
    onResult: (result) => void recordResult(store, result),
  });
  const sessions = new Sessions(store, { secure: origin.startsWith('https:') });
  const api = new Api({ store, sessions, lobbies, origin, trustProxy: options.trustProxy ?? false, googleEnabled: false });
  const root = options.clientDir === null ? null : resolve(options.clientDir);
  const http = createServer((request, response) => {
    if (Api.handles(new URL(request.url ?? '/', 'http://host').pathname)) {
      void api.handle(request, response);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    serveFile(root, request.url ?? '/', response);
  });

  // The upgrade needs the page's own origin and a session (accounts-spec.md section 6.1).
  const sockets = new WebSocketServer({ noServer: true, maxPayload: SERVER.maxMessageBytes });
  http.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
    socket.on('error', () => socket.destroy());
    if (new URL(request.url ?? '/', 'http://host').pathname !== '/ws') {
      socket.destroy();
      return;
    }
    if (request.headers.origin !== origin) {
      refuse(socket, 403, 'Forbidden');
      return;
    }
    sessions.find(request.headers.cookie).then(
      (found) => {
        if (found === null) refuse(socket, 401, 'Unauthorized');
        else sockets.handleUpgrade(request, socket, head, (ws) => connect(ws, lobbies, alive, found.account, api));
      },
      (error: unknown) => {
        console.error('Session lookup failed:', error);
        refuse(socket, 503, 'Service Unavailable');
      },
    );
  });

  // Connections that haven't answered the last ping are dropped.
  const alive = new WeakMap<WebSocket, boolean>();
  const ping = setInterval(() => {
    for (const ws of sockets.clients) {
      if (alive.get(ws) !== true) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, SERVER.pingSeconds * 1000);
  const update = setInterval(() => lobbies.update(), SERVER.updateSeconds * 1000);
  // Expired sessions and old guests (accounts-spec.md section 5).
  const cleanUp = () =>
    store.cleanUp(new Date()).then(
      ({ sessions, guests }) => {
        if (sessions + guests > 0) console.log(`Cleaned up ${sessions} expired sessions and ${guests} old guests.`);
      },
      (error: unknown) => console.error('Clean-up failed:', error),
    );
  void cleanUp();
  const cleaning = setInterval(() => void cleanUp(), ACCOUNTS.cleanUpMinutes * 60 * 1000);

  const close = async () => {
    clearInterval(ping);
    clearInterval(update);
    clearInterval(cleaning);
    for (const ws of sockets.clients) ws.terminate();
    sockets.close();
    await new Promise<void>((done) => http.close(() => done()));
  };

  return new Promise((done) => {
    http.listen(options.port, () => done({ port: (http.address() as AddressInfo).port, lobbies, close }));
  });
}

function refuse(socket: Socket, status: number, text: string): void {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function connect(ws: WebSocket, lobbies: Lobbies, alive: WeakMap<WebSocket, boolean>, account: Account, api: Api): void {
  const player: Player = { id: account.id, name: account.name, claimed: account.claimed, rating: null };
  const client: Client = {
    player,
    send: (message) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    },
    close: () => ws.close(1000, 'Replaced'),
  };
  alive.set(ws, true);
  let windowStart = performance.now();
  let messages = 0;
  ws.on('pong', () => alive.set(ws, true));
  ws.on('message', (data, isBinary) => {
    const now = performance.now();
    if (now - windowStart >= SERVER.rateSeconds * 1000) {
      windowStart = now;
      messages = 0;
    }
    if (++messages > SERVER.rateMessages) {
      ws.close(1008, 'Too many messages');
      return;
    }
    lobbies.receive(client, isBinary ? '' : String(data));
  });
  ws.on('close', () => lobbies.disconnect(client));
  ws.on('error', () => ws.terminate());
  lobbies.connect(client, api.view(account));
}

function serveFile(root: string | null, url: string, response: ServerResponse): void {
  const file = root === null ? null : filePath(root, url);
  if (file === null) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}

/** The file a URL asks for, if it is a file inside the root. */
function filePath(root: string, url: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(url, 'http://host').pathname);
  } catch {
    return null;
  }
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(root, `.${path}`);
  if (!file.startsWith(root + sep)) return null;
  try {
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}
