"""Gandalf the Grey, of the Istari: a Sorcerer, in the Faceted style (docs/viewer-spec.md section 4).

Drawn from the books, not the films: an old man, tall but a little bent, with a long white beard
and bushy white eyebrows under a tall pointed hat with a wide brim; a long grey cloak over a grey
robe to the ground, a scarf, heavy black boots, and a gnarled staff with a small cold light at its
tip. Glamdring hangs sheathed at his left hip, his hand on its hilt. Built like Gimli (gimli.py):
every form a low-segment shape or a hand-placed set of vertices, shaded flat.

About 1.45 to the hat brim, a Man's proportions in a robe; the hat's point and the staff go higher.
The team colour is his hat, seen from every side and from above, and his scarf: wound round his
neck, one end down his chest beside the beard and the other thrown back over his shoulder. A dark
band round the hat keeps brim and crown apart from above. Everything else is grey, white and earth.

    blender --background --factory-startup --python-exit-code 1 --python gandalf.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, on the staff, is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOTS,
    EYES,
    LEATHER,
    STEEL,
    WOOD,
    V,
    box,
    ellipse,
    finish,
    lean,
    loft,
    material,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    tube,
)

# Gandalf's own colours (sRGB); the rest come from the kit. The greys are warm, so they read as wool
# and neither as steel nor, in the game's cool light, as a washed-out blue.
CLOAK = 0x6C6862
ROBE = 0x8E897F
HAIR = 0xDCD8CF
SKIN = 0xD8A88C
LIGHT = 0xEDEDE8  # a cold white, not blue
HATBAND = 0x3D3631

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        cloak=material('cloak', CLOAK, roughness=0.9),
        robe=material('robe', ROBE, roughness=0.9),
        hair=material('hair', HAIR, roughness=0.9),
        skin=material('skin', SKIN, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
        boots=material('boots', BOOTS, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        hatband=material('hatband', HATBAND, roughness=0.9),
        wood=material('wood', WOOD, roughness=0.85),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        light=material('light', LIGHT, roughness=0.6, emission=LIGHT, emission_strength=1.0),
    )


# Helpers -------------------------------------------------------------------------------------------

# He stoops: above the small of his back the body is carried forward, more the higher it is, up to
# STOOP at the base of his neck. His head and hat are carried forward by all of it.
STOOP_FROM, STOOP_TO, STOOP = 0.62, 1.12, 0.07


def stoop_shift(z):
    t = min(max((z - STOOP_FROM) / (STOOP_TO - STOOP_FROM), 0.0), 1.0)
    return STOOP * t * t


def stoop(objects):
    """Bends objects built upright into his stoop, so parts that meet still meet."""
    for obj in objects:
        for v in obj.data.vertices:
            v.co.y -= stoop_shift(v.co.z)


def carry(objects, offset):
    for obj in objects:
        obj.data.transform(Matrix.Translation(offset))


def nearest_on_polyline(points):
    """A function giving the point on a crooked line nearest to a point: the inside of a rod."""

    def nearest(p):
        best = None
        for a, b in zip(points, points[1:]):
            d = b - a
            t = min(max((p - a).dot(d) / d.length_squared, 0.0), 1.0)
            q = a + t * d
            if best is None or (p - q).length < (p - best).length:
                best = q
        return best

    return nearest


def rod_rings(stations, n, twist=0.0):
    """Rings of n points round a crooked line of (centre, radius) stations, each square to the line
    there and turned `twist` degrees from the one before, so the facets wind like a grain."""
    points = [p for p, _ in stations]
    rings = []
    for i, (p, r) in enumerate(stations):
        d = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        u = (V(1, 0, 0) - V(1, 0, 0).dot(d) * d).normalized()
        w = d.cross(u)
        ring = []
        for k in range(n):
            a = math.tau * k / n + math.radians(twist * i)
            ring.append(p + r * (math.cos(a) * u + math.sin(a) * w))
        rings.append(ring)
    return rings


# Body: a robe to the ground, a mantle over the shoulders and a long cloak down his back ----------------

# The robe from the belt up, in octagons: z, half-width, half-depth and centre y. The belt is the
# first band.
ROBE_RINGS = [
    (0.70, 0.188, 0.16, 0.0),  # belt, lower edge
    (0.78, 0.198, 0.168, 0.0),  # belt, upper edge
    (1.03, 0.215, 0.152, 0.01),  # shoulders
    (1.15, 0.10, 0.092, 0.01),  # neck
]
ROBE_BANDS = [1, 0, 0]  # the belt, then robe

# The skirt below the belt, in twelve pleats that are deepest at the hem and gone at the waist, where
# the belt hides its top: z, half-width, half-depth, centre y and the depth of the pleats.
SKIRT = [
    (0.0, 0.272, 0.248, 0.02, 0.024),  # the hem, on the ground
    (0.36, 0.232, 0.205, 0.012, 0.012),
    (0.72, 0.17, 0.145, 0.0, 0.0),
]


def robe():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in ROBE_RINGS]
    verts, faces, bands = loft(rings)
    face_mats = [ROBE_BANDS[b] for b in bands]
    part('robe', verts, faces, [M['robe'], M['leather']], face_mats, inside=lambda c: V(0, 0.01, c.z))

    # A ridge at every other point, one of them down the middle of the front.
    rings = []
    for z, rx, ry, cy, pleat in SKIRT:
        ring = []
        for i in range(12):
            a = math.tau * i / 12
            k = pleat if i % 2 else 0.0
            ring.append(V((rx + k) * math.cos(a), cy + (ry + k) * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings)
    part('skirt', verts, faces, M['robe'], inside=lambda c: V(0, 0.01, c.z))


# Heavy boots, of which only the toes show under the hem.
RIGHT_ANKLE, RIGHT_YAW = V(-0.10, -0.15, 0.10), -12
LEFT_ANKLE, LEFT_YAW = V(0.105, -0.135, 0.10), 10
BOOT_RINGS = [  # height, then the right half of the outline: side, heel, toe
    (0.0, [(0.074, -0.02), (0.064, 0.07), (0.058, -0.142)]),
    (0.064, [(0.074, -0.01), (0.064, 0.07), (0.054, -0.106)]),
    (0.14, [(0.068, 0.0), (0.06, 0.066), (0.054, -0.05)]),
]


def boot(name, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + turn @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['boots'], inside=at + V(0, 0, 0.07))


def mantle():
    # The cloak's shoulders, eight points round from his left (+X); the back rises, the front dips
    # under the beard.
    neck_z = [1.15, 1.16, 1.175, 1.16, 1.15, 1.14, 1.13, 1.14]
    neck = ellipse(0, 0.02, 0, 0.128, 0.118, 8, 0, neck_z)
    shoulder_z = [1.035, 1.045, 1.06, 1.045, 1.035, 1.03, 1.02, 1.03]
    shoulder = ellipse(0, 0.02, 0, 0.278, 0.205, 8, 0, shoulder_z)
    hem = ellipse(0, 0.025, 0, 0.30, 0.228, 8, 0, [z - 0.135 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, neck])
    part('mantle', verts, faces, M['cloak'], inside=V(0, 0.02, 0.9))


# The cloak down his back to the ground, in four folds. Each level: z at the middle and at the edges,
# half-width, half-depth, centre y, how far short of the sides it stops (degrees) and the folds' depth.
CLOAK_LEVELS = [
    (1.01, 0.97, 0.262, 0.19, 0.03, 24, 0.0),
    (0.55, 0.57, 0.305, 0.262, 0.035, 14, 0.03),
    (0.0, 0.04, 0.34, 0.30, 0.045, 6, 0.05),
]


def cloak():
    rings = []
    for middle, edge, rx, ry, cy, spread, fold in CLOAK_LEVELS:
        ring = []
        for i in range(9):
            a = math.radians(spread + (180 - 2 * spread) * i / 8)
            k = 1 + (fold / ry if i % 2 else 0)
            z = edge + (middle - edge) * math.sin(a) ** 2
            ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('cloak', verts, faces, M['cloak'], inside=lambda c: V(0, 0, c.z))


def scarf():
    # Wound thickly round his neck over the cloak, under the beard.
    rings = [
        ellipse(0, 0.02, 1.062, 0.166, 0.153, 8, 22.5),
        ellipse(0, 0.02, 1.115, 0.18, 0.166, 8, 22.5),
        ellipse(0, 0.02, 1.172, 0.122, 0.114, 8, 22.5),
    ]
    verts, faces, _ = loft(rings)
    part('scarf', verts, faces, M['team'], inside=lambda c: V(0, 0.02, c.z))

    # The ends: one hangs down his chest on his left, beside the beard; the other is thrown back
    # over his right shoulder. Each level is the inner edge, a crease and the outer edge; the last
    # level's crease is higher, so the end is forked.
    front = [
        [V(0.055, -0.13, 1.10), V(0.108, -0.155, 1.10), V(0.16, -0.12, 1.09)],
        [V(0.088, -0.168, 0.94), V(0.138, -0.185, 0.935), V(0.185, -0.152, 0.93)],
        [V(0.102, -0.172, 0.79), V(0.148, -0.19, 0.815), V(0.19, -0.162, 0.785)],
    ]
    back = [
        [V(-0.06, 0.125, 1.17), V(-0.118, 0.148, 1.18), V(-0.172, 0.105, 1.15)],
        [V(-0.09, 0.222, 1.03), V(-0.152, 0.24, 1.022), V(-0.215, 0.196, 1.0)],
        [V(-0.102, 0.262, 0.86), V(-0.166, 0.28, 0.89), V(-0.228, 0.232, 0.845)],
    ]
    for name, levels, out in (('scarf-front', front, V(0, -1, 0)), ('scarf-back', back, V(0, 1, 0.2))):
        verts, faces, _ = loft(levels, closed=False)
        part(name, verts, faces, M['team'], outward=out)


# Head ----------------------------------------------------------------------------------------------

HEAD = V(0, 0, 1.33)  # the middle of his head, before the stoop carries it forward


def hair():
    # White hair at the sides and back, from under the hat to his scarf: a C open at the face, from
    # his left temple round the back to his right, its ends in locks.
    angles = [-38, 5, 48, 90, 132, 175, 218]
    levels = [(1.47, 0.118, 0.12, 0.012), (1.30, 0.15, 0.152, 0.012), (1.15, 0.16, 0.152, 0.035)]
    locks = [0.0, -0.035, 0.0, -0.04, 0.0, -0.035, 0.0]  # how far each point of the ends hangs lower
    rings = []
    for k, (z, rx, ry, cy) in enumerate(levels):
        drop = locks if k == len(levels) - 1 else [0.0] * len(angles)
        rings.append([V(rx * math.cos(math.radians(a)), cy + ry * math.sin(math.radians(a)), z + d)
                      for a, d in zip(angles, drop)])
    verts, faces, _ = loft(rings, closed=False)
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, 0.01, c.z))


# The face: a shallow pyramid of planes round the root of the nose, from under the hat round the
# cheekbones to behind the moustache.
FACE_RIM = [
    V(-0.08, -0.094, 1.462), V(0.08, -0.094, 1.462), V(0.122, -0.082, 1.30),
    V(0.07, -0.128, 1.235), V(0, -0.14, 1.225), V(-0.07, -0.128, 1.235), V(-0.122, -0.082, 1.30),
]
FACE_ROOT = V(0, -0.156, 1.35)


def face():
    rim, root = FACE_RIM, FACE_ROOT
    plate = [(rim[i], rim[(i + 1) % 7], root) for i in range(7)]
    part('face', rim + [root], [(i, (i + 1) % 7, 7) for i in range(7)], M['skin'], outward=V(0, -1, 0))

    # Deep-set eyes under the brows, laid just proud of the plate.
    for s in (-1, 1):
        corners = [(s * 0.028, 1.346), (s * 0.088, 1.352), (s * 0.06, 1.326)]
        verts = [V(x, on_surface(plate, x, z) - 0.006, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A long nose with a hump, its tip hanging over the moustache.
    top, hump, tip = V(0, -0.15, 1.38), V(0, -0.2, 1.335), V(0, -0.245, 1.268)
    left, right, under = V(-0.046, -0.15, 1.268), V(0.046, -0.15, 1.268), V(0, -0.168, 1.248)
    verts = [top, hump, tip, left, right, under]
    faces = [(0, 3, 1), (0, 1, 4), (1, 3, 2), (1, 2, 4), (3, 5, 2), (5, 4, 2)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.12, 1.3))

    # Bushy brows, each a wedge from the root of the nose out to a tuft sticking out and up.
    for s in (-1, 1):
        inner = [V(s * 0.012, -0.15, 1.398), V(s * 0.012, -0.205, 1.372), V(s * 0.012, -0.158, 1.345)]
        mid = [V(s * 0.088, -0.13, 1.405), V(s * 0.09, -0.198, 1.388), V(s * 0.088, -0.14, 1.35)]
        tip = V(s * 0.178, -0.168, 1.398)
        verts = inner + mid + [tip]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5), (3, 4, 6), (4, 5, 6), (5, 3, 6), (0, 2, 1)]
        part(f'brow-{s}', verts, faces, M['hair'], inside=sum(verts, Vector()) / len(verts))


def moustache():
    # Two long sweeps from under the nose out and down over the beard.
    for s in (-1, 1):
        root = [V(s * 0.01, -0.165, 1.258), V(s * 0.01, -0.198, 1.24), V(s * 0.01, -0.162, 1.228)]
        mid = [V(s * 0.065, -0.176, 1.242), V(s * 0.065, -0.218, 1.22), V(s * 0.065, -0.172, 1.204)]
        tip = V(s * 0.115, -0.205, 1.13)
        verts = root + mid + [tip]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5), (3, 4, 6), (4, 5, 6), (5, 3, 6)]
        part(f'moustache-{s}', verts, faces, M['hair'], inside=sum(verts, Vector()) / len(verts))


def beard():
    # Long and white, from the cheeks to below his belt, in three locks (a W in section). Each level
    # runs from his right side across the front to his left. It hangs from his chin, so the stoop
    # carries all of it forward and it falls clear of his chest.
    half = [  # (x, y, z) of the right-side back, the lock's ridge, the valley; then the centre ridge
        [(-0.128, -0.075, 1.31), (-0.122, -0.11, 1.262), (-0.07, -0.14, 1.232), (0.0, -0.148, 1.222)],
        [(-0.162, -0.085, 1.12), (-0.156, -0.18, 1.10), (-0.076, -0.205, 1.09), (0.0, -0.225, 1.085)],
        [(-0.135, -0.12, 0.93), (-0.126, -0.212, 0.92), (-0.062, -0.226, 0.915), (0.0, -0.245, 0.91)],
        [(-0.086, -0.125, 0.76), (-0.08, -0.19, 0.755), (-0.04, -0.2, 0.75), (0.0, -0.215, 0.745)],
        [(-0.03, -0.12, 0.62), (-0.028, -0.15, 0.616), (-0.014, -0.152, 0.613), (0.0, -0.158, 0.61)],
    ]
    rings = []
    for level in half:
        right = [V(*p) for p in level]
        left = [V(-p.x, p.y, p.z) for p in reversed(right[:-1])]
        rings.append(right + left)
    verts, faces, _ = loft(rings, closed=False)
    part('beard', verts, faces, M['hair'], inside=lambda c: V(0, -0.05, c.z))


# Hat: a wide brim drooping to its edge and a tall crown whose point bends over to his left -----------
# The crown is taller than the brim is wide, so the point still stands clear of the brim when the
# game's camera looks down on it from behind.

BRIM_Z = 1.45
BRIM = [(0.14, 0.0), (0.212, -0.024), (0.275, -0.068)]  # radius and height: inside the crown, mid, edge
HAT_TILT = 5  # degrees back
CROWN = [  # height above the brim, radius, centre x and y; a dark band round the foot of the crown
    (-0.015, 0.148, 0.0, 0.0),
    (0.03, 0.141, 0.002, 0.002),
    (0.09, 0.124, 0.006, 0.006),
    (0.18, 0.091, 0.02, 0.014),
    (0.26, 0.055, 0.05, 0.022),
]
CROWN_TIP = (0.322, 0.105, 0.03)  # height above the brim, x and y


def hat():
    # The brim: twelve facets round, its edge a little wavy, as old felt is.
    n = 12
    rings = []
    for k, (r, dz) in enumerate(BRIM):
        ring = []
        for i in range(n):
            a = math.tau * (i + 0.5) / n
            wave = (0.012 if i % 2 else -0.008) if k == len(BRIM) - 1 else 0.0
            ring.append(V(r * math.cos(a), r * math.sin(a), BRIM_Z + dz + wave))
        rings.append(ring)
    verts, faces, _ = loft(rings)
    part('brim', verts, faces, M['team'], outward=V(0, 0, 1))

    rings = [ellipse(cx, cy, BRIM_Z + dz, r, r, 8, 22.5) for dz, r, cx, cy in CROWN]
    verts, faces, bands = loft(rings)
    face_mats = [1 if b == 0 else 0 for b in bands]
    apex = len(verts)
    verts.append(V(CROWN_TIP[1], CROWN_TIP[2], BRIM_Z + CROWN_TIP[0]))
    last = (len(CROWN) - 1) * 8
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    face_mats += [0] * 8
    axis = [V(cx, cy, BRIM_Z + dz) for dz, _, cx, cy in CROWN] + [verts[apex]]
    part('crown', verts, faces, [M['team'], M['hatband']], face_mats, inside=nearest_on_polyline(axis))


# Arms: wide grey sleeves and big hands. The right holds the staff out from his side; the left rests
# on Glamdring's hilt. Placed where the stoop has carried the shoulders.
R_SHOULDER, R_ELBOW, R_WRIST = V(-0.205, -0.02, 1.02), V(-0.33, 0.0, 0.85), V(-0.405, -0.105, 0.932)
L_SHOULDER, L_ELBOW = V(0.205, -0.02, 1.02), V(0.32, 0.045, 0.84)


def arm(side, shoulder, elbow, wrist, fist, grip, thumb=False):
    tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.08), (1.12, 0.072)], M['robe'])
    tube(f'cuff-{side}', elbow, wrist, [(-0.15, 0.068), (1.0, 0.098)], M['robe'])
    ahead = (fist - elbow).normalized()
    up = (Vector(grip) - Vector(grip).dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    box(f'fist-{side}', fist, [ahead, up, across], (0.052, 0.056, 0.056), M['skin'], 0.88)
    if thumb:
        centre = fist + 0.012 * ahead + 0.03 * up - 0.058 * across
        box(f'thumb-{side}', centre, [ahead, up, across], (0.044, 0.022, 0.019), M['skin'], 0.7)


# Staff, in his right hand: crooked, knotted where it bends, swelling to a knob with a light on top ----

STAFF_GRIP = V(-0.43, -0.148, 0.955)  # in his fist
STAFF_UP = V(-0.085, 0.03, 1.0).normalized()  # leaning out from him a little
STAFF = [  # distance along the staff from his fist (None for the foot, on the ground), radius, kink
    (None, 0.022, V(0, 0, 0)),
    (-0.485, 0.035, V(0.012, -0.008, 0)),
    (0.0, 0.028, V(0, 0, 0)),
    (0.447, 0.034, V(-0.01, 0.01, 0)),
    (0.688, 0.027, V(0.004, 0.0, 0)),
    (0.768, 0.054, V(0, 0, 0)),
    (0.838, 0.042, V(0.006, 0.004, 0)),
]
STAFF_TWIST = 22  # degrees each ring turns from the last
LIGHT_R, LIGHT_H = 0.04, 0.062


def staff_stations():
    """The staff's (centre, radius) stations, its foot on the ground."""
    stations = []
    for t, r, kink in STAFF:
        if t is None:
            t = -STAFF_GRIP.z / STAFF_UP.z
        stations.append((STAFF_GRIP + t * STAFF_UP + kink, r))
    return stations


def staff():
    stations = staff_stations()
    rings = rod_rings(stations, 5, STAFF_TWIST)
    rings[0] = [V(p.x, p.y, 0.0) for p in rings[0]]  # the foot flat on the ground
    verts, faces, _ = loft(rings)
    apex = len(verts)
    top = stations[-1][0]
    verts.append(top + 0.025 * STAFF_UP)
    last = (len(stations) - 1) * 5
    faces += [(last + i, last + (i + 1) % 5, apex) for i in range(5)]
    axis = [p for p, _ in stations] + [verts[apex]]
    part('staff', verts, faces, M['wood'], inside=nearest_on_polyline(axis))

    # A short side shoot below the knob, cut off: the staff was a living branch.
    root = stations[4][0].lerp(stations[5][0], 0.3)
    twig = root + V(-0.075, 0.012, 0.055)
    tube('twig', root, twig, [(0, 0.02), (1, 0.013)], M['wood'], n=5)
    ring = segment(root, twig, [(1, 0.013)], 5)[0]
    verts = ring + [twig + 0.01 * (twig - root).normalized()]
    faces = [(i, (i + 1) % 5, 5) for i in range(5)]
    part('twig-end', verts, faces, M['wood'], inside=root.lerp(twig, 0.8))

    # The light: a small crystal of cold white, set in the knob.
    c, r, h = top + 0.06 * STAFF_UP, LIGHT_R, LIGHT_H
    verts = [c + V(r * math.cos(a), r * math.sin(a), 0) for a in (0.4 + k * math.pi / 2 for k in range(4))]
    verts += [c + h * STAFF_UP, c - 0.8 * h * STAFF_UP]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('light', verts, faces, M['light'], inside=c)

    arm('right', R_SHOULDER, R_ELBOW, R_WRIST, STAFF_GRIP, STAFF_UP, thumb=True)


# Glamdring, sheathed at his left hip, the hilt forward and up under his hand -------------------------

HILT = V(0.226, -0.105, 0.70)  # the crossguard
HILT_DIR = V(-0.05, -0.7, 0.71).normalized()  # from the crossguard to the pommel


def glamdring():
    across = (V(1, 0, 0) - V(1, 0, 0).dot(HILT_DIR) * HILT_DIR).normalized()
    flat = HILT_DIR.cross(across)
    # The scabbard runs back under his cloak, where the rest of it is hidden.
    axes = [-HILT_DIR, across, flat]
    box('scabbard', HILT - 0.19 * HILT_DIR, axes, (0.18, 0.03, 0.018), M['leather'], 0.75)
    box('crossguard', HILT, [HILT_DIR, across, flat], (0.014, 0.078, 0.02), M['steel'], 0.8)
    pommel = HILT + 0.15 * HILT_DIR
    verts = [pommel + 0.026 * d for d in (across, flat, -across, -flat)]
    verts += [pommel + 0.03 * HILT_DIR, pommel - 0.02 * HILT_DIR]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('pommel', verts, faces, M['steel'], inside=pommel)

    fist = HILT + 0.075 * HILT_DIR
    wrist = fist + (L_ELBOW - fist).normalized() * 0.05
    arm('left', L_SHOULDER, L_ELBOW, wrist, fist, HILT_DIR)


def main():
    reset()
    make_materials()
    boot('boot-right', RIGHT_ANKLE, RIGHT_YAW)
    boot('boot-left', LEFT_ANKLE, LEFT_YAW)

    built = set(bpy.context.scene.objects)
    robe()
    mantle()
    cloak()
    scarf()
    hair()
    face()
    moustache()
    stoop([o for o in bpy.context.scene.objects if o not in built])

    built = set(bpy.context.scene.objects)
    beard()
    carry([o for o in bpy.context.scene.objects if o not in built], V(0, -STOOP, 0))

    built = set(bpy.context.scene.objects)
    hat()
    hat_parts = [o for o in bpy.context.scene.objects if o not in built]
    lean(hat_parts, HEAD, -HAT_TILT)
    carry(hat_parts, V(0, -STOOP, 0))

    staff()
    glamdring()
    finish('gandalf')


main()
