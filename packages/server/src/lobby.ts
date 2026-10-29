// One lobby: seats, the host, starting the game and who is connected (docs/server-spec.md section 7).

import type { Action, ActionResult } from '@lotr-tactics/sim';
import { LOBBY } from './config.js';
import type { Host } from './host.js';
import { Match } from './match.js';
import type { LobbyView, SeatView, ServerMessage } from './protocol.js';

/** One connection to the server. */
export interface Client {
  send(message: ServerMessage): void;
}

interface Member {
  readonly name: string;
  readonly token: string;
  /** Null while disconnected. */
  client: Client | null;
  /** Left a started game: the seat's bot plays it, and the token no longer works. */
  left: boolean;
}

function fail(reason: string): ActionResult {
  return { ok: false, reason };
}

/** A name with control characters removed, trimmed and cut short, or "Player n" if nothing is left. */
export function cleanName(name: string, seat: number): string {
  const clean = [...name.replace(/\p{Cc}/gu, '').trim()].slice(0, LOBBY.nameLength).join('').trim();
  return clean === '' ? `Player ${seat + 1}` : clean;
}

export class Lobby {
  private readonly members: (Member | null)[] = new Array<Member | null>(LOBBY.seats).fill(null);
  private hostSeat = 0;
  private match: Match | null = null;
  /** When the lobby was last seen with nobody connected, or null while someone is. */
  idleSince: number | null = null;

  constructor(
    readonly code: string,
    private readonly host: Host,
    private readonly seed: number,
  ) {}

  get started(): boolean {
    return this.match !== null;
  }

  /** The game has ended. */
  get over(): boolean {
    return this.match?.isOver() ?? false;
  }

  /** Someone is connected. */
  get connected(): boolean {
    return this.members.some((m) => m?.client != null);
  }

  /** Nobody is left who could come back. */
  get empty(): boolean {
    return this.members.every((m) => m === null || m.left);
  }

  /** Adds a person to the lowest free seat. Returns the seat, or the reason they can't join. */
  join(client: Client, name: string): number | string {
    if (this.started) return 'That game has already started.';
    const seat = this.members.indexOf(null);
    if (seat < 0) return 'That lobby is full.';
    if (this.members.every((m) => m === null)) this.hostSeat = seat;
    const member: Member = { name: cleanName(name, seat), token: this.host.token(), client, left: false };
    this.members[seat] = member;
    client.send({ type: 'joined', code: this.code, seat, token: member.token });
    this.broadcast();
    return seat;
  }

  /**
   * Gives a person their seat back on a new connection. Returns the seat and the connection it
   * replaces, if the seat was still connected, or the reason they can't rejoin.
   */
  rejoin(client: Client, token: string): { seat: number; replaced: Client | null } | string {
    const seat = this.members.findIndex((m) => m !== null && !m.left && m.token === token);
    if (seat < 0) return 'Your seat in that lobby is gone.';
    const member = this.members[seat]!;
    const replaced = member.client;
    member.client = client;
    client.send({ type: 'joined', code: this.code, seat, token });
    this.broadcast();
    if (replaced !== null) this.match?.resend(seat);
    else this.match?.setConnected(seat, true);
    return { seat, replaced };
  }

  /** A person leaves: before the start their seat is freed; after it, the seat's bot plays on. */
  leave(seat: number): void {
    const member = this.members[seat]!;
    member.client = null;
    if (this.match === null) {
      this.members[seat] = null;
      if (seat === this.hostSeat) {
        const next = this.members.findIndex((m) => m !== null);
        if (next >= 0) this.hostSeat = next;
      }
    } else {
      member.left = true;
      this.match.leave(seat);
    }
    this.broadcast();
  }

  disconnect(seat: number): void {
    this.members[seat]!.client = null;
    this.broadcast();
    this.match?.setConnected(seat, false);
  }

  /** Starts the game, with bots in the empty seats. Returns the reason it can't start, or null. */
  start(seat: number): string | null {
    if (this.match !== null) return 'The game has already started.';
    if (seat !== this.hostSeat) return 'Only the host can start the game.';
    this.match = new Match({
      seed: this.seed,
      people: this.members.map((m) => m !== null),
      connected: this.members.map((m) => m?.client != null),
      host: this.host,
      send: (to, message) => this.members[to]?.client?.send(message),
    });
    this.broadcast();
    this.match.start();
    return null;
  }

  act(seat: number, action: Action): ActionResult {
    return this.match === null ? fail('The game has not started.') : this.match.act(seat, action);
  }

  ready(seat: number): ActionResult {
    return this.match === null ? fail('The game has not started.') : this.match.ready(seat);
  }

  /** Runs the match's timers. */
  update(): void {
    this.match?.update();
  }

  view(): LobbyView {
    let bots = 0;
    const seats = this.members.map((m): SeatView => {
      if (m !== null) return { kind: 'person', name: m.name, connected: m.client !== null };
      if (this.started) return { kind: 'bot', name: `Bot ${++bots}`, connected: false };
      return { kind: 'empty', name: '', connected: false };
    });
    return { code: this.code, host: this.hostSeat, started: this.started, seats };
  }

  private broadcast(): void {
    const lobby = this.view();
    for (const member of this.members) member?.client?.send({ type: 'lobby', lobby });
  }
}
