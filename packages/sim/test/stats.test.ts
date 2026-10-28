import { describe, expect, it } from 'vitest';
import { abilityValue, baseStats, finalStats, gruntStats, type Stats } from '../src/combat/stats.js';
import { UNITS } from '../src/data/units.js';

describe('baseStats', () => {
  it('uses the template of the first class for a 1★ 1-cost unit', () => {
    expect(baseStats(UNITS.sam, 1)).toEqual({
      maxHealth: 650,
      attackDamage: 45,
      attackSpeed: 0.6,
      range: 1,
      armor: 40,
      magicResist: 40,
      abilityPower: 100,
      critChancePct: 25,
      critDamagePct: 140,
      dodgePct: 0,
      startMana: 30,
      maxMana: 90,
    });
  });

  it('multiplies Health and Attack Damage by 1.8 per star', () => {
    expect(baseStats(UNITS.sam, 2)).toMatchObject({ maxHealth: 1170, attackDamage: 81, armor: 40 });
    // 45 × 3.24 = 145.8
    expect(baseStats(UNITS.sam, 3)).toMatchObject({ maxHealth: 2106, attackDamage: 146, armor: 40 });
  });

  it('adds 15% Health and Attack Damage and 5 Armor and Magic Resist per cost above 1', () => {
    expect(baseStats(UNITS.gandalf, 1)).toMatchObject({
      maxHealth: 720,
      attackDamage: 56,
      attackSpeed: 0.65,
      range: 4,
      armor: 35,
      magicResist: 35,
      startMana: 20,
      maxMana: 70,
    });
    // 450 × 1.6 × 3.24 = 2332.8 and 35 × 1.6 × 3.24 = 181.44
    expect(baseStats(UNITS.gandalf, 3)).toMatchObject({ maxHealth: 2333, attackDamage: 181 });
  });

  it('rounds exact halves up, as by hand', () => {
    // 50 × 1.15 = 57.5 and 450 × 1.15 = 517.5, which floating-point multiplication would round down.
    expect(baseStats(UNITS.haldir, 1)).toMatchObject({ maxHealth: 518, attackDamage: 58 });
    expect(baseStats(UNITS.haldir, 2)).toMatchObject({ maxHealth: 932, attackDamage: 104 });
  });

  it('uses only the first class for units with two', () => {
    // The Witch-king is a Rider first, so he is a melee fighter despite being a Sorcerer.
    expect(baseStats(UNITS['witch-king'], 1)).toMatchObject({ range: 1, startMana: 0, maxMana: 60 });
  });

  it('applies stat tweaks before rounding', () => {
    const tweaked = { ...UNITS.gimli, statTweaks: { health: 10, attackSpeed: -10, armor: 10 } };
    const stats = baseStats(tweaked, 1);
    // 650 × 1.3 × 1.1 = 929.5
    expect(stats.maxHealth).toBe(930);
    expect(stats.attackSpeed).toBeCloseTo(0.54, 12);
    expect(stats.armor).toBeCloseTo(55, 12);
    expect(stats.magicResist).toBe(50);
  });
});

describe('gruntStats', () => {
  it('grows Health and Attack Damage each stage after the first', () => {
    expect(gruntStats(1)).toMatchObject({ maxHealth: 300, attackDamage: 30, attackSpeed: 0.7, range: 1, armor: 20, magicResist: 20 });
    expect(gruntStats(4)).toMatchObject({ maxHealth: 600, attackDamage: 60 });
  });
});

describe('finalStats', () => {
  const base: Stats = {
    maxHealth: 1000,
    attackDamage: 100,
    attackSpeed: 0.8,
    range: 1,
    armor: 50,
    magicResist: 40,
    abilityPower: 100,
    critChancePct: 25,
    critDamagePct: 140,
    dodgePct: 0,
  };

  it('returns the base stats without modifiers', () => {
    expect(finalStats(base, {})).toEqual(base);
  });

  it('adds flat bonuses', () => {
    expect(finalStats(base, { health: 150, armor: 30, magicResist: 20, abilityPower: 45, critDamagePct: 20 })).toMatchObject({
      maxHealth: 1150,
      armor: 80,
      magicResist: 60,
      abilityPower: 145,
      critDamagePct: 160,
    });
  });

  it('sums percent bonuses and applies the slow after them', () => {
    const stats = finalStats(base, { attackDamagePct: 45, attackSpeedPct: 50, slowPct: 30 });
    expect(stats.attackDamage).toBe(145);
    // 0.8 × 1.5 × 0.7
    expect(stats.attackSpeed).toBeCloseTo(0.84, 12);
  });

  it('keeps Attack Speed between 0.2 and 5', () => {
    expect(finalStats(base, { slowPct: 90 }).attackSpeed).toBe(0.2);
    expect(finalStats(base, { attackSpeedPct: 1000 }).attackSpeed).toBe(5);
  });

  it('applies Armor and Magic Resist reductions after flat bonuses', () => {
    expect(finalStats(base, { armor: 30, armorReductionPct: 30, magicResistReductionPct: 50 })).toMatchObject({
      armor: 56,
      magicResist: 20,
    });
  });

  it('caps Crit Chance at 100% and Dodge at 60%', () => {
    expect(finalStats(base, { critChancePct: 90, dodgePct: 80 })).toMatchObject({ critChancePct: 100, dodgePct: 60 });
  });
});

describe('abilityValue', () => {
  it('matches the examples in docs/design.md section 5', () => {
    expect(abilityValue('D', 100, 1, 1, 100)).toBe(200); // Beregond, 1★
    expect(abilityValue('D', 100, 5, 3, 100)).toBe(900); // Gandalf, 3★
  });

  it('uses the base value for shields and heals', () => {
    expect(abilityValue('S', 60, 1, 1, 100)).toBe(150); // Sam, 1★
    expect(abilityValue('H', 100, 4, 2, 100)).toBe(525); // Elrond, 2★: 200 × 1.75 × 1.5
  });

  it('keeps exact halves exact', () => {
    expect(abilityValue('D', 70, 2, 2, 100)).toBe(262.5); // Haldir, 2★: 200 × 0.7 × 1.25 × 1.5
  });

  it('scales with Ability Power once', () => {
    expect(abilityValue('D', 100, 5, 1, 180)).toBe(abilityValue('D', 100, 5, 1, 100) * 1.8);
  });
});
