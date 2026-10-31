"""Legolas, the Elf: an Archer of the Fellowship, in the Faceted style (docs/viewer-spec.md section 4).

Tall and slim beside the Dwarf: 1.48 to the crown, shoulders about 0.42 across, long legs and a narrow
waist, long straight dark hair and a smooth, beardless face with pointed ears. Clad in green and brown,
as the books have him, with a long bow of the Galadhrim held out in his left hand, an arrow nocked and
half drawn, and a quiver on his back. The team colour is his short Lórien cloak and the baldric across
his chest.

    blender --background --factory-startup --python-exit-code 1 --python legolas.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
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
    LEATHER,
    STEEL,
    V,
    box,
    finish,
    frame,
    loft,
    material,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    tube,
)

# Legolas's own colours (sRGB); the rest come from the kit.
HAIR = 0x3B2C22  # dark brown
SKIN = 0xE4C1A2  # fair
TUNIC = 0x5A6943  # forest green
LEGGINGS = 0x6D5841  # brown
BOW = 0xB28C5C  # the pale wood of a bow of the Galadhrim, and the arrows
FEATHER = 0xDCD6C8  # grey-white fletching, and the bowstring

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.75),
        tunic=material('tunic', TUNIC, roughness=0.9),
        leggings=material('leggings', LEGGINGS, roughness=0.9),
        boots=material('boots', BOOTS, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        wood=material('wood', BOW, roughness=0.7),
        feather=material('feather', FEATHER, roughness=0.9),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        eyes=material('eyes', EYES, roughness=0.6),
    )


# Pose ------------------------------------------------------------------------------------------
#
# An archer's open stance. The arrow points AIM_YAW degrees to his left rather than straight ahead: a
# bow drawn straight at the target is edge-on to a camera in front or behind and reads as a stick, and
# turned this far it shows its curve to the game's camera from both sides.

TORSO_YAW = -20  # degrees his body above the hips turns to his right, the bow shoulder forward
HIPS_YAW = -10
HEAD_YAW = 25  # degrees his head turns to his left, along the arrow
AIM_YAW = 50  # degrees to his left of straight ahead that the arrow points
CANT = 8  # degrees the bow's top tips towards his right


def yaw(degrees):
    return Matrix.Rotation(math.radians(degrees), 3, 'Z')


def turned(point, degrees):
    """A point turned about the vertical axis through the origin; positive turns it to his left."""
    return yaw(degrees) @ Vector(point)


def turn(objects, degrees):
    m = yaw(degrees).to_4x4()
    for obj in objects:
        obj.data.transform(m)


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


def nearest_on_path(points):
    """A function giving the point on the polyline through `points` nearest to a point: the inside of
    a bent form such as a bow's stave, to wind its faces."""
    points = [Vector(p) for p in points]

    def nearest(c):
        best = None
        for a, b in zip(points, points[1:]):
            t = max(0.0, min(1.0, (c - a).dot(b - a) / (b - a).length_squared))
            p = a + t * (b - a)
            if best is None or (c - p).length < (c - best).length:
                best = p
        return best

    return nearest


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


# Legs --------------------------------------------------------------------------------------------

HIP_Z = 0.73
THIGH, SHIN = 0.335, 0.33
# Feet apart, the left towards the shot and forward, the right back and turned out.
LEGS = {  # hip joint (in the hips' frame), ankle, the foot's yaw
    'right': (V(-0.075, 0.0, HIP_Z), V(-0.125, 0.11, 0.085), -30),
    'left': (V(0.075, 0.0, HIP_Z), V(0.13, -0.09, 0.085), 12),
}

# The boot from the sole up, in the foot's own frame (toes towards -y): the height of each ring and the
# right half of it, side, heel and toe, mirrored by boot(). Long and narrow, to a pointed toe.
BOOT_RINGS = [
    (0.0, [(0.056, -0.01), (0.046, 0.072), (0.022, -0.162)]),  # the sole
    (0.055, [(0.056, 0.0), (0.048, 0.072), (0.02, -0.114)]),  # the instep slopes back from the toe
    (0.13, [(0.049, 0.006), (0.044, 0.056), (0.035, -0.038)]),  # round the ankle
]


def boot(name, ankle, foot_yaw):
    facing = yaw(foot_yaw)
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + facing @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['boots'], inside=at + V(0, 0, 0.07))


def legs():
    for side, (hip, ankle, foot_yaw) in LEGS.items():
        hip = turned(hip, HIPS_YAW)
        ahead = turned(V(0, -1, 0), foot_yaw)
        knee = bend(hip, ankle, THIGH, SHIN, (hip + ankle) / 2 + 0.3 * ahead)
        tube(f'thigh-{side}', hip + V(0, 0, 0.05), knee, [(0, 0.082), (1, 0.062)], M['leggings'])
        # Leggings to below the knee, then the tall soft boot.
        shin = [(-0.06, 0.062), (0.4, 0.055), (1.0, 0.046)]
        tube(f'shin-{side}', knee, ankle, shin, [M['leggings'], M['boots']], [0, 1])
        boot(f'boot-{side}', ankle, foot_yaw)


# Body, in the torso's frame: facing -Y, turned into the pose by TORSO_YAW ---------------------------

# The tunic as a column of octagons: z, half-width, half-depth and centre y. The belt is the band
# between the third and fourth rings.
TORSO = [
    (0.555, 0.178, 0.135, 0.012),  # the hem, flared over the thighs
    (0.72, 0.14, 0.1, 0.0),  # hips
    (0.785, 0.125, 0.09, 0.0),  # belt, lower edge
    (0.835, 0.12, 0.087, 0.0),  # belt, upper edge: the narrow waist
    (0.975, 0.162, 0.108, -0.006),  # chest
    (1.07, 0.172, 0.097, 0.004),  # shoulders
    (1.135, 0.062, 0.056, 0.008),  # neck
]
TORSO_BANDS = [0, 0, 1, 0, 0, 0]  # tunic, except the belt


def torso():
    rings = [[V(rx * math.cos(a), cy + ry * math.sin(a), z) for a in OCTAGON] for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    part('torso', verts, faces, [M['tunic'], M['leather']], [TORSO_BANDS[b] for b in bands],
         inside=lambda c: V(0, 0, c.z))


OCTAGON = [math.radians(22.5 + 45 * i) for i in range(8)]


def torso_point(degrees, z, out=0.0):
    """The point on the torso's surface at a corner of its octagons (22.5 + 45k degrees from +X) and
    height z, pushed out by `out`."""
    for (z0, rx0, ry0, cy0), (z1, rx1, ry1, cy1) in zip(TORSO, TORSO[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            rx, ry, cy = rx0 + t * (rx1 - rx0), ry0 + t * (ry1 - ry0), cy0 + t * (cy1 - cy0)
            a = math.radians(degrees)
            normal = V(math.cos(a) / rx, math.sin(a) / ry, 0).normalized()
            return V(rx * math.cos(a), cy + ry * math.sin(a), z) + out * normal
    raise ValueError(f'no torso at {z}')


def baldric():
    # The quiver's strap, in the team colour: from under the cloak at his right shoulder, across his
    # chest to his left hip and round to the quiver's foot at his back.
    path = [(202.5, 1.03), (247.5, 0.985), (292.5, 0.905), (337.5, 0.835), (22.5, 0.79), (67.5, 0.765)]
    rows = [[torso_point(a, z + dz, 0.008) for a, z in path] for dz in (-0.034, 0.034)]
    verts, faces, _ = loft(rows, closed=False)
    part('baldric', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z))


CLOAK_SPAN = 296.0, 604.0  # degrees from +X: from the front of his left shoulder round his back to his right


def arc(rx, ry, cy, heights, fold=0.0, n=11):
    """n points round the cloak across CLOAK_SPAN, at heights interpolated from (degrees from the
    middle of his back, z); every other one pushed out by `fold`, for the folds."""
    start, end = CLOAK_SPAN
    points = []
    for i in range(n):
        a = start + (end - start) * i / (n - 1)
        d = abs(a - 450.0)
        for (d0, z0), (d1, z1) in zip(heights, heights[1:]):
            if d0 <= d <= d1:
                z = z0 + (z1 - z0) * (d - d0) / (d1 - d0)
        f = 1 + (fold / ry if i % 2 else 0.0)
        r = math.radians(a)
        points.append(V(f * rx * math.cos(r), cy + f * ry * math.sin(r), z))
    return points


def cloak():
    # A short Lórien cloak, open at the front: over his shoulders and down to his thighs, its edges
    # either side of the baldric, with his hair and the quiver over it at the back and the bow beside
    # it.
    rings = [
        arc(0.084, 0.076, 0.012, [(0, 1.185), (160, 1.14)]),  # a collar round the neck
        arc(0.21, 0.126, 0.008, [(0, 1.09), (160, 1.07)]),  # over the shoulders
        arc(0.226, 0.15, 0.02, [(0, 0.9), (90, 0.92), (160, 0.9)], fold=0.014),
        arc(0.245, 0.17, 0.035, [(0, 0.585), (55, 0.62), (95, 0.67), (160, 0.65)], fold=0.03),  # the hem
    ]
    verts, faces, _ = loft(rings, closed=False)
    part('cloak', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z))


# The quiver hangs on his back from his left hip to behind his right shoulder.
QUIVER_FOOT, QUIVER_TOP = V(0.075, 0.232, 0.79), V(-0.115, 0.2, 1.19)


def quiver():
    foot, top = QUIVER_FOOT, QUIVER_TOP
    along = (top - foot).normalized()
    tube('quiver', foot, top, [(0, 0.048), (1, 0.06)], M['leather'], n=6)
    # A rounded foot, and a rim round the mouth.
    ring = segment(foot, top, [(0, 0.048)], 6)[0]
    verts = ring + [foot - 0.035 * along]
    part('quiver-foot', verts, [(i, (i + 1) % 6, 6) for i in range(6)], M['leather'], inside=foot)
    rim = segment(top - 0.05 * along, top + 0.008 * along, [(0, 0.066), (1, 0.066)], 6)
    verts, faces, _ = loft(rim)
    faces.append(tuple(range(6, 12)))
    part('quiver-rim', verts, faces, M['boots'], inside=top - 0.02 * along)
    # The fletching of five arrows standing out of the mouth, each two crossed vanes.
    across, other = frame(along)
    for k, (du, dv, lean) in enumerate([(0.03, 0.0, 0.14), (-0.026, 0.02, -0.12), (-0.008, -0.032, -0.02),
                                        (0.012, 0.034, 0.06), (0.0, 0.0, 0.0)]):
        base = top + du * across + dv * other - 0.01 * along
        up = (along + lean * across + 0.5 * lean * other).normalized()
        fletching(f'fletching-{k}', base, up, 0.135, 0.024)


def fletching(name, base, up, length, width):
    """Two crossed vanes of feather from `base` along `up`."""
    a, b = frame(up)
    verts, faces = [], []
    for w in (a, b):
        n = len(verts)
        middle = base + 0.35 * length * up
        verts += [base, middle + width * w, base + length * up, middle - width * w]
        faces.append((n, n + 1, n + 2, n + 3))
    part(name, verts, faces, M['feather'])


# Head, in its own frame: facing -Y, turned by HEAD_YAW ----------------------------------------------

# Hair over the crown, the sides and the back: rings of eight points (x, y, z) from his left (+X) round
# the back to his right and the front, set back where the face is. It hangs straight to the nape at
# the sides and back, behind the jaw.
HAIR_RINGS = [
    [(0.084, 0.022, 1.14), (0.07, 0.084, 1.14), (0.0, 0.108, 1.14), (-0.07, 0.084, 1.14),
     (-0.084, 0.022, 1.14), (-0.062, -0.035, 1.19), (0.0, -0.03, 1.19), (0.062, -0.035, 1.19)],  # the nape
    [(0.118, 0.0, 1.34), (0.094, 0.09, 1.34), (0.0, 0.124, 1.34), (-0.094, 0.09, 1.34),
     (-0.118, 0.0, 1.34), (-0.096, -0.078, 1.34), (0.0, -0.074, 1.34), (0.096, -0.078, 1.34)],  # the temples
    [(0.1, 0.006, 1.425), (0.078, 0.078, 1.425), (0.0, 0.104, 1.425), (-0.078, 0.078, 1.425),
     (-0.1, 0.006, 1.425), (-0.08, -0.086, 1.43), (0.0, -0.116, 1.438), (0.08, -0.086, 1.43)],  # the hairline
    [(0.062, 0.008, 1.468), (0.046, 0.05, 1.468), (0.0, 0.066, 1.468), (-0.046, 0.05, 1.468),
     (-0.062, 0.008, 1.468), (-0.046, -0.05, 1.47), (0.0, -0.066, 1.472), (0.046, -0.05, 1.47)],
]
CROWN = V(0, 0.004, 1.482)

# The face: the right half's corners (x < 0), mirrored, and the points down the middle.
BROW, CHEEKBONE = V(-0.09, -0.1, 1.376), V(-0.097, -0.085, 1.285)
JAW, CHEEK = V(-0.074, -0.034, 1.2), V(-0.042, -0.108, 1.222)
FOREHEAD, NOSE_ROOT, MOUTH, CHIN, UNDER_CHIN = (
    V(0, -0.113, 1.432), V(0, -0.132, 1.35), V(0, -0.128, 1.222), V(0, -0.118, 1.168), V(0, -0.055, 1.15))


def mirror(p):
    return V(-p.x, p.y, p.z)


def head():
    verts, faces, _ = loft([[V(*p) for p in ring] for ring in HAIR_RINGS])
    last = len(verts) - 8
    verts.append(CROWN)
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    part('hair', verts, faces, M['hair'], inside=V(0, 0.0, 1.3))

    # A narrow face of planes: forehead, eye sockets, high cheekbones, a pointed chin.
    verts = [FOREHEAD, NOSE_ROOT, MOUTH, CHIN, UNDER_CHIN]
    faces = []
    for s in (BROW, CHEEKBONE, JAW, CHEEK), tuple(mirror(p) for p in (BROW, CHEEKBONE, JAW, CHEEK)):
        b, c, j, k = range(len(verts), len(verts) + 4)
        verts += list(s)
        faces += [(0, b, 1), (1, b, c), (1, c, k), (1, k, 2), (c, j, k), (k, j, 3), (k, 3, 2), (j, 4, 3)]
    part('face', verts, faces, M['skin'], inside=V(0, 0.0, 1.3))
    sockets = {s: [(NOSE_ROOT, p(BROW), p(CHEEKBONE))] for s, p in ((-1, lambda q: q), (1, mirror))}

    # Almond eyes, a little tilted, laid just proud of the plane under the brow.
    for s in (-1, 1):
        corners = [(s * 0.022, 1.337), (s * 0.078, 1.35), (s * 0.05, 1.322)]
        verts = [V(x, on_surface(sockets[s], x, z) - 0.006, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A straight, narrow nose.
    top, tip, under = V(0, -0.135, 1.345), V(0, -0.162, 1.272), V(0, -0.13, 1.262)
    left, right = V(0.022, -0.126, 1.274), V(-0.022, -0.126, 1.274)
    verts = [top, tip, under, left, right]
    faces = [(0, 3, 1), (0, 1, 4), (3, 2, 1), (1, 2, 4)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.1, 1.3))

    # Fine dark brows, rising to the outside.
    for s in (-1, 1):
        verts = [V(s * 0.018, -0.139, 1.364), V(s * 0.088, -0.112, 1.392), V(s * 0.085, -0.104, 1.38),
                 V(s * 0.02, -0.132, 1.353)]
        part(f'brow-{s}', verts, [(0, 1, 2, 3)], M['hair'], outward=V(0, -1, 0.3))

    # Pointed ears through the hair, swept up and back.
    for s in (-1, 1):
        base = [V(s * 0.118, -0.03, 1.275), V(s * 0.12, 0.035, 1.3), V(s * 0.12, -0.012, 1.355)]
        tip = V(s * 0.17, 0.056, 1.43)
        verts = base + [tip]
        part(f'ear-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['skin'], inside=V(0, 0.01, 1.32))

    tube('neck', V(0, 0.01, 1.08), V(0, -0.004, 1.24), [(0, 0.05), (1, 0.046)], M['skin'])


def hair_tail():
    # Long straight hair from the back of his head down over the cloak to his shoulder blades. The top
    # turns with his head, the rest lies on his back, so it twists between them.
    top = [turned(V(0.112 * math.cos(math.radians(a)), 0.006 + 0.116 * math.sin(math.radians(a)), 1.3), HEAD_YAW)
           for a in (10, 50, 90, 130, 170)]
    shoulders = [turned(V(x, y, 1.12), TORSO_YAW) for x, y in
                 [(0.105, 0.108), (0.056, 0.14), (0.0, 0.15), (-0.056, 0.14), (-0.105, 0.108)]]
    ends = [turned(V(x, y, 0.98), TORSO_YAW) for x, y in
            [(0.078, 0.156), (0.04, 0.174), (0.0, 0.18), (-0.04, 0.174), (-0.078, 0.156)]]
    verts, faces, _ = loft([top, shoulders, ends], closed=False)
    verts.append(turned(V(0, 0.19, 0.9), TORSO_YAW))
    faces += [(10 + i, 11 + i, 15) for i in range(4)]
    part('hair-tail', verts, faces, M['hair'], inside=lambda c: V(0, 0, c.z))


# Arms, the bow and the arrow, placed in the pose ----------------------------------------------------

SHOULDER = V(0.165, 0.0, 1.075)  # his left shoulder joint in the torso's frame; the right mirrors it
UPPER_ARM, FOREARM = 0.265, 0.255
ANCHOR = V(0.04, -0.1, 1.1)  # below his chin, where a full draw would bring the string
REACH = 0.6  # from the anchor to the grip
DRAW = 0.38  # how far the string is drawn back from the grip: about half

AIM = V(math.sin(math.radians(AIM_YAW)), -math.cos(math.radians(AIM_YAW)), 0)
RIGHT_OF_AIM = V(AIM.y, -AIM.x, 0)
BOW_UP = math.cos(math.radians(CANT)) * V(0, 0, 1) + math.sin(math.radians(CANT)) * RIGHT_OF_AIM
GRIP = ANCHOR + REACH * AIM
REST = 0.04  # the arrow lies this far above the middle of the grip
NOCK = GRIP + REST * BOW_UP - DRAW * AIM

# The stave from the bottom tip to the top: (along the stave, back towards him, half-thickness).
# Drawn, its limbs bend back towards him.
STAVE = [
    (-0.64, 0.24, 0.0),
    (-0.56, 0.205, 0.021),
    (-0.38, 0.11, 0.027),
    (-0.1, 0.012, 0.031),
    (0.1, 0.012, 0.031),
    (0.38, 0.11, 0.027),
    (0.56, 0.205, 0.021),
    (0.64, 0.24, 0.0),
]
STAVE_BANDS = [0, 0, 0, 1, 0, 0, 0]  # wood, the grip wrapped in leather


def bow():
    side = AIM.cross(BOW_UP).normalized()  # across the bow's plane
    centres = [GRIP + u * BOW_UP - w * AIM for u, w, _ in STAVE]
    rings = []
    for k, (u, w, t) in enumerate(STAVE):
        if t == 0:
            continue
        ahead = (centres[k + 1] - centres[k - 1]).normalized()
        back = side.cross(ahead)  # in the bow's plane, across the stave
        c = centres[k]
        rings.append([c + t * back, c + 0.9 * t * side, c - t * back, c - 0.9 * t * side])
    verts, faces, bands = loft(rings)
    face_mats = [STAVE_BANDS[b + 1] for b in bands]
    for tip, ring_start in ((centres[0], 0), (centres[-1], 4 * (len(rings) - 1))):
        verts.append(tip)
        faces += [(ring_start + i, ring_start + (i + 1) % 4, len(verts) - 1) for i in range(4)]
        face_mats += [0] * 4
    part('bow', verts, faces, [M['wood'], M['leather']], face_mats, inside=nearest_on_path(centres))

    # The string, from tip to tip by way of the arrow's nock.
    top, bottom = centres[-1] - 0.025 * BOW_UP, centres[0] + 0.025 * BOW_UP
    for name, a, b in (('string-top', NOCK, top), ('string-bottom', NOCK, bottom)):
        tube(name, a, b, [(0, 0.006), (1, 0.006)], M['feather'], n=3)

    # The arrow: a shaft from the nock past the grip, a leaf-shaped steel head and grey fletching.
    point = GRIP + REST * BOW_UP + 0.125 * AIM
    tube('arrow', NOCK - 0.015 * AIM, point, [(0, 0.009), (1, 0.009)], M['wood'], n=3)
    ring = [point + 0.024 * side, point + 0.009 * BOW_UP, point - 0.024 * side, point - 0.009 * BOW_UP]
    tip = point + 0.075 * AIM
    verts = ring + [tip]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(3, 2, 1, 0)]
    part('arrowhead', verts, faces, M['steel'], inside=point + 0.02 * AIM)


def arms():
    left_shoulder = turned(SHOULDER, TORSO_YAW)
    right_shoulder = turned(V(-SHOULDER.x, SHOULDER.y, SHOULDER.z), TORSO_YAW)

    # The bow arm, held out nearly straight, the elbow turned down and out.
    fist = GRIP
    reach = (fist - left_shoulder).normalized()
    wrist = fist - 0.05 * reach
    elbow = bend(left_shoulder, wrist, UPPER_ARM, FOREARM, (left_shoulder + wrist) / 2 + V(0.1, 0.05, -0.3))
    limb('left', left_shoulder, elbow, wrist, bracer=True)
    up = (BOW_UP - BOW_UP.dot(reach) * reach).normalized()
    box('fist-left', fist, [reach, up, reach.cross(up)], (0.045, 0.05, 0.04), M['skin'], 0.85)

    # The drawing arm, the elbow up and out to his right, the fingers hooked round the string.
    fist = NOCK - 0.012 * AIM - 0.012 * BOW_UP
    wrist = fist - 0.055 * AIM + V(-0.02, 0.02, -0.01)
    pole = right_shoulder + V(-0.35, -0.05, 0.12)
    elbow = bend(right_shoulder, wrist, UPPER_ARM, FOREARM, pole)
    limb('right', right_shoulder, elbow, wrist)
    ahead = (fist - wrist).normalized()
    up = (V(0, 0, 1) - ahead.z * ahead).normalized()
    box('fist-right', fist, [ahead, up, ahead.cross(up)], (0.042, 0.045, 0.04), M['skin'], 0.85)


def limb(side, shoulder, elbow, wrist, bracer=False):
    tube(f'upper-arm-{side}', shoulder, elbow, [(-0.12, 0.064), (1.08, 0.052)], M['tunic'])
    stations = [(-0.08, 0.053), (0.38, 0.054), (1.0, 0.046)]
    tube(f'forearm-{side}', elbow, wrist, stations, [M['tunic'], M['leather']], [0, 1] if bracer else [0, 0])


def main():
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    baldric()
    cloak()
    quiver()
    turn(new_objects(before), TORSO_YAW)
    before = set(bpy.context.scene.objects)
    head()
    turn(new_objects(before), HEAD_YAW)
    hair_tail()
    arms()
    bow()
    finish('legolas')


main()
