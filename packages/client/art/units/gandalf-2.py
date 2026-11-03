"""Gandalf the Grey, of the Istari: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star
levels").

The 1★ Gandalf (gandalf.py) plus one piece, Glamdring drawn in his free hand, as he stood on the
Bridge of Khazad-dûm, leaning on his staff, while "in his other hand Glamdring gleamed, cold and
white" (The Fellowship of the Ring, II 5). In the book the staff is in his left hand; here it stays in
his right, as on the 1★, and the sword rises from his left fist up beside him, out to his left and
clear of the hat from in front and from behind. The blade is bright, pale steel, never blue and
without a glow; its cross-guard and pommel are `trim`, as are the locket of the empty scabbard at his
hip and his other fittings.

Everything else is as at 1★: the team colour on his hat and his scarf, and `trim` on his fittings.

It is rigged as the 1★ is: this script imports gandalf.py, builds him with Glamdring drawn in his left
fist, bound to it, and the scabbard left empty at his hip (gandalf.build()), and finishes him with the
1★'s rig, so he has the same bones and clips and moves as he does at 1★ (../README.md, Gear models).
Main's 2★ model, built before the rig, raised his left arm to hold the sword up by his head; the 1★
arm rests on the hilt at his hip as he stands, runs and shoots (resting()), and is kept, so here the
fist that rested on the hilt holds the sword drawn, point up, the blade rising past his shoulder.

    blender --background --factory-startup --python-exit-code 1 --python gandalf-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, on the staff, is at -X.
"""

import importlib
import os
import sys

from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, box, finish, loft, material, nearest_on_polyline, part, tube  # noqa: E402

gandalf = importlib.import_module('gandalf')  # the 1★ model, which this one is with his gear
M = gandalf.M  # his materials, made as he builds

BLADE = 0xD6D7D3  # Glamdring: bright steel, "cold and white", never blue


# The gear for 2 stars: Glamdring drawn, in his left fist ---------------------------------------------

# The fist that rests on the hilt at his hip on the 1★ (gandalf.glamdring()) holds it drawn, the blade
# rising up and out to his left, as main's rose from the raised fist, past his shoulder to beside the
# hat's brim.
FIST = gandalf.HILT + 0.075 * gandalf.HILT_DIR
SWORD_UP = V(0.22, -0.14, 1.0).normalized()  # from the hilt to the point
GUARD = 0.062  # how far the cross-guard is above the middle of the fist
GRIP_LENGTH = 0.13  # from the cross-guard to the pommel
BLADE_LENGTH = 0.58
BLADE_WIDTH, BLADE_THICK = 0.034, 0.009  # half-sizes at the cross-guard
POINT = 0.84  # how far along the blade it starts to narrow to its point


def drawn():
    """Glamdring drawn, made inside the 1★'s `with bone('hand_l'):`, so it goes with his fist."""
    M['blade'] = material('blade', BLADE, roughness=0.3, metallic=0.1)
    # The blade's flats face forward and back, so both cameras see its breadth.
    width = SWORD_UP.cross(V(0, 1, 0)).normalized()
    thick = SWORD_UP.cross(width)
    guard = Vector(FIST) + GUARD * SWORD_UP
    box('crossguard', guard, [SWORD_UP, width, thick], (0.014, 0.08, 0.02), M['trim'], 0.8)

    # The blade: a flat diamond in section, straight to where it narrows to its point.
    rings = []
    for t, k in ((0.0, 1.0), (POINT, 0.82)):
        c = guard + t * BLADE_LENGTH * SWORD_UP
        rings.append([c + k * BLADE_WIDTH * width, c + k * BLADE_THICK * thick,
                      c - k * BLADE_WIDTH * width, c - k * BLADE_THICK * thick])
    verts, faces, _ = loft(rings)
    tip = len(verts)
    verts.append(guard + BLADE_LENGTH * SWORD_UP)
    faces += [(4 + i, 4 + (i + 1) % 4, tip) for i in range(4)]
    part('blade', verts, faces, M['blade'], inside=nearest_on_polyline([guard, verts[tip]]))

    # The grip through his fist, and the pommel below it.
    pommel = guard - GRIP_LENGTH * SWORD_UP
    tube('grip', pommel, guard, [(0, 0.016), (1, 0.016)], M['leather'], n=4, phase=45)
    verts = [pommel + 0.026 * d for d in (width, thick, -width, -thick)]
    verts += [pommel + 0.02 * SWORD_UP, pommel - 0.03 * SWORD_UP]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('pommel', verts, faces, M['trim'], inside=pommel)


def main():
    rig = gandalf.build(sword=drawn)  # the 1★ Gandalf, with Glamdring drawn in his left fist
    finish('gandalf-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
