// What the client's tooltips say (docs/game-spec.md section 12, docs/viewer-spec.md section 4):
// cards for items, the One Ring, Rings of Power, Gifts, traits, units and actions, laid out in
// parts and built from the data through items.ts, gifts.ts, ring.ts and traits.ts, so the numbers
// shown are always the sim's. No Three.js or DOM, so it can be tested.

import { GIFTS, UNITS, baseStats, type ComponentId, type GiftId, type ItemId, type TraitId, type UnitId } from '@lotr-tactics/sim';
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

/** A trait, and how many of the person's units count towards it if it is on their board. */
export function traitTip(trait: TraitId, counted?: { readonly count: number; readonly level: number | null; readonly tone: TraitTone | null }): Tip {
  const info = traitInfo(trait);
  return {
    icon: { kind: 'trait', trait, tone: counted?.tone ?? null },
    title: info.name,
    subtitle: counted === undefined ? info.kind : `${info.kind} · ${counted.count} on your board`,
    ...(counted === undefined || counted.tone === null ? {} : { tone: `trait-${counted.tone}` }),
    body: info.rule === null ? [] : [{ text: info.rule }],
    levels: info.levels.map((l, i) => ({ count: l.count, text: l.text, active: counted?.level === i })),
  };
}

/** A unit as the shop and the Council offer it: its cost, traits, ability and 1★ stats. */
export function unitTip(id: UnitId, note?: Tip['note']): Tip {
  const def = UNITS[id];
  const stats = baseStats(def, 1);
  return {
    title: def.name,
    subtitle: `${def.cost}-cost unit`,
    tone: `cost-${def.cost}`,
    traits: [def.origin, ...def.classes],
    stats: [
      `${stats.maxHealth} Health`,
      `${stats.attackDamage} Attack Damage`,
      `${stats.range === 1 ? 'Melee' : `Range ${stats.range}`}`,
      `${stats.maxMana} Mana`,
    ],
    body: [{ text: `Ability: ${def.ability.name}` }],
    ...(note === undefined ? {} : { note }),
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
