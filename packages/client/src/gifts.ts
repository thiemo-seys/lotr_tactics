// How Gifts of Lothlórien read in the client (docs/game-spec.md section 12): tier names and a
// description built from the Gift data, so the numbers shown are always the sim's. No Three.js or
// DOM, so it can be tested.

import { GIFTS, TRAITS, type GiftId, type GiftTier } from '@lotr-tactics/sim';
import { statsText } from './items.js';

export const TIER_NAMES: Readonly<Record<GiftTier, string>> = { silver: 'Silver', gold: 'Gold', mithril: 'Mithril' };

const WHO = { all: 'Your units', front: 'Your front-row units', back: 'Your back-row units' } as const;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** What a Gift does, one sentence per effect. */
export function giftEffect(id: GiftId): string {
  const { combat, economy } = GIFTS[id];
  const lines: string[] = [];
  if (combat !== undefined) {
    if (combat.stats !== undefined) lines.push(`${WHO[combat.who ?? 'all']} gain ${statsText(combat.stats)}.`);
    if (combat.startMana !== undefined) lines.push(`Your units start combat with ${combat.startMana} more mana.`);
    if (combat.startShield !== undefined) {
      lines.push(`At combat start, your units gain a ${combat.startShield.amount} shield for ${combat.startShield.seconds} seconds.`);
    }
    if (combat.regenPct !== undefined) lines.push(`Your units regenerate ${combat.regenPct}% of max Health every second.`);
    if (combat.damageAmpPct !== undefined) lines.push(`Your units deal ${combat.damageAmpPct}% more damage.`);
    if (combat.damageAmpPctPerOrigin !== undefined) {
      lines.push(`Your units deal ${combat.damageAmpPctPerOrigin}% more damage for each different origin among them.`);
    }
    if (combat.stunEnemiesSeconds !== undefined) lines.push(`At combat start, all enemies are stunned for ${combat.stunEnemiesSeconds} seconds.`);
    if (combat.crest !== undefined) lines.push(`Crest: counts one more ${TRAITS[combat.crest].name}, if you have one.`);
  }
  if (economy !== undefined) {
    if (economy.gold !== undefined) lines.push(`Gain ${economy.gold} gold.`);
    if (economy.components !== undefined) lines.push(`Gain ${plural(economy.components, 'a random item component', 'random item components')}.`);
    if (economy.combinedItems !== undefined) lines.push(`Gain ${plural(economy.combinedItems, 'a random combined item', 'random combined items')}.`);
    if (economy.units !== undefined) {
      const { cost, count } = economy.units;
      lines.push(`Gain ${plural(count, `a random ${cost}-cost unit`, `random ${cost}-cost units`)}.`);
    }
    if (economy.xpPerRound !== undefined) lines.push(`Gain ${economy.xpPerRound} more XP every round.`);
    if (economy.freeRerollsPerRound !== undefined) {
      const n = economy.freeRerollsPerRound;
      lines.push(n === 1 ? 'Your first reroll each round is free.' : `Your first ${n} rerolls each round are free.`);
    }
    if (economy.maxInterest !== undefined) lines.push(`Interest can reach ${economy.maxInterest} gold more.`);
    if (economy.shopLevels !== undefined) lines.push(`Your shop rolls with the odds of ${plural(economy.shopLevels, 'one level', 'levels')} higher.`);
  }
  return lines.join(' ');
}

/** A Gift's name, tier and effect, for a tooltip. */
export function giftText(id: GiftId): string {
  return `${GIFTS[id].name} (${TIER_NAMES[GIFTS[id].tier]})\n${giftEffect(id)}`;
}
