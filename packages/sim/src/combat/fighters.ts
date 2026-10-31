// The units of a fight as they start it, and what they are (docs/sim-spec.md sections 6.2, 7 and
// 12): stats with the bonuses from traits, items, Gifts and the One Ring that hold for the whole
// fight, origins and classes, and the item effects each unit carries. No random draws: the fight
// itself is in combat.ts.

import { GIFTS, type GiftCombat, type GiftId } from '../data/gifts.js';
import { ITEMS, type ItemEffect, type ItemId } from '../data/items.js';
import { MONSTERS, type FighterId, type MonsterId } from '../data/monsters.js';
import { RING } from '../data/ring.js';
import type { ClassId, OriginId } from '../data/traits.js';
import { SUMMONS, UNITS, type AbilityDef, type Cost, type SummonId, type UnitDef, type UnitId } from '../data/units.js';
import { BOARD_ROWS, distance, fromPlacement, type Hex } from '../hex.js';
import type { Star, Team } from '../types.js';
import type { PlacedUnit, UnitState } from './combat.js';
import { itemEffects, itemModifiers } from './items.js';
import { baseStats, combineModifiers, finalStats, monsterStats, type BaseStats, type StatModifiers } from './stats.js';
import { Statuses } from './statuses.js';
import { toTicks } from './time.js';
import { traitCounts, traitLevelsOf, traitModifiers, type TraitCounts, type TraitLevels } from './traits.js';

/** Each team's half of the board is this many rows deep. */
export const HALF_ROWS = BOARD_ROWS / 2;

/**
 * An item's effect on one unit, and how often it has acted: low-Health triggers and stacks are
 * limited. `pct` is the percent of its listed numbers it has, more for a Ring of Power on its kin.
 */
export interface ItemEffectState<E extends ItemEffect = ItemEffect> {
  readonly effect: E;
  readonly pct: number;
  uses: number;
}

/** A unit in the fight, as the fight changes it. `UnitState` is what the renderer sees of it. */
export type Unit = { -readonly [K in Exclude<keyof UnitState, 'statuses'>]: UnitState[K] } & {
  readonly statuses: Statuses;
  /** The unit can't act before this tick. */
  busyUntil: number;
  /** A Burglar with its team's Burglar trait active, so it targets the farthest enemy. */
  targetsFarthest: boolean;
  /** The first tick the next basic attack can fire. Can be a fraction. */
  nextAttackTick: number;
  /** Null for summons, which have no ability. */
  readonly ability: AbilityDef | null;
  /** Ability values scale with it (section 10.2). */
  readonly cost: Cost;
  /** The unit gains no mana before this tick (section 9.1). */
  castingUntil: number;
  /** Empty for summons and monsters. */
  readonly classes: readonly ClassId[];
  /** Treebeard, Sauron and the big monsters (design.md section 4). */
  readonly large: boolean;
  /** Bonuses from traits and items that hold for the whole fight (sections 12.3 and 12.4). */
  readonly staticBonus: Partial<StatModifiers>;
  /** The effects of the unit's items, in the order it holds them. */
  readonly effects: readonly ItemEffectState[];
  /** The same effects grouped by kind, each group in holding order, for `effectsOf`. */
  readonly effectsByKind: EffectsByKind;
  /** The Nazgûl slow on this unit, updated at the start of each tick. */
  auraSlowPct: number;
  /** The Phial of Galadriel's Magic Resist reduction on this unit, updated with the Nazgûl slow. */
  auraShredPct: number;
  /** Narya's Attack Speed on this unit, updated with the Nazgûl slow. */
  auraHastePct: number;
  /** Wears a Ring of the Nine, so it is a Nazgûl as well as its own origin (section 12.7). */
  readonly wraith: boolean;
  /** Attack Speed stacks from the Archer trait. */
  archerStacks: number;
  /** The level the Ring's drawbacks use on its bearer: its Corruption, less Sam's relief (section 12.6). */
  readonly drawback: number;
  /** Betrayal: the bearer attacks its own team before this tick. */
  readonly betrayUntil: number;
  /** The Eye's Nazgûl targets the Ring's bearer while it lives, even while untargetable. */
  hunts: Unit | null;
};

type EffectsByKind = { readonly [K in ItemEffect['kind']]?: readonly ItemEffectState<Extract<ItemEffect, { kind: K }>>[] };

/** What a team brings to a fight besides its units (sections 12.2 and 12.5). */
export interface TeamSetup {
  readonly traits: TraitLevels;
  /** The fight effects of the team's Gifts. */
  readonly gifts: readonly GiftCombat[];
  /** Extra starting mana from the team's Gifts. */
  readonly giftMana: number;
}

/** What a unit brings to its team's trait counts: what it is and the items it holds. */
export interface TraitHolder {
  readonly unitId: FighterId;
  readonly items: readonly ItemId[];
}

/**
 * How many count towards each of a team's traits, as its fights count them (section 12.2): its
 * distinct units, the Nazgûl a Ring of the Nine makes, and its crest Gifts. Monsters have no
 * traits. `teamSetup` takes its traits from here, and the client's trait tracker shows them.
 */
export function teamTraitCounts(units: readonly TraitHolder[], giftIds: readonly GiftId[]): TraitCounts {
  const crests = giftIds.flatMap((id) => GIFTS[id].combat?.crest ?? []);
  const unitIds = units.map((u) => u.unitId).filter(isUnitId);
  const nine = units.flatMap((u) => (isUnitId(u.unitId) && wearsNine(u.items) ? [{ unitId: u.unitId, trait: 'nazgul' as const }] : []));
  return traitCounts(unitIds, crests, nine);
}

/** A team's active traits, counting crest Gifts and the Nine's Nazgûl, and its Gifts' fight effects. Monsters have no traits. */
export function teamSetup(placements: readonly PlacedUnit[], giftIds: readonly GiftId[]): TeamSetup {
  const gifts = giftIds.flatMap((id) => GIFTS[id].combat ?? []);
  return {
    traits: traitLevelsOf(teamTraitCounts(placements, giftIds)),
    gifts,
    giftMana: gifts.reduce((mana, g) => mana + (g.startMana ?? 0), 0),
  };
}

/** A team's damage amp from its Gifts, counting the distinct origins among its starting units (section 12.5). */
export function giftAmpPct(gifts: readonly GiftCombat[], units: readonly Unit[]): number {
  const origins = new Set(units.flatMap(originsOf)).size;
  return gifts.reduce((pct, g) => pct + (g.damageAmpPct ?? 0) + (g.damageAmpPctPerOrigin ?? 0) * origins, 0);
}

/** Where a starting unit goes into the fight. */
export interface Arrival {
  readonly id: number;
  readonly team: Team;
  readonly slot: number;
  /** Monsters get stronger in later stages. */
  readonly stage: number;
  readonly setup: TeamSetup;
  /** Every placement of the unit's team, for Sam's relief. */
  readonly placements: readonly PlacedUnit[];
}

/**
 * A starting unit or monster (section 6.2, steps 1 and 2): its stats with its static trait, item
 * and Gift bonuses, the Gondor front-row bonus and Gift mana, and on the One Ring's bearer the
 * Burden and Betrayal from its Corruption, less Sam's relief (section 12.6).
 */
export function createUnit(p: PlacedUnit, { id, team, slot, stage, setup, placements }: Arrival): Unit {
  const fighter = isUnitId(p.unitId)
    ? unitFighter(UNITS[p.unitId], p.star, setup.traits, p.row === HALF_ROWS - 1, p.items)
    : monsterFighter(p.unitId, stage);
  const { base } = fighter;
  const ring = p.ring ?? null;
  const drawback = ring === null ? 0 : ring - (samNextTo(placements, p) ? RING.samRelief : 0);
  let staticBonus = combineModifiers(fighter.staticBonus, giftModifiers(setup.gifts, p.row));
  // Burden: the bearer loses a share of its max Health, after every other bonus.
  if (ring !== null && drawback >= RING.burden.from) {
    const pct = RING.burden.healthPctPerPoint * (drawback - RING.burden.from + 1);
    const lost = Math.round((finalStats(base, staticBonus).maxHealth * pct) / 100);
    staticBonus = combineModifiers(staticBonus, { health: -lost });
  }
  const stats = finalStats(base, staticBonus);
  const effects = itemEffects(p.items, fighter.origin).map(({ effect, pct }) => ({ effect, pct, uses: 0 }));
  return {
    ...startOfFight(),
    id,
    unitId: p.unitId,
    team,
    origin: fighter.origin,
    star: p.star,
    summon: false,
    slot,
    hex: fromPlacement(team, p),
    health: stats.maxHealth,
    mana: Math.min(base.startMana + setup.giftMana, base.maxMana),
    base,
    stats,
    targetsFarthest: setup.traits.burglar !== undefined && fighter.classes.includes('burglar'),
    ability: fighter.ability,
    cost: fighter.cost,
    classes: fighter.classes,
    large: fighter.large,
    staticBonus,
    items: [...p.items],
    effects,
    effectsByKind: byKind(effects),
    wraith: wearsNine(p.items),
    ring,
    drawback,
    betrayUntil: ring !== null && drawback >= RING.betrayal.at ? 1 + toTicks(RING.betrayal.seconds) : 0,
  };
}

/** A summon: no ability, items, traits or bonuses (sections 7.5 and 12.6). */
export function createSummon(id: number, team: Team, slot: number, unitId: SummonId, hex: Hex, base: BaseStats): Unit {
  return {
    ...startOfFight(),
    id,
    unitId,
    team,
    origin: SUMMONS[unitId].origin,
    star: 1,
    summon: true,
    slot,
    hex,
    health: base.maxHealth,
    mana: 0,
    base,
    stats: finalStats(base, {}),
    targetsFarthest: false,
    ability: null,
    cost: 1,
    classes: [],
    large: false,
    staticBonus: {},
    items: [],
    effects: [],
    effectsByKind: {},
    wraith: false,
    ring: null,
    drawback: 0,
    betrayUntil: 0,
  };
}

/** What every unit starts a fight with, whatever it is. */
function startOfFight() {
  return {
    target: null,
    alive: true,
    statuses: new Statuses(),
    busyUntil: 0,
    nextAttackTick: 1,
    castingUntil: 0,
    auraSlowPct: 0,
    auraShredPct: 0,
    auraHastePct: 0,
    archerStacks: 0,
    hunts: null,
  };
}

const NO_EFFECTS: readonly never[] = [];

/** A unit's item effects of one kind, in the order it holds them. It runs on every hit, so it allocates nothing. */
export function effectsOf<K extends ItemEffect['kind']>(unit: Unit, kind: K): readonly ItemEffectState<Extract<ItemEffect, { kind: K }>>[] {
  return unit.effectsByKind[kind] ?? NO_EFFECTS;
}

function byKind(effects: readonly ItemEffectState[]): EffectsByKind {
  const groups: { [K in ItemEffect['kind']]?: ItemEffectState[] } = {};
  for (const state of effects) (groups[state.effect.kind] ??= []).push(state);
  return groups as EffectsByKind;
}

export function isUnitId(id: FighterId | SummonId): id is UnitId {
  return Object.hasOwn(UNITS, id);
}

export function isSummonId(id: FighterId | SummonId): id is SummonId {
  return Object.hasOwn(SUMMONS, id);
}

/** A unit's origins: its own, and Nazgûl from a Ring of the Nine (section 12.7). Monsters have none. */
export function originsOf(unit: Unit): OriginId[] {
  return [...(unit.origin === null ? [] : [unit.origin]), ...(unit.wraith ? (['nazgul'] as const) : [])];
}

/** Whether a unit has an origin, as its own or from a Ring of the Nine, the same as `originsOf` but without making a list: it runs on hits. */
export function hasOrigin(unit: Unit, origin: OriginId): boolean {
  return unit.origin === origin || (origin === 'nazgul' && unit.wraith);
}

export function isNazgul(unit: Unit): boolean {
  return hasOrigin(unit, 'nazgul');
}

/** What a starting unit or monster brings to the fight, before statuses. */
interface Fighter {
  readonly base: BaseStats;
  readonly staticBonus: Partial<StatModifiers>;
  readonly origin: OriginId | null;
  readonly classes: readonly ClassId[];
  readonly ability: AbilityDef | null;
  readonly cost: Cost;
  readonly large: boolean;
}

function unitFighter(def: UnitDef, star: Star, levels: TraitLevels, inFrontRow: boolean, items: readonly ItemId[]): Fighter {
  return {
    base: baseStats(def, star),
    staticBonus: combineModifiers(traitModifiers(def, levels, inFrontRow), itemModifiers(items)),
    origin: def.origin,
    classes: def.classes,
    ability: def.ability,
    cost: def.cost,
    large: def.large === true,
  };
}

/** Monsters have no traits (game-spec.md section 9.8). */
function monsterFighter(id: MonsterId, stage: number): Fighter {
  const def = MONSTERS[id];
  return {
    base: monsterStats(def, stage),
    staticBonus: {},
    origin: null,
    classes: [],
    ability: def.ability ?? null,
    cost: def.cost,
    large: def.large === true,
  };
}

/** The stats a team's Gifts give a unit placed in `row`, in the team's own perspective (section 12.5). */
function giftModifiers(gifts: readonly GiftCombat[], row: number): Partial<StatModifiers> {
  const applies = ({ who }: GiftCombat) => who === undefined || who === 'all' || row === (who === 'front' ? HALF_ROWS - 1 : 0);
  return combineModifiers(...gifts.flatMap((g) => (g.stats !== undefined && applies(g) ? [g.stats] : [])));
}

/** Whether a unit's items include a Ring of the Nine. */
function wearsNine(items: readonly ItemId[]): boolean {
  return items.some((id) => ITEMS[id].effect?.kind === 'nazgul');
}

/** Whether a unit is placed next to Sam on its own team. */
function samNextTo(placements: readonly PlacedUnit[], p: PlacedUnit): boolean {
  return placements.some((q) => q.unitId === 'sam' && q !== p && distance(fromPlacement('A', q), fromPlacement('A', p)) === 1);
}
