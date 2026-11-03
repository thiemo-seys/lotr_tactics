"""Boromir, Gondor, Captain: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels").

The 1★ Boromir (boromir.py) plus one piece, his helm, which the books give him but don't describe:
when Aragorn, Legolas and Gimli lay him in the boat at Parth Galen, "his helm they set beside him"
(The Two Towers, III 1). It is a helm of Gondor, plain and high-crowned, without the sea-bird wings
of the Guards of the Citadel: a tall faceted bowl of steel on a brow band of `trim`, low over his
brow and lower behind, with a neck-guard flaring over his hair. It turns his head from dark hair to
bright steel, seen from behind as well as from the front.

Everything else is as at 1★: the team colour on his mantle and cloak, and `trim` on his fittings: the
shield's rim and boss, the horn's tip and bands, the sword's guard and pommel, the baldric's mount
and the belt buckle.

It is rigged as the 1★ is: this script imports boromir.py, builds him with the helm over his hair,
bound to his head as the hair is (boromir.build()), and finishes him with the 1★'s rig, so he has the
same bones and clips and moves as he does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python boromir-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, finish, loft, part  # noqa: E402

boromir = importlib.import_module('boromir')  # the 1★ model, which this one is with his gear
M = boromir.M  # its materials, made as it builds


# The gear for 2 stars: his helm --------------------------------------------------------------------

# Each ring of eight round his head: its height at the front, at the sides and at the back, then its
# half-width, half-depth and centre y. The lower edge sits just over his brows in front and comes
# down over his hair behind; the brow band, between the first two rings, is `trim`; the bowl rises
# high above his head and closes in a blunt point.
HELM = [
    ((1.318, 1.288, 1.25), 0.166, 0.168, 0.004),  # the lower edge
    ((1.352, 1.324, 1.29), 0.164, 0.166, 0.004),  # the top of the brow band
    ((1.43, 1.43, 1.43), 0.158, 0.16, 0.008),  # the bowl
    ((1.52, 1.52, 1.52), 0.132, 0.136, 0.012),
    ((1.588, 1.588, 1.588), 0.08, 0.084, 0.016),
]
HELM_TOP = V(0, 0.018, 1.628)
HELM_BANDS = [1, 0, 0, 0]  # the brow band in trim, the bowl steel
NECK_GUARD = (0.075, 0.045)  # how far the neck-guard reaches down and out behind


def helm_ring(heights, rx, ry, cy):
    front, side, back = heights
    ring = []
    for i in range(8):
        a = math.radians(22.5 + 45 * i)
        s = math.sin(a)
        z = side + (front - side) * -s if s < 0 else side + (back - side) * s
        ring.append(V(rx * math.cos(a), cy + ry * s, z))
    return ring


def helm():
    rings = [helm_ring(*r) for r in HELM]
    verts, faces, bands = loft(rings)
    face_mats = [HELM_BANDS[b] for b in bands]
    apex, last = len(verts), (len(rings) - 1) * 8
    verts.append(HELM_TOP)
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    face_mats += [0] * 8
    part('helm', verts, faces, [M['steel'], M['trim']], face_mats, inside=lambda c: V(0, 0.01, c.z))

    # The neck-guard: the back of the lower edge, from one side round to the other, flared down and
    # out over his hair.
    down, out = NECK_GUARD
    edge = [rings[0][i] for i in (0, 1, 2, 3)]  # behind his left ear, round the back to his right
    flare = [p + V(0, 0, -down) + out * V(p.x, p.y - 0.004, 0).normalized() for p in edge]
    verts, faces, _ = loft([edge, flare], closed=False)
    part('neck-guard', verts, faces, M['steel'], inside=lambda c: V(0, 0.0, c.z + 0.05))


def main():
    rig = boromir.build(helm=helm)  # the 1★ Boromir, wearing his helm
    finish('boromir-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
