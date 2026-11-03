"""Frodo Baggins, the Ring-bearer: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star
levels").

The 1★ Frodo (frodo.py) plus one piece, the staff Faramir gave him in Ithilien for the road to Mordor
(The Two Towers, IV 7, "Journey to the Cross-roads"): a stout staff of polished wood, shod with iron,
with a carven head through which runs a plaited thong of leather, cut down to a hobbit's height and
newly shod, and made of lebethron, the fair tree beloved of the woodwrights of Gondor. He holds it in
his free left hand beside him, so it rises above his curls: beside the cloak from behind, and beside
him from the front.

Everything else is as at 1★: the team colour on his cloak, and `trim` on his fittings: the staff's
iron shoe and the collar under its head, Sting's cross-guard and pommel, the setting behind the leaf
clasp, the belt buckle and the waistcoat's buttons.

It is rigged as the 1★ is: this script imports frodo.py, builds him with the staff in his left fist,
bound to his hand as the fist is (frodo.build()), and finishes him with the 1★'s rig, so he has the
same bones and clips and moves as he does at 1★ (../README.md, Gear models). Main's 2★ model, built
before the rig, moved his left arm in to plant the staff upright on the ground; this one keeps the
1★'s arm, out to his side, and the staff runs through its fist, held clear of the ground and shorter
than main drew it (the note on STAFF_UP says why).

    blender --background --factory-startup --python-exit-code 1 --python frodo-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import (  # noqa: E402
    GEAR_BUDGET,
    V,
    bent_tube,
    bone,
    finish,
    frame,
    loft,
    material,
    nearest_on_polyline,
    part,
)

frodo = importlib.import_module('frodo')  # the 1★ model, which this one is with its gear
M = frodo.M  # its materials, made as it builds

STAFF_WOOD = 0x9C7449  # the staff's polished wood, lighter than his curls so it shows beside them


# The gear for 2 stars: Faramir's staff, in his left hand -------------------------------------------

# The staff through his left fist, as he stands once he leans: the way it runs up from the fist, and
# how far it reaches below the fist and above it. Main drew it upright and planted on the ground, a
# metre long, with his arm moved in to hold it; on the 1★'s arm, out to his side, the clips swing it
# about with his free hand: low as he sways dazed (stun), where a planted foot went 12 cm into the
# ground, up behind his head as he ducks into his cloak (cast), and across him as he falls (death).
# So it is 0.75 long, its foot held 0.2 below his fist, clear of the ground, and its top 0.55 above,
# still over his curls; and it leans out a little and back, so that as he ducks it rises over his
# head and not through it.
STAFF_UP = V(0.17, 0.3, 0.94).normalized()
STAFF_BELOW, STAFF_ABOVE = 0.2, 0.55
STAFF_SIDES = 6
# The staff from its foot up: (height up the staff, radius) of each ring. The iron shoe, the polished
# shaft up to a metal collar under the head, and the carven head above it, a round knob with a blunt
# top; the head's rings are measured down from the top, as main drew them on a staff 0.997 long.
SHOE = [(0.0, 0.012), (0.065, 0.021)]  # the tip of the shoe, and its top
HEAD = [
    (0.137, 0.02),  # the shaft, up to the collar
    (0.137, 0.025),  # the collar, standing out from the shaft
    (0.109, 0.025),  # its top
    (0.077, 0.036),  # the head, swelling out
    (0.039, 0.034),  # its widest, where the thong runs through
    (0.012, 0.021),  # rounding over
]
STAFF_BANDS = [1, 0, 1, 1, 0, 0, 0]  # the shoe and the collar are trim, the rest wood
CARVED = 5  # the rings from here up turn by half a facet each, so the head reads as carved
# The plaited thong of leather, through a hole from the front of the head to the back: its loop
# hangs round the outer side of the shaft, on his left (+X), so it shows from the front and from
# behind. Its points from the hole at the front down to the bottom of the loop and up to the hole at
# the back, as (x and y from the staff's axis, and how far below the hole); the ends are hidden in
# the head.
HOLE = 0.057  # how far below the top
THONG = [(0.004, -0.026, 0.0), (0.022, -0.034, 0.06), (0.036, 0.0, 0.125), (0.022, 0.034, 0.06),
         (0.004, 0.026, 0.0)]
THONG_RADIUS = 0.0065


def staff(fist):
    """The staff through his left fist (`fist`, its middle, as built before he leans), bound to the
    hand that holds it: built tipped back by his lean, so it stands as STAFF_UP says once he leans."""
    M['wood'] = material('wood', STAFF_WOOD, roughness=0.5)  # polished
    unlean = Matrix.Rotation(math.radians(-frodo.LEAN), 3, 'X')
    up = unlean @ STAFF_UP
    length = STAFF_BELOW + STAFF_ABOVE
    foot = fist - STAFF_BELOW * up
    u, v = frame(up)
    n = STAFF_SIDES
    heights = SHOE + [(length - d, r) for d, r in HEAD]
    rings = []
    for k, (h, r) in enumerate(heights):
        c = foot + h * up
        twist = math.pi / n * max(0, k - CARVED + 1)
        angles = (twist + math.tau * i / n for i in range(n))
        rings.append([c + r * (math.cos(a) * u + math.sin(a) * v) for a in angles])
    verts, faces, bands = loft(rings)
    face_mats = [STAFF_BANDS[b] for b in bands]
    top, last = len(verts), (len(rings) - 1) * n
    verts.append(foot + length * up)
    faces += [(last + i, last + (i + 1) % n, top) for i in range(n)]
    face_mats += [0] * n
    faces.append(tuple(range(n)))  # the shoe's end
    face_mats.append(1)
    axis = nearest_on_polyline([foot + 0.005 * up, verts[top] - 0.005 * up])
    hole = foot + (length - HOLE) * up
    # The thong's loop, hanging straight down from the hole as he stands, on his left.
    down = unlean @ V(0, 0, -1)
    left, ahead = unlean @ V(1, 0, 0), unlean @ V(0, -1, 0)
    points = [hole + x * left - y * ahead + d * down for x, y, d in THONG]
    with bone('hand_l'):  # held in his fist, it moves with his hand
        part('staff', verts, faces, [M['wood'], M['trim']], face_mats, inside=axis)
        bent_tube('thong', points, [THONG_RADIUS] * len(points), M['leather'], n=3)


def main():
    rig = frodo.build(staff=staff)  # the 1★ Frodo, with the staff in his left hand
    finish('frodo-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
