"""Uglúk, the Uruk-hai: his 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels").

The 1★ Uglúk (ugluk.py) plus one piece, the great war-horn a captain of the Uruk-hai would sound to
drive his company on the hunt across Rohan (The Two Towers, III 3). It is a great ox-horn, pale, its
mouthpiece and the rim of its bell bound in `trim`, hanging at his right hip from a baldric of dark
leather that runs from under his left pauldron across his chest and his back. It hangs mouthpiece up
outside his thigh, below his sword arm, its bell down, so it reads beside his leg from in front and
from behind, and the baldric crosses the tabard on both sides. The fittings of the 1★ use `trim` as
before.

It is rigged as the 1★ is: this script imports ugluk.py, builds him with the baldric and the horn on
his upright body, leaned with it (ugluk.build()), and finishes him with the 1★'s rig, so he has the
same bones and clips and moves as he does at 1★ (../README.md, Gear models). The baldric rides his
spine with the cuirass and the tabard it lies on, down to where it comes over his belt, and from there
his hips, with the belt and the horn that hangs from it at his hip.

    blender --background --factory-startup --python-exit-code 1 --python ugluk-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, with the sword, is at -X.
"""

import importlib
import math
import os
import sys
from itertools import pairwise

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, '..'), HERE]
from kit import GEAR_BUDGET, V, bent_tube, bone, finish, material, part, path_rings, wind  # noqa: E402

ugluk = importlib.import_module('ugluk')  # the 1★ model, which this one is with its gear
M = ugluk.M  # its materials, made as it builds
TORSO = ugluk.TORSO
surface, surface_ring = ugluk.surface, ugluk.surface_ring

HORN = 0xC2AE86  # his war-horn: a great ox-horn, pale and warm


# The gear for 2 stars: the war-horn ------------------------------------------------------------------

STRAP = 0.028  # half the baldric's width
# Each run of the baldric, down his chest (side -1) and down his back (side 1), built upright like the
# tabard it lies on: from under his left pauldron, (x, z), to his right side over the belt.
STRAP_RUN = ((0.2, 0.975), (-0.205, 0.705))
STRAP_OFF = 0.026  # how far it stands off the torso, over the tabard
BELT_RING = (0.25, 0.2, 0.02)  # the belt's half-width, half-depth and centre y, from belt()
BELT_Z = (0.66, 0.76)  # where the baldric rides over the belt
HANG = V(-0.255, 0.025, 0.655)  # where the two runs meet at his right hip, and the horn hangs
# The horn, from its mouthpiece down to its bell: its centre line and radius at each ring. It curves
# out from his thigh and back in, so it hangs clear of his leg and his sword arm.
HORN_LINE = [V(-0.262, 0.025, 0.676), V(-0.274, 0.025, 0.646), V(-0.316, 0.027, 0.572),
             V(-0.345, 0.03, 0.485), V(-0.345, 0.034, 0.4), V(-0.336, 0.036, 0.35)]
HORN_RADII = [0.016, 0.02, 0.031, 0.045, 0.06, 0.072]
HORN_BANDS = [1, 0, 0, 0, 1]  # the mouthpiece and the bell's rim in trim


def octagon_y(x, rx, ry, cy, side):
    """The y of the front (side -1) or back (side 1) of an octagon set like the torso's rings."""
    angles = (math.radians(a) for a in (202.5, 247.5, 292.5, 337.5))
    corners = [(rx * math.cos(a), ry * math.sin(a)) for a in angles]
    x = min(max(x, corners[0][0]), corners[-1][0])
    for (x0, y0), (x1, y1) in pairwise(corners):
        if x0 <= x <= x1:
            depth = y0 + (x - x0) / (x1 - x0) * (y1 - y0)
            return cy + depth if side < 0 else cy - depth
    raise ValueError(x)


def facet(x, z):
    """Which facet of the torso's front or back is under x at height z, and its band of rings."""
    rx = surface_ring(z)[0]
    corner = 0.383 * rx
    band = sum(z > ring[0] for ring in TORSO)
    return (x > -corner) + (x > corner), band


def strap_run(side):
    """Points down one run of the baldric, on the torso and over the belt, with a point wherever it
    crosses a crease of the torso, so it never dips under the tabard."""
    (x0, z0), (x1, z1) = STRAP_RUN

    def at(t):
        return x0 + t * (x1 - x0), z0 + t * (z1 - z0)

    ts = [0.0, 1.0]
    steps = 64
    for k in range(steps):
        a, b = k / steps, (k + 1) / steps
        if facet(*at(a)) != facet(*at(b)):
            for _ in range(20):  # bisect to the crease
                m = (a + b) / 2
                a, b = (m, b) if facet(*at(a)) == facet(*at(m)) else (a, m)
            ts.append((a + b) / 2)
    points = []
    for t in sorted(ts):
        x, z = at(t)
        y = surface(x, z, side) + side * STRAP_OFF
        if BELT_Z[0] <= z <= BELT_Z[1]:
            belt_y = octagon_y(x, *BELT_RING, side) + side * 0.012
            y = max(y, belt_y) if side > 0 else min(y, belt_y)
        points.append(V(x, y, z))
    return points


def on_belt(p):
    """The bone a point of the baldric follows: his hips where it comes over the belt and down to
    the horn, as the belt does, and otherwise his spine, with the cuirass and the tabard."""
    return 'hips' if p.z < BELT_Z[1] else None


def baldric():
    """A strap of dark leather from under his left pauldron, across his chest and his back, to the
    horn at his right hip, built upright to lean with his body."""
    line = strap_run(-1) + [HANG] + strap_run(1)[::-1]
    verts, faces = [], []
    for k, p in enumerate(line):
        ahead = line[min(k + 1, len(line) - 1)] - line[max(k - 1, 0)]
        rx, ry, cy = surface_ring(min(max(p.z, 0.5), 1.1))
        out = V(p.x / (rx * rx), (p.y - cy) / (ry * ry), 0).normalized()
        if p is HANG:
            out = V(-1, 0, 0)
        across = ahead.cross(out).normalized()
        verts += [p - STRAP * across, p + STRAP * across]
        if k:
            faces.append((2 * k - 2, 2 * k - 1, 2 * k + 1, 2 * k))
    with bone('spine', follows=on_belt):
        part('baldric', verts, wind(verts, faces, inside=lambda c: V(0, 0.02, c.z)), M['leather'])


def horn():
    """The great war-horn, hanging at his right hip: mouthpiece up, curving out and down to its bell,
    whose mouth is dark inside the trim rim. It hangs from the baldric where it comes over his belt,
    so it rides his hips."""
    with bone('hips'):
        bent_tube('horn', HORN_LINE, HORN_RADII, [M['horn'], M['trim']], HORN_BANDS, n=6, start='cap')
        bell = path_rings(HORN_LINE, HORN_RADII, n=6)[-1]
        part('bell', bell, [tuple(range(6))], M['mouth'], outward=HORN_LINE[-1] - HORN_LINE[-2])


def war_horn():
    """The piece, as main drew it, called inside the 1★'s build after his pauldrons, before he leans."""
    M['horn'] = material('horn', HORN, roughness=0.6)
    baldric()
    horn()


def main():
    rig = ugluk.build(horn=war_horn)  # the 1★ Uglúk, with the war-horn and its baldric
    finish('ugluk-2', budget=GEAR_BUDGET, rig=rig.geared())


if __name__ == '__main__':
    main()
