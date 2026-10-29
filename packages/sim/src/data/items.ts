// Item components and combined items (docs/design.md section 6). Behaviour is in
// docs/sim-spec.md section 12.4. All numbers are placeholders until balancing. Percentages are
// whole numbers and durations are in seconds.

import type { BuffStat } from './units.js';

export const COMPONENTS = ['blade', 'bow', 'mail', 'cloak', 'lembas', 'staff'] as const;

export type ComponentId = (typeof COMPONENTS)[number];

export type CombinedItemId =
  | 'anduril'
  | 'black-arrow'
  | 'orcrist'
  | 'sting'
  | 'herugrim'
  | 'glamdring'
  | 'galadhrim-bow'
  | 'grond'
  | 'miruvor'
  | 'kings-banner'
  | 'palantir'
  | 'oakenshield'
  | 'mithril-shirt'
  | 'dragon-helm'
  | 'star-of-elendil'
  | 'elven-cloak'
  | 'elven-rope'
  | 'phial'
  | 'ent-draught'
  | 'athelas'
  | 'wizards-staff';

export type ItemId = ComponentId | CombinedItemId;

/** Stat bonuses for the whole fight. Missing fields are 0. */
export interface ItemStats {
  readonly health?: number;
  readonly attackDamagePct?: number;
  readonly attackSpeedPct?: number;
  readonly armor?: number;
  readonly magicResist?: number;
  readonly abilityPower?: number;
  readonly critChancePct?: number;
}

/** What a combined item does beyond its stats. "Holder" is the unit holding the item. */
export type ItemEffect =
  /** A kill gives a buff for the rest of the fight (Andúril). */
  | { readonly kind: 'buffOnKill'; readonly stat: BuffStat; readonly amount: number }
  /** A damage amp against targets with more max Health than the holder (Black Arrow). */
  | { readonly kind: 'ampVsHealthier'; readonly pct: number }
  /** Once, when the holder's Health first falls below a percent of its max Health (Orcrist, Herugrim). */
  | {
      readonly kind: 'lowHealth';
      readonly belowPct: number;
      readonly untargetableSeconds?: number;
      readonly shield?: { readonly maxHealthPct: number; readonly seconds: number };
      readonly buff: { readonly stat: BuffStat; readonly amount: number };
    }
  /** The holder's ability damage can crit (Sting). */
  | { readonly kind: 'abilityCrit' }
  /** Heals the holder for a percent of all damage it deals (Glamdring). */
  | { readonly kind: 'healOnDamage'; readonly pct: number }
  /** Each basic attack also fires at another enemy in range (Bow of the Galadhrim). */
  | { readonly kind: 'extraAttack'; readonly damagePct: number }
  /** Each basic attack gives a buff for the rest of the fight, up to a number of stacks (Grond). */
  | { readonly kind: 'stackOnAttack'; readonly stat: BuffStat; readonly amount: number; readonly maxStacks: number }
  /** Stun immunity at combat start (Miruvor). */
  | { readonly kind: 'startStunImmune'; readonly seconds: number }
  /** At combat start, the holder and adjacent allies gain a buff for the rest of the fight (King's Banner). */
  | { readonly kind: 'startBuff'; readonly stat: BuffStat; readonly amount: number }
  /** Extra mana for each basic attack (Palantír). */
  | { readonly kind: 'manaOnAttack'; readonly amount: number }
  /** A basic attack that hits the holder deals a percent of its damage back as magic damage (Oakenshield). */
  | { readonly kind: 'reflect'; readonly pct: number }
  /** Less damage taken, and crits against the holder deal normal damage (Mithril Shirt). */
  | { readonly kind: 'damageReduction'; readonly pct: number; readonly critImmune: boolean }
  /** Every second, magic damage to adjacent enemies, a percent of the holder's max Health (Dragon-helm). */
  | { readonly kind: 'burn'; readonly maxHealthPct: number }
  /** At combat start, the holder and adjacent allies gain a shield (Star of Elendil). */
  | { readonly kind: 'startShield'; readonly amount: number; readonly seconds: number }
  /** Every second, the holder heals a percent of its max Health (Elven Cloak). */
  | { readonly kind: 'regen'; readonly maxHealthPct: number }
  /** At combat start, stuns the enemy farthest from the holder (Elven Rope). */
  | { readonly kind: 'startStun'; readonly seconds: number }
  /** Enemies near the holder have less Magic Resist (Phial of Galadriel). */
  | { readonly kind: 'magicResistAura'; readonly pct: number; readonly radius: number }
  /** After each cast, heals the ally with the lowest Health % (Athelas). */
  | { readonly kind: 'healOnCast'; readonly amount: number };

export interface ItemDef {
  readonly name: string;
  /** The two components a combined item is made from, in the order of `COMPONENTS`. Components have none. */
  readonly recipe: readonly [ComponentId, ComponentId] | null;
  /** The item's own stats. A combined item also has its components' stats (see `itemStats`). */
  readonly stats: ItemStats;
  readonly effect: ItemEffect | null;
}

/** The most items a unit can hold. */
export const MAX_ITEMS = 3;

const component = (name: string, stats: ItemStats): ItemDef => ({ name, recipe: null, stats, effect: null });

const combined = (name: string, recipe: readonly [ComponentId, ComponentId], effect: ItemEffect | null, stats: ItemStats = {}): ItemDef => ({
  name,
  recipe,
  stats,
  effect,
});

export const ITEMS: { readonly [K in ItemId]: ItemDef } = {
  blade: component('Blade', { attackDamagePct: 15 }),
  bow: component('Bow', { attackSpeedPct: 15 }),
  mail: component('Mail', { armor: 20 }),
  cloak: component('Cloak', { magicResist: 20 }),
  lembas: component('Lembas', { health: 150 }),
  staff: component('Staff', { abilityPower: 15 }),

  anduril: combined('Andúril', ['blade', 'blade'], { kind: 'buffOnKill', stat: 'attackDamagePct', amount: 15 }),
  'black-arrow': combined('Black Arrow', ['blade', 'bow'], { kind: 'ampVsHealthier', pct: 30 }),
  orcrist: combined('Orcrist', ['blade', 'mail'], {
    kind: 'lowHealth',
    belowPct: 50,
    untargetableSeconds: 1,
    buff: { stat: 'attackSpeedPct', amount: 40 },
  }),
  sting: combined('Sting', ['blade', 'cloak'], { kind: 'abilityCrit' }, { critChancePct: 25 }),
  herugrim: combined('Herugrim', ['blade', 'lembas'], {
    kind: 'lowHealth',
    belowPct: 50,
    shield: { maxHealthPct: 30, seconds: 5 },
    buff: { stat: 'attackDamagePct', amount: 30 },
  }),
  glamdring: combined('Glamdring', ['blade', 'staff'], { kind: 'healOnDamage', pct: 20 }),
  'galadhrim-bow': combined('Bow of the Galadhrim', ['bow', 'bow'], { kind: 'extraAttack', damagePct: 50 }),
  grond: combined('Grond', ['bow', 'mail'], { kind: 'stackOnAttack', stat: 'attackSpeedPct', amount: 5, maxStacks: 20 }),
  miruvor: combined('Miruvor', ['bow', 'cloak'], { kind: 'startStunImmune', seconds: 15 }),
  'kings-banner': combined("King's Banner", ['bow', 'lembas'], { kind: 'startBuff', stat: 'attackSpeedPct', amount: 20 }),
  palantir: combined('Palantír', ['bow', 'staff'], { kind: 'manaOnAttack', amount: 5 }),
  oakenshield: combined('Oakenshield', ['mail', 'mail'], { kind: 'reflect', pct: 30 }),
  'mithril-shirt': combined('Mithril Shirt', ['mail', 'cloak'], { kind: 'damageReduction', pct: 15, critImmune: true }),
  'dragon-helm': combined('Dragon-helm', ['mail', 'lembas'], { kind: 'burn', maxHealthPct: 2 }),
  'star-of-elendil': combined('Star of Elendil', ['mail', 'staff'], { kind: 'startShield', amount: 300, seconds: 8 }),
  'elven-cloak': combined('Elven Cloak', ['cloak', 'cloak'], { kind: 'regen', maxHealthPct: 2 }),
  'elven-rope': combined('Elven Rope', ['cloak', 'lembas'], { kind: 'startStun', seconds: 3 }),
  phial: combined('Phial of Galadriel', ['cloak', 'staff'], { kind: 'magicResistAura', pct: 30, radius: 2 }),
  'ent-draught': combined('Ent-draught', ['lembas', 'lembas'], null, { health: 300 }),
  athelas: combined('Athelas', ['lembas', 'staff'], { kind: 'healOnCast', amount: 200 }),
  'wizards-staff': combined("Wizard's Staff", ['staff', 'staff'], null, { abilityPower: 40 }),
};

/** Component names, for the Council and loot. */
export const COMPONENT_NAMES: Readonly<Record<ComponentId, string>> = Object.fromEntries(
  COMPONENTS.map((id) => [id, ITEMS[id].name]),
) as Record<ComponentId, string>;
