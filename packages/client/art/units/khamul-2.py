"""Khamûl the Easterling, second of the Nine, with his lance: his 2★ model, with its gear
(docs/viewer-spec.md section 4, "Star levels").

Built on khamul.py, the same Black Rider hunting through the Shire on the same great black horse: the
peaked black hood round a faceless dark with the faint gleam of two eyes, the ragged mantle, the
rim of the hood and the horse's caparison in the team colour, the long grey robe and the haggard
grey hands, leaning forward in the saddle, the reins gathered in his left hand. The one piece of
gear: in place of the raised sword, a black lance for the charge he rides in the game (Shadow ride,
docs/design.md section 5), held high in his right hand, leaning up and out to his right and a little
forward, its butt by his hip. Its long head of cold, pale steel rises above his hood beside it and
its black shaft runs down past his fist, so it reads from in front and from behind, and it is not
the Ringwraith's sword (ringwraith-2.py) again. Its socket and the shoe of its butt are `trim`, with
the clasp at his throat, the stirrups, the bosses on the caparison and the horse's browband, which
the client colours silver at 2★.

It is rigged as the 1★ is: this script imports khamul.py and builds him and his horse with the lance
in place of the sword, through the 1★'s right fist and bound to his hand (khamul.build()), then
finishes them with the 1★'s rig, so they have the same bones and clips and move as they do at 1★
(../README.md, Gear models). What the hand holds stays the sword (khamul.sword()), so the clips aim
the lance as they aim the sword.

Main's 2★ model, built before the rig, moved his right arm out to his side, the forearm forward, to
hold a lance 1.4 long, its head 0.97 above his fist and its butt 0.43 below. This one keeps the 1★'s
arm and runs the lance through its fist along the sword's line, and the lance is shorter (LANCE
below), since the 1★'s clips already hold the sword's point at the edge of the hex as he gallops,
charges and cuts: a head reaching further made fit() draw his arm in by up to 113 degrees, which
undid the cut and the charge and put the shaft through his hood as the charge levels it, and main's
butt went up through his hood and his chest as he lets the lance down in `stun`.

    blender --background --factory-startup --python-exit-code 1 --python khamul-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import MOUNTED_GEAR_BUDGET, V, cone, finish, loft, material, part, tube  # noqa: E402

khamul = importlib.import_module('khamul')  # the 1★ model, which this one is with his gear
M = khamul.M  # his materials, made as he builds

SHAFT = 0x3A3533  # the lance's black shaft, lifted just enough to show against the cloak


# The lance, in the right hand ---------------------------------------------------------------------

# Along the line of the sword it takes the place of, up, out to his right and a little forward, its
# point where the sword's is, so the clips keep it in the hex as they keep the sword (the docstring
# says why), and its butt as far below his fist as stays out of his chest and hood as he lets it down
# in `stun` (0.3 put it 8 mm into his chest, main's 0.36 into his hood).
LANCE = khamul.SWORD
BUTT, TOP = -0.22, 0.345  # how far down and up the shaft runs from his fist, to the socket
SHAFT_RADII = (0.021, 0.018)  # at the butt and at the socket
SOCKET = 0.05  # how long the trim socket is, up to the head
# The head above the socket: how far along it, its half-width and its half-thickness, to the point.
HEAD = [(0.0, 0.028, 0.02), (0.08, 0.05, 0.017), (0.22, 0.03, 0.012)]
HEAD_LENGTH = 0.34
SHOE = 0.07  # how far the trim shoe at the butt runs to its point


def lance(grip):
    """The lance through the 1★'s right fist at `grip`, made inside its `with bone('hand_r'):`, so it
    goes with the hand."""
    M['shaft'] = material('shaft', SHAFT, roughness=0.7)
    butt, socket = grip + BUTT * LANCE, grip + TOP * LANCE
    tube('lance-shaft', butt, socket, [(0, SHAFT_RADII[0]), (1, SHAFT_RADII[1])], M['shaft'], n=5)
    neck = socket + SOCKET * LANCE
    tube('lance-socket', socket - 0.01 * LANCE, neck, [(0, 0.024), (1, 0.029)], M['trim'], n=6)
    cone('lance-shoe', butt + 0.01 * LANCE, butt - SHOE * LANCE, 0.022, M['trim'], n=5)

    # The flat of the head faces forward and back, where the game's camera sees it.
    width = LANCE.cross(V(0, 1, 0)).normalized()
    side = LANCE.cross(width).normalized()
    rings = []
    for t, w, th in HEAD:
        c = neck + t * LANCE
        rings.append([c + w * width, c + th * side, c - w * width, c - th * side])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    verts.append(neck + HEAD_LENGTH * LANCE)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    part('lance-head', verts, faces, M['blade'], inside=lambda c: neck + (c - neck).dot(LANCE) * LANCE)


def main():
    rig = khamul.build(lance=lance)  # the 1★ Khamûl and his horse, with the lance in his right fist
    finish('khamul-2', budget=MOUNTED_GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
