// A bot that plays one seat through the same actions as a person (docs/game-spec.md section 11).

import { BOT, type ItemRole } from '../data/bots.js';
import { ITEMS, type ItemId } from '../data/items.js';
import { TRAITS, type ClassId, type TraitId } from '../data/traits.js';
import { UNITS, type UnitId } from '../data/units.js';
import { createGame, type Game, type RoundReport } from '../game/game.js';
import { TEAM_ROWS, addItem, type OwnedUnit, type Place, type PlayerView } from '../game/player.js';
import { BOARD_COLS } from '../hex.js';
import { createRng, deriveSeed } from '../rng.js';

/** Bots' random streams start here (game-spec.md section 4). */
const BOT_STREAM = 100;

const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

/** The row each class prefers, in the player's perspective: 3 is the front. */
const PREFERRED_ROW: Readonly<Record<ClassId, number>> = {
  guardian: 3,
  rider: 2,
  captain: 2,
  burglar: 2,
  archer: 0,
  sorcerer: 0,
};

/** Columns from the middle out. */
const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6];

function traitsOf(unitId: UnitId): TraitId[] {
  const def = UNITS[unitId];
  return [def.origin, ...def.classes];
}

function owned(p: PlayerView): { unit: OwnedUnit; place: Place }[] {
  const units: { unit: OwnedUnit; place: Place }[] = [];
  p.board.forEach((unit, i) => {
    if (unit !== null) units.push({ unit, place: { col: i % BOARD_COLS, row: Math.floor(i / BOARD_COLS) } });
  });
  p.bench.forEach((unit, i) => {
    if (unit !== null) units.push({ unit, place: { bench: i } });
  });
  return units;
}

/** The role of an item: its own for a component, its first component's for a combined item. */
function itemRole(item: ItemId): ItemRole {
  const recipe = ITEMS[item].recipe;
  return BOT.itemRoles[recipe === null ? (item as keyof typeof BOT.itemRoles) : recipe[0]];
}

function hasClass(unit: OwnedUnit, trait: ClassId): boolean {
  return UNITS[unit.unitId].classes.includes(trait);
}

function unitAt(p: PlayerView, place: Place): OwnedUnit | null {
  return ('bench' in place ? p.bench[place.bench] : p.board[place.row * BOARD_COLS + place.col]) ?? null;
}

function samePlace(a: Place, b: Place): boolean {
  if ('bench' in a || 'bench' in b) return 'bench' in a && 'bench' in b && a.bench === b.bench;
  return a.col === b.col && a.row === b.row;
}

export class Bot {
  /** A seeded liking for each trait, so bots in one lobby play different comps. */
  private readonly taste: ReadonlyMap<TraitId, number>;
  focus: TraitId[] = [];
  private focusStage = 0;

  constructor(
    readonly seat: number,
    seed: number,
  ) {
    const rng = createRng(deriveSeed(seed, BOT_STREAM + seat));
    this.taste = new Map(TRAIT_IDS.map((trait) => [trait, rng() * BOT.tasteWeight]));
  }

  /** Plays one planning phase. */
  plan(game: Game): void {
    if (game.state.phase !== 'planning' || this.me(game).placement !== null) return;
    this.chooseFocus(game);
    this.level(game);
    this.buy(game);
    if (this.shouldRoll(game)) {
      for (let i = 0; i < BOT.maxRerollsPerRound && this.me(game).gold - 2 >= this.rollFloor(game); i++) {
        if (!game.act(this.seat, { type: 'reroll' }).ok) break;
        this.buy(game);
      }
    }
    this.tidyBench(game);
    this.arrange(game);
    this.equip(game);
  }

  /** Picks a Council option if it is this bot's turn: the one it wants most, the first if tied. */
  pick(game: Game): void {
    const council = game.state.council;
    if (council === null || !council.groups[council.group]!.includes(this.seat)) return;
    if (council.options.some((o) => o.pickedBy === this.seat)) return;
    const me = this.me(game);
    let best = -1;
    let bestScore = -Infinity;
    council.options.forEach((option, i) => {
      const score = option.pickedBy === null ? this.want(me, option.unitId) : -Infinity;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (best >= 0) game.act(this.seat, { type: 'pick', option: best });
  }

  private me(game: Game): PlayerView {
    return game.state.players[this.seat]!;
  }

  private goldFloor(game: Game): number {
    if (this.me(game).hp < BOT.panicHp) return 0;
    return BOT.goldFloor[Math.min(game.state.stage, BOT.goldFloor.length) - 1]!;
  }

  private rollFloor(game: Game): number {
    return this.me(game).hp < BOT.panicHp ? 0 : BOT.rollFloor;
  }

  private targetLevel(game: Game): number {
    const { stage, round } = game.state;
    let level = 1;
    for (const target of BOT.levelTargets) if (stage > target.stage || (stage === target.stage && round >= target.round)) level = target.level;
    return level;
  }

  private shouldRoll(game: Game): boolean {
    const me = this.me(game);
    if (me.hp < BOT.panicHp && game.state.stage >= 2) return true;
    return game.state.stage >= BOT.rollFromStage && me.level >= this.targetLevel(game);
  }

  /** Picks the traits to build around: those with the most units owned, plus taste. */
  private chooseFocus(game: Game): void {
    const { stage } = game.state;
    if (stage < BOT.focusFromStage || stage === this.focusStage) return;
    this.focusStage = stage;
    const ids = new Set(owned(this.me(game)).map((o) => o.unit.unitId));
    const score = new Map(TRAIT_IDS.map((trait) => [trait, this.taste.get(trait)!]));
    for (const id of ids) for (const trait of traitsOf(id)) score.set(trait, score.get(trait)! + 1);
    this.focus = [...TRAIT_IDS].sort((a, b) => score.get(b)! - score.get(a)!).slice(0, BOT.focusTraits);
  }

  private level(game: Game): void {
    while (this.me(game).level < this.targetLevel(game) && this.me(game).gold >= 4) {
      if (!game.act(this.seat, { type: 'buyXp' }).ok) return;
    }
  }

  /** How much the bot wants another copy of a unit. */
  private want(me: PlayerView, unitId: UnitId): number {
    const copies = owned(me).filter((o) => o.unit.unitId === unitId);
    if (copies.filter((o) => o.unit.star === 1).length >= 2) return BOT.want.merge;
    let score = UNITS[unitId].cost * BOT.want.perCost;
    if (copies.some((o) => o.unit.star < 3)) score += BOT.want.copy;
    for (const trait of traitsOf(unitId)) if (this.focus.includes(trait)) score += BOT.want.focusTrait;
    return score;
  }

  /** How much the bot wants to keep a unit it owns. */
  private worth(me: PlayerView, unit: OwnedUnit): number {
    const copies = [1, 3, 9][unit.star - 1]!;
    let score = UNITS[unit.unitId].cost * copies * BOT.want.perCost;
    const twin = owned(me).some((o) => o.unit !== unit && o.unit.unitId === unit.unitId && o.unit.star === unit.star);
    if (twin) score += BOT.want.copy;
    for (const trait of traitsOf(unit.unitId)) if (this.focus.includes(trait)) score += BOT.want.focusTrait;
    return score;
  }

  private buy(game: Game): void {
    for (let slot = 0; slot < 5; slot++) {
      const me = this.me(game);
      const unitId = me.shop[slot];
      if (unitId === null || unitId === undefined) continue;
      const cost = UNITS[unitId].cost;
      const score = this.want(me, unitId);
      const merges = score >= BOT.want.merge;
      const needed = owned(me).length < me.level;
      const affordable = me.gold >= cost && (merges || needed || me.gold - cost >= this.goldFloor(game));
      if (!affordable || (score < BOT.buyThreshold && !needed)) continue;
      if (!merges && !me.bench.includes(null) && !this.sellWorst(game, score)) continue;
      game.act(this.seat, { type: 'buy', slot });
    }
  }

  /** Sells the least useful bench unit if it is worth less than `than`. */
  private sellWorst(game: Game, than: number): boolean {
    const me = this.me(game);
    let worst = -1;
    let worstWorth = than;
    for (let bench = 0; bench < me.bench.length; bench++) {
      const unit = me.bench[bench];
      if (unit === null || unit === undefined) continue;
      const worth = this.worth(me, unit);
      if (worth < worstWorth) {
        worst = bench;
        worstWorth = worth;
      }
    }
    return worst >= 0 && game.act(this.seat, { type: 'sell', from: { bench: worst } }).ok;
  }

  private tidyBench(game: Game): void {
    while (this.me(game).bench.filter((u) => u === null).length < BOT.freeBenchSlots) {
      if (!this.sellWorst(game, BOT.want.copy)) return;
    }
  }

  /** Puts the strongest units on the board and lines them up by class (section 11). */
  private arrange(game: Game): void {
    const me = this.me(game);
    const chosen = owned(me)
      .map((o) => o.unit)
      .sort((a, b) => this.strength(me, b) - this.strength(me, a))
      .slice(0, me.level);
    const chosenIds = new Set(chosen.map((u) => u.id));
    const placeOf = (id: number) => owned(this.me(game)).find((o) => o.unit.id === id)!.place;

    // Swap unchosen board units with chosen bench units, then fill free places.
    for (const { unit, place } of owned(me)) {
      if ('bench' in place || chosenIds.has(unit.id)) continue;
      const waiting = owned(this.me(game)).find((o) => 'bench' in o.place && chosenIds.has(o.unit.id));
      if (waiting !== undefined) game.act(this.seat, { type: 'move', from: waiting.place, to: place });
    }
    const targets = layout(chosen);
    for (const unit of chosen) {
      const from = placeOf(unit.id);
      const to = targets.get(unit.id)!;
      if (!samePlace(from, to)) game.act(this.seat, { type: 'move', from, to });
    }
  }

  /** How strong a unit is, for choosing the board and item holders. Ties go to the older unit. */
  private strength(me: PlayerView, unit: OwnedUnit): number {
    return this.worth(me, unit) * 10 - unit.id / 1e6;
  }

  /**
   * Gives each of its items, in order, to a board unit by the item's role (section 11): the
   * attacker, caster or tank, or else the strongest board unit that can take it.
   */
  private equip(game: Game): void {
    const me = this.me(game);
    const board = owned(me)
      .filter((o) => !('bench' in o.place))
      .sort((a, b) => this.strength(me, b.unit) - this.strength(me, a.unit));
    if (board.length === 0) return;
    const attacker = board.find((o) => !hasClass(o.unit, 'guardian') && !hasClass(o.unit, 'sorcerer'));
    const holders: Record<ItemRole, (typeof board)[number] | undefined> = {
      attacker,
      caster: board.find((o) => hasClass(o.unit, 'sorcerer')) ?? attacker,
      tank: board.find((o) => hasClass(o.unit, 'guardian')) ?? board.find((o) => 'row' in o.place && o.place.row === TEAM_ROWS - 1),
    };
    for (let i = 0; i < this.me(game).items.length; ) {
      const item = this.me(game).items[i]!;
      const preferred = holders[itemRole(item)];
      // Units get new items as this goes, so look at each one as it is now.
      const holder = [...(preferred === undefined ? [] : [preferred]), ...board].find(
        (o) => addItem(unitAt(this.me(game), o.place)!.items, item) !== null,
      );
      // A given item leaves the list, so the next one takes its index.
      if (holder === undefined || !game.act(this.seat, { type: 'equip', item: i, to: holder.place }).ok) i++;
    }
  }
}

/** Board places for units: each class in its preferred row, from the middle out, spilling to the nearest row. */
function layout(units: readonly OwnedUnit[]): Map<number, { col: number; row: number }> {
  const taken = new Set<string>();
  const places = new Map<number, { col: number; row: number }>();
  const byRow = [...units].sort((a, b) => preferredRow(b) - preferredRow(a));
  for (const unit of byRow) {
    const preferred = preferredRow(unit);
    const rows = [0, 1, 2, 3].sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || b - a);
    search: for (const row of rows) {
      for (const col of COLUMN_ORDER) {
        const key = `${col},${row}`;
        if (taken.has(key)) continue;
        taken.add(key);
        places.set(unit.id, { col, row });
        break search;
      }
    }
  }
  return places;
}

function preferredRow(unit: OwnedUnit): number {
  return Math.min(TEAM_ROWS - 1, PREFERRED_ROW[UNITS[unit.unitId].classes[0]]);
}

/** Plays a whole game with a bot in every seat. Bots plan in a rotating order, so no seat always shops first. */
export function playBotGame(seed: number, players = 8): { game: Game; bots: Bot[]; reports: RoundReport[] } {
  const game = createGame({ seed, players });
  const bots = Array.from({ length: players }, (_, seat) => new Bot(seat, seed));
  const reports: RoundReport[] = [];
  let rounds = 0;
  while (!game.isOver()) {
    if (game.state.phase === 'council') {
      const group = game.state.council!.group;
      for (const bot of bots) bot.pick(game);
      if (game.state.phase === 'council' && game.state.council!.group === group) game.advance();
      continue;
    }
    rounds++;
    for (let i = 0; i < players; i++) bots[(rounds + i) % players]!.plan(game);
    reports.push(game.advance()!);
  }
  return { game, bots, reports };
}
