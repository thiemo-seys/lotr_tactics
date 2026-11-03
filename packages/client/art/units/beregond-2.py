"""Beregond, Gondor, Guardian: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star
levels").

The 1★ Beregond (beregond.py) plus one piece, the long spear of a Guard of the Citadel, carried
upright in his shield hand behind the shield. It leans out from his left side, so the shaft and its
broad leaf-shaped head stand clear of the helm's wing from the front and from behind and rise above
it; its socket is `trim`, like the buckle, the sword's guard and pommel and the shield's rim.

Everything else is as at 1★: the team colour on his shield, his mantle and his cape, and `trim` on
his fittings: the belt buckle, the sword's guard and pommel and the binding round the shield's rim.

It is rigged as the 1★ is: this script imports beregond.py, builds him with the spear in his shield
hand, bound to it as the shield is (beregond.build()), and finishes him with the 1★'s rig, so he has
the same bones and clips and moves as he does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python beregond-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, on the sword, is at -X.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, bone, cone, finish, loft, nearest_on_line, part, tube  # noqa: E402

beregond = importlib.import_module('beregond')  # the 1★ model, which this one is with his gear
M = beregond.M  # its materials, made as it builds

# The fist on the grip behind the shield, which also holds the spear.
L_FIST = beregond.on_shield(0, 0.05, -0.066)


# The gear for 2 stars: the long spear of the Guard ------------------------------------------------

# It runs through his left fist behind the shield, the butt held clear of the ground in front of his
# foot, leaning out to his left and back against his shoulder: seen from in front or behind (and so
# from the game's camera on either side of the board) the shaft passes outside the wing on that side
# of his helm and the head rises above it. Its parts as distances along it from the fist: the butt,
# where the shaft meets the socket, the head's base inside the socket, its widest point and its tip.
# Rigged, the spear goes with the shield hand, so two things are changed from main's model. It leans
# back against his shoulder further, (0.29, 0.35) where main had (0.27, 0.25): as he draws the shield
# in for his bash, main's shaft passed through the wing of his helm, and leaning out instead would
# have taken its point out of his hex as he is dazed. And its butt is 10 cm nearer the fist: as the
# hand droops in his daze main's butt went 8 cm into the ground, so fit() would have held the arm up,
# changing the 1★'s clip; now it stays 1 cm above the ground there.
SPEAR = V(0.29, 0.35, 1.0).normalized()
SPEAR_BUTT, SPEAR_SOCKET, SPEAR_HEAD, SPEAR_WIDE, SPEAR_TIP = -0.4, 1.0, 1.045, 1.1, 1.26


def spear():
    with bone('hand_l'):  # held in his shield hand, it moves with the hand, as the shield does
        spear_parts()


def spear_parts():
    d, f = SPEAR, L_FIST
    across = d.cross(V(0, 1, 0)).normalized()  # the head's edges, out to the sides
    thick = across.cross(d).normalized()  # its flats face forward and back
    butt, top = f + SPEAR_BUTT * d, f + SPEAR_SOCKET * d
    tube('shaft', butt, top + 0.01 * d, [(0, 0.017), (0.5, 0.02), (1, 0.019)], M['wood'])
    cone('butt', butt, butt - 0.045 * d, 0.019, M['steel'], back=None)
    # The socket the head is set in, tapering up to it.
    tube('socket', top - 0.02 * d, f + SPEAR_HEAD * d + 0.012 * d, [(0, 0.025), (1, 0.017)], M['trim'])
    # The head: broad and leaf-shaped, a flattened diamond in section, to a long point.
    rings = []
    for t, w, k in ((SPEAR_HEAD, 0.016, 0.011), (SPEAR_WIDE, 0.046, 0.013)):
        c = f + t * d
        rings.append([c + w * across, c + k * thick, c - w * across, c - k * thick])
    verts, faces, _ = loft(rings)
    verts.append(f + SPEAR_TIP * d)
    faces += [(4 + i, 4 + (i + 1) % 4, 8) for i in range(4)]
    part('spear-head', verts, faces, M['steel'], inside=nearest_on_line(f, f + d))


def main():
    rig = beregond.build(spear=spear)  # the 1★ Beregond, with the spear in his shield hand
    finish('beregond-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
