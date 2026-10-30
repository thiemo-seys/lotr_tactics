// Boards to fight with: the sample boards from the sim's tests, or random ones
// (docs/viewer-spec.md section 6). Placements are in each team's own perspective.

import {
  BOARD_COLS,
  COMBINED_ITEM_IDS,
  MAX_ITEMS,
  TEAM_ROWS,
  UNITS,
  boardPlace,
  createRng,
  type ItemId,
  type PlacedUnit,
  type Star,
  type Team,
  type UnitId,
} from '@lotr-tactics/sim';

function placed(unitId: UnitId, col: number, row: number, star: Star = 1, items: readonly ItemId[] = []): PlacedUnit {
  return { unitId, star, col, row, items };
}

export const PRESETS = {
  duel: [placed('sam', 3, 3)],
  tanks: [placed('sam', 2, 3), placed('gimli', 3, 3), placed('hama', 4, 3)],
  archers: [placed('legolas', 1, 1), placed('haldir', 3, 1), placed('faramir', 5, 1)],
  mixed: [placed('boromir', 3, 3), placed('legolas', 2, 0), placed('eomer', 1, 3), placed('saruman', 5, 0)],
  full: [
    placed('gimli', 2, 3),
    placed('dain', 3, 3),
    placed('beregond', 4, 3),
    placed('aragorn', 1, 2),
    placed('theoden', 3, 2),
    placed('boromir', 5, 2),
    placed('legolas', 0, 0),
    placed('gandalf', 3, 0),
    placed('haldir', 6, 0),
  ],
  items: [
    placed('gimli', 2, 3, 1, ['oakenshield', 'dragon-helm', 'mithril-shirt']),
    placed('dain', 3, 3, 1, ['star-of-elendil', 'elven-cloak', 'ent-draught']),
    placed('beregond', 4, 3, 1, ['miruvor', 'kings-banner', 'herugrim']),
    placed('aragorn', 1, 2, 1, ['anduril', 'black-arrow', 'orcrist']),
    placed('theoden', 3, 2, 1, ['glamdring', 'grond']),
    placed('boromir', 5, 2, 1, ['elven-rope', 'phial']),
    placed('legolas', 0, 0, 1, ['galadhrim-bow', 'palantir']),
    placed('gandalf', 3, 0, 1, ['wizards-staff', 'athelas', 'sting']),
    placed('haldir', 6, 0, 1, ['blade', 'staff']),
  ],
  /** Aragorn bears the One Ring at Corruption 6 with Sam beside him; the other side gets the Eye's Nazgûl. */
  ring: [
    { ...placed('aragorn', 3, 3), ring: 6 },
    placed('sam', 2, 3),
    placed('gimli', 4, 3),
    placed('legolas', 1, 0),
    placed('gandalf', 4, 0),
  ],
  /** The Three on their own bearers, a Ring of the Seven, and two Rings of the Nine making a third Nazgûl. */
  rings: [
    placed('gimli', 2, 3, 1, ['ring-of-the-seven']),
    placed('boromir', 3, 3, 1, ['ring-of-the-nine']),
    placed('theoden', 4, 3, 1, ['ring-of-the-nine']),
    placed('ringwraith', 3, 2),
    placed('galadriel', 2, 0, 1, ['nenya']),
    placed('gandalf', 3, 0, 1, ['narya']),
    placed('elrond', 4, 0, 1, ['vilya']),
  ],
  traits: [
    placed('khamul', 2, 3),
    placed('eomer', 3, 3),
    placed('sharku', 4, 3),
    placed('ringwraith', 3, 2),
    placed('merry', 1, 1),
    placed('grishnakh', 5, 1),
    placed('gandalf', 2, 0),
    placed('sauron', 3, 0),
    placed('saruman', 4, 0),
  ],
} satisfies Record<string, PlacedUnit[]>;

export type BoardChoice = keyof typeof PRESETS | 'random';

export const BOARD_CHOICES: readonly BoardChoice[] = [...(Object.keys(PRESETS) as (keyof typeof PRESETS)[]), 'random'];

export function isBoardChoice(value: string): value is BoardChoice {
  return (BOARD_CHOICES as readonly string[]).includes(value);
}

/** Units on a random board. */
export const RANDOM_BOARD_SIZE = 7;

/** Both teams' boards. Only one unit can bear the One Ring, so with two bearers team A keeps it. */
export function fightBoards(a: BoardChoice, b: BoardChoice, seed: number): { A: readonly PlacedUnit[]; B: readonly PlacedUnit[] } {
  const A = boardFor(a, seed, 'A');
  const B = boardFor(b, seed, 'B');
  const ringInA = A.some((p) => p.ring !== undefined);
  return { A, B: ringInA ? B.map((p) => ({ unitId: p.unitId, star: p.star, col: p.col, row: p.row, items: p.items })) : B };
}

/** A board for one team: a preset, or a random one from the seed and the team. */
export function boardFor(choice: BoardChoice, seed: number, team: Team): readonly PlacedUnit[] {
  return choice === 'random' ? randomBoard(seed, team) : PRESETS[choice];
}

/**
 * Distinct units with random star levels on random hexes of the team's half, each with up to 3
 * random combined items. The same seed and team give the same board.
 */
export function randomBoard(seed: number, team: Team): PlacedUnit[] {
  const rng = createRng((seed ^ (team === 'A' ? 0x2545f491 : 0x6c8e9cf5)) | 0);
  const pick = <T>(list: T[]): T => list.splice(Math.floor(rng() * list.length), 1)[0]!;
  const units = Object.keys(UNITS) as UnitId[];
  const hexes = Array.from({ length: BOARD_COLS * TEAM_ROWS }, (_, i) => boardPlace(i));
  const board = Array.from({ length: RANDOM_BOARD_SIZE }, () => {
    const roll = rng();
    const star: Star = roll < 0.6 ? 1 : roll < 0.9 ? 2 : 3;
    const { col, row } = pick(hexes);
    return placed(pick(units), col, row, star);
  });
  // Items come after the units, so a seed's units are the same as before items existed.
  return board.map((p) => ({
    ...p,
    items: Array.from({ length: Math.floor(rng() * (MAX_ITEMS + 1)) }, () => COMBINED_ITEM_IDS[Math.floor(rng() * COMBINED_ITEM_IDS.length)]!),
  }));
}
