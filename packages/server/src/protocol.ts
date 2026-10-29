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
  | { readonly type: 'refused'; readonly request: ClientMessage['type']; readonly reason: string };
