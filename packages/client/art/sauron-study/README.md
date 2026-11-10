# Dense-faceted Sauron study

Sauron's 1★ model rebuilt at four densities, **3,000, 5,000, 10,000 and 40,000 triangles**, for the board, to see what a high-poly unit would look like in the game, what it would cost, and how few triangles the same design needs. He keeps the Faceted style (`docs/viewer-spec.md` section 4): flat shading, colour from materials and no textures. The extra density goes into more and sharper facets. Every plate's edge is a rim in a lighter `edge` material, so it catches the light like worn steel. From 10k up, the edge is chamfered in it too.

**Not in the game.** `public/models/sauron.glb` is unchanged; these models live in `models/` here. Nothing has been chosen yet.

**Direction: the films, not the books.** At the user's request (9 November 2026) the study takes the films' armoured Dark Lord as its direction rather than the books: blackened plate, a tall helm under a crown of blades, great pauldrons with blades rising from them, a long skirt of plates, clawed gauntlets and a flanged mace. The shapes are this script's own, built from a written brief, with no film stills traced and no assets downloaded. The art brief (`.claude/agents/low-poly-artist.md`) and `docs/design.md` section 14 still say to draw from the books and not to copy the films' designs. If this direction ships, those docs change in the same change.

## The models

| | Triangles | Budget | `.glb` | Script |
|---|---|---|---|---|
| 1★ today | 1,264 | 2,000 | 242.6 KB | `../units/sauron.py` |
| 3k | 2,968 | 3,000 | 404.1 KB | `sauron-dense.py`, level `3k` |
| 5k | 4,716 | 5,000 | 570.0 KB | `sauron-dense.py`, level `5k` |
| 10k | 8,864 | 10,000 | 972.2 KB | `sauron-dense.py`, level `10k` |
| 40k | 35,800 | 40,000 | 3,470.7 KB | `sauron-dense.py`, level `40k` |

All four levels are one design with one table of densities (`LEVELS`). It sets:

- the points round each form, and how finely the cloth is cut;
- the plates in the skirt and the lames on the pauldrons;
- the blades in the crown and on the pauldrons, and the finger joints;
- whether there are rivets and studs, and whether the plates' edges are chamfered as well as rimmed.

How the levels differ:

- **3k:** 8 columns of plates in the skirt, two lames and two blades on each pauldron, a coarser dome, a crown of 7 blades, single-segment blades, fewer points round everything and no chamfers.
- **5k:** the 10k's lames and blades and its points round the body, with fewer plates in the skirt (10 columns against 12), fewer points round the arms, cloth and helm, and no chamfers.
- **10k:** everything chamfered.
- **40k:** finer plates and cloth, rivets on every plate, studs on the mace and jointed fingers.

Where the triangles go:

| | Pauldrons | Skirt of plates | Helm and crown | Belly and chest | Cape |
|---|---|---|---|---|---|
| 3k | 496 | 384 | 384 | 308 | 120 |
| 40k | 6,378 | 10,920 | 3,342 | 4,136 | 5,168 |

## How it is built

- **The 1★ model's skeleton and clips.** The script builds the 1★ model to mark its joints, removes its parts, and builds its own on the same 18 bones, leaned as the 1★ model is. So he has the 1★ model's bones and clip styles, and the clips fit themselves to these parts as they do to the 1★'s (`../clips.py`, `fit()`).
- **What changed from the 1★ model to fit.**
  - The death clip slumps 0.7 rather than 0.8 and settles the hips back 0.25 rather than 0.15 (`knees()`), since the taller crown of blades reached out of the hex as he slumped. Settling back further pushed the cape out of the hex or into the ground.
  - The right pauldron's lames stop short in front, where the mace comes down past his shoulder as he smashes. Its blades all stand behind.
- **Team colour and trim.** The team colour is the cape, with the Lidless Eye on its back, and the tabard down his front, as at 1★. His fittings (rivets, clasps, the buckle, the mace's collar, socket and pommel) are `trim`. The Eye on the 1★ model's breastplate is gone, and the crown is iron, not gold.
- **The study's own limits.** The triangle budget is the level's, and the size limit is raised to 50 MB for the study, since size is one of the things it measures.

### Working on it by hand

The script places everything by code, but nothing needs to rebuild byte for byte, so the model can be worked on by hand in Blender:

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/sauron-study/sauron-dense.py -- /tmp/sauron.glb 40k --blend=/tmp/sauron-40k.blend
```

That saves the scene as built: the parts still apart, each bound to its bone, with the joint marks, before they are joined and rigged. Each part keeps the name of its bone in its custom property `bone`. Sculpt, remesh or add to the parts as you like; a part made anew needs a `bone` too. Then finish the file instead of building:

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/sauron-study/sauron-dense.py -- packages/client/art/sauron-study/models/40k/sauron.glb 40k --from=/tmp/sauron-40k.blend
```

`--from` binds every vertex of each part to its `bone` again, so a remeshed part still moves as a solid piece. It then joins, rigs, checks and exports the model as a build does. An unedited `.blend` finishes to the same file as a build. A test that voxel-remeshed the cape finished, rigged and stayed in the hex.

## Checks

- **The build.** No warnings at any level, and every level rebuilds byte for byte.
  - Every clip stays in the hex on every frame: 0.922 from the centre at 3k and 5k, 0.921 at 10k and 0.931 at 40k.
  - Between frames they reach 0.938 at 3k and 5k and 0.940 at 10k and 40k, where the 1★ model reaches 0.938.
  - The death ends 1.72 or 1.73 tall, under the 1.80 that counts as low for his height (the 1★ model's ends 1.61).
- **`../clash.py`** (chest material `iron`). The 3k and 40k models have no clashes, and nor does the 1★ model. The 5k and 10k models have one each: the right gauntlet 6 and 7 mm into the chest on half a frame as the attack recovers (frame 13.5), a graze.
- **The real client.** Every level played in the fight viewer, with the model swapped in by intercepting its request, in a 9-a-side fight with a Sauron on each side, with no console errors.

## Results

All in `results/`:

- `board.jpg` and `board-zoom.jpg`: the 1★ model and the 3k, 5k, 10k and 40k models side by side on the game's board (`../board.mjs --lineup`), at the default camera and closer. The near side is seen from behind and the far side from the front.
- `viewer-crops.jpg`: both Saurons cropped from the real fight viewer at its default camera, scaled up twice, for each model. `viewer-3k.jpg` and `viewer-40k.jpg` are the whole frame with the 3k and 40k models.
- `sheet-1star.jpg`, `sheet-3k.jpg`, `sheet-5k.jpg`, `sheet-10k.jpg` and `sheet-40k.jpg`: Cycles renders of each from every side (`../preview.py --fit`).
- `attack-40k.jpg` and `death-40k.jpg`: contact sheets of the 40k model's attack and death (`../preview.py --clips`).

What they show:

1. **At the game's camera, all four levels look the same.** Sauron is about 100 to 130 pixels tall at the default camera on a 1600 by 900 view, so the design reads as fully at 3k as at 40k. Most of what the 40k model adds is smaller than a pixel.
2. **Closer in, the levels part.** Zoomed in on the board, the 10k and 40k models' chamfered edges draw crisper lines round the pauldrons and plates than the 3k and 5k models' rims alone. The 3k model's pauldrons are plainer, with two lames and two blades. The 40k model's cloth is smoother and its plates finer, with rivets. Only close-up renders show the 40k plainly.
3. **What changes from today's model is the design, not the density.** The silhouette changes (the crown of blades, the domed pauldrons with their blades, the skirt of plates), and he is darker. The 3k model already shows all of it. He also loses the 1★ model's gold crown, gold pauldron edges and the Eye on his chest, which gave the eye somewhere to land.
4. **The 3k model is the closest to the rest of the board.** The other 35 units are built to budgets of 800 to 2,000 triangles at 1★, and Large book models to 2,500, so the 3k model is not far over. The 10k and 40k models read busier, and whether one unit may be that much finer is a style question.
5. **Size is the real cost.** The limit is 300 KB for a rigged Large unit. The files are about 1.7, 2.3, 4 and 14 times the 1★ model's at 3k, 5k, 10k and 40k. Flat shading splits every vertex per face, which is most of it. Compressing the files (meshopt or Draco in the loader), or letting the client shade flat from shared vertices, would cut that, but neither was measured.
6. **Speed wasn't measured on a real GPU.** This machine only has software WebGL. At most two Saurons are ever on the board.

## What shipping one would take

- A budget and size limit for it (`kit.py`, `rig.py`, `docs/viewer-spec.md` section 4), and `test/models.test.ts`, which checks the 1★ files. The 3k model is over today's Large budget of 2,000 triangles and limit of 300 KB.
- His 2★ and 3★ models to match: `../units/sauron-2.py` builds on `sauron.py`'s `build()`, and `sauron-3.py` is the 1★ model's design.
- The docs on drawing from the books (above), if the direction stays the films'.
- Perhaps compression in the client's loader.

## Files

- `sauron-dense.py`: the model at any level. Its docstring has the details.
- `build.sh [level ...]`: builds every level, or those given, into `models/<level>/sauron.glb` with Blender 4.5 LTS. Each file is named `sauron.glb` so the rig times its clips from the sim's Sauron, and the client and `../board.mjs` give it his livery.
- `models/`: the built models.
- `results/`: the pictures above.
