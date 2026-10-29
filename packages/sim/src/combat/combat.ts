// The combat simulation: createCombat / step / result (docs/sim-spec.md sections 6, 13 and 14).

import type { OriginId } from '../data/traits.js';
import { UNITS, type SummonId, type UnitId } from '../data/units.js';
import { BOARD_COLS, BOARD_ROWS, boardIndex, distance, fromPlacement, type Hex } from '../hex.js';
import type { Star, Team } from '../types.js';
import type { CombatEvent, Outcome } from './events.js';
import { MOVE_TICKS, planMove } from './movement.js';
import { actionOrder, startingSlots } from './order.js';
import { baseStats, finalStats, type BaseStats, type Stats } from './stats.js';
import { chooseTarget, type TargetingRules } from './targeting.js';
import { LAST_TICK } from './time.js';
import { traitLevels, type TraitLevels } from './traits.js';

export interface PlacedUnit {
  readonly unitId: UnitId;
  readonly star: Star;
  /** 0–6 from left to right, in the team's own perspective. */
  readonly col: number;
  /** 0 is the back row and 3 the front row, in the team's own perspective. */
  readonly row: number;
  /** Not designed yet; ignored. */
  readonly items: readonly string[];
}

export interface CombatInput {
  /** 32-bit integer. */
  readonly seed: number;
  /** The round's stage, from 1. Orc grunts get stronger each stage. */
  readonly stage: number;
  readonly teams: { readonly [T in Team]: readonly PlacedUnit[] };
}

export interface Survivor {
  readonly unitId: UnitId;
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
  readonly unitId: UnitId | SummonId;
  readonly team: Team;
  readonly origin: OriginId;
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
}

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

type Unit = { -readonly [K in keyof UnitState]: UnitState[K] } & {
  /** The unit can't act before this tick. */
  busyUntil: number;
  /** A Burglar with its team's Burglar trait active, so it targets the farthest enemy. */
  targetsFarthest: boolean;
};

class Fight implements Combat {
  tick = 0;
  readonly events: CombatEvent[] = [];
  private readonly units: Unit[] = [];
  private readonly traits: Record<Team, TraitLevels> = { A: {}, B: {} };
  private outcome: Outcome | null = null;

  constructor(input: CombatInput) {
    validate(input);
    this.start(input);
  }

  get state(): CombatState {
    return { units: this.units };
  }

  step(): CombatEvent[] {
    if (this.outcome !== null) throw new Error('The combat is over.');
    this.tick++;
    const firstEvent = this.events.length;
    // Section 6.4. Statuses, the queue and regeneration come in later steps.
    for (const unit of actionOrder(this.living(), this.tick)) this.act(unit);
    // Units can't die yet, so a fight can only end at the time limit.
    if (this.tick === LAST_TICK) this.end('draw');
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
        .flatMap(({ unitId, star }) => (isUnitId(unitId) ? [{ unitId, star }] : []));
    return {
      outcome: this.outcome,
      survivors: { A: survivors('A'), B: survivors('B') },
      finalTick: this.tick,
      events: [...this.events],
    };
  }

  /** Tick 0 (section 6.2). Trait effects at combat start are added in a later step. */
  private start(input: CombatInput): void {
    for (const team of TEAMS) {
      const placements = input.teams[team];
      this.traits[team] = traitLevels(placements.map((p) => p.unitId));
      const burglarTrait = this.traits[team].burglar !== undefined;
      const slots = startingSlots(placements);
      const bySlot = placements.map((p, i) => ({ p, slot: slots[i]! })).sort((a, b) => a.slot - b.slot);
      for (const { p, slot } of bySlot) {
        const def = UNITS[p.unitId];
        const base = baseStats(def, p.star);
        this.addUnit({
          id: this.units.length,
          unitId: p.unitId,
          team,
          origin: def.origin,
          star: p.star,
          summon: false,
          slot,
          hex: fromPlacement(team, p),
          target: null,
          alive: true,
          health: base.maxHealth,
          mana: base.startMana,
          base,
          stats: finalStats(base, {}),
          busyUntil: 0,
          targetsFarthest: burglarTrait && def.classes.includes('burglar'),
        });
      }
    }
    this.checkWipe();
  }

  /** A unit's action for the tick (section 6.4, step 4). Casting and attacks come in later steps. */
  private act(unit: Unit): void {
    if (!unit.alive || this.tick < unit.busyUntil) return;
    const target = this.ensureTarget(unit);
    if (target === null || distance(unit.hex, target.hex) <= unit.stats.range) return;

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
    if (plan.step !== null) this.moveTo(unit, plan.step);
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

function isUnitId(id: UnitId | SummonId): id is UnitId {
  return Object.hasOwn(UNITS, id);
}

function enemyOf(team: Team): Team {
  return team === 'A' ? 'B' : 'A';
}

/** Untargetable units come with statuses (section 12.1). */
function isTargetable(unit: Unit): boolean {
  return unit.alive;
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
      if (!Object.hasOwn(UNITS, p.unitId)) throw new Error(`${where}: unknown unit "${p.unitId}".`);
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
