# Star-level study

How a unit's star level (1★, 2★, 3★) shows on its model, tried on Frodo (small), Aragorn (standard) and Éomer (mounted) on the game's board. `docs/design.md` section 12, item 2, leaves this open. The task and its background are in [`HANDOFF.md`](HANDOFF.md).

**Not chosen yet.** The comparison page is [`results/index.html`](results/index.html) (open it in a browser). Nothing here is used by the client, and `units/` and `public/models/` are untouched.

## The options

| Option | What it is | Work | Trade-offs |
|---|---|---|---|
| Recommended | 2★ grows 10% (Riders as far as the hex allows), 3★ is the book-moment model, stars stay on the label | client: a scale per star and loading `<id>-3.glb`; art: 36 new models | Riders barely grow at 2★ |
| 1 · Grow | 2★ +10%, 3★ +20% | client only | size compares a unit only with itself; Éomer reaches 0.91 of the hex's 0.94, so he can grow only 3.8% |
| 2 · Base | a low stand: plain, silver or gold rim; pips; or the team colour | client only, built once | says nothing about the character; changes the feel of the board |
| 3 · Trim | fittings recoloured iron, silver, gold | name a `trim` material in all 36 scripts | a few pixels at game size; gold must stay muted |
| 4 · Gear | each star adds a piece (Aragorn only: shoulder plates at 2★) | 72 variants | modest at the default camera |
| 5 · Book moment | 3★ as the unit's own model at its height in the books | 36 new models | says nothing at 2★ on its own |
| 6 · Aura | a faint warm glow at 3★ | client only | looks like a buff or a cast in fights |

## The models

| Model | Script | Triangles | Budget |
|---|---|---|---|
| Frodo 1★ | `frodo.py` | 754 | 800 |
| Frodo 3★: the mithril coat where the elven cloak opens | `frodo-3.py` | 918 | 1,000 |
| Aragorn 1★ | `aragorn.py` | 746 | 800 |
| Aragorn 2★, gear: shoulder plates | `aragorn-2-gear.py` | 874 | 900 |
| Aragorn 3★: King Elessar, winged crown, Arwen's standard | `aragorn-3.py` | 962 | 1,000 |
| Éomer 1★ | `eomer.py` | 1,177 | 1,200 |
| Éomer 3★: Éomer King, crowned helm, royal banner | `eomer-3.py` | 1,267 | 1,500 |

The 1★ scripts are copies of `units/<id>.py` whose fittings use a `trim` material, for the Trim option. The 3★ budget is a placeholder: 25% over the unit's own.

## Files

- `build.sh [name ...]`: builds the scripts here into `models/` with Blender 4.5 LTS.
- `options/*.json`: one layout per option for `board.mjs --stars` (see its header).
- `render.sh <out dir> [option ...]`: renders every option on the board, all three units at the game's camera and each close up.
- `results/`: the comparison page and its pictures (`img/`), including Cycles preview sheets of each model.
