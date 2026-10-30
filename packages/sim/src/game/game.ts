// A whole game: rounds, fights, damage and placement (docs/game-spec.md sections 9 and 10).

import { simulateCombat, type CombatInput, type CombatResult, type PlacedUnit } from '../combat/combat.js';
import { XP } from '../data/economy.js';
import { COMBINED_ITEM_IDS, RING_OF_POWER_IDS, isRingOfPower } from '../combat/items.js';
import { GIFT_ROUNDS } from '../data/gifts.js';
import { RING } from '../data/ring.js';
import { COMPONENTS, ITEMS, type ItemId, type RingOfPowerId } from '../data/items.js';
import { COUNCIL, MATCHMAKING, type RoundType } from '../data/rounds.js';
import { UNITS, type Cost, type UnitId } from '../data/units.js';
import { createRng, deriveSeed, randomInt, randomSeed, shuffle, type Rng } from '../rng.js';
import { pickGroups, rollCouncilOptions, type CouncilOption } from './council.js';
import { pairPlayers } from './matchmaking.js';
import { placeOf, unitAt, type Place } from './places.js';
import { Player, baseIncome, type PlayerView } from './player.js';
import { Pool } from './pool.js';
import { Ring, type RingView } from './ring.js';
import { OK, checkAction, fail, type ActionResult } from './rules.js';
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
  /** The One Ring's holder gives it to the unit at `to`. */
  | { readonly type: 'ring'; readonly to: Place }
  | { readonly type: 'destroyRing' }
  | { readonly type: 'pick'; readonly option: number };

export type Phase = 'council' | 'planning' | 'over';

export interface CouncilOptionView {
  readonly unitId: UnitId;
  /** An item component or a Ring of Power; null for the option that brings the One Ring. */
  readonly item: ItemId | null;
  readonly ring: boolean;
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
  /** The One Ring, which everyone can see (section 9.11). */
  readonly ring: RingView;
  /** The copies of each Ring of Power left in the supply (section 9.12). */
  readonly ringSupply: Readonly<Record<RingOfPowerId, number>>;
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
  readonly ring = new Ring();
  readonly ringSupply = Object.fromEntries(RING_OF_POWER_IDS.map((id) => [id, ITEMS[id].ringOfPower!.copies])) as Record<RingOfPowerId, number>;
  readonly players: Player[];
  private readonly rng: Rng;
  private nextUnitId = 0;

  constructor(config: GameConfig) {
    validate(config);
    this.rng = createRng(deriveSeed(config.seed, GAME_STREAM));
    const context = { pool: this.pool, ring: this.ring, nextUnitId: () => this.nextUnitId++ };
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
    const check = checkAction(player, this, action);
    if (!check.ok) return check;
    switch (action.type) {
      case 'pick':
        this.pick(player, action.option);
        return OK;
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
      case 'ring':
        this.ring.bearer = unitAt(player, action.to)!.id;
        return OK;
      case 'destroyRing':
        this.destroyRing(player);
        return OK;
    }
  }

  advance(): RoundReport | null {
    if (this.phase === 'over') throw new Error('The game is over.');
    if (this.phase === 'council') {
      // Time is up for the group: everyone in it who hasn't picked gets a random option.
      const council = this.council!;
      for (const seat of council.groups[council.group]!) {
        if (council.options.some((o) => o.pickedBy === seat)) continue;
        // Nobody is forced to take the One Ring.
        const left = council.options.filter((o) => o.pickedBy === null && !o.ring);
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
        options: this.offerRingsOfPower(this.offerRing(rollCouncilOptions(this.pool, this.stage, this.rng))),
        groups: pickGroups(this.living(), this.stage === 1 && this.round === 1, this.rng),
        group: 0,
      };
      return;
    }
    this.phase = 'planning';
    this.corruptRing();
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

  private pick(player: Player, option: number): void {
    const council = this.council!;
    this.give(player, council.options[option]!);
    if (council.groups[council.group]!.every((seat) => council.options.some((o) => o.pickedBy === seat))) this.nextCouncilGroup();
  }

  /** Gives a player a Council option. A unit with no room is sold at once (section 7.2). */
  private give(player: Player, option: CouncilOption): void {
    option.pickedBy = player.seat;
    if (option.item !== null) player.items.push(option.item);
    if (!player.gain(option.unitId)) {
      player.gold += UNITS[option.unitId].cost;
      this.pool.put(option.unitId);
    }
    if (option.ring) {
      // Bilbo brings the Ring: he bears it if the player now owns him.
      this.ring.state = 'held';
      this.ring.holder = player.seat;
      this.ring.bearer = player.firstOwned('bilbo')?.id ?? null;
    }
  }

  private nextCouncilGroup(): void {
    const council = this.council!;
    council.group++;
    if (council.group < council.groups.length) return;
    for (const option of council.options) {
      if (option.pickedBy !== null) continue;
      this.pool.put(option.unitId);
      if (option.ring) this.ring.release(false);
      if (option.item !== null && isRingOfPower(option.item)) this.ringSupply[option.item]++;
    }
    this.council = null;
    this.goToNextRound();
  }

  // The One Ring (section 9.11)

  /** Makes the last option bring the Ring, with Bilbo if a copy is left, when the Ring is waiting. */
  private offerRing(options: CouncilOption[]): CouncilOption[] {
    const last = options.at(-1);
    if (this.ring.state !== 'waiting' || this.stage < RING.firstStage || last === undefined) return options;
    if (this.pool.count('bilbo') > 0) {
      this.pool.put(last.unitId);
      this.pool.take('bilbo');
      last.unitId = 'bilbo';
    }
    last.item = null;
    last.ring = true;
    this.ring.state = 'offered';
    return options;
  }

  /** Corruption at the start of a round with a bearer; every other round for a Hobbit. At 10 the bearer is lost. */
  private corruptRing(): void {
    const { ring } = this;
    if (ring.state !== 'held' || ring.bearer === null) return;
    const holder = this.players[ring.holder!]!;
    const place = placeOf(holder, ring.bearer);
    const bearer = place === null ? null : unitAt(holder, place);
    if (bearer === null) return;
    if (UNITS[bearer.unitId].origin === 'hobbit') {
      ring.hobbitRounds++;
      if (ring.hobbitRounds % RING.hobbitRoundsPerCorruption === 0) ring.corruption++;
    } else {
      ring.corruption++;
    }
    if (ring.corruption < RING.consumedAt) return;
    holder.remove(bearer.id);
    ring.release(true);
  }

  /** A held Ring with no bearer goes to a random unit on its holder's board. */
  private equipRing(): void {
    const { ring } = this;
    if (ring.state !== 'held' || ring.bearer !== null) return;
    const board = this.players[ring.holder!]!.board.filter((u) => u !== null);
    if (board.length > 0) ring.bearer = board[randomInt(this.rng, board.length)]!.id;
  }

  /** After the fights: Hobbit bearers' fights, then a surviving Gollum stealing the Ring. */
  private afterRingFights(fights: readonly FightReport[]): void {
    const { ring } = this;
    if (ring.state !== 'held') return;
    const holder = ring.holder!;
    for (const fight of fights) {
      const side = fight.home === holder ? 'A' : fight.kind === 'pvp' && fight.away === holder ? 'B' : null;
      if (side === null) continue;
      const bearer = fight.input.teams[side].find((p) => p.ring !== undefined);
      if (bearer !== undefined && UNITS[bearer.unitId as UnitId].origin === 'hobbit') ring.hobbitFights++;
      if (fight.kind !== 'pvp') continue;
      const thief = side === 'A' ? fight.away! : fight.home;
      if (!fight.result.survivors[side === 'A' ? 'B' : 'A'].some((s) => s.unitId === 'gollum')) continue;
      ring.holder = thief;
      ring.bearer = this.players[thief]!.firstOnBoard('gollum')?.id ?? null;
      return;
    }
  }

  /** Mount Doom: the holder's Hobbit bearer throws the Ring in, for a reward (section 9.11). */
  private destroyRing(player: Player): void {
    const { ring } = this;
    ring.state = 'destroyed';
    ring.holder = null;
    ring.bearer = null;
    // The Three fade and the Nine are undone, everywhere and for good.
    const bound = (item: ItemId) => isRingOfPower(item) && ITEMS[item].ringOfPower!.family !== 'seven';
    for (const p of this.living()) p.dropItems(bound);
    for (const id of RING_OF_POWER_IDS) if (bound(id)) this.ringSupply[id] = 0;
    player.gold += RING.destroy.gold;
    for (let i = 0; i < RING.destroy.combinedItems; i++) player.items.push(COMBINED_ITEM_IDS[randomInt(this.rng, COMBINED_ITEM_IDS.length)]!);
  }

  // Rings of Power (section 9.12)

  /**
   * Gives the last options that don't bring the One Ring a Ring of Power instead of their
   * component, from the 2-4 Council on, while the supply has any. Each is drawn weighted by copies.
   */
  private offerRingsOfPower(options: CouncilOption[]): CouncilOption[] {
    const { fromStage, options: count } = COUNCIL.ringsOfPower;
    if (this.stage < fromStage) return options;
    for (const option of options.filter((o) => !o.ring).slice(-count)) {
      const total = RING_OF_POWER_IDS.reduce((sum, id) => sum + this.ringSupply[id], 0);
      if (total === 0) break;
      let roll = randomInt(this.rng, total);
      const drawn = RING_OF_POWER_IDS.find((id) => (roll -= this.ringSupply[id]) < 0)!;
      this.ringSupply[drawn]--;
      option.item = drawn;
    }
    return options;
  }

  // Fights and results (sections 9.4 and 9.9)

  private fight(): RoundReport {
    const living = this.living();
    for (const player of living) player.fillBoard();
    this.equipRing();
    const fights: FightReport[] = [];
    const run = (kind: FightReport['kind'], home: Player, away: Player | null, B: readonly PlacedUnit[]) => {
      const input: CombatInput = {
        seed: randomSeed(this.rng),
        stage: this.stage,
        teams: { A: home.placements(), B },
        gifts: { A: [...home.gifts], B: away === null ? [] : [...away.gifts] },
        // The Nine grow with the One Ring's Corruption while it is held.
        ...(this.ring.state === 'held' ? { oneRingCorruption: this.ring.corruption } : {}),
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
    for (const player of living.filter((p) => !p.eliminated)) player.gold += player.ringGold();
    this.afterRingFights(fights);
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
      // Rings of Power go back to the supply; the other items are lost.
      for (const id of player.ringsOfPower()) this.ringSupply[id as RingOfPowerId]++;
      player.returnEverything();
      if (this.ring.state === 'held' && this.ring.holder === player.seat) this.ring.release(false);
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
