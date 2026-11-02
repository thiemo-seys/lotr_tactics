"""Théoden at the charge on the Pelennor: his 3★ model, the book moment (docs/viewer-spec.md section
4, "Star levels").

Built on theoden.py, the same old king on the same grey Snowmane: the crowned helm, the long white
hair and beard, Herugrim and the golden shield, the team colour in his cloak and the horse's
saddle-cloth and breast strap, and the fittings in `trim`. Where the 1★ holds Herugrim high to rally
the Riders, this is the charge itself, at dawn on the Pelennor Fields, when the king cried to
Snowmane and no one could overtake him (The Return of the King, V 5, "The Ride of the Rohirrim"):
"His golden shield was uncovered, and lo! it shone like an image of the Sun".
- Snowmane at full gallop: both forelegs reaching out, the near hind under him on the ground and
  the off hind thrown out behind, the neck stretched, and the mane and tail streaming.
- Théoden leans into the charge with Herugrim thrust forward.
- The golden shield, turned to the front and a little bigger, bears the Sun: a pale gold disc and
  twelve rays on its deeper gold, muted, with no glow of its own.
- His long white hair and his cloak stream out behind him in the wind of the ride, lifted clear of
  the croup, so the grey quarters show under the cloak from behind and the cloak shows round his
  head from in front.

His fittings, Herugrim's guard and pommel, the clasps of his cloak, the belt buckle, the shield's
rim, the stirrups and the horse's browband, use `trim`, which the client colours gold at 3★; the
crown and the field of the shield stay `gold`.

    blender --background --factory-startup --python-exit-code 1 --python theoden-3.py [-- <out.glb>]

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
    BRASS,
    EYES,
    LEATHER,
    MAIL,
    MOUNTED_BOOK_BUDGET,
    STEEL,
    WOOD,
    V,
    bent_tube,
    box,
    ellipse,
    finish,
    loft,
    material,
    on_surface,
    part,
    reset,
    team_material,
    trim_material,
    tube,
)
from mounts import FORE_RADII, HIND_RADII, LEG_BANDS, horse  # noqa: E402
from mounts import M as HORSE  # noqa: E402

# Théoden's own colours (sRGB); the rest come from the kit.
COAT = 0xA9A8A3  # Snowmane: a light grey rather than white, so the team colour stays the brightest
POINTS = 0x5A5B5D  # his darker grey mane, tail and lower legs
SKIN = 0xD6A283  # weathered
HAIR = 0xDEDBD2  # white hair and beard
TUNIC = 0x5A6B44  # the green of Rohan, muted, as Éomer's
SUN = 0xD8C07E  # the Sun on his shield: a pale gold, muted, brighter than the shield's own gold

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        mail=material('mail', MAIL, roughness=0.8, metallic=0.05),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.9),
        tunic=material('tunic', TUNIC, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        gold=material('gold', BRASS, roughness=0.55, metallic=0.1),  # the crown and the golden shield
        sun=material('sun', SUN, roughness=0.5, metallic=0.1),
        wood=material('wood', WOOD, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
        # Fittings: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
    )


# Rider -------------------------------------------------------------------------------------------

LEAN = 23  # degrees his body above the saddle leans forward, into the charge, on the horse's back
PIVOT = V(0, 0.05, 0.80)
LEANING = Matrix.Translation(PIVOT) @ Matrix.Rotation(math.radians(LEAN), 4, 'X') @ Matrix.Translation(-PIVOT)

# The mail shirt as a barrel of octagons: z, half-width, half-depth and centre y. The belt is the
# band between the second and third rings. Above the chest the body is hidden under the mantle, so
# it runs straight to the neck.
TORSO = [
    (0.75, 0.165, 0.125, 0.06),  # in the saddle, round the hips
    (0.915, 0.17, 0.118, 0.05),  # belt, lower edge
    (0.965, 0.178, 0.122, 0.05),  # belt, upper edge
    (1.08, 0.205, 0.132, 0.04),  # chest, inside the mantle's hem
    (1.245, 0.072, 0.068, 0.06),  # neck
]
TORSO_BANDS = [0, 1, 0, 0]  # mail, except the belt


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    part('torso', verts, faces, [M['mail'], M['leather']], face_mats, inside=lambda c: V(0, 0.05, c.z))
    # The belt's buckle, a plate standing out from the front of the belt; its back is against it.
    centre, half, deep = V(0, -0.058, 0.94), V(0.036, 0, 0.03), V(0, -0.018, 0)
    corners = [V(-1, 0, -1), V(1, 0, -1), V(1, 0, 1), V(-1, 0, 1)]
    back = [centre + V(c.x * half.x, 0, c.z * half.z) for c in corners]
    front = [centre + deep + V(0.75 * c.x * half.x, 0, 0.75 * c.z * half.z) for c in corners]
    faces = [(4, 5, 6, 7)] + [(i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i) for i in range(4)]
    part('buckle', back + front, faces, M['trim'], inside=centre)


# His legs astride the horse, as Éomer's: thighs forward and down along the saddle, boots hanging.
HIP, KNEE, ANKLE = V(0.115, 0.03, 0.83), V(0.305, -0.11, 0.665), V(0.31, -0.025, 0.43)


def rider_legs():
    for s in (-1, 1):
        flip = V(s, 1, 1)
        hip, knee, ankle = (Vector(p * flip) for p in (HIP, KNEE, ANKLE))
        bent_tube(f'leg-{s}', [hip, knee, ankle], [0.078, 0.062, 0.05], [M['tunic'], M['boots']], [0, 1],
                  side=V(0, 1, 0))
        axes = [V(s * 0.25, -1, -0.1), V(1, 0, 0), V(0, 0, 1)]
        box(f'foot-{s}', ankle + V(0, -0.05, -0.03), axes, (0.08, 0.042, 0.04), M['boots'], 0.75)
        stirrup(s, ankle)


# A stirrup iron round the ball of each foot: a flat loop, broad at the tread under the sole and
# narrower at the eye over the instep, square to the foot. Its outer corners, (across, up) from the
# middle of the tread; where that is from the ankle (out, forward and down); and the iron's width.
STIRRUP = [(-0.06, 0.0), (0.06, 0.0), (0.046, 0.15), (-0.046, 0.15)]
STIRRUP_AT, STIRRUP_BAR = V(0.012, -0.085, -0.09), 0.017


def stirrup(s, ankle):
    centre = ankle + V(s * STIRRUP_AT.x, STIRRUP_AT.y, STIRRUP_AT.z)
    outer = [centre + V(x, 0, z) for x, z in STIRRUP]
    middle = sum(outer, Vector()) / 4
    inner = [p + STIRRUP_BAR * (middle - p).normalized() for p in outer]
    faces = [(i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i) for i in range(4)]
    part(f'stirrup-{s}', outer + inner, faces, M['trim'], outward=V(0, -1, 0))


# Arms: short sleeves of mail, the tunic at the elbow, leather bracers, big fists. The right arm
# reaches forward and up with Herugrim thrust out ahead; the left holds the reins before him, with
# the shield on that forearm turned to the front. Positions are before he leans.
R_SHOULDER, R_ELBOW = V(-0.225, 0.05, 1.15), V(-0.30, -0.10, 1.22)
R_WRIST, R_FIST = V(-0.33, -0.26, 1.33), V(-0.335, -0.30, 1.355)
L_SHOULDER, L_ELBOW = V(0.225, 0.05, 1.15), V(0.31, -0.02, 1.0)
L_WRIST, L_FIST = V(0.24, -0.15, 0.97), V(0.20, -0.19, 0.965)
# Herugrim's way once he leans: forward, up and a little out; the horse's bound (BOUND) tips it up a
# little more. SWORD is the same before he leans.
THRUST = V(-0.22, -0.524, 0.8225).normalized()
SWORD = (Matrix.Rotation(math.radians(-LEAN), 3, 'X') @ THRUST).normalized()
REINS = V(0.3, -0.5, 0.8)  # the way the reins run through his left fist


def arm(side, shoulder, elbow, wrist, fist, grip):
    """A mail sleeve, a leather bracer and a fist closed round a grip running along `grip`."""
    tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.078), (1.12, 0.064)], M['mail'])
    forearm = [(-0.2, 0.058), (0.3, 0.068), (1.0, 0.06)]
    tube(f'forearm-{side}', elbow, wrist, forearm, [M['tunic'], M['leather']], [0, 1])
    along = Vector(grip).normalized()
    ahead = wrist - elbow
    ahead = (ahead - ahead.dot(along) * along).normalized()
    box(f'fist-{side}', fist, [ahead, along, ahead.cross(along)], (0.046, 0.05, 0.05), M['skin'], 0.88)


def arms():
    arm('right', R_SHOULDER, R_ELBOW, R_WRIST, R_FIST, SWORD)
    arm('left', L_SHOULDER, L_ELBOW, L_WRIST, L_FIST, REINS)


# Head --------------------------------------------------------------------------------------------

HEAD_Y = 0.03  # the centre of his head, front to back

# The face: a shallow pyramid of planes round the root of the nose, from under the helm's brim round
# the cheekbones to the chin, as Éomer's.
FACE_RIM = [
    V(-0.08, -0.074, 1.405), V(0.08, -0.074, 1.405), V(0.098, -0.042, 1.34), V(0.062, -0.077, 1.278),
    V(0, -0.096, 1.252), V(-0.062, -0.077, 1.278), V(-0.098, -0.042, 1.34),
]
NOSE_ROOT = V(0, -0.113, 1.362)
FACE = [(FACE_RIM[i], FACE_RIM[(i + 1) % 7], NOSE_ROOT) for i in range(7)]


def head():
    # The back and sides of his head, under the helm and his hair.
    rings = [ellipse(0, HEAD_Y + 0.005, z, 0.098, 0.1, 8, 22.5) for z in (1.24, 1.41)]
    verts, faces, _ = loft(rings)
    part('skull', verts, faces, M['hair'], inside=lambda c: V(0, HEAD_Y, c.z))

    part('face', FACE_RIM + [NOSE_ROOT], [(i, (i + 1) % 7, 7) for i in range(7)], M['skin'], outward=V(0, -1, 0))

    # Deep-set eyes in the shade of his brows, laid just proud of the plate.
    for s in (-1, 1):
        corners = [(s * 0.02, 1.37), (s * 0.068, 1.374), (s * 0.046, 1.355)]
        verts = [V(x, on_surface(FACE, x, z) - 0.005, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A long, straight nose from under the brow to its tip.
    top, tip = V(0, -0.104, 1.398), V(0, -0.146, 1.322)
    left, right, under = V(-0.026, -0.108, 1.328), V(0.026, -0.108, 1.328), V(0, -0.118, 1.314)
    verts = [top, tip, left, right, under]
    part('nose', verts, [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)], M['skin'], inside=V(0, -0.08, 1.36))

    # Heavy white brows, one tuft over each eye, jutting from beside the nose and sweeping out to a
    # point at the temple, with the skin of his brow showing between them.
    for s in (-1, 1):
        verts = [V(s * 0.013, -0.084, 1.404), V(s * 0.013, -0.124, 1.39), V(s * 0.013, -0.098, 1.373),
                 V(s * 0.106, -0.07, 1.378)]
        faces = [(0, 1, 3), (1, 2, 3), (2, 0, 3), (0, 1, 2)]
        part(f'brow-{s}', verts, faces, M['hair'], inside=sum(verts, Vector()) / 4)


def beard():
    # A long white beard from his cheeks and under his nose down over his chest, narrowing to a
    # point at the belt. Each row runs from the back of his right cheek to the middle; the left half
    # mirrors it.
    half = [
        [(-0.104, -0.02, 1.385), (-0.1, -0.06, 1.33), (-0.05, -0.112, 1.31), (0, -0.124, 1.31)],
        [(-0.114, -0.02, 1.28), (-0.106, -0.096, 1.24), (-0.058, -0.142, 1.222), (0, -0.152, 1.218)],
        [(-0.096, -0.08, 1.14), (-0.088, -0.175, 1.125), (-0.048, -0.205, 1.115), (0, -0.214, 1.11)],
        [(-0.06, -0.12, 1.02), (-0.056, -0.178, 1.012), (-0.03, -0.196, 1.006), (0, -0.204, 1.002)],
    ]
    rows = []
    for level in half:
        right = [V(*p) for p in level]
        rows.append(right + [V(-p.x, p.y, p.z) for p in reversed(right[:-1])])
    verts, faces, _ = loft(rows, closed=False)
    tip, last = len(verts), (len(rows) - 1) * len(rows[0])
    verts.append(V(0, -0.17, 0.92))
    faces += [(last + i, last + i + 1, tip) for i in range(len(rows[0]) - 1)]
    part('beard', verts, faces, M['hair'], inside=lambda c: V(0, -0.02, c.z + 0.03))


# A rounded steel helm of eight facets on a gold circlet, which rises in points round it: z and
# radius from the brim up. The circlet is the first band.
HELM = [(1.398, 0.126), (1.456, 0.126), (1.535, 0.104), (1.59, 0.06)]
HELM_TOP = V(0, HEAD_Y, 1.618)
TINES = 8  # the circlet's points, one over each corner of the helm, the first in front


def helm():
    rings = [ellipse(0, HEAD_Y, z, r, r, 8, 0) for z, r in HELM]
    verts, faces, bands = loft(rings)
    face_mats = [0 if b < 1 else 1 for b in bands]
    last = (len(HELM) - 1) * 8
    verts.append(HELM_TOP)
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    face_mats += [1] * 8
    part('helm', verts, faces, [M['gold'], M['steel']], face_mats, inside=V(0, HEAD_Y, 1.45))

    # The circlet's points: each a thin three-sided spike standing on its top edge over a corner,
    # the one over his brow the tallest.
    z0, r0 = HELM[1]
    for k in range(TINES):
        a = math.radians(270 + 360 * k / TINES)
        out = V(math.cos(a), math.sin(a), 0)
        along = V(-math.sin(a), math.cos(a), 0)
        foot = V(0, HEAD_Y, z0) + (r0 - 0.004) * out
        high = 0.1 if k == 0 else 0.074
        verts = [foot + 0.031 * along, foot - 0.031 * along, foot - 0.016 * out + V(0, 0, 0.004),
                 foot + 0.008 * out + V(0, 0, high)]
        part(f'tine-{k}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['gold'],
             inside=foot - 0.004 * out + V(0, 0, 0.02))


# His long white hair streams out behind him from under the helm: rows across it, round the back of
# his head and then out behind, once he leans. The first is under the helm's brim and leans with him;
# the rest are where the wind carries them: half-width, centre y, how far the middle is behind the
# sides, and the height at the sides and in the middle.
HAIR_ROWS = [
    (0.135, 0.02, 0.08, 1.26, 1.31),
    (0.115, 0.17, 0.06, 1.21, 1.26),
]
HAIR_LOCKS = V(0, 0.1, -0.04)  # where each lock's tip is, from the middle of the ends between them


def hair():
    angles = [math.radians(a) for a in (0, 45, 90, 135, 180)]
    rows = [[LEANING @ V(0.122 * math.cos(a), HEAD_Y + 0.12 * math.sin(a), 1.405) for a in angles]]
    for half, cy, behind, side, middle in HAIR_ROWS:
        rows.append([V(half * math.cos(a), cy + behind * math.sin(a), side + (middle - side) * math.sin(a))
                     for a in angles])
    verts, faces, _ = loft(rows, closed=False)
    start = (len(rows) - 1) * len(angles)
    for i in range(len(angles) - 1):
        mid = (verts[start + i] + verts[start + i + 1]) / 2
        verts.append(mid + HAIR_LOCKS + V(0.2 * mid.x, 0, 0))
        faces.append((start + i, start + i + 1, len(verts) - 1))
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, c.y - 0.05, c.z - 0.1))


# Team colour: his cloak, a mantle over the shoulders and a cloak streaming out behind ----------


def mantle():
    neck_z = [1.245, 1.255, 1.265, 1.255, 1.245, 1.225, 1.215, 1.225]
    neck = ellipse(0, 0.055, 0, 0.112, 0.11, 8, 0, neck_z)
    dome = ellipse(0, 0.05, 0, 0.235, 0.17, 8, 0, [z - 0.04 for z in neck_z])
    shoulder_z = [1.13, 1.14, 1.15, 1.14, 1.13, 1.13, 1.125, 1.13]
    shoulder = ellipse(0, 0.05, 0, 0.31, 0.205, 8, 0, shoulder_z)
    hem = ellipse(0, 0.05, 0, 0.30, 0.195, 8, 0, [z - 0.05 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('mantle', verts, faces, M['team'], inside=V(0, 0.05, 1.05))
    clasps(dome, shoulder)


def clasps(dome, shoulder):
    """A round clasp each side of his beard, pinning the mantle at the front: a low five-sided boss on
    the facet between the front of the dome and of the shoulders."""
    for s, (i, j) in ((1, (6, 7)), (-1, (6, 5))):
        a, b, c, d = dome[i], dome[j], shoulder[j], shoulder[i]
        normal = (b - a).cross(d - a).normalized()
        if normal.y > 0:
            normal = -normal
        centre = a.lerp(b, 0.68).lerp(d.lerp(c, 0.68), 0.5) + 0.004 * normal
        u = (b - a).normalized()
        v = normal.cross(u)
        ring = [centre + 0.026 * (math.cos(t) * u + math.sin(t) * v)
                for t in (math.radians(90 + 72 * k) for k in range(5))]
        faces = [(k, (k + 1) % 5, 5) for k in range(5)]
        part(f'clasp-{s}', ring + [centre + 0.016 * normal], faces, M['trim'],
             inside=centre - 0.01 * normal)


# The cloak streams out behind him, lifted clear of the croup. Rows across it from its top, under the
# mantle, each from his left to his right: the first is the 1★ cape's top and leans with him; the rest
# are where the wind carries them, arcs whose middle is furthest back and highest: half-width,
# centre y, how far the middle is behind the edges, the height at the edges and in the middle, how
# far short of the sides the arc stops (degrees), and how deep the folds are.
CLOAK_TOP = (1.13, 0.27, 0.20, 0.05, 30)  # z, half-width, half-depth, centre y and spread, as theoden.py
CLOAK_ROWS = [
    (0.31, 0.15, 0.10, 1.07, 1.15, 22, 0.025),
    (0.35, 0.33, 0.09, 1.09, 1.25, 16, 0.03),
    (0.37, 0.49, 0.07, 1.01, 1.13, 12, 0.03),
]
CLOAK_DAGS = V(0, 0.07, -0.02)  # where each dag's tip is, from the middle of the ends between them


def cloak():
    z, rx, ry, cy, spread = CLOAK_TOP
    rows = [[LEANING @ V(rx * math.cos(a), cy + ry * math.sin(a), z)
             for a in (math.radians(spread + (180 - 2 * spread) * i / 8) for i in range(9))]]
    for half, centre, behind, edge, middle, spread, fold in CLOAK_ROWS:
        row = []
        for i in range(9):
            a = math.radians(spread + (180 - 2 * spread) * i / 8)
            lift = fold if i % 2 else -fold / 2
            row.append(V(half * math.cos(a), centre + behind * math.sin(a),
                         edge + (middle - edge) * math.sin(a) ** 2 + lift))
        rows.append(row)
    verts, faces, _ = loft(rows, closed=False)
    start = (len(rows) - 1) * 9
    for i in range(8):
        mid = (verts[start + i] + verts[start + i + 1]) / 2
        verts.append(mid + CLOAK_DAGS)
        faces.append((start + i, start + i + 1, len(verts) - 1))
    part('cloak', verts, faces, M['team'], inside=lambda c: V(0, c.y, c.z - 0.3))


# The golden shield, uncovered, with the Sun on it ------------------------------------------------

# On his left forearm, turned to the front and tipped up to face the way he looks once he leans, so
# the Sun shows from in front. Built facing -Y round the origin: the rim is a profile turned round
# the axis, from its back over its edge to where the face starts (radius and y); the face inside it
# is the Sun, a disc on the boss's foot with twelve rays reaching out to the rim, on the shield's own
# deeper gold.
SHIELD_CENTRE = V(0.29, -0.125, 1.027)
SHIELD_TURN = Matrix.Rotation(math.radians(20), 3, 'Z') @ Matrix.Rotation(math.radians(-45), 3, 'X')
SHIELD_RIM = [(0.225, 0.014), (0.232, -0.012), (0.205, -0.022)]
RAYS = 12
SUN_DISC = (0.085, -0.048)  # the radius and y of the boss's foot, the edge of the Sun's disc
BOSS = -0.1  # how far forward the boss's point stands


def shield():
    n = 2 * RAYS  # round the rim: a ray's tip, then the field between two rays, in turn

    def point(r, y, j, count):
        a = math.tau * j / count
        return V(r * math.cos(a), y, r * math.sin(a))

    verts, faces, _ = loft([[point(r, y, j, n) for j in range(n)] for r, y in SHIELD_RIM])
    face_mats = [3] * len(faces)  # the rim, in trim
    edge = len(verts) - n  # where the face meets the rim
    disc = len(verts)  # the disc's edge, a point between each ray and the next
    verts += [point(SUN_DISC[0], SUN_DISC[1], 2 * k + 1, n) for k in range(RAYS)]
    for k in range(RAYS):
        tip, between, next_tip = edge + 2 * k, edge + 2 * k + 1, edge + (2 * k + 2) % n
        faces.append((disc + (k - 1) % RAYS, disc + k, tip))  # a ray, out from the disc to its tip
        faces += [(disc + k, between, tip), (disc + k, next_tip, between)]  # the gold between rays
        face_mats += [1, 0, 0]
    apex = len(verts)
    verts.append(V(0, BOSS, 0))
    faces += [(disc + k, disc + (k + 1) % RAYS, apex) for k in range(RAYS)]  # the disc, the boss
    face_mats += [1] * RAYS
    faces.append(tuple(reversed(range(n))))  # the boards behind
    face_mats.append(2)
    verts = [SHIELD_CENTRE + SHIELD_TURN @ v for v in verts]
    part('shield', verts, faces, [M['gold'], M['sun'], M['wood'], M['trim']], face_mats,
         inside=SHIELD_CENTRE)


# Herugrim and the reins, made after he leans --------------------------------------------------------


def herugrim():
    grip = LEANING @ R_FIST
    along = THRUST
    across = along.cross(V(0, 1, 0)).normalized()  # the edges, out to the sides
    thick = across.cross(along)  # the flats face forward and back
    guard = grip + 0.075 * along

    def section(c, w, t):
        return [c + w * across, c + t * thick, c - w * across, c - t * thick]

    rings = [section(guard, 0.048, 0.014), section(guard + 0.46 * along, 0.04, 0.012)]
    verts, faces, _ = loft(rings)
    verts.append(guard + 0.59 * along)
    faces += [(4 + i, 4 + (i + 1) % 4, 8) for i in range(4)]
    part('blade', verts, faces, M['steel'], inside=guard + 0.3 * along)
    box('guard', guard, [along, across, thick], (0.016, 0.1, 0.022), M['trim'], 0.8)
    # A pommel under his fist.
    end = grip - 0.06 * along
    ring = [end + 0.026 * d for d in (across, thick, -across, -thick)]
    verts = ring + [end - 0.045 * along, end + 0.03 * along]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('pommel', verts, faces, M['trim'], inside=end)


def reins(mount):
    # From the bits to his hand, by way of points beside the neck.
    hand = LEANING @ L_FIST
    for s, bit in zip((-1, 1), mount.bits):
        bit = STRETCHING @ bit
        mid = STRETCHING @ mount.turned(V(s * 0.125, -0.52, 0.92))
        path = [bit, mid, hand + V(-s * 0.012, 0.0, -0.01)]
        width = V(0, 0, 0.012)
        verts = [p + width for p in path] + [p - width for p in path]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4)]
        part(f'rein-{s}', verts, faces, M['leather'], outward=V(s, 0, 0))


# Snowmane at full gallop -------------------------------------------------------------------------

# The legs re-posed for the moment the forelegs reach out to land: their joints from inside the body
# to the hoof, as mounts.FORE and mounts.HIND, for the near (left, +X) and off (right) legs. The near
# hind is under him on the ground, the one hoof down; the off hind is thrown out behind.
GALLOP_FORE = {
    1: [V(0, -0.29, 0.48), V(0, -0.46, 0.39), V(0, -0.60, 0.33), V(0, -0.635, 0.30), V(0, -0.665, 0.27)],
    -1: [V(0, -0.30, 0.49), V(0, -0.43, 0.29), V(0, -0.55, 0.17), V(0, -0.58, 0.13), V(0, -0.60, 0.095)],
}
GALLOP_HIND = {
    1: [V(0, 0.30, 0.55), V(0, 0.40, 0.28), V(0, 0.27, 0.10), V(0, 0.24, 0.05), V(0, 0.22, 0.0)],
    -1: [V(0, 0.30, 0.55), V(0, 0.47, 0.30), V(0, 0.60, 0.15), V(0, 0.635, 0.125), V(0, 0.67, 0.10)],
}
# The tail streams out behind, where the 1★'s arches and falls.
TAIL = [V(0, 0.46, 0.72), V(0, 0.56, 0.765), V(0.0, 0.655, 0.735), V(0.01, 0.725, 0.67),
        V(0.015, 0.765, 0.59)]
TAIL_RADII = [(0.04, 0.035), (0.06, 0.045), (0.08, 0.05), (0.085, 0.05), (0.07, 0.042)]
TAIL_END = V(0.02, 0.775, 0.51)
# The whole horse bounds, its forehand rising about the near hind hoof, the one on the ground: a
# stride of the gallop, and it draws the head and the raised sword in from the edge of the hex, so
# the client can draw the model the full 10% bigger. Everything is built level and then bounds, but
# the near hind, which is made after (planted()).
BOUND = 5
BOUND_PIVOT = V(0, 0.25, 0.0)
BOUNDING = (Matrix.Translation(BOUND_PIVOT) @ Matrix.Rotation(math.radians(-BOUND), 4, 'X')
            @ Matrix.Translation(-BOUND_PIVOT))
# The neck and head stretch out forward and down about the withers, and everything on them.
NECK = ('horse-neck', 'horse-head', 'horse-ear-1', 'horse-ear--1', 'horse-eye-1', 'horse-eye--1',
        'horse-noseband', 'horse-cheekpiece-1', 'horse-cheekpiece--1', 'horse-browband', 'horse-mane',
        'horse-forelock')
STRETCH, STRETCH_PIVOT = 12, V(0, -0.25, 0.80)
STRETCHING = (Matrix.Translation(STRETCH_PIVOT) @ Matrix.Rotation(math.radians(STRETCH), 4, 'X')
              @ Matrix.Translation(-STRETCH_PIVOT))
STREAM = V(0, 0.07, -0.025)  # how far the wind carries the free edge of the mane back along the neck


def remove(name):
    bpy.data.objects.remove(bpy.context.scene.objects[name])


def gallop():
    mats = [HORSE['coat'], HORSE['horsehair']]
    for s in (-1, 1):
        remove(f'horse-fore-{s}')
        remove(f'horse-hind-{s}')
        fore = [j + V(s * 0.13, 0, 0) for j in GALLOP_FORE[s]]
        bent_tube(f'horse-fore-{s}', fore, FORE_RADII, mats, LEG_BANDS, phase=30, side=V(1, 0, 0), end='cap')
        if s < 0:  # the near hind, on the ground, is made once the horse bounds (planted())
            hind = [j + V(s * 0.14, 0, 0) for j in GALLOP_HIND[s]]
            bent_tube(f'horse-hind-{s}', hind, HIND_RADII, mats, LEG_BANDS, phase=30, side=V(1, 0, 0),
                      end='cap')
    remove('horse-tail')
    bent_tube('horse-tail', TAIL, TAIL_RADII, HORSE['horsehair'], n=5, phase=90, side=V(1, 0, 0),
              end=TAIL_END)
    # The mane is made of sections of three points across the crest, the last its free edge: the
    # wind of the ride carries that edge back.
    for k, v in enumerate(bpy.context.scene.objects['horse-mane'].data.vertices):
        if k % 3 == 2:
            v.co += STREAM
    for name in NECK:
        bpy.context.scene.objects[name].data.transform(STRETCHING)


def planted():
    """The near hind under the bounding horse: its joints go with it, but the hoof stays level on the
    ground."""
    joints = [j + V(0.14, 0.03, 0) for j in GALLOP_HIND[1]]
    bounded = [BOUNDING @ j for j in joints[:-1]] + [joints[-1]]
    bent_tube('horse-hind-1', bounded, HIND_RADII, [HORSE['coat'], HORSE['horsehair']], LEG_BANDS,
              phase=30, side=V(1, 0, 0), level_end=True)


def main():
    reset()
    make_materials()
    mount = horse(COAT, POINTS, blaze=None, stripe=False, tack='saddle-cloth', raised=None, turn=-12)
    gallop()
    rider_legs()
    fixed = set(bpy.context.scene.objects)
    torso()
    arms()
    head()
    beard()
    helm()
    mantle()
    shield()
    for obj in bpy.context.scene.objects:
        if obj not in fixed:
            obj.data.transform(LEANING)
    hair()
    cloak()
    herugrim()
    reins(mount)
    for obj in bpy.context.scene.objects:
        obj.data.transform(BOUNDING)
    planted()
    finish('theoden-3', budget=MOUNTED_BOOK_BUDGET)


main()
