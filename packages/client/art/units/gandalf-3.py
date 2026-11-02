"""Gandalf the White, of the Istari: a Sorcerer, in the Faceted style (docs/viewer-spec.md section 4).

His 3★ model, the book moment (docs/viewer-spec.md section 4, "Star levels"): the same Gandalf as
gandalf.py, come back as the White Rider, as Aragorn, Legolas and Gimli saw him in Fangorn: "His
hair was white as snow in the sunshine; and gleaming white was his robe; the eyes under his deep
brows were bright, piercing as the rays of the sun; power was in his hand" (The Two Towers, III 5,
"The White Rider"). His hat is gone with his grey rags: his head is bare, with white hair over it,
and he stands straighter, "grown suddenly tall". Robe, sleeves and cloak are a warm, muted
off-white, so he reads as white without glaring, and the hair and beard a lighter white; the staff
is white, with its small cold light as before. Glamdring is raised in his left hand, as on the 2★
(gandalf-2.py). Nothing of his own glows, and no ring is on his hand: Narya is not shown.

His face, beard, boots and staff are shaped as on the 1★, with a high forehead where the hat was
and shorter brows, which would otherwise show over his bare head from behind; his raised arm and
sword are the 2★'s. The team colour moves from the hat and scarf to a mantle over his shoulders,
longest down his back and closed under the beard, which reads from the front, from behind and from
above; the clasp on his right shoulder now pins it. His fittings use `trim`, as on the 1★: the
clasp, the belt's buckle, the staff's band and ferrule, Glamdring's cross-guard and pommel and the
locket of its scabbard.

    blender --background --factory-startup --python-exit-code 1 --python gandalf-3.py [-- <out.glb>]

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
    BOOK_BUDGET,
    LEATHER,
    V,
    box,
    cone,
    ellipse,
    finish,
    loft,
    material,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    trim_material,
    tube,
)

# Gandalf's own colours (sRGB); the rest come from the kit. The whites are warm and muted, so they
# read as white in the game's light without glaring, and neither grey nor, in its cool light, blue.
# The cloak is a step darker than the robe, so the layers show, and the hair a cooler, lighter white,
# so the beard stands off the robe.
ROBE = 0xD9D3C6
CLOAK = 0xC9C2B4
HAIR = 0xECEAE4
SKIN = 0xD8A88C
STAFF_WHITE = 0xD3CBBA  # the white staff, its grain a little warmer than the robe
LIGHT = 0xEDEDE8  # a cold white, not blue
BLADE = 0xD6D7D3  # Glamdring: bright steel, "cold and white", never blue

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
        wood=material('wood', STAFF_WHITE, roughness=0.8),
        light=material('light', LIGHT, roughness=0.6, emission=LIGHT, emission_strength=1.0),
        trim=trim_material(),  # fittings, recoloured by star
        blade=material('blade', BLADE, roughness=0.3, metallic=0.1),
    )


# Helpers -------------------------------------------------------------------------------------------

# He stoops less than the 1★ (0.07): above the small of his back the body is carried forward, more
# the higher it is, up to STOOP at the base of his neck. His head is carried forward by all of it.
STOOP_FROM, STOOP_TO, STOOP = 0.62, 1.12, 0.03


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


# Team colour: the mantle over his shoulders, round his neck, over his shoulders and the tops of his
# arms and down his back to below the shoulder blades, closed in front under the beard. Twelve
# points round from his left (+X); each ring: z at the front, at the sides and at the back,
# half-width, half-depth, centre y and how far every other point stands out, in folds.
MANTLE = [
    ((1.13, 1.15, 1.175), 0.128, 0.118, 0.02, 0.0),  # round his neck
    ((1.02, 1.04, 1.06), 0.282, 0.208, 0.02, 0.0),  # over the shoulders
    ((0.86, 0.87, 0.785), 0.318, 0.258, 0.03, 0.018),  # the hem, lowest down his back
]
MANTLE_POINTS = 12


def mantle():
    rings = []
    for (front, side, back), rx, ry, cy, fold in MANTLE:
        ring = []
        for i in range(MANTLE_POINTS):
            a = math.tau * i / MANTLE_POINTS
            s = math.sin(a)  # 1 at his back, -1 at his front
            z = side + (back - side) * s if s > 0 else side + (front - side) * -s
            k = 1 + (fold / ry if i % 2 else 0)
            ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings)
    part('mantle', verts, faces, M['team'], inside=V(0, 0.02, 0.9))


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


BUCKLE_AT = 0.5  # how far along the belt's front-right facet the buckle is, from the front
CLASP = (V(-0.214, -0.142, 0.945), V(-0.6, -0.78, 0.2))  # the mantle's clasp: where, and facing


def fittings():
    """The buckle of his belt, on its front-right face beside the beard, and the clasp that pins his
    mantle at the front of his right shoulder."""
    # The belt's facet between the octagon's points at 202.5 and 247.5 degrees, half-way up.
    z = (ROBE_RINGS[0][0] + ROBE_RINGS[1][0]) / 2
    rx = (ROBE_RINGS[0][1] + ROBE_RINGS[1][1]) / 2
    ry = (ROBE_RINGS[0][2] + ROBE_RINGS[1][2]) / 2
    a, b = (V(rx * math.cos(math.radians(d)), ry * math.sin(math.radians(d)), z) for d in (247.5, 202.5))
    along = (b - a).normalized()
    out = V(0, 0, 1).cross(along)
    centre = a.lerp(b, BUCKLE_AT) + 0.008 * out
    box('buckle', centre, [out, along, V(0, 0, 1)], (0.009, 0.024, 0.032), M['trim'], 0.7)

    # The clasp: a round boss on the mantle, facing out, forward and a little up.
    centre, out = CLASP
    out = out.normalized()
    cone('clasp', centre - 0.004 * out, centre + 0.016 * out, 0.03, M['trim'], n=6, back=None)


# Head ----------------------------------------------------------------------------------------------

# His hair, white as snow: a C open at the face, from his left temple round the back to his right,
# its front edge along the sides of the face; then, where the hat was, a crown over the top of his
# head from a hairline along the top of his brow. Below his ears it is in locks, every other point
# standing out as a lock's ridge and hanging lower in a point, and at his back it falls over the
# mantle's collar. Each level: z at the sides and at the back, half-width, half-depth, centre y and
# how far the ridges stand out.
HAIR_ANGLES = [-38, -10, 18, 44, 67, 90, 113, 136, 162, 190, 218]
HAIR_LEVELS = [
    (1.49, 1.49, 0.118, 0.12, 0.012, 0.0),  # under the crown
    (1.31, 1.31, 0.152, 0.158, 0.012, 0.012),  # over his ears
    (1.16, 1.09, 0.166, 0.198, 0.035, 0.018),  # the ends: at his jaw, and on the mantle at his back
]
HAIR_TIPS = 0.035  # how far the locks' points hang below the ends
TEMPLES = [(0.092, -0.094, 1.49), (0.136, -0.104, 1.31)]  # its front edge on his left, by level
HAIRLINE = V(0, -0.093, 1.506)  # the middle of the hairline, over the top of the forehead
# The ring under the top of his head: z, half-width, half-depth, centre y and how far every other
# point stands out, so the hair rises from his brow in locks swept back over his head.
CROWN = (1.53, 0.1, 0.108, -0.008, 0.008)
CROWN_TOP = V(0, 0.012, 1.55)


def hair():
    rings = []
    last = len(HAIR_LEVELS) - 1
    for k, (side, back, rx, ry, cy, ridge) in enumerate(HAIR_LEVELS):
        ring = []
        for i, a in enumerate(map(math.radians, HAIR_ANGLES)):
            out = ridge if i % 2 else 0.0
            z = side + (back - side) * max(0.0, math.sin(a)) ** 2
            if k == last and i % 2:
                z -= HAIR_TIPS
            ring.append(V((rx + out) * math.cos(a), cy + (ry + out) * math.sin(a), z))
        rings.append(ring)
    # Its front edge comes forward over the sides of the face, from just outside its top corners to
    # beside the cheekbones, so no gap shows at the temple and the hair frames the face.
    for k, (x, y, z) in enumerate(TEMPLES):
        rings[k][0], rings[k][-1] = V(x, y, z), V(-x, y, z)
    verts, faces, _ = loft(rings, closed=False)
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, 0.01, c.z))

    # The crown: the top level closed across his brow by the hairline, a smaller ring and the top.
    angles = HAIR_ANGLES + [270]
    z, rx, ry, cy, ridge = CROWN
    upper = []
    for i, a in enumerate(map(math.radians, angles)):
        out = ridge if i % 2 else 0.0
        upper.append(V((rx + out) * math.cos(a), cy + (ry + out) * math.sin(a), z))
    verts, faces, _ = loft([rings[0] + [HAIRLINE], upper])
    apex = len(verts)
    verts.append(CROWN_TOP)
    n = len(angles)
    faces += [(n + i, n + (i + 1) % n, apex) for i in range(n)]
    part('crown', verts, faces, M['hair'], inside=V(0, 0.0, 1.38))


# The face: a shallow pyramid of planes round the root of the nose, from the hairline round the
# cheekbones to behind the moustache. Bare-headed, he has the high forehead the hat hid on the 1★.
FACE_RIM = [
    V(-0.078, -0.086, 1.498), V(0.078, -0.086, 1.498), V(0.122, -0.082, 1.30),
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

    # Deep brows, each a wedge from the root of the nose out to a tuft at the temple. With no hat
    # brim over them they are shorter and stand out less than the 1★'s, so from behind and above they
    # don't show over his hair.
    for s in (-1, 1):
        inner = [V(s * 0.012, -0.15, 1.398), V(s * 0.012, -0.185, 1.374), V(s * 0.012, -0.158, 1.345)]
        mid = [V(s * 0.088, -0.13, 1.405), V(s * 0.09, -0.175, 1.388), V(s * 0.088, -0.14, 1.35)]
        tip = V(s * 0.1, -0.146, 1.394)
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


# Arms: wide white sleeves and big hands. The right holds the staff out from his side; the left holds
# Glamdring up (raised_arm(), below). Placed where the stoop has carried the shoulders.
R_SHOULDER, R_ELBOW, R_WRIST = V(-0.205, 0.005, 1.02), V(-0.33, 0.008, 0.85), V(-0.405, -0.105, 0.932)


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
STAFF = [  # distance along the staff from his fist (None for the foot, on the ground, and 'ferrule'
    # for the top of the ferrule above it), radius, kink
    (None, 0.026, V(0, 0, 0)),
    ('ferrule', 0.028, V(0, 0, 0)),
    (-0.485, 0.035, V(0.012, -0.008, 0)),
    (0.0, 0.028, V(0, 0, 0)),
    (0.447, 0.032, V(-0.01, 0.01, 0)),
    (0.605, 0.036, V(-0.002, 0.006, 0)),  # the band binding it below the knob
    (0.688, 0.036, V(0.004, 0.0, 0)),
    (0.768, 0.054, V(0, 0, 0)),  # the knob
    (0.838, 0.042, V(0.006, 0.004, 0)),
]
STAFF_BANDS = [1, 0, 0, 0, 0, 1, 0, 0]  # the ferrule, the wood, the band, then the wood of the knob
FERRULE = 0.08  # how far the shod foot runs up the staff
STAFF_TWIST = 22  # degrees each ring turns from the last
LIGHT_R, LIGHT_H = 0.04, 0.062


def staff_stations():
    """The staff's (centre, radius) stations, its foot on the ground."""
    stations = []
    foot = -STAFF_GRIP.z / STAFF_UP.z
    for t, r, kink in STAFF:
        if t is None:
            t = foot
        elif t == 'ferrule':
            t = foot + FERRULE
        stations.append((STAFF_GRIP + t * STAFF_UP + kink, r))
    return stations


def staff():
    stations = staff_stations()
    rings = rod_rings(stations, 5, STAFF_TWIST)
    rings[0] = [V(p.x, p.y, 0.0) for p in rings[0]]  # the foot flat on the ground
    verts, faces, bands = loft(rings)
    face_mats = [STAFF_BANDS[b] for b in bands]
    apex = len(verts)
    top = stations[-1][0]
    verts.append(top + 0.025 * STAFF_UP)
    last = (len(stations) - 1) * 5
    faces += [(last + i, last + (i + 1) % 5, apex) for i in range(5)]
    face_mats += [0] * 5
    axis = [p for p, _ in stations] + [verts[apex]]
    part('staff', verts, faces, [M['wood'], M['trim']], face_mats, inside=nearest_on_polyline(axis))

    # A short side shoot below the knob, cut off: the staff was a living branch.
    root = stations[-3][0].lerp(stations[-2][0], 0.3)
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


# Glamdring's scabbard, at his left hip, its mouth forward and up ------------------------------------

HILT = V(0.226, -0.105, 0.70)  # where the cross-guard was, at the scabbard's mouth
HILT_DIR = V(-0.05, -0.7, 0.71).normalized()  # out of the scabbard's mouth


def scabbard():
    across = (V(1, 0, 0) - V(1, 0, 0).dot(HILT_DIR) * HILT_DIR).normalized()
    flat = HILT_DIR.cross(across)
    # The scabbard runs back under his cloak, where the rest of it is hidden; a locket of metal
    # binds its mouth, empty now.
    axes = [-HILT_DIR, across, flat]
    box('scabbard', HILT - 0.19 * HILT_DIR, axes, (0.18, 0.03, 0.018), M['leather'], 0.75)
    box('locket', HILT - 0.04 * HILT_DIR, axes, (0.026, 0.036, 0.024), M['trim'], 0.9)


# Glamdring drawn, held up in his left hand, as on the 2★ ------------------------------------------

# His left arm is raised: the elbow out to his side and the forearm up, the wide sleeve fallen back
# to the elbow so the forearm shows, and the fist beside his head with the blade rising from it, up
# and out to his left, clear of his head. Placed where the stoop has carried the shoulders.
L_SHOULDER = V(0.205, 0.005, 1.02)
L_ELBOW = V(0.37, 0.045, 0.93)
L_FIST = V(0.40, -0.10, 1.16)
SWORD_UP = V(0.22, -0.14, 1.0).normalized()  # from the hilt to the point
GRIP_LENGTH = 0.13  # from the cross-guard to the pommel
BLADE_LENGTH = 0.58
BLADE_WIDTH, BLADE_THICK = 0.034, 0.009  # half-sizes at the cross-guard
POINT = 0.84  # how far along the blade it starts to narrow to its point


def raised_arm():
    tube('sleeve-left', L_SHOULDER, L_ELBOW, [(0, 0.08), (1.12, 0.072)], M['robe'])
    # The sleeve's wide mouth, fallen back round the elbow, and the bare forearm rising out of it.
    tube('cuff-left', L_ELBOW, L_FIST, [(-0.15, 0.068), (0.42, 0.1)], M['robe'])
    tube('forearm-left', L_ELBOW.lerp(L_FIST, 0.2), L_FIST, [(0, 0.036), (1, 0.032)], M['skin'], n=5)
    ahead = (L_FIST - L_ELBOW).normalized()
    up = (SWORD_UP - SWORD_UP.dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    box('fist-left', L_FIST, [ahead, up, across], (0.052, 0.056, 0.056), M['skin'], 0.88)


def glamdring():
    # The blade's flats face forward and back, so both cameras see its breadth.
    width = SWORD_UP.cross(V(0, 1, 0)).normalized()
    thick = SWORD_UP.cross(width)
    guard = L_FIST + 0.062 * SWORD_UP
    box('crossguard', guard, [SWORD_UP, width, thick], (0.014, 0.08, 0.02), M['trim'], 0.8)

    # The blade: a flat diamond in section, straight to where it narrows to its point.
    rings = []
    for t, k in ((0.0, 1.0), (POINT, 0.82)):
        c = guard + t * BLADE_LENGTH * SWORD_UP
        rings.append([c + k * BLADE_WIDTH * width, c + k * BLADE_THICK * thick,
                      c - k * BLADE_WIDTH * width, c - k * BLADE_THICK * thick])
    verts, faces, _ = loft(rings)
    tip = len(verts)
    verts.append(guard + BLADE_LENGTH * SWORD_UP)
    faces += [(4 + i, 4 + (i + 1) % 4, tip) for i in range(4)]
    part('blade', verts, faces, M['blade'], inside=nearest_on_polyline([guard, verts[tip]]))

    # The grip through his fist, and the pommel below it.
    pommel = guard - GRIP_LENGTH * SWORD_UP
    tube('grip', pommel, guard, [(0, 0.016), (1, 0.016)], M['leather'], n=4, phase=45)
    verts = [pommel + 0.026 * d for d in (width, thick, -width, -thick)]
    verts += [pommel + 0.02 * SWORD_UP, pommel - 0.03 * SWORD_UP]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('pommel', verts, faces, M['trim'], inside=pommel)

    raised_arm()


def main():
    reset()
    make_materials()
    boot('boot-right', RIGHT_ANKLE, RIGHT_YAW)
    boot('boot-left', LEFT_ANKLE, LEFT_YAW)

    built = set(bpy.context.scene.objects)
    robe()
    mantle()
    cloak()
    fittings()
    hair()
    face()
    moustache()
    stoop([o for o in bpy.context.scene.objects if o not in built])

    built = set(bpy.context.scene.objects)
    beard()
    carry([o for o in bpy.context.scene.objects if o not in built], V(0, -STOOP, 0))

    staff()
    scabbard()
    glamdring()
    finish('gandalf-3', budget=BOOK_BUDGET)


main()
