"""Samwise Gamgee, the Hobbit: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star
levels").

The 1★ Sam (sam.py) with the hood of his elven cloak drawn up. From The Fellowship of the Ring, II 8,
"Farewell to Lórien": each of the Company was given a hood and cloak of the grey stuff the Galadhrim
wove, made to his size, to keep him from the sight of unfriendly eyes. The hood frames his face,
still clasped at the throat with the leaf, his sandy fringe showing under its edge; full over his
curls, it rises to a seam along the top and droops to a soft point behind his head. So the team
colour covers his head too, from the front, from behind and from above.

Everything else is as at 1★: the team colour on the cowl round his shoulders and the cloak under the
pack, and `trim` on his fittings: the sword's cross-guard and pommel, the setting behind the leaf
clasp and the pack's buckles.

It is rigged as the 1★ is: this script imports sam.py, builds him with the hood drawn up in place of
the hood thrown back, bound to his head (sam.build()), and finishes him with the 1★'s rig, so he has
the same bones and clips and moves as he does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python sam-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, finish, loft, material, part  # noqa: E402

sam = importlib.import_module('sam')  # the 1★ model, which this one is with its gear
M = sam.M  # its materials, made as it builds

LINING = 0x434B3C  # the grey-green of an elven cloak, in the shadow inside the hood


# The gear for 2 stars: the hood drawn up ---------------------------------------------------------

# Arches from the edge round his face back over his head to the back of the hood, each from the
# neckline on his left (+X) over the top to the neckline on his right: the left half's points from
# the bottom up, which the right half mirrors. The hood is full, with room for his curls; its two
# halves meet in a seam along the top, so it rises to a ridge, and the last arch closes to its
# point, which droops behind his head.
HOOD = [
    [(0.04, -0.094, 0.588), (0.118, -0.074, 0.645), (0.152, -0.064, 0.728), (0.136, -0.106, 0.81),
     (0.0, -0.144, 0.852)],  # the edge round his face, meeting at the clasp
    [(0.082, -0.058, 0.59), (0.165, -0.048, 0.64), (0.198, -0.044, 0.73), (0.17, -0.07, 0.83),
     (0.0, -0.104, 0.894)],
    [(0.1, 0.002, 0.596), (0.178, 0.012, 0.646), (0.208, 0.02, 0.732), (0.17, 0.022, 0.83),
     (0.0, 0.024, 0.904)],
    [(0.082, 0.076, 0.61), (0.152, 0.112, 0.652), (0.18, 0.13, 0.726), (0.144, 0.142, 0.81),
     (0.0, 0.154, 0.874)],
    [(0.046, 0.116, 0.62), (0.092, 0.17, 0.662), (0.106, 0.196, 0.716), (0.088, 0.208, 0.77),
     (0.0, 0.222, 0.806)],
]
HOOD_POINT = V(0, 0.274, 0.705)
HOOD_DEPTH = 0.03, 0.12  # how far back into the hood its lining shows, and how far in to his face


def arch(points):
    """An arch from the left half's points, bottom to top, mirrored down the right."""
    left = [V(*p) for p in points]
    return left + [V(-p.x, p.y, p.z) for p in reversed(left[:-1])]


def drawn_hood():
    """The hood of his elven cloak, drawn up over his curls and framing his face, with its lining in
    the shadow just inside the edge: called inside the 1★'s `with bone('head'):`, before he leans."""
    M['lining'] = material('lining', LINING, roughness=0.9)
    arches = [arch(points) for points in HOOD]
    verts, faces, _ = loft(arches, closed=False)
    n = len(arches[0])
    last, point = (len(arches) - 1) * n, len(verts)
    verts.append(HOOD_POINT)
    faces += [(last + i, last + i + 1, point) for i in range(n - 1)]
    faces.append((last + n - 1, last, point))  # under the point, from the nape
    part('hood', verts, faces, M['team'], inside=V(0, 0.03, 0.72))

    # The lining, in the shadow just inside the edge, framing his face.
    back, inward = HOOD_DEPTH
    middle = V(0, -0.02, 0.72)
    edge = arches[0]
    inner = [p.lerp(middle, inward) + V(0, back, 0) for p in edge]
    verts, faces, _ = loft([edge, inner], closed=False)
    # Wound to face in, towards his face, as it is seen.
    part('hood-lining', verts, faces, M['lining'], inside=lambda c: 2 * c - V(0, c.y, middle.z))


def main():
    rig = sam.build(hood=drawn_hood)  # the 1★ Sam, with the hood drawn up
    finish('sam-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
