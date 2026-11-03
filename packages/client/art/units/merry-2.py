"""Meriadoc Brandybuck, Merry, of Buckland: his 2★ model, with his gear (docs/viewer-spec.md section
4, "Star levels").

The 1★ Merry (merry.py) plus one piece, the small round shield of Rohan which Éowyn gave him when she
armed him for the ride to Gondor (The Return of the King). It is held up before him in his guard
hand, turned out to his left: its face the team colour, so it reads from the front, its rim and boss
`trim`, and its back of wooden boards, seen past his left side from behind.

Everything else is as at 1★: the team colour on the short cloak thrown back off his shoulders and
the scarf, and `trim` on his fittings: the blade's cross-guard and pommel, the belt buckle and the
brooches at his shoulders. The gold damask on the blade is decoration.

It is rigged as the 1★ is: this script imports merry.py, builds him with the shield in his guard
hand, bound to it (merry.build()), and finishes him with the 1★'s rig, so he has the same bones and
clips and moves as he does at 1★ (../README.md, Gear models). Main's 2★ model, built before the rig,
set his guard arm further out to his left to carry the shield; this one keeps the 1★'s arm and holds
the shield where its fist is, a little further in before him.

    blender --background --factory-startup --python-exit-code 1 --python merry-2.py [-- <out.glb>]

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
    WOOD,
    V,
    bone,
    finish,
    loft,
    material,
    newell,
    part,
)

merry = importlib.import_module('merry')  # the 1★ model, which this one is with its gear
M = merry.M  # its materials, made as it builds


# The gear for 2 stars: the small round shield of Rohan, in his guard hand ---------------------------

# Turned out to his left and tipped up, so its face shows from the front and its back, inside the rim,
# from behind. Main drew it turned 18 degrees and tipped 6, held by its middle. On the 1★'s guard arm,
# whose hand falls by his knee and turns over as he dies (`knees`, `dropped`), its upper rim went
# 44 mm into the ground there; turned 30 and tipped 30, and held 1.5 cm above its middle (LOW), it
# comes to rest on the ground instead, and its face shows the more from the front.
SHIELD_TURN = Matrix.Rotation(math.radians(30), 3, 'Z') @ Matrix.Rotation(math.radians(-30), 3, 'X')
SHIELD_SIDES = 12
# The profile turned round its axis, from the back of the rim over its outer edge and down the
# team-coloured face to the boss: radius and y, built facing -y (forward). The rim is bound over the
# edge, so it shows from behind too, round the wooden boards that close the back.
SHIELD_PROFILE = [
    (0.14, 0.014),  # the inner edge of the rim behind, round the boards
    (0.168, 0.0),  # the outer edge
    (0.142, -0.022),  # the inner edge of the rim in front, where the face starts
    (0.052, -0.036),  # the foot of the boss
]
SHIELD_BANDS = [1, 1, 0]  # trim rim, behind and in front, and the team face
BOSS = -0.078  # how far forward the boss's point stands
GRIP = 0.03  # how far behind the shield's middle his fist holds the grip
LOW = 0.015  # how far the shield's middle is below his fist, along its face


def shield(fist):
    """The shield, held by its grip in his guard fist (`fist`, its middle), bound to his left hand."""
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
    faces.append(tuple(reversed(range(n))))  # the boards, wound to match the rim
    face_mats.append(2)
    if newell([verts[i] for i in faces[-2]]).y > 0:  # the boss's point must face forward
        faces = [tuple(reversed(f)) for f in faces]
    centre = fist + SHIELD_TURN @ V(0, -GRIP, -LOW)
    placed = [centre + SHIELD_TURN @ v for v in verts]
    M['wood'] = material('wood', WOOD, roughness=0.85)
    with bone('hand_l'):  # held by its grip, it moves with his fist
        part('shield', placed, faces, [M['team'], M['trim'], M['wood']], face_mats)


def main():
    rig = merry.build(shield=shield)  # the 1★ Merry, with the shield in his guard hand
    finish('merry-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
