import { createCombat, type CombatEvent, type PlacedUnit } from '@lotr-tactics/sim';
import { describe as group, expect, it } from 'vitest';
import { PRESETS } from '../src/boards.js';
import { describe, unitName } from '../src/log.js';

const sam: PlacedUnit = { unitId: 'sam', star: 2, col: 3, row: 3, items: [] };
const combat = createCombat({ seed: 1, stage: 2, teams: { A: [sam], B: PRESETS.duel } });
const units = combat.state.units;

group('event log', () => {
  it('names units with their team', () => {
    expect(unitName(units[0]!)).toBe('Sam (A)');
    expect(unitName(units[1]!)).toBe('Sam (B)');
  });

  it('describes events with the tick and unit names', () => {
    const lines: [CombatEvent, string | null][] = [
      [{ type: 'spawn', tick: 0, unit: 0, unitId: 'sam', team: 'A', hex: units[0]!.hex, star: 2, summon: false }, '[0] Sam (A) ★2 starts at (3, 3)'],
      [{ type: 'move', tick: 3, unit: 0, from: units[0]!.hex, to: units[0]!.hex, arriveTick: 18 }, null],
      [{ type: 'attack', tick: 1, unit: 0, target: 1, ranged: false, hitTick: 1 }, '[1] Sam (A) attacks Sam (B)'],
      [
        { type: 'damage', tick: 1, source: 0, target: 1, amount: 42, absorbed: 10, damageType: 'physical', crit: true, kind: 'attack' },
        '[1] Sam (A) deals 42 physical damage to Sam (B), crit, 10 absorbed',
      ],
      [
        { type: 'damage', tick: 5, source: 0, target: 1, amount: 120, absorbed: 0, damageType: 'magic', crit: false, kind: 'ability' },
        '[5] Sam (A) deals 120 magic damage to Sam (B) (ability)',
      ],
      [{ type: 'cast', tick: 5, unit: 0, ability: 'Loyal' }, '[5] Sam (A) casts Loyal'],
      [{ type: 'shield', tick: 5, source: 0, target: 0, amount: 150, expiresTick: 125 }, '[5] Sam (A) shields Sam (A) for 150 until tick 125'],
      [
        { type: 'status', tick: 6, source: 1, target: 0, status: 'stun', stat: null, value: null, expiresTick: 36 },
        '[6] Sam (A) is stunned until tick 36',
      ],
      [
        { type: 'status', tick: 7, source: 0, target: 0, status: 'buff', stat: 'attackSpeedPct', value: 10, expiresTick: null },
        '[7] Sam (A) gains 10% Attack Speed for the rest of the fight',
      ],
      [
        { type: 'status', tick: 8, source: 1, target: 0, status: 'reduce', stat: 'armor', value: 30, expiresTick: 128 },
        '[8] Sam (A) loses 30% Armor until tick 128',
      ],
      [{ type: 'death', tick: 9, unit: 1 }, '[9] Sam (B) dies'],
      [{ type: 'end', tick: 9, outcome: 'A' }, '[9] Team A wins'],
      [{ type: 'end', tick: 1349, outcome: 'draw' }, '[1349] The fight is a draw'],
    ];
    for (const [event, line] of lines) expect(describe(event, units)).toBe(line);
  });
});
