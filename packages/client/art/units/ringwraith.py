"""A Ringwraith, one of the Nine: Nazgûl, Burglar (docs/design.md section 5), in the Faceted style of
Gimli, the reference model (gimli.py, docs/viewer-spec.md section 4).

From the books rather than the films: tall and gaunt, cloaked and hooded in black, with no face under
the hood, only darkness and the faint gleam of two eyes. Seen through the Ring, a long grey robe shows
where the black cloak parts, and the hands are haggard and grey. The right hand holds the Morgul-knife
low and forward, a long thin blade with a cold, pale glint; the left reaches out with the Black
Breath. About 1.55 tall to the peak of the hood, robed to the ground with a ragged hem, under which
dark boots show as it strides.

The team colour is a ragged mantle over the shoulders, seen from in front, behind and above, and the
rim of the hood round the dark face. The black hood rises above the mantle, so the Nazgûl reads from
behind as well.

It is the Nazgûl's reference rig (../rig.py, ../clips.py), which Khamûl and the Witch-king follow:
the hood is the head, and the robe to the ground bends at the waist and below the knees. The cloak
and the grey robe are in three pieces: the chest on the spine, from a ring inside the waist; the
skirt on the hips, down to a ring inside the robe below the knees; and the robe below the knees, with
its ragged hem, on a bone of its own, `robe`, which hangs plumb under the body, twists after the
knees as it strides and rests on the ground as the body sinks into it (robed()), so the run doesn't
glide and the death goes down into its own robes. The legs are hidden but for the boots, which show
under the hem as it runs. The sleeves bend at the elbow, the upper sleeve carried on past it.

Its fittings, the lozenge clasp at the throat, the Morgul-knife's guard and pommel, the buckle of the
belt cinching the cloak at the waist and two bosses pinning the mantle on the shoulders, use `trim`,
which the client colours iron, silver or gold by star level (docs/viewer-spec.md section 4, "Star
levels"): the clasp and the buckle show from the front, the bosses and the pommel from behind too.
Its 2★ model is ringwraith-2.py, which imports this script and builds it with a sword in its left hand
(build()), and its 3★ model ringwraith-3.py.

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
    bone,
    box,
    cone,
    finish,
    frame,
    loft,
    material,
    part,
    reset,
    team_material,
    trim_material,
)
from clips import fit, robed  # noqa: E402
from rig import Rig, hold, joint  # noqa: E402

# The Ringwraith's own colours (sRGB).
CLOAK = 0x2C2A2B  # black, lifted just enough that the facets show
ROBE = 0x56534E  # the long grey robe under the black
VOID = 0x050505  # the darkness under the hood
GLEAM = 0xDCDECF  # the faint, pale gleam of the eyes
SKIN = 0x9A968A  # haggard, grey hands
BLADE = 0xC8CDC9  # the Morgul-knife's cold, pale steel

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
        leather=material('leather', BOOTS, roughness=0.85),
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


def limb_rings(points, radii, n=6, phase=0.0, squash=1.0):
    """Rings of n round the bent line through `points`, with radius `radii[k]` at each, square to the
    bend there and not twisting along it."""
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
    return rings


def limb(name, points, radii, mats, band_mats=None, n=6, phase=0.0, squash=1.0):
    """A faceted tube along the bent line through `points`, with a ring of radius `radii[k]` at each,
    square to the bend there and not twisting along it. A last radius of 0 ends it in a point; the
    other end is open, to hide inside another part."""
    points = [Vector(p) for p in points]
    rings = limb_rings(points, radii, n, phase, squash)
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
# Where the pieces reach inside the next, so nothing opens as the body bends: the skirt down inside
# the robe below the knees, and the chest down inside the skirt below the waist.
KNEES_INSIDE = (0.32, 0.268, 0.24, 0.03, 0.026, 14)
WAIST_INSIDE = (0.8, 0.155, 0.133, -0.008, 0.0, 0.0)
ROBE_HEM = 0.1  # the grey robe's hem, clear of the ground, so the boots show under it as it strides
# The robe's own bone: from the middle of the knees' ring, where it hangs from, to the middle of its hem.
ROBE_TOP, ROBE_FOOT = V(0, 0.03, 0.42), V(0, 0.045, 0.06)

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


def robe_ring(z, rx, ry, cy, _fold, opening):
    """The grey robe behind the cloak's opening, a little wider than it: three points across."""
    spread = opening + 6
    return [V(0.93 * rx * math.cos(a), cy + 0.93 * ry * math.sin(a), z)
            for a in (math.radians(d) for d in (-90 - spread, -90, -90 + spread))]


def cloak():
    rings = []
    for k, (z, rx, ry, cy, fold, opening) in enumerate(CLOAK_RINGS):
        zs = [z + rise for rise in HEM_RISE] if k == 0 else None
        rings.append(cloak_ring(z, rx, ry, cy, fold, opening, zs))
    hem, knees, hips, waist, chest, shoulders = rings

    def centred(c):
        return V(0, 0, c.z)

    # Below the knees, on the robe's own bone: the cloak, its ragged hem and the grey robe.
    with bone('robe'):
        verts, faces, _ = loft([hem, knees], closed=False)
        part('cloak-hem', verts, faces, M['cloak'], inside=centred)
        dags('cloak-dags', hem, HEM_TIPS, M['cloak'], V(0, CLOAK_RINGS[0][3], 0))
        robe = [robe_ring(ROBE_HEM, *CLOAK_RINGS[0][1:]), robe_ring(*CLOAK_RINGS[1])]
        verts, faces, _ = loft(robe, closed=False)
        part('robe-hem', verts, faces, M['robe'], inside=lambda c: V(0, 0.1, c.z))
    joint('robe_top', ROBE_TOP)
    joint('robe_foot', ROBE_FOOT)

    # From inside the robe below the knees up to the waist, on the hips.
    with bone('hips'):
        verts, faces, _ = loft([cloak_ring(*KNEES_INSIDE), knees, hips, waist], closed=False)
        part('cloak-skirt', verts, faces, M['cloak'], inside=centred)
        robe = [robe_ring(*level) for level in [KNEES_INSIDE] + CLOAK_RINGS[1:4]]
        verts, faces, _ = loft(robe, closed=False)
        part('robe', verts, faces, M['robe'], inside=lambda c: V(0, 0.1, c.z))
    joint('pelvis', V(0, 0.005, 0.74))
    joint('waist', V(0, 0.0, 0.85))

    # From inside the skirt below the waist up to the shoulders, on the spine.
    with bone('spine'):
        verts, faces, _ = loft([cloak_ring(*WAIST_INSIDE), waist, chest, shoulders], closed=False)
        part('cloak-chest', verts, faces, M['cloak'], inside=centred)


# Legs: hidden under the robe but for the boots, which show under the hem as it strides --------------

# The hip, knee and ankle of the left leg (the right is mirrored): the knee a little forward, so it
# bends forward, and the toe the foot rolls over.
HIP, KNEE, ANKLE, TOE = V(0.09, 0.0, 0.72), V(0.1, -0.04, 0.4), V(0.11, -0.02, 0.075), V(0.115, -0.16, 0.02)


def legs():
    for s in (-1, 1):
        side = 'l' if s > 0 else 'r'
        hip, knee, ankle, toe = (V(s * p.x, p.y, p.z) for p in (HIP, KNEE, ANKLE, TOE))
        # A narrow boot, pointed at the toe, and the leg above it up into the robe.
        with bone(f'foot_{side}'):
            box(f'boot-{side}', V(ankle.x, ankle.y - 0.045, 0.036), [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)],
                (0.085, 0.032, 0.036), M['leather'], 0.6)
        with bone(f'shin_{side}'):
            limb(f'shin-{side}', [ankle + V(0, 0, -0.02), ankle.lerp(knee, 0.75)], [0.03, 0.032], M['leather'],
                 n=4, phase=45)
        joint(f'hip_{side}', hip)
        joint(f'knee_{side}', knee)
        joint(f'ankle_{side}', ankle)
        joint(f'toe_{side}', toe)


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
NECK = V(0, -0.04, 1.1)  # where the hood turns, inside the mantle's collar


def hood_point(x, u, b):
    return FACE + x * V(1, 0, 0) + u * UP + b * BACK


def hood():
    with bone('head'):
        hood_parts()
    joint('neck', NECK)
    joint('crown', hood_point(0, HOOD[2][0][0][1], HOOD[2][1]))  # the peak


def hood_parts():
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
    with bone('spine'):
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
ELBOW_OVERLAP = 0.03  # how far the upper sleeve runs on past the elbow, and the lower starts above it
FIST = 0.09  # from the wrist to the end of the hand


def sleeve(side, shoulder, elbow, wrist):
    s = side[0]
    cuff = elbow.lerp(wrist, CUFF)
    middle = elbow.lerp(wrist, 0.45)
    # The sleeve as it was built, but in two at the elbow: the upper sleeve carried on past it along
    # its band and the lower from above it, so the elbow can bend.
    rings = limb_rings([shoulder, elbow, middle, cuff], SLEEVE, n=6, phase=30)
    upper = [rings[0], [p + ELBOW_OVERLAP / (elbow - shoulder).length * (p - q) for p, q in zip(rings[1], rings[0])]]
    lower = [[p + ELBOW_OVERLAP / (middle - elbow).length * (p - q) for p, q in zip(rings[1], rings[2])]] + rings[2:]
    with bone(f'upper_arm_{s}'):
        verts, faces, _ = loft(upper)
        part(f'sleeve-{side}', verts, faces, M['cloak'], inside=nearest_on_polyline([shoulder, elbow]))
    along = (wrist - elbow).normalized()
    with bone(f'forearm_{s}'):
        verts, faces, _ = loft(lower)
        part(f'cuff-sleeve-{side}', verts, faces, M['cloak'], inside=nearest_on_polyline([elbow, middle, cuff]))
        # Rags hang from the cuff.
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
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', wrist + FIST * along)


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
    """Builds the fist and the knife in it, and returns its grip, its point and the way an edge faces."""
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
    point = guard + BLADE_LENGTH * KNIFE
    verts.append(point)
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
    return fist, point, width


def hands(made=None):
    # The claw, or what the 2★ model holds in its place (`made`), in the left hand.
    with bone('hand_l'):
        (made or claw)()
    with bone('hand_r'):
        grip, point, edge = knife()
    # The knife from the grip in the fist to its point, an edge turned up and out.
    hold('r', grip, point, point + 0.1 * edge)


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
    # The clasp: a lozenge with a raised middle, pinning the mantle's fronts under the hood. It rides
    # the spine with the mantle.
    w, h, rise = CLASP_SIZE
    out = V(0, -1, 0.2).normalized()
    verts = [CLASP + V(0, 0, h), CLASP + V(w, 0, 0), CLASP - V(0, 0, h), CLASP - V(w, 0, 0), CLASP + rise * out]
    with bone('spine'):
        part('clasp', verts, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], M['trim'], inside=CLASP - 0.01 * out)

    # The belt, round the gaunt waist where the cloak closes, and its buckle in front. They ride the
    # hips with the skirt, over the top of it, where the chest comes out of it.
    rings = []
    for z, grow in BELT:
        _, rx, ry, cy, _, _ = cloak_at(z)
        rings.append([V(grow * rx * math.cos(a), cy + grow * ry * math.sin(a), z)
                      for a in (math.radians(-90 + 30 * i) for i in range(12))])
    verts, faces, _ = loft(rings)
    with bone('hips'):
        part('belt', verts, faces, M['leather'], inside=lambda c: V(0, -0.012, c.z))
        axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
        box('buckle', BUCKLE, axes, (0.012, 0.034, 0.03), M['trim'], 0.7)

    # A boss on top of each shoulder, between the mantle's collar and the ring over the shoulder, on
    # the spine with the mantle.
    collar, shoulder = MANTLE[0], MANTLE[1]
    for s in (-1, 1):
        a = 0 if s > 0 else math.pi
        inner = V(collar[2] * math.cos(a), collar[4], (collar[0] + collar[1]) / 2)
        outer = V(shoulder[2] * math.cos(a), shoulder[4], (shoulder[0] + shoulder[1]) / 2)
        at = inner.lerp(outer, BOSS)
        slope = outer - inner
        normal = V(-slope.z * math.cos(a), 0, abs(slope.x)).normalized()
        with bone('spine'):
            cone(f'boss-{s}', at - 0.004 * normal, at + 0.036 * normal, 0.04, M['trim'], n=6, back=None)


# Its clips (../clips.py): the Nazgûl's. It stands hunched, breathing slow, and runs low with its hood
# thrust ahead and its claw reaching, the boots striding under the hem; stabs with the Morgul-knife,
# thrust out and to its side so the blow shows past it from behind; reaches out with the Black Breath
# (grasp); and sinks down into its own robes as it dies. The robe below the knees hangs plumb, twists
# with the stride and rests on the ground (robed()).
CLIPS = robed(fit({
    'idle': ('ready', {'breath': 0.8, 'sway': 0.6}),
    'move': ('run', {'heavy': 0.3, 'stride': 0.6, 'lift': 0.18, 'lean': 16.0, 'off': 'high'}),
    'attack': ('thrust', {'out': 20.0, 'wide': 0.3}),
    'cast': ('grasp', {}),
    'stun': ('dazed', {}),
    'death': ('knees', {'dropped': True}),
    'victory': ('raise', {'out': 0.35}),
}))


def build(sword=None):
    """Makes it in a fresh scene, every part bound to its bone and the joints marked, and returns the
    rig to finish() it with. Its 2★ model (ringwraith-2.py) passes its sword as `sword`, a function
    that makes the fist and the sword in it, which the left hand holds in place of the claw."""
    reset()
    make_materials()
    legs()
    cloak()
    hood()
    mantle()
    sleeve('right', R_SHOULDER, R_ELBOW, R_WRIST)
    sleeve('left', L_SHOULDER, L_ELBOW, L_WRIST)
    hands(sword)
    fittings()
    return Rig(bones={'robe': ('root', 'robe_top', 'robe_foot')}, clips=CLIPS)


def main():
    finish('ringwraith', rig=build())


if __name__ == '__main__':
    main()
