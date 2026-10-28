// Tick timing (docs/sim-spec.md section 6.1).

import { TICKS_PER_SECOND, TIMING } from '../data/rules.js';

/** Converts a duration from the data files into ticks. */
export function toTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}

/** The first tick of overtime. */
export const OVERTIME_START_TICK = toTicks(TIMING.fightSeconds);

/** If both teams are still alive after this tick, the fight is a draw. */
export const LAST_TICK = toTicks(TIMING.fightSeconds + TIMING.overtimeSeconds) - 1;
