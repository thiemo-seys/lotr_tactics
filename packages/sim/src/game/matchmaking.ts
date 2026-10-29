// Pairing players for PvP rounds (docs/game-spec.md section 9.5).

import { shuffle, type Rng } from '../rng.js';

export interface Pairing {
  /** Team A. */
  readonly home: number;
  /** Team B: the opponent, or the owner of the ghost board. */
  readonly away: number;
  /** The away board is a ghost copy, and its owner isn't affected by the fight. */
  readonly ghost: boolean;
}

/**
 * Pairs the living players. With an odd count, one of them fights a ghost of another. Goes
 * through the possible pairings in a seeded order and keeps the first with the fewest repeats of
 * recent opponents, stopping at the first with none. Eight players have only 105 pairings.
 */
export function pairPlayers(seats: readonly number[], recentOpponents: (seat: number) => readonly number[], rng: Rng): Pairing[] {
  if (seats.length < 2) return [];
  const order = shuffle(rng, seats);
  const met = (a: number, b: number) => recentOpponents(a).includes(b) || recentOpponents(b).includes(a);
  let best: Pairing[] = [];
  let bestRepeats = Infinity;

  /** Pairs up `left` after `pairings`. Returns true once a pairing with no repeats is found. */
  const search = (left: readonly number[], pairings: Pairing[], repeats: number): boolean => {
    if (repeats >= bestRepeats) return false;
    if (left.length === 0) {
      // Real fights first, then the ghost fight.
      best = [...pairings.filter((p) => !p.ghost), ...pairings.filter((p) => p.ghost)];
      bestRepeats = repeats;
      return repeats === 0;
    }
    const [first, ...rest] = left;
    for (let i = 0; i < rest.length; i++) {
      pairings.push({ home: first!, away: rest[i]!, ghost: false });
      const found = search(
        rest.filter((_, j) => j !== i),
        pairings,
        repeats + (met(first!, rest[i]!) ? 1 : 0),
      );
      pairings.pop();
      if (found) return true;
    }
    return false;
  };

  if (order.length % 2 === 0) {
    search(order, [], 0);
    return best;
  }
  // Every choice of who fights a ghost, from the last in the order, and of whose ghost it is.
  for (const home of [...order].reverse()) {
    const rest = order.filter((seat) => seat !== home);
    for (const away of rest) {
      const ghost: Pairing = { home, away, ghost: true };
      if (search(rest, [ghost], recentOpponents(home).includes(away) ? 1 : 0)) return best;
    }
  }
  return best;
}
