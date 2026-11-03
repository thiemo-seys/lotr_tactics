// The damage meter (docs/viewer-spec.md section 8): what each unit of a team has dealt, taken, or
// healed and shielded so far in a fight, added up from its events. No DOM, so it can be tested.

import type { CombatEvent, DamageType, SpawnEvent, Team } from '@lotr-tactics/sim';

export type MeterTab = 'dealt' | 'taken' | 'healing';

export const METER_TABS: readonly { readonly tab: MeterTab; readonly label: string }[] = [
  { tab: 'dealt', label: 'Dealt' },
  { tab: 'taken', label: 'Taken' },
  { tab: 'healing', label: 'Healing' },
];

/** A share of a bar: a damage type, or healing or shielding. */
export type MeterPart = DamageType | 'heal' | 'shield';

export interface MeterRow {
  /** The unit the row is for. Its summons' numbers are in its row. */
  readonly unit: number;
  readonly unitId: SpawnEvent['unitId'];
  readonly star: SpawnEvent['star'];
  readonly dead: boolean;
  readonly total: number;
  /** The total split into parts, in a fixed order, leaving out parts that are 0. */
  readonly parts: readonly { readonly part: MeterPart; readonly amount: number }[];
}

const PART_ORDER: readonly MeterPart[] = ['physical', 'magic', 'true', 'heal', 'shield'];

/**
 * One row for each unit of a team that has spawned in the events, most first, ties by id. A
 * summon's numbers count for the unit that made it; a summon with no owner, the Eye's Nazgûl, has
 * its own row. Damage counts in full, including what shields absorbed and overkill.
 */
export function meterRows(events: readonly CombatEvent[], team: Team, tab: MeterTab): MeterRow[] {
  const credit = new Map<number, number>();
  const rows = new Map<number, { spawn: SpawnEvent; dead: boolean; parts: Map<MeterPart, number> }>();
  const add = (unit: number, part: MeterPart, amount: number) => {
    const row = rows.get(credit.get(unit) ?? -1);
    if (row !== undefined) row.parts.set(part, (row.parts.get(part) ?? 0) + amount);
  };
  for (const event of events) {
    switch (event.type) {
      case 'spawn':
        credit.set(event.unit, event.owner ?? event.unit);
        if (event.owner === null && event.team === team) rows.set(event.unit, { spawn: event, dead: false, parts: new Map() });
        break;
      case 'death': {
        const row = rows.get(event.unit);
        if (row !== undefined) row.dead = true;
        break;
      }
      case 'damage':
        if (tab !== 'healing') add(tab === 'dealt' ? event.source : event.target, event.damageType, event.amount);
        break;
      case 'heal':
        if (tab === 'healing') add(event.source, 'heal', event.amount);
        break;
      case 'shield':
        if (tab === 'healing') add(event.source, 'shield', event.amount);
        break;
    }
  }
  return [...rows.values()]
    .map(({ spawn, dead, parts }) => {
      const list = PART_ORDER.filter((part) => (parts.get(part) ?? 0) > 0).map((part) => ({ part, amount: parts.get(part)! }));
      return { unit: spawn.unit, unitId: spawn.unitId, star: spawn.star, dead, total: list.reduce((sum, p) => sum + p.amount, 0), parts: list };
    })
    .sort((a, b) => b.total - a.total || a.unit - b.unit);
}
