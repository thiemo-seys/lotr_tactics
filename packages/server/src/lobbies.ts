// Every lobby on a server: codes, joining, routing messages and closing idle lobbies
// (docs/server-spec.md sections 7 and 8).

import { LOBBY } from './config.js';
import type { Host } from './host.js';
import { Lobby, type Client } from './lobby.js';
import { parseClientMessage, type ClientMessage, type ServerStatus } from './protocol.js';

export interface LobbiesOptions {
  /** The seed for each new lobby's game. By default, a random one from the host. */
  readonly seed?: () => number;
  /** The client build to accept create, join and rejoin from. By default, any. */
  readonly version?: string;
}

export const OUTDATED = 'The game has been updated. Reload the page to play.';

export class Lobbies {
  private readonly lobbies = new Map<string, Lobby>();
  /** Where each connection that is in a lobby sits. */
  private readonly places = new Map<Client, { readonly lobby: Lobby; readonly seat: number }>();

  constructor(
    private readonly host: Host,
    private readonly options: LobbiesOptions = {},
  ) {}

  /** Open lobbies. */
  get count(): number {
    return this.lobbies.size;
  }

  get status(): ServerStatus {
    let games = 0;
    for (const lobby of this.lobbies.values()) if (lobby.started && !lobby.over) games++;
    return { version: this.options.version ?? null, lobbies: this.lobbies.size, games, people: this.places.size };
  }

  /** Handles a message from a connection. Anything that isn't allowed is refused with a reason. */
  receive(client: Client, text: string): void {
    const message = parseClientMessage(text);
    const reason = message === null ? "That message isn't understood." : this.handle(client, message);
    if (reason !== null) client.send({ type: 'refused', request: message?.type ?? 'unknown', reason });
  }

  /** A connection closed. */
  disconnect(client: Client): void {
    const place = this.places.get(client);
    if (place === undefined) return;
    this.places.delete(client);
    place.lobby.disconnect(place.seat);
  }

  /** Runs every match's timers and closes idle lobbies. Call it about every 100 ms. */
  update(): void {
    const now = this.host.now();
    for (const lobby of this.lobbies.values()) {
      lobby.update();
      if (lobby.connected) lobby.idleSince = null;
      else if (lobby.empty || lobby.over) this.lobbies.delete(lobby.code);
      else if (lobby.idleSince === null) lobby.idleSince = now;
      else if (now - lobby.idleSince >= LOBBY.idleSeconds * 1000) this.lobbies.delete(lobby.code);
    }
  }

  /** Returns the reason a message is refused, or null. */
  private handle(client: Client, message: ClientMessage): string | null {
    const place = this.places.get(client) ?? null;
    if (message.type === 'create' || message.type === 'join' || message.type === 'rejoin') {
      if (place !== null) return 'Leave your lobby first.';
      if (this.options.version !== undefined && message.version !== this.options.version) return OUTDATED;
    } else if (place === null) {
      return "You aren't in a lobby.";
    }
    switch (message.type) {
      case 'create': {
        if (this.lobbies.size >= LOBBY.maxLobbies) return 'The server is full. Try again later.';
        const lobby = new Lobby(this.newCode(), this.host, this.newSeed());
        this.lobbies.set(lobby.code, lobby);
        return this.enter(client, lobby, lobby.join(client, message.name));
      }
      case 'join': {
        const lobby = this.lobbies.get(message.code.trim().toUpperCase());
        if (lobby === undefined) return 'There is no lobby with that code.';
        return this.enter(client, lobby, lobby.join(client, message.name));
      }
      case 'rejoin': {
        const lobby = this.lobbies.get(message.code.trim().toUpperCase());
        if (lobby === undefined) return 'That lobby has closed.';
        const result = lobby.rejoin(client, message.token);
        if (typeof result === 'string') return result;
        if (result.replaced !== null) {
          this.places.delete(result.replaced);
          result.replaced.send({ type: 'left', reason: 'You joined this game from somewhere else.' });
        }
        this.places.set(client, { lobby, seat: result.seat });
        return null;
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
