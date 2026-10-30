// Bots driving a game (docs/game-spec.md section 11, docs/server-spec.md section 5.2): one bot per
// seat, picking in Council turns and planning in an order that starts one seat later each round.
// The server runs the seats nobody plays; the balance runner and tests run every seat.

import { createGame, type Game, type GameState, type RoundReport } from '../game/game.js';
import { Bot } from './bot.js';

const EVERY_SEAT = () => true;

export class Autopilot {
  /** One per seat, whether or not it plays. */
  readonly bots: readonly Bot[];
  /** Planning phases so far, so bots take turns at planning first. */
  private plannings = 0;

  constructor(
    private readonly game: Game,
    seed: number,
  ) {
    this.bots = Array.from({ length: game.state.players.length }, (_, seat) => new Bot(seat, seed));
  }

  /**
   * In a Council, the bots of the seats that `plays` picks, in seat order, if it is their turn.
   * A pick that ends a group's turn lets later seats pick in the next group. Returns whether the
   * game moved on to another group or past the Council.
   */
  pick(plays: (seat: number) => boolean = EVERY_SEAT): boolean {
    const turn = this.game.state.turn;
    this.bots.forEach((bot, seat) => {
      if (plays(seat)) bot.pick(this.game);
    });
    return this.game.state.turn !== turn;
  }

  /** In planning, the bots of the seats that `plays` plan, the first a seat later than last time. */
  plan(plays: (seat: number) => boolean = EVERY_SEAT): void {
    this.plannings++;
    const n = this.bots.length;
    for (let i = 0; i < n; i++) {
      const seat = (this.plannings + i) % n;
      if (plays(seat)) this.bots[seat]!.plan(this.game);
    }
  }

  /**
   * Plays on with a bot in every seat until `done` is true or the game is over: a Council turn
   * the bots don't finish runs out, and each planning ends once the bots have planned.
   * `afterPlanning`, if given, sees the state each round once every bot has planned, before the
   * fights. Returns the reports of the rounds fought.
   */
  playUntil(done: () => boolean = () => false, afterPlanning?: (state: GameState) => void): RoundReport[] {
    const reports: RoundReport[] = [];
    while (!this.game.isOver() && !done()) {
      if (this.game.state.phase === 'council') {
        if (!this.pick()) this.game.advance();
      } else {
        this.plan();
        afterPlanning?.(this.game.state);
        reports.push(this.game.advance()!);
      }
    }
    return reports;
  }
}

/** Plays a whole game with a bot in every seat, showing `afterPlanning` the state each round as `playUntil` does. */
export function playBotGame(
  seed: number,
  players = 8,
  afterPlanning?: (state: GameState) => void,
): { game: Game; bots: readonly Bot[]; reports: RoundReport[] } {
  const game = createGame({ seed, players });
  const autopilot = new Autopilot(game, seed);
  const reports = autopilot.playUntil(undefined, afterPlanning);
  return { game, bots: autopilot.bots, reports };
}
