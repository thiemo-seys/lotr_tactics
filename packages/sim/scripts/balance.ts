// Plays many 8-bot games and prints statistics for balancing (docs/game-spec.md section 11).
//
//   pnpm balance [games] [first seed]

import { playBotGame } from '../src/bots/bot.js';
import { traitLevels } from '../src/combat/traits.js';
import type { PlacedUnit } from '../src/combat/combat.js';
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
const focus = new Placements();
const endStages = new Map<number, number>();
const pve = new Map<string, { won: number; fought: number }>();
let rounds = 0;
let millis = 0;

for (let seed = firstSeed; seed < firstSeed + games; seed++) {
  const start = performance.now();
  const { game, bots, reports } = playBotGame(seed);
  millis += performance.now() - start;
  rounds += reports.length;
  const last = reports[reports.length - 1]!;
  endStages.set(last.stage, (endStages.get(last.stage) ?? 0) + 1);

  // Each player's board in their last fight, which is the one they finished with.
  const boards = new Map<number, readonly PlacedUnit[]>();
  for (const report of reports) {
    for (const fight of report.fights) {
      boards.set(fight.home, fight.input.teams.A);
      if (fight.kind === 'pvp') boards.set(fight.away!, fight.input.teams.B);
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
units.print('Units on final boards, by average placement');
traits.print('Active traits on final boards, by average placement');
items.print('Items on final boards, by average placement');
focus.print('Bot focus traits, by average placement', 3);
