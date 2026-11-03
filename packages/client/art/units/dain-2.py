"""Dáin Ironfoot, Dwarf, Guardian: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star
levels").

The 1★ Dáin (dain.py) plus one piece: the short broad sword the Dwarves of the Iron Hills wore
besides their mattocks ("each of them had also a short broad sword at his side and a round shield
slung at his back", The Hobbit, "The Clouds Burst"). It hangs behind his left hip in a leather
scabbard, slung back across the skirt of his hauberk below his shield, its hilt rising at his left
side behind his elbow: from behind the whole sword reads across his skirt, and from the side its
broad cross-guard. Main's model hung it at his left side, its cross-guard under his elbow, where the
rigged arm goes through it (the comment on SWORD_THROAT below). Its cross-guard, pommel, locket and
chape are `trim`.

Everything else is as at 1★: the team colour on his shield's face, seen from behind, and the tabard
over his hauberk, seen from the front; `trim` on the clasps on his beard's locks, the belt buckle,
the shield's rim and boss and the mattock's socket and butt cap; the crown on his helm in gold.

It is rigged as the 1★ is: this script imports dain.py, builds him with the sword behind his hip, bound
to his hips as the belt it hangs from is (dain.build()), and finishes him with the 1★'s rig, so he
has the same bones and clips and moves as he does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python dain-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, bone, cone, finish, part  # noqa: E402

dain = importlib.import_module('dain')  # the 1★ model, which this one is with his gear
M = dain.M  # its materials, made as it builds
block = dain.block  # a tapered bar, as the mattock's head is made of


# The gear for 2 stars: a short broad sword at his side ---------------------------------------------

# The scabbard hangs behind his left hip from a frog on the belt, slung back and in across the back of
# his hauberk's skirt, its broad cross-guard across his side, so the hilt rises at his left side
# behind his elbow. Main's model, built before the rig, hung it low at his left side, its hilt forward
# under his left elbow and its chape 2.5 cm off the ground. Rigged, it rides his hips, and there his
# left arm went through its hilt: in his blows and his run, as the hand slides on the haft, and all
# through his daze and his fall, as the arm hangs at his side; and its chape went up to 10 cm into the
# ground as his hips sank, which in his fall would have held his hips up off his knees
# (clips.grounded()), changing the 1★'s clip. Behind the hip it clears his arms, his legs and his skirt
# in every frame of the 1★'s clips, and the ground by 3 cm, and its guard just touches the rim of his
# shield as he runs; it is 6 cm shorter, which suits a short sword.
SWORD_THROAT = V(0.265, 0.2, 0.375)
SWORD_DOWN = V(-0.492, 0.413, -0.766).normalized()  # from the throat to the chape: 40 degrees from upright
SWORD_TWIST = 120  # degrees the frog lets it turn, its flats to the side and back and its guard across
SCABBARD = 0.27  # to the chape's point
SCABBARD_HALF = [(0.056, 0.02), (0.046, 0.017)]  # (broad, thick) at the throat and above the chape
CHAPE = 0.07  # how long the chape is
GRIP = 0.072  # and the grip, from the guard to the pommel


def sword():
    with bone('hips'):  # hung from the belt, it moves with his hips, as the skirt of his hauberk does
        sword_parts()


def sword_parts():
    down = SWORD_DOWN
    broad = V(1, 0, 0).cross(down).normalized()  # hung square, the edges would face forward and back
    broad = Matrix.Rotation(math.radians(SWORD_TWIST), 3, down) @ broad
    thick = down.cross(broad)  # the flats
    throat, chape = SWORD_THROAT, SWORD_THROAT + (SCABBARD - CHAPE) * down
    block('scabbard', throat, chape, broad, thick, *SCABBARD_HALF, M['leather'])
    block('chape', chape - 0.012 * down, chape + 0.4 * CHAPE * down, broad, thick,
          (SCABBARD_HALF[1][0] + 0.006, SCABBARD_HALF[1][1] + 0.005), (0.03, 0.016), M['trim'])
    foot = chape + 0.4 * CHAPE * down  # the chape narrows to a point, square to the scabbard
    corners = [foot + sb * 0.03 * broad + st * 0.016 * thick for sb, st in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    part('chape-point', corners + [chape + CHAPE * down], [(i, (i + 1) % 4, 4) for i in range(4)], M['trim'],
         inside=foot)
    block('locket', throat - 0.012 * down, throat + 0.04 * down, broad, thick,
          (SCABBARD_HALF[0][0] + 0.007, SCABBARD_HALF[0][1] + 0.006),
          (SCABBARD_HALF[0][0] + 0.006, SCABBARD_HALF[0][1] + 0.006), M['trim'])

    # The hilt: a broad cross-guard, a leather grip and a heavy pommel.
    up = -down
    guard = throat + 0.026 * up
    block('guard', guard - 0.015 * up, guard + 0.015 * up, broad, thick, (0.118, 0.026), (0.11, 0.024), M['trim'])
    block('grip', guard + 0.014 * up, guard + (0.014 + GRIP) * up, broad, thick, (0.022, 0.02), (0.019, 0.018),
          M['leather'])
    pommel = guard + (0.014 + GRIP) * up
    cone('pommel', pommel - 0.004 * up, pommel + 0.05 * up, 0.042, M['trim'], n=4, phase=45,
         back=pommel - 0.024 * up)


def main():
    rig = dain.build(sword=sword)  # the 1★ Dáin, with the sword at his side
    finish('dain-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
