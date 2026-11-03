"""Gamling the Old, of Rohan, on his dark bay horse: a Rider who sounds the Horn of the Hornburg
(docs/viewer-spec.md section 4).

Built like Gimli (gimli.py), the reference, and seated as Éomer is (eomer.py), on the shared horse
from ../mounts.py: every form a low-segment shape or a hand-placed set of vertices, shaded flat.
From the books: an old Rider, a captain of the men of the Westfold at Helm's Deep, where the great
horn of Helm sounds. His horse is a dark bay, a dark brown body with black mane, tail and legs and a
small white star, standing square on all four hooves. He sits upright in a green tunic with mail
sleeves, a long grey beard down his chest and long grey hair down his back under a tall pointed
helm, and holds up a great ivory horn bound in metal in his left fist, ready to sound, its bell
above his helm. The team colour is his cloak, a mantle over the shoulders and a cape down his back,
and the horse's saddle-cloth and breast strap; everything else is muted green, grey, gold and earth.
Beside the other mounted Rohirrim he is the horn on his left, the iron-grey hair, the spike on his
helm and the dark horse: Éomer has a spear, a white plume and a dun, Théoden a sword in his right
hand, white hair, a crowned helm and a grey.

He is rigged as Éomer is (eomer.py, the reference rider): he and his horse are one model on one
armature, the horse rigged by horse() with bones of its own (mount_...) and his hips hanging from
its body. His clips are the library's mounted ones, his left hand, with the horn, leading: the horse
stands, gallops a stride a hex, hangs its head when stunned, goes down with him and rears when they
win. With no weapon in his hands, he fights with his horse, which rears and strikes down with its
forefeet (trample); his cast, the Horn of the Hornburg, sets the horn to his lips as the horse
half-rears (sound). To bend, his legs are a thigh and a shin and his body a skirt on his hips and a
chest on his spine, split at rings they already had, so they cost no triangles. His long beard and
hair hang on bones of their own from his head (clips.hanging()), so they stay on his chest and back
as his head nods; his cape has its own bone too.

His fittings, the helm's band and spike, the horn's bands, the two round brooches that pin his cloak
on his shoulders and the horse's browband, use `trim`, which the client colours iron, silver or gold
by star level (docs/viewer-spec.md section 4, "Star levels"); the helm's and the horn's show from in
front, from behind and from above, and the brooches from behind and above. His 2★ model is
gamling-2.py, which imports this script and builds him with a long sword at his belt (build()), and
his 3★ model gamling-3.py.

    blender --background --factory-startup --python-exit-code 1 --python gamling.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, on the reins, is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from clips import fit, hanging  # noqa: E402
from kit import (  # noqa: E402
    BOOTS,
    EYES,
    LEATHER,
    MAIL,
    MOUNTED_BUDGET,
    STEEL,
    V,
    bent_tube,
    bone,
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
    team_material,
    trim_material,
    tube,
    wind,
)
from mounts import head_ring, head_row, horse  # noqa: E402
from rig import Rig, hold, joint  # noqa: E402

# Gamling's own colours (sRGB); the rest come from the kit.
COAT = 0x5C3B27  # his horse, a dark bay
POINTS = 0x231D1A  # the bay's black mane, tail and lower legs
STAR = 0xE6E1D4  # the small white star on its brow
SKIN = 0xD39C7E
HAIR = 0x9C978F  # iron grey, darker than Théoden's white so the two old men part at a glance
TUNIC = 0x56653F  # the green of Rohan, muted
IVORY = 0xDDD0AE  # the horn, old ivory

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
        horn=material('horn', IVORY, roughness=0.6),
        hollow=material('hollow', EYES, roughness=0.9),  # the dark inside of the horn's bell
        eyes=material('eyes', EYES, roughness=0.6),
        # Fittings: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
    )


# Rider -------------------------------------------------------------------------------------------

LEAN = 3  # degrees his body above the saddle leans forward
PIVOT = V(0, 0.05, 0.80)
LEANING = Matrix.Translation(PIVOT) @ Matrix.Rotation(math.radians(LEAN), 4, 'X') @ Matrix.Translation(-PIVOT)

# The body as a barrel of octagons: z, half-width, half-depth and centre y. It is in two pieces,
# which bend at the belt, as Éomer's: the skirt and the belt on his hips, and the chest on his
# spine, from a ring inside the belt (WAIST) up to his neck. Above the chest the body is hidden under
# the mantle, so it runs straight to the neck.
TORSO = [
    (0.75, 0.165, 0.125, 0.06),  # in the saddle, round the hips
    (0.915, 0.172, 0.12, 0.05),  # belt, lower edge
    (0.965, 0.18, 0.124, 0.05),  # belt, upper edge
]
CHEST = [
    (0.925, 0.164, 0.112, 0.05),  # inside the belt
    (1.08, 0.205, 0.132, 0.04),  # chest, inside the mantle's hem
    (1.245, 0.072, 0.068, 0.06),  # neck
]
TORSO_BANDS = [0, 1]  # the tunic, then the belt
PELVIS, WAIST = V(0, 0.05, 0.80), V(0, 0.05, 0.94)  # the pelvis at the lean's pivot


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    with bone('hips'):
        part('skirt', verts, faces, [M['tunic'], M['leather']], face_mats, inside=lambda c: V(0, 0.05, c.z))
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in CHEST]
    verts, faces, _ = loft(rings)
    with bone('spine'):
        part('chest', verts, faces, M['tunic'], inside=lambda c: V(0, 0.05, c.z))
    joint('pelvis', PELVIS)
    joint('waist', WAIST)


# His legs astride the horse, as Éomer's: thighs forward and down along the saddle, boots hanging.
HIP, KNEE, ANKLE = V(0.115, 0.03, 0.83), V(0.305, -0.11, 0.665), V(0.31, -0.025, 0.43)
KNEE_OVERLAP = 0.03  # how far the thigh runs on past the knee, and the shin starts above it


def rider_legs():
    # Each leg as it was built, through the hip, knee and ankle, but in two at the knee ring: the
    # thigh carried on past it along its band, the shin from above it, so the knee can bend.
    for s in (-1, 1):
        flip = V(s, 1, 1)
        side = 'l' if s > 0 else 'r'
        hip, knee, ankle = (Vector(p * flip) for p in (HIP, KNEE, ANKLE))
        rings = path_rings([hip, knee, ankle], [0.078, 0.062, 0.05], side=V(0, 1, 0))
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


# Arms: mail sleeves, the tunic at the elbow, leather bracers, big fists. The right hand holds the
# reins over the withers; the left is raised beside his head with the horn.
R_SHOULDER, R_ELBOW = V(-0.225, 0.05, 1.15), V(-0.29, 0.03, 0.965)
R_WRIST, R_FIST = V(-0.19, -0.085, 0.93), V(-0.15, -0.13, 0.925)
L_SHOULDER = V(0.225, 0.05, 1.16)  # a little raised, with the arm
UPPER_ARM, FOREARM = 0.2, 0.2
L_POLE = V(1, 0.35, -0.45)  # the way his left elbow points: out, back and down


def elbow(shoulder, fist, pole):
    """Where the elbow goes for an arm from `shoulder` to `fist`, bent towards `pole`."""
    d = fist - shoulder
    reach = min(d.length, UPPER_ARM + FOREARM - 1e-3)
    along = (UPPER_ARM**2 - FOREARM**2 + reach**2) / (2 * reach)
    out = math.sqrt(max(UPPER_ARM**2 - along**2, 0.0))
    d.normalize()
    bend = (pole - pole.dot(d) * d).normalized()
    return shoulder + along * d + out * bend


def arm(side, shoulder, elbow, wrist, fist, fist_up):
    """A mail sleeve, a leather bracer and a big fist, each on its bone, and the arm's joints."""
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
        box(f'fist-{side}', fist, [ahead, up, across], (0.048, 0.052, 0.052), M['skin'], 0.88)
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', fist)


# Head --------------------------------------------------------------------------------------------

HEAD_Y = 0.03  # the centre of his head, front to back
NECK = V(0, 0.05, 1.25)
MOUTH = V(0, -0.167, 1.288)  # in front of his lips and moustache, where he sets the horn
# His beard and his hair hang from his head on bones of their own (clips.hanging()): the beard from
# the middle of its top down to its point, the hair from the middle of his head under the helm's
# brim down to its ends.
BEARD_ROOT, BEARD_TIP = V(0, -0.07, 1.30), V(0, -0.164, 0.895)
HAIR_ROOT, HAIR_TIP = V(0, 0.05, 1.40), V(0, 0.31, 1.0)


def head():
    with bone('head'):
        features()
        moustache()
        helm()
    with bone('beard'):
        beard()
    with bone('hair'):
        hair()
    joint('neck', NECK)
    joint('crown', HELM_TOP)
    joint('mouth', MOUTH)
    joint('beard_root', BEARD_ROOT)
    joint('beard_tip', BEARD_TIP)
    joint('hair_root', HAIR_ROOT)
    joint('hair_tip', HAIR_TIP)


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

    # Deep-set eyes under the brows, laid just proud of the plate.
    for s in (-1, 1):
        corners = [(s * 0.02, 1.372), (s * 0.066, 1.377), (s * 0.045, 1.357)]
        verts = [V(x, on_surface(plate, x, z) - 0.005, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A long nose with a hump, its tip over the moustache.
    top, hump, tip = V(0, -0.104, 1.398), V(0, -0.136, 1.368), V(0, -0.152, 1.318)
    left, right, under = V(-0.028, -0.108, 1.322), V(0.028, -0.108, 1.322), V(0, -0.118, 1.308)
    verts = [top, hump, tip, left, right, under]
    faces = [(0, 3, 1), (0, 1, 4), (1, 3, 2), (1, 2, 4), (3, 5, 2), (5, 4, 2)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.08, 1.35))

    # Bushy grey brows: a bar under the brim, low in the middle, its ends tufted out and down.
    sections = [
        [V(x, -0.07 + dy, 1.418 + dz), V(x, -0.118 + dy, 1.40 + dz), V(x, -0.078 + dy, 1.38 + dz)]
        for x, dy, dz in ((-0.112, 0.02, -0.018), (0, 0.0, -0.008), (0.112, 0.02, -0.018))
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brows', verts, faces, M['hair'], inside=V(0, -0.06, 1.39))


def moustache():
    # Two long sweeps from under the nose, out and down over the beard.
    for s in (-1, 1):
        root = [V(s * 0.01, -0.118, 1.314), V(s * 0.01, -0.142, 1.298), V(s * 0.01, -0.114, 1.29)]
        mid = [V(s * 0.052, -0.114, 1.302), V(s * 0.052, -0.138, 1.282), V(s * 0.052, -0.108, 1.274)]
        tip = V(s * 0.088, -0.138, 1.215)
        verts = root + mid + [tip]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5), (3, 4, 6), (4, 5, 6), (5, 3, 6)]
        part(f'moustache-{s}', verts, faces, M['hair'], inside=sum(verts, Vector()) / len(verts))


def beard():
    # Long and grey, from the cheeks over the mantle down his chest, in three locks (a W in section).
    # Each level runs from his right side across the front to his left.
    half = [  # (x, y, z) of the right-side back, the lock's ridge, the valley; then the centre ridge
        [(-0.104, -0.03, 1.35), (-0.10, -0.07, 1.31), (-0.06, -0.10, 1.285), (0.0, -0.114, 1.278)],
        [(-0.124, -0.06, 1.20), (-0.12, -0.14, 1.178), (-0.06, -0.162, 1.172), (0.0, -0.176, 1.166)],
        [(-0.104, -0.11, 1.075), (-0.098, -0.172, 1.065), (-0.05, -0.184, 1.06), (0.0, -0.198, 1.055)],
        [(-0.064, -0.13, 0.975), (-0.06, -0.176, 0.972), (-0.03, -0.18, 0.97), (0.0, -0.19, 0.968)],
        [(-0.022, -0.14, 0.9), (-0.02, -0.158, 0.898), (-0.01, -0.16, 0.897), (0.0, -0.164, 0.895)],
    ]
    rings = []
    for level in half:
        right = [V(*p) for p in level]
        left = [V(-p.x, p.y, p.z) for p in reversed(right[:-1])]
        rings.append(right + left)
    verts, faces, _ = loft(rings, closed=False)
    part('beard', verts, faces, M['hair'], inside=lambda c: V(0, -0.05, c.z))


def hair():
    # Long grey hair from under the helm, round the sides of his face and down his back over the
    # cloak, ending in locks.
    def level(z, rx, ry, cy, angles, zs=None):
        return [V(rx * math.cos(math.radians(a)), cy + ry * math.sin(math.radians(a)), zs[i] if zs else z)
                for i, a in enumerate(angles)]

    rows = [
        level(1.405, 0.118, 0.118, HEAD_Y, [-20, 40, 90, 140, 200]),
        level(1.28, 0.148, 0.16, 0.05, [-12, 45, 90, 135, 192]),
        level(1.15, 0.15, 0.228, 0.05, [30, 60, 90, 120, 150]),
        level(0, 0.11, 0.258, 0.05, [52, 71, 90, 109, 128], [1.08, 1.045, 1.02, 1.045, 1.08]),
    ]
    verts, faces, _ = loft(rows, closed=False)
    start = (len(rows) - 1) * 5
    for i in range(4):
        mid = (verts[start + i] + verts[start + i + 1]) / 2
        verts.append(mid + 0.02 * V(mid.x, mid.y - 0.05, 0).normalized() - V(0, 0, 0.07))
        faces.append((start + i, start + i + 1, len(verts) - 1))
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z))


# A tall pointed helm of eight facets on a band, with a spike on top: z and radius from the brim up.
HELM = [(1.398, 0.124), (1.445, 0.124), (1.45, 0.114), (1.535, 0.094), (1.60, 0.05)]
HELM_TOP = V(0, HEAD_Y, 1.642)


def helm():
    rings = [ellipse(0, HEAD_Y, z, r, r, 8, 0) for z, r in HELM]
    verts, faces, bands = loft(rings)
    face_mats = [0 if b < 1 else 1 for b in bands]
    last = (len(HELM) - 1) * 8
    verts.append(HELM_TOP)
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    face_mats += [1] * 8
    part('helm', verts, faces, [M['trim'], M['steel']], face_mats, inside=V(0, HEAD_Y, 1.42))
    cone('helm-spike', HELM_TOP - V(0, 0, 0.02), HELM_TOP + V(0, 0, 0.06), 0.02, M['trim'], n=4, back=None)


# Team colour: his cloak, a mantle over the shoulders and a cape down his back ---------------------

BROOCHES = [(1, 30), (-1, 180)]  # each brooch's side, and its angle round the mantle from +X


def mantle_point(ring, angle):
    """The point of an eight-point mantle ring at `angle` degrees round from +X."""
    k = angle / 45
    i = int(k) % 8
    return ring[i].lerp(ring[(i + 1) % 8], k - int(k))


def mantle():
    with bone('spine'):
        shoulders()


def shoulders():
    # Eight points round from his left (+X); the left shoulder is lifted by his raised arm.
    neck_z = [1.245, 1.255, 1.265, 1.255, 1.245, 1.225, 1.215, 1.225]
    neck = ellipse(0, 0.055, 0, 0.112, 0.11, 8, 0, neck_z)
    dome = ellipse(0, 0.05, 0, 0.235, 0.17, 8, 0, [z - 0.04 for z in neck_z])
    shoulder_z = [1.19, 1.17, 1.15, 1.14, 1.13, 1.13, 1.125, 1.16]
    shoulder = ellipse(0, 0.05, 0, 0.31, 0.205, 8, 0, shoulder_z)
    hem = ellipse(0, 0.05, 0, 0.30, 0.195, 8, 0, [z - 0.05 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('mantle', verts, faces, M['team'], inside=V(0, 0.05, 1.05))

    # A round brooch on top of each shoulder, pinning the cape to the mantle: a low six-sided boss
    # on the slope between the dome and the shoulder, facing up and out, so it shows from in front,
    # from behind and from above. The left one sits back a little, behind his raised arm.
    for s, angle in BROOCHES:
        top, edge = mantle_point(dome, angle), mantle_point(shoulder, angle)
        out = V(edge.x, edge.y - 0.05, 0).normalized()
        normal = (out * (top.z - edge.z) + V(0, 0, (edge - top).to_2d().length)).normalized()
        at = top.lerp(edge, 0.45)
        cone(f'brooch-{s}', at - 0.004 * normal, at + 0.018 * normal, 0.036, M['trim'], n=6, back=None)


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


# The horn, raised in his left fist -------------------------------------------------------------------

# Its centre line, a crescent from the mouthpiece, pointing in at his face, down through his fist and
# up to the bell above his helm, which opens upwards, outwards and a little back, so the curve shows
# from the side too: the control points of a cubic.
HORN_CURVE = [V(0.22, -0.14, 1.37), V(0.42, -0.13, 1.27), V(0.58, -0.05, 1.43), V(0.65, 0.09, 1.73)]
HORN = [  # how far along the curve, the radius, and whether the band from there is a metal fitting
    (0.0, 0.018, True),  # the mouthpiece
    (0.07, 0.02, False),
    (0.33, 0.03, False),
    (0.56, 0.046, True),  # a band
    (0.62, 0.051, False),
    (0.86, 0.068, False),
    (0.93, 0.076, True),  # the rim of the bell
    (1.0, 0.094, None),
]
HORN_GRIP = 0.33  # where his fist holds it


def horn_at(t):
    """The point of the horn's centre line at t, and the way it runs there."""
    a, b, c, d = HORN_CURVE
    p = (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t**3 * d
    ahead = 3 * (1 - t) ** 2 * (b - a) + 6 * (1 - t) * t * (c - b) + 3 * t * t * (d - c)
    return p, ahead.normalized()


def great_horn():
    points = [horn_at(t)[0] for t, _, _ in HORN]
    radii = [r for _, r, _ in HORN]
    band_mats = [0 if fitting else 1 for _, _, fitting in HORN[:-1]]
    bell, ahead = horn_at(1.0)
    with bone('hand_l'):
        bent_tube('horn', points, radii, [M['trim'], M['horn']], band_mats, n=6, start='cap')

        # The dark hollow of the bell: a shallow funnel inside the rim.
        verts = path_rings(points, radii, 6)[-1] + [bell - 0.07 * ahead]
        faces = wind(verts, [(i, (i + 1) % 6, 6) for i in range(6)], outward=ahead)
        part('horn-hollow', verts, faces, M['hollow'])

    fist, along = horn_at(HORN_GRIP)
    bend = elbow(L_SHOULDER, fist, L_POLE)
    wrist = fist + (bend - fist).normalized() * 0.05
    arm('left', L_SHOULDER, bend, wrist, fist, along)
    # Held by the grip in his fist, up to the bell, its front turned away from the mouthpiece; and
    # the mouthpiece, which he sets to his lips as he sounds it (clips.py, sound).
    axis = (bell - fist).normalized()
    piece = HORN_CURVE[0] - fist
    away = -(piece - piece.dot(axis) * axis).normalized()
    hold('l', fist, bell, bell + 0.1 * away)
    joint('mouthpiece', HORN_CURVE[0])


# Reins and the horse's star, which don't lean with him ----------------------------------------------


def reins(mount):
    # From the bits to his right hand, by way of points beside the neck: each end follows what it is
    # held by, the bit the horse's head and the other end his hand, and the middle the neck.
    hand = LEANING @ R_FIST
    for s, bit in zip((-1, 1), mount.bits):
        mid = mount.turned(V(s * 0.125, -0.52, 0.92))
        held = hand + V(-s * 0.012, 0.0, -0.01)
        path = [bit, mid, held]
        width = V(0, 0, 0.012)
        verts = [p + width for p in path] + [p - width for p in path]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4)]

        def end(p, bit=bit, held=held):
            return 'mount_head' if (p - bit).length < 0.02 else 'hand_r' if (p - held).length < 0.02 else None

        with bone('mount_neck', follows=end):
            part(f'rein-{s}', verts, faces, M['leather'], outward=V(s, 0, 0))


def star(mount):
    """A small white star on the horse's face, below the forelock."""
    top = head_ring(*head_row(0.37), grow=0.006)
    middle = head_ring(*head_row(0.42), grow=0.006)
    bottom = head_ring(*head_row(0.47), grow=0.006)
    verts = [top[0], middle[0].lerp(middle[1], 0.28), bottom[0], middle[0].lerp(middle[5], 0.28)]
    verts = [mount.turned(p) for p in verts]
    out = mount.turned(middle[0]) - mount.turned(head_ring(*head_row(0.43))[3])
    with bone('mount_head'):
        part('horse-star', verts, wind(verts, [(0, 1, 2), (0, 2, 3)], outward=out),
             material('blaze', STAR, roughness=0.9))


# His clips (../clips.py): the library's mounted ones, led by the hand with the horn, with his horse
# striking out for his attack (trample) and the horn sounded for his cast (sound). Stunned, he lets
# the horn down by his thigh; his horse's head, turned to its right, curls further round to its
# right as it falls (a negative roll), rather than sweeping across the front. When they win he holds
# the horn up far enough out (out) that its mouthpiece, which points in at him, clears his helm, and
# the rear takes 1.0 s rather than the style's 1.2, so the horse is down and standing by the time
# the fight's playback stops, 1 s after the end. His beard and hair hang from his head in every one
# (hanging()), and fit() keeps the great horn inside the hex.
CLIPS = hanging(hanging(fit({
    'idle': ('saddle', {'hand': 'l'}),
    'move': ('gallop', {'hand': 'l'}),
    'attack': ('trample', {'hand': 'l'}),
    'cast': ('sound', {'hand': 'l'}),
    'stun': ('reel', {'hand': 'l', 'low': 1.0}),
    'death': ('fall', {'hand': 'l', 'roll': -1.0}),
    'victory': ('rear', {'hand': 'l', 'out': 0.35, 'seconds': 1.0}),
}, between=True)), bone='hair')


def build(sword=None):
    """Makes him and his horse in a fresh scene, every part bound to its bone and the joints marked,
    and returns the rig to finish() them with. His 2★ model (gamling-2.py) passes its sword as
    `sword`, a function that makes it at his left hip, before he leans."""
    reset()
    make_materials()
    mount = horse(COAT, POINTS, tack='saddle-cloth', raised=None, turn=-18, rigged=True)
    star(mount)
    rider_legs()
    fixed = set(bpy.context.scene.objects)
    torso()
    arm('right', R_SHOULDER, R_ELBOW, R_WRIST, R_FIST, V(-0.3, -0.5, 0.8))
    head()
    mantle()
    cape()
    great_horn()
    if sword is not None:
        sword()
    for obj in bpy.context.scene.objects:
        if obj not in fixed:
            obj.data.transform(LEANING)
    reins(mount)
    bones = {'cape': ('spine', 'cape_top', 'cape_hem'), 'beard': ('head', 'beard_root', 'beard_tip'),
             'hair': ('head', 'hair_root', 'hair_tip')}
    return Rig(kind='mounted', mount=mount.rig, bones=bones, clips=CLIPS)


def main():
    finish('gamling', budget=MOUNTED_BUDGET, rig=build())


if __name__ == '__main__':
    main()
