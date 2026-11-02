"""Théoden in the long cloak of a king: his 2★ model, with his gear (docs/viewer-spec.md section 4,
"Star levels").

Built on theoden.py, the same old king on the same grey Snowmane, Herugrim held high to rally the
Riders and the golden shield on his left arm, with one piece added: a king's long cloak in place of
the 1★ cape. It hangs from under his mantle down his back, over the cantle and the whole of
Snowmane's croup, and falls over the quarters on both sides, the tail coming out from under it; on
his right it sweeps out from the flank under his raised sword arm. Where the 1★ cape is narrow, so
the grey quarters show round it from behind, this covers them, and from in front its sweep shows
past him on the side his shield doesn't hide. It is in the team colour, as the cape was, with the
mantle and the horse's saddle-cloth and breast strap.

His fittings, Herugrim's guard and pommel, the clasps of his cloak, the belt buckle, the shield's
rim, the stirrups and the horse's browband, use `trim`, which the client colours silver at 2★; the
crown and the golden shield's face stay `gold`. His 3★ model is theoden-3.py.

    blender --background --factory-startup --python-exit-code 1 --python theoden-2.py [-- <out.glb>]

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
    MOUNTED_GEAR_BUDGET,
    STEEL,
    WOOD,
    V,
    bent_tube,
    box,
    ellipse,
    finish,
    loft,
    material,
    nearest_on_polyline,
    on_surface,
    part,
    reset,
    team_material,
    trim_material,
    tube,
)
from mounts import CLOTH, body_ring, body_row, horse  # noqa: E402

# Théoden's own colours (sRGB); the rest come from the kit.
COAT = 0xA9A8A3  # Snowmane: a light grey rather than white, so the team colour stays the brightest
POINTS = 0x5A5B5D  # his darker grey mane, tail and lower legs
SKIN = 0xD6A283  # weathered
HAIR = 0xDEDBD2  # white hair and beard
TUNIC = 0x5A6B44  # the green of Rohan, muted, as Éomer's

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
        wood=material('wood', WOOD, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
        # Fittings: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
    )


# Rider -------------------------------------------------------------------------------------------

LEAN = 4  # degrees his body above the saddle leans forward, into the charge
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


# Arms: short sleeves of mail, the tunic at the elbow, leather bracers, big fists. The right arm is
# raised high, out to the side, with Herugrim upright in the fist; the left holds the reins over the
# withers with the shield on that forearm.
R_SHOULDER, R_ELBOW = V(-0.225, 0.05, 1.15), V(-0.36, 0.05, 1.27)
R_WRIST, R_FIST = V(-0.465, 0.005, 1.395), V(-0.483, -0.002, 1.43)
L_SHOULDER, L_ELBOW = V(0.225, 0.05, 1.15), V(0.30, 0.04, 0.975)
L_WRIST, L_FIST = V(0.205, -0.08, 0.935), V(0.16, -0.125, 0.928)
SWORD = V(-0.1, -0.1, 1.0).normalized()  # upright, a little out and forward
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


def hair():
    # Long white hair from under the helm down over his cloak, in locks.
    def level(z, rx, ry, cy, angles, zs=None):
        return [V(rx * math.cos(math.radians(a)), cy + ry * math.sin(math.radians(a)), zs[i] if zs else z)
                for i, a in enumerate(angles)]

    angles = [0, 45, 90, 135, 180]
    rows = [
        level(1.405, 0.122, 0.12, HEAD_Y, angles),
        level(1.26, 0.148, 0.17, 0.05, angles),
        level(0, 0.17, 0.262, 0.05, [12, 50, 90, 130, 168], [1.12, 1.07, 1.05, 1.07, 1.12]),
    ]
    verts, faces, _ = loft(rows, closed=False)
    # A lock hanging from the ends between each pair of points.
    start = (len(rows) - 1) * len(angles)
    for i in range(len(angles) - 1):
        mid = (verts[start + i] + verts[start + i + 1]) / 2
        verts.append(mid + 0.02 * V(mid.x, mid.y - 0.05, 0).normalized() - V(0, 0, 0.08))
        faces.append((start + i, start + i + 1, len(verts) - 1))
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z))


# Team colour: his cloak, a mantle over the shoulders and a king's long cloak down his back -------


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


# The gear for 2 stars: the king's long cloak --------------------------------------------------

# Rows across the cloak from its top, under the mantle, each from its left edge to its right. On his
# back they are arcs round him, as the 1★ cape's (cape() in theoden.py), and lean with him: z at
# the middle and at the edges, half-width, half-depth, centre y, how far short of his sides they
# stop (degrees) and how deep the folds are. The edges fall lower as they come round his hips.
CLOAK_BACK = [
    (1.13, 1.13, 0.27, 0.20, 0.05, 30, 0.0),
    (0.97, 0.975, 0.25, 0.20, 0.07, 22, 0.02),
    (0.85, 0.79, 0.245, 0.21, 0.09, 14, 0.03),
]
# Over the croup they lie across the horse like its cloth: where on the body the row takes its
# shape (y) and where it lies (y), how far it stands off the coat, the height of the hem and how far
# it flares out past the flank on his left, and the same on his right, where it sweeps out from the
# flank under his raised sword arm, so it shows past him from in front.
CLOAK_CROUP = [
    (0.32, 0.34, 0.03, 0.47, 0.06, 0.53, 0.21),
    (0.39, 0.47, 0.04, 0.53, 0.09, 0.6, 0.3),
]
CLOAK_SWEEP = V(-0.06, 0.0, 0.03)  # how far the cloth on his right side lifts off the flank
CLOAK_FOLDS = [0.0, 0.03, 0.0, 0.025, 0.0, 0.025, 0.0, 0.035, 0.0]  # folds standing out across a row
CLOAK_DAGS = [0.06, 0.085]  # how far a dag hangs below the side hem, between each pair of rows
CLOAK_INSIDE = [V(0, 0.05, 1.2), V(0, 0.05, 0.85), V(0, 0.3, 0.6), V(0, 0.6, 0.6)]


def cloak():
    rows = []
    for middle, edge, rx, ry, cy, spread, fold in CLOAK_BACK:
        ring = []
        for i in range(9):
            a = math.radians(spread + (180 - 2 * spread) * i / 8)
            k = 1 + (fold / ry if i % 2 else 0)
            z = edge + (middle - edge) * math.sin(a) ** 2
            ring.append(LEANING @ V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rows.append(ring)
    for shape, y, off, left_hem, left_flare, right_hem, right_flare in CLOAK_CROUP:
        ring = [V(p.x, y, p.z) for p in body_ring(*body_row(shape), grow=CLOTH + off)]
        top = (ring[1] + ring[2]) / 2 + V(0, 0, 0.012)
        across = [ring[7], ring[0], ring[1], top, ring[2], ring[3] + 0.4 * CLOAK_SWEEP, ring[4] + CLOAK_SWEEP]
        left, right = across[0], across[-1]
        row = [V(left.x + left_flare, y, left_hem)] + across + [V(right.x - right_flare, y, right_hem)]
        centre = V(0, y, 0.6)
        rows.append([p + fold * V(p.x, 0, p.z - centre.z).normalized() for p, fold in zip(row, CLOAK_FOLDS)])
    verts, faces, _ = loft(rows, closed=False)
    # A dag hanging from the hem between each pair of rows over the horse, on each side.
    width = len(rows[0])
    for r, drop in zip(range(len(CLOAK_BACK) - 1, len(rows) - 1), CLOAK_DAGS):
        for i in (0, width - 1):
            a, b = r * width + i, (r + 1) * width + i
            verts.append((verts[a] + verts[b]) / 2 - V(0, 0, drop))
            faces.append((a, b, len(verts) - 1))
    # Inside it is his spine, down to the saddle, then the middle of the horse's back to the tail.
    part('cloak', verts, faces, M['team'], inside=nearest_on_polyline(CLOAK_INSIDE))


# The golden shield, on his left forearm ------------------------------------------------------------

SHIELD_CENTRE = V(0.27, -0.1, 0.975)
SHIELD_TURN = Matrix.Rotation(math.radians(35), 3, 'Z') @ Matrix.Rotation(math.radians(-10), 3, 'X')


def shield():
    # Built facing -Y round the origin, as one profile turned round the axis: from the back of the
    # rim, over its edge and its face, down the gold face to the boss.
    n = 10
    profile = [  # radius, y
        (0.2, 0.014),  # the back of the rim, round the boards
        (0.206, -0.012),  # the rim's front edge
        (0.18, -0.022),  # where the gold face starts
        (0.07, -0.05),  # the foot of the boss
    ]
    band_mats = [3, 3, 0]  # the rim in trim, then the gold face

    def ring(r, y):
        angles = (math.tau * (i + 0.5) / n for i in range(n))
        return [V(r * math.cos(a), y, r * math.sin(a)) for a in angles]

    verts, faces, bands = loft([ring(r, y) for r, y in profile])
    face_mats = [band_mats[b] for b in bands]
    apex, last = len(verts), (len(profile) - 1) * n
    verts.append(V(0, -0.098, 0))
    faces += [(last + i, last + (i + 1) % n, apex) for i in range(n)]
    face_mats += [1] * n
    faces.append(tuple(reversed(range(n))))  # the boards behind
    face_mats.append(2)
    verts = [SHIELD_CENTRE + SHIELD_TURN @ v for v in verts]
    part('shield', verts, faces, [M['gold'], M['steel'], M['wood'], M['trim']], face_mats,
         inside=SHIELD_CENTRE)


# Herugrim and the reins, made after he leans --------------------------------------------------------


def herugrim():
    grip = LEANING @ R_FIST
    along = (LEANING.to_3x3() @ SWORD).normalized()
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
        mid = mount.turned(V(s * 0.125, -0.52, 0.92))
        path = [bit, mid, hand + V(-s * 0.012, 0.0, -0.01)]
        width = V(0, 0, 0.012)
        verts = [p + width for p in path] + [p - width for p in path]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4)]
        part(f'rein-{s}', verts, faces, M['leather'], outward=V(s, 0, 0))


def main():
    reset()
    make_materials()
    mount = horse(COAT, POINTS, blaze=None, stripe=False, tack='saddle-cloth', raised='right', turn=-28)
    rider_legs()
    fixed = set(bpy.context.scene.objects)
    torso()
    arms()
    head()
    beard()
    helm()
    hair()
    mantle()
    shield()
    for obj in bpy.context.scene.objects:
        if obj not in fixed:
            obj.data.transform(LEANING)
    cloak()
    herugrim()
    reins(mount)
    finish('theoden-2', budget=MOUNTED_GEAR_BUDGET)


main()
