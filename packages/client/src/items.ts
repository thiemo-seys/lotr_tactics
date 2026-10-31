// How items look and read in the client (docs/game-spec.md section 12, docs/viewer-spec.md
// section 4): colours for each item and Ring of Power, and what each item is and does, built from
// the item data, so the numbers shown are always the sim's. No Three.js or DOM, so it can be
// tested.

import {
  ITEMS,
  TRAITS,
  isRingOfPower,
  itemStats,
  type BuffStat,
  type ComponentId,
  type ItemEffect,
  type ItemId,
  type ItemStats,
  type RingFamily,
  type RingOfPowerDef,
  type RingOfPowerId,
} from '@lotr-tactics/sim';

export const COMPONENT_COLOURS: Readonly<Record<ComponentId, string>> = {
  blade: '#dc2626',
  bow: '#d97706',
  mail: '#64748b',
  cloak: '#9333ea',
  lembas: '#16a34a',
  staff: '#2563eb',
};

/** A Ring of Power's gold, then its stone or its maker's colour. */
export const RING_COLOURS: Readonly<Record<RingOfPowerId, readonly [string, string]>> = {
  narya: ['#eab308', '#dc2626'],
  nenya: ['#eab308', '#e5e7eb'],
  vilya: ['#eab308', '#2563eb'],
  'ring-of-the-seven': ['#eab308', '#92400e'],
  'ring-of-the-nine': ['#eab308', '#111827'],
};

/** A component's colour twice, a combined item's two components' colours, or a Ring of Power's gold and stone. */
export function itemColours(id: ItemId): readonly [string, string] {
  if (isRingOfPower(id)) return RING_COLOURS[id];
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
    case 'attackSpeedAura':
      return `The holder and allies within ${effect.radius} hexes gain +${effect.pct}% Attack Speed.`;
    case 'shieldPulse':
      return `At combat start and every ${effect.everySeconds} seconds, the holder and allies within ${effect.radius} hexes gain a ${effect.amount} shield for ${effect.seconds}s.`;
    case 'healPulse':
      return `Every ${effect.everySeconds} seconds, heals the ally with the lowest Health % for ${effect.amount}.`;
    case 'goldPerRound':
      return `After each PvP or PvE round with the holder on your board, gain ${effect.gold} gold.`;
    case 'nazgul':
      return `The holder is a Nazgûl as well as its own origin. While a player holds the One Ring, it deals ${effect.damagePctPerCorruption}% more damage per point of the One Ring's Corruption.`;
  }
}

/** Stat bonuses, one each, such as ["+15% Attack Damage", "+20 Armor"]. */
export function statLines(stats: ItemStats): string[] {
  return STATS.flatMap(({ key, name, pct }) => {
    const value = stats[key] ?? 0;
    return value === 0 ? [] : [`+${value}${pct ? '%' : ''} ${name}`];
  });
}

/** Stat bonuses as text, such as "+15% Attack Damage, +20 Armor". */
export function statsText(stats: ItemStats): string {
  return statLines(stats).join(', ');
}

const FAMILY_NAMES: Readonly<Record<RingFamily, string>> = { three: 'the Three', seven: 'the Seven', nine: 'the Nine' };

/** A Ring of Power's bonus on its kin, such as "50% stronger on Elf or Istari bearers." */
function kinText(kin: NonNullable<RingOfPowerDef['kin']>): string {
  const bearers = `on ${kin.origins.map((o) => TRAITS[o].name).join(' or ')} bearers`;
  return kin.pct === 200 ? `Double ${bearers}.` : `${kin.pct - 100}% stronger ${bearers}.`;
}

export type ItemKind = 'component' | 'combined' | 'ring-of-power';

/** What an item is and does, from the item data, in parts a tooltip can lay out. */
export interface ItemInfo {
  readonly name: string;
  readonly kind: ItemKind;
  /** "Component", the recipe such as "Blade + Cloak", or the ring's family such as "Ring of Power: the Three". */
  readonly kindText: string;
  /** A combined item's two components. */
  readonly recipe: readonly [ComponentId, ComponentId] | null;
  /** Stat bonuses, one each. A Ring of Power has none. */
  readonly stats: readonly string[];
  readonly effect: string | null;
  /** A Ring of Power's bonus on its kin. */
  readonly kin: string | null;
}

export function itemInfo(id: ItemId): ItemInfo {
  const { name, recipe, effect, ringOfPower } = ITEMS[id];
  const kind: ItemKind = ringOfPower !== undefined ? 'ring-of-power' : recipe === null ? 'component' : 'combined';
  return {
    name,
    kind,
    kindText:
      ringOfPower !== undefined
        ? `Ring of Power: ${FAMILY_NAMES[ringOfPower.family]}`
        : recipe === null
          ? 'Component'
          : `${ITEMS[recipe[0]].name} + ${ITEMS[recipe[1]].name}`,
    recipe: recipe === null ? null : [recipe[0], recipe[1]],
    stats: statLines(itemStats(id)),
    effect: effect === null ? null : effectText(effect),
    kin: ringOfPower?.kin === undefined ? null : kinText(ringOfPower.kin),
  };
}

/** An item's name, recipe, stats and effect as text. A Ring of Power has no stats, and may have a kin bonus. */
export function itemText(id: ItemId): string {
  const info = itemInfo(id);
  const kind = info.kind === 'component' ? 'component' : info.kindText;
  return [
    `${info.name} (${kind})`,
    ...(info.stats.length === 0 ? [] : [info.stats.join(', ')]),
    ...(info.effect === null ? [] : [info.effect]),
    ...(info.kin === null ? [] : [info.kin]),
  ].join('\n');
}
