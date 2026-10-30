# Art style study

Gimli built in five art directions, to choose the look of the game's units before modelling the whole roster. Each style is one Blender script. The game doesn't use these models yet.

**Chosen: Faceted**, on 30 October 2026. Its rules are in `docs/viewer-spec.md` section 4. The comparison of all five is kept in [`results/`](results/): open `results/index.html` in a browser for the full page with a 3D turntable, or read [`results/README.md`](results/README.md) on GitHub.

| Style | Script | Triangles | Look |
|---|---|---|---|
| Faceted | `faceted.py` | 793 | Classic low-poly: hard-edged facets, grounded heroic proportions, a muted natural palette. |
| Chibi | `chibi.py` | 797 | A vinyl toy: a big head on a small body, rounded smooth-shaded forms, bright colours. |
| Carved | `carved.py` | 796 | A hand-carved, hand-painted wooden game piece on a plinth in the team colour. |
| Storybook | `storybook.py` | 1,580 | Ink and watercolour: flat colours with an inked outline (an inverted hull of 780 triangles). |
| Minimal | `minimal.py` | 288 | Abstract and faceless: a few bold geometric shapes, told apart by silhouette and colour. |

- `common.py`: what the style scripts share: materials from sRGB hex colours, primitives, and `finish()`, which joins, checks and exports a model.
- `preview.py`: renders a model with Cycles for review, in both team colours and from every side. Single-sided materials, such as an inverted-hull outline, draw as three.js draws them.
- `results/`: the comparison of the five styles as it stood when the choice was made: `index.html` with the models inside it, `README.md` with the same content, and the images.

## Building a style

Needs Blender 4.5 LTS:

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/style-study/faceted.py -- /tmp/style-study/gimli-faceted.glb
```

The model follows the conventions for the game's models: 1 Blender unit is 1 game unit, the origin is the centre of the base, it faces −Y (+Z in the game), the part that shows the team uses a material named `team`, and colour comes from materials, not textures. `finish()` fails a model over its triangle budget or without a `team` material.

## Previewing

```bash
blender --background --factory-startup --python-exit-code 1 --python packages/client/art/style-study/preview.py -- /tmp/style-study/gimli-faceted.glb /tmp/style-study/faceted
```

This writes a PNG for each view and `sheet.png` with all of them. Add `--quick` to render only the three-quarter view.
