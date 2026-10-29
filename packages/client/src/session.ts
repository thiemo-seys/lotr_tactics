// A game against bots for one person (docs/game-spec.md section 12). No Three.js and no DOM, so
// it can be tested: it decides when bots act and which fight is the person's.

import { Bot, createGame, type FightReport, type Game, type RoundReport, type Team } from '@lotr-tactics/sim';

/** The person always plays seat 0. */
export const YOU = 0;

export class Session {
  readonly game: Game;
  private readonly bots: Bot[];
  /** Rounds planned so far, so bots take turns at shopping first. */
  private planned = 0;
  /** The round whose planning the bots have done, as "stage-round". */
  private plannedRound = '';

  constructor(seed: number, players = 8) {
    this.game = createGame({ seed, players });
    this.bots = Array.from({ length: players - 1 }, (_, i) => new Bot(i + 1, seed));
    this.settle();
  }

  get out(): boolean {
    return this.game.state.players[YOU]!.placement !== null;
  }

  /** It's the person's turn to pick in a Council. */
  get yourPick(): boolean {
    const council = this.game.state.council;
    return (
      council !== null &&
      !this.out &&
      council.groups[council.group]!.includes(YOU) &&
      !council.options.some((o) => o.pickedBy === YOU)
    );
  }

  /** Picks a Council option for the person, then lets the bots carry on. */
  pick(option: number): boolean {
    const ok = this.game.act(YOU, { type: 'pick', option }).ok;
    if (ok) this.settle();
    return ok;
  }

  /** The person ran out of time to pick: they get a random option. */
  endPick(): void {
    if (this.yourPick) this.game.advance();
    this.settle();
  }

  /** Ends planning and runs the round's fights. */
  endPlanning(): RoundReport {
    const report = this.game.advance()!;
    this.settle();
    return report;
  }

  /** Plays on without the person, once they are out, to the end of the game. */
  finish(): void {
    while (!this.game.isOver()) {
      if (this.game.state.phase === 'planning') this.endPlanning();
      else this.game.advance();
      this.settle();
    }
  }

  /**
   * Lets the bots act until the person has something to do: bots pick in a Council when it's their
   * turn, and plan at the start of planning, in a rotating order.
   */
  private settle(): void {
    while (this.game.state.phase === 'council') {
      const group = this.game.state.council!.group;
      for (const bot of this.bots) bot.pick(this.game);
      if (this.game.state.phase !== 'council' || this.game.state.council!.group !== group) continue;
      // The group is waiting for the person, or for nobody if they are out.
      if (this.yourPick) return;
      this.game.advance();
    }
    const round = `${this.game.state.stage}-${this.game.state.round}`;
    if (this.game.state.phase === 'planning' && round !== this.plannedRound) {
      this.plannedRound = round;
      this.planned++;
      const n = this.bots.length;
      for (let i = 0; i < n; i++) this.bots[(this.planned + i) % n]!.plan(this.game);
    }
  }
}

/** The person's own fight in a round, if they fought: not a fight against their ghost. */
export function yourFight(report: RoundReport): FightReport | null {
  return report.fights.find((f) => f.home === YOU || (f.kind === 'pvp' && f.away === YOU)) ?? null;
}

/** The team the person played in a fight. */
export function yourTeam(fight: FightReport): Team {
  return fight.home === YOU ? 'A' : 'B';
}
