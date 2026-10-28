// Trait definitions (docs/design.md section 4). Behaviour is in docs/sim-spec.md section 12.3.
// All numbers are placeholders until balancing. Percentages are whole numbers.

export type OriginId =
  | 'hobbit'
  | 'elf'
  | 'dwarf'
  | 'gondor'
  | 'rohan'
  | 'istari'
  | 'orc'
  | 'nazgul'
  | 'ent'
  | 'dark-lord';

export type ClassId = 'guardian' | 'archer' | 'rider' | 'burglar' | 'captain' | 'sorcerer';

export type TraitId = OriginId | ClassId;

/** The values a trait gives at one breakpoint. */
export interface TraitLevels {
  hobbit: { health: number };
  elf: { attackSpeedPct: number; dodgePct: number };
  dwarf: { armor: number; damageVsLargePct: number };
  gondor: { armor: number; magicResist: number };
  rohan: { attackSpeedPctPerDeath: number };
  istari: { manaPerSecond: number };
  orc: { grunts: number };
  nazgul: { slowPct: number; radius: number };
  ent: { regenPctPerSecond: number };
  'dark-lord': { damageAmpPct: number };
  guardian: { shield: number; shieldSeconds: number };
  archer: { attackSpeedPctPerStack: number; maxStacks: number };
  rider: { chargeDamage: number };
  burglar: { critDamagePct: number };
  captain: { damageAmpPct: number };
  sorcerer: { abilityPower: number };
}

export interface TraitDef<Level> {
  readonly name: string;
  readonly kind: 'origin' | 'class';
  /** Distinct units needed for each level, lowest first. */
  readonly breakpoints: readonly number[];
  /** The values at each breakpoint, in the same order. */
  readonly levels: readonly Readonly<Level>[];
}

export const TRAITS: { readonly [K in TraitId]: TraitDef<TraitLevels[K]> } = {
  hobbit: {
    name: 'Hobbit',
    kind: 'origin',
    breakpoints: [2, 4, 6],
    levels: [{ health: 150 }, { health: 350 }, { health: 600 }],
  },
  elf: {
    name: 'Elf',
    kind: 'origin',
    breakpoints: [2, 4],
    levels: [
      { attackSpeedPct: 20, dodgePct: 0 },
      { attackSpeedPct: 45, dodgePct: 20 },
    ],
  },
  dwarf: {
    name: 'Dwarf',
    kind: 'origin',
    breakpoints: [2, 3],
    levels: [
      { armor: 30, damageVsLargePct: 20 },
      { armor: 60, damageVsLargePct: 40 },
    ],
  },
  gondor: {
    name: 'Gondor',
    kind: 'origin',
    breakpoints: [2, 4],
    levels: [
      { armor: 20, magicResist: 20 },
      { armor: 45, magicResist: 45 },
    ],
  },
  rohan: {
    name: 'Rohan',
    kind: 'origin',
    breakpoints: [2, 4],
    levels: [{ attackSpeedPctPerDeath: 10 }, { attackSpeedPctPerDeath: 25 }],
  },
  istari: {
    name: 'Istari',
    kind: 'origin',
    breakpoints: [2, 3],
    levels: [{ manaPerSecond: 3 }, { manaPerSecond: 6 }],
  },
  orc: {
    name: 'Orc',
    kind: 'origin',
    breakpoints: [2, 4, 6],
    levels: [{ grunts: 1 }, { grunts: 2 }, { grunts: 4 }],
  },
  nazgul: {
    name: 'Nazgûl',
    kind: 'origin',
    breakpoints: [2, 3],
    levels: [
      { slowPct: 15, radius: 2 },
      { slowPct: 30, radius: 2 },
    ],
  },
  ent: {
    name: 'Ent',
    kind: 'origin',
    breakpoints: [1],
    levels: [{ regenPctPerSecond: 2 }],
  },
  'dark-lord': {
    name: 'Dark Lord',
    kind: 'origin',
    breakpoints: [1],
    levels: [{ damageAmpPct: 15 }],
  },
  guardian: {
    name: 'Guardian',
    kind: 'class',
    breakpoints: [2, 4, 6],
    levels: [
      { shield: 200, shieldSeconds: 8 },
      { shield: 400, shieldSeconds: 8 },
      { shield: 700, shieldSeconds: 8 },
    ],
  },
  archer: {
    name: 'Archer',
    kind: 'class',
    breakpoints: [2, 4, 6],
    levels: [
      { attackSpeedPctPerStack: 3, maxStacks: 15 },
      { attackSpeedPctPerStack: 6, maxStacks: 15 },
      { attackSpeedPctPerStack: 10, maxStacks: 15 },
    ],
  },
  rider: {
    name: 'Rider',
    kind: 'class',
    breakpoints: [2, 4, 6],
    levels: [{ chargeDamage: 100 }, { chargeDamage: 220 }, { chargeDamage: 400 }],
  },
  burglar: {
    name: 'Burglar',
    kind: 'class',
    breakpoints: [2, 4, 6],
    levels: [{ critDamagePct: 20 }, { critDamagePct: 45 }, { critDamagePct: 75 }],
  },
  captain: {
    name: 'Captain',
    kind: 'class',
    breakpoints: [2, 4, 6],
    levels: [{ damageAmpPct: 10 }, { damageAmpPct: 20 }, { damageAmpPct: 35 }],
  },
  sorcerer: {
    name: 'Sorcerer',
    kind: 'class',
    breakpoints: [2, 4, 6],
    levels: [{ abilityPower: 20 }, { abilityPower: 45 }, { abilityPower: 80 }],
  },
};
