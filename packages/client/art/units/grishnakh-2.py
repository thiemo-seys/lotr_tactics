"""Grishnákh, the Orc: a Burglar of Mordor, his 2★ model, with his gear (docs/viewer-spec.md section
4, "Star levels").

The 1★ Grishnákh (grishnakh.py), in the same crouch with his long knife and curved dagger, plus one
piece, a bandolier of knives for a knife-fighter. A broad leather strap is slung over his left
shoulder and across his hump to under his right arm, over the team-colour cape, and three more knives
ride in it across his back in dark sheaths, their hilts up towards his neck, ready to his hand. From
behind, as the near side is seen, the strap and the row of knives cross the cape; from in front,
their hilts rise beyond his hood. Their guards and pommels, like his other fittings, use `trim`.

It is rigged as the 1★ is: this script imports grishnakh.py, builds him with the bandolier laid on
his upright body over the cape and hunched with it (grishnakh.build()), all of it bound to his spine
as the cape and the jerkin it lies on are, and finishes him with the 1★'s rig, so he has the same
bones and clips and moves as he does at 1★ (../README.md, Gear models).

    blender --background --factory-startup --python-exit-code 1 --python grishnakh-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, bent_tube, bone, box, cone, finish, part, tube  # noqa: E402

grishnakh = importlib.import_module('grishnakh')  # the 1★ model, which this one is with its gear
M = grishnakh.M  # its materials, made as it builds
CAPE_HEM_Z = grishnakh.CAPE_HEM_Z


# The gear for 2 stars: a bandolier of knives ------------------------------------------------------
#
# Built on the upright body, as the cape it lies on is, and hunched with it. The strap runs round him
# in a tilted loop, high over his left shoulder and low under his right arm, laid on whatever is
# outermost there: over the cape across his back and his chest, and under it at his right side, where
# it passes below the cape's hem. The knives ride in it across his back, square to it, their hilts
# up towards his neck: the hunch turns them to face the camera behind him, and their hilts reach up
# beyond his hood for the camera in front. All of it lies above his belt, on the jerkin and the cape,
# so it rides his spine with them.

STRAP_Z, STRAP_RISE = 0.735, 0.09  # the height of the strap's middle, and how far it rises to his left
STRAP_WIDTH, STRAP_LIFT = 0.072, 0.012  # its width, and how far it stands off what it lies on
STRAP_STATIONS = 16  # points round the loop, every 22.5 degrees from his left
KNIVES = [62, 90, 118]  # where the knives ride in it, in degrees round from his left (90 is behind)
SHEATH = 0.13  # how far each sheath reaches below the strap's middle
GRIP = 0.09  # the length of each knife's grip, above its guard


def surface(objects):
    """A BVH tree of the given parts, to lay things on them."""
    verts, polys = [], []
    for obj in objects:
        base = len(verts)
        verts += [v.co.copy() for v in obj.data.vertices]
        polys += [[base + i for i in p.vertices] for p in obj.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def lay(tree, at, out):
    """The point of `tree` met coming in towards `at` along -`out`, and its outward normal there."""
    out = Vector(out).normalized()
    hit, normal, _, _ = tree.ray_cast(Vector(at) + 0.6 * out, -out, 1.2)
    if hit is None:
        raise ValueError(f'nothing to lay on at {tuple(at)}')
    return hit, (normal if normal.dot(out) > 0 else -normal)


def hem_at(degrees):
    """The height of the cape's hem at `degrees` round from his left, between its eight points."""
    k = ((degrees - 22.5) % 360) / 45
    i = int(k)
    return CAPE_HEM_Z[i % 8] + (CAPE_HEM_Z[(i + 1) % 8] - CAPE_HEM_Z[i % 8]) * (k - i)


def strap_point(trees, degrees):
    """The middle of the strap at `degrees` round from his left, lifted off what it lies on, and the
    way out there."""
    a = math.radians(degrees)
    z = STRAP_Z + STRAP_RISE * math.cos(a)
    tree = trees['under'] if z < hem_at(degrees) + 0.01 else trees['over']
    hit, normal = lay(tree, V(0, 0.03, z), V(math.cos(a), math.sin(a), 0))
    return hit + STRAP_LIFT * normal, normal


def bandolier():
    """The bandolier, as main drew it, called inside the 1★'s build after the cape, before the hunch.
    Main laid it on the 1★'s torso in one piece; rigged, the torso is the breeches and belt on his hips
    and the jerkin on his spine from a ring inside the belt, so it is laid on both, which are the same
    surface where the strap and the sheaths lie."""
    objects = bpy.data.objects
    torso = [objects['breeches'], objects['jerkin']]
    trees = {'over': surface(torso + [objects['cape']]), 'under': surface(torso)}
    with bone('spine'):  # on the jerkin and the cape, which ride his spine
        stations = [strap_point(trees, 360 * k / STRAP_STATIONS) for k in range(STRAP_STATIONS)]
        verts, faces = [], []
        n = len(stations)
        for k, (c, normal) in enumerate(stations):
            ahead = stations[(k + 1) % n][0] - stations[k - 1][0]
            across = normal.cross(ahead).normalized()
            if across.z < 0:
                across = -across
            verts += [c + 0.5 * STRAP_WIDTH * across, c - 0.5 * STRAP_WIDTH * across]
            faces.append((2 * k, 2 * ((k + 1) % n), 2 * ((k + 1) % n) + 1, 2 * k + 1))
        part('bandolier', verts, faces, M['leather'], inside=lambda c: V(0, 0.03, c.z))

        for degrees in KNIVES:
            c, normal = strap_point(trees, degrees)
            ahead = strap_point(trees, degrees + 4)[0] - strap_point(trees, degrees - 4)[0]
            up = normal.cross(ahead).normalized()
            if up.z < 0:
                up = -up
            lift = 0.014  # each knife lies on the strap, its hilt beyond the strap's upper edge
            mouth = c + (0.5 * STRAP_WIDTH + 0.006) * up + lift * normal
            low, low_normal = lay(trees['over'], c - SHEATH * up, normal)
            knife(f'knife-{degrees}', mouth, low + (STRAP_LIFT + 0.006) * low_normal, up.cross(normal))


def knife(name, mouth, low, side):
    """A sheathed knife from the sheath's tip at `low` to its mouth, the hilt beyond it, its flat
    towards `side`: a dark sheath, a guard and pommel of trim and a leather grip."""
    along = (mouth - low).normalized()
    bent_tube(f'{name}-sheath', [mouth, low], [(0.024, 0.012), (0.015, 0.009)], M['boots'], n=4, phase=45,
              side=side, start='cap', end=low - 0.03 * along)
    guard = mouth + 0.01 * along
    box(f'{name}-guard', guard, [along, side, along.cross(side)], (0.01, 0.036, 0.016), M['trim'])
    top = guard + (0.01 + GRIP) * along
    tube(f'{name}-grip', guard, top, [(0, 0.013), (1, 0.013)], M['leather'], n=4, phase=45)
    cone(f'{name}-pommel', top - 0.006 * along, top + 0.03 * along, 0.019, M['trim'], n=4, phase=45,
         back=top - 0.016 * along)


def main():
    rig = grishnakh.build(bandolier=bandolier)  # the 1★ Grishnákh, with the bandolier
    finish('grishnakh-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
