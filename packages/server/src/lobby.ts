// One lobby: seats, the host, starting the game and who is connected (docs/server-spec.md
// section 7). Seats belong to players' accounts (docs/accounts-spec.md section 12).

import type { Action, ActionResult } from '@lotr-tactics/sim';
import { LOBBY } from './config.js';
import type { Host } from './host.js';
import { Match } from './match.js';
import type { Player } from './players.js';
import type { LobbyView, SeatView, ServerMessage } from './protocol.js';
import type { MatchResult, SeatResult } from './results.js';

/** One connection to the server, signed in as a player. */
export interface Client {
  readonly player: Player;
  send(message: ServerMessage): void;
  /** Closes the connection from the server's side, if it can be. */
  close?(): void;
}

interface Member {
  /** The player's object from their latest connection. */
  player: Player;
  /** Null while disconnected. */
  client: Client | null;
  /** Left a started game: the seat's bot plays it, and it can't be rejoined. */
  left: boolean;
}

export interface LobbyOptions {
  readonly code: string;
  readonly host: Host;
  readonly seed: number;
  /** Called once when the lobby's game ends. */
  readonly onResult?: (result: MatchResult) => void;
}

function fail(reason: string): ActionResult {
  return { ok: false, reason };
}

export class Lobby {
  readonly code: string;
  readonly kind = 'private';
  private readonly members: (Member | null)[] = new Array<Member | null>(LOBBY.seats).fill(null);
  private hostSeat = 0;
  private match: Match | null = null;
  private startedAt = 0;
  /** When the lobby was last seen with nobody connected, or null while someone is. */
  idleSince: number | null = null;

  constructor(private readonly options: LobbyOptions) {
    this.code = options.code;
  }

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

  /** Whether a player has a seat here that they haven't left. */
  seats(playerId: string): boolean {
    return this.members.some((m) => m !== null && !m.left && m.player.id === playerId);
  }

  /** Adds a person to the lowest free seat. Returns the seat, or the reason they can't join. */
  join(client: Client): number | string {
    if (this.started) return 'That game has already started.';
    const seat = this.members.indexOf(null);
    if (seat < 0) return 'That lobby is full.';
    if (this.members.every((m) => m === null)) this.hostSeat = seat;
    this.members[seat] = { player: client.player, client, left: false };
    client.send({ type: 'joined', code: this.code, seat });
    this.broadcast();
    return seat;
  }

  /**
   * Gives a person their seat back on a connection of the same account. Returns the seat and the
   * other connection it was on, if it was still connected, or the reason they can't rejoin.
   */
  rejoin(client: Client): { seat: number; replaced: Client | null } | string {
    const seat = this.members.findIndex((m) => m !== null && !m.left && m.player.id === client.player.id);
    if (seat < 0) return 'You have no seat in that lobby.';
    const member = this.members[seat]!;
    const previous = member.client;
    member.client = client;
    member.player = client.player;
    client.send({ type: 'joined', code: this.code, seat });
    this.broadcast();
    if (previous !== null) this.match?.resend(seat);
    else this.match?.setConnected(seat, true);
    return { seat, replaced: previous === client ? null : previous };
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

  /** A person in the lobby renamed: the lobby shows the new name. */
  rename(playerId: string, name: string): void {
    const member = this.members.find((m) => m !== null && m.player.id === playerId);
    if (member === undefined || member === null || member.player.name === name) return;
    member.player.name = name;
    this.broadcast();
  }

  /** Starts the game, with bots in the empty seats. Returns the reason it can't start, or null. */
  start(seat: number): string | null {
    if (this.match !== null) return 'The game has already started.';
    if (seat !== this.hostSeat) return 'Only the host can start the game.';
    this.startedAt = this.options.host.now();
    this.match = new Match({
      seed: this.options.seed,
      people: this.members.map((m) => m !== null),
      connected: this.members.map((m) => m?.client != null),
      host: this.options.host,
      send: (to, message) => this.members[to]?.client?.send(message),
      over: () => this.report(),
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

  /** Plays the rest of a started game at once with bots, which reports its result. */
  playOut(): void {
    this.match?.playOut();
  }

  /** Runs the match's timers. */
  update(): void {
    this.match?.update();
  }

  view(): LobbyView {
    const seats = this.members.map((m, seat): SeatView => {
      if (m !== null) return { kind: 'person', name: m.player.name, connected: m.client !== null, player: m.player.id, guest: !m.player.claimed };
      if (this.started) return { kind: 'bot', name: this.botName(seat), connected: false, player: null, guest: false };
      return { kind: 'empty', name: '', connected: false, player: null, guest: false };
    });
    return { code: this.code, host: this.hostSeat, ranked: false, started: this.started, seats };
  }

  /** Bots are named Bot 1, Bot 2 and so on, in seat order. */
  private botName(seat: number): string {
    return `Bot ${this.members.slice(0, seat + 1).filter((m) => m === null).length}`;
  }

  private report(): void {
    const { onResult } = this.options;
    const match = this.match!;
    if (onResult === undefined) return;
    const { state } = match.game;
    const boards = match.finalBoards();
    const seats = this.members.map((m, seat): SeatResult => ({
      seat,
      player: m === null ? null : m.player.id,
      name: m === null ? this.botName(seat) : m.player.name,
      place: state.players[seat]!.placement!,
      left: m?.left ?? false,
      board: boards[seat] ?? { level: state.players[seat]!.level, units: [], traits: [], ringBearer: null },
    }));
    onResult({
      kind: this.kind,
      durationMs: this.options.host.now() - this.startedAt,
      lastRound: { stage: state.stage, round: state.round },
      seats,
    });
  }

  private broadcast(): void {
    const lobby = this.view();
    for (const member of this.members) member?.client?.send({ type: 'lobby', lobby });
  }
}
