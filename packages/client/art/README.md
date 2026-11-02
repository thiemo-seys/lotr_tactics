# Models

The game's 3D models of units, monsters and summons, in the Faceted style (`docs/viewer-spec.md` section 4). Each model is a Blender 4.5 LTS script that exports a glTF binary to `packages/client/public/models/<id>.glb`, named by its id in `packages/sim`. The scripts are the source. The `.glb` files are committed, because CI and other machines don't have Blender. The client loads them (`src/models.ts`), with a 2★ `<id>-2.glb` and a 3★ `<id>-3.glb` when they exist (`star-study/`, `docs/viewer-spec.md` section 4).

- `kit.py`: what the models share: the team colour, the budgets, the shared palette, materials, the geometry helpers, and `finish()`, which joins, checks and exports a model.
  - Besides straight tubes and boxes, its helpers build bent forms such as limbs, tails, staves, braids and bows (`bent_tube()` on `path_rings()`, wound with `nearest_on_polyline()`), points such as spikes, claws, tines and pommels (`cone()`), and rough rocks and clumps of leaves (`lump()`); and they pose parts built upright: `lean()` forward, `turn()` sideways and `stoop()`, a bend that grows with height.
- `mounts.py`: the horse the Riders sit on (all but Sharku, whose warg is in `units/sharku.py`), built from its coat and points, markings, tack (the saddle-cloth or a caparison), a raised foreleg or none, and the turn of its head. `horse()` returns where the rider sits, where his feet hang and where the reins start; `units/eomer.py` shows how to seat him.
- `preview.py`: renders a model with Cycles for review, in both team colours and from every side.
- `units/`: three scripts per unit, named by its id: `<id>.py`, `<id>-2.py` and `<id>-3.py`, one for each star level. Gimli (`gimli.py`) is the reference model, and each people has one that the others follow: Frodo for Hobbits, Legolas for Elves, Aragorn for Gondor, Éomer for Rohan, Gandalf for the Istari, Gorbag for Orcs and the Ringwraith for the Nazgûl.
- `style-study/`: the study that chose the style, kept as it was.
- `star-study/`: the study that chose how star levels show, with its comparison page, kept as it was; [`star-study/ROLLOUT.md`](star-study/ROLLOUT.md) is how every unit got its 2★ and 3★ models.

## Star levels

A unit shows its star level on its model (`docs/viewer-spec.md` section 4, "Star levels"), so each unit has three scripts:

- `units/<id>.py`, its 1★ model. Its fittings, such as buckles, clasps, sword guards and the horse's browband, use `trim_material()`, which the client colours iron, silver or gold by star level.
- `units/<id>-2.py`, its 2★ model: the 1★ with one piece of gear added, such as Aragorn's shoulder plates. Its budget is `GEAR_BUDGET` (900), `MOUNTED_GEAR_BUDGET` (1,350) or `LARGE_GEAR_BUDGET` (2,250).
- `units/<id>-3.py`, its 3★ model, the book moment: the unit as itself at its height in the books, such as Frodo in the mithril coat, King Elessar or Éomer King. Its budget is `BOOK_BUDGET` (1,000), `MOUNTED_BOOK_BUDGET` (1,500) or `LARGE_BOOK_BUDGET` (2,500).

Each script's docstring names its gear or its book moment, and the passage of the books it draws on. Frodo, Aragorn and Éomer, from the study, are the references. A new unit can start with its 1★ model alone: until it has the others, the client uses the level below.

## Units

| Unit | People | Script | Triangles | Budget | 2★ | 3★ |
|---|---|---|---|---|---|---|
| Bilbo | Hobbit | `units/bilbo.py` | 749 | 800 | 760 | 874 |
| Frodo | Hobbit | `units/frodo.py` | 754 | 800 | 872 | 918 |
| Gollum | Hobbit | `units/gollum.py` | 790 | 800 | 900 | 930 |
| Merry | Hobbit | `units/merry.py` | 790 | 800 | 884 | 970 |
| Pippin | Hobbit | `units/pippin.py` | 746 | 800 | 830 | 936 |
| Sam | Hobbit | `units/sam.py` | 799 | 800 | 882 | 807 |
| Elrond | Elf | `units/elrond.py` | 668 | 800 | 792 | 892 |
| Galadriel | Elf | `units/galadriel.py` | 669 | 800 | 794 | 970 |
| Haldir | Elf | `units/haldir.py` | 758 | 800 | 872 | 945 |
| Legolas | Elf | `units/legolas.py` | 686 | 800 | 714 | 730 |
| Balin | Dwarf | `units/balin.py` | 791 | 800 | 871 | 980 |
| Dáin | Dwarf | `units/dain.py` | 765 | 800 | 837 | 868 |
| Gimli | Dwarf | `units/gimli.py` | 793 | 800 | 851 | 857 |
| Aragorn | Gondor | `units/aragorn.py` | 746 | 800 | 874 | 962 |
| Beregond | Gondor | `units/beregond.py` | 793 | 800 | 847 | 886 |
| Boromir | Gondor | `units/boromir.py` | 784 | 800 | 862 | 928 |
| Faramir | Gondor | `units/faramir.py` | 742 | 800 | 840 | 788 |
| Éomer | Rohan | `units/eomer.py` | 1,177 | 1,200 | 1,271 | 1,267 |
| Éowyn | Rohan | `units/eowyn.py` | 776 | 800 | 824 | 805 |
| Gamling | Rohan | `units/gamling.py` | 1,191 | 1,200 | 1,261 | 1,329 |
| Háma | Rohan | `units/hama.py` | 798 | 800 | 894 | 938 |
| Théoden | Rohan | `units/theoden.py` | 1,197 | 1,200 | 1,233 | 1,317 |
| Gandalf | Istari | `units/gandalf.py` | 755 | 800 | 785 | 685 |
| Radagast | Istari | `units/radagast.py` | 794 | 800 | 892 | 888 |
| Saruman | Istari | `units/saruman.py` | 749 | 800 | 809 | 917 |
| Gorbag | Orc | `units/gorbag.py` | 744 | 800 | 814 | 900 |
| Gothmog | Orc | `units/gothmog.py` | 742 | 800 | 790 | 886 |
| Grishnákh | Orc | `units/grishnakh.py` | 671 | 800 | 829 | 983 |
| Lurtz | Orc | `units/lurtz.py` | 772 | 800 | 828 | 942 |
| Sharku | Orc | `units/sharku.py` | 1,141 | 1,200 | 1,177 | 1,349 |
| Uglúk | Orc | `units/ugluk.py` | 760 | 800 | 852 | 966 |
| Khamûl | Nazgûl | `units/khamul.py` | 1,148 | 1,200 | 1,154 | 1,223 |
| Ringwraith | Nazgûl | `units/ringwraith.py` | 567 | 800 | 562 | 732 |
| Witch-king | Nazgûl | `units/witch-king.py` | 1,198 | 1,200 | 1,330 | 1,178 |
| Treebeard | Ent | `units/treebeard.py` | 1,794 | 2,000 | 2,104 | 1,786 |
| Sauron | Dark Lord | `units/sauron.py` | 1,264 | 2,000 | 1,372 | 1,628 |

## Building a model

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/units/gimli.py
```

This writes `packages/client/public/models/gimli.glb`. Add `-- <out.glb>` to write it somewhere else. `pnpm models` rebuilds every unit, and `pnpm models gimli frodo` only those, with their 2★ and 3★ models; the builds are reproducible, so rebuilding an unchanged script leaves its `.glb` as it was. `finish()` fails a model over its triangle budget, without a `team` material, with an image texture or with a material more metallic than 0.15. It warns when the model doesn't stand on the origin, reaches outside its hex or has no `trim` material.

## Previewing

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/preview.py -- packages/client/public/models/gimli.glb /tmp/models/gimli
```

This writes a PNG for each view and `sheet.png` with all of them. Add `--quick` to render only the three-quarter view, and `--fit` to frame the model alone instead of in the box every model shares. Add `--culled` to draw every material single-sided, as three.js would if the client culled back faces: a face wound inside out, which the double-sided export hides, shows as a hole.

## On the board

```bash
node packages/client/art/board.mjs /tmp/board/gimli packages/client/public/models/gimli.glb
node packages/client/art/board.mjs /tmp/board/stars --stars <study.json> --unit=0
```

`board.mjs` renders models on the game's board with three.js in headless Chromium, with the client's camera, lights and team colours, so a model can be judged at the size it is played at. `--lineup` puts several side by side, and `--stars` lays a unit out at 1★, 2★ and 3★ with the base, growth, trim and labels the client gives it; `star-study/options/chosen.json` is an example. Its header lists the options.
