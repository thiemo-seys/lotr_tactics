// Combat numbers that don't belong to a unit or trait (docs/sim-spec.md sections 2, 6 and 9–11).
// All numbers are placeholders until balancing. Durations are in seconds; percentages are whole numbers.

export const TICKS_PER_SECOND = 30;

export const TIMING = {
  fightSeconds: 30,
  overtimeSeconds: 15,
  /** Extra damage for each full second of overtime. */
  overtimeDamagePctPerSecond: 10,
} as const;

export const MOVEMENT = {
  secondsPerHex: 0.5,
  /** How long a unit is busy after a dash or leap, which is instant in the sim. */
  dashBusySeconds: 0.3,
} as const;

export const ATTACKS = {
  projectileHexesPerSecond: 12,
} as const;

export const MANA = {
  perAttack: 10,
  fromDamagePct: 6,
  fromDamageMaxPerHit: 15,
} as const;

export const ABILITIES = {
  castSeconds: 0.5,
  shieldSeconds: 4,
  /** D, S and H: the base damage, shield and heal that ability numbers are percents of. */
  base: { D: 200, S: 250, H: 200 },
  costPctPerCost: 25,
  /** Value multiplier at 1★ / 2★ / 3★. */
  starPct: [100, 150, 225],
} as const;

export const STAT_LIMITS = {
  minAttackSpeed: 0.2,
  maxAttackSpeed: 5,
  maxCritChancePct: 100,
  maxDodgePct: 60,
} as const;
