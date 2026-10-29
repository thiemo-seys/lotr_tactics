// PvE boards and loot (docs/game-spec.md section 9.7). Placeholders until PvE is designed.
// Monsters are placed in team B's own perspective: row 3 is their front row.

import type { MonsterId } from './monsters.js';

export interface PveRound {
  readonly monsters: readonly { readonly unitId: MonsterId; readonly col: number; readonly row: number }[];
  readonly loot: { readonly components: number; readonly gold: number };
}

const at = (unitId: MonsterId, col: number, row: number) => ({ unitId, col, row });

/** Keyed by "stage-round". `later` is every PvE round from stage 6 on. */
export const PVE_ROUNDS: Readonly<Record<'1-2' | '1-3' | '1-4' | '2-7' | '3-7' | '4-7' | '5-7' | 'later', PveRound>> = {
  '1-2': { monsters: [at('goblin', 2, 3), at('goblin', 4, 3)], loot: { components: 1, gold: 0 } },
  '1-3': { monsters: [at('goblin', 2, 3), at('goblin', 4, 3), at('goblin-archer', 3, 1)], loot: { components: 1, gold: 0 } },
  '1-4': {
    monsters: [at('goblin', 2, 3), at('goblin', 4, 3), at('goblin-archer', 1, 1), at('goblin-archer', 5, 1)],
    loot: { components: 1, gold: 2 },
  },
  '2-7': {
    monsters: [at('warg', 1, 3), at('warg', 2, 3), at('warg', 4, 3), at('warg', 5, 3)],
    loot: { components: 1, gold: 2 },
  },
  '3-7': {
    monsters: [at('cave-troll', 3, 3), at('goblin', 2, 3), at('goblin', 4, 3), at('goblin-archer', 2, 1), at('goblin-archer', 4, 1)],
    loot: { components: 2, gold: 0 },
  },
  '4-7': { monsters: [at('watcher', 3, 2), at('warg', 2, 3), at('warg', 4, 3)], loot: { components: 2, gold: 2 } },
  '5-7': {
    monsters: [at('mumak', 3, 3), at('goblin-archer', 1, 1), at('goblin-archer', 3, 1), at('goblin-archer', 5, 1)],
    loot: { components: 2, gold: 4 },
  },
  later: {
    monsters: [at('balrog', 3, 2), at('goblin', 1, 3), at('goblin', 2, 3), at('goblin', 4, 3), at('goblin', 5, 3)],
    loot: { components: 2, gold: 4 },
  },
};
