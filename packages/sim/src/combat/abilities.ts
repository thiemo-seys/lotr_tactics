// Ability selectors and the geometry behind them (docs/sim-spec.md sections 10.3 and 10.4). The
// effects themselves change the fight, so they live in combat.ts.

import type { Selector, UnitSelector } from '../data/units.js';
import {
  BOARD_HEXES,
  BOARD_ROWS,
  boardIndex,
  compareHexes,
  cone,
  distance,
  hexEquals,
  isOnBoard,
  line,
  neighbours,
  perspective,
  toOffset,
  type Hex,
} from '../hex.js';
import type { Team } from '../types.js';
import type { Candidate } from './targeting.js';

/** What selectors need to know about a unit. */
export interface AbilityUnit extends Candidate {
  readonly team: Team;
  readonly health: number;
  readonly stats: { readonly maxHealth: number };
}

/** The units a selector can pick from. */
export interface SelectionContext<U extends AbilityUnit> {
  readonly caster: U;
  /** Living allies, the caster included. */
  readonly allies: readonly U[];
  /** Targetable enemies. */
  readonly enemies: readonly U[];
  /** The caster's target, choosing one first if it has none (section 10.1). */
  readonly target: () => U | null;
  /**
   * Where the caster measures from: its hex, unless a dash or charge earlier in the cast has chosen
   * where it will be (section 10.6). Defaults to the caster's hex.
   */
  readonly origin?: Hex;
}

export interface Selection<U> {
  readonly units: readonly U[];
  /**
   * For a hex selector (section 10.3), the hexes it covers: a line's in order from the caster,
   * with any off the board for `line(n)`; a cone's in the order of section 10.4, on the board;
   * the others' on the board, by row, then column. Empty for a unit selector.
   */
  readonly hexes: readonly Hex[];
  /** For `area`, the hex it is around; for the selectors round the caster, the origin. Null otherwise. */
  readonly centre: Hex | null;
}

/** Selectors that lock hexes at the cast rather than units (section 10.3). */
export type HexSelector = Extract<Selector, { kind: 'area' | 'line' | 'cone' | 'enemiesWithin' | 'adjacentEnemies' | 'alliesWithin' | 'adjacentAllies' }>;

export function isHexSelector(selector: Selector): selector is HexSelector {
  switch (selector.kind) {
    case 'area':
    case 'line':
    case 'cone':
    case 'enemiesWithin':
    case 'adjacentEnemies':
    case 'alliesWithin':
    case 'adjacentAllies':
      return true;
    default:
      return false;
  }
}

/** Whether a selector picks the caster or its allies rather than enemies. */
export function selectsAllies(selector: Selector): boolean {
  switch (selector.kind) {
    case 'self':
    case 'nearestAlly':
    case 'lowestHealthPctAllies':
    case 'allAllies':
    case 'alliesWithin':
    case 'adjacentAllies':
      return true;
    default:
      return false;
  }
}

/**
 * The units a step's effects apply to (section 10.3), and for a hex selector the hexes it covers.
 * Multi-unit selections are in slot order, except `nearestEnemies` (nearest first),
 * `lowestHealthPctAllies` (lowest first), lines (from the caster outwards) and bounces (in hit
 * order).
 */
export function select<U extends AbilityUnit>(selector: Selector, ctx: SelectionContext<U>): Selection<U> {
  const { caster, allies, enemies } = ctx;
  const origin = ctx.origin ?? caster.hex;
  const units = (list: readonly U[]): Selection<U> => ({ units: list, hexes: [], centre: null });
  const shape = (shaped: HexSelector, hexes: readonly Hex[], centre: Hex | null): Selection<U> => {
    const candidates = selectsAllies(shaped) ? allies : enemies;
    return { units: standingOn(shaped, hexes, candidates), hexes, centre };
  };
  switch (selector.kind) {
    case 'self':
    case 'target':
    case 'farthestEnemy':
    case 'lowestHealthEnemy':
    case 'highestHealthEnemy':
    case 'nearestAlly': {
      const unit = selectUnit(selector, ctx);
      return units(unit === null ? [] : [unit]);
    }
    case 'nearestEnemies':
      return units(byDistance(caster.team, origin, enemies).slice(0, selector.count));
    case 'lowestHealthPctAllies':
      return units(
        [...allies]
          .sort((a, b) => a.health * b.stats.maxHealth - b.health * a.stats.maxHealth || closerFirst(caster.team, origin, a, b))
          .slice(0, selector.count),
      );
    case 'allAllies':
      return units(bySlot(allies));
    case 'alliesWithin':
    case 'enemiesWithin':
      return shape(selector, hexesWithin(origin, selector.radius), origin);
    case 'adjacentAllies':
    case 'adjacentEnemies':
      return shape(
        selector,
        BOARD_HEXES.filter((hex) => distance(hex, origin) === 1),
        origin,
      );
    case 'area': {
      const { around } = selector;
      const centre =
        around.kind === 'bestClusterHex'
          ? bestClusterHex(caster.team, enemies, around.radius, ctx.target()?.hex ?? null)
          : (selectUnit(around, ctx)?.hex ?? null);
      return centre === null ? shape(selector, [], null) : shape(selector, hexesWithin(centre, selector.radius), centre);
    }
    case 'line': {
      const target = ctx.target();
      return shape(selector, target === null ? [] : line(caster.team, origin, target.hex, selector.length), null);
    }
    case 'cone': {
      const target = ctx.target();
      return shape(selector, target === null ? [] : cone(caster.team, origin, target.hex).filter(isOnBoard), null);
    }
    case 'bounce': {
      const first = ctx.target();
      if (first === null) return units([]);
      const hit = [first];
      while (hit.length < selector.count) {
        const last = hit[hit.length - 1]!;
        const next = byDistance(caster.team, last.hex, enemies).find(
          (u) => !hit.includes(u) && distance(u.hex, last.hex) <= selector.jump,
        );
        if (next === undefined) break;
        hit.push(next);
      }
      return units(hit);
    }
  }
}

/**
 * The units of `candidates` standing on `hexes`, for a hex selector (section 10.6): in line order
 * for a line, otherwise in slot order, and only Orcs for `alliesWithin` with that origin. Pass the
 * targetable enemies for an enemy selector, or the living allies for an ally selector.
 */
export function standingOn<U extends AbilityUnit>(selector: HexSelector, hexes: readonly Hex[], candidates: readonly U[]): U[] {
  const origin = selector.kind === 'alliesWithin' ? selector.origin : undefined;
  const eligible = origin === undefined ? candidates : candidates.filter((u) => u.origin === origin);
  if (selector.kind === 'line') return hexes.flatMap((hex) => eligible.filter((u) => hexEquals(u.hex, hex)));
  const covered = new Set(hexes.filter(isOnBoard).map(boardIndex));
  return bySlot(eligible.filter((u) => covered.has(boardIndex(u.hex))));
}

/** The hexes on the board within `radius` of `centre`, by row, then column. */
function hexesWithin(centre: Hex, radius: number): Hex[] {
  return BOARD_HEXES.filter((hex) => distance(hex, centre) <= radius);
}

function selectUnit<U extends AbilityUnit>(selector: UnitSelector, ctx: SelectionContext<U>): U | null {
  const { caster, allies, enemies } = ctx;
  const origin = ctx.origin ?? caster.hex;
  switch (selector.kind) {
    case 'self':
      return caster;
    case 'target':
      return ctx.target();
    case 'farthestEnemy':
      return first(
        enemies,
        (a, b) => distance(origin, b.hex) - distance(origin, a.hex) || compareHexes(caster.team, a.hex, b.hex),
      );
    case 'lowestHealthEnemy':
      return first(enemies, (a, b) => a.health - b.health || closerFirst(caster.team, origin, a, b));
    case 'highestHealthEnemy':
      return first(enemies, (a, b) => b.health - a.health || closerFirst(caster.team, origin, a, b));
    case 'nearestAlly':
      return byDistance(caster.team, origin, allies).find((u) => u !== caster) ?? null;
  }
}

/**
 * The hex with the most `enemies` within `radius` (section 10.4). Ties go to the hex closest to
 * the caster's target, then the section 5 tie-break.
 */
export function bestClusterHex(team: Team, enemies: readonly Candidate[], radius: number, target: Hex | null): Hex {
  let best: Hex = BOARD_HEXES[0]!;
  let bestScore = -1;
  for (const hex of BOARD_HEXES) {
    const score = enemies.reduce((count, u) => count + (distance(u.hex, hex) <= radius ? 1 : 0), 0);
    const better =
      score - bestScore ||
      (target === null ? 0 : distance(best, target) - distance(hex, target)) ||
      compareHexes(team, best, hex);
    if (better > 0) {
      best = hex;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Where a dash next to `unit` ends (section 10.4): the free hex next to it closest to the caster,
 * otherwise the free hex closest to it, otherwise null. Ties go to the hex closer to the caster,
 * then the section 5 tie-break. Pass an `isFree` that counts the caster's own hex as free, so a
 * caster already next to the unit stays put.
 */
export function dashHex(team: Team, caster: Hex, unit: Hex, isFree: (hex: Hex) => boolean): Hex | null {
  const free = BOARD_HEXES.filter(isFree);
  const order = (a: Hex, b: Hex) => distance(a, caster) - distance(b, caster) || compareHexes(team, a, b);
  const adjacent = free.filter((hex) => distance(hex, unit) === 1).sort(order);
  if (adjacent.length > 0) return adjacent[0]!;
  return free.sort((a, b) => distance(a, unit) - distance(b, unit) || order(a, b))[0] ?? null;
}

/** Where `dashThroughLine` ends: the farthest free hex on the line, or null. */
export function lineDashHex(hexes: readonly Hex[], isFree: (hex: Hex) => boolean): Hex | null {
  return hexes.findLast((hex) => isOnBoard(hex) && isFree(hex)) ?? null;
}

/**
 * Where a summon appears (sections 10.3 and 12.3): the first free hex next to `owner`, in the
 * team's neighbour order, on the team's own half; otherwise the free hex on its half nearest to
 * `owner`, with the section 5 tie-break; otherwise null.
 */
export function summonHex(team: Team, owner: Hex, isFree: (hex: Hex) => boolean): Hex | null {
  const available = (hex: Hex) => isOnBoard(hex) && onOwnHalf(team, hex) && isFree(hex);
  const next = neighbours(team, owner).find(available);
  if (next !== undefined) return next;
  return (
    BOARD_HEXES.filter(available).sort((a, b) => distance(a, owner) - distance(b, owner) || compareHexes(team, a, b))[0] ??
    null
  );
}

/** Rows 0–3 in the team's own perspective. */
export function onOwnHalf(team: Team, hex: Hex): boolean {
  return toOffset(perspective(team, hex)).row < BOARD_ROWS / 2;
}

/** Nearest to `from` first, with the section 5 tie-break in the caster's perspective. */
function byDistance<U extends AbilityUnit>(team: Team, from: Hex, list: readonly U[]): U[] {
  return [...list].sort((a, b) => closerFirst(team, from, a, b));
}

function closerFirst(team: Team, from: Hex, a: AbilityUnit, b: AbilityUnit): number {
  return distance(from, a.hex) - distance(from, b.hex) || compareHexes(team, a.hex, b.hex);
}

function first<U>(list: readonly U[], order: (a: U, b: U) => number): U | null {
  return [...list].sort(order)[0] ?? null;
}

function bySlot<U extends AbilityUnit>(list: readonly U[]): U[] {
  return [...list].sort((a, b) => a.slot - b.slot);
}
