import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSecret } from '../src/node/sessions.js';
import { PgStore, type HistoryMatch } from '../src/node/store.js';
import { startServer, type RunningServer } from '../src/server.js';
import { SKIP_REASON, noteSkipped, testDatabase, type TestDatabase } from './db.js';
import { web, type SocketClient } from './web.js';

/** The site's origin, as PUBLIC_URL would give it. */
const ORIGIN = 'http://tactics.test';

noteSkipped();

describe.skipIf(SKIP_REASON !== null)('the Node server', () => {
  let db: TestDatabase;
  let server: RunningServer;

  beforeAll(async () => {
    db = await testDatabase();
    const dir = mkdtempSync(join(tmpdir(), 'lotr-client-'));
    writeFileSync(join(dir, 'index.html'), '<p>The fight viewer</p>');
    writeFileSync(join(dir, 'play.js'), 'export {};');
    mkdirSync(join(dir, 'models'));
    writeFileSync(join(dir, 'models', 'frodo.glb'), 'glTF');
    server = await startServer({ port: 0, clientDir: dir, store: new PgStore(db.pool), publicUrl: ORIGIN, trustProxy: true });
  });

  afterAll(async () => {
    await server?.close();
    await db?.close();
  });

  const { base, request: api, guest, open, connect } = web(() => server.port, ORIGIN);

  /**
   * Plays a seat as quickly as the server allows: picks the first free option in its Council
   * turns, and is Ready once in every planning and fight step.
   */
  function autoplay(client: SocketClient): void {
    const done = new Set<string>();
    client.listen((message) => {
      if (message.type !== 'state') return;
      const { state } = message;
      const key = `${state.stage}-${state.round}-${state.step.kind}-${state.council?.group ?? ''}`;
      if (done.has(key) || state.me.placement !== null) return;
      if (state.step.kind === 'council') {
        // Until this seat has picked: someone in its group may take the same option first.
        const council = state.council!;
        if (!council.groups[council.group]!.includes(state.you) || council.options.some((o) => o.pickedBy === state.you)) return;
        client.send({ type: 'act', action: { type: 'pick', option: council.options.findIndex((o) => o.pickedBy === null) } });
      } else if (state.step.kind === 'planning' || state.step.kind === 'fight') {
        done.add(key);
        client.send({ type: 'ready' });
      }
    });
  }

  it('serves the client build and nothing outside it', async () => {
    const page = await fetch(`${base()}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('fight viewer');
    expect((await fetch(`${base()}/play.js`)).headers.get('content-type')).toContain('text/javascript');
    expect((await fetch(`${base()}/models/frodo.glb`)).headers.get('content-type')).toBe('model/gltf-binary');
    expect((await fetch(`${base()}/missing.html`)).status).toBe(404);
    expect((await fetch(`${base()}/%2e%2e/%2e%2e/etc/passwd`)).status).toBe(404);
    expect((await fetch(`${base()}/..%2F..%2Fpackage.json`)).status).toBe(404);
  });

  describe('the API', () => {
    it('makes a guest with a session cookie, and knows it again by the cookie', async () => {
      const { me, cookie } = await guest();
      expect(me).toEqual({
        id: expect.any(String),
        name: expect.stringMatching(/^Guest \d{4}$/),
        claimed: false,
        canRename: true,
        needsName: false,
        googleEnabled: false,
      });
      const again = await api('/api/me', { cookie });
      expect(again.body).toEqual(me);
      // Not renewed on the same day, so no new cookie.
      expect(again.setCookie).toBeNull();
      // A cookie that isn't a session gets a new guest.
      const other = await api('/api/me', { cookie: 'lt_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
      expect(other.body.id).not.toBe(me.id);
    });

    it('makes at most 10 guests an hour from one address', async () => {
      for (let i = 0; i < 10; i++) expect((await api('/api/me', { from: '192.0.2.7' })).status).toBe(200);
      expect(await api('/api/me', { from: '192.0.2.7' })).toMatchObject({ status: 429, body: { error: expect.any(String) } });
      expect((await api('/api/me', { from: '192.0.2.8' })).status).toBe(200);
    });

    it('renames, refusing bad names, a missing session and other origins', async () => {
      const { me, cookie } = await guest();
      expect(await api('/api/me/name', { method: 'POST', body: { name: 'Strider' } })).toMatchObject({ status: 401 });
      expect(await api('/api/me/name', { method: 'POST', cookie, origin: 'http://evil.test', body: { name: 'Strider' } })).toMatchObject({ status: 403 });
      expect(await api('/api/me/name', { method: 'POST', cookie, origin: null, body: { name: 'Strider' } })).toMatchObject({ status: 403 });
      const bad = await api('/api/me/name', { method: 'POST', cookie, body: { name: 'Bot 4' } });
      expect(bad.status).toBe(400);
      expect(bad.body.error).toEqual(expect.any(String));
      expect((await api('/api/me/name', { method: 'POST', cookie, body: 'nonsense' })).status).toBe(400);
      expect((await api('/api/me/name', { method: 'POST', cookie, body: { name: 'x'.repeat(5000) } })).status).toBe(400);
      const renamed = await api('/api/me/name', { method: 'POST', cookie, body: { name: '  Strider ' } });
      expect(renamed).toMatchObject({ status: 200, body: { ...me, name: 'Strider' } });
      expect((await api('/api/me', { cookie })).body.name).toBe('Strider');
      expect((await api('/api/nothing', { cookie })).status).toBe(404);
    });

    it('shows a rename in the lobby the account is in', async () => {
      const { cookie } = await guest();
      const client = await connect(cookie);
      client.send({ type: 'create' });
      await client.next('joined');
      await api('/api/me/name', { method: 'POST', cookie, body: { name: 'Elessar' } });
      const lobby = await client.next('lobby', (m) => m.lobby.seats[0]!.name === 'Elessar');
      expect(lobby.lobby.seats[0]).toMatchObject({ kind: 'person', guest: true });
      client.send({ type: 'leave' });
      client.close();
    });

    it('signs out one device, or every device', async () => {
      const { cookie } = await guest();
      const out = await api('/api/signout', { method: 'POST', cookie });
      expect(out.status).toBe(200);
      expect(out.setCookie).toContain('Max-Age=0');
      expect((await api('/api/history', { cookie })).status).toBe(401);

      const first = await guest();
      // A second session for the same account, as on another device.
      const secret = 'B'.repeat(43);
      await new PgStore(db.pool).createSession(hashSecret(secret), first.me.id, new Date(Date.now() + 86_400_000));
      const otherDevice = `lt_session=${secret}`;
      expect((await api('/api/me', { cookie: otherDevice })).body.id).toBe(first.me.id);
      const client = await connect(first.cookie);
      await client.next('hello');
      expect((await api('/api/signout', { method: 'POST', cookie: otherDevice, body: { everywhere: true } })).status).toBe(200);
      expect((await api('/api/profile', { cookie: otherDevice })).status).toBe(401);
      expect((await api('/api/profile', { cookie: first.cookie })).status).toBe(401);
      // The account's game connection is told so, and goes too.
      expect(await client.next('signedOut')).toEqual({ type: 'signedOut', reason: 'everywhere' });
      await client.gone();
    });

    it("sends the browser back to the page from Google sign-in while it's off", async () => {
      const { cookie } = await guest();
      for (const path of ['/auth/google', '/auth/google/callback?code=x&state=y']) {
        const response = await api(path, { cookie });
        expect(response.status).toBe(303);
        expect(response.location).toBe('/play.html#signin=unavailable');
      }
      expect((await api('/auth/elsewhere', { cookie })).status).toBe(404);
    });

    it("shows a guest's profile and history only to the guest", async () => {
      const ann = await guest();
      const bo = await guest();
      const own = await api('/api/profile', { cookie: ann.cookie });
      expect(own).toMatchObject({ status: 200, body: { id: ann.me.id, name: ann.me.name, guest: true, stats: { all: { games: 0 } } } });
      expect((await api(`/api/profile?account=${ann.me.id}`, { cookie: bo.cookie })).status).toBe(404);
      expect((await api(`/api/history?account=${ann.me.id}`, { cookie: bo.cookie })).status).toBe(404);
      expect((await api('/api/history?account=not-an-id', { cookie: bo.cookie })).status).toBe(404);
      expect((await api('/api/history?before=not-an-id', { cookie: bo.cookie })).status).toBe(400);
      expect(await api('/api/history', { cookie: ann.cookie })).toMatchObject({ status: 200, body: { matches: [] } });
    });
  });

  describe('WebSockets', () => {
    it('refuse the upgrade without a session or with a wrong Origin', async () => {
      const { cookie } = await guest();
      expect(await open(null)).toBe(401);
      expect(await open('lt_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(401);
      expect(await open(cookie, 'http://evil.test')).toBe(403);
      const client = await connect(cookie);
      expect((await client.next('hello')).game).toBeNull();
      client.close();
    });

    it('replace an account’s older connection, which hands over its seat', async () => {
      const { cookie } = await guest();
      const first = await connect(cookie);
      first.send({ type: 'create' });
      const { code } = await first.next('joined');
      const second = await connect(cookie);
      expect(await second.next('hello')).toMatchObject({ game: { code } });
      expect(await second.next('joined')).toEqual({ type: 'joined', code, seat: 0 });
      await first.next('replaced');
      await first.gone();
      second.send({ type: 'leave' });
      await second.next('left');
      second.close();
    });

    it('let two people play a private lobby to the end, after which both have it in their history', { timeout: 60_000 }, async () => {
      const frodo = await guest();
      const sam = await guest();
      const a = await connect(frodo.cookie);
      const b = await connect(sam.cookie);
      a.send({ type: 'create' });
      const { code } = await a.next('joined');
      b.send({ type: 'join', code });
      expect((await b.next('joined')).seat).toBe(1);
      autoplay(a);
      autoplay(b);
      a.send({ type: 'start' });
      const [first, second] = await Promise.all([a.next('state'), b.next('state')]);
      expect(first.state.step.kind).toBe('planning');
      expect(first.state.players).toEqual(second.state.players);
      const [overA] = await Promise.all([a.next('state', (m) => m.state.step.kind === 'over'), b.next('state', (m) => m.state.step.kind === 'over')]);
      const places = overA.state.players.map((p) => p.placement);

      // The result is written once the game ends.
      let histories: HistoryMatch[][] = [];
      for (let i = 0; i < 50; i++) {
        histories = await Promise.all(
          [frodo, sam].map(async (who) => (await api('/api/history', { cookie: who.cookie })).body.matches as HistoryMatch[]),
        );
        if (histories.every((h) => h.length > 0)) break;
        await new Promise((wait) => setTimeout(wait, 100));
      }
      const [mine, theirs] = histories;
      expect(mine).toHaveLength(1);
      expect(theirs!.map((m) => m.id)).toEqual(mine!.map((m) => m.id));
      const match = mine![0]!;
      expect([match.kind, match.seat, theirs![0]!.seat]).toEqual(['private', 0, 1]);
      expect(match.seats.map((s) => s.place)).toEqual(places);
      expect(match.seats.map((s) => s.account)).toEqual([frodo.me.id, sam.me.id, null, null, null, null, null, null]);
      expect(match.seats.map((s) => s.name)).toEqual([frodo.me.name, sam.me.name, 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5', 'Bot 6']);
      for (const seat of match.seats) expect(seat.board.units.length).toBeGreaterThan(0);
      const profile = await api('/api/profile', { cookie: sam.cookie });
      expect((profile.body.stats as { all: { games: number } }).all.games).toBe(1);
      a.close();
      b.close();
    });
  });
});
