// Signing in with Google (docs/accounts-spec.md section 6.2): OpenID Connect's authorization code
// flow with PKCE, for the `openid` scope only. A guest with a new Google account becomes claimed;
// a Google account that already has an account signs the browser in to it. Node only.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GOOGLE_SIGN_IN_PATH, signInHash, type SignInResult } from '../accounts.js';
import { GOOGLE } from '../config.js';
import type { Lobbies } from '../lobbies.js';
import { readCookie, type Sessions } from './sessions.js';
import type { Account, Store } from './store.js';

/** Google's own endpoints and the issuers its ID tokens name. */
export const GOOGLE_ENDPOINTS = {
  authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  issuers: ['https://accounts.google.com', 'accounts.google.com'],
} as const;

/** The Google OAuth client, from GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. */
export interface GoogleConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  /** Where to send the browser to sign in. Google's, unless a test runs its own. */
  readonly authorizationEndpoint?: string;
  /** Where to swap the code for tokens. Google's, unless a test runs its own. */
  readonly tokenEndpoint?: string;
  /** The `iss` an ID token may have. Google's, unless a test runs its own. */
  readonly issuers?: readonly string[];
}

/** The cookie that keeps the state, the nonce and the PKCE verifier while the person is at Google. */
export const GOOGLE_COOKIE = 'lt_google';

const CALLBACK_PATH = `${GOOGLE_SIGN_IN_PATH}/callback`;

/** Where the browser goes back to. */
const PLAY_PAGE = '/play.html';

const BASE64URL = /^[A-Za-z0-9_-]{22,128}$/;

export interface GoogleSignInOptions {
  /** Null when sign-in isn't configured. */
  readonly config: GoogleConfig | null;
  /** PUBLIC_URL's origin, for the redirect back from Google. */
  readonly origin: string;
  readonly store: Store;
  readonly sessions: Sessions;
  readonly lobbies: Lobbies;
  readonly log?: (message: string) => void;
}

/** What the browser's cookie kept while it was at Google. */
interface Pending {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
}

export class GoogleSignIn {
  private readonly log: (message: string) => void;

  constructor(private readonly options: GoogleSignInOptions) {
    this.log = options.log ?? ((message) => console.warn(message));
  }

  /** Whether a path is sign-in's. */
  static handles(path: string): boolean {
    return path === '/auth' || path.startsWith('/auth/');
  }

  get enabled(): boolean {
    return this.options.config !== null;
  }

  private get redirectUri(): string {
    return `${this.options.origin}${CALLBACK_PATH}`;
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://host');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'cache-control': 'no-store' }).end();
    } else if (url.pathname === GOOGLE_SIGN_IN_PATH) {
      this.start(response);
    } else if (url.pathname === CALLBACK_PATH) {
      const result = await this.callback(request, url).catch((error: unknown): Outcome => {
        this.log(`Google sign-in failed: ${(error as Error).message}`);
        return { outcome: 'failed', guestGames: 0, session: null };
      });
      const cookies = [this.clearPending()];
      if (result.session !== null) cookies.push(result.session);
      redirect(response, `${PLAY_PAGE}#${signInHash(result)}`, cookies);
    } else {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end('Not found');
    }
  }

  /** `GET /auth/google`: keeps a state, a nonce and a PKCE verifier in a cookie, and sends the browser to Google. */
  private start(response: ServerResponse): void {
    const { config } = this.options;
    if (config === null) {
      redirect(response, `${PLAY_PAGE}#${signInHash({ outcome: 'unavailable', guestGames: 0 })}`, []);
      return;
    }
    const pending: Pending = { state: random(), nonce: random(), verifier: random() };
    const to = new URL(config.authorizationEndpoint ?? GOOGLE_ENDPOINTS.authorization);
    to.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid',
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: createHash('sha256').update(pending.verifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    const cookie = `${GOOGLE_COOKIE}=${pending.state}.${pending.nonce}.${pending.verifier}; ${this.options.sessions.attributes(GOOGLE_SIGN_IN_PATH)}; Max-Age=${GOOGLE.stateSeconds}`;
    redirect(response, to.toString(), [cookie]);
  }

  /** `GET /auth/google/callback`: checks the state, swaps the code for an ID token, and signs in with its `sub`. */
  private async callback(request: IncomingMessage, url: URL): Promise<Outcome> {
    const { config } = this.options;
    if (config === null) return { outcome: 'unavailable', guestGames: 0, session: null };
    const pending = readPending(readCookie(request.headers.cookie, GOOGLE_COOKIE));
    const state = url.searchParams.get('state');
    if (pending === null || state === null || !same(state, pending.state)) {
      this.log("Google sign-in refused: its state doesn't match the browser's.");
      return { outcome: 'failed', guestGames: 0, session: null };
    }
    const error = url.searchParams.get('error');
    if (error !== null) return { outcome: error === 'access_denied' ? 'cancelled' : 'failed', guestGames: 0, session: null };
    const code = url.searchParams.get('code');
    if (code === null || code === '' || code.length > 2048) return { outcome: 'failed', guestGames: 0, session: null };
    const sub = await this.subject(config, code, pending);
    if (sub === null) return { outcome: 'failed', guestGames: 0, session: null };
    return this.signIn(request, sub);
  }

  /** Swaps the code for tokens at the token endpoint, and reads the `sub` from the checked ID token. */
  private async subject(config: GoogleConfig, code: string, pending: Pending): Promise<string | null> {
    const response = await fetch(config.tokenEndpoint ?? GOOGLE_ENDPOINTS.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code_verifier: pending.verifier,
      }),
      signal: AbortSignal.timeout(GOOGLE.timeoutSeconds * 1000),
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      // Google's error code, such as invalid_grant, is safe to log; nothing else of the answer is.
      const reason = typeof body?.error === 'string' && /^[a-z_]{1,40}$/.test(body.error) ? ` (${body.error})` : '';
      this.log(`Google sign-in failed: the token endpoint answered ${response.status}${reason}.`);
      return null;
    }
    const claims = typeof body?.id_token === 'string' ? readIdToken(body.id_token) : null;
    const problem = claims === null ? 'it is not a JWT' : checkClaims(claims, config, pending.nonce, this.options.sessions.now());
    if (problem !== null) {
      this.log(`Google sign-in refused: the ID token is wrong: ${problem}.`);
      return null;
    }
    return claims!.sub as string;
  }

  /**
   * Signs the browser in with a Google subject id. A new one claims the guest the browser has, or
   * a new account if it has none or is claimed already; one that has an account signs in to it,
   * leaving the guest to be cleaned up. Either way a new session replaces the browser's.
   */
  private async signIn(request: IncomingMessage, sub: string): Promise<Outcome> {
    const { store, sessions, lobbies } = this.options;
    const found = await sessions.find(request.headers.cookie);
    let target: Account | null = await store.accountBySub(sub);
    let outcome: SignInResult['outcome'] = 'signedin';
    if (target === null) {
      const guest = found !== null && !found.account.claimed ? found.account : await sessions.createGuest();
      const claimed = await store.claim(guest.id, sub);
      if (claimed === 'taken') {
        // Another sign-in with the same Google account got there first.
        target = await store.accountBySub(sub);
        if (target === null) throw new Error('the account was claimed with another Google account meanwhile');
      } else {
        target = claimed;
        outcome = 'claimed';
        lobbies.updatePlayer(claimed.id, { claimed: true });
      }
    }
    // The guest left behind keeps its games; the page says so.
    const left = outcome === 'signedin' && found !== null && !found.account.claimed && found.account.id !== target.id;
    const guestGames = left ? await store.games(found.account.id) : 0;
    if (found !== null) await store.deleteSession(found.hash);
    const session = await sessions.start(target.id);
    return { outcome, guestGames, session };
  }

  /** A Set-Cookie value that clears the pending sign-in's cookie. */
  private clearPending(): string {
    return `${GOOGLE_COOKIE}=; ${this.options.sessions.attributes(GOOGLE_SIGN_IN_PATH)}; Max-Age=0`;
  }
}

interface Outcome extends SignInResult {
  /** The new session's Set-Cookie value. */
  readonly session: string | null;
}

function random(): string {
  return randomBytes(32).toString('base64url');
}

function readPending(value: string | null): Pending | null {
  const parts = value?.split('.') ?? [];
  if (parts.length !== 3 || !parts.every((p) => BASE64URL.test(p))) return null;
  return { state: parts[0]!, nonce: parts[1]!, verifier: parts[2]! };
}

/** Compares two strings in constant time for their length. */
export function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * An ID token's claims, without checking its signature: it comes straight from the token endpoint
 * over TLS (OpenID Connect Core section 3.1.3.7).
 */
export function readIdToken(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    return typeof claims === 'object' && claims !== null && !Array.isArray(claims) ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** What is wrong with an ID token's claims, or null: its issuer, audience, expiry, nonce and subject. */
export function checkClaims(claims: Record<string, unknown>, config: GoogleConfig, nonce: string, now: Date): string | null {
  const issuers: readonly string[] = config.issuers ?? GOOGLE_ENDPOINTS.issuers;
  if (typeof claims.iss !== 'string' || !issuers.includes(claims.iss)) return 'its issuer is not Google';
  const { aud } = claims;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(config.clientId)) return 'it is for another client';
  if (audiences.length > 1 && claims.azp !== config.clientId) return 'it was issued to another client';
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now.getTime()) return 'it has expired';
  if (typeof claims.nonce !== 'string' || !same(claims.nonce, nonce)) return "its nonce doesn't match";
  if (typeof claims.sub !== 'string' || claims.sub === '' || claims.sub.length > 255) return 'it has no subject';
  return null;
}

function redirect(response: ServerResponse, location: string, cookies: string[]): void {
  const headers: Record<string, string | string[]> = { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' };
  if (cookies.length > 0) headers['set-cookie'] = cookies;
  response.writeHead(303, headers).end();
}
