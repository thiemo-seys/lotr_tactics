<!--
Solve one underlying problem per pull request. Pull requests are merged by rebase,
so each commit lands on main as it is: give each a clear message and keep each one
passing `pnpm check`. Bring the branch up to date by rebasing on main, not merging.
Title it like the commits, a plain-language sentence in the imperative, such as
"Land projectiles in flight as their caster dies".
-->

## Problem

<!-- The problem in a sentence or two: what happens, what should happen, and how to
see it (a seed, a board, a round, a page). For new content or rules, what it adds
and where in docs/design.md it is designed. -->

## Change

<!-- How this fixes it. If it spans packages (sim, client, server), say why each part
is needed for the same fix. Split independent fixes into their own pull requests. -->

## Docs

<!-- Which rules or numbers changed, and where docs/design.md and the specs
(sim-spec, viewer-spec, game-spec, server-spec, animation-plan) were updated to
match. Say "None" if no rule, number or documented behaviour changed. Numbers
belong in packages/sim/src/data/. -->

## Determinism

<!-- For changes to packages/sim/src or the browser-safe parts of packages/server/src:
- Does it change any fight or game result for the same input? If so, which, and
  is that intended?
- Does it add, remove or move a random draw?
- Any new sort, iteration over unordered data, or geometric choice, and how it
  is tied off (full tie-break, acting team's perspective)?
Say "Not touched" if neither package changed. -->

## Verification

<!-- The focused tests and manual checks you ran for the changed behaviour, and what
you saw. A new rule or behaviour needs a test that would fail if it broke.
"pnpm check passes" alone is not enough. State anything you could not check.

- Sim and game: the tests that cover it; for number or content changes, a
  `pnpm balance` run and what moved.
- Client: before/after screenshots, and a short recording when motion, timing or
  effects matter. Upload them to the pull request, don't commit them.
- Server: how you played it online (lobby, seats, reconnects) if behaviour changed.
- Models and arenas: whether you rebuilt the .glb files with `pnpm models`
  (Blender 4.5 LTS, which CI doesn't have), and renders of the result. -->

<!-- If an agent did the work, end with the harness and the subagents that took part. -->
