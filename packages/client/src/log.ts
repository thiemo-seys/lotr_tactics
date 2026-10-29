// One line of text per fight event, for the event log (docs/viewer-spec.md section 6).

import { SUMMONS, UNITS, toOffset, type CombatEvent, type Hex, type UnitState } from '@lotr-tactics/sim';

const STAT_NAMES = {
  attackDamagePct: 'Attack Damage',
  attackSpeedPct: 'Attack Speed',
  armor: 'Armor',
  magicResist: 'Magic Resist',
} as const;

/** A unit's name and team, such as "Sam (A)". */
export function unitName(unit: UnitState): string {
  const def = unit.unitId in UNITS ? UNITS[unit.unitId as keyof typeof UNITS] : SUMMONS[unit.unitId as keyof typeof SUMMONS];
  return `${def.name} (${unit.team})`;
}

/** The event as a line of text, or null for moves, which would drown out everything else. */
export function describe(event: CombatEvent, units: readonly UnitState[]): string | null {
  const name = (id: number) => unitName(units[id]!);
  const until = (tick: number | null) => (tick === null ? 'for the rest of the fight' : `until tick ${tick}`);
  const text = ((): string | null => {
    switch (event.type) {
      case 'spawn':
        return `${name(event.unit)}${event.summon ? '' : ` ★${event.star}`} ${event.summon ? 'appears' : 'starts'} at ${hexText(event.hex)}`;
      case 'move':
        return null;
      case 'dash':
        return `${name(event.unit)} dashes to ${hexText(event.to)}`;
      case 'attack':
        return `${name(event.unit)} ${event.ranged ? 'shoots at' : 'attacks'} ${name(event.target)}`;
      case 'dodge':
        return `${name(event.unit)} dodges ${name(event.source)}`;
      case 'damage': {
        const notes = [event.crit ? 'crit' : null, event.absorbed > 0 ? `${event.absorbed} absorbed` : null].filter((n) => n !== null);
        const by = event.kind === 'attack' ? '' : ` (${event.kind})`;
        return `${name(event.source)} deals ${event.amount} ${event.damageType} damage to ${name(event.target)}${by}${notes.length > 0 ? `, ${notes.join(', ')}` : ''}`;
      }
      case 'heal':
        return `${name(event.source)} heals ${name(event.target)} for ${event.amount}`;
      case 'shield':
        return `${name(event.source)} shields ${name(event.target)} for ${event.amount} ${until(event.expiresTick)}`;
      case 'cast':
        return `${name(event.unit)} casts ${event.ability}`;
      case 'status': {
        const target = name(event.target);
        switch (event.status) {
          case 'stun':
            return `${target} is stunned ${until(event.expiresTick)}`;
          case 'stunImmune':
            return `${target} can't be stunned ${until(event.expiresTick)}`;
          case 'untargetable':
            return `${target} is untargetable ${until(event.expiresTick)}`;
          case 'slow':
            return `${target} is slowed by ${event.value}% ${until(event.expiresTick)}`;
          case 'reduce':
            return `${target} loses ${event.value}% ${STAT_NAMES[event.stat!]} ${until(event.expiresTick)}`;
          case 'buff': {
            const percent = event.stat === 'attackDamagePct' || event.stat === 'attackSpeedPct' ? '%' : '';
            return `${target} gains ${event.value}${percent} ${STAT_NAMES[event.stat!]} ${until(event.expiresTick)}`;
          }
        }
        break;
      }
      case 'death':
        return `${name(event.unit)} dies`;
      case 'end':
        return event.outcome === 'draw' ? 'The fight is a draw' : `Team ${event.outcome} wins`;
    }
    return null;
  })();
  return text === null ? null : `[${event.tick}] ${text}`;
}

function hexText(hex: Hex): string {
  const { col, row } = toOffset(hex);
  return `(${col}, ${row})`;
}
