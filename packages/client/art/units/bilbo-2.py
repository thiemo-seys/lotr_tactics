"""Bilbo Baggins, the burglar of The Hobbit: his 2★ model, with his gear (docs/viewer-spec.md section
4, "Star levels").

The 1★ Bilbo (bilbo.py) plus one piece, Sting in place of the short broad seax. Bilbo takes it from
the trolls' lair, an elven knife made in Gondolin that is a sword to a hobbit (The Hobbit, "Roast
Mutton" and "Riddles in the Dark"), and names it in Mirkwood after he kills his first spider ("Flies
and Spiders"). It is the same blade as Frodo's (frodo.py), since Bilbo gives it to him in Rivendell:
straight and slender, longer than the seax, with a plain cross-guard. He holds it out in front of
him, as he does when Gollum comes on him in the dark, forward, a little out to his right and a little
up; his other hand still asks the riddle. Plain bright steel, with no glow.

Everything else is as at 1★: the team colour on the borrowed cloak, the cape over his shoulders and
the hood down his back, and `trim` on his fittings: the waistcoat's buttons, the clasp at his throat,
the hood's tassel, and Sting's cross-guard and pommel.

It is rigged as the 1★ is: this script imports bilbo.py, builds him with Sting in his right hand in
place of the seax, bound to it as the seax is (bilbo.build()), and finishes him with the 1★'s rig, so
he has the same bones and clips and moves as he does at 1★ (../README.md, Gear models). Main's 2★
model, built before the rig, moved his right arm out to thrust Sting further to his right; this one
keeps the 1★'s arm and fist, and Sting lies in the fist along the seax's line, the way the clips aim
what that hand holds.

    blender --background --factory-startup --python-exit-code 1 --python bilbo-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import (  # noqa: E402
    GEAR_BUDGET,
    box,
    cone,
    finish,
    loft,
    nearest_on_line,
    part,
    tube,
)

bilbo = importlib.import_module('bilbo')  # the 1★ model, which this one is with its gear
M = bilbo.M  # its materials, made as it builds


# The gear for 2 stars: Sting, in place of the seax ------------------------------------------------

# A straight, slender blade with a ridge down the middle, tapering to a fine point, longer than the
# seax, with a plain cross-guard: the same blade as Frodo's. It lies in the 1★'s fist along the
# seax's line (bilbo.KNIFE), its flat turned as the seax's is (bilbo.KNIFE_ROLL), to face the sky.
# From the guard to the point it is 0.30, not the 0.33 main drew, Frodo's: as he sways dazed (stun)
# his sword hand droops low before him, and the longer blade's point went 12 mm into the ground.
STING_LENGTH = 0.30
# Stations along the blade: fraction of its length, half-width and half-thickness at the ridge.
STING_STATIONS = [(0.0, 0.026, 0.009), (0.55, 0.022, 0.008), (0.86, 0.013, 0.006)]


def sting(fist):
    """Sting from the fist out, called inside the 1★'s `with bone('hand_r'):` in place of the seax:
    returns the seax's point and the way its edge faces, for hold()."""
    along = bilbo.KNIFE
    level = bilbo.V(along.y, -along.x, 0).normalized()
    upright = level.cross(along).normalized()
    if upright.z < 0:
        upright = -upright
    roll = math.radians(bilbo.KNIFE_ROLL)
    width = math.cos(roll) * upright + math.sin(roll) * level
    flat = along.cross(width).normalized()

    guard = fist + 0.055 * along
    rings = []
    for t, w, th in STING_STATIONS:
        c = guard + t * STING_LENGTH * along
        rings.append([c + w * width, c + th * flat, c - w * width, c - th * flat])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    point = guard + STING_LENGTH * along
    verts.append(point)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    part('blade', verts, faces, M['steel'], inside=nearest_on_line(guard, guard + along))

    # A plain cross-guard, a leather grip and a pommel.
    box('guard', guard, [along, width, flat], (0.011, 0.058, 0.016), M['trim'], 0.8)
    end = fist - 0.06 * along
    tube('grip', end, guard, [(0, 0.015), (1, 0.015)], M['leather'], n=4, phase=45)
    cone('pommel', end, end - 0.032 * along, 0.024, M['trim'], n=4, phase=45, back=end + 0.012 * along)

    # What the hand holds stays the seax's, its point and edge as bilbo.seax() has them, so the clips
    # aim his hand as they do at 1★: Sting runs on along nearly the same line.
    u, v = bilbo.SEAX['point']
    seax_guard = fist + 0.056 * along
    return seax_guard + u * along + v * width + 0 * bilbo.SEAX_THICK * flat, -width


def main():
    rig = bilbo.build(blade=sting)  # the 1★ Bilbo, with Sting in place of the seax
    finish('bilbo-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
