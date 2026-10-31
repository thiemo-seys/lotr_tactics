// The play page's steps, without the DOM (docs/game-spec.md section 12, docs/server-spec.md
// section 10): what the page shows as the game's messages arrive and time passes, and what it
// sends back. play.ts draws it and passes the person's clicks on. No Three.js or DOM, so it can
// be tested.

import {
  TICKS_PER_SECOND,
  checkAction,
  createCombat,
  roundType,
  type Action,
  type ActionResult,
  type Outcome,
  type PlayerView,
  type RoundType,
  type Team,
} from '@lotr-tactics/sim';
import { TIMERS, type ClientMessage, type FightRecord, type LobbyView, type MatchView, type RoundRecord, type ServerMessage } from '@lotr-tactics/server';
import { yourFight, yourTeam } from './fights.js';
import { Playback } from './playback.js';

/** How long a finished fight stays on screen, in ticks of fight time, before the results. */
const FIGHT_END_TICKS = TIMERS.fightHold * TICKS_PER_SECOND;

/** What the page shows. The game's own step comes from the server; fights and results are shown here. */
export type Show =
  | { kind: 'menu' }
  | { kind: 'lobby' }
  | { kind: 'council' }
  | { kind: 'planning' }
  | { kind: 'fight'; round: RoundRecord; fight: FightRecord; playback: Playback }
  | { kind: 'results'; round: RoundRecord; until: number }
  /** The results have been shown and Ready sent: waiting for the next step. */
  | { kind: 'waiting'; round: RoundRecord }
  | { kind: 'over' };

/** Where the One Ring is among the person's units, while they hold it. */
export interface PlanningRing {
  readonly bearer: number | null;
  readonly corruption: number;
}

/** One player in a round's results. */
export interface ResultRow {
  readonly seat: number;
  readonly name: string;
  readonly you: boolean;
  /** HP lost this round. */
  readonly damage: number;
  /** The place of a player knocked out this round, or null. */
  readonly knockedOut: number | null;
}

/** A round's results: the person's fight, and everyone who took damage or was knocked out. */
export interface RoundResults {
  readonly stage: number;
  readonly round: number;
  readonly type: RoundType;
  readonly outcome: 'Victory' | 'Defeat' | 'Draw' | 'No fight';
  /** Damage the person took. */
  readonly taken: number;
  /** The person first if they are listed, then by damage taken, then by seat. */
  readonly rows: readonly ResultRow[];
  /** The results have been shown and the page waits for the others. */
  readonly waiting: boolean;
}

/** What the flow asks of the page. */
export interface FlowHooks {
  /** Sends a message to the game. */
  send(message: ClientMessage): void;
  /** One of the person's fights starts: show its playback, with their team on the near side. */
  fight(playback: Playback, team: Team): void;
  /** The game sent the person back to the menu, with a message to show there. */
  menu(message: string): void;
  /** The person is in the lobby with this code. */
  joined(code: string): void;
}

export class PlayFlow {
  /** The person's seat. */
  you = 0;
  lobby: LobbyView | null = null;
  state: MatchView | null = null;
  show: Show = { kind: 'menu' };
  menuMessage = '';
  lobbyMessage = '';
  /** When `state` arrived, in milliseconds, to count down its step's time. */
  private stateAt = 0;
  /** The step the timer belongs to, and its time when first seen, to show how much is left. */
  private timerKey = '';
  private timerMs = 0;

  constructor(private readonly hooks: FlowHooks) {}

  /** Back to the menu with nothing shown, and a message there. */
  reset(menuMessage = ''): void {
    this.lobby = null;
    this.state = null;
    this.show = { kind: 'menu' };
    this.menuMessage = menuMessage;
    this.lobbyMessage = '';
    this.timerKey = '';
    this.timerMs = 0;
  }

  /** A message from the game, arriving at `now` in milliseconds. */
  receive(message: ServerMessage, now: number): void {
    switch (message.type) {
      case 'joined':
        this.you = message.seat;
        this.menuMessage = '';
        this.hooks.joined(message.code);
        return;
      case 'lobby':
        this.lobby = message.lobby;
        if (!message.lobby.started) this.show = { kind: 'lobby' };
        return;
      case 'state':
        this.state = message.state;
        this.stateAt = now;
        this.startTimer(message.state);
        this.follow(message.state);
        return;
      case 'round':
        this.startRound(message.round, now);
        return;
      case 'left':
        this.hooks.menu(message.reason === 'You left the lobby.' ? '' : message.reason);
        return;
      case 'refused':
        if (message.request === 'create' || message.request === 'join' || message.request === 'rejoin') this.hooks.menu(message.reason);
        else if (message.request === 'start') this.lobbyMessage = message.reason;
        // A refused action was valid a moment ago; the next state shows how things are.
        return;
    }
  }

  /** Time passes: the fight plays on, and once the results have been shown the person is Ready for the next step. */
  update(seconds: number, now: number): void {
    const { show } = this;
    if (show.kind === 'fight') {
      const { combat } = show.playback;
      show.playback.advance(seconds);
      if (combat.isOver() && show.playback.time >= combat.tick + FIGHT_END_TICKS) this.showResults(show.round, now);
    } else if (show.kind === 'results' && now >= show.until) {
      this.show = { kind: 'waiting', round: show.round };
      // Finished watching; people who are out don't count.
      if (this.state?.me.placement === null) this.hooks.send({ type: 'ready' });
    }
  }

  /** Sends one of the person's actions: in planning, or a pick in a Council. */
  act(action: Action): void {
    if (this.show.kind === 'planning' || (this.show.kind === 'council' && action.type === 'pick')) this.hooks.send({ type: 'act', action });
  }

  /** The person is Ready to end planning. */
  ready(): void {
    if (this.show.kind === 'planning' && !this.state!.ready.includes(this.you)) this.hooks.send({ type: 'ready' });
  }

  /** Skips the rest of the fight to its results. */
  skip(now: number): void {
    if (this.show.kind === 'fight') this.showResults(this.show.round, now);
  }

  // What the page shows

  /** Whether a game is on screen, rather than the menu or a lobby. */
  get inGame(): boolean {
    return this.state !== null && this.show.kind !== 'menu' && this.show.kind !== 'lobby';
  }

  me(): PlayerView {
    return this.state!.me;
  }

  /** Whether the game's rules let the person take an action now, and why not. */
  check(action: Action): ActionResult {
    return checkAction(this.me(), this.state!, action);
  }

  /** The One Ring, if the person holds it: its bearer among their units and its Corruption. */
  planningRing(): PlanningRing | null {
    const ring = this.state?.ring;
    return ring !== undefined && ring.state === 'held' && ring.holder === this.you ? { bearer: ring.bearer, corruption: ring.corruption } : null;
  }

  /** Connected people still in the game: the ones a step waits for. */
  planners(): number[] {
    const seats = this.lobby?.seats;
    return this.state!.players.filter((p) => p.placement === null && seats?.[p.seat]?.kind === 'person' && seats[p.seat]!.connected).map((p) => p.seat);
  }

  seatName(seat: number): string {
    return seat === this.you ? 'You' : (this.lobby?.seats[seat]?.name ?? `Seat ${seat + 1}`);
  }

  /** Whole seconds left in a Council turn or planning, or null when no timer is shown. */
  secondsLeft(now: number): number | null {
    const ms = this.msLeft(now);
    return ms === null ? null : Math.ceil(ms / 1000);
  }

  /** How much of a Council turn's or planning's time is left, from 1 to 0, or null when no timer is shown. */
  timerShare(now: number): number | null {
    const ms = this.msLeft(now);
    return ms === null || this.timerMs <= 0 ? null : Math.min(1, ms / this.timerMs);
  }

  private msLeft(now: number): number | null {
    const ms = this.state?.step.ms ?? null;
    if ((this.show.kind !== 'council' && this.show.kind !== 'planning') || ms === null) return null;
    return Math.max(0, ms - (now - this.stateAt));
  }

  /** A new step, or a new group's turn in a Council, starts its timer; later states of the same step count it down. */
  private startTimer(state: MatchView): void {
    const key = `${state.stage}-${state.round}-${state.step.kind}-${state.council?.group ?? ''}`;
    const ms = state.step.ms ?? 0;
    this.timerMs = key === this.timerKey ? Math.max(this.timerMs, ms) : ms;
    this.timerKey = key;
  }

  /** The round on screen: a fight's or its results', otherwise the game's own. */
  shownRound(): { readonly stage: number; readonly round: number } {
    const { show } = this;
    return show.kind === 'fight' || show.kind === 'results' || show.kind === 'waiting' ? show.round : this.state!;
  }

  /** A round's results: the person's fight and damage, and everyone who took damage or was knocked out. */
  results(round: RoundRecord, waiting: boolean): RoundResults {
    const { you, state } = this;
    const fight = yourFight(round, you);
    const damage = new Map(round.damage.map((d) => [d.seat, d.amount]));
    const seats = [...new Set([...round.damage.map((d) => d.seat), ...round.eliminated])];
    const rows = seats.map((seat) => ({
      seat,
      name: this.seatName(seat),
      you: seat === you,
      damage: damage.get(seat) ?? 0,
      knockedOut: round.eliminated.includes(seat) ? (state!.players[seat]?.placement ?? null) : null,
    }));
    rows.sort((a, b) => Number(b.you) - Number(a.you) || b.damage - a.damage || a.seat - b.seat);
    return {
      stage: round.stage,
      round: round.round,
      type: roundType(round.stage, round.round),
      outcome: fight === null ? 'No fight' : outcomeText(fight.result.outcome, yourTeam(fight, you)),
      taken: damage.get(you) ?? 0,
      rows,
      waiting: waiting && state!.me.placement === null,
    };
  }

  // Steps

  /** Moves to the server's step. A fight that is still playing is cut short. */
  private follow(next: MatchView): void {
    switch (next.step.kind) {
      case 'over':
        this.show = { kind: 'over' };
        return;
      case 'council':
      case 'planning':
        if (next.me.placement !== null) this.show = { kind: 'over' };
        else if (this.show.kind !== next.step.kind) this.show = { kind: next.step.kind };
        return;
      case 'fight':
        // The round arrived just before this step, and started the fight.
        return;
    }
  }

  private startRound(round: RoundRecord, now: number): void {
    const fight = yourFight(round, this.you);
    if (fight === null) {
      this.showResults(round, now);
      return;
    }
    const playback = new Playback(createCombat(fight.input));
    this.hooks.fight(playback, yourTeam(fight, this.you));
    this.show = { kind: 'fight', round, fight, playback };
  }

  private showResults(round: RoundRecord, now: number): void {
    this.show = { kind: 'results', round, until: now + TIMERS.results * 1000 };
  }
}

/** A fight's outcome for the team the person played. */
export function outcomeText(outcome: Outcome, team: Team): 'Victory' | 'Defeat' | 'Draw' {
  return outcome === 'draw' ? 'Draw' : outcome === team ? 'Victory' : 'Defeat';
}

/** Players still in first, by HP, then the others by place. */
export function standings<P extends { readonly placement: number | null; readonly hp: number }>(players: readonly P[]): P[] {
  return [...players].sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0) || b.hp - a.hp);
}

export function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}
