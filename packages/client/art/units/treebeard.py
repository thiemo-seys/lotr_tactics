"""Treebeard, the Ent: a Large Guardian in the Faceted style (docs/viewer-spec.md section 4).

Fangorn, the oldest of the Ents, after the books: a large Man-like, almost Troll-like figure, very
sturdy, with a tall head on hardly any neck, clad in green and grey bark, his arms covered in smooth
brown skin away from the trunk, seven toes on each large foot, and a sweeping grey beard, twiggy at
the roots and mossy at the ends. He guards by sheer mass, broad and planted on root-like feet, with
a boulder in his right hand for Boulder, his ability. Built at full size, about 2.2 to the top of
his head and inside his hex.

Team colour is on what grows on him: the leaves on his head, the moss over his shoulders and the
mossy ends of his beard.

He is rigged (../rig.py) as a Large unit, with three bones of his own: his beard, which hangs from his
chin and sways after him, the leaves on his head, which sway after it, and the boulder, which leaves
his hand when he hurls it and is torn up again from the ground (../clips.py, swaying() and heave). His
legs bend at the knee and his trunk at the waist, where each runs on inside the next, and his arms at
the elbow; slow and heavy, he strides long and low on his root-like feet.

An Ent wears no buckles or clasps, so his trim grows on him: patches of lichen on his bark, on the
plates of his trunk and legs and the back of his head, seen from the front and from behind. They
use `trim`, which the client colours iron, silver or gold by star level (docs/viewer-spec.md
section 4, "Star levels"), as lichen grows grey, silver or gold on an old tree. His 2★ model is
treebeard-2.py, which imports this script and builds him with its young branches (build()), and his
3★ model treebeard-3.py.

    blender --background --factory-startup --python-exit-code 1 --python treebeard.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import random
import sys
from itertools import pairwise

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    LARGE_BUDGET,
    V,
    bone,
    box,
    ellipse,
    finish,
    frame,
    lean,
    loft,
    material,
    on_surface,
    part,
    reset,
    team_material,
    trim_material,
)
from clips import fit, swaying  # noqa: E402
from rig import Rig, hold, joint  # noqa: E402

# Treebeard's colours (sRGB). Nothing here may read as blue or red: the team colour is the only
# saturated part.
BARK = 0x666A5A  # green and grey bark: the plates grey...
FURROW = 0x4D5444  # ...and the furrows between them green
SKIN = 0x7C5A3B  # the smooth brown skin of his arms and face
ROOT = 0x4C4234  # his feet
BEARD = 0xA7A495  # grey
STONE = 0x8A857C
EYE = 0x2B2616  # deep brown...
GLINT = 0x3A4524  # ...shot with a faint green light

M = {}  # materials by name, made once the scene is reset

# Every length below is before SCALE: he is built a little big and scaled down at the end, so that
# the leaves on his head come to about 2.2 and the top of his skull, under them, to about 2.0.
SCALE = 0.92
LEAN = 6  # degrees the body above the hips stoops forward
HIPS = V(0, 0, 0.9)  # the pivot of the lean


def make_materials():
    M.update(
        team=team_material(),
        bark=material('bark', BARK, roughness=0.95),
        furrows=material('furrows', FURROW, roughness=0.95),
        skin=material('skin', SKIN, roughness=0.8),
        root=material('root', ROOT, roughness=0.95),
        beard=material('beard', BEARD, roughness=0.95),
        stone=material('stone', STONE, roughness=0.9),
        eyes=material('eyes', EYE, roughness=0.5, emission=GLINT, emission_strength=1.0),
        # Lichen: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
    )


# Geometry ----------------------------------------------------------------------------------------


def bark(ridges, groove):
    """Where the points of a ring of bark go: for each ridge, the two edges of a flat plate and the
    bottom of the groove after it, pulled in by `groove`. Pairs of (fraction of a turn, radius)."""
    return [((r + f) / ridges, k) for r in range(ridges) for f, k in ((0, 1), (0.5, 1), (0.75, 1 - groove))]


def furrow_mats(faces, n):
    """For a loft of bark() rings of n points: 0 for the faces of the plates, 1 for the furrows."""
    return [0 if f[0] % n % 3 == 0 else 1 for f in faces]


def round_ring(n):
    return [(k / n, 1.0) for k in range(n)]


def path_rings(points, radii, pattern, phase=0.0, squash=1.0):
    """Rings round a bent path, one for each radius, carried along the path without twisting; each
    ring's points are placed by `pattern` (from bark() or round_ring()). There may be more points
    than radii: the rest only steer the last rings."""
    pts = [Vector(p) for p in points]
    dirs = []
    for i in range(len(pts)):
        d = Vector((0.0, 0.0, 0.0))
        if i > 0:
            d += (pts[i] - pts[i - 1]).normalized()
        if i + 1 < len(pts):
            d += (pts[i + 1] - pts[i]).normalized()
        dirs.append(d.normalized())
    u, _ = frame(dirs[0])
    rings = []
    for i, r in enumerate(radii):
        if i > 0:
            u = dirs[i - 1].rotation_difference(dirs[i]) @ u
            u = (u - u.dot(dirs[i]) * dirs[i]).normalized()
        v = dirs[i].cross(u)
        ring = []
        for f, k in pattern:
            a = math.radians(phase) + math.tau * f
            ring.append(pts[i] + k * r * math.cos(a) * u + k * r * squash * math.sin(a) * v)
        rings.append(ring)
    return rings


def nearest_on_path(points):
    """A function giving the point on a polyline nearest to a point."""
    pts = [Vector(p) for p in points]

    def nearest(p):
        best, dist = pts[0], math.inf
        for a, b in pairwise(pts):
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
            q = a + t * ab
            if (p - q).length < dist:
                best, dist = q, (p - q).length
        return best

    return nearest


def limb(name, points, radii, mats, band_mats=None, n=6, phase=0.0, squash=1.0):
    """A faceted tube along a bent path, open at its first ring (hide it inside another part). With
    one more point than radii it closes in a point at the last one, as a finger, toe or twig does."""
    rings = path_rings(points, radii, round_ring(n), phase, squash)
    verts, faces, bands = loft(rings)
    face_mats = [band_mats[b] for b in bands] if band_mats else None
    if len(points) > len(radii):
        tip, last = len(verts), (len(rings) - 1) * n
        verts.append(Vector(points[-1]))
        faces += [(last + i, last + (i + 1) % n, tip) for i in range(n)]
        if face_mats is not None:
            face_mats += [band_mats[-1]] * n
    return part(name, verts, faces, mats, face_mats, inside=nearest_on_path(points))


# An icosahedron, for rocks and clumps of leaves.
GOLDEN = (1 + 5**0.5) / 2
ICO_VERTS = [
    (-1, GOLDEN, 0), (1, GOLDEN, 0), (-1, -GOLDEN, 0), (1, -GOLDEN, 0),
    (0, -1, GOLDEN), (0, 1, GOLDEN), (0, -1, -GOLDEN), (0, 1, -GOLDEN),
    (GOLDEN, 0, -1), (GOLDEN, 0, 1), (-GOLDEN, 0, -1), (-GOLDEN, 0, 1),
]
ICO_FACES = [
    (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
    (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5),
    (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
]


def sphere(subdivisions):
    """Points on the unit sphere and triangles: an icosahedron, each triangle split in four
    `subdivisions` times."""
    verts = [Vector(p).normalized() for p in ICO_VERTS]
    faces = list(ICO_FACES)
    for _ in range(subdivisions):
        middle = {}  # the new point on each edge, by the edge's ends
        split = []
        for a, b, c in faces:
            ab, bc, ca = (midpoint(verts, middle, p, q) for p, q in ((a, b), (b, c), (c, a)))
            split += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = split
    return verts, faces


def midpoint(verts, middle, a, b):
    """The index of the point on the unit sphere halfway between points a and b, added to `verts`
    the first time the edge is split."""
    key = (min(a, b), max(a, b))
    if key not in middle:
        middle[key] = len(verts)
        verts.append(((verts[a] + verts[b]) / 2).normalized())
    return middle[key]


def lump(name, centre, radii, mat, seed, rough=0.1, subdivisions=0, turn=(0, 0, 0)):
    """A rough ball: a sphere() scaled to `radii`, each point pushed in or out by up to `rough`
    (the same every build, from `seed`) and turned by `turn` (degrees about x, y and z). Rocks and
    clumps of leaves."""
    rotation = (
        Matrix.Rotation(math.radians(turn[2]), 3, 'Z')
        @ Matrix.Rotation(math.radians(turn[1]), 3, 'Y')
        @ Matrix.Rotation(math.radians(turn[0]), 3, 'X')
    )
    centre = Vector(centre)
    unit, faces = sphere(subdivisions)
    jitter = random.Random(seed)
    verts = []
    for p in unit:
        k = 1 + jitter.uniform(-rough, rough)
        verts.append(centre + rotation @ V(k * p.x * radii[0], k * p.y * radii[1], k * p.z * radii[2]))
    return part(name, verts, faces, mat, inside=centre)


# Feet and legs -----------------------------------------------------------------------------------

# Planted wide, the left foot forward and the right back, under the weight of the boulder. Each leg
# is a short trunk from the hip through the knee, flaring at the foot like the foot of a tree. The knees
# are a little forward of the line from hip to ankle, so they bend forward.
LEGS = [  # side, hip, knee, ankle, the foot's yaw (degrees, toes turned out)
    ('right', V(-0.16, 0.03, 0.98), V(-0.255, 0.01, 0.56), V(-0.31, 0.1, 0.07), -16),
    ('left', V(0.16, -0.01, 0.98), V(0.265, -0.11, 0.56), V(0.31, -0.1, 0.07), 14),
]
LEG_RADII = [0.18, 0.145, 0.165, 0.175]  # hip, knee, low on the shin, ankle
# The thigh runs on this far past the knee, and the shin starts this far above it, inside the thigh and
# this much narrower, so the leg bends at the knee without a gap, in the three bands it had.
KNEE_OVERLAP, KNEE_INSIDE = 0.06, 0.9
# The shin's flare ends this high over the foot, above the ankle, so it stays out of the ground as the
# shin tilts over the planted foot.
FLARE = 0.13

# The foot, round its own centre under the ankle (toes towards -y): z, centre y, half-width and
# half-length. Its top is narrower than the furrows of the leg, which hides its open edge.
FOOT = [(0.0, -0.04, 0.215, 0.245), (0.09, -0.02, 0.2, 0.21), (0.22, 0.0, 0.12, 0.12)]
# Seven toes, like roots: the angle from straight ahead (degrees) and how far each reaches.
TOES = [(-58, 0.13), (-39, 0.17), (-19, 0.19), (0, 0.2), (19, 0.18), (39, 0.16), (58, 0.12)]


def foot(side, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    joint(f'toe_{side[0]}', at + turn @ V(0, -0.3, 0.03))
    rings = [[at + turn @ p for p in ellipse(0, cy, z, rx, ry, 8, 22.5)] for z, cy, rx, ry in FOOT]
    verts, faces, _ = loft(rings)
    part(f'foot-{side}', verts, faces, M['root'], inside=at + V(0, 0, 0.1))
    for k, (angle, reach) in enumerate(TOES):
        a = math.radians(angle)
        out = turn @ V(math.sin(a), -math.cos(a), 0)
        # Spreading over the ground like roots from the foot of a trunk, blunt at the end.
        root = at + turn @ V(0, -0.06, 0) + 0.1 * out + V(0, 0, 0.065)
        knuckle = root + 0.5 * reach * out + V(0, 0, 0.0)
        end = root + 0.9 * reach * out - V(0, 0, 0.04)
        tip = root + reach * out - V(0, 0, 0.065)
        limb(f'toe-{side}-{k}', [root, knuckle, end, tip], [0.045, 0.04, 0.028], M['root'], n=4, phase=45)


def legs():
    for side, hip, knee, ankle, yaw in LEGS:
        s = side[0]
        low = knee.lerp(ankle, 0.55)
        path = [hip, knee, low, V(ankle.x, ankle.y, FLARE)]
        top, bend, shin, foot_ring = path_rings(path, LEG_RADII, bark(5, 0.2), phase=10)
        past = [k.lerp(q, KNEE_OVERLAP / (low - knee).length) for k, q in zip(bend, shin)]
        above = knee.lerp(hip, KNEE_OVERLAP / (hip - knee).length)
        inside = [above + KNEE_INSIDE * (k.lerp(q, KNEE_OVERLAP / (hip - knee).length) - above)
                  for k, q in zip(bend, top)]
        for name, bone_name, rings in ((f'thigh-{side}', f'thigh_{s}', [top, past]),
                                       (f'shin-{side}', f'shin_{s}', [inside, shin, foot_ring])):
            verts, faces, _ = loft(rings)
            with bone(bone_name):
                part(name, verts, faces, [M['bark'], M['furrows']], furrow_mats(faces, len(rings[0])),
                     inside=nearest_on_path(path))
        with bone(f'foot_{s}'):
            foot(side, ankle, yaw)
        joint(f'hip_{s}', hip)
        joint(f'knee_{s}', knee)
        joint(f'ankle_{s}', ankle)


# Trunk -------------------------------------------------------------------------------------------

# The body as a trunk of bark, from the fork of the legs to the shoulders: z, half-width, half-depth
# and centre y of each ring. The ridges wind round as they rise, like the grain of an old tree.
TRUNK = [
    (0.80, 0.24, 0.19, 0.0),  # the fork of the legs, narrowing between them
    (1.00, 0.38, 0.30, 0.0),  # hips
    (1.20, 0.40, 0.31, 0.0),  # belly
    (1.40, 0.43, 0.315, 0.005),  # chest
    (1.53, 0.45, 0.30, 0.015),  # shoulders
    (1.63, 0.36, 0.25, 0.02),  # the top of the shoulders
    (1.70, 0.215, 0.19, 0.02),  # where the head sits, with hardly any neck
]
TRUNK_BARK = bark(7, 0.18)
TWIST = 40  # degrees the ridges wind round for each unit they rise
# It bends at the waist, in two pieces of the bands it had: the lower trunk on the hips, from the fork up
# past the belly to WAIST_TOP, and the upper trunk on the spine, from a ring inside it (WAIST_INSIDE) to
# the shoulders. The ridges wind alike in both, so they line up where one runs inside the other. The
# spine bends about the back of the waist, so the back stays closed as he bows.
WAIST_TOP = 1.26
WAIST_INSIDE = (1.12, 0.355, 0.27, 0.0)
PELVIS, WAIST = V(0, 0.0, 0.95), V(0, 0.12, 1.19)
# Where the boulder waits inside his chest once he has hurled it, until he tears up another (heave).
BOULDER_INSIDE = V(0, 0.03, 1.36)


def trunk_ring(z, rx, ry, cy):
    turn = math.radians(TWIST * (z - TRUNK[0][0]))
    return [V(k * rx * math.cos(turn + math.tau * f), cy + k * ry * math.sin(turn + math.tau * f), z)
            for f, k in TRUNK_BARK]


def trunk():
    n = len(TRUNK_BARK)
    (z0, *below), (z1, *above) = TRUNK[2], TRUNK[3]
    u = (WAIST_TOP - z0) / (z1 - z0)
    top = trunk_ring(WAIST_TOP, *(p + (q - p) * u for p, q in zip(below, above)))
    verts, faces, _ = loft([trunk_ring(*TRUNK[0]), trunk_ring(*TRUNK[1]), top])
    face_mats = furrow_mats(faces, n) + [0] * n
    # Closed underneath, between the legs.
    verts.append(V(0, 0, 0.84))
    faces += [(i, (i + 1) % n, len(verts) - 1) for i in range(n)]
    with bone('hips'):
        part('trunk-lower', verts, faces, [M['bark'], M['furrows']], face_mats,
             inside=lambda c: V(0, 0, min(max(c.z, 0.9), 1.6)))
    verts, faces, _ = loft([trunk_ring(*WAIST_INSIDE)] + [trunk_ring(*level) for level in TRUNK[3:]])
    with bone('spine'):
        part('trunk-upper', verts, faces, [M['bark'], M['furrows']], furrow_mats(faces, n),
             inside=lambda c: V(0, 0, min(max(c.z, 0.9), 1.6)))
    joint('pelvis', PELVIS)
    joint('waist', WAIST)
    joint('boulder_inside', BOULDER_INSIDE)


# Moss over the shoulders -------------------------------------------------------------------------

# Moss over his shoulders, thicker on the left and growing down his back: centre, half-sizes and
# seed of each clump. Between them the bark of his back and the back of his head show, so that from
# behind he is a trunk under a canopy.
MOSS = [
    (V(0.36, 0.04, 1.62), (0.22, 0.24, 0.11), 11),  # over his left shoulder
    (V(0.53, 0.06, 1.5), (0.1, 0.15, 0.13), 12),  # hanging over the top of the arm
    (V(0.19, 0.25, 1.48), (0.17, 0.1, 0.19), 13),  # down over his shoulder blade
    (V(0.22, -0.1, 1.67), (0.11, 0.1, 0.08), 14),  # beside his head, in front
    (V(-0.35, 0.02, 1.61), (0.2, 0.22, 0.1), 21),  # over his right shoulder
    (V(-0.52, 0.04, 1.52), (0.09, 0.13, 0.1), 22),
    (V(-0.25, 0.19, 1.63), (0.13, 0.11, 0.09), 23),
    (V(-0.22, -0.1, 1.66), (0.1, 0.09, 0.08), 24),
]


def moss():
    with bone('spine'):
        for k, (centre, size, seed) in enumerate(MOSS):
            lump(f'moss-{k}', centre, size, M['team'], seed, rough=0.15, turn=(0, 0, 25 if centre.x > 0 else -25))


# Head --------------------------------------------------------------------------------------------

# A tall head on hardly any neck, as one loft of twelve-point rings from the jaw to the crown, the
# first point at the middle of the face and the rest counter-clockwise from above, so 1 and 11 are
# either side of it. Each ring: z, half-width, half-depth, centre y, and how far some points stand
# out (+) or sink in (-), which carves the brow, the eyes and the cheekbones.
HEAD = [
    (1.54, 0.25, 0.225, 0.01, {}),  # the jaw, broad, low between the shoulders
    (1.70, 0.225, 0.21, 0.0, {0: 0.02}),  # the mouth
    (1.82, 0.205, 0.195, 0.0, {0: 0.03, 1: 0.012, 11: 0.012}),  # cheekbones
    (1.92, 0.2, 0.19, 0.005, {0: 0.02, 1: -0.028, 11: -0.028}),  # the eyes, deep under the brow
    (2.01, 0.195, 0.19, 0.01, {0: 0.03, 1: 0.035, 11: 0.035, 2: 0.015, 10: 0.015}),  # the brow
    (2.10, 0.18, 0.18, 0.015, {}),  # forehead
    (2.18, 0.13, 0.13, 0.02, {}),  # the crown
]
FACE_POINTS = {10, 11, 0, 1}  # the face: the faces starting at these points, from the mouth to the forehead
BACK_FURROWS = {3, 5, 7, 9}  # points pulled in round the back of his head, for ridges of bark
FURROW_DEPTH = 0.022


def head_point(level, i):
    z, rx, ry, cy, push = HEAD[level]
    a = math.radians(-90 + 30 * i)
    out = push.get(i, -FURROW_DEPTH if i in BACK_FURROWS else 0.0)
    return V((rx + out) * math.cos(a), cy + (ry + out) * math.sin(a), z)


NECK, CROWN_TOP = V(0, 0.01, 1.66), V(0, 0.02, 2.18)  # where the head turns, low in the shoulders, and its top


def head():
    with bone('head'):
        face()
    joint('neck', NECK)
    joint('crown', CROWN_TOP)


def face():
    rings = [[head_point(level, i) for i in range(12)] for level in range(len(HEAD))]
    verts, faces, bands = loft(rings)
    face_mats = [1 if 1 <= b <= 4 and f[0] % 12 in FACE_POINTS else 0 for f, b in zip(faces, bands)]
    verts.append(V(0, 0.02, 2.21))
    last = (len(HEAD) - 1) * 12
    faces += [(last + i, last + (i + 1) % 12, len(verts) - 1) for i in range(12)]
    face_mats += [0] * 12
    part('head', verts, faces, [M['bark'], M['skin']], face_mats, inside=lambda c: V(0, 0.01, min(c.z, 2.09)))
    plate = []  # the face's triangles, for laying the eyes on it
    for f, b in zip(faces, bands):
        if 2 <= b <= 3 and f[0] % 12 in FACE_POINTS:
            a, b_, c, d = (verts[i] for i in f)
            plate += [(a, b_, c), (a, c, d)]

    # Almond eyes deep in their sockets, catching a little light, a little lower at the outer
    # corners, which makes him look patient rather than fierce.
    for s in (-1, 1):
        corners = [(s * 0.042, 1.925), (s * 0.085, 1.938), (s * 0.128, 1.918), (s * 0.088, 1.905)]
        verts = [V(x, on_surface(plate, x, z) - 0.008, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2, 3)], M['eyes'], outward=V(0, -1, 0))

    # A long straight nose, like the stub of a branch, from between the eyes to a blunt tip.
    bridge = head_point(3, 0)
    top, tip = bridge + V(0, 0.01, 0.02), V(0, -0.305, 1.74)
    right, left, under = V(-0.05, -0.215, 1.76), V(0.05, -0.215, 1.76), V(0, -0.245, 1.725)
    verts = [top, tip, right, left, under]
    faces = [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.15, 1.82))


# The beard hangs from his chin on a bone of its own, which sways after him; its top, along his cheeks,
# follows his head.
BEARD_ROOT, BEARD_TIP = V(0, -0.2, 1.72), V(0, -0.4, 0.95)


def beard():
    with bone('beard', follows=lambda p: 'head' if p.z > 1.7 else None):
        beard_locks()
    joint('beard_root', BEARD_ROOT)
    joint('beard_tip', BEARD_TIP)
    with bone('head'):
        moustache()


def beard_locks():
    # A sweeping beard in three locks (a W in section), from the cheeks down over the chest. Each
    # level runs from his right side across the front to his left: the right side's back, the lock's
    # ridge, the valley, then the middle ridge. The ends are thin and mossy.
    half = [
        [(-0.18, -0.08, 1.82), (-0.175, -0.17, 1.76), (-0.095, -0.225, 1.725), (0.0, -0.255, 1.715)],
        [(-0.22, -0.13, 1.60), (-0.2, -0.29, 1.57), (-0.11, -0.275, 1.56), (0.0, -0.34, 1.55)],
        [(-0.2, -0.26, 1.38), (-0.175, -0.38, 1.36), (-0.095, -0.345, 1.37), (0.0, -0.41, 1.34)],
        [(-0.15, -0.29, 1.20), (-0.135, -0.40, 1.17), (-0.07, -0.37, 1.21), (0.0, -0.43, 1.15)],
        [(-0.1, -0.3, 1.09), (-0.12, -0.38, 0.97), (-0.065, -0.36, 1.11), (0.0, -0.4, 0.92)],
    ]
    rings = []
    for level in half:
        right = [V(*p) for p in level]
        left = [V(-p.x, p.y, p.z) for p in reversed(right[:-1])]
        rings.append(right + left)
    verts, faces, bands = loft(rings, closed=False)
    face_mats = [1 if b == 3 else 0 for b in bands]
    part('beard', verts, faces, [M['beard'], M['team']], face_mats, inside=lambda c: V(0, -0.1, c.z))


def moustache():
    # A moustache in two sweeps from under the nose out over the beard.
    for s in (-1, 1):
        root = [V(s * 0.01, -0.245, 1.74), V(s * 0.01, -0.275, 1.72), V(s * 0.01, -0.245, 1.705)]
        mid = [V(s * 0.08, -0.255, 1.725), V(s * 0.08, -0.295, 1.70), V(s * 0.08, -0.255, 1.68)]
        tip = V(s * 0.15, -0.295, 1.60)
        verts, faces, _ = loft([root, mid])
        verts.append(tip)
        faces += [(3, 4, 6), (4, 5, 6), (5, 3, 6)]
        part(f'moustache-{s}', verts, faces, M['beard'], inside=V(s * 0.07, -0.22, 1.70))


# Leaves on his head: a bushy canopy of clumps over the top of his head, wider than it, coming down
# to his brow in front. The back of his head is left as bark, so that from behind the canopy sits on
# a trunk.
CROWN = [  # centre, half-sizes, seed
    (V(0.0, 0.04, 2.19), (0.28, 0.26, 0.14), 1),
    (V(0.0, 0.07, 2.34), (0.18, 0.17, 0.11), 2),
    (V(-0.17, -0.06, 2.25), (0.13, 0.12, 0.1), 3),
    (V(0.16, -0.04, 2.27), (0.13, 0.12, 0.1), 4),
    (V(-0.14, 0.17, 2.2), (0.14, 0.13, 0.11), 5),
    (V(0.15, 0.18, 2.18), (0.14, 0.13, 0.11), 6),
]
# A twig out of the canopy, leaning back over his left shoulder, and a fork from its middle. One
# twig, off to the side, so that it reads as a branch rather than a pair of antlers.
TWIG = [V(0.06, 0.1, 2.31), V(0.15, 0.2, 2.46), V(0.2, 0.33, 2.56)]
TWIG_FORK = V(0.28, 0.18, 2.51)
# The leaves and the twig are on a bone of their own, from the top of his skull up through the canopy,
# which sways after his head.
LEAVES_ROOT, LEAVES_TIP = V(0, 0.03, 2.12), V(0, 0.06, 2.4)


def leaves():
    with bone('leaves'):
        for k, (centre, size, seed) in enumerate(CROWN):
            lump(f'leaves-{k}', centre, size, M['team'], seed, rough=0.14, turn=(0, 0, 30 * k))
        limb('twig', TWIG, [0.04, 0.028], M['bark'], n=4)
        limb('twig-fork', [TWIG[1], TWIG_FORK], [0.022], M['bark'], n=4)
    joint('leaves_root', LEAVES_ROOT)
    joint('leaves_tip', LEAVES_TIP)


# Arms and hands ----------------------------------------------------------------------------------

BOULDER, BOULDER_RADIUS = V(-0.6, -0.27, 1.22), 0.25
R_SHOULDER, R_ELBOW = V(-0.45, 0.03, 1.5), V(-0.6, 0.10, 1.12)
L_SHOULDER, L_ELBOW, L_WRIST = V(0.45, 0.03, 1.5), V(0.63, 0.1, 1.14), V(0.67, -0.15, 0.96)


ELBOW_OVERLAP = 0.04  # how far the upper arm runs on past the elbow, and the forearm starts above it


def arm(side, shoulder, elbow, wrist, fist):
    # Bark at the shoulder, then smooth brown skin: the upper arm runs on a little past the elbow, and
    # the forearm, a little narrower, starts a little above it, so the arm bends without a gap.
    s = side[0]
    below = shoulder.lerp(elbow, 0.3)
    past = elbow + ELBOW_OVERLAP * (wrist - elbow).normalized()
    above = elbow + ELBOW_OVERLAP * (shoulder - elbow).normalized()
    with bone(f'upper_arm_{s}'):
        limb(f'upper-arm-{side}', [shoulder, below, past], [0.135, 0.125, 0.11], [M['bark'], M['skin']], [0, 1],
             n=6)
    with bone(f'forearm_{s}'):
        limb(f'forearm-{side}', [above, wrist], [0.104, 0.095], M['skin'], n=6)
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', fist)


def finger(name, points, radius=0.042):
    """A thick finger along `points`, blunt at the end like a broken twig."""
    points = [Vector(p) for p in points]
    end = points[-1] + 0.022 * (points[-1] - points[-2]).normalized()
    radii = [radius * (1 - 0.3 * i / (len(points) - 1)) for i in range(len(points))]
    limb(name, points + [end], radii, M['skin'], n=4, phase=45)


def boulder():
    # The boulder is on a bone of its own, which hangs from the hand, from the boulder's middle up.
    with bone('boulder'):
        lump('boulder', BOULDER, (BOULDER_RADIUS, BOULDER_RADIUS * 0.95, BOULDER_RADIUS * 0.85), M['stone'],
             7, rough=0.08, subdivisions=1, turn=(20, 10, 35))
    joint('boulder_middle', BOULDER)
    joint('boulder_top', BOULDER + V(0, 0, BOULDER_RADIUS))
    # Held up on the flat of his right hand, the fingers round its front, the thumb round its side.
    ahead = V(-0.05, -1, -0.08).normalized()
    palm = BOULDER - V(0, 0, BOULDER_RADIUS * 0.85 + 0.04)
    wrist = palm - 0.085 * ahead
    with bone('hand_r'):
        boulder_hand(palm, ahead)
    # Held from the palm up to the boulder's middle, facing the front.
    hold('r', palm, BOULDER, BOULDER + V(0, -0.1, 0))
    arm('right', R_SHOULDER, R_ELBOW, wrist, palm + 0.085 * ahead)


def boulder_hand(palm, ahead):
    across = ahead.cross(V(0, 0, -1)).normalized()
    box('palm-right', palm, [ahead, V(0, 0, -1), across], (0.11, 0.05, 0.1), M['skin'], 0.85)
    r = BOULDER_RADIUS + 0.02  # the fingers press into the rock a little
    for k, spread in enumerate((-26, 0, 26)):
        turn = Matrix.Rotation(math.radians(spread), 3, 'Z')
        path = []
        for angle in (35, 68, 98):
            a = math.radians(angle)
            path.append(BOULDER + turn @ V(0, -r * math.sin(a), -r * 0.88 * math.cos(a)))
        finger(f'finger-right-{k}', path)
    thumb = [BOULDER + V(r * math.sin(math.radians(a)), 0.03, -r * 0.88 * math.cos(math.radians(a))) for a in (45, 80)]
    finger('thumb-right', [palm + 0.05 * across + 0.02 * ahead] + thumb, 0.045)


def open_hand():
    # His left hand is open and reaching a little forward, big fingers spread and curled, ready to
    # sweep anything in front of him away.
    ahead = (L_WRIST - L_ELBOW).normalized()
    ahead = (ahead + V(0, -0.2, -0.5)).normalized()
    back = V(1, -0.3, 0.3)
    back = (back - back.dot(ahead) * ahead).normalized()
    across = ahead.cross(back)
    palm = L_WRIST + 0.085 * ahead
    with bone('hand_l'):
        box('palm-left', palm, [ahead, back, across], (0.11, 0.05, 0.1), M['skin'], 0.85)
        for k, spread in enumerate((-0.065, 0.0, 0.065)):
            base = palm + 0.085 * ahead + spread * across
            bend = base + 0.09 * ahead + 0.8 * spread * across - 0.035 * back
            tip = bend + 0.06 * ahead + 0.3 * spread * across - 0.07 * back
            finger(f'finger-left-{k}', [base, bend, tip])
        base = palm + 0.02 * ahead + 0.08 * across
        thumb = [base, base + 0.07 * ahead + 0.07 * across, base + 0.12 * ahead + 0.07 * across - 0.06 * back]
        finger('thumb-left', thumb, 0.045)
    arm('left', L_SHOULDER, L_ELBOW, L_WRIST, palm + 0.17 * ahead)


# His clips (../clips.py): slow and heavy. He stands breathing slow, the boulder held ready; strides
# long and low, the boulder carried up and his free arm swinging; swats with his open left hand; hurls
# the boulder for his cast and tears up another from the ground (heave); sways, dazed, the boulder
# sagging; sinks to his knees as he falls, the boulder rolled out before him; and holds it up high as
# he wins. His beard hangs from his chin as he bows and rears, and it and his leaves sway after him
# (swaying()).
CLIPS = swaying(swaying(fit({
    'idle': ('ready', {'seconds': 2.6, 'breath': 0.7, 'sway': 0.6, 'crouch': 0.03}),
    'move': ('run', {'seconds': 0.6, 'heavy': 1.0, 'stride': 0.45, 'lift': 0.18, 'lean': 6.0}),
    'attack': ('swing', {'hand': 'l', 'ahead': 0.35}),
    'cast': ('heave', {'begin': 1.0}),
    'stun': ('dazed', {'seconds': 1.5, 'low': 0.5}),
    'death': ('knees', {'slump': 0.8, 'back': 0.15}),
    'victory': ('raise', {'out': 0.45}),
}, between=True), 'beard', share=0.6, lag=2, drag=0.5), 'leaves', lag=2, drag=0.5)
RIG = Rig(kind='large', bones={
    'beard': ('head', 'beard_root', 'beard_tip'),
    'leaves': ('head', 'leaves_root', 'leaves_tip'),
    'boulder': ('hand_r', 'boulder_middle', 'boulder_top'),
}, clips=CLIPS)


# Lichen: his trim ----------------------------------------------------------------------------------

# Each patch is a flat, lobed crust on one plate of his bark, longer along the plate than across it:
# a rosette and a smaller one grown into its side, which make an irregular blotch. It lies in the
# plane of the plate, a little off it, bridging the furrows beside it as lichen crusts over a crack,
# and rises with the bark only where the bark rises above that plane, so no ridge pokes through it.
# Each rosette is one flat facet, not a shallow dome of them: the model is shaded flat, so every facet
# has vertices of its own, and with the rig's weights on each the domes would take his .glb past
# its 300,000 bytes.
LICHEN_LIFT = 0.006  # how far it stands off the plate
# Each rosette: where its middle is, from the patch's middle (in sizes, along and across), its own
# size (in sizes), how many points round its edge, and how much lower it lies, so the two never
# fight. Its edge is irregular and only gently lobed: deep notches would read as a star.
ROSETTES = [((0.0, 0.0), 1.0, 7, 0.0), ((0.8, 0.0), 0.6, 5, 0.002)]
LOBES = (1.0, 0.86)  # how far out the points of an edge reach, in turn


def surface(*names):
    """Parts' faces, for finding the bark under a patch: a leg's thigh and shin, or the trunk's two
    pieces, so a patch lies on the outer of them where one runs on inside the other."""
    verts, polys = [], []
    for name in names:
        data = bpy.data.objects[name].data
        polys += [tuple(len(verts) + i for i in p.vertices) for p in data.polygons]
        verts += [v.co.copy() for v in data.vertices]
    return BVHTree.FromPolygons(verts, polys)


def lichen_patch(name, tree, target, axis, along, size, seed):
    """A patch of lichen on the bark in `tree`, where a line from `axis` out through `target` meets
    it: `size` is half its length, which runs along `along`, and half its width, and `seed` gives
    its outline."""
    out = (target - axis).normalized()
    hit, normal, _, _ = tree.ray_cast(target + 0.3 * out, -out)
    if hit is None:
        raise RuntimeError(f'{name}: no bark under it')
    n = normal.normalized() if normal.dot(out) > 0 else -normal.normalized()
    u = (along - along.dot(n) * n).normalized()
    v = n.cross(u)
    jitter = random.Random(seed)
    spin = Matrix.Rotation(jitter.uniform(0, math.tau), 3, n)  # which way the smaller rosette grows

    def on_bark(p, lift):
        """`p`, in the plate's plane, lifted off it, or off the bark where the bark is higher."""
        under, _, _, _ = tree.ray_cast(p + 0.15 * n, -n, 0.3)
        rise = max(0.0, (under - p).dot(n)) if under is not None else 0.0
        return p + (rise + lift) * n

    verts, faces = [], []
    for (du, dv), k, points, sink in ROSETTES:
        centre = hit + spin @ (du * size[0] * u + dv * size[1] * v)
        first = len(verts)
        for i in range(points):
            a = math.tau * (i + jitter.uniform(-0.2, 0.2)) / points
            reach = k * LOBES[i % 2] * jitter.uniform(0.8, 1.06)
            verts.append(on_bark(centre + reach * (size[0] * math.cos(a) * u + size[1] * math.sin(a) * v),
                                 LICHEN_LIFT - sink))
        faces.append(tuple(range(first, first + points)))
    part(name, verts, faces, M['trim'], outward=n)


def trunk_plate(z, near):
    """The middle of the plate of trunk bark at height `z` facing nearest to `near` (degrees
    counter-clockwise from his left, +X, seen from above; his front is 270): the point, the
    trunk's axis beside it and the way the plate runs, winding up with the grain."""

    def plates(height):
        """The middle of each plate at `height`, between the rings of TRUNK, and the axis there."""
        for (z0, *low), (z1, *high) in pairwise(TRUNK):
            if z0 <= height <= z1:
                rx, ry, cy = (a + (b - a) * (height - z0) / (z1 - z0) for a, b in zip(low, high))
                break
        turn = math.radians(TWIST * (height - TRUNK[0][0]))
        edges = [V(rx * math.cos(turn + math.tau * f), cy + ry * math.sin(turn + math.tau * f), height)
                 for r in range(7) for f in (r / 7, (r + 0.5) / 7)]
        return [(edges[2 * r] + edges[2 * r + 1]) / 2 for r in range(7)], V(0, cy, height)

    middles, axis = plates(z)
    facing = V(math.cos(math.radians(near)), math.sin(math.radians(near)), 0)
    r = max(range(7), key=lambda r: (middles[r] - axis).normalized().dot(facing))
    along = plates(z + 0.02)[0][r] - plates(z - 0.02)[0][r]
    return middles[r], axis, along


def leg_plate(side, t, near):
    """The middle of the plate of bark on a leg, `t` of the way from the hip to the ankle, facing
    nearest to `near` (degrees, as for trunk_plate()): the point, the leg's axis there and the way
    the plate runs down the leg."""
    _, hip, knee, ankle, _ = next(leg for leg in LEGS if leg[0] == side)
    path = [hip, knee, knee.lerp(ankle, 0.55), ankle]
    edges = path_rings(path, LEG_RADII, [(f / 5, 1.0) for r in range(5) for f in (r, r + 0.5)], phase=10)
    middles = [[(ring[2 * r] + ring[2 * r + 1]) / 2 for r in range(5)] for ring in edges]
    k = min(int(t * 3), 2)  # which length of the leg: the thigh, the upper shin or the lower shin
    s = t * 3 - k
    axis = path[k].lerp(path[k + 1], s)
    facing = V(math.cos(math.radians(near)), math.sin(math.radians(near)), 0)
    points = [middles[k][r].lerp(middles[k + 1][r], s) for r in range(5)]
    r = max(range(5), key=lambda r: (points[r] - axis).normalized().dot(facing))
    return points[r], axis, middles[k + 1][r] - middles[k][r]


# Where the lichen grows: on which part, where on it, how big (half its length and width) and its
# seed. From the front it shows beside his beard and on his legs; from behind on his back, his legs
# and the back of his head. Each patch lies wholly on one piece of the bark, clear of the knee and of
# the waist, where one piece runs on inside the next, so it rides the bone that piece is on.
LEG_LICHEN = [
    ('leg-left', 0.22, 260, (0.1, 0.065), 31),  # the front of his left thigh
    ('leg-right', 0.74, 255, (0.09, 0.06), 32),  # the front of his right shin, above the flare
    ('leg-right', 0.27, 110, (0.1, 0.065), 33),  # the back of his right thigh, clear of the knee
    ('leg-left', 0.75, 70, (0.09, 0.06), 34),  # the back of his left calf
]
TRUNK_LICHEN = [
    (1.1, 330, (0.15, 0.1), 41),  # his left side, in front
    (0.98, 228, (0.13, 0.09), 42),  # his right hip, in front, under the boulder
    (1.05, 76, (0.15, 0.1), 43),  # the small of his back
    (1.43, 138, (0.14, 0.095), 44),  # his right shoulder blade, clear of the waist
]
HEAD_LICHEN = [(V(-0.04, 0.0, 1.87), 100, (0.08, 0.065), 51)]  # the back of his head, under the leaves


def leg_lichen():
    # Each patch rides the piece of the leg it grows on: the thigh above the knee, a third of the way
    # down, and the shin below it.
    for k, (name, t, near, size, seed) in enumerate(LEG_LICHEN):
        side = name.split('-')[1]
        point, axis, along = leg_plate(side, t, near)
        with bone(f'thigh_{side[0]}' if t < 1 / 3 else f'shin_{side[0]}'):
            lichen_patch(f'lichen-leg-{k}', surface(f'thigh-{side}', f'shin-{side}'), point, axis, along, size, seed)


def body_lichen():
    # On the lower trunk below its top (WAIST_TOP), on the hips, and on the upper trunk above it, on
    # the spine; on his head, with it.
    trunk = surface('trunk-lower', 'trunk-upper')
    for k, (z, near, size, seed) in enumerate(TRUNK_LICHEN):
        point, axis, along = trunk_plate(z, near)
        with bone('hips' if z < WAIST_TOP else 'spine'):
            lichen_patch(f'lichen-trunk-{k}', trunk, point, axis, along, size, seed)
    head = surface('head')
    for k, (axis, near, size, seed) in enumerate(HEAD_LICHEN):
        out = V(math.cos(math.radians(near)), math.sin(math.radians(near)), 0)
        with bone('head'):
            lichen_patch(f'lichen-head-{k}', head, axis + 0.2 * out, axis, V(0, 0, 1), size, seed)


def build(branches=None):
    """Makes him in a fresh scene, every part bound to its bone and his joints marked, and returns
    the rig to finish() him with. His 2★ model (treebeard-2.py) passes its young branches as
    `branches`, a function that makes them, before he stoops and is scaled."""
    reset()
    make_materials()
    legs()
    leg_lichen()
    lower = set(bpy.context.scene.objects)
    trunk()
    moss()
    head()
    beard()
    leaves()
    boulder()
    open_hand()
    body_lichen()
    if branches is not None:
        branches()
    lean([o for o in bpy.context.scene.objects if o not in lower], HIPS, LEAN)
    for o in bpy.context.scene.objects:
        o.data.transform(Matrix.Scale(SCALE, 4))
    return RIG


def main():
    finish('treebeard', budget=LARGE_BUDGET, rig=build())


if __name__ == '__main__':
    main()
