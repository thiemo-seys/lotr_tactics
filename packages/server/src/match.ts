// One game on the server: steps, timers, bots and Ready votes (docs/server-spec.md section 5).

import { Autopilot, TICKS_PER_SECOND, createGame, type Action, type ActionResult, type Game, type RoundReport } from '@lotr-tactics/sim';
import { TIMERS } from './config.js';
import type { Host } from './host.js';
import type { ServerMessage } from './protocol.js';
import { fightBoards, type FinalBoard } from './results.js';
import { matchView, roundRecord, type MatchView, type RoundRecord, type StepKind } from './view.js';

export interface MatchOptions {
  readonly seed: number;
  /** One entry per seat: true for a person, false for a bot. */
  readonly people: readonly boolean[];
  /** One entry per seat: whether its person is connected at the start. */
  readonly connected: readonly boolean[];
  readonly host: Host;
  /** Delivers a message to the connected person in a seat. */
  readonly send: (seat: number, message: ServerMessage) => void;
  /** Called once, when the game ends. */
  readonly over?: () => void;
}

interface Step {
  readonly kind: StepKind;
  /** When the step ends, in host milliseconds, or null once the game is over. */
  readonly endsAt: number | null;
}

const OK: ActionResult = { ok: true };

function fail(reason: string): ActionResult {
  return { ok: false, reason };
}

export class Match {
  readonly game: Game;
  /** Each seat's bot, which plays it while no connected person does. */
  private readonly autopilot: Autopilot;
  /** Seats with a person who hasn't left. */
  private readonly people: boolean[];
  private readonly connected: boolean[];
  private step: Step = { kind: 'council', endsAt: null };
  /** The round shown during a fight step. */
  private record: RoundRecord | null = null;
  private readonly readySeats = new Set<number>();
  /**
   * Each seat's board from its latest fight. The game empties a seat's board when it places it,
   * so these are kept from the fight phase (docs/accounts-spec.md section 9.1).
   */
  private readonly boards: (FinalBoard | null)[];
  private reported = false;

  constructor(private readonly options: MatchOptions) {
    const seats = options.people.length;
    this.game = createGame({ seed: options.seed, players: seats });
    this.autopilot = new Autopilot(this.game, options.seed);
    this.people = [...options.people];
    this.connected = options.people.map((person, seat) => person && options.connected[seat] === true);
    this.boards = options.people.map(() => null);
  }

  /** Starts the first step and sends everyone their view. */
  start(): void {
    this.enter();
    this.broadcast();
  }

  get stepKind(): StepKind {
    return this.step.kind;
  }

  isOver(): boolean {
    return this.step.kind === 'over';
  }

  /** The board each seat fought its last fight with, in seat order; null for a seat that never fought. */
  finalBoards(): readonly (FinalBoard | null)[] {
    return [...this.boards];
  }

  /** Plays the rest of the game at once with bots in every seat, as when everyone is out. */
  playOut(): void {
    if (this.isOver()) return;
    this.finish();
    this.broadcast();
  }

  view(seat: number): MatchView {
    const { kind, endsAt } = this.step;
    const ms = endsAt === null ? null : Math.max(0, endsAt - this.options.host.now());
    return matchView(this.game.state, seat, { kind, ms }, this.readySeats);
  }

  /**
   * Applies a person's action: in a Council turn, in planning, or while the fights play, when the
   * game's rules allow shopping and the bench but not the board.
   */
  act(seat: number, action: Action): ActionResult {
    if (this.step.kind === 'over') return fail('The game is over.');
    const before = this.game.state.turn;
    const result = this.game.act(seat, action);
    if (!result.ok) return result;
    // The last pick of a group moves the Council on.
    if (this.game.state.turn !== before) this.enter();
    this.broadcast();
    return OK;
  }

  /** A person is Ready: in planning, to end it; in a fight step, having finished watching. */
  ready(seat: number): ActionResult {
    if (this.step.kind !== 'planning' && this.step.kind !== 'fight') return fail('There is nothing to be Ready for now.');
    if (this.game.state.players[seat]?.placement !== null) return fail('You are out of the game.');
    this.readySeats.add(seat);
    this.endEarly();
    this.broadcast();
    return OK;
  }

  /** A person connects or disconnects. While they are away, the seat's bot plays it. */
  setConnected(seat: number, connected: boolean): void {
    if (!this.people[seat] || this.connected[seat] === connected) return;
    this.connected[seat] = connected;
    if (connected) {
      this.resend(seat);
      return;
    }
    this.takeOver(seat);
    this.endEarly();
    this.broadcast();
  }

  /** Sends a seat what it needs to catch up: the round during a fight step, then the state. */
  resend(seat: number): void {
    if (this.step.kind === 'fight') this.options.send(seat, { type: 'round', round: this.record! });
    this.options.send(seat, { type: 'state', state: this.view(seat) });
  }

  /** A person leaves for good, and the seat's bot plays the rest of the game. */
  leave(seat: number): void {
    if (!this.people[seat]) return;
    this.people[seat] = false;
    this.connected[seat] = false;
    this.readySeats.delete(seat);
    this.takeOver(seat);
    if (this.everyoneOut()) this.finish();
    else this.endEarly();
    this.broadcast();
  }

  /** Ends the step if its time is up. Call it about every 100 ms. */
  update(): void {
    const { endsAt } = this.step;
    if (endsAt === null || this.options.host.now() < endsAt) return;
    this.endStep();
    this.broadcast();
  }

  // Steps (section 5.1)

  /** Starts the step for where the game is now: a Council turn, planning, or the end. */
  private enter(): void {
    this.readySeats.clear();
    this.record = null;
    for (;;) {
      if (this.game.isOver()) {
        this.end();
        return;
      }
      if (this.everyoneOut()) {
        this.finish();
        return;
      }
      if (this.game.state.phase === 'council') {
        // Bots completed the group, so the next group or planning starts.
        if (this.autopilot.pick((seat) => this.botControlled(seat))) continue;
        this.step = { kind: 'council', endsAt: this.after(TIMERS.councilPick) };
        return;
      }
      this.plan();
      // Bots have picked their Gifts by now, so this is a person with an offer.
      const offers = this.game.state.players.some((p) => p.giftOffer !== null);
      this.step = { kind: 'planning', endsAt: this.after(TIMERS.planning + (offers ? TIMERS.giftOffer : 0)) };
      return;
    }
  }

  private endStep(): void {
    switch (this.step.kind) {
      case 'council':
        // advance() picks for everyone in the group who hasn't.
        this.game.advance();
        this.enter();
        return;
      case 'planning': {
        // The game stays in the round while its fights play, so people can shop.
        const report = this.game.fight();
        this.keepBoards(report);
        // The start round has no fights to show: straight on to the next round.
        if (report.fights.length === 0) {
          this.game.advance();
          this.enter();
          return;
        }
        const record = roundRecord(report);
        const longest = Math.max(0, ...report.fights.map((f) => f.result.finalTick)) / TICKS_PER_SECOND;
        this.readySeats.clear();
        this.record = record;
        this.step = { kind: 'fight', endsAt: this.after(longest + TIMERS.fightHold + TIMERS.results + TIMERS.slack) };
        for (const seat of this.audience()) this.options.send(seat, { type: 'round', round: record });
        return;
      }
      case 'fight':
        // The fights' gold and loot are paid, and the next round starts, unless they ended the game.
        if (this.game.state.phase === 'fight') this.game.advance();
        this.enter();
        return;
      case 'over':
        return;
    }
  }

  /** Ends planning or a fight step once every connected person still in the game is Ready. */
  private endEarly(): void {
    if (this.step.kind !== 'planning' && this.step.kind !== 'fight') return;
    const voters = this.seats().filter((seat) => this.people[seat] && this.connected[seat] && this.inGame(seat));
    if (voters.length > 0 && voters.every((seat) => this.readySeats.has(seat))) this.endStep();
  }

  /** Plays the rest of the game at once, with bots in every seat. */
  private finish(): void {
    // Planning has already been done for this round: by bots on entering it, and for people's
    // seats when their bots took over. Fight it as it stands, so nobody plans twice.
    if (this.step.kind === 'planning') this.keepBoards(this.game.fight());
    // Each round's levels as it fights, for the boards kept from its report.
    const levels: number[][] = [];
    const reports = this.autopilot.playUntil(undefined, (state) => levels.push(state.players.map((p) => p.level)));
    reports.forEach((report, i) => this.keepBoards(report, levels[i]));
    this.record = null;
    this.end();
  }

  private end(): void {
    this.step = { kind: 'over', endsAt: null };
    if (this.reported) return;
    this.reported = true;
    this.options.over?.();
  }

  /** Keeps the boards the seats fought with in a round. */
  private keepBoards(report: RoundReport, levels = this.game.state.players.map((p) => p.level)): void {
    for (const [seat, board] of fightBoards(report, levels)) this.boards[seat] = board;
  }

  // Seats (section 5.2)

  /** A seat's bot acts at once when it takes over in planning or in the seat's Council turn. */
  private takeOver(seat: number): void {
    if (this.step.kind === 'planning') {
      this.autopilot.bots[seat]!.plan(this.game);
    } else if (this.step.kind === 'council' && this.autopilot.pick((s) => s === seat)) {
      this.enter();
    }
  }

  /** Bots plan in an order that starts one seat later each round. */
  private plan(): void {
    this.autopilot.plan((seat) => this.botControlled(seat));
  }

  private seats(): number[] {
    return this.people.map((_, seat) => seat);
  }

  private botControlled(seat: number): boolean {
    return !this.people[seat] || !this.connected[seat];
  }

  private inGame(seat: number): boolean {
    return this.game.state.players[seat]!.placement === null;
  }

  private everyoneOut(): boolean {
    return !this.seats().some((seat) => this.people[seat] && this.inGame(seat));
  }

  /** Connected people, in the game or out of it. */
  private audience(): number[] {
    return this.seats().filter((seat) => this.people[seat] && this.connected[seat]);
  }

  private broadcast(): void {
    for (const seat of this.audience()) this.options.send(seat, { type: 'state', state: this.view(seat) });
  }

  /** A time some seconds from now, in whole milliseconds. */
  private after(seconds: number): number {
    return this.options.host.now() + Math.ceil(seconds * 1000);
  }
}
