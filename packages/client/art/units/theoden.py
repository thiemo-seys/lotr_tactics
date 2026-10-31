"""Théoden, King of Rohan, on Snowmane: a mounted Captain (docs/viewer-spec.md section 4).

Built like Gimli (gimli.py), the reference, and in the family of Éomer (eomer.py): every form a
low-segment shape or a hand-placed set of vertices, shaded flat. He rides Snowmane, the shared horse
from ../mounts.py in a light grey with darker grey points, one foreleg raised and the head turned
to its right, so that it shows under his raised sword from behind. He is an old king renewed: long
white hair, heavy white brows and a long white beard over his mail, under a steel helm ringed by a
gold circlet with points. A Captain, he holds Herugrim high to rally the Riders; a Rider, he charges with the golden
shield on his left arm and the reins in that hand. The team colour is his cloak, a mantle over the
shoulders and a cape down his back, and the horse's saddle-cloth and breast strap; everything else
is muted green, gold, grey and earth.

    blender --background --factory-startup --python-exit-code 1 --python theoden.py [-- <out.glb>]

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
    MOUNTED_BUDGET,
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
    tube,
)
from mounts import horse  # noqa: E402

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
        brass=material('brass', BRASS, roughness=0.55, metallic=0.1),
        wood=material('wood', WOOD, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
    )


# Rider -------------------------------------------------------------------------------------------

LEAN = 4  # degrees his body above the saddle leans forward, into the charge
PIVOT = V(0, 0.05, 0.80)
LEANING = Matrix.Translation(PIVOT) @ Matrix.Rotation(math.radians(LEAN), 4, 'X') @ Matrix.Translation(-PIVOT)

# The mail shirt as a barrel of octagons: z, half-width, half-depth and centre y. The belt is the
# band between the second and third rings.
TORSO = [
    (0.75, 0.165, 0.125, 0.06),  # in the saddle, round the hips
    (0.915, 0.17, 0.118, 0.05),  # belt, lower edge
    (0.965, 0.178, 0.122, 0.05),  # belt, upper edge
    (1.08, 0.205, 0.132, 0.04),  # chest
    (1.175, 0.20, 0.118, 0.05),  # shoulders
    (1.245, 0.072, 0.068, 0.06),  # neck
]
TORSO_BANDS = [0, 1, 0, 0, 0]  # mail, except the belt


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    part('torso', verts, faces, [M['mail'], M['leather']], face_mats, inside=lambda c: V(0, 0.05, c.z))


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
    part('helm', verts, faces, [M['brass'], M['steel']], face_mats, inside=V(0, HEAD_Y, 1.45))

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
        part(f'tine-{k}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['brass'],
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


# Team colour: his cloak, a mantle over the shoulders and a cape down his back ---------------------


def mantle():
    neck_z = [1.245, 1.255, 1.265, 1.255, 1.245, 1.225, 1.215, 1.225]
    neck = ellipse(0, 0.055, 0, 0.112, 0.11, 8, 0, neck_z)
    dome = ellipse(0, 0.05, 0, 0.235, 0.17, 8, 0, [z - 0.04 for z in neck_z])
    shoulder_z = [1.13, 1.14, 1.15, 1.14, 1.13, 1.13, 1.125, 1.13]
    shoulder = ellipse(0, 0.05, 0, 0.31, 0.205, 8, 0, shoulder_z)
    hem = ellipse(0, 0.05, 0, 0.30, 0.195, 8, 0, [z - 0.05 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('mantle', verts, faces, M['team'], inside=V(0, 0.05, 1.05))


def cape():
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
    band_mats = [1, 1, 0]  # gold, steel

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
    part('shield', verts, faces, [M['brass'], M['steel'], M['wood']], face_mats, inside=SHIELD_CENTRE)


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
    box('guard', guard, [along, across, thick], (0.016, 0.1, 0.022), M['brass'], 0.8)
    # A gold pommel under his fist.
    end = grip - 0.06 * along
    ring = [end + 0.026 * d for d in (across, thick, -across, -thick)]
    verts = ring + [end - 0.045 * along, end + 0.03 * along]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('pommel', verts, faces, M['brass'], inside=end)


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
    cape()
    shield()
    for obj in bpy.context.scene.objects:
        if obj not in fixed:
            obj.data.transform(LEANING)
    herugrim()
    reins(mount)
    finish('theoden', budget=MOUNTED_BUDGET)


main()
