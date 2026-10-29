// A whole game: rounds, fights, damage and placement (docs/game-spec.md sections 9 and 10).

import { simulateCombat, type CombatInput, type CombatResult, type PlacedUnit } from '../combat/combat.js';
import { XP } from '../data/economy.js';
import { GIFT_ROUNDS } from '../data/gifts.js';
import { COMPONENTS, type ComponentId } from '../data/items.js';
import { MATCHMAKING, type RoundType } from '../data/rounds.js';
import { UNITS, type Cost, type UnitId } from '../data/units.js';
import { createRng, deriveSeed, randomInt, randomSeed, shuffle, type Rng } from '../rng.js';
import { pickGroups, rollCouncilOptions, type CouncilOption } from './council.js';
import { pairPlayers } from './matchmaking.js';
import { Player, baseIncome, type ActionResult, type Place, type PlayerView } from './player.js';
import { Pool } from './pool.js';
import { nextRound, playerDamage, pveRound, roundType } from './schedule.js';

export interface GameConfig {
  /** 32-bit integer. */
  readonly seed: number;
  /** 2 to 8. */
  readonly players: number;
}

export type Action =
  | { readonly type: 'buy'; readonly slot: number }
  | { readonly type: 'sell'; readonly from: Place }
  | { readonly type: 'move'; readonly from: Place; readonly to: Place }
  | { readonly type: 'reroll' }
  | { readonly type: 'buyXp' }
  | { readonly type: 'lock'; readonly locked: boolean }
  /** Gives the player's item at this index to the unit at `to`. */
  | { readonly type: 'equip'; readonly item: number; readonly to: Place }
  /** Takes the Gift at this index of the player's offer. */
  | { readonly type: 'gift'; readonly option: number }
  | { readonly type: 'rerollGifts' }
  | { readonly type: 'pick'; readonly option: number };

export type Phase = 'council' | 'planning' | 'over';

export interface CouncilOptionView {
  readonly unitId: UnitId;
  readonly component: ComponentId;
  readonly pickedBy: number | null;
}

export interface CouncilState {
  readonly options: readonly CouncilOptionView[];
  /** The groups that pick in turn, as seats. */
  readonly groups: readonly (readonly number[])[];
  /** The index of the group whose turn it is. */
  readonly group: number;
}

export interface PoolView {
  count(unitId: UnitId): number;
  countOfCost(cost: Cost): number;
}

/** A read-only view of the game. */
export interface GameState {
  readonly stage: number;
  readonly round: number;
  readonly type: RoundType;
  readonly phase: Phase;
  readonly players: readonly PlayerView[];
  /** Set during a Council. */
  readonly council: CouncilState | null;
  readonly pool: PoolView;
}

export interface FightReport {
  readonly kind: 'pvp' | 'ghost' | 'pve';
  /** The seat of team A. */
  readonly home: number;
  /** The seat of team B, the ghost's owner, or null for PvE. */
  readonly away: number | null;
  /** Enough to replay the fight with `createCombat`. */
  readonly input: CombatInput;
  readonly result: CombatResult;
}

export interface RoundReport {
  readonly stage: number;
  readonly round: number;
  readonly fights: readonly FightReport[];
  /** Damage taken, in seat order, for players who took any. */
  readonly damage: readonly { readonly seat: number; readonly amount: number }[];
  /** Seats eliminated this round, best place first. */
  readonly eliminated: readonly number[];
}

export interface Game {
  readonly state: GameState;
  /** Applies a player's action. One that isn't allowed returns ok: false and changes nothing. */
  act(seat: number, action: Action): ActionResult;
  /** Ends planning and runs the fights, or ends the current Council group's turn (returning null). */
  advance(): RoundReport | null;
  isOver(): boolean;
}

const OK: ActionResult = { ok: true };

function fail(reason: string): ActionResult {
  return { ok: false, reason };
}

/** Random stream numbers (section 4): the game's own, then one per player's shop and one per player's Gifts. */
const GAME_STREAM = 0;
const SHOP_STREAM = 1;
const GIFT_STREAM = 20;

class GameImpl implements Game, GameState {
  stage = 1;
  round = 1;
  type: RoundType = 'council';
  phase: Phase = 'council';
  council: { options: CouncilOption[]; groups: number[][]; group: number } | null = null;
  readonly pool = new Pool();
  readonly players: Player[];
  private readonly rng: Rng;
  private nextUnitId = 0;

  constructor(config: GameConfig) {
    validate(config);
    this.rng = createRng(deriveSeed(config.seed, GAME_STREAM));
    const context = { pool: this.pool, nextUnitId: () => this.nextUnitId++ };
    this.players = Array.from(
      { length: config.players },
      (_, seat) =>
        new Player(seat, context, createRng(deriveSeed(config.seed, SHOP_STREAM + seat)), createRng(deriveSeed(config.seed, GIFT_STREAM + seat))),
    );
    this.startRound();
  }

  get state(): GameState {
    return this;
  }

  isOver(): boolean {
    return this.phase === 'over';
  }

  act(seat: number, action: Action): ActionResult {
    const player = Number.isInteger(seat) ? this.players[seat] : undefined;
    if (player === undefined) return fail('There is no such seat.');
    if (player.placement !== null) return fail('That player is out of the game.');
    if (typeof action !== 'object' || action === null) return fail('Unknown action.');
    if (action.type === 'pick') return this.pick(player, action.option);
    if (this.phase !== 'planning') return fail('Units can only be bought and moved during planning.');
    switch (action.type) {
      case 'buy':
        return player.buy(action.slot);
      case 'sell':
        return player.sell(action.from);
      case 'move':
        return player.move(action.from, action.to);
      case 'reroll':
        return player.reroll();
      case 'buyXp':
        return player.buyXp();
      case 'lock':
        return player.setLock(action.locked);
      case 'equip':
        return player.equip(action.item, action.to);
      case 'gift':
        return player.pickGift(action.option);
      case 'rerollGifts':
        return player.rerollGifts();
      default:
        return fail('Unknown action.');
    }
  }

  advance(): RoundReport | null {
    if (this.phase === 'over') throw new Error('The game is over.');
    if (this.phase === 'council') {
      // Time is up for the group: everyone in it who hasn't picked gets a random option.
      const council = this.council!;
      for (const seat of council.groups[council.group]!) {
        if (council.options.some((o) => o.pickedBy === seat)) continue;
        const left = council.options.filter((o) => o.pickedBy === null);
        if (left.length > 0) this.give(this.players[seat]!, left[randomInt(this.rng, left.length)]!);
      }
      this.nextCouncilGroup();
      return null;
    }
    // Offers left unpicked are picked at random before the fights.
    for (const player of this.living()) player.autoPickGift();
    const report = this.fight();
    if (!this.isOver()) this.goToNextRound();
    return report;
  }

  // Rounds

  private living(): Player[] {
    return this.players.filter((p) => p.placement === null);
  }

  /** Section 9.2. */
  private startRound(): void {
    this.type = roundType(this.stage, this.round);
    if (this.type === 'council') {
      this.phase = 'council';
      this.council = {
        options: rollCouncilOptions(this.pool, this.stage, this.rng),
        groups: pickGroups(this.living(), this.stage === 1 && this.round === 1, this.rng),
        group: 0,
      };
      return;
    }
    this.phase = 'planning';
    for (const player of this.living()) {
      for (const auto of XP.automatic) if (auto.stage === this.stage && auto.round === this.round) player.reachLevel(auto.level);
      player.collectIncome(baseIncome(this.stage, this.round));
      if (this.stage >= XP.perRoundFromStage) player.addXp(XP.perRound + player.giftXp());
      player.startRound();
    }
    const refreshing = this.living().filter((p) => !p.shopLocked);
    for (const player of refreshing) player.returnShop();
    for (const player of refreshing) player.rollShop();
    const tier = GIFT_ROUNDS[`${this.stage}-${this.round}`];
    if (tier !== undefined) for (const player of this.living()) player.offerGifts(tier);
  }

  private goToNextRound(): void {
    [this.stage, this.round] = nextRound(this.stage, this.round);
    this.startRound();
  }

  // Council (section 9.6)

  private pick(player: Player, option: number): ActionResult {
    const council = this.council;
    if (this.phase !== 'council' || council === null) return fail('There is no Council now.');
    if (!council.groups[council.group]!.includes(player.seat)) return fail("It isn't your turn to pick.");
    if (council.options.some((o) => o.pickedBy === player.seat)) return fail('You have already picked.');
    const chosen = Number.isInteger(option) ? council.options[option] : undefined;
    if (chosen === undefined) return fail('There is no such option.');
    if (chosen.pickedBy !== null) return fail('That option has been taken.');
    this.give(player, chosen);
    if (council.groups[council.group]!.every((seat) => council.options.some((o) => o.pickedBy === seat))) this.nextCouncilGroup();
    return OK;
  }

  /** Gives a player a Council option. A unit with no room is sold at once (section 7.2). */
  private give(player: Player, option: CouncilOption): void {
    option.pickedBy = player.seat;
    player.items.push(option.component);
    if (!player.gain(option.unitId)) {
      player.gold += UNITS[option.unitId].cost;
      this.pool.put(option.unitId);
    }
  }

  private nextCouncilGroup(): void {
    const council = this.council!;
    council.group++;
    if (council.group < council.groups.length) return;
    for (const option of council.options) if (option.pickedBy === null) this.pool.put(option.unitId);
    this.council = null;
    this.goToNextRound();
  }

  // Fights and results (sections 9.4 and 9.9)

  private fight(): RoundReport {
    const living = this.living();
    for (const player of living) player.fillBoard();
    const fights: FightReport[] = [];
    const run = (kind: FightReport['kind'], home: Player, away: Player | null, B: readonly PlacedUnit[]) => {
      const input: CombatInput = {
        seed: randomSeed(this.rng),
        stage: this.stage,
        teams: { A: home.placements(), B },
        gifts: { A: [...home.gifts], B: away === null ? [] : [...away.gifts] },
      };
      fights.push({ kind, home: home.seat, away: away?.seat ?? null, input, result: simulateCombat(input) });
    };
    if (this.type === 'pve') {
      const monsters = pveRound(this.stage, this.round).monsters.map((m): PlacedUnit => ({ ...m, star: 1, items: [] }));
      for (const player of living) run('pve', player, null, monsters);
    } else {
      const pairings = pairPlayers(
        living.map((p) => p.seat),
        (seat) => this.players[seat]!.recentOpponents,
        this.rng,
      );
      for (const { home, away, ghost } of pairings) {
        run(ghost ? 'ghost' : 'pvp', this.players[home]!, this.players[away]!, this.players[away]!.placements());
      }
    }

    const hpBefore = new Map(living.map((p) => [p.seat, p.hp]));
    const damage = new Map<number, number>();
    const hurt = (seat: number, amount: number) => damage.set(seat, (damage.get(seat) ?? 0) + amount);
    for (const { kind, home, away, result } of fights) {
      const { outcome, survivors } = result;
      if (outcome !== 'A') hurt(home, playerDamage(this.stage, survivors.B));
      if (kind === 'pvp' && outcome !== 'B') hurt(away!, playerDamage(this.stage, survivors.A));
      if (kind !== 'pve') this.players[home]!.recordPvp(outcome === 'A');
      if (kind === 'pvp') this.players[away!]!.recordPvp(outcome === 'B');
    }
    for (const [seat, amount] of damage) this.players[seat]!.hp -= amount;

    if (this.type === 'pve') {
      const { loot } = pveRound(this.stage, this.round);
      for (const player of living.filter((p) => !p.eliminated)) {
        for (let i = 0; i < loot.components; i++) player.items.push(COMPONENTS[randomInt(this.rng, COMPONENTS.length)]!);
        player.gold += loot.gold;
      }
    }
    for (const { kind, home, away } of fights) {
      if (kind !== 'pve') remember(this.players[home]!, away!);
      if (kind === 'pvp') remember(this.players[away!]!, home);
    }

    const eliminated = this.eliminate(living, hpBefore);
    return {
      stage: this.stage,
      round: this.round,
      fights,
      damage: [...damage].sort(([a], [b]) => a - b).map(([seat, amount]) => ({ seat, amount })),
      eliminated: eliminated.map((p) => p.seat),
    };
  }

  /** Places the players knocked out this round and ends the game if one or none is left (section 9.9). */
  private eliminate(living: readonly Player[], hpBefore: ReadonlyMap<number, number>): Player[] {
    // The shuffle settles full ties; the sort is stable.
    const out = shuffle(
      this.rng,
      living.filter((p) => p.eliminated),
    ).sort((a, b) => b.hp - a.hp || hpBefore.get(b.seat)! - hpBefore.get(a.seat)!);
    const left = living.length - out.length;
    out.forEach((player, i) => {
      player.placement = left + 1 + i;
      player.returnEverything();
    });
    if (left <= 1) {
      for (const player of this.living()) player.placement = 1;
      this.phase = 'over';
    }
    return out;
  }
}

function remember(player: Player, opponent: number): void {
  player.recentOpponents.push(opponent);
  if (player.recentOpponents.length > MATCHMAKING.recentOpponents) player.recentOpponents.shift();
}

function validate(config: GameConfig): void {
  if (!Number.isInteger(config.seed)) throw new Error(`The seed must be an integer, not ${config.seed}.`);
  if (!Number.isInteger(config.players) || config.players < 2 || config.players > 8) {
    throw new Error(`A game has 2 to 8 players, not ${config.players}.`);
  }
}

export function createGame(config: GameConfig): Game {
  return new GameImpl(config);
}
