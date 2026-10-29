import { describe, expect, it } from 'vitest';
import { Fight, createCombat, simulateCombat, type PlacedUnit } from '../src/combat/combat.js';
import { finalDamage } from '../src/combat/damage.js';
import { abilityValue, monsterStats } from '../src/combat/stats.js';
import { MONSTERS, type MonsterId } from '../src/data/monsters.js';
import type { Effect } from '../src/data/units.js';
import { input, ofType, placed } from './helpers.js';

function monster(unitId: MonsterId, col: number, row: number): PlacedUnit {
  return { unitId, star: 1, col, row, items: [] };
}

/** Fills a monster's mana, stuns everyone else for tick 1, and returns tick 1's events from its cast. */
function castBy(caster: PlacedUnit, enemies: readonly PlacedUnit[]) {
  const fight = new Fight(input([caster], enemies));
  const [self, ...others] = fight.state.units;
  for (const unit of others) fight.applyStatus(unit.id, unit.id, { kind: 'stun', seconds: 2 / 30 });
  Object.assign(self!, { mana: self!.base.maxMana });
  const events = fight.step();
  return { fight, events: events.slice(events.findIndex((e) => e.type === 'cast')) };
}

describe('monster data', () => {
  it('has the monsters from docs/game-spec.md section 9.8, each matching its key', () => {
    expect(Object.keys(MONSTERS)).toEqual(['goblin', 'goblin-archer', 'warg', 'cave-troll', 'watcher', 'mumak', 'balrog']);
    for (const [key, def] of Object.entries(MONSTERS)) expect(def.id).toBe(key);
  });

  it('gives abilities and mana only to the Large monsters', () => {
    for (const def of Object.values(MONSTERS)) {
      expect(def.ability !== undefined).toBe(def.large === true);
      expect(def.stats.maxMana > 0).toBe(def.large === true);
    }
  });
});

describe('monster stats', () => {
  it('use the stats from the data, with the shared stats', () => {
    expect(monsterStats(MONSTERS.warg, 4)).toEqual({
      maxHealth: 600,
      attackDamage: 50,
      attackSpeed: 0.85,
      range: 1,
      armor: 25,
      magicResist: 25,
      abilityPower: 100,
      critChancePct: 25,
      critDamagePct: 140,
      dodgePct: 0,
      startMana: 0,
      maxMana: 0,
    });
  });

  it('make the Balrog 25% stronger for each stage after 6', () => {
    const at = (stage: number) => monsterStats(MONSTERS.balrog, stage);
    expect([5, 6, 7, 8].map((stage) => at(stage).maxHealth)).toEqual([6000, 6000, 7500, 9000]);
    expect([5, 6, 7, 8].map((stage) => at(stage).attackDamage)).toEqual([180, 180, 225, 270]);
    expect(at(8).armor).toBe(60);
  });
});

describe('monsters in a fight', () => {
  it('fight without traits, and the units next to them still count theirs', () => {
    const combat = createCombat(input([placed('gimli', 3, 3)], [monster('goblin', 2, 3), placed('sam', 3, 3), placed('merry', 4, 3)]));
    const [, goblin, sam] = combat.state.units;
    expect(goblin!.origin).toBeNull();
    expect(goblin!.stats.maxHealth).toBe(350);
    // Sam and Merry make the Hobbit trait active; the goblin doesn't count towards anything.
    expect(sam!.stats.maxHealth).toBe(650 + 150);
  });

  it('count as survivors for player damage', () => {
    const result = simulateCombat(input([placed('sam', 3, 3)], [monster('warg', 3, 3), monster('warg', 2, 3)]));
    expect(result.outcome).toBe('B');
    expect(result.survivors.B.map((s) => s.unitId)).toContain('warg');
    expect(result.survivors.B.every((s) => s.star === 1)).toBe(true);
  });

  it('must be 1★', () => {
    expect(() => createCombat(input([], [{ ...monster('goblin', 3, 3), star: 2 }]))).toThrow(/always 1★/);
    expect(() => createCombat(input([], [{ ...monster('goblin', 3, 3), unitId: 'orc' as MonsterId }]))).toThrow(/unknown unit/);
  });

  it('take bonus damage from Dwarves when Large', () => {
    const dwarves = [placed('gimli', 3, 3), placed('dain', 2, 3)];
    const firstHit = (target: MonsterId) => {
      const fight = new Fight(input(dwarves, [monster(target, 3, 3)]));
      const hits = ofType(fight.step(), 'damage').filter((e) => e.source === 0 && e.kind === 'attack');
      return { hit: hits[0], fight };
    };
    const { hit, fight } = firstHit('cave-troll');
    const [gimli, , troll] = fight.state.units;
    const raw = (gimli!.stats.attackDamage * (hit!.crit ? 140 : 100)) / 100;
    expect(hit!.amount).toBe(finalDamage(raw, 'physical', troll!.stats, { ampPct: 20, overtimePct: 100, reductionPct: 0 }));
    expect(hit!.amount).toBeGreaterThan(finalDamage(raw, 'physical', troll!.stats, { ampPct: 0, overtimePct: 100, reductionPct: 0 }));
  });
});

describe('monster abilities', () => {
  const effects = (id: MonsterId): Effect[] => MONSTERS[id].ability!.steps.flatMap((s) => ('effects' in s ? s.effects : []));

  it('Cave Troll: Smash damages and stuns adjacent enemies', () => {
    const { events } = castBy(monster('cave-troll', 3, 3), [placed('sam', 3, 3), placed('merry', 2, 3), placed('legolas', 3, 0)]);
    expect(events[0]).toMatchObject({ type: 'cast', ability: 'Smash' });
    const value = abilityValue('D', 100, 3, 1, 100);
    expect(value).toBe(300);
    expect(ofType(events, 'damage').map((e) => e.target)).toEqual([1, 2]);
    expect(ofType(events, 'status').filter((e) => e.status === 'stun').map((e) => e.target)).toEqual([1, 2]);
    expect(effects('cave-troll')).toContainEqual({ kind: 'stun', seconds: 1 });
  });

  it('Watcher in the Water: Tentacles hit the target and the enemies next to it', () => {
    const { events, fight } = castBy(monster('watcher', 3, 3), [placed('sam', 3, 3), placed('merry', 2, 3), placed('legolas', 3, 0)]);
    expect(events[0]).toMatchObject({ type: 'cast', ability: 'Tentacles' });
    const target = fight.state.units[0]!.target;
    const hit = ofType(events, 'damage').map((e) => e.target);
    expect(hit).toContain(target);
    expect(hit).not.toContain(3);
    expect(ofType(events, 'status').filter((e) => e.status === 'stun')).toHaveLength(hit.length);
  });

  it('Mûmak: Trample rides through a line, damaging and stunning', () => {
    const { events } = castBy(monster('mumak', 3, 3), [placed('sam', 3, 3), placed('merry', 3, 2), placed('pippin', 3, 1)]);
    expect(events[0]).toMatchObject({ type: 'cast', ability: 'Trample' });
    expect(ofType(events, 'damage').length).toBeGreaterThan(0);
    expect(ofType(events, 'dash')).toHaveLength(1);
  });

  it('The Balrog: Whip of flame deals magic damage in a cone and stuns', () => {
    const { events } = castBy(monster('balrog', 3, 3), [placed('sam', 3, 3), placed('merry', 2, 3), placed('pippin', 4, 3)]);
    expect(events[0]).toMatchObject({ type: 'cast', ability: 'Whip of flame' });
    const damage = ofType(events, 'damage');
    expect(damage.length).toBeGreaterThan(0);
    expect(damage.every((e) => e.damageType === 'magic' && e.kind === 'ability')).toBe(true);
    expect(ofType(events, 'status').filter((e) => e.status === 'stun')).toHaveLength(damage.length);
  });
});
