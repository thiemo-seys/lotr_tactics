// The One Ring's state in a game (docs/game-spec.md section 9.11). The game moves it between
// states; players read it to know which of their units bears it.

export type RingState = 'waiting' | 'offered' | 'held' | 'destroyed';

/** What everyone sees of the One Ring. */
export interface RingView {
  /** Waiting for a Council, offered in one, held by a player, or destroyed. */
  readonly state: RingState;
  /** The seat holding it, while held. */
  readonly holder: number | null;
  /** The id of the owned unit bearing it, or null while held unworn. */
  readonly bearer: number | null;
  readonly corruption: number;
  /** Fights fought by Hobbit bearers, towards destroying it. */
  readonly hobbitFights: number;
}

export class Ring implements RingView {
  state: RingState = 'waiting';
  holder: number | null = null;
  bearer: number | null = null;
  corruption = 0;
  /** Rounds borne by Hobbits, which gain Corruption every other round. */
  hobbitRounds = 0;
  hobbitFights = 0;

  /** Whether a player's unit bears it. */
  isBorneBy(seat: number, unitId: number): boolean {
    return this.state === 'held' && this.holder === seat && this.bearer === unitId;
  }

  /** Back to waiting for the next Council, keeping its Corruption unless `reset`. */
  release(reset: boolean): void {
    this.state = 'waiting';
    this.holder = null;
    this.bearer = null;
    if (reset) {
      this.corruption = 0;
      this.hobbitRounds = 0;
      this.hobbitFights = 0;
    }
  }
}
