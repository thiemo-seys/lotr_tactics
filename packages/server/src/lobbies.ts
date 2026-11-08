// Every lobby on a server: codes, joining, routing messages and closing idle lobbies
// (docs/server-spec.md sections 7 and 8), with one connection and one lobby per account
// (docs/accounts-spec.md sections 6.1 and 12).

import { LOBBY } from './config.js';
import type { Host } from './host.js';
import { Lobby, applyChange, type Client, type PlayerChange } from './lobby.js';
import { parseClientMessage, type AccountView, type ClientMessage } from './protocol.js';
import type { MatchResult } from './results.js';

export interface LobbiesOptions {
  /** The seed for each new lobby's game. By default, a random one from the host. */
  readonly seed?: () => number;
  /** Called when a lobby's game ends. Without it, nothing is reported, as in an offline game. */
  readonly onResult?: (result: MatchResult) => void;
}

export class Lobbies {
  private readonly lobbies = new Map<string, Lobby>();
  /** Where each connection that is in a lobby sits. */
  private readonly places = new Map<Client, { readonly lobby: Lobby; readonly seat: number }>();
  /** Each account's live connection, from `connect`. */
  private readonly connections = new Map<string, Client>();

  constructor(
    private readonly host: Host,
    private readonly options: LobbiesOptions = {},
  ) {}

  /** Open lobbies. */
  get count(): number {
    return this.lobbies.size;
  }

  /**
   * A connection opened. It replaces the account's older connection, which is told so and closed,
   * and takes over its seat. It is greeted with the account and the lobby it has a seat in.
   */
  connect(client: Client, me: AccountView): void {
    const id = client.player.id;
    const older = this.connections.get(id);
    this.connections.set(id, client);
    let moved: Lobby | null = null;
    if (older !== undefined && older !== client) {
      const place = this.places.get(older);
      this.places.delete(older);
      older.send({ type: 'replaced' });
      older.close?.();
      if (place !== undefined && !place.lobby.over) moved = place.lobby;
      else if (place !== undefined) place.lobby.disconnect(place.seat);
    }
    const lobby = this.lobbyOf(id);
    client.send({ type: 'hello', me, game: lobby === null ? null : { code: lobby.code } });
    if (moved === null) return;
    // The seat moves without being disconnected, so its bot doesn't step in.
    const result = moved.rejoin(client);
    if (typeof result !== 'string') this.places.set(client, { lobby: moved, seat: result.seat });
  }

  /** The account's live connection, if it has one. */
  client(playerId: string): Client | undefined {
    return this.connections.get(playerId);
  }

  /** Handles a message from a connection. Anything that isn't allowed is refused with a reason. */
  receive(client: Client, text: string): void {
    const message = parseClientMessage(text);
    const reason = message === null ? "That message isn't understood." : this.handle(client, message);
    if (reason !== null) client.send({ type: 'refused', request: message?.type ?? 'unknown', reason });
  }

  /** A connection closed. */
  disconnect(client: Client): void {
    if (this.connections.get(client.player.id) === client) this.connections.delete(client.player.id);
    const place = this.places.get(client);
    if (place === undefined) return;
    this.places.delete(client);
    place.lobby.disconnect(place.seat);
  }

  /** An account was renamed or claimed: its connection and its lobby show it. */
  updatePlayer(playerId: string, change: PlayerChange): void {
    for (const lobby of this.lobbies.values()) lobby.updatePlayer(playerId, change);
    const client = this.connections.get(playerId);
    if (client !== undefined) applyChange(client.player, change);
  }

  /**
   * The code of the lobby, not yet over, in which an account has a seat it hasn't left, or null.
   * An account can't be deleted while it has one (accounts-spec.md section 6.4).
   */
  seatCode(playerId: string): string | null {
    return this.lobbyOf(playerId)?.code ?? null;
  }

  /**
   * The account was signed out everywhere or deleted: its connection is told so, leaves its seat
   * as a disconnect would, and is closed.
   */
  signedOut(playerId: string, reason: 'everywhere' | 'deleted'): void {
    const client = this.connections.get(playerId);
    if (client === undefined) return;
    client.send({ type: 'signedOut', reason });
    this.disconnect(client);
    client.close?.();
  }

  /**
   * Runs every match's timers and closes idle lobbies. A started lobby with nobody connected for
   * long enough plays its game out with bots and reports it. Call it about every 100 ms.
   */
  update(): void {
    const now = this.host.now();
    for (const lobby of this.lobbies.values()) {
      lobby.update();
      if (lobby.connected) lobby.idleSince = null;
      else if (lobby.empty || lobby.over) this.lobbies.delete(lobby.code);
      else if (lobby.idleSince === null) lobby.idleSince = now;
      else if (now - lobby.idleSince >= LOBBY.idleSeconds * 1000) {
        lobby.playOut();
        this.lobbies.delete(lobby.code);
      }
    }
  }

  /** The open lobby, not yet over, in which an account has a seat it hasn't left. */
  private lobbyOf(playerId: string): Lobby | null {
    for (const lobby of this.lobbies.values()) if (!lobby.over && lobby.seats(playerId)) return lobby;
    return null;
  }

  /** Returns the reason a message is refused, or null. */
  private handle(client: Client, message: ClientMessage): string | null {
    const place = this.places.get(client) ?? null;
    if (message.type === 'create' || message.type === 'join') {
      if (place !== null) return 'Leave your lobby first.';
      const other = this.lobbyOf(client.player.id);
      if (other !== null) return `You already have a seat in lobby ${other.code}.`;
    } else if (message.type !== 'rejoin' && place === null) {
      return "You aren't in a lobby.";
    }
    switch (message.type) {
      case 'create': {
        if (this.lobbies.size >= LOBBY.maxLobbies) return 'The server is full. Try again later.';
        const lobby = new Lobby({ code: this.newCode(), host: this.host, seed: this.newSeed(), onResult: this.options.onResult });
        this.lobbies.set(lobby.code, lobby);
        return this.enter(client, lobby, lobby.join(client));
      }
      case 'join': {
        const lobby = this.lobbies.get(message.code.trim().toUpperCase());
        if (lobby === undefined) return 'There is no lobby with that code.';
        return this.enter(client, lobby, lobby.join(client));
      }
      case 'rejoin': {
        const lobby = this.lobbies.get(message.code.trim().toUpperCase());
        if (place !== null && place.lobby !== lobby) return 'Leave your lobby first.';
        if (lobby === undefined) return 'That lobby has closed.';
        return this.rejoin(client, lobby);
      }
      case 'start':
        return place!.lobby.start(place!.seat);
      case 'leave':
        this.places.delete(client);
        place!.lobby.leave(place!.seat);
        client.send({ type: 'left', reason: 'You left the lobby.' });
        return null;
      case 'act': {
        const result = place!.lobby.act(place!.seat, message.action);
        return result.ok ? null : result.reason;
      }
      case 'ready': {
        const result = place!.lobby.ready(place!.seat);
        return result.ok ? null : result.reason;
      }
    }
  }

  private rejoin(client: Client, lobby: Lobby): string | null {
    const result = lobby.rejoin(client);
    if (typeof result === 'string') return result;
    if (result.replaced !== null) {
      this.places.delete(result.replaced);
      result.replaced.send({ type: 'replaced' });
      result.replaced.close?.();
    }
    this.places.set(client, { lobby, seat: result.seat });
    return null;
  }

  private enter(client: Client, lobby: Lobby, seat: number | string): string | null {
    if (typeof seat === 'string') return seat;
    this.places.set(client, { lobby, seat });
    return null;
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < LOBBY.codeLength; i++) code += LOBBY.codeAlphabet[Math.floor(this.host.random() * LOBBY.codeAlphabet.length)];
      if (!this.lobbies.has(code)) return code;
    }
  }

  private newSeed(): number {
    return this.options.seed?.() ?? Math.floor(this.host.random() * 0x100000000);
  }
}
