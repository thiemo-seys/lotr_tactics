"""Gothmog, the lieutenant of Minas Morgul: an Orc Captain, his 2★ model, with his gear
(docs/viewer-spec.md section 4, "Star levels").

The 1★ Gothmog (gothmog.py) plus one piece, the long black cloak of a captain of Morgul. It hangs from
his shoulders under the ragged mantle, which still lies over it, and falls round his back to a ragged
hem at the ground, flaring wide, so from behind it is a dark mass below the team colour and from in
front it shows either side of his legs. His fittings use `trim`, as on the 1★.

It is rigged as the 1★ is: this script imports gothmog.py, builds him with the cloak (gothmog.build()),
and finishes him with the 1★'s rig, so he has the same bones and clips and moves as he does at 1★
(../README.md, Gear models). The cloak has no bone of its own, as a robe has (../README.md, The
Nazgûl), since a gear model keeps the 1★'s bones: its top, in his shoulders and behind his belt,
rides his spine, and the rest, where it flares and its hem on the ground, the root, where it lies. So
it hangs from his shoulders and stretches to where it falls as he moves.

Main's cloak wrapped round his sides to the front of his hips. Rigged, his bowed knees poked through
its sides as he runs and sways, his fist through its right edge as his cleaver droops by his hip, the
foot of the banner's pole through its left side as he runs, and his feet through its back as he
kneels. So it hangs round his back from behind his left side to behind his right, 15 to 165 degrees
round rather than -14 to 194, and its flare rides the root with its hem, not his hips: then nothing
he moves or holds goes through it in any clip, and from in front it still shows past his legs.

    blender --background --factory-startup --python-exit-code 1 --python gothmog-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, bone, finish, loft, material, part  # noqa: E402

gothmog = importlib.import_module('gothmog')  # the 1★ model, which this one is with its gear
M = gothmog.M  # its materials, made as it builds
leaned = gothmog.leaned

BLACK = 0x2A2627  # his cloak: black, lifted a little so its folds show


# The gear for 2 stars: a captain's long black cloak ---------------------------------------------

# Rings round his back that the cloak is lofted through, from his left side round to his right: z,
# half-width, half-depth and centre y, and whether the ring is on the upright body and leans with it.
# The top ring is hidden in his shoulders under the mantle; the next comes out under the mantle's hem
# behind his belt, inside its rags; the lower two hang straight down, flaring past the skirt to the
# ground.
CLOAK_RINGS = [
    (0.9, 0.25, 0.16, 0.035, True),
    (0.66, 0.25, 0.19, 0.02, True),
    (0.36, 0.35, 0.27, 0.03, False),
    (0.0, 0.48, 0.38, 0.04, False),
]
# Its columns, in degrees round from his left side (90 is behind him): main's ran from -14, before his
# left side, to 194, before his right; these run from behind his left side to behind his right
# (above), clear of his knees, his fists and the banner's pole.
CLOAK_ANGLES = [15 + 18.75 * k for k in range(9)]
CLOAK_FOLD = 0.035  # how far every other column stands out below the mantle, in folds
CLOAK_HEM = [0.13, 0.04, 0.1, 0.03, 0.09, 0.03, 0.1, 0.04, 0.13]  # the ragged hem's height at each


def hung(p):
    """The bone a point of the cloak follows: his spine for the rings on his body, and the root for
    the ring where it flares and for its hem, which lies on the ground. On his hips, the flare came
    down with them as he kneels, and his feet, tucked behind him, went through it."""
    return 'root' if p.z < 0.5 else None


def cloak():
    """The cloak, as main drew it, called inside the 1★'s build once he leans, after the tabard."""
    M['cloak'] = material('cloak', BLACK, roughness=0.95)
    rows = []
    for k, (z, rx, ry, cy, upright) in enumerate(CLOAK_RINGS):
        row = []
        for i, a in enumerate(CLOAK_ANGLES):
            a = math.radians(a)
            fold = 1 + (CLOAK_FOLD / rx if k >= 2 and i % 2 else 0)
            p = V(fold * rx * math.cos(a), cy + fold * ry * math.sin(a), CLOAK_HEM[i] if k == 3 else z)
            row.append(leaned(p) if upright else p)
        rows.append(row)
    verts, faces, _ = loft(rows, closed=False)
    with bone('spine', follows=hung):
        part('cloak', verts, faces, M['cloak'], inside=lambda c: V(0, 0.03, c.z))


def main():
    rig = gothmog.build(cloak=cloak)  # the 1★ Gothmog, with the cloak
    finish('gothmog-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
