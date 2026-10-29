// The One Ring (docs/design.md section 9). Fights: docs/sim-spec.md section 12.6; the rest:
// docs/game-spec.md section 9.11. All numbers are placeholders until balancing. Percentages are
// whole numbers and durations are in seconds.

export const RING = {
  /** The first stage whose Council can bring the Ring. */
  firstStage: 3,
  /** The bearer can't be targeted for this long at the start of each fight. */
  untargetableSeconds: 3,
  damagePctPerCorruption: 10,
  /** Stretched thin: from this level, the bearer loses max Health for each point above `from - 1`. */
  burden: { from: 4, healthPctPerPoint: 5 },
  /** "Mine!": from this level, allies' heals and shields don't reach the bearer. */
  gripFrom: 7,
  /** At this level the bearer attacks its own team at the start of each fight. */
  betrayal: { at: 9, seconds: 3 },
  /** At this Corruption the bearer is lost. */
  consumedAt: 10,
  /** Sam next to the bearer lowers the drawbacks' level by this much. */
  samRelief: 2,
  /** Hobbit bearers gain one Corruption every this many rounds. */
  hobbitRoundsPerCorruption: 2,
  /** Mount Doom: Hobbit bearers' fights needed, and the reward. */
  destroy: { hobbitFights: 3, gold: 30, combinedItems: 1 },
  /** The Eye's Nazgûl, which hunts the bearer. */
  eye: {
    health: 500,
    healthPerCorruption: 100,
    attackDamage: 40,
    attackDamagePerCorruption: 10,
    attackSpeed: 0.8,
    range: 1,
    armor: 30,
    magicResist: 30,
  },
} as const;
