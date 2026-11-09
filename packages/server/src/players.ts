// The person a connection carries, and the rules for account names (docs/accounts-spec.md
// sections 4 and 6.3). The browser-safe code never sees sessions, cookies or the database.

import { NAMES } from './config.js';

/** The hidden ranked rating (accounts-spec.md section 8.1). */
export interface Rating {
  readonly mu: number;
  readonly sigma: number;
}

export interface Player {
  /** The account id; 'local' in an offline game. */
  readonly id: string;
  /** The display name, kept current after a rename. */
  name: string;
  /** Signed in with Google. */
  claimed: boolean;
  /** Null until loaded, and for guests. */
  rating: Rating | null;
}

/** The id of the person in an offline game, who has no account. */
export const LOCAL_PLAYER_ID = 'local';

/** The person in an offline game, who has no account. */
export function localPlayer(): Player {
  return { id: LOCAL_PLAYER_ID, name: 'You', claimed: false, rating: null };
}

/**
 * A person playing as a guest, who gets a guest mark: an account that isn't claimed. The offline
 * player has no account at all, so isn't one.
 */
export function isGuest(player: Player): boolean {
  return !player.claimed && player.id !== LOCAL_PLAYER_ID;
}

/**
 * A name as an account would hold it, with its key for comparing, or the reason it isn't allowed
 * (accounts-spec.md section 6.3).
 */
export function checkName(raw: string): { readonly name: string; readonly key: string } | { readonly error: string } {
  const name = raw.replace(/\p{Cc}/gu, '').trim();
  const length = [...name].length;
  if (length < NAMES.minLength || length > NAMES.maxLength) {
    return { error: `A name has ${NAMES.minLength} to ${NAMES.maxLength} characters.` };
  }
  if (!/^[\p{L}\p{M}\p{Nd} '\-_.]+$/u.test(name)) {
    return { error: "A name can have letters, digits, spaces and ' - _ . only." };
  }
  if (name.includes('  ')) return { error: "A name can't have two spaces in a row." };
  const key = nameKey(name);
  if (/^(bot|guest)\d+$/u.test(key)) return { error: 'Names like "Bot 1" and "Guest 1234" are kept for bots and guests.' };
  return { name, key };
}

/** The name folded for comparing: NFKC, lowercased, without spaces. Names with the same key are the same name. */
export function nameKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/\s/gu, '');
}
