"""Galadriel, the Lady of Lórien: an Elf Sorcerer, in the Faceted style (docs/viewer-spec.md section 4).

From the books, not the films: very tall, grave and beautiful, clad wholly in white, with hair of
deep gold. Legolas's people (legolas.py): the tallest of them, 1.52 to the crown, slender, a smooth
face and pointed ears, but in a long white gown to the ground with a narrow waist, a flared and
pleated skirt that trails behind her, and wide hanging sleeves.

A Sorcerer by her light: the star-glass, the phial that holds the light of Eärendil's star, raised
high before her in her right hand, small, bright and white, its rays a star. Her left hand is held
out low and open, palm forward.

The team colour is her mantle, over her shoulders and down her back to her thighs, open at the front,
and her girdle, whose long ends hang down the front of the gown. Her deep-gold hair falls over the
mantle to her waist, and the white gown spreads below it, so from behind she is gold and white as
much as the team's colour.

    blender --background --factory-startup --python-exit-code 1 --python galadriel.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so her right hand, with the light, is at -X.
"""

import math
import os
import sys
from itertools import pairwise

from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    EYES,
    V,
    box,
    cone,
    finish,
    loft,
    material,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    tube,
)

# Galadriel's own colours (sRGB); the eyes come from the kit.
GOWN = 0xDDD8CC  # white, warmed and greyed a little so the light outshines it
HAIR = 0xC4923E  # deep gold, deeper than Haldir's silver-fair or Éomer's flaxen
BROWS = 0x8E6A38  # a darker gold, so the brows show on her fair skin
SKIN = 0xE8C8AC  # fair
LIGHT = 0xF7F5EC  # the star-glass: a pale white, never blue
LIPS = 0xA8705F  # a muted rose-brown, not red

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        gown=material('gown', GOWN, roughness=0.9),
        hair=material('hair', HAIR, roughness=0.7),
        brows=material('brows', BROWS, roughness=0.8),
        skin=material('skin', SKIN, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
        lips=material('lips', LIPS, roughness=0.8),
        light=material('light', LIGHT, roughness=0.5, emission=LIGHT, emission_strength=1.0),
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


def triangles(verts, faces, keep=lambda centre: True):
    """The faces as triangles, for on_surface(), keeping those whose centre passes `keep`."""
    found = []
    for face in faces:
        points = [verts[i] for i in face]
        if keep(sum(points, Vector()) / len(points)):
            found += [(points[0], points[k], points[k + 1]) for k in range(1, len(points) - 1)]
    return found


# Gown ------------------------------------------------------------------------------------------------

# The skirt in twelve pleats, deepest at the hem and gone at the hips, trailing behind her on the
# ground: z, half-width, half-depth, centre y, the depth of the pleats and how far the back trails.
# The top band is the girdle.
SKIRT = [
    (0.0, 0.282, 0.262, 0.02, 0.032, 0.15),  # the hem, on the ground
    (0.10, 0.252, 0.232, 0.016, 0.026, 0.05),
    (0.34, 0.196, 0.178, 0.008, 0.016, 0.0),  # the bell narrows above the hem
    (0.74, 0.138, 0.108, 0.0, 0.004, 0.0),  # the hips
    (0.855, 0.106, 0.083, 0.0, 0.0, 0.0),  # the girdle, lower edge
    (0.915, 0.104, 0.080, 0.0, 0.0, 0.0),  # the girdle, upper edge: the waist
]
SKIRT_BANDS = [0, 0, 0, 0, 1]  # gown, then the girdle
TRAIN_SWEEP = 20  # degrees the train is swept round to her left


def skirt_rings():
    rings = []
    for z, rx, ry, cy, pleat, train in SKIRT:
        ring = []
        for i in range(12):
            a = math.tau * i / 12
            k = pleat if i % 2 else 0.0
            back = train * max(0.0, math.sin(a + math.radians(TRAIN_SWEEP))) ** 2
            ring.append(V((rx + k) * math.cos(a), cy + (ry + k) * math.sin(a) + back, z))
        rings.append(ring)
    return rings


def skirt():
    verts, faces, bands = loft(skirt_rings())
    face_mats = [SKIRT_BANDS[b] for b in bands]
    part('skirt', verts, faces, [M['gown'], M['team']], face_mats, inside=lambda c: V(0, 0.01, c.z))


def skirt_front(x, z):
    """The y of the front of the skirt at (x, z), seen from in front."""
    verts, faces, _ = loft(skirt_rings())
    return on_surface(triangles(verts, faces, lambda c: c.y < 0), x, z)


def girdle_ends():
    # The girdle's two long ends, from a knot at the front of the waist down the front of the gown,
    # one longer than the other. Each is a strip of rows (x of its edges, z) laid on the skirt.
    knot = V(0.012, -0.096, 0.885)
    box('knot', knot, [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)], (0.018, 0.03, 0.034), M['team'], 0.75)
    for name, rows, tip in (
        ('girdle-end-left', [((0.0, 0.05), 0.87), ((0.012, 0.058), 0.64), ((0.022, 0.066), 0.36)], (0.044, 0.31)),
        ('girdle-end-right', [((-0.03, 0.016), 0.87), ((-0.032, 0.012), 0.66), ((-0.036, 0.006), 0.46)], (-0.015, 0.42)),
    ):
        verts, faces = [], []
        for (x0, x1), z in rows:
            for x in (x0, x1):
                verts.append(V(x, skirt_front(x, z) - 0.012, z))
        for k in range(len(rows) - 1):
            faces.append((2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2))
        x, z = tip
        verts.append(V(x, skirt_front(x, z) - 0.012, z))
        n = len(verts)
        faces.append((n - 3, n - 2, n - 1))
        part(name, verts, faces, M['team'], outward=V(0, -1, 0))


# The bodice in octagons: z, half-width, half-depth, centre y and how far the front two points push
# forward, for the bust.
BODICE = [
    (0.86, 0.098, 0.076, 0.0, 0.0),  # inside the girdle
    (0.95, 0.103, 0.076, 0.0, 0.0),
    (1.03, 0.124, 0.084, -0.004, 0.024),  # the bust
    (1.105, 0.146, 0.082, 0.004, 0.0),  # the shoulders
    (1.17, 0.048, 0.046, 0.008, 0.0),  # the neck
]
OCTAGON = [math.radians(22.5 + 45 * i) for i in range(8)]
NECKLINE = 0.03  # how far the front of the shoulders' ring dips: the scooped neckline's lowest edge


def bodice():
    rings = []
    for k, (z, rx, ry, cy, bust) in enumerate(BODICE):
        ring = []
        for a in OCTAGON:
            front = math.sin(a) < -0.5
            forward = bust if front else 0.0
            dip = NECKLINE if front and k == 3 else 0.0
            ring.append(V(rx * math.cos(a), cy + ry * math.sin(a) - forward, z - dip))
        rings.append(ring)
    verts, faces, bands = loft(rings)
    # The front of the top band is bare: the neckline, from the dip to the neck.
    face_mats = [1 if b == 3 and sum(verts[i].y for i in f) / 4 < -0.03 else 0 for f, b in zip(faces, bands)]
    part('bodice', verts, faces, [M['gown'], M['skin']], face_mats, inside=lambda c: V(0, 0, c.z))


# Mantle: the team colour ------------------------------------------------------------------------------

# Each ring runs from the front edge at her left round her back to the front edge at her right: half-width,
# half-depth, centre y, how far either side of straight ahead the edges stop (degrees), heights by degrees
# from the middle of her back, and the depth of the folds. Clasped at the throat, it opens below.
MANTLE = [
    (0.07, 0.066, 0.012, 22, [(0, 1.222), (90, 1.20), (160, 1.168)], 0.0),  # the collar, standing at the back
    (0.19, 0.114, 0.006, 34, [(0, 1.122), (90, 1.108), (160, 1.10)], 0.0),  # over the shoulders
    (0.214, 0.142, 0.018, 46, [(0, 0.93), (90, 0.94), (160, 0.96)], 0.014),
    (0.24, 0.175, 0.036, 56, [(0, 0.54), (70, 0.58), (120, 0.64), (160, 0.68)], 0.032),  # the hem
]
N_MANTLE = 13


def mantle_ring(rx, ry, cy, gap, heights, fold):
    start, end = 270.0 + gap, 630.0 - gap
    points = []
    for i in range(N_MANTLE):
        a = start + (end - start) * i / (N_MANTLE - 1)
        z = interpolate(heights, abs(a - 450.0))
        k = 1 + (fold / ry if i % 2 else 0.0)
        r = math.radians(a)
        points.append(V(k * rx * math.cos(r), cy + k * ry * math.sin(r), z))
    return points


def mantle_back():
    """The back of the mantle as triangles, for on_surface(): where her hair lies on it."""
    verts, faces, _ = loft([mantle_ring(*level) for level in MANTLE], closed=False)
    return triangles(verts, faces, lambda c: c.y > 0.03)


def mantle():
    verts, faces, _ = loft([mantle_ring(*level) for level in MANTLE], closed=False)
    part('mantle', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z))


# Head ---------------------------------------------------------------------------------------------

# Hair over the crown and down the sides of her face: rings of eight points (x, y, z) from her left
# (+X) round the back to her right and the front, set back where the face is. It is parted in the
# middle, so the front of the hairline rises to the parting and sweeps down over her temples.
HAIR_RINGS = [
    [(0.116, 0.0, 1.2), (0.088, 0.094, 1.19), (0.0, 0.122, 1.19), (-0.088, 0.094, 1.19),
     (-0.116, 0.0, 1.2), (-0.072, -0.035, 1.24), (0.0, -0.03, 1.24), (0.072, -0.035, 1.24)],
    [(0.134, -0.004, 1.37), (0.106, 0.1, 1.38), (0.0, 0.136, 1.38), (-0.106, 0.1, 1.38),
     (-0.134, -0.004, 1.37), (-0.104, -0.086, 1.37), (0.0, -0.076, 1.38), (0.104, -0.086, 1.37)],
    [(0.114, 0.006, 1.465), (0.088, 0.088, 1.47), (0.0, 0.116, 1.47), (-0.088, 0.088, 1.47),
     (-0.114, 0.006, 1.465), (-0.096, -0.1, 1.44), (0.0, -0.118, 1.496), (0.096, -0.1, 1.44)],
    [(0.07, 0.008, 1.51), (0.05, 0.054, 1.512), (0.0, 0.07, 1.512), (-0.05, 0.054, 1.512),
     (-0.07, 0.008, 1.51), (-0.05, -0.06, 1.512), (0.0, -0.074, 1.518), (0.05, -0.06, 1.512)],
]
CROWN = V(0, 0.004, 1.522)

# The face: the right half's corners (x < 0), mirrored, and the points down the middle.
BROW, CHEEKBONE = V(-0.088, -0.098, 1.414), V(-0.094, -0.084, 1.325)
JAW, CHEEK = V(-0.07, -0.036, 1.25), V(-0.042, -0.106, 1.266)
FOREHEAD, NOSE_ROOT, MOUTH, CHIN, UNDER_CHIN = (
    V(0, -0.111, 1.47), V(0, -0.128, 1.388), V(0, -0.124, 1.266), V(0, -0.11, 1.222), V(0, -0.05, 1.204))


def mirror(p):
    return V(-p.x, p.y, p.z)


def head():
    verts, faces, _ = loft([[V(*p) for p in ring] for ring in HAIR_RINGS])
    last = len(verts) - 8
    verts.append(CROWN)
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    part('hair', verts, faces, M['hair'], inside=V(0, 0.0, 1.34))

    # A narrow face of planes: forehead, eye sockets, high cheekbones, a small pointed chin.
    verts = [FOREHEAD, NOSE_ROOT, MOUTH, CHIN, UNDER_CHIN]
    faces = []
    for s in (BROW, CHEEKBONE, JAW, CHEEK), tuple(mirror(p) for p in (BROW, CHEEKBONE, JAW, CHEEK)):
        b, c, j, k = range(len(verts), len(verts) + 4)
        verts += list(s)
        faces += [(0, b, 1), (1, b, c), (1, c, k), (1, k, 2), (c, j, k), (k, j, 3), (k, 3, 2), (j, 4, 3)]
    part('face', verts, faces, M['skin'], inside=V(0, 0.0, 1.34))
    # Under the jaw, back to the hair, so the head is closed.
    verts = [mirror(JAW), UNDER_CHIN, JAW, V(-0.1, 0.03, 1.15), V(0, 0.04, 1.13), V(0.1, 0.03, 1.15)]
    part('jaw', verts, [(0, 1, 4, 5), (1, 2, 3, 4)], M['skin'], inside=V(0, 0.0, 1.34))
    sockets = {s: [(NOSE_ROOT, p(BROW), p(CHEEKBONE)), (NOSE_ROOT, p(CHEEKBONE), p(CHEEK)), (FOREHEAD, p(BROW), NOSE_ROOT)]
               for s, p in ((-1, lambda q: q), (1, mirror))}

    # Almond eyes, wide and level, laid just proud of the plane under the brow: inner corner, top,
    # outer corner and bottom.
    for s in (-1, 1):
        corners = [(s * 0.022, 1.374), (s * 0.05, 1.387), (s * 0.084, 1.385), (s * 0.054, 1.365)]
        verts = [V(x, on_surface(sockets[s], x, z) - 0.006, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2, 3)], M['eyes'], outward=V(0, -1, 0))

    # A small straight nose.
    top, tip, under = V(0, -0.131, 1.383), V(0, -0.152, 1.316), V(0, -0.124, 1.306)
    left, right = V(0.019, -0.122, 1.318), V(-0.019, -0.122, 1.318)
    verts = [top, tip, under, left, right]
    faces = [(0, 3, 1), (0, 1, 4), (3, 2, 1), (1, 2, 4)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.1, 1.34))

    # Fine brows in gentle arches: inner end, crown of the arch, outer end, along the top and back
    # along the bottom.
    for s in (-1, 1):
        verts = [V(s * 0.018, -0.134, 1.407), V(s * 0.054, -0.126, 1.424), V(s * 0.092, -0.104, 1.416),
                 V(s * 0.09, -0.104, 1.407), V(s * 0.054, -0.127, 1.414), V(s * 0.02, -0.131, 1.399)]
        part(f'brow-{s}', verts, [(0, 1, 4, 5), (1, 2, 3, 4)], M['brows'], outward=V(0, -1, 0.3))

    # A small mouth.
    verts = [V(-0.026, -0.121, 1.272), V(0, -0.127, 1.278), V(0.026, -0.121, 1.272), V(0, -0.126, 1.263)]
    part('mouth', verts, [(0, 1, 2, 3)], M['lips'], outward=V(0, -1, 0))

    # Pointed ears through the hair, swept up and back.
    for s in (-1, 1):
        base = [V(s * 0.116, -0.012, 1.322), V(s * 0.118, 0.032, 1.342), V(s * 0.12, -0.002, 1.39)]
        tip = V(s * 0.158, 0.045, 1.448)
        verts = base + [tip]
        part(f'ear-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['skin'], inside=V(0, 0.01, 1.36))

    tube('neck', V(0, 0.01, 1.12), V(0, -0.004, 1.28), [(0, 0.044), (1, 0.04)], M['skin'])


def hair_fall():
    # Long hair from the back of her head down over the mantle to her waist, in three locks: rows
    # across her back from her left to her right, edge, ridge, valley, ridge, valley, ridge, edge,
    # the lower ones laid on the mantle, each lock ending in a point.
    back = mantle_back()
    across = (1, 0.66, 0.33, 0, -0.33, -0.66, -1)
    lift = (0.008, 0.03, 0.014, 0.032, 0.014, 0.03, 0.008)  # how far each stands off the mantle

    def on_mantle(x, z, out):
        return V(x, on_surface(back, x, z) + out, z)

    top = [V(0.13 * math.cos(math.radians(a)), 0.125 * math.sin(math.radians(a)), 1.40)
           for a in (15, 40, 65, 90, 115, 140, 165)]
    rows = [top]
    for z, half in ((1.15, 0.13), (0.98, 0.115), (0.84, 0.08)):
        rows.append([on_mantle(f * half, z, out) for f, out in zip(across, lift)])
    verts, faces, _ = loft(rows, closed=False)
    n = len(verts)
    q = list(range(n - 7, n))  # the last row
    for f, z in ((0.66, 0.775), (0.0, 0.735), (-0.66, 0.775)):
        verts.append(on_mantle(f * 0.08, z, 0.02))
    faces += [(q[0], q[1], n), (q[1], q[2], n), (q[2], q[3], n + 1), (q[3], q[4], n + 1),
              (q[4], q[5], n + 2), (q[5], q[6], n + 2)]
    part('hair-fall', verts, faces, M['hair'], outward=V(0, 1, 0))


def front_lock():
    # A lock falling in front of her left shoulder to her breast, beside the face: rows of its inner
    # edge, its ridge and its outer edge, ending in a point.
    rows = [
        [V(0.094, -0.064, 1.3), V(0.12, -0.054, 1.3), V(0.134, -0.012, 1.3)],
        [V(0.074, -0.104, 1.12), V(0.112, -0.122, 1.12), V(0.152, -0.084, 1.12)],
        [V(0.074, -0.132, 0.98), V(0.104, -0.146, 0.98), V(0.132, -0.118, 0.98)],
    ]
    verts, faces, _ = loft(rows, closed=False)
    verts.append(V(0.098, -0.136, 0.9))
    faces += [(6, 7, 9), (7, 8, 9)]
    part('front-lock', verts, faces, M['hair'], outward=V(0, -1, 0.2))


# Arms, the star-glass and the open hand -------------------------------------------------------------

R_SHOULDER, L_SHOULDER = V(-0.148, 0.004, 1.09), V(0.148, 0.004, 1.09)
UPPER_ARM, FOREARM = 0.25, 0.22
R_WRIST = V(-0.245, -0.19, 1.48)  # raised high and forward, presenting the light
L_WRIST = V(0.37, -0.15, 0.72)  # low and out to her side, the hand open


def raised_arm():
    shoulder, wrist = R_SHOULDER, R_WRIST
    elbow = bend(shoulder, wrist, UPPER_ARM, FOREARM, shoulder + V(-0.3, -0.05, -0.1))
    tube('upper-arm-right', shoulder, elbow, [(-0.1, 0.05), (1.06, 0.042)], M['gown'])
    # The wide sleeve has fallen back from her raised forearm and hangs from the elbow.
    ahead = (wrist - elbow).normalized()
    down = (shoulder - elbow).normalized()
    rings = segment(elbow + 0.04 * ahead, elbow + 0.12 * down, [(0, 0.048), (1, 0.088)], 6)
    rings[1] = [p + V(0, 0, -0.04 - 0.12 * max(0.0, -(p - elbow - 0.12 * down).normalized().z)) for p in rings[1]]
    verts, faces, _ = loft(rings)
    part('sleeve-right', verts, faces, M['gown'], inside=lambda c: elbow + (c - elbow).dot(down) * down)
    tube('forearm-right', elbow, wrist, [(-0.05, 0.04), (1.0, 0.033)], M['skin'])
    fist = wrist + 0.035 * ahead
    up = (V(0, -1, 0) - V(0, -1, 0).dot(ahead) * ahead).normalized()
    box('fist-right', fist, [ahead, up, ahead.cross(up)], (0.036, 0.036, 0.032), M['skin'], 0.8)
    star_glass(fist + 0.075 * ahead)


def star_glass(centre):
    # The phial: a small crystal, and the star's light round it in four short rays and a long one up.
    tall = V(0, 0, 1)
    cone('phial', centre, centre + 0.08 * tall, 0.04, M['light'], n=6, back=centre - 0.055 * tall)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        out = V(math.cos(a), math.sin(a), 0.0)
        cone(f'ray-{k}', centre, centre + 0.135 * out, 0.02, M['light'], n=3, back=None)
    cone('ray-up', centre + 0.05 * tall, centre + 0.2 * tall, 0.02, M['light'], n=3, back=None)


def open_arm():
    shoulder, wrist = L_SHOULDER, L_WRIST
    elbow = bend(shoulder, wrist, UPPER_ARM, FOREARM, shoulder + V(0.3, -0.05, -0.15))
    tube('upper-arm-left', shoulder, elbow, [(-0.1, 0.05), (1.06, 0.042)], M['gown'])
    # A wide sleeve, flaring from the elbow, its lower edge hanging below the wrist.
    ahead = (wrist - elbow).normalized()
    rings = segment(elbow, wrist + 0.01 * ahead, [(0, 0.046), (1.0, 0.09)], 6)
    rings[1] = [p + V(0, 0, -0.18 * max(0.0, -(p - wrist).normalized().z)) for p in rings[1]]
    verts, faces, _ = loft(rings)
    part('sleeve-left', verts, faces, M['gown'], inside=lambda c: elbow + (c - elbow).dot(ahead) * ahead)
    tube('wrist-left', wrist - 0.05 * ahead, wrist + 0.03 * ahead, [(0, 0.032), (1, 0.03)], M['skin'])
    # The open hand, palm forward, fingers down and out.
    fingers = (ahead + V(0.25, 0.0, -0.5)).normalized()
    palm = (V(0.35, -1, 0) - V(0.35, -1, 0).dot(fingers) * fingers).normalized()
    across = fingers.cross(palm)
    hand = wrist + 0.03 * ahead + 0.05 * fingers
    box('hand-left', hand, [fingers, palm, across], (0.054, 0.014, 0.036), M['skin'], 0.8)
    outer = across if across.x > 0 else -across  # with the palm forward, the thumb is on her outer side
    thumb = wrist + 0.03 * ahead + 0.022 * fingers + 0.04 * outer
    box('thumb-left', thumb, [(fingers + 0.5 * outer).normalized(), palm, across], (0.028, 0.013, 0.013),
        M['skin'], 0.7)


def main():
    reset()
    make_materials()
    skirt()
    girdle_ends()
    bodice()
    mantle()
    head()
    hair_fall()
    front_lock()
    raised_arm()
    open_arm()
    finish('galadriel')


main()
