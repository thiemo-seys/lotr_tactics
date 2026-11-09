import type { AccountView } from '@lotr-tactics/server';
import { describe, expect, it } from 'vitest';
import { readSignIn } from '@lotr-tactics/server';
import { AccountApi, AccountState, SIGN_IN_HREF, UNREACHABLE, confirmsDelete, nameToSend, signInToast, type Fetch } from '../src/account.js';

const me: AccountView = { id: 'a1', name: 'Guest 0427', claimed: false, canRename: true, needsName: false, googleEnabled: false };

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
    await api.deleteAccount('Guest 0427');
    expect(requests).toEqual([
      { url: '/api/me', method: 'GET', body: undefined },
      { url: '/api/me/name', method: 'POST', body: { name: 'Samwise' } },
      { url: '/api/signout', method: 'POST', body: {} },
      { url: '/api/signout', method: 'POST', body: { everywhere: true } },
      { url: '/api/me/delete', method: 'POST', body: { confirm: 'Guest 0427' } },
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
    const seated = 'You have a seat in lobby QWERT. Leave it before deleting the account.';
    const inLobby = new AccountApi(fakeFetch(() => json(409, { error: seated })).fetcher);
    expect(await inLobby.deleteAccount('Samwise')).toEqual({ ok: false, status: 409, error: seated });
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

  it('makes online play unavailable when the account is signed out everywhere or deleted', () => {
    for (const [reason, text] of [
      ['everywhere', 'You were signed out on every device.'],
      ['deleted', 'This account was deleted.'],
    ] as const) {
      const account = new AccountState();
      account.loaded({ ok: true, value: me });
      account.receive({ type: 'hello', me, game: { code: 'QWERT' } });
      account.receive({ type: 'signedOut', reason });
      // The page no longer has the account, so the menu doesn't say who is playing until Try again.
      expect([account.me, account.online, account.game]).toEqual([null, { kind: 'unavailable', reason: text }, null]);
      expect(account.onlineReason).toBe(`Online play is unavailable: ${text[0]!.toLowerCase()}${text.slice(1)}`);
    }
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

describe('signing in with Google', () => {
  const ready = (view: AccountView) => {
    const account = new AccountState();
    account.loaded({ ok: true, value: view });
    account.receive({ type: 'hello', me: view, game: null });
    return account;
  };

  it('is offered to guests only, on a server that has it, leaving the page for the server', () => {
    expect(ready({ ...me, googleEnabled: true }).canSignIn).toBe(true);
    expect(ready(me).canSignIn).toBe(false);
    expect(ready({ ...me, claimed: true, googleEnabled: true }).canSignIn).toBe(false);
    expect(new AccountState().canSignIn).toBe(false);
    expect(SIGN_IN_HREF).toBe('/auth/google');
  });

  it('says how it went for each outcome, and what a guest left behind loses', () => {
    const claimed = signInToast(readSignIn('#signin=claimed')!, 'Samwise');
    expect(claimed.tone).toBe('good');
    expect(claimed.text).toMatch(/signed in with Google.*kept/);
    expect(signInToast(readSignIn('#signin=signedin')!, 'Frodo')).toMatchObject({ text: 'Signed in with Google as Frodo.', tone: 'good' });
    const lost = signInToast(readSignIn('#signin=signedin&guestGames=3')!, 'Frodo');
    expect(lost.tone).toBe('warn');
    expect(lost.text).toMatch(/^Signed in with Google as Frodo\. The 3 games you played as a guest .* stay with that guest account/);
    expect(lost.seconds).toBeGreaterThan(claimed.seconds);
    expect(signInToast(readSignIn('#signin=signedin&guestGames=1')!, 'Frodo').text).toMatch(/The game you played as a guest in this browser stays with/);
    expect(signInToast(readSignIn('#signin=cancelled')!, 'Guest 0427')).toMatchObject({ text: "Sign-in was cancelled. You're still playing as Guest 0427.", tone: 'info' });
    // The account didn't load: no name to give.
    expect(signInToast(readSignIn('#signin=cancelled')!, null).text).toBe("Sign-in was cancelled. You're still playing.");
    expect(signInToast(readSignIn('#signin=failed')!, null)).toMatchObject({ tone: 'bad', text: expect.stringMatching(/Try again/) });
    expect(signInToast(readSignIn('#signin=unavailable')!, null)).toMatchObject({ tone: 'bad', text: expect.stringMatching(/isn't available/) });
  });
});

describe('a new name', () => {
  const claimed: AccountView = { ...me, name: 'Frodo', claimed: true, needsName: true };

  it("says why the account must choose one: someone has its name, or it is a guest's", () => {
    const account = new AccountState();
    account.loaded({ ok: true, value: claimed });
    expect(account.newNameReason).toBe('Someone already has the name Frodo. Choose a new name to keep with your account.');
    account.update({ ...claimed, name: 'Guest 0427' });
    expect(account.newNameReason).toMatch(/^Guest 0427 is a guest's name/);
    account.update({ ...claimed, name: 'Samwise', needsName: false });
    expect(account.newNameReason).toBeNull();
    account.update({ ...me, needsName: false });
    expect(account.newNameReason).toBeNull();
  });

  it('comes before Create and Join, but not before going back to a seat the account has', () => {
    const account = new AccountState();
    account.loaded({ ok: true, value: claimed });
    account.receive({ type: 'hello', me: claimed, game: null });
    expect(account.onlineReason).toBe('Choose a new name first.');
    expect(account.renameReason).toBeNull();
    account.receive({ type: 'joined', code: 'QWERT', seat: 0 });
    expect(account.onlineReason).toBeNull();
    account.receive({ type: 'left', reason: 'You left the lobby.' });
    account.update({ ...claimed, name: 'Samwise', needsName: false });
    expect(account.onlineReason).toBeNull();
  });

  it('must differ from the name the account has', () => {
    expect(nameToSend('Frodo', 'Frodo', true)).toEqual({ error: 'Someone already has that name. Choose another.' });
    expect(nameToSend(' frodo ', 'Frodo', true)).toEqual({ error: 'Someone already has that name. Choose another.' });
    expect(nameToSend('Guest 0427', 'Guest 0427', true)).toHaveProperty('error');
    expect(nameToSend('Samwise', 'Frodo', true)).toEqual({ name: 'Samwise' });
  });
});

describe('deleting the account', () => {
  it('is confirmed by typing its name, compared as the server compares names', () => {
    expect(confirmsDelete('Samwise', 'Samwise')).toBe(true);
    expect(confirmsDelete('  samwise ', 'Samwise')).toBe(true);
    expect(confirmsDelete('Guest0427', 'Guest 0427')).toBe(true);
    expect(confirmsDelete('Samwis', 'Samwise')).toBe(false);
    expect(confirmsDelete('   ', 'Samwise')).toBe(false);
  });
});

describe('names and guest marks', () => {
  it('checks a new name as the server will, cleaned, and sends nothing for the same name', () => {
    expect(nameToSend('  Samwise  ', 'Guest 0427')).toEqual({ name: 'Samwise' });
    expect(nameToSend('Sa', 'Guest 0427')).toEqual({ error: 'A name has 3 to 20 characters.' });
    expect(nameToSend('Bot 7', 'Guest 0427')).toHaveProperty('error');
    expect(nameToSend('Guest 0427 ', 'Guest 0427')).toBeNull();
  });
});
