"""Radagast the Brown, of the Istari: his 2★ model, with his gear (docs/viewer-spec.md section 4,
"Star levels").

The 1★ Radagast (radagast.py) plus one piece, a badger at his heel. He "has much lore of herbs and
beasts" (The Fellowship of the Ring, II 2) and "spent his days among the wild creatures" (Unfinished
Tales, "The Istari"). It trots at his right heel, low and broad, its coat grizzled grey-brown and its
legs black, its head white with a black bar over each eye. It is turned a little out from him, so
each of the game's cameras sees it three-quarters on, its barred head included, beside his robe and
clear of it.

Everything else is as at 1★: the team colour on his hat and his sash, and `trim` on his fittings.

It is rigged as the 1★ is: this script imports radagast.py, builds him with the badger at his heel
(radagast.build()), and finishes him with the 1★'s rig, so he has the same bones and clips and moves
as he does at 1★ (../README.md, Gear models). The badger is bound to `root`: it stands where it is
on the ground as he moves, dazed or falling, and goes where the viewer moves him.

    blender --background --factory-startup --python-exit-code 1 --python radagast-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, with the bird, is at -X.
"""

import importlib
import math
import os
import sys

from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, bent_tube, bone, cone, finish, loft, material, part  # noqa: E402

radagast = importlib.import_module('radagast')  # the 1★ model, which this one is with his gear
M = radagast.M  # his materials, made as he builds

BADGER = 0x8A847A  # the badger's grizzled coat, a warm grey
BADGER_WHITE = 0xE2DDD2  # its face and the tips of its ears
BADGER_BLACK = 0x2A2522  # the bars over its eyes, its legs and its belly


# The gear for 2 stars: a badger at his heel ----------------------------------------------------------

BADGER_AT, BADGER_YAW = V(-0.48, 0.0, 0), -30  # where it stands, and how far its nose turns out (degrees)
BADGER_SIZE = 1.25  # it is built small and drawn this much bigger
# Its body and head in rings across it, from its rump to its brow, built nose to -Y: y along it,
# half-width, how far out the edges of its back are (a fraction of the half-width), and the heights
# of its back, its widest part and its belly. Low and broad, a wedge. On the head the back narrows to
# the white stripe between the black bars.
BADGER_RINGS = [
    (0.2, 0.08, 0.55, 0.17, 0.125, 0.08),  # the rump
    (0.08, 0.118, 0.55, 0.226, 0.15, 0.064),  # the haunches
    (-0.08, 0.112, 0.55, 0.218, 0.148, 0.07),  # the shoulders
    (-0.16, 0.076, 0.3, 0.186, 0.132, 0.084),  # the neck, where the white face begins
    (-0.235, 0.066, 0.3, 0.17, 0.124, 0.086),  # the brow, between the ears
]
BADGER_SNOUT = V(0, -0.37, 0.098)
BADGER_TAIL = V(0, 0.275, 0.16)  # its short tail, the point the rump is drawn to
# Each ring's six faces, from its back on its left round its side and belly: upper side, lower side,
# belly, lower side, upper side, back. The coat is grey with a black belly; the head white, barred
# black from the snout over the eyes, with a black throat.
COAT = [0, 0, 2, 0, 0, 0]
MASK = [2, 1, 2, 1, 2, 1]
BADGER_LEGS = [(0.075, -0.09), (-0.075, -0.09), (0.08, 0.1), (-0.08, 0.1)]  # x and y of each leg


def badger():
    """The badger, made last in the 1★'s build, on the ground at his right heel and bound to `root`."""
    M['badger'] = material('badger', BADGER, roughness=0.95)
    M['badger_white'] = material('badger-white', BADGER_WHITE, roughness=0.9)
    M['badger_black'] = material('badger-black', BADGER_BLACK, roughness=0.9)
    mats = [M['badger'], M['badger_white'], M['badger_black']]

    def ring(y, w, back, top, mid, belly):
        return [V(back * w, y, top), V(w, y, mid), V(0.6 * w, y, belly),
                V(-0.6 * w, y, belly), V(-w, y, mid), V(-back * w, y, top)]

    with bone('root'):  # it stands on the ground, whatever he does
        rings = [ring(*r) for r in BADGER_RINGS]
        verts, faces, bands = loft(rings)
        face_mats = [(MASK if b == len(rings) - 2 else COAT)[k % 6] for k, b in enumerate(bands)]
        # The snout and the tail: fans from the first and last rings to a point.
        for centre, first, colours in ((BADGER_SNOUT, (len(rings) - 1) * 6, MASK), (BADGER_TAIL, 0, COAT)):
            verts.append(centre)
            faces += [(first + i, first + (i + 1) % 6, len(verts) - 1) for i in range(6)]
            face_mats += colours
        body = part('badger', verts, faces, mats, face_mats, inside=lambda c: V(0, c.y, 0.14))
        parts = [body]

        # A black nose at the tip of the snout, and its ears, short and round, tipped white.
        parts.append(cone('badger-nose', BADGER_SNOUT + V(0, 0.016, 0.002), BADGER_SNOUT + V(0, -0.012, -0.004),
                          0.017, M['badger_black'], n=4, phase=45, back=None))
        for s in (-1, 1):
            verts = [V(s * 0.03, -0.228, 0.168), V(s * 0.062, -0.222, 0.146), V(s * 0.066, -0.212, 0.196)]
            parts.append(part(f'badger-ear-{s}', verts, [(0, 1, 2)], M['badger_white'], outward=V(0, -1, 0)))

        # Short, thick black legs, a little splayed.
        for k, (x, y) in enumerate(BADGER_LEGS):
            top, foot = V(x, y, 0.11), V(1.15 * x, y - 0.01, 0.0)
            parts.append(bent_tube(f'badger-leg-{k}', [top, foot], [0.03, 0.026], M['badger_black'], n=4, phase=45,
                                   level_end=True))

    place = (Matrix.Translation(BADGER_AT) @ Matrix.Rotation(math.radians(BADGER_YAW), 4, 'Z')
             @ Matrix.Scale(BADGER_SIZE, 4))
    for obj in parts:
        obj.data.transform(place)


def main():
    rig = radagast.build(badger=badger)  # the 1★ Radagast, with the badger at his heel
    finish('radagast-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
