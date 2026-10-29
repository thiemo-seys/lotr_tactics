export * from './hex.js';
export * from './rng.js';
export type * from './types.js';
export * from './data/rules.js';
export * from './data/templates.js';
export * from './data/traits.js';
export * from './data/units.js';
export * from './data/economy.js';
export * from './data/items.js';
export * from './combat/stats.js';
export * from './combat/time.js';
export { createCombat, simulateCombat } from './combat/combat.js';
export type {
  Combat,
  CombatInput,
  CombatResult,
  CombatState,
  PlacedUnit,
  StatusEffect,
  Survivor,
  UnitState,
} from './combat/combat.js';
export type { ReducibleStat, StatusKind, StatusState, TimedStatus } from './combat/statuses.js';
export type * from './combat/events.js';
export { UNIT_IDS, copiesIn } from './game/pool.js';
export { TEAM_ROWS, baseIncome, streakGold, xpForNextLevel } from './game/player.js';
export type { ActionResult, OwnedUnit, Place, PlayerView } from './game/player.js';
