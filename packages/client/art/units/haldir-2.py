"""Haldir, the Elf: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels").

The 1★ Haldir (haldir.py) plus one piece, a coil of hithlain, the rope of the Galadhrim, slung over
his right shoulder and across his body to his left hip, where a band of `trim` binds its turns. The
Galadhrim let down a ladder of such rope from their flet for the Company, bridged the Silverlode with
it, and gave them coils of it for the boats, slender, silken and grey like the elven-cloaks (The
Fellowship of the Ring, II 6 and II 8). The coil crosses his chest and mantle from in front, and his
cloak and long hair from behind, in a mid grey that shows against his pale hair.

Everything else is as at 1★: the team colour on his long cloak, its hood thrown back as a mantle, and
the sash at his waist, and `trim` on his fittings: the leaf that clasps his cloak, the brooch on the
sash's knot, the quiver's mouth and foot, the bands at the bow's grip and the clasp in his hair, and
now the band round the coil.

It is rigged as the 1★ is: this script imports haldir.py, builds him with the coil laid on him as he
stands (haldir.build()), and finishes him with the 1★'s rig, so he has the same bones and clips and
moves as he does at 1★ (../README.md, Gear models). The coil is bound to his spine, but where it lies
on the back of his cloak it follows the cloak's bone (`cape`), so it lifts with the cloak as the cloak
streams behind him when he runs; on his spine there, the cloak swung out over it and hid it.

    blender --background --factory-startup --python-exit-code 1 --python haldir-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import importlib
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, bone, finish, loft, material, nearest_on_line, nearest_on_polyline, part  # noqa: E402

haldir = importlib.import_module('haldir')  # the 1★ model, which this one is with his gear
M = haldir.M  # his materials, made as he builds

ROPE = 0x8A8C85  # hithlain, the grey elven rope: darker than his hair, which it crosses on his back


# The gear for 2 stars: a coil of hithlain -----------------------------------------------------------

# The coil's loop, from over his right shoulder beside his neck down to his left hip, built upright and
# carried into the pose. Each point of it is laid on whatever it crosses there (the mantle, the tunic,
# the cloak or the long hair down his back), found by a ray cast in from outside the loop towards its
# middle, and then pulled taut over the hollows between them. The angles go round the loop from the
# shoulder, down his back first.
COIL_TOP, COIL_BOTTOM = V(-0.115, 0.01, 1.16), V(0.2, 0.02, 0.78)
COIL_ANGLES = [0, 16, 34, 55, 78, 102, 126, 148, 166, 180, 194, 212, 235, 260, 285, 310, 330, 346]
COIL_ACROSS, COIL_RIDGE = 0.036, 0.03  # the half-width of the bundle of turns, and how far it stands out
COIL_BINDING = 180  # where its turns are bound together, at his left hip
COIL_CAPE = 0.4  # it goes with the cloak where it lies on it facing back more than this
# What it lies on, the 1★'s tunic being a skirt on his hips and a chest on his spine; it passes under
# his arms, his head, the bow and the string.
COIL_SURFACES = {'skirt', 'chest', 'mantle', 'hood', 'cloak', 'hair-tail', 'hair-clasp', 'sash-knot',
                 'sash-brooch', 'clasp'}


def lay_on(start, target):
    """The first point on one of COIL_SURFACES on the way from `start` to `target`, and its name."""
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    direction = (target - start).normalized()
    at = Vector(start)
    for _ in range(40):
        hit, location, _, _, obj, _ = bpy.context.scene.ray_cast(depsgraph, at, direction)
        if not hit:
            break
        if obj.name.split('.')[0] in COIL_SURFACES:
            return location, obj.name.split('.')[0]
        at = location + 1e-4 * direction
    raise ValueError(f'nothing to lie on between {start} and {target}')


def coil():
    """The coil, made last in the 1★'s build, laid on him as he stands, and bound to his spine and,
    where it lies on the back of his cloak, to the cloak."""
    M['rope'] = material('rope', ROPE, roughness=0.8)
    middle = (COIL_TOP + COIL_BOTTOM) / 2
    up = (COIL_TOP - middle).normalized()
    back = V(0, 1, 0) - up.y * up
    back.normalize()
    points, outs, on_cloak = [], [], []
    for a in COIL_ANGLES:
        r = math.radians(a)
        d = math.cos(r) * up + math.sin(r) * back
        start, target = haldir.body(middle + 0.7 * d), haldir.body(middle)
        out = (start - target).normalized()
        at, name = lay_on(start, target)
        points.append(at + 0.004 * out)
        outs.append(out)
        on_cloak.append(name == 'cloak' and d.y > COIL_CAPE)
    # Taut: a point in a hollow rises to the line between its neighbours.
    n = len(points)
    for _ in range(3):
        for k in range(n):
            between = (points[k - 1] + points[(k + 1) % n]) / 2
            points[k] = points[k] + max(0.0, (between - points[k]).dot(outs[k])) * outs[k]
    # Across each point, square to the loop and along what it lies on: a flat base on it and a ridge
    # standing out, the outside of the round bundle.
    frames = []
    for k in range(n):
        ahead = (points[(k + 1) % n] - points[k - 1]).normalized()
        out = (outs[k] - outs[k].dot(ahead) * ahead).normalized()
        frames.append((ahead, ahead.cross(out).normalized(), out))

    def ring(p, across, out, ra, ridge):
        return [p + ra * across, p + ridge * out, p - ra * across]

    rings = [ring(p, across, out, COIL_ACROSS, COIL_RIDGE) for p, (_, across, out) in zip(points, frames)]
    caped = [v for r, c in zip(rings, on_cloak) if c for v in r]

    def follows(v):
        return 'cape' if any((v - q).length < 1e-5 for q in caped) else None

    # Slung from his shoulder, it moves with his chest; where it lies on the back of his cloak, it goes
    # with the cloak as it streams behind him, rather than sinking into it.
    with bone('spine', follows=follows):
        verts, faces, _ = loft(rings + rings[:1])
        middles = [p + COIL_RIDGE / 3 * out for p, (_, _, out) in zip(points, frames)]
        part('coil', verts, faces, M['rope'], inside=nearest_on_polyline(middles + middles[:1]))
        # The band of metal binding its turns together at his hip.
        k = COIL_ANGLES.index(COIL_BINDING)
        ahead, across, out = frames[k]
        base = points[k] - 0.004 * out
        rings = [ring(base + t * ahead, across, out, COIL_ACROSS + 0.01, COIL_RIDGE + 0.01) for t in (-0.024, 0.024)]
        verts, faces, _ = loft(rings)
        middle = base + COIL_RIDGE / 3 * out
        part('coil-binding', verts, faces, M['trim'], inside=nearest_on_line(middle, middle + ahead))


def main():
    rig = haldir.build(coil=coil)  # the 1★ Haldir, with the coil over his shoulder
    finish('haldir-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
