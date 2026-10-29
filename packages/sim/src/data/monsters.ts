// PvE monsters (docs/game-spec.md section 9.8). Placeholders until PvE is designed.
// All numbers are placeholders until balancing. Percentages are whole numbers, durations in seconds.
//
// Monsters are units with no origin or classes, so they have no traits, and they are always 1★.

import type { StatTemplate } from './templates.js';
import type { AbilityDef, Cost, UnitId } from './units.js';

export type MonsterId = 'goblin' | 'goblin-archer' | 'warg' | 'cave-troll' | 'watcher' | 'mumak' | 'balrog';

/** Anything that can be placed on a board: a unit or a monster. */
export type FighterId = UnitId | MonsterId;

export interface MonsterDef {
  readonly id: MonsterId;
  readonly name: string;
  readonly large?: boolean;
  readonly stats: StatTemplate;
  /** Ability values scale like a unit of this cost. */
  readonly cost: Cost;
  readonly ability?: AbilityDef;
  /** Health and Attack Damage grow by this percent for each stage after `afterStage`. */
  readonly growth?: { readonly pctPerStage: number; readonly afterStage: number };
}

export const MONSTERS: Readonly<Record<MonsterId, MonsterDef>> = {
  goblin: {
    id: 'goblin',
    name: 'Moria goblin',
    stats: { health: 350, attackDamage: 35, attackSpeed: 0.7, range: 1, armor: 15, magicResist: 15, startMana: 0, maxMana: 0 },
    cost: 1,
  },
  'goblin-archer': {
    id: 'goblin-archer',
    name: 'Goblin archer',
    stats: { health: 280, attackDamage: 35, attackSpeed: 0.7, range: 3, armor: 10, magicResist: 10, startMana: 0, maxMana: 0 },
    cost: 1,
  },
  warg: {
    id: 'warg',
    name: 'Warg',
    stats: { health: 600, attackDamage: 50, attackSpeed: 0.85, range: 1, armor: 25, magicResist: 25, startMana: 0, maxMana: 0 },
    cost: 1,
  },
  'cave-troll': {
    id: 'cave-troll',
    name: 'Cave Troll',
    large: true,
    stats: { health: 2400, attackDamage: 110, attackSpeed: 0.55, range: 1, armor: 40, magicResist: 30, startMana: 0, maxMana: 80 },
    cost: 3,
    ability: {
      name: 'Smash',
      steps: [
        {
          select: { kind: 'adjacentEnemies' },
          effects: [
            { kind: 'damage', pct: 100, type: 'physical' },
            { kind: 'stun', seconds: 1 },
          ],
        },
      ],
    },
  },
  watcher: {
    id: 'watcher',
    name: 'Watcher in the Water',
    large: true,
    stats: { health: 3200, attackDamage: 120, attackSpeed: 0.6, range: 2, armor: 40, magicResist: 40, startMana: 0, maxMana: 70 },
    cost: 4,
    ability: {
      name: 'Tentacles',
      steps: [
        {
          select: { kind: 'area', radius: 1, around: { kind: 'target' } },
          effects: [
            { kind: 'damage', pct: 80, type: 'physical' },
            { kind: 'stun', seconds: 1.5 },
          ],
        },
      ],
    },
  },
  mumak: {
    id: 'mumak',
    name: 'Mûmak',
    large: true,
    stats: { health: 4500, attackDamage: 150, attackSpeed: 0.5, range: 1, armor: 60, magicResist: 40, startMana: 0, maxMana: 80 },
    cost: 4,
    ability: {
      name: 'Trample',
      steps: [
        {
          select: { kind: 'line', length: 3 },
          effects: [{ kind: 'damage', pct: 100, type: 'physical' }, { kind: 'stun', seconds: 1 }, { kind: 'dashThroughLine' }],
        },
      ],
    },
  },
  balrog: {
    id: 'balrog',
    name: 'The Balrog',
    large: true,
    stats: { health: 6000, attackDamage: 180, attackSpeed: 0.7, range: 2, armor: 60, magicResist: 60, startMana: 0, maxMana: 70 },
    cost: 5,
    ability: {
      name: 'Whip of flame',
      steps: [
        {
          select: { kind: 'cone' },
          effects: [
            { kind: 'damage', pct: 120, type: 'magic' },
            { kind: 'stun', seconds: 1 },
          ],
        },
      ],
    },
    growth: { pctPerStage: 25, afterStage: 6 },
  },
};
