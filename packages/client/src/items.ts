// How items look and read in the client (docs/game-spec.md section 12, docs/viewer-spec.md
// section 4): a short tag and colours for each item, and a description built from the item data,
// so the numbers shown are always the sim's. No Three.js or DOM, so it can be tested.

import { ITEMS, itemStats, type BuffStat, type ComponentId, type ItemEffect, type ItemId, type ItemStats } from '@lotr-tactics/sim';

export const COMPONENT_COLOURS: Readonly<Record<ComponentId, string>> = {
  blade: '#dc2626',
  bow: '#d97706',
  mail: '#64748b',
  cloak: '#9333ea',
  lembas: '#16a34a',
  staff: '#2563eb',
};

/** Words left out of tags. */
const SMALL_WORDS = new Set(['of', 'the']);

/** Two letters for an item: the initials of a name of several words, otherwise its first two letters. */
export function itemTag(id: ItemId): string {
  const words = ITEMS[id].name.split(' ').filter((w) => !SMALL_WORDS.has(w));
  return words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 2) : words[0]!.slice(0, 2);
}

/** A component's colour twice, or a combined item's two components' colours. */
export function itemColours(id: ItemId): readonly [string, string] {
  const recipe = ITEMS[id].recipe;
  const [a, b] = recipe ?? [id as ComponentId, id as ComponentId];
  return [COMPONENT_COLOURS[a], COMPONENT_COLOURS[b]];
}

/** Stats in the order they are listed, with their names and whether they are percents. */
const STATS: readonly { key: keyof ItemStats; name: string; pct: boolean }[] = [
  { key: 'health', name: 'Health', pct: false },
  { key: 'attackDamagePct', name: 'Attack Damage', pct: true },
  { key: 'attackSpeedPct', name: 'Attack Speed', pct: true },
  { key: 'armor', name: 'Armor', pct: false },
  { key: 'magicResist', name: 'Magic Resist', pct: false },
  { key: 'abilityPower', name: 'Ability Power', pct: false },
  { key: 'critChancePct', name: 'Crit Chance', pct: true },
];

function bonus(stat: BuffStat, amount: number): string {
  const { name, pct } = STATS.find((s) => s.key === stat)!;
  return `+${amount}${pct ? '%' : ''} ${name}`;
}

function effectText(effect: ItemEffect): string {
  switch (effect.kind) {
    case 'buffOnKill':
      return `Each kill gives ${bonus(effect.stat, effect.amount)} for the rest of the fight.`;
    case 'ampVsHealthier':
      return `Deals ${effect.pct}% more damage to enemies with more max Health than the holder.`;
    case 'lowHealth': {
      const parts = [
        effect.untargetableSeconds === undefined ? null : `untargetable for ${effect.untargetableSeconds}s`,
        effect.shield === undefined ? null : `a shield of ${effect.shield.maxHealthPct}% of max Health for ${effect.shield.seconds}s`,
        `${bonus(effect.buff.stat, effect.buff.amount)} for the rest of the fight`,
      ].filter((p) => p !== null);
      return `The first time Health falls below ${effect.belowPct}%: ${parts.join(' and ')}.`;
    }
    case 'abilityCrit':
      return "The holder's abilities can crit.";
    case 'healOnDamage':
      return `Heals for ${effect.pct}% of all damage the holder deals.`;
    case 'extraAttack':
      return `Each basic attack also fires at another enemy in range, for ${effect.damagePct}% damage.`;
    case 'stackOnAttack':
      return `Each basic attack gives ${bonus(effect.stat, effect.amount)} for the rest of the fight, up to ${effect.maxStacks} times.`;
    case 'startStunImmune':
      return `Can't be stunned for the first ${effect.seconds} seconds.`;
    case 'startBuff':
      return `At combat start, the holder and adjacent allies gain ${bonus(effect.stat, effect.amount)} for the rest of the fight.`;
    case 'manaOnAttack':
      return `Each basic attack gives ${effect.amount} more mana.`;
    case 'reflect':
      return `A basic attack that hits the holder deals ${effect.pct}% of its damage back to the attacker as magic damage.`;
    case 'damageReduction':
      return `Takes ${effect.pct}% less damage${effect.critImmune ? '; crits against the holder deal normal damage' : ''}.`;
    case 'burn':
      return `Every second, deals magic damage equal to ${effect.maxHealthPct}% of the holder's max Health to adjacent enemies.`;
    case 'startShield':
      return `At combat start, the holder and adjacent allies gain a ${effect.amount} shield for ${effect.seconds} seconds.`;
    case 'regen':
      return `Regenerates ${effect.maxHealthPct}% of max Health every second.`;
    case 'startStun':
      return `At combat start, stuns the enemy farthest from the holder for ${effect.seconds}s.`;
    case 'magicResistAura':
      return `Enemies within ${effect.radius} hexes of the holder have ${effect.pct}% less Magic Resist.`;
    case 'healOnCast':
      return `After each cast, heals the ally with the lowest Health % for ${effect.amount}.`;
  }
}

/** Stat bonuses as text, such as "+15% Attack Damage, +20 Armor". */
export function statsText(stats: ItemStats): string {
  return STATS.flatMap(({ key, name, pct }) => {
    const value = stats[key] ?? 0;
    return value === 0 ? [] : [`+${value}${pct ? '%' : ''} ${name}`];
  }).join(', ');
}

/** An item's name, recipe, stats and effect, for a tooltip. */
export function itemText(id: ItemId): string {
  const { name, recipe, effect } = ITEMS[id];
  const statText = statsText(itemStats(id));
  const title = recipe === null ? `${name} (component)` : `${name} (${ITEMS[recipe[0]].name} + ${ITEMS[recipe[1]].name})`;
  return [title, statText, ...(effect === null ? [] : [effectText(effect)])].join('\n');
}
