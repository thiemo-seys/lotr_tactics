"""Sharku, an Orc wolf-rider: a Rider on a warg, in the Faceted style (docs/viewer-spec.md section 4).

Built like Gimli (gimli.py), the reference, and of Gorbag's family (gorbag.py), which sets the Orcs'
look: the same sallow olive skin, big pointed ears, heavy tusked jaw and crude iron and leather.
What sets him apart from the other Orcs, who all go on foot, is his mount, one of the great evil
wolves the Orcs ride in packs, built here by warg() as its own mount rather than the shared horse.
The warg is big, rangy and shaggy, grizzled grey-brown, low and long, its back about 0.6 off the
ground and nose to tail inside the hex: a heavy head thrust out and turned to its left, so that it
shows past him, with its jaws open on bone fangs, pale eyes and its ears pinned back; its hackles up
in a dark crest from its skull to its withers, a ruff round its neck, a shaggy underline and a bushy,
dark-tipped tail carried out stiff behind; its forelegs braced and its hind legs gathered under it,
ready to spring. On it Sharku crouches forward and out to his right under a pointed iron cap, a
rein in his left fist and a broad curved blade raised in his right. The team colour is his ragged
cloak, the warg's ragged saddle-cloth and the rag knotted round its throat, seen from in front, from
behind and from above; the cap, his ears and the blade show above it, and the warg's tail and
quarters below it.

    blender --background --factory-startup --python-exit-code 1 --python sharku.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys
from dataclasses import dataclass
from itertools import pairwise

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOTS,
    CLOTH,
    EYES,
    LEATHER,
    MOUNTED_BUDGET,
    STEEL,
    V,
    box,
    cone,
    ellipse,
    finish,
    loft,
    material,
    nearest_on_polyline,
    on_surface,
    part,
    path_rings,
    reset,
    segment,
    team_material,
    tube,
    wind,
)

# Sharku's own colours (sRGB); the rest come from the kit.
SKIN = 0x7E7A5A  # sallow, olive-grey, as Gorbag's
HAIR = 0x25201C  # coarse and black
IRON = 0x5D6166  # crude, blackened iron
BONE = 0xD5CAA8  # his tusks and the warg's fangs
FUR = 0x766F63  # the warg's coat, grizzled grey-brown
DARK_FUR = 0x3A3531  # its hackles, the line of its back and the tip of its tail
PALE_FUR = 0xA69D8A  # its throat, jaw and belly
GLARE = 0xC4AA62  # its pale amber eyes

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.95),
        iron=material('iron', IRON, roughness=0.6, metallic=0.1),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        cloth=material('cloth', CLOTH, roughness=0.9),
        bone=material('bone', BONE, roughness=0.7),
        eyes=material('eyes', EYES, roughness=0.6),
        fur=material('fur', FUR, roughness=0.95),
        dark_fur=material('dark-fur', DARK_FUR, roughness=0.95),
        pale_fur=material('pale-fur', PALE_FUR, roughness=0.95),
        glare=material('warg-eyes', GLARE, roughness=0.5),
    )


# Helpers -----------------------------------------------------------------------------------------


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


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
    jaw = part('warg-jaw', verts, faces, [M['pale_fur'], M['eyes']], face_mats)
    jaw.data.transform(OPEN)

    # Fangs: two long ones down from the upper jaw and two up from the lower.
    spikes = []
    for s in (-1, 1):
        base = lip(0.82, s) - 0.016 * s * SIDE + 0.016 * UP
        spikes.append(([base + 0.024 * FORE, base - 0.016 * FORE + 0.012 * s * SIDE,
                        base - 0.016 * FORE - 0.014 * s * SIDE], base - 0.11 * UP + 0.015 * FORE))
        t, top, half = 0.88, -0.045, 0.066
        low = hp(t, top - 0.016, s * (half - 0.016))
        base = [low + 0.018 * FORE, low - 0.014 * FORE + 0.012 * s * SIDE,
                low - 0.014 * FORE - 0.014 * s * SIDE]
        spikes.append(([OPEN @ p for p in base], OPEN @ (low + 0.09 * UP)))
    tufts('warg-fangs', spikes, M['bone'])

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


# The head turns to the warg's left, away from his blade, so that it shows its open jaws in profile
# from in front and past his shoulder from behind. The neck bends between TURN_FROM and TURN_TO (y);
# in front of that the head turns whole.
TURN = 34
TURN_FROM, TURN_TO = -0.3, -0.58


def turned(p, turn=TURN):
    """A point of the neck or head, placed as if the warg looked straight ahead, turned with them."""
    p = Vector(p)
    f = min(max((TURN_FROM - p.y) / (TURN_FROM - TURN_TO), 0.0), 1.0)
    a = math.radians(turn) * f
    x, y = p.x, p.y - TURN_FROM
    return V(x * math.cos(a) - y * math.sin(a), TURN_FROM + x * math.sin(a) + y * math.cos(a), p.z)


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
    spikes = []
    for name, joints, radii, x, ahead in LEGS:
        s = 1 if x > 0 else -1
        points = [V(x + s * j.x, j.y + ahead, j.z) for j in joints]
        shaggy_tube(f'warg-{name}', points, radii, M['fur'], n=5, phase=90, side=SIDE)
        if name.startswith('hind'):
            # Shaggy breeches down the back of the thigh.
            hip, stifle = points[0], points[1]
            for f, length in ((0.3, 0.13), (0.7, 0.11)):
                c = hip.lerp(stifle, f) + V(s * 0.03, 0.07, 0)
                base = [c + V(s * 0.03, -0.03, 0.04), c + V(-s * 0.02, -0.03, 0.04), c + V(0, -0.02, -0.05)]
                spikes.append((base, c + V(s * 0.04, length, -0.05)))
        else:
            # Feathering down the back of the foreleg.
            c = points[1] + V(s * 0.01, 0.04, 0.02)
            base = [c + V(s * 0.03, -0.03, 0.05), c + V(-s * 0.025, -0.03, 0.05), c + V(0, -0.02, -0.04)]
            spikes.append((base, c + V(s * 0.02, 0.08, -0.1)))
        foot = points[-1]
        axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
        box(f'warg-paw-{name}', V(foot.x, foot.y - 0.035, 0.032), axes, (0.075, 0.056, 0.032), M['fur'], 0.7)
    tufts('warg-feathering', spikes, M['fur'])


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


def warg_tail():
    # Bushy, streaming out behind and down, dark at the tip.
    shaggy_tube('warg-tail', TAIL, TAIL_RADII, [M['fur'], M['dark_fur']], [0, 0, 1], n=6, rough=0.15,
                end=TAIL_TIP)


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
    """Where the rider of a warg() goes, in the model's frame, as mounts.Horse is for a horse."""

    seat: Vector  # the top of the cloth in the middle of its back at SEAT_Y, where he sits
    knot: Vector  # where his rein is tied to the rag round its throat
    turn: float  # degrees its head is turned to its left


def warg():
    """Builds the warg, with its saddle-cloth, and returns where its rider goes."""
    warg_body()
    before = set(bpy.context.scene.objects)
    warg_neck()
    warg_head()
    hackles()
    ruff()
    knot = collar()
    for obj in new_objects(before):
        for v in obj.data.vertices:
            v.co = turned(v.co)
    warg_legs()
    belly_fringe()
    warg_tail()
    saddle_cloth()
    top = ring8(*body_row(SEAT_Y), grow=CLOTH_GAP)
    return Warg(seat=(top[1] + top[2]) / 2, knot=turned(knot), turn=TURN)


# The rider -----------------------------------------------------------------------------------------
#
# Built upright astride the warg and then bent by hunched(): he leans forward about his hips, and
# above the small of his back his spine curls further, so his shoulders round over the warg's neck
# and his head comes out of the front of them.

SEAT_Y = 0.03  # where he sits, behind the withers
PIVOT = V(0, 0.05, 0.68)  # his hips
LEAN = 26  # degrees the body above the hips leans forward
MID = V(0, 0.06, 0.84)  # the small of his back
CURL = 20  # further degrees his shoulders curl forward over it
CURL_SPAN = 0.2  # the height over which the curl comes in
ROLL = -12  # degrees he leans out to his right, his blade side, clear of the warg's head


def hunched(p):
    """Where a point of the upright body is once he leans and curls forward and out to his right."""
    p = Vector(p)
    t = min(max((p.z - MID.z) / CURL_SPAN, 0.0), 1.0)
    if t > 0:
        p = MID + Matrix.Rotation(math.radians(CURL * t), 3, 'X') @ (p - MID)
    p = PIVOT + Matrix.Rotation(math.radians(LEAN), 3, 'X') @ (p - PIVOT)
    return PIVOT + Matrix.Rotation(math.radians(ROLL), 3, 'Y') @ (p - PIVOT)


def hunch(objects):
    for obj in objects:
        for v in obj.data.vertices:
            v.co = hunched(v.co)


# A barrel of octagons, built upright: z, half-width, half-depth and centre y. He sits on the cloth,
# whose top is at about 0.63 under him.
TORSO = [
    (0.63, 0.14, 0.115, 0.05),  # in the saddle, round the hips
    (0.71, 0.15, 0.12, 0.05),  # belt, lower edge
    (0.77, 0.155, 0.125, 0.05),  # belt, upper edge
    (0.90, 0.2, 0.145, 0.05),  # chest
    (1.02, 0.21, 0.14, 0.07),  # shoulders
    (1.10, 0.11, 0.10, 0.04),  # neck
]
TORSO_BANDS = [0, 1, 2, 2, 2]  # breeches, belt, leather jerkin


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    faces = wind(verts, faces, inside=lambda c: V(0, 0.05, min(max(c.z, 0.66), 1.06)))
    top = tuple(range(len(verts) - 8, len(verts)))  # the top of the neck
    faces += wind(verts, [top], outward=V(0, 0, 1))
    face_mats.append(3)
    part('torso', verts, faces, [M['cloth'], M['boots'], M['leather'], M['skin']], face_mats)


def cloak():
    # A ragged cloak round his neck and over his shoulders, as Gorbag's cowl: eight points from his
    # left (+X), the collar rising behind his neck and dipping in front; rags hang from the hem,
    # longest down his back, where they stream out behind him.
    collar_z = [1.12, 1.16, 1.18, 1.16, 1.12, 1.07, 1.05, 1.07]
    collar = ellipse(0, 0.04, 0, 0.135, 0.125, 8, 0, collar_z)
    dome = ellipse(0, 0.06, 0, 0.225, 0.175, 8, 0, [z - 0.06 for z in collar_z])
    shoulder_z = [1.02, 1.0, 0.98, 1.0, 1.02, 1.01, 1.0, 1.01]
    shoulder = ellipse(0, 0.07, 0, 0.25, 0.19, 8, 0, shoulder_z)
    hem_drop = [0.05, 0.08, 0.09, 0.08, 0.05, 0.07, 0.09, 0.07]
    hem = ellipse(0, 0.07, 0, 0.245, 0.195, 8, 0, [z - d for z, d in zip(shoulder_z, hem_drop)])
    verts, faces, _ = loft([hem, shoulder, dome, collar])
    drops = [0.1, 0.15, 0.17, 0.15, 0.1, 0.17, 0.2, 0.16]
    for i in range(8):
        a, b = hem[i], hem[(i + 1) % 8]
        mid = (a + b) / 2
        out = V(mid.x, mid.y - 0.07, 0).normalized()
        verts.append(mid + 0.02 * out - V(0, 0, drops[i]))
        faces.append((i, (i + 1) % 8, len(verts) - 1))
    part('cloak', verts, faces, M['team'], inside=lambda c: V(0, 0.06, min(c.z, 1.0) - 0.1))


# Head: Gorbag's, under a pointed iron cap ------------------------------------------------------------

HEAD_SCALE = 1.1  # the head is drawn big, as Gimli's is, so it reads at game size

# The skull in rings from under the jaw to the temples: the height of each above the head's origin,
# then the left half of it as (x, y): the side, the back corner, the back, the front corner and the
# front. As Gorbag's.
SKULL = [
    (0.0, (0.132, -0.03), (0.08, 0.055), 0.07, (0.116, -0.158), -0.2),  # under the jaw, jutting
    (0.075, (0.15, -0.005), (0.105, 0.09), 0.115, (0.128, -0.15), -0.182),  # the mouth
    (0.165, (0.142, 0.005), (0.11, 0.105), 0.135, (0.118, -0.115), -0.152),  # cheekbones and eyes
    (0.245, (0.118, 0.015), (0.092, 0.105), 0.13, (0.088, -0.08), -0.1),  # brow and temples
]


def head_origin():
    """The middle of the underside of his jaw, out in front of his hunched neck."""
    return hunched(V(0, 0.0, 1.1)) + V(0, -0.07, -0.05)


def head():
    origin = head_origin()

    def h(x, y, z):
        return origin + HEAD_SCALE * V(x, y, z)

    rings = []
    for z, side, corner, back, front_corner, front in SKULL:
        ring = [side, corner, (0, back), (-corner[0], corner[1]), (-side[0], side[1]),
                (-front_corner[0], front_corner[1]), (0, front), front_corner]
        rings.append([h(x, y, z) for x, y in ring])
    verts, faces, bands = loft(rings)
    # Olive skin, with a mane of coarse black hair round the back under the cap.
    face_mats = [1 if b > 0 and i % 8 < 4 else 0 for i, b in enumerate(bands)]
    faces.append(tuple(range(8)))  # under the jaw
    face_mats.append(0)
    part('skull', verts, faces, [M['skin'], M['hair']], face_mats, inside=h(0, -0.03, 0.14))

    def front(band):
        tris = []
        for i in (4, 5, 6, 7):
            a, b = rings[band][i], rings[band][(i + 1) % 8]
            c, d = rings[band + 1][(i + 1) % 8], rings[band + 1][i]
            tris += [(a, b, c), (a, c, d)]
        return tris

    face, jaw = front(1), front(0)

    def on(tris, x, z, lift):
        p = h(x, 0, z)
        return V(p.x, on_surface(tris, p.x, p.z) - lift, p.z)

    # Slanted eyes under the brow.
    for s in (-1, 1):
        corners = [on(face, x, z, 0.006) for x, z in ((s * 0.03, 0.127), (s * 0.1, 0.152), (s * 0.07, 0.116))]
        part(f'eye-{s}', corners, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A heavy shelf of brow under the rim of the cap, dipping in the middle in a scowl.
    sections = [
        [h(-0.118, -0.05, 0.2), h(-0.118, -0.125, 0.183), h(-0.118, -0.07, 0.158)],
        [h(0, -0.13, 0.195), h(0, -0.2, 0.165), h(0, -0.155, 0.14)],
        [h(0.118, -0.05, 0.2), h(0.118, -0.125, 0.183), h(0.118, -0.07, 0.158)],
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brow', verts, faces, M['skin'], inside=h(0, -0.09, 0.17))

    # A flat, broad nose.
    verts = [h(0, -0.156, 0.138), h(0, -0.218, 0.095), h(0.046, -0.165, 0.086), h(-0.046, -0.165, 0.086),
             h(0, -0.178, 0.076)]
    part('nose', verts, [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)], M['skin'], inside=h(0, -0.14, 0.1))

    # A wide mouth, open in a snarl.
    outline = [(0.096, 0.045), (0.04, 0.068), (-0.04, 0.068), (-0.096, 0.045), (-0.04, 0.03), (0.04, 0.03)]
    verts = [on(jaw, x, z, 0.005) for x, z in outline]
    part('mouth', verts, [(0, 1, 5), (1, 2, 4, 5), (2, 3, 4)], M['eyes'], outward=V(0, -1, 0))

    # Tusks from the lower jaw, up past the lip.
    for s in (-1, 1):
        x = s * 0.085
        base = on(jaw, x, 0.03, 0.0)
        y = (base.y - origin.y) / HEAD_SCALE
        verts = [h(x - 0.028, y + 0.008, 0.018), h(x + 0.028, y + 0.008, 0.018), h(x, y + 0.04, 0.014),
                 h(x + s * 0.035, y - 0.05, 0.16)]
        part(f'tusk-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['bone'], inside=h(x, y + 0.01, 0.05))

    # Big pointed ears out under the cap, swept back by the wind of his riding.
    for s in (-1, 1):
        verts = [h(s * 0.128, -0.035, 0.11), h(s * 0.122, 0.07, 0.13), h(s * 0.115, 0.02, 0.2),
                 h(s * 0.32, 0.17, 0.26)]
        part(f'ear-{s}', verts, [(0, 2, 3), (2, 1, 3), (1, 0, 3)], M['skin'], inside=h(s * 0.1, 0.02, 0.15))

    # A pointed cap of crude iron: a band round his brow and eight facets up to a point.
    profile = [(0.175, 0.165), (0.225, 0.165), (0.23, 0.15), (0.3, 0.115)]
    rings = [[h(p.x, p.y + 0.015, z) for p in ellipse(0, 0, 0, r, r, 8, 22.5)] for z, r in profile]
    verts, faces, _ = loft(rings)
    verts.append(h(0, 0.03, 0.42))
    last = (len(profile) - 1) * 8
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    part('cap', verts, faces, M['iron'], inside=h(0, 0.015, 0.25))


# Arms ------------------------------------------------------------------------------------------------

UPPER_ARM, FOREARM = 0.27, 0.28  # long arms, as orcs have


def arm(side, shoulder, fist, pole, fist_up):
    """An arm from the shoulder to a fist at `fist`, its elbow bent towards `pole`."""
    reach = (fist - shoulder).normalized()
    elbow = bend(shoulder, fist - 0.05 * reach, UPPER_ARM, FOREARM, pole)
    wrist = fist - 0.05 * (fist - elbow).normalized()
    tube(f'upper-arm-{side}', shoulder, elbow, [(-0.1, 0.07), (1.08, 0.058)], M['skin'])
    tube(f'forearm-{side}', elbow, wrist, [(-0.12, 0.056), (0.4, 0.064), (1.0, 0.058)],
         [M['skin'], M['iron']], [0, 1])
    ahead = (fist - elbow).normalized()
    up = (Vector(fist_up) - Vector(fist_up).dot(ahead) * ahead).normalized()
    box(f'fist-{side}', fist, [ahead, up, ahead.cross(up)], (0.046, 0.05, 0.05), M['skin'], 0.85)


# The blade, raised in his right fist: broad, single-edged and curved back towards a clipped point.
BLADE_FIST = V(-0.4, -0.2, 1.15)
BLADE_UP = V(-0.2, 0.05, 1.0).normalized()  # up the blade from the fist, leaning out to his right
BLADE_EDGE = V(-1.0, -0.3, 0.0)  # the way the edge faces: out to his right and a little forward


def blade():
    along = BLADE_UP
    edge = (BLADE_EDGE - BLADE_EDGE.dot(along) * along).normalized()
    flat = along.cross(edge)
    # Stations up the blade: how far from the fist, how far the middle bows back, its width and the
    # thickness of its back.
    stations = [(0.07, 0.0, 0.052, 0.012), (0.2, -0.012, 0.064, 0.011), (0.33, -0.035, 0.08, 0.01),
                (0.45, -0.07, 0.094, 0.008)]
    rings = []
    for d, bow, width, thick in stations:
        c = BLADE_FIST + d * along + bow * edge
        rings.append([c + 0.5 * width * edge, c - 0.5 * width * edge + thick * flat,
                      c - 0.5 * width * edge - thick * flat])
    verts, faces, _ = loft(rings)
    point = BLADE_FIST + 0.57 * along - 0.13 * edge
    verts.append(point)
    last = (len(rings) - 1) * 3
    faces += [(last + i, last + (i + 1) % 3, len(verts) - 1) for i in range(3)]
    faces.append((0, 1, 2))
    axis = [BLADE_FIST + d * along + bow * edge for d, bow, _, _ in stations] + [point]
    part('blade', verts, faces, M['steel'], inside=nearest_on_polyline(axis))
    # An iron guard across the foot of the blade, and a pommel under his fist.
    box('guard', BLADE_FIST + 0.06 * along, [along, edge, flat], (0.012, 0.055, 0.022), M['iron'])
    cone('pommel', BLADE_FIST - 0.05 * along, BLADE_FIST - 0.1 * along, 0.03, M['iron'], n=4)


REIN_FIST = V(0.1, -0.33, 0.76)  # his left fist, low over the warg's withers


def arms(mount):
    left, right = hunched(V(0.2, 0.07, 0.99)), hunched(V(-0.2, 0.07, 0.99))
    # The blade arm raised, the elbow out to his right and down.
    arm('right', right, BLADE_FIST, right + V(-0.3, 0.1, -0.15), BLADE_UP)
    # The rein hand low over the warg's withers, the elbow out to his left.
    arm('left', left, REIN_FIST, left + V(0.3, 0.1, -0.2), V(0, -0.3, 1))
    # The rein, a leather strap from his fist over the ruff to the rag round the warg's throat.
    width = V(0, 0, 0.013)
    path = [REIN_FIST + V(0, -0.04, 0), (REIN_FIST + mount.knot) / 2 + V(0, 0, 0.03), mount.knot]
    verts = [p + width for p in path] + [p - width for p in path]
    part('rein', verts, [(0, 1, 4, 3), (1, 2, 5, 4)], M['leather'], outward=V(1, 0, 0))


# Legs astride the warg: thighs forward and down over its flanks, knees gripping, feet tucked back.
HIP, KNEE, ANKLE = V(0.1, 0.05, 0.68), V(0.285, -0.12, 0.52), V(0.26, 0.05, 0.36)


def legs():
    for s in (-1, 1):
        flip = V(s, 1, 1)
        hip, knee, ankle = (Vector(p * flip) for p in (HIP, KNEE, ANKLE))
        tube(f'thigh-{s}', hip, knee, [(-0.1, 0.08), (1.1, 0.064)], M['cloth'])
        tube(f'shin-{s}', knee, ankle, [(-0.1, 0.058), (1.15, 0.05)], M['skin'])
        axes = [V(s * 0.1, -1, -0.35), V(1, 0, 0), V(0, 0, 1)]
        box(f'foot-{s}', ankle + V(0, -0.05, -0.03), axes, (0.085, 0.045, 0.042), M['boots'], 0.75)
        # A crude iron cop over the knee, which hides the joint.
        out = V(s * 0.6, -1, 0.1).normalized()
        base = segment(knee, knee + out, [(0, 0.06)], 4, 45)[0]
        part(f'knee-{s}', base + [knee + 0.085 * out], [(i, (i + 1) % 4, 4) for i in range(4)], M['iron'],
             inside=knee)


def main():
    reset()
    make_materials()
    mount = warg()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    cloak()
    hunch(new_objects(before))
    head()
    blade()
    arms(mount)
    finish('sharku', budget=MOUNTED_BUDGET)


main()
