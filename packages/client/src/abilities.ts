// What an ability does, in words (docs/game-spec.md section 12, docs/viewer-spec.md section 4):
// written from the ability's steps in the data, with its numbers worked out by the sim's own
// `abilityValue` at a star level and Ability Power, so the text always says what the fight does.
// Each line is a sentence that starts with a verb ("Deals…", "Gives…", "Gains…"), names the units
// once and then calls them "it" or "them". No Three.js or DOM, so it can be tested.

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
  type OriginId,
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
  /** The caster's origin, if it has one: says whether "Orc allies around it" include itself. */
  readonly origin?: OriginId;
}

/** One sentence per step of the ability (or two steps that read as one), then its passive if it has one. */
export function describeAbility(ability: AbilityDef, caster: Caster): string[] {
  const lines = describeSteps(ability.steps, caster);
  const passive = ability.passive;
  if (passive !== undefined) {
    const from = passive.fromOrigins.map((o) => TRAITS[o].name).join(' and ');
    const except = passive.exceptUnits.map((u) => UNITS[u].name).join(' and ');
    lines.push(`Passive: takes ${passive.pct}% less damage from ${from} units${except === '' ? '' : `, except ${except}`}.`);
  }
  return lines;
}

type PlainStep = Extract<AbilityStep, { readonly select: Selector }>;

/** A step, with the steps after it that do the same thing to other units folded in. */
interface Group {
  readonly selects: readonly Selector[];
  readonly effects: readonly Effect[];
}

function describeSteps(steps: readonly AbilityStep[], caster: Caster): string[] {
  const lines: string[] = [];
  let previous: Group | null = null;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if ('delaySeconds' in step) {
      const later = describeSteps(step.steps, caster).map((line) => lowerFirst(line).replace(/\.$/, '')).join(', then ');
      // "Becomes untargetable for 2s, then…" when the delay is how long the step before lasted.
      if (previous !== null && lines.length > 0 && lastsExactly(previous.effects, step.delaySeconds)) {
        lines.push(`${lines.pop()!.replace(/\.$/, '')}, then ${later}.`);
      } else {
        lines.push(`After ${seconds(step.delaySeconds)}, ${later}.`);
      }
      previous = null;
      continue;
    }
    const group = { selects: [step.select], effects: step.effects };
    let next = steps[i + 1];
    while (next !== undefined && !('delaySeconds' in next) && sameEffects(next, step)) {
      group.selects.push(next.select);
      next = steps[++i + 1];
    }
    let text = clause(group, caster);
    // A step that only moves the caster leads into the next one: "Dashes to …, then deals …".
    if (group.effects.every((e) => e.kind === 'dashAdjacentTo') && next !== undefined && !('delaySeconds' in next)) {
      text = `${text}, then ${clause({ selects: [next.select], effects: next.effects }, caster)}`;
      i++;
    }
    lines.push(`${upperFirst(text)}.`);
    previous = group;
  }
  return lines;
}

function sameEffects(a: PlainStep, b: PlainStep): boolean {
  return JSON.stringify(a.effects) === JSON.stringify(b.effects);
}

function lastsExactly(effects: readonly Effect[], s: number): boolean {
  return effects.length > 0 && effects.every((e) => 'seconds' in e && e.seconds === s);
}

/** The units a step acts on: named the first time, "it" or "them" after that. */
class Units {
  private said = false;

  constructor(
    private readonly phrase: string,
    private readonly plural: boolean,
  ) {}

  /** As an object: "its target", then "it". */
  get(): string {
    if (this.said) return this.plural ? 'them' : 'it';
    this.said = true;
    return this.phrase;
  }

  /** Something of theirs: "the Attack Speed of adjacent enemies", then "their Attack Speed". */
  their(thing: string): string {
    if (this.said) return `${this.plural ? 'their' : 'its'} ${thing}`;
    this.said = true;
    return `the ${thing} of ${this.phrase}`;
  }
}

/** One thing a step does: a verb (as "deals" and as "dealing"), what follows it, and how long it lasts. */
interface Part {
  readonly verb: readonly [string, string];
  readonly words: () => string;
  readonly seconds?: number;
  /** For "gives" and "gains": what is given, so a second gift after the first needs no verb or units. */
  readonly gift?: string;
}

/** A step as a clause without its subject: "deals 200 physical damage to its target and stuns it for 1s". */
function clause(group: Group, caster: Caster): string {
  const self = group.selects.length === 1 && group.selects[0]!.kind === 'self';
  const dashLine = group.effects.some((e) => e.kind === 'dashThroughLine');
  const units = dashLine ? new Units('enemies on it', true) : unitsOf(group.selects, caster);
  const lead: Part[] = [];
  const parts: Part[] = [];
  const effects = group.effects;
  for (let k = 0; k < effects.length; k++) {
    const effect = effects[k]!;
    if (effect.kind === 'buff') {
      // Buffs of the same size and length read as one: "+25 Armor and Magic Resist".
      const names = [BUFF_NAMES[effect.stat].name];
      let next = effects[k + 1];
      while (next?.kind === 'buff' && next.amount === effect.amount && next.seconds === effect.seconds && BUFF_NAMES[next.stat].pct === BUFF_NAMES[effect.stat].pct) {
        names.push(BUFF_NAMES[next.stat].name);
        next = effects[++k + 1];
      }
      const { pct } = BUFF_NAMES[effect.stat];
      parts.push(give(`+${effect.amount}${pct ? '%' : ''} ${names.join(' and ')}`, effect.seconds, self, units));
    } else if (effect.kind === 'dashAdjacentTo') lead.push({ verb: ['dashes', 'dashing'], words: () => `to ${units.get()}` });
    else if (effect.kind === 'dashThroughLine') lead.push({ verb: ['dashes', 'dashing'], words: () => `along ${lineShape(group.selects[0]!)}` });
    else parts.push(partOf(effect, self, units, caster));
  }
  if (dashLine) {
    // "Dashes along a 3-hex line, dealing … to enemies on it and stunning them…".
    const leadText = render(lead, 0);
    return parts.length === 0 ? leadText : `${leadText}, ${render(parts, 1)}`;
  }
  return render([...lead, ...parts], 0);
}

/** Parts joined as "A, B and C"; a gift after a gift drops its verb, and a duration shared with the next part is said once. */
function render(parts: readonly Part[], form: 0 | 1): string {
  const texts = parts.map((part, i) => {
    const before = parts[i - 1];
    const after = parts[i + 1];
    const merged = before !== undefined && before.gift !== undefined && part.gift !== undefined && before.verb[0] === part.verb[0];
    const words = merged ? part.gift! : part.words();
    const head = merged ? '' : `${part.verb[form]}${words === '' ? '' : ' '}`;
    const lasts = part.seconds !== undefined && after?.seconds !== part.seconds ? ` for ${seconds(part.seconds)}` : '';
    return `${head}${words}${lasts}`;
  });
  if (texts.length <= 1) return texts[0] ?? '';
  const first = texts.slice(0, -1);
  // "its target and enemies next to it, and slows…": a comma when an "and" came before.
  return `${first.join(', ')}${first.some((t) => t.includes(' and ')) ? ',' : ''} and ${texts.at(-1)!}`;
}

function partOf(effect: Effect, self: boolean, units: Units, caster: Caster): Part {
  const value = (base: 'D' | 'S' | 'H', pct: number) => Math.round(abilityValue(base, pct, caster.cost, caster.star, caster.abilityPower));
  switch (effect.kind) {
    case 'damage': {
      const hits = effect.hits ?? 1;
      const notes = [
        effect.canCrit === true ? ' (can crit)' : '',
        effect.bonusVs === undefined ? '' : ` (${times(effect.bonusVs.multiplierPct)} against ${TRAITS[effect.bonusVs.origin].name})`,
      ].join('');
      const amount = `${value('D', effect.pct)} ${effect.type} damage`;
      return hits > 1
        ? { verb: ['hits', 'hitting'], words: () => `${units.get()} ${hits} times for ${amount} each${notes}` }
        : { verb: ['deals', 'dealing'], words: () => `${amount} to ${units.get()}${notes}` };
    }
    case 'stun':
      return { verb: ['stuns', 'stunning'], words: () => units.get(), seconds: effect.seconds };
    case 'slow':
      return { verb: ['slows', 'slowing'], words: () => `${units.their('Attack Speed')} by ${effect.pct}%`, seconds: effect.seconds };
    case 'shield':
      return give(`a ${value('S', effect.pct)} shield`, effect.seconds ?? ABILITIES.shieldSeconds, self, units);
    case 'heal':
      return { verb: ['heals', 'healing'], words: () => `${self ? 'itself' : units.get()} for ${value('H', effect.pct)}` };
    case 'healFromDamage':
      return { verb: ['heals', 'healing'], words: () => `itself for ${effect.pct}% of the damage dealt` };
    case 'reduce': {
      const stats = effect.stats.map((s) => (s === 'armor' ? 'Armor' : 'Magic Resist')).join(' and ');
      return { verb: ['lowers', 'lowering'], words: () => `${units.their(stats)} by ${effect.pct}%`, seconds: effect.seconds };
    }
    case 'untargetable':
      return self
        ? { verb: ['becomes', 'becoming'], words: () => 'untargetable', seconds: effect.seconds }
        : { verb: ['makes', 'making'], words: () => `${units.get()} untargetable`, seconds: effect.seconds };
    case 'stunImmune':
      return self
        ? { verb: ["can't be stunned", 'unable to be stunned'], words: () => '', seconds: effect.seconds }
        : { verb: ['makes', 'making'], words: () => `${units.get()} immune to stuns`, seconds: effect.seconds };
    case 'summon': {
      const name = SUMMONS[effect.unit].name;
      return { verb: ['summons', 'summoning'], words: () => `${effect.count} ${name}${effect.count === 1 ? '' : 's'}` };
    }
    case 'buff':
    case 'dashAdjacentTo':
    case 'dashThroughLine':
      throw new Error(`${effect.kind} is worded by its step`);
  }
}

/** A shield or a buff: the caster "gains" it, other units are "given" it. */
function give(gift: string, s: number, self: boolean, units: Units): Part {
  return self
    ? { verb: ['gains', 'gaining'], words: () => gift, seconds: s, gift }
    : { verb: ['gives', 'giving'], words: () => `${units.get()} ${gift}`, seconds: s, gift };
}

/** The units a step's selectors pick, as words. */
function unitsOf(selects: readonly Selector[], caster: Caster): Units {
  const phrases = selects.map((s) => selectorText(s, caster));
  if (phrases.length === 1) return new Units(phrases[0]!.text, phrases[0]!.plural);
  // Steps folded together: "itself and the nearest ally", the caster first.
  const ordered = [...phrases.filter((p) => p.text === 'itself'), ...phrases.filter((p) => p.text !== 'itself')];
  return new Units(ordered.map((p) => p.text).join(' and '), true);
}

function selectorText(select: Selector, caster: Caster): { readonly text: string; readonly plural: boolean } {
  const many = (text: string) => ({ text, plural: true });
  switch (select.kind) {
    case 'nearestEnemies':
      return select.count === 1 ? { text: 'the nearest enemy', plural: false } : many(`the ${select.count} nearest enemies`);
    case 'lowestHealthPctAllies':
      return select.count === 1 ? { text: 'the most wounded ally', plural: false } : many(`the ${select.count} most wounded allies`);
    case 'allAllies':
      return many('all allies');
    case 'alliesWithin': {
      const origin = select.origin;
      if (origin === undefined) return many(`itself and allies within ${hexes(select.radius)}`);
      const name = `${TRAITS[origin].name} allies within ${hexes(select.radius)}`;
      return many(caster.origin === origin ? `itself and ${name}` : name);
    }
    case 'adjacentAllies':
      return many('adjacent allies');
    case 'adjacentEnemies':
      return many('adjacent enemies');
    case 'enemiesWithin':
      return many(`enemies within ${hexes(select.radius)}`);
    case 'area': {
      const around = select.around;
      if (around.kind === 'bestClusterHex') return many(`the biggest group of enemies (${select.radius}-hex radius)`);
      if (around.kind === 'self') return many(`enemies within ${hexes(select.radius)}`);
      const unit = unitText(around);
      return many(select.radius === 1 && around.kind !== 'nearestAlly' ? `${unit} and enemies next to it` : `enemies within ${hexes(select.radius)} of ${unit}`);
    }
    case 'line':
      return many(`enemies in ${lineShape(select)}`);
    case 'cone':
      return many('enemies in a cone towards its target');
    case 'bounce': {
      const more = select.count - 1;
      return many(more < 1 ? 'its target' : `its target, bouncing to up to ${more} more ${more === 1 ? 'enemy' : 'enemies'}`);
    }
    default:
      return { text: unitText(select), plural: false };
  }
}

function lineShape(select: Selector): string {
  if (select.kind !== 'line') return 'a line';
  return select.length === 'edge' ? 'a line to the board’s edge' : `a ${select.length}-hex line`;
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

function times(multiplierPct: number): string {
  return multiplierPct === 200 ? 'double' : multiplierPct === 300 ? 'triple' : `×${multiplierPct / 100}`;
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
