# Roll-out: star levels on every unit

The owner chose on 1 November 2026 to use every option from the study except the aura. The rules are in `docs/viewer-spec.md` section 4, "Star levels". This file plans the art that follows. The client part (loading models, the scale per star, the base, trim and the fallback to the level below) is separate, and it works before any of this exists.

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

The kit needs `GEAR_BUDGET` and `BOOK_BUDGET` beside the existing budgets, and `pnpm models` must also build the `-2` and `-3` scripts.

## Order

1. **Kit and the three study units.**
   - Add the budgets and `trim` to the kit and `mounts.py`.
   - Move `star-study/{frodo,aragorn,eomer}{,-3}.py` and `aragorn-2.py` into `units/`.
   - Add gear for Frodo and Éomer.
2. **The rest by cost, cheapest first**, because 1-costs reach 3★ most often. 5-costs come last: a 3★ 5-cost takes all 9 copies.

| Cost | Units |
|---|---|
| 1 | Beregond, Gorbag, Grishnákh, Háma, Merry, Pippin, Sam, Sharku |
| 2 | Balin, Faramir, Gamling, Haldir, Lurtz, Radagast, Ringwraith (Frodo in step 1) |
| 3 | Bilbo, Boromir, Éowyn, Gimli, Gollum, Khamûl, Uglúk (Éomer in step 1) |
| 4 | Dáin, Elrond, Gothmog, Legolas, Saruman, Théoden (Aragorn in step 1) |
| 5 | Galadriel, Gandalf, Sauron, Treebeard, Witch-king |

Book moments the owner has already seen:
- Gandalf the White, and Saruman of Many Colours.
- Merry in the livery of Rohan, and Pippin in the black and silver of the Citadel Guard, both a little taller from the Ent-draughts.
- Sam holding up the Phial of Galadriel. Its light must not be blue.
- Legolas with the bow Galadriel gave him.

## How to run it

Run one low-poly-artist agent per unit, each doing all three steps for its unit and checking them with `preview.py` and `board.mjs --stars` (copy `options/chosen.json` and point it at the unit). Run them as a workflow like the roster's, two at a time.

On the roster each agent used 300k to 370k tokens, and nine at once hit the plan's 5-hour limit. With 33 units plus step 1, two at a time is about 17 rounds, overnight or longer. Each unit is its own draft pull request, as the roster's were.
