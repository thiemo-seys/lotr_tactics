// Items in the fight (docs/sim-spec.md section 12.4).

import { describe, expect, it } from 'vitest';
import { Fight, simulateCombat, type CombatInput, type UnitState } from '../src/combat/combat.js';
import { finalDamage } from '../src/combat/damage.js';
import type { CombatEvent } from '../src/combat/events.js';
import { COMBINED_ITEM_IDS, ITEM_IDS, combine, itemModifiers, itemStats } from '../src/combat/items.js';
import { COMPONENTS, ITEMS } from '../src/data/items.js';
import type { UnitId } from '../src/data/units.js';
import { distance } from '../src/hex.js';
import type { Team } from '../src/types.js';
import { BOARDS, input, ofType, placed, stepTo } from './helpers.js';

function unitOf(fight: Fight, unitId: UnitId, team: Team = 'A'): UnitState {
  return fight.state.units.find((u) => u.unitId === unitId && u.team === team)!;
}

/** Steps a fight to the end, keeping each tick's events. */
function runAll(fightInput: CombatInput): { fight: Fight; events: CombatEvent[] } {
  const fight = new Fight(fightInput);
  while (!fight.isOver()) fight.step();
  return { fight, events: fight.events };
}

const buffs = (events: readonly CombatEvent[], target: number, stat: string, value: number) =>
  ofType(events, 'status').filter((e) => e.target === target && e.status === 'buff' && e.stat === stat && e.value === value);

describe('item data', () => {
  it('has one combined item for every pair of components, in either order', () => {
    expect(COMBINED_ITEM_IDS).toHaveLength(21);
    const made = new Set<string>();
    COMPONENTS.forEach((a, i) =>
      COMPONENTS.slice(i).forEach((b) => {
        expect(combine(a, b)).toBe(combine(b, a));
        made.add(combine(a, b));
      }),
    );
    expect(made.size).toBe(21);
    expect(combine('blade', 'blade')).toBe('anduril');
    expect(combine('cloak', 'blade')).toBe('sting');
    expect(combine('cloak', 'mail')).toBe('mithril-shirt');
    expect(combine('staff', 'cloak')).toBe('phial');
  });

  it('lists recipes in component order', () => {
    for (const id of ITEM_IDS) {
      const recipe = ITEMS[id].recipe;
      if (recipe !== null) expect(COMPONENTS.indexOf(recipe[0])).toBeLessThanOrEqual(COMPONENTS.indexOf(recipe[1]));
    }
  });

  it("gives a combined item its components' stats plus its own", () => {
    expect(itemStats('blade')).toEqual({ attackDamagePct: 15 });
    expect(itemStats('sting')).toMatchObject({ attackDamagePct: 15, magicResist: 20, critChancePct: 25 });
    expect(itemStats('ent-draught')).toMatchObject({ health: 600 });
    expect(itemStats('wizards-staff')).toMatchObject({ abilityPower: 70 });
    expect(itemStats('mithril-shirt')).toMatchObject({ armor: 20, magicResist: 20 });
  });

  it('adds up copies of an item', () => {
    expect(itemModifiers(['blade', 'blade', 'anduril'])).toMatchObject({ attackDamagePct: 60 });
    expect(itemModifiers([])).toMatchObject({ health: 0, armor: 0 });
  });
});

describe('item stats', () => {
  it('raise the holder’s stats for the whole fight, and it starts at full Health', () => {
    const fight = new Fight(
      input([placed('gimli', 3, 3, 1, ['blade', 'lembas', 'staff']), placed('dain', 2, 3, 1, ['ent-draught', 'sting', 'bow'])], [placed('sam', 3, 3)]),
    );
    const gimli = unitOf(fight, 'gimli');
    expect(gimli.stats.attackDamage).toBeCloseTo((gimli.base.attackDamage * 115) / 100);
    expect(gimli.stats.maxHealth).toBe(gimli.base.maxHealth + 150);
    expect(gimli.health).toBe(gimli.stats.maxHealth);
    expect(gimli.stats.abilityPower).toBe(115);
    expect(gimli.items).toEqual(['blade', 'lembas', 'staff']);
    const dain = unitOf(fight, 'dain');
    expect(dain.stats.maxHealth).toBe(dain.base.maxHealth + 600);
    expect(dain.stats.critChancePct).toBe(50);
    expect(dain.stats.magicResist).toBe(dain.base.magicResist + 20);
    expect(dain.stats.attackSpeed).toBeCloseTo((dain.base.attackSpeed * 115) / 100);
  });

  it('stack with trait bonuses', () => {
    const fight = new Fight(input([placed('gimli', 3, 3, 1, ['mail']), placed('dain', 2, 3)], [placed('sam', 3, 3)]));
    const gimli = unitOf(fight, 'gimli');
    // Dwarf 2: +30 Armor.
    expect(gimli.stats.armor).toBe(gimli.base.armor + 30 + 20);
  });
});

describe('item validation', () => {
  it('throws on unknown items, more than 3 items and items on monsters', () => {
    const bad = (A: CombatInput['teams']['A']) => () => new Fight(input(A, [placed('sam', 3, 3)]));
    expect(bad([{ ...placed('sam', 3, 3), items: ['palantir', 'ring' as 'palantir'] }])).toThrow(/unknown item "ring"/);
    expect(bad([placed('sam', 3, 3, 1, ['blade', 'bow', 'mail', 'cloak'])])).toThrow(/at most 3 items/);
    expect(bad([{ unitId: 'warg', star: 1, col: 3, row: 3, items: ['blade'] }])).toThrow(/monsters carry no items/);
    expect(bad([placed('sam', 3, 3, 1, ['blade', 'bow', 'mail'])])).not.toThrow();
  });
});

describe('items at combat start', () => {
  it("Star of Elendil and King's Banner: the holder and adjacent allies, in slot order at tick 0", () => {
    const fight = new Fight(
      input(
        [placed('aragorn', 3, 3, 1, ['star-of-elendil', 'kings-banner']), placed('boromir', 2, 3), placed('legolas', 0, 0)],
        [placed('sam', 3, 3)],
      ),
    );
    const holder = unitOf(fight, 'aragorn');
    const neighbour = unitOf(fight, 'boromir');
    const far = unitOf(fight, 'legolas');
    const shields = ofType(fight.events, 'shield').filter((e) => e.source === holder.id);
    // Boromir is in slot 0, Aragorn in slot 1.
    expect(shields.map((s) => [s.target, s.amount, s.expiresTick])).toEqual([
      [neighbour.id, 300, 240],
      [holder.id, 300, 240],
    ]);
    expect(buffs(fight.events, holder.id, 'attackSpeedPct', 20)).toHaveLength(1);
    expect(buffs(fight.events, neighbour.id, 'attackSpeedPct', 20)[0]).toMatchObject({ source: holder.id, expiresTick: null });
    expect(buffs(fight.events, far.id, 'attackSpeedPct', 20)).toHaveLength(0);
    expect(neighbour.stats.attackSpeed).toBeCloseTo((neighbour.base.attackSpeed * 120) / 100);
  });

  it('Miruvor: stun immunity for 15 seconds, so stuns do nothing', () => {
    const { fight, events } = runAll(input([placed('sam', 3, 3, 1, ['miruvor'])], [placed('beregond', 3, 3, 3)]));
    const sam = unitOf(fight, 'sam');
    expect(ofType(events, 'status').find((e) => e.target === sam.id && e.status === 'stunImmune')).toMatchObject({ tick: 0, expiresTick: 450 });
    const beregond = unitOf(fight, 'beregond', 'B');
    expect(ofType(events, 'cast').some((e) => e.unit === beregond.id && e.tick < 450)).toBe(true);
    expect(ofType(events, 'status').filter((e) => e.target === sam.id && e.status === 'stun' && e.tick < 450)).toHaveLength(0);
  });

  it('Elven Rope: stuns the farthest enemy for 3 seconds, after the leaps', () => {
    const fight = new Fight(
      input([placed('sam', 3, 3, 1, ['elven-rope'])], [placed('beregond', 3, 3), placed('faramir', 0, 0), placed('haldir', 5, 1)]),
    );
    const sam = unitOf(fight, 'sam');
    const enemies = fight.state.units.filter((u) => u.team === 'B');
    const farthest = Math.max(...enemies.map((u) => distance(u.hex, sam.hex)));
    const stuns = ofType(fight.events, 'status').filter((e) => e.status === 'stun');
    expect(stuns).toHaveLength(1);
    expect(stuns[0]).toMatchObject({ source: sam.id, tick: 0, expiresTick: 90 });
    expect(distance(fight.state.units[stuns[0]!.target]!.hex, sam.hex)).toBe(farthest);
  });
});

describe('items in the fight', () => {
  it('Andúril: each kill gives +15% Attack Damage for the rest of the fight', () => {
    const { fight, events } = runAll(input([placed('gimli', 3, 3, 3, ['anduril'])], [placed('sam', 3, 3), placed('merry', 2, 3)]));
    const gimli = unitOf(fight, 'gimli');
    const deaths = ofType(events, 'death');
    expect(deaths).toHaveLength(2);
    const gained = buffs(events, gimli.id, 'attackDamagePct', 15);
    expect(gained.map((e) => e.tick)).toEqual(deaths.map((e) => e.tick));
    expect(gained.every((e) => e.expiresTick === null && e.source === gimli.id)).toBe(true);
    // Each buff comes right after its death, before the fight ends.
    for (const buff of gained) expect(events[events.indexOf(buff) - 1]).toMatchObject({ type: 'death' });
  });

  it('Black Arrow: 30% more damage against enemies with more max Health, none against others', () => {
    for (const [enemy, amp] of [
      ['gimli', 30],
      ['merry', 0],
    ] as const) {
      const fight = new Fight(input([placed('legolas', 3, 3, 1, ['black-arrow'])], [placed(enemy, 3, 3)]));
      const legolas = unitOf(fight, 'legolas');
      const target = unitOf(fight, enemy, 'B');
      const hit = ofType(stepTo(fight, 30), 'damage').find((e) => e.source === legolas.id && e.kind === 'attack')!;
      const raw = (legolas.stats.attackDamage * (hit.crit ? legolas.stats.critDamagePct : 100)) / 100;
      expect(hit.amount).toBe(finalDamage(raw, 'physical', target.stats, { ampPct: amp, overtimePct: 100, reductionPct: 0 }));
    }
  });

  it('Orcrist: once below half Health, untargetable for 1s and +40% Attack Speed', () => {
    const { fight, events } = runAll(input([placed('sam', 3, 3, 1, ['orcrist'])], [placed('beregond', 3, 3, 2), placed('hama', 2, 3, 2)]));
    const sam = unitOf(fight, 'sam');
    const hidden = ofType(events, 'status').filter((e) => e.target === sam.id && e.status === 'untargetable');
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.expiresTick).toBe(hidden[0]!.tick + 30);
    expect(buffs(events, sam.id, 'attackSpeedPct', 40).map((e) => e.tick)).toEqual([hidden[0]!.tick]);
    // The damage that set it off left Sam below half Health.
    const taken = ofType(events, 'damage').filter((e) => e.target === sam.id && e.tick <= hidden[0]!.tick);
    const healthAfter = sam.stats.maxHealth - taken.reduce((sum, e) => sum + e.amount - e.absorbed, 0);
    expect(healthAfter * 2).toBeLessThan(sam.stats.maxHealth);
  });

  it('Herugrim: once below half Health, a shield of 30% max Health for 5s and +30% Attack Damage', () => {
    const { fight, events } = runAll(input([placed('beregond', 3, 3, 1, ['herugrim'])], [placed('merry', 3, 3, 2), placed('sharku', 2, 3, 2)]));
    const sam = unitOf(fight, 'beregond');
    const shields = ofType(events, 'shield').filter((e) => e.target === sam.id && e.source === sam.id);
    expect(shields).toHaveLength(1);
    expect(shields[0]).toMatchObject({ amount: Math.round((sam.stats.maxHealth * 30) / 100), expiresTick: shields[0]!.tick + 150 });
    expect(buffs(events, sam.id, 'attackDamagePct', 30).map((e) => e.tick)).toEqual([shields[0]!.tick]);
  });

  it('Sting: +25% Crit Chance, and abilities can crit', () => {
    const crits = (items: Parameters<typeof placed>[4]) => {
      let count = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const { fight, events } = runAll({ ...input([placed('merry', 3, 3, 1, items)], [placed('gimli', 3, 3, 2)]), seed });
        const merry = unitOf(fight, 'merry');
        count += ofType(events, 'damage').filter((e) => e.source === merry.id && e.kind === 'ability' && e.crit).length;
      }
      return count;
    };
    expect(crits(['sting'])).toBeGreaterThan(0);
    expect(crits(['blade', 'cloak'])).toBe(0);
  });

  it('Glamdring: heals 20% of the damage the holder deals', () => {
    const { fight, events } = runAll(input([placed('gimli', 3, 3, 1, ['glamdring'])], [placed('dain', 3, 3)]));
    const gimli = unitOf(fight, 'gimli');
    const heals = ofType(events, 'heal').filter((e) => e.source === gimli.id && e.target === gimli.id);
    expect(heals.length).toBeGreaterThan(0);
    for (const heal of heals) {
      const i = events.indexOf(heal);
      const damage = events[i - 1]!;
      expect(damage).toMatchObject({ type: 'damage', source: gimli.id, tick: heal.tick });
      expect(heal.amount).toBeLessThanOrEqual(Math.round(((damage as { amount: number }).amount * 20) / 100));
    }
  });

  it('Bow of the Galadhrim: also fires at the nearest other enemy in range, for half damage and no mana', () => {
    const fight = new Fight(
      input([placed('legolas', 3, 1, 1, ['galadhrim-bow'])], [placed('sam', 3, 3), placed('merry', 4, 3), placed('pippin', 0, 0)]),
    );
    const legolas = unitOf(fight, 'legolas');
    const events = stepTo(fight, 1);
    const attacks = ofType(events, 'attack').filter((e) => e.unit === legolas.id);
    expect(attacks).toHaveLength(2);
    expect(attacks[0]!.target).not.toBe(attacks[1]!.target);
    const extra = fight.state.units[attacks[1]!.target]!;
    expect(distance(extra.hex, legolas.hex)).toBeLessThanOrEqual(legolas.stats.range);
    expect(legolas.mana).toBe(10);
    const landed = stepTo(fight, attacks[1]!.hitTick);
    const hit = ofType(landed, 'damage').find((e) => e.source === legolas.id && e.target === extra.id)!;
    const raw = (legolas.stats.attackDamage * (hit.crit ? legolas.stats.critDamagePct : 100) * 50) / 10_000;
    expect(hit.amount).toBe(finalDamage(raw, 'physical', extra.stats, { ampPct: 0, overtimePct: 100, reductionPct: 0 }));
  });

  it('Bow of the Galadhrim: no extra attack without another enemy in range', () => {
    const fight = new Fight(input([placed('gimli', 3, 3, 1, ['galadhrim-bow'])], [placed('sam', 3, 3), placed('pippin', 0, 0)]));
    const gimli = unitOf(fight, 'gimli');
    expect(ofType(stepTo(fight, 1), 'attack').filter((e) => e.unit === gimli.id)).toHaveLength(1);
  });

  it('Grond: +5% Attack Speed per attack, up to 20 stacks', () => {
    const { fight, events } = runAll(input([placed('gimli', 3, 3, 3, ['grond', 'elven-cloak'])], [placed('sam', 3, 3, 3, ['ent-draught', 'ent-draught', 'elven-cloak'])]));
    const gimli = unitOf(fight, 'gimli');
    const attacks = ofType(events, 'attack').filter((e) => e.unit === gimli.id);
    expect(attacks.length).toBeGreaterThan(20);
    const stacks = buffs(events, gimli.id, 'attackSpeedPct', 5);
    expect(stacks).toHaveLength(20);
    expect(stacks.map((e) => e.tick)).toEqual(attacks.slice(0, 20).map((e) => e.tick));
  });

  it('Palantír: 5 more mana per attack', () => {
    const fight = new Fight(input([placed('legolas', 3, 1, 1, ['palantir'])], [placed('sam', 3, 3)]));
    stepTo(fight, 1);
    expect(unitOf(fight, 'legolas').mana).toBe(15);
  });

  it('Oakenshield: an attack that hits the holder deals 30% of its damage back as magic damage', () => {
    const fight = new Fight(input([placed('gimli', 3, 3, 1, ['oakenshield'])], [placed('sam', 3, 3)]));
    const sam = unitOf(fight, 'sam', 'B');
    const gimli = unitOf(fight, 'gimli');
    const events = stepTo(fight, 60);
    const hit = ofType(events, 'damage').find((e) => e.source === sam.id && e.kind === 'attack')!;
    const back = events[events.indexOf(hit) + 1]!;
    expect(back).toMatchObject({ type: 'damage', source: gimli.id, target: sam.id, kind: 'item', damageType: 'magic', crit: false });
    expect((back as { amount: number }).amount).toBe(
      finalDamage((hit.amount * 30) / 100, 'magic', sam.stats, { ampPct: 0, overtimePct: 100, reductionPct: 0 }),
    );
  });

  it('Mithril Shirt: 15% less damage, and no crits against the holder', () => {
    let hits = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const { fight, events } = runAll({ ...input([placed('gimli', 3, 3, 1, ['mithril-shirt'])], [placed('merry', 3, 3, 2)]), seed });
      const gimli = unitOf(fight, 'gimli');
      const taken = ofType(events, 'damage').filter((e) => e.target === gimli.id);
      expect(taken.some((e) => e.crit)).toBe(false);
      hits += taken.length;
    }
    expect(hits).toBeGreaterThan(0);
    const fight = new Fight(input([placed('gimli', 3, 3, 1, ['mithril-shirt'])], [placed('sam', 3, 3)]));
    const sam = unitOf(fight, 'sam', 'B');
    const gimli = unitOf(fight, 'gimli');
    const hit = ofType(stepTo(fight, 60), 'damage').find((e) => e.source === sam.id && e.kind === 'attack')!;
    expect(hit.amount).toBe(finalDamage(sam.stats.attackDamage, 'physical', gimli.stats, { ampPct: 0, overtimePct: 100, reductionPct: 15 }));
  });

  it('Dragon-helm: every second, 2% of max Health as magic damage to each adjacent enemy', () => {
    const fight = new Fight(input([placed('gimli', 3, 3, 1, ['dragon-helm'])], [placed('sam', 3, 3), placed('merry', 2, 3), placed('pippin', 0, 0)]));
    const gimli = unitOf(fight, 'gimli');
    const events = stepTo(fight, 30);
    const burns = ofType(events, 'damage').filter((e) => e.source === gimli.id && e.kind === 'item');
    expect(burns.every((e) => e.tick === 30 && e.damageType === 'magic')).toBe(true);
    const adjacent = fight.state.units.filter((u) => u.team === 'B' && u.alive && distance(u.hex, gimli.hex) === 1);
    expect(burns.map((e) => e.target).sort()).toEqual(adjacent.map((u) => u.id).sort());
    for (const burn of burns) {
      const target = fight.state.units[burn.target]!;
      expect(burn.amount).toBe(finalDamage((gimli.stats.maxHealth * 2) / 100, 'magic', target.stats, { ampPct: 0, overtimePct: 100, reductionPct: 0 }));
    }
    expect(burns.length).toBeGreaterThan(0);
  });

  it('Elven Cloak: heals 2% of max Health every second', () => {
    const { fight, events } = runAll(input([placed('sam', 3, 3, 1, ['elven-cloak'])], [placed('gimli', 3, 3)]));
    const sam = unitOf(fight, 'sam');
    const heals = ofType(events, 'heal').filter((e) => e.source === sam.id && e.target === sam.id);
    expect(heals.length).toBeGreaterThan(0);
    expect(heals.every((e) => e.tick % 30 === 0 && e.amount <= Math.round((sam.stats.maxHealth * 2) / 100))).toBe(true);
  });

  it('Phial of Galadriel: enemies within 2 hexes have 30% less Magic Resist', () => {
    const fight = new Fight(input([placed('gandalf', 3, 3, 1, ['phial'])], [placed('sam', 3, 3), placed('pippin', 0, 0)]));
    const gandalf = unitOf(fight, 'gandalf');
    for (const id of ['sam', 'pippin'] as const) {
      const enemy = unitOf(fight, id, 'B');
      const near = distance(enemy.hex, gandalf.hex) <= 2;
      expect(enemy.stats.magicResist).toBeCloseTo((enemy.base.magicResist * (near ? 70 : 100)) / 100);
    }
    expect(distance(unitOf(fight, 'sam', 'B').hex, gandalf.hex)).toBeLessThanOrEqual(2);
    expect(distance(unitOf(fight, 'pippin', 'B').hex, gandalf.hex)).toBeGreaterThan(2);
  });

  it('Phial of Galadriel: only the strongest Magic Resist reduction counts', () => {
    // Merry's Barrow-blade lowers Magic Resist by 30% too; together they stay at 30%.
    const fight = new Fight(input([placed('merry', 3, 3, 1, ['phial'])], [placed('gimli', 3, 3)]));
    const gimli = unitOf(fight, 'gimli', 'B');
    const merry = unitOf(fight, 'merry');
    while (!fight.isOver() && !ofType(fight.events, 'cast').some((e) => e.unit === merry.id)) fight.step();
    expect(gimli.stats.magicResist).toBeCloseTo((gimli.base.magicResist * 70) / 100);
  });

  it('Athelas: after a cast, heals the ally with the lowest Health % for up to 200', () => {
    const { fight, events } = runAll(input([placed('merry', 3, 3, 1, ['athelas']), placed('sam', 2, 3)], [placed('gimli', 3, 3, 2)]));
    const merry = unitOf(fight, 'merry');
    const casts = ofType(events, 'cast').filter((e) => e.unit === merry.id);
    expect(casts.length).toBeGreaterThan(0);
    const heals = ofType(events, 'heal').filter((e) => e.source === merry.id);
    expect(heals.length).toBeGreaterThan(0);
    for (const heal of heals) {
      expect(casts.some((c) => c.tick === heal.tick)).toBe(true);
      expect(heal.amount).toBeLessThanOrEqual(200);
      expect(fight.state.units[heal.target]!.team).toBe('A');
    }
  });
});

describe('items and fairness', () => {
  it('a board with every item replays identically and stays symmetric in a mirror match', () => {
    const fightInput = input(BOARDS.items, BOARDS.items, 7);
    expect(simulateCombat(fightInput).events).toEqual(simulateCombat(fightInput).events);
    // Team B's units are the mirror of team A's.
    const fight = new Fight(fightInput);
    for (const unit of fight.state.units.filter((u) => u.team === 'A')) {
      const twin = fight.state.units.find((u) => u.team === 'B' && u.unitId === unit.unitId)!;
      expect(twin.stats).toEqual(unit.stats);
      expect(twin.items).toEqual(unit.items);
    }
  });
});
