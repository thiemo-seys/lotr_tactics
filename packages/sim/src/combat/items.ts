// The items a unit holds (docs/sim-spec.md section 12.4): their stats, their effects, and which
// combined item two components make.

import { COMPONENTS, ITEMS, type CombinedItemId, type ComponentId, type ItemEffect, type ItemId, type ItemStats } from '../data/items.js';
import { combineModifiers, type StatModifiers } from './stats.js';

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function isItemId(id: unknown): id is ItemId {
  return typeof id === 'string' && Object.hasOwn(ITEMS, id);
}

export function isComponent(id: ItemId): id is ComponentId {
  return ITEMS[id].recipe === null;
}

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

/** The effects of the items a unit holds, in the order it holds them. */
export function itemEffects(items: readonly ItemId[]): ItemEffect[] {
  return items.flatMap((id) => (ITEMS[id].effect === null ? [] : [ITEMS[id].effect]));
}
