# LOTR Tactics

Browser-based, 8-player auto battler in the style of Teamfight Tactics, with Lord of the Rings characters. Three.js rendering, low-poly 3D, TypeScript monorepo.

## Docs

- `docs/design.md`: game design, the source of truth for rules and content.
- `docs/sim-spec.md`: implementation spec for the combat simulation, including defaults not yet in the design doc.
- `docs/viewer-spec.md`: spec for the fight viewer in `packages/client`.
- `docs/game-spec.md`: implementation spec for the game around the fights: shop, economy, rounds and bots.

## Status

Design is done for combat, units, traits, economy and rounds. The combat simulation in `packages/sim` (`docs/sim-spec.md`) is done: hex maths (`hex.ts`), the seeded generator (`rng.ts`), the data files (`data/`), stat calculation (`combat/stats.ts`), the combat loop (`combat/combat.ts`: tick 0, action order, events, end of combat), targeting and movement (`combat/targeting.ts`, `combat/movement.ts`), basic attacks, damage and mana (`combat/damage.ts`), statuses (`combat/statuses.ts`: stuns, slows, buffs, reductions, shields, untargetable), abilities (`combat/abilities.ts` for selectors and placement, `combat/combat.ts` for casting and effects), and traits (`combat/traits.ts` for counting and static bonuses, `combat/combat.ts` for the rest). That covers everything in scope in `docs/sim-spec.md` section 1 apart from the on-hit hook for items, which aren't designed yet.

`packages/client` is the fight viewer (`docs/viewer-spec.md`): Vite and Three.js, running a fight with the sim and playing it back. Its play page (`play.html`, `docs/game-spec.md` section 12) plays a whole game against 7 bots.

The current milestone is the game around the fights (`docs/game-spec.md`): the shop, economy, rounds and bots in `packages/sim`, and a client screen to play against 7 bots. Done so far: the pool and shop rolls (`game/pool.ts`), and each player's bench, board, merging, gold and XP (`game/player.ts`), with the numbers in `data/economy.ts`; PvE monsters in the combat (`data/monsters.ts`, `sim-spec.md` section 7.6); and the rounds (`game/game.ts`: `createGame`, actions, fights, damage, eliminations; `game/matchmaking.ts`, `game/council.ts`, `game/schedule.ts`; data in `data/rounds.ts` and `data/pve.ts`); bots (`bots/bot.ts`, tuned in `data/bots.ts`) with a balance runner (`scripts/balance.ts`); and the client's play page. That covers the milestone apart from items, Gifts of Lothlórien and tuning.

## Commands

- `pnpm install`
- `pnpm dev`: serve the client: the fight viewer at `/`, the play page at `/play.html`
- `pnpm check`: lint, typecheck, tests and build, the same checks CI runs
- `pnpm balance [games] [first seed]`: play 8-bot games and print balance statistics
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`: one at a time

## Conventions

- `sim` is pure and deterministic: no `Math.random`, no time APIs, no DOM or Node APIs, and no trig or `Math.pow` in game logic. Use the seeded generator. See `docs/sim-spec.md` section 4. ESLint and the TypeScript settings enforce this in `packages/sim/src`; tests are exempt.
- `client` only displays what the sim decides; it never changes a fight. Keep logic without Three.js or the DOM in its own modules, such as `playback.ts`, so it can be tested.
- Functions that make a geometric choice take the acting team and work in its own perspective (`docs/sim-spec.md` section 5).
- Game numbers live in data files (`packages/sim/src/data/`), not hard-coded in logic. All numbers are placeholders until balancing.
- In data, percentages and multipliers are whole-number percents (25 for 25%, 70 for 0.7 D) and durations are in seconds (`docs/sim-spec.md` section 4).
- When a rule or number changes, update `docs/design.md` (and `docs/sim-spec.md` if it affects the sim) in the same change.

## When reviewing

The automated review (`.github/workflows/claude-code-review.yml`) follows this section, and so should anyone reviewing a pull request. Check, most important first:

1. **Determinism.** In `packages/sim/src` and the browser-safe parts of `packages/server/src`, the same input must give the same result:
   - no `Math.random`, time APIs, trig or `Math.pow` in game logic;
   - no outcome that depends on the iteration order of unordered data, or on a sort without a full tie-break;
   - no random draw added to, removed from or moved within a generator stream unless the change means to, since it shifts every later draw;
   - geometric choices made in the acting team's perspective.
   A sim change that alters fights it shouldn't is a bug; say which fights.
2. **Rules match the docs.** Behaviour matches `docs/design.md` and the spec it implements. A changed rule or number is updated in `docs/design.md` (and the spec) in the same change. Numbers live in `packages/sim/src/data/`, with whole-number percents and durations in seconds.
3. **Bugs.**
   - wrong results and crashes;
   - broken invariants, such as unit copies and item and ring counts being conserved;
   - player actions or fight input that aren't validated;
   - `client` code that changes a fight instead of showing it;
   - Node APIs in `packages/server/src` outside `server.ts` and `main.ts`.
4. **Tests.** A new rule or behaviour has a test that would fail if it broke.

Not worth a comment: style and naming, anything lint, the typecheck or the tests already catch, numbers (they are placeholders until balancing), and problems the pull request doesn't touch.
