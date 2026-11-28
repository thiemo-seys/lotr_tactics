"""Beasts, in the Faceted style (docs/viewer-spec.md section 4): the warg, which Sharku rides
(units/sharku.py) and which runs riderless in the Moria warband (units/warg.py), as mounts.py holds
the horse the other Riders sit on.

warg() builds one, its parts bound to its own bones (mount_..., with a jaw that bites), and returns a
`Warg`: where a rider sits on it, where his rein is tied and its rig.Mount, which a rider's Rig takes
(`Rig(kind='mounted', mount=...)`) or a beast's on its own (`Rig(kind='beast', mount=...)`, ../rig.py).
Its options make the wild one: its head turned or straight and carried low, its tail stiff behind or
hanging, what it wears round its neck, and a saddle-cloth under a rider or a crest of bristling fur
down its bare back. With its defaults it is Sharku's, exactly as his script built it.

Coordinates are Blender's: z up, the model faces -Y, so its left is +X.
"""

import math
from dataclasses import dataclass
from itertools import pairwise

import bpy
from mathutils import Matrix, Vector

from kit import V, bone, box, loft, nearest_on_polyline, part, path_rings, wind
from mounts import jointed_leg, mount_rig
from rig import joint

M = {}  # the warg's materials by name, as its rider's script makes them (warg())

def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


def tufts(name, spikes, mats, tuft_mats=None):
    """Tufts of fur, spikes or fangs: each a three-sided point from a triangle of three points on a
    surface, which it hides, out to a tip. `spikes` are (base, tip); `tuft_mats` indexes `mats`."""
    verts, faces, face_mats = [], [], []
    for k, (base, tip) in enumerate(spikes):
        first = len(verts)
        base = [Vector(p) for p in base]
        verts += base + [Vector(tip)]
        inside = (sum(base, Vector()) / 3).lerp(Vector(tip), 0.02)
        sides = [(first + i, first + (i + 1) % 3, first + 3) for i in range(3)]
        faces += wind(verts, sides, inside=inside)
        face_mats += [tuft_mats[k] if tuft_mats else 0] * 3
    return part(name, verts, faces, mats, face_mats)


def shaggy_tube(name, points, radii, mats, band_mats=None, n=6, phase=0.0, side=None, rough=0.0, end=None):
    """A bent tube, as kit.bent_tube(), its rings pushed out and in by `rough` at alternate points so
    it reads as clumps of fur; open at the start and drawn to the point `end`."""
    points = [Vector(p) for p in points]
    rings = path_rings(points, radii, n, phase, side)
    for r, ring in enumerate(rings):
        for i, p in enumerate(ring):
            ring[i] = points[r] + (p - points[r]) * (1 + rough * (1 if (i + r) % 2 else -1))
    verts, faces, bands = loft(rings)
    face_mats = [band_mats[b] for b in bands] if band_mats else [0] * len(faces)
    faces = wind(verts, faces, inside=nearest_on_polyline(points))
    if end is not None:
        first = (len(rings) - 1) * n
        verts.append(Vector(end))
        fan = [(first + i, first + (i + 1) % n, len(verts) - 1) for i in range(n)]
        faces += wind(verts, fan, inside=points[-1] - 0.01 * (points[-1] - points[-2]).normalized())
        face_mats += [face_mats[-1]] * n
    return part(name, verts, faces, mats, face_mats)


# The warg ----------------------------------------------------------------------------------------
#
# Low, long and deep-chested, its back about 0.6 off the ground and nose to tail inside the hex. It
# faces -Y, so its left is +X.

C8 = math.cos(math.pi / 8)


def ring8(y, top, bottom, half, k_top=1.0, k_bottom=1.0, grow=0.0):
    """Eight points round the body at y, flat on top and underneath, the first on its left (+X) side
    just above the middle; `grow` moves them all out, for cloth laid on it."""
    cz = (top + bottom) / 2
    rz = (top - bottom) / 2 / C8 + grow
    rx = half / C8 + grow
    ring = []
    for i in range(8):
        a = math.radians(22.5 + 45 * i)
        s = math.sin(a)
        k = k_top if s > 0.7 else k_bottom if s < -0.7 else 1.0
        ring.append(V(k * rx * math.cos(a), y, cz + rz * s))
    return ring


# The body in rings across it, from the breast to the rump: y, the top (the line of the back), the
# bottom (the chest and belly), the half-width, and how wide the top and bottom facets are.
BODY = [
    (-0.48, 0.58, 0.36, 0.12, 0.7, 0.6),  # the breast
    (-0.37, 0.66, 0.285, 0.205, 0.6, 0.5),  # the shoulders: the withers a ridge, the chest deep
    (-0.18, 0.65, 0.295, 0.215, 0.85, 0.6),  # the ribs
    (0.03, 0.615, 0.36, 0.165, 1.0, 0.8),  # the waist, tucked up, where he sits
    (0.2, 0.61, 0.38, 0.155, 1.0, 0.8),  # the loins
    (0.35, 0.615, 0.35, 0.18, 0.85, 0.7),  # the haunches
    (0.46, 0.57, 0.39, 0.115, 0.7, 0.7),  # the rump
]
BREAST, RUMP = V(0, -0.525, 0.46), V(0, 0.505, 0.48)


def body_row(y):
    """The BODY row at y, between the rows either side."""
    for a, b in pairwise(BODY):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return tuple(p + t * (q - p) for p, q in zip(a, b))
    raise ValueError(f'no body at y = {y}')


def warg_body():
    rings = [ring8(*row) for row in BODY]
    verts, faces, _ = loft(rings)
    # Grey-brown, dark along the spine and pale underneath.
    face_mats = [2 if f % 8 == 1 else 1 if f % 8 == 5 else 0 for f in range(len(faces))]

    def inside(c):
        y = min(max(c.y, BODY[0][0]), BODY[-1][0])
        row = body_row(y)
        return V(0, y, (row[1] + row[2]) / 2)

    faces = wind(verts, faces, inside=inside)
    front, back, last = len(verts), len(verts) + 1, (len(rings) - 1) * 8
    verts += [BREAST, RUMP]
    faces += wind(verts, [(i, (i + 1) % 8, front) for i in range(8)], inside=V(0, BODY[0][0] + 0.02, 0.46))
    faces += wind(verts, [(last + i, last + (i + 1) % 8, back) for i in range(8)],
                  inside=V(0, BODY[-1][0] - 0.02, 0.48))
    face_mats += [1] * 8 + [0] * 8
    return part('warg-body', verts, faces, [M['fur'], M['pale_fur'], M['dark_fur']], face_mats)


# The neck: the crest (y, z), the throat (y, z) and the half-width, from inside the body to the
# back of the skull. It is thick and short, and carries the head low and forward.
NECK = [
    ((-0.30, 0.66), (-0.44, 0.32), 0.16),
    ((-0.47, 0.73), (-0.58, 0.45), 0.145),
    ((-0.58, 0.77), (-0.65, 0.56), 0.12),
]


def neck_ring(crest, throat, half):
    """Six points round the neck: the crest, down its left side to the throat and up its right."""
    c, t = V(0, *crest), V(0, *throat)
    upper, lower = c.lerp(t, 0.3), c.lerp(t, 0.72)
    side = V(1, 0, 0)
    return [c, upper + 0.9 * half * side, lower + 0.8 * half * side, t, lower - 0.8 * half * side,
            upper - 0.9 * half * side]


def neck_centre(k):
    crest, throat, _ = NECK[k]
    return (V(0, *crest) + V(0, *throat)) / 2


def warg_neck():
    rings = [neck_ring(*row) for row in NECK]
    verts, faces, _ = loft(rings)
    face_mats = [1 if f % 6 in (2, 3) else 0 for f in range(len(faces))]  # a pale throat
    inside = nearest_on_polyline([neck_centre(k) for k in range(len(NECK))])
    return part('warg-neck', verts, faces, [M['fur'], M['pale_fur']], face_mats, inside=inside)


# The head, heavy and long, held low with the muzzle thrust out: from the back of the skull to the
# nose. Each section: t along it, how high the ridge stands above the line and how far below it the
# jaw-line is, and the half-width at the brow and at the jaw-line.
SKULL_BACK, NOSE = V(0, -0.55, 0.76), V(0, -0.88, 0.62)
ALONG = NOSE - SKULL_BACK
FORE = ALONG.normalized()
SIDE = V(1, 0, 0)
UP = FORE.cross(SIDE)  # out of the top of the head, square to it
HEAD = [
    (0.0, 0.09, 0.1, 0.105, 0.1),
    (0.22, 0.105, 0.085, 0.135, 0.14),  # the cheekbones, the widest
    (0.45, 0.083, 0.056, 0.098, 0.1),  # the stop, where the eyes are
    (0.75, 0.068, 0.04, 0.075, 0.08),  # the muzzle, heavy
    (1.0, 0.057, 0.028, 0.062, 0.066),  # the nose, blunt
]


def head_row(t):
    """The HEAD row at t, between the rows either side."""
    for a, b in pairwise(HEAD):
        if a[0] <= t <= b[0]:
            f = (t - a[0]) / (b[0] - a[0])
            return tuple(p + f * (q - p) for p, q in zip(a, b))
    raise ValueError(f'no head at t = {t}')


def hp(t, up, side):
    """A point of the head: t along it from the back of the skull, `up` above the line, `side` to
    its left."""
    return SKULL_BACK + t * ALONG + up * UP + side * SIDE


def head_ring(t, above, below, brow, cheek):
    """Six points round the head at t: the ridge, its left side at the brow and at the jaw-line,
    under the line, and its right side."""
    return [hp(t, above, 0), hp(t, 0.5 * above, brow), hp(t, -0.45 * below, cheek), hp(t, -below, 0),
            hp(t, -0.45 * below, -cheek), hp(t, 0.5 * above, -brow)]


def lip(t, s):
    """The jaw-line on side s (1 for the left, -1 for the right) at t."""
    _, _, below, _, cheek = head_row(t)
    return hp(t, -0.45 * below, s * cheek)


def on_brow(t, s, f):
    """A point on the upper facet of side s of the face at t, `f` of the way from the ridge to the
    brow, laid just proud of it."""
    _, above, _, brow, _ = head_row(t)
    p = hp(t, above, 0).lerp(hp(t, 0.5 * above, s * brow), f)
    return p + 0.005 * (UP + s * SIDE).normalized()


HINGE = hp(0.17, -0.072, 0)  # where the lower jaw hinges
GAPE = 38  # degrees the jaws are open
OPEN = Matrix.Translation(HINGE) @ Matrix.Rotation(math.radians(GAPE), 4, 'X') @ Matrix.Translation(-HINGE)

# The lower jaw: t along the head, the top (the floor of the mouth) and the bottom below the line,
# and the half-width, before it opens.
JAW = [
    (0.14, -0.055, -0.155, 0.11),
    (0.55, -0.05, -0.12, 0.088),
    (0.95, -0.044, -0.094, 0.064),
]


def warg_head():
    rings = [head_ring(*row) for row in HEAD]
    verts, faces, bands = loft(rings)
    # The roof of the open mouth is dark from the cheekbones forward, and the muzzle pale.
    face_mats = [1 if b > 0 and f % 6 in (2, 3) else 2 if b > 1 and f % 6 in (1, 4) else 0
                 for f, b in enumerate(bands)]
    faces = wind(verts, faces, inside=nearest_on_polyline([SKULL_BACK, NOSE]))
    tip = NOSE + 0.03 * FORE - 0.006 * UP  # the black nose
    verts.append(tip)
    last = (len(rings) - 1) * 6
    faces += wind(verts, [(last + i, last + (i + 1) % 6, len(verts) - 1) for i in range(6)],
                  inside=NOSE - 0.01 * FORE)
    face_mats += [1] * 6
    part('warg-head', verts, faces, [M['fur'], M['eyes'], M['pale_fur']], face_mats)

    # The lower jaw hangs open from the hinge: pale underneath, the floor of the mouth dark.
    rings = [[hp(t, top, half), hp(t, bottom, 0.65 * half), hp(t, bottom, -0.65 * half), hp(t, top, -half)]
             for t, top, bottom, half in JAW]
    verts, faces, _ = loft(rings)
    face_mats = [1 if f % 4 == 3 else 0 for f in range(len(faces))]
    axis = [hp(t, (top + bottom) / 2, 0) for t, top, bottom, _ in JAW]
    faces = wind(verts, faces, inside=nearest_on_polyline(axis))
    last = (len(rings) - 1) * 4
    faces += wind(verts, [tuple(range(last, last + 4))], outward=FORE)
    face_mats.append(0)
    with bone('mount_jaw'):
        jaw = part('warg-jaw', verts, faces, [M['pale_fur'], M['eyes']], face_mats)
    jaw.data.transform(OPEN)
    joint('mount_hinge', HINGE)
    joint('mount_chin', OPEN @ hp(0.95, -0.07, 0))

    # Fangs: two long ones down from the upper jaw and two up from the lower, on the jaw.
    upper, lower = [], []
    for s in (-1, 1):
        base = lip(0.82, s) - 0.016 * s * SIDE + 0.016 * UP
        upper.append(([base + 0.024 * FORE, base - 0.016 * FORE + 0.012 * s * SIDE,
                       base - 0.016 * FORE - 0.014 * s * SIDE], base - 0.11 * UP + 0.015 * FORE))
        t, top, half = 0.88, -0.045, 0.066
        low = hp(t, top - 0.016, s * (half - 0.016))
        base = [low + 0.018 * FORE, low - 0.014 * FORE + 0.012 * s * SIDE,
                low - 0.014 * FORE - 0.014 * s * SIDE]
        lower.append(([OPEN @ p for p in base], OPEN @ (low + 0.09 * UP)))
    tufts('warg-fangs', upper, M['bone'])
    with bone('mount_jaw'):
        tufts('warg-jaw-fangs', lower, M['bone'])

    # Ears pinned back, out and up.
    spikes = []
    for s in (-1, 1):
        root = hp(0.14, 0.078, s * 0.083)
        base = [root + 0.055 * FORE, root - 0.033 * FORE + s * 0.05 * SIDE,
                root - 0.033 * FORE - s * 0.04 * SIDE]
        spikes.append((base, root - 0.14 * FORE + 0.13 * UP + s * 0.09 * SIDE))
    tufts('warg-ears', spikes, M['dark_fur'])

    # Shaggy cheeks: tufts from behind the jaw, swept back, which widen the head.
    spikes = []
    for s in (-1, 1):
        for t, up, lift in ((0.05, -0.02, 0.0), (0.18, -0.05, -0.04)):
            c = hp(t, up, s * (head_row(t)[4] - 0.01))
            base = [c + 0.05 * FORE, c - 0.03 * FORE + 0.04 * UP, c - 0.03 * FORE - 0.04 * UP]
            spikes.append((base, c - 0.12 * FORE + s * 0.07 * SIDE + lift * UP))
    tufts('warg-cheeks', spikes, M['fur'])

    # Pale, slanted eyes under the brow, laid on the upper facets of the face.
    for s in (-1, 1):
        verts = [on_brow(0.48, s, 0.55), on_brow(0.36, s, 0.92), on_brow(0.42, s, 0.95)]
        part(f'warg-eye-{s}', verts, [(0, 1, 2)], M['glare'], outward=UP + s * SIDE)


def hackles():
    """A crest of dark, bristling tufts along the top of the neck from the skull to the withers."""
    crest = [hp(0.04, 0.092, 0), V(0, *NECK[2][0]), V(0, *NECK[1][0]), V(0, -0.31, 0.66),
             V(0, -0.2, 0.652)]
    spikes = []
    # Each tuft: how far along the crest (by its points) and how tall.
    for f, h in ((0.1, 0.08), (0.6, 0.1), (1.4, 0.12), (2.2, 0.11), (3.0, 0.08)):
        i = min(int(f), len(crest) - 2)
        c = crest[i].lerp(crest[i + 1], f - i)
        back = (crest[i + 1] - crest[i]).normalized()
        up = SIDE.cross(back)
        if up.z < 0:
            up = -up
        base = [c + 0.045 * SIDE + 0.025 * back, c - 0.045 * SIDE + 0.025 * back, c - 0.06 * back]
        spikes.append((base, c + h * up + 0.07 * back))
    tufts('warg-hackles', spikes, M['dark_fur'])


def ruff():
    """A ruff of shaggy tufts round the neck, swept back over the shoulders; pale at the throat."""
    ring = neck_ring(*NECK[1])
    centre = neck_centre(1)
    back = (neck_centre(0) - neck_centre(1)).normalized()
    spikes, mats = [], []
    for i in range(6):
        a, b = ring[i], ring[(i + 1) % 6]
        mid = (a + b) / 2
        out = (mid - centre).normalized()
        spikes.append(([a, b, mid + 0.06 * back - 0.02 * out], mid + 0.11 * out + 0.12 * back))
        mats.append(1 if i in (2, 3) else 0)
    tufts('warg-ruff', spikes, [M['fur'], M['pale_fur']], mats)


def collar():
    """A ragged rag in the team colour knotted round the warg's throat behind its jaw, its ends
    hanging down its chest: the team colour on the mount from in front. Returns where on it, high on
    the warg's left, the rein is tied, before the head turns."""

    def ring(f, grow):
        a, b = neck_ring(*NECK[1]), neck_ring(*NECK[2])
        centre = neck_centre(1).lerp(neck_centre(2), f)
        return [centre + (p.lerp(q, f) - centre) * grow for p, q in zip(a, b)]

    back, front = ring(0.25, 1.15), ring(0.8, 1.18)
    verts, faces, _ = loft([back, front])
    # Two broad ends hang from the knot under the throat down its chest, and a dag from each side.
    knot = (verts[3] + verts[9]) / 2
    for side, length in ((1, 0.2), (-1, 0.15)):
        top = [knot + V(side * 0.005, 0.0, 0.0), knot + V(side * 0.06, 0.02, 0.0)]
        bottom = [p + V(side * 0.012, 0.03, -length) for p in top]
        first = len(verts)
        verts += top + bottom + [(bottom[0] + bottom[1]) / 2 + V(0, 0.01, -0.06)]
        faces += [(first, first + 1, first + 3, first + 2), (first + 2, first + 3, first + 4)]
    for i, drop in ((1, V(0.02, 0.03, -0.08)), (4, V(-0.02, 0.03, -0.08))):
        a, b = i, 6 + i
        verts.append((verts[a] + verts[b]) / 2 + drop)
        faces.append((a, b, len(verts) - 1))
    axis = [neck_centre(1), neck_centre(2)]
    part('collar', verts, faces, M['team'], inside=nearest_on_polyline(axis))
    return back[1].lerp(front[1], 0.5)


# Sharku's warg turns its head to its left, away from his blade, so that it shows its open jaws in
# profile from in front and past his shoulder from behind. The neck bends between TURN_FROM and
# TURN_TO (y); in front of that the head turns whole. A wild warg may carry its head low instead
# (lowered()), the neck bending over the same span.
TURN = 34
TURN_FROM, TURN_TO = -0.3, -0.58
LOWER_Z = 0.6  # the height the neck bends down about as the head is carried low


def turned(p, turn=TURN):
    """A point of the neck or head, placed as if the warg looked straight ahead, turned with them."""
    p = Vector(p)
    f = min(max((TURN_FROM - p.y) / (TURN_FROM - TURN_TO), 0.0), 1.0)
    a = math.radians(turn) * f
    x, y = p.x, p.y - TURN_FROM
    return V(x * math.cos(a) - y * math.sin(a), TURN_FROM + x * math.sin(a) + y * math.cos(a), p.z)


def lowered(p, lower):
    """A point of the neck or head, placed as if the warg held its head up as Sharku's does, with the
    neck bent down `lower` degrees over the span it turns in, and the head carried low with it."""
    p = Vector(p)
    f = min(max((TURN_FROM - p.y) / (TURN_FROM - TURN_TO), 0.0), 1.0)
    a = math.radians(lower) * f
    y, z = p.y - TURN_FROM, p.z - LOWER_Z
    return V(p.x, TURN_FROM + y * math.cos(a) - z * math.sin(a), LOWER_Z + y * math.sin(a) + z * math.cos(a))


def placed(p, turn=TURN, lower=0.0):
    """A point of the neck or head as the warg carries them: lowered `lower` degrees, then turned
    `turn` degrees to its left."""
    return turned(lowered(p, lower) if lower else p, turn)


# Legs, from inside the body to the paw: the shoulder or hip, the elbow or stifle, the wrist or
# hock and the pastern; the forelegs braced, the hind legs gathered under it to spring.
FORELEG = [V(0, -0.34, 0.47), V(0.01, -0.3, 0.28), V(0.012, -0.33, 0.11), V(0.02, -0.37, 0.04)]
HINDLEG = [V(0, 0.33, 0.5), V(0.025, 0.2, 0.3), V(0.015, 0.43, 0.14), V(0.02, 0.40, 0.04)]
FORE_RADII = [(0.095, 0.11), (0.062, 0.07), (0.045, 0.05), (0.044, 0.046)]
HIND_RADII = [(0.105, 0.13), (0.068, 0.08), (0.045, 0.055), (0.044, 0.046)]
# Each leg: its joints and radii, how far out (x) and how far forward it is set.
LEGS = [
    ('fore-right', FORELEG, FORE_RADII, -0.135, 0.0),
    ('fore-left', FORELEG, FORE_RADII, 0.135, -0.07),
    ('hind-right', HINDLEG, HIND_RADII, -0.125, 0.03),
    ('hind-left', HINDLEG, HIND_RADII, 0.125, -0.02),
]


def warg_legs():
    """The four legs, each in three overlapping parts on its bones (mounts.jointed_leg()), with the
    fur on each: the breeches on the thigh, the feathering on the forearm. Returns each leg's bones."""
    chains = {}
    for name, joints, radii, x, ahead in LEGS:
        s = 1 if x > 0 else -1
        leg = f'{name.split("-")[0]}_{"l" if s > 0 else "r"}'
        points = [V(x + s * j.x, j.y + ahead, j.z) for j in joints]
        rings = path_rings(points, radii, 5, 90, SIDE)
        upper, lower, foot = chains[leg] = jointed_leg(f'warg-{name}', leg, points, rings, [M['fur']], [0, 0, 0])
        spikes = []
        if name.startswith('hind'):
            # Shaggy breeches down the back of the thigh.
            hip, stifle = points[0], points[1]
            for f, length in ((0.3, 0.13), (0.7, 0.11)):
                c = hip.lerp(stifle, f) + V(s * 0.03, 0.07, 0)
                base = [c + V(s * 0.03, -0.03, 0.04), c + V(-s * 0.02, -0.03, 0.04), c + V(0, -0.02, -0.05)]
                spikes.append((base, c + V(s * 0.04, length, -0.05)))
            fur = upper
        else:
            # Feathering down the back of the foreleg.
            c = points[1] + V(s * 0.01, 0.04, 0.02)
            base = [c + V(s * 0.03, -0.03, 0.05), c + V(-s * 0.025, -0.03, 0.05), c + V(0, -0.02, -0.04)]
            spikes.append((base, c + V(s * 0.02, 0.08, -0.1)))
            fur = lower
        with bone(fur):
            tufts(f'warg-feathering-{name}', spikes, M['fur'])
        paw = points[-1]
        axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
        with bone(foot):
            box(f'warg-paw-{name}', V(paw.x, paw.y - 0.035, 0.032), axes, (0.075, 0.056, 0.032), M['fur'], 0.7)
    return chains


TAIL = [V(0, 0.42, 0.54), V(0, 0.55, 0.59), V(0.015, 0.67, 0.56), V(0.035, 0.77, 0.47)]
TAIL_RADII = [0.055, 0.095, 0.11, 0.09]
TAIL_TIP = V(0.045, 0.83, 0.34)


def belly_fringe():
    """Shaggy tufts hanging along the underline, from the chest to the flank."""
    spikes, mats = [], []
    for y, drop, back in ((-0.42, 0.1, 0.05), (-0.28, 0.11, 0.07), (-0.12, 0.09, 0.07), (0.05, 0.07, 0.06)):
        ring = ring8(*body_row(y))
        for i in (5, 6):  # the bottom facet and the one beside it, either side of the keel
            a, b = ring[i], ring[(i + 1) % 8]
            mid = (a + b) / 2
            base = [a + V(0, -0.03, 0), b + V(0, -0.03, 0), mid + V(0, 0.04, 0.01)]
            out = V(mid.x, 0, 0) * 0.6
            spikes.append((base, mid + out + V(0, back, -drop)))
            mats.append(1 if y < -0.3 else 0)
    tufts('warg-fringe', spikes, [M['fur'], M['pale_fur']], mats)


def warg_tail(tail=None):
    """Bushy, dark at the tip: as Sharku's warg carries it, streaming out stiff behind and down, or
    along `tail`, (points, radii, tip), as a wild one hangs it."""
    points, radii, tip = tail or (TAIL, TAIL_RADII, TAIL_TIP)
    shaggy_tube('warg-tail', points, radii, [M['fur'], M['dark_fur']], [0, 0, 1], n=6, rough=0.15, end=tip)


# The saddle-cloth, in the team colour --------------------------------------------------------------

CLOTH_GAP = 0.016  # how far the cloth stands off the fur


def saddle_cloth():
    """A ragged cloth over the warg's back under him, from its withers to its loins, hanging down
    its flanks in points."""
    rows = []
    for y, drop in ((-0.34, 0.1), (-0.17, 0.09), (0.03, 0.1), (0.24, 0.08)):
        ring = ring8(*body_row(y), grow=CLOTH_GAP)
        across = [ring[i] for i in (7, 0, 1, 2, 3, 4)]
        left, right = across[0], across[-1]
        rows.append([left - V(0, 0, drop)] + across + [right - V(0, 0, drop)])
    verts, faces, _ = loft(rows, closed=False)
    # Dags hang from the hem between each pair of rows on each side, and from the back edge.
    width = len(rows[0])
    for r in range(len(rows) - 1):
        for i in (0, width - 1):
            a, b = r * width + i, (r + 1) * width + i
            verts.append((verts[a] + verts[b]) / 2 - V(0, 0, 0.08))
            faces.append((a, b, len(verts) - 1))
    last = (len(rows) - 1) * width
    for i in range(0, width - 1, 2):
        a, b = last + i, last + i + 1
        verts.append((verts[a] + verts[b]) / 2 + V(0, 0.07, -0.03))
        faces.append((a, b, len(verts) - 1))
    part('saddle-cloth', verts, faces, M['team'], inside=lambda c: V(0, c.y, 0.48))


@dataclass
class Warg:
    """Where the rider of a warg() goes, in the model's frame, as mounts.Horse is for a horse, and
    its bones for the rider's Rig, or a beast's on its own."""

    seat: Vector  # the top of the cloth in the middle of its back at SEAT_Y, where a rider sits
    knot: Vector  # where a rein is tied to what it wears round its throat
    turn: float  # degrees its head is turned to its left
    rig: object  # its bones (rig.Mount)


# The warg's bones besides its legs': the body turns about the middle of its barrel, under him, the
# neck about its root in the shoulders, the head at the back of the skull and the jaw at its hinge.
# Its forelegs bend back at the elbow and its hind legs forward at the stifle.
WARG_BONES = {
    'mount_body': ('root', 'mount_middle', 'mount_breast'),
    'mount_neck': ('mount_body', 'mount_neck_root', 'mount_poll'),
    'mount_head': ('mount_neck', 'mount_poll', 'mount_nose'),
    'mount_jaw': ('mount_head', 'mount_hinge', 'mount_chin'),
    'mount_tail': ('mount_body', 'mount_dock', 'mount_tail_end'),
}
WARG_BENDS = {'fore_l': V(0, 1, 0), 'fore_r': V(0, 1, 0), 'hind_l': V(0, -1, 0), 'hind_r': V(0, -1, 0)}
SEAT_Y = 0.03  # where a rider sits, behind the withers


def warg(materials, turn=TURN, lower=0.0, neck=None, tail=None, back=None):
    """Builds a warg, its parts on its own bones, and returns where its rider goes and its bones.

    `materials` are its colours by name (fur, pale_fur, dark_fur, glare for its eyes, eyes for the
    dark of its mouth, bone for its fangs and team), as its script makes them. `turn` is how many
    degrees its head turns to its left and `lower` how many its neck bends down, carrying the head
    low (placed()). `neck` makes what it wears round its neck, in place of Sharku's rag (collar()),
    and returns where on it, before the head turns, a rein would be tied; `tail` is (points, radii,
    tip) for its tail (warg_tail()); and `back` makes what lies on its back, on mount_body, in place
    of the saddle-cloth (saddle_cloth()). With every option left as it is, it is Sharku's warg."""
    M.clear()
    M.update(materials)
    with bone('mount_body'):
        warg_body()
    before = set(bpy.context.scene.objects)
    with bone('mount_neck'):
        warg_neck()
    with bone('mount_head'):
        warg_head()
    with bone('mount_neck'):
        hackles()
        ruff()
        knot = (neck or collar)()
    joint('mount_neck_root', V(0, -0.34, 0.5))
    joint('mount_poll', SKULL_BACK)
    joint('mount_nose', NOSE)
    for obj in new_objects(before):
        for v in obj.data.vertices:
            v.co = placed(v.co, turn, lower)
    chains = warg_legs()
    with bone('mount_body'):
        belly_fringe()
    with bone('mount_tail'):
        warg_tail(tail)
    with bone('mount_body'):
        (back or saddle_cloth)()
    joint('mount_middle', V(0, 0.0, 0.48))
    joint('mount_breast', BREAST)
    joint('mount_dock', (tail or (TAIL,))[0][0])
    joint('mount_tail_end', tail[2] if tail else TAIL_TIP)
    top = ring8(*body_row(SEAT_Y), grow=CLOTH_GAP)
    return Warg(seat=(top[1] + top[2]) / 2, knot=placed(knot, turn, lower), turn=turn,
                rig=mount_rig(chains, bones=WARG_BONES, bends=WARG_BENDS))
