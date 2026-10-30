// How much the rules change damage and stats at a moment of the fight (docs/sim-spec.md sections
// 9.1 and 12.3 to 12.7): damage amps and reductions, crit immunity, the auras around units, and
// the One Ring's grip on its bearer. Pure queries over the units; the fight applies them.

import { RING } from '../data/ring.js';
import { distance, type Hex } from '../hex.js';
import type { Team } from '../types.js';
import { effectsOf, isNazgul, type Unit } from './fighters.js';
import { activeTrait, type TraitLevels } from './traits.js';

/** What a source's damage amp depends on beyond the source and the target. */
export interface AmpContext {
  /** The source team's active traits. */
  readonly traits: TraitLevels;
  /** The source team's damage amp from its Gifts. */
  readonly giftAmpPct: number;
  /** The One Ring's Corruption while a player holds it, for the Nine; 0 otherwise. */
  readonly oneRingCorruption: number;
  /** Every unit in the fight, for the Captain's neighbours. */
  readonly units: readonly Unit[];
}

/**
 * The sum of the damage amps on a source against a target (section 9.1): Captain, Dark Lord and
 * Dwarf traits, Black Arrows, Gifts, the One Ring's Corruption on its bearer, and the Nine.
 */
export function damageAmpPct(source: Unit, target: Unit, { traits, giftAmpPct, oneRingCorruption, units }: AmpContext): number {
  const captain = activeTrait(traits, 'captain');
  const darkLord = activeTrait(traits, 'dark-lord');
  const dwarf = activeTrait(traits, 'dwarf');
  const nextToCaptain =
    captain !== undefined &&
    units.some((u) => u.alive && u.team === source.team && u !== source && u.classes.includes('captain') && distance(u.hex, source.hex) === 1);
  const blackArrows = effectsOf(source, 'ampVsHealthier').reduce(
    (pct, { effect }) => pct + (target.stats.maxHealth > source.stats.maxHealth ? effect.pct : 0),
    0,
  );
  // The Nine grow with the One Ring's Corruption.
  const ninePct = effectsOf(source, 'nazgul').reduce((pct, { effect }) => pct + effect.damagePctPerCorruption * oneRingCorruption, 0);
  return (
    (nextToCaptain ? captain.damageAmpPct : 0) +
    (darkLord !== undefined && (source.origin === 'orc' || isNazgul(source)) ? darkLord.damageAmpPct : 0) +
    (dwarf !== undefined && source.origin === 'dwarf' && target.large ? dwarf.damageVsLargePct : 0) +
    blackArrows +
    giftAmpPct +
    (source.ring ?? 0) * RING.damagePctPerCorruption +
    ninePct
  );
}

/** The target's damage reductions against this source, which add up (section 9.1): the Witch-king's passive and Mithril Shirts. */
export function damageReductionPct(source: Unit, target: Unit): number {
  const passive = target.ability?.passive;
  const exempt = passive !== undefined && (passive.exceptUnits as readonly string[]).includes(source.unitId);
  const fromPassive = passive !== undefined && source.origin !== null && passive.fromOrigins.includes(source.origin) && !exempt ? passive.pct : 0;
  const fromItems = effectsOf(target, 'damageReduction').reduce((pct, { effect }) => pct + effect.pct, 0);
  return Math.min(100, fromPassive + fromItems);
}

/** Crits against a Mithril Shirt holder deal normal damage. */
export function isCritImmune(unit: Unit): boolean {
  return effectsOf(unit, 'damageReduction').some(({ effect }) => effect.critImmune);
}

/** "Mine!": the Ring's bearer at the Grip level takes no heals or shields from others (section 12.6). */
export function isGripped(unit: Unit): boolean {
  return unit.ring !== null && unit.drawback >= RING.gripFrom;
}

/** The auras on a unit: the Nazgûl slow and the Phial's Magic Resist reduction from enemies, and Narya's Attack Speed from allies. */
export interface Auras {
  readonly slowPct: number;
  readonly shredPct: number;
  readonly hastePct: number;
}

const NO_AURAS: Auras = { slowPct: 0, shredPct: 0, hastePct: 0 };

const noAuras = (): Auras => NO_AURAS;

/** An aura item's reach and strength. */
interface AuraSource {
  readonly hex: Hex;
  readonly radius: number;
  readonly pct: number;
}

/** What a team's living units spread around them. */
interface TeamAuras {
  /** The Nazgûl slow while the team's trait is active, from the hexes of its living Nazgûl. */
  readonly slow: { readonly pct: number; readonly radius: number; readonly from: readonly Hex[] } | null;
  readonly phials: readonly AuraSource[];
  readonly naryas: readonly AuraSource[];
}

/**
 * The auras around the living units (sections 12.3, 12.4 and 12.7): the Nazgûl slow on enemies
 * within reach of a living Nazgûl, while its team's trait is active; the strongest Phial of
 * Galadriel on enemies within its reach; and the strongest Narya on allies within its reach, the
 * holder included. Returns the auras on a unit. It runs every tick, so a fight with no auras
 * allocates nothing.
 */
export function auraField(living: readonly Unit[], traits: { readonly [T in Team]: TraitLevels }): (unit: Unit) => Auras {
  const A = teamAuras(living, 'A', traits.A);
  const B = teamAuras(living, 'B', traits.B);
  if (A === null && B === null) return noAuras;
  return (unit) => {
    const allies = unit.team === 'A' ? A : B;
    const enemies = unit.team === 'A' ? B : A;
    if (allies === null && enemies === null) return NO_AURAS;
    return {
      slowPct: enemies?.slow != null && enemies.slow.from.some((hex) => distance(hex, unit.hex) <= enemies.slow!.radius) ? enemies.slow.pct : 0,
      shredPct: strongest(enemies?.phials, unit),
      hastePct: strongest(allies?.naryas, unit),
    };
  };
}

/** A team's aura sources, in one pass over the living units, or null if it spreads none. */
function teamAuras(living: readonly Unit[], team: Team, traits: TraitLevels): TeamAuras | null {
  const nazgul = activeTrait(traits, 'nazgul');
  const wraiths: Hex[] = [];
  const phials: AuraSource[] = [];
  const naryas: AuraSource[] = [];
  for (const u of living) {
    if (u.team !== team) continue;
    if (nazgul !== undefined && isNazgul(u)) wraiths.push(u.hex);
    for (const { effect, pct } of effectsOf(u, 'magicResistAura')) phials.push({ hex: u.hex, radius: effect.radius, pct: (effect.pct * pct) / 100 });
    for (const { effect, pct } of effectsOf(u, 'attackSpeedAura')) naryas.push({ hex: u.hex, radius: effect.radius, pct: (effect.pct * pct) / 100 });
  }
  if (wraiths.length === 0 && phials.length === 0 && naryas.length === 0) return null;
  return { slow: nazgul === undefined ? null : { pct: nazgul.slowPct, radius: nazgul.radius, from: wraiths }, phials, naryas };
}

/** The strongest of the auras that reach a unit, or 0. */
function strongest(sources: readonly AuraSource[] | undefined, unit: Unit): number {
  let max = 0;
  for (const a of sources ?? []) if (distance(a.hex, unit.hex) <= a.radius) max = Math.max(max, a.pct);
  return max;
}
