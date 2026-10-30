// The Node server: HTTP for the built client and WebSockets for games (docs/server-spec.md section 9).

import { randomInt, randomUUID } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, type WebSocket } from 'ws';
import { SERVER } from './config.js';
import type { Host } from './host.js';
import { Lobbies } from './lobbies.js';
import type { Client } from './lobby.js';

/** 2⁴⁸ − 1, the widest range `crypto.randomInt` takes. */
const RANDOM_RANGE = 0xffffffffffff;

export const nodeHost: Host = {
  now: () => performance.now(),
  random: () => randomInt(RANDOM_RANGE) / RANDOM_RANGE,
  token: () => randomUUID(),
};

export interface ServerOptions {
  /** 0 picks a free port. */
  readonly port: number;
  /** The built client to serve, or null to serve no files. */
  readonly clientDir: string | null;
  /** The client build to accept, or null to accept any (protocol.ts). */
  readonly version?: string | null;
}

export interface RunningServer {
  readonly port: number;
  readonly lobbies: Lobbies;
  /** Closes every connection and stops the server, which ends every game. */
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
};

export function startServer(options: ServerOptions): Promise<RunningServer> {
  const lobbies = new Lobbies(nodeHost, options.version == null ? {} : { version: options.version });
  const root = options.clientDir === null ? null : resolve(options.clientDir);
  const http = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    if (new URL(request.url ?? '/', 'http://host').pathname === '/status') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(lobbies.status));
      return;
    }
    serveFile(root, request.url ?? '/', response);
  });

  const sockets = new WebSocketServer({ noServer: true, maxPayload: SERVER.maxMessageBytes });
  http.on('upgrade', (request, socket, head) => {
    if (new URL(request.url ?? '/', 'http://host').pathname !== '/ws') {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => connect(ws, lobbies, alive));
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

  const close = async () => {
    clearInterval(ping);
    clearInterval(update);
    for (const ws of sockets.clients) ws.terminate();
    sockets.close();
    await new Promise<void>((done) => http.close(() => done()));
  };

  return new Promise((done) => {
    http.listen(options.port, () => done({ port: (http.address() as AddressInfo).port, lobbies, close }));
  });
}

function connect(ws: WebSocket, lobbies: Lobbies, alive: WeakMap<WebSocket, boolean>): void {
  const client: Client = {
    send: (message) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    },
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
