# Roll-out: star levels on every unit

The owner chose on 1 November 2026 to use every option from the study except the aura. The rules are in `docs/viewer-spec.md` section 4, "Star levels". This file planned the art that followed. The client part (loading models, the scale per star, the base, trim and the fallback to the level below) is separate, and it worked before any of this existed.

**Done** on 2 November 2026. Every unit has its trim, its gear model and its book model, each unit in its own pull request, and the units table in `art/README.md` lists their triangles.

## What every unit needs

For each of the 36 units, in `packages/client/art/units/`:

1. **Trim** in `<id>.py`: buckles, clasps, sword fittings, brooches and bridle fittings use a material named `trim`.
   - About half the scripts have a `brass`, `gold` or `silver` material for these today; the rest need fittings named, or a few small ones added.
   - `mounts.py` makes the horse's fittings `brass`: rename that material to `trim` there once, as `star-study/eomer.py` shows with `trim_horse()`.
   - The model may otherwise stay as it is.
2. **Gear** in `<id>-2.py`, which writes `public/models/<id>-2.glb`: the 1★ plus one piece that reads at the game's camera.
   - The budget is 900, 1,350 for a mounted unit and 2,250 for a Large one.
   - Aragorn's steel shoulder plates (`star-study/aragorn-2.py`) are the reference.
   - Choose a piece that leaves room for the 3★, so it doesn't take the head if the book moment is a crown.
3. **Book moment** in `<id>-3.py`, which writes `public/models/<id>-3.glb`: the unit at its height in the books.
   - The budget is 1,000, 1,500 for a mounted unit and 2,500 for a Large one.
   - The references are `star-study/frodo-3.py`, `aragorn-3.py` and `eomer-3.py`.

Every model passes `finish()` and keeps the Faceted rules:
- the team colour is the only saturated part;
- metallic is at most 0.15;
- the model stays inside the hex;
- it is drawn from the books, not the films;
- no Ring is shown.

## Order

1. **Kit and the three study units** (done, in the star-level pull request).
   - `kit.py` has `GEAR_BUDGET`, `BOOK_BUDGET` and their mounted and Large versions, and `trim_material()`. `finish()` warns when a model has no `trim`.
   - `mounts.py` makes the horse's browband `trim`.
   - `pnpm models <id>` builds a unit's `-2` and `-3` scripts too.
   - Frodo, Aragorn and Éomer are in `units/` from the study: trim on all three, Aragorn's gear, and the three book models. Frodo's and Éomer's gear come with the rest.
2. **The rest by cost, cheapest first** (done, one pull request per unit), because 1-costs reach 3★ most often. 5-costs come last: a 3★ 5-cost takes all 9 copies.

| Cost | Units |
|---|---|
| 1 | Beregond, Gorbag, Grishnákh, Háma, Merry, Pippin, Sam, Sharku |
| 2 | Balin, Faramir, Frodo (gear only), Gamling, Haldir, Lurtz, Radagast, Ringwraith |
| 3 | Bilbo, Boromir, Éomer (gear only), Éowyn, Gimli, Gollum, Khamûl, Uglúk |
| 4 | Dáin, Elrond, Gothmog, Legolas, Saruman, Théoden (Aragorn in step 1) |
| 5 | Galadriel, Gandalf, Sauron, Treebeard, Witch-king |

Book moments the owner has already seen:
- Gandalf the White, and Saruman of Many Colours.
- Merry in the livery of Rohan, and Pippin in the black and silver of the Citadel Guard, both a little taller from the Ent-draughts.
- Sam holding up the Phial of Galadriel. Its light must not be blue.
- Legolas with the bow Galadriel gave him.

## How to run it

Run one low-poly-artist agent per unit, each doing all three steps for its unit in its own git worktree and branch, `claude/stars-<id>`, and checking them with `preview.py` and `board.mjs --stars` (copy `options/chosen.json` and point it at the unit). Run two at a time.

On the roster each agent used 300k to 370k tokens, and nine at once hit the plan's 5-hour limit. With 33 units plus step 1, two at a time is about 17 rounds, overnight or longer. Each unit is its own draft pull request, as the roster's were. It touches only that unit's scripts and models, so they can be merged in any order. Until the star-level pull request is merged, they are based on it; after it, on `main`. The units table in `art/README.md` is filled in once at the end, so the unit pull requests don't conflict over it.

In the event, each unit took an agent about 230k to 430k tokens and 25 to 55 minutes. Two at a time still reached the plan's 5-hour limit twice. Each time, the stopped agents were resumed where they stopped once the limit reset.
