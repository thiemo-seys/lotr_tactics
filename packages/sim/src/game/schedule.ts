// The round schedule and player damage (docs/game-spec.md sections 9.1 and 9.9).

import type { Survivor } from '../combat/combat.js';
import { PVE_ROUNDS, type PveRound } from '../data/pve.js';
import { COUNCIL, SCHEDULE, STAGE_DAMAGE, SURVIVOR_DAMAGE, type RoundType } from '../data/rounds.js';
import type { Cost } from '../data/units.js';

function stageRounds(stage: number): readonly RoundType[] {
  return stage === 1 ? SCHEDULE.firstStage : SCHEDULE.laterStages;
}

export function roundsInStage(stage: number): number {
  return stageRounds(stage).length;
}

export function roundType(stage: number, round: number): RoundType {
  const type = stageRounds(stage)[round - 1];
  if (type === undefined) throw new Error(`Stage ${stage} has no round ${round}.`);
  return type;
}

/** The round after this one, as [stage, round]. */
export function nextRound(stage: number, round: number): [number, number] {
  return round < roundsInStage(stage) ? [stage, round + 1] : [stage + 1, 1];
}

/** The last entry of a by-stage table holds for every later stage. */
function byStage<T>(table: readonly T[], stage: number): T {
  return table[Math.min(stage, table.length) - 1]!;
}

export function stageDamage(stage: number): number {
  return byStage(STAGE_DAMAGE, stage);
}

/** Damage to a player who lost or drew a fight: stage damage plus the enemy's survivors (section 9.9). */
export function playerDamage(stage: number, enemySurvivors: readonly Survivor[]): number {
  let damage = stageDamage(stage);
  for (const { star } of enemySurvivors) damage += SURVIVOR_DAMAGE[star - 1]!;
  return damage;
}

export function councilCosts(stage: number): readonly Cost[] {
  return byStage(COUNCIL.costs, stage);
}

/** The monsters and loot of a PvE round. */
export function pveRound(stage: number, round: number): PveRound {
  const key = `${stage}-${round}`;
  if (roundType(stage, round) !== 'pve') throw new Error(`${key} is not a PvE round.`);
  return stage >= 6 ? PVE_ROUNDS.later : PVE_ROUNDS[key as keyof typeof PVE_ROUNDS];
}
