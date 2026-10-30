"""A Ringwraith, one of the Nine: Nazgûl, Burglar (docs/design.md section 5), in the Faceted style of
Gimli, the reference model (gimli.py, docs/viewer-spec.md section 4).

From the books rather than the films: tall and gaunt, cloaked and hooded in black, with no face under
the hood, only darkness and the faint gleam of two eyes. Seen through the Ring, a long grey robe shows
where the black cloak parts, and the hands are haggard and grey. The right hand holds the Morgul-knife
low and forward, a long thin blade with a cold, pale glint; the left reaches out with the Black
Breath. About 1.55 tall to the peak of the hood, robed to the ground with a ragged hem.

The team colour is a ragged mantle over the shoulders, seen from in front, behind and above, and the
rim of the hood round the dark face. The black hood rises above the mantle, so the Nazgûl reads from
behind as well.

    blender --background --factory-startup --python-exit-code 1 --python ringwraith.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its right hand is at -X.
"""

import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOTS,
    V,
    box,
    finish,
    frame,
    loft,
    material,
    part,
    reset,
    team_material,
)

# The Ringwraith's own colours (sRGB).
CLOAK = 0x2C2A2B  # black, lifted just enough that the facets show
ROBE = 0x56534E  # the long grey robe under the black
VOID = 0x050505  # the darkness under the hood
GLEAM = 0xDCDECF  # the faint, pale gleam of the eyes
SKIN = 0x9A968A  # haggard, grey hands
BLADE = 0xC8CDC9  # the Morgul-knife's cold, pale steel
IRON = 0x494643  # its guard and pommel

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        cloak=material('cloak', CLOAK, roughness=0.9),
        robe=material('robe', ROBE, roughness=0.9),
        void=material('void', VOID, roughness=1.0),
        eyes=material('eyes', GLEAM, roughness=0.6, emission=GLEAM, emission_strength=1.0),
        skin=material('skin', SKIN, roughness=0.85),
        blade=material('blade', BLADE, roughness=0.35, metallic=0.1, emission=BLADE, emission_strength=0.2),
        iron=material('iron', IRON, roughness=0.5, metallic=0.1),
        leather=material('leather', BOOTS, roughness=0.85),
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

# The black cloak from the hem up, open at the front below the waist where the grey robe shows: z,
# half-width, half-depth, centre y, how deep the folds stand out, and half the opening (degrees).
# The centres move forward up the body, a stoop that thrusts the hood at the enemy.
CLOAK_RINGS = [
    (0.13, 0.355, 0.322, 0.045, 0.036, 22),  # the hem, flared
    (0.42, 0.272, 0.246, 0.03, 0.026, 14),  # knees
    (0.74, 0.182, 0.158, 0.005, 0.0, 5),  # hips
    (0.88, 0.165, 0.142, -0.012, 0.0, 0.0),  # the gaunt waist, where the cloak closes
    (1.03, 0.188, 0.145, -0.04, 0.0, 0.0),  # chest
    (1.15, 0.175, 0.12, -0.065, 0.0, 0.0),  # shoulders, under the mantle
]
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

    # The grey robe behind the opening, a little wider than it, down to the ground.
    levels = [(0.015,) + CLOAK_RINGS[0][1:]] + CLOAK_RINGS[1:4]
    rings = []
    for z, rx, ry, cy, _, opening in levels:
        spread = opening + 6
        ring = []
        for a in (-90 - spread, -90, -90 + spread):
            a = math.radians(a)
            ring.append(V(0.93 * rx * math.cos(a), cy + 0.93 * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('robe', verts, faces, M['robe'], inside=lambda c: V(0, 0.1, c.z))


# Hood --------------------------------------------------------------------------------------------

# The hood is built round the line from the middle of its opening back into it: x across, u up the
# face and b back. It tips forward a little, so the brow overhangs the dark.
FACE = V(0, -0.215, 1.235)  # the middle of the opening
HOOD_TIP = math.radians(6)
BACK = V(0, math.cos(HOOD_TIP), math.sin(HOOD_TIP))
UP = V(0, -math.sin(HOOD_TIP), math.cos(HOOD_TIP))

# Rings round that line, from the opening back: (x, u) of the top, upper corner, shoulder, side,
# lower corner and bottom of the left half (mirrored for the right), and how far back the ring is. The
# rim of the opening is the band between the first two; the peak is the top of the third, over the
# crown and above the brow, so the hood comes to a point seen from any side, from behind and above too.
HOOD = [
    ([(0, 0.118), (0.046, 0.1), (0.08, 0.054), (0.094, -0.015), (0.07, -0.086), (0, -0.108)], 0.0),
    ([(0, 0.176), (0.08, 0.15), (0.13, 0.078), (0.148, -0.015), (0.118, -0.124), (0, -0.158)], 0.04),
    ([(0, 0.3), (0.085, 0.205), (0.156, 0.1), (0.18, -0.03), (0.155, -0.168), (0, -0.218)], 0.16),
    ([(0, 0.22), (0.066, 0.17), (0.126, 0.08), (0.156, -0.045), (0.136, -0.17), (0, -0.212)], 0.27),
]
HOOD_BACK = 0.335  # where the back of the hood closes, behind the head
VOID_DEPTH = 0.055  # how far back the darkness sits from the rim


def hood_point(x, u, b):
    return FACE + x * V(1, 0, 0) + u * UP + b * BACK


def hood():
    rings = []
    for half, b in HOOD:
        # Round from the top over the left side (+X), the bottom and the right side back to the top.
        left = [(x, u) for x, u in half]
        right = [(-x, u) for x, u in reversed(half[1:-1])]
        rings.append([hood_point(x, u, b) for x, u in left + right])
    n = len(rings[0])
    centre = hood_point(0, 0.0, 0.15)
    verts, faces, bands = loft(rings)
    face_mats = [0 if b == 0 else 1 for b in bands]
    end, last = len(verts), (len(rings) - 1) * n
    verts.append(hood_point(0, -0.03, HOOD_BACK))
    faces += [(last + i, last + (i + 1) % n, end) for i in range(n)]
    face_mats += [1] * n
    part('hood', verts, faces, [M['team'], M['cloak']], face_mats, inside=centre)

    # The darkness inside, a shallow funnel set back from the rim.
    verts = rings[0] + [hood_point(0, 0.0, VOID_DEPTH)]
    faces = [(i, (i + 1) % n, n) for i in range(n)]
    part('void', verts, faces, M['void'], outward=-BACK)

    # Two faint points of light, slanting up and out, just in front of the dark.
    for s in (-1, 1):
        corners = [(s * 0.016, 0.02), (s * 0.056, 0.034), (s * 0.04, 0.006)]
        verts = [hood_point(x, u, VOID_DEPTH * (1 - math.hypot(x, u) / 0.1) - 0.006) for x, u in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=-BACK)


# Team colour: a ragged mantle over the shoulders --------------------------------------------------

# The mantle from the collar down, open at the front: z at the front and at the back, half-width,
# half-depth, centre y, how deep its folds stand out and half the opening (degrees). The collar dips
# at the front under the hood.
MANTLE = [
    (1.07, 1.13, 0.165, 0.158, -0.06, 0.0, 22),  # the collar, round the foot of the hood
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

# The right arm holds the knife low and forward; the left reaches out, its claw open.
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


def claw():
    """The left hand, open and reaching, its long fingers hooked."""
    ahead = (L_WRIST - L_ELBOW).normalized()
    down = (V(0, 0, -1) - V(0, 0, -1).dot(ahead) * ahead).normalized()
    across = ahead.cross(down)  # towards +X for this hand
    palm = L_WRIST + 0.045 * ahead
    box('palm', palm, [ahead, down, across], (0.048, 0.02, 0.046), M['skin'], 0.9)
    knuckles = palm + 0.044 * ahead + 0.006 * down
    for k, (spread, length) in enumerate([(-0.034, 0.95), (-0.011, 1.0), (0.012, 1.0), (0.033, 0.85)]):
        base = knuckles + spread * across
        bend = base + length * (0.058 * ahead + 0.012 * down) + spread * 0.25 * across
        tip = bend + length * (0.03 * ahead + 0.045 * down) + spread * 0.2 * across
        limb(f'finger-{k}', [base, bend, tip], [0.012, 0.01, 0.0], M['skin'], n=3)
    # The thumb, from the inside of the palm, hooked in under it.
    base = palm - 0.04 * across + 0.01 * ahead
    bend = base + 0.045 * ahead - 0.03 * across + 0.015 * down
    tip = bend + 0.02 * ahead + 0.035 * down + 0.008 * across
    limb('thumb', [base, bend, tip], [0.013, 0.011, 0.0], M['skin'], n=3)


# The Morgul-knife, in the right hand ------------------------------------------------------------

KNIFE = V(-0.12, -1, 0.36).normalized()  # forward, a little out and up
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

    # A cross-guard, its arms swept forward, the grip and a pommel.
    for s in (-1, 1):
        arm = guard + s * 0.055 * width + 0.02 * KNIFE
        mid = guard.lerp(arm, 0.5)
        box(f'guard-{s}', mid, [KNIFE, (arm - guard).normalized(), side], (0.012, 0.034, 0.014), M['iron'], 0.7)
    end = fist - 0.075 * KNIFE
    limb('grip', [end, guard], [0.017, 0.017], M['leather'], n=4, phase=45)
    limb('pommel', [end + 0.01 * KNIFE, end - 0.035 * KNIFE], [0.026, 0.0], M['iron'], n=4, phase=45)


def main():
    reset()
    make_materials()
    cloak()
    hood()
    mantle()
    sleeve('right', R_SHOULDER, R_ELBOW, R_WRIST)
    sleeve('left', L_SHOULDER, L_ELBOW, L_WRIST)
    claw()
    knife()
    finish('ringwraith')


main()
