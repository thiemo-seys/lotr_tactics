"""Legolas, the Elf: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels").

The 1★ Legolas (legolas.py) with one piece in place of his own quiver, the quiver of the Galadhrim
that came with the bow Galadriel gave him, "With it went a quiver of arrows" (The Fellowship of the
Ring, II 8). It is longer and wider than his own, in the grey of the Galadhrim, with three bands and a
rim of `trim`, and full: a sheaf of arrows stands out of its mouth above his right shoulder. From
behind it crosses his cloak from his left hip to his shoulder; from in front its arrows fan out beside
his head. The bow is the read of his 3★ model (legolas-3.py), so the gear leaves it as it is.

Everything else is as at 1★: the team colour on his short Lórien cloak and the baldric across his
chest, and `trim` on his fittings: the leaf clasp, the baldric's buckle and the collars at the bow's
grip, and now the quiver's bands and rim.

It is rigged as the 1★ is: this script imports legolas.py, builds him with this quiver in place of
his own, bound to his spine as his own is (legolas.build()), and finishes him with the 1★'s rig, so
he has the same bones and clips and moves as he does at 1★ (../README.md, Gear models). His shot
fetches a fresh arrow from where his own quiver's mouth is, which is inside this one, below its
mouth, so his clips are the 1★'s key for key.

    blender --background --factory-startup --python-exit-code 1 --python legolas-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, finish, frame, loft, material, part, segment, tube  # noqa: E402

legolas = importlib.import_module('legolas')  # the 1★ model, which this one is with his gear
M = legolas.M  # his materials, made as he builds

QUIVER = 0x7D8070  # the grey of the Galadhrim


# The gear for 2 stars: the quiver of the Galadhrim ----------------------------------------------
#
# The quiver that came with Galadriel's bow, "a quiver of arrows" (The Fellowship of the Ring, II 8),
# in place of his own: longer and wider, in the grey of the Galadhrim, banded with trim and full of
# arrows. It hangs on his back from his left hip to above his right shoulder, so its arrows stand up
# beside his head. Built upright, before his body turns, as his own quiver is.
QUIVER_FOOT, QUIVER_TOP = V(0.085, 0.236, 0.72), V(-0.2, 0.19, 1.27)
QUIVER_RADII = 0.056, 0.072  # at the foot and the mouth
QUIVER_BANDS = 0.12, 0.5, 0.86  # how far up it each band is
# The arrows in it, fanned out of the mouth: across, other way across and how far each leans.
SHEAF = [(0.04, 0.0, 0.3), (-0.038, 0.02, -0.28), (-0.012, -0.044, -0.06), (0.016, 0.046, 0.1), (0.0, 0.0, 0.0),
         (0.03, -0.03, 0.2), (-0.03, -0.02, -0.18), (-0.02, 0.04, -0.1), (0.028, 0.03, 0.16)]


def quiver():
    """The quiver of the Galadhrim, made inside the 1★'s `with bone('spine'):` in place of his own."""
    M['quiver'] = material('quiver', QUIVER, roughness=0.85)
    foot, top = QUIVER_FOOT, QUIVER_TOP
    low, high = QUIVER_RADII
    along = (top - foot).normalized()
    tube('quiver', foot, top, [(0, low), (1, high)], M['quiver'], n=6)
    for k, t in enumerate(QUIVER_BANDS):
        r = low + (high - low) * t + 0.007
        tube(f'quiver-band-{k}', foot.lerp(top, t - 0.035), foot.lerp(top, t + 0.035), [(0, r), (1, r)], M['trim'], n=6)
    # A rounded foot, and a rim of trim round the mouth.
    ring = segment(foot, top, [(0, low)], 6)[0]
    verts = ring + [foot - 0.04 * along]
    part('quiver-foot', verts, [(i, (i + 1) % 6, 6) for i in range(6)], M['quiver'], inside=foot)
    rim = segment(top - 0.04 * along, top + 0.01 * along, [(0, high + 0.008), (1, high + 0.008)], 6)
    verts, faces, _ = loft(rim)
    faces.append(tuple(range(6, 12)))
    part('quiver-rim', verts, faces, M['trim'], inside=top - 0.02 * along)
    # The fletching of the arrows standing out of the mouth, each two crossed vanes.
    across, other = frame(along)
    for k, (du, dv, tilt) in enumerate(SHEAF):
        base = top + du * across + dv * other - 0.01 * along
        up = (along + tilt * across + 0.5 * tilt * other).normalized()
        legolas.fletching(f'fletching-{k}', base, up, 0.22, 0.03)


def main():
    rig = legolas.build(quiver=quiver)  # the 1★ Legolas, with the quiver of the Galadhrim
    finish('legolas-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
