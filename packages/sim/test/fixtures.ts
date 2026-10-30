// Set-ups for game tests. The one place that casts the game's views to the classes behind them,
// to stage a scenario the way the game itself would: units come out of the pool, Rings of Power
// out of the supply, and the One Ring changes hands through its own methods.

import { isRingOfPower } from '../src/combat/items.js';
import type { ItemId } from '../src/data/items.js';
import { RING } from '../src/data/ring.js';
import type { UnitId } from '../src/data/units.js';
import type { Game } from '../src/game/game.js';
import { boardSlot, type Place } from '../src/game/places.js';
import type { Player } from '../src/game/player.js';
import { copiesIn, type Pool } from '../src/game/pool.js';
import type { Ring } from '../src/game/ring.js';
import type { RingSupply } from '../src/game/ring-supply.js';
import type { Star } from '../src/types.js';

export const playerOf = (game: Game, seat: number) => game.state.players[seat] as Player;
export const poolOf = (game: Game) => game.state.pool as Pool;
export const ringOf = (game: Game) => game.state.ring as Ring;
export const supplyOf = (game: Game) => game.state.ringSupply as RingSupply;

/** Advances until the given round starts: its planning, or its Council. */
export function skipTo(game: Game, stage: number, round: number): void {
  while (!(game.state.stage === stage && game.state.round === round && game.state.phase !== 'over')) game.advance();
}

/** Ends planning, then plays through any Council, until the next planning. */
export function nextPlanning(game: Game): void {
  game.advance();
  while (game.state.phase === 'council') game.advance();
}

let nextId = 10_000;

/**
 * Puts a unit on a player's board or bench, taking its copies from the pool and its Rings of
 * Power from the supply. Returns its id.
 */
export function field(game: Game, seat: number, unitId: UnitId, place: Place, options: { star?: Star; items?: ItemId[] } = {}): number {
  const { star = 1, items = [] } = options;
  poolOf(game).take(unitId, copiesIn(star));
  for (const item of items) if (isRingOfPower(item)) supplyOf(game).take(item);
  const id = nextId++;
  const unit = { id, unitId, star, items };
  const p = playerOf(game, seat);
  if ('bench' in place) p.bench[place.bench] = unit;
  else p.board[boardSlot(place)] = unit;
  return id;
}

/** Gives a player items, taking Rings of Power from the supply. */
export function giveItems(game: Game, seat: number, ...items: ItemId[]): void {
  for (const item of items) if (isRingOfPower(item)) supplyOf(game).take(item);
  playerOf(game, seat).items.push(...items);
}

/** Gives a player the One Ring, as if picked at a Council and then borne for `corruption` rounds by units that aren't Hobbits. */
export function holdRing(game: Game, seat: number, bearer: number | null, corruption = 0): Ring {
  const ring = ringOf(game);
  ring.offer(RING.firstStage);
  ring.take(seat, bearer);
  for (let i = 0; i < corruption; i++) ring.corrupt(false);
  return ring;
}
