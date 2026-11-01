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

Her fittings use `trim`, which the client colours iron, silver or gold by star level
(docs/viewer-spec.md section 4, "Star levels"): from in front, the two brooches and the chain that
fasten the mantle across her breast, the clasp on the girdle's knot and the cup the phial stands in;
from every side, the band about her raised forearm; and from behind, the clasp that binds her hair
between her shoulders.

Her 3★ model, the book moment (docs/viewer-spec.md section 4, "Star levels"): the Lady at her
Mirror, the same Galadriel as galadriel.py, in the circlet of golden flowers of her 2★ model
(galadriel-2.py). From The Fellowship of the Ring, II 7, "The Mirror of Galadriel": she leads Frodo
and Sam down into a green hollow, where "upon a low pedestal carved like a branching tree, stood a
basin of silver, wide and shallow, and beside it stood a silver ewer. With water from the stream
Galadriel filled the basin to the brim, and breathed on it". The basin stands at her left side on its
pedestal, its trunk rooted on the ground and its branches holding the bowl up, and she pours into it
from the ewer in her left hand, the wide sleeve fallen back from her reaching arm. The star-glass,
which holds the light of Eärendil's star "set amid the waters of my fountain" (II 8), is still raised
in her right hand. The water is dark and still, never blue, so from above the Mirror is a dark pool
ringed with silver; the basin and the ewer are a pale silver, hardly metallic, and the pedestal a
grey stone. No ring is on her hand: no model shows a Ring of Power.

    blender --background --factory-startup --python-exit-code 1 --python galadriel-3.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so her right hand, with the light, is at -X.
"""

import math
import os
import sys
from itertools import pairwise

from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOK_BUDGET,
    EYES,
    V,
    bent_tube,
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

# Galadriel's own colours (sRGB); the eyes come from the kit.
GOWN = 0xDDD8CC  # white, warmed and greyed a little so the light outshines it
HAIR = 0xC4923E  # deep gold, deeper than Haldir's silver-fair or Éomer's flaxen
BROWS = 0x8E6A38  # a darker gold, so the brows show on her fair skin
SKIN = 0xE8C8AC  # fair
LIGHT = 0xF7F5EC  # the star-glass: a pale white, never blue
LIPS = 0xA8705F  # a muted rose-brown, not red
GOLD = 0xE6CF86  # the circlet: the mallorn's gold, paler than her hair
SILVER = 0xCDD1D4  # the basin and the ewer
WATER = 0x2C2D2E  # the Mirror's water, dark and still: never blue
STONE = 0x8A8072  # the pedestal, a grey stone with a little warmth

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
        # Fittings: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
        gold=material('gold', GOLD, roughness=0.45, metallic=0.1),
        silver=material('silver', SILVER, roughness=0.35, metallic=0.15),
        water=material('water', WATER, roughness=0.9),
        stone=material('stone', STONE, roughness=0.85),
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
    # A round clasp of metal on the knot, its boss standing out from it.
    at = knot + V(0, -0.016, 0)
    cone('girdle-clasp', at, at + V(0, -0.016, 0), 0.03, M['trim'], n=6, phase=90, back=at + V(0, 0.01, 0))
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
# from the middle of her back, and the depth of the folds. It opens below the collar, fastened across
# her breast.
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

    # Fastened across her breast, below the throat where her chin would hide it: a brooch on each
    # front edge, over the collarbones, and a short chain between them, sagging a little.
    collar, shoulders = mantle_ring(*MANTLE[0]), mantle_ring(*MANTLE[1])
    pins = []
    for i in (0, N_MANTLE - 1):
        at = collar[i].lerp(shoulders[i], 0.72) + V(0, -0.008, 0)
        out = V(0.3 * math.copysign(1.0, at.x), -1, 0.3).normalized()
        cone(f'brooch-{i}', at, at + 0.013 * out, 0.025, M['trim'], n=6, back=at - 0.006 * out)
        pins.append(at)
    left, right = pins
    middle = left.lerp(right, 0.5) + V(0, -0.006, -0.028)
    verts = [left + V(0, 0, 0.006), middle + V(0, 0, 0.006), right + V(0, 0, 0.006),
             right - V(0, 0, 0.006), middle - V(0, 0, 0.006), left - V(0, 0, 0.006)]
    part('chain', verts, [(0, 1, 4, 5), (1, 2, 3, 4)], M['trim'], outward=V(0, -1, 0))


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


HAIR_CLASP_Z = 1.08


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
    sheet = triangles(verts, faces)  # the hair's triangles, for laying the clasp on it
    n = len(verts)
    q = list(range(n - 7, n))  # the last row
    for f, z in ((0.66, 0.775), (0.0, 0.735), (-0.66, 0.775)):
        verts.append(on_mantle(f * 0.08, z, 0.02))
    faces += [(q[0], q[1], n), (q[1], q[2], n), (q[2], q[3], n + 1), (q[3], q[4], n + 1),
              (q[4], q[5], n + 2), (q[5], q[6], n + 2)]
    part('hair-fall', verts, faces, M['hair'], outward=V(0, 1, 0))

    # A clasp of metal binds it between her shoulders, laid across it and tilted with it, its face
    # smaller than its back.
    z = HAIR_CLASP_Z
    centre = V(0, on_surface(sheet, 0, z), z)
    down = V(0, on_surface(sheet, 0, z - 0.05), z - 0.05) - centre
    out = down.cross(V(1, 0, 0)).normalized()
    if out.y < 0:
        out = -out
    up = V(1, 0, 0).cross(out)
    box('hair-clasp', centre + 0.004 * out, [out, V(1, 0, 0), up], (0.014, 0.085, 0.022), M['trim'], 0.8)


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
L_WRIST = V(0.375, -0.11, 0.82)  # reaching out over the Mirror, the ewer in her hand


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
    # A band of metal about her forearm below the elbow, well clear of her hand.
    tube('armlet', elbow.lerp(wrist, 0.22), elbow.lerp(wrist, 0.4), [(0, 0.04), (0.5, 0.048), (1, 0.039)], M['trim'])
    fist = wrist + 0.035 * ahead
    up = (V(0, -1, 0) - V(0, -1, 0).dot(ahead) * ahead).normalized()
    box('fist-right', fist, [ahead, up, ahead.cross(up)], (0.036, 0.036, 0.032), M['skin'], 0.8)
    star_glass(fist + 0.075 * ahead)


def star_glass(centre):
    # The phial: a small crystal, and the star's light round it in four short rays and a long one up.
    tall = V(0, 0, 1)
    cone('phial', centre, centre + 0.08 * tall, 0.04, M['light'], n=6, back=centre - 0.055 * tall)
    # It stands in a small cup of metal above her hand.
    verts, faces, _ = loft(segment(centre - 0.05 * tall, centre - 0.006 * tall, [(0, 0.022), (1, 0.04)], 6))
    faces.append(tuple(range(6)))
    part('phial-cup', verts, faces, M['trim'], inside=centre - 0.03 * tall)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        out = V(math.cos(a), math.sin(a), 0.0)
        cone(f'ray-{k}', centre, centre + 0.135 * out, 0.02, M['light'], n=3, back=None)
    cone('ray-up', centre + 0.05 * tall, centre + 0.2 * tall, 0.02, M['light'], n=3, back=None)


def pouring_arm():
    shoulder, wrist = L_SHOULDER, L_WRIST
    elbow = bend(shoulder, wrist, UPPER_ARM, FOREARM, shoulder + V(0.3, 0.05, -0.15))
    tube('upper-arm-left', shoulder, elbow, [(-0.1, 0.05), (1.06, 0.042)], M['gown'])
    # The wide sleeve has slipped back as she reaches: it flares from the elbow over the top of her
    # forearm and hangs below it, clear of the ewer.
    ahead = (wrist - elbow).normalized()
    end = elbow + 0.4 * (wrist - elbow)
    rings = segment(elbow - 0.02 * ahead, end, [(0, 0.046), (1.0, 0.086)], 6)
    rings[1] = [p + V(0, 0, -0.11 * max(0.0, -(p - end).normalized().z)) for p in rings[1]]
    verts, faces, _ = loft(rings)
    part('sleeve-left', verts, faces, M['gown'], inside=lambda c: elbow + (c - elbow).dot(ahead) * ahead)
    tube('forearm-left', elbow, wrist, [(-0.05, 0.04), (1.0, 0.033)], M['skin'])
    # Her hand closed on the ewer's handle.
    fist = wrist + 0.035 * ahead
    up = (V(0, 0, 1) - V(0, 0, 1).dot(ahead) * ahead).normalized()
    box('fist-left', fist, [ahead, up, ahead.cross(up)], (0.036, 0.034, 0.03), M['skin'], 0.8)
    ewer(fist)


# The Mirror of Galadriel ----------------------------------------------------------------------------

# The ewer, upright: the rings of its body up its axis from the foot (height, radius), the spout's
# root and tip and the handle's points, as (up its axis, towards the spout). It is tipped to pour,
# its spout over the middle of the basin, and held by the top of its handle.
EWER = [(0.0, 0.03), (0.06, 0.056), (0.12, 0.042), (0.158, 0.022), (0.19, 0.032)]
SPOUT = [(0.13, 0.026), (0.2, 0.1)]
HANDLE = [(0.165, -0.02), (0.17, -0.082), (0.06, -0.074)]
GRIP = (0.16, -0.084)  # where her hand holds the handle
TIP = 58  # degrees the ewer is tipped from upright


def ewer(hand):
    towards = (BASIN - V(hand.x, hand.y, 0)).normalized()  # level, towards the middle of the basin
    tip = math.radians(TIP)
    axis = math.cos(tip) * V(0, 0, 1) + math.sin(tip) * towards
    front = math.cos(tip) * towards - math.sin(tip) * V(0, 0, 1)
    side = axis.cross(front)
    foot = hand - GRIP[0] * axis - GRIP[1] * front

    def at(a, b):
        return foot + a * axis + b * front

    rings = [[at(a, 0) + r * (math.cos(t) * front + math.sin(t) * side) for t in (math.tau * i / 5 for i in range(5))]
             for a, r in EWER]
    verts, faces, _ = loft(rings)
    faces += [tuple(range(5)), tuple(range(len(verts) - 5, len(verts)))]
    part('ewer', verts, faces, M['silver'], inside=lambda c: foot + (c - foot).dot(axis) * axis)
    cone('spout', at(*SPOUT[0]), at(*SPOUT[1]), 0.016, M['silver'], n=3, back=None)
    bent_tube('handle', [at(a, b) for a, b in HANDLE], [0.01] * len(HANDLE), M['silver'], n=3)


# The basin, wide and shallow, round its middle: its rings from the foot out to the rim and in over
# its lip to the water, filled to the brim (radius, height).
BASIN = V(0.44, -0.07, 0.0)
BOWL = [(0.07, 0.43), (0.18, 0.468), (0.205, 0.512), (0.186, 0.516)]
TRUNK = 0.44  # the pedestal's trunk, up into the foot of the bowl
BRANCHES = 3
ROOTS = 3


def mirror_basin():
    rings = [ellipse(BASIN.x, BASIN.y, z, r, r, 12, 15) for r, z in BOWL]
    verts, faces, _ = loft(rings)
    part('basin', verts, faces, M['silver'], inside=lambda c: V(BASIN.x, BASIN.y, c.z))
    # The water, filled to the brim, dark and still.
    r, z = BOWL[-1]
    part('water', ellipse(BASIN.x, BASIN.y, z - 0.002, r, r, 12, 15), [tuple(range(12))], M['water'],
         outward=V(0, 0, 1))

    # The pedestal, carved like a branching tree: a stout trunk rooted on the ground, its roots
    # spreading, and three branches rising from it and spreading under the bowl to hold it up.
    root = V(BASIN.x, BASIN.y, 0)
    tube('trunk', root, root + V(0, 0, TRUNK), [(0, 0.07), (0.3, 0.046), (1, 0.05)], M['stone'], phase=30)
    for k in range(ROOTS):  # away from her, and before and behind
        out = V(math.cos(math.radians(120 * k)), math.sin(math.radians(120 * k)), 0)
        cone(f'root-{k}', root + 0.03 * out + V(0, 0, 0.1), root + 0.15 * out, 0.036, M['stone'], n=3, back=None)
    for k in range(BRANCHES):  # between the roots
        out = V(math.cos(math.radians(60 + 120 * k)), math.sin(math.radians(60 + 120 * k)), 0)
        cone(f'branch-{k}', root + V(0, 0, 0.27), root + 0.155 * out + V(0, 0, 0.462), 0.036, M['stone'], n=4,
             back=None)


# The gear for 2 stars: the circlet of golden flowers ----------------------------------------------

# The band round her head, laid on her brow and hair: eight corners from her left round the back to
# her right and the front, as the head's rings run (x, y, z of its lower edge).
CIRCLET = [(0.126, 0.004, 1.446), (0.101, 0.099, 1.438), (0.0, 0.132, 1.434), (-0.101, 0.099, 1.438),
           (-0.126, 0.004, 1.446), (-0.105, -0.109, 1.446), (0.0, -0.122, 1.458), (0.105, -0.109, 1.446)]
CIRCLET_DEPTH = 0.022  # how tall the band is
# A mallorn leaf, oval with a pointed tip, as (along, across) fractions of its length and half-width:
# its outline up one side to the tip, and the two points of its midrib.
LEAF_OUTLINE = [(0.0, 0.0), (0.28, 1.0), (0.66, 0.82), (1.0, 0.0), (0.66, -0.82), (0.28, -1.0)]
LEAF_RIB = [(0.28, 0.0), (0.66, 0.0)]
LEAF_FACES = [(0, 1, 6), (1, 2, 7), (1, 7, 6), (2, 3, 7), (3, 4, 7), (4, 5, 6), (4, 6, 7), (5, 0, 6)]
LEAF = (0.074, 0.025, 0.36)  # each leaf's length, half-width, and how far it leans out as it rises


def circlet():
    lower = [V(*p) for p in CIRCLET]
    upper = [p + V(0, 0, CIRCLET_DEPTH) for p in lower]
    verts, faces, _ = loft([lower, upper])
    part('circlet', verts, faces, M['gold'], inside=lambda c: V(0, 0.004, c.z))

    # A mallorn leaf rising from each corner of the band and leaning out, folded along its midrib so
    # its halves catch the light differently; the one over her forehead is the tallest.
    for k, foot in enumerate(upper):
        out = V(foot.x, foot.y - 0.004, 0).normalized()
        length, half, lean = LEAF
        if k == 6:
            length *= 1.3
        rise = (V(0, 0, 1) + lean * out).normalized()
        across = rise.cross(out).normalized()
        base = foot - V(0, 0, 0.01)
        verts = [base + a * length * rise + b * half * across for a, b in LEAF_OUTLINE]
        verts += [base + a * length * rise + 0.007 * out for a, _ in LEAF_RIB]
        part(f'leaf-{k}', verts, LEAF_FACES, M['gold'], outward=out)

    # Yellow flowers on the band between the leaves, five-petalled bosses, and the largest at the front,
    # over her forehead, before the tallest leaf.
    for k, (a, b) in enumerate(zip(upper, upper[1:] + upper[:1])):
        at = a.lerp(b, 0.5) - V(0, 0, 0.5 * CIRCLET_DEPTH)
        out = V(at.x, at.y - 0.004, 0).normalized()
        cone(f'flower-{k}', at, at + 0.012 * out, 0.019, M['gold'], n=5, phase=90, back=None)
    at = upper[6] - V(0, 0, 0.5 * CIRCLET_DEPTH) + V(0, -0.004, 0)
    cone('flower-front', at, at + V(0, -0.02, 0.004), 0.028, M['gold'], n=5, phase=90, back=None)


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
    pouring_arm()
    circlet()
    mirror_basin()
    finish('galadriel-3', budget=BOOK_BUDGET)


main()
