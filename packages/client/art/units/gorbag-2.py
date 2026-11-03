"""Gorbag, the Orc: an Archer of Minas Morgul, his 2★ model, with his gear (docs/viewer-spec.md
section 4, "Star levels").

The 1★ Gorbag (gorbag.py) plus one piece, an orc-helm of Minas Morgul, like the orc-helms in the
Tower of Cirith Ungol (The Return of the King, VI 1): a close-fitting cap of crude iron on a band of
`trim`, with a beak-like nose-guard and the pale moon of Morgul on its brow. His scalp-lock comes out
through its crown, bound in its ring, and his ears through its sides. Everything else is as at 1★:
the team colour on his ragged cowl and his loincloth, and `trim` on his other fittings, the quiver's
bands, the belt buckle, the vambraces' bands and the ferrules of the bow's grip.

It is rigged as the 1★ is: this script imports gorbag.py, builds him with the helm on his head in
place of the scalp-lock, bound to his head as the lock is and turned with it on his neck
(gorbag.build()), and finishes him with the 1★'s rig, so he has the same bones and clips and moves as
he does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python gorbag-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, finish, loft, part  # noqa: E402

gorbag = importlib.import_module('gorbag')  # the 1★ model, which this one is with its gear
M = gorbag.M  # its materials, made as it builds
h = gorbag.h  # a point of his head, from under his jaw in the head's own measure
HEAD_SCALE = gorbag.HEAD_SCALE


# The gear for 2 stars: an orc-helm of Minas Morgul -------------------------------------------------

# The helm in rings from its rim up, each the outline of the skull at the temples (SKULL's last ring)
# grown round its middle by a factor: the factor, then the height of the side, the back corner, the
# back, the front corner and the front. It sits on his brow in front and comes down over his mane
# behind; its lowest band, between the first two rings, is `trim`.
OUTLINE = [(0.118, 0.015), (0.092, 0.105), (0, 0.13), (-0.092, 0.105), (-0.118, 0.015), (-0.088, -0.08),
           (0, -0.1), (0.088, -0.08)]
OUTLINE_MIDDLE = (0, 0.015)
HELM = [
    (1.3, (0.195, 0.165, 0.15, 0.205, 0.205)),  # the rim
    (1.29, (0.24, 0.21, 0.195, 0.25, 0.25)),  # the top of its band
    (1.12, (0.3, 0.285, 0.27, 0.305, 0.305)),  # the cap rounds in
    (0.6, (0.36, 0.35, 0.345, 0.365, 0.365)),
]
HELM_TOP = (0, 0.03, 0.392)
HELM_BANDS = [0, 1, 1]  # trim, iron


def helm_ring(grow, heights):
    side, corner, back, front_corner, front = heights
    zs = [side, corner, back, corner, side, front_corner, front, front_corner]
    mx, my = OUTLINE_MIDDLE
    return [h(mx + grow * (x - mx), my + grow * (y - my), z) for (x, y), z in zip(OUTLINE, zs)]


def helm():
    """The helm, as main drew it, called inside the 1★'s `with bone('head'):` in place of his
    scalp-lock, so all of it is on his head and turns with it."""
    rings = [helm_ring(grow, heights) for grow, heights in HELM]
    verts, faces, bands = loft(rings)
    face_mats = [HELM_BANDS[b] for b in bands]
    apex, last = len(verts), (len(rings) - 1) * 8
    verts.append(h(*HELM_TOP))
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    face_mats += [1] * 8
    part('helm', verts, faces, [M['trim'], M['iron']], face_mats, inside=h(0, 0.02, 0.22))

    # A beak-like nose-guard from the band down over his brow, in front of his nose.
    verts = [h(-0.026, -0.134, 0.24), h(0, -0.148, 0.245), h(0.026, -0.134, 0.24),
             h(-0.021, -0.19, 0.178), h(0, -0.214, 0.183), h(0.021, -0.19, 0.178), h(0, -0.232, 0.112)]
    faces = [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 6), (4, 5, 6)]
    part('nose-guard', verts, faces, M['iron'], outward=V(0, -1, 0.3))

    # The pale moon of Morgul on its brow, above the nose-guard, with a death's face: two dark eyes.
    centre, out = h(0, -0.13, 0.282), V(0, -0.945, 0.326)
    up = V(0, 0.326, 0.945)
    across = V(1, 0, 0)
    r = 0.034 * HEAD_SCALE
    ring = [centre + r * (math.cos(a) * across + math.sin(a) * up)
            for a in (math.radians(30 + 60 * k) for k in range(6))]
    part('helm-moon', ring + [centre + 0.008 * out], [(k, (k + 1) % 6, 6) for k in range(6)], M['bone'],
         outward=out)
    for s in (-1, 1):
        corners = [(s * 0.006, 0.008), (s * 0.024, 0.01), (s * 0.014, -0.006)]
        verts = [centre + 0.009 * out + HEAD_SCALE * (x * across + z * up) for x, z in corners]
        part(f'helm-moon-eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=out)

    # His scalp-lock comes out through its crown, bound in its ring, swept back.
    root = [h(0.032, 0.03, 0.375), h(0, 0.075, 0.37), h(-0.032, 0.03, 0.375), h(0, -0.015, 0.375)]
    verts = root + [h(0, 0.23, 0.5)]
    part('scalp-lock', verts, [(i, (i + 1) % 4, 4) for i in range(4)], M['hair'], inside=h(0, 0.03, 0.37))
    gorbag.lock_ring(root, verts[4])


def main():
    rig = gorbag.build(helm=helm)  # the 1★ Gorbag, with the helm on his head
    finish('gorbag-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
