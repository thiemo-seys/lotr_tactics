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

/** What the One Ring does at a Corruption, in parts a tooltip can lay out. */
export interface RingInfo {
  readonly corruption: number;
  readonly tier: RingTier;
  /** What it gives its bearer, then each drawback that applies. */
  readonly effects: readonly { readonly text: string; readonly drawback: boolean }[];
  /** How Corruption grows, and what eases it. */
  readonly note: string;
}

export function ringInfo(corruption: number): RingInfo {
  const effects = [
    {
      text: `The bearer deals ${corruption * RING.damagePctPerCorruption}% more damage and can't be targeted for the first ${RING.untargetableSeconds} seconds.`,
      drawback: false,
    },
  ];
  if (corruption >= RING.burden.from) {
    effects.push({ text: `Stretched thin: −${RING.burden.healthPctPerPoint * (corruption - RING.burden.from + 1)}% max Health.`, drawback: true });
  }
  if (corruption >= RING.gripFrom) effects.push({ text: "Mine!: allies' heals and shields don't reach the bearer.", drawback: true });
  if (corruption >= RING.betrayal.at) effects.push({ text: `Betrayal: attacks its nearest ally for the first ${RING.betrayal.seconds} seconds.`, drawback: true });
  return {
    corruption,
    tier: ringTier(corruption),
    effects,
    note: `Corruption rises each round it is worn, every other round on a Hobbit. At ${RING.consumedAt} the bearer is lost. Sam next to the bearer eases the drawbacks.`,
  };
}

/** What the Ring does to its bearer at a Corruption, one line per effect. */
export function ringText(corruption: number): string {
  const { tier, effects, note } = ringInfo(corruption);
  return [`The One Ring · Corruption ${corruption} (${tier})`, ...effects.map((e) => e.text), note].join('\n');
}
