"""Éomer, a Rider of Rohan on his horse: a mounted spearman (docs/viewer-spec.md section 4).

Built like Gimli (gimli.py), the reference: every form a low-segment shape or a hand-placed set of
vertices, shaded flat. The horse reads first, the shared one from ../mounts.py: a compact,
deep-chested dun with a long head, a crest of dark mane and a sweeping tail, one foreleg raised,
ready to charge, and nose to tail inside the hex. On it Éomer sits tall in a mail shirt with his
ash spear upright: a Man, his head about a quarter of his height, under a tall helm with a long
white horse-tail plume, his flaxen hair long. The team colour is his cloak and the horse's
saddle-cloth and breast strap, seen from the front, from behind and from above; everything else is
muted green, gold and earth.

He is the reference rider (../rig.py, ../clips.py): he and his horse are one model on one armature,
the horse rigged by horse() with bones of its own (mount_...) and his hips hanging from its body, so
he rides it. His feet keep to the stirrups and his hands to the spear and the reins, whose ends
follow the horse's head and his hand. His clips are the library's mounted ones: the horse stands
with a foreleg raised, gallops a stride a hex, tosses its head as he stabs down with the spear,
rises and slams down under a harder stab for his cast (Spear thrust), hangs its head when stunned,
goes down with him, and rears when they win. To bend, his legs are a thigh and a shin and his mail
a skirt on his hips and a chest on his spine, split at rings they already had, so they cost no
triangles; nor do the horse's jointed legs.

His fittings, the belt buckle, the helm's band, the spear's socket and the horse's browband, use
`trim`, which the client colours iron, silver or gold by star level (docs/viewer-spec.md section 4,
"Star levels"). His 2★ model is eomer-2.py, which imports this script and builds him with its
shield on his left arm (build()), and his 3★ model eomer-3.py.

    blender --background --factory-startup --python-exit-code 1 --python eomer.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys
from itertools import pairwise

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from clips import tweened  # noqa: E402
from kit import (  # noqa: E402
    BOOTS,
    EYES,
    LEATHER,
    MAIL,
    MOUNTED_BUDGET,
    STEEL,
    V,
    WOOD,
    bone,
    box,
    ellipse,
    finish,
    frame,
    loft,
    material,
    on_surface,
    part,
    reset,
    team_material,
    trim_material,
    tube,
    wind,
)
from mounts import horse  # noqa: E402
from rig import Rig, hold, joint  # noqa: E402

# Éomer's own colours (sRGB); the rest come from the kit.
COAT = 0xA8845A  # his horse, a dun
POINTS = 0x3B2F27  # the dun's dark mane, tail and lower legs
SKIN = 0xDDA684
HAIR = 0xD8C38E  # flaxen
PLUME = 0xE6E1D4  # the white horse-tail on his helm
BLAZE = 0xE6E1D4  # the white blaze down the horse's face, the same white
TUNIC = 0x5A6B44  # the green of Rohan, muted

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        mail=material('mail', MAIL, roughness=0.8, metallic=0.05),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.9),
        plume=material('plume', PLUME, roughness=0.9),
        tunic=material('tunic', TUNIC, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        wood=material('wood', WOOD, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
        # Fittings: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
    )


# Helpers -----------------------------------------------------------------------------------------


def nearest_on_polyline(points):
    """A function giving the point on the polyline through `points` nearest to a point."""
    points = [Vector(p) for p in points]

    def nearest(c):
        best = None
        for a, b in pairwise(points):
            ab = b - a
            t = max(0.0, min(1.0, (c - a).dot(ab) / ab.length_squared))
            q = a + t * ab
            if best is None or (c - q).length < (c - best).length:
                best = q
        return best

    return nearest


def bend(joints, radii, n=6, phase=0.0, side=None, flat_end=False):
    """Rings of n points round a bent line through `joints`, each square to the line there (to the
    bisector at a bend). A radius is a number, or (across, deep) for a flattened ring. `side` is the
    direction `across` points, kept square to the line; without it the first ring's is carried down
    the line without twisting. `flat_end` lays the last ring level, for a hoof on the ground."""
    joints = [Vector(j) for j in joints]
    rings, across = [], None
    for k, p in enumerate(joints):
        dirs = []
        if k > 0:
            dirs.append((p - joints[k - 1]).normalized())
        if k < len(joints) - 1:
            dirs.append((joints[k + 1] - p).normalized())
        axis = sum(dirs, Vector()).normalized()
        if flat_end and k == len(joints) - 1:
            axis = V(0, 0, math.copysign(1.0, axis.z))
        guide = Vector(side) if side is not None else across
        if guide is None:
            across, _ = frame(axis)
        else:
            across = (guide - guide.dot(axis) * axis).normalized()
        deep = axis.cross(across)
        r = radii[k]
        ra, rd = (r, r) if isinstance(r, (int, float)) else r
        ring = []
        for i in range(n):
            a = math.radians(phase) + math.tau * i / n
            ring.append(p + ra * math.cos(a) * across + rd * math.sin(a) * deep)
        rings.append(ring)
    return rings


def limb(name, joints, radii, mats, band_mats=None, n=6, phase=0.0, side=None, flat_end=False, cap=False,
         tip=None):
    """A faceted tube through `joints` (see bend()), open at the start, and at the end closed by a
    flat cap, drawn to a point at `tip`, or left open."""
    joints = [Vector(j) for j in joints]
    rings = bend(joints, radii, n, phase, side, flat_end)
    verts, faces, bands = loft(rings)
    face_mats = [band_mats[b] for b in bands] if band_mats else [0] * len(faces)
    faces = wind(verts, faces, inside=nearest_on_polyline(joints))
    last = (len(rings) - 1) * n
    ahead = joints[-1] - joints[-2]
    if cap:
        faces += wind(verts, [tuple(range(last, last + n))], outward=ahead)
        face_mats.append(face_mats[-1])
    if tip is not None:
        verts.append(Vector(tip))
        fan = [(last + i, last + (i + 1) % n, len(verts) - 1) for i in range(n)]
        faces += wind(verts, fan, inside=joints[-1] - 0.01 * ahead.normalized())
        face_mats += [face_mats[-1]] * n
    return part(name, verts, faces, mats, face_mats)


# Rider -------------------------------------------------------------------------------------------

LEAN = 6  # degrees his body above the saddle leans forward, into the charge
PIVOT = V(0, 0.05, 0.80)
LEANING = Matrix.Translation(PIVOT) @ Matrix.Rotation(math.radians(LEAN), 4, 'X') @ Matrix.Translation(-PIVOT)

# The mail shirt as a barrel of octagons: z, half-width, half-depth and centre y. It is in two
# pieces, which bend at the belt: the skirt and the belt on his hips, and the chest on his spine,
# from a ring inside the belt (WAIST) up to his neck.
TORSO = [
    (0.75, 0.165, 0.125, 0.06),  # in the saddle, round the hips
    (0.915, 0.17, 0.118, 0.05),  # belt, lower edge
    (0.965, 0.178, 0.122, 0.05),  # belt, upper edge
]
CHEST = [
    (0.925, 0.162, 0.11, 0.05),  # inside the belt
    (1.08, 0.205, 0.132, 0.04),  # chest
    (1.175, 0.20, 0.118, 0.05),  # shoulders
    (1.245, 0.072, 0.068, 0.06),  # neck
]
TORSO_BANDS = [0, 1]  # mail, then the belt
PELVIS, WAIST = V(0, 0.05, 0.80), V(0, 0.05, 0.94)


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    with bone('hips'):
        part('skirt', verts, faces, [M['mail'], M['leather']], face_mats, inside=lambda c: V(0, 0.05, c.z))
        axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
        box('buckle', V(0, -0.072, 0.94), axes, (0.016, 0.04, 0.034), M['trim'], 0.8)
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in CHEST]
    verts, faces, _ = loft(rings)
    with bone('spine'):
        part('chest', verts, faces, M['mail'], inside=lambda c: V(0, 0.05, c.z))
    joint('pelvis', PELVIS)
    joint('waist', WAIST)


# His legs astride the horse: thighs forward and down along the saddle, boots hanging straight.
HIP, KNEE, ANKLE = V(0.115, 0.03, 0.83), V(0.305, -0.11, 0.665), V(0.31, -0.025, 0.43)


KNEE_OVERLAP = 0.03  # how far the thigh runs on past the knee, and the shin starts above it


def rider_legs():
    # Each leg as it was built, through the hip, knee and ankle, but in two at the knee: the thigh
    # carried on past it along its band, the shin from above it, so the knee can bend.
    for s in (-1, 1):
        flip = V(s, 1, 1)
        side = 'l' if s > 0 else 'r'
        hip, knee, ankle = (Vector(p * flip) for p in (HIP, KNEE, ANKLE))
        rings = bend([hip, knee, ankle], [0.078, 0.062, 0.05], side=V(0, 1, 0))
        thigh = [rings[0], [p + KNEE_OVERLAP / (knee - hip).length * (p - q) for p, q in zip(rings[1], rings[0])]]
        shin = [[p + KNEE_OVERLAP / (knee - ankle).length * (p - q) for p, q in zip(rings[1], rings[2])], rings[2]]
        for name, rings_, line, mat in (('thigh', thigh, [hip, knee], 'tunic'), ('shin', shin, [knee, ankle], 'boots')):
            verts, faces, _ = loft(rings_)
            with bone(f'{name}_{side}'):
                part(f'{name}-{s}', verts, wind(verts, faces, inside=nearest_on_polyline(line)), M[mat])
        axes = [V(s * 0.25, -1, -0.1), V(1, 0, 0), V(0, 0, 1)]
        heel = ankle + V(0, -0.05, -0.03)
        with bone(f'foot_{side}'):
            box(f'foot-{s}', heel, axes, (0.08, 0.042, 0.04), M['boots'], 0.75)
        joint(f'hip_{side}', hip)
        joint(f'knee_{side}', knee)
        joint(f'ankle_{side}', ankle)
        joint(f'toe_{side}', heel + 0.08 * Vector(axes[0]).normalized())


# Arms: short sleeves of mail, the tunic at the elbow, leather bracers, big fists. The right hand
# holds the spear upright beside him; the left holds the reins over the withers.
R_SHOULDER, R_ELBOW = V(-0.225, 0.05, 1.15), V(-0.30, 0.06, 0.975)
R_WRIST, R_FIST = V(-0.305, -0.075, 0.99), V(-0.305, -0.128, 0.995)
L_SHOULDER, L_ELBOW = V(0.225, 0.05, 1.15), V(0.29, 0.03, 0.965)
L_WRIST, L_FIST = V(0.19, -0.085, 0.93), V(0.15, -0.13, 0.925)
SPEAR = V(-0.04, -0.3, 0.95).normalized()  # upright, leaning forward a little


def arm(side, shoulder, elbow, wrist, fist, fist_up):
    s = side[0]
    with bone(f'upper_arm_{s}'):
        tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.078), (1.12, 0.064)], M['mail'])
    with bone(f'forearm_{s}'):
        forearm = [(-0.2, 0.058), (0.3, 0.068), (1.0, 0.06)]
        tube(f'forearm-{side}', elbow, wrist, forearm, [M['tunic'], M['leather']], [0, 1])
    ahead = (wrist - elbow).normalized()
    up = (Vector(fist_up) - Vector(fist_up).dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    with bone(f'hand_{s}'):
        box(f'fist-{side}', fist, [ahead, up, across], (0.046, 0.05, 0.05), M['skin'], 0.88)
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', fist)


def arms():
    arm('right', R_SHOULDER, R_ELBOW, R_WRIST, R_FIST, SPEAR)
    arm('left', L_SHOULDER, L_ELBOW, L_WRIST, L_FIST, V(0.3, -0.5, 0.8))


# Head --------------------------------------------------------------------------------------------

HEAD_Y = 0.03  # the centre of his head, front to back
NECK = V(0, 0.05, 1.25)


def head():
    with bone('head'):
        features()
        helm()
        plume()
        hair()
    joint('neck', NECK)
    joint('crown', HELM_TOP)


def features():
    # The back and sides of his head, under the helm; the face is a plate in front of it.
    rings = [ellipse(0, HEAD_Y + 0.005, z, 0.098, 0.1, 8, 22.5) for z in (1.24, 1.41)]
    verts, faces, _ = loft(rings)
    part('skull', verts, faces, M['hair'], inside=lambda c: V(0, HEAD_Y, c.z))

    # The face: a shallow pyramid of planes round the root of the nose, from under the helm's brim
    # round the cheekbones to the chin.
    rim = [
        V(-0.08, -0.074, 1.405), V(0.08, -0.074, 1.405), V(0.098, -0.042, 1.34), V(0.062, -0.077, 1.278),
        V(0, -0.096, 1.252), V(-0.062, -0.077, 1.278), V(-0.098, -0.042, 1.34),
    ]
    root = V(0, -0.113, 1.362)
    plate = [(rim[i], rim[(i + 1) % 7], root) for i in range(7)]
    part('face', rim + [root], [(i, (i + 1) % 7, 7) for i in range(7)], M['skin'], outward=V(0, -1, 0))

    # Eyes in the shade of the brim, laid just proud of the plate.
    for s in (-1, 1):
        corners = [(s * 0.02, 1.375), (s * 0.066, 1.38), (s * 0.045, 1.36)]
        verts = [V(x, on_surface(plate, x, z) - 0.005, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A straight nose from under the brow to its tip.
    top, tip = V(0, -0.104, 1.398), V(0, -0.142, 1.33)
    left, right, under = V(-0.026, -0.108, 1.334), V(0.026, -0.108, 1.334), V(0, -0.116, 1.322)
    verts = [top, tip, left, right, under]
    part('nose', verts, [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)], M['skin'], inside=V(0, -0.08, 1.36))

    # Stern brows: a bar under the brim, lower in the middle.
    sections = [
        [V(x, -0.072, 1.414 + dz), V(x, -0.11, 1.398 + dz), V(x, -0.078, 1.384 + dz)]
        for x, dz in ((-0.088, 0.0), (0, -0.008), (0.088, 0.0))
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brows', verts, faces, M['hair'], inside=V(0, -0.06, 1.39))

    # A short fair beard along the jaw.
    upper = [V(-0.099, -0.036, 1.335), V(-0.068, -0.083, 1.283), V(0, -0.105, 1.258), V(0.068, -0.083, 1.283),
             V(0.099, -0.036, 1.335)]
    lower = [V(-0.088, -0.022, 1.275), V(-0.056, -0.078, 1.228), V(0, -0.1, 1.204), V(0.056, -0.078, 1.228),
             V(0.088, -0.022, 1.275)]
    verts, faces, _ = loft([upper, lower], closed=False)
    part('beard', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z + 0.02))


# A tall helm of eight facets, round-shouldered, on a brass band: z and radius from the brim up.
HELM = [(1.398, 0.124), (1.445, 0.124), (1.45, 0.113), (1.53, 0.105), (1.59, 0.066)]
HELM_TOP = V(0, HEAD_Y, 1.628)


def helm():
    rings = [ellipse(0, HEAD_Y, z, r, r, 8, 0) for z, r in HELM]
    verts, faces, bands = loft(rings)
    face_mats = [0 if b < 1 else 1 for b in bands]
    last = (len(HELM) - 1) * 8
    verts.append(HELM_TOP)
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    face_mats += [1] * 8
    part('helm', verts, faces, [M['trim'], M['steel']], face_mats, inside=V(0, HEAD_Y, 1.42))

    # Cheek-guards hanging from the brim beside his face.
    for s in (-1, 1):
        verts = [V(s * 0.121, -0.065, 1.405), V(s * 0.121, 0.055, 1.405), V(s * 0.11, 0.035, 1.3),
                 V(s * 0.106, -0.052, 1.3)]
        part(f'cheek-guard-{s}', verts, [(0, 1, 2, 3)], M['steel'], outward=V(s, 0, 0))


def plume():
    # The white horse-tail springs from the crest, arcs back and falls down his back.
    joints = [V(0, HEAD_Y, 1.61), V(0, 0.09, 1.665), V(0, 0.17, 1.655), V(0.005, 0.245, 1.575),
              V(0.01, 0.28, 1.45), V(0.012, 0.28, 1.33)]
    radii = [(0.024, 0.02), (0.036, 0.028), (0.046, 0.032), (0.05, 0.032), (0.046, 0.03), (0.036, 0.026)]
    limb('plume', joints, radii, M['plume'], n=4, phase=0, side=V(1, 0, 0), tip=V(0.012, 0.265, 1.21))


def hair():
    # Long flaxen hair from under the helm down over his cloak, in locks.
    def level(z, rx, ry, cy, angles, zs=None):
        return [V(rx * math.cos(math.radians(a)), cy + ry * math.sin(math.radians(a)), zs[i] if zs else z)
                for i, a in enumerate(angles)]

    angles = [0, 45, 90, 135, 180]
    rows = [
        level(1.405, 0.118, 0.118, HEAD_Y, angles),
        level(1.27, 0.14, 0.165, 0.05, angles),
        level(0, 0.165, 0.25, 0.05, [15, 52, 90, 128, 165], [1.19, 1.14, 1.12, 1.14, 1.19]),
    ]
    verts, faces, _ = loft(rows, closed=False)
    # A lock hanging from the ends between each pair of points.
    start = (len(rows) - 1) * len(angles)
    for i in range(len(angles) - 1):
        mid = (verts[start + i] + verts[start + i + 1]) / 2
        verts.append(mid + 0.02 * V(mid.x, mid.y - 0.05, 0).normalized() - V(0, 0, 0.07))
        faces.append((start + i, start + i + 1, len(verts) - 1))
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z))

    # A braid from under each cheek-guard down over the front of his cloak, so his fair hair shows
    # from the front too.
    for s in (-1, 1):
        joints = [V(s * 0.105, -0.01, 1.35), V(s * 0.143, -0.112, 1.2), V(s * 0.146, -0.15, 1.085)]
        limb(f'braid-{s}', joints, [0.024, 0.027, 0.024], M['hair'], n=3, phase=90 * s,
             tip=V(s * 0.14, -0.152, 1.03))


# Team colour: his cloak, a mantle over the shoulders and a cape down his back ---------------------


def mantle():
    with bone('spine'):
        shoulders()


def shoulders():
    neck_z = [1.245, 1.255, 1.265, 1.255, 1.245, 1.225, 1.215, 1.225]
    neck = ellipse(0, 0.055, 0, 0.112, 0.11, 8, 0, neck_z)
    dome = ellipse(0, 0.05, 0, 0.235, 0.17, 8, 0, [z - 0.04 for z in neck_z])
    shoulder_z = [1.13, 1.14, 1.15, 1.14, 1.13, 1.13, 1.125, 1.13]
    shoulder = ellipse(0, 0.05, 0, 0.31, 0.205, 8, 0, shoulder_z)
    hem = ellipse(0, 0.05, 0, 0.30, 0.195, 8, 0, [z - 0.05 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('mantle', verts, faces, M['team'], inside=V(0, 0.05, 1.05))


def cape():
    with bone('cape'):
        folds()
    # It hangs from his upper back, so it can stream out behind him.
    joint('cape_top', V(0, 0.2, 1.13))
    joint('cape_hem', V(0, 0.27, 0.83))


def folds():
    # Down his back to the saddle, narrow enough that the horse's quarters show round it from
    # behind. Each level: z at the middle and at the edges, half-width, half-depth, centre y, how
    # far short of the sides it stops (degrees) and how deep the folds are.
    levels = [
        (1.13, 1.13, 0.27, 0.20, 0.05, 30, 0.0),
        (0.97, 0.99, 0.23, 0.19, 0.06, 24, 0.02),
        (0.83, 0.86, 0.215, 0.20, 0.07, 20, 0.03),
    ]
    rings = []
    for middle, edge, rx, ry, cy, spread, fold in levels:
        ring = []
        for i in range(9):
            a = math.radians(spread + (180 - 2 * spread) * i / 8)
            k = 1 + (fold / ry if i % 2 else 0)
            z = edge + (middle - edge) * math.sin(a) ** 2
            ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('cape', verts, faces, M['team'], inside=lambda c: V(0, 0.05, c.z))


# Spear and reins, made after he leans ---------------------------------------------------------------


def spear():
    with bone('hand_r'):
        point, u = spear_parts()
    # Held by the grip, its point up the shaft and the flat of its head across.
    hold('r', LEANING @ R_FIST, point, point + 0.1 * u)


def spear_parts():
    grip = LEANING @ R_FIST
    along = SPEAR
    butt, top = grip - 0.46 * along, grip + 0.7 * along
    tube('shaft', butt, top, [(0, 0.019), (1, 0.017)], M['wood'])
    # A steel spike at the butt.
    ring = [butt + p for p in (0.02 * v for v in (V(1, 0, 0), V(0, 1, 0), V(-1, 0, 0), V(0, -1, 0)))]
    verts = ring + [butt - 0.06 * along]
    part('butt', verts, [(i, (i + 1) % 4, 4) for i in range(4)], M['steel'], inside=butt + 0.01 * along)
    # A long leaf-shaped head on a socket.
    u, v = frame(along)
    stations = [(0.0, 0.022, 0.022), (0.05, 0.02, 0.02), (0.1, 0.05, 0.022), (0.2, 0.034, 0.016)]
    rings = []
    for t, wide, thick in stations:
        c = top + t * along
        rings.append([c + wide * u, c + thick * v, c - wide * u, c - thick * v])
    verts, faces, bands = loft(rings)
    point, last = top + 0.3 * along, (len(rings) - 1) * 4
    verts.append(point)
    faces += [(last + i, last + (i + 1) % 4, len(verts) - 1) for i in range(4)]
    face_mats = [0 if b == 0 else 1 for b in bands] + [1] * 4
    part('spearhead', verts, faces, [M['trim'], M['steel']], face_mats, inside=nearest_on_polyline([top, point]))
    return point, u


def reins(mount):
    # From the bits to his hand, by way of points beside the neck: each end follows what it is
    # held by, the bit the horse's head and the other end his hand, and the middle the neck.
    hand = LEANING @ L_FIST
    for s, bit in zip((-1, 1), mount.bits):
        mid = mount.turned(V(s * 0.125, -0.52, 0.92))
        held = hand + V(-s * 0.012, 0.0, -0.01)
        path = [bit, mid, held]
        width = V(0, 0, 0.012)
        verts = [p + width for p in path] + [p - width for p in path]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4)]

        def end(p, bit=bit, held=held):
            return 'mount_head' if (p - bit).length < 0.02 else 'hand_l' if (p - held).length < 0.02 else None

        with bone('mount_neck', follows=end):
            part(f'rein-{s}', verts, faces, M['leather'], outward=V(s, 0, 0))


# His clips (../clips.py), the library's mounted ones: the horse on its own bones and he riding it.
# The victory's rear takes 1.0 s rather than the style's 1.2, so the horse is down and standing by
# the time the fight's playback stops, 1 s after the end.
CLIPS = tweened({
    'idle': ('saddle', {}),
    'move': ('gallop', {}),
    'attack': ('spear', {}),
    'cast': ('spear', {}),
    'stun': ('reel', {}),
    'death': ('fall', {}),
    'victory': ('rear', {'seconds': 1.0}),
})


def build(shield=None):
    """Makes him and his horse in a fresh scene, every part bound to its bone and the joints marked,
    and returns the rig to finish() them with. His 2★ model (eomer-2.py) passes its shield as
    `shield`, a function that makes it on his left arm, before he leans."""
    reset()
    make_materials()
    mount = horse(COAT, POINTS, blaze=BLAZE, stripe=True, tack='saddle-cloth', raised='left', turn=20, rigged=True)
    rider_legs()
    fixed = set(bpy.context.scene.objects)
    torso()
    arms()
    if shield is not None:
        shield()
    head()
    mantle()
    cape()
    for obj in bpy.context.scene.objects:
        if obj not in fixed:
            obj.data.transform(LEANING)
    spear()
    reins(mount)
    return Rig(kind='mounted', mount=mount.rig, bones={'cape': ('spine', 'cape_top', 'cape_hem')}, clips=CLIPS)


def main():
    finish('eomer', budget=MOUNTED_BUDGET, rig=build())


if __name__ == '__main__':
    main()
