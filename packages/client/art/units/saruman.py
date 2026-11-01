"""Saruman the White, of the Istari: a Sorcerer, in the Faceted style (docs/viewer-spec.md section 4).

Drawn from the books, not the films: the head of the Istari and lord of Orthanc, tall and proud,
with a long face, a high forehead and deep dark eyes under black brows; his hair and long beard white,
with strands of black still about his lips. He wears no hat, and holds his head high. His robe is
white to the ground. A straight black staff with a pale stone at its head is planted at his right
side, and in his left hand he weighs the palantir of Orthanc, a dark globe of crystal. He stands
upright, where Gandalf stoops.

Gandalf's people (gandalf.py): about 1.48 to the top of his head, a Man's proportions in a robe;
the staff goes higher. The team colour is a short cape over his shoulders, open at the front, seen
from every side and from above, and the long ends of a stole hanging from under it down the front
of his robe on either side of the beard. His long white hair falls over the cape at his back, so
from behind he is a white-haired wizard in a white robe as much as the team's colour. Everything
else is white, black and skin.

    blender --background --factory-startup --python-exit-code 1 --python saruman.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, on the staff, is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    EYES,
    V,
    box,
    ellipse,
    finish,
    loft,
    lump,
    material,
    nearest_on_line,
    nearest_on_polyline,
    on_surface,
    part,
    reset,
    segment,
    stoop,
    team_material,
    tube,
)

# Saruman's own colours (sRGB). The robe is a warm ivory and the hair a cooler, lighter white, so the
# beard stands off the robe; the black of his staff and strands is lifted so its facets show.
ROBE = 0xD9D3C6
HAIR = 0xEAE8E2
STREAK = 0x2E2A27
SKIN = 0xD6A88C
LEATHER = 0x37312C  # his girdle and shoes, black leather
BLACK = 0x33302D  # the staff
IRON = 0x4B4743
STONE = 0xEFEEE8  # a pale white, neither blue nor warm
GLOBE = 0x353331  # the palantir's dark crystal, lifted so its facets show

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        robe=material('robe', ROBE, roughness=0.9),
        hair=material('hair', HAIR, roughness=0.9),
        streak=material('streak', STREAK, roughness=0.9),
        skin=material('skin', SKIN, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
        leather=material('leather', LEATHER, roughness=0.8),
        staff=material('staff', BLACK, roughness=0.55, metallic=0.1),
        iron=material('iron', IRON, roughness=0.45, metallic=0.15),
        stone=material('stone', STONE, roughness=0.4, emission=STONE, emission_strength=1.0),
        palantir=material('palantir', GLOBE, roughness=0.25),
    )


def front_triangles(rings, closed=True):
    """The forward-facing triangles of a lofted surface, to place things on its front with
    on_surface()."""
    verts, faces, _ = loft(rings, closed)
    triangles = []
    for a, b, c, d in faces:
        for t in ((verts[a], verts[b], verts[c]), (verts[a], verts[c], verts[d])):
            facing = (t[1] - t[0]).cross(t[2] - t[0])
            if (t[0] + t[1] + t[2]).y < 0 and abs(facing.y) > 0.2 * facing.length:
                triangles.append(t)
    return triangles


# Robe: white to the ground, a black girdle ------------------------------------------------------

# The skirt below the girdle, in twelve pleats that are deepest at the hem: z, half-width,
# half-depth, centre y and the depth of the pleats.
SKIRT = [
    (0.0, 0.258, 0.236, 0.012, 0.032),  # the hem, on the ground
    (0.40, 0.212, 0.188, 0.006, 0.018),
    (0.80, 0.166, 0.14, 0.0, 0.0),  # under the girdle
]

# The robe from the girdle up, in octagons: z, half-width, half-depth and centre y.
TORSO = [
    (0.775, 0.172, 0.146, 0.0),  # girdle, lower edge
    (0.83, 0.178, 0.15, 0.0),  # girdle, upper edge
    (1.075, 0.212, 0.148, 0.01),  # shoulders
    (1.19, 0.092, 0.088, 0.02),  # neck
]
TORSO_BANDS = [1, 0, 0]  # the girdle, then robe


def skirt_rings():
    rings = []
    for z, rx, ry, cy, pleat in SKIRT:
        ring = []
        for i in range(12):
            a = math.tau * i / 12
            k = pleat if i % 2 else 0.0
            ring.append(V((rx + k) * math.cos(a), cy + (ry + k) * math.sin(a), z))
        rings.append(ring)
    return rings


def torso_rings():
    return [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]


def robe():
    verts, faces, _ = loft(skirt_rings())
    part('skirt', verts, faces, M['robe'], inside=lambda c: V(0, 0.01, c.z))
    verts, faces, bands = loft(torso_rings())
    face_mats = [TORSO_BANDS[b] for b in bands]
    part('torso', verts, faces, [M['robe'], M['leather']], face_mats, inside=lambda c: V(0, 0.01, c.z))


# Only the toes of his shoes show under the hem.
SHOES = [(V(-0.085, -0.13, 0), -10), (V(0.09, -0.12, 0), 12)]  # heel and yaw


def shoes():
    for k, (at, yaw) in enumerate(SHOES):
        turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
        toe = [V(0.026, -0.13, 0.014), V(-0.026, -0.13, 0.014)]  # a broad, blunt toe
        sides = [V(0.052, -0.06, 0), V(-0.052, -0.06, 0)]
        instep, back = V(0, -0.07, 0.064), V(0, 0.03, 0.04)
        verts = [at + turn @ p for p in toe + sides + [instep, back]]
        faces = [(0, 1, 4), (0, 4, 2), (1, 3, 4), (2, 4, 5), (4, 3, 5), (0, 2, 3, 1)]
        part(f'shoe-{k}', verts, faces, M['leather'], inside=at + V(0, -0.04, 0.02))


# Team colour: a short cape, and a stole down the front ---------------------------------------------

# The cape from the neckline down, open at the front: z at the front and at the back, half-width,
# half-depth, centre y, how deep its folds stand out, and half the opening (degrees).
CAPE = [
    (1.15, 1.17, 0.135, 0.125, 0.015, 0.0, 34),  # the neckline
    (1.07, 1.095, 0.258, 0.19, 0.012, 0.0, 40),  # over the shoulders
    (0.92, 0.83, 0.288, 0.218, 0.02, 0.018, 44),  # the hem, lowest down his back
]
N_CAPE = 13  # points round, from the left edge of the opening round the back to the right


def cape_ring(front, back, rx, ry, cy, fold, opening):
    ring = []
    for i in range(N_CAPE):
        a = math.radians(-90 + opening + (360 - 2 * opening) * i / (N_CAPE - 1))
        z = front + (back - front) * (1 + math.sin(a)) / 2
        k = 1 + (fold / ry if i % 2 else 0)
        ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
    return ring


def cape():
    rings = [cape_ring(*level) for level in CAPE]
    verts, faces, _ = loft(rings, closed=False)
    part('cape', verts, faces, M['team'], inside=lambda c: V(0, 0.01, c.z))


# The stole's ends hang from under the cape down his front on either side of the beard, to his
# knees: z, then x of the inner edge, the middle and the outer edge on his left (mirrored on his right).
STOLE = [
    (1.15, 0.058, 0.08, 0.102),  # at the neck, under the beard
    (1.03, 0.092, 0.128, 0.164),  # over the chest, beside the beard
    (0.81, 0.07, 0.105, 0.14),  # over the girdle
    (0.34, 0.068, 0.106, 0.144),  # the end, at the knee
]
STOLE_OFF = 0.014  # how far it stands in front of the robe


def stole():
    upper = front_triangles(torso_rings())
    lower = front_triangles(skirt_rings())
    for s in (-1, 1):
        rings = []
        for z, *xs in STOLE:
            surface = upper if z >= 0.8 else lower
            ring = [V(s * x, on_surface(surface, s * x, z) - STOLE_OFF, z) for x in xs]
            rings.append(ring if s > 0 else list(reversed(ring)))
        verts, faces, _ = loft(rings, closed=False)
        part(f'stole-{s}', verts, faces, M['team'], outward=V(0, -1, 0))


# Head ----------------------------------------------------------------------------------------------

HEAD_RAISE = (1.2, 1.49, -0.012)  # stoop() from and to these heights, by this much: back, chin up

# The face: a shallow pyramid of planes round the root of the nose, long, from the high hairline
# round the cheekbones to the chin under the moustache.
FACE_RIM = [
    V(-0.084, -0.1, 1.44), V(0.084, -0.1, 1.44), V(0.122, -0.08, 1.31),
    V(0.068, -0.124, 1.218), V(0, -0.136, 1.205), V(-0.068, -0.124, 1.218), V(-0.122, -0.08, 1.31),
]
FACE_ROOT = V(0, -0.154, 1.36)


def face():
    rim, root = FACE_RIM, FACE_ROOT
    plate = [(rim[i], rim[(i + 1) % 7], root) for i in range(7)]
    part('face', rim + [root], [(i, (i + 1) % 7, 7) for i in range(7)], M['skin'], outward=V(0, -1, 0))

    # His hair is set back from his face: the skin of the high forehead runs up and back from the
    # plate to the hairline, and round the temples and cheeks to the hair at his sides.
    ends = [level[-1] for level in HAIR_LEVELS]
    for s in (-1, 1):
        hairline = [V(s * p.x, p.y, p.z) for p in ends]
        i, j, k = (1, 2, 3) if s > 0 else (0, 6, 5)  # the rim's top, cheekbone and jaw on this side
        verts = [rim[i], hairline[0], hairline[1], rim[j], hairline[2], rim[k]]
        part(f'temple-{s}', verts, [(0, 1, 2, 3), (3, 2, 4, 5)], M['skin'], inside=V(0, 0.0, 1.33))
    top = [rim[0], rim[1], ends[0], V(-ends[0].x, ends[0].y, ends[0].z)]
    part('forehead', top, [(0, 1, 2, 3)], M['skin'], inside=V(0, 0.0, 1.33))

    # Deep dark eyes under the brows, laid just proud of the plate.
    for s in (-1, 1):
        corners = [(s * 0.026, 1.352), (s * 0.088, 1.358), (s * 0.06, 1.333)]
        verts = [V(x, on_surface(plate, x, z) - 0.006, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A long straight nose.
    top, bridge, tip = V(0, -0.154, 1.378), V(0, -0.192, 1.33), V(0, -0.222, 1.274)
    left, right, under = V(-0.04, -0.152, 1.272), V(0.04, -0.152, 1.272), V(0, -0.168, 1.257)
    verts = [top, bridge, tip, left, right, under]
    faces = [(0, 3, 1), (0, 1, 4), (1, 3, 2), (1, 2, 4), (3, 5, 2), (5, 4, 2)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.12, 1.3))

    # Black brows, each a wedge rising from the root of the nose to the temple: a hard frown.
    for s in (-1, 1):
        inner = [V(s * 0.012, -0.15, 1.382), V(s * 0.012, -0.174, 1.372), V(s * 0.012, -0.153, 1.362)]
        mid = [V(s * 0.07, -0.118, 1.394), V(s * 0.072, -0.146, 1.386), V(s * 0.07, -0.124, 1.375)]
        tip = V(s * 0.104, -0.096, 1.392)
        verts = inner + mid + [tip]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5), (3, 4, 6), (4, 5, 6), (5, 3, 6), (0, 2, 1)]
        part(f'brow-{s}', verts, faces, M['streak'], inside=sum(verts, Vector()) / len(verts))


# The hair: a C open at the face, from his left temple round the back to his right, its ends set back
# from the face where the skin of his temples meets them, with locks standing out round it and ending
# in points at his jaw and nape; the crown closes it over the top.
HAIR_ANGLES = [-40, -5, 30, 60, 90, 120, 150, 185, 220]
HAIR_LOCKS = [0, 0, 1, 0, 1, 0, 1, 0, 0]  # the points that stand out as the ridge of a lock
HAIR_LEVELS = [  # z at the sides and at the back, half-width, half-depth, centre y and how far the
    # locks stand out; then where its ends are on his left
    (1.44, 1.415, 0.128, 0.134, 0.0, 0.006, V(0.1, -0.082, 1.47)),  # the hairline, set back
    (1.33, 1.33, 0.141, 0.158, 0.008, 0.012, V(0.14, -0.042, 1.33)),  # over the ears; the skull
    (1.21, 1.21, 0.13, 0.13, 0.02, 0.014, V(0.118, -0.04, 1.215)),  # the jaw; the nape
]
HAIR_TIPS = [0, -0.015, -0.03, 0.0, -0.03, 0.0, -0.03, -0.015, 0]  # how far each lock hangs lower
CROWN = (1.478, 0.085, 0.09, 0.012)  # z, half-width, half-depth and centre y of the ring under the top
CROWN_TOP = V(0, 0.012, 1.488)

# The rest of his hair falls from the back of his skull down over the cape, narrower than his head, in
# three locks: z, then (x, y) of its edge on his left, the lock there, the parting and the middle lock.
FALL = [
    (1.30, [(0.09, 0.1), (0.065, 0.145), (0.033, 0.15), (0.0, 0.158)]),  # under the back of the skull
    (1.19, [(0.1, 0.13), (0.072, 0.172), (0.036, 0.172), (0.0, 0.18)]),  # the nape
    (1.08, [(0.112, 0.208), (0.08, 0.245), (0.04, 0.243), (0.0, 0.255)]),  # on the cape
    (0.96, [(0.092, 0.238), (0.066, 0.266), (0.033, 0.262), (0.0, 0.274)]),  # the ends
]
FALL_TIPS = [0.04, -0.03, 0.03, -0.04]  # how far the end at each of those hangs lower (-) or higher


def hair():
    rings = []
    last = len(HAIR_LEVELS) - 1
    for k, (side, back, rx, ry, cy, lock, end) in enumerate(HAIR_LEVELS):
        ring = []
        for i, a in enumerate(map(math.radians, HAIR_ANGLES)):
            out = lock * HAIR_LOCKS[i]
            z = side + (back - side) * max(0.0, math.sin(a)) ** 2 + (HAIR_TIPS[i] if k == last else 0.0)
            ring.append(V((rx + out) * math.cos(a), cy + (ry + out) * math.sin(a), z))
        ring[0], ring[-1] = end, V(-end.x, end.y, end.z)
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, 0.02, c.z))

    # The crown: the hairline ring closed across his brow, a smaller ring and the top.
    z, rx, ry, cy = CROWN
    top = [V(rx * math.cos(a), cy + ry * math.sin(a), z) for a in map(math.radians, HAIR_ANGLES)]
    verts, faces, _ = loft([rings[0], top])
    apex = len(verts)
    verts.append(CROWN_TOP)
    m = len(top)
    faces += [(m + i, m + (i + 1) % m, apex) for i in range(m)]
    part('crown', verts, faces, M['hair'], inside=V(0, 0.0, 1.36))

    rings = []
    for k, (z, half) in enumerate(FALL):
        tips = FALL_TIPS if k == len(FALL) - 1 else [0.0] * 4
        left = [V(x, y, z + dz) for (x, y), dz in zip(half, tips)]
        right = [V(-p.x, p.y, p.z) for p in reversed(left[:-1])]
        rings.append(right + left)
    verts, faces, _ = loft(rings, closed=False)
    part('fall', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z))


def moustache():
    # Black, in two sweeps from under the nose down into the beard.
    for s in (-1, 1):
        root = [V(s * 0.01, -0.165, 1.25), V(s * 0.01, -0.192, 1.238), V(s * 0.01, -0.162, 1.228)]
        mid = [V(s * 0.055, -0.17, 1.234), V(s * 0.056, -0.2, 1.218), V(s * 0.055, -0.168, 1.206)]
        tip = V(s * 0.076, -0.192, 1.17)
        verts = root + mid + [tip]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5), (3, 4, 6), (4, 5, 6), (5, 3, 6)]
        part(f'moustache-{s}', verts, faces, M['streak'], inside=sum(verts, Vector()) / len(verts))


# The beard: long, narrow and white, from the cheeks to a point below his girdle, in three locks (a W
# in section). Each level runs from his right side across the front to his left.
BEARD = [  # (x, y, z) of the right-side back, the lock's ridge, the valley; then the centre ridge
    [(-0.124, -0.07, 1.31), (-0.118, -0.105, 1.262), (-0.066, -0.138, 1.232), (0.0, -0.146, 1.222)],
    [(-0.132, -0.08, 1.20), (-0.126, -0.142, 1.172), (-0.066, -0.17, 1.162), (0.0, -0.18, 1.156)],
    [(-0.138, -0.09, 1.10), (-0.132, -0.17, 1.08), (-0.066, -0.196, 1.07), (0.0, -0.212, 1.065)],
    [(-0.11, -0.12, 0.94), (-0.102, -0.196, 0.93), (-0.05, -0.21, 0.925), (0.0, -0.226, 0.92)],
    [(-0.06, -0.14, 0.78), (-0.056, -0.186, 0.775), (-0.028, -0.194, 0.77), (0.0, -0.204, 0.765)],
    [(-0.012, -0.15, 0.66), (-0.011, -0.165, 0.658), (-0.006, -0.167, 0.656), (0.0, -0.17, 0.654)],
]
# Black strands still run through it from the corners of his mouth, laid on it: for each, x and z
# of the middle of its top, its width there, and x and z of its point. Each is drawn down the beard
# in STRAND_ROWS, narrowing to the point.
STRANDS = [
    ((-0.074, 1.19), 0.034, (-0.056, 0.99)),
    ((0.072, 1.18), 0.03, (0.062, 1.04)),
    ((-0.02, 1.13), 0.022, (-0.014, 1.03)),
]
STRAND_ROWS = 4


def beard():
    rings = []
    for level in BEARD:
        right = [V(*p) for p in level]
        left = [V(-p.x, p.y, p.z) for p in reversed(right[:-1])]
        rings.append(right + left)
    verts, faces, _ = loft(rings, closed=False)
    part('beard', verts, faces, M['hair'], inside=lambda c: V(0, -0.05, c.z))

    surface = front_triangles(rings, closed=False)
    for k, ((x, z), width, (px, pz)) in enumerate(STRANDS):
        verts, faces = [], []
        for r in range(STRAND_ROWS):
            t = r / STRAND_ROWS
            cx, cz, w = x + (px - x) * t, z + (pz - z) * t, width * (1 - t) / 2
            verts += [V(cx + dx, on_surface(surface, cx + dx, cz) - 0.006, cz) for dx in (-w, w)]
            if r:
                faces.append((2 * r - 2, 2 * r - 1, 2 * r + 1, 2 * r))
        verts.append(V(px, on_surface(surface, px, pz) - 0.006, pz))
        faces.append((len(verts) - 3, len(verts) - 2, len(verts) - 1))
        part(f'strand-{k}', verts, faces, M['streak'], outward=V(0, -1, 0))


# Arms: wide white sleeves hanging to a point below the wrist, and big hands -------------------------

R_SHOULDER, R_ELBOW, R_WRIST = V(-0.205, 0.005, 1.065), V(-0.325, 0.04, 0.885), V(-0.385, -0.085, 0.985)
L_SHOULDER, L_ELBOW, L_WRIST = V(0.205, 0.005, 1.065), V(0.33, 0.05, 0.875), V(0.29, -0.12, 0.86)
SLEEVE_DROOP = 0.07  # how far the bell of the sleeve hangs below the wrist


def sleeve(side, shoulder, elbow, wrist, hand):
    tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.078), (1.1, 0.07)], M['robe'])
    # The wrist runs from inside the sleeve to the middle of the hand, so the hand is held by it.
    stations = [(0, 0.032), (1, 0.03)]
    tube(f'wrist-{side}', elbow.lerp(wrist, 0.55), hand, stations, M['skin'], n=4, phase=45)
    cuff = elbow.lerp(wrist, 0.92)
    rings = segment(elbow, cuff, [(-0.12, 0.066), (0.5, 0.082), (1.0, 0.118)], 6, 30)
    for p in rings[-1]:
        drop = cuff.z - p.z
        if drop > 0:
            p.z -= SLEEVE_DROOP * drop / 0.118
    verts, faces, _ = loft(rings)
    part(f'bell-{side}', verts, faces, M['robe'], inside=nearest_on_line(elbow, cuff))


def fist(side, at, ahead, grip, thumb=False):
    up = (Vector(grip) - Vector(grip).dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    box(f'fist-{side}', at, [ahead, up, across], (0.052, 0.056, 0.056), M['skin'], 0.88)
    if thumb:
        centre = at + 0.012 * ahead + 0.03 * up - 0.058 * across
        box(f'thumb-{side}', centre, [ahead, up, across], (0.044, 0.022, 0.019), M['skin'], 0.7)


# Staff, in his right hand: straight and black, a knop and a cup at its head holding a pale stone ----

STAFF_GRIP = V(-0.40, -0.125, 1.005)  # in his fist
STAFF_UP = V(-0.035, -0.012, 1.0).normalized()  # upright, leaning out from him a little
STAFF = [  # distance along the staff from his fist (None for the foot, on the ground) and radius
    (None, 0.021),
    (0.0, 0.025),
    (0.64, 0.027),  # under the head
    (0.675, 0.046),  # the knop
    (0.71, 0.027),
    (0.735, 0.03),
    (0.79, 0.054),  # the lip of the cup
]
STAFF_BANDS = [0, 0, 1, 1, 1, 1]  # the black shaft, then its iron head
STONE_AT, STONE_R, STONE_H = 0.83, 0.05, 0.075  # the stone's middle along the staff, radius, half-height


def staff():
    points, radii = [], []
    for t, r in STAFF:
        if t is None:
            t = -STAFF_GRIP.z / STAFF_UP.z
        points.append(STAFF_GRIP + t * STAFF_UP)
        radii.append(r)
    rings = [segment(p, p + STAFF_UP, [(0, r)], 6, 0)[0] for p, r in zip(points, radii)]
    rings[0] = [V(p.x, p.y, 0.0) for p in rings[0]]  # the foot flat on the ground
    verts, faces, bands = loft(rings)
    face_mats = [STAFF_BANDS[b] for b in bands]
    part('staff', verts, faces, [M['staff'], M['iron']], face_mats, inside=nearest_on_polyline(points))
    # The floor of the cup, under the stone: on the staff's line, so wound by the way up it faces.
    part('cup', rings[-1], [tuple(range(6))], M['iron'], outward=STAFF_UP)

    centre = STAFF_GRIP + STONE_AT * STAFF_UP
    lump('stone', centre, (STONE_R, STONE_R, STONE_H), M['stone'], seed=7, rough=0.0, angles=(0, 0, 18))

    sleeve('right', R_SHOULDER, R_ELBOW, R_WRIST, STAFF_GRIP)
    fist('right', STAFF_GRIP, (STAFF_GRIP - R_ELBOW).normalized(), STAFF_UP, thumb=True)


# The palantir, weighed in his left hand ------------------------------------------------------------

GLOBE_R = 0.066


def palantir():
    ahead = L_WRIST - L_ELBOW
    ahead = V(ahead.x, ahead.y, 0).normalized()
    up = V(0, 0, 1)
    across = ahead.cross(up)
    palm = L_WRIST + 0.045 * ahead
    sleeve('left', L_SHOULDER, L_ELBOW, L_WRIST, palm)
    box('palm', palm, [ahead, up, across], (0.052, 0.022, 0.05), M['skin'], 0.9)
    # The fingers curl up round the far side of the globe, the thumb round its near side.
    fingers = palm + 0.05 * ahead + 0.035 * up
    box('fingers', fingers, [up, -ahead, across], (0.036, 0.018, 0.046), M['skin'], 0.85)
    thumb = palm - 0.02 * ahead + 0.03 * up - 0.05 * across
    box('thumb-left', thumb, [up, ahead, across], (0.03, 0.02, 0.016), M['skin'], 0.8)
    globe = palm + (0.022 + GLOBE_R) * up  # resting on the palm
    lump('palantir', globe, GLOBE_R, M['palantir'], seed=3, rough=0.0, angles=(10, 20, 0))


def main():
    reset()
    make_materials()
    shoes()
    robe()
    cape()
    stole()
    built = set(bpy.context.scene.objects)
    face()
    hair()
    moustache()
    beard()
    # He holds his head high: above his jaw it is carried back, more the higher it is, which tips
    # his face up.
    stoop([o for o in bpy.context.scene.objects if o not in built], *HEAD_RAISE)
    staff()
    palantir()
    finish('saruman')


main()
