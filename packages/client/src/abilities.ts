// What an ability does, in words (docs/game-spec.md section 12, docs/viewer-spec.md section 4):
// written from the ability's steps in the data, with its numbers worked out by the sim's own
// `abilityValue` at a star level and Ability Power, so the text always says what the fight does.
// No Three.js or DOM, so it can be tested.

import {
  ABILITIES,
  SUMMONS,
  TRAITS,
  UNITS,
  abilityValue,
  type AbilityDef,
  type AbilityStep,
  type BuffStat,
  type Cost,
  type Effect,
  type Selector,
  type Star,
  type UnitSelector,
} from '@lotr-tactics/sim';

const BUFF_NAMES: Readonly<Record<BuffStat, { readonly name: string; readonly pct: boolean }>> = {
  attackDamagePct: { name: 'Attack Damage', pct: true },
  attackSpeedPct: { name: 'Attack Speed', pct: true },
  armor: { name: 'Armor', pct: false },
  magicResist: { name: 'Magic Resist', pct: false },
};

/** How strong a caster's ability is: its cost and star level scale it, and Ability Power multiplies it. */
export interface Caster {
  readonly cost: Cost;
  readonly star: Star;
  /** 100 is the base. */
  readonly abilityPower: number;
}

/** One line per step of the ability, then its passive if it has one. */
export function describeAbility(ability: AbilityDef, caster: Caster): string[] {
  const lines = ability.steps.map((step) => describeStep(step, caster));
  const passive = ability.passive;
  if (passive !== undefined) {
    const from = passive.fromOrigins.map((o) => TRAITS[o].name).join(' and ');
    const except = passive.exceptUnits.map((u) => UNITS[u].name).join(' and ');
    lines.push(`Passive: takes ${passive.pct}% less damage from ${from} units${except === '' ? '' : `, apart from ${except}`}.`);
  }
  return lines;
}

function describeStep(step: AbilityStep, caster: Caster): string {
  if ('delaySeconds' in step) {
    const later = step.steps.map((s) => lowerFirst(describeStep(s, caster)).replace(/\.$/, '')).join('; then ');
    return `${seconds(step.delaySeconds)} later, ${later}.`;
  }
  const effects = step.effects.map((e) => effectText(e, caster)).filter((t) => t !== '');
  return `${upperFirst(selectorText(step.select))}: ${effects.join(', ')}.`;
}

function selectorText(select: Selector): string {
  switch (select.kind) {
    case 'nearestEnemies':
      return select.count === 1 ? 'the nearest enemy' : `the ${select.count} nearest enemies`;
    case 'lowestHealthPctAllies':
      return select.count === 1 ? 'the most wounded ally' : `the ${select.count} most wounded allies`;
    case 'allAllies':
      return 'all allies';
    case 'alliesWithin':
      return `${select.origin === undefined ? 'allies' : `${TRAITS[select.origin].name} allies`} within ${hexes(select.radius)}, itself included`;
    case 'adjacentAllies':
      return 'adjacent allies';
    case 'adjacentEnemies':
      return 'adjacent enemies';
    case 'enemiesWithin':
      return `enemies within ${hexes(select.radius)}`;
    case 'area':
      return select.around.kind === 'bestClusterHex'
        ? `enemies within ${hexes(select.radius)} of where they are thickest`
        : `enemies within ${hexes(select.radius)} of ${unitText(select.around)}`;
    case 'line':
      return select.length === 'edge' ? 'enemies in a line through its target to the board’s edge' : `enemies in a line of ${hexes(select.length)} through its target`;
    case 'cone':
      return 'enemies in a cone towards its target';
    case 'bounce':
      return `its target, bouncing to up to ${select.count} enemies in all`;
    default:
      return unitText(select);
  }
}

function unitText(select: UnitSelector): string {
  switch (select.kind) {
    case 'self':
      return 'itself';
    case 'target':
      return 'its target';
    case 'farthestEnemy':
      return 'the farthest enemy';
    case 'lowestHealthEnemy':
      return 'the enemy with the least Health';
    case 'highestHealthEnemy':
      return 'the enemy with the most Health';
    case 'nearestAlly':
      return 'the nearest ally';
  }
}

function effectText(effect: Effect, caster: Caster): string {
  const value = (base: 'D' | 'S' | 'H', pct: number) => Math.round(abilityValue(base, pct, caster.cost, caster.star, caster.abilityPower));
  switch (effect.kind) {
    case 'damage': {
      const hits = effect.hits ?? 1;
      return [
        `${value('D', effect.pct)} ${effect.type} damage${hits > 1 ? ` ${hits} times` : ''}`,
        effect.canCrit === true ? ', which can crit' : '',
        effect.bonusVs === undefined ? '' : ` (×${effect.bonusVs.multiplierPct / 100} against ${TRAITS[effect.bonusVs.origin].name})`,
      ].join('');
    }
    case 'stun':
      return `stun for ${seconds(effect.seconds)}`;
    case 'slow':
      return `−${effect.pct}% Attack Speed for ${seconds(effect.seconds)}`;
    case 'shield':
      return `a ${value('S', effect.pct)} shield for ${seconds(effect.seconds ?? ABILITIES.shieldSeconds)}`;
    case 'heal':
      return `heal ${value('H', effect.pct)}`;
    case 'healFromDamage':
      return `heals itself for ${effect.pct}% of the damage`;
    case 'buff': {
      const { name, pct } = BUFF_NAMES[effect.stat];
      return `+${effect.amount}${pct ? '%' : ''} ${name} for ${seconds(effect.seconds)}`;
    }
    case 'reduce':
      return `−${effect.pct}% ${effect.stats.map((s) => (s === 'armor' ? 'Armor' : 'Magic Resist')).join(' and ')} for ${seconds(effect.seconds)}`;
    case 'untargetable':
      return `untargetable for ${seconds(effect.seconds)}`;
    case 'stunImmune':
      return `can't be stunned for ${seconds(effect.seconds)}`;
    case 'dashAdjacentTo':
      return 'it dashes next to them';
    case 'dashThroughLine':
      return 'it dashes along the line';
    case 'summon':
      return `summons ${effect.count} ${SUMMONS[effect.unit].name}${effect.count === 1 ? '' : 's'}`;
  }
}

function seconds(s: number): string {
  return `${s}s`;
}

function hexes(n: number): string {
  return n === 1 ? '1 hex' : `${n} hexes`;
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
