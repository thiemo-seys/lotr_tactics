# Dense-faceted Sauron study

Sauron's 1★ model rebuilt at two densities, **10,000 and 40,000 triangles**, for the board, to see what a high-poly unit would look like in the game and what it would cost. He keeps the Faceted style (`docs/viewer-spec.md` section 4): flat shading, colour from materials and no textures. The extra density goes into more and sharper facets, with every plate's edges chamfered in a lighter `edge` material so they catch the light like worn steel.

**Not in the game.** `public/models/sauron.glb` is unchanged; these models live in `models/` here. Nothing has been chosen yet.

**Direction: the films, not the books.** At the user's request (9 November 2026) the study takes the films' armoured Dark Lord as its direction rather than the books: blackened plate, a tall helm under a crown of blades, great pauldrons with blades rising from them, a long skirt of plates, clawed gauntlets and a flanged mace. The shapes are this script's own, built from a written brief, with no film stills traced and no assets downloaded. The art brief (`.claude/agents/low-poly-artist.md`) and `docs/design.md` section 14 still say to draw from the books and not to copy the films' designs. If this direction ships, those docs change in the same change.

## The models

| | Triangles | Budget | `.glb` | Script |
|---|---|---|---|---|
| 1★ today | 1,264 | 2,000 | 242.6 KB | `../units/sauron.py` |
| 10k | 9,048 | 10,000 | 989.9 KB | `sauron-dense.py`, level `10k` |
| 40k | 36,216 | 40,000 | 3,509.3 KB | `sauron-dense.py`, level `40k` |

Both levels are one design with one table of densities (`LEVELS`): points round each form, plates in the skirt and lames on the pauldrons, blades in the crown and on the pauldrons, finger joints, rivets and studs, and how finely the cloth is cut. Where the 40k model's triangles go: the skirt of plates 10,920, the pauldrons 6,794, the cape 5,168, the helm 2,370, the plate of the belly and chest 4,136 and the gorget 1,440.

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

- **The build.** No warnings at either level. Every clip stays in the hex on every frame (0.921 and 0.931 from the centre) and between frames (0.940 for both, where the 1★ model reaches 0.938). The death ends 1.73 tall, under the 1.80 that counts as low for his height (the 1★ model's ends 1.61). Both levels rebuild byte for byte.
- **`../clash.py`** (chest material `iron`). The 40k model has no clashes. The 10k model has one: its right gauntlet 7 mm into the chest on half a frame as the attack recovers (frame 13.5), a graze. The 1★ model has none.
- **The real client.** Both played in the fight viewer, with the model swapped in by intercepting its request, in a 9-a-side fight with a Sauron on each side, with no console errors.

## Results

All in `results/`:

- `board.jpg` and `board-zoom.jpg`: the 1★ model, the 10k and the 40k side by side on the game's board (`../board.mjs --lineup`), at the default camera and closer. The near side is seen from behind and the far side from the front.
- `viewer-crops.jpg`: both Saurons cropped from the real fight viewer at its default camera, scaled up twice, for each model. `viewer-40k.jpg` is the whole frame with the 40k model.
- `sheet-1star.jpg`, `sheet-10k.jpg` and `sheet-40k.jpg`: Cycles renders of each from every side (`../preview.py --fit`).
- `attack-40k.jpg` and `death-40k.jpg`: contact sheets of the 40k model's attack and death (`../preview.py --clips`).

What they show:

1. **At the game's camera, the 10k and 40k models look the same.** Sauron is about 100 to 130 pixels tall at the default camera on a 1600 by 900 view, so most of what the 40k model adds is smaller than a pixel. Zoomed in on the board, the 40k model's cloth is smoother and its plates are finer, with rivets; only close-up renders show it plainly.
2. **What changes from today's model is the design, not the density.** The silhouette changes (the crown of blades, the domed pauldrons with their blades, the skirt of plates), and he is darker. The 10k model already shows all of it. He also loses the 1★ model's gold crown, gold pauldron edges and the Eye on his chest, which gave the eye somewhere to land.
3. **He reads busier than the rest of the board.** The other 35 units are built to budgets of 800 to 2,000 triangles at 1★. Whether one unit may be this much finer is a style question.
4. **Size is the real cost.** The 10k model's file is about 4 times the 1★ model's and the 40k model's about 14 times, against a limit of 300 KB for a rigged Large unit. Flat shading splits every vertex per face, which is most of it. Compressing the files (meshopt or Draco in the loader), or letting the client shade flat from shared vertices, would cut that, but neither was measured.
5. **Speed wasn't measured on a real GPU.** This machine only has software WebGL. At most two Saurons are ever on the board.

## What shipping one would take

- A budget and size limit for it (`kit.py`, `rig.py`, `docs/viewer-spec.md` section 4), and `test/models.test.ts`, which checks the 1★ files.
- His 2★ and 3★ models to match: `../units/sauron-2.py` builds on `sauron.py`'s `build()`, and `sauron-3.py` is the 1★ model's design.
- The docs on drawing from the books (above), if the direction stays the films'.
- Perhaps compression in the client's loader.

## Files

- `sauron-dense.py`: the model at either level. Its docstring has the details.
- `build.sh [level ...]`: builds both levels, or those given, into `models/<level>/sauron.glb` with Blender 4.5 LTS. Each file is named `sauron.glb` so the rig times its clips from the sim's Sauron, and the client and `../board.mjs` give it his livery.
- `models/`: the built models.
- `results/`: the pictures above.
