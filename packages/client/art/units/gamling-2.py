"""Gamling the Old, of Rohan, on his dark bay horse: his 2★ model, with his gear (docs/viewer-spec.md
section 4, "Star levels").

The 1★ Gamling (gamling.py), the old Rider with the great horn of Helm raised in his left fist, plus
one piece, a long sword at his belt, as the Riders of Rohan wear them ("long swords were at their
belts", The Two Towers, III 2). It hangs on his left side under the raised horn, its pale scabbard
splayed down past the horse's flank and out behind his boot, so it shows from behind beside the cape
and from in front beside his leg. Its cross-guard, pommel, locket and chape are `trim`, with the
fittings of the 1★: the helm's band and spike, the horn's bands, the brooches on his shoulders and
the horse's browband.

It is rigged as the 1★ is: this script imports gamling.py, builds him and his horse with the sword
hung at his left hip, bound to his hips with the belt it hangs from (gamling.build()), and finishes
them with the 1★'s rig, so they have the same bones and clips and move as they do at 1★
(../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python gamling-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import MOUNTED_GEAR_BUDGET, V, bent_tube, bone, box, cone, finish, material, tube  # noqa: E402

gamling = importlib.import_module('gamling')  # the 1★ model, which this one is with his gear
M = gamling.M  # his materials, made as he builds

SCABBARD_LEATHER = 0xA08360  # pale leather, so the sword shows against the dark horse


# The gear for 2 stars: a long sword at his belt ---------------------------------------------------

# "Long swords were at their belts" (The Two Towers, III 2): a long sword in its scabbard, hung from
# his belt on his left side, with the cross-guard at his hip and the scabbard hanging down past the
# horse's flank, splayed out behind his boot, so it shows from behind beside the cape and from in
# front under his raised arm. The hilt and the scabbard's locket and chape are in trim.
SWORD_GUARD = V(0.255, 0.075, 0.905)  # the middle of the cross-guard, at his left hip
SWORD_DOWN = V(0.19, 0.12, -0.56).normalized()  # the way the scabbard hangs: down, out and back
# The scabbard down from the guard: how far along it, and its half-width out from the horse's side,
# the way the cross-guard runs, and its half-depth, from the locket at its mouth to the chape.
SCABBARD = [(0.012, (0.03, 0.017)), (0.085, (0.029, 0.016)), (0.56, (0.024, 0.014)), (0.6, (0.023, 0.014))]
SCABBARD_BANDS = [0, 1, 0]  # the locket and the chape in trim, the scabbard between
SCABBARD_TIP = 0.645  # the point of the chape
GRIP, POMMEL = 0.12, 0.138  # how far up from the guard the grip runs and the pommel sits


def sword():
    """The sword in its scabbard, made after the 1★'s horn and before he leans, on his hips, from
    whose belt it hangs, so it goes with them as they turn in the saddle."""
    M['scabbard'] = material('scabbard', SCABBARD_LEATHER, roughness=0.8)
    down, guard = SWORD_DOWN, SWORD_GUARD
    across = V(1, 0, 0) - V(1, 0, 0).dot(down) * down  # the cross-guard runs out and in, square to it
    across.normalize()
    deep = down.cross(across)
    points = [guard + t * down for t, _ in SCABBARD]
    with bone('hips'):
        bent_tube('scabbard', points, [r for _, r in SCABBARD], [M['trim'], M['scabbard']], SCABBARD_BANDS,
                  n=6, side=across, end=guard + SCABBARD_TIP * down)
        box('cross-guard', guard, [down, across, deep], (0.015, 0.092, 0.018), M['trim'])
        tube('grip', guard, guard - GRIP * down, [(0, 0.017), (1, 0.016)], M['leather'], n=4)
        pommel = guard - POMMEL * down
        cone('pommel', pommel - 0.02 * down, pommel + 0.036 * down, 0.032, M['trim'], n=4,
             back=pommel - 0.058 * down)


def main():
    rig = gamling.build(sword=sword)  # the 1★ Gamling and his horse, with the sword at his belt
    finish('gamling-2', budget=MOUNTED_GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
