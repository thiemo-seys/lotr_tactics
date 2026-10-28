// Unit definitions and abilities (docs/design.md section 5, docs/sim-spec.md sections 7.1 and 10).
// All numbers are placeholders until balancing.
//
// Abilities are data: a list of steps, each picking units with a selector and applying effects to
// them, in order. Ability numbers are percents of the base values in rules.ts, so "1.2 D" in the
// docs is `damage(120)` and "0.6 S" is `shield(60)`. Other percentages are whole numbers too, and
// durations are in seconds.

import type { ClassId, OriginId } from './traits.js';

export type UnitId =
  | 'sam'
  | 'merry'
  | 'pippin'
  | 'beregond'
  | 'hama'
  | 'grishnakh'
  | 'sharku'
  | 'gorbag'
  | 'frodo'
  | 'haldir'
  | 'faramir'
  | 'gamling'
  | 'balin'
  | 'lurtz'
  | 'radagast'
  | 'ringwraith'
  | 'bilbo'
  | 'gollum'
  | 'gimli'
  | 'boromir'
  | 'eomer'
  | 'eowyn'
  | 'ugluk'
  | 'khamul'
  | 'legolas'
  | 'elrond'
  | 'aragorn'
  | 'theoden'
  | 'dain'
  | 'saruman'
  | 'gothmog'
  | 'gandalf'
  | 'galadriel'
  | 'witch-king'
  | 'treebeard'
  | 'sauron';

export type SummonId = 'orc-grunt';

export type Cost = 1 | 2 | 3 | 4 | 5;

export type DamageType = 'physical' | 'magic' | 'true';

/** Selects a single unit. */
export type UnitSelector =
  | { readonly kind: 'self' }
  /** The caster's current target. */
  | { readonly kind: 'target' }
  | { readonly kind: 'farthestEnemy' }
  /** Lowest current Health. */
  | { readonly kind: 'lowestHealthEnemy' }
  /** Highest current Health. */
  | { readonly kind: 'highestHealthEnemy' }
  /** Excludes the caster. */
  | { readonly kind: 'nearestAlly' };

/** Selects the units a step's effects apply to. Geometry is in docs/sim-spec.md section 10.4. */
export type Selector =
  | UnitSelector
  | { readonly kind: 'nearestEnemies'; readonly count: number }
  | { readonly kind: 'lowestHealthPctAllies'; readonly count: number }
  | { readonly kind: 'allAllies' }
  /** Includes the caster. With `origin`, only allies of that origin. */
  | { readonly kind: 'alliesWithin'; readonly radius: number; readonly origin?: OriginId }
  | { readonly kind: 'adjacentAllies' }
  | { readonly kind: 'adjacentEnemies' }
  /** Around the caster. */
  | { readonly kind: 'enemiesWithin'; readonly radius: number }
  /** Enemies within `radius` of a unit, or of the hex with the most enemies around it. */
  | {
      readonly kind: 'area';
      readonly radius: number;
      readonly around: UnitSelector | { readonly kind: 'bestClusterHex'; readonly radius: number };
    }
  /** Enemies on the line from the caster through its target. */
  | { readonly kind: 'line'; readonly length: number | 'edge' }
  /** Enemies in the cone facing the caster's target. */
  | { readonly kind: 'cone' }
  /** Starts at the caster's target. */
  | { readonly kind: 'bounce'; readonly count: number; readonly jump: number };

export type BuffStat = 'attackDamagePct' | 'attackSpeedPct' | 'armor' | 'magicResist';

export type Effect =
  | {
      readonly kind: 'damage';
      /** Percent of D, per hit. */
      readonly pct: number;
      readonly type: DamageType;
      readonly hits?: number;
      readonly canCrit?: boolean;
      /** Damage multiplier against targets of one origin, e.g. Éowyn against Nazgûl. */
      readonly bonusVs?: { readonly origin: OriginId; readonly multiplierPct: number };
    }
  | { readonly kind: 'stun'; readonly seconds: number }
  /** Reduces Attack Speed. */
  | { readonly kind: 'slow'; readonly pct: number; readonly seconds: number }
  /** Percent of S. Lasts `ABILITIES.shieldSeconds` unless `seconds` is set. */
  | { readonly kind: 'shield'; readonly pct: number; readonly seconds?: number }
  /** Percent of H. */
  | { readonly kind: 'heal'; readonly pct: number }
  /** Heals the caster for a percent of the damage this step dealt. */
  | { readonly kind: 'healFromDamage'; readonly pct: number }
  | { readonly kind: 'buff'; readonly stat: BuffStat; readonly amount: number; readonly seconds: number }
  /** Lowers Armor and/or Magic Resist by a percent. */
  | {
      readonly kind: 'reduce';
      readonly stats: readonly ('armor' | 'magicResist')[];
      readonly pct: number;
      readonly seconds: number;
    }
  | { readonly kind: 'untargetable'; readonly seconds: number }
  | { readonly kind: 'stunImmune'; readonly seconds: number }
  /** The caster dashes next to the selected unit, which becomes its target. */
  | { readonly kind: 'dashAdjacentTo' }
  /** With a `line` selector: the caster moves to the farthest free hex on the line. */
  | { readonly kind: 'dashThroughLine' }
  /** Placed next to the caster on its own half (docs/sim-spec.md section 10.3). */
  | { readonly kind: 'summon'; readonly unit: SummonId; readonly count: number };

export type AbilityStep =
  | { readonly select: Selector; readonly effects: readonly Effect[] }
  /** Runs `steps` later, through the combat queue. */
  | { readonly delaySeconds: number; readonly steps: readonly AbilityStep[] };

export interface DamageReductionPassive {
  readonly kind: 'damageReduction';
  readonly pct: number;
  readonly fromOrigins: readonly OriginId[];
  readonly exceptUnits: readonly UnitId[];
}

export interface AbilityDef {
  readonly name: string;
  readonly steps: readonly AbilityStep[];
  readonly passive?: DamageReductionPassive;
}

export type TweakableStat = 'health' | 'attackDamage' | 'attackSpeed' | 'armor' | 'magicResist';

export interface UnitDef {
  readonly id: UnitId;
  readonly name: string;
  readonly cost: Cost;
  readonly origin: OriginId;
  /** The first class picks the stat template. */
  readonly classes: readonly [ClassId, ...ClassId[]];
  readonly large?: boolean;
  /** Per-unit adjustments in percent, up to `MAX_STAT_TWEAK_PCT` either way. */
  readonly statTweaks?: Readonly<Partial<Record<TweakableStat, number>>>;
  readonly ability: AbilityDef;
}

export interface SummonDef {
  readonly id: SummonId;
  readonly name: string;
  readonly origin: OriginId;
}

// Selectors

const SELF: UnitSelector = { kind: 'self' };
const TARGET: UnitSelector = { kind: 'target' };
const FARTHEST_ENEMY: UnitSelector = { kind: 'farthestEnemy' };
const LOWEST_HEALTH_ENEMY: UnitSelector = { kind: 'lowestHealthEnemy' };
const HIGHEST_HEALTH_ENEMY: UnitSelector = { kind: 'highestHealthEnemy' };
const NEAREST_ALLY: UnitSelector = { kind: 'nearestAlly' };
const ALL_ALLIES: Selector = { kind: 'allAllies' };
const ADJACENT_ALLIES: Selector = { kind: 'adjacentAllies' };
const ADJACENT_ENEMIES: Selector = { kind: 'adjacentEnemies' };
const CONE: Selector = { kind: 'cone' };

const nearestEnemies = (count: number): Selector => ({ kind: 'nearestEnemies', count });
const lowestHealthPctAllies = (count: number): Selector => ({ kind: 'lowestHealthPctAllies', count });
const alliesWithin = (radius: number, origin?: OriginId): Selector =>
  origin ? { kind: 'alliesWithin', radius, origin } : { kind: 'alliesWithin', radius };
const enemiesWithin = (radius: number): Selector => ({ kind: 'enemiesWithin', radius });
const area = (radius: number, around: UnitSelector): Selector => ({ kind: 'area', radius, around });
const areaAtBestCluster = (radius: number): Selector => ({
  kind: 'area',
  radius,
  around: { kind: 'bestClusterHex', radius },
});
const lineThroughTarget = (length: number | 'edge'): Selector => ({ kind: 'line', length });
const bounce = (count: number, jump: number): Selector => ({ kind: 'bounce', count, jump });

// Effects

type DamageOptions = Partial<Pick<Extract<Effect, { kind: 'damage' }>, 'hits' | 'canCrit' | 'bonusVs'>>;

const damage = (pct: number, type: DamageType = 'physical', options: DamageOptions = {}): Effect => ({
  kind: 'damage',
  pct,
  type,
  ...options,
});
const stun = (seconds: number): Effect => ({ kind: 'stun', seconds });
const slow = (pct: number, seconds: number): Effect => ({ kind: 'slow', pct, seconds });
const shield = (pct: number): Effect => ({ kind: 'shield', pct });
const heal = (pct: number): Effect => ({ kind: 'heal', pct });
const healFromDamage = (pct: number): Effect => ({ kind: 'healFromDamage', pct });
const buff = (stat: BuffStat, amount: number, seconds: number): Effect => ({ kind: 'buff', stat, amount, seconds });
const reduceResists = (pct: number, seconds: number): Effect => ({
  kind: 'reduce',
  stats: ['armor', 'magicResist'],
  pct,
  seconds,
});
const untargetable = (seconds: number): Effect => ({ kind: 'untargetable', seconds });
const stunImmune = (seconds: number): Effect => ({ kind: 'stunImmune', seconds });
const DASH_ADJACENT: Effect = { kind: 'dashAdjacentTo' };
const DASH_THROUGH_LINE: Effect = { kind: 'dashThroughLine' };
const summon = (unit: SummonId, count: number): Effect => ({ kind: 'summon', unit, count });

// Steps

const step = (select: Selector, ...effects: Effect[]): AbilityStep => ({ select, effects });
const after = (delaySeconds: number, ...steps: AbilityStep[]): AbilityStep => ({ delaySeconds, steps });

export const UNITS: Readonly<Record<UnitId, UnitDef>> = {
  // 1-cost

  sam: {
    id: 'sam',
    name: 'Sam',
    cost: 1,
    origin: 'hobbit',
    classes: ['guardian'],
    ability: { name: 'Loyal', steps: [step(SELF, shield(60)), step(NEAREST_ALLY, shield(60))] },
  },
  merry: {
    id: 'merry',
    name: 'Merry',
    cost: 1,
    origin: 'hobbit',
    classes: ['burglar'],
    ability: { name: 'Barrow-blade', steps: [step(TARGET, damage(100), reduceResists(30, 4))] },
  },
  pippin: {
    id: 'pippin',
    name: 'Pippin',
    cost: 1,
    origin: 'hobbit',
    classes: ['archer'],
    ability: { name: 'Stone toss', steps: [step(bounce(3, 3), damage(70))] },
  },
  beregond: {
    id: 'beregond',
    name: 'Beregond',
    cost: 1,
    origin: 'gondor',
    classes: ['guardian'],
    ability: { name: 'Shield bash', steps: [step(TARGET, damage(100), stun(1))] },
  },
  hama: {
    id: 'hama',
    name: 'Háma',
    cost: 1,
    origin: 'rohan',
    classes: ['guardian'],
    ability: { name: 'Doorward', steps: [step(SELF, shield(80), buff('armor', 30, 5))] },
  },
  grishnakh: {
    id: 'grishnakh',
    name: 'Grishnákh',
    cost: 1,
    origin: 'orc',
    classes: ['burglar'],
    ability: { name: 'Sneak', steps: [step(LOWEST_HEALTH_ENEMY, DASH_ADJACENT, damage(120))] },
  },
  sharku: {
    id: 'sharku',
    name: 'Sharku',
    cost: 1,
    origin: 'orc',
    classes: ['rider'],
    ability: { name: 'Warg bite', steps: [step(TARGET, damage(100), slow(30, 3))] },
  },
  gorbag: {
    id: 'gorbag',
    name: 'Gorbag',
    cost: 1,
    origin: 'orc',
    classes: ['archer'],
    ability: { name: 'Volley', steps: [step(TARGET, damage(40, 'physical', { hits: 3 }))] },
  },

  // 2-cost

  frodo: {
    id: 'frodo',
    name: 'Frodo',
    cost: 2,
    origin: 'hobbit',
    classes: ['burglar'],
    ability: { name: 'Slip away', steps: [step(SELF, untargetable(2)), after(2, step(TARGET, damage(130)))] },
  },
  haldir: {
    id: 'haldir',
    name: 'Haldir',
    cost: 2,
    origin: 'elf',
    classes: ['archer'],
    ability: { name: 'Lórien volley', steps: [step(nearestEnemies(3), damage(70))] },
  },
  faramir: {
    id: 'faramir',
    name: 'Faramir',
    cost: 2,
    origin: 'gondor',
    classes: ['archer'],
    ability: { name: "Ranger's shot", steps: [step(FARTHEST_ENEMY, damage(150))] },
  },
  gamling: {
    id: 'gamling',
    name: 'Gamling',
    cost: 2,
    origin: 'rohan',
    classes: ['rider'],
    ability: { name: 'Horn of the Hornburg', steps: [step(alliesWithin(2), buff('attackSpeedPct', 30, 4))] },
  },
  balin: {
    id: 'balin',
    name: 'Balin',
    cost: 2,
    origin: 'dwarf',
    classes: ['captain'],
    ability: { name: 'Lord of Moria', steps: [step(SELF, shield(60)), step(ADJACENT_ALLIES, shield(60))] },
  },
  lurtz: {
    id: 'lurtz',
    name: 'Lurtz',
    cost: 2,
    origin: 'orc',
    classes: ['archer'],
    ability: { name: 'Piercing arrow', steps: [step(lineThroughTarget('edge'), damage(100))] },
  },
  radagast: {
    id: 'radagast',
    name: 'Radagast',
    cost: 2,
    origin: 'istari',
    classes: ['sorcerer'],
    ability: { name: 'Flock', steps: [step(area(1, TARGET), damage(80, 'magic'), slow(25, 3))] },
  },
  ringwraith: {
    id: 'ringwraith',
    name: 'Ringwraith',
    cost: 2,
    origin: 'nazgul',
    classes: ['burglar'],
    ability: { name: 'Black Breath', steps: [step(TARGET, damage(100, 'magic'), stun(1.5))] },
  },

  // 3-cost

  bilbo: {
    id: 'bilbo',
    name: 'Bilbo',
    cost: 3,
    origin: 'hobbit',
    classes: ['burglar'],
    ability: { name: 'Riddles in the Dark', steps: [step(TARGET, stun(2), damage(100))] },
  },
  gollum: {
    id: 'gollum',
    name: 'Gollum',
    cost: 3,
    origin: 'hobbit',
    classes: ['burglar'],
    ability: {
      name: 'My precious',
      steps: [step(TARGET, damage(40, 'physical', { hits: 3 }), healFromDamage(50))],
    },
  },
  gimli: {
    id: 'gimli',
    name: 'Gimli',
    cost: 3,
    origin: 'dwarf',
    classes: ['guardian'],
    ability: { name: 'And my axe!', steps: [step(ADJACENT_ENEMIES, damage(90)), step(SELF, shield(60))] },
  },
  boromir: {
    id: 'boromir',
    name: 'Boromir',
    cost: 3,
    origin: 'gondor',
    classes: ['captain'],
    ability: {
      name: 'Horn of Gondor',
      steps: [step(alliesWithin(2), buff('armor', 25, 5), buff('magicResist', 25, 5)), step(SELF, shield(100))],
    },
  },
  eomer: {
    id: 'eomer',
    name: 'Éomer',
    cost: 3,
    origin: 'rohan',
    classes: ['rider'],
    ability: { name: 'Spear thrust', steps: [step(lineThroughTarget(4), damage(100))] },
  },
  eowyn: {
    id: 'eowyn',
    name: 'Éowyn',
    cost: 3,
    origin: 'rohan',
    classes: ['guardian'],
    ability: {
      name: 'Shieldmaiden',
      steps: [
        step(SELF, shield(60)),
        step(TARGET, damage(120, 'physical', { bonusVs: { origin: 'nazgul', multiplierPct: 200 } })),
      ],
    },
  },
  ugluk: {
    id: 'ugluk',
    name: 'Uglúk',
    cost: 3,
    origin: 'orc',
    classes: ['guardian'],
    ability: { name: 'Bred for war', steps: [step(SELF, shield(100), stunImmune(4))] },
  },
  khamul: {
    id: 'khamul',
    name: 'Khamûl',
    cost: 3,
    origin: 'nazgul',
    classes: ['rider'],
    ability: {
      name: 'Shadow ride',
      steps: [step(lineThroughTarget(3), damage(90, 'magic'), slow(25, 3), DASH_THROUGH_LINE)],
    },
  },

  // 4-cost

  legolas: {
    id: 'legolas',
    name: 'Legolas',
    cost: 4,
    origin: 'elf',
    classes: ['archer'],
    ability: { name: 'Flurry', steps: [step(TARGET, damage(30, 'physical', { hits: 5, canCrit: true }))] },
  },
  elrond: {
    id: 'elrond',
    name: 'Elrond',
    cost: 4,
    origin: 'elf',
    classes: ['sorcerer'],
    ability: {
      name: 'Healer of Rivendell',
      steps: [step(lowestHealthPctAllies(2), heal(100), buff('magicResist', 30, 4))],
    },
  },
  aragorn: {
    id: 'aragorn',
    name: 'Aragorn',
    cost: 4,
    origin: 'gondor',
    classes: ['captain'],
    ability: {
      name: 'Andúril',
      steps: [step(TARGET, damage(130)), step(alliesWithin(2), buff('attackDamagePct', 25, 4))],
    },
  },
  theoden: {
    id: 'theoden',
    name: 'Théoden',
    cost: 4,
    origin: 'rohan',
    classes: ['rider', 'captain'],
    ability: {
      name: 'Forth Eorlingas!',
      steps: [step(lineThroughTarget(3), damage(100), stun(1), DASH_THROUGH_LINE)],
    },
  },
  dain: {
    id: 'dain',
    name: 'Dáin',
    cost: 4,
    origin: 'dwarf',
    classes: ['guardian'],
    ability: { name: 'Iron Hills', steps: [step(ADJACENT_ENEMIES, damage(90), stun(1.5))] },
  },
  saruman: {
    id: 'saruman',
    name: 'Saruman',
    cost: 4,
    origin: 'istari',
    classes: ['sorcerer'],
    ability: { name: 'Fire of Orthanc', steps: [step(area(1, FARTHEST_ENEMY), damage(120, 'magic'))] },
  },
  gothmog: {
    id: 'gothmog',
    name: 'Gothmog',
    cost: 4,
    origin: 'orc',
    classes: ['captain'],
    ability: {
      name: 'Unleash the Orcs',
      // Summon first, so the new grunts get the buff.
      steps: [step(SELF, summon('orc-grunt', 2)), step(alliesWithin(2, 'orc'), buff('attackDamagePct', 25, 5))],
    },
  },

  // 5-cost

  gandalf: {
    id: 'gandalf',
    name: 'Gandalf',
    cost: 5,
    origin: 'istari',
    classes: ['sorcerer'],
    ability: { name: 'You shall not pass', steps: [step(area(2, TARGET), damage(100, 'magic'), stun(2))] },
  },
  galadriel: {
    id: 'galadriel',
    name: 'Galadriel',
    cost: 5,
    origin: 'elf',
    classes: ['sorcerer'],
    ability: {
      name: 'Light of the Eldar',
      steps: [step(ALL_ALLIES, shield(50)), step(enemiesWithin(3), damage(80, 'magic'))],
    },
  },
  'witch-king': {
    id: 'witch-king',
    name: 'Witch-king',
    cost: 5,
    origin: 'nazgul',
    classes: ['rider', 'sorcerer'],
    ability: {
      name: 'Morgul mace',
      steps: [step(HIGHEST_HEALTH_ENEMY, DASH_ADJACENT), step(ADJACENT_ENEMIES, damage(100, 'magic'), slow(30, 3))],
      passive: { kind: 'damageReduction', pct: 50, fromOrigins: ['gondor', 'rohan'], exceptUnits: ['eowyn'] },
    },
  },
  treebeard: {
    id: 'treebeard',
    name: 'Treebeard',
    cost: 5,
    origin: 'ent',
    classes: ['guardian'],
    large: true,
    ability: { name: 'Boulder', steps: [step(areaAtBestCluster(1), damage(100), stun(1.5))] },
  },
  sauron: {
    id: 'sauron',
    name: 'Sauron',
    cost: 5,
    origin: 'dark-lord',
    classes: ['captain'],
    large: true,
    ability: { name: 'Sweep', steps: [step(CONE, damage(120), stun(1))] },
  },
};

export const SUMMONS: Readonly<Record<SummonId, SummonDef>> = {
  'orc-grunt': { id: 'orc-grunt', name: 'Orc grunt', origin: 'orc' },
};
