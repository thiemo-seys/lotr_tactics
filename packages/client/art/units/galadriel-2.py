"""Galadriel, the Lady of Lórien: her 2★ model, with her gear (docs/viewer-spec.md section 4, "Star
levels").

The 1★ Galadriel (galadriel.py) plus one piece, the circlet she wore when she came down the Silverlode
in her swan-ship to bid the Company farewell: "a circlet of golden flowers was in her hair" (The
Fellowship of the Ring, II 8). It is of the mallorn's gold, its golden leaves and yellow flowers: a
band about her brow with leaves standing up round her head and small flowers between them, the largest
over her forehead, so it crowns her from in front, from behind and from above. Its gold is paler than
her hair, so it shows against it.

Everything else is as at 1★: the team colour on her mantle and her girdle, and `trim` on her
fittings: the brooches and the chain that fasten the mantle, the clasp on the girdle's knot, the cup
the phial stands in, the band about her raised forearm and the clasp that binds her hair.

It is rigged as the 1★ is: this script imports galadriel.py, builds her with the circlet on her head,
bound to it (galadriel.build()), and finishes her with the 1★'s rig, so she has the same bones and
clips and moves as she does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python galadriel-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so her right hand, with the light, is at -X.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, cone, finish, loft, material, part  # noqa: E402

galadriel = importlib.import_module('galadriel')  # the 1★ model, which this one is with her gear
M = galadriel.M  # her materials, made as she builds

GOLD = 0xE6CF86  # the circlet: the mallorn's gold, paler than her hair


# The gear for 2 stars: the circlet of golden flowers ----------------------------------------------

# The band round her head, laid on her brow and hair: eight corners from her left round the back to
# her right and the front, as the head's rings run (x, y, z of its lower edge).
CIRCLET = [(0.126, 0.004, 1.446), (0.101, 0.099, 1.438), (0.0, 0.132, 1.434), (-0.101, 0.099, 1.438),
           (-0.126, 0.004, 1.446), (-0.105, -0.109, 1.446), (0.0, -0.122, 1.458), (0.105, -0.109, 1.446)]
CIRCLET_DEPTH = 0.022  # how tall the band is
# A mallorn leaf, oval with a pointed tip, as (along, across) fractions of its length and half-width:
# its outline up one side to the tip, and the two points of its midrib.
LEAF_OUTLINE = [(0.0, 0.0), (0.28, 1.0), (0.66, 0.82), (1.0, 0.0), (0.66, -0.82), (0.28, -1.0)]
LEAF_RIB = [(0.28, 0.0), (0.66, 0.0)]
LEAF_FACES = [(0, 1, 6), (1, 2, 7), (1, 7, 6), (2, 3, 7), (3, 4, 7), (4, 5, 6), (4, 6, 7), (5, 0, 6)]
LEAF = (0.074, 0.025, 0.36)  # each leaf's length, half-width, and how far it leans out as it rises


def circlet():
    """The circlet of golden flowers, made inside the 1★'s `with bone('head'):`, so it turns with her
    head."""
    M['gold'] = material('gold', GOLD, roughness=0.45, metallic=0.1)
    lower = [V(*p) for p in CIRCLET]
    upper = [p + V(0, 0, CIRCLET_DEPTH) for p in lower]
    verts, faces, _ = loft([lower, upper])
    part('circlet', verts, faces, M['gold'], inside=lambda c: V(0, 0.004, c.z))

    # A mallorn leaf rising from each corner of the band and leaning out, folded along its midrib so
    # its halves catch the light differently; the one over her forehead is the tallest.
    for k, foot in enumerate(upper):
        out = V(foot.x, foot.y - 0.004, 0).normalized()
        length, half, lean = LEAF
        if k == 6:
            length *= 1.3
        rise = (V(0, 0, 1) + lean * out).normalized()
        across = rise.cross(out).normalized()
        base = foot - V(0, 0, 0.01)
        verts = [base + a * length * rise + b * half * across for a, b in LEAF_OUTLINE]
        verts += [base + a * length * rise + 0.007 * out for a, _ in LEAF_RIB]
        part(f'leaf-{k}', verts, LEAF_FACES, M['gold'], outward=out)

    # Yellow flowers on the band between the leaves, five-petalled bosses, and the largest at the front,
    # over her forehead, before the tallest leaf.
    for k, (a, b) in enumerate(zip(upper, upper[1:] + upper[:1])):
        at = a.lerp(b, 0.5) - V(0, 0, 0.5 * CIRCLET_DEPTH)
        out = V(at.x, at.y - 0.004, 0).normalized()
        cone(f'flower-{k}', at, at + 0.012 * out, 0.019, M['gold'], n=5, phase=90, back=None)
    at = upper[6] - V(0, 0, 0.5 * CIRCLET_DEPTH) + V(0, -0.004, 0)
    cone('flower-front', at, at + V(0, -0.02, 0.004), 0.028, M['gold'], n=5, phase=90, back=None)


def main():
    rig = galadriel.build(circlet=circlet)  # the 1★ Galadriel, wearing the circlet
    finish('galadriel-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
