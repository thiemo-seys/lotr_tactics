# Models

The game's 3D models of units, monsters and summons, in the Faceted style (`docs/viewer-spec.md` section 4). Each model is a Blender 4.5 LTS script that exports a glTF binary to `packages/client/public/models/<id>.glb`, named by its id in `packages/sim`. The scripts are the source. The `.glb` files are committed, because CI and other machines don't have Blender. Both of the client's pages load them, with a 2★ `<id>-2.glb` and a 3★ `<id>-3.glb` when they exist (Star levels below), and draw each unit as its model for its star level, playing a rigged model's clips from the fight's events (`packages/client/src/models.ts` and `animation.ts`, `docs/viewer-spec.md` sections 4 and 5). `packages/client/test/models.test.ts` checks the committed 1★ files, and the rigged 2★ ones (Gear models below).

- `kit.py`: what the models share: the authoring colour of the `team` material, the budgets, the shared palette, materials, the geometry helpers, `bone()` to bind parts to a bone as they are made, and `finish()`, which joins, checks and exports a model, with its rig if it has one.
  - Besides straight tubes and boxes, its helpers build bent forms such as limbs, tails, staves, braids and bows (`bent_tube()` on `path_rings()`, wound with `nearest_on_polyline()`), points such as spikes, claws, tines and pommels (`cone()`), and rough rocks and clumps of leaves (`lump()`); and they pose parts built upright: `lean()` forward, `turn()` sideways and `stoop()`, a bend that grows with height.
- `rig.py`: the rig kit (Rigging below): the 16 bones every model has, joint marks, what a hand holds, the IK that poses arms and legs, and the armature, clips, checks and export that `finish()` adds for a rigged model, and `Mount`, the bones a rider's mount adds to its rig (Riders and mounts below).
- `clips.py`: the clip library (The clip library below): the seven clips as keyframes worked out from a rig's proportions, in styles a script picks, for figures on foot and for riders and their mounts.
- `mounts.py`: the horse the Riders sit on (all but Sharku, whose warg is in `units/sharku.py`), built from its coat and points, markings, tack (the saddle-cloth or a caparison), a raised foreleg or none, and the turn of its head. `horse()` returns where the rider sits, where his feet hang and where the reins start; `units/eomer.py` shows how to seat him. With `rigged=True` it binds its parts to its own bones (`mount_…`), builds its legs standing in three jointed parts each, and returns its `rig.Mount` as `Horse.rig`, for a rigged rider.
- `preview.py`: renders a model with Cycles for review, in its unit's livery and from every side, or a rigged model's clips as contact sheets.
- `livery.py`: each unit's livery colour, from `packages/client/src/livery.json`, which the client reads too, for `preview.py`; `python3 livery.py <model.glb>` prints a model's unit and colour. A model's unit is its file's name without `.glb` and a star level's `-2` or `-3`; a file named after no unit, such as a study's, gets the default livery.
- `clash.py`: checks a rigged model's clips for what its hands carry passing through its head or its chest (Checking clashes below).
- `units/`: three scripts per unit, named by its id: `<id>.py`, `<id>-2.py` and `<id>-3.py`, one for each star level. Gimli (`gimli.py`) is the reference model and the reference rig, and each people has one that the others follow: Frodo for Hobbits, Legolas for Elves, Aragorn for Gondor, Éomer for Rohan, Gandalf for the Istari, Gorbag for Orcs and the Ringwraith for the Nazgûl.
- `arena.py` and `arenas/`: the arena the board stands in (Arenas below).
- `style-study/`: the study that chose the style, kept as it was.
- `star-study/`: the study that chose how star levels show, with its comparison page, kept as it was; [`star-study/ROLLOUT.md`](star-study/ROLLOUT.md) is how every unit got its 2★ and 3★ models.

## Star levels

A unit shows its star level on its model (`docs/viewer-spec.md` section 4, "Star levels"), so each unit has three scripts:

- `units/<id>.py`, its 1★ model. Its fittings, such as buckles, clasps, sword guards and the horse's browband, use `trim_material()`, which the client colours iron, silver or gold by star level.
- `units/<id>-2.py`, its 2★ model: the 1★ with one piece of gear added, such as Aragorn's shoulder plates. Its budget is `GEAR_BUDGET` (900), `MOUNTED_GEAR_BUDGET` (1,350) or `LARGE_GEAR_BUDGET` (2,250).
- `units/<id>-3.py`, its 3★ model, the book moment: the unit as itself at its height in the books, such as Frodo in the mithril coat, King Elessar or Éomer King. Its budget is `BOOK_BUDGET` (1,000), `MOUNTED_BOOK_BUDGET` (1,500) or `LARGE_BOOK_BUDGET` (2,500).

Each script's docstring names its gear or its book moment, and the passage of the books it draws on. Frodo, Aragorn and Éomer, from the study, are the references. A new unit can start with its 1★ model alone: until it has the others, the client uses the level below.

The 1★ models are rigged (Rigging below), their fittings bound like any other part. So are the 2★ models, as their 1★ models with the gear on (Gear models below), with Gimli's, Éomer's and Treebeard's as the pattern. The 3★ models are static for now: each of their scripts is a copy of its unit's 1★ script from before the rigs were merged in, with its book moment added, and binds nothing.

### Gear models (2★)

A rigged 2★ model is its unit's rigged 1★ model with its gear on, finished with the 1★ model's rig, so it has the same bones and clips and moves as the 1★ model does. Gimli (on foot), Éomer (mounted) and Treebeard (Large) are the pattern.

- **The 1★ script** builds its model in `build()`: in a fresh scene, it makes every part, bound to its bone, marks the joints, and returns the rig to finish it with. `main()` finishes it, and the script ends with `if __name__ == '__main__': main()`, so another script can import it without building it. `build()` takes the gear as a keyword argument: a function that makes it, called inside the build where the gear goes, before the model is leaned, stooped or scaled, so the gear is posed with the parts it sits on. With nothing passed, `build()` makes the 1★ model exactly as before, and its `.glb` comes out byte for byte the same. Gimli's `build(cap=...)` makes what he wears on his head in place of the round cap, inside its `with bone('head'):`, and keeps the crown joint where the cap's point is; Éomer's `build(shield=...)` makes the shield after his arms; Treebeard's `build(branches=...)` makes the young branches after his lichen.
- **The 2★ script** imports the 1★ script with `importlib`, which a name with a hyphen, such as `witch-king`, needs; makes its piece with the 1★ module's materials (`M`, adding any of its own once the build has reset the scene); binds each part of it to the bone it moves with: a helm on `head`, shoulder plates on `spine` or the upper arms, a mantle on `spine`, a shield strapped to a forearm on that forearm (Éomer's on `forearm_l`), branches on the bone of what they grow out of; and finishes with the gear budget and the 1★ model's rig, `geared()`, which gives it a gear model's size limit (`rig.GEAR_BYTES`: 225,000 bytes on foot, 337,500 for a Large or mounted model, 12.5% more, as the triangles).

```python
# units/gimli-2.py, in short
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]  # the kit, and the 1★ script beside this one
from kit import GEAR_BUDGET, finish  # noqa: E402

gimli = importlib.import_module('gimli')  # the 1★ model; for a hyphen, importlib.import_module('witch-king')
M = gimli.M  # its materials, made as it builds


def war_cap():  # the piece, as main drew it, called inside the 1★'s `with bone('head'):`
    ...


def main():
    rig = gimli.build(cap=war_cap)  # the 1★ model with the piece on
    finish('gimli-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
```

- **The piece as main drew it,** on the 1★ body. Where the copy from before the rig moved a part of the 1★ model to carry its piece, keep the 1★ part, so the joints and the rig stay the same, and fit the piece to it: Éomer's shield is 4 cm further in than main had it, with the forearm that carries it. Where the piece leaves the hex, or is struck by what the hands carry, in the 1★ model's clips, change the piece, not the clips, and say why in its script: Treebeard's crown (his section below).
- **Checks.**
  - The build: no warnings, within the gear budget and the gear model's size limit.
  - The clips: compare them with the 1★ model's. They come out the same unless the piece changes what the styles measure: the parts on a hand and below it (`kept()`, `fit()`), the convex hulls of everything on `head` and on `spine` (`kept_between()`), and the lowest parts of the body as it goes to the ground (`grounded()`). A piece in a hand that reaches further may rightly change them. Gimli's, Éomer's and Treebeard's are the 1★ models' key for key.
  - `clash.py` with the piece on, against the 1★ model's report, with `--carried=forearm_l` for a shield strapped to that forearm, and judged from close renders; then contact sheets of the clips where the piece could show a problem, as a head lolls or tips back under a helm, an arm slumps with a shield, or the body bows under a crown.
  - The 1★ and 3★ models come out byte for byte as before (`pnpm models <id>` builds all three).
  - In `test/models.test.ts`, add the unit to `GEAR_MUST_BE_RIGGED`, which checks its gear model in full: one skinned mesh, its bones within the budget, the 1★ model's bones and clip lengths, the seven clips, `reach`, and the gear model's size limit.
- **Scale.** The client draws a 2★ model `max(1, min(1.1, 0.94 / reach))` times its size (`docs/viewer-spec.md` section 4, Star levels). A rigged model's `reach` is its clips', so a rigged gear model grows only as far as its clips leave room in the hex. Most come near its edge, so 28 of the 36 hardly grow: they reach 0.920 to 0.940 and are drawn 1.000 to 1.022 times their size. Gimli's reaches 0.9356 and is drawn 1.005 times, Éomer's 0.9398 and 1.000 times, and Treebeard's 0.9376 and 1.003 times. The other eight reach less, so they are drawn 1.1 times: Pippin's reaches 0.55, Gollum's 0.69, Frodo's 0.70, Bilbo's 0.73, Sam's 0.74, Galadriel's 0.76, Elrond's 0.83 and Gandalf's 0.84. Static, as they were before, each was measured as it stood: 25 were drawn about 1.1 times, and the 11 that reached further 1.02 to 1.08 times. Gimli's, Éomer's and Treebeard's reached 0.78, 0.91 and 0.85, and were drawn 1.1, 1.04 and 1.1 times. Whether a rigged gear model should grow more is the user's call (`docs/animation-plan.md`, Later).

| 2★ | Piece | Bound to | Triangles | `.glb` | Clips |
|---|---|---|---|---|---|
| Gimli | The war-cap from Edoras, in place of the round cap | `head` | 851 of 900 | 185,812 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds his fist on the war-cap's cheek plate as the axe is drawn back (up to 40 mm on frames 0 to 2, where the 1★ cap's band took 28) and as it comes back up (5 to 18 mm, frames 11.5 to 12.5), which close renders show as a graze |
| Éomer | A round shield of the Riders on his left arm, 4 cm further in than main had it, with the 1★ forearm | `forearm_l` | 1,267 of 1,350 | 272,496 of 337,500 bytes | the 1★ model's, key for key; `clash.py --carried=forearm_l` finds nothing new; the shield rests against the horse's shoulder as he slumps in `fall` |
| Treebeard | Young branches in leaf, swept back and drawn in (his section below) | `spine`; the shoots from his head `leaves` | 2,029 of 2,250 | 336,596 of 337,500 bytes | the 1★ model's, key for key; the crown stays in the hex and clear of the boulder and his hands |
| Frodo | Faramir's staff in his free left fist, on the 1★ arm out at his side: 0.75 long, its foot held 0.2 under the fist and clear of the ground, leaning a little out and back (main planted a metre-long staff upright, with the arm moved in; `frodo-2.py` says why) | `hand_l` | 872 of 900 | 193,460 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds the staff on his curls as he ducks in `cast` (up to 19 mm, frames 2.5 to 8.5, where his fist alone took 19 at 1★) and its shoe on his waistcoat then (up to 27 mm, frames 2 to 11), and the staff under him as he falls (up to 37 mm, frames 9.5 to 15), which close renders show as a graze, the staff rising behind his head, and the staff lying under him |
| Sam | The hood of his elven cloak drawn up over his 1★ curls, in place of the hood thrown back | `head` | 882 of 900 | 189,788 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds his sword hand at the hood's edge by his cheek as the sword is drawn back (up to 33 mm, frames 0 to 2, where his curls and cheek took 15 at 1★) and the guard on its side as it comes back up (6 to 8 mm, frames 11.5 to 12), which close renders show as a graze |
| Merry | The small round shield of Rohan in his guard fist, on the 1★ arm, turned out 30 degrees and tipped up 30 and held 1.5 cm above its middle (main: 18 and 6, held by its middle, on an arm set further out), so it comes to rest on the ground as he dies rather than 44 mm into it | `hand_l` | 884 of 900 | 192,040 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds the rim up to 16 mm into his belly as he slumps over the shield on the ground in `death` (frames 12 to 15), which close renders show hidden under him |
| Pippin | The barrow-blade in his left fist, with that arm's sleeve, on the 1★ arm's joints (which have no parts at 1★): the fist at the cloak's front edge, the blade up and out to his left as main drew it | the sleeve's upper half `upper_arm_l`; the cuff, the fist and the blade `forearm_l`, the wrist stiff, since the clips turn the empty 1★ hand upside down against his belly as he dies | 830 of 900 | 189,208 of 225,000 bytes | the 1★ model's, key for key; with `--carried=forearm_l`, `clash.py` finds the blade in nothing of his body or head, and the arm, as the 1★'s joints have it, inside the cloak against his belly (up to 30 mm as he runs, 45 mm dazed, and 86 mm as he dies, the fist hidden in his belly); the blade lies out at his side as he dies |
| Bilbo | Sting in place of the seax, along the seax's line in the 1★ fist, 0.30 from the guard to the point rather than main's 0.33, so it stays out of the ground as his sword hand droops in `stun` | `hand_r` | 760 of 900 | 181,500 of 225,000 bytes | the 1★ model's, key for key, what the hand holds (`hold()`) staying the seax's; `clash.py` finds nothing |
| Gollum | Sam's elven rope round his left ankle, trailing into a coil on the ground at his left, of nine points rather than main's ten, to keep to the budget | the turns and the rope where it leaves them `shin_l`; the rest of the rope `root`, so it stretches from his ankle to where it lies as his leg moves, and the coil stays where it lies | 900 of 900 | 184,588 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing, as at 1★ |
| Balin | The jewelled belt, a girdle of `trim` plates set with white gems in place of the plain belt and its studs, worn under his beard where main had it over the beard, without the clasp the beard would hide, and the beard as long as at 1★ (`balin-2.py` says why) | `hips` | 839 of 900 | 186,492 of 225,000 bytes | the 1★ model's, key for key; `clash.py` with `--targets=beard,hips` finds nothing new in his head, chest or beard, and his fists at the girdle where they were at the coat, as deep and half a frame longer |
| Dáin | The short broad sword, hung behind his left hip and slung back across his skirt below his shield, 6 cm shorter than main's, which hung at his side, its hilt under his elbow (`dain-2.py` says why) | `hips` | 869 of 900 | 187,232 of 225,000 bytes | the 1★ model's, key for key; `clash.py` with `--targets=beard,hips` finds nothing new; it clears his arms, legs and skirt in every frame and the ground by 3 cm, and its guard touches the rim of his shield in frames 8.5 to 9.5 of `move` |
| Aragorn | Steel spaulders, two lames on each shoulder edged in `trim`, as main drew them | `upper_arm_l`, `upper_arm_r` | 874 of 900 | 183,264 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing new, and with `--targets=upper_arm_l,upper_arm_r` his fist on the standard against the left one's lower lame (up to 34 mm into its hull), which close renders show resting on it; they turn with his arms, so the raised sword arm carries its spaulder up beside his head |
| Boromir | His helm, plain and high-crowned, on a brow band of `trim`, with a neck-guard over his hair, as main drew it | `head` | 862 of 900 | 186,772 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing, as at 1★; he ends his death 0.99 tall, the helm's top, where the 1★ ends 0.94 |
| Faramir | The long sword at his left hip, as long as main's, hung from further back and swept back 50 degrees from upright, its hilt ahead past his thigh, where main's was steeper (33 degrees), its hilt across his thigh and its chape 7 cm off the ground (`faramir-2.py` says why) | `hips` | 840 of 900 | 189,664 of 225,000 bytes | the 1★ model's, key for key; `clash.py` with `--targets=hips` finds nothing new in his head or chest; the hilt is grazed by his thigh in three frames of `move` and by his bow arm as it droops in six of `stun`, and the scabbard by his bow hand as it falls in frames 9.5 to 12 of `death`, which close renders show hidden behind the bow |
| Beregond | The long spear of the Guard in his shield hand, leaning back against his shoulder further than main had it, and its butt 10 cm nearer his fist (`beregond-2.py` says why) | `hand_l` | 847 of 900 | 186,276 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing new, where main's lean put the shaft through his helm's wing as he draws the shield in to bash, and main's butt went into the ground as he is dazed; he ends his death 1.46 tall, the spear held up, where the 1★ ends 1.19 |
| Legolas | The quiver of the Galadhrim in place of his own, as main drew it: longer and wider, in grey, with three bands and a rim of `trim` and a sheaf of nine arrows standing above his right shoulder. His arrows are still fetched from and put away where his own quiver's mouth and foot were, 8 cm down inside this one (`quiver_mouth` and `quiver_foot` kept, as Gimli's crown is) | `spine` | 714 of 900 | 177,080 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing new; close renders show his drawing hand fetching the fresh arrow from among the sheaf's fletchings |
| Haldir | A coil of hithlain over his right shoulder and across his body to his left hip, its turns bound with `trim`, laid on the 1★ body as main laid it (on its skirt and chest where main's lay on the tunic) | `spine`; where it lies on the back of his cloak, `cape`, so it lifts with the cloak as it streams behind him rather than sinking into it | 872 of 900 | 196,836 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing new in his head or his chest; with `--targets=spine,cape` it finds his drawing fist grazing the coil on his shoulder as it flies back (up to 11 mm, frames 2.5 to 5) and the dropped bow's string sweeping its foot as he falls (frames 10 to 11), which close renders show as a graze and the string falling in front of him |
| Elrond | A long sword of the Noldor at his left hip, on a belt across his chest, under the 1★ mantle rather than lifting its hem: the scabbard 0.67 long rather than main's 0.88 and 5 degrees less steep, its chape 0.3 above the ground, since main's went 12 cm into the ground as he kneels in `death` (`elrond-2.py`) | the sword `hips`; the belt `spine`, its end on the locket `hips` | 816 of 900 | 185,008 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing, nor with `--targets=hips` |
| Galadriel | The circlet of golden flowers, as main drew it: a band of the mallorn's gold about her brow, with leaves standing up round her head and flowers between them | `head` | 850 of 900 | 191,920 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing, as at 1★, with the circlet in her head |
| Gandalf | Glamdring drawn, in the 1★ left fist that rests on the hilt at his hip: point up, rising past his shoulder out to his left, as main's rose from a raised fist, and the scabbard left empty (main raised the arm; `gandalf-2.py` says why) | `hand_l`; the empty scabbard `hips` | 811 of 900 | 191,512 of 225,000 bytes | the 1★ model's, key for key; `clash.py` with `--targets=beard` finds the cross-guard 17 mm into his beard as he points the staff (frame 3, where his fist took 9 at 1★), and with `cloak --leave=team` its end up to 33 mm into the cloak as the cast begins (frames 0.5 to 2, where the fist took 14) and the blade 8 mm into it as he runs (frames 7.5 to 8), which close renders show as grazes; he holds the sword up before him as he bars the way in `cast` |
| Saruman | His cape as a mantle with a high collar, the collar's top and the cape's hem edged with `trim`, and his hair gathered inside it, the fall down his back left out (`build(collar=...)`). The collar rises from the cape 2.6 cm lower at the back than main's, round the 1★ hair at his nape, and stands 3 cm further back with its front edges where main had them: as main drew it, the back of his head went up to 15 mm through it as he tips it back in `cast`, `death` and `victory` (`saruman-2.py`) | `spine` | 845 of 900 | 192,800 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing, as at 1★; the staff drawn back over his shoulder in `attack` passes beside the collar |
| Radagast | A badger at his right heel, as main drew it | `root`, so it stands where it is as he moves, is dazed or falls, and goes where the viewer moves him | 898 of 900 | 210,632 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing new in his head or his chest; with `--targets=root` it finds his fist coming to rest on the badger's back as he dies (up to 7 mm, frames 12.5 to 15), which close renders show as his hand laid on it |
| Gorbag | An orc-helm of Minas Morgul in place of the scalp-lock, as main drew it: a cap of crude iron on a band of `trim`, with a beak-like nose-guard and the pale moon on its brow, the scalp-lock through its crown | `head` | 814 of 900 | 184,028 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds his bow by his nose as he nocks in `cast` (up to 16 mm, frames 4 to 10, where it took 8 mm on frame 8 at 1★), the nose-guard widening the head's hull, which close renders show clear of the helm, as at 1★; he ends his death 1.02 tall, the scalp-lock's tip, where the 1★ ends 0.98 |
| Grishnákh | A bandolier of knives over his left shoulder and under his right arm, over the cape, three sheathed knives across his back, as main drew it, laid on the 1★ breeches and jerkin where main's lay on his torso | `spine` | 829 of 900 | 175,212 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing new, and with `--targets=spine` his knife hand at the cape's side, as at 1★, clear of the strap |
| Uglúk | The war-horn at his right hip, on a baldric across his chest and back, as main drew them | the baldric `spine`, and from where it comes over his belt `hips` (`follows`); the horn `hips` | 852 of 900 | 181,068 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing, as at 1★, nor with `--targets=hips`: his sword keeps clear of the horn |
| Lurtz | The sword of the Uruk-hai, hung bare at his left hip, its blade 0.33 long rather than main's 0.4, so it stays out of the ground as he kneels in `death` (`lurtz-2.py` says why); the 1★ arrow, where main shortened its point | `hips` | 828 of 900 | 187,256 of 225,000 bytes | the 1★ model's, key for key, where main's blade went 4.9 cm into the ground (frame 13 of `death`) and `grounded()` would have stopped his fall there; `clash.py` finds nothing new, and with `--targets=hips` his bowstring on the blade as he drops his bow (up to 6 mm, frames 13 to 14.5), which close renders show as the bow lying against the sword |
| Gothmog | The long black cloak of a captain of Morgul, from his shoulders under the mantle to a ragged hem on the ground, round his back from behind his left side to behind his right, 15 to 165 degrees where main's wrapped from -14 to 194 (`gothmog-2.py` says why) | its top two rings `spine`, its flare and hem `root` (`follows`), so it stretches from his shoulders to where it falls | 790 of 900 | 171,896 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing new; main's wrap had his knees, his cleaver fist and the banner's pole through its sides and, on his hips, his feet through its back as he kneels, and in this one nothing he moves or holds goes through it in any clip |
| Sharku | A round black shield on his rein arm near the elbow, as main drew it on the 1★ arm | `forearm_l` | 1,177 of 1,350 | 264,856 of 337,500 bytes | the 1★ model's, key for key; `clash.py --carried=forearm_l` finds nothing new; with the warg's head, jaw, neck and body as `--targets`, its rim touches the warg's head as it tosses it (frames 0 to 0.5 of `attack`) and rests against its neck and head as they go down in `death` (frames 6 to 15), as his bracer does at 1★, which close renders show behind his arm and the warg's ruff |
| Sauron | Haute-pieces, iron plates standing up from his pauldrons round his neck, their rolled tops in `trim`, as main drew them | `spine` | 1,372 of 2,250 | 249,260 of 337,500 bytes | the 1★ model's, key for key; `clash.py` finds nothing new; his helm grazes the inside of their front ends by up to 4 mm as his head lolls in `stun` and as he ends his death, which close renders don't show |
| Éowyn | The fair corslet, as main drew it: a long bright hauberk to the middle of her calves, its hem bound in `trim`, in place of the kirtle (`build(corslet=...)`), its steel on the 1★ mail of her coat, chest and sleeves, and on her thighs too, which in the 1★'s green showed through the front of the long skirt as she strides and kneels (`eowyn-2.py`) | the skirt `hips`; the coat, chest, sleeves and thighs on their 1★ bones | 848 of 900 | 179,860 of 225,000 bytes | the 1★ model's, key for key; `clash.py` with `corslet` finds nothing new, her sword hand by her head as the chop comes over (frame 2), as at 1★; with `--targets=hips` her drooping sword by her hip in `stun` goes up to 34 mm into the hull of the longer skirt, where it took 30 at 1★ |
| Háma | The shoulder-guards of the King's guard, a broad steel plate flaring from under the mantle down each upper arm, its rolled edge in `trim`, as main drew them | `upper_arm_l`, `upper_arm_r` | 894 of 900 | 189,004 of 225,000 bytes | the 1★ model's, key for key; `clash.py` finds nothing, as at 1★; with `--targets=upper_arm_l,upper_arm_r` his spear fist at the right guard's front edge as built (35 mm into its hull, as main drew it) and the shaft beside it in every clip, and his shield fist by the left guard as he slumps in `death` (frames 6.5 to 15, 19 mm), which close renders show in front of the plates; they turn with his arms, so the raised spear arm carries its guard up beside his helm |
| Gamling | A long sword in a pale scabbard at his left hip, splayed down past the horse's flank and out behind his boot, as main drew it | `hips` | 1,261 of 1,350 | 289,968 of 337,500 bytes | the 1★ model's, key for key; `clash.py` finds nothing, as at 1★; with `--targets=hips` the horn against the hilt as he lets it down by his thigh in `stun` (up to 15 mm into the hull) and laid along the flank beside the scabbard as he falls (frames 11 to 15, up to 25 mm), which close renders show resting against it |
| Théoden | A king's long cloak in place of the 1★ cape, as main drew it: down his back, over the cantle and the croup, falling over the quarters, sweeping out under his sword arm, the tail out from under it (`build(cloak=...)`); made once he leans, as main made it, since it lies on the horse too, and the cape's bone stays | one sheet: its top two rows `cape`, so it streams from his shoulders as the cape does; the row at the saddle `hips`; the rows over the croup and the dags `mount_body`; it stretches between them | 1,229 of 1,350 | 276,636 of 337,500 bytes | the 1★ model's, key for key; `clash.py --carried=forearm_l` finds nothing new, nor with `--targets=cape,hips`; renders show it whole as it streams in the gallop and the charge, as the horse rears and as it falls |
| Ringwraith | A long sword of steel drawn in its left hand in place of the claw, rising beside the hood, leaning back over its shoulder where main's leaned forward and out (`ringwraith-2.py` says why); the 1★ knife, where main tipped it up for the static model's reach | `hand_l` | 654 of 900 | 169,340 of 225,000 bytes | the 1★ model's, key for key, where main's angle had `fit()` draw the arm in by up to 103 degrees in `cast` and turn it up by 175 in `death`; `clash.py` finds nothing, as at 1★; with `--targets=spine` its fist at the mantle as it rears back in `cast` (12 mm, frames 0.5 to 2, where the claw took 7) and the dropped blade behind the mantle's rags as it sinks (36 mm, frames 8 to 9), which close renders show falling behind it into the heap |
| Khamûl | A black lance in place of the sword, through the 1★ fist along the sword's line, its point where the sword's was and its butt 0.29 below the fist: 1.03 long where main's, on an arm moved out, was 1.4 (`khamul-2.py` says why) | `hand_r` | 1,150 of 1,350 | 255,532 of 337,500 bytes | the 1★ model's, what the hand holds (`hold()`) staying the sword's, but for rounding, at most 0.00004 degrees, on keys of the right arm in `attack`, `cast` and `move`, where `fit()` measures the lance's leaf-shaped head; main's length had `fit()` draw his arm in by up to 113 degrees, putting the shaft through his hood as the charge levels it and its butt through his hood in `stun`; `clash.py` finds nothing, as at 1★ |
| Witch-king | Pauldrons of steel over the mantle, a cop and two lames on each shoulder, the lower edged and closed in `trim`, as main drew them, laid over the 1★ mantle and upper sleeves | `upper_arm_l`, `upper_arm_r` | 1,326 of 1,350 | 275,152 of 337,500 bytes | the 1★ model's, key for key; `clash.py` finds nothing new; with `--targets=upper_arm_l,upper_arm_r` the mace's pommel at the front of the right pauldron as he lifts it back after the blow (frames 11 to 13 of `attack`, 16.5 to 19 of `cast`, up to 37 mm into its hull) and as he lets it down in `stun` (up to 14 mm), which close renders show as a graze |

## Units

Triangles, Budget and Rig are the 1★ model's; 2★ and 3★ are the triangles of the gear and book models. The book models are static, and so is a gear model unless its cell says it is rigged (Gear models above).

| Unit | People | Script | Triangles | Budget | Rig | 2★ | 3★ |
|---|---|---|---|---|---|---|---|
| Bilbo | Hobbit | `units/bilbo.py` | 749 | 800 | 17 bones, 7 clips | 760, rigged | 874 |
| Frodo | Hobbit | `units/frodo.py` | 754 | 800 | 17 bones, 7 clips | 872, rigged | 918 |
| Gollum | Hobbit | `units/gollum.py` | 798 | 800 | 16 bones, 7 clips | 900, rigged | 930 |
| Merry | Hobbit | `units/merry.py` | 790 | 800 | 17 bones, 7 clips | 884, rigged | 970 |
| Pippin | Hobbit | `units/pippin.py` | 746 | 800 | 17 bones, 7 clips | 830, rigged | 936 |
| Sam | Hobbit | `units/sam.py` | 799 | 800 | 16 bones, 7 clips | 882, rigged | 807 |
| Elrond | Elf | `units/elrond.py` | 692 | 800 | 17 bones, 7 clips | 816, rigged | 892 |
| Galadriel | Elf | `units/galadriel.py` | 725 | 800 | 17 bones, 7 clips | 850, rigged | 970 |
| Haldir | Elf | `units/haldir.py` | 758 | 800 | 19 bones, 7 clips | 872, rigged | 945 |
| Legolas | Elf | `units/legolas.py` | 686 | 800 | 18 bones, 7 clips | 714, rigged | 730 |
| Balin | Dwarf | `units/balin.py` | 799 | 800 | 17 bones, 7 clips | 839, rigged | 980 |
| Dáin | Dwarf | `units/dain.py` | 797 | 800 | 17 bones, 7 clips | 869, rigged | 868 |
| Gimli | Dwarf | `units/gimli.py` | 793 | 800 | 17 bones, 7 clips | 851, rigged | 857 |
| Aragorn | Gondor | `units/aragorn.py` | 746 | 800 | 17 bones, 7 clips | 874, rigged | 962 |
| Beregond | Gondor | `units/beregond.py` | 793 | 800 | 17 bones, 7 clips | 847, rigged | 886 |
| Boromir | Gondor | `units/boromir.py` | 784 | 800 | 17 bones, 7 clips | 862, rigged | 928 |
| Faramir | Gondor | `units/faramir.py` | 742 | 800 | 18 bones, 7 clips | 840, rigged | 788 |
| Éomer | Rohan | `units/eomer.py` | 1,173 | 1,200 | 33 bones, 7 clips | 1,267, rigged | 1,267 |
| Éowyn | Rohan | `units/eowyn.py` | 800 | 800 | 16 bones, 7 clips | 848, rigged | 805 |
| Gamling | Rohan | `units/gamling.py` | 1,191 | 1,200 | 35 bones, 7 clips | 1,261, rigged | 1,329 |
| Háma | Rohan | `units/hama.py` | 798 | 800 | 17 bones, 7 clips | 894, rigged | 938 |
| Théoden | Rohan | `units/theoden.py` | 1,193 | 1,200 | 35 bones, 7 clips | 1,229, rigged | 1,317 |
| Gandalf | Istari | `units/gandalf.py` | 791 | 800 | 18 bones, 7 clips | 811, rigged | 685 |
| Radagast | Istari | `units/radagast.py` | 800 | 800 | 18 bones, 7 clips | 898, rigged | 888 |
| Saruman | Istari | `units/saruman.py` | 785 | 800 | 18 bones, 7 clips | 845, rigged | 917 |
| Gorbag | Orc | `units/gorbag.py` | 744 | 800 | 18 bones, 7 clips | 814, rigged | 900 |
| Gothmog | Orc | `units/gothmog.py` | 742 | 800 | 16 bones, 7 clips | 790, rigged | 886 |
| Grishnákh | Orc | `units/grishnakh.py` | 671 | 800 | 16 bones, 7 clips | 829, rigged | 983 |
| Lurtz | Orc | `units/lurtz.py` | 772 | 800 | 18 bones, 7 clips | 828, rigged | 942 |
| Sharku | Orc | `units/sharku.py` | 1,141 | 1,200 | 33 bones, 7 clips | 1,177, rigged | 1,349 |
| Uglúk | Orc | `units/ugluk.py` | 760 | 800 | 16 bones, 7 clips | 852, rigged | 966 |
| Khamûl | Nazgûl | `units/khamul.py` | 1,144 | 1,200 | 32 bones, 7 clips | 1,150, rigged | 1,223 |
| Ringwraith | Nazgûl | `units/ringwraith.py` | 659 | 800 | 17 bones, 7 clips | 654, rigged | 732 |
| Witch-king | Nazgûl | `units/witch-king.py` | 1,194 | 1,200 | 32 bones, 7 clips | 1,326, rigged | 1,178 |
| Treebeard | Ent | `units/treebeard.py` | 1,731 | 2,000 | 19 bones, 7 clips | 2,029, rigged | 1,786 |
| Sauron | Dark Lord | `units/sauron.py` | 1,264 | 2,000 | 18 bones, 7 clips | 1,372, rigged | 1,628 |

## Building a model

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/units/gimli.py
```

This writes `packages/client/public/models/gimli.glb`. Add `-- <out.glb>` to write it somewhere else. `pnpm models` rebuilds every unit, and `pnpm models gimli frodo` only those, with their 2★ and 3★ models; the builds are reproducible, so rebuilding an unchanged script leaves its `.glb` as it was. `finish()` fails a model over its triangle budget, without a `team` material, with an image texture or with a material more metallic than 0.15. It warns when the model doesn't stand on the origin, reaches outside its hex or has no `trim` material.

A rigged model's build also prints its bones and clips, when each attack strikes and each cast is at its height, how tall it ends its death, the furthest from its centre and the lowest any frame reaches (`radius` and `base`), and the same between frames, and the size of its `.glb`. The export writes the furthest it reaches, on frames or between them, into the armature's glTF extras as `reach`, which the client scales a rigged 2★ or 3★ model by so its clips stay in the hex (`docs/viewer-spec.md` section 4, Star levels). `finish()` fails it if a joint isn't marked, a bone is misnamed or the bones are over the budget, a vertex doesn't follow exactly one bone, a clip is missing, extra, outside its length or doesn't loop where it should, the attack doesn't strike on frame 3 or the cast isn't at its height on frames 3 to 6, or the `.glb` is 200,000 bytes or more (300,000 for a Large or mounted model, whose `Rig` has `kind='large'` or `'mounted'`; 225,000 and 337,500 for a gear model, whose rig is `geared()`, Gear models above). It warns, naming the frames and the bone, when a frame of a clip reaches outside the hex or under the ground (by more than 0.0001, which is rounding), and when the death ends taller than four fifths of the model standing. It checks between frames too, as the client shows them (`docs/viewer-spec.md` section 5): three.js turns each bone the short way round from its turn on one frame to the next (`Rig.between()`), so a bone that turns far in one frame, as an arm does in a blow, swings what hangs from it round in an arc that can reach outside the hex where neither frame does. `finish()` poses each clip at quarter frames that way (`BETWEEN`) and warns, naming them (2.25, 2.5, ...), when one reaches outside the hex, or more than 0.01 under the ground (`BETWEEN_FLOOR`): a foot rolling on the ground dips a few millimetres between frames, which the board hides. With `both_hands()` (Dwarves below) it also warns, naming the frames, when the other hand can't reach the haft.

## Rigging

A rigged model is one mesh skinned to one armature, rigidly: every vertex follows one bone with weight 1, so the faceted parts move as solid pieces (`docs/viewer-spec.md` section 4, Rigs and clips). The rest pose is the model as built. Gimli (`units/gimli.py`) shows all of it.

- **Bones.** Every model has the 16 in `rig.BONES`, named for the model's own left (`_l`, +X) and right: `root` on the ground, `hips`, then `spine`, `head` and both arms above the hips, and both legs below them. A script adds its own with `Rig(bones={'cape': ('spine', 'cape_top', 'cape_hem')})`: the parent and the joints at the bone's head and tail. Gimli has 17: the 16 and his cape.
- **Joints.** `rig.joint(name, point)` marks a joint as the parts round it are built: `pelvis`, `waist` (where the spine bends), `neck`, `crown` (the top of the head), and for each side `shoulder`, `elbow`, `wrist`, `fist` (the end of the hand), `hip`, `knee`, `ankle` and `toe`. A mark is a point that `lean()`, `turn()` and `stoop()` carry with the parts, so make it where those parts are made and the bones sit where the joints end up. `finish()` reads the marks and removes them. Bend each elbow and knee a little in the rest pose, so the IK knows which way it bends.
- **Binding.** Make each part inside `with bone('hand_r'):`, which every helper in `kit.py` honours. A part that has to bend, such as a leg at the knee or a body at the waist, is two parts that overlap where they meet, so nothing stretches: Gimli's legs are a thigh and a shin, and his mail is a skirt on his hips and a chest on his spine that starts inside his belt. Weapons, shields and staffs follow the hand that holds them. A robe or long coat to the ground keeps its part below the knees on a bone of its own, hanging from `root`, which `robed()` moves (The Nazgûl below). For the rare vertex that should follow another bone, `bone(name, follows=...)` takes a function of the vertex's position giving that bone, such as the middle of a bowstring following the drawing hand.
- **Fittings.** A part in `trim` (Star levels above) rides the bone of what it is fixed to:
  - a buckle or belt stud rides `hips` with its belt;
  - a clasp, brooch or boss rides the cloth it pins: `spine` for a mantle or cloak, or a cape's own bone (Merry's brooches, Sauron's cape clasps);
  - a pauldron's rivets and rims ride `spine`, an armlet or bracer band the forearm, and a weapon's, staff's or bow's fittings the hand that holds it;
  - a hair clasp or clip rides the bone its hair rides (`head`, or `spine` for long hair down the back), and a beard clasp `beard`;
  - on a mount, the browband rides `mount_head`, a caparison's bosses `mount_body` and a rein ring `mount_neck`. A rider's stirrups ride `foot_*`, not the mount: the hips turn a few degrees against the saddle, so a stirrup on `mount_body` would cut through the boot.
- **Paying for fittings.** Where `trim` parts took a rigged model over its budget, it leaves out faces nobody sees, inside a garment that closes round them, rather than changing anything that shows (Balin, Gollum, Gandalf, Radagast and the Witch-king below). Gimli's axe socket stays open at its ends, as his rig left it, now in `trim`.
- **What the hands hold.** `rig.hold(hand, grip, tip, face)` says what a hand holds: from its grip to its business end, and the way its edge or front faces. Clips use it to aim the weapon, the shield or the staff.
- **The rig.** End with `finish(id, rig=Rig(clips={...}))`, picking a style from the clip library for each of the seven clips. `Rig(kind='large')` or `'mounted'` raises the bone budget from 24 to 32 or 40.

### Riders and mounts

A Rider and its mount are one model on one armature. The mount's builder binds its parts to bones of its own, named `mount_…` (`docs/viewer-spec.md` section 4 lists them), marks their joints and returns a `rig.Mount`, which the rider's `Rig` takes; the rider's hips then hang from the mount's body. Éomer (`units/eomer.py`) is the reference rider:

```python
mount = horse(COAT, POINTS, blaze=BLAZE, stripe=True, raised='left', turn=20, rigged=True)
...  # the rider, his parts bound to the 16 bones as on foot
finish('eomer', budget=MOUNTED_BUDGET, rig=Rig(kind='mounted', mount=mount.rig, bones={'cape': ...}, clips=CLIPS))
```

- **The horse.** `horse(..., rigged=True)` (`mounts.py`) binds the body, stripe, cloth and strap to `mount_body`, the neck and mane to `mount_neck`, the head with its bridle and forelock to `mount_head`, and the tail to `mount_tail`. It builds the legs standing, each in three parts on three bones (`jointed_leg()`): the upper leg to just past the knee or hock, the lower leg to just past the fetlock, and the pastern and hoof. Each part carries the unrigged leg's rings on along its bands to overlap the next, so the bands, and the triangles, are the same. A `raised` foreleg is a pose the clips give it (`Mount.raised`) rather than built. Without `rigged` the horse builds exactly as it always has, unbound, for riders not rigged yet. Sharku's warg (`warg()` in `units/sharku.py`) is built the same way, with a `mount_jaw` for its bite. Its legs bend the other way (`Mount.bends`): a warg's elbow back and stifle forward, a horse's knee forward and hock back.
- **The rider.** Its parts bind to the 16 bones as on foot. A leg built as one tube through the hip, knee and ankle splits at the knee ring it already has, and a body at a ring inside the belt, so neither costs triangles. Reins run from the bit (`mount_head`) past the neck (`mount_neck`) to the hand, `bone('mount_neck', follows=...)` putting each end on what holds it. A rider's own frame is its mount's body: its feet are placed there, and its hands' paths drawn in the model's frame (`hand_r_world`) go with the mount.
- **Clips.** The library's mounted styles move both, with `Steed` doing for the mount what `Body` does for a figure on foot: where each leg stands, its feet placed by IK on the ground (`foot()`, `planted()`, `held_up()`, `folded()`), its body turned about any point (`body()`) and how it stands (`stance()`). `seated()` is a mounted one-shot clip's first and last key. The rider sits, its hips in the saddle and its legs hanging as built, so they have no tracks, and a clip that doesn't move the mount's body leaves its standing legs unposed, so they have none either. That keeps a rider under 300,000 bytes: Éomer's `.glb` is 262,380 bytes and Sharku's 259,936, with 33 bones each, and the other riders' are 254,408 to 281,664 bytes, with 32 to 35 (The other Riders below).

| Clip | Mounted styles | Éomer | Sharku |
|---|---|---|---|
| `idle` | `saddle`: the mount breathing and shifting its weight, its head and tail stirring and a raised foreleg held up; the rider breathing and looking round | `saddle`, 2.0 s | `saddle`, 2.0 s |
| `move` | `gallop`: a stride a hex step, the hind feet striking and then the fore, at full stretch in the air a quarter of the way through (the leap a dash holds), the body rocking, the neck nodding and the tail streaming; `bound` brings each pair of feet down together, the body lower: a warg's lope | `gallop`, 0.53 s | `gallop`, `bound`, 0.53 s |
| `attack` | `spear`: a spear stabbed down beside the mount's shoulder; `cut`: a blade, axe or mace swung down on its own side, whose `across` and `early` turn it in across the front and further down as it comes over on frame 2, so a long blade passes level pointing ahead rather than out of the hex between frames (Fitting clips to what a model holds below); both land on frame 3 as the mount tosses its head; `trample`: for a rider whose hands hold no weapon, the mount half-rears, forefeet pawing, and strikes them down on the foe ahead on frame 3 | `spear`, 0.6 s | `cut`, across 40, early 15: over the top turned in across his front, then swept out and down past the warg's shoulder, 0.53 s |
| `cast` | `spear`: the mount rising and slamming down under a harder stab; `bite`: the mount lunging, its jaws snapping shut, its head turned to keep inside the hex; `charge`: gathered on its haunches, then springing out at full stretch and landing on its forefeet as the blade is levelled at the line, its flat up, at its height on frame 4 (`stretch` is how far it reaches, `out` how far to its side the blade points, and `wide` draws the blade out past a big hood); `leap`: sunk on its haunches, every hoof off the ground, then down with a crash as the weapon is slammed down past its shoulder (`spring`, `out`); `sound`: a horn put to the lips from the saddle as the mount half-rears, needing the joints `mouth` and `mouthpiece`, as `horn` does | `spear`, 0.7 s, at its height on frame 4 | `bite`, 0.7 s, on frame 4 |
| `stun` | `reel`: the mount's head hanging and swaying, a raised foot put down; the rider slumped, the weapon slack; `low` lets a weapon held up high down to hang slack by the thigh | `reel`, 1.2 s | `reel`, 1.2 s |
| `death` | `fall`: the mount's forelegs buckle, then its hind legs fold, until it lies on its belly with the rider slumped over its neck and the weapon laid along its flank; `mount_grounded()` keeps every frame out of the ground | `fall`, 0.5 s, ending 1.23 tall | `fall`, 0.5 s, ending 0.83 tall |
| `victory` | `rear`: the mount rears, forefeet pawing, and comes down to stand proud while the rider holds the weapon high; `rear` is how high, and `out` how far out from the shoulder the fist goes up, as `raise`'s: more to clear a big hood. It gathers on frame 4, is up on its hind legs from frame 12 to 17, comes down on 24 and stands on its last frame, 1.2 s by default; every rider takes it in 1.0 s (`seconds` 1.0), so it is standing by the time the fight's playback stops, 1 s after the end | `rear`, seconds 1.0, 1.0 s | `rear` at 0.6, seconds 1.0, 1.0 s |

### The other Riders

Gamling, Théoden, Khamûl and the Witch-king ride the shared horse as Éomer does: `horse(..., rigged=True)` with their own arguments, the rider's parts bound to the 16 bones. Khamûl and the Witch-king take the Ringwraith's look on it.

- **They bend at rings they had.**
  - The legs split at the knee ring into `thigh_*` and `shin_*`, as Éomer's `rider_legs()` do.
  - Gamling's and Théoden's bodies split at a ring inside the belt: the skirt and belt on `hips`, the chest on `spine`. The chest runs straight from its chest ring to the neck under the mantle, with no ring at the shoulders.
  - The Nazgûl's cloak, and the robe or hauberk in its opening, split at a ring inside the waist (`WAIST_INSIDE`): below it on `hips`, from it up on `spine`. The Witch-king's hauberk belt is a third band of the piece on `hips`, its buckle with it, and his cloak's chest leaves out the faces his mantle hides, all round but beside the opening (`UNDER_MANTLE`, 20 triangles), which pays for his fittings.
  - The pelvis is at the lean's pivot, and every torso and arm joint is marked before the lean.
  - None of it costs a triangle. The rigged horse saves the 4 of a raised hoof's cap.
- **The Nazgûl, as the Ringwraith.**
  - The hood is the head, with the Witch-king's crown on it. It turns at a `neck` inside the mantle's collar, up to a `crown` at the hood's peak.
  - The mantle and its rags ride `spine`, and the sleeves split at the elbow with a 0.03 overlap.
  - Their skirts, over the thighs and the horse's back, ride `hips`. Mounted clips give a rider's legs no tracks and turn the hips only a few degrees, so they need no `robed()`.
  - The Witch-king's thighs are only built for the skirts to clear and are then removed, so his `thigh_*` bones carry nothing and his boots ride `shin_*`.
- **Long beards and hair hang.** Gamling's and Théoden's beards and long hair hang from `head` on bones of their own: `beard`, from `beard_root` to `beard_tip`, and `hair`, from `hair_root` to `hair_tip`. Each is turned by `hanging()`: `hanging(hanging(fit({...})), bone='hair')`. On `head`, the hair swung up off the back by about 0.1 as the head bowed in `reel` and `fall`.
- **What the hands hold.**
  - Herugrim and Khamûl's sword go from the grip to the point, an edge out.
  - The Witch-king's mace goes from the grip to its spike, its front forward.
  - Gamling's horn goes from his fist to the bell, its front turned away from the mouthpiece. `mouthpiece` and `mouth` are marked for `sound`, the mouth just in front of his moustache so the mouthpiece doesn't sink into his face.
  - Théoden's shield is strapped to `forearm_l`.
  - The reins' bit ends follow `mount_head`. The other ends follow the rein hand (`hand_l`, Gamling's `hand_r`) or, for the Witch-king, the knot on `mount_body`. Gamling's star rides `mount_head`.
- **Kept in the hex.**
  - All four are `fit()`: a long blade carried tipped forward at the gallop, or levelled in the charge, reached past the hex, and `kept()` works for a rider.
  - With `between`, as Éomer and Sharku are `tweened()`: a blade's arc reached out of the hex between frames, and a hind hoof dipped up to 0.02 into the ground between frames 12 and 13 of `fall` as the legs folded, so the horse is lifted whole there by up to 0.015.
  - A head turned to the horse's right (Théoden's −28, the Witch-king's −30, Gamling's −18) swept across the front and out of the hex as `fall` curled it to the left. Those three fall with `roll` −1, which curls it further round to the right.
- **Clear of a big hood.** Khamûl's fist went into his hood when he drew back a blow. His `cut` has `out` 1.4 and his `charge` `wide` 0.15. Both Nazgûl hold their weapons up with `rear`'s `out` 0.35, as the Ringwraith raises his knife, and so does Gamling, whose horn's mouthpiece points in at his helm.
- **A charge or a leap is a cast with a dash.** Their dash comes on the same tick, and the action wins, so the cast plays as the dash carries the model: the mount is in the air for the dash's 4 ticks and lands at the cast's height.

| Clip | Gamling | Théoden | Khamûl | Witch-king |
|---|---|---|---|---|
| `idle` | `saddle`, led by the horn hand (`hand='l'` in every clip), 2.0 s | `saddle`, 2.0 s | `saddle`, breath 0.8, sway 0.6, 2.0 s | `saddle`, breath 0.8, sway 0.6, 2.0 s |
| `move` | `gallop`, 0.53 s | `gallop`, 0.53 s | `gallop`, 0.53 s | `gallop`, 0.53 s |
| `attack` | `trample`: half-reared, forefeet pawing, struck down on the foe on frame 3, the horn held up, 0.6 s | `cut`, 0.53 s | `cut`, out 1.4, across 40, early 15: over the top turned in across his front, then swept out and down past the horse's shoulder, 0.53 s | `cut`, the mace, 0.53 s |
| `cast` | `sound` (Horn of the Hornburg): the horn to his lips, his head thrown back, as the horse half-rears, at its height on frame 5 and held, 0.8 s | `charge` (Forth Eorlingas!): springing out at full stretch, landing on frame 4 as Herugrim is levelled at the line, then lifted high again, 0.7 s | `charge`, wide 0.15 (Shadow ride), 0.7 s | `leap` (Morgul mace): sunk on its haunches, every hoof off the ground on frames 1 to 3, crashing down on frame 4 as the mace is slammed down past its shoulder, 0.8 s |
| `stun` | `reel`, low 1: the horn let down by his thigh, 1.2 s | `reel`, low 1: Herugrim hanging down the flank, 1.2 s | `reel`, low 1, 1.2 s | `reel`, low 1, 1.2 s |
| `death` | `fall`, roll −1, 0.5 s, ending 1.05 tall | `fall`, roll −1, 0.5 s, ending 1.06 tall | `fall`, 0.5 s, ending 1.11 tall | `fall`, roll −1, 0.5 s, ending 1.17 tall |
| `victory` | `rear`, out 0.35, seconds 1.0: the horn held high, 1.0 s | `rear`, seconds 1.0, 1.0 s | `rear`, out 0.35, seconds 1.0, 1.0 s | `rear`, out 0.35, seconds 1.0, 1.0 s |

Their `.glb` files are 281,664 bytes (Gamling), 273,072 (Théoden), 254,408 (Khamûl) and 263,084 (the Witch-king).

### Hobbits

Frodo (`units/frodo.py`) is the Hobbits' reference rig. Sam, Merry, Pippin and Bilbo follow him. Gollum moves as a creature, not a Hobbit (Gollum below).

- **Bends, for no triangles.** The body is two lofts that meet at the belt: the breeches (Merry's jerkin skirt) and the belt on `hips`, and the waistcoat (Sam's shirt, Merry's jerkin) on `spine` from a ring inside the belt, so the bands are the ones the body had. A full sleeve is two tubes that overlap 0.02 past the elbow where it was one bent tube; Sam's rolled sleeve already overlaps his bare forearm. The bare shin starts 0.02 up inside the breeches' cuff, so the knee bends without a gap. Frodo's left knee is bent forward over his foot, so the IK bends it that way.
- **Bones.** Frodo and Merry have 17: the 16 and a `cape` from the back of the collar to the hem, which carries the hood thrown back. Sam has the 16: his short cloak, held to his back by the pack, rides `spine` with it. The neck is on `head`; the cowl and Merry's scarf are on `spine`.
- **What the hands hold.** Sting, Sam's sword and the barrow-blade go from the grip to the point, edge on the right. Sam's pan goes from its handle to its middle, its bottom to the enemy, as a shield.
- **One people, one way of moving.** Every Hobbit stands `ready` and runs `run` with `heavy` 0.25, `stride` 0.7 and `lift` 0.45: a light, quick run, longer in the stride and higher in the step than the library's for short legs. Big curls and round bellies need room: weapons go up and back `wide` of the curls (`swing`, `chop`, and `raise` with `out` 0.35) and follow through `ahead` of the belly.

| Clip | Frodo | Sam | Merry |
|---|---|---|---|
| `idle` | `ready`, 2.4 s | `ready`, 2.4 s | `ready`, 2.4 s |
| `move` | `run`, 0.5 s | `run`, the pan held up (`off='high'`), 0.5 s | `run`, 0.5 s |
| `attack` | `swing`, `wide` 0.2, `ahead` 0.35: Sting drawn back high and wide of his curls, across him on frame 3, followed through ahead of his belly, 0.53 s | `chop`, `wide` 0.3, `clear` 0.2: drawn back and brought over beside his curls, past them rather than through his face, down in front on frame 3, 0.6 s | as Frodo's, with the barrow-blade, 0.53 s |
| `cast` | `duck` (Slip away): down and aside into his cloak, curled over Sting, the free hand up behind his head and the cape swung round, lowest on frame 4, 0.7 s | `brace` (Loyal): the pan thrust up before his face, braced low behind it, the sword cocked, at its height on frame 4, 0.8 s | `lunge` (Barrow-blade), `reach` 0.8, `rise` 25, `wide` 0.5: drawn back wide by his hip, then driven home, furthest on frame 4, the long blade kept in the hex, 0.7 s |
| `stun` | `dazed`, 1.2 s | `dazed`, 1.2 s | `dazed`, `droop` 0.1, 1.2 s |
| `death` | `knees`, 0.5 s, ending 0.57 tall | `knees`, `lay` 0.34, 0.5 s, ending 0.69 tall at the top of his pack (his curls at 0.58) | `knees`, `dropped`: his empty guard hand falls by his knee, 0.5 s, ending 0.58 tall |
| `victory` | `raise`, `out` 0.35, 0.8 s | `raise`, `out` 0.35, 0.8 s | `raise`, `out` 0.35, 0.8 s |

Their `.glb` files are 181,432 (Frodo), 180,560 (Sam) and 181,884 bytes (Merry).

Pippin and Bilbo:
- **Bends.** Pippin's body bends at his belt, as Frodo's does. Bilbo's bends under his round belly: the breeches, the waistcoat's lower band and its points are on `hips`, and the rest of the waistcoat is on `spine` from a ring deep inside that band. Their sleeves are two tubes that overlap at the elbow. None of this costs triangles.
- **Bones.** Bilbo has 17: his `cape` carries Dwalin's hood down his back, and the short cape rides `spine`. Pippin has 17: the 16 and `stone` (A thrower of stones below). His left arm, under his cloak, has its joints but no parts. His right knee was moved 2.8 cm forward, in front of the line from hip to ankle, so the IK bends it forwards.
- **What the hands hold.** Bilbo's knife goes from the grip to the point, its edge turned in.

| Clip | Pippin | Bilbo |
|---|---|---|
| `idle` | `ready`, 2.4 s | `ready`, 2.4 s |
| `move` | `run`, the stone kept cocked by his head (`carry='steady'`), 0.5 s | `run`, his riddling hand kept up by his head (`off='steady'`), 0.5 s |
| `attack` | `pelt`: cocked further back on frame 0, over the shoulder wide of his curls on 2, let go on 3 with the arm out ahead; then down to the pouch on 11 for the next stone, cocked again by 20, 0.67 s | `thrust`, `wide` 0.45, `out` 20: drawn back wide of his belly, stabbed on frame 3, 0.53 s |
| `cast` | `skim` (Stone toss): crouched and turned with the hand low by his hip, whipped round level and let go on frame 4, its height; to the pouch on 15, cocked again by 24, 0.8 s | `riddle` (Riddles in the Dark): his finger raised higher, then held up before his face as he lunges and stabs under it, furthest on frame 4, the knife drawn back out by his hip, 0.7 s |
| `stun` | `dazed`, `low` 0.6, 1.2 s | `dazed`, `off_low` 1: the raised hand hangs by his hip, 1.2 s |
| `death` | `knees`, 0.5 s, ending 0.57 tall | `knees`, `dropped`, `slump` 0.75, 0.5 s, ending 0.63 tall |
| `victory` | `raise`, `out` 0.35, 0.8 s | `raise`, `out` 0.35, 0.8 s |

Their `.glb` files are 179,652 bytes (Pippin) and 180,596 (Bilbo).

#### A thrower of stones

Pippin throws stones rather than shooting, from a hand he holds cocked by his head. The stone is on a bone of its own, `stone`, which hangs from `hand_r` from the stone's middle (`stone_mid`) up (`stone_top`). The joint `pouch` marks where a stone waits inside the pouch at his hip, which rides `hips`. `Stone` (clips.py) puts the stone in the pouch from the frame it is let go until the hand comes down to the pouch, and then back in the fingers. The stone in the pouch stands in for the one the viewer flies, as a loosed arrow goes into the quiver. `Stone.dip()` brings the hand down into the pouch from outside it, pointing down and in, clear of the belly. `stone_throw()` draws the hand's path for both his throws, then fetches the next stone: out past the front of the hip, into the pouch, and up by the shoulder to be cocked again.

#### Gollum

Gollum (`units/gollum.py`) is a Hobbit but no runner. He crouches on bent legs like a frog, his left hand flat on the ground and his right lifted and clawed. He has the 16 bones and styles of his own, which keep that hand (`paw`) down in the model's own frame (`pinned()`) or set it pawing.
- **Bends.** His arms and legs, each one bent tube, are two pieces. The upper piece closes in a bony point just past the elbow or knee, and the lower starts 0.02 inside it, because his limbs fold too far for open tube ends to stay hidden. The four points cost 24 triangles. His body bends at the thin waist: the seat is on `hips`, and the ribs are on `spine` from a ring inside the waist. They stop at his shoulders, under the rag, which saves 16 triangles to make room for his fittings. The rag and its knot ride `spine`, and the loincloth and its flaps ride `hips`. The head and his long neck turn where the neck leaves his shoulders.
- **The ground.** The loincloth's front flap hangs nearly to the ground on `hips`, so every clip that moves his hips is `grounded()`. In the stun, the claw is kept off the ground by measuring its own parts.
- **`paw_down(clips, paw='l', held=...)`** keeps the paw flat on the ground, and the body out of it, in a library style (his `raise`).

| Clip | Gollum |
|---|---|
| `idle` | `lurk`, 2.4 s: six quick shallow breaths, a slow rock, the head darting 8 degrees one way and then the other, twice a loop, the claw flexing |
| `move` | `scuttle`, 0.5 s: `run()`'s legs low and short (heavy 0.2, stride 0.32, lift 0.09, lean 6). Each foot keeps 0.3 of the roll (`flat`), so his long feet don't lift the leg high, and the frog knees turn out towards level (`splay` 0.7). The left hand paws along like a third foot, down with the right foot, and the claw is held up |
| `attack` | `rake`, 0.53 s: the claw up beside his head and his body reared back on frame 0, raked down in front on 3 as he lunges after it, held to 9 |
| `cast` | `bites` (My precious), 0.8 s: gathered on frame 0, then his head thrust out and snapping down on 4 (its height), 9 and 14, the claw clutching the foe in between |
| `stun` | `cowed`, 1.2 s: `dazed()`'s body on all fours, the claw sunk and swaying |
| `death` | `sprawl`, 0.5 s: reared back with the claw flung up on frame 3, then flat on his belly, arms splayed and legs sprawled behind; ends 0.43 tall |
| `victory` | `raise`, `out` 0.5, with `paw_down()`: the claw thrust up high, the other hand still down, 0.8 s |

His `.glb` is 175,096 bytes.

### Dwarves

Balin and Dáin follow Gimli: his `ready` idle, his heavy `run` and his `knees` death, with the legs split at the knee and the coat or hauberk split at the belt. Three things are their own.

- **A long beard** is in two parts. The top is on `head`; the rest is on a bone of the script's own, `beard`, which hangs from the chin: `Rig(bones={'beard': ('head', 'beard_root', 'beard_tip')})`. `hanging(clips)` turns it in every frame to take back most of the head's nod and tilt (`share`, 0.8), so the beard hangs down the chest as the head nods, looks up or lolls. It still turns as the head turns from side to side. Where it would go under the ground as the body slumps, it rests on the ground instead. Balin's lower beard starts with a band tucked under the top, so no seam opens; Dáin's forks hang from his chin.
- **A standard.** Balin carries his as Aragorn does, with `fit(pole='l')`. `free=('cast',)` leaves it to his cast, `plant`.
- **A weapon in both hands.** Dáin's mattock is bound to the hand low on the haft, which `hold()` describes from its grip up to the head. `both_hands(fit(clips))` keeps the other hand on the haft in `idle`, `move`, `attack` and `cast`. The hand slides along the haft from where it holds it at rest as far as it must to reach (`Haft.on()`), and lets go in `stun`, `death` and `victory`. Its blows, `smite` and `slam`, key the middle of the two hands and the way the haft points (`haft_blow()`), keeping the hands before the chest. From fist to head, the haft is about as long as the hex's radius, so the blows come down in an arc on the other hand's side, where they also show past the body from behind.
- **Blows before a long beard.** Dáin's arms are short for his long beard and his big helm: his hands can't meet on the haft before his beard, and bending over a blow brings his helm down onto them. So his `smite` and `slam` take `beard` (`beard_smite()`, `beard_slam()`): his right hand stays beside his beard and his left past it, as far up the haft as he holds it standing, and the haft is heaved up on his left, past his face rather than over his head, then brought down across his front, in front of his beard, landing low at his front-left (on the ground in the slam). He leans in only a little, looking down at the blow, with his hips held back so his beard stays behind the haft. Nothing his hands carry goes into his helm or his beard, but for the last frames as the haft settles back where it rests, 14 mm into his beard as built (Checking clashes below).
- **Bending without gaps.** A piece that tucks into the next goes in deep enough to stay there as the body bends. Balin's chest starts deep inside his belt, and his mantle's neck runs well up inside his hood. To pay for his fittings, his chest stops at his shoulders inside the closed mantle (16 triangles), his brows are open at the back (8) and his hood has no throat behind his face (4). Dáin's `waist` is marked at the back of his body, so his spine bends about the back of his waist and his hauberk stays closed under his shield as he slumps. Dáin's sleeves are closed past the elbow, so their hollow doesn't show as his elbows fold to the haft.

| Clip | Balin | Dáin |
|---|---|---|
| `idle` | `ready`, 2.4 s, the standard planted | `ready`, 2.4 s, both hands on the haft |
| `move` | `run`, heavy, 0.5 s, the standard carried | `run`, heavy, 0.5 s, the mattock carried across in both hands |
| `attack` | `chop`, 0.6 s | `smite`, beard, 0.6 s, heaved up on his left and brought down across his front, landing low at his front-left |
| `cast` | `plant`, rise 0.26, 0.8 s, at its height on frame 4 | `slam`, beard, 0.8 s, heaved higher as he rises, at its height on frame 4 with its head on the ground at his front-left |
| `stun` | `dazed`, 1.2 s | `dazed`, low 1, 1.2 s, the left hand let go and the mattock let down to hang by his hip, clear of his hauberk |
| `death` | `knees`, 0.5 s, the standard toppling, ending 1.13 tall | `knees`, dropped, 0.5 s, ending 0.88 tall |
| `victory` | `raise`, 0.8 s, the standard lifted | `raise`, out 0.45, lean 20, 0.8 s, the haft's butt clear of his helm |

### Gondor

Aragorn is Gondor's reference rig, and Boromir, Faramir and Beregond share his idle and run. Each has a `cape` bone except Faramir, whose hooded cloak is on his spine and who has `string` and `arrow` instead. Their boots, legs, arms and surcoats bend at rings they already had, so the rigs cost no triangles.

| Clip | Aragorn | Boromir | Faramir | Beregond |
|---|---|---|---|---|
| `idle` | `ready`, 2.4 s, the standard planted | `ready`, 2.4 s | `ready` (bow hand), 2.4 s, drawn | `ready`, 2.4 s |
| `move` | `run`, heavy 0.3, lean 10, 0.5 s, the standard carried | the same, the horn held up (`off`) | the same, drawn (`steady`) | the same, the shield held up (`off`) |
| `attack` | `chop`, steep 22, out 40, elbow 0.75, early 15, slow 1: the elbow leading the sword forward and down on frame 2, lifted back a frame later, 0.6 s | `swing`, ahead 0.25, 0.53 s | `shot`, drawn, 0.6 s | `thrust`, guard, out 25, 0.53 s |
| `cast` | `rally`, steep 22, out 40, lead 1, elbow 0.25: the sword already turned down and out on frame 3, the elbow leading it, so it turns less in the frame it comes down in, 0.8 s, frame 4 | `horn`, 0.8 s, frame 5 | `shot`, 0.8 s, loosed on frame 6 | `bash`, 0.7 s, frame 4 |
| `stun` | `dazed`, low 1, 1.2 s | `dazed`, off_low 1, 1.2 s | `dazed` (bow hand), low 0.6, off_ahead 0.3, 1.2 s, the drawing hand let down before his chest, the arrow pointing down past the bow | `dazed`, 1.2 s |
| `death` | `knees`, 0.5 s, ending 1.37 tall (the standard) | `knees`, dropped, 0.5 s, ending 0.94 tall | `knees` (bow hand), dropped, fall (0, 0.15, −0.25): the bow arm sagging back as the knees give, 0.5 s, ending 1.19 tall | `knees`, slump 0.7, 0.5 s, ending 1.19 tall |
| `victory` | `raise`, 0.8 s, the standard lifted | `raise`, 0.8 s | `aloft`, clench (0.06, −0.12, −0.4), 0.8 s | `raise`, out 0.3, 0.8 s |

Their `.glb` files are 171,200 bytes (Aragorn), 179,072 (Boromir), 179,640 (Faramir) and 180,748 (Beregond).

### An archer at the draw

Every bow archer in the roster is built at the draw, so `shot` with `drawn` is theirs. `shot` without it draws from a rest pose they don't have. Faramir (`units/faramir.py`) is the reference.

A rigid bow can't let its string down, so two bones of the model's own do it, both hanging from the bow hand:
- `string`, from the nock (`nock`) to where the string's middle rests let down (`loose`), on the straight line between the bow's tips. The string's two halves are bound to the bow hand, with their ends at the nock following it: `bone('hand_l', follows=lambda p: 'string' if (p - NOCK).length < 0.02 else None)`.
- `arrow`: the nocked arrow, from the nock to its point (`arrow_point`).

The script also needs:
- `hold('l', grip, top, grip + aim)`: the bow from its grip to its upper end, facing where it shoots, with the drawing fist at the nock.
- The joints `quiver_mouth` and `quiver_foot` for the quiver a fresh arrow comes from.
- `Rig(bones={'string': ('hand_l', 'nock', 'loose'), 'arrow': ('hand_l', 'nock', 'arrow_point')}, clips=fit({...}, bow='l'))`. `fit(bow=...)` keeps the drawing hand on the string in `idle` and `move`. In `stun`, `death` and `victory` it lets the string down over the first frames; the arrow stays in the drawing hand's fingers, and in a death falls with the bow.

The clips:
- The shot (`('shot', {'drawn': True})`):
  - It is drawn a little deeper on frames 0 to 2 and loosed on frame 3. The string snaps straight, the bow kicks and the drawing hand flies back past the ear.
  - The loosed arrow goes into the quiver, standing in for the one the viewer flies.
  - The hand then reaches back over the shoulder for a fresh arrow and swings it up and out past the head. It is nocked on frame 14 and drawn again.
- The cast `shot` raises the bow `rise` degrees, 14, and looses on its height frame, 6, with a harder kick (`recoil`).
- `aloft` holds the bow up at arm's length, upright on its string's line. Its face is out to its side, so its curve shows from behind and the string clears the head (`out`, `height`, `lean`).
- For a stun, `dazed` with the bow hand and `low` (0.6) lowers the bow. The string is let down and the arrow stays in the drawing hand's fingers, so a drawing hand at the cheek takes `off_ahead` (0.3): it comes down off the string, out before the chest, and turns the arrow down past the bow (`let_down()`), where sagging by the body would take it into the chest and the arrow, still pointing where it was drawn, out of the hex.
- For a death, use `knees` with the bow hand and `dropped`. The bow's top falls forward as the knees give; `fall` ((0, 0.15, −0.25) for Faramir) sags the bow arm back and down then, so it stays in the hex between frames.
- The drawn shot, and the cast `shot`, take three more options:
  - `deeper` (0.1) is how far past its draw the string is pulled before the loose, as a share of its travel. About 1 draws an archer built half drawn fully, as Legolas is.
  - `quiver='hip'` fetches the arrow from a quiver at the drawing hand's hip, which rides on `hips` (Haldir); the arrow comes up out of it point first.
  - `anchor='chin'` is for an archer that draws to under its chin, ahead of its face (Legolas), where flying back past the ear would go through the face. The hand flies out past the front of its shoulder, goes up beside the head well clear of it, and brings the arrow down in front of the shoulder to the string.
- `flurry` is a cast of arrows loosed as fast as they can be nocked: `shots` of them, `every` few frames from its height. The hand snaps to `snap` at each loose and is back on the string with a fresh arrow the next frame; each loosed arrow goes into the quiver. `sweep` turns the body across them for a volley.
- `aloft`'s `clench` is where the drawing hand goes as the bow goes up: down to the chest by default, out in front for a chest turned under the hand.
- `point` and `gather` are for a bow drawn close before the face (Gorbag). As the fresh arrow is nocked, the bow tips forward `point` degrees about the nock, its arrow pointing at the ground. It comes in only a share `gather` of the way its slack string would bring it, so its upper limb and the arrow keep clear of the face. `flurry` takes `point` too.

### The Nazgûl

The Ringwraith (`units/ringwraith.py`) is the Nazgûl's reference rig. Khamûl and the Witch-king follow its look on their horses.

- **The hood is the head.** The faceless hood, its dark and the eyes are on `head`. It turns at `neck`, inside the mantle's collar, up to `crown` at the hood's peak. The ragged mantle (team) is on `spine`.
- **A robe to the ground, in three pieces.** The black cloak and the grey robe in its opening split at rings they had, each piece reaching inside the next:
  - the chest on `spine`, from a ring inside the waist;
  - the skirt on `hips`, down to a ring 0.1 below the knees, inside the lower robe;
  - the robe below the knees, with its ragged hem, on a bone of the script's own, `robe`, which hangs from `root`: `Rig(bones={'robe': ('root', 'robe_top', 'robe_foot')})`.

  `robed(clips)` (clips.py) moves the lower robe in every frame:
  - it goes where the hips take it and turns as they turn about the upright;
  - it takes back 0.8 of their pitch and tilt (`share`), so it hangs upright;
  - it twists after the knees (`sway`, 0.4), and its hem lifts on the side of the knee that comes forward (`kick`, 0.25), so the stride shows through it;
  - it rests on the ground wherever the hips would take it under.

  Because it hangs from the root it is not part of the trunk, so `grounded()` lets the hips sink into it, and the death goes down into its own robes. The extra rings cost 52 triangles.
- **Boots under the hem.** The legs are hidden. A pair of dark boots (on the foot bones, with a short leg on each shin) shows under the grey robe as it runs; the robe's hem is raised to 0.1 for them. They cost 40 triangles.
- **Sleeves** bend at the elbow: the upper sleeve runs on 0.03 past it and the lower starts 0.03 above it, at rings the sleeve had, so they cost nothing.
- **What the hands hold.** The Morgul-knife goes from the grip to the point, an edge up and out. The claw holds nothing.
- **Fittings.** The belt and its buckle ride `hips`, over the top of the skirt, where the chest comes out of it; the throat clasp and the shoulder bosses ride `spine`.

| Clip | Ringwraith |
|---|---|
| `idle` | `ready`, breath 0.8, sway 0.6, 2.4 s |
| `move` | `run`, heavy 0.3, stride 0.6, lift 0.18, lean 16, the claw held up (`off='high'`), 0.5 s: hunched, the hood thrust ahead, the hem swinging and the boots striding under it |
| `attack` | `thrust`, out 20, wide 0.3: the knife drawn back wide of the robe, then stabbed out to its right, 0.53 s |
| `cast` | `grasp` (Black Breath): reared back with the claw drawn back by the shoulder, then thrust out at the enemy's face with the hood after it, furthest on frame 4, held clutching, 0.7 s |
| `stun` | `dazed`, 1.2 s |
| `death` | `knees`, dropped: it sinks into its own robes, the hood bowed over the heap, the knife laid in front, 0.5 s, ending 0.95 tall |
| `victory` | `raise`, out 0.35: the knife held high, clear of the hood, 0.8 s |

Its `.glb` is 167,764 bytes.

### Rohan on foot

Éowyn and Háma follow Éomer, Rohan's reference rider, in look. They move as Men do, with Aragorn's `ready` idle and run (heavy 0.3, lean 10), and hold the shield up as they run (`off='high'`), as Beregond does. Their boots bend at the ring round the ankle and their mail at the belt, at rings they already had.

- **Éowyn** (`units/eowyn.py`), 16 bones:
  - Her thighs, which the kirtle hid, are added as green hose from the hip down into the boot, so a stride or a kneel shows legs (24 triangles).
  - Her hair, side locks and short cloak ride her spine, so her head turns within her hair.
  - The sword goes from the grip to the point, an edge out. The shield goes from the grip behind the boss up to the rim, facing the front.
- **Háma** (`units/hama.py`), 17 bones with a `cape`:
  - His knee is at the top of his boot's cuff, where his leg already went into it, so his rig costs no triangles. His chest runs straight from its chest ring to the neck under the mantle, with no ring at the shoulders.
  - His hair and braids ride his spine.
  - His spear is a pole planted beside him, as Aragorn's standard is: `fit(pole='r', free=('attack', 'victory'))`.
  - A spear 1.93 long held by its middle can't be thrust level in a hex 1.88 across. `thrust`'s `rise` (55) points it up over the shield, `out` (35) turns it to his right so the blow shows from in front and from behind, and `wide` (0.15) draws the wind-up clear of his chest.

| Clip | Éowyn | Háma |
|---|---|---|
| `idle` | `ready`, 2.4 s | `ready`, 2.4 s, the spear planted |
| `move` | `run`, heavy 0.3, lean 10, the shield up, 0.5 s | the same, the spear carried |
| `attack` | `chop`, wide 0.2, steep 10, out 25, elbow 0.75, early 15, slow 1: from high over her shoulder, clear of her hair, her elbow leading the sword down and out to her right, 0.6 s | `thrust`, guard, rise 55, out 35, wide 0.15, 0.53 s |
| `cast` | `riposte` (Shieldmaiden): the shield up before her face, then swept aside as the sword is driven past it and up, furthest on frame 5, 0.8 s | `brace` (Doorward): the shield thrust up before his face, braced low behind it, the spear planted, at its height on frame 4, 0.8 s |
| `stun` | `dazed`, low 1: the raised sword drooping to her hip, 1.2 s | `dazed`, 1.2 s |
| `death` | `knees`, slump 0.8, the shield upright before her, 0.5 s, ending 1.02 tall | `knees`, slump 0.6, slumping less over his big shield, the spear toppling, 0.5 s, ending 1.29 tall (the spear) |
| `victory` | `raise`, out 0.3, 0.8 s | `raise`, out 0.3: the spear held high, 0.8 s |

Their `.glb` files are 175,336 bytes (Éowyn) and 179,952 (Háma).

### Elves

Legolas (`units/legolas.py`) is the Elves' reference rig. Haldir, Elrond and Galadriel follow his idle and run.

- **One people, one way of moving.** Every Elf stands `ready` with `breath` 0.8, `sway` 0.7 and `crouch` 0.02, a calm, upright stance. Every Elf runs `run` with `heavy` 0.1, `stride` 0.42, `lift` 0.32 and `lean` 6: a light, upright run with long strides, unlike the Dwarves'.
- **Bends, for no triangles.** Legolas's and Haldir's tunics are a skirt and belt (Haldir's sash) on `hips`, and a chest on `spine` from a ring inside the belt. Their legs and arms were already overlapping tubes. Long hair lies on `spine` with its top ring following `head` (`bone('spine', follows=...)`), so it stretches between them as the head turns.
- **Bones.** Legolas has 18: the 16, `string` and `arrow`. Haldir has 19, adding a `cape` for his long cloak, which streams behind him as he runs. Elrond and Galadriel have 17: the 16 and `robe`.
- **Archers** (An archer at the draw above).
  - Legolas stands half drawn and anchors under his chin. His shot draws fully first (`deeper` 1.0), and with `anchor='chin'` his drawing hand flies out past his shoulder and fetches the next arrow well clear of his head. His cast, Flurry, is `flurry`: five arrows.
  - Haldir's quiver hangs at his right hip, on `hips` (`quiver='hip'`). His cast, Lórien volley, is `flurry` with three shots, `every` 4 frames, turning 24 degrees across them (`sweep`).
  - Haldir's chest is turned under his drawing hand. Winning, he clenches it out in front (`aloft`'s `clench`); dazed, it hangs at his side (`dazed`'s `off_low` 0.6). His fist rests against the corner of his jaw, not in it.
  - Legolas's drawing hand rests across his chest. Falling, he kneels on his bow, held upright in his left hand, and reaches to the ground with his right (`knees` with `hand='r'`), rather than dropping the bow.
- **Robes to the ground.** Elrond's robe and Galadriel's gown are built as the Ringwraith's robe is (The Nazgûl above), and move with `robed()`:
  - the chest (bodice) is on `spine`, from a ring inside the girdle;
  - the skirt and girdle are on `hips`, reaching down inside the robe below the knees;
  - the robe below the knees, with Galadriel's train, is on `robe`, hanging from `root`.
  - Their legs are hidden, with only the joints marked. Their shoes (Galadriel's slippers) are on `foot_l` and `foot_r`, their toes showing under the hem as they stride.
- **Sorcerers.**
  - Elrond's open hand is described with `hold()` from the wrist to the fingertips, the palm as its face; Galadriel's star-glass from the fist to the top of its light. So `bolt` thrusts them at the foe.
  - Elrond's staff is a pole (`fit(pole='l', free=('cast',))`): planted, carried, falling across the hex and lifted. His cast, Healer of Rivendell, is `plant`: the staff heaved up and struck down as his hand goes up.
  - Galadriel's cast, Light of the Eldar, is `beacon`.

| Clip | Legolas | Haldir | Elrond | Galadriel |
|---|---|---|---|---|
| `idle` | `ready` (bow hand), 2.4 s, drawn | `ready` (bow hand), 2.4 s, drawn | `ready`, 2.4 s, the staff planted | `ready`, 2.4 s |
| `move` | `run`, Elves', drawn (`steady`), 0.5 s | the same, the cloak streaming | `run`, Elves', the hand up, the staff carried, 0.5 s | `run`, Elves', the light up, 0.5 s |
| `attack` | `shot`, drawn, `deeper` 1.0, `anchor='chin'`, 0.6 s: drawn fully on frames 1-2, loosed on 3, nocked on 14 | `shot`, drawn, `quiver='hip'`, 0.6 s: loosed on 3, nocked on 14 | `bolt`, 0.6 s, the palm out on frame 3 | `bolt`, 0.6 s, the light out on frame 3 |
| `cast` | `flurry`, `snap` (0.14, -0.02, 0.02), 0.8 s: loosed on frames 3, 6, 9, 12 and 15 | `flurry`, 3 shots `every` 4, `sweep` 24, `deeper` 0.1, `snap` (0.05, -0.16, 0), 0.8 s: loosed on 3, 7 and 11 | `plant`, 0.8 s, frame 4 | `beacon`, 0.8 s, frame 5 |
| `stun` | `dazed` (bow hand), `low` 0.6, 1.2 s | `dazed` (bow hand), `low` 0.6, `off_low` 0.6, 1.2 s | `dazed`, `low` 0.5, 1.2 s | `dazed`, `low` 0.6, 1.2 s |
| `death` | `knees`, `hand='r'`, 0.5 s, kneeling on his bow, ending 1.27 tall | `knees` (bow hand), dropped, 0.5 s, ending 1.12 tall | `knees`, 0.5 s, the staff falling, ending 1.27 tall | `knees`, dropped, 0.5 s, ending 1.04 tall |
| `victory` | `aloft`, 0.8 s | `aloft`, `clench` (0.35, -0.1, -0.3), 0.8 s | `raise`, `out` 0.2, 0.8 s, the staff lifted | `raise`, `out` 0.2, 0.8 s |

Their `.glb` files are 173,360 bytes (Legolas), 185,004 (Haldir), 171,872 (Elrond) and 174,224 (Galadriel).

### The Istari

Gandalf (`units/gandalf.py`) is the Istari's reference rig. Saruman and Radagast share his idle, his run and his styles, so the three wizards move alike.

- **One people, one way of moving.** Every wizard stands `ready` with `breath` 0.8, `sway` 0.7 and `crouch` 0.02: an old man's slow breath over his staff. Every wizard runs `run` with `heavy` 0.2, `stride` 0.4, `lift` 0.2, `lean` 8 and `off='steady'`: a short, low run under the robe, the other hand kept where it rests.
- **A staff stood beside him.** Each staff is a pole that `hold()` describes from the grip up to the top of its light, stone or leaves, facing the front: `fit(..., pole='r', free=('attack', 'cast', 'victory'), ahead=1.0)`.
  - It is planted as he stands and as he is dazed, leaning on it, and carried upright as he runs.
  - As he falls it topples straight ahead of him (`ahead` 1.0) across the hex.
  - His attack, cast and victory move it themselves.
  - Radagast holds his in his left hand: `pole='l'`, and every style with `hand='l'`.
- **Robes to the ground** are built as the Ringwraith's are, and move with `robed()`:
  - the chest on `spine`, from a ring inside the belt (Saruman's girdle, Radagast's sash);
  - the skirt and the belt on `hips`, reaching down inside the robe below the knees;
  - the robe below the knees, with Radagast's ragged hem, on `robe`, which hangs from `root`.

  Gandalf's grey cloak to the ground is split the same way, in three pieces on `spine`, `hips` and `robe`. Their legs are hidden, with only their joints marked, and the boots (Saruman's shoes) on the foot bones step out from under the hem. `waist` is marked at the back of the waist, so the chest stays inside the belt as the spine bends. They die with `knees` and `behind` -0.06, which tucks the feet under the robe rather than out behind it.
- **Long beards.** Gandalf's and Saruman's hang from the chin on `beard`, as Balin's does (`hanging()`), starting with a band tucked under the top, and Saruman's black strands ride on it. Radagast's is short enough to stay on `head`.
- **The other hand.**
  - Gandalf's left rests on Glamdring's hilt, sheathed at his hip on `hips`, as he stands, runs and shoots (`resting()`). It lets go in his cast, thrust out at the foe.
  - Saruman's holds the palantir before him, in a footed cup of `trim`, raises it before his face as he casts, and drops it by his knee as he falls (`dropped`).
  - Radagast's right holds up a bird on its fist, on a bone of the model's own, `bird` (from `hand_r`, up through the bird from its feet), which flies off in his cast.
- **Bones and triangles.** Each has 18 bones: the 16, `robe`, and `beard` (Gandalf, Saruman) or `bird` (Radagast).
  - Gandalf's splits cost 52 triangles: 24 for the robe, 16 for the cloak and 12 for the beard. Saruman's cost 36: 24 for the robe and 12 for the beard. To make room for his fittings, Gandalf's robe stops at his shoulders, under the mantle and the scarf (16).
  - Radagast's robe split (24) is paid for with the robe's band under his mantle and the staff's ring inside his fist (26). His fittings (29) are paid for with 8 more that nobody sees: his brows are open at the back, his left thumb has no side inside his fist, and the staff's side shoot is open at its end, inside its leaves.

| Clip | Gandalf | Saruman | Radagast |
|---|---|---|---|
| `idle` | `ready`, 2.4 s: the staff planted, his hand on Glamdring's hilt | the same, the palantir held before him | the same, the staff in his left hand, the bird held up on his fist |
| `move` | `run`, 0.5 s: the staff carried upright | the same | the same |
| `attack` | `point`, 0.6 s: drawn back over his shoulder on frame 0, swung over to point at the foe on frame 3, then set down | `point`, 0.6 s | `point`, 0.6 s |
| `cast` | `bar` (You shall not pass), 0.8 s: heaved up high, then struck down on the ground before him as his other hand is thrust out at the foe, at its height on frame 4 | `hurl` (Fire of Orthanc), 0.8 s: raised high as he bows his head to the palantir held up before his face, then swept over and down to point at the farthest foe on frame 4 | `flock` (Flock), 0.8 s: crouched over the staff, his fist drawn in, then both flung up as the bird leaps from his fist on frame 4, flies out towards the foe, circles back and lands again |
| `stun` | `dazed`, 1.2 s, leaning on the staff | `dazed`, 1.2 s | `dazed`, 1.2 s |
| `death` | `knees`, `slump` 0.8, `dropped`, `behind` -0.06, 0.5 s: down on his knees into his robes as the staff falls ahead of him, ending 1.30 tall (the staff) | the same, the palantir dropped by his knee, ending 1.31 tall | the same, ending 1.43 tall (the staff's leaves) |
| `victory` | `raise`, `out` 0.45, 0.8 s: the staff held up high | `raise`, `out` 0.3, 0.8 s | `raise`, `out` 0.45, 0.8 s |

Their `.glb` files are 188,356 bytes (Gandalf), 187,140 (Saruman) and 197,308 (Radagast).

### Orcs

Gorbag (`units/gorbag.py`) is the Orcs' reference rig. Grishnákh, Uglúk, Lurtz and Gothmog follow his idle and run.

- **One people, one way of moving.** Every Orc stands `ready` with `seconds` 2.0 and `crouch` 0.06: a restless low crouch, breathing quick. Every Orc runs `run` with `seconds` 0.43, `heavy` 0.7, `stride` 0.3, `lift` 0.25 and `lean` 6: low and quick, the knees well bent and the body over them. The stoop is in the rest pose, so the Uruk-hai, Uglúk and Lurtz, who are built upright, move the same way standing taller.
- **Bends, for no triangles.** Each body is split at the belt: the breeches, skirt or mail and the belt on `hips`, and the jerkin or cuirass on `spine` from a ring inside the belt, in as many bands as it had. Legs and arms already built as a thigh and a shin, or an upper arm and a forearm, overlap at the knee and the elbow. Grishnákh's were one bent tube each and are now two pieces that overlap at the joint's ring (`jointed()` in his script): the upper reaches 0.025 past it, a little wider, and the lower starts 0.025 before it, inside. Knee cops go with the shin, and Gothmog's elbow spikes with the forearm. Uglúk's tabard is cut at the belt: the yoke and the panels above it on `spine`, the rest on `hips`. Cowls, capes, mantles, pauldrons and quivers ride `spine`; loincloths, kilts and tabards hanging from the belt ride `hips`. No rig cost a triangle.
- **Bones.** Gorbag and Lurtz have 18: the 16, `string` and `arrow`. Grishnákh, Uglúk and Gothmog have the 16.
- **Archers** (An archer at the draw above).
  - Lurtz draws to his jaw as Faramir draws to his cheek, and takes Faramir's shot. His cast, Piercing arrow, is the heavy cast `shot`.
  - Gorbag draws a short bow close before his jutting face, to under his chin (`anchor='chin'`). As the fresh arrow is nocked his bow tips forward (`point` 35) and comes in only a share of the way (`gather` 0.3), and his hand snaps out to his side from the loose (`snap`).
  - Gorbag's cast, Volley, is `flurry`: three shots `every` 4 frames, his hand snapping out and a little down (`snap` (0.14, -0.02, -0.03)), so it comes back to the string under his jaw rather than through it.
- **What the hands hold.**
  - Grishnákh's long knife and dagger go from the grip to the point, their edges down and out.
  - Uglúk's sword goes from the grip to the point, an edge out to his right. His shield goes from the grip behind its middle up to its rim, facing the front.
  - Gothmog's cleaver goes from his fist up the haft to the blade's point, its edge out from his head. His war-banner is a pole (`fit(pole='l', free=('cast',))`): planted, carried, toppling across the hex and lifted, as Aragorn's standard is.
- **Gothmog's cleaver** is long and held up beside a big head with swept-back ears, and `fit()` pulls a blade that would leave the hex in towards him. So:
  - His `chop` cleaves straight down (`steep` 60), turned out to his right so it shows from behind (`out` 40).
  - It comes over the top and is lifted back out past his head and ears (`wide` 0.5, `clear` 0.7).
  - The blade still points ahead as his fist comes back (`lift` 80), so its pommel passes outside his chest.
  - His rally (`plant`) and his victory (`raise`) take the cleaver up beside his head (`out` 0.45 and 0.4).
  - Falling, he keeps it upright beside him as the banner topples. This is `knees` with `hand='l'`: `holding()` lays the banner down, and the cleaver is in the hand `knees` rests upright.
- **Lurtz's drawing hand** rests under his jaw, before his chest, so when dazed it sags in front of the chest (`dazed`'s `off_back` 0) rather than swinging back into it.

| Clip | Gorbag | Grishnákh | Uglúk | Lurtz | Gothmog |
|---|---|---|---|---|---|
| `idle` | `ready` (bow hand), 2.0 s, drawn | `ready`, 2.0 s | `ready`, 2.0 s | `ready` (bow hand), 2.0 s, drawn | `ready`, 2.0 s, the banner planted |
| `move` | `run`, Orcs', drawn (`steady`), 0.43 s | the same, both blades swinging (`pump`) | the same, the shield held up (`off='high'`) | the same as Gorbag's | the same, the banner carried |
| `attack` | `shot`, drawn, `anchor='chin'`, `snap` (0.16, -0.04, 0), `point` 35, `gather` 0.3, `wide` 0.6, 0.6 s: loosed on 3, nocked on 14, the fresh arrow swung less far out to his side on its way to the string | `thrust`, `out` 20, `wide` 0.2: the long knife driven out from his hip, 0.53 s | `swing`, 0.53 s | `shot`, drawn, `wide` 0.3: the fresh arrow brought up close by his head, 0.6 s: loosed on 3, nocked on 14 | `chop`, `wide` 0.5, `steep` 60, `out` 40, `clear` 0.7, `lift` 80, 0.6 s |
| `cast` | `flurry` (Volley), 3 shots `every` 4, `deeper` 0.1, `snap` (0.14, -0.02, -0.03), `point` 35, 0.7 s: loosed on 3, 7 and 11 | `lunge` (Sneak), `reach` 0.6, `rise` 30, `wide` 0.4, 0.7 s, furthest on frame 4 | `brace` (Bred for war), 0.8 s, frame 4 | `shot` (Piercing arrow), `wide` 0.3, 0.8 s, loosed on frame 6 | `plant` (Unleash the Orcs), `out` 0.45, 0.8 s, frame 4 |
| `stun` | `dazed` (bow hand), `low` 0.45, `droop` 0.8, 1.2 s | `dazed`, 1.2 s | `dazed`, 1.2 s | `dazed` (bow hand), `low` 0.8, `droop` 0.5, `off_back` 0, 1.2 s | `dazed`, `low` 1, 1.2 s |
| `death` | `knees`, `hand='r'`, `slump` 0.7: kneeling over his bow, 0.5 s, ending 0.98 tall | `knees`, `lay` 0.12, 0.5 s, ending 0.80 tall | `knees` (shield hand), `slump` 0.6: the shield laid down before him, 0.5 s, ending 1.07 tall | `knees` (bow hand), dropped, 0.5 s, ending 1.03 tall | `knees`, `hand='l'`: the banner toppling, the cleaver upright, 0.5 s, ending 1.38 tall (the banner) |
| `victory` | `aloft`, 0.8 s | `raise`, `out` 0.4, 0.8 s | `raise`, 0.8 s | `aloft`, 0.8 s | `raise`, `out` 0.4, 0.8 s, the banner lifted |

Their `.glb` files are 176,640 bytes (Gorbag), 158,740 (Grishnákh), 171,492 (Uglúk), 180,352 (Lurtz) and 166,264 (Gothmog).

### The Large units

Treebeard (`units/treebeard.py`) and Sauron (`units/sauron.py`) are built at full size, 2.38 and 2.13 tall, and rigged with `Rig(kind='large')`: up to 32 bones and 300,000 bytes. Each is the only unit of his people, so each is his own reference. Both are slow and heavy, with a longer idle (3.0 and 2.8 s) and a heavy run.

- **Treebeard**, 19 bones: the 16, `beard`, `leaves` and `boulder`.
  - **Bends, for no triangles.**
    - Each leg is a thigh running 0.06 past the knee and a shin from 0.06 above it, inside and 10% narrower, in the three bands of bark the leg had.
    - The trunk is a lower trunk on `hips`, from the fork to 1.26, and an upper trunk on `spine` from a ring inside it at 1.12; the belly ring is dropped for it. Its ridges wind alike in both, so they line up, and the spine bends about the back of the waist.
    - The arms split at the elbow, the forearm starting 0.04 above it and a little narrower.
    - His knees are 4 to 5 cm forward of the line from hip to ankle, so they bend forward. The shin's flare ends at 0.13, above the ankle, so it stays out of the ground as the shin tilts.
  - **His beard and leaves sway.** The beard hangs from the chin on `beard`, its top along the cheeks following `head`; the canopy and its twig are on `leaves`. `swaying()` makes both trail after the head, and the beard hang from the chin as he bows or rears (`share` 0.6).
  - **His lichen,** his `trim`, is in nine patches, each bound to the piece of bark it lies on (`thigh_*`, `shin_*`, `hips`, `spine` or `head`) and placed clear of the knees and the waist's seam. Each is a rosette and a smaller one, flat, with 7 and 5 points, where his 3★ model has low domes of 9 and 6: flat-shaded and skinned, every facet has vertices of its own, and the domes took his `.glb` to 311,868 bytes, over the limit. His 2★ model is built on this one, so its lichen is flat too.
  - **His 2★ crown,** young branches in leaf (`units/treebeard-2.py`), is main's, swept back and drawn in. As main drew it, rigged on his clips it reached 1.13 from his centre as he bows to tear up a boulder (`heave`, frame 13) and as he falls (`knees`, frame 15), and the boulder he hurls passed through the right bough's shoot and leaves (frame 4). So the boughs from his shoulders, with their shoots and leaves, on `spine`, are turned back 20 degrees about the moss they rise from and drawn in to 0.8 of their size, and the two shoots from his head, with theirs, on `leaves`, turned back 35 degrees about the canopy and drawn in to 0.8. Then nothing in the crown reaches past 0.92, his death ends 1.88 tall, under four fifths of his 2.40, and the boulder and his hands keep clear of it. The thin shoots have 4 sides, not 5, which keeps his `.glb` at 336,596 bytes, under the 337,500 a Large gear model may have: with 5 it was 337,900.
  - **The boulder** is on `boulder`, hanging from the right hand from its middle. `hold('r', palm, middle, middle + front)` describes it from the palm to its middle. His open left hand swats (`swing`, `hand='l'`). The boulder is for his cast, `heave`, which needs the joint `boulder_inside`, where the hurled boulder waits inside his chest until he tears up another.
- **Sauron**, 18 bones: the 16, `robe` and `cape`.
  - **His robe to the ground** is split as the Ringwraith's is (The Nazgûl above):
    - the breastplate on `spine`, from a ring deep inside the belt;
    - the belt, buckle, tassets and the robe above the knees on `hips`, reaching down to a ring inside the robe below the knees;
    - the robe below the knees, with the foot of the tabard, on `robe`, hanging from `root` and moved by `robed()`.

    The tabard is split where the robe is. The hem is raised to 0.05, so his sabatons, on the foot bones, show under it as he strides; his legs are hidden, with only their joints marked. The robe's extra ring costs 24 triangles, and the torso's split saves 20.
  - **His great cape** is on `cape`, from the back of the neck to the middle of its hem, and `draped()` moves it. It swings half what a style swings a cape and lies on his back as he bows. It never swings in under him, under the ground or out of the hex.
  - **The mace** is held from the fist to the spike on its head. It is about as long as the hex is wide, too long to swing level in it, so his blows are `smash` and `reap`. The Black Hand holds nothing; it drops by his hip when he is dazed (`off_low` 0.7).
  - **His right pauldron** has no rivet at the front of its outer side, where his 3★ model has one; his 2★ model, built on this one, has none either. `kept_between()` won't push a hand more than `GIVE` into the hull of everything on `spine`, and that rivet widened the hull where the mace comes down, so the blow reached 1.00 from his centre between frames instead of 0.96.
  - **Deep slumps:** both use `knees` with `back` 0.15, which settles the hips back as they fall, so their heads stay inside the hex.

| Clip | Treebeard | Sauron |
|---|---|---|
| `idle` | `ready`, breath 0.7, sway 0.6, crouch 0.03, 3.0 s, the boulder held ready | `ready`, breath 0.8, sway 0.6, crouch 0.02, 2.8 s, the mace upright, the Black Hand raised |
| `move` | `run`, heavy 1.0, stride 0.45, lift 0.18, lean 6, 0.6 s: a long, low, heavy stride, the boulder carried up, the free arm swinging | `run`, heavy 0.6, stride 0.4, lift 0.2, lean 8, the hand held up (`off='high'`), 0.5 s, the sabatons striding under the hem |
| `attack` | `swing`, `hand='l'`, ahead 0.35, 0.53 s: the open left hand from high on his left, across and down in front on frame 3 | `smash`, `drop` 1, `coil` 8, `slow` 1, 0.6 s: up and back over the shoulder, over the top above the head and dropped steep past his right side on frame 2, the fist kept back and the body still turned to his right, then driven down steep by his right knee on frame 3 as the body uncoils, lifted back across the front a frame later |
| `cast` | `heave` (Boulder), 0.8 s: drawn back behind the shoulder, lobbed out and let go on frame 4. It flies on frame 5 and waits in his chest; bowed down, the hand grips another at the ground on frame 13 and turns it back onto the palm | `reap` (Sweep), turn 55, 0.8 s: the mace tipped 70 degrees down, swept round the front by the turning body, straight ahead on frame 4, held on the far side, brought back up across the front |
| `stun` | `dazed`, low 0.5, 1.5 s | `dazed`, low 0.3, off_low 0.7, 1.4 s |
| `death` | `knees`, slump 0.8, back 0.15, 0.5 s, the boulder rolled out before him, ending 1.73 tall | `knees`, dropped, behind 0, slump 0.8, back 0.15, 0.5 s, into his robe, the cape on his back, ending 1.61 tall |
| `victory` | `raise`, out 0.45, 0.8 s, the boulder held high, clear of his canopy | `raise`, out 0.3, lean 10, 0.8 s |

Their `.glb` files are 298,412 bytes (Treebeard) and 239,276 (Sauron).

## The clip library

`clips.py` keyframes each clip on every frame, at 30 frames a second, from a few channels a style gives for each frame: the hips' movement and each bone's turn, and for arms and legs a target the IK reaches (`clips.py` lists the channels). Arms reach with the chest or, for a weapon's path drawn where it goes, in the model's own frame; feet are placed on the ground, so they stay planted while the body moves above them. A script picks a style by name, with options, or writes its own function:

```python
Rig(clips={'idle': 'ready', 'move': ('run', {'heavy': 1.0}), 'attack': ('chop', {}), 'cast': my_cast, ...})
```

| Clip | Styles | Gimli |
|---|---|---|
| `idle` | `ready`: two breaths and a slow shift of weight a loop, the weapon rocking a little; `lurk`: crouched like a creature, one hand flat on the ground, quick shallow breaths and a darting look | `ready`, 2.4 s |
| `move` | `run`: two strides a cycle, in the air with the legs apart a quarter of the way through (the stride a dash holds); `heavy` deepens the bob and the crouch; the weapon carried `high`, swinging (`pump`) or where it rests on the chest (`steady`, a drawn bow), and `off` runs the other hand the same ways (`high` for a horn or a shield); `scuttle`: `run()`'s legs, low and quick, with one hand pawing along like a third foot, where `flat` rolls long feet less and `splay` turns frog knees out | `run`, heavy, 0.5 s |
| `attack` | `chop` overhand, `swing` (a forehand slash), `thrust`, `shot` (a bow, held in the other hand) and `throw`; each lands on frame 3. `chop`'s `wide` and `swing`'s `wide` draw it back further out, clear of a big head of hair, and `swing`'s `ahead` carries the follow-through clear of a round belly; for a long blade, `chop`'s `steep` and `out` turn it further down and to its own side as it lands, and its `elbow` and `early` lead it with the elbow and turn it further down on frame 2, and `slow` lifts it back later, so it stays in the hex between frames (Fitting clips to what a model holds below); `thrust`'s `guard` keeps the shield still before the body and its `out` turns it to its side, its `wide` draws it back further out, clear of a body that `out` turns it into, and its `rise` points it up, as a long spear is thrust up over a shield; `shot` with `drawn` is for an archer built at full draw, and takes `deeper`, `quiver` and `anchor` (An archer at the draw above), and `wide`, how far out to its side the fresh arrow swings on its way to the string; `bolt` is a sorcerer's bolt, what the hand holds up (an open hand, described from the wrist to the fingertips with its palm as its face, or a light) drawn back by the shoulder and thrust out at the foe; `smite` is for a weapon held in both hands (Dwarves above), and its `beard` keeps the hands and the haft before a long beard and clear of a big helm; `chop`'s `clear` brings it over the top and lifts it back further out on its own side, past a big head and its ears, and its `lift` is how far from upright the blade points as it is lifted back, so a long haft's butt passes outside the chest; `point`: a sorcerer's shot from the head of a staff stood beside the body, drawn back over the shoulder (`back`), then swung over until it points at the foe, `tip` degrees from upright and `inward` across the front; `pelt`: a stone thrown overhand from a hand cocked by the head, then the next fetched from a pouch (`Stone`); `rake`: a claw raked down at the foe; `smash`: an overhand blow with a weapon too long to swing level in the hex, over the top with the fist high and drawn back, down steep by the knee, then lifted back across the front; with `drop` it has already come over the top and dropped steep past its own side on frame 2, the fist kept back, so it doesn't sweep level out of the hex between frames 2 and 3, `coil` keeps the body turned to its side into frame 2, so it uncoils into the blow, and `slow` lifts it back later | `chop`, 0.6 s |
| `cast` | `sweep`: a wide, level sweep round the front, then with `guard` the shield up in front; `staff`: a staff raised high; `rally`: a great blow down in front, then the weapon thrust high (a Captain), with `steep` and `out` turning a long blade's blow further down and to its own side, as `chop`'s do, and `lead` turning the frame before the blow by that share of them too, and `elbow` leading it with the elbow there, as `chop`'s does; `horn`: a horn put to the lips and sounded, the head thrown back (needs the joints `mouth` and `mouthpiece`); `bash`: the shield on the other arm driven forward; `shot`: a heavy shot from the draw, raised `rise` degrees; `plant`: a Captain's standard heaved up and planted again with a stamp as the weapon is thrust high; `slam`: `smite`'s blow heaved higher and slammed into the ground, with `beard` as `smite`'s; `duck`: down and away into the cloak, small and curled, an escape; `brace`: what the other hand holds thrust up before the face as a shield, a guard for another; `lunge`: a lunging stab, with `reach` and `rise` for a long blade and `wide` to clear a round belly; `grasp`: the free hand thrust out at the enemy's face, the head after it (a Nazgûl's Black Breath); `riposte`: the shield up before the face, then swept aside as the blade is driven past it and up, `out` to its own side; `flurry`: arrows loosed as fast as they are nocked, with `sweep` turning across foes for a volley; `beacon`: a light gathered in before the breast and lifted high overhead; `plant`'s `out` takes the weapon up further out from the shoulder, past a big head; `bar`: a staff heaved up high and struck down on the ground `ahead` of the body, the other hand thrust out at the foe (`thrust`); `hurl`: a staff raised high as the other hand holds what it carries up before the face (`gaze`), then swept over and down to point at a foe far off; `flock`: a staff raised and the other fist flung up, so that a bird perched on it (a bone of the model's own, `bird`) flies out towards the foe and back; `riddle`: `lunge`'s stab under a riddler's raised finger, drawn back clear of a round belly; `skim`: a stone skimmed side-arm, then the next fetched; `bites`: bites as fast as the jaws snap, the head thrust out; `heave`: a boulder lobbed from behind the shoulder and let go at its height, then another torn up from the ground (a bone for the boulder, and the joint `boulder_inside` where the hurled one waits); `reap`: a weapon too long to swing level, swept round the front by the turning body, tipped `drop` degrees down and `turn` degrees either way | `sweep` with the guard, 0.8 s, at its height on frame 4 |
| `stun` | `dazed`: knees soft, swaying, the head lolling, the weapon drooping; `low` and `off_low` bring what either hand holds up high down to hang by the hip, and `off_back` is how far back the other hand swings, 0 for a drawing hand that rests before the chest; `off_ahead` brings a drawing hand at the cheek down off the string and out before the chest, its arrow turned down past the bow; `cowed`: dazed on all fours, both hands kept where they hang | `dazed`, 1.2 s |
| `death` | `knees`: struck, down on the knees and slumping forward, the weapon dropped in front; `lay` is how high it comes to rest, and `dropped` lets the other hand's horn or banner fall by the knee instead of resting it upright as a shield; `behind` is how far behind the pelvis the feet are tucked, a share of the leg, below 0 keeping them under a robe (`robed()`), and `back` settles the hips back, so a tall body that slumps deep keeps its head in the hex; `fall` is where the weapon hand goes as the knees give, back and down for a long bow whose top falls forward; `sprawl`: reared back, then flat on the belly | `knees`, 0.5 s, ending 0.76 tall |
| `victory` | `raise`: the weapon thrust up high and held; `out` is how far out from the shoulder the fist goes up, and `lean` tips a long-hafted weapon out to its side; `aloft`: an archer's bow held up at arm's length, its `clench` moving the drawing hand | `raise`, 0.8 s |

Each style was tuned on the units that use it: Gimli's on him; `swing`, `duck`, `brace` and `lunge` on the Hobbits; `chop`'s options, `thrust`, `rally`, `horn`, `bash`, the drawn `shot`, `aloft` and `fit()` on Gondor; `plant`, `smite`, `slam`, `hanging()` and `both_hands()` on Balin and Dáin; the mounted styles on Éomer and Sharku; `grasp` and `robed()` on the Ringwraith, `riposte` on Éowyn, and `thrust`'s `wide` and `rise` on the Ringwraith and Háma; `flurry`, `bolt`, `beacon`, the drawn `shot`'s `deeper`, `quiver` and `anchor`, and `aloft`'s `clench` on the Elves, with `plant` also on Elrond; `point`, `bar`, `hurl`, `flock`, `resting()` and `knees`'s `behind` on the Istari; `chop`'s `clear` and `lift`, `plant`'s `out`, `dazed`'s `off_back` and the drawn `shot`'s `point` and `gather` on the Orcs; `charge` on Théoden and Khamûl, `leap` on the Witch-king, `trample` and `sound` on Gamling, and `reel`'s `low` and `rear`'s `out` on the four riders; `riddle` on Bilbo, `pelt`, `skim` and `Stone` on Pippin, and `lurk`, `scuttle`, `rake`, `bites`, `cowed`, `sprawl` and `paw_down()` on Gollum; `swaying()`, `heave` and `knees`'s `back` on Treebeard, and `smash`, `reap` and `draped()` on Sauron. In run 2c, `fit()`'s `between` and `tweened()` were tuned on the 19 units that use them (Fitting clips to what a model holds below), `rally`'s `steep`, `out` and `lead` on Aragorn, `smash`'s `drop` on Sauron and the drawn `shot`'s `wide` on Lurtz. After it, `smite`'s and `slam`'s `beard` were tuned on Dáin, and `dazed`'s `off_ahead` and `knees`'s `fall` on Faramir; and `chop`'s `elbow`, `early` and `slow` and `rally`'s `elbow` on Aragorn and Éowyn, `cut`'s `across` and `early` on Khamûl and Sharku, and `smash`'s `coil` and `slow` on Sauron. No unit uses `throw`, `staff` or `shot` without `drawn`: they have only been tried on Gimli's rig. A new style joins the library by being written in `clips.py` with `@style(clip, name)`. It gets the rig, whose measurements (joints, the reach of each arm and leg, what each hand holds, the rest pose, and the parts on each bone with `points()` and `lowest()`) size the motion, and returns a `Clip`: its length in frames, whether it loops, the frames it marks (`strike`, `height`) and its channels at each frame. `Keys` builds a one-shot clip from key poses with an easing into each, and lets a head or cape follow a frame or two behind; loops are sums of sines that come back to where they start.

Nothing goes under the ground. A foot placed on it rises by `sole_lift()`, measured on the foot's own parts, so every corner of its sole stays out of the ground as it rolls. A keyed clip that brings the body down to the ground, as `knees` does, is wrapped in `grounded()`, which stops the feet and the hips where their parts touch it instead of letting them pass through.

The clips ease so they read as weight, not machinery: a wind-up on frame 0, which shows since `attack` and `cast` start at full weight rather than fading in, a blow that gathers speed into frame 3 with the body behind it, a rebound and a hold, then a slow recovery to the rest pose, which every one-shot clip but `death` and `victory` ends in. A bone that stays at rest all through a clip gets no track in it. The root never moves: the viewer moves the model.

### Fitting clips to what a model holds

A style moves a figure as it would move anyone. `fit()` fits a Rig's clips to what the model holds:

```python
CLIPS = fit({'idle': ('ready', {}), 'attack': ('chop', {'steep': 22.0, 'out': 40.0}), ...}, pole='l')
```

- In every frame it draws in a hand whose item would reach out of the hex, keeping it 0.92 (`room`) from the centre, so a long blade's blow lands a little closer in. It also lifts an item that would go under the ground.
- `between=True` keeps what the hands hold in the hex and out of the ground between frames too, as the client shows them (`kept_between()`), and a mount's feet out of the ground. Where a fast blow's arc would reach out of the hex between two frames, the arm is moved on both, a few degrees at a time and by the same on both: the elbow bent further (`tuck`), the hand turned about the elbow's axis (`wrist`), or the whole arm turned about the chest's upright through the shoulder (`swing`). Each turns every bone of the arm by the same amount on both frames, so the arc keeps its shape and only comes in: re-placing the hand by IK would change how far each bone turns, and a blow that turns near half a circle in a frame then swings the short way round, backwards over the head. No move may take what the hand holds out further between other frames, or deeper into the convex hull of the head, or of everything on `spine`, than the clip already did, by more than 5 mm (`GIVE`); so a blow drawn back close by the head can stay a little outside the hex between frames, and `finish()` says so. A hand whose item would dip more than 5 mm into the ground between frames (`SUNK`) is lifted on the frames either side, and a mount whose hooves would, lifted whole with its rider.
- `tweened(clips)` does the same for a script that doesn't `fit()` its clips (Gimli, Éomer and Sharku), or for those in `only`.
- `between` is on for Aragorn, Boromir, Faramir, Háma, Éowyn, Gamling, Théoden, Khamûl, the Witch-king, Dáin, Haldir, Gorbag, Gothmog, Uglúk, Treebeard and Sauron, whose blows, falls or nocks went outside the hex or into the ground between frames, and Gimli, Éomer and Sharku are `tweened()`. That left 10 clips a little outside between two frames, where drawing a blow in further would take the fist into the head: Aragorn's chop reached 1.05 between frames 2 and 3 (from 1.105), Éowyn's chop 0.99 (from 1.07), Sharku's cut 0.97, Khamûl's cut, Sauron's smash, Dáin's smite and slam and Aragorn's rally 0.95 to 0.96, and Faramir's falling bow and Gorbag's arrow 0.94 to 0.95. `smite`'s and `slam`'s `beard` and `knees`'s `fall` brought Dáin's and Faramir's inside, and the others were brought in by changing the blows themselves (below). `finish()` warns on none of the 1★ models now.
- A long blade swung overhand comes down from over the head on frame 2 to the blow on frame 3, so it passes the shoulder's height between them with the arm at full stretch, and an arm that turns far in that one frame swings it round in an arc about the shoulder. These options share the swing out over the frames before the blow, or keep the blade pointing in as it passes (`clips.py`, Blows kept in the hex between frames):
  - `chop`'s and `rally`'s `elbow` (0 to 1) brings the elbow forward and down on the frame before the blow, leading the blade, rather than up by the head, so the upper arm turns about a third less in the frame the blow comes down in (Aragorn's chop 82 degrees rather than 132, Éowyn's 83 rather than 120).
  - `chop`'s `early` turns the blade further down on frame 2. `cut`'s `early` does the same, and its `across` turns the blade in across the front there, so it comes over level pointing ahead and is swept out to its own side only as it comes down.
  - `smash`'s `coil` keeps the body turned to the weapon's side into frame 2, so it uncoils into the blow. The body turns about its upright, which keeps everything as far from the middle as it was, and the arm swings less about the shoulder.
  - `chop`'s and `smash`'s `slow` lift the weapon back that many frames later, so the recovery, where it swings past level ahead on its way up, is eased over more frames.
  - A fresh arrow swung out less on its way to the string, with the drawn `shot`'s `wide`, brought Gorbag's in.

  Each blow still strikes on frame 3 and reads the same at game size. Aragorn's chop, Sharku's cut and Sauron's smash land within 7 degrees of where they did, Éowyn's chop and Aragorn's rally about 12 degrees further ahead, and Khamûl's cut out past his horse's right shoulder, where the style puts it, rather than drawn in before its chest. Aragorn's chop takes `elbow` 0.75, `early` 15 and `slow` 1, and his rally `elbow` 0.25; Éowyn's chop the same as Aragorn's; Khamûl's and Sharku's cuts `across` 40 and `early` 15; Sauron's smash `coil` 8 and `slow` 1; and Gorbag's shot `wide` 0.6.
- `pole='l'` is for a pole stood on the ground beside the model: a standard, banner or staff, which `hold()` describes from the grip up to its top.
  - It stays planted in `idle`, `attack`, `cast` and `stun`.
  - It is carried upright and clear of the ground in `move`.
  - In `death` it tips over across the hex, to 48 degrees, so a 2-metre standard stays inside it.
  - It is lifted in `victory`.
  - Clips named in `free` leave the pole to their style.
- `bow='l'` is for an archer at full draw (An archer at the draw above).
- It works for riders too: `kept()` draws a rider's hand in, in the mount's frame.

Other wrappers fit clips to a model's own parts in the same way:
- `resting(clips)` keeps a hand on a part the hips carry, such as a sword's hilt at the hip, in `idle`, `move` and `attack` (Gandalf). `staff_at()` and `staff_way()` pose a staff's hand from where its grip goes and which way the staff points, for styles that move a staff stood beside the body.
- `hanging(clips)` hangs a beard or long hair from the head (Dwarves above), `robed(clips)` a robe from the hips (The Nazgûl above), and `paw_down(clips)` keeps a hand flat on the ground (Gollum above).
- `swaying(clips, bone)` makes a bone of the script's own trail after its parent, such as a beard or leaves, and hang (`share`). `draped(clips)` fits a long cape: it swings `share` of what a style gives it and never swings in under the body, under the ground or out of the hex. `placed()` puts a bone of the script's own where a clip wants it, in the model's frame.

## Previewing

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/preview.py -- packages/client/public/models/gimli.glb /tmp/models/gimli
```

This writes a PNG for each view and `sheet.png` with all of them. Add `--quick` to render only the three-quarter view, and `--fit` to frame the model alone instead of in the box every model shares. Add `--culled` to draw every material single-sided, as three.js would if the client culled back faces: a face wound inside out, which the double-sided export hides, shows as a hole. A rigged model is drawn in its rest pose.

### Previewing clips

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/preview.py -- packages/client/public/models/gimli.glb /tmp/models/gimli --clips
```

`--clips` renders a rigged model's clips instead, as `<clip>.png` for each: a contact sheet of its frames, numbered with their times, in three rows seen from the game camera's 45 degrees: from the front (as the far side is seen), from its right, and from behind (as the near side is seen). Short clips show every frame and longer ones a dozen spread over them, with every frame of the first 0.2 s of an attack or a cast, where it strikes. `--clips=attack,cast` renders only those, `--frames=0,3,8` picks the frames, and `--size=400` renders each frame bigger for a closer look. Look for parts that come apart, a weapon through the body or the head, and feet through the floor; `finish()` already warns about frames outside the hex or under the ground, and about the poses between them, and `clash.py` points to frames where a weapon may go through the head or the chest.

### Checking clashes

```bash
blender --background --factory-startup --python packages/client/art/clash.py -- packages/client/public/models/gimli.glb mail
```

`clash.py` looks for what a model's hands carry passing through its head or its chest, in every frame of every clip and the half frames between, and in the rest pose. What the hands carry is the parts on `hand_l` and `hand_r` and on every bone below them, such as an archer's `string` and `arrow`, Pippin's `stone`, Radagast's `bird` and Treebeard's `boulder`. The head is every part on `head`. The chest is the largest piece of the chest material on `spine`, the torso's material (`mail` for Gimli), so a quiver or a pauldron in the same material is left out; a chest with an emblem or a band of its own takes both, as `sable,trim` (Boromir).

- `--clips=attack,cast` checks only those clips.
- `--leave=team` leaves materials out of the head, the chest and any other target, such as a wizard's `team` hat, whose brim stands out from the head.
- `--carried=forearm_l` tests the parts on more bones as carried, such as a shield strapped to a forearm, and `--targets=beard` tests the carried parts against more bones' parts.

For each frame with a clash it prints the deepest point of each carried bone in each target, how deep, the materials of the part that goes in and of the face it goes under, and where that point is on what is carried and in the target, on the model as built; then each clip's frames and deepest clash. A `CLASH rest` line is the model as built. It exits 0 whatever it finds.

Treebeard's torso, his upper trunk, is `bark,furrows` on `spine`; the `team` moss on it is in pieces of its own. Checked with it, the boulder he heaves is in his chest on frames 5.5 to 12.5 and in his head on frames 6 to 12: that is the hurled one waiting hidden inside him until he grips another on frame 13 (`heave`), as renders from every side show. Nothing his hands carry clashes otherwise.

Dazed, Lurtz's bow limb rests up to 8 mm into his hip on frames 9.5 to 15.5, which renders show doesn't show.

Checked with `mail,team` and `--targets=beard`, Dáin's attack and cast (`smite` and `slam` with `beard`) put nothing his hands carry into his helm or his beard, but on their last frames (15.5 to 18 and 22 to 24), as the haft settles back where it rests: 13 mm into the beard, against 14 mm as built (`CLASH rest`). Checked with `buckskin`, Faramir's stun (`dazed` with `off_ahead`) puts nothing into his head or his chest.

A point counts when it is more than 4 mm inside the target's convex hull and under its surface by the nearest face. That overstates for wide parts, such as pauldrons, hoods and capes, whose hull takes in the space between them and the body, and for a mouthpiece at the lips or a hand drawn to the cheek, which are in the head by design. A real clash can be hidden too, such as a fist in a big beard or the butt of a haft inside the body behind the hand that holds it. It samples edges, not faces, so a flat blade's middle can pass through a thin part unseen, and it doesn't look for what the hands carry in the arms, the legs, the other hand or a mount. So check a report against a close render (`preview.py --clips=attack --frames=1,2,3 --size=400`), seen from the game camera's front and back, before changing anything.

## On the board

```bash
node packages/client/art/board.mjs /tmp/board/gimli packages/client/public/models/gimli.glb
node packages/client/art/board.mjs /tmp/board/stars --stars <study.json> --unit=0
```

`board.mjs` renders models on the game's board with three.js in headless Chromium, with the client's camera and lights and each model in its unit's livery (`src/livery.json`), so a model can be judged at the size and in the colour it is played in. `--lineup` puts several side by side, and `--stars` lays a unit out at 1★, 2★ and 3★ with the growth and trim the client gives it (a base too, if the options ask for one, though the client no longer draws one), and a label 1.8 above the ground, times the scale, which the client sets higher for a Large model or to clear a model's clips (`docs/viewer-spec.md` section 4, Star levels); `star-study/options/chosen.json` is an example. Its header lists the options.

## Arenas

The arena is the ground the board stands on and what stands round it (`docs/viewer-spec.md` section 3, Arena). Each is a Blender script in `arenas/`, named by its id, that exports `packages/client/public/arenas/<id>.glb`, committed like the models; `packages/client/src/look.ts` names the one the client loads. `pnpm models` builds them with the models, and `pnpm models <id>` one alone:

```bash
pnpm models ruins
```

- `arena.py`: what arenas share: where the board is and the room an arena leaves round it (`COURT`, `LOW_BAND` and `zone()`), the floor's height (`FLOOR_TOP`, below the hexes' tops at 0), shapes for squared and broken stone (`block()`, `drum()`, `rock()`, `hex_prism()`, `hex_frame()`) and grass (`tuft()`), and `finish_arena()`, which joins the arena, checks its budget (`ARENA_BUDGET`) and materials as `finish()` does a model's, bakes ambient occlusion into its vertex colours with Cycles, and exports it without normals, since the client shades it flat. The same script builds the same file, byte for byte.
- `arenas/ruins.py`: the ruins, a court of old Gondor gone to grass: paving in four shades, under the board too, since its hexes are translucent, with frames of mortar along the hexes' edges (`hex_frame()`), broken columns on plinths with their drums fallen at their feet, walls fallen to rubble, fallen columns, the plinths of two fallen kings, boulders, rubble, loose stones and grass, on all four sides, since the camera looks from behind either team's back row.

Blender's −Y is the game's +Z, towards team A's back row. Keep the court round the board and the bench clear and the band round it low; `packages/client/test/arena.test.ts` checks both, and that nothing under a hex reaches its top. To judge an arena, look at it in the client (`pnpm dev`), from both sides and in planning, since the blur, grade and fog are the client's (`src/post.ts`).
