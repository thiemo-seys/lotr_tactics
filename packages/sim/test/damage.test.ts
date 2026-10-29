import { describe, expect, it } from 'vitest';
import { finalDamage, manaFromDamage, overtimePct, rollAttack } from '../src/combat/damage.js';
import { createRng } from '../src/rng.js';

const NO_MODIFIERS = { ampPct: 0, overtimePct: 100, reductionPct: 0 };

describe('rollAttack', () => {
  // The first two numbers for seed 42 are 0.601... and 0.448....
  it('rolls only crit when the target cannot dodge', () => {
    const rng = createRng(42);
    expect(rollAttack(rng, 25, 0)).toEqual({ dodged: false, crit: false });
    expect(rng()).toBe(0.44829055899754167);
    expect(rollAttack(createRng(42), 61, 0)).toEqual({ dodged: false, crit: true });
  });

  it('rolls dodge first and stops if the attack is dodged', () => {
    const rng = createRng(42);
    expect(rollAttack(rng, 100, 70)).toEqual({ dodged: true, crit: false });
    expect(rng()).toBe(0.44829055899754167);
  });

  it('rolls crit with the next number after a failed dodge', () => {
    expect(rollAttack(createRng(42), 45, 20)).toEqual({ dodged: false, crit: true });
    expect(rollAttack(createRng(42), 40, 20)).toEqual({ dodged: false, crit: false });
  });
});

describe('overtimePct', () => {
  it('adds 10% for each full second of overtime', () => {
    expect(overtimePct(1)).toBe(100);
    expect(overtimePct(899)).toBe(100);
    expect(overtimePct(900)).toBe(100);
    expect(overtimePct(929)).toBe(100);
    expect(overtimePct(930)).toBe(110);
    expect(overtimePct(960)).toBe(120);
    expect(overtimePct(1349)).toBe(240);
  });
});

describe('finalDamage', () => {
  it('reduces physical damage by Armor and magic damage by Magic Resist', () => {
    const target = { armor: 100, magicResist: 50 };
    expect(finalDamage(100, 'physical', target, NO_MODIFIERS)).toBe(50);
    expect(finalDamage(150, 'magic', target, NO_MODIFIERS)).toBe(100);
    expect(finalDamage(100, 'true', target, NO_MODIFIERS)).toBe(100);
  });

  it('applies amps and overtime before resists, and damage reduction last', () => {
    const target = { armor: 25, magicResist: 0 };
    // 100 × 1.25 × 1.2 × 100 / 125 × 0.5 = 60
    expect(finalDamage(100, 'physical', target, { ampPct: 25, overtimePct: 120, reductionPct: 50 })).toBe(60);
  });

  it('rounds to a whole number, with exact halves rounding up', () => {
    const target = { armor: 0, magicResist: 0 };
    expect(finalDamage(42.4, 'physical', target, NO_MODIFIERS)).toBe(42);
    // 45 × 0.5 = 22.5 exactly.
    expect(finalDamage(45, 'true', target, { ...NO_MODIFIERS, reductionPct: 50 })).toBe(23);
  });

  it('never goes below 0', () => {
    expect(finalDamage(0, 'physical', { armor: 50, magicResist: 0 }, NO_MODIFIERS)).toBe(0);
  });
});

describe('manaFromDamage', () => {
  it('gives 6% of the damage, rounded down, up to 15 per hit', () => {
    expect(manaFromDamage(0)).toBe(0);
    expect(manaFromDamage(16)).toBe(0);
    expect(manaFromDamage(17)).toBe(1);
    expect(manaFromDamage(100)).toBe(6);
    expect(manaFromDamage(249)).toBe(14);
    expect(manaFromDamage(250)).toBe(15);
    expect(manaFromDamage(1000)).toBe(15);
  });
});
