// The combat simulation: createCombat / step / result (docs/sim-spec.md sections 6, 13 and 14).

import { ABILITIES, ATTACKS, MANA, MOVEMENT, TICKS_PER_SECOND } from '../data/rules.js';
import { GIFTS, type GiftCombat, type GiftId } from '../data/gifts.js';
import { MAX_ITEMS, type ItemEffect, type ItemId } from '../data/items.js';
import { RING } from '../data/ring.js';
import { MONSTERS, type FighterId } from '../data/monsters.js';
import type { OriginId } from '../data/traits.js';
import {
  UNITS,
  type AbilityDef,
  type AbilityStep,
  type BuffStat,
  type DamageType,
  type Effect,
  type Selector,
  type SummonId,
} from '../data/units.js';
import { BOARD_COLS, boardIndex, distance, hexEquals, type Hex } from '../hex.js';
import { createRng, type Rng } from '../rng.js';
import type { Star, Team } from '../types.js';
import { dashHex, lineDashHex, select, summonHex, type Selection } from './abilities.js';
import { finalDamage, manaFromDamage, overtimePct, rollAttack } from './damage.js';
import type { CombatEvent, DamageEvent, Outcome } from './events.js';
import { HALF_ROWS, createSummon, createUnit, effectsOf, giftAmpPct, hasOrigin, isSummonId, isUnitId, teamSetup, type Unit } from './fighters.js';
import { isItemId, isRingOfPower } from './items.js';
import { auraField, damageAmpPct, damageReductionPct, isCritImmune, isGripped, type AmpContext, type Auras } from './modifiers.js';
import { MOVE_TICKS, planMove } from './movement.js';
import { actionOrder, firstTeam, startingSlots } from './order.js';
import { abilityValue, combineModifiers, eyeStats, finalStats, gruntStats, type BaseStats, type Stats } from './stats.js';
import type { StatusKind, StatusState } from './statuses.js';
import { chooseTarget, type TargetingRules } from './targeting.js';
import { LAST_TICK, toTicks } from './time.js';
import { activeTrait, type TraitLevels } from './traits.js';

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
  /** Set on the One Ring's bearer: the Ring's Corruption, 0–9 (section 12.6). */
  readonly ring?: number;
}

export interface CombatInput {
  /** 32-bit integer. */
  readonly seed: number;
  /** The round's stage, from 1. Orc grunts get stronger each stage. */
  readonly stage: number;
  readonly teams: { readonly [T in Team]: readonly PlacedUnit[] };
  /** Each team's Gifts of Lothlórien (section 12.5). None if left out. */
  readonly gifts?: { readonly [T in Team]: readonly GiftId[] };
  /** The One Ring's Corruption, 0–9, while a player holds it. It strengthens the Nine (section 12.7). */
  readonly oneRingCorruption?: number;
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
  /** The One Ring's Corruption on its bearer; null for every other unit. */
  readonly ring: number | null;
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

/** How long a cast keeps the caster busy (section 10.1). */
const CAST_TICKS = toTicks(ABILITIES.castSeconds);

/** How long a dash keeps the unit busy (section 2). */
const DASH_TICKS = toTicks(MOVEMENT.dashBusySeconds);

/** The holder and its adjacent allies, for items at combat start (section 12.4). */
const NEARBY_ALLIES: Selector = { kind: 'alliesWithin', radius: 1 };

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
  /** The fight effects of each team's Gifts (section 12.5). */
  private readonly gifts: Record<Team, readonly GiftCombat[]> = { A: [], B: [] };
  /** What each team's damage amps depend on beyond the source and the target, set at tick 0. */
  private readonly ampContexts = {} as Record<Team, AmpContext>;
  /** The One Ring's Corruption while a player holds it, for the Nine; 0 otherwise. */
  private readonly oneRingCorruption: number;
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
    this.oneRingCorruption = input.oneRingCorruption ?? 0;
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
    // 1–2. Units, with their static trait, item and Gift bonuses and the Gondor front-row bonus.
    for (const team of TEAMS) {
      const placements = input.teams[team];
      const setup = teamSetup(placements, input.gifts?.[team] ?? []);
      this.traits[team] = setup.traits;
      this.gifts[team] = setup.gifts;
      const slots = startingSlots(placements);
      const bySlot = placements.map((p, i) => ({ p, slot: slots[i]! })).sort((a, b) => a.slot - b.slot);
      for (const { p, slot } of bySlot) {
        this.addUnit(createUnit(p, { id: this.units.length, team, slot, stage: input.stage, setup, placements }));
      }
      this.ampContexts[team] = {
        traits: setup.traits,
        giftAmpPct: giftAmpPct(setup.gifts, this.units.filter((u) => u.team === team)),
        oneRingCorruption: this.oneRingCorruption,
        units: this.units,
      };
    }

    // 3. Guardian shields.
    for (const unit of this.units) {
      const guardian = activeTrait(this.traits[unit.team], 'guardian');
      if (guardian !== undefined && unit.classes.includes('guardian')) {
        this.addShield(unit.id, unit.id, guardian.shield, guardian.shieldSeconds);
      }
    }

    // 4. Gifts and items at combat start, unit by unit in slot order, team A's first. The unit's
    // items act in the order it holds them, whatever their kind.
    for (const unit of this.units) {
      for (const { startShield } of this.gifts[unit.team]) {
        if (startShield !== undefined) this.addShield(unit.id, unit.id, startShield.amount, startShield.seconds);
      }
      for (const state of unit.effects) {
        const { effect } = state;
        if (effect.kind === 'startShield') {
          for (const ally of this.selectFor(unit, NEARBY_ALLIES).units) this.addShield(unit.id, ally.id, effect.amount, effect.seconds);
        } else if (effect.kind === 'shieldPulse') {
          this.pulseShield(unit, effect, state.pct);
        } else if (effect.kind === 'startBuff') {
          for (const ally of this.selectFor(unit, NEARBY_ALLIES).units) this.addPermanentBuff(unit, ally, effect.stat, effect.amount);
        } else if (effect.kind === 'startStunImmune') {
          this.applyStatus(unit.id, unit.id, { kind: 'stunImmune', seconds: effect.seconds });
        }
      }
      if (unit.ring !== null) this.applyStatus(unit.id, unit.id, { kind: 'untargetable', seconds: RING.untargetableSeconds });
    }

    // 5. Orc grunts, spread round-robin over the team's Orcs in slot order.
    for (const team of TEAMS) {
      const orc = activeTrait(this.traits[team], 'orc');
      const orcs = this.living(team).filter((u) => u.origin === 'orc');
      for (let i = 0; orc !== undefined && i < orc.grunts; i++) {
        const owner = orcs[i % orcs.length]!;
        this.summon(team, owner.hex, 'orc-grunt', gruntStats(this.stage));
      }
    }

    // The Eye's Nazgûl, next to the other team's Ring bearer, unless this team is only monsters.
    for (const team of TEAMS) {
      const bearer = this.living(enemyOf(team)).find((u) => u.ring !== null);
      if (bearer === undefined || !input.teams[team].some((p) => isUnitId(p.unitId))) continue;
      const eye = this.summon(team, bearer.hex, 'eye-nazgul', eyeStats(bearer.ring!));
      if (eye !== null) eye.hunts = bearer;
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
    for (const unit of actionOrder(this.units.filter((u) => u.alive && effectsOf(u, 'startStun').length > 0), first)) {
      for (const { effect } of effectsOf(unit, 'startStun')) {
        const enemy = this.selectFor(unit, { kind: 'farthestEnemy' }).units[0];
        if (enemy !== undefined) this.applyStatus(unit.id, enemy.id, { kind: 'stun', seconds: effect.seconds });
      }
    }

    // 9. Horn of Helm Hammerhand: every enemy is stunned, team A's Horn first. The team's first
    // unit in slot order is the source.
    for (const team of TEAMS) {
      const source = this.living(team)[0];
      for (const { stunEnemiesSeconds } of this.gifts[team]) {
        if (stunEnemiesSeconds === undefined || source === undefined) continue;
        for (const enemy of this.living(enemyOf(team))) this.applyStatus(source.id, enemy.id, { kind: 'stun', seconds: stunEnemiesSeconds });
      }
    }

    // 10. The Nazgûl slow, the Phial of Galadriel and Narya.
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
   * Istari mana, Ent healing, the Elven Cloak, Dragon-helm, Nenya and Vilya, and Hands of the King,
   * on ticks 30, 60, 90, … in action order (section 6.4, step 3).
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
      // The unit's items act in the order it holds them, whatever their kind.
      for (const { effect, pct } of unit.effects) {
        if (effect.kind === 'regen') this.heal(unit, unit, (unit.stats.maxHealth * effect.maxHealthPct) / 100);
        if (effect.kind === 'shieldPulse' && this.tick % toTicks(effect.everySeconds) === 0) this.pulseShield(unit, effect, pct);
        if (effect.kind === 'healPulse' && this.tick % toTicks(effect.everySeconds) === 0) {
          const ally = this.selectFor(unit, { kind: 'lowestHealthPctAllies', count: 1 }).units[0];
          if (ally !== undefined) this.heal(unit, ally, (effect.amount * pct) / 100);
        }
        if (effect.kind !== 'burn') continue;
        for (const enemy of this.selectFor(unit, { kind: 'adjacentEnemies' }).units) {
          if (this.outcome !== null) return;
          if (enemy.alive) this.dealDamage(unit, enemy, (unit.stats.maxHealth * effect.maxHealthPct) / 100, 'magic', false, 'item');
        }
      }
      // Hands of the King.
      for (const { regenPct } of this.gifts[unit.team]) {
        if (regenPct !== undefined && !unit.summon) this.heal(unit, unit, (unit.stats.maxHealth * regenPct) / 100);
      }
    }
  }

  /**
   * The Nazgûl slow and the Phial of Galadriel's Magic Resist reduction on enemies within reach of
   * a living Nazgûl or Phial holder, and Narya's Attack Speed on allies within reach of a living
   * bearer (sections 12.3, 12.4 and 12.7).
   */
  private updateAuras(): void {
    const living = this.living();
    const aurasOn = auraField(living, this.traits);
    for (const unit of living) this.setAuras(unit, aurasOn(unit));
  }

  /** Sets the auras on a unit, and refreshes its stats if any changed. */
  private setAuras(unit: Unit, { slowPct, shredPct, hastePct }: Auras): void {
    if (slowPct === unit.auraSlowPct && shredPct === unit.auraShredPct && hastePct === unit.auraHastePct) return;
    unit.auraSlowPct = slowPct;
    unit.auraShredPct = shredPct;
    unit.auraHastePct = hastePct;
    this.refreshStats(unit);
  }

  /** Nenya: a shield for the holder and its allies within reach (section 12.7). */
  private pulseShield(unit: Unit, effect: Extract<ItemEffect, { kind: 'shieldPulse' }>, pct: number): void {
    for (const ally of this.selectFor(unit, { kind: 'alliesWithin', radius: effect.radius }).units) {
      this.addShield(unit.id, ally.id, (effect.amount * pct) / 100, effect.seconds);
    }
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
    // "Mine!": the Ring's bearer takes no shields from others (section 12.6).
    if (!target.alive || rounded <= 0 || (isGripped(target) && sourceId !== targetId)) return;
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

  /** Recomputes a unit's stats after its statuses, the Nazgûl slow, the Phial's reduction or Narya on it change (section 7.4). */
  private refreshStats(unit: Unit): void {
    unit.stats = finalStats(
      unit.base,
      combineModifiers(unit.staticBonus, unit.statuses.modifiers(), {
        slowPct: unit.auraSlowPct,
        magicResistReductionPct: unit.auraShredPct,
        attackSpeedPct: unit.auraHastePct,
      }),
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
    if (this.tick < unit.betrayUntil) {
      this.betray(unit);
      return;
    }
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
   * Betrayal (section 12.6): the Ring's bearer attacks the nearest ally in range when its attack is
   * ready, and otherwise waits. It doesn't cast, move or choose an enemy target.
   */
  private betray(unit: Unit): void {
    const ally = this.selectFor(unit, { kind: 'nearestAlly' }).units[0];
    if (ally === undefined || distance(unit.hex, ally.hex) > unit.stats.range || this.tick < unit.nextAttackTick) return;
    this.attack(unit, ally);
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
    for (const { effect } of effectsOf(unit, 'healOnCast')) {
      if (this.outcome !== null) continue;
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
          for (let i = 0; i < effect.count; i++) this.summon(caster.team, caster.hex, effect.unit, gruntStats(this.stage));
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
    const bonusPct = effect.bonusVs !== undefined && hasOrigin(target, effect.bonusVs.origin) ? effect.bonusVs.multiplierPct : 100;
    const canCrit = effect.canCrit === true || effectsOf(caster, 'abilityCrit').length > 0;
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
    if (!target.alive || (isGripped(target) && source !== target)) return;
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

  /**
   * Spawns a summon for a team next to a hex, on the team's own half (section 10.3). Returns it, or
   * null if the team's half is full.
   */
  private summon(team: Team, near: Hex, unitId: SummonId, base: BaseStats): Unit | null {
    const hex = summonHex(team, near, this.isFreeFor(null));
    if (hex === null) return null;
    // The next free slot: slots run from 0 with no gaps, dead units keeping theirs.
    const slot = this.units.filter((u) => u.team === team).length;
    const unit = createSummon(this.units.length, team, slot, unitId, hex, base);
    this.addUnit(unit);
    return unit;
  }

  /** A hex is free if it is on the board with no living unit on it. With `mover`, its own hex counts as free. */
  private isFreeFor(mover: Unit | null): (hex: Hex) => boolean {
    const occupied = new Set(this.living().filter((u) => u !== mover).map((u) => boardIndex(u.hex)));
    return (hex) => !occupied.has(boardIndex(hex));
  }

  /** Fires a basic attack (section 9), and the extra ones from Bows of the Galadhrim (section 12.4). */
  private attack(unit: Unit, target: Unit): void {
    const hitTick = this.announceAttack(unit, target);
    const manaPerAttack = effectsOf(unit, 'manaOnAttack').reduce((mana, { effect }) => mana + effect.amount, 0);
    this.gainMana(unit, MANA.perAttack + manaPerAttack);
    // The cooldown after this attack already counts its Archer and Grond stacks.
    const archer = activeTrait(this.traits[unit.team], 'archer');
    if (archer !== undefined && unit.classes.includes('archer') && unit.archerStacks < archer.maxStacks) {
      unit.archerStacks++;
      this.addPermanentBuff(unit, unit, 'attackSpeedPct', archer.attackSpeedPctPerStack);
    }
    for (const state of effectsOf(unit, 'stackOnAttack')) {
      const { effect } = state;
      if (state.uses >= effect.maxStacks) continue;
      state.uses++;
      this.addPermanentBuff(unit, unit, effect.stat, effect.amount);
    }
    unit.nextAttackTick = this.tick + TICKS_PER_SECOND / unit.stats.attackSpeed;
    // Extra attacks go at the nearest other enemies in range, chosen as the attack fires.
    const bows = effectsOf(unit, 'extraAttack').map(({ effect }) => effect.damagePct);
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
    for (const { effect } of effectsOf(target, 'reflect')) {
      if (dealt <= 0 || !source.alive || this.outcome !== null) continue;
      this.dealDamage(target, source, (dealt * effect.pct) / 100, 'magic', false, 'item');
    }
  }

  /** Runs the damage pipeline (section 9.1) and returns the final damage. */
  private dealDamage(source: Unit, target: Unit, raw: number, damageType: DamageType, crit: boolean, kind: DamageEvent['kind']): number {
    const amount = finalDamage(raw, damageType, target.stats, {
      ampPct: damageAmpPct(source, target, this.ampContexts[source.team]),
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
    for (const { effect } of effectsOf(source, 'healOnDamage')) {
      if (this.outcome === null) this.heal(source, source, (amount * effect.pct) / 100);
    }
    return amount;
  }

  /** Orcrist and Herugrim: once each, after damage leaves the holder below a share of its max Health (section 12.4). */
  private checkLowHealth(unit: Unit): void {
    for (const state of effectsOf(unit, 'lowHealth')) {
      const { effect } = state;
      if (state.uses > 0 || unit.health * 100 >= unit.stats.maxHealth * effect.belowPct) continue;
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
    for (const { effect } of effectsOf(killer, 'buffOnKill')) {
      if (killer.alive) this.addPermanentBuff(killer, killer, effect.stat, effect.amount);
    }
    this.checkWipe();
  }

  /** Mana is capped at max mana; the rest is lost (section 10.1). None is gained while casting (section 9.1). */
  private gainMana(unit: Unit, amount: number): void {
    if (this.tick < unit.castingUntil) return;
    unit.mana = Math.min(unit.mana + amount, unit.base.maxMana);
  }

  /**
   * The unit's target, choosing a new one if it has none or the old one is no longer targetable
   * (section 8). The Eye's Nazgûl keeps to the Ring's bearer while it lives (section 12.6).
   */
  private ensureTarget(unit: Unit): Unit | null {
    if (unit.hunts?.alive === true) {
      unit.target = unit.hunts.id;
      return unit.hunts;
    }
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

function enemyOf(team: Team): Team {
  return team === 'A' ? 'B' : 'A';
}

function isTargetable(unit: Unit): boolean {
  return unit.alive && !unit.statuses.has('untargetable');
}

function isCorruption(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < RING.consumedAt;
}

/** Throws on input the server should never send. */
function validate(input: CombatInput): void {
  if (!Number.isInteger(input.seed)) throw new Error(`The seed must be an integer, not ${input.seed}.`);
  if (!Number.isInteger(input.stage) || input.stage < 1) {
    throw new Error(`The stage must be a whole number from 1, not ${input.stage}.`);
  }
  const { oneRingCorruption } = input;
  if (oneRingCorruption !== undefined && !isCorruption(oneRingCorruption)) {
    throw new Error(`The One Ring's Corruption must be 0 to ${RING.consumedAt - 1}, not ${oneRingCorruption}.`);
  }
  const bearers = TEAMS.flatMap((team) => input.teams[team]).filter((p) => p.ring !== undefined);
  if (bearers.length > 1) throw new Error('Only one unit can bear the One Ring.');
  for (const p of bearers) {
    if (Object.hasOwn(MONSTERS, p.unitId)) throw new Error('A monster cannot bear the One Ring.');
    if (!isCorruption(p.ring!)) throw new Error(`The One Ring's Corruption must be 0 to ${RING.consumedAt - 1}, not ${p.ring}.`);
  }
  for (const team of TEAMS) {
    const unknownGift = (input.gifts?.[team] ?? []).find((id) => !Object.hasOwn(GIFTS, id));
    if (unknownGift !== undefined) throw new Error(`Team ${team}: unknown Gift "${unknownGift}".`);
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
      if (p.items.filter(isRingOfPower).length > 1) throw new Error(`${where}: at most one Ring of Power.`);
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
