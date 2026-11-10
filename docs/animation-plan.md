# Unit Animation Plan

How the units get rigs and animations, who does what, and in what order. The rules are in `viewer-spec.md`: section 4 (Models, and Rigs and clips) and section 5 (Animation). This plan doesn't repeat them.

## Status

- [x] Workflow 1, the pilot: the rig kit and clip library, Gimli, and the client loading models and playing clips.
- [x] The user reviews Gimli, and decides six things (Review below).
- [x] Workflow 2: the other 35 units, in three runs: 2a, 2b and 2c.
- [x] The 2★ gear models: Gimli's, Éomer's and Treebeard's as the pattern, then the other 33 in five batches, and a play-test.
- [x] The `attack` and `cast` clips retimed to the sim's wind-ups and melee blows (Retiming below).
- [x] Blows that reach into the room an `attack` or `cast` has ahead of the hex (Blows that reach ahead below).

All 36 units are rigged at 1★: Gimli; in run 2a, Éomer and Sharku on their mounts, Frodo, Sam and Merry, Aragorn, Boromir, Faramir and Beregond, and Balin and Dáin; in run 2b, the Ringwraith, Éowyn and Háma, Legolas, Haldir, Elrond and Galadriel, Gandalf, Saruman and Radagast, Gorbag, Grishnákh, Uglúk, Lurtz and Gothmog, Gamling, Théoden, Khamûl and the Witch-king on their horses, Pippin, Bilbo and Gollum, and Treebeard and Sauron. Run 2c checked them with full boards, a clash check and a play-test, and fixed what it found (Run 2c below). After it, Dáin's two-handed blows were redesigned, Faramir's stun was fixed, and the last blows that swung out of the hex between frames were brought in, so no 1★ model warns now (`art/README.md`, Fitting clips to what a model holds, and Checking clashes).

Alongside it, the star-level rollout (`art/star-study/ROLLOUT.md`) gave every unit a gear model at 2★ and a book model at 3★, `trim` fittings coloured by star level, and a base, since dropped for a health bar framed in the star level's colour (`viewer-spec.md` section 4, Star levels). Merging the two kept every 1★ model's rig and clips, apart from a few millimetres where a new fitting changed what a hand holds, as on Gandalf's staff, and added the rollout's fittings to it, each bound to the bone of what it is fixed to (`art/README.md`, Rigging). The between-frame warnings and the clashes are as before. The 2★ and 3★ models came in static, and the client draws a model still unless it has a rig and all seven clips. The label now clears the attack and cast clips, which settled the weapons some of them raised into it (Run 2c below).

Then the 2★ gear models were rigged, so every unit is rigged at 2★ too. Each is its unit's rigged 1★ model with the gear on, finished with the 1★ model's rig, so it has the same bones and clips and moves as the 1★ model does (`art/README.md`, Gear models). Gimli's, Éomer's and Treebeard's set the pattern, and five batches did the other 33: the Hobbits; the Dwarves and Gondor; the Elves and the Istari; the Orcs and Sauron; and Rohan and the Nazgûl.
- Each builds without warnings, inside its gear budget and a gear model's size limit (`viewer-spec.md` section 4, Limits). Its clips are the 1★ model's key for key, Khamûl's but for rounding, and every 1★ and 3★ model rebuilt byte for byte.
- Where the 1★ clips took a piece as main drew it out of the hex, or into the body or the ground, the piece changed, not the clips, and its script says why.
- A play-test found every 2★ unit playing its clips as its 1★ does, a clean swap from 1★ to 2★ as units merge, and no console errors.
- The 3★ book models stay static, as the user chose.

Still open (Later below):
- how smooth full boards are on a real GPU, since run 2c and the 2★ play-test only had software WebGL;
- rigging the 3★ book models, which stay static for now.

Then the sim gave abilities their wind-ups and melee blows their delay, and the `attack` and `cast` clips of every rigged model, 1★ and 2★, were retimed to them (Retiming below). And an `attack` or `cast` was given room ahead of the hex, which the blows of 19 units now reach into (Blows that reach ahead below).

---

## Where it starts

- **Models:** the 36 units' models are static: one mesh each, exported without a rig or animations (`art/kit.py`, `finish()`).
- **Client:** it draws pawns, which turn to face their targets, slide from hex to hex, lunge to strike, fade when untargetable, and sink and fade when they die (`playback.ts`, `scene.ts`).
- **Sim:** its events already say everything animation needs: `move`, `dash`, `attack`, `cast`, `status` (for stuns), `death` and `end`. Nothing changes in the sim, so every fight plays out exactly as before. The sim has moved on since: blows and abilities land after a wind-up, with new event fields (`sim-spec.md` sections 9, 10.6 and 14), and the clips followed (Retiming below).
- **Blender:** 4.5.15 LTS, whose glTF add-on (4.5.51) matches the one the committed models were exported with, and which rebuilds them byte for byte. It is installed in the cloud session's container at `/usr/local/bin/blender`. CI has no Blender, so the `.glb` files stay committed.

## Approach

- **Rigs in the scripts.** Each unit's script already places its joints. The kit builds a skeleton of 16 named bones there, binds each part to one bone as it is made, and exports the skin with the clips. This is rigid skinning: the faceted parts move as solid pieces. The rest pose is the model as built, so no model is rebuilt in a T-pose; a part that has to bend becomes two that overlap where it bends (`viewer-spec.md` section 4).
- **Clips from a library.** Each unit has seven clips: `idle`, `move`, `attack`, `cast`, `stun`, `death` and `victory`. A shared library keyframes them in Python from the rig's proportions. Each unit picks the styles that fit its weapon and ability, or adds its own.
- **The client plays them in fight time.**
  - `models.ts` loads each model once and gives every unit its own copy.
  - `animation.ts` works out which clip each unit plays and how far in, from the events and display time alone.
  - `scene.ts` sets a Three.js `AnimationMixer` to that pose each frame.
  - So pause, step and speed apply to animation too, and the frame rate changes nothing.
- **Pawns stay** for monsters, summons and any model that is missing or still loading. A model without a rig is drawn static.

## Work and owners

| Work | Agent | Files |
|---|---|---|
| Rig kit: skeleton, binding, export, checks | `low-poly-artist` | `art/kit.py`, new `art/rig.py` |
| Clip library and clip previews | `low-poly-artist` | new `art/clips.py`, `art/preview.py` |
| Gimli rigged and animated: the pilot | `low-poly-artist` | `art/units/gimli.py`, `public/models/gimli.glb` |
| Tests from the spec | `spec-test-writer` | `test/animation.test.ts`, `test/models.test.ts`, `test/playback.test.ts` |
| Models in the client | `client-engineer` | new `src/models.ts`, `src/scene.ts` |
| Animation in the client | `client-engineer` | new `src/animation.ts`, `src/playback.ts`, `src/scene.ts` |
| Play-testing | `playtester` | none |
| Docs kept consistent | `design-keeper` | `docs/`, `CLAUDE.md`, `art/README.md` |
| The other 35 units | `low-poly-artist`, in batches | `art/units/*.py`, `art/mounts.py`, `public/models/*.glb` |

- Paths under `art/`, `public/`, `src/` and `test/` are in `packages/client`.
- The client-engineer loads the models this time. It follows the low-poly-artist's rules for loading: load once, give each unit a copy with its own materials, and fall back to the pawn.

---

## Workflow 1: the pilot

Agents share one checkout and run two at a time. Each keeps to its own files and none of them commits. The orchestrator reviews the whole change, runs `pnpm check`, then commits and pushes.

1. **Build,** in two lanes at once:
   - Art: the rig kit and clip library, then Gimli rigged with all seven clips, a contact sheet of each clip from Blender, and the README.
   - Client: the spec-test-writer writes the tests from the spec first. Then the client-engineer loads the models and builds `animation.ts` until those tests pass.
2. **Integrate:** a client-engineer plays Gimli's clips in the viewer and on the play page, and fixes what doesn't fit.
3. **Play-test:** the playtester plays both pages in a browser. It checks the models, Gimli's clips at every speed, pause and step, reduced motion, console errors, and smoothness with full boards.
4. **Fix:** what the playtester found, by owner (art or client).
5. **Docs:** the design-keeper checks the docs against what was built, and updates the status above.

**Done when:**

- `pnpm check` passes, and rebuilding every model changes no `.glb` but Gimli's.
- Gimli's `.glb` has the 16 bones, the seven clips and the limits in `viewer-spec.md` section 4, and the models test checks them.
- Both pages draw every unit as its model: Gimli animated, the rest static, and monsters and summons as pawns.
- Fights are the same as before apart from how the units look: the same results and the same event log.

## Review: Gimli

Before workflow 2, the user looks at Gimli in three ways: the contact sheets, screenshots from the viewer, and a page that plays each clip. Things to decide then:

- whether the clips read at game size, above all the strike, the cast and the death;
- how lively `idle` and `victory` should be;
- anything to change in the library before 35 more units use it.

The user approved Gimli and decided, from what the play-test found (`viewer-spec.md` sections 4 and 5 now say so):

1. **Facing:** a unit faces the way it goes while a step or dash moves it, and turns back to its target after, each turn taking 3 ticks. Facing the target throughout made 42% of steps run sideways or backwards.
2. **Cuts:** `attack`, `cast` and a dash's held stride start at full weight. The 3-tick fade blended away most of the chop's wind-up. Every other change still fades. With dashes that take time, the design has since dropped the held stride: a dash will run `move` from when it sets off (`viewer-spec.md` section 5).
3. **Death:** the sink and fade start halfway through the `death` clip, so a body is fading when another unit steps into its hex, which happened in a third of deaths. (The effects have since replaced the sink with shards at the same point: `viewer-spec.md` section 5, Effects.)
4. **Stun:** an attack or cast on the tick a stun starts plays before the stun shows.
5. **Size:** under 200,000 bytes, or 300,000 for Riders and Large units, which have more triangles and bones.
6. **Liveliness:** `idle` and `victory` stay as subtle as Gimli's.

## Workflow 2: the other 35

Starts once the user has approved Gimli. It runs as three workflows, each reviewed and committed before the next:

- **2a:**
  - The client takes the review's decisions: the spec-test-writer updates the tests, then the client-engineer builds them.
  - The mounts: the horse in `art/mounts.py` and Sharku's warg get their rig and gait, with Éomer as the reference rider, and Sharku, whose warg is built in his own script. The `mount_…` bone names go into `viewer-spec.md` section 4.
  - Batches: Hobbits (Frodo, then Sam and Merry), Gondor (Aragorn, then Boromir, Faramir and Beregond) and Dwarves (Balin and Dáin, after Gimli).
- **2b:** batches:
  - Hobbits (Pippin, Bilbo and Gollum, after Frodo);
  - Elves (Legolas, then Haldir, Elrond and Galadriel);
  - Istari (Gandalf, then Saruman and Radagast);
  - Orcs (Gorbag, then Grishnákh, Uglúk, Lurtz and Gothmog);
  - the Ringwraith with Rohan on foot (Éowyn and Háma);
  - Riders, after the mount (Gamling, Théoden, Khamûl and the Witch-king, following Éomer);
  - Large (Treebeard and Sauron).
- **2c:** the check:
  - The models test requires every unit to be rigged.
  - The client-engineer looks at full boards.
  - The playtester plays both pages, and what it finds is fixed.
  - The design-keeper updates the docs.

Each batch owns its own scripts and `.glb` files, rigs its reference model first (`art/README.md`) so the others follow it, and rebuilds only its own models (`pnpm models <ids>`).

The kit and the library stay as they are for models already rigged. A batch may add a style, or an option whose default gives what it gave before. It doesn't change what an existing style or the kit does: Gimli and every model rigged before it must rebuild byte for byte. The mount may add to the kit for riders on the same terms. Run 2c's fixes were the exception: they changed models already rigged, Gimli's attack among them, where the check found faults.

## Run 2c: the check

**Full boards.** The client-engineer checked both pages with full boards in headless Chromium. It draws WebGL in software (SwiftShader): at 1600×900 a frame waits about 79 ms on the 217 draw calls of 18 rigged units, and still 54 ms at 480×270. So its frame rate, 11 to 18 a second, says nothing about a real GPU. It compared the page's own work before and after instead, on the same machine:

| With 18 rigged units at 1× | Before | After |
|---|---|---|
| The client's own allocation on a frame between ticks | about 7 KB | none |
| JavaScript in a frame that swaps pawns for models | 43 to 85 ms | 14 to 23 ms |
| The longest task while models load | 32 ms | 6.5 ms |
| Models ready after the page opens | 2.2 to 2.4 s | 1.3 to 1.6 s |
| A restart: creating the units | about 14 ms | about 2 ms |
| A restart: looking up shaders | 12 ms | 0.1 ms |

- A frame takes about 5 ms of JavaScript, most of it Three.js's render (3.3 to 3.8 ms, nearly all of it the draw calls, since each model has its own materials). The play page's late fights, with 15 to 19 units, take 4 to 5 ms. After each frame the browser spends about 2.7 ms on style, layout and paint for the moving labels.
- Steady-state frame time didn't change measurably: before and after are within the machine's run-to-run noise of ±20%.
- Three.js's renderer, mixers and label renderer and the sim's ticks still allocate about 185 KB a frame at 1×, the sim about 20 KB of it. Garbage collection takes 0 to 0.5 ms a frame.
- The page's first frame still takes 90 to 120 ms to compile shaders. The first rigged model took another 40 to 50 ms, so the scene now compiles the models' shader ahead (`viewer-spec.md` section 4), though headless Chromium can't show the gain.

**Big models.** Heads stay below the label in every clip, and in `victory` the label rises clear of the weapon. Some attacks and casts raised a weapon into it, until the merge with star levels set the label clear of the highest point of `attack` and `cast` (`viewer-spec.md` section 4, Star levels). It clears heights, not what the camera sees, so with the camera zoomed right in a standard held behind a unit can still seem to reach it. Projectiles flew at a height of 0.9, over a Hobbit's head and into Treebeard's thighs; they now fly from chest to chest (`viewer-spec.md` section 5).

**Clashes.** `art/clash.py` joined the kit (`art/README.md`, Checking clashes). Run on Gimli and run 2a's 11 units, and judged from close renders, it found clashes that show at game size in nine clips. Six are fixed: Sam's and Boromir's attacks, Aragorn's cast, Dáin's stun and victory, and Faramir's victory. Three remained, Dáin's attack and cast and Faramir's stun, and were fixed after the run (Status above). Gimli's hits are all hidden.

**Between frames.** The play-test found fast blows swinging out of the hex between keyframes, which the viewer shows: Sauron's mace reached 1.43 from his centre. `finish()` now checks quarter frames as three.js poses them, and `fit(between=True)` or `tweened()` draws such blows in (`art/README.md`, Fitting clips to what a model holds). Those fixes, with new options on `smash`, `rally` and the drawn `shot`, changed 20 models, Gimli's attack among them. Every model stays within 0.94 of its centre on every whole frame. In all, run 2c changed the clips of 21 models and no geometry, so their triangles and sizes are as before.

**Play-test.** Both pages, with every unit rigged, showed no console errors, warnings or failed requests, and the same fight URL gave the same result every time. It found two older bugs in the client, both fixed: ending planning while dragging a unit hid the person's fight, and the HUD and players list showed the round's outcome while the fight still played (`game-spec.md` section 12, Fights).

---

## Retiming

The sim now lands a melee blow 0.22 s after its attack and an ability at the end of its wind-up, 0.35 to 0.6 s after its cast, striking or loosing again every 0.1 s for several hits, and a dash or charge sets off then (`sim-spec.md` sections 9 and 10.6). Every rigged model's `attack` and `cast`, 1★ and 2★, were retimed to them (`art/README.md`, The clip library, Timing):

- **The kit.** The styles keep their keys, and `made()` fits each style's attack and cast to the unit's timing, which `rig.timing()` reads from the sim's data. A melee attack draws back over its first 4 frames and lands the blow on frame 7; a shot still leaves on frame 3. A cast gathers slowly through its wind-up and strikes, looses or stamps at its own pace into its height, on frame 11, 12, 15 or 18; a dash or charge springs then, and `move` carries it on. `finish()` fails a clip that is off, and the models test checks the frames, written into each armature's extras, against the sim.
- **As built.** Melee attacks are 0.67 or 0.73 s, the blow on frame 7; ranged attacks as before, 0.6 s (Pippin's 0.67), the shot on frame 3. Casts are 0.97 or 1 s: at their height on frame 12 for the 0.4 s wind-ups, 11 for the four dashes (Grishnákh, Khamûl, Théoden, the Witch-king), 15 for Elrond, Radagast, Saruman, the Ringwraith, Treebeard and Sauron, and 18 for Gandalf and Galadriel; Legolas's Flurry looses again on 15, 18, 21 and 24, and Gorbag's Volley and Gollum's My precious strike again on 15 and 18.
- **Units that changed.** Gorbag's and Gollum's hits come every 3 frames, as the sim's do, where they had 4 and 5. Haldir's Lórien volley looses its three arrows together, so his cast is a heavy shot from the draw rather than three in a row. Sauron's `reap` and Treebeard's `heave` begin drawn back (`begin` 1), since easing in from rest put the mace and the boulder through their bodies. Treebeard's idle is 2.6 s rather than 3.0, to keep his longer clips within his size: 298,432 of 300,000 bytes, and his gear model 336,616 of 337,500.
- **Limits.** Every model builds without a warning: inside the hex and out of the ground on every frame and between them, under its size (Radagast's 199,460 of 200,000 bytes is the closest on foot), with its death low. The 3★ book models and the arena rebuilt byte for byte. The label clears the new attack and cast poses as before, since it is worked out from the clips as a model loads.
- **Clashes.** `clash.py` on the attack and cast of all 72, against the clips before the retime: the same clashes, as deep, on later frames, but for grazes of 4 to 7 mm as the clips ease in from rest (Gothmog's cast, Khamûl's and Sharku's attacks, Merry's cast), Gandalf's sword hand 7 mm deeper into his chest as he heaves the staff slowly up, and Radagast's bird 11 mm deeper into his head as it leaves his fist. Treebeard's hurled boulder still waits inside him until he tears up another.

## Blows that reach ahead

An `attack` or `cast` may reach 1.3 ahead, within 30 degrees of straight ahead, while every other clip keeps to the hex (`viewer-spec.md` section 4, Size). Its blows now use that room (`art/README.md`, Fitting clips to what a model holds):

- **The kit.** `fit()`, `kept()`, `kept_between()` and `tweened()` keep what the hands hold in an attack's or cast's room rather than the hex, measuring a point in the wedge ahead against 1.3 (`rig.measured()`), with the same margin inside it as `room` keeps inside the hex: 1.27 ahead, 0.92 elsewhere. The drawn `shot`, `flurry` and `heave` do the same. The build prints how far each model's attack and cast reach.
- **What changed.** 19 units' blows, 1★ and 2★ alike: those drawn in for the hex now reach 0.95 to 1.27 from the centre, most of them between frames as a blade comes over the top or is lifted back past level, where they reached 0.92 to 0.94. Where an option only kept a blow in the hex it is gone, and the blow takes its style's own arc: Aragorn's chop and rally, Éowyn's chop, Khamûl's cut, the lift after Sauron's smash and Gorbag's fresh arrow. Merry's Barrow-blade and Grishnákh's Sneak lunge to the full stretch of the arm, more nearly level. Grishnákh and Radagast are fitted between frames too, where their stab and their pointed staff swung out past the side of the hex. Sauron's `drop` and `coil`, Sharku's `across` and `early` and Lurtz's `wide` stay, since without them the blow or the arrow still swings out past the side of the hex.
- **Judged on the board.** A melee attack lunges 0.52 at its blow, so the blades that now reach 1.03 to 1.08 ahead on the blow's frame (Éowyn, Grishnákh, the Ringwraith) go about 0.1 into a Man in the next hex, and the chops that reach 1.11 to 1.12 between frames cut down through his head and shoulder on the way to the ground: they read as hits, so `kit.AHEAD_REACH` stays 1.3. Casts don't lunge, so Éowyn's riposte, at 1.19, stops short of the foe's face.
- **Checks.** Every model builds without a warning. `clash.py` on the attack and cast of the 19 finds the same clashes, within a few millimetres, or fewer: Aragorn's fist no longer goes into his head as the chop and rally come over, nor Éowyn's into her hair, Haldir's string no longer brushes his head as he nocks, and Merry's and the Witch-king's grazes are gone. Gimli's attack is among those that changed: his axe comes down as far as 0.99 ahead between frames 6 and 7, where `tweened()` had drawn it in to 0.94, so his `.glb` is no longer byte for byte as it was. No geometry changed, so the triangles are as they were, and the files' sizes are within 4 bytes of what they were.

## Risks

- **Blender versions** export differently. Keep to 4.5 LTS. The models test checks the committed files, since CI can't rebuild them.
- **Blows in step with the sim.** A melee blow lands 0.22 s after its attack and an ability at the end of its wind-up, 0.35 to 0.6 s after its cast (`sim-spec.md` sections 9 and 10.6), and the clips strike then (Retiming below). The kit reads the times from the sim's data, so a changed wind-up or blow delay needs only a rebuild, and `finish()` fails a clip that is off; the models test checks the committed files against the sim. A wind-up of more than 0.6 s, or a multi-hit ability with more hits, would leave a cast less room in its second (`LONGEST`).
- **Fast attackers,** with stacks, attack up to about 2.5 times a second, faster than an attack clip lasts. Each attack restarts the clip, so every one still shows its strike.
- **Room in a hex.** Death clips end low rather than lying full length. A fast blow can swing out of the hex between two frames that are both inside it, since the viewer turns each bone the short way round from one frame to the next. `finish()` checks between frames too, and `fit(between=True)` or `tweened()` draws such blows in, with options on the blows where that wasn't enough. No rigged model reaches outside the hex now, on frames or between them. Since then an `attack` or `cast` has more room ahead, up to 1.3 from the centre within 30 degrees of straight ahead, while every other clip keeps to the hex (`viewer-spec.md` section 4, Size), and `finish()` checks each clip against its own room, and `fit()`, `tweened()` and the styles that keep what the hands hold in their room keep an attack or cast in it, so 19 units' blows now reach ahead (Blows that reach ahead above). A 2★ model grows by how it stands, not by its clips, as the user chose, so its clips may reach up to 10% past their room (`viewer-spec.md` section 4, Star levels). Capped by its clips, as it was before, 28 of the 36 gear models grew about 2% at most, since most clips come near the hex's edge to the side or behind, in `move`, `stun` and `death` as well as in blows; now 22 grow the full 10% and the other 14 by 2 to 10%.
- **Size and speed.** A rigged model stays under 200,000 bytes, or 300,000 for Riders and Large units, and a rigged gear model under 225,000 or 337,500, with one mixer per unit. Run 2c checked full boards with software WebGL only, so how smooth they are on a real GPU is still to check (Later).
- **Robes to the ground.** Gandalf, Saruman, Radagast, Galadriel, Elrond, the Ringwraith and Sauron wear robes that would glide when the legs run, since a part follows one bone. Each robe is in three pieces: the chest on `spine`, the skirt on `hips`, and the robe below the knees on a bone of its own, `robe`, hanging from `root`. `robed()` moves that bone after the hips, keeps it hanging upright, and twists it and lifts its hem with the knees, so the stride shows through it (`art/README.md`, The Nazgûl). Gandalf's cloak is split the same way. Khamûl's and the Witch-king's robes split only at the waist, since mounted clips don't move a rider's legs.
- **One checkout.** Agents keep to their own files, rebuild only their own models, and only the orchestrator commits.

## Later

- **Smoothness on a real GPU.** Someone, the playtester or the user, plays both pages with full boards on a machine with a GPU. Run 2c only had software WebGL, and so did the 2★ play-test, in which rigging the 2★ models cost about 5 to 7% of the frame rate and 1.5 to 2.3 ms more of the main thread a frame.
- **The 3★ book models,** still to rig. They stay static for now, as the user chose.
- Reactions to hits, a second attack, and channelled casts.
- Models and rigs for monsters and summons, with the user's go-ahead.
- Sound.
