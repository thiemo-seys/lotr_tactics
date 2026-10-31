"""Elrond Half-elven, master of Rivendell: an Elf Sorcerer, in the Faceted style (docs/viewer-spec.md
section 4).

From the books, not the films: ageless, "venerable as a king crowned with many winters, and yet hale
as a tried warrior", his hair dark as the shadows of twilight under a circlet of silver. Legolas's
people (legolas.py): tall and slim, 1.50 to the crown, a smooth beardless face and pointed ears; but
robed to the ground like a lord, in plum-grey over a pale under-robe, with a silver girdle and wide
sleeves.

A Sorcerer by his staff: slender and straight, of pale wood, its head a bud of silver leaves round a
pale light, held upright in his left hand. His right hand is raised and open, as he heals.

The team colour is his long mantle: over his shoulders, open at the front and down to his knees,
lowest at the back, so it shows from the front, from behind and from above. His long dark hair falls
over it at the back, and the circlet, the staff, the raised hand, the wide sleeves and the plum robe
below it keep him recognisable from behind.

    blender --background --factory-startup --python-exit-code 1 --python elrond.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys
from itertools import pairwise

from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    EYES,
    V,
    box,
    ellipse,
    finish,
    frame,
    loft,
    material,
    nearest_on_polyline,
    on_surface,
    part,
    path_rings,
    reset,
    team_material,
    tube,
)

# Elrond's own colours (sRGB); the rest come from the kit.
ROBE = 0x5B4A5D  # plum-grey
UNDERROBE = 0xB2AA9D  # a pale, warm grey
SILVER = 0xCBCCC8
HAIR = 0x2B2321  # dark as the shadows of twilight
SKIN = 0xE2BFA1  # fair
SHOES = 0x40363A
STAFF_WOOD = 0xD4C7AC  # pale wood
LIGHT = 0xEFEEE6  # a pale light, neither blue nor gold

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        robe=material('robe', ROBE, roughness=0.9),
        underrobe=material('underrobe', UNDERROBE, roughness=0.9),
        silver=material('silver', SILVER, roughness=0.45, metallic=0.1),
        hair=material('hair', HAIR, roughness=0.75),
        skin=material('skin', SKIN, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
        shoes=material('shoes', SHOES, roughness=0.9),
        wood=material('wood', STAFF_WOOD, roughness=0.7),
        light=material('light', LIGHT, roughness=0.6, emission=LIGHT, emission_strength=1.0),
    )


def interpolate(table, x):
    """The value at x in a table of (x, value) pairs, straight between them."""
    for (x0, y0), (x1, y1) in pairwise(table):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    raise ValueError(f'{x} is outside the table')


def bend(root, end, upper, lower, pole):
    """The middle joint of a limb from root to end, its bones upper and lower long, bent towards pole."""
    root, end, pole = Vector(root), Vector(end), Vector(pole)
    axis = end - root
    reach = min(axis.length, upper + lower - 1e-3)
    axis.normalize()
    along = (upper * upper - lower * lower + reach * reach) / (2 * reach)
    out = math.sqrt(max(upper * upper - along * along, 0.0))
    side = pole - root
    side = (side - side.dot(axis) * axis).normalized()
    return root + along * axis + out * side


# Robe ----------------------------------------------------------------------------------------------

# The robe from the girdle up, in octagons: z, half-width, half-depth and centre y. The girdle is the
# first band.
TORSO = [
    (0.80, 0.143, 0.107, 0.0),  # the girdle, lower edge
    (0.856, 0.137, 0.101, 0.0),  # the girdle, upper edge: the waist
    (0.995, 0.172, 0.114, -0.006),  # chest
    (1.09, 0.182, 0.100, 0.004),  # shoulders
    (1.16, 0.066, 0.060, 0.008),  # neck
]
TORSO_BANDS = [1, 0, 0, 0]  # the girdle, then robe


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    part('torso', verts, faces, [M['robe'], M['silver']], [TORSO_BANDS[b] for b in bands],
         inside=lambda c: V(0, 0, c.z))


# The skirt below the girdle, in twelve pleats that are deepest at the hem and gone at the waist,
# where the girdle hides its top: z, half-width, half-depth, centre y and the depth of the pleats.
SKIRT = [
    (0.0, 0.265, 0.232, 0.024, 0.024),  # the hem, on the ground, trailing a little behind
    (0.42, 0.2, 0.166, 0.01, 0.012),
    (0.83, 0.132, 0.096, 0.0, 0.0),
]
UNDER = (8, 9)  # the two facets either side of the ridge down the front: the under-robe


def skirt():
    rings = []
    for z, rx, ry, cy, pleat in SKIRT:
        ring = []
        for i in range(12):
            a = math.tau * i / 12
            k = pleat if i % 2 else 0.0
            ring.append(V((rx + k) * math.cos(a), cy + (ry + k) * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings)
    face_mats = [1 if f % 12 in UNDER else 0 for f in range(len(faces))]
    part('skirt', verts, faces, [M['robe'], M['underrobe']], face_mats, inside=lambda c: V(0, 0.01, c.z))


# Soft pointed shoes, of which only the toes show under the hem: the height of each ring and the right
# half of its outline, side, heel and toe, in the foot's own frame (toes towards -y).
SHOE_RINGS = [
    (0.0, [(0.048, -0.01), (0.04, 0.06), (0.016, -0.15)]),
    (0.065, [(0.044, 0.0), (0.038, 0.055), (0.016, -0.09)]),
]
FEET = [(V(-0.085, -0.115, 0), -8), (V(0.09, -0.13, 0), 10)]  # where each stands, and its yaw


def shoes():
    for k, (at, yaw) in enumerate(FEET):
        turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
        outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                    for z, (side, heel, toe) in SHOE_RINGS]
        rings = [[at + turn @ V(x, y, z) for x, y in ring] for z, ring in outlines]
        verts, faces, _ = loft(rings)
        faces.append(tuple(range(6, 12)))
        part(f'shoe-{k}', verts, faces, M['shoes'], inside=at + V(0, 0, 0.03))


# Mantle: the team colour ---------------------------------------------------------------------------

# Each ring runs from the front edge at his left, round his back, to the front edge at his right:
# half-width, half-depth, centre y, how far either side of straight ahead the edges stop (degrees),
# heights by degrees from the middle of his back, and the depth of the folds. The edges part lower
# down, so it opens in a V over his chest.
MANTLE = [
    (0.09, 0.084, 0.012, 14, [(0, 1.215), (90, 1.18), (180, 1.15)], 0.0),  # the collar, standing at the back
    (0.236, 0.146, 0.008, 22, [(0, 1.118), (90, 1.098), (180, 1.09)], 0.0),  # over the shoulders
    (0.262, 0.174, 0.018, 28, [(0, 0.95), (90, 0.955), (180, 0.97)], 0.012),
    (0.272, 0.205, 0.03, 32, [(0, 0.70), (90, 0.715), (180, 0.735)], 0.03),
    (0.29, 0.236, 0.044, 36, [(0, 0.39), (60, 0.42), (120, 0.48), (180, 0.52)], 0.046),  # the hem, at his knees
]
N_MANTLE = 13


def mantle_ring(rx, ry, cy, gap, heights, fold):
    points = []
    start, end = 270 + gap, 630 - gap
    for i in range(N_MANTLE):
        a = start + (end - start) * i / (N_MANTLE - 1)
        z = interpolate(heights, abs(a - 450))
        k = 1 + (fold / ry if i % 2 else 0.0)
        r = math.radians(a)
        points.append(V(k * rx * math.cos(r), cy + k * ry * math.sin(r), z))
    return points


def mantle_back():
    """The back of the mantle as triangles, for on_surface(): where his hair lies on it."""
    verts, faces, _ = loft([mantle_ring(*level) for level in MANTLE], closed=False)
    triangles = []
    for face in faces:
        a, b, c, d = (verts[i] for i in face)
        if a.y + b.y + c.y + d.y > 0.12:
            triangles += [(a, b, c), (a, c, d)]
    return triangles


def mantle():
    rings = [mantle_ring(*level) for level in MANTLE]
    verts, faces, _ = loft(rings, closed=False)
    part('mantle', verts, faces, M['team'], inside=lambda c: V(0, 0.01, c.z))
    # A silver clasp at his throat, where the collar's edges meet.
    c = V(0, -0.078, 1.142)
    verts = [c + V(-0.03, 0, 0), c + V(0, -0.014, 0.0), c + V(0.03, 0, 0), c + V(0, 0, 0.028),
             c + V(0, 0, -0.028)]
    faces = [(0, 1, 3), (1, 2, 3), (0, 4, 1), (1, 4, 2)]
    part('clasp', verts, faces, M['silver'], outward=V(0, -1, 0))


# Head: Legolas's, a little higher and broader in the jaw ------------------------------------------

# Hair over the crown, the sides and the back: rings of eight points from his left (+X) round the back
# to his right and the front, set back where the face is.
HAIR_RINGS = [
    [(0.088, 0.022, 1.16), (0.072, 0.088, 1.16), (0.0, 0.112, 1.16), (-0.072, 0.088, 1.16),
     (-0.088, 0.022, 1.16), (-0.064, -0.035, 1.21), (0.0, -0.03, 1.21), (0.064, -0.035, 1.21)],  # the nape
    [(0.12, 0.0, 1.36), (0.096, 0.092, 1.36), (0.0, 0.126, 1.36), (-0.096, 0.092, 1.36),
     (-0.12, 0.0, 1.36), (-0.098, -0.078, 1.36), (0.0, -0.074, 1.36), (0.098, -0.078, 1.36)],  # the temples
    [(0.102, 0.006, 1.445), (0.08, 0.08, 1.445), (0.0, 0.106, 1.445), (-0.08, 0.08, 1.445),
     (-0.102, 0.006, 1.445), (-0.082, -0.088, 1.45), (0.0, -0.118, 1.458), (0.082, -0.088, 1.45)],  # the hairline
    [(0.064, 0.008, 1.488), (0.047, 0.051, 1.488), (0.0, 0.068, 1.488), (-0.047, 0.051, 1.488),
     (-0.064, 0.008, 1.488), (-0.047, -0.051, 1.49), (0.0, -0.068, 1.492), (0.047, -0.051, 1.49)],
]
CROWN = V(0, 0.004, 1.502)

# The face: the right half's corners (x < 0), mirrored, and the points down the middle.
BROW, CHEEKBONE = V(-0.092, -0.1, 1.396), V(-0.1, -0.084, 1.305)
JAW, CHEEK = V(-0.08, -0.036, 1.222), V(-0.048, -0.106, 1.24)
FOREHEAD, NOSE_ROOT, MOUTH, CHIN, UNDER_CHIN = (
    V(0, -0.114, 1.452), V(0, -0.133, 1.37), V(0, -0.129, 1.24), V(0, -0.12, 1.19), V(0, -0.056, 1.17))


def mirror(p):
    return V(-p.x, p.y, p.z)


def head():
    verts, faces, _ = loft([[V(*p) for p in ring] for ring in HAIR_RINGS])
    last = len(verts) - 8
    verts.append(CROWN)
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    part('hair', verts, faces, M['hair'], inside=V(0, 0.0, 1.32))

    # A face of planes: forehead, eye sockets, high cheekbones, a firm chin.
    verts = [FOREHEAD, NOSE_ROOT, MOUTH, CHIN, UNDER_CHIN]
    faces = []
    for s in (BROW, CHEEKBONE, JAW, CHEEK), tuple(mirror(p) for p in (BROW, CHEEKBONE, JAW, CHEEK)):
        b, c, j, k = range(len(verts), len(verts) + 4)
        verts += list(s)
        faces += [(0, b, 1), (1, b, c), (1, c, k), (1, k, 2), (c, j, k), (k, j, 3), (k, 3, 2), (j, 4, 3)]
    part('face', verts, faces, M['skin'], inside=V(0, 0.0, 1.32))
    sockets = {s: [(NOSE_ROOT, p(BROW), p(CHEEKBONE))] for s, p in ((-1, lambda q: q), (1, mirror))}

    # Level, open eyes, almonds laid just proud of the plane under the brow.
    for s in (-1, 1):
        corners = [(s * 0.026, 1.36), (s * 0.054, 1.372), (s * 0.084, 1.364), (s * 0.054, 1.344)]
        verts = [V(x, on_surface(sockets[s], x, z) - 0.006, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2, 3)], M['eyes'], outward=V(0, -1, 0))

    # A straight nose.
    top, tip, under = V(0, -0.136, 1.365), V(0, -0.164, 1.29), V(0, -0.131, 1.28)
    left, right = V(0.023, -0.127, 1.292), V(-0.023, -0.127, 1.292)
    verts = [top, tip, under, left, right]
    faces = [(0, 3, 1), (0, 1, 4), (3, 2, 1), (1, 2, 4)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.1, 1.32))

    # Level dark brows.
    for s in (-1, 1):
        verts = [V(s * 0.018, -0.139, 1.384), V(s * 0.09, -0.112, 1.394), V(s * 0.088, -0.104, 1.382),
                 V(s * 0.02, -0.132, 1.372)]
        part(f'brow-{s}', verts, [(0, 1, 2, 3)], M['hair'], outward=V(0, -1, 0.3))

    # Pointed ears through the hair, swept up and back.
    for s in (-1, 1):
        base = [V(s * 0.12, -0.03, 1.295), V(s * 0.122, 0.035, 1.32), V(s * 0.122, -0.012, 1.375)]
        tip = V(s * 0.166, 0.05, 1.44)
        part(f'ear-{s}', base + [tip], [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['skin'], inside=V(0, 0.01, 1.34))

    tube('neck', V(0, 0.01, 1.10), V(0, -0.004, 1.26), [(0, 0.05), (1, 0.046)], M['skin'])


def hair_fall():
    # Long straight hair from the back of his head, over the mantle's collar and down it to his hips:
    # rows of five points from his left round to his right, the lower ones laid on the mantle, a little
    # fuller down the middle.
    rows = [
        [V(0.112 * math.cos(math.radians(a)), 0.004 + 0.12 * math.sin(math.radians(a)), 1.32)
         for a in (10, 50, 90, 130, 170)],
        [V(0.122, 0.06, 1.2), V(0.068, 0.13, 1.2), V(0.0, 0.142, 1.2), V(-0.068, 0.13, 1.2), V(-0.122, 0.06, 1.2)],
    ]
    back = mantle_back()
    for z, half in ((1.105, 0.122), (0.95, 0.112), (0.83, 0.094)):
        rows.append([V(k * half, on_surface(back, k * half, z) + 0.016 + 0.014 * (1 - k * k), z)
                     for k in (1, 0.5, 0, -0.5, -1)])
    verts, faces, _ = loft(rows, closed=False)
    verts.append(V(0, on_surface(back, 0, 0.73) + 0.02, 0.73))
    last = len(verts) - 6
    faces += [(last + i, last + i + 1, len(verts) - 1) for i in range(4)]
    part('hair-fall', verts, faces, M['hair'], inside=lambda c: V(0, 0, c.z))


def circlet():
    # A band of silver round his brow, higher at the back, with a leaf rising over his forehead.
    def ring(z_front, z_back, rx, ry, cy):
        points = []
        for i in range(8):
            a = math.tau * i / 8
            z = z_front + (z_back - z_front) * (1 + math.sin(a)) / 2
            points.append(V(rx * math.cos(a), cy + ry * math.sin(a), z))
        return points

    rings = [ring(1.418, 1.45, 0.113, 0.123, -0.004), ring(1.446, 1.478, 0.109, 0.12, -0.004)]
    verts, faces, _ = loft(rings)
    part('circlet', verts, faces, M['silver'], inside=lambda c: V(0, -0.004, c.z))
    verts = [V(-0.02, -0.126, 1.442), V(0, -0.14, 1.447), V(0.02, -0.126, 1.442), V(0, -0.124, 1.492),
             V(0, -0.124, 1.418)]
    faces = [(0, 1, 3), (1, 2, 3), (0, 4, 1), (1, 4, 2)]
    part('circlet-leaf', verts, faces, M['silver'], outward=V(0, -1, 0))


# Arms ----------------------------------------------------------------------------------------------

UPPER_ARM, FOREARM = 0.27, 0.245
R_SHOULDER, L_SHOULDER = V(-0.17, 0.0, 1.075), V(0.17, 0.0, 1.075)


def right_arm():
    # Raised and open, the palm forward. The wide sleeve has fallen back to the elbow and hangs from it;
    # the forearm is in the under-robe's close sleeve.
    hand = V(-0.36, -0.12, 1.29)
    along = V(-0.1, 0.05, 1.0).normalized()  # from the wrist to the fingertips
    wrist = hand - 0.065 * along
    elbow = bend(R_SHOULDER, wrist, UPPER_ARM, FOREARM, (R_SHOULDER + wrist) / 2 + V(-0.25, 0.1, -0.3))
    hang = elbow + V(0.01, 0.03, -0.2)
    rings = path_rings([R_SHOULDER, elbow, hang], [0.066, 0.074, 0.11], n=6)
    verts, faces, _ = loft(rings)
    part('sleeve-right', verts, faces, M['robe'], inside=nearest_on_polyline([R_SHOULDER, elbow, hang]))
    tube('forearm-right', elbow, wrist, [(0, 0.05), (1, 0.04)], M['underrobe'])
    open_hand('hand-right', wrist, along, V(0, -1, 0.1))


def open_hand(name, wrist, along, palm):
    """An open hand from the wrist along `along`, its palm facing `palm`, the thumb spread."""
    palm = (palm - palm.dot(along) * along).normalized()
    across = along.cross(palm)  # towards the thumb, for the right hand
    stations = [(0.0, 0.032, 0.017), (0.08, 0.047, 0.016), (0.155, 0.037, 0.01)]  # along, half-width, half-thickness
    rings = []
    for t, w, h in stations:
        c = wrist + t * along
        rings.append([c + w * across + h * palm, c - w * across + h * palm, c - w * across - h * palm,
                      c + w * across - h * palm])
    verts, faces, _ = loft(rings)
    faces.append((8, 9, 10, 11))
    part(name, verts, faces, M['skin'], inside=nearest_on_polyline([wrist, wrist + 0.155 * along]))
    # The thumb, spread out and up from the side of the palm.
    base = wrist + 0.03 * along + 0.04 * across
    tip = base + 0.05 * along + 0.05 * across
    tube(name + '-thumb', base, tip, [(0, 0.017), (1, 0.013)], M['skin'], n=4, phase=45)


STAFF_GRIP = V(0.335, -0.16, 0.93)
STAFF_UP = V(0.05, 0.012, 1.0).normalized()


def left_arm():
    # Holding the staff out at his side, the forearm forward; the wide sleeve hangs from it.
    fist = STAFF_GRIP
    elbow_guess = (L_SHOULDER + fist) / 2 + V(0.12, 0.2, -0.3)
    wrist = fist - 0.05 * (fist - elbow_guess).normalized()
    elbow = bend(L_SHOULDER, wrist, UPPER_ARM, FOREARM, elbow_guess)
    ahead = (wrist - elbow).normalized()
    cuff = wrist - 0.01 * ahead
    middle = elbow.lerp(cuff, 0.5)
    points = [L_SHOULDER, elbow, middle, cuff]
    rings = path_rings(points, [0.066, 0.072, 0.08, 0.12], n=6)
    # The cuff's lower side hangs down.
    end = rings[-1]
    rings[-1] = [p + V(0, 0, -0.09 * max(0.0, (cuff.z - p.z) / 0.12)) for p in end]
    verts, faces, _ = loft(rings)
    part('sleeve-left', verts, faces, M['robe'], inside=nearest_on_polyline(points))
    up = (STAFF_UP - STAFF_UP.dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    box('fist-left', fist, [ahead, up, across], (0.045, 0.048, 0.045), M['skin'], 0.88)
    thumb = fist + 0.01 * ahead + 0.028 * up + 0.05 * across
    box('thumb-left', thumb, [ahead, up, across], (0.036, 0.02, 0.016), M['skin'], 0.7)


# Staff ---------------------------------------------------------------------------------------------


SHAFT = 0.70  # from his grip up to the head


def staff():
    up = STAFF_UP
    foot = STAFF_GRIP - (STAFF_GRIP.z / up.z) * up
    top = STAFF_GRIP + SHAFT * up
    points = [top, STAFF_GRIP, foot]
    rings = path_rings(points, [0.017, 0.021, 0.017], n=6, level_end=True)
    verts, faces, _ = loft(rings)
    faces.append(tuple(range(12, 18)))
    part('staff', verts, faces, M['wood'], inside=nearest_on_polyline(points))

    # A silver cup at its head, and four silver leaves rising from it and curling in round the light,
    # a bud about to open. They stand at the corners, so the light shows between them from every side.
    cup = top + 0.055 * up
    tube('cup', top - 0.015 * up, cup, [(0, 0.019), (0.45, 0.024), (1, 0.036)], M['silver'], n=6)
    u, v = frame(up)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        out = math.cos(a) * u + math.sin(a) * v
        leaf(f'leaf-{k}', cup + 0.024 * out - 0.012 * up, out)

    # The light: a long gem standing in the cup, its lower point inside it.
    c = cup + 0.06 * up
    ring = [c + 0.038 * (math.cos(a) * u + math.sin(a) * v) for a in (math.tau * i / 6 for i in range(6))]
    verts = ring + [c + 0.13 * up, c - 0.075 * up]
    faces = [(i, (i + 1) % 6, 6) for i in range(6)] + [(i, (i + 1) % 6, 7) for i in range(6)]
    part('light', verts, faces, M['light'], inside=c)


# A leaf of the staff's head, from its base up the staff: (height, how far out, half-width) at two
# stations and at the tip, which curls back in. Its rib stands proud of its edges.
LEAF = [(0.05, 0.042, 0.048), (0.1, 0.046, 0.038), (0.15, 0.016, 0.0)]
RIB = 0.012


def leaf(name, base, out):
    up = STAFF_UP
    side = up.cross(out).normalized()
    (h1, o1, w1), (h2, o2, w2), (h3, o3, _) = LEAF
    a1, a2 = base + h1 * up + o1 * out, base + h2 * up + o2 * out
    verts = [base, a1 + w1 * side, a1 + RIB * out, a1 - w1 * side, a2 + w2 * side, a2 + RIB * out,
             a2 - w2 * side, base + h3 * up + o3 * out]
    faces = [(0, 1, 2), (0, 2, 3), (1, 4, 5, 2), (2, 5, 6, 3), (4, 7, 5), (5, 7, 6)]
    part(name, verts, faces, M['silver'], outward=out)


def main():
    reset()
    make_materials()
    shoes()
    skirt()
    torso()
    mantle()
    head()
    hair_fall()
    circlet()
    right_arm()
    left_arm()
    staff()
    finish('elrond')


main()
