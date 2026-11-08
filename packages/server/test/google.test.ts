import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { HistoryMatch } from '../src/accounts.js';
import { recordedMatch } from '../src/node/record.js';
import { PgStore } from '../src/node/store.js';
import type { AccountView } from '../src/protocol.js';
import type { FinalBoard, MatchResult } from '../src/results.js';
import { startServer, type RunningServer } from '../src/server.js';
import { SKIP_REASON, noteSkipped, testDatabase, type TestDatabase } from './db.js';
import { web, type Response } from './web.js';

/** The site's origin, as PUBLIC_URL would give it. */
const ORIGIN = 'http://tactics.test';
const CLIENT_ID = 'lotr-tactics.apps.example';
const CLIENT_SECRET = 'not-a-real-secret';
const DAY = 24 * 60 * 60 * 1000;

/**
 * Google, as far as sign-in sees it: an authorization endpoint that signs in as `sub` at once, and a
 * token endpoint that checks the code, the client and the PKCE verifier, and gives an ID token.
 */
class FakeGoogle {
  server: Server | null = null;
  /** Who signs in next. */
  sub = 'google-1';
  /** Say no at the authorization endpoint. */
  deny = false;
  /** Claims to change in the next ID tokens. */
  tamper: Record<string, unknown> = {};
  /** The last authorization request's parameters. */
  asked: URLSearchParams | null = null;
  tokenCalls = 0;
  private readonly codes = new Map<string, { sub: string; nonce: string; challenge: string; redirectUri: string }>();

  constructor(private readonly now: () => Date) {}

  get base(): string {
    return `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }

  start(): Promise<void> {
    this.server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://google');
      if (request.method === 'GET' && url.pathname === '/authorize') {
        const params = url.searchParams;
        this.asked = params;
        const back = new URL(params.get('redirect_uri')!);
        back.searchParams.set('state', params.get('state')!);
        if (this.deny) back.searchParams.set('error', 'access_denied');
        else {
          const code = randomBytes(16).toString('hex');
          this.codes.set(code, { sub: this.sub, nonce: params.get('nonce')!, challenge: params.get('code_challenge')!, redirectUri: params.get('redirect_uri')! });
          back.searchParams.set('code', code);
        }
        response.writeHead(302, { location: back.toString() }).end();
        return;
      }
      if (request.method === 'POST' && url.pathname === '/token') {
        let text = '';
        request.on('data', (chunk: Buffer) => (text += String(chunk)));
        request.on('end', () => {
          this.tokenCalls++;
          const form = new URLSearchParams(text);
          const code = this.codes.get(form.get('code') ?? '');
          this.codes.delete(form.get('code') ?? '');
          const verified = code !== undefined && createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') === code.challenge;
          const ok =
            verified &&
            form.get('grant_type') === 'authorization_code' &&
            form.get('client_id') === CLIENT_ID &&
            form.get('client_secret') === CLIENT_SECRET &&
            form.get('redirect_uri') === code.redirectUri;
          if (!ok) {
            response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'invalid_grant' }));
            return;
          }
          const seconds = Math.floor(this.now().getTime() / 1000);
          const claims = { iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: code.sub, nonce: code.nonce, iat: seconds, exp: seconds + 3600, ...this.tamper };
          const part = (data: object) => Buffer.from(JSON.stringify(data)).toString('base64url');
          const idToken = `${part({ alg: 'RS256', typ: 'JWT' })}.${part(claims)}.c2lnbmF0dXJl`;
          response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: 'unused', id_token: idToken, token_type: 'Bearer' }));
        });
        return;
      }
      response.writeHead(404).end();
    });
    return new Promise((done) => this.server!.listen(0, '127.0.0.1', () => done()));
  }

  stop(): Promise<void> {
    return new Promise((done) => this.server?.close(() => done()) ?? done());
  }
}

function board(): FinalBoard {
  return { level: 6, units: [{ unit: 'gimli', star: 2, items: [] }], traits: [], ringBearer: null } as unknown as FinalBoard;
}

/** A finished private game with these accounts in the first seats and bots in the rest. */
function result(people: string[]): MatchResult {
  return {
    kind: 'private',
    durationMs: 15 * 60 * 1000,
    lastRound: { stage: 4, round: 2 },
    seats: [0, 1, 2, 3, 4, 5, 6, 7].map((seat) => ({
      seat,
      player: people[seat] ?? null,
      name: people[seat] === undefined ? `Bot ${seat}` : `Person ${seat}`,
      place: seat + 1,
      left: false,
      board: board(),
    })),
  };
}

const cookieOf = (response: Response, name: string) => response.cookies.find((c) => c.startsWith(`${name}=`)) ?? null;

noteSkipped();

describe.skipIf(SKIP_REASON !== null)('Google sign-in', () => {
  let db: TestDatabase;
  let server: RunningServer;
  let store: PgStore;
  let clock = Date.now();
  const now = () => new Date(clock);
  const google = new FakeGoogle(now);
  const { request: api, guest, connect } = web(() => server.port, ORIGIN);

  beforeAll(async () => {
    db = await testDatabase();
    store = new PgStore(db.pool);
    await google.start();
    server = await startServer({
      port: 0,
      clientDir: null,
      store,
      publicUrl: ORIGIN,
      trustProxy: true,
      now,
      google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, authorizationEndpoint: `${google.base}/authorize`, tokenEndpoint: `${google.base}/token` },
    });
  });

  afterAll(async () => {
    await server?.close();
    await google.stop();
    await db?.close();
  });

  let subs = 0;
  beforeEach(() => {
    google.sub = `google-${++subs}`;
    google.deny = false;
    google.tamper = {};
  });

  /** Starts signing in: the redirect to Google, and the cookie with the state and verifier. */
  async function begin(cookie: string | null) {
    const started = await api('/auth/google', { cookie });
    expect(started.status).toBe(303);
    const pending = cookieOf(started, 'lt_google')!;
    return { location: new URL(started.location!), pending, cookie: pending.split(';')[0]! };
  }

  /** Goes to Google, which sends the browser back: the callback's path and query on this server. */
  async function atGoogle(location: URL): Promise<string> {
    const back = await fetch(location, { redirect: 'manual' });
    const to = new URL(back.headers.get('location')!);
    expect(to.origin).toBe(ORIGIN);
    return `${to.pathname}${to.search}`;
  }

  /** Signs in all the way with the browser's session cookie, if it has one. */
  async function signIn(cookie: string | null): Promise<Response> {
    const { location, cookie: pending } = await begin(cookie);
    const callback = await atGoogle(location);
    return api(callback, { cookie: cookie === null ? pending : `${cookie}; ${pending}` });
  }

  /** The new session cookie a callback set. */
  function session(response: Response): string {
    const set = cookieOf(response, 'lt_session');
    expect(set).not.toBeNull();
    return set!.split(';')[0]!;
  }

  const me = async (cookie: string) => (await api('/api/me', { cookie })).body as unknown as AccountView;
  const rename = (cookie: string, name: string) => api('/api/me/name', { method: 'POST', cookie, body: { name } });

  it('is on, and sends the browser to Google with PKCE, for the openid scope only', async () => {
    const { me: account, cookie } = await guest();
    expect(account).toMatchObject({ googleEnabled: true, claimed: false, needsName: false });
    const { location, pending } = await begin(cookie);
    expect(`${location.origin}${location.pathname}`).toBe(`${google.base}/authorize`);
    const params = Object.fromEntries(location.searchParams);
    expect(params).toMatchObject({
      client_id: CLIENT_ID,
      redirect_uri: `${ORIGIN}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid',
      code_challenge_method: 'S256',
    });
    expect(params.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The verifier is only in the cookie, which is short-lived, HttpOnly and only sent back to the callback.
    expect(pending).toMatch(/^lt_google=[A-Za-z0-9_.-]+; HttpOnly; SameSite=Lax; Path=\/auth\/google; Max-Age=600$/);
    expect(pending).toContain(params.state!);
    expect(JSON.stringify(params)).not.toContain(pending.split(';')[0]!.split('.')[2]!);
  });

  it('refuses a callback whose state is wrong, or without the cookie that keeps it', async () => {
    const { me: account, cookie } = await guest();
    const calls = google.tokenCalls;
    const { location, cookie: pending } = await begin(cookie);
    const callback = new URL(await atGoogle(location), ORIGIN);
    const right = callback.searchParams.get('state')!;
    callback.searchParams.set('state', `${right.slice(0, -1)}${right.endsWith('A') ? 'B' : 'A'}`);
    const wrong = await api(`${callback.pathname}${callback.search}`, { cookie: `${cookie}; ${pending}` });
    expect(wrong.status).toBe(303);
    expect(wrong.location).toBe('/play.html#signin=failed');
    expect(cookieOf(wrong, 'lt_session')).toBeNull();
    // The pending sign-in is cleared.
    expect(cookieOf(wrong, 'lt_google')).toContain('Max-Age=0');
    callback.searchParams.set('state', right);
    const without = await api(`${callback.pathname}${callback.search}`, { cookie });
    expect(without.location).toBe('/play.html#signin=failed');
    // Google was never asked for tokens, and the guest is still a guest.
    expect(google.tokenCalls).toBe(calls);
    expect(await me(cookie)).toMatchObject({ id: account.id, claimed: false });
  });

  it('claims the guest with a new Google account, keeping its name and history, with a new session', async () => {
    const { me: account, cookie } = await guest();
    await rename(cookie, 'Legolas');
    await store.recordMatch(recordedMatch(result([account.id]), now()));
    // The guest is in a lobby in another tab, which shows the claim.
    const socket = await connect(cookie);
    socket.send({ type: 'create' });
    await socket.next('joined');
    expect((await socket.next('lobby')).lobby.seats[0]).toMatchObject({ guest: true });

    const done = await signIn(cookie);
    expect(done.status).toBe(303);
    expect(done.location).toBe('/play.html#signin=claimed');
    expect(cookieOf(done, 'lt_google')).toContain('Max-Age=0');
    const claimed = session(done);
    expect(claimed).not.toBe(cookie);
    expect(await me(claimed)).toEqual({ id: account.id, name: 'Legolas', claimed: true, canRename: true, needsName: false, googleEnabled: true });
    // The guest's session was replaced, so its old cookie is no one's.
    expect((await api('/api/profile', { cookie })).status).toBe(401);
    const history = (await api('/api/history', { cookie: claimed })).body.matches as HistoryMatch[];
    expect(history).toHaveLength(1);
    expect(history[0]!.seats[0]).toMatchObject({ account: account.id, guest: false });
    expect((await socket.next('lobby', (m) => m.lobby.seats[0]!.guest === false)).lobby.seats[0]).toMatchObject({ name: 'Legolas', player: account.id });
    socket.send({ type: 'leave' });
    socket.close();
  });

  it('signs in to the account a Google account already has, saying how many games the guest left behind', async () => {
    const first = await guest();
    await rename(first.cookie, 'Thranduil');
    const claimed = session(await signIn(first.cookie));
    const elsewhere = await guest();
    await store.recordMatch(recordedMatch(result([elsewhere.me.id]), now()));
    const back = await signIn(elsewhere.cookie);
    expect(back.location).toBe('/play.html#signin=signedin&guestGames=1');
    const again = session(back);
    expect(await me(again)).toMatchObject({ id: first.me.id, name: 'Thranduil', claimed: true });
    expect(await me(claimed)).toMatchObject({ id: first.me.id });
    // A browser with no session at all signs in too, with nothing left behind.
    expect((await signIn(null)).location).toBe('/play.html#signin=signedin');
  });

  it('makes a new account for a new Google account in a browser without a session, which needs a name', async () => {
    const done = await signIn(null);
    expect(done.location).toBe('/play.html#signin=claimed');
    // Its name is a guest's, "Guest 0427", which a claimed account can't keep.
    expect(await me(session(done))).toMatchObject({ claimed: true, needsName: true, canRename: true, name: expect.stringMatching(/^Guest \d{4}$/) });
  });

  it('says when the person says no at Google', async () => {
    const { cookie } = await guest();
    google.deny = true;
    expect((await signIn(cookie)).location).toBe('/play.html#signin=cancelled');
    expect(await me(cookie)).toMatchObject({ claimed: false });
  });

  it('refuses ID tokens for another client, from another issuer, expired, or with another nonce', async () => {
    const { cookie } = await guest();
    for (const tamper of [{ aud: 'someone-else' }, { iss: 'https://evil.test' }, { exp: Math.floor(clock / 1000) - 10 }, { nonce: 'replayed' }, { sub: '' }]) {
      google.tamper = tamper;
      const refused = await signIn(cookie);
      expect(refused.location).toBe('/play.html#signin=failed');
      expect(cookieOf(refused, 'lt_session')).toBeNull();
    }
    expect(await me(cookie)).toMatchObject({ claimed: false });
  });

  it("asks for a new name after claiming with one a claimed account holds, and limits claimed accounts' renames to once every 7 days", async () => {
    const [holder, late] = [await guest(), await guest()];
    // Guests can share a name, until one is claimed with it.
    expect((await rename(late.cookie, 'Gimli')).status).toBe(200);
    expect((await rename(holder.cookie, 'gimli')).status).toBe(200);
    const holding = session(await signIn(holder.cookie));
    expect(await me(holding)).toMatchObject({ name: 'gimli', needsName: false });
    // Now guests can't take it.
    expect(await rename((await guest()).cookie, 'GIMLI')).toMatchObject({ status: 400, body: { error: 'That name is taken.' } });
    // Reserved names are refused before anything else.
    expect((await rename(holding, 'Guest 1234')).status).toBe(400);

    google.sub = `${google.sub}-late`;
    const lateClaim = session(await signIn(late.cookie));
    expect(await me(lateClaim)).toMatchObject({ name: 'Gimli', claimed: true, needsName: true, canRename: true });
    expect(await rename(lateClaim, 'Gimli')).toMatchObject({ status: 400, body: { error: 'That name is taken.' } });
    const fixed = await rename(lateClaim, 'Gimli son of Gloin');
    expect(fixed).toMatchObject({ status: 200, body: { name: 'Gimli son of Gloin', needsName: false, canRename: false } });
    expect(await rename(lateClaim, 'Lockbearer')).toMatchObject({ status: 400, body: { error: 'You can rename once every 7 days.' } });
    clock += 7 * DAY;
    expect(await me(lateClaim)).toMatchObject({ canRename: true });
    expect(await rename(lateClaim, 'Lockbearer')).toMatchObject({ status: 200, body: { name: 'Lockbearer' } });
  });

  describe('deleting an account', () => {
    it('is refused with the wrong name, or while the account has a seat in a lobby', async () => {
      const { me: account, cookie } = await guest();
      const socket = await connect(cookie);
      socket.send({ type: 'create' });
      const { code } = await socket.next('joined');
      expect(await api('/api/me/delete', { method: 'POST', cookie, body: { confirm: 'Someone else' } })).toMatchObject({ status: 400 });
      expect(await api('/api/me/delete', { method: 'POST', cookie, body: {} })).toMatchObject({ status: 400 });
      expect(await api('/api/me/delete', { method: 'POST', cookie, origin: 'http://evil.test', body: { confirm: account.name } })).toMatchObject({ status: 403 });
      const refused = await api('/api/me/delete', { method: 'POST', cookie, body: { confirm: account.name } });
      expect(refused).toMatchObject({ status: 409, body: { error: expect.stringContaining(code) } });
      expect(await me(cookie)).toMatchObject({ id: account.id });
      socket.send({ type: 'leave' });
      await socket.next('left');
      socket.close();
    });

    it('deletes the account, signs it out and closes its connection, leaving "Deleted player" in others\' history', async () => {
      const [gone, stays] = [await guest(), await guest()];
      const claimed = session(await signIn(gone.cookie));
      await store.recordMatch(recordedMatch(result([gone.me.id, stays.me.id]), now()));
      const socket = await connect(claimed);
      await socket.next('hello');
      const deleted = await api('/api/me/delete', { method: 'POST', cookie: claimed, body: { confirm: ` ${gone.me.name.toUpperCase()} ` } });
      expect(deleted).toMatchObject({ status: 200, body: { ok: true } });
      expect(deleted.setCookie).toContain('Max-Age=0');
      expect(await socket.next('signedOut')).toEqual({ type: 'signedOut', reason: 'deleted' });
      await socket.gone();
      expect((await api('/api/profile', { cookie: claimed })).status).toBe(401);
      expect((await api(`/api/profile?account=${gone.me.id}`, { cookie: stays.cookie })).status).toBe(404);
      const [match] = (await api('/api/history', { cookie: stays.cookie })).body.matches as HistoryMatch[];
      expect(match!.seats[0]).toMatchObject({ account: null, name: 'Deleted player', guest: false });
      expect(match!.seats[1]).toMatchObject({ account: stays.me.id });
      // Signing in with that Google account again makes a new account.
      google.sub = `google-${subs}`;
      const fresh = await signIn(null);
      expect(fresh.location).toBe('/play.html#signin=claimed');
      expect((await me(session(fresh))).id).not.toBe(gone.me.id);
    });
  });
});
