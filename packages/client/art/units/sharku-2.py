"""Sharku, the Warg-rider: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels").

The 1★ Sharku (sharku.py) on his warg, plus one piece, a round black shield, strapped to his rein arm
near the elbow with its face turned out to his left and tipped up, so that it shows from in front and
from behind; its rim and boss are bound in `trim`. The rest of the trim is as on the 1★: the cap's
brow band, the blade's guard and pommel, the bands at the top of his bracers and the ring his rein is
tied to.

It is rigged as the 1★ is: this script imports sharku.py, builds him and the warg with the shield on
his left forearm, bound to it (sharku.build()), and finishes them with the 1★'s rig, so they have the
same bones and clips and move as they do at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python sharku-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import MOUNTED_GEAR_BUDGET, V, bone, cone, finish, loft, material, part  # noqa: E402

sharku = importlib.import_module('sharku')  # the 1★ model, which this one is with its gear
M = sharku.M  # its materials, made as it builds

SHIELD = 0x26231F  # his shield, black


# The gear for 2 stars: a round black shield -----------------------------------------------------------
#
# Strapped to his rein arm near the elbow, out to his left of the warg's withers, its face turned out
# to his left and tipped up, so that it shows from in front and from behind and stays clear of the
# warg's head. Black, its rim and boss bound in metal, leather behind.

SHIELD_RADIUS = 0.17
SHIELD_AT = 0.2  # how far along the forearm from the elbow its middle is, near the elbow
SHIELD_OFF = 0.07  # and how far out from the forearm
SHIELD_TILT = 60  # degrees its face is tipped up from facing straight out from the forearm
SHIELD_DEPTH = 0.025  # from its rim at the face back to the leather
SHIELD_DOME = 0.03  # how far the middle of the face stands out from its rim


def rein_forearm():
    """His left elbow and fist, as the 1★'s arms() places them."""
    left = sharku.hunched(V(0.2, 0.07, 0.99))
    fist = sharku.REIN_FIST
    reach = (fist - left).normalized()
    elbow = sharku.bend(left, fist - 0.05 * reach, sharku.UPPER_ARM, sharku.FOREARM, left + V(0.3, 0.1, -0.2))
    return elbow, fist


def shield():
    """The shield, as main drew it, called inside the 1★'s build after his arms. Strapped on, it moves
    with his left forearm."""
    M['shield'] = material('shield', SHIELD, roughness=0.8)
    elbow, fist = rein_forearm()
    along = (fist - elbow).normalized()
    out = V(-along.y, along.x, 0).normalized()  # level and square to the forearm, out to his left
    if out.x < 0:
        out = -out
    up = (V(0, 0, 1) - along.z * along).normalized()
    tilt = math.radians(SHIELD_TILT)
    face = math.cos(tilt) * out + math.sin(tilt) * up
    across = face.cross(along)
    centre = elbow.lerp(fist, SHIELD_AT) + SHIELD_OFF * face
    rim = [centre + SHIELD_RADIUS * (math.cos(a) * along + math.sin(a) * across)
           for a in (math.tau * (k + 0.5) / 8 for k in range(8))]
    back = [p - SHIELD_DEPTH * face for p in rim]
    with bone('forearm_l'):
        part('shield', rim + [centre + SHIELD_DOME * face], [(k, (k + 1) % 8, 8) for k in range(8)], M['shield'],
             outward=face)
        verts, faces, _ = loft([rim, back])
        part('shield-rim', verts, faces, M['trim'], inside=centre - 0.5 * SHIELD_DEPTH * face)
        part('shield-back', back, [tuple(range(8))], M['leather'], outward=-face)
        cone('shield-boss', centre + 0.02 * face, centre + 0.075 * face, 0.045, M['trim'], n=6, back=None)


def main():
    rig = sharku.build(shield=shield)  # the 1★ Sharku and his warg, with the shield
    finish('sharku-2', budget=MOUNTED_GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
