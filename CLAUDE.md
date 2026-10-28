# LOTR Tactics

Browser-based, 8-player auto battler in the style of Teamfight Tactics, with Lord of the Rings characters. Three.js rendering, low-poly 3D, TypeScript monorepo.

## Docs

- `docs/design.md`: game design, the source of truth for rules and content.
- `docs/sim-spec.md`: implementation spec for the combat simulation, including defaults not yet in the design doc.

## Status

Design is done for combat, units, traits, economy and rounds. The current milestone is `packages/sim`, the deterministic combat simulation described in `docs/sim-spec.md`. Done so far: hex maths (`hex.ts`), the seeded generator (`rng.ts`), the data files (`data/`), stat calculation (`combat/stats.ts`) and the combat loop (`combat/combat.ts`: tick 0, action order, events, end of combat). Next: targeting and movement, then basic attacks, damage and mana.

## Commands

- `pnpm install`
- `pnpm check`: lint, typecheck and tests, the same checks CI runs
- `pnpm lint`, `pnpm typecheck`, `pnpm test`: one at a time

## Conventions

- `sim` is pure and deterministic: no `Math.random`, no time APIs, no DOM or Node APIs, and no trig or `Math.pow` in game logic. Use the seeded generator. See `docs/sim-spec.md` section 4. ESLint and the TypeScript settings enforce this in `packages/sim/src`; tests are exempt.
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
