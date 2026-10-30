// Unit info cards on the play page (docs/game-spec.md section 12): a unit's stats, and its
// ability's text built from the ability data, like item and Gift text, so the numbers shown are
// always the sim's. No Three.js or DOM, so it can be tested.

import {
  ABILITIES,
  ITEMS,
  MONSTERS,
  SUMMONS,
  TRAITS,
  UNITS,
  abilityValue,
  baseStats,
  boardPlace,
  startingStats,
  type AbilityDef,
  type AbilityStep,
  type BaseStats,
  type BuffStat,
  type Cost,
  type Effect,
  type GiftId,
  type ItemId,
  type MonsterId,
  type OwnedUnit,
  type PlacedUnit,
  type Selector,
  type Star,
  type Stats,
  type TraitId,
  type UnitId,
  type UnitState,
} from '@lotr-tactics/sim';
import type { PlanningRing } from './flow.js';
import { bonus } from './items.js';
import { displayName } from './units.js';

type Id = UnitState['unitId'];

/** A unit's numbers: in a fight, as it would start one, or its base stats at its star. */
export interface UnitNumbers {
  readonly base: BaseStats;
  readonly stats: Stats;
  readonly mana: number;
  /** Current Health, in a fight. */
  readonly health?: number;
}

export interface StatLine {
  readonly name: string;
  readonly value: string;
  /** Above or below the unit's base stat. */
  readonly change: 'bonus' | 'penalty' | null;
}

export interface AbilityInfo {
  readonly name: string;
  /** Mana to cast it. */
  readonly mana: number;
  /** A sentence for each step, then any passive. */
  readonly lines: readonly string[];
}

export interface UnitInfo {
  readonly name: string;
  /** Stars for units; monsters and summons have none. */
  readonly stars: string;
  /** Null for monsters and summons. */
  readonly cost: Cost | null;
  /** Origin and classes, a Ring of the Nine's Nazgûl included, or what kind of fighter it is. */
  readonly traits: string;
  readonly stats: readonly StatLine[];
  /** Null for summons, and for monsters without one. */
  readonly ability: AbilityInfo | null;
}

function isUnit(id: Id): id is UnitId {
  return Object.hasOwn(UNITS, id);
}

/** A unit's base stats at its star, as on the bench, in the shop or in a Council. */
export function baseNumbers(unitId: UnitId, star: Star): UnitNumbers {
  const base = baseStats(UNITS[unitId], star);
  return { base, stats: base, mana: base.startMana };
}

/** A board as a fight places it: each unit at its place, and the One Ring's Corruption on its bearer. */
export function boardPlacements(board: readonly (OwnedUnit | null)[], ring: PlanningRing | null): PlacedUnit[] {
  return board.flatMap((unit, slot) => (unit === null ? [] : [placedAt(unit, slot, ring)]));
}

function placedAt(unit: OwnedUnit, slot: number, ring: PlanningRing | null): PlacedUnit {
  const place = { unitId: unit.unitId, star: unit.star, ...boardPlace(slot), items: unit.items };
  return ring !== null && ring.bearer === unit.id ? { ...place, ring: ring.corruption } : place;
}

/**
 * An owned unit's numbers: on the board, the ones it would start a fight with there, with its
 * player's Gifts (the sim's `startingStats`); on the bench, its base stats.
 */
export function ownedNumbers(board: readonly (OwnedUnit | null)[], unit: OwnedUnit, gifts: readonly GiftId[], ring: PlanningRing | null): UnitNumbers {
  const slot = board.findIndex((u) => u?.id === unit.id);
  if (slot < 0) return baseNumbers(unit.unitId, unit.star);
  return startingStats(placedAt(unit, slot, ring), boardPlacements(board, ring), gifts);
}

/** A unit's origin and classes, with the Nazgûl a Ring of the Nine makes it, such as "Gondor · Captain · Nazgûl". */
export function traitNames(unitId: UnitId, items: readonly ItemId[] = []): string {
  const def = UNITS[unitId];
  const traits: TraitId[] = [def.origin, ...def.classes];
  if (items.some((id) => ITEMS[id].effect?.kind === 'nazgul') && !traits.includes('nazgul')) traits.push('nazgul');
  return traits.map((t) => TRAITS[t].name).join(' · ');
}

/** What a unit, monster or summon is, and its stats and ability, for its info card. */
export function unitInfo(unitId: Id, star: Star, items: readonly ItemId[], numbers: UnitNumbers): UnitInfo {
  const unit = isUnit(unitId) ? UNITS[unitId] : null;
  const monster = Object.hasOwn(MONSTERS, unitId) ? MONSTERS[unitId as MonsterId] : null;
  const ability = unit?.ability ?? monster?.ability ?? null;
  const cost = unit?.cost ?? monster?.cost ?? 1;
  return {
    name: displayName(unitId),
    stars: unit === null ? '' : '★'.repeat(star),
    cost: unit?.cost ?? null,
    traits: unit !== null ? traitNames(unit.id, items) : monster !== null ? 'Monster' : 'Summon',
    stats: statLines(numbers),
    ability:
      ability === null
        ? null
        : { name: ability.name, mana: numbers.base.maxMana, lines: abilityLines(ability, cost, star, numbers.stats.abilityPower) },
  };
}

const round = (n: number) => String(Math.round(n));

function statLines({ base, stats, mana, health }: UnitNumbers): StatLine[] {
  const line = (name: string, value: string, now: number, was: number): StatLine => ({
    name,
    value,
    change: now > was + 1e-6 ? 'bonus' : now < was - 1e-6 ? 'penalty' : null,
  });
  return [
    line('Health', health === undefined ? round(stats.maxHealth) : `${round(health)} / ${round(stats.maxHealth)}`, stats.maxHealth, base.maxHealth),
    // In a fight mana moves all the time; before one, Gifts can raise what a unit starts with.
    base.maxMana > 0 ? line('Mana', `${round(mana)} / ${base.maxMana}`, health === undefined ? mana : 0, health === undefined ? base.startMana : 0) : line('Mana', '—', 0, 0),
    line('Attack Damage', round(stats.attackDamage), stats.attackDamage, base.attackDamage),
    line('Attack Speed', stats.attackSpeed.toFixed(2), stats.attackSpeed, base.attackSpeed),
    line('Armor', round(stats.armor), stats.armor, base.armor),
    line('Magic Resist', round(stats.magicResist), stats.magicResist, base.magicResist),
    line('Ability Power', round(stats.abilityPower), stats.abilityPower, base.abilityPower),
    line('Crit Chance', `${round(stats.critChancePct)}%`, stats.critChancePct, base.critChancePct),
    line('Crit Damage', `${round(stats.critDamagePct)}%`, stats.critDamagePct, base.critDamagePct),
    line('Dodge', `${round(stats.dodgePct)}%`, stats.dodgePct, base.dodgePct),
    line('Range', String(stats.range), stats.range, base.range),
  ];
}

// Ability text

interface Scale {
  readonly cost: Cost;
  readonly star: Star;
  readonly abilityPower: number;
}

/** An ability as sentences: one for each step, with its values at a star and Ability Power, then any passive. */
export function abilityLines(ability: AbilityDef, cost: Cost, star: Star, abilityPower: number): string[] {
  const scale = { cost, star, abilityPower };
  const lines = ability.steps.flatMap((step) => stepLines(step, scale));
  const passive = ability.passive;
  if (passive !== undefined) {
    const from = passive.fromOrigins.map((o) => TRAITS[o].name).join(' and ');
    const except = passive.exceptUnits.map((id) => UNITS[id].name);
    lines.push(`Passive: takes ${passive.pct}% less damage from ${from} units${except.length > 0 ? `, except ${list(except)}` : ''}.`);
  }
  return lines;
}

function stepLines(step: AbilityStep, scale: Scale): string[] {
  if ('delaySeconds' in step) {
    return step.steps.flatMap((s) => stepLines(s, scale)).map((line, i) => (i === 0 ? `After ${seconds(step.delaySeconds)}, ${lowerFirst(line)}` : line));
  }
  return [sentence(step.select, step.effects, scale)];
}

/** A selector's units as words, and whether that is a single unit. */
function picked(select: Selector): { readonly name: string; readonly one: boolean } {
  switch (select.kind) {
    case 'self':
      return { name: 'itself', one: true };
    case 'target':
      return { name: 'its target', one: true };
    case 'farthestEnemy':
      return { name: 'the farthest enemy', one: true };
    case 'lowestHealthEnemy':
      return { name: 'the enemy with the lowest Health', one: true };
    case 'highestHealthEnemy':
      return { name: 'the enemy with the most Health', one: true };
    case 'nearestAlly':
      return { name: 'the nearest ally', one: true };
    case 'nearestEnemies':
      return select.count === 1 ? { name: 'the nearest enemy', one: true } : { name: `the ${select.count} nearest enemies`, one: false };
    case 'lowestHealthPctAllies':
      return select.count === 1
        ? { name: 'the ally with the lowest Health %', one: true }
        : { name: `the ${select.count} allies with the lowest Health %`, one: false };
    case 'allAllies':
      return { name: 'all allies', one: false };
    case 'alliesWithin':
      return { name: `${select.origin === undefined ? '' : `${TRAITS[select.origin].name} `}allies within ${hexes(select.radius)}`, one: false };
    case 'adjacentAllies':
      return { name: 'adjacent allies', one: false };
    case 'adjacentEnemies':
      return { name: 'adjacent enemies', one: false };
    case 'enemiesWithin':
      return { name: `enemies within ${hexes(select.radius)}`, one: false };
    case 'area': {
      if (select.around.kind === 'bestClusterHex') {
        return {
          name: select.radius === 1 ? 'the biggest cluster of enemies (a hex and its neighbours)' : `enemies within ${hexes(select.radius)} of the hex with the most enemies near it`,
          one: false,
        };
      }
      const around = picked(select.around).name;
      return { name: select.radius === 1 ? `${around} and the enemies next to it` : `enemies within ${hexes(select.radius)} of ${around}`, one: false };
    }
    case 'line':
      return {
        name: select.length === 'edge' ? 'every enemy in a line through its target, up to the board edge' : `every enemy in a ${select.length}-hex line through its target`,
        one: false,
      };
    case 'cone':
      return { name: 'every enemy in a cone towards its target', one: false };
    case 'bounce':
      return { name: `its target and up to ${select.count - 1} more ${select.count === 2 ? 'enemy' : 'enemies'}, each within ${hexes(select.jump)} of the last`, one: false };
  }
}

/** Consecutive buffs that last as long, merged so they read as one: "+25 Armor and +25 Magic Resist for 5s". */
type Phrase = Exclude<Effect, { kind: 'buff' }> | { readonly kind: 'buffs'; readonly buffs: readonly { stat: BuffStat; amount: number }[]; readonly seconds: number };

function phrases(effects: readonly Effect[]): Phrase[] {
  const out: Phrase[] = [];
  for (const effect of effects) {
    const last = out.at(-1);
    if (effect.kind !== 'buff') out.push(effect);
    else if (last?.kind === 'buffs' && last.seconds === effect.seconds) out[out.length - 1] = { ...last, buffs: [...last.buffs, effect] };
    else out.push({ kind: 'buffs', buffs: [effect], seconds: effect.seconds });
  }
  return out;
}

/** One step: its effects as clauses with a shared subject, the units named once and then as "it" or "them". */
function sentence(select: Selector, effects: readonly Effect[], scale: Scale): string {
  const { name, one } = picked(select);
  const self = select.kind === 'self';
  let named = false;
  const them = () => {
    if (named) return one ? 'it' : 'them';
    named = true;
    return name;
  };
  const theirs = (what: string) => {
    if (named) return `${one ? 'its' : 'their'} ${what}`;
    named = true;
    return `the ${what} of ${name}`;
  };
  const value = (base: 'D' | 'S' | 'H', pct: number) => round(abilityValue(base, pct, scale.cost, scale.star, scale.abilityPower));

  const clauses: { verb: string; rest: string }[] = phrases(effects).map((p) => {
    switch (p.kind) {
      case 'damage': {
        const amount = `${p.hits !== undefined && p.hits > 1 ? `${p.hits} × ` : ''}${value('D', p.pct)} ${p.type} damage`;
        const vs = p.bonusVs === undefined ? '' : `, ${times(p.bonusVs.multiplierPct)} against ${TRAITS[p.bonusVs.origin].name}`;
        return { verb: 'deals', rest: `${amount} to ${them()}${vs}${p.canCrit === true ? `; ${p.hits !== undefined && p.hits > 1 ? 'each hit' : 'it'} can crit` : ''}` };
      }
      case 'stun':
        return { verb: 'stuns', rest: `${them()} for ${seconds(p.seconds)}` };
      case 'slow':
        return { verb: 'makes', rest: `${them()} attack ${p.pct}% slower for ${seconds(p.seconds)}` };
      case 'reduce':
        return { verb: 'lowers', rest: `${theirs(p.stats.map((s) => (s === 'armor' ? 'Armor' : 'Magic Resist')).join(' and '))} by ${p.pct}% for ${seconds(p.seconds)}` };
      case 'shield': {
        const shield = `a ${value('S', p.pct)} shield for ${seconds(p.seconds ?? ABILITIES.shieldSeconds)}`;
        return self ? { verb: 'gains', rest: shield } : { verb: `gives ${them()}`, rest: shield };
      }
      case 'heal':
        return { verb: 'heals', rest: `${them()} for ${value('H', p.pct)}` };
      case 'healFromDamage':
        return { verb: 'heals', rest: `for ${p.pct}% of the damage dealt` };
      case 'buffs': {
        const buffs = `${list(p.buffs.map((b) => bonus(b.stat, b.amount)))} for ${seconds(p.seconds)}`;
        return self ? { verb: 'gains', rest: buffs } : { verb: `gives ${them()}`, rest: buffs };
      }
      case 'untargetable':
        return self ? { verb: 'becomes', rest: `untargetable for ${seconds(p.seconds)}` } : { verb: 'makes', rest: `${them()} untargetable for ${seconds(p.seconds)}` };
      case 'stunImmune':
        return self ? { verb: "can't", rest: `be stunned for ${seconds(p.seconds)}` } : { verb: 'makes', rest: `${them()} immune to stuns for ${seconds(p.seconds)}` };
      case 'dashAdjacentTo':
        return { verb: 'dashes', rest: `next to ${them()}` };
      case 'dashThroughLine':
        return { verb: 'rides', rest: 'through the line' };
      case 'summon':
        return { verb: 'summons', rest: `${p.count} ${SUMMONS[p.unit].name}${p.count === 1 ? '' : 's'}` };
    }
  });

  // "Gains a shield and +30 Armor": the same verb isn't said twice in a row.
  const merged: { verb: string; rests: string[] }[] = [];
  for (const { verb, rest } of clauses) {
    const last = merged.at(-1);
    if (last?.verb === verb) last.rests.push(rest);
    else merged.push({ verb, rests: [rest] });
  }
  return `${upperFirst(list(merged.map((c) => `${c.verb} ${list(c.rests)}`)))}.`;
}

function seconds(s: number): string {
  return `${s}s`;
}

function hexes(n: number): string {
  return n === 1 ? '1 hex' : `${n} hexes`;
}

function times(pct: number): string {
  return pct === 200 ? 'double' : pct === 300 ? 'triple' : `${pct}%`;
}

/** "a", "a and b", or "a, b and c"; with a comma before the last "and" when an earlier part has one. */
function list(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  const head = parts.slice(0, -1);
  const comma = parts.length > 2 || head.some((p) => p.includes(' and ')) ? ',' : '';
  return `${head.join(', ')}${comma} and ${parts.at(-1)}`;
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
