// The One Ring's life in a game (docs/game-spec.md section 9.11): offered at a Council, held by
// a player and borne by one of their units, corrupting its bearers, stolen, lost or destroyed.
// The game reports what happens; the Ring keeps its state consistent: a holder exactly while it
// is held, a bearer only while it is held, and its Corruption kept until it consumes a bearer.

import { RING } from '../data/ring.js';
import { UNITS, type UnitId } from '../data/units.js';
import type { FightReport } from './game.js';

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
  #state: RingState = 'waiting';
  #holder: number | null = null;
  #bearer: number | null = null;
  #corruption = 0;
  /** Rounds borne by Hobbits, which gain Corruption every other round. */
  #hobbitRounds = 0;
  #hobbitFights = 0;

  get state(): RingState {
    return this.#state;
  }

  get holder(): number | null {
    return this.#holder;
  }

  get bearer(): number | null {
    return this.#bearer;
  }

  get corruption(): number {
    return this.#corruption;
  }

  get hobbitFights(): number {
    return this.#hobbitFights;
  }

  /** The seat holding it with no unit bearing it, or null. */
  get unworn(): number | null {
    return this.#state === 'held' && this.#bearer === null ? this.#holder : null;
  }

  /** Whether a player's unit bears it. */
  isBorneBy(seat: number, unitId: number): boolean {
    return this.#state === 'held' && this.#holder === seat && this.#bearer === unitId;
  }

  /** A Council from the Ring's first stage offers it if it is waiting. Returns whether it does. */
  offer(stage: number): boolean {
    if (this.#state !== 'waiting' || stage < RING.firstStage) return false;
    this.#state = 'offered';
    return true;
  }

  /** A player picked the option bringing it, borne by their Bilbo if they own one. */
  take(seat: number, bearer: number | null): void {
    this.expect('offered');
    this.#state = 'held';
    this.#holder = seat;
    this.#bearer = bearer;
  }

  /** Nobody picked it: it waits for the next Council, keeping its Corruption. */
  decline(): void {
    this.expect('offered');
    this.release(false);
  }

  /**
   * A round starts with a bearer: one Corruption, or one every other round on a Hobbit. Returns
   * true if that consumes the bearer, when the Ring waits for the next Council with none.
   */
  corrupt(bearerIsHobbit: boolean): boolean {
    this.expect('held');
    if (bearerIsHobbit) {
      this.#hobbitRounds++;
      if (this.#hobbitRounds % RING.hobbitRoundsPerCorruption === 0) this.#corruption++;
    } else {
      this.#corruption++;
    }
    if (this.#corruption < RING.consumedAt) return false;
    this.release(true);
    return true;
  }

  /** The holder gives it to one of their units, or it equips itself on one before the fights. */
  bear(unitId: number): void {
    this.expect('held');
    this.#bearer = unitId;
  }

  /** The bearer left its holder's units, so the Ring is unworn. */
  unitSold(seat: number, unitId: number): void {
    if (this.isBorneBy(seat, unitId)) this.#bearer = null;
  }

  /** A bearer merged into another copy, which bears it now. */
  unitsMerged(seat: number, from: number, into: number): void {
    if (this.isBorneBy(seat, from)) this.#bearer = into;
  }

  /** A fight its Hobbit bearer fought, towards Mount Doom. */
  foughtByHobbit(): void {
    this.expect('held');
    this.#hobbitFights++;
  }

  /** An opponent's Gollum survived a fight with the bearer, and takes it. `bearer` is that Gollum, if on the board. */
  steal(seat: number, bearer: number | null): void {
    this.expect('held');
    this.#holder = seat;
    this.#bearer = bearer;
  }

  /**
   * After the round's fights, in order: each fight the holder's Hobbit bearer fought counts, and
   * the first PvP fight with a surviving Gollum on the other side ends with that player holding it.
   */
  afterFights(fights: readonly FightReport[], gollumOf: (seat: number) => number | null): void {
    if (this.#state !== 'held') return;
    const holder = this.#holder!;
    for (const fight of fights) {
      const side = fight.home === holder ? 'A' : fight.kind === 'pvp' && fight.away === holder ? 'B' : null;
      if (side === null) continue;
      const bearer = fight.input.teams[side].find((p) => p.ring !== undefined);
      if (bearer !== undefined && UNITS[bearer.unitId as UnitId].origin === 'hobbit') this.foughtByHobbit();
      if (fight.kind !== 'pvp') continue;
      const thief = side === 'A' ? fight.away! : fight.home;
      if (!fight.result.survivors[side === 'A' ? 'B' : 'A'].some((s) => s.unitId === 'gollum')) continue;
      this.steal(thief, gollumOf(thief));
      return;
    }
  }

  /** Thrown into Mount Doom, for good. */
  destroy(): void {
    this.expect('held');
    this.#state = 'destroyed';
    this.#holder = null;
    this.#bearer = null;
  }

  /** A player was eliminated: if they held it, it waits for the next Council, keeping its Corruption. */
  holderOut(seat: number): void {
    if (this.#state === 'held' && this.#holder === seat) this.release(false);
  }

  /** Back to waiting for the next Council, keeping its Corruption unless `reset`. */
  private release(reset: boolean): void {
    this.#state = 'waiting';
    this.#holder = null;
    this.#bearer = null;
    if (reset) {
      this.#corruption = 0;
      this.#hobbitRounds = 0;
      this.#hobbitFights = 0;
    }
  }

  private expect(state: RingState): void {
    if (this.#state !== state) throw new Error(`The One Ring is ${this.#state}, not ${state}.`);
  }
}
