# Models

The game's 3D models of units, monsters and summons, in the Faceted style (`docs/viewer-spec.md` section 4). Each model is a Blender 4.5 LTS script that exports a glTF binary to `packages/client/public/models/<id>.glb`, named by its id in `packages/sim`. The scripts are the source. The `.glb` files are committed, because CI and other machines don't have Blender. The client doesn't load them yet.

- `kit.py`: what the models share: the team colour, the budgets, the shared palette, materials, the geometry helpers, and `finish()`, which joins, checks and exports a model.
  - Besides straight tubes and boxes, its helpers build bent forms such as limbs, tails, staves, braids and bows (`bent_tube()` on `path_rings()`, wound with `nearest_on_polyline()`), points such as spikes, claws, tines and pommels (`cone()`), and rough rocks and clumps of leaves (`lump()`); and they pose parts built upright: `lean()` forward, `turn()` sideways and `stoop()`, a bend that grows with height.
- `mounts.py`: the horse the Riders sit on (all but Sharku, whose warg is in `units/sharku.py`), built from its coat and points, markings, tack (the saddle-cloth or a caparison), a raised foreleg or none, and the turn of its head. `horse()` returns where the rider sits, where his feet hang and where the reins start; `units/eomer.py` shows how to seat him.
- `preview.py`: renders a model with Cycles for review, in both team colours and from every side.
- `units/`: one script per unit, named by its id. Gimli (`gimli.py`) is the reference model, and each people has one that the others follow: Frodo for Hobbits, Legolas for Elves, Aragorn for Gondor, Éomer for Rohan, Gandalf for the Istari, Gorbag for Orcs and the Ringwraith for the Nazgûl.
- `style-study/`: the study that chose the style, kept as it was.

## Units

| Unit | People | Script | Triangles | Budget |
|---|---|---|---|---|
| Bilbo | Hobbit | `units/bilbo.py` | 749 | 800 |
| Frodo | Hobbit | `units/frodo.py` | 716 | 800 |
| Gollum | Hobbit | `units/gollum.py` | 740 | 800 |
| Merry | Hobbit | `units/merry.py` | 770 | 800 |
| Pippin | Hobbit | `units/pippin.py` | 696 | 800 |
| Sam | Hobbit | `units/sam.py` | 791 | 800 |
| Elrond | Elf | `units/elrond.py` | 620 | 800 |
| Galadriel | Elf | `units/galadriel.py` | 577 | 800 |
| Haldir | Elf | `units/haldir.py` | 706 | 800 |
| Legolas | Elf | `units/legolas.py` | 628 | 800 |
| Balin | Dwarf | `units/balin.py` | 747 | 800 |
| Dáin | Dwarf | `units/dain.py` | 765 | 800 |
| Gimli | Dwarf | `units/gimli.py` | 793 | 800 |
| Aragorn | Gondor | `units/aragorn.py` | 746 | 800 |
| Beregond | Gondor | `units/beregond.py` | 793 | 800 |
| Boromir | Gondor | `units/boromir.py` | 784 | 800 |
| Faramir | Gondor | `units/faramir.py` | 670 | 800 |
| Éomer | Rohan | `units/eomer.py` | 1,177 | 1,200 |
| Éowyn | Rohan | `units/eowyn.py` | 764 | 800 |
| Gamling | Rohan | `units/gamling.py` | 1,195 | 1,200 |
| Háma | Rohan | `units/hama.py` | 790 | 800 |
| Théoden | Rohan | `units/theoden.py` | 1,177 | 1,200 |
| Gandalf | Istari | `units/gandalf.py` | 705 | 800 |
| Radagast | Istari | `units/radagast.py` | 781 | 800 |
| Saruman | Istari | `units/saruman.py` | 685 | 800 |
| Gorbag | Orc | `units/gorbag.py` | 672 | 800 |
| Gothmog | Orc | `units/gothmog.py` | 694 | 800 |
| Grishnákh | Orc | `units/grishnakh.py` | 639 | 800 |
| Lurtz | Orc | `units/lurtz.py` | 696 | 800 |
| Sharku | Orc | `units/sharku.py` | 1,105 | 1,200 |
| Uglúk | Orc | `units/ugluk.py` | 728 | 800 |
| Khamûl | Nazgûl | `units/khamul.py` | 1,102 | 1,200 |
| Ringwraith | Nazgûl | `units/ringwraith.py` | 511 | 800 |
| Witch-king | Nazgûl | `units/witch-king.py` | 1,176 | 1,200 |
| Treebeard | Ent | `units/treebeard.py` | 1,659 | 2,000 |
| Sauron | Dark Lord | `units/sauron.py` | 1,164 | 2,000 |

## Building a model

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/units/gimli.py
```

This writes `packages/client/public/models/gimli.glb`. Add `-- <out.glb>` to write it somewhere else. `pnpm models` rebuilds every unit, and `pnpm models gimli frodo` only those; the builds are reproducible, so rebuilding an unchanged script leaves its `.glb` as it was. `finish()` fails a model over its triangle budget, without a `team` material, with an image texture or with a material more metallic than 0.15. It warns when the model doesn't stand on the origin or reaches outside its hex.

## Previewing

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/preview.py -- packages/client/public/models/gimli.glb /tmp/models/gimli
```

This writes a PNG for each view and `sheet.png` with all of them. Add `--quick` to render only the three-quarter view, and `--fit` to frame the model alone instead of in the box every model shares. Add `--culled` to draw every material single-sided, as three.js would if the client culled back faces: a face wound inside out, which the double-sided export hides, shows as a hole.
