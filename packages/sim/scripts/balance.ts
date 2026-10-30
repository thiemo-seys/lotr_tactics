// Plays many 8-bot games and prints statistics for balancing (docs/game-spec.md section 11).
//
//   pnpm balance [games] [first seed]

import { playBotGame } from '../src/bots/bot.js';
import { traitLevels } from '../src/combat/traits.js';
import type { PlacedUnit } from '../src/combat/combat.js';
import { GIFTS, type GiftId } from '../src/data/gifts.js';
import { ITEMS } from '../src/data/items.js';
import { TRAITS, type TraitId } from '../src/data/traits.js';
import { UNITS, type UnitId } from '../src/data/units.js';

const games = Number(process.argv[2] ?? 100);
const firstSeed = Number(process.argv[3] ?? 1);

/** Running totals of placements for a label. */
class Placements {
  private readonly totals = new Map<string, { sum: number; count: number; top4: number; wins: number }>();

  add(label: string, placement: number): void {
    const t = this.totals.get(label) ?? { sum: 0, count: 0, top4: 0, wins: 0 };
    t.sum += placement;
    t.count++;
    if (placement <= 4) t.top4++;
    if (placement === 1) t.wins++;
    this.totals.set(label, t);
  }

  print(title: string, minCount = 1): void {
    console.log(`\n${title}`);
    console.log('  average  top 4    win  count  name');
    const rows = [...this.totals].filter(([, t]) => t.count >= minCount).sort(([, a], [, b]) => a.sum / a.count - b.sum / b.count);
    for (const [label, t] of rows) {
      const pct = (n: number) => `${Math.round((100 * n) / t.count)}%`.padStart(5);
      console.log(`  ${(t.sum / t.count).toFixed(2).padStart(7)}  ${pct(t.top4)}  ${pct(t.wins)}  ${String(t.count).padStart(5)}  ${label}`);
    }
  }
}

const units = new Placements();
const traits = new Placements();
const items = new Placements();
const gifts = new Placements();
const focus = new Placements();
const endStages = new Map<number, number>();
const pve = new Map<string, { won: number; fought: number }>();
/** Per stage: the games that reach it, totals over living players after planning in its first round, and eliminations. */
const stages = new Map<number, { round: string; games: number; alive: number; hp: number; level: number; gold: number; out: number }>();
let rounds = 0;
let millis = 0;

for (let seed = firstSeed; seed < firstSeed + games; seed++) {
  const seen = new Set<number>();
  const start = performance.now();
  const { game, bots, reports } = playBotGame(seed, 8, (state) => {
    if (seen.has(state.stage)) return;
    seen.add(state.stage);
    const s = stages.get(state.stage) ?? { round: `${state.stage}-${state.round}`, games: 0, alive: 0, hp: 0, level: 0, gold: 0, out: 0 };
    s.games++;
    for (const p of state.players) {
      if (p.placement !== null) continue;
      s.alive++;
      s.hp += p.hp;
      s.level += p.level;
      s.gold += p.gold;
    }
    stages.set(state.stage, s);
  });
  millis += performance.now() - start;
  rounds += reports.length;
  const last = reports[reports.length - 1]!;
  endStages.set(last.stage, (endStages.get(last.stage) ?? 0) + 1);
  for (const report of reports) stages.get(report.stage)!.out += report.eliminated.length;

  // Each player's board in their last fight, which is the one they finished with.
  // And the Gifts they had then, since an eliminated player's Gifts are gone.
  const giftsOf = new Map<number, readonly GiftId[]>();
  const boards = new Map<number, readonly PlacedUnit[]>();
  for (const report of reports) {
    for (const fight of report.fights) {
      boards.set(fight.home, fight.input.teams.A);
      giftsOf.set(fight.home, fight.input.gifts?.A ?? []);
      if (fight.kind === 'pvp') {
        boards.set(fight.away!, fight.input.teams.B);
        giftsOf.set(fight.away!, fight.input.gifts?.B ?? []);
      }
      if (fight.kind === 'pve') {
        const key = report.stage >= 6 ? '6-7 on' : `${report.stage}-${report.round}`;
        const p = pve.get(key) ?? { won: 0, fought: 0 };
        p.fought++;
        if (fight.result.outcome === 'A') p.won++;
        pve.set(key, p);
      }
    }
  }
  for (const player of game.state.players) {
    const placement = player.placement!;
    const board = boards.get(player.seat) ?? [];
    const ids = board.map((u) => u.unitId as UnitId);
    for (const id of new Set(ids)) units.add(UNITS[id].name, placement);
    for (const id of new Set(board.flatMap((u) => u.items))) items.add(ITEMS[id].name, placement);
    for (const id of giftsOf.get(player.seat) ?? []) gifts.add(GIFTS[id].name, placement);
    for (const [trait, level] of Object.entries(traitLevels(ids))) {
      const def = TRAITS[trait as TraitId];
      traits.add(`${def.name} ${def.breakpoints[level]}`, placement);
    }
    const names = bots[player.seat]!.focus.map((t) => TRAITS[t].name);
    focus.add(names.sort().join(' + '), placement);
  }
}

console.log(`${games} games from seed ${firstSeed}: ${(millis / games).toFixed(0)} ms and ${(rounds / games).toFixed(1)} rounds per game`);
console.log(`Games ending in stage: ${[...endStages].sort(([a], [b]) => a - b).map(([s, n]) => `${s}: ${n}`).join(', ')}`);
console.log(`PvE win rate: ${[...pve].map(([k, p]) => `${k} ${Math.round((100 * p.won) / p.fought)}%`).join(', ')}`);

console.log("\nStages: players alive after planning in the first round and out during the stage, per game; living players' average HP, level and gold");
console.log('  round  games  alive    out     HP  level   gold');
for (const [, s] of [...stages].sort(([a], [b]) => a - b)) {
  const cells = [
    s.round.padStart(5),
    String(s.games).padStart(5),
    (s.alive / s.games).toFixed(2).padStart(5),
    (s.out / s.games).toFixed(2).padStart(5),
    (s.hp / s.alive).toFixed(0).padStart(5),
    (s.level / s.alive).toFixed(2).padStart(5),
    (s.gold / s.alive).toFixed(1).padStart(5),
  ];
  console.log(`  ${cells.join('  ')}`);
}

units.print('Units on final boards, by average placement');
traits.print('Active traits on final boards, by average placement');
items.print('Items on final boards, by average placement');
gifts.print('Gifts, by average placement');
focus.print('Bot focus traits, by average placement', 3);
