// Messages between clients and the server (docs/server-spec.md section 8, changed by
// docs/accounts-spec.md section 11.2).

import type { Action } from '@lotr-tactics/sim';
import type { MatchView, RoundRecord } from './view.js';

export type ClientMessage =
  /** People's names come from their accounts. */
  | { readonly type: 'create' }
  | { readonly type: 'join'; readonly code: string }
  /** The seat must belong to the connection's account. */
  | { readonly type: 'rejoin'; readonly code: string }
  | { readonly type: 'start' }
  | { readonly type: 'leave' }
  | { readonly type: 'act'; readonly action: Action }
  | { readonly type: 'ready' };

/** The account a connection is signed in as (accounts-spec.md section 11.1). */
export interface AccountView {
  readonly id: string;
  readonly name: string;
  /** Signed in with Google. */
  readonly claimed: boolean;
  /** False within 7 days of a claimed account's last rename, unless it needs a new name. */
  readonly canRename: boolean;
  /**
   * A claimed account whose name another claimed account holds, or is kept for bots and guests
   * ("Guest 0427"), as after claiming a guest with it. It holds no name until it renames, which it
   * can do at once; ranked and friends wait for it (accounts-spec.md section 6.3).
   */
  readonly needsName: boolean;
  /** Google sign-in is configured on this server. */
  readonly googleEnabled: boolean;
}

export interface SeatView {
  readonly kind: 'empty' | 'person' | 'bot';
  /** Empty for an empty seat. */
  readonly name: string;
  /** False for bots and empty seats. */
  readonly connected: boolean;
  /** The person's account id, for links to profiles; null for bots and empty seats. */
  readonly player: string | null;
  /** A person without a claimed account. False for bots and empty seats. */
  readonly guest: boolean;
}

export interface LobbyView {
  readonly code: string;
  /** The host's seat; null in a ranked lobby, which has no host. */
  readonly host: number | null;
  readonly ranked: boolean;
  readonly started: boolean;
  /** Every seat, in seat order. */
  readonly seats: readonly SeatView[];
}

export type ServerMessage =
  /** The first message on a connection: the account, and the lobby it has a seat in, if any. */
  | { readonly type: 'hello'; readonly me: AccountView; readonly game: { readonly code: string } | null }
  | { readonly type: 'joined'; readonly code: string; readonly seat: number }
  | { readonly type: 'lobby'; readonly lobby: LobbyView }
  | { readonly type: 'state'; readonly state: MatchView }
  | { readonly type: 'round'; readonly round: RoundRecord }
  | { readonly type: 'left'; readonly reason: string }
  | { readonly type: 'refused'; readonly request: ClientMessage['type'] | 'unknown'; readonly reason: string }
  /** The account connected again somewhere else, which took over its seat. This connection closes. */
  | { readonly type: 'replaced' }
  /**
   * The account was signed out on every device, or deleted (accounts-spec.md sections 6.1 and 6.4).
   * This connection closes; its session is gone, so the page needs a new guest to play online.
   */
  | { readonly type: 'signedOut'; readonly reason: 'everywhere' | 'deleted' };

/** Longest string accepted in a message. */
const MAX_TEXT = 200;

/** Reads a message from a client, or returns null if it doesn't match `ClientMessage`. */
export function parseClientMessage(text: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  switch (data.type) {
    case 'create':
    case 'start':
    case 'leave':
    case 'ready':
      return { type: data.type };
    case 'join':
    case 'rejoin':
      return isText(data.code) ? { type: data.type, code: data.code } : null;
    case 'act':
      // The game checks the rest of the action.
      return isRecord(data.action) && typeof data.action.type === 'string' ? { type: 'act', action: data.action as unknown as Action } : null;
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT;
}
