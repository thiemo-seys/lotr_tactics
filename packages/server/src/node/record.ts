// Writes a finished match's result (docs/accounts-spec.md section 9.2). Private lobbies only for
// now; ranked games add their ratings and points in the same transaction. Node only.

import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { ACCOUNTS } from '../config.js';
import type { MatchResult } from '../results.js';
import type { RecordedMatch, Store } from './store.js';

export interface RecordOptions {
  /** When the match ended. */
  readonly endedAt?: Date;
  /** Milliseconds between attempts; each wait doubles it. */
  readonly retryMs?: number;
  readonly log?: (message: string) => void;
}

/** The rows a result becomes. */
export function recordedMatch(result: MatchResult, endedAt: Date, id: string = randomUUID()): RecordedMatch {
  return {
    id,
    kind: result.kind,
    season: null,
    startedAt: new Date(endedAt.getTime() - result.durationMs),
    endedAt,
    rounds: result.lastRound.stage * 10 + result.lastRound.round,
    seats: result.seats.map((s) => ({ seat: s.seat, accountId: s.player, name: s.name, place: s.place, left: s.left, board: s.board })),
  };
}

/**
 * Records a match, trying again 3 times if a write fails. If every attempt fails, logs the whole
 * result as JSON, so it can be written by hand, and returns false.
 */
export async function recordResult(store: Store, result: MatchResult, options: RecordOptions = {}): Promise<boolean> {
  const match = recordedMatch(result, options.endedAt ?? new Date());
  const log = options.log ?? ((message) => console.error(message));
  let wait = options.retryMs ?? 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      await store.recordMatch(match);
      return true;
    } catch (error) {
      if (attempt >= ACCOUNTS.recordAttempts) {
        log(`Could not record match ${match.id} (${(error as Error).message}). Its result: ${JSON.stringify(match)}`);
        return false;
      }
      await sleep(wait);
      wait *= 2;
    }
  }
}
