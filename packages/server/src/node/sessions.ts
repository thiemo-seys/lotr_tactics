// Guests, sessions and their cookie (docs/accounts-spec.md section 6.1). The cookie holds a random
// secret; the database keeps only its SHA-256. Node only.

import { createHash, randomBytes, randomInt } from 'node:crypto';
import { ACCOUNTS } from '../config.js';
import { nameKey } from '../players.js';
import type { Account, Store } from './store.js';

export const SESSION_COOKIE = 'lt_session';

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_MS = ACCOUNTS.sessionDays * DAY_MS;

export function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/** A cookie's value from a Cookie header. */
export function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

/** "Guest" and 4 random digits, which needn't be unique (section 6.3). */
export function guestName(): string {
  return `Guest ${String(randomInt(10000)).padStart(4, '0')}`;
}

export interface SessionsOptions {
  /** Whether cookies are Secure: when PUBLIC_URL is https. */
  readonly secure: boolean;
  /** The clock, which tests can move. */
  readonly now?: () => Date;
}

export interface Found {
  readonly account: Account;
  /** A Set-Cookie value when the session was renewed, so the browser keeps it longer too. */
  readonly cookie: string | null;
  readonly hash: Buffer;
}

export class Sessions {
  readonly now: () => Date;

  constructor(
    private readonly store: Store,
    private readonly options: SessionsOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /**
   * The account signed in with a request's cookies, or null without a valid session. Marks the
   * account as seen, and renews a session used more than a day after it was last renewed.
   */
  async find(cookieHeader: string | undefined): Promise<Found | null> {
    const secret = readCookie(cookieHeader, SESSION_COOKIE);
    if (secret === null || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
    const hash = hashSecret(secret);
    const now = this.now();
    const session = await this.store.session(hash, now);
    if (session === null) return null;
    await this.store.touch(session.account.id, now);
    const renewedAt = session.expiresAt.getTime() - SESSION_MS;
    if (now.getTime() - renewedAt < ACCOUNTS.renewAfterDays * DAY_MS) return { account: session.account, cookie: null, hash };
    await this.store.renewSession(hash, new Date(now.getTime() + SESSION_MS));
    return { account: session.account, cookie: this.cookie(secret), hash };
  }

  /** Makes a guest account and a session for it. Returns the account and the Set-Cookie value. */
  async newGuest(): Promise<{ account: Account; cookie: string }> {
    const account = await this.createGuest();
    return { account, cookie: await this.start(account.id) };
  }

  /** Makes a guest account, named "Guest" and 4 random digits, without a session. */
  createGuest(): Promise<Account> {
    const name = guestName();
    return this.store.createGuest(name, nameKey(name), this.now());
  }

  /** Makes a new session for an account. Returns its Set-Cookie value. */
  async start(accountId: string): Promise<string> {
    const secret = randomBytes(32).toString('base64url');
    await this.store.createSession(hashSecret(secret), accountId, new Date(this.now().getTime() + SESSION_MS));
    return this.cookie(secret);
  }

  /** Signs out a session, or every session of its account. */
  async signOut(found: Found, everywhere: boolean): Promise<void> {
    if (everywhere) await this.store.deleteSessions(found.account.id);
    else await this.store.deleteSession(found.hash);
  }

  /** A Set-Cookie value that clears the session cookie. */
  clearCookie(): string {
    return `${SESSION_COOKIE}=; ${this.attributes()}; Max-Age=0`;
  }

  private cookie(secret: string): string {
    return `${SESSION_COOKIE}=${secret}; ${this.attributes()}; Max-Age=${SESSION_MS / 1000}`;
  }

  /** A cookie's attributes: HttpOnly and SameSite=Lax, with Secure when PUBLIC_URL is https. */
  attributes(path = '/'): string {
    return `HttpOnly; SameSite=Lax; Path=${path}${this.options.secure ? '; Secure' : ''}`;
  }
}
