# LOTR Tactics

A browser-based, 8-player auto battler in the style of Teamfight Tactics, with characters from The Lord of the Rings. Rendered in low-poly 3D with Three.js.

## Status

Early design. The rules and content are written up; no code exists yet. The first piece to be built is `packages/sim`, the deterministic combat simulation.

## Docs

- [`docs/design.md`](docs/design.md): game design, the source of truth for rules and content.
- [`docs/sim-spec.md`](docs/sim-spec.md): implementation spec for the combat simulation.

## Pull requests

Claude reviews each non-draft pull request automatically and posts its findings as inline comments. The workflow is in [`.github/workflows/claude-code-review.yml`](.github/workflows/claude-code-review.yml).
