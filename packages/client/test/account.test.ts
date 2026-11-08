import type { AccountView, SeatView } from '@lotr-tactics/server';
import { describe, expect, it } from 'vitest';
import { AccountApi, AccountState, UNREACHABLE, isGuestSeat, nameToSend, type Fetch } from '../src/account.js';

const me: AccountView = { id: 'a1', name: 'Guest 0427', claimed: false, canRename: true, googleEnabled: false };

/** A fetch that records each request and answers with the given response. */
function fakeFetch(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const requests: { url: string; method: string; body: unknown }[] = [];
  const fetcher: Fetch = async (url, init) => {
    requests.push({ url, method: init.method ?? 'GET', body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    return answer(url, init);
  };
  return { fetcher, requests };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('the account API', () => {
  it('loads the account, and sends a rename and signing out as JSON', async () => {
    const { fetcher, requests } = fakeFetch((url) => json(200, url === '/api/signout' ? { ok: true } : me));
    const api = new AccountApi(fetcher);
    expect(await api.me()).toEqual({ ok: true, value: me });
    expect(await api.rename('Samwise')).toEqual({ ok: true, value: me });
    await api.signOut(false);
    await api.signOut(true);
    expect(requests).toEqual([
      { url: '/api/me', method: 'GET', body: undefined },
      { url: '/api/me/name', method: 'POST', body: { name: 'Samwise' } },
      { url: '/api/signout', method: 'POST', body: {} },
      { url: '/api/signout', method: 'POST', body: { everywhere: true } },
    ]);
  });

  it("asks for the person's own profile and history, or someone else's, a page older than a match", async () => {
    const { fetcher, requests } = fakeFetch(() => json(200, { matches: [] }));
    const api = new AccountApi(fetcher);
    await api.profile(null);
    await api.profile('b2');
    await api.history(null, null);
    await api.history('b2', 'm9');
    expect(requests.map((r) => r.url)).toEqual(['/api/profile', '/api/profile?account=b2', '/api/history', '/api/history?account=b2&before=m9']);
  });

  it("gives the server's reason when it refuses, with its status", async () => {
    const api = new AccountApi(fakeFetch(() => json(400, { error: 'That name is taken.' })).fetcher);
    expect(await api.rename('Frodo')).toEqual({ ok: false, status: 400, error: 'That name is taken.' });
    const missing = new AccountApi(fakeFetch(() => json(404, { error: 'There is no such player.' })).fetcher);
    expect(await missing.profile('b2')).toEqual({ ok: false, status: 404, error: 'There is no such player.' });
  });

  it("says the server can't be reached when there is no answer, or an answer that isn't the API", async () => {
    const down = new AccountApi(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await down.me()).toEqual({ ok: false, status: 0, error: UNREACHABLE });
    // A page served without the game server, which answers with HTML.
    const html = new AccountApi(fakeFetch(() => new Response('<!doctype html>', { status: 200 })).fetcher);
    expect(await html.me()).toEqual({ ok: false, status: 200, error: UNREACHABLE });
    const proxy = new AccountApi(fakeFetch(() => new Response('', { status: 502 })).fetcher);
    expect(await proxy.me()).toEqual({ ok: false, status: 502, error: UNREACHABLE });
  });

  it('gives up on a request that takes too long', async () => {
    const hanging: Fetch = (_, init) =>
      new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    expect(await new AccountApi(hanging, 5).me()).toEqual({ ok: false, status: 0, error: UNREACHABLE });
  });
});

describe('the account state', () => {
  it('waits for the account, then connects, and is ready once the server says hello', () => {
    const account = new AccountState();
    expect(account.online.kind).toBe('loading');
    expect(account.onlineReason).toBe('Connecting to the game server…');
    account.loaded({ ok: true, value: me });
    expect([account.me, account.online.kind]).toEqual([me, 'connecting']);
    const renamed = { ...me, name: 'Samwise' };
    account.receive({ type: 'hello', me: renamed, game: null });
    expect([account.me, account.online.kind, account.game, account.onlineReason]).toEqual([renamed, 'ready', null, null]);
    expect(account.createRequest()).toEqual({ type: 'create' });
    expect(account.joinRequest('ABCDE')).toEqual({ type: 'join', code: 'ABCDE' });
  });

  it('offers offline play only when the account fails to load, saying why', () => {
    const account = new AccountState();
    account.loaded({ ok: false, status: 0, error: UNREACHABLE });
    expect([account.me, account.online]).toEqual([null, { kind: 'unavailable', reason: UNREACHABLE }]);
    expect(account.onlineReason).toBe("Online play is unavailable: can't reach the game server.");
    expect(account.renameReason).not.toBeNull();
  });

  it("follows the account's seat, so Create and Join take the person back to it instead of being refused", () => {
    const account = new AccountState();
    account.loaded({ ok: true, value: me });
    account.receive({ type: 'hello', me, game: { code: 'QWERT' } });
    expect(account.game).toBe('QWERT');
    expect(account.createRequest()).toEqual({ type: 'rejoin', code: 'QWERT' });
    expect(account.joinRequest('ABCDE')).toEqual({ type: 'rejoin', code: 'QWERT' });
    account.receive({ type: 'refused', request: 'rejoin', reason: 'That lobby has closed.' });
    expect(account.game).toBeNull();
    account.receive({ type: 'joined', code: 'ZXCVB', seat: 2 });
    expect(account.game).toBe('ZXCVB');
    account.receive({ type: 'refused', request: 'act', reason: 'Not enough gold.' });
    expect(account.game).toBe('ZXCVB');
    account.receive({ type: 'left', reason: 'You left the lobby.' });
    expect(account.game).toBeNull();
  });

  it('stays replaced when the replaced connection closes, until the person uses the game here', () => {
    const account = new AccountState();
    account.loaded({ ok: true, value: me });
    account.receive({ type: 'hello', me, game: { code: 'QWERT' } });
    account.receive({ type: 'replaced' });
    expect([account.online.kind, account.game]).toEqual(['replaced', null]);
    expect(account.onlineReason).toMatch(/open somewhere else/);
    account.closed('Lost the connection to the game server.');
    expect(account.online.kind).toBe('replaced');
    account.connecting();
    expect(account.online.kind).toBe('connecting');
    account.closed('Lost the connection to the game server.');
    expect(account.online).toEqual({ kind: 'unavailable', reason: 'Lost the connection to the game server.' });
  });

  it("takes a renamed account from the server, and refuses a claimed account's rename within the limit", () => {
    const account = new AccountState();
    account.loaded({ ok: true, value: me });
    account.update({ ...me, name: 'Samwise' });
    expect(account.me?.name).toBe('Samwise');
    // Another account's view, as after signing out in another tab, is not this one's.
    account.update({ ...me, id: 'other', name: 'Merry' });
    expect(account.me?.name).toBe('Samwise');
    expect(account.renameReason).toBeNull();
    account.update({ ...me, claimed: true, canRename: false });
    expect(account.renameReason).toBe('You can rename once every 7 days.');
    account.loading();
    expect([account.me, account.online.kind]).toEqual([null, 'loading']);
  });
});

describe('names and guest marks', () => {
  it('checks a new name as the server will, cleaned, and sends nothing for the same name', () => {
    expect(nameToSend('  Samwise  ', 'Guest 0427')).toEqual({ name: 'Samwise' });
    expect(nameToSend('Sa', 'Guest 0427')).toEqual({ error: 'A name has 3 to 20 characters.' });
    expect(nameToSend('Bot 7', 'Guest 0427')).toHaveProperty('error');
    expect(nameToSend('Guest 0427 ', 'Guest 0427')).toBeNull();
  });

  it('mark people playing as guests, but not bots, empty seats or the offline player', () => {
    const seat = (s: Partial<SeatView>): SeatView => ({ kind: 'person', name: 'Ann', connected: true, player: 'a1', guest: true, ...s });
    expect(isGuestSeat(seat({}))).toBe(true);
    expect(isGuestSeat(seat({ guest: false }))).toBe(false);
    expect(isGuestSeat(seat({ kind: 'bot', player: null, guest: false }))).toBe(false);
    expect(isGuestSeat(seat({ player: 'local', name: 'You' }))).toBe(false);
    expect(isGuestSeat(undefined)).toBe(false);
  });
});
