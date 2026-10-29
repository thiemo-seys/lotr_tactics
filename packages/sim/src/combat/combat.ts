// The combat simulation: createCombat / step / result (docs/sim-spec.md sections 6, 13 and 14).

import { ABILITIES, ATTACKS, MANA, MOVEMENT, TICKS_PER_SECOND } from '../data/rules.js';
import { MAX_ITEMS, type ItemEffect, type ItemId } from '../data/items.js';
import { MONSTERS, type FighterId, type MonsterId } from '../data/monsters.js';
import type { ClassId, OriginId } from '../data/traits.js';
import {
  SUMMONS,
  UNITS,
  type AbilityDef,
  type AbilityStep,
  type BuffStat,
  type Cost,
  type DamageType,
  type Effect,
  type Selector,
  type SummonId,
  type UnitDef,
  type UnitId,
} from '../data/units.js';
import { BOARD_COLS, BOARD_ROWS, boardIndex, distance, fromPlacement, hexEquals, type Hex } from '../hex.js';
import { createRng, type Rng } from '../rng.js';
import type { Star, Team } from '../types.js';
import { dashHex, lineDashHex, select, summonHex, type Selection } from './abilities.js';
import { finalDamage, manaFromDamage, overtimePct, rollAttack } from './damage.js';
import type { CombatEvent, DamageEvent, Outcome } from './events.js';
import { isItemId, itemEffects, itemModifiers } from './items.js';
import { MOVE_TICKS, planMove } from './movement.js';
import { actionOrder, firstTeam, startingSlots } from './order.js';
import {
  abilityValue,
  baseStats,
  combineModifiers,
  finalStats,
  gruntStats,
  monsterStats,
  type BaseStats,
  type StatModifiers,
  type Stats,
} from './stats.js';
import { Statuses, type StatusKind, type StatusState } from './statuses.js';
import { chooseTarget, type TargetingRules } from './targeting.js';
import { LAST_TICK, toTicks } from './time.js';
import { activeTrait, traitLevels, traitModifiers, type TraitLevels } from './traits.js';

export interface PlacedUnit {
  /** A unit, or a PvE monster (always 1★). */
  readonly unitId: FighterId;
  readonly star: Star;
  /** 0–6 from left to right, in the team's own perspective. */
  readonly col: number;
  /** 0 is the back row and 3 the front row, in the team's own perspective. */
  readonly row: number;
  /** Up to 3 components or combined items (section 12.4). Monsters carry none. */
  readonly items: readonly ItemId[];
}

export interface CombatInput {
  /** 32-bit integer. */
  readonly seed: number;
  /** The round's stage, from 1. Orc grunts get stronger each stage. */
  readonly stage: number;
  readonly teams: { readonly [T in Team]: readonly PlacedUnit[] };
}

export interface Survivor {
  readonly unitId: FighterId;
  readonly star: Star;
}

export interface CombatResult {
  readonly outcome: Outcome;
  /** Living non-summon units, in slot order. The round system uses these for player damage. */
  readonly survivors: { readonly [T in Team]: readonly Survivor[] };
  readonly finalTick: number;
  readonly events: readonly CombatEvent[];
}

export interface UnitState {
  readonly id: number;
  readonly unitId: FighterId | SummonId;
  readonly team: Team;
  /** Null for monsters. */
  readonly origin: OriginId | null;
  readonly star: Star;
  readonly summon: boolean;
  readonly slot: number;
  /** Board coordinates. Set to the destination as soon as a step starts. */
  readonly hex: Hex;
  /** The id of the unit's target, if it has one. */
  readonly target: number | null;
  readonly alive: boolean;
  readonly health: number;
  readonly mana: number;
  /** Stats before traits, buffs and statuses. */
  readonly base: BaseStats;
  /** Current stats. */
  readonly stats: Stats;
  readonly statuses: StatusState;
  /** Empty for summons and monsters. */
  readonly items: readonly ItemId[];
}

/** An ability effect that puts a status on a unit (section 12.1). */
export type StatusEffect = Extract<Effect, { readonly kind: StatusKind }>;

/** Read-only view of the fight for the renderer. */
export interface CombatState {
  /** Every unit that has been in the fight, including dead ones, in id order. */
  readonly units: readonly UnitState[];
}

export interface Combat {
  /** The last tick processed. Creating a combat processes tick 0. */
  readonly tick: number;
  readonly state: CombatState;
  /** Every event so far, including tick 0's. */
  readonly events: readonly CombatEvent[];
  /** Processes the next tick and returns its events. Throws once the fight is over. */
  step(): CombatEvent[];
  isOver(): boolean;
  /** Throws until the fight is over. */
  result(): CombatResult;
}

const TEAMS: readonly Team[] = ['A', 'B'];

/** Each team's half of the board is this many rows deep. */
const HALF_ROWS = BOARD_ROWS / 2;

/** How long a cast keeps the caster busy (section 10.1). */
const CAST_TICKS = toTicks(ABILITIES.castSeconds);

/** How long a dash keeps the unit busy (section 2). */
const DASH_TICKS = toTicks(MOVEMENT.dashBusySeconds);

/** The holder and its adjacent allies, for items at combat start (section 12.4). */
const NEARBY_ALLIES: Selector = { kind: 'alliesWithin', radius: 1 };

/** An item's effect on one unit, and how often it has acted: low-Health triggers and stacks are limited. */
interface ItemEffectState {
  readonly effect: ItemEffect;
  uses: number;
}

type Unit = { -readonly [K in Exclude<keyof UnitState, 'statuses'>]: UnitState[K] } & {
  readonly statuses: Statuses;
  /** The unit can't act before this tick. */
  busyUntil: number;
  /** A Burglar with its team's Burglar trait active, so it targets the farthest enemy. */
  targetsFarthest: boolean;
  /** The first tick the next basic attack can fire. Can be a fraction. */
  nextAttackTick: number;
  /** Null for summons, which have no ability. */
  readonly ability: AbilityDef | null;
  /** Ability values scale with it (section 10.2). */
  readonly cost: Cost;
  /** The unit gains no mana before this tick (section 9.1). */
  castingUntil: number;
  /** Empty for summons and monsters. */
  readonly classes: readonly ClassId[];
  /** Treebeard, Sauron and the big monsters (design.md section 4). */
  readonly large: boolean;
  /** Bonuses from traits and items that hold for the whole fight (sections 12.3 and 12.4). */
  readonly staticBonus: Partial<StatModifiers>;
  /** The effects of the unit's items, in the order it holds them. */
  readonly effects: readonly ItemEffectState[];
  /** The Nazgûl slow on this unit, updated at the start of each tick. */
  auraSlowPct: number;
  /** The Phial of Galadriel's Magic Resist reduction on this unit, updated with the Nazgûl slow. */
  auraShredPct: number;
  /** Attack Speed stacks from the Archer trait. */
  archerStacks: number;
};

/** Something due on a later tick (section 6.4, step 2). */
type QueueEntry =
  /** A ranged basic attack on its way. */
  | { readonly kind: 'projectile'; readonly dueTick: number; readonly source: Unit; readonly target: Unit; readonly damagePct: number }
  /** Ability steps after a delay. */
  | { readonly kind: 'delayed'; readonly dueTick: number; readonly caster: Unit; readonly steps: readonly AbilityStep[] };

/**
 * The fight itself. Code outside the package uses it through `createCombat`; abilities and traits
 * use the methods that aren't part of `Combat`, and so do tests.
 */
export class Fight implements Combat {
  tick = 0;
  readonly events: CombatEvent[] = [];
  private readonly units: Unit[] = [];
  private readonly traits: Record<Team, TraitLevels> = { A: {}, B: {} };
  private readonly rng: Rng;
  /** In creation order, which is also the order to resolve entries due on the same tick. */
  private queue: QueueEntry[] = [];
  private outcome: Outcome | null = null;
  /** Orc grunts get stronger each stage. */
  private readonly stage: number;

  constructor(input: CombatInput) {
    validate(input);
    this.rng = createRng(input.seed);
    this.stage = input.stage;
    this.start(input);
  }

  get state(): CombatState {
    return { units: this.units };
  }

  step(): CombatEvent[] {
    if (this.outcome !== null) throw new Error('The combat is over.');
    this.tick++;
    const firstEvent = this.events.length;
    // Section 6.4. Once a team is wiped out, nothing else is processed.
    const first = firstTeam(this.rng);
    this.expireStatuses();
    this.updateAuras();
    this.resolveQueue();
    if (this.outcome === null && this.tick % TICKS_PER_SECOND === 0) this.regenerate(first);
    for (const unit of actionOrder(this.living(), first)) {
      if (this.outcome !== null) break;
      this.act(unit);
    }
    if (this.outcome === null && this.tick === LAST_TICK) this.end('draw');
    return this.events.slice(firstEvent);
  }

  isOver(): boolean {
    return this.outcome !== null;
  }

  result(): CombatResult {
    if (this.outcome === null) throw new Error('The combat is not over yet.');
    const survivors = (team: Team): Survivor[] =>
      this.units
        .filter((u) => u.alive && u.team === team)
        .sort((a, b) => a.slot - b.slot)
        // Summons have a SummonId, so this also leaves them out.
        .flatMap(({ unitId, star }) => (isSummonId(unitId) ? [] : [{ unitId, star }]));
    return {
      outcome: this.outcome,
      survivors: { A: survivors('A'), B: survivors('B') },
      finalTick: this.tick,
      events: [...this.events],
    };
  }

  /** Tick 0 (section 6.2). */
  private start(input: CombatInput): void {
    // 1–2. Units, with their static trait bonuses and the Gondor front-row bonus.
    for (const team of TEAMS) {
      const placements = input.teams[team];
      // Monsters have no traits.
      const levels = traitLevels(placements.map((p) => p.unitId).filter(isUnitId));
      this.traits[team] = levels;
      const slots = startingSlots(placements);
      const bySlot = placements.map((p, i) => ({ p, slot: slots[i]! })).sort((a, b) => a.slot - b.slot);
      for (const { p, slot } of bySlot) {
        const fighter = isUnitId(p.unitId)
          ? unitFighter(UNITS[p.unitId], p.star, levels, p.row === HALF_ROWS - 1, p.items)
          : monsterFighter(p.unitId, input.stage);
        const { base, staticBonus } = fighter;
        const stats = finalStats(base, staticBonus);
        this.addUnit({
          id: this.units.length,
          unitId: p.unitId,
          team,
          origin: fighter.origin,
          star: p.star,
          summon: false,
          slot,
          hex: fromPlacement(team, p),
          target: null,
          alive: true,
          health: stats.maxHealth,
          mana: base.startMana,
          base,
          stats,
          statuses: new Statuses(),
          busyUntil: 0,
          targetsFarthest: levels.burglar !== undefined && fighter.classes.includes('burglar'),
          nextAttackTick: 1,
          ability: fighter.ability,
          cost: fighter.cost,
          castingUntil: 0,
          classes: fighter.classes,
          large: fighter.large,
          staticBonus,
          items: [...p.items],
          effects: itemEffects(p.items).map((effect) => ({ effect, uses: 0 })),
          auraSlowPct: 0,
          auraShredPct: 0,
          archerStacks: 0,
        });
      }
    }

    // 3. Guardian shields.
    for (const unit of this.units) {
      const guardian = activeTrait(this.traits[unit.team], 'guardian');
      if (guardian !== undefined && unit.classes.includes('guardian')) {
        this.addShield(unit.id, unit.id, guardian.shield, guardian.shieldSeconds);
      }
    }

    // 4. Items at combat start, unit by unit in slot order, team A's first.
    for (const unit of this.units) {
      for (const { effect } of unit.effects) {
        if (effect.kind === 'startShield') {
          for (const ally of this.selectFor(unit, NEARBY_ALLIES).units) this.addShield(unit.id, ally.id, effect.amount, effect.seconds);
        } else if (effect.kind === 'startBuff') {
          for (const ally of this.selectFor(unit, NEARBY_ALLIES).units) this.addPermanentBuff(unit, ally, effect.stat, effect.amount);
        } else if (effect.kind === 'startStunImmune') {
          this.applyStatus(unit.id, unit.id, { kind: 'stunImmune', seconds: effect.seconds });
        }
      }
    }

    // 5. Orc grunts, spread round-robin over the team's Orcs in slot order.
    for (const team of TEAMS) {
      const orc = activeTrait(this.traits[team], 'orc');
      const orcs = this.living(team).filter((u) => u.origin === 'orc');
      for (let i = 0; orc !== undefined && i < orc.grunts; i++) this.summon(orcs[i % orcs.length]!, 'orc-grunt');
    }

    // 6–7. Burglar leaps, then Rider charges, each in action order.
    const first = firstTeam(this.rng);
    const withClass = (trait: 'burglar' | 'rider') =>
      this.units.filter((u) => u.classes.includes(trait) && activeTrait(this.traits[u.team], trait) !== undefined);
    for (const unit of actionOrder(withClass('burglar'), first)) this.leap(unit);
    for (const unit of actionOrder(withClass('rider'), first)) {
      if (this.outcome !== null) return;
      if (unit.alive) this.charge(unit, activeTrait(this.traits[unit.team], 'rider')!.chargeDamage);
    }
    if (this.outcome !== null) return;

    // 8. Elven Rope stuns, in action order.
    for (const unit of actionOrder(this.units.filter((u) => u.alive && hasEffect(u, 'startStun')), first)) {
      for (const { effect } of unit.effects) {
        if (effect.kind !== 'startStun') continue;
        const enemy = this.selectFor(unit, { kind: 'farthestEnemy' }).units[0];
        if (enemy !== undefined) this.applyStatus(unit.id, enemy.id, { kind: 'stun', seconds: effect.seconds });
      }
    }

    // 9. The Nazgûl slow and the Phial of Galadriel.
    this.updateAuras();
    this.checkWipe();
  }

  /** A Burglar's leap at combat start: next to its target, the farthest enemy (section 12.3). */
  private leap(unit: Unit): void {
    const target = this.ensureTarget(unit);
    if (target === null) return;
    this.dash(unit, dashHex(unit.team, unit.hex, target.hex, this.isFreeFor(unit)));
    unit.busyUntil = this.tick + DASH_TICKS;
  }

  /**
   * A Rider's charge at combat start: next to its target, the nearest enemy, dealing trait damage
   * that can't crit or be dodged if it ends next to it (section 12.3).
   */
  private charge(unit: Unit, damage: number): void {
    const target = this.ensureTarget(unit);
    if (target === null) return;
    this.dash(unit, dashHex(unit.team, unit.hex, target.hex, this.isFreeFor(unit)));
    unit.busyUntil = this.tick + DASH_TICKS;
    if (distance(unit.hex, target.hex) === 1) this.dealDamage(unit, target, damage, 'physical', false, 'trait');
  }

  /**
   * Istari mana, Ent healing, and the Elven Cloak and Dragon-helm, on ticks 30, 60, 90, … in
   * action order (section 6.4, step 3).
   */
  private regenerate(first: Team): void {
    for (const unit of actionOrder(this.living(), first)) {
      if (this.outcome !== null) return;
      // A Dragon-helm can kill a unit before its turn.
      if (!unit.alive) continue;
      const istari = activeTrait(this.traits[unit.team], 'istari');
      if (istari !== undefined && unit.origin === 'istari') this.gainMana(unit, istari.manaPerSecond);
      const ent = activeTrait(this.traits[unit.team], 'ent');
      if (ent !== undefined && unit.origin === 'ent') this.heal(unit, unit, (unit.stats.maxHealth * ent.regenPctPerSecond) / 100);
      for (const { effect } of unit.effects) {
        if (effect.kind === 'regen') this.heal(unit, unit, (unit.stats.maxHealth * effect.maxHealthPct) / 100);
        if (effect.kind !== 'burn') continue;
        for (const enemy of this.selectFor(unit, { kind: 'adjacentEnemies' }).units) {
          if (this.outcome !== null) return;
          if (enemy.alive) this.dealDamage(unit, enemy, (unit.stats.maxHealth * effect.maxHealthPct) / 100, 'magic', false, 'item');
        }
      }
    }
  }

  /**
   * The Nazgûl slow and the Phial of Galadriel's Magic Resist reduction on enemies within reach of
   * a living Nazgûl or Phial holder (sections 12.3 and 12.4).
   */
  private updateAuras(): void {
    for (const team of TEAMS) {
      const nazgul = activeTrait(this.traits[team], 'nazgul');
      const wraiths = nazgul === undefined ? [] : this.living(team).filter((u) => u.origin === 'nazgul');
      const phials = this.living(team).flatMap((u) =>
        u.effects.flatMap(({ effect }) => (effect.kind === 'magicResistAura' ? [{ hex: u.hex, effect }] : [])),
      );
      for (const unit of this.living(enemyOf(team))) {
        const slowPct = nazgul !== undefined && wraiths.some((w) => distance(w.hex, unit.hex) <= nazgul.radius) ? nazgul.slowPct : 0;
        const shredPct = phials.reduce((max, p) => (distance(p.hex, unit.hex) <= p.effect.radius ? Math.max(max, p.effect.pct) : max), 0);
        this.setAuras(unit, slowPct, shredPct);
      }
    }
  }

  private setAuras(unit: Unit, slowPct: number, shredPct: number): void {
    if (slowPct === unit.auraSlowPct && shredPct === unit.auraShredPct) return;
    unit.auraSlowPct = slowPct;
    unit.auraShredPct = shredPct;
    this.refreshStats(unit);
  }

  /** A buff for the rest of the fight, from the Rohan and Archer traits (section 12.3) or an item (section 12.4). */
  private addPermanentBuff(source: Unit, target: Unit, stat: BuffStat, amount: number): void {
    target.statuses.addBuff(stat, amount, Infinity);
    this.events.push({
      type: 'status',
      tick: this.tick,
      source: source.id,
      target: target.id,
      status: 'buff',
      stat,
      value: amount,
      expiresTick: null,
    });
    this.refreshStats(target);
  }

  /** The sum of the damage amps on a source against a target (section 9.1). */
  private damageAmpPct(source: Unit, target: Unit): number {
    const levels = this.traits[source.team];
    const captain = activeTrait(levels, 'captain');
    const darkLord = activeTrait(levels, 'dark-lord');
    const dwarf = activeTrait(levels, 'dwarf');
    const nextToCaptain =
      captain !== undefined &&
      this.units.some(
        (u) => u.alive && u.team === source.team && u !== source && u.classes.includes('captain') && distance(u.hex, source.hex) === 1,
      );
    const blackArrows = source.effects.reduce(
      (pct, { effect }) => pct + (effect.kind === 'ampVsHealthier' && target.stats.maxHealth > source.stats.maxHealth ? effect.pct : 0),
      0,
    );
    return (
      (nextToCaptain ? captain.damageAmpPct : 0) +
      (darkLord !== undefined && (source.origin === 'orc' || source.origin === 'nazgul') ? darkLord.damageAmpPct : 0) +
      (dwarf !== undefined && source.origin === 'dwarf' && target.large ? dwarf.damageVsLargePct : 0) +
      blackArrows
    );
  }

  /**
   * Puts a status on a unit (section 12.1). A stun on a stun-immune unit, or a stun, stun immunity
   * or untargetable that doesn't outlast the current one, changes nothing and emits no event.
   */
  applyStatus(sourceId: number, targetId: number, effect: StatusEffect): void {
    const target = this.units[targetId]!;
    if (!target.alive) return;
    const expiresTick = this.tick + toTicks(effect.seconds);
    const event = { type: 'status', tick: this.tick, source: sourceId, target: targetId, status: effect.kind, expiresTick } as const;
    switch (effect.kind) {
      case 'stun':
      case 'stunImmune':
      case 'untargetable':
        if (!target.statuses.extend(effect.kind, expiresTick)) return;
        this.events.push({ ...event, stat: null, value: null });
        // Enemies targeting it drop it, and choose again when they next act.
        if (effect.kind === 'untargetable') {
          for (const enemy of this.living(enemyOf(target.team))) if (enemy.target === targetId) enemy.target = null;
        }
        return;
      case 'slow':
        target.statuses.addSlow(effect.pct, expiresTick);
        this.events.push({ ...event, stat: null, value: effect.pct });
        break;
      case 'reduce':
        for (const stat of effect.stats) {
          target.statuses.addReduction(stat, effect.pct, expiresTick);
          this.events.push({ ...event, stat, value: effect.pct });
        }
        break;
      case 'buff':
        target.statuses.addBuff(effect.stat, effect.amount, expiresTick);
        this.events.push({ ...event, stat: effect.stat, value: effect.amount });
        break;
    }
    this.refreshStats(target);
  }

  /** Gives a unit a shield, rounded to a whole number (section 4). A shield of 0 isn't added. */
  addShield(sourceId: number, targetId: number, amount: number, seconds: number): void {
    const target = this.units[targetId]!;
    const rounded = Math.round(amount);
    if (!target.alive || rounded <= 0) return;
    const expiresTick = this.tick + toTicks(seconds);
    target.statuses.addShield(rounded, expiresTick);
    this.events.push({ type: 'shield', tick: this.tick, source: sourceId, target: targetId, amount: rounded, expiresTick });
  }

  /** Removes the statuses and shields that expire this tick (section 6.4, step 1). */
  private expireStatuses(): void {
    for (const unit of this.units) {
      if (unit.alive && unit.statuses.expire(this.tick)) this.refreshStats(unit);
    }
  }

  /** Recomputes a unit's stats after its statuses, the Nazgûl slow or the Phial's reduction on it change (section 7.4). */
  private refreshStats(unit: Unit): void {
    unit.stats = finalStats(
      unit.base,
      combineModifiers(unit.staticBonus, unit.statuses.modifiers(), { slowPct: unit.auraSlowPct, magicResistReductionPct: unit.auraShredPct }),
    );
  }

  /** Resolves the projectiles and delayed steps due this tick, in creation order (section 6.4, step 2). */
  private resolveQueue(): void {
    const due = this.queue.filter((e) => e.dueTick === this.tick);
    this.queue = this.queue.filter((e) => e.dueTick !== this.tick);
    for (const entry of due) {
      if (this.outcome !== null) return;
      if (entry.kind === 'projectile') {
        // A projectile at a target that died or became untargetable is wasted. One whose attacker
        // died still lands.
        if (isTargetable(entry.target)) this.hit(entry.source, entry.target, entry.damagePct);
      } else if (entry.caster.alive) {
        // Delayed steps belong to the caster's ability, so they don't happen once it has died.
        this.runSteps(entry.caster, entry.steps);
      }
    }
  }

  /** A unit's action for the tick (section 6.4, step 4). */
  private act(unit: Unit): void {
    // A stun doesn't stop a step already under way: the unit has claimed its new hex.
    if (!unit.alive || this.tick < unit.busyUntil || unit.statuses.has('stun')) return;
    if (unit.ability !== null && unit.mana >= unit.base.maxMana) {
      this.cast(unit, unit.ability);
      return;
    }
    let target = this.ensureTarget(unit);
    if (target === null) return;

    if (distance(unit.hex, target.hex) > unit.stats.range) {
      const occupied = new Set(this.living().map((u) => boardIndex(u.hex)));
      const plan = planMove(
        unit.team,
        unit.hex,
        unit.stats.range,
        target,
        this.targetableEnemies(unit),
        this.living(enemyOf(unit.team)),
        this.targetingRules(unit),
        (hex) => !occupied.has(boardIndex(hex)),
      );
      if (plan === null) return; // No enemy is reachable, so the unit waits.
      unit.target = plan.target.id;
      target = plan.target;
      if (plan.step !== null) {
        this.moveTo(unit, plan.step);
        return;
      }
    }

    if (this.tick >= unit.nextAttackTick) this.attack(unit, target);
  }

  /**
   * Casts an ability (section 10.1): mana resets to 0, the steps resolve now (delayed ones go into
   * the queue), and the caster is busy and gains no mana for the cast time.
   */
  private cast(unit: Unit, ability: AbilityDef): void {
    unit.mana = 0;
    unit.busyUntil = this.tick + CAST_TICKS;
    unit.castingUntil = unit.busyUntil;
    this.events.push({ type: 'cast', tick: this.tick, unit: unit.id, ability: ability.name });
    this.runSteps(unit, ability.steps);
    // Athelas, once the ability has resolved.
    for (const { effect } of unit.effects) {
      if (effect.kind !== 'healOnCast' || this.outcome !== null) continue;
      const ally = this.selectFor(unit, { kind: 'lowestHealthPctAllies', count: 1 }).units[0];
      if (ally !== undefined) this.heal(unit, ally, effect.amount);
    }
  }

  private runSteps(caster: Unit, steps: readonly AbilityStep[]): void {
    for (const step of steps) {
      if (this.outcome !== null) return;
      if ('delaySeconds' in step) {
        this.queue.push({ kind: 'delayed', dueTick: this.tick + toTicks(step.delaySeconds), caster, steps: step.steps });
      } else {
        this.runStep(caster, step.select, step.effects);
      }
    }
  }

  /**
   * One ability step (section 10.3): select the units, then apply each effect in turn to every
   * selected unit that is still alive.
   */
  private runStep(caster: Unit, selector: Selector, effects: readonly Effect[]): void {
    const { units, hexes } = this.selectFor(caster, selector);
    /** Damage this step has dealt so far, for `healFromDamage`. */
    let dealt = 0;
    for (const effect of effects) {
      if (this.outcome !== null) return;
      switch (effect.kind) {
        case 'damage':
          for (const target of units) dealt += this.abilityDamage(caster, target, effect);
          break;
        case 'shield': {
          const amount = abilityValue('S', effect.pct, caster.cost, caster.star, caster.stats.abilityPower);
          for (const target of units) this.addShield(caster.id, target.id, amount, effect.seconds ?? ABILITIES.shieldSeconds);
          break;
        }
        case 'heal': {
          const amount = abilityValue('H', effect.pct, caster.cost, caster.star, caster.stats.abilityPower);
          for (const target of units) this.heal(caster, target, amount);
          break;
        }
        case 'healFromDamage':
          this.heal(caster, caster, (dealt * effect.pct) / 100);
          break;
        case 'dashAdjacentTo': {
          // The unit dashed to becomes the caster's target (section 8).
          const target = units[0];
          if (target === undefined || !target.alive) break;
          this.dash(caster, dashHex(caster.team, caster.hex, target.hex, this.isFreeFor(caster)));
          caster.target = target.id;
          break;
        }
        case 'dashThroughLine':
          this.dash(caster, lineDashHex(hexes, this.isFreeFor(caster)));
          break;
        case 'summon':
          for (let i = 0; i < effect.count; i++) this.summon(caster, effect.unit);
          break;
        default:
          for (const target of units) this.applyStatus(caster.id, target.id, effect);
      }
    }
  }

  /** The units a selector picks for a unit, as for its ability (section 10.3). */
  private selectFor(unit: Unit, selector: Selector): Selection<Unit> {
    return select(selector, {
      caster: unit,
      allies: this.living(unit.team),
      enemies: this.targetableEnemies(unit),
      target: () => this.ensureTarget(unit),
    });
  }

  /**
   * Ability damage (sections 9.1 and 10.2): it can't be dodged, and crits only if the ability says
   * so or the caster holds Sting (section 12.4). Returns the damage dealt.
   */
  private abilityDamage(caster: Unit, target: Unit, effect: Extract<Effect, { kind: 'damage' }>): number {
    const value = abilityValue('D', effect.pct, caster.cost, caster.star, caster.stats.abilityPower);
    const bonusPct = effect.bonusVs !== undefined && target.origin === effect.bonusVs.origin ? effect.bonusVs.multiplierPct : 100;
    const canCrit = effect.canCrit === true || hasEffect(caster, 'abilityCrit');
    let dealt = 0;
    for (let hit = 0; hit < (effect.hits ?? 1); hit++) {
      if (!target.alive || this.outcome !== null) break;
      const crit = canCrit && rollAttack(this.rng, caster.stats.critChancePct, 0).crit && !isCritImmune(target);
      const raw = (value * bonusPct * (crit ? caster.stats.critDamagePct : 100)) / 10_000;
      dealt += this.dealDamage(caster, target, raw, effect.type, crit, 'ability');
    }
    return dealt;
  }

  /** Heals a unit, rounded and capped at max Health (section 9.2). Emits nothing if no Health is restored. */
  private heal(source: Unit, target: Unit, amount: number): void {
    if (!target.alive) return;
    const restored = Math.min(Math.round(amount), target.stats.maxHealth - target.health);
    if (restored <= 0) return;
    target.health += restored;
    this.events.push({ type: 'heal', tick: this.tick, source: source.id, target: target.id, amount: restored });
  }

  /** Moves a unit instantly (section 10.4). It stays put if there is nowhere to go. */
  private dash(unit: Unit, to: Hex | null): void {
    if (to === null || hexEquals(to, unit.hex)) return;
    const from = unit.hex;
    unit.hex = to;
    unit.busyUntil = Math.max(unit.busyUntil, this.tick + DASH_TICKS);
    this.events.push({ type: 'dash', tick: this.tick, unit: unit.id, from, to });
  }

  /** Spawns a summon next to its owner (section 10.3). It doesn't appear if its owner's half is full. */
  private summon(owner: Unit, unitId: SummonId): void {
    const hex = summonHex(owner.team, owner.hex, this.isFreeFor(null));
    if (hex === null) return;
    // Orc grunts are the only summon.
    const base = gruntStats(this.stage);
    this.addUnit({
      id: this.units.length,
      unitId,
      team: owner.team,
      origin: SUMMONS[unitId].origin,
      star: 1,
      summon: true,
      // The next free slot: slots run from 0 with no gaps, dead units keeping theirs.
      slot: this.units.filter((u) => u.team === owner.team).length,
      hex,
      target: null,
      alive: true,
      health: base.maxHealth,
      mana: 0,
      base,
      stats: finalStats(base, {}),
      statuses: new Statuses(),
      busyUntil: 0,
      targetsFarthest: false,
      nextAttackTick: 1,
      ability: null,
      cost: 1,
      castingUntil: 0,
      classes: [],
      large: false,
      staticBonus: {},
      items: [],
      effects: [],
      auraSlowPct: 0,
      auraShredPct: 0,
      archerStacks: 0,
    });
  }

  /** A hex is free if it is on the board with no living unit on it. With `mover`, its own hex counts as free. */
  private isFreeFor(mover: Unit | null): (hex: Hex) => boolean {
    const occupied = new Set(this.living().filter((u) => u !== mover).map((u) => boardIndex(u.hex)));
    return (hex) => !occupied.has(boardIndex(hex));
  }

  /** Fires a basic attack (section 9), and the extra ones from Bows of the Galadhrim (section 12.4). */
  private attack(unit: Unit, target: Unit): void {
    const hitTick = this.announceAttack(unit, target);
    const manaPerAttack = unit.effects.reduce((mana, { effect }) => mana + (effect.kind === 'manaOnAttack' ? effect.amount : 0), 0);
    this.gainMana(unit, MANA.perAttack + manaPerAttack);
    // The cooldown after this attack already counts its Archer and Grond stacks.
    const archer = activeTrait(this.traits[unit.team], 'archer');
    if (archer !== undefined && unit.classes.includes('archer') && unit.archerStacks < archer.maxStacks) {
      unit.archerStacks++;
      this.addPermanentBuff(unit, unit, 'attackSpeedPct', archer.attackSpeedPctPerStack);
    }
    for (const state of unit.effects) {
      const { effect } = state;
      if (effect.kind !== 'stackOnAttack' || state.uses >= effect.maxStacks) continue;
      state.uses++;
      this.addPermanentBuff(unit, unit, effect.stat, effect.amount);
    }
    unit.nextAttackTick = this.tick + TICKS_PER_SECOND / unit.stats.attackSpeed;
    // Extra attacks go at the nearest other enemies in range, chosen as the attack fires.
    const bows = unit.effects.flatMap(({ effect }) => (effect.kind === 'extraAttack' ? [effect.damagePct] : []));
    const others =
      bows.length === 0
        ? []
        : this.selectFor(unit, { kind: 'nearestEnemies', count: Infinity }).units.filter(
            (u) => u !== target && distance(u.hex, unit.hex) <= unit.stats.range,
          );
    this.land(unit, target, hitTick, 100);
    // A melee holder can die to an Oakenshield on its first hit, and then fires no more.
    bows.forEach((damagePct, i) => {
      const other = others[i];
      if (other === undefined || this.outcome !== null || !unit.alive || !isTargetable(other)) return;
      this.land(unit, other, this.announceAttack(unit, other), damagePct);
    });
  }

  /** Emits an `attack` event and returns the tick it hits: now for melee, later for a projectile. */
  private announceAttack(unit: Unit, target: Unit): number {
    const ranged = unit.stats.range >= 2;
    const hitTick = ranged
      ? this.tick + Math.ceil((distance(unit.hex, target.hex) * TICKS_PER_SECOND) / ATTACKS.projectileHexesPerSecond)
      : this.tick;
    this.events.push({ type: 'attack', tick: this.tick, unit: unit.id, target: target.id, ranged, hitTick });
    return hitTick;
  }

  /** A melee attack hits now; a ranged one goes into the queue as a projectile. */
  private land(unit: Unit, target: Unit, hitTick: number, damagePct: number): void {
    if (hitTick > this.tick) this.queue.push({ kind: 'projectile', dueTick: hitTick, source: unit, target, damagePct });
    else this.hit(unit, target, damagePct);
  }

  /**
   * A basic attack lands (section 9): dodge, crit, damage, then the target's Oakenshields deal
   * damage back. `damagePct` is 50 for the extra attacks of a Bow of the Galadhrim.
   */
  private hit(source: Unit, target: Unit, damagePct: number): void {
    const { dodged, crit: rolled } = rollAttack(this.rng, source.stats.critChancePct, target.stats.dodgePct);
    if (dodged) {
      this.events.push({ type: 'dodge', tick: this.tick, unit: target.id, source: source.id });
      return;
    }
    const crit = rolled && !isCritImmune(target);
    const raw = (source.stats.attackDamage * (crit ? source.stats.critDamagePct : 100) * damagePct) / 10_000;
    const dealt = this.dealDamage(source, target, raw, 'physical', crit, 'attack');
    for (const { effect } of target.effects) {
      if (effect.kind !== 'reflect' || dealt <= 0 || !source.alive || this.outcome !== null) continue;
      this.dealDamage(target, source, (dealt * effect.pct) / 100, 'magic', false, 'item');
    }
  }

  /** Runs the damage pipeline (section 9.1) and returns the final damage. */
  private dealDamage(source: Unit, target: Unit, raw: number, damageType: DamageType, crit: boolean, kind: DamageEvent['kind']): number {
    const amount = finalDamage(raw, damageType, target.stats, {
      ampPct: this.damageAmpPct(source, target),
      overtimePct: overtimePct(this.tick),
      reductionPct: damageReductionPct(source, target),
    });
    // Shields take it first; the defender gains mana from all of it.
    const absorbed = target.statuses.absorb(amount);
    target.health -= amount - absorbed;
    this.events.push({
      type: 'damage',
      tick: this.tick,
      source: source.id,
      target: target.id,
      amount,
      absorbed,
      damageType,
      crit,
      kind,
    });
    this.gainMana(target, manaFromDamage(amount));
    if (target.health <= 0) this.kill(target, source);
    else if (this.outcome === null) this.checkLowHealth(target);
    // Glamdring.
    for (const { effect } of source.effects) {
      if (effect.kind === 'healOnDamage' && this.outcome === null) this.heal(source, source, (amount * effect.pct) / 100);
    }
    return amount;
  }

  /** Orcrist and Herugrim: once each, after damage leaves the holder below a share of its max Health (section 12.4). */
  private checkLowHealth(unit: Unit): void {
    for (const state of unit.effects) {
      const { effect } = state;
      if (effect.kind !== 'lowHealth' || state.uses > 0 || unit.health * 100 >= unit.stats.maxHealth * effect.belowPct) continue;
      state.uses = 1;
      if (effect.untargetableSeconds !== undefined) {
        this.applyStatus(unit.id, unit.id, { kind: 'untargetable', seconds: effect.untargetableSeconds });
      }
      if (effect.shield !== undefined) {
        this.addShield(unit.id, unit.id, (unit.stats.maxHealth * effect.shield.maxHealthPct) / 100, effect.shield.seconds);
      }
      this.addPermanentBuff(unit, unit, effect.buff.stat, effect.buff.amount);
    }
  }

  /** The unit dies at once and frees its hex (section 9.1), then on-death traits and items run. */
  private kill(unit: Unit, killer: Unit): void {
    unit.alive = false;
    unit.health = 0;
    this.events.push({ type: 'death', tick: this.tick, unit: unit.id });
    // Rohan: the other living Rohan units of its team gain Attack Speed for the rest of the fight.
    const rohan = activeTrait(this.traits[unit.team], 'rohan');
    if (rohan !== undefined && !unit.summon && unit.origin === 'rohan') {
      for (const ally of this.living(unit.team)) {
        if (ally.origin === 'rohan') this.addPermanentBuff(unit, ally, 'attackSpeedPct', rohan.attackSpeedPctPerDeath);
      }
    }
    // Andúril.
    for (const { effect } of killer.effects) {
      if (effect.kind === 'buffOnKill' && killer.alive) this.addPermanentBuff(killer, killer, effect.stat, effect.amount);
    }
    this.checkWipe();
  }

  /** Mana is capped at max mana; the rest is lost (section 10.1). None is gained while casting (section 9.1). */
  private gainMana(unit: Unit, amount: number): void {
    if (this.tick < unit.castingUntil) return;
    unit.mana = Math.min(unit.mana + amount, unit.base.maxMana);
  }

  /** The unit's target, choosing a new one if it has none or the old one is no longer targetable (section 8). */
  private ensureTarget(unit: Unit): Unit | null {
    const current = unit.target === null ? null : this.units[unit.target]!;
    if (current !== null && isTargetable(current)) return current;
    const chosen = chooseTarget(
      unit.team,
      unit.hex,
      this.targetableEnemies(unit),
      this.living(enemyOf(unit.team)),
      this.targetingRules(unit),
    );
    unit.target = chosen?.id ?? null;
    return chosen;
  }

  private targetingRules(unit: Unit): TargetingRules {
    return { farthest: unit.targetsFarthest, hobbitRule: this.traits[enemyOf(unit.team)].hobbit !== undefined };
  }

  /** Starts a step (section 11): the unit occupies the new hex at once and is busy until it arrives. */
  private moveTo(unit: Unit, to: Hex): void {
    const from = unit.hex;
    unit.hex = to;
    unit.busyUntil = this.tick + MOVE_TICKS;
    this.events.push({ type: 'move', tick: this.tick, unit: unit.id, from, to, arriveTick: unit.busyUntil });
  }

  private living(team?: Team): Unit[] {
    return this.units.filter((u) => u.alive && (team === undefined || u.team === team));
  }

  private targetableEnemies(unit: Unit): Unit[] {
    return this.living(enemyOf(unit.team)).filter(isTargetable);
  }

  private addUnit(unit: Unit): void {
    this.units.push(unit);
    this.events.push({
      type: 'spawn',
      tick: this.tick,
      unit: unit.id,
      unitId: unit.unitId,
      team: unit.team,
      hex: unit.hex,
      star: unit.star,
      summon: unit.summon,
    });
  }

  /** Ends the fight if a team has no living units (section 13). Also run after tick 0, so an empty board loses at once. */
  private checkWipe(): void {
    const aliveA = this.units.some((u) => u.alive && u.team === 'A');
    const aliveB = this.units.some((u) => u.alive && u.team === 'B');
    if (!aliveA || !aliveB) this.end(aliveA ? 'A' : aliveB ? 'B' : 'draw');
  }

  private end(outcome: Outcome): void {
    this.outcome = outcome;
    this.events.push({ type: 'end', tick: this.tick, outcome });
  }
}

export function createCombat(input: CombatInput): Combat {
  return new Fight(input);
}

/** Runs a fight to the end. */
export function simulateCombat(input: CombatInput): CombatResult {
  const combat = createCombat(input);
  while (!combat.isOver()) combat.step();
  return combat.result();
}

function isUnitId(id: FighterId | SummonId): id is UnitId {
  return Object.hasOwn(UNITS, id);
}

function isSummonId(id: FighterId | SummonId): id is SummonId {
  return Object.hasOwn(SUMMONS, id);
}

/** What a starting unit or monster brings to the fight, before statuses. */
interface Fighter {
  readonly base: BaseStats;
  readonly staticBonus: Partial<StatModifiers>;
  readonly origin: OriginId | null;
  readonly classes: readonly ClassId[];
  readonly ability: AbilityDef | null;
  readonly cost: Cost;
  readonly large: boolean;
}

function unitFighter(def: UnitDef, star: Star, levels: TraitLevels, inFrontRow: boolean, items: readonly ItemId[]): Fighter {
  return {
    base: baseStats(def, star),
    staticBonus: combineModifiers(traitModifiers(def, levels, inFrontRow), itemModifiers(items)),
    origin: def.origin,
    classes: def.classes,
    ability: def.ability,
    cost: def.cost,
    large: def.large === true,
  };
}

/** Monsters have no traits (game-spec.md section 9.8). */
function monsterFighter(id: MonsterId, stage: number): Fighter {
  const def = MONSTERS[id];
  return {
    base: monsterStats(def, stage),
    staticBonus: {},
    origin: null,
    classes: [],
    ability: def.ability ?? null,
    cost: def.cost,
    large: def.large === true,
  };
}

function enemyOf(team: Team): Team {
  return team === 'A' ? 'B' : 'A';
}

/** The target's damage reductions against this source, which add up (section 9.1): the Witch-king's passive and Mithril Shirts. */
function damageReductionPct(source: Unit, target: Unit): number {
  const passive = target.ability?.passive;
  const exempt = passive !== undefined && (passive.exceptUnits as readonly string[]).includes(source.unitId);
  const fromPassive = passive !== undefined && source.origin !== null && passive.fromOrigins.includes(source.origin) && !exempt ? passive.pct : 0;
  const fromItems = target.effects.reduce((pct, { effect }) => pct + (effect.kind === 'damageReduction' ? effect.pct : 0), 0);
  return Math.min(100, fromPassive + fromItems);
}

/** Crits against a Mithril Shirt holder deal normal damage. */
function isCritImmune(unit: Unit): boolean {
  return unit.effects.some(({ effect }) => effect.kind === 'damageReduction' && effect.critImmune);
}

function hasEffect(unit: Unit, kind: ItemEffect['kind']): boolean {
  return unit.effects.some(({ effect }) => effect.kind === kind);
}

function isTargetable(unit: Unit): boolean {
  return unit.alive && !unit.statuses.has('untargetable');
}

/** Throws on input the server should never send. */
function validate(input: CombatInput): void {
  if (!Number.isInteger(input.seed)) throw new Error(`The seed must be an integer, not ${input.seed}.`);
  if (!Number.isInteger(input.stage) || input.stage < 1) {
    throw new Error(`The stage must be a whole number from 1, not ${input.stage}.`);
  }
  for (const team of TEAMS) {
    const taken = new Set<string>();
    for (const p of input.teams[team]) {
      const where = `Team ${team} (${p.col}, ${p.row})`;
      if (Object.hasOwn(MONSTERS, p.unitId)) {
        if (p.star !== 1) throw new Error(`${where}: monsters are always 1★.`);
        if (p.items.length > 0) throw new Error(`${where}: monsters carry no items.`);
      } else if (!Object.hasOwn(UNITS, p.unitId)) {
        throw new Error(`${where}: unknown unit "${p.unitId}".`);
      }
      if (p.items.length > MAX_ITEMS) throw new Error(`${where}: at most ${MAX_ITEMS} items.`);
      const unknown = p.items.find((item) => !isItemId(item));
      if (unknown !== undefined) throw new Error(`${where}: unknown item "${unknown}".`);
      if (p.star !== 1 && p.star !== 2 && p.star !== 3) throw new Error(`${where}: star must be 1, 2 or 3.`);
      const onHalf =
        Number.isInteger(p.col) && Number.isInteger(p.row) && p.col >= 0 && p.col < BOARD_COLS && p.row >= 0 && p.row < HALF_ROWS;
      if (!onHalf) throw new Error(`${where}: not on the team's half of the board.`);
      const key = `${p.col},${p.row}`;
      if (taken.has(key)) throw new Error(`${where}: two units on one hex.`);
      taken.add(key);
    }
  }
}
