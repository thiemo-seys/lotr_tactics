# LOTR Tactics

Browser-based, 8-player auto battler in the style of Teamfight Tactics, with Lord of the Rings characters. Three.js rendering, low-poly 3D, TypeScript monorepo.

## Docs

- `docs/design.md`: game design, the source of truth for rules and content.
- `docs/sim-spec.md`: implementation spec for the combat simulation, including defaults not yet in the design doc.

## Status

Design is done for combat, units, traits, economy and rounds. No code exists yet. The next milestone is `packages/sim`: the deterministic combat simulation described in `docs/sim-spec.md`.

## Conventions

- `sim` is pure and deterministic: no `Math.random`, no time APIs, no DOM or Node APIs, and no trig or `Math.pow` in game logic. Use the seeded generator. See `docs/sim-spec.md` section 4.
- Game numbers live in data files, not hard-coded in logic. All numbers are placeholders until balancing.
- When a rule or number changes, update `docs/design.md` (and `docs/sim-spec.md` if it affects the sim) in the same change.
