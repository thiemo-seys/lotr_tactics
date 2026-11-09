// What the account API answers with (docs/accounts-spec.md sections 6.2, 9.3, 9.4 and 11.1), for
// the server and the play page alike. Browser-safe: types and constants only, apart from reading
// the sign-in's result from the page's address.

import type { FinalBoard } from './results.js';

/** What a seat of a deleted account is called in other people's histories (section 5). */
export const DELETED_NAME = 'Deleted player';

export interface PlaceStats {
  readonly games: number;
  readonly wins: number;
  /** Fraction of games in the top 4, 0 with no games. */
  readonly top4Rate: number;
  /** Null with no games. */
  readonly averagePlace: number | null;
}

/** Section 9.3, for all online games. Ranked stats come with the ranked queue. */
export interface Stats {
  readonly all: PlaceStats;
  /** The units most often on the final board, with the number of games, most games first. */
  readonly units: readonly { readonly unit: string; readonly games: number }[];
  /** The traits most often active on the final board, most games first. */
  readonly traits: readonly { readonly trait: string; readonly games: number }[];
  /** Games in which the person bore the One Ring. */
  readonly ringGames: number;
}

/** `GET /api/profile`. */
export interface ProfileView {
  readonly id: string;
  readonly name: string;
  readonly guest: boolean;
  readonly stats: Stats;
}

export interface HistorySeat {
  readonly seat: number;
  /** The account id, for a link to its profile; null for a bot or a deleted account. */
  readonly account: string | null;
  /** As shown in that game, or "Deleted player". */
  readonly name: string;
  /** A person without a claimed account. */
  readonly guest: boolean;
  readonly place: number;
  /** Left the game for good. */
  readonly left: boolean;
  readonly board: FinalBoard;
  /** Ranked people only. */
  readonly pointsBefore: number | null;
  readonly pointsAfter: number | null;
}

export interface HistoryMatch {
  readonly id: string;
  readonly kind: 'ranked' | 'private';
  /** ISO 8601. */
  readonly startedAt: string;
  readonly endedAt: string;
  readonly lastRound: { readonly stage: number; readonly round: number };
  /** The seat of the account whose history it is. */
  readonly seat: number;
  /** All 8, in seat order. */
  readonly seats: readonly HistorySeat[];
}

/** `GET /api/history`. */
export interface HistoryPage {
  readonly matches: readonly HistoryMatch[];
}

/** Where the page sends the browser to sign in with Google (section 6.2). */
export const GOOGLE_SIGN_IN_PATH = '/auth/google';

/**
 * How signing in with Google went, which the callback puts in the address it sends the browser
 * back to, as `/play.html#signin=<outcome>`:
 * - `claimed`: the guest is now claimed, with its history and name;
 * - `signedin`: signed in to the account that already had that Google account, leaving the guest;
 * - `cancelled`: the person said no at Google;
 * - `failed`: anything else went wrong, such as a `state` that doesn't match;
 * - `unavailable`: Google sign-in isn't configured on this server.
 */
export type SignInOutcome = 'claimed' | 'signedin' | 'cancelled' | 'failed' | 'unavailable';

const OUTCOMES: readonly SignInOutcome[] = ['claimed', 'signedin', 'cancelled', 'failed', 'unavailable'];

export interface SignInResult {
  readonly outcome: SignInOutcome;
  /**
   * With `signedin`: how many online games the guest left behind had played, which stay with that
   * guest and are lost with it (`#signin=signedin&guestGames=3`). 0 otherwise.
   */
  readonly guestGames: number;
}

/** The address's hash after signing in with Google: `signin=<outcome>`, with `guestGames=<n>`. */
export function signInHash(result: SignInResult): string {
  return result.guestGames > 0 ? `signin=${result.outcome}&guestGames=${result.guestGames}` : `signin=${result.outcome}`;
}

/** Reads the sign-in's result from the page's hash, such as `#signin=claimed`, or null if it has none. */
export function readSignIn(hash: string): SignInResult | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const outcome = params.get('signin');
  if (outcome === null || !(OUTCOMES as readonly string[]).includes(outcome)) return null;
  const games = Number(params.get('guestGames') ?? 0);
  return { outcome: outcome as SignInOutcome, guestGames: outcome === 'signedin' && Number.isInteger(games) && games > 0 ? games : 0 };
}
