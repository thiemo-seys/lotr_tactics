// The items a unit holds (docs/sim-spec.md sections 12.4 and 12.7): their stats, their effects,
// which combined item two components make, and the Rings of Power.

import {
  COMPONENTS,
  ITEMS,
  type CombinedItemId,
  type ComponentId,
  type ItemEffect,
  type ItemId,
  type ItemStats,
  type RingOfPowerId,
} from '../data/items.js';
import type { OriginId } from '../data/traits.js';
import { combineModifiers, type StatModifiers } from './stats.js';

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function isItemId(id: unknown): id is ItemId {
  return typeof id === 'string' && Object.hasOwn(ITEMS, id);
}

export function isComponent(id: ItemId): id is ComponentId {
  return (COMPONENTS as readonly ItemId[]).includes(id);
}

export function isCombined(id: ItemId): id is CombinedItemId {
  return ITEMS[id].recipe !== null;
}

export function isRingOfPower(id: ItemId): id is RingOfPowerId {
  return ITEMS[id].ringOfPower !== undefined;
}

/** The Three and the Nine, which the One Ring's destruction takes out of the game (game-spec.md section 9.12). */
export function isBoundToTheOne(id: ItemId): boolean {
  return isRingOfPower(id) && ITEMS[id].ringOfPower!.family !== 'seven';
}

/** The 21 combined items, which some rewards give at random. */
export const COMBINED_ITEM_IDS = ITEM_IDS.filter(isCombined);

export const RING_OF_POWER_IDS = ITEM_IDS.filter(isRingOfPower);

const RECIPES = new Map<string, CombinedItemId>(
  ITEM_IDS.flatMap((id) => {
    const recipe = ITEMS[id].recipe;
    return recipe === null ? [] : [[recipeKey(...recipe), id as CombinedItemId] as const];
  }),
);

function recipeKey(a: ComponentId, b: ComponentId): string {
  return COMPONENTS.indexOf(a) <= COMPONENTS.indexOf(b) ? `${a}+${b}` : `${b}+${a}`;
}

/** The combined item two components make, in either order. */
export function combine(a: ComponentId, b: ComponentId): CombinedItemId {
  return RECIPES.get(recipeKey(a, b))!;
}

/** An item's stats: a component's own, or a combined item's components' stats plus its own. */
export function itemStats(id: ItemId): ItemStats {
  const { recipe, stats } = ITEMS[id];
  if (recipe === null) return stats;
  return combineModifiers(ITEMS[recipe[0]].stats, ITEMS[recipe[1]].stats, stats);
}

/** The stat bonuses from the items a unit holds. Copies add up. */
export function itemModifiers(items: readonly ItemId[]): Partial<StatModifiers> {
  return combineModifiers(...items.map(itemStats));
}

/**
 * The effects of the items a unit of an origin holds, in the order it holds them. Each comes with
 * the percent of its listed numbers it has: 100, or more for a Ring of Power on its kin.
 */
export function itemEffects(items: readonly ItemId[], origin: OriginId | null): { effect: ItemEffect; pct: number }[] {
  return items.flatMap((id) => {
    const { effect, ringOfPower } = ITEMS[id];
    if (effect === null) return [];
    const kin = ringOfPower?.kin;
    return [{ effect, pct: kin !== undefined && origin !== null && kin.origins.includes(origin) ? kin.pct : 100 }];
  });
}
