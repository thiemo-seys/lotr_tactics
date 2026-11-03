"""Éomer, a Rider of Rohan on his horse: his 2★ model, with his gear (docs/viewer-spec.md section 4,
"Star levels").

The 1★ Éomer (eomer.py) plus one piece, a round shield of the Riders on his left arm ("painted
shields", The Two Towers, III 2), its boss overlaid with gold like those of the round shields of
Meduseld (III 6). It is strapped on the forearm whose hand keeps the reins and turned out to his
left: its face, painted the muted green of Rohan, and its `trim` boss show from the front, and its
leather back inside the `trim` rim, bound over the edge, shows past his cape from behind. The face is
plain, leaving the white horse on green to the royal banner of his 3★ (eomer-3.py). His other
fittings, the belt buckle, the helm's band, the spear's socket and the horse's browband, are `trim`
too.

It is rigged as the 1★ is: this script imports eomer.py, builds him and his horse with the shield on
his left forearm, bound to it (eomer.build()), and finishes them with the 1★'s rig, so they have the
same bones and clips and move as they do at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python eomer-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import MOUNTED_GEAR_BUDGET, V, bone, finish, loft, material, newell, part  # noqa: E402

eomer = importlib.import_module('eomer')  # the 1★ model, which this one is with its gear
M = eomer.M  # its materials, made as it builds
LEAN = eomer.LEAN

SHIELD = 0x4A6340  # the shield's painted face: the green of Rohan, deeper than his tunic, still muted


# The gear for 2 stars: a round shield of the Riders, on his left arm -------------------------------

# "Painted shields" (The Two Towers, III 2), round, with a boss "overlaid with gold" like the round
# shields of Meduseld (III 6). It is strapped on the outside of his left forearm, turned out to his
# left and tipped back by his lean, so that it stands about upright once he leans forward: its face
# shows from the front and, past his cape, its back from behind. Built facing -y (forward) round the
# origin as one profile turned round its axis, from the back of the rim over its edge, then down the
# green face to the boss: radius and y. The rim is bound over the edge, so it shows from both sides,
# round the leather that faces the boards behind.
# Its middle, outside his left forearm, before he leans. Main's 2★ model, built before the rig, set
# the forearm out 4 cm to carry it; this one keeps the 1★'s arm and moves the shield in with it, so it
# sits on the forearm as it did there.
SHIELD_CENTRE = V(0.3075, -0.07, 0.975)
SHIELD_TURN = Matrix.Rotation(math.radians(45), 3, 'Z') @ Matrix.Rotation(math.radians(-LEAN), 3, 'X')
SHIELD_SIDES = 12
SHIELD_PROFILE = [
    (0.208, 0.016),  # the inner edge of the rim behind, round the leather back
    (0.24, 0.0),  # the outer edge
    (0.21, -0.02),  # the inner edge of the rim in front, where the green face starts
    (0.056, -0.034),  # the foot of the boss
]
SHIELD_BANDS = [1, 1, 0]  # trim rim, behind and in front, and the green face
BOSS = -0.09  # how far forward the boss's point stands


def shield():
    n = SHIELD_SIDES

    def ring(r, y):
        angles = (math.tau * (i + 0.5) / n for i in range(n))
        return [V(r * math.cos(a), y, r * math.sin(a)) for a in angles]

    verts, faces, bands = loft([ring(r, y) for r, y in SHIELD_PROFILE])
    face_mats = [SHIELD_BANDS[b] for b in bands]
    apex, last = len(verts), (len(SHIELD_PROFILE) - 1) * n
    verts.append(V(0, BOSS, 0))
    faces += [(last + i, last + (i + 1) % n, apex) for i in range(n)]
    face_mats += [1] * n
    faces.append(tuple(reversed(range(n))))  # the leather back, wound to match the rim
    face_mats.append(2)
    if newell([verts[i] for i in faces[-2]]).y > 0:  # the boss's point must face forward
        faces = [tuple(reversed(f)) for f in faces]
    placed = [SHIELD_CENTRE + SHIELD_TURN @ v for v in verts]
    M['shield'] = material('shield', SHIELD, roughness=0.85)
    with bone('forearm_l'):  # strapped on, it moves with the forearm
        part('shield', placed, faces, [M['shield'], M['trim'], M['leather']], face_mats)


def main():
    rig = eomer.build(shield=shield)  # the 1★ Éomer and his horse, with the shield
    finish('eomer-2', budget=MOUNTED_GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
