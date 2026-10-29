import { createRng } from '@lotr-tactics/sim';
import type { Host } from '../src/host.js';
import { Match } from '../src/match.js';
import type { ServerMessage } from '../src/protocol.js';

/** A host whose clock only moves when a test moves it. */
export class FakeHost implements Host {
  time = 0;
  private readonly rng = createRng(1);
  private tokens = 0;

  now(): number {
    return this.time;
  }

  random(): number {
    return this.rng();
  }

  token(): string {
    return `token-${++this.tokens}`;
  }

  /** Moves the clock on by some seconds, to the nearest millisecond. */
  wait(seconds: number): void {
    this.time += Math.round(seconds * 1000);
  }
}

export interface TestMatch {
  match: Match;
  host: FakeHost;
  /** Messages sent to each seat, oldest first. */
  inbox: ServerMessage[][];
}

/** A match with people in the given seats, all connected, and bots in the others. */
export function testMatch(seed: number, peopleSeats: number[], seats = 8): TestMatch {
  const host = new FakeHost();
  const inbox: ServerMessage[][] = Array.from({ length: seats }, () => []);
  const people = Array.from({ length: seats }, (_, seat) => peopleSeats.includes(seat));
  const match = new Match({ seed, people, connected: people, host, send: (seat, message) => inbox[seat]!.push(message) });
  match.start();
  return { match, host, inbox };
}

/** Moves the clock past the current step's end and updates the match. */
export function timeOut(t: TestMatch): void {
  t.host.wait(t.match.view(0).step.ms! / 1000);
  t.match.update();
}

export function last<T extends ServerMessage['type']>(messages: readonly ServerMessage[], type: T): Extract<ServerMessage, { type: T }> | undefined {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.type === type) return messages[i] as Extract<ServerMessage, { type: T }>;
  return undefined;
}
