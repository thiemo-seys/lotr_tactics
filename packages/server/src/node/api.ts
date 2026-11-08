// The HTTP API (docs/accounts-spec.md section 11.1): the asker's account, renaming, signing out,
// deleting the account, profiles and history. JSON in and out. Node only.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import type { ProfileView } from '../accounts.js';
import { ACCOUNTS, NAMES } from '../config.js';
import type { Lobbies } from '../lobbies.js';
import { checkName, nameKey } from '../players.js';
import type { AccountView } from '../protocol.js';
import type { Found, Sessions } from './sessions.js';
import { canRename, type Account, type Store } from './store.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Counts events per key in fixed windows, in memory only. */
export class RateLimit {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Counts one event for the key. Returns false if that goes over the limit. */
  take(key: string): boolean {
    const now = this.now();
    if (this.windows.size > 10_000) {
      for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k);
    }
    let window = this.windows.get(key);
    if (window === undefined || now - window.start >= this.windowMs) {
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }
    return ++window.count <= this.limit;
  }
}

export interface ApiOptions {
  readonly store: Store;
  readonly sessions: Sessions;
  readonly lobbies: Lobbies;
  /** PUBLIC_URL's origin, which requests that change anything must come from. */
  readonly origin: string;
  /** Behind a proxy such as Caddy: rate limits use the first address in X-Forwarded-For. */
  readonly trustProxy: boolean;
  readonly googleEnabled: boolean;
  /** The clock for rate limits, in milliseconds. */
  readonly clock?: () => number;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class Api {
  private readonly guests: RateLimit;
  private readonly requests: RateLimit;

  constructor(private readonly options: ApiOptions) {
    this.guests = new RateLimit(ACCOUNTS.guestsPerHour, 60 * 60 * 1000, options.clock);
    this.requests = new RateLimit(ACCOUNTS.apiPerMinute, 60 * 1000, options.clock);
  }

  /** Whether a path is the API's. */
  static handles(path: string): boolean {
    return path === '/api' || path.startsWith('/api/');
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', 'http://host');
      const route = `${request.method ?? 'GET'} ${url.pathname}`;
      switch (route) {
        case 'GET /api/me':
          return await this.me(request, response);
        case 'POST /api/me/name':
          return await this.rename(request, response);
        case 'POST /api/signout':
          return await this.signOut(request, response);
        case 'POST /api/me/delete':
          return await this.deleteAccount(request, response);
        case 'GET /api/profile':
          return await this.profile(request, response, url);
        case 'GET /api/history':
          return await this.history(request, response, url);
        default:
          throw new ApiError(404, 'There is no such request.');
      }
    } catch (error) {
      if (error instanceof ApiError) send(response, error.status, { error: error.message });
      else {
        console.error('API request failed:', error);
        send(response, 500, { error: 'Something went wrong on the server.' });
      }
    }
  }

  /** The asker's account, making a guest and a session if there is no session. */
  private async me(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const found = await this.options.sessions.find(request.headers.cookie);
    if (found !== null) {
      this.limit(found);
      send(response, 200, this.view(found.account), found.cookie);
      return;
    }
    if (!this.guests.take(this.address(request))) throw new ApiError(429, 'Too many new guests from your address. Try again later.');
    const guest = await this.options.sessions.newGuest();
    send(response, 200, this.view(guest.account), guest.cookie);
  }

  private async rename(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const found = await this.changing(request);
    const body = await readBody(request);
    if (typeof body.name !== 'string') throw new ApiError(400, 'Send the new name.');
    const checked = checkName(body.name);
    if ('error' in checked) throw new ApiError(400, checked.error);
    const { account } = found;
    const renamed = await this.options.store.rename(account.id, checked.name, checked.key, this.options.sessions.now());
    if (renamed === 'wait') throw new ApiError(400, `You can rename once every ${NAMES.renameDays} days.`);
    if (renamed === 'taken') throw new ApiError(400, 'That name is taken.');
    this.options.lobbies.updatePlayer(account.id, { name: renamed.name });
    send(response, 200, this.view(renamed), found.cookie);
  }

  /** Signs out this device, or every device with `{ everywhere: true }`, and clears the cookie. */
  private async signOut(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const found = await this.changing(request);
    const body = await readBody(request);
    const everywhere = body.everywhere === true;
    await this.options.sessions.signOut(found, everywhere);
    // Signed out everywhere, the account's game connection is told so and closed.
    if (everywhere) this.options.lobbies.signedOut(found.account.id, 'everywhere');
    send(response, 200, { ok: true }, this.options.sessions.clearCookie());
  }

  /**
   * Deletes the account, once `confirm` is its name (compared as names are: ignoring case and
   * spaces), while it has no seat in a lobby or game. Clears the cookie (accounts-spec.md section 6.4).
   */
  private async deleteAccount(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const found = await this.changing(request);
    const body = await readBody(request);
    const { account } = found;
    if (typeof body.confirm !== 'string' || nameKey(body.confirm.trim()) !== account.nameKey) {
      throw new ApiError(400, "Type the account's name to confirm.");
    }
    const { lobbies } = this.options;
    const code = lobbies.seatCode(account.id);
    if (code !== null) throw new ApiError(409, `You have a seat in lobby ${code}. Leave it before deleting the account.`);
    // Its connection goes first, so it can't take a seat meanwhile, and again after, in case one opened.
    lobbies.signedOut(account.id, 'deleted');
    await this.options.store.deleteAccount(account.id);
    lobbies.signedOut(account.id, 'deleted');
    send(response, 200, { ok: true }, this.options.sessions.clearCookie());
  }

  /** Name, guest or not, and stats. Anyone may see a claimed account's; a guest's only the guest. */
  private async profile(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const found = await this.signedIn(request);
    const account = await this.visible(found, url.searchParams.get('account'));
    const stats = await this.options.store.stats(account.id);
    const profile: ProfileView = { id: account.id, name: account.name, guest: !account.claimed, stats };
    send(response, 200, profile, found.cookie);
  }

  /** 20 matches at a time, newest first, older than the match `before`. */
  private async history(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const found = await this.signedIn(request);
    const account = await this.visible(found, url.searchParams.get('account'));
    const before = url.searchParams.get('before');
    if (before !== null && !UUID.test(before)) throw new ApiError(400, 'That is not a match id.');
    const matches = await this.options.store.history(account.id, before, ACCOUNTS.historyPage);
    send(response, 200, { matches }, found.cookie);
  }

  /** The account asked for, if the asker may see it; by default the asker's own. */
  private async visible(found: Found, id: string | null): Promise<Account> {
    if (id === null || id === found.account.id) return found.account;
    if (!UUID.test(id)) throw new ApiError(404, 'There is no such player.');
    const account = await this.options.store.account(id);
    if (account === null || !account.claimed) throw new ApiError(404, 'There is no such player.');
    return account;
  }

  private async signedIn(request: IncomingMessage): Promise<Found> {
    const found = await this.options.sessions.find(request.headers.cookie);
    if (found === null) throw new ApiError(401, 'You are not signed in.');
    this.limit(found);
    return found;
  }

  /** A request that changes something: from the site's own origin, with a session. */
  private async changing(request: IncomingMessage): Promise<Found> {
    if (request.headers.origin !== this.options.origin) throw new ApiError(403, 'That request came from another site.');
    return this.signedIn(request);
  }

  private limit(found: Found): void {
    if (!this.requests.take(found.hash.toString('hex'))) throw new ApiError(429, 'Too many requests. Slow down a little.');
  }

  private address(request: IncomingMessage): string {
    const forwarded = request.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (this.options.trustProxy && first !== undefined && first !== '') return first;
    return request.socket.remoteAddress ?? 'unknown';
  }

  view(account: Account): AccountView {
    return {
      id: account.id,
      name: account.name,
      claimed: account.claimed,
      canRename: canRename(account, this.options.sessions.now()),
      needsName: account.needsName,
      googleEnabled: this.options.googleEnabled,
    };
  }
}

/** A JSON body of at most 4 KB; an empty body is `{}`. */
async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > ACCOUNTS.maxBodyBytes) throw new ApiError(400, 'The request is too large.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text === '') return {};
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'The request is not JSON.');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new ApiError(400, 'The request is not a JSON object.');
  return data as Record<string, unknown>;
}

function send(response: ServerResponse, status: number, body: unknown, cookie: string | null = null): void {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (cookie !== null) headers['set-cookie'] = cookie;
  response.writeHead(status, headers).end(JSON.stringify(body));
}
