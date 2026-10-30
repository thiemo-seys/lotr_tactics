# Models

The game's 3D models of units, monsters and summons, in the Faceted style (`docs/viewer-spec.md` section 4). Each model is a Blender 4.5 LTS script that exports a glTF binary to `packages/client/public/models/<id>.glb`, named by its id in `packages/sim`. The scripts are the source. The `.glb` files are committed, because CI and other machines don't have Blender. The client doesn't load them yet.

- `kit.py`: what the models share: the team colour, the budgets, the shared palette, materials, the geometry helpers, and `finish()`, which joins, checks and exports a model.
  - Besides straight tubes and boxes, its helpers build bent forms such as limbs, tails, staves, braids and bows (`bent_tube()` on `path_rings()`, wound with `nearest_on_polyline()`), points such as spikes, claws, tines and pommels (`cone()`), and rough rocks and clumps of leaves (`lump()`); and they pose parts built upright: `lean()` forward, `turn()` sideways and `stoop()`, a bend that grows with height.
- `mounts.py`: the horse Riders sit on, Éomer's, built from its coat and points, markings, tack (the saddle-cloth or a caparison), a raised foreleg or none, and the turn of its head. `horse()` returns where the rider sits, where his feet hang and where the reins start; `units/eomer.py` shows how to seat him.
- `preview.py`: renders a model with Cycles for review, in both team colours and from every side.
- `units/`: one script per unit. Gimli (`gimli.py`) is the reference model.
- `style-study/`: the study that chose the style, kept as it was.

## Units

| Unit | People | Script | Triangles |
|---|---|---|---|
| Gimli | Dwarf | `units/gimli.py` | 793 |

## Building a model

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/units/gimli.py
```

This writes `packages/client/public/models/gimli.glb`. Add `-- <out.glb>` to write it somewhere else. `finish()` fails a model over its triangle budget, without a `team` material, with an image texture or with a material more metallic than 0.15. It warns when the model doesn't stand on the origin or reaches outside its hex.

## Previewing

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/preview.py -- packages/client/public/models/gimli.glb /tmp/models/gimli
```

This writes a PNG for each view and `sheet.png` with all of them. Add `--quick` to render only the three-quarter view, and `--fit` to frame the model alone instead of in the box every model shares. Add `--culled` to draw every material single-sided, as three.js would if the client culled back faces: a face wound inside out, which the double-sided export hides, shows as a hole.
