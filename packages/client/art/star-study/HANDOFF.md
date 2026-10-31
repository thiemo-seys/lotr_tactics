# Handoff: how star levels show on unit models

For a new Claude Code session on this repo, from the session that built the roster's models. Read `CLAUDE.md` as usual; this file gives the task and everything that isn't in the docs yet.

## The task

The user wants to choose how a unit's star level (1★, 2★, 3★) shows on its 3D model, and wants to choose by looking. Build a small visual study with three units:

- Frodo, a small unit;
- Aragorn, a standard one;
- Éomer, a mounted one.

Show each option side by side on the game's board, publish a comparison page, and ask the user to choose. Don't roll anything out to the other units or to the client until they have.

## Background

- **Star levels:** 3 copies of a 1★ merge into a 2★, and 3 copies of a 2★ into a 3★ (`docs/design.md` section 2). A 3★ needs 9 copies, so a 3★ 5-cost takes every copy in the game (section 8).
- **What shows a star level today:** only the label above a unit (`createPawn` in `packages/client/src/scene.ts` adds the stars to the name). `design.md` section 12, item 2, lists "how star levels show on a model" as an open question.
- **The models:** all 36 units have models in the Faceted style (`docs/viewer-spec.md` section 4).
  - Each is one Blender 4.5 LTS script, `packages/client/art/units/<id>.py`, built on a shared kit: `kit.py`, plus `mounts.py` for the horse.
  - Each exports `packages/client/public/models/<id>.glb`.
  - `packages/client/art/README.md` explains how they're built and checked.
  - The client doesn't load them yet: it draws pawns, and scales Large ones by 1.35.
- **Where the code is.** When this was written, the models were in draft pull requests, none of them merged:
  - [#56](https://github.com/thiemo-seys/lotr_tactics/pull/56) has the kit, the style study, the docs and `pnpm models`.
  - #57 to #92 have one unit each: Frodo is [#57](https://github.com/thiemo-seys/lotr_tactics/pull/57), Aragorn [#70](https://github.com/thiemo-seys/lotr_tactics/pull/70) and Éomer [#74](https://github.com/thiemo-seys/lotr_tactics/pull/74).
  - The user's [review gallery](https://claude.ai/artifact/YD2TSvNUQtuFALX67MuGkZ) shows every model on the board and from eight sides. Read it with the Artifact tool if you have one.

## Getting started

Fetch the branches:

```bash
git fetch origin main claude/model-kit claude/model-frodo claude/model-aragorn claude/model-eomer claude/great-edison-q2bj78
```

Merge the kit and the three units into your branch. This is harmless if some are already on main.

```bash
git merge origin/claude/model-kit origin/claude/model-frodo origin/claude/model-aragorn origin/claude/model-eomer
```

Take this handoff and the board renderer from the branch where the roster was built:

```bash
git checkout origin/claude/great-edison-q2bj78 -- packages/client/art/board.mjs packages/client/art/star-study/HANDOFF.md
```

Don't merge `claude/great-edison-q2bj78` itself. It has all 36 models under different commits from the pull requests, and would duplicate them.

## The options

These came out of a discussion with the user, who agreed to this study.

1. **Grow:** 2★ about 10% bigger, 3★ about 20%.
   - It costs one line in the client.
   - Size only compares a unit with itself: a 3★ Hobbit is still smaller than a 1★ Man.
   - Riders and Large units already reach 0.91 of the hex's 0.94 radius, so they must grow less or spill into the next hex.
2. **Base:** a low stand under each unit, plain at 1★, with a silver rim at 2★ and gold at 3★. Pips on its front edge are a variant.
   - It is built once for every unit.
   - It says nothing about the character.
   - It could also carry the team colour, which is the other open question in item 2.
3. **Trim:** buckles, bands and fittings in a `trim` material that the client colours iron, then silver, then gold.
   - It needs no new models.
   - The trim would need naming in all 36 scripts: only about half have a brass, gold or silver material today.
   - Trim is a few pixels at game size, and gold must stay muted.
4. **Gear:** each star adds a piece, such as shoulder plates, a crest or a banner. It reads best on the character, but means 72 variants. Show it on one unit at most.
5. **A book moment at 3★:** each unit as itself at its height in the books, as its own model, `<id>-3.glb`. For the study:
   - **Frodo:** the mithril coat glinting where the elven cloak opens.
   - **Aragorn:** King Elessar, with the Elendilmir on his brow and the crown of Gondor. In the books the crown is a tall white helm with wings of pearl and silver like a sea-bird's, and seven gems in its circlet. He carries Arwen's standard: on black, the White Tree in blossom, with seven stars about it and a high crown above. His 1★ already plants a black standard with the White Tree, so the 3★ makes it the royal one.
   - **Éomer:** Éomer King, after Théoden, with a crowned helm and the royal banner of Rohan, a white horse on green.

   Other ideas the user has seen, for later:
   - Gandalf the White, and Saruman of Many Colours.
   - Merry in the livery of Rohan and Pippin in the black and silver of the Citadel Guard, both a little taller from the Ent-draughts.
   - Sam holding up the Phial of Galadriel.
   - Legolas with the bow Galadriel gave him.
6. **Aura:** a faint glow around 3★ units. It's cheap in the client, but competes with ability effects in fights. Show it only if it's quick.

**The recommendation the user saw** (they may change it):
- 2★ grows about 10%, Riders and Large units less, with the stars on the label.
- 3★ is the book-moment model.
- The base and trim stay in reserve, and there's no aura.

Show this recommendation as one of the combinations, and make the others easy to compare with it.

## Suggested plan

1. **The client-side options go in the renderer, not the client.** Extend `board.mjs`, which renders the game's camera, lights, board and team colours from `scene.ts`:
   - add a star level per model, with a scale per star, a base mesh, a trim recolour and, if cheap, an aura;
   - add a 3 × 3 layout: the three units at 1★, 2★ and 3★, each in blue from behind and red from the front.
2. **The 3★ models go in `packages/client/art/star-study/`.** Copy the three unit scripts there and build the book-moment versions, so the open unit pull requests stay untouched.
   - Use the low-poly-artist agent, one per unit, at most two at a time.
   - As a placeholder budget, allow 25% more triangles: 1,000 for a unit and 1,500 for a mounted one. Report what each used.
   - For the trim option, give the three study copies a `trim` material.
3. **Render** board shots of each option and of the recommended combination, and `preview.py` sheets of the 3★ models.
4. **Publish a comparison page** as an artifact, like the roster's review gallery. Give each option a section, with its trade-offs: hex overlap, the palette limit on gold, and the work each needs (client only, or something for every unit).
5. **Commit the study** in `star-study/`, with a README like the style study's, and open a draft pull request. Report to the user and ask them to choose.
6. **After the choice, not before:**
   - Record it in `design.md` section 12 and `viewer-spec.md` section 4: how star levels show, the 3★ budget and the file name.
   - Plan the roll-out: the work for every unit, run as a workflow like the roster's.
   - Plan the client changes: the scale per star, loading `<id>-3.glb`, raising labels over taller models, and not scaling Large models, which are built at full size.
   - 3★ 5-costs are the rarest, so they can come last.

## Rules

- **The Faceted rules** in `viewer-spec.md` section 4:
  - flat-shaded low-poly;
  - a muted palette in which the `team` material is the only saturated colour, so nothing else may look blue or red (no blue glow on Sting, for example);
  - metallic 0.15 at most;
  - everything within 0.94 of the centre;
  - one object per model.

  `finish()` in `kit.py` checks most of these.
- **Draw from the books, not the films**, as the low-poly-artist agent says. No model shows the One Ring or a Ring of Power.
- **The client only shows what the sim decides.** The star level comes from the unit's state, so nothing in `packages/sim` changes.
- **A changed rule goes into `design.md`** and the specs in the same change.

## Lessons from the roster

- **Blender** runs headless:

  ```bash
  blender --background --factory-startup --python-exit-code 1 --python <script> -- <out.glb>
  ```

  A Cycles preview sheet takes about a minute on this machine's 4 CPUs.
- **Usage limits:** each low-poly-artist agent used 300k to 370k tokens. Nine at once hit the plan's 5-hour limit; two at a time built the rest of the roster overnight without hitting it.
- **Pull requests:** the repo's automated Claude review runs on the user's plan for every pull request opened ready for review, so open drafts.
- **Commit and push as you go:** the stop hook complains about uncommitted files.
