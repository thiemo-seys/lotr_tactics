// What the client's tooltips say (docs/game-spec.md section 12, docs/viewer-spec.md section 4):
// cards for items, the One Ring, Rings of Power, Gifts, traits, units and actions, laid out in
// parts and built from the data through items.ts, gifts.ts, ring.ts and traits.ts, so the numbers
// shown are always the sim's. No Three.js or DOM, so it can be tested.

import {
  GIFTS,
  ITEMS,
  MONSTERS,
  UNITS,
  baseStats,
  finalStats,
  itemModifiers,
  type AbilityDef,
  type BaseStats,
  type ComponentId,
  type GiftId,
  type ItemId,
  type OwnedUnit,
  type Stats,
  type TraitId,
  type UnitId,
  type UnitState,
} from '@lotr-tactics/sim';
import { describeAbility, type Caster } from './abilities.js';
import { TIER_NAMES, giftEffects } from './gifts.js';
import { GIFT_TIER_ICONS, type IconName } from './icons.js';
import { itemInfo } from './items.js';
import { ringInfo } from './ring.js';
import { traitInfo, type TraitTone } from './traits.js';

/** What a tooltip's header shows next to its title. */
export type TipIcon =
  | { readonly kind: 'icon'; readonly name: IconName }
  | { readonly kind: 'item'; readonly id: ItemId }
  | { readonly kind: 'ring'; readonly corruption: number }
  | { readonly kind: 'trait'; readonly trait: TraitId; readonly tone: TraitTone | null };

export interface TipLine {
  readonly text: string;
  /** A drawback reads as bad news. */
  readonly bad?: boolean;
}

export interface Tip {
  readonly icon?: TipIcon;
  readonly title: string;
  readonly subtitle?: string;
  /** A class that colours the card's accent: `cost-N`, a Gift tier, a trait tone or a ring tier. */
  readonly tone?: string;
  /** A combined item's two components. */
  readonly recipe?: readonly ComponentId[];
  readonly stats?: readonly string[];
  readonly body?: readonly TipLine[];
  /** A trait's breakpoints, with the active one marked. */
  readonly levels?: readonly { readonly count: number; readonly text: string; readonly active: boolean }[];
  /** A unit's traits. */
  readonly traits?: readonly TraitId[];
  /** A unit's ability: its name, the mana it costs, and what it does. */
  readonly ability?: { readonly name: string; readonly mana: string | null; readonly lines: readonly string[] };
  /** A keyboard shortcut. */
  readonly key?: string;
  /** A hint on how to use the thing, or the reason it can't be used now. */
  readonly note?: { readonly text: string; readonly reason: boolean };
}

export function itemTip(id: ItemId, hint?: string): Tip {
  const info = itemInfo(id);
  return {
    icon: { kind: 'item', id },
    title: info.name,
    subtitle: info.kindText,
    tone: info.kind === 'ring-of-power' ? 'ring-of-power' : info.kind,
    ...(info.recipe === null ? {} : { recipe: info.recipe }),
    stats: info.stats,
    body: [...(info.effect === null ? [] : [{ text: info.effect }]), ...(info.kin === null ? [] : [{ text: info.kin }])],
    ...(hint === undefined ? {} : { note: { text: hint, reason: false } }),
  };
}

export function ringTip(corruption: number, hint?: string): Tip {
  const info = ringInfo(corruption);
  return {
    icon: { kind: 'ring', corruption },
    title: 'The One Ring',
    subtitle: `Corruption ${corruption} · ${info.tier}`,
    tone: `ring-${info.tier.toLowerCase()}`,
    body: [...info.effects.map((e) => ({ text: e.text, bad: e.drawback })), { text: info.note }],
    ...(hint === undefined ? {} : { note: { text: hint, reason: false } }),
  };
}

export function giftTip(id: GiftId): Tip {
  const { name, tier } = GIFTS[id];
  return {
    icon: { kind: 'icon', name: GIFT_TIER_ICONS[tier] },
    title: name,
    subtitle: `${TIER_NAMES[tier]} Gift of Lothlórien`,
    tone: `tier-${tier}`,
    body: giftEffects(id).map((text) => ({ text })),
  };
}

/** A trait, and how many of a player's units count towards it if it is on their board: the person's, or `owner`'s. */
export function traitTip(
  trait: TraitId,
  counted?: { readonly count: number; readonly level: number | null; readonly tone: TraitTone | null },
  owner: string | null = null,
): Tip {
  const info = traitInfo(trait);
  return {
    icon: { kind: 'trait', trait, tone: counted?.tone ?? null },
    title: info.name,
    subtitle: counted === undefined ? info.kind : `${info.kind} · ${counted.count} on ${owner === null ? 'your' : `${owner}'s`} board`,
    ...(counted === undefined || counted.tone === null ? {} : { tone: `trait-${counted.tone}` }),
    body: info.rule === null ? [] : [{ text: info.rule }],
    levels: info.levels.map((l, i) => ({ count: l.count, text: l.text, active: counted?.level === i })),
  };
}

/** A unit as the shop and the Council offer it: its cost, traits, 1★ stats and what its ability does at 1★. */
export function unitTip(id: UnitId, note?: Tip['note']): Tip {
  const def = UNITS[id];
  const stats = baseStats(def, 1);
  return {
    title: def.name,
    subtitle: `${def.cost}-cost unit`,
    tone: `cost-${def.cost}`,
    traits: [def.origin, ...def.classes],
    stats: statLines(stats),
    ability: abilityOf(def.ability, { cost: def.cost, star: 1, abilityPower: stats.abilityPower }, stats),
    ...(note === undefined ? {} : { note }),
  };
}

/**
 * One of a player's units on the bench or the board: its stats at its star level with its items,
 * before traits, and what its ability does at that level. `ring` is the One Ring's Corruption on its bearer.
 */
export function ownedUnitTip(unit: OwnedUnit, ring: number | null = null): Tip {
  const def = UNITS[unit.unitId];
  const base = baseStats(def, unit.star);
  const stats = finalStats(base, itemModifiers(unit.items));
  return {
    title: def.name,
    subtitle: `${unit.star}★ · ${def.cost}-cost unit`,
    tone: `cost-${def.cost}`,
    traits: [def.origin, ...def.classes],
    stats: statLines(stats),
    ability: abilityOf(def.ability, { cost: def.cost, star: unit.star, abilityPower: stats.abilityPower }, base),
    body: [
      ...(unit.items.length === 0 ? [] : [{ text: `Items: ${unit.items.map((i) => ITEMS[i].name).join(', ')}.` }]),
      ...(ring === null ? [] : [{ text: `Bears the One Ring, at Corruption ${ring}.` }]),
    ],
    note: { text: 'Stats with items, before traits.', reason: false },
  };
}

/** A unit in a fight, as it is now: Health, shield, mana, current stats and its ability at its Ability Power. */
export function fighterTip(unit: UnitState, name: string): Tip {
  const roster = Object.hasOwn(UNITS, unit.unitId) ? UNITS[unit.unitId as UnitId] : null;
  const monster = roster === null && Object.hasOwn(MONSTERS, unit.unitId) ? MONSTERS[unit.unitId as keyof typeof MONSTERS] : null;
  const def = roster ?? monster;
  const shield = unit.statuses.shield;
  const live = [
    `${Math.ceil(unit.health)}/${Math.round(unit.stats.maxHealth)} Health`,
    ...(shield > 0 ? [`${Math.round(shield)} Shield`] : []),
    ...(unit.base.maxMana > 0 ? [`${Math.floor(unit.mana)}/${unit.base.maxMana} Mana`] : []),
  ];
  const ability = def?.ability === undefined ? null : abilityOf(def.ability, { cost: def.cost, star: unit.star, abilityPower: unit.stats.abilityPower }, unit.base, true);
  return {
    title: name,
    subtitle: roster !== null ? `${unit.star}★ · ${roster.cost}-cost unit` : monster !== null ? 'Monster' : 'Summon',
    ...(roster === null ? {} : { tone: `cost-${roster.cost}`, traits: [roster.origin, ...roster.classes] }),
    stats: [...live, ...statLines(unit.stats).slice(1)],
    ...(ability === null ? {} : { ability }),
    body: unit.items.length === 0 ? [] : [{ text: `Items: ${unit.items.map((i) => ITEMS[i].name).join(', ')}.` }],
  };
}

/** Stats as a unit card lists them. Mana is with the ability. */
function statLines(stats: Stats): string[] {
  return [
    `${Math.round(stats.maxHealth)} Health`,
    `${Math.round(stats.attackDamage)} Attack Damage`,
    `${stats.attackSpeed.toFixed(2)} Attack Speed`,
    `${Math.round(stats.armor)} Armor`,
    `${Math.round(stats.magicResist)} Magic Resist`,
    ...(stats.abilityPower === 100 ? [] : [`${Math.round(stats.abilityPower)} Ability Power`]),
    `${Math.round(stats.critChancePct)}% Crit`,
    ...(stats.dodgePct > 0 ? [`${Math.round(stats.dodgePct)}% Dodge`] : []),
    stats.range === 1 ? 'Melee' : `Range ${stats.range}`,
  ];
}

/** An ability with the mana it costs; before a fight, with the mana the unit starts with too. */
function abilityOf(ability: AbilityDef, caster: Caster, base: BaseStats, fighting = false): NonNullable<Tip['ability']> {
  return {
    name: ability.name,
    mana: base.maxMana <= 0 ? null : fighting ? `${base.maxMana} mana` : `${base.startMana}/${base.maxMana} mana`,
    lines: describeAbility(ability, caster),
  };
}

/** A button: what it does, its key, and why it can't be used now. */
export function actionTip(title: string, what: string, reason: string | null, key?: string): Tip {
  return {
    title,
    body: [{ text: what }],
    ...(key === undefined ? {} : { key }),
    ...(reason === null ? {} : { note: { text: reason, reason: true } }),
  };
}

/** A plain tooltip: a title and lines under it. */
export function textTip(title: string, ...lines: string[]): Tip {
  return { title, body: lines.map((text) => ({ text })) };
}
