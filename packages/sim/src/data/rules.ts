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
  /** Dashes, leaps and charges, from abilities and from the Rider and Burglar traits (section 10.4). */
  dashHexesPerSecond: 6,
  /** How long a Burglar or Rider is busy after its leap or charge at combat start arrives (section 12.3). */
  dashRecoverySeconds: 0.1,
} as const;

export const ATTACKS = {
  /** Ranged attacks' and abilities' projectiles (sections 9 and 10.6). */
  projectileHexesPerSecond: 12,
  /** A melee blow lands this long after the attack fires (section 9). */
  meleeHitSeconds: 0.22,
} as const;

export const MANA = {
  perAttack: 10,
  fromDamagePct: 6,
  fromDamageMaxPerHit: 15,
} as const;

export const ABILITIES = {
  /** After its part of a cast is done, the caster is busy this long more (section 10.6). */
  recoverySeconds: 0.1,
  /** A lobbed ability lands this long after it leaves, whatever the distance (section 10.6). */
  lobSeconds: 0.75,
  /** The hits of a multi-hit ability come this far apart (section 10.6). */
  multiHitSeconds: 0.1,
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
