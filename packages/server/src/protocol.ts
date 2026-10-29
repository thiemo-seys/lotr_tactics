// Messages between clients and the server (docs/server-spec.md section 8).

import type { Action } from '@lotr-tactics/sim';
import type { MatchView, RoundRecord } from './view.js';

export type ClientMessage =
  | { readonly type: 'create'; readonly name: string }
  | { readonly type: 'join'; readonly code: string; readonly name: string }
  | { readonly type: 'rejoin'; readonly code: string; readonly token: string }
  | { readonly type: 'start' }
  | { readonly type: 'leave' }
  | { readonly type: 'act'; readonly action: Action }
  | { readonly type: 'ready' };

export interface SeatView {
  readonly kind: 'empty' | 'person' | 'bot';
  /** Empty for an empty seat. */
  readonly name: string;
  /** False for bots and empty seats. */
  readonly connected: boolean;
}

export interface LobbyView {
  readonly code: string;
  /** The host's seat. */
  readonly host: number;
  readonly started: boolean;
  /** Every seat, in seat order. */
  readonly seats: readonly SeatView[];
}

export type ServerMessage =
  | { readonly type: 'joined'; readonly code: string; readonly seat: number; readonly token: string }
  | { readonly type: 'lobby'; readonly lobby: LobbyView }
  | { readonly type: 'state'; readonly state: MatchView }
  | { readonly type: 'round'; readonly round: RoundRecord }
  | { readonly type: 'left'; readonly reason: string }
  | { readonly type: 'refused'; readonly request: ClientMessage['type'] | 'unknown'; readonly reason: string };

/** Longest string accepted in a message. Names are cut shorter later. */
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
      return isText(data.name) ? { type: 'create', name: data.name } : null;
    case 'join':
      return isText(data.code) && isText(data.name) ? { type: 'join', code: data.code, name: data.name } : null;
    case 'rejoin':
      return isText(data.code) && isText(data.token) ? { type: 'rejoin', code: data.code, token: data.token } : null;
    case 'start':
    case 'leave':
    case 'ready':
      return { type: data.type };
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
