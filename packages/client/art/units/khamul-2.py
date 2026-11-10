"""Khamûl the Easterling, second of the Nine, with his lance: his 2★ model, with its gear
(docs/viewer-spec.md section 4, "Star levels").

Built on khamul.py, the same Black Rider hunting through the Shire on the same great black horse: the
peaked black hood round a faceless dark with the faint gleam of two eyes, the ragged mantle, the
rim of the hood and the horse's caparison in the team colour, the long grey robe and the haggard
grey hands, leaning forward in the saddle, the reins gathered in his left hand. The one piece of
gear: in place of the raised sword, a black lance for the charge he rides in the game (Shadow ride,
docs/design.md section 5), held high in his right hand, leaning up and out to his right and a little
forward, its butt by his hip. Its slim head of cold, pale steel rises above his hood beside it, with a
swallow-tailed pennon in the team colour flying back and in from under the socket, and its black shaft,
thickest at the hand and tapering to the head, runs down past his fist, so it reads from in front
and from behind as a lance, and it is not the Ringwraith's sword (ringwraith-2.py) or Éomer's spear
(eomer.py) again. Its socket and the shoe of its butt are `trim`, with the clasp at his throat, the
stirrups, the bosses on the caparison and the horse's browband, which the client colours silver at
2★.

It is rigged as the 1★ is: this script imports khamul.py and builds him and his horse with the lance
in place of the sword, through the 1★'s right fist and bound to his hand (khamul.build()), then
finishes them with the 1★'s rig, so they have the same bones and clips and move as they do at 1★
(../README.md, Gear models). What the hand holds stays the sword (khamul.sword()), so the clips aim
the lance as they aim the sword.

Main's 2★ model, built before the rig, moved his right arm out to his side, the forearm forward, to
hold a lance 1.4 long, its head 0.97 above his fist and its butt 0.43 below. This one keeps the 1★'s
arm and runs the lance through its fist along the sword's line, its point where the sword's is, so it
is 1.08 long (LANCE below): the 1★'s clips already hold the sword's point at the edge of its room as he
gallops, as the cut swings back out past his right side and as the charge comes down after he sets
off, and a head reaching further made fit() draw his arm in. As main drew it, by up to 113 degrees,
which undid the cut and the charge and put the shaft through his hood as the charge levels it, and
main's butt went up through his hood and his chest as he lets the lance down in `stun`. The room
blows now have ahead (docs/viewer-spec.md section 4, Size) doesn't change that, since those frames
are out to his side, not ahead of him: 2.5 cm further turned his right arm by up to 14 degrees, 5 cm
by 31, 10 cm by 58 and 15 cm by 99, and a head reaching further as he stands made the 2★ model grow
less (0.94 / its reach; 1.06 times, not 1.08, at 10 cm). So it reads as a lance by its make instead:
a slim head 0.24 long, where the first rigged one's was a broad leaf 0.34 long, so more of the shaft
shows above his fist, the shaft tapering to the head, and the pennon.

    blender --background --factory-startup --python-exit-code 1 --python khamul-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
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
# point where the sword's is, so the clips keep it in its room as they keep the sword (the docstring
# says why), and its butt as far below his fist as stays out of his chest and hood as he lets it down
# in `stun` (0.3 put it 7 mm into his chest, main's 0.36 into his hood).
LANCE = khamul.SWORD
POINT = 0.075 + khamul.BLADE_LENGTH  # how far up the shaft from his fist the point is: the sword's point
BUTT = -0.27  # how far down the shaft runs from his fist
SOCKET = 0.05  # how long the trim socket is, up to the head
# The head above the socket: how far along it, its half-width and its half-thickness, to the point.
HEAD = [(0.0, 0.024, 0.017), (0.06, 0.04, 0.014), (0.16, 0.022, 0.01)]
HEAD_LENGTH = 0.24
TOP = POINT - HEAD_LENGTH - SOCKET  # how far up the shaft runs from his fist, to the socket
# The shaft's radius at the butt, just above his fist, where it is thickest, and at the socket.
SHAFT_RADII = (0.02, 0.022, 0.014)
SHOE = 0.07  # how far the trim shoe at the butt runs to its point
# The pennon, flying from under the socket back and in over his left, square to the lance: how far
# down the shaft it runs, how far its upper tail flies and how far its lower tail flies, as a share of
# the upper's, and how many degrees in from straight back it flies. Straight back, its face was edge on
# to the game's camera from behind, so the near side hardly saw it; 60 degrees in turns it to the
# camera from behind and from in front, and keeps it out of his hood in every clip (90 put it 41 mm
# into the hood in the cut and the charge).
PENNON_HEIGHT, PENNON_LENGTH, LOWER_TAIL = 0.13, 0.26, 0.9
PENNON_FLY = 60


def lance(grip):
    """The lance through the 1★'s right fist at `grip`, made inside its `with bone('hand_r'):`, so it
    goes with the hand."""
    M['shaft'] = material('shaft', SHAFT, roughness=0.7)
    butt, socket = grip + BUTT * LANCE, grip + TOP * LANCE
    hand = (-BUTT + 0.08) / (TOP - BUTT)  # just above his fist, along the shaft
    tube('lance-shaft', butt, socket, [(0, SHAFT_RADII[0]), (hand, SHAFT_RADII[1]), (1, SHAFT_RADII[2])],
         M['shaft'], n=5)
    neck = socket + SOCKET * LANCE
    tube('lance-socket', socket - 0.01 * LANCE, neck, [(0, 0.019), (1, 0.024)], M['trim'], n=6)
    cone('lance-shoe', butt + 0.01 * LANCE, butt - SHOE * LANCE, 0.021, M['trim'], n=5)

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

    # The pennon, swallow-tailed, its tails drooping a little down the shaft.
    fly = V(math.sin(math.radians(PENNON_FLY)), math.cos(math.radians(PENNON_FLY)), 0)
    fly -= fly.dot(LANCE) * LANCE
    fly.normalize()
    top = socket - 0.015 * LANCE
    foot = top - PENNON_HEIGHT * LANCE
    upper = top + PENNON_LENGTH * fly - 0.025 * LANCE
    lower = foot + LOWER_TAIL * PENNON_LENGTH * fly - 0.03 * LANCE
    notch = top.lerp(foot, 0.5) + 0.6 * PENNON_LENGTH * fly - 0.02 * LANCE
    part('lance-pennon', [top, foot, upper, notch, lower], [(0, 3, 2), (0, 1, 3), (1, 4, 3)], M['team'],
         outward=LANCE.cross(fly).normalized())


def main():
    rig = khamul.build(lance=lance)  # the 1★ Khamûl and his horse, with the lance in his right fist
    finish('khamul-2', budget=MOUNTED_GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
