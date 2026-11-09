// The person's account on the play page (docs/accounts-spec.md sections 6, 11 and 14): the HTTP
// API as the page calls it, and what the page knows of the account and of online play. No DOM
// apart from fetch, which tests replace, so it can be tested.

import {
  GOOGLE_SIGN_IN_PATH,
  NAMES,
  checkName,
  nameKey,
  type AccountView,
  type ClientMessage,
  type HistoryPage,
  type ProfileView,
  type ServerMessage,
  type SignInResult,
} from '@lotr-tactics/server';

// What GET /api/profile and GET /api/history return (accounts-spec.md sections 9.3 and 9.4), as
// the server's browser-safe accounts module has them.
export type { HistoryMatch, HistorySeat, PlaceStats, ProfileView as Profile, Stats } from '@lotr-tactics/server';

export type ApiResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: number; readonly error: string };

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** What the page says when the API doesn't answer, or answers with something that isn't the API. */
export const UNREACHABLE = "Can't reach the game server.";

/** How long a request may take before the page gives up on it, in milliseconds. */
const TIMEOUT_MS = 8000;

/**
 * The account API on the page's own origin. Every request carries the session cookie, and every
 * answer is a result: the value, or the status and the server's reason. Status 0 means no answer.
 */
export class AccountApi {
  constructor(
    private readonly fetcher: Fetch = (url, init) => fetch(url, init),
    private readonly timeoutMs = TIMEOUT_MS,
  ) {}

  /** The account, making a guest if the browser has no session. */
  me(): Promise<ApiResult<AccountView>> {
    return this.request('GET', '/api/me');
  }

  rename(name: string): Promise<ApiResult<AccountView>> {
    return this.request('POST', '/api/me/name', { name });
  }

  signOut(everywhere: boolean): Promise<ApiResult<{ readonly ok: true }>> {
    return this.request('POST', '/api/signout', everywhere ? { everywhere: true } : {});
  }

  /**
   * Deletes the account, once `confirm` is its name. The server refuses while the account has a seat
   * in a lobby (409), and clears the session cookie when it is done (accounts-spec.md section 6.4).
   */
  deleteAccount(confirm: string): Promise<ApiResult<{ readonly ok: true }>> {
    return this.request('POST', '/api/me/delete', { confirm });
  }

  /** An account's profile, or the person's own with null. */
  profile(account: string | null): Promise<ApiResult<ProfileView>> {
    return this.request('GET', `/api/profile${query({ account })}`);
  }

  /** A page of an account's matches, newest first, older than the match `before`. */
  history(account: string | null, before: string | null): Promise<ApiResult<HistoryPage>> {
    return this.request('GET', `/api/history${query({ account, before })}`);
  }

  private async request<T>(method: 'GET' | 'POST', url: string, body?: object): Promise<ApiResult<T>> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        method,
        credentials: 'same-origin',
        signal: abort.signal,
        ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        // Not JSON: not the game server's API, such as a page served without it.
      }
      if (!isRecord(data)) return { ok: false, status: response.status, error: UNREACHABLE };
      if (response.ok && typeof data.error !== 'string') return { ok: true, value: data as T };
      return { ok: false, status: response.status, error: typeof data.error === 'string' ? data.error : UNREACHABLE };
    } catch {
      return { ok: false, status: 0, error: UNREACHABLE };
    } finally {
      clearTimeout(timer);
    }
  }
}

function query(params: Readonly<Record<string, string | null>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null) search.set(key, value);
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Where online play stands for the page. */
export type Online =
  /** GET /api/me hasn't answered yet: the menu waits for it. */
  | { readonly kind: 'loading' }
  /** No server, or it went away: offline play only. */
  | { readonly kind: 'unavailable'; readonly reason: string }
  /** The account is loaded and the WebSocket is opening. */
  | { readonly kind: 'connecting' }
  /** The server said hello: Create and Join work. */
  | { readonly kind: 'ready' }
  /** The account's game was opened in another tab or on another device, which took the connection. */
  | { readonly kind: 'replaced' };

/**
 * The account and online play as the page knows them, from the API's answers and the WebSocket's
 * messages. It decides nothing about the account: the server does.
 */
export class AccountState {
  me: AccountView | null = null;
  online: Online = { kind: 'loading' };
  /** The lobby the account has a seat in, as the server last said, or null. */
  game: string | null = null;

  /** GET /api/me is on its way, at the start or after signing out. */
  loading(): void {
    this.me = null;
    this.online = { kind: 'loading' };
    this.game = null;
  }

  /** GET /api/me answered: the account, or why online play can't be had. */
  loaded(result: ApiResult<AccountView>): void {
    if (result.ok) {
      this.me = result.value;
      this.online = { kind: 'connecting' };
    } else {
      this.me = null;
      this.online = { kind: 'unavailable', reason: result.error };
    }
  }

  /** The WebSocket is opening again, as after "Use here". */
  connecting(): void {
    if (this.me !== null) this.online = { kind: 'connecting' };
  }

  /** A message from the game server. */
  receive(message: ServerMessage): void {
    switch (message.type) {
      case 'hello':
        this.me = message.me;
        this.online = { kind: 'ready' };
        this.game = message.game?.code ?? null;
        return;
      case 'joined':
        this.game = message.code;
        return;
      case 'left':
        this.game = null;
        return;
      case 'refused':
        if (message.request === 'rejoin') this.game = null;
        return;
      case 'replaced':
        this.online = { kind: 'replaced' };
        this.game = null;
        return;
      case 'signedOut':
        // The session has gone too, so the page no longer has this account: Try again gets a new guest.
        this.me = null;
        this.online = {
          kind: 'unavailable',
          reason: message.reason === 'deleted' ? 'This account was deleted.' : 'You were signed out on every device.',
        };
        this.game = null;
        return;
    }
  }

  /** The WebSocket closed for good, other than by being replaced. */
  closed(reason: string): void {
    if (this.online.kind !== 'replaced') this.online = { kind: 'unavailable', reason };
    this.game = null;
  }

  /** The account was renamed, or otherwise changed, as the server says. */
  update(me: AccountView): void {
    if (this.me?.id === me.id) this.me = me;
  }

  /**
   * Why Create and Join can't be used now, or null when they can. Online play needs the server's
   * hello; while the account has a seat elsewhere, they take the person back to it instead.
   */
  get onlineReason(): string | null {
    switch (this.online.kind) {
      case 'ready':
        // A new name comes before anything else online, apart from going back to a seat the account has.
        return this.me?.needsName === true && this.game === null ? 'Choose a new name first.' : null;
      case 'loading':
      case 'connecting':
        return 'Connecting to the game server…';
      case 'unavailable':
        return `Online play is unavailable: ${lowerFirst(this.online.reason)}`;
      case 'replaced':
        return 'The game is open somewhere else. Use it here to play online.';
    }
  }

  /**
   * What Create sends: `create`, or `rejoin` while the account has a seat in a game, which the
   * server would otherwise refuse (accounts-spec.md section 12).
   */
  createRequest(): ClientMessage {
    return this.game === null ? { type: 'create' } : { type: 'rejoin', code: this.game };
  }

  /** What Join sends: `join`, or `rejoin` while the account has a seat in a game. */
  joinRequest(code: string): ClientMessage {
    return this.game === null ? { type: 'join', code } : { type: 'rejoin', code: this.game };
  }

  /** Why the person can't rename now, or null. */
  get renameReason(): string | null {
    if (this.me === null) return 'Online play is unavailable.';
    return this.me.canRename ? null : `You can rename once every ${NAMES.renameDays} days.`;
  }

  /**
   * Whether the page offers Sign in with Google: to a guest, on a server that has it. A claimed
   * account can't sign in to another Google account; it signs out first.
   */
  get canSignIn(): boolean {
    return this.me !== null && !this.me.claimed && this.me.googleEnabled;
  }

  /**
   * Why a claimed account must choose a new name (`needsName`, accounts-spec.md section 6.3), or
   * null when it needn't: another claimed account holds its name, or it is a guest's name.
   */
  get newNameReason(): string | null {
    const me = this.me;
    if (me === null || !me.needsName) return null;
    return 'error' in checkName(me.name)
      ? `${me.name} is a guest's name. Choose a name of your own to keep with your account.`
      : `Someone already has the name ${me.name}. Choose a new name to keep with your account.`;
  }
}

/** Where Sign in with Google takes the whole page, which leaves it (accounts-spec.md section 6.2). */
export const SIGN_IN_HREF = GOOGLE_SIGN_IN_PATH;

/** What Sign in with Google gives a guest, in one line. */
export const SIGN_IN_GIVES = 'Keep your account and its match history on any device.';

/** A message at the top of the page for a while, such as how signing in went. */
export interface Toast {
  readonly text: string;
  /** good: it worked; info: nothing changed; bad: it went wrong; warn: it worked, but something was lost. */
  readonly tone: 'good' | 'info' | 'warn' | 'bad';
  /** How long it stays, unless dismissed. */
  readonly seconds: number;
}

/**
 * What the page says on coming back from Google (`#signin=`, read with `readSignIn`), with the
 * account's name as `GET /api/me` then gives it, or null if it didn't load.
 */
export function signInToast(result: SignInResult, name: string | null): Toast {
  const as = name === null ? '' : ` as ${name}`;
  switch (result.outcome) {
    case 'claimed':
      return { text: "You're signed in with Google. Your name and games are kept, on any device you sign in on.", tone: 'good', seconds: 10 };
    case 'signedin': {
      const signedIn = `Signed in with Google${as}.`;
      if (result.guestGames === 0) return { text: signedIn, tone: 'good', seconds: 8 };
      const games = result.guestGames === 1 ? 'The game you played as a guest in this browser stays' : `The ${result.guestGames} games you played as a guest in this browser stay`;
      // It lost something, so it stays longer.
      return {
        text: `${signedIn} ${games} with that guest account, which can't be used any more.`,
        tone: 'warn',
        seconds: 20,
      };
    }
    case 'cancelled':
      return { text: `Sign-in was cancelled. You're still playing${as}.`, tone: 'info', seconds: 8 };
    case 'failed':
      return { text: "Signing in with Google didn't work. Try again.", tone: 'bad', seconds: 12 };
    case 'unavailable':
      return { text: "Google sign-in isn't available on this server.", tone: 'bad', seconds: 12 };
  }
}

/**
 * Whether the text typed to confirm deleting is the account's name, compared as the server compares
 * names: ignoring case and spaces (accounts-spec.md section 6.4).
 */
export function confirmsDelete(typed: string, name: string): boolean {
  const trimmed = typed.trim();
  return trimmed !== '' && nameKey(trimmed) === nameKey(name);
}

function lowerFirst(text: string): string {
  return text === '' ? text : text[0]!.toLowerCase() + text.slice(1);
}

/**
 * A name to send to POST /api/me/name, cleaned as the server will clean it, or the reason the
 * server would refuse it, so the person hears at once. The server still checks it, and has the last
 * word, such as a name another account holds.
 */
export function nameToSend(
  raw: string,
  current: string | null,
  mustChange = false,
): { readonly name: string } | { readonly error: string } | null {
  // The same name, such as a guest's own "Guest 0427", which a rename couldn't take: nothing to send,
  // unless the account must choose a new one.
  if (!mustChange && raw.replace(/\p{Cc}/gu, '').trim() === current) return null;
  const checked = checkName(raw);
  if ('error' in checked) return checked;
  if (mustChange && current !== null && checked.key === nameKey(current)) return { error: 'Someone already has that name. Choose another.' };
  return { name: checked.name };
}
