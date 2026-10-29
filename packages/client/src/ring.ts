// How the One Ring reads in the client (docs/game-spec.md section 12): its tier and what it does
// at a Corruption, from the Ring's numbers. No Three.js or DOM, so it can be tested.

import { RING } from '@lotr-tactics/sim';

export type RingTier = 'Gift' | 'Burden' | 'Grip' | 'Betrayal';

/** The tier of the drawbacks at a Corruption (design.md section 9). */
export function ringTier(corruption: number): RingTier {
  if (corruption >= RING.betrayal.at) return 'Betrayal';
  if (corruption >= RING.gripFrom) return 'Grip';
  if (corruption >= RING.burden.from) return 'Burden';
  return 'Gift';
}

/** What the Ring does to its bearer at a Corruption, one line per effect. */
export function ringText(corruption: number): string {
  const lines = [
    `The One Ring · Corruption ${corruption} (${ringTier(corruption)})`,
    `The bearer deals ${corruption * RING.damagePctPerCorruption}% more damage and can't be targeted for the first ${RING.untargetableSeconds} seconds.`,
  ];
  if (corruption >= RING.burden.from) {
    lines.push(`Stretched thin: −${RING.burden.healthPctPerPoint * (corruption - RING.burden.from + 1)}% max Health.`);
  }
  if (corruption >= RING.gripFrom) lines.push("Mine!: allies' heals and shields don't reach the bearer.");
  if (corruption >= RING.betrayal.at) lines.push(`Betrayal: attacks its nearest ally for the first ${RING.betrayal.seconds} seconds.`);
  lines.push(
    `Corruption rises each round it is worn, every other round on a Hobbit. At ${RING.consumedAt} the bearer is lost. Sam next to the bearer eases the drawbacks.`,
  );
  return lines.join('\n');
}
