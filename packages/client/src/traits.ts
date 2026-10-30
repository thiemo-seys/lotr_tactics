// The trait tracker on the play page (docs/game-spec.md section 12): a board's traits as fights
// count them, and each trait's description built from the trait data, so the numbers shown are
// always the sim's. No Three.js or DOM, so it can be tested.

import {
  ITEMS,
  ITEM_IDS,
  TRAITS,
  UNIT_IDS,
  UNITS,
  teamTraits,
  traitLevel,
  type GiftId,
  type OwnedUnit,
  type TraitId,
  type TraitLevels,
} from '@lotr-tactics/sim';

/** How far up its breakpoints an active trait is: gold at its top one, otherwise silver past its first, else bronze. */
export type TraitTier = 'gold' | 'silver' | 'bronze';

/** One trait in the tracker. */
export interface TraitRow {
  readonly trait: TraitId;
  readonly name: string;
  /** Distinct units, crests and wearers of the Nine that count towards it. */
  readonly count: number;
  /** 0 at its first breakpoint, 1 at its second, and so on; -1 below the first. */
  readonly level: number;
  /** Null below the first breakpoint. */
  readonly tier: TraitTier | null;
  readonly breakpoints: readonly number[];
}

const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

const TIER_RANK: Readonly<Record<TraitTier, number>> = { gold: 3, silver: 2, bronze: 1 };

function tierOf(level: number, breakpoints: readonly number[]): TraitTier | null {
  if (level < 0) return null;
  return level === breakpoints.length - 1 ? 'gold' : level > 0 ? 'silver' : 'bronze';
}

/**
 * The traits of the units on a board, counted as fights count them: active ones first, by tier and
 * then by count; then the rest, by count. Ties keep the trait data's order.
 */
export function traitRows(board: readonly (OwnedUnit | null)[], gifts: readonly GiftId[]): TraitRow[] {
  const counts = teamTraits(
    board.filter((u) => u !== null),
    gifts,
  );
  const rank = (row: TraitRow) => (row.tier === null ? 0 : TIER_RANK[row.tier]);
  return TRAIT_IDS.flatMap((trait) => {
    const count = counts[trait];
    if (count === undefined) return [];
    const { name, breakpoints } = TRAITS[trait];
    const level = traitLevel(trait, count);
    return [{ trait, name, count, level, tier: tierOf(level, breakpoints), breakpoints }];
  }).sort((a, b) => rank(b) - rank(a) || b.count - a.count);
}

/** A value at each breakpoint, such as "+150 / +350 / +600", or once if it is the same at all of them. */
function each<K extends TraitId>(trait: K, value: (level: Readonly<TraitLevels[K]>) => string | number): string {
  const values = TRAITS[trait].levels.map((level) => String(value(level)));
  return values.every((v) => v === values[0]) ? values[0]! : values.join(' / ');
}

/** What a trait does, with its values at each breakpoint. */
export function traitEffect(trait: TraitId): string {
  switch (trait) {
    case 'hobbit':
      return `Enemies target other units first while a non-Hobbit ally is next to the Hobbit. Hobbits gain ${each('hobbit', (l) => `+${l.health}`)} Health.`;
    case 'elf': {
      const dodge = TRAITS.elf.levels.flatMap((l, i) => (l.dodgePct > 0 ? [`${l.dodgePct}% Dodge at ${TRAITS.elf.breakpoints[i]}`] : []));
      return `Elves gain ${each('elf', (l) => `+${l.attackSpeedPct}%`)} Attack Speed${dodge.length > 0 ? `, plus ${dodge.join(' and ')}` : ''}.`;
    }
    case 'dwarf':
      return `Dwarves gain ${each('dwarf', (l) => `+${l.armor}`)} Armor and deal ${each('dwarf', (l) => `+${l.damageVsLargePct}%`)} damage to Large units.`;
    case 'gondor':
      return TRAITS.gondor.levels.every((l) => l.armor === l.magicResist)
        ? `All front-row allies gain ${each('gondor', (l) => `+${l.armor}`)} Armor and Magic Resist.`
        : `All front-row allies gain ${each('gondor', (l) => `+${l.armor}`)} Armor and ${each('gondor', (l) => `+${l.magicResist}`)} Magic Resist.`;
    case 'rohan':
      return `Each time a Rohan unit falls, the other Rohan units gain ${each('rohan', (l) => `+${l.attackSpeedPctPerDeath}%`)} Attack Speed. It stacks.`;
    case 'istari':
      return `Istari gain ${each('istari', (l) => l.manaPerSecond)} mana once per second.`;
    case 'orc':
      return `${each('orc', (l) => l.grunts)} Orc grunts spawn at combat start. Grunts get stronger each stage.`;
    case 'nazgul':
      return `Enemies within ${each('nazgul', (l) => l.radius)} hexes of a Nazgûl attack ${each('nazgul', (l) => `${l.slowPct}%`)} slower.`;
    case 'ent':
      return `Treebeard is Large and regenerates ${each('ent', (l) => `${l.regenPctPerSecond}%`)} of his max Health every second.`;
    case 'dark-lord':
      return `Sauron is Large. Your Orcs and Nazgûl deal ${each('dark-lord', (l) => `+${l.damageAmpPct}%`)} damage.`;
    case 'guardian':
      return `Guardians start combat with a ${each('guardian', (l) => l.shield)} shield for ${each('guardian', (l) => l.shieldSeconds)} seconds.`;
    case 'archer':
      return `Archers gain ${each('archer', (l) => `+${l.attackSpeedPctPerStack}%`)} Attack Speed with each attack, up to ${each('archer', (l) => l.maxStacks)} stacks.`;
    case 'rider':
      return `Riders charge their target at combat start, dealing ${each('rider', (l) => l.chargeDamage)} bonus physical damage on arrival.`;
    case 'burglar':
      return `Burglars leap to the enemy backline at combat start, target the farthest enemy, and gain ${each('burglar', (l) => `+${l.critDamagePct}%`)} Crit Damage.`;
    case 'captain':
      return `Allies next to a Captain deal ${each('captain', (l) => `+${l.damageAmpPct}%`)} damage.`;
    case 'sorcerer':
      return `Sorcerers gain ${each('sorcerer', (l) => `+${l.abilityPower}`)} Ability Power.`;
  }
}

/** The units with a trait, cheapest first. */
export function unitsWith(trait: TraitId): string[] {
  return UNIT_IDS.filter((id) => UNITS[id].origin === trait || (UNITS[id].classes as readonly TraitId[]).includes(trait))
    .sort((a, b) => UNITS[a].cost - UNITS[b].cost)
    .map((id) => UNITS[id].name);
}

/** Items that make their wearer count towards a trait, such as the Ring of the Nine for Nazgûl. */
function itemsGranting(trait: TraitId): string[] {
  return trait === 'nazgul' ? ITEM_IDS.filter((id) => ITEMS[id].effect?.kind === 'nazgul').map((id) => ITEMS[id].name) : [];
}

/** A trait's name, breakpoints, effect and units, for a tooltip. */
export function traitText(trait: TraitId): string {
  const items = itemsGranting(trait);
  return [
    `${TRAITS[trait].name} (${TRAITS[trait].breakpoints.join(' / ')})`,
    traitEffect(trait),
    `Units: ${unitsWith(trait).join(', ')}${items.length > 0 ? `, and any unit wearing a ${items.join(' or ')}` : ''}.`,
  ].join('\n');
}
