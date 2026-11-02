"""A Ringwraith, one of the Nine, as Frodo saw them on Weathertop when he put on the Ring: its 3★
model, the book moment (docs/viewer-spec.md section 4, "Star levels").

From The Fellowship of the Ring, I 11, "A Knife in the Dark": with the Ring on, Frodo could see
beneath their black wrappings. "In their white faces burned keen and merciless eyes; under their
mantles were long grey robes; upon their grey hairs were helms of silver; in their haggard hands were
swords of steel." It is the same tall, gaunt Ringwraith as ringwraith.py, stooping forward, with the
ragged mantle in the team colour, the black cloak with its torn hem, the Morgul-knife low in its right
hand and the long sword of its 2★ model (ringwraith-2.py) held up in its left. But the hood has
fallen back onto its shoulders, its lining in the team colour, and the Ringwraith shows as the Ring
shows it: a white, gaunt face, long in the chin and hollow in the cheeks, with keen eyes burning pale
in dark sockets; a helm of silver, open-faced, rising to a peak over the crown as the hood did; long
grey hair from under it to the shoulders; and the black cloak parted above and below the belt on the
long grey robe.

The eyes burn a pale, cold white, never red or blue, and the silver is a light grey. It wears a helm,
not a crown: the tallest of them, crowned, is the Witch-king (witch-king.py). No Ring is shown, though
the scene is seen through it. The fittings, the clasp, the buckle, the bosses on the shoulders and
the guards and pommels of the knife and the sword, use `trim`.

    blender --background --factory-startup --python-exit-code 1 --python ringwraith-3.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its right hand is at -X.
"""

import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOK_BUDGET,
    BOOTS,
    V,
    box,
    cone,
    finish,
    frame,
    loft,
    material,
    on_surface,
    part,
    reset,
    team_material,
    trim_material,
)

# The Ringwraith's own colours (sRGB).
CLOAK = 0x2C2A2B  # black, lifted just enough that the facets show
ROBE = 0x56534E  # the long grey robe under the black
VOID = 0x050505  # the dark of the eye sockets
SKIN = 0x9A968A  # haggard, grey hands
WHITE = 0xDEDBD2  # the white, gaunt face
BURN = 0xF4F1DC  # the keen eyes, burning a pale, cold white
HAIR = 0x817E79  # the grey hair, darker than the helm so the silver stands out
SILVER = 0xCFD1D1  # the helm of silver, a light grey
BLADE = 0xC8CDC9  # the Morgul-knife's cold, pale steel
STEEL = 0xB7BAB9  # the sword's plain steel, a neutral light grey
GRIP = 0x1F1D1C  # its black grip

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        cloak=material('cloak', CLOAK, roughness=0.9),
        robe=material('robe', ROBE, roughness=0.9),
        void=material('void', VOID, roughness=1.0),
        eyes=material('eyes', BURN, roughness=0.6, emission=BURN, emission_strength=2.0),
        skin=material('skin', SKIN, roughness=0.85),
        face=material('face', WHITE, roughness=0.8),
        hair=material('hair', HAIR, roughness=0.9),
        silver=material('silver', SILVER, roughness=0.35, metallic=0.15),
        blade=material('blade', BLADE, roughness=0.35, metallic=0.1, emission=BLADE, emission_strength=0.2),
        leather=material('leather', BOOTS, roughness=0.85),
        steel=material('steel', STEEL, roughness=0.4, metallic=0.1),
        grip=material('grip', GRIP, roughness=0.8),
        # Fittings: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
    )


# Helpers -----------------------------------------------------------------------------------------


def nearest_on_polyline(points):
    """A function giving the point on the bent line through `points` nearest to a point."""
    points = [Vector(p) for p in points]

    def nearest(c):
        best = None
        for a, b in zip(points, points[1:]):
            d = b - a
            t = max(0.0, min(1.0, (c - a).dot(d) / d.length_squared))
            p = a + t * d
            if best is None or (c - p).length < (c - best).length:
                best = p
        return best

    return nearest


def limb(name, points, radii, mats, band_mats=None, n=6, phase=0.0, squash=1.0):
    """A faceted tube along the bent line through `points`, with a ring of radius `radii[k]` at each,
    square to the bend there and not twisting along it. A last radius of 0 ends it in a point; the
    other end is open, to hide inside another part."""
    points = [Vector(p) for p in points]
    dirs = [(b - a).normalized() for a, b in zip(points, points[1:])]
    axes = [dirs[0]] + [(a + b).normalized() for a, b in zip(dirs, dirs[1:])] + [dirs[-1]]
    u, _ = frame(axes[0])
    rings = []
    for p, r, a in zip(points, radii, axes):
        u = (u - u.dot(a) * a).normalized()
        v = a.cross(u)
        rings.append([p + r * math.cos(t) * u + r * squash * math.sin(t) * v
                      for t in (math.radians(phase) + math.tau * i / n for i in range(n))])
    pointed = radii[-1] == 0
    verts, faces, bands = loft(rings[:-1] if pointed else rings)
    if pointed:
        tip, last = len(verts), (len(rings) - 2) * n
        verts.append(points[-1])
        faces += [(last + i, last + (i + 1) % n, tip) for i in range(n)]
        bands += [len(rings) - 2] * n
    face_mats = [band_mats[b] for b in bands] if band_mats else None
    return part(name, verts, faces, mats, face_mats, inside=nearest_on_polyline(points))


def dags(name, edge, tips, mat, inside):
    """Ragged points hanging from a run of vertices `edge`: one per edge between them, each given as
    (where along the edge it hangs, how far out it flares, its z)."""
    verts = list(edge)
    faces = []
    for k, (a, b) in enumerate(zip(edge, edge[1:])):
        along, flare, z = tips[k % len(tips)]
        p = a.lerp(b, along)
        out = V(p.x - inside.x, p.y - inside.y, 0).normalized()
        verts.append(V(p.x, p.y, z) + flare * out)
        faces.append((k, k + 1, len(verts) - 1))
    return part(name, verts, faces, mat, inside=lambda c: V(inside.x, inside.y, c.z))


# Cloak and robe ----------------------------------------------------------------------------------

# The black cloak from the hem up, parted at the front above and below the belt, where the long grey
# robe shows: z, half-width, half-depth, centre y, how deep the folds stand out, and half the opening
# (degrees). The centres move forward up the body, a stoop that thrusts the head at the enemy.
CLOAK_RINGS = [
    (0.13, 0.355, 0.322, 0.045, 0.036, 30),  # the hem, flared
    (0.42, 0.272, 0.246, 0.03, 0.026, 23),  # knees
    (0.74, 0.182, 0.158, 0.005, 0.0, 14),  # hips
    (0.88, 0.165, 0.142, -0.012, 0.0, 3),  # the gaunt waist, where the belt holds the cloak
    (1.03, 0.188, 0.145, -0.04, 0.0, 21),  # chest
    (1.1, 0.168, 0.124, -0.058, 0.0, 27),  # the top, under the mantle's collar
]
ROBE_SPREAD = 10  # degrees the robe reaches past the cloak's opening either side
ROBE_TOP = 1.135  # the robe's collar round the neck
N_CLOAK = 13  # points round a ring, from the left edge of the opening round the back to the right

# The ragged hem: for each of its 12 edges, where along it the point hangs, how far it flares out
# and its z, uneven so it reads as torn. Each vertex of the hem rises or falls a little too.
HEM_TIPS = [
    (0.5, 0.03, 0.0), (0.35, 0.035, 0.04), (0.6, 0.03, 0.0), (0.4, 0.04, 0.05), (0.55, 0.03, 0.015),
    (0.65, 0.035, 0.0), (0.35, 0.03, 0.045), (0.5, 0.04, 0.0), (0.6, 0.03, 0.03), (0.4, 0.035, 0.0),
    (0.55, 0.03, 0.05), (0.45, 0.035, 0.01),
]
HEM_RISE = [0.0, 0.035, -0.015, 0.05, 0.0, 0.04, -0.01, 0.03, 0.0, 0.055, -0.015, 0.025, 0.0]


def cloak_ring(z, rx, ry, cy, fold, opening, zs=None):
    ring = []
    for i in range(N_CLOAK):
        a = math.radians(-90 + opening + (360 - 2 * opening) * i / (N_CLOAK - 1))
        k = 1 + (fold / ry if i % 2 else 0)
        ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), zs[i] if zs else z))
    return ring


def cloak():
    rings = []
    for k, (z, rx, ry, cy, fold, opening) in enumerate(CLOAK_RINGS):
        zs = [z + rise for rise in HEM_RISE] if k == 0 else None
        rings.append(cloak_ring(z, rx, ry, cy, fold, opening, zs))
    verts, faces, _ = loft(rings, closed=False)
    part('cloak', verts, faces, M['cloak'], inside=lambda c: V(0, 0, c.z))
    hem_centre = V(0, CLOAK_RINGS[0][3], 0)
    dags('cloak-hem', rings[0], HEM_TIPS, M['cloak'], hem_centre)

    # The long grey robe behind the opening, a little wider than it, from the ground to the neck.
    levels = [(0.015,) + CLOAK_RINGS[0][1:]] + CLOAK_RINGS[1:]
    rings = []
    for z, rx, ry, cy, _, opening in levels:
        spread = opening + ROBE_SPREAD
        rings.append([V(0.93 * rx * math.cos(a), cy + 0.93 * ry * math.sin(a), z)
                      for a in (math.radians(-90 + spread * k / 2) for k in (-2, -1, 0, 1, 2))])
    verts, faces, _ = loft(rings, closed=False)
    part('robe', verts, faces, M['robe'], inside=lambda c: V(0, 0.1, c.z))

    # Its collar, closing the top of the body round the neck.
    top, rx, ry, cy, _, _ = CLOAK_RINGS[-1]
    angles = [math.radians(-90 + 45 * k) for k in range(8)]
    outer = [V(0.93 * rx * math.cos(a), cy + 0.93 * ry * math.sin(a), top) for a in angles]
    inner = [V(0.066 * math.cos(a), HEAD_Y + 0.062 * math.sin(a), ROBE_TOP) for a in angles]
    verts, faces, _ = loft([outer, inner])
    part('collar', verts, faces, M['robe'], inside=V(0, HEAD_Y, 1.0))


# The head, seen through the Ring -------------------------------------------------------------------

HEAD_Y = -0.072  # the centre line of the neck and head, forward of the body: it thrusts its face out
# Rings of eight from the neck up: z, then the left half, mirrored to the right: the side, the back
# corner, the back's y, the front corner and the front's y, from HEAD_Y. Long and gaunt: a long chin,
# hollow cheeks under high cheekbones, and a heavy brow under the helm.
HEAD = [
    (1.1, (0.046, 0.0), (0.034, 0.036), 0.044, (0.032, -0.032), -0.04),  # the neck, in the collar
    (1.15, (0.068, -0.006), (0.054, 0.058), 0.074, (0.04, -0.098), -0.116),  # under the jaw; the chin
    (1.2, (0.078, -0.014), (0.066, 0.072), 0.09, (0.05, -0.106), -0.124),  # the mouth; hollow cheeks
    (1.255, (0.096, -0.01), (0.08, 0.084), 0.102, (0.07, -0.11), -0.126),  # cheekbones and eyes
    (1.3, (0.1, -0.004), (0.084, 0.088), 0.106, (0.072, -0.112), -0.128),  # the brow
    (1.345, (0.094, 0.002), (0.078, 0.086), 0.102, (0.062, -0.098), -0.112),  # under the helm
]
# Which faces of each band are the face, by their place round the ring: 4 to 7 are the right side,
# the right and left of the face and the left side; the rest, the back of the head, are hair. The
# neck is bare all round.
FACE_FACES = [set(range(8)), {4, 5, 6, 7}, {4, 5, 6, 7}, {4, 5, 6, 7}, {4, 5, 6, 7}]


def head_ring(z, side, back_corner, back_y, front_corner, front_y):
    (sx, sy), (bx, by), (fx, fy) = side, back_corner, front_corner
    points = [(sx, sy), (bx, by), (0, back_y), (-bx, by), (-sx, sy), (-fx, fy), (0, front_y), (fx, fy)]
    return [V(x, HEAD_Y + y, z) for x, y in points]


def head():
    rings = [head_ring(*r) for r in HEAD]
    verts, faces, bands = loft(rings)
    face_mats = [0 if i % 8 in FACE_FACES[b] else 1 for i, b in zip(range(len(faces)), bands)]
    part('head', verts, faces, [M['face'], M['hair']], face_mats, inside=lambda c: V(0, HEAD_Y, c.z))

    # The front planes of the face, either side of the middle, for laying details on.
    face = []
    for r in range(1, len(rings) - 1):
        lo, hi = rings[r], rings[r + 1]
        for a, b in ((5, 6), (6, 7)):
            face += [(lo[a], lo[b], hi[b]), (lo[a], hi[b], hi[a])]

    def on_face(x, z, lift):
        return V(x, on_surface(face, x, z) - lift, z)

    # Deep, dark sockets under the brow, and in them the keen eyes, burning, slanting up and out.
    for s in (-1, 1):
        socket = [(s * 0.008, 1.266), (s * 0.04, 1.287), (s * 0.068, 1.278), (s * 0.064, 1.244),
                  (s * 0.026, 1.239)]
        verts = [on_face(x, z, 0.003) for x, z in socket]
        part(f'socket-{s}', verts, [(0, 1, 2, 3, 4)], M['void'], outward=V(0, -1, 0))
        eye = [(s * 0.016, 1.26), (s * 0.063, 1.274), (s * 0.044, 1.249)]
        verts = [on_face(x, z, 0.006) for x, z in eye]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A thin, hooked nose from between the eyes, and a lipless mouth, a dark line.
    top, tip = on_face(0, 1.262, 0.0), on_face(0, 1.19, 0.034)
    left, right, under = on_face(0.02, 1.192, -0.004), on_face(-0.02, 1.192, -0.004), on_face(0, 1.18, 0.012)
    part('nose', [top, tip, left, right, under], [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)], M['face'],
         inside=V(0, HEAD_Y, 1.22))
    corners = [(-0.034, 1.166), (0, 1.162), (0.034, 1.166), (0.03, 1.158), (0, 1.155), (-0.03, 1.158)]
    verts = [on_face(x, z, 0.003) for x, z in corners]
    part('mouth', verts, [(0, 1, 4, 5), (1, 2, 3, 4)], M['void'], outward=V(0, -1, 0))


# The helm of silver, open-faced: from its rim over the brow, and low over the nape behind, it rises
# to a peak over the crown, as the hood did, a little forward. Each ring: z at the front and at the
# back, and how much bigger it is than the head's brow ring.
HELM = [(1.292, 1.222, 1.17), (1.326, 1.258, 1.17), (1.405, 1.4, 1.03), (1.47, 1.47, 0.7)]
HELM_PEAK = V(0, HEAD_Y - 0.024, 1.55)


def helm():
    brow = head_ring(*HEAD[4])
    front, back = brow[6].y, brow[2].y
    rings = []
    for z_front, z_back, grow in HELM:
        ring = []
        for p in brow:
            t = (p.y - front) / (back - front)
            ring.append(V(grow * p.x, HEAD_Y + grow * (p.y - HEAD_Y), z_front + (z_back - z_front) * t))
        rings.append(ring)
    verts, faces, _ = loft(rings)
    peak, last = len(verts), (len(rings) - 1) * 8
    verts.append(HELM_PEAK)
    faces += [(last + i, last + (i + 1) % 8, peak) for i in range(8)]
    part('helm', verts, faces, M['silver'], inside=lambda c: V(0, HEAD_Y, min(c.z, 1.44)))


# Long grey hair from under the helm, over the ears and down the back of the neck: rings from in front
# of the left ear round the back to the right, each (half-width, half-depth, centre y from HEAD_Y, and
# z in front and behind), with ragged locks below.
HAIR_ANGLES = (-28, 12, 51, 90, 129, 168, 208)
HAIR_RINGS = [
    (0.104, 0.112, 0.0, 1.29, 1.245),  # inside the helm's rim
    (0.13, 0.185, 0.025, 1.215, 1.17),  # over the ears, onto the roll of the hood, and down the back
    (0.152, 0.205, 0.04, 1.17, 1.07),  # its ends, on the roll and, behind, over it onto the mantle
]
HAIR_LOCKS = [(0.5, 0.008, 0.06), (0.4, 0.01, 0.08), (0.55, 0.01, 0.07), (0.45, 0.01, 0.08), (0.5, 0.01, 0.07),
              (0.6, 0.008, 0.06)]


def hair():
    rings = []
    for rx, ry, cy, front, back in HAIR_RINGS:
        ring = []
        for d in HAIR_ANGLES:
            a = math.radians(d)
            z = front + (back - front) * (1 + math.sin(a)) / 2
            ring.append(V(rx * math.cos(a), HEAD_Y + cy + ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, HEAD_Y, c.z))
    ends = rings[-1]
    tips = [(along, flare, ends[k].lerp(ends[k + 1], along).z - drop)
            for k, (along, flare, drop) in enumerate(HAIR_LOCKS)]
    dags('hair-ends', ends, tips, M['hair'], V(0, HEAD_Y + 0.04, 0))


# The hood, fallen back off the helm and bunched round the neck in a roll, open at the throat: its
# lining in the team colour shows on top, round the neck, and the black of the hood outside, on the
# mantle's collar. Rings from the left of the throat round the back to the right: half-width,
# half-depth, centre y (from HEAD_Y), and z at the throat and behind.
COWL = [
    (0.074, 0.07, 0.0, 1.12, 1.17),  # the lip, round the neck
    (0.122, 0.13, 0.018, 1.15, 1.21),  # the top of the roll
    (0.172, 0.19, 0.03, 1.1, 1.14),  # its outside, on the mantle's collar
]
COWL_ANGLES = (-50, -5, 45, 90, 135, 185, 230)


def fallen_hood():
    rings = []
    for rx, ry, cy, front, back in COWL:
        ring = []
        for d in COWL_ANGLES:
            a = math.radians(d)
            z = front + (back - front) * (1 + math.sin(a)) / 2
            ring.append(V(rx * math.cos(a), HEAD_Y + cy + ry * math.sin(a), z))
        rings.append(ring)

    def out(c):
        return V(c.x, c.y - HEAD_Y, 0).normalized()

    # The lining faces up and in, towards the neck; the outside up and out.
    verts, faces, _ = loft(rings[:2], closed=False)
    part('hood-lining', verts, faces, M['team'], inside=lambda c: c + 0.03 * out(c) - V(0, 0, 0.03))
    verts, faces, _ = loft(rings[1:], closed=False)
    part('hood-roll', verts, faces, M['cloak'], inside=lambda c: V(0, HEAD_Y, c.z - 0.05))
    # Its ends at the throat, closed.
    for k in (0, len(COWL_ANGLES) - 1):
        part(f'hood-end-{k}', [rings[0][k], rings[1][k], rings[2][k]], [(0, 1, 2)], M['cloak'],
             outward=V(0, -1, 0))


# Team colour: a ragged mantle over the shoulders --------------------------------------------------

# The mantle from the collar down, open at the front: z at the front and at the back, half-width,
# half-depth, centre y, how deep its folds stand out and half the opening (degrees). The collar dips
# at the throat.
MANTLE = [
    (1.07, 1.13, 0.165, 0.158, -0.06, 0.0, 22),  # the collar, round the neck and the fallen hood
    (1.02, 1.045, 0.245, 0.2, -0.05, 0.008, 30),  # over the shoulders
    (0.88, 0.8, 0.262, 0.215, -0.04, 0.03, 36),  # the hem, falling to the waist at the back
]
N_MANTLE = 13  # points round, from the left edge of the opening round the back to the right
# Its hem in tatters, longest down the back: for each edge from the left front round to the right
# front, where along it the rag hangs, how far it flares out and how far it falls below the hem.
MANTLE_TIPS = [
    (0.6, 0.015, 0.08), (0.35, 0.02, 0.12), (0.6, 0.025, 0.07), (0.4, 0.03, 0.16), (0.65, 0.03, 0.1),
    (0.35, 0.03, 0.2), (0.6, 0.03, 0.12), (0.4, 0.03, 0.21), (0.55, 0.03, 0.09), (0.35, 0.025, 0.15),
    (0.6, 0.02, 0.06), (0.4, 0.015, 0.12),
]


def mantle_ring(front, back, rx, ry, cy, fold, opening):
    ring = []
    for i in range(N_MANTLE):
        a = math.radians(-90 + opening + (360 - 2 * opening) * i / (N_MANTLE - 1))
        z = front + (back - front) * (1 + math.sin(a)) / 2
        k = 1 + (fold / ry if i % 2 else 0)
        ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
    return ring


def mantle():
    rings = [mantle_ring(*level) for level in MANTLE]
    verts, faces, _ = loft(rings, closed=False)
    centre = V(0, MANTLE[-1][4], 0)
    part('mantle', verts, faces, M['team'], inside=lambda c: V(centre.x, centre.y, c.z))
    hem = rings[-1]
    tips = []
    for k, (along, flare, drop) in enumerate(MANTLE_TIPS):
        tips.append((along, flare, hem[k].lerp(hem[k + 1], along).z - drop))
    dags('mantle-hem', hem, tips, M['team'], centre)


# Arms --------------------------------------------------------------------------------------------

# The right arm holds the knife low and forward; the left reaches out, holding up the sword.
R_SHOULDER, R_ELBOW, R_WRIST = V(-0.17, -0.055, 0.99), V(-0.29, -0.05, 0.85), V(-0.325, -0.29, 0.71)
L_SHOULDER, L_ELBOW, L_WRIST = V(0.17, -0.055, 0.99), V(0.3, -0.1, 0.88), V(0.27, -0.37, 0.91)
# Each sleeve: radius at the shoulder, the elbow, along the forearm and at the open cuff.
SLEEVE = [0.058, 0.066, 0.085, 0.112]
CUFF = 0.88  # how far from the elbow to the wrist the cuff ends


def sleeve(side, shoulder, elbow, wrist):
    cuff = elbow.lerp(wrist, CUFF)
    middle = elbow.lerp(wrist, 0.45)
    limb(f'sleeve-{side}', [shoulder, elbow, middle, cuff], SLEEVE, M['cloak'], n=6, phase=30)
    # Rags hang from the cuff.
    along = (wrist - elbow).normalized()
    u, v = frame(along)
    ring = [cuff + SLEEVE[-1] * (math.cos(t) * u + math.sin(t) * v)
            for t in (math.radians(30) + math.tau * i / 6 for i in range(6))]
    verts, faces = list(ring), []
    for i in range(6):
        a, b = ring[i], ring[(i + 1) % 6]
        mid = (a + b) / 2
        verts.append(mid + 0.05 * along + V(0, 0, -0.05) + 0.02 * (mid - cuff).normalized())
        faces.append((i, (i + 1) % 6, len(verts) - 1))
    part(f'cuff-{side}', verts, faces, M['cloak'], inside=lambda c: cuff + (c - cuff).dot(along) * along)
    # The thin wrist, from the dark of the sleeve.
    limb(f'wrist-{side}', [elbow.lerp(wrist, 0.6), wrist], [0.03, 0.03], M['skin'], n=4, phase=45)


# The Morgul-knife, in the right hand ------------------------------------------------------------

KNIFE = V(-0.12, -1, 0.55).normalized()  # forward, a little out and up, a little higher than at 1★
BLADE_LENGTH = 0.42
# Stations along the blade: fraction of its length, half-width and half-thickness.
BLADE_STATIONS = [(0.0, 0.027, 0.01), (0.3, 0.034, 0.01), (0.74, 0.023, 0.008)]
BLADE_ROLL = 40  # degrees the flat is turned from upright towards the sky, to catch the light


def knife():
    ahead = (R_WRIST - R_ELBOW).normalized()
    fist = R_WRIST + 0.05 * ahead
    up = (KNIFE - KNIFE.dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    box('fist', fist, [ahead, up, across], (0.048, 0.05, 0.052), M['skin'], 0.85)

    # The flat of the blade faces `side`, its edges along `width`.
    level = V(KNIFE.y, -KNIFE.x, 0).normalized()  # across the blade, level
    upright = level.cross(KNIFE).normalized()
    if upright.z < 0:
        upright = -upright
    roll = math.radians(BLADE_ROLL)
    width = math.cos(roll) * upright + math.sin(roll) * level
    side = KNIFE.cross(width).normalized()

    guard = fist + 0.07 * KNIFE
    rings = []
    for t, w, th in BLADE_STATIONS:
        c = guard + t * BLADE_LENGTH * KNIFE
        rings.append([c + w * width, c + th * side, c - w * width, c - th * side])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    verts.append(guard + BLADE_LENGTH * KNIFE)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    part('blade', verts, faces, M['blade'], inside=lambda c: guard + (c - guard).dot(KNIFE) * KNIFE)

    # A cross-guard, its arms swept forward, the grip and a pommel, the fittings in `trim`.
    for s in (-1, 1):
        arm = guard + s * 0.058 * width + 0.02 * KNIFE
        mid = guard.lerp(arm, 0.5)
        box(f'guard-{s}', mid, [KNIFE, (arm - guard).normalized(), side], (0.013, 0.036, 0.016), M['trim'], 0.7)
    end = fist - 0.075 * KNIFE
    limb('grip', [end, guard], [0.017, 0.017], M['leather'], n=4, phase=45)
    cone('pommel', end, end - 0.048 * KNIFE, 0.03, M['trim'], n=4, phase=45, back=end + 0.016 * KNIFE)


# Fittings ----------------------------------------------------------------------------------------

CLASP = V(0, -0.214, 1.056)  # the middle of the clasp, across the mantle's opening at the throat
CLASP_SIZE = (0.044, 0.05, 0.022)  # its half-width, half-height and how far its middle stands out
# The belt's lower and upper edges: z, and how much wider than the cloak it is there.
BELT = [(0.862, 1.045), (0.902, 1.045)]
BUCKLE = V(0, -0.158, 0.882)
BOSS = 0.58  # where the bosses sit on the mantle, from its collar (0) to over the shoulder (1)


def cloak_at(z):
    """The cloak's ring at height `z`, between the rings of CLOAK_RINGS round it."""
    for low, high in zip(CLOAK_RINGS, CLOAK_RINGS[1:]):
        if low[0] <= z <= high[0]:
            t = (z - low[0]) / (high[0] - low[0])
            return [a + (b - a) * t for a, b in zip(low, high)]
    raise ValueError(z)


def fittings():
    """The clasp at the throat, the belt cinching the cloak at the waist with its buckle, and a boss
    pinning the mantle on each shoulder; the knife's guard and pommel are in knife()."""
    # The clasp: a lozenge with a raised middle, pinning the mantle's fronts at the throat.
    w, h, rise = CLASP_SIZE
    out = V(0, -1, 0.2).normalized()
    verts = [CLASP + V(0, 0, h), CLASP + V(w, 0, 0), CLASP - V(0, 0, h), CLASP - V(w, 0, 0), CLASP + rise * out]
    part('clasp', verts, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], M['trim'], inside=CLASP - 0.01 * out)

    # The belt, round the gaunt waist where the cloak closes, and its buckle in front.
    rings = []
    for z, grow in BELT:
        _, rx, ry, cy, _, _ = cloak_at(z)
        rings.append([V(grow * rx * math.cos(a), cy + grow * ry * math.sin(a), z)
                      for a in (math.radians(-90 + 30 * i) for i in range(12))])
    verts, faces, _ = loft(rings)
    part('belt', verts, faces, M['leather'], inside=lambda c: V(0, -0.012, c.z))
    axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
    box('buckle', BUCKLE, axes, (0.012, 0.034, 0.03), M['trim'], 0.7)

    # A boss on top of each shoulder, between the mantle's collar and the ring over the shoulder.
    collar, shoulder = MANTLE[0], MANTLE[1]
    for s in (-1, 1):
        a = 0 if s > 0 else math.pi
        inner = V(collar[2] * math.cos(a), collar[4], (collar[0] + collar[1]) / 2)
        outer = V(shoulder[2] * math.cos(a), shoulder[4], (shoulder[0] + shoulder[1]) / 2)
        at = inner.lerp(outer, BOSS)
        slope = outer - inner
        normal = V(-slope.z * math.cos(a), 0, abs(slope.x)).normalized()
        cone(f'boss-{s}', at - 0.004 * normal, at + 0.036 * normal, 0.04, M['trim'], n=6, back=None)


# The gear for 2 stars: a long sword --------------------------------------------------------------

# Drawn in the left hand and held up before it, leaning out to its left and a little forward, its
# flat to the front and the back.
SWORD = V(0.34, -0.12, 0.93).normalized()
SWORD_LENGTH = 0.62  # from the guard to the point, which stays below the label
# Stations along the blade: fraction of its length, half-width and half-thickness.
SWORD_STATIONS = [(0.0, 0.034, 0.011), (0.8, 0.026, 0.009)]
SWORD_GUARD = 0.085  # half the cross-guard's width
SWORD_GRIP = 0.15  # from the guard down to the pommel


def sword():
    ahead = (L_WRIST - L_ELBOW).normalized()
    fist = L_WRIST + 0.045 * ahead
    # The fist closes round the grip, its knuckles along the forearm.
    knuckles = (ahead - ahead.dot(SWORD) * SWORD).normalized()
    box('fist-left', fist, [knuckles, SWORD, knuckles.cross(SWORD)], (0.05, 0.054, 0.05), M['skin'], 0.86)

    # The blade's edges lie in the plane it leans in, so its flat faces the front and the back.
    width = SWORD.cross(V(0, 1, 0)).normalized()
    side = SWORD.cross(width).normalized()
    guard = fist + 0.072 * SWORD
    rings = []
    for t, w, th in SWORD_STATIONS:
        c = guard + t * SWORD_LENGTH * SWORD
        rings.append([c + w * width, c + th * side, c - w * width, c - th * side])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    verts.append(guard + SWORD_LENGTH * SWORD)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    part('sword', verts, faces, M['steel'], inside=lambda c: guard + (c - guard).dot(SWORD) * SWORD)

    # A straight cross-guard and a pommel in `trim`, and the black grip through the fist.
    box('sword-guard', guard, [SWORD, width, side], (0.014, SWORD_GUARD, 0.02), M['trim'], 0.8)
    end = guard - SWORD_GRIP * SWORD
    limb('sword-grip', [end, guard], [0.017, 0.017], M['grip'], n=4, phase=45)
    cone('sword-pommel', end, end - 0.045 * SWORD, 0.03, M['trim'], n=4, phase=45, back=end + 0.016 * SWORD)


def main():
    reset()
    make_materials()
    cloak()
    head()
    helm()
    mantle()
    fallen_hood()
    hair()
    sleeve('right', R_SHOULDER, R_ELBOW, R_WRIST)
    sleeve('left', L_SHOULDER, L_ELBOW, L_WRIST)
    knife()
    fittings()
    sword()
    finish('ringwraith-3', budget=BOOK_BUDGET)


main()
