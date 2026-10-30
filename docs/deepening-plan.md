# Deepening plan

Where the architecture causes friction, and the refactors I propose to fix it, written before any code changes. None of it changes a rule or a number. Every step must leave every fight and every bot game exactly as it is, and phase 0 makes that checkable.

Line numbers are as of commit `86bf3c2`.

## How I judged

A module is *deep* when its interface is small compared with what it hides. It is *shallow* when callers have to know about as much as it does. Here, shallow modules cost us in two ways:

- **Testability.** If behaviour lives in private methods or is spread over several modules, the only way to test it is to run a whole fight or game up to the right moment and then reach into internals (`as Player`, `Object.assign(ring, …)`).
- **AI-navigability.** If one concept, such as the One Ring, a board place or whether an action is allowed, is implemented in five files, a reader has to find all five before changing it. Change one and the others drift without anyone noticing.

## Already deep: leave alone

- `hex.ts` and `rng.ts`: small interfaces that hide perspective, tie-breaks and stream derivation.
- `combat/targeting.ts`, `movement.ts`, `statuses.ts`, `damage.ts`, `stats.ts`, and `select` in `abilities.ts`: pure, generic over the unit's shape, and tested directly.
- `game/pool.ts`, `matchmaking.ts`, `council.ts` and `schedule.ts`.
- `packages/server`: `Lobbies → Lobby → Match`, with time and randomness behind `Host`, so `FakeHost` can test the timers.
- `client/playback.ts`, `layout.ts` and `connection.ts`.

## Friction and proposals

Ranked by what each buys for testability and navigability. The order to build them in is in [Sequence](#sequence).

### 1. The One Ring is a bag of fields driven from 12 methods

**Friction.** `game/ring.ts` holds fields plus `isBorneBy` and `release`. The Ring's life is written somewhere else:

- nine methods of `game/game.ts`: `give` (266), `nextCouncilGroup` (281), `offerRing` (298), `corruptRing` (313), `equipRing` (332), `afterRingFights` (340), `giveRing` (358), `destroyRing` (368) and `eliminate` (476);
- three of `game/player.ts`: `sell` (170), `placements` (354) and `merge` (497).

Together that is 36 lines that read or write the Ring's state. Its invariants hold only by convention: a holder exactly while it is held, a bearer only while it is held, and Corruption reset only when the Ring is consumed.

The Rings of Power supply is a bare `Record` that `game.ts` updates at five sites (131, 289, 381, 393–405, 486). The rule that the Three and the Nine are bound to the One is written three times: `game.ts:379`, `bots/bot.ts:281–284` and `test/rings-game.test.ts:18`.

The tests show the cost. `ring-game.test.ts` and `rings-game.test.ts` play real rounds up to the 3-4 Council (`skipTo`). Then they cast `game.state.ring as Ring` and `Object.assign` its fields to set up each scenario.

**Proposal.** Make `Ring` own its state machine. The game keeps the orchestration: players, the pool and the random draws.

```ts
// game/ring.ts
export class Ring implements RingView {
  offer(stage: number): boolean;                   // waiting and stage ≥ firstStage → offered
  take(seat: number, bearer: number | null): void; // picked at the Council
  decline(): void;                                 // left unpicked: waiting, Corruption kept
  corrupt(bearerIsHobbit: boolean): boolean;       // start of planning; true when consumed (resets)
  bear(seat: number, unitId: number): void;        // given by the holder, or equipped before fights
  afterFight(fight: FightReport, gollumOf: (seat: number) => number | null): void; // Hobbit fights, theft
  destroy(): void;
  holderOut(seat: number): void;
  unitSold(seat: number, unitId: number): void;
  unitsMerged(seat: number, from: number, into: number): void;
}

// game/ring-supply.ts
export class RingSupply {
  readonly counts: Readonly<Record<RingOfPowerId, number>>;
  draw(rng: Rng): RingOfPowerId | null; // weighted by copies, one number; none when empty
  putBack(id: RingOfPowerId): void;
  retireBound(): void;                  // the Three and the Nine leave with the One
}

// combat/items.ts
export function isBoundToTheOne(id: ItemId): boolean;
```

**Gain.** Corruption timing, consumption, theft, when the Ring can be destroyed, and conservation of the supply all become unit tests on two small classes. `game.ts` then reads as the round flow of `game-spec.md` section 9, with one call for each Ring event.

**Risk.** The random draws in `equipRing`, `offerRingsOfPower` and the Mount Doom reward must stay on the game stream, in the same order. Pass the game's `rng` in rather than giving the Ring a stream of its own. Phase 0's bot-game hashes catch a draw that moves.

### 2. Whether an action is allowed is written in three packages

**Friction.** Legality is a set of early returns inside methods that change state: `Player.buy` (157), `reroll` (197), `buyXp` (206) and `equip` (216), and `Game.pick` (252), `giveRing` (358) and `destroyRing` (368).

The client can't ask those methods, so the play page works the rules out again:

- the Reroll and Buy XP buttons (`play.ts:530–532`);
- whether a shop card is affordable (527);
- `yourPick` (360);
- `canDestroyRing` (328–333), a copy of `game.ts:370–374`.

The bot hard-codes the numbers instead:

- `gold >= 4` (`bot.ts:184`) for `XP.buyCost`;
- `gold - 2` (94) for `SHOP.rerollCost`;
- `slot < 5` (210) for `SHOP.size`;
- `[1, 3, 9]` (201) for `COPIES_PER_STAR`.

If a Gift changed one of these costs, those copies would go wrong without any test failing.

**Proposal.** One pure function over the views the client already has:

```ts
// game/rules.ts
export interface ActionContext {
  readonly phase: Phase;
  readonly council: CouncilState | null;
  readonly ring: RingView;
}
/** Whether a player may take an action now, and why not. The game, bots and the client all ask it. */
export function checkAction(player: PlayerView, context: ActionContext, action: Action): ActionResult;
```

`Game.act` and the `Player` methods call it and then apply the action, keeping today's reasons word for word. The play page enables its controls with `checkAction(state.me, state, action).ok`, and can show `reason` as a tooltip. The bot uses the constants from the data files.

**Gain.** The rules for actions become one pure function that table tests can cover. Testing that a reroll without gold is refused no longer means advancing and mutating a game. When a rule changes, there is one place to change it.

**Risk.** Low, since behaviour stays the same. The reason assertions in `player.test.ts` and `game.test.ts` pin the messages.

### 3. `combat/combat.ts`: tick-0 setup and every modifier live inside `Fight`

**Friction.** The `Fight` class is about 890 of the file's 1,263 lines. Its `Unit` type has 35 fields, about a dozen of which each serve one feature (`auraSlowPct`, `auraShredPct`, `auraHastePct`, `archerStacks`, `wraith`, `drawback`, `betrayUntil`, `hunts`, `targetsFarthest`, …). The 35-field literal is written out twice, in `start` (311–347) and in `summon` (843–880). Item effects are matched by hand with `effect.kind === …` 26 times, in 14 functions.

The modifier queries are private:

- `damageAmpPct` (550), which adds up seven sources from traits, items, Gifts and the Ring;
- `damageReductionPct` and `isCritImmune`;
- the aura maths in `updateAuras` (492).

So to test a rule like "the Captain amp needs a living Captain next to the source", you have to run a fight and recompute the damage.

**Proposal.** Split along the spec's own seams. The tick flow stays in `combat.ts`, so it still reads like sections 6.2 and 6.4.

- `combat/fighters.ts`: the `Unit` type, and `createUnit` and `createSummon` sharing one set of defaults. `createUnit` covers base stats, the static trait, item and Gift bonuses, Burden with Sam's relief, Betrayal and the Nine's extra Nazgûl origin. Also `teamSetup`: trait levels, crests, Gift effects, Gift mana and amp. No random draws.
- `combat/modifiers.ts`, pure queries: `damageAmpPct`, `damageReductionPct`, `isCritImmune`, `auraLevels` (the Nazgûl slow, the Phial and Narya), `originsOf`, `isNazgul` and `isGripped`.
- A typed accessor, `effectsOf(unit, 'reflect')`, that narrows the effect's type. It replaces the 26 hand-written matches.

`Fight` keeps the tick loop, acting, attacks, damage, deaths, casting, the queue, and the operations (`applyStatus`, `addShield`, `heal`, `summon`, `dash`). The file shrinks from 1,263 lines to roughly 850.

**Gain.** Unit creation and every "how much" rule get direct unit tests. Adding an item effect becomes: add the data, then either one obvious hook in `Fight` or one term in `modifiers.ts`.

**Risk.** Event order. Two loops handle several effect kinds in the order the unit holds its items: step 4 of combat start (365–377) and the loop that runs every second (467–479). Each must stay one loop, not become one loop per kind. No unit on today's test boards holds two of the items that act every second, so phase 0 adds boards where one does.

### 4. The play page's flow can't be tested

**Friction.** `client/src/play.ts` (726 lines) looks up DOM elements as soon as it is imported, so no test can import anything from it. Yet most of it is logic with no DOM:

- the `Show` state machine: `receive` (248), `follow` (279), `startRound` (365), `showResults` (377) and `update` (381), which sends Ready once the results have been shown;
- `planners` and `seatName`;
- the results lines (611–622) and the standings.

`CLAUDE.md` asks for exactly this split ("Keep logic without Three.js or the DOM in its own modules … so it can be tested"), and none of this flow is tested today.

**Proposal.** A new `client/src/flow.ts` with a `PlayFlow` class:

- it holds `you`, `lobby`, `state`, `show` and the menu and lobby messages;
- it has `receive(message, now)`, `update(seconds, now)`, `skip()`, `act(action)` and `ready()`;
- it sends through a `send` callback, and reports a new fight through `onFight(playback, team)`.

Next to it, pure `resultLines` and `standings` functions. `play.ts` keeps the element lookups, the listeners and the rendering.

**Gain.** Tests can cover:

- a round either starts your fight or goes straight to the results;
- Ready is sent once after the results, and only while you are still in the game;
- a refused join returns to the menu with the reason;
- being knocked out shows the end screen.

They can run against `LocalConnection` for a whole offline game.

**Risk.** UI regressions the tests can't see. Smoke-test the page in a browser afterwards with Playwright.

### 5. Four copies of "let the bots play on"

**Friction.** The same loop is written several times: the bots in the group pick; if that didn't end the turn, time it out; in planning, the bots plan, starting from a seat that rotates each round; then advance. It is in:

- `bots/bot.ts`: `playBotGame` (358);
- `server/src/match.ts`: `enter` (139), `finish` (200), `takeOver` (218) and `plan` (229);
- `test/bots.test.ts`: `botsUntil` (9);
- without the bots, four `skipTo` test helpers.

`Match` tells whether the game has moved on by comparing a string built from the stage, round, phase and group (`position`, 268).

**Proposal.** A new `bots/autopilot.ts` in the sim, with:

- `pick(seats): boolean`, true when the Council turn ended;
- `plan(isBot)`, which applies the rotation;
- `playUntil(done?)`.

`Match`, `playBotGame` and the tests use it. A `turn` counter on `GameState` goes up whenever the game moves to a new Council group, to planning, or to the end. It replaces `position()`.

**Gain.** How bots drive a game is defined once. A test can reach "stage 3, round 4, with realistic boards" in one line.

**Risk.** The rotation must stay as it is. Today `(rounds + i) % players` and `(plannings + i) % n` agree. Bot-game hashes and `match.test.ts` catch any drift.

### 6. Board places are addressed by hand in four packages

**Friction.** `row * BOARD_COLS + col` and its inverse appear in:

- `player.ts` (148, 359, 368, 472, 483);
- `bot.ts` (40, 64);
- `scene.ts` (159);
- `play.ts` (303, 312), with a literal `7`.

Three test `field` helpers repeat it, also with literal `7`s. `unitAt` is written three times (`player.ts:147`, `bot.ts:63`, `play.ts:302`) and `placeOf` twice, and `bot.ts` has its own `owned` and `samePlace`.

**Proposal.** A new `game/places.ts` that works on `Pick<PlayerView, 'board' | 'bench'>`:

- moved from `player.ts`: `Place`, `isPlace` and `TEAM_ROWS`;
- new: `boardSlot`, `boardPlace`, `unitAt`, `placeOf`, `ownedUnits` and `samePlace`.

It is exported from the sim's index.

**Gain.** Small on its own, but items 2, 4 and 5 build on it, and it removes the literal `7`s.

### Shared test fixtures

Once items 1 and 5 land, game tests still need a few helpers. `test/fixtures.ts` in the sim will hold:

- `playerOf(game, seat)`, the one place that casts to `Player`;
- `field(game, seat, unitId, place, { star, items })`;
- counting copies.

Today there are three copies of `field` and four of `skipTo`.

## Considered and not recommended

- **A hook registry for combat**, with each item, trait and Gift registering `onKill`, `onHit` and so on. It would put each item's behaviour in one place. But it hides the order of sections 6.2 and 6.4 inside registration lists, when today the code follows those sections step by step. It is also the change most likely to reorder events. Revisit it if effect kinds keep growing.
- **Splitting `Fight` into a world object and rule functions.** Once item 3 is done, this is the biggest diff for the least gain: what remains of `Fight` maps onto sections 6.4, 9 and 10.
- **Immutable `GameState` snapshots.** The server already copies views (`view.ts`). After items 1, 2 and 5, the remaining casts are confined to the fixtures file.

## Sequence

Each phase is one commit. After each one, `pnpm check` passes and the phase 0 hashes are unchanged.

The docs that name files change in the same commit as the code: the Status section of `CLAUDE.md`, `sim-spec.md` section 3, the package layout in `game-spec.md`, and the client layout in `viewer-spec.md`. No rule or number changes, so `design.md` stays as it is.

| Phase | Item | Size | Risk |
|---|---|---|---|
| 0 | Golden hashes of fights and bot games | S | none (tests only) |
| 1 | Places (6) | S | low |
| 2 | Action legality (2) | M | low |
| 3 | The One Ring and the supply (1), shared fixtures | M | medium: random draws |
| 4 | Combat fighters, modifiers and effects (3) | M–L | medium: event order |
| 5 | Autopilot and the turn counter (5) | S–M | low to medium |
| 6 | Play page flow (4) | M | low; smoke-test in a browser |

**Phase 0 in detail.** A new `packages/sim/test/golden.test.ts`, with `hashEvents` moved from `acceptance.test.ts` into `helpers.ts`. It stores one inline-snapshot hash per category, so a diff says which fights changed:

- each test board against its mirror, seeds 1–10, and the items board against the traits board;
- the One Ring at every Corruption, with and without Sam next to the bearer;
- the Rings of Power board with the One Ring's Corruption at 0 and at 6;
- every Gift that acts in fights, and every PvE round's monsters;
- units holding several effects that share a hook: the Elven Cloak, Dragon-helm and Vilya on one unit, and the Star of Elendil, King's Banner and Nenya on another;
- `playBotGame` for seeds 1–3, with events left out (about a second each).

I'd keep this test once the refactor is done. It answers the review checklist's "A sim change that alters fights it shouldn't is a bug; say which fights."

## Decisions for you

1. **Scope.** All six phases, or phases 0–3 (the game layer) first, and decide on combat and the client after?
2. **Golden test.** Keep it permanently, as I recommend, or only for this refactor?
3. **Pull requests.** One per phase, or three: phases 0–3, phase 4, and phases 5–6?
4. **Ring tests.** Item 1 replaces direct writes to the Ring's fields with its methods, and the ring tests move to those methods. Is that OK?
