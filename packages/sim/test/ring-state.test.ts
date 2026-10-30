// The One Ring's state and the Rings of Power supply on their own (docs/game-spec.md sections
// 9.11 and 9.12). Whole games with them are in ring-game.test.ts and rings-game.test.ts.

import { describe, expect, it } from 'vitest';
import type { PlacedUnit } from '../src/combat/combat.js';
import { RING_OF_POWER_IDS } from '../src/combat/items.js';
import { ITEMS } from '../src/data/items.js';
import { RING } from '../src/data/ring.js';
import type { UnitId } from '../src/data/units.js';
import type { FightReport } from '../src/game/game.js';
import { Ring } from '../src/game/ring.js';
import { RingSupply } from '../src/game/ring-supply.js';
import { createRng } from '../src/rng.js';

/** A Ring held by seat 0, borne by unit 1. */
function held(): Ring {
  const ring = new Ring();
  ring.offer(RING.firstStage);
  ring.take(0, 1);
  return ring;
}

const view = (ring: Ring) => ({ state: ring.state, holder: ring.holder, bearer: ring.bearer, corruption: ring.corruption });

/**
 * A fight between seats `home` (team A) and `away`, with the Ring's bearer on `bearer`'s side as
 * the given unit, and Gollum surviving on `gollum`'s side.
 */
function fight(
  kind: FightReport['kind'],
  home: number,
  away: number | null,
  options: { bearer?: { side: 'A' | 'B'; unitId: UnitId }; gollum?: 'A' | 'B' } = {},
): FightReport {
  const team = (side: 'A' | 'B'): PlacedUnit[] =>
    options.bearer?.side === side ? [{ unitId: options.bearer.unitId, star: 1, col: 3, row: 3, items: [], ring: 2 }] : [];
  const survivors = (side: 'A' | 'B') => (options.gollum === side ? [{ unitId: 'gollum' as const, star: 1 as const }] : []);
  return {
    kind,
    home,
    away,
    input: { seed: 1, stage: 2, teams: { A: team('A'), B: team('B') } },
    result: { outcome: 'A', survivors: { A: survivors('A'), B: survivors('B') }, finalTick: 0, events: [] },
  };
}

describe('the One Ring', () => {
  it('is offered from its first stage while it waits, and changes hands only in order', () => {
    const ring = new Ring();
    expect(ring.offer(RING.firstStage - 1)).toBe(false);
    expect(() => ring.take(0, null)).toThrow(/waiting, not offered/);
    expect(ring.offer(RING.firstStage)).toBe(true);
    expect(ring.offer(RING.firstStage)).toBe(false);
    expect(() => ring.bear(1)).toThrow(/offered, not held/);
    ring.decline();
    expect(ring.state).toBe('waiting');
  });

  it('gains Corruption each round, every other round on a Hobbit, and consumes its bearer at the limit', () => {
    const ring = held();
    expect(ring.corrupt(true)).toBe(false);
    expect(ring.corruption).toBe(0);
    expect(ring.corrupt(true)).toBe(false);
    expect(ring.corruption).toBe(1);
    ring.foughtByHobbit();
    while (ring.corruption < RING.consumedAt - 1) expect(ring.corrupt(false)).toBe(false);
    expect(ring.corrupt(false)).toBe(true);
    expect(view(ring)).toEqual({ state: 'waiting', holder: null, bearer: null, corruption: 0 });
    expect(ring.hobbitFights).toBe(0);
  });

  it('keeps its Corruption when nobody takes it or its holder is out', () => {
    const ring = held();
    ring.corrupt(false);
    ring.holderOut(1);
    expect(ring.holder).toBe(0);
    ring.holderOut(0);
    expect(view(ring)).toEqual({ state: 'waiting', holder: null, bearer: null, corruption: 1 });
    ring.offer(RING.firstStage);
    ring.decline();
    expect(ring.corruption).toBe(1);
  });

  it('follows its bearer when sold or merged, and only its holder’s', () => {
    const ring = held();
    ring.unitsMerged(1, 1, 5);
    expect(ring.bearer).toBe(1);
    ring.unitsMerged(0, 1, 5);
    expect(ring.bearer).toBe(5);
    ring.unitSold(0, 1);
    expect(ring.bearer).toBe(5);
    ring.unitSold(0, 5);
    expect([ring.bearer, ring.unworn]).toEqual([null, 0]);
    ring.bear(7);
    expect([ring.bearer, ring.unworn]).toEqual([7, null]);
  });

  it('counts the fights its holder’s Hobbit bearer fights, ghost fights against the holder aside', () => {
    const ring = held();
    const frodo = { side: 'A' as const, unitId: 'frodo' as const };
    ring.afterFights(
      [
        fight('pvp', 0, 1, { bearer: frodo }),
        fight('pvp', 2, 0, { bearer: { side: 'B', unitId: 'frodo' } }),
        fight('pve', 0, null, { bearer: frodo }),
        fight('ghost', 0, 3, { bearer: frodo }),
        fight('pvp', 0, 1, { bearer: { side: 'A', unitId: 'gimli' } }),
        // A ghost of the holder's board, fought by someone else.
        fight('ghost', 4, 0, { bearer: { side: 'B', unitId: 'frodo' } }),
      ],
      () => null,
    );
    expect(ring.hobbitFights).toBe(4);
  });

  it("goes to an opponent whose Gollum survives a PvP fight, but not a PvE or ghost fight", () => {
    const ring = held();
    ring.afterFights([fight('pve', 0, null, { gollum: 'B' }), fight('ghost', 0, 2, { gollum: 'B' })], () => 9);
    expect(ring.holder).toBe(0);
    ring.afterFights([fight('pvp', 3, 0, { gollum: 'A' })], (seat) => (seat === 3 ? 9 : null));
    expect(view(ring)).toEqual({ state: 'held', holder: 3, bearer: 9, corruption: 0 });
  });

  it('is destroyed only while held, for good', () => {
    expect(() => new Ring().destroy()).toThrow(/waiting, not held/);
    const ring = held();
    ring.destroy();
    expect(view(ring)).toEqual({ state: 'destroyed', holder: null, bearer: null, corruption: 0 });
    expect(ring.offer(RING.firstStage)).toBe(false);
  });
});

describe('the Rings of Power supply', () => {
  const total = (supply: RingSupply) => RING_OF_POWER_IDS.reduce((sum, id) => sum + supply.count(id), 0);

  it('starts with every copy, and draws each copy once, weighted by copies left', () => {
    const supply = new RingSupply();
    for (const id of RING_OF_POWER_IDS) expect(supply.count(id)).toBe(ITEMS[id].ringOfPower!.copies);
    const rng = createRng(5);
    const drawn = new Map<string, number>();
    const start = total(supply);
    for (let i = 0; i < start; i++) {
      const id = supply.draw(rng)!;
      drawn.set(id, (drawn.get(id) ?? 0) + 1);
    }
    expect(Object.fromEntries(drawn)).toEqual(Object.fromEntries(RING_OF_POWER_IDS.map((id) => [id, ITEMS[id].ringOfPower!.copies])));
    // Empty: no ring, and no number used.
    const next = rng();
    const again = createRng(5);
    for (let i = 0; i < start; i++) again();
    expect(supply.draw(again)).toBeNull();
    expect(again()).toBe(next);
  });

  it('takes rings back, and keeps only the Seven when the One is destroyed', () => {
    const supply = new RingSupply();
    supply.take('narya');
    expect(() => supply.take('narya')).toThrow(/no narya left/);
    supply.putBack('narya');
    supply.retireBound();
    expect(RING_OF_POWER_IDS.filter((id) => supply.count(id) > 0)).toEqual(['ring-of-the-seven']);
  });
});
