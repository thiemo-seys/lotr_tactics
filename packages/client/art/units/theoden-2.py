"""Théoden in the long cloak of a king: his 2★ model, with his gear (docs/viewer-spec.md section 4,
"Star levels").

Built on theoden.py, the same old king on the same grey Snowmane, Herugrim held high to rally the
Riders and the golden shield on his left arm, with one piece added: a king's long cloak in place of
the 1★ cape. It hangs from under his mantle down his back, over the cantle and the whole of
Snowmane's croup, and falls over the quarters on both sides, the tail coming out from under it; on
his right it sweeps out from the flank under his raised sword arm. Where the 1★ cape is narrow, so
the grey quarters show round it from behind, this covers them, and from in front its sweep shows
past him on the side his shield doesn't hide. It is in the team colour, as the cape was, with the
mantle and the horse's saddle-cloth and breast strap.

His fittings, Herugrim's guard and pommel, the clasps of his cloak, the belt buckle, the shield's
rim, the stirrups and the horse's browband, use `trim`, which the client colours silver at 2★; the
crown and the golden shield's face stay `gold`. His 3★ model is theoden-3.py.

It is rigged as the 1★ is: this script imports theoden.py and builds him and his horse with the
cloak in place of the cape's folds (theoden.build()), then finishes them with the 1★'s rig, so they
have the same bones and clips and move as they do at 1★ (../README.md, Gear models). The cloak is
one sheet over three bones, each row of it on the bone of what it lies on, and it stretches between
them as they move: its top two rows, on his back, on the cape's bone, so it streams behind him from
his shoulders as the cape does; the row at the saddle on his hips, which turn with the saddle; and
the rows over the croup, with the dags, on the horse's body.

    blender --background --factory-startup --python-exit-code 1 --python theoden-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import MOUNTED_GEAR_BUDGET, V, bone, finish, loft, nearest_on_polyline, part  # noqa: E402
from mounts import CLOTH, body_ring, body_row  # noqa: E402

theoden = importlib.import_module('theoden')  # the 1★ model, which this one is with his gear
M = theoden.M  # his materials, made as he builds
LEANING = theoden.LEANING


# The gear for 2 stars: the king's long cloak --------------------------------------------------

# Rows across the cloak from its top, under the mantle, each from its left edge to its right. On his
# back they are arcs round him, as the 1★ cape's (cape() in theoden.py), and lean with him: z at
# the middle and at the edges, half-width, half-depth, centre y, how far short of his sides they
# stop (degrees) and how deep the folds are. The edges fall lower as they come round his hips.
CLOAK_BACK = [
    (1.13, 1.13, 0.27, 0.20, 0.05, 30, 0.0),
    (0.97, 0.975, 0.25, 0.20, 0.07, 22, 0.02),
    (0.85, 0.79, 0.245, 0.21, 0.09, 14, 0.03),
]
# Over the croup they lie across the horse like its cloth: where on the body the row takes its
# shape (y) and where it lies (y), how far it stands off the coat, the height of the hem and how far
# it flares out past the flank on his left, and the same on his right, where it sweeps out from the
# flank under his raised sword arm, so it shows past him from in front.
CLOAK_CROUP = [
    (0.32, 0.34, 0.03, 0.47, 0.06, 0.53, 0.21),
    (0.39, 0.47, 0.04, 0.53, 0.09, 0.6, 0.3),
]
CLOAK_SWEEP = V(-0.06, 0.0, 0.03)  # how far the cloth on his right side lifts off the flank
CLOAK_FOLDS = [0.0, 0.03, 0.0, 0.025, 0.0, 0.025, 0.0, 0.035, 0.0]  # folds standing out across a row
CLOAK_DAGS = [0.06, 0.085]  # how far a dag hangs below the side hem, between each pair of rows
CLOAK_INSIDE = [V(0, 0.05, 1.2), V(0, 0.05, 0.85), V(0, 0.3, 0.6), V(0, 0.6, 0.6)]
# The bone each row rides, from the top: his back on the cape's bone, the row at the saddle on his
# hips, and the rows over the croup on the horse's body. A dag rides the horse with the row below it.
CLOAK_BONES = ['cape', 'cape', 'hips', 'mount_body', 'mount_body']


def cloak():
    """Made once he leans (theoden.build()), as main made it, since it lies over the horse as well as
    down his back: the rows on his back are leaned as he is, and those over the croup are not."""
    rows = []
    for middle, edge, rx, ry, cy, spread, fold in CLOAK_BACK:
        ring = []
        for i in range(9):
            a = math.radians(spread + (180 - 2 * spread) * i / 8)
            k = 1 + (fold / ry if i % 2 else 0)
            z = edge + (middle - edge) * math.sin(a) ** 2
            ring.append(LEANING @ V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rows.append(ring)
    for shape, y, off, left_hem, left_flare, right_hem, right_flare in CLOAK_CROUP:
        ring = [V(p.x, y, p.z) for p in body_ring(*body_row(shape), grow=CLOTH + off)]
        top = (ring[1] + ring[2]) / 2 + V(0, 0, 0.012)
        across = [ring[7], ring[0], ring[1], top, ring[2], ring[3] + 0.4 * CLOAK_SWEEP, ring[4] + CLOAK_SWEEP]
        left, right = across[0], across[-1]
        row = [V(left.x + left_flare, y, left_hem)] + across + [V(right.x - right_flare, y, right_hem)]
        centre = V(0, y, 0.6)
        rows.append([p + fold * V(p.x, 0, p.z - centre.z).normalized() for p, fold in zip(row, CLOAK_FOLDS)])
    verts, faces, _ = loft(rows, closed=False)
    width = len(rows[0])
    bones = [b for b in CLOAK_BONES for _ in range(width)]
    # A dag hanging from the hem between each pair of rows over the horse, on each side.
    for r, drop in zip(range(len(CLOAK_BACK) - 1, len(rows) - 1), CLOAK_DAGS):
        for i in (0, width - 1):
            a, b = r * width + i, (r + 1) * width + i
            verts.append((verts[a] + verts[b]) / 2 - V(0, 0, drop))
            faces.append((a, b, len(verts) - 1))
            bones.append(CLOAK_BONES[r + 1])

    def follows(p):  # the bone of the cloak's nearest vertex, so each row rides its own
        return bones[min(range(len(verts)), key=lambda k: (verts[k] - p).length_squared)]

    # Inside it is his spine, down to the saddle, then the middle of the horse's back to the tail.
    with bone('cape', follows=follows):
        part('cloak', verts, faces, M['team'], inside=nearest_on_polyline(CLOAK_INSIDE))


def main():
    rig = theoden.build(cloak=cloak)  # the 1★ Théoden and Snowmane, with the long cloak
    finish('theoden-2', budget=MOUNTED_GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
