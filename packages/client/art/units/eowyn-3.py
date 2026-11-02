"""Éowyn, the Lady of Ithilien: Éowyn's 3★ model, the book moment (docs/viewer-spec.md section 4,
"Star levels").

The same Éowyn as eowyn.py, the shieldmaiden who stood bare-headed before the Lord of the Nazgûl,
at her height after it: healed, standing on the walls of the City on the day the Shadow departed, fair
and queenly in the mantle Faramir wrapped her in, made for his mother Finduilas, "of deep blue as the
night, broidered with silver stars about hem and throat" (The Return of the King, VI 5, "The Steward
and the King"). The mantle is the team colour, so on the near side it is the book's own deep blue,
with silver stars round its hem and about her throat. Under it she is in a pale gown to the ground,
white as the books dress her, girt with `trim` ("her white robe girt with silver", The Two Towers,
III 6). She keeps her sword, raised in her right hand as on her 1★, so she still reads as a
Guardian; her left arm is wrapped in the mantle, holding it close.

Her face and her long golden hair, framing her face in two locks and falling down her back over the
mantle, are the 1★'s, so she is the same woman from every side. The team colour is the mantle, from
the shoulders round her back to her ankles, seen from the front, from behind and from above.

Her fittings, the girdle and its clasp, the clasp at her throat, the two brooches on her shoulders
and the sword's cross-guard and pommel, use `trim`, which the client colours gold at 3★. The stars
are their own silver.

    blender --background --factory-startup --python-exit-code 1 --python eowyn-3.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so her right hand, with the sword, is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOK_BUDGET,
    EYES,
    STEEL,
    V,
    box,
    cone,
    ellipse,
    finish,
    frame,
    lean,
    loft,
    material,
    newell,
    on_surface,
    part,
    reset,
    team_material,
    trim_material,
    tube,
)

# Éowyn's own colours (sRGB); the rest come from the kit.
SKIN = 0xE4B999  # fair
HAIR = 0xDCB767  # pale gold: brighter than Galadriel's deep gold, warmer than Éomer's flaxen
BROWS = 0x9C7642  # a darker gold, so the brows show on her fair skin
LIPS = 0xA46D5C  # a muted rose-brown, not red
GOWN = 0xD2CCBF  # her pale gown, white warmed and dimmed, so it never outshines the team colour
STARS = 0xDDE1E6  # the silver stars broidered on her mantle, cool and bright on the deep blue

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.75),
        brows=material('brows', BROWS, roughness=0.8),
        lips=material('lips', LIPS, roughness=0.8),
        eyes=material('eyes', EYES, roughness=0.6),
        gown=material('gown', GOWN, roughness=0.9),
        stars=material('stars', STARS, roughness=0.4, metallic=0.1),
        # Fittings: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
    )


# Helpers -----------------------------------------------------------------------------------------


def triangles(verts, faces, keep=lambda centre: True):
    """The faces as triangles, for on_surface(), keeping those whose centre passes `keep`."""
    found = []
    for face in faces:
        points = [verts[i] for i in face]
        if keep(sum(points, Vector()) / len(points)):
            found += [(points[0], points[k], points[k + 1]) for k in range(1, len(points) - 1)]
    return found


def star(name, centre, normal, up, radius, mat, points=5):
    """A flat star laid on a surface at `centre`, facing along `normal` with its top point towards
    `up`: tips and notches round a middle raised a little, so its facets catch the light."""
    n = Vector(normal).normalized()
    u = Vector(up) - Vector(up).dot(n) * n
    u.normalize()
    w = n.cross(u)
    verts = [Vector(centre) + 0.2 * radius * n]
    for k in range(2 * points):
        a = math.pi * k / points
        r = radius if k % 2 == 0 else 0.42 * radius
        verts.append(Vector(centre) + r * (math.cos(a) * u + math.sin(a) * w))
    faces = [(0, 1 + k, 1 + (k + 1) % (2 * points)) for k in range(2 * points)]
    part(name, verts, faces, mat, outward=n)


# The gown ----------------------------------------------------------------------------------------

# Her pale gown from under the bodice to the ground in twelve folds, over her feet: z, half-width,
# half-depth, centre y and the depth of the folds. The top ring is hidden under the bodice.
SKIRT = [
    (0.0, 0.238, 0.214, 0.0, 0.02),  # the hem, on the ground
    (0.3, 0.205, 0.18, 0.0, 0.014),
    (0.52, 0.175, 0.145, 0.0, 0.008),
    (0.64, 0.15, 0.12, 0.0, 0.0),
]


def skirt():
    rings = []
    for z, rx, ry, cy, fold in SKIRT:
        ring = []
        for i in range(12):
            a = math.tau * i / 12
            k = fold if i % 2 else 0.0
            ring.append(V((rx + k) * math.cos(a), cy + (ry + k) * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings)
    part('skirt', verts, faces, M['gown'], inside=lambda c: V(0, 0.0, c.z))
    return triangles(verts, faces, lambda c: c.y < -0.05)


# The bodice of her gown as a barrel of octagons: z, half-width, half-depth, centre y and how far the
# front two points push forward, for her breast. The girdle is the band between the third and fourth
# rings.
TORSO = [
    (0.575, 0.2, 0.17, 0.004, 0.0),  # over the top of the skirt
    (0.665, 0.17, 0.136, 0.0, 0.0),  # hips
    (0.745, 0.136, 0.104, -0.004, 0.0),  # girdle, lower edge
    (0.795, 0.134, 0.102, -0.004, 0.0),  # girdle, upper edge: the waist
    (0.895, 0.16, 0.11, 0.0, 0.022),  # the breast
    (0.97, 0.17, 0.104, 0.008, 0.0),  # shoulders
    (1.005, 0.056, 0.052, 0.012, 0.0),  # neck
]
TORSO_BANDS = [0, 0, 1, 0, 0, 0]  # the gown, except the girdle


def torso():
    rings = []
    for z, rx, ry, cy, forward in TORSO:
        ring = []
        for i in range(8):
            a = math.radians(22.5 + 45 * i)
            push = forward if math.sin(a) < -0.5 else 0.0
            ring.append(V(rx * math.cos(a), cy + ry * math.sin(a) - push, z))
        rings.append(ring)
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    part('torso', verts, faces, [M['gown'], M['trim']], face_mats, inside=lambda c: V(0, 0, c.z))
    axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
    box('girdle-clasp', GIRDLE_CLASP, axes, (0.012, 0.03, 0.03), M['trim'], 0.75)


GIRDLE_CLASP = V(0, -0.108, 0.77)


def girdle_end(skirt_front):
    """The end of the girdle, hanging from its clasp down the front of the gown to below the knee,
    a narrow strip ending in a point, laid on the skirt's folds."""
    top = LEANING @ (GIRDLE_CLASP + V(0, -0.006, -0.02))
    half = 0.017
    rows = [[top + V(half, 0, 0), top + V(-half, 0, 0)]]
    for z in (0.6, 0.45, 0.32):
        rows.append([V(x, on_surface(skirt_front, x, z) - 0.006, z) for x in (half, -half)])
    verts, faces, _ = loft(rows, closed=False)
    verts.append(V(0, on_surface(skirt_front, 0, 0.27) - 0.006, 0.27))
    faces.append((len(verts) - 3, len(verts) - 2, len(verts) - 1))
    part('girdle-end', verts, faces, M['trim'], outward=V(0, -1, 0))


# Head --------------------------------------------------------------------------------------------

# The head as rings of eight from the neck up, each from her left side (+X) round the back to her
# right and the front: z, then the left half, mirrored to the right, as (x, y, dz) points, each dz
# above or below z: the side, the back corner, the back, the front corner and the front. The jaw rises
# from a small chin to the ears, under it the throat is in shadow, and the hairline rises to the
# parting in the middle. Above the brow the rings carry the volume of her hair.
HEAD = [
    (0.995, (0.05, 0.008, 0), (0.037, 0.042, 0), (0, 0.052, 0), (0.034, -0.03, 0), (0, -0.038, 0)),  # the neck
    (1.058, (0.05, 0.004, 0), (0.038, 0.046, 0), (0, 0.056, 0), (0.034, -0.032, 0), (0, -0.04, 0)),  # the throat
    (1.09, (0.088, 0.004, 0.028), (0.068, 0.07, 0.034), (0, 0.084, 0.034), (0.042, -0.09, 0.0),
     (0, -0.104, -0.008)),  # the jaw, from the chin up to the ears
    (1.15, (0.106, 0.0, 0), (0.086, 0.084, 0), (0, 0.1, 0), (0.074, -0.094, 0), (0, -0.118, 0)),  # the mouth
    (1.225, (0.118, 0.002, 0), (0.096, 0.094, 0), (0, 0.114, 0), (0.086, -0.1, 0), (0, -0.12, 0)),  # the eyes
    (1.29, (0.126, 0.006, 0), (0.104, 0.104, 0), (0, 0.124, 0), (0.086, -0.102, 0), (0, -0.12, 0)),  # the brow
    (1.33, (0.132, 0.01, 0), (0.108, 0.108, 0), (0, 0.13, 0), (0.08, -0.1, -0.012), (0, -0.112, 0.014)),  # hairline
    (1.385, (0.104, 0.014, -0.012), (0.086, 0.094, -0.004), (0, 0.108, 0), (0.066, -0.078, -0.004),
     (0, -0.084, 0)),  # the top, falling away to the sides from the parting
]
# The parting runs over the crown from the front of her head to the back, a low ridge.
PARTING = [V(0, -0.036, 1.414), V(0, 0.066, 1.404)]
# Which faces of each band are skin, by their place round the ring: 4 to 7 are her right side, the
# right and left of her face and her left side; the rest are hair.
SKIN_FACES = [{4, 5, 6, 7}] * 4 + [{5, 6}, {5, 6}, set()]


def head_ring(z, side, back_corner, back, front_corner, front):
    (sx, sy, sz), (bx, by, bz), (_, cy, cz), (fx, fy, fz), (_, ny, nz) = side, back_corner, back, front_corner, front
    return [V(sx, sy, z + sz), V(bx, by, z + bz), V(0, cy, z + cz), V(-bx, by, z + bz), V(-sx, sy, z + sz),
            V(-fx, fy, z + fz), V(0, ny, z + nz), V(fx, fy, z + fz)]


def head():
    rings = [head_ring(*r) for r in HEAD]
    verts, faces, bands = loft(rings)
    face_mats = [0 if i % 8 in SKIN_FACES[b] else 1 for i, b in zip(range(len(faces)), bands)]
    # Over the top, the hair falls away either side of the parting: front (a) and back (b).
    t, a, b = (len(rings) - 1) * 8, len(verts), len(verts) + 1
    verts += PARTING
    top = [(t + 6, t + 7, a), (t + 7, t, b, a), (t, t + 1, b), (t + 1, t + 2, b),
           (t + 6, t + 5, a), (t + 5, t + 4, b, a), (t + 4, t + 3, b), (t + 3, t + 2, b)]
    faces += top
    face_mats += [1] * len(top)
    part('head', verts, faces, [M['skin'], M['hair']], face_mats, inside=V(0, 0.0, 1.2))

    # The planes either side of the middle of her face, for laying details on.
    face = []
    for r in range(2, 6):
        lo, hi = rings[r], rings[r + 1]
        for a, b in ((5, 6), (6, 7)):
            face += [(lo[a], lo[b], hi[b]), (lo[a], hi[b], hi[a])]

    # Wide almond eyes, level and steady: inner corner, top, outer corner and bottom.
    for s in (-1, 1):
        corners = [(s * 0.022, 1.24), (s * 0.048, 1.255), (s * 0.08, 1.249), (s * 0.052, 1.233)]
        verts = [V(x, on_surface(face, x, z) - 0.005, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2, 3)], M['eyes'], outward=V(0, -1, 0))

    # Fine straight brows, a little lower at the inner ends: she is grave, not gentle.
    for s in (-1, 1):
        points = [(s * 0.02, 1.27), (s * 0.052, 1.284), (s * 0.082, 1.279), (s * 0.081, 1.27),
                  (s * 0.052, 1.274), (s * 0.022, 1.261)]
        verts = [V(x, on_surface(face, x, z) - 0.006, z) for x, z in points]
        part(f'brow-{s}', verts, [(0, 1, 4, 5), (1, 2, 3, 4)], M['brows'], outward=V(0, -1, 0))

    # A small mouth.
    points = [(-0.026, 1.146), (0, 1.151), (0.026, 1.146), (0, 1.138)]
    verts = [V(x, on_surface(face, x, z) - 0.004, z) for x, z in points]
    part('mouth', verts, [(0, 1, 2, 3)], M['lips'], outward=V(0, -1, 0))

    # A small straight nose.
    top, tip, under = V(0, -0.122, 1.265), V(0, -0.143, 1.196), V(0, -0.117, 1.186)
    left, right = V(0.019, -0.113, 1.198), V(-0.019, -0.113, 1.198)
    verts = [top, tip, under, left, right]
    part('nose', verts, [(0, 3, 1), (0, 1, 4), (3, 2, 1), (1, 2, 4)], M['skin'], inside=V(0, -0.09, 1.22))
    return rings


def side_locks():
    # A lock either side of her face, from under the hair at her temple down past the cheek and over
    # the front of her shoulder to her breast: rows of its inner edge, its ridge and its outer edge,
    # ending in a point.
    for s in (-1, 1):
        rows = [
            [V(s * 0.077, -0.09, 1.34), V(s * 0.098, -0.046, 1.345), V(s * 0.12, 0.0, 1.345)],
            [V(s * 0.1, -0.09, 1.2), V(s * 0.134, -0.08, 1.2), V(s * 0.142, -0.008, 1.2)],
            [V(s * 0.094, -0.106, 1.06), V(s * 0.134, -0.116, 1.06), V(s * 0.158, -0.05, 1.06)],
            [V(s * 0.098, -0.126, 0.95), V(s * 0.134, -0.144, 0.95), V(s * 0.17, -0.096, 0.95)],
        ]
        verts, faces, _ = loft(rows, closed=False)
        verts.append(V(s * 0.124, -0.144, 0.86))
        faces += [(9, 10, 12), (10, 11, 12)]
        part(f'lock-{s}', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z))


# Team colour: the starry mantle ------------------------------------------------------------------


def mantle():
    # The mantle's shoulders, as on the 1★: eight points round the neck and the shoulders, starting
    # at her left shoulder (+X); the front dips at her throat and the back rises where her hair falls
    # over it.
    neck_z = [1.03, 1.045, 1.06, 1.045, 1.03, 1.012, 1.0, 1.012]
    neck = ellipse(0, 0.012, 0, 0.068, 0.064, 8, 0, neck_z)
    dome = ellipse(0, 0.01, 0, 0.17, 0.13, 8, 0, [z - 0.045 for z in neck_z])
    shoulder_z = [0.935, 0.945, 0.955, 0.945, 0.935, 0.935, 0.935, 0.935]
    shoulder = ellipse(0, 0.008, 0, 0.245, 0.162, 8, 0, shoulder_z)
    hem = ellipse(0, 0.008, 0, 0.238, 0.157, 8, 0, [z - 0.05 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('mantle', verts, faces, M['team'], inside=V(0, 0.01, 0.9))
    brooches(dome, shoulder)
    throat(dome, neck)
    return triangles(verts, faces, lambda c: c.y > 0.03)


def brooches(dome, shoulder):
    # A round brooch on top of each shoulder, pinning the long mantle there: a low six-sided boss,
    # facing up and a little out, beside her hair, so it shows from in front, from behind and from
    # above. On her right it sits where the sword arm's sleeve meets the mantle; on her left, whose
    # arm is wrapped in the mantle, on the slope of the mantle's shoulder.
    top, normal = shoulder_top(R_SHOULDER, R_ELBOW)
    cone('brooch-right', top - 0.004 * normal, top + 0.016 * normal, 0.028, M['trim'], n=6, back=None)
    top, edge = dome[0], shoulder[0]
    normal = V(top.z - edge.z, 0, edge.x - top.x).normalized()
    at = top.lerp(edge, 0.4)
    cone('brooch-left', at - 0.004 * normal, at + 0.016 * normal, 0.028, M['trim'], n=6, back=None)


def shoulder_top(shoulder, elbow):
    """The top of a sleeve where it leaves the shoulder, and the way up and out from it."""
    _, v = frame(elbow - shoulder)
    up = -v if v.z < 0 else v
    return shoulder + 0.05 * up, (up + V(0, 0, 1)).normalized()


THROAT_STARS = (4, 5, 6, 7)  # the faces round the front of her neck, from her right to her left


def throat(dome, neck):
    """Silver stars about the throat, one on each face of the mantle round the front of her neck,
    and the clasp that closes it under her chin."""
    for i in THROAT_STARS:
        corners = [dome[i], dome[(i + 1) % 8], neck[(i + 1) % 8], neck[i]]
        centre = sum(corners, Vector()) / 4
        normal = newell(corners).normalized()
        if normal.z < 0:
            normal = -normal
        up = (neck[i] + neck[(i + 1) % 8]) / 2 - (dome[i] + dome[(i + 1) % 8]) / 2
        star(f'throat-star-{i}', centre + 0.004 * normal, normal, up, 0.024, M['stars'])
    at = neck[6] + V(0, -0.012, -0.012)
    cone('throat-clasp', at, at + V(0, -0.02, 0.004), 0.026, M['trim'], n=6, back=at + V(0, 0.01, 0))


# The long mantle, from under its shoulders round her back to her ankles. On her left it wraps
# forward over her arm, which holds it close beneath; on her right it falls from behind the raised
# sword arm and spreads forward to the hem. Each level: z at the middle and at the edges, half-width,
# half-depth, centre y, where it starts and ends (degrees round from her left, +X, by the back) and
# how deep the folds are. The last band is the hem, broidered with stars.
LONG_MANTLE = [
    (0.94, 0.93, 0.212, 0.15, 0.012, -40, 150, 0.0),
    (0.72, 0.73, 0.242, 0.188, 0.018, -56, 172, 0.016),
    (0.36, 0.38, 0.282, 0.25, 0.024, -63, 197, 0.03),
    (0.17, 0.19, 0.3, 0.27, 0.026, -65, 206, 0.036),  # the top of the hem
    (0.04, 0.06, 0.31, 0.28, 0.026, -65, 209, 0.038),  # the hem, just off the ground
]
MANTLE_POINTS = 13


def long_mantle():
    rings = []
    for middle, edge, rx, ry, cy, start, end, fold in LONG_MANTLE:
        ring = []
        for i in range(MANTLE_POINTS):
            a = math.radians(start + (end - start) * i / (MANTLE_POINTS - 1))
            k = 1 + (fold / ry if i % 2 else 0)
            z = edge + (middle - edge) * math.sin(a) ** 2
            ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('long-mantle', verts, faces, M['team'], inside=lambda c: V(0, 0.0, c.z))
    hem_stars(rings[-1], rings[-2])
    return triangles(verts, faces, lambda c: c.y > 0.03)


def hem_stars(lo, hi):
    """A silver star on each face of the mantle's hem, all the way round."""
    for i in range(MANTLE_POINTS - 1):
        corners = [lo[i], lo[i + 1], hi[i + 1], hi[i]]
        centre = sum(corners, Vector()) / 4
        normal = newell(corners).normalized()
        if normal.dot(V(centre.x, centre.y, 0)) < 0:
            normal = -normal
        up = (hi[i] + hi[i + 1]) / 2 - (lo[i] + lo[i + 1]) / 2
        star(f'hem-star-{i}', centre + 0.004 * normal, normal, up, 0.042, M['stars'])


def hair_fall(back, head_rings):
    # Her long hair from the back of her head down over the mantle to her waist, as on the 1★, in
    # three locks: rows across her back from her left to her right, edge, ridge, valley, ridge,
    # valley, ridge, edge, the lower ones laid on the mantle, each lock ending in a point.
    across = (1, 0.66, 0.33, 0, -0.33, -0.66, -1)
    lift = (0.008, 0.03, 0.014, 0.032, 0.014, 0.03, 0.008)  # how far each stands off the cloak

    def on_cloak(x, z, out):
        return V(x, on_surface(back, x, z) + out, z)

    # From the widest ring of her hair, round the back of her head from side to side.
    ring = head_rings[6]
    top = [ring[0], ring[1], (ring[1] + ring[2]) / 2, ring[2], (ring[2] + ring[3]) / 2, ring[3], ring[4]]
    top = [p + 0.004 * V(p.x, p.y, 0).normalized() for p in top]
    nape = [V(0.125 * f, 0.135 + o, 1.1) for f, o in zip(across, lift)]
    rows = [top, nape]
    for z, half in ((0.95, 0.118), (0.82, 0.088)):
        rows.append([on_cloak(f * half, z, out) for f, out in zip(across, lift)])
    verts, faces, _ = loft(rows, closed=False)
    n = len(verts)
    q = list(range(n - 7, n))  # the last row
    for f, z in ((0.66, 0.74), (0.0, 0.7), (-0.66, 0.74)):
        verts.append(on_cloak(f * 0.088, z, 0.02))
    faces += [(q[0], q[1], n), (q[1], q[2], n), (q[2], q[3], n + 1), (q[3], q[4], n + 1),
              (q[4], q[5], n + 2), (q[5], q[6], n + 2)]
    part('hair-fall', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z))


# Arms: the long sleeves of her gown, a little wide at the wrist ----------------------------------

R_SHOULDER = V(-0.16, 0.005, 0.962)
# The sword arm raised out to her side, the fist at the height of her head, as on the 1★.
R_ELBOW, R_WRIST, R_FIST = V(-0.37, 0.035, 0.88), V(-0.4, -0.045, 1.09), V(-0.405, -0.058, 1.128)


def arm(side, shoulder, elbow, wrist, fist, grip):
    """A sleeve of her gown and a fist closed round a grip running along `grip`."""
    tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.056), (1.1, 0.047)], M['gown'])
    forearm = [(-0.15, 0.045), (0.5, 0.047), (1.0, 0.058)]
    tube(f'forearm-{side}', elbow, wrist, forearm, M['gown'])
    along = Vector(grip).normalized()
    ahead = wrist - elbow
    ahead = (ahead - ahead.dot(along) * along).normalized()
    box(f'fist-{side}', fist, [ahead, along, ahead.cross(along)], (0.042, 0.046, 0.044), M['skin'], 0.88)


# Sword, raised in her right hand -----------------------------------------------------------------

SWORD = V(-0.32, -0.06, 1.0).normalized()  # up and out to her side, a little forward


def sword():
    along = SWORD
    across = along.cross(V(0, 1, 0)).normalized()  # the edges, out to the sides
    thick = across.cross(along)  # the flats face forward and back
    guard = R_FIST + 0.062 * along

    def section(c, w, t):
        return [c + w * across, c + t * thick, c - w * across, c - t * thick]

    # The blade: a flattened diamond in section, narrowing a little to its point.
    rings = [section(guard, 0.041, 0.012), section(guard + 0.46 * along, 0.034, 0.01)]
    verts, faces, _ = loft(rings)
    verts.append(guard + 0.58 * along)
    faces += [(4 + i, 4 + (i + 1) % 4, 8) for i in range(4)]
    part('blade', verts, faces, M['steel'], inside=guard + 0.25 * along)
    # A cross-guard over her fist and a pommel under it.
    box('guard', guard, [along, across, thick], (0.016, 0.085, 0.02), M['trim'], 0.8)
    pommel = R_FIST - 0.062 * along
    cone('pommel', pommel + 0.012 * along, pommel - 0.03 * along, 0.024, M['trim'], n=4, back=pommel + 0.03 * along)

    arm('right', R_SHOULDER, R_ELBOW, R_WRIST, R_FIST, along)


LEAN = 2  # degrees her body above the hips leans forward: she stands tall
PIVOT = V(0, 0, 0.62)
LEANING = Matrix.Translation(PIVOT) @ Matrix.Rotation(math.radians(LEAN), 4, 'X') @ Matrix.Translation(-PIVOT)


def main():
    reset()
    make_materials()
    skirt_front = skirt()
    lower = set(bpy.context.scene.objects)
    torso()
    head_rings = head()
    side_locks()
    back = mantle()
    back += long_mantle()
    hair_fall(back, head_rings)
    sword()
    lean([o for o in bpy.context.scene.objects if o not in lower], PIVOT, LEAN)
    girdle_end(skirt_front)  # from the clasp, where it leans with her, down the gown, which doesn't
    finish('eowyn-3', budget=BOOK_BUDGET)


main()
