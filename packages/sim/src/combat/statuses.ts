// The statuses on one unit (docs/sim-spec.md section 12.1): stuns, stun immunity, untargetable,
// slows, Armor and Magic Resist reductions, buffs and shields.
//
// Times are ticks. A status is active until the start of its `expiresTick`, when step 1 of the
// tick removes it (section 6.4).

import type { BuffStat } from '../data/units.js';
import type { StatModifiers } from './stats.js';

/** Statuses that are on or off. A new one extends the current one only if it lasts longer. */
export type TimedStatus = 'stun' | 'stunImmune' | 'untargetable';

export type ReducibleStat = 'armor' | 'magicResist';

export type StatusKind = TimedStatus | 'slow' | 'reduce' | 'buff';

/** The read-only view of a unit's statuses, for the renderer. */
export interface StatusState {
  has(status: TimedStatus): boolean;
  /** The total of the unit's shields. */
  readonly shield: number;
}

interface Expiring {
  readonly expiresTick: number;
}

interface Slow extends Expiring {
  readonly pct: number;
}

interface Reduction extends Expiring {
  readonly stat: ReducibleStat;
  readonly pct: number;
}

interface Buff extends Expiring {
  readonly stat: BuffStat;
  readonly amount: number;
}

interface Shield extends Expiring {
  amount: number;
}

const TIMED_STATUSES: readonly TimedStatus[] = ['stun', 'stunImmune', 'untargetable'];

export class Statuses implements StatusState {
  /** The expiry tick of each timed status, or 0 when it isn't active. */
  private readonly timers: Record<TimedStatus, number> = { stun: 0, stunImmune: 0, untargetable: 0 };
  private readonly slows: Slow[] = [];
  private readonly reductions: Reduction[] = [];
  private readonly buffs: Buff[] = [];
  /** Earliest-expiring first, then oldest first: the order they absorb damage in. */
  private readonly shields: Shield[] = [];
  /** No status expires before this tick, so `expire` can skip the work until then. */
  private nextExpiry = Infinity;

  has(status: TimedStatus): boolean {
    return this.timers[status] !== 0;
  }

  get shield(): number {
    return this.shields.reduce((total, s) => total + s.amount, 0);
  }

  /**
   * Starts or extends a timed status. Returns false if nothing changed: the unit already has it
   * for at least as long, or it is a stun and the unit is immune to stuns.
   */
  extend(status: TimedStatus, expiresTick: number): boolean {
    if (status === 'stun' && this.has('stunImmune')) return false;
    if (expiresTick <= this.timers[status]) return false;
    this.timers[status] = expiresTick;
    this.expiresAt(expiresTick);
    return true;
  }

  /** Only the strongest active slow counts. */
  addSlow(pct: number, expiresTick: number): void {
    this.slows.push({ pct, expiresTick });
    this.expiresAt(expiresTick);
  }

  /** Only the strongest active reduction of each stat counts. */
  addReduction(stat: ReducibleStat, pct: number, expiresTick: number): void {
    this.reductions.push({ stat, pct, expiresTick });
    this.expiresAt(expiresTick);
  }

  /** Buffs add together. */
  addBuff(stat: BuffStat, amount: number, expiresTick: number): void {
    this.buffs.push({ stat, amount, expiresTick });
    this.expiresAt(expiresTick);
  }

  addShield(amount: number, expiresTick: number): void {
    // After every shield that expires no later, so shields expiring together keep creation order.
    const later = this.shields.findIndex((s) => s.expiresTick > expiresTick);
    this.shields.splice(later === -1 ? this.shields.length : later, 0, { amount, expiresTick });
    this.expiresAt(expiresTick);
  }

  /** Takes damage off the shields in order and returns how much they absorbed. */
  absorb(damage: number): number {
    let absorbed = 0;
    while (absorbed < damage && this.shields.length > 0) {
      const shield = this.shields[0]!;
      const taken = Math.min(shield.amount, damage - absorbed);
      shield.amount -= taken;
      absorbed += taken;
      if (shield.amount === 0) this.shields.shift();
    }
    return absorbed;
  }

  /** Removes everything that expires on or before `tick`. Returns true if the unit's stats changed. */
  expire(tick: number): boolean {
    if (tick < this.nextExpiry) return false;
    for (const status of TIMED_STATUSES) {
      if (this.timers[status] !== 0 && this.timers[status] <= tick) this.timers[status] = 0;
    }
    removeExpired(this.shields, tick);
    const slows = removeExpired(this.slows, tick);
    const reductions = removeExpired(this.reductions, tick);
    const buffs = removeExpired(this.buffs, tick);
    this.nextExpiry = Infinity;
    for (const status of TIMED_STATUSES) if (this.timers[status] !== 0) this.expiresAt(this.timers[status]);
    for (const list of [this.shields, this.slows, this.reductions, this.buffs]) {
      for (const entry of list) this.expiresAt(entry.expiresTick);
    }
    return slows || reductions || buffs;
  }

  private expiresAt(tick: number): void {
    this.nextExpiry = Math.min(this.nextExpiry, tick);
  }

  /** The stat modifiers from buffs, slows and reductions (section 7.4). */
  modifiers(): Partial<StatModifiers> {
    const bonuses: Record<BuffStat, number> = { attackDamagePct: 0, attackSpeedPct: 0, armor: 0, magicResist: 0 };
    for (const buff of this.buffs) bonuses[buff.stat] += buff.amount;
    return {
      ...bonuses,
      slowPct: strongest(this.slows),
      armorReductionPct: strongest(this.reductions.filter((r) => r.stat === 'armor')),
      magicResistReductionPct: strongest(this.reductions.filter((r) => r.stat === 'magicResist')),
    };
  }
}

/** Removes the expired entries in place. Returns true if there were any. */
function removeExpired(list: Expiring[], tick: number): boolean {
  const before = list.length;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]!.expiresTick <= tick) list.splice(i, 1);
  }
  return list.length !== before;
}

function strongest(list: readonly { readonly pct: number }[]): number {
  return list.reduce((max, s) => Math.max(max, s.pct), 0);
}
