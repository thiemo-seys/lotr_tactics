// How traits read in the client (docs/game-spec.md section 12): what each trait does at each
// breakpoint, built from the trait data so the numbers shown are always the sim's, and the rows of
// the trait tracker, from the sim's own count of a board's traits. No Three.js or DOM, so it can be
// tested.

import {
  TRAITS,
  teamTraitCounts,
  traitLevelsOf,
  type GiftId,
  type OwnedUnit,
  type TraitId,
  type TraitLevels as TraitValues,
} from '@lotr-tactics/sim';

export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

/** What a trait does: a rule that holds at every level, if any, and what each level gives. */
const RULES: { readonly [K in TraitId]: { readonly rule?: string; readonly level: (values: TraitValues[K]) => string } } = {
  hobbit: {
    rule: 'Enemies target other units first while a non-Hobbit ally is next to the Hobbit.',
    level: (v) => `Hobbits gain +${v.health} Health.`,
  },
  elf: { level: (v) => `Elves gain +${v.attackSpeedPct}% Attack Speed${v.dodgePct > 0 ? ` and ${v.dodgePct}% Dodge` : ''}.` },
  dwarf: { level: (v) => `Dwarves gain +${v.armor} Armor and deal ${v.damageVsLargePct}% more damage to Large units.` },
  gondor: { level: (v) => `All front-row allies gain +${v.armor} Armor and +${v.magicResist} Magic Resist.` },
  rohan: { level: (v) => `Each time a Rohan unit falls, the other Rohan units gain +${v.attackSpeedPctPerDeath}% Attack Speed, stacking.` },
  istari: { level: (v) => `Istari gain ${v.manaPerSecond} mana every second.` },
  orc: { rule: 'Grunts get stronger each stage.', level: (v) => `${v.grunts === 1 ? 'An Orc grunt spawns' : `${v.grunts} Orc grunts spawn`} at combat start.` },
  nazgul: { level: (v) => `Enemies within ${v.radius} hexes of a Nazgûl attack ${v.slowPct}% slower.` },
  ent: { rule: 'Treebeard is Large.', level: (v) => `Treebeard regenerates ${v.regenPctPerSecond}% of his max Health every second.` },
  'dark-lord': { rule: 'Sauron is Large.', level: (v) => `Your Orcs and Nazgûl deal ${v.damageAmpPct}% more damage.` },
  guardian: { level: (v) => `Guardians start combat with a ${v.shield} shield for ${v.shieldSeconds} seconds.` },
  archer: { level: (v) => `Archers gain +${v.attackSpeedPctPerStack}% Attack Speed with each attack, up to ${v.maxStacks} times.` },
  rider: { level: (v) => `Riders charge their target at combat start, dealing ${v.chargeDamage} bonus physical damage on arrival.` },
  burglar: {
    rule: 'Burglars leap to the enemy backline at combat start and target the farthest enemy.',
    level: (v) => `Burglars gain +${v.critDamagePct}% Crit Damage.`,
  },
  captain: { level: (v) => `Allies next to a Captain deal ${v.damageAmpPct}% more damage.` },
  sorcerer: { level: (v) => `Sorcerers gain +${v.abilityPower} Ability Power.` },
};

export interface TraitInfo {
  readonly name: string;
  readonly kind: 'Origin' | 'Class';
  /** What the trait does at every level, if anything. */
  readonly rule: string | null;
  /** Each breakpoint: the units it needs and what it gives. */
  readonly levels: readonly { readonly count: number; readonly text: string }[];
}

/** A trait's name, kind, rule and what each breakpoint gives, from the trait data. */
export function traitInfo(trait: TraitId): TraitInfo {
  const def = TRAITS[trait];
  const rules = RULES[trait] as { readonly rule?: string; readonly level: (values: unknown) => string };
  return {
    name: def.name,
    kind: def.kind === 'origin' ? 'Origin' : 'Class',
    rule: rules.rule ?? null,
    levels: def.breakpoints.map((count, i) => ({ count, text: rules.level(def.levels[i]) })),
  };
}

/** How a trait's badge looks: by the level reached, gold at the top one, and its own look for a unique trait. */
export type TraitTone = 'bronze' | 'silver' | 'gold' | 'unique';

export interface TraitRow {
  readonly trait: TraitId;
  readonly name: string;
  /** How many count towards it, as the sim counts them. */
  readonly count: number;
  readonly breakpoints: readonly number[];
  /** The active level's index into `breakpoints`, or null if the trait isn't active. */
  readonly level: number | null;
  readonly tone: TraitTone | null;
}

const TONE_RANK: Readonly<Record<TraitTone, number>> = { unique: 3, gold: 2, silver: 1, bronze: 0 };

function tone(breakpoints: readonly number[], level: number | null): TraitTone | null {
  if (level === null) return null;
  if (breakpoints.length === 1) return 'unique';
  return level === breakpoints.length - 1 ? 'gold' : level === 0 ? 'bronze' : 'silver';
}

/**
 * The trait tracker's rows: every trait the board's units count towards, as the sim counts them,
 * with crest Gifts and the Nine's Nazgûl. Active traits come first, highest tone first, then the
 * rest by how many count.
 */
export function traitRows(board: readonly (OwnedUnit | null)[], gifts: readonly GiftId[]): TraitRow[] {
  const counts = teamTraitCounts(board.filter((u) => u !== null), gifts);
  const levels = traitLevelsOf(counts);
  const rows = TRAIT_IDS.flatMap((trait): TraitRow[] => {
    const count = counts[trait];
    if (count === undefined) return [];
    const { name, breakpoints } = TRAITS[trait];
    const level = levels[trait] ?? null;
    return [{ trait, name, count, breakpoints, level, tone: tone(breakpoints, level) }];
  });
  const rank = (row: TraitRow) => (row.tone === null ? -1 : TONE_RANK[row.tone]);
  return rows.sort((a, b) => rank(b) - rank(a) || b.count - a.count || a.name.localeCompare(b.name));
}
