"""Radagast the Brown, of the Istari: a Sorcerer, in the Faceted style (docs/viewer-spec.md section 4).

Drawn from the books, not the films: the wizard of Rhosgobel by Mirkwood, a master of shapes and
changes of hue, with much lore of herbs and beasts; birds are especially his friends. Gandalf's
people (gandalf.py): an old man robed to the ground, a beard and a broad hat, a little bent. But he
is stouter and rougher than Gandalf: an earth-brown robe with a ragged hem, a short mantle of moss
green with a leafy edge, a grey-brown beard, a wide floppy hat with a low rounded crown instead of
Gandalf's tall point, and a herb pouch at his hip.

A Sorcerer by his staff: a crooked branch, held in his left hand, still in leaf at its head. His
birds are his own mark: one on the crown of his hat, one on the staff's leaves with its wings up,
and one on his right fist, which he holds up before him.

About 1.45 to the hat's brim; the crown, the staff and the birds go higher. The team colour is his
hat, seen from every side and from above, and a sash round his middle knotted at his right hip, its
ends hanging down his robe. The birds stay greys and browns, and everything else is earth and moss.

    blender --background --factory-startup --python-exit-code 1 --python radagast.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, with the bird, is at -X.
"""

import math
import os
import sys
from itertools import pairwise

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOTS,
    EYES,
    LEATHER,
    WOOD,
    V,
    bent_tube,
    box,
    cone,
    ellipse,
    finish,
    icosphere,
    loft,
    lump,
    material,
    on_surface,
    part,
    reset,
    stoop,
    stooped,
    team_material,
    tube,
)

# Radagast's own colours (sRGB); the rest come from the kit. Browns and a muted, yellowish green,
# kept clear of the team colours and of Gandalf's greys.
ROBE = 0x7B6346  # earth-brown wool
MOSS = 0x5F6A45  # the mantle and the hat's band
LEAVES = 0x76844F  # the staff's leaves, lighter than the mantle
HAIR = 0x9C8B76  # grey-brown
SKIN = 0xD3A182  # weathered
PLUMAGE = 0x9E9080  # the birds' backs: a light, warm grey-brown
BREAST = 0xE2D3B5  # their pale buff breasts
BEAK = 0x3B3129

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        robe=material('robe', ROBE, roughness=0.9),
        moss=material('moss', MOSS, roughness=0.9),
        leaves=material('leaves', LEAVES, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.9),
        skin=material('skin', SKIN, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
        boots=material('boots', BOOTS, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        wood=material('wood', WOOD, roughness=0.85),
        plumage=material('plumage', PLUMAGE, roughness=0.9),
        breast=material('breast', BREAST, roughness=0.9),
        beak=material('beak', BEAK, roughness=0.6),
    )


# Helpers -------------------------------------------------------------------------------------------

# He stoops: above the small of his back the body is carried forward, more the higher it is, by all
# of STOOP from the base of his neck up.
STOOP_FROM, STOOP_TO, STOOP = 0.6, 1.15, 0.06


def bent(point):
    """Where the stoop carries a point of the body built upright."""
    return stooped(point, STOOP_FROM, STOOP_TO, STOOP)


def since(before):
    """The objects made since `before`, a set of the scene's objects."""
    return [o for o in bpy.context.scene.objects if o not in before]


def carry(objects, offset):
    for obj in objects:
        obj.data.transform(Matrix.Translation(offset))


def tilt(objects, pivot, back, side=0.0):
    """Tips objects back (towards +Y) by `back` degrees and to his left (+X) by `side` degrees."""
    rotation = Matrix.Rotation(math.radians(side), 4, 'Y') @ Matrix.Rotation(math.radians(-back), 4, 'X')
    turning = Matrix.Translation(pivot) @ rotation @ Matrix.Translation(-pivot)
    for obj in objects:
        obj.data.transform(turning)


# Birds ---------------------------------------------------------------------------------------------


def bird(name, seat, facing, size=1.0, wings=0.0, tilt_up=18.0):
    """A chunky little bird perched with its feet at `seat`, facing along `facing` (a direction in the
    ground plane): a round body with a buff breast, a round head, a short dark beak and a cocked tail.
    `wings` above 0 raises its wings that high, as it balances on a swaying perch. Its body tips up
    at the front by `tilt_up` degrees."""
    f = V(facing[0], facing[1], 0).normalized()
    u = V(0, 0, 1)
    s = f.cross(u)  # its right
    tip = Matrix.Rotation(math.radians(tilt_up), 3, s)  # raises the front
    unit, faces = icosphere(0)

    def place(p, radii, centre):
        return centre + tip @ (p.x * radii[0] * f + p.y * radii[1] * s + p.z * radii[2] * u)

    # The body: an egg, longer than it is wide; its faces to the front and below are the breast.
    centre = Vector(seat) + 0.044 * size * u
    radii = (0.06 * size, 0.046 * size, 0.046 * size)
    verts = [place(p, radii, centre) for p in unit]
    face_mats = []
    for face in faces:
        c = sum((unit[i] for i in face), Vector()) / 3
        face_mats.append(1 if c.x > 0.2 and c.z < 0.4 else 0)
    part(f'{name}-body', verts, faces, [M['plumage'], M['breast']], face_mats, inside=centre)

    # The head, forward and up on the body, with a buff throat.
    head = centre + tip @ (0.05 * size * f + 0.04 * size * u)
    verts = [place(p, (0.036 * size,) * 3, head) for p in unit]
    face_mats = []
    for face in faces:
        c = sum((unit[i] for i in face), Vector()) / 3
        face_mats.append(1 if c.x > 0.3 and c.z < -0.15 else 0)
    part(f'{name}-head', verts, faces, [M['plumage'], M['breast']], face_mats, inside=head)
    cone(f'{name}-beak', head + 0.026 * size * f, head + 0.066 * size * f - 0.006 * size * u,
         0.014 * size, M['beak'], n=4, phase=45, back=None)

    # The tail, cocked up behind.
    root = centre + tip @ (-0.05 * size * f + 0.012 * size * u)
    end = root - 0.072 * size * f + 0.06 * size * u
    verts = [root + 0.024 * size * s, root - 0.024 * size * s, end - 0.042 * size * s, end + 0.042 * size * s]
    part(f'{name}-tail', verts, [(0, 1, 2, 3)], M['plumage'], outward=u + f)

    if wings > 0:
        for k in (-1, 1):
            shoulder = centre + tip @ (0.026 * size * u + 0.03 * k * size * s)
            verts = [
                shoulder + 0.026 * size * f,
                shoulder + 0.105 * k * size * s + wings * u - 0.01 * size * f,
                shoulder + 0.065 * k * size * s + 0.6 * wings * u - 0.065 * size * f,
                shoulder - 0.035 * size * f,
            ]
            part(f'{name}-wing-{k}', verts, [(0, 1, 2, 3)], M['plumage'], outward=k * s)


# Body: a stout robe to the ground, a sash round his middle and a short mantle -------------------------

# Heavy boots, of which only the toes show under the hem.
RIGHT_ANKLE, RIGHT_YAW = V(-0.105, -0.16, 0.10), -14
LEFT_ANKLE, LEFT_YAW = V(0.11, -0.14, 0.10), 10
BOOT_RINGS = [  # height, then the right half of the outline: side, heel, toe
    (0.0, [(0.076, -0.02), (0.064, 0.07), (0.06, -0.146)]),
    (0.13, [(0.07, 0.0), (0.06, 0.066), (0.054, -0.06)]),
]


def boot(name, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + turn @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['boots'], inside=at + V(0, 0, 0.07))


# The skirt below the sash, in twelve pleats that are deepest at the hem and gone at the waist: z,
# half-width, half-depth, centre y and the depth of the pleats. It is wider than Gandalf's, a bell.
SKIRT = [
    (0.0, 0.288, 0.262, 0.02, 0.026),  # the hem, on the ground
    (0.36, 0.248, 0.22, 0.012, 0.014),
    (0.70, 0.196, 0.172, 0.0, 0.0),
]
HEM_RAGS = [0.0, 0.03, 0.0, 0.012, 0.0, 0.026, 0.0, 0.016, 0.0, 0.032, 0.0, 0.01]  # the hem, worn ragged

# The robe from the sash up, in octagons: z, half-width, half-depth and centre y. The sash is the
# first band, round a stout middle.
ROBE_RINGS = [
    (0.68, 0.213, 0.19, 0.0),  # the sash, lower edge
    (0.80, 0.216, 0.186, 0.0),  # the sash, upper edge
    (1.02, 0.22, 0.156, 0.012),  # shoulders
    (1.14, 0.10, 0.092, 0.012),  # neck
]
ROBE_BANDS = [1, 0, 0]  # the sash, then robe


def skirt_at(z, degrees, out=0.0):
    """A point on the skirt between its pleats, at height z and `degrees` round from +X, or `out`
    beyond it."""
    for (z0, rx0, ry0, cy0, _), (z1, rx1, ry1, cy1, _) in pairwise(SKIRT):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            rx, ry, cy = rx0 + t * (rx1 - rx0), ry0 + t * (ry1 - ry0), cy0 + t * (cy1 - cy0)
    a = math.radians(degrees)
    return V((rx + out) * math.cos(a), cy + (ry + out) * math.sin(a), z)


def robe():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in ROBE_RINGS]
    verts, faces, bands = loft(rings)
    face_mats = [ROBE_BANDS[b] for b in bands]
    part('robe', verts, faces, [M['robe'], M['team']], face_mats, inside=lambda c: V(0, 0.01, c.z))

    rings = []
    for k, (z, rx, ry, cy, pleat) in enumerate(SKIRT):
        ring = []
        for i in range(12):
            a = math.tau * i / 12
            d = pleat if i % 2 else 0.0
            ring.append(V((rx + d) * math.cos(a), cy + (ry + d) * math.sin(a), z + (HEM_RAGS[i] if k == 0 else 0)))
        rings.append(ring)
    verts, faces, _ = loft(rings)
    part('skirt', verts, faces, M['robe'], inside=lambda c: V(0, 0.01, c.z))


# The sash is knotted at his right hip, a little to the front, and its two ends hang down the skirt.
KNOT = 212  # degrees round from +X
SASH_ENDS = [  # degrees round from the knot, the bottom's height, and half-width in degrees
    (-5, 0.43, 7),
    (9, 0.5, 6),
]


def sash():
    a = math.radians(KNOT)
    out = V(math.cos(a), math.sin(a), 0)
    knot = V(0.215 * math.cos(a), 0.19 * math.sin(a), 0.74) + 0.018 * out
    lump('sash-knot', knot, (0.046, 0.04, 0.04), M['team'], seed=5, rough=0.1, angles=(0, 0, KNOT))
    for k, (turn, bottom, half) in enumerate(SASH_ENDS):
        levels = []
        for j, z in enumerate((0.70, (0.70 + bottom) / 2, bottom)):
            middle = KNOT + turn * (j / 2)
            fork = 0.03 if j == 2 else 0.0  # the end is cut in a fork
            levels.append([
                skirt_at(z, middle - half, 0.02),
                skirt_at(z + fork, middle, 0.03),
                skirt_at(z, middle + half, 0.02),
            ])
        verts, faces, _ = loft(levels, closed=False)
        part(f'sash-end-{k}', verts, faces, M['team'], outward=out)


def pouch():
    # A leather pouch of herbs, hanging from the sash at his right hip, towards the back.
    a = math.radians(140)
    out = V(math.cos(a), math.sin(a), 0)
    along = V(-math.sin(a), math.cos(a), 0)
    centre = skirt_at(0.6, 140, 0.032)
    box('pouch', centre, [out, along, V(0, 0, 1)], (0.03, 0.058, 0.062), M['leather'], 0.72)


# The mantle over his shoulders, eight points round from his left (+X): the back rises, the front dips
# under the beard. Its edge is cut in leaf-shaped tongues.
MANTLE_NECK_Z = [1.15, 1.16, 1.175, 1.16, 1.15, 1.14, 1.13, 1.14]
MANTLE_SHOULDER_Z = [1.035, 1.045, 1.06, 1.045, 1.035, 1.03, 1.02, 1.03]
MANTLE_HEM_Z = [0.9, 0.9, 0.895, 0.9, 0.9, 0.91, 0.925, 0.91]
TONGUE = 0.065


def mantle():
    neck = ellipse(0, 0.02, 0, 0.13, 0.12, 8, 0, MANTLE_NECK_Z)
    shoulder = ellipse(0, 0.02, 0, 0.285, 0.21, 8, 0, MANTLE_SHOULDER_Z)
    hem = ellipse(0, 0.025, 0, 0.31, 0.24, 8, 0, MANTLE_HEM_Z)
    verts, faces, _ = loft([hem, shoulder, neck])
    for i in range(8):
        a, b = hem[i], hem[(i + 1) % 8]
        mid = (a + b) / 2
        out = V(mid.x, mid.y - 0.025, 0).normalized()
        verts.append(mid + 0.02 * out - V(0, 0, TONGUE))
        faces.append((i, (i + 1) % 8, len(verts) - 1))
    part('mantle', verts, faces, M['moss'], inside=V(0, 0.02, 0.95))


# Head ----------------------------------------------------------------------------------------------

HEAD = V(0, 0, 1.33)  # the middle of his head, before the stoop carries it forward


def hair():
    # Grey-brown hair at the sides and back, from under the hat to his mantle: a C open at the face,
    # shaggy, from his left temple round the back to his right, its ends in locks.
    angles = [-40, 3, 46, 90, 134, 177, 220]
    levels = [(1.465, 0.12, 0.122, 0.012), (1.30, 0.168, 0.165, 0.015), (1.16, 0.182, 0.168, 0.04)]
    shag = [0.0, 0.022, 0.0, 0.026, 0.0, 0.022, 0.0]  # how far the middle level's points stick out
    locks = [0.0, -0.05, 0.0, -0.06, 0.0, -0.05, 0.0]  # how far each point of the ends hangs lower
    rings = []
    for k, (z, rx, ry, cy) in enumerate(levels):
        out = shag if k == 1 else [0.0] * len(angles)
        drop = locks if k == 2 else [0.0] * len(angles)
        rings.append([V((rx + o) * math.cos(math.radians(a)), cy + (ry + o) * math.sin(math.radians(a)), z + d)
                      for a, o, d in zip(angles, out, drop)])
    verts, faces, _ = loft(rings, closed=False)
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, 0.01, c.z))


# The face: a shallow pyramid of planes round the root of the nose, from under the hat round the
# cheekbones to behind the moustache. Broader than Gandalf's.
FACE_RIM = [
    V(-0.086, -0.095, 1.458), V(0.086, -0.095, 1.458), V(0.128, -0.08, 1.30),
    V(0.074, -0.13, 1.235), V(0, -0.142, 1.225), V(-0.074, -0.13, 1.235), V(-0.128, -0.08, 1.30),
]
FACE_ROOT = V(0, -0.158, 1.35)


def face():
    rim, root = FACE_RIM, FACE_ROOT
    plate = [(rim[i], rim[(i + 1) % 7], root) for i in range(7)]
    part('face', rim + [root], [(i, (i + 1) % 7, 7) for i in range(7)], M['skin'], outward=V(0, -1, 0))

    # Eyes under the brows, laid just proud of the plate.
    for s in (-1, 1):
        corners = [(s * 0.028, 1.346), (s * 0.088, 1.352), (s * 0.06, 1.326)]
        verts = [V(x, on_surface(plate, x, z) - 0.006, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A short, round nose with a broad tip.
    top, hump, tip = V(0, -0.15, 1.375), V(0, -0.188, 1.33), V(0, -0.222, 1.285)
    left, right, under = V(-0.056, -0.162, 1.272), V(0.056, -0.162, 1.272), V(0, -0.18, 1.25)
    verts = [top, hump, tip, left, right, under]
    faces = [(0, 3, 1), (0, 1, 4), (1, 3, 2), (1, 2, 4), (3, 5, 2), (5, 4, 2)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.12, 1.3))

    # Shaggy brows, each a wedge from the root of the nose out to a tuft.
    for s in (-1, 1):
        inner = [V(s * 0.012, -0.15, 1.398), V(s * 0.012, -0.2, 1.374), V(s * 0.012, -0.158, 1.347)]
        mid = [V(s * 0.088, -0.13, 1.408), V(s * 0.09, -0.195, 1.39), V(s * 0.088, -0.14, 1.352)]
        tip = V(s * 0.168, -0.15, 1.39)
        verts = inner + mid + [tip]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5), (3, 4, 6), (4, 5, 6), (5, 3, 6), (0, 2, 1)]
        part(f'brow-{s}', verts, faces, M['hair'], inside=sum(verts, Vector()) / len(verts))


def moustache():
    # Two sweeps from under the nose out and down into the beard.
    for s in (-1, 1):
        root = [V(s * 0.01, -0.172, 1.258), V(s * 0.01, -0.205, 1.24), V(s * 0.01, -0.168, 1.228)]
        mid = [V(s * 0.07, -0.18, 1.242), V(s * 0.07, -0.222, 1.22), V(s * 0.07, -0.176, 1.204)]
        tip = V(s * 0.125, -0.2, 1.15)
        verts = root + mid + [tip]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5), (3, 4, 6), (4, 5, 6), (5, 3, 6)]
        part(f'moustache-{s}', verts, faces, M['hair'], inside=sum(verts, Vector()) / len(verts))


# The beard: bushy and broad, to the middle of his chest, its end ragged. Each level runs from his
# right side across the front to his left: the side, the lock's ridge, the valley, then the centre.
BEARD = [
    [(-0.135, -0.07, 1.31), (-0.128, -0.112, 1.262), (-0.072, -0.142, 1.232), (0.0, -0.15, 1.222)],
    [(-0.188, -0.08, 1.14), (-0.182, -0.19, 1.12), (-0.09, -0.218, 1.11), (0.0, -0.238, 1.105)],
    [(-0.16, -0.12, 0.97), (-0.155, -0.222, 0.955), (-0.078, -0.238, 0.95), (0.0, -0.255, 0.945)],
    [(-0.085, -0.13, 0.84), (-0.08, -0.19, 0.81), (-0.04, -0.205, 0.85), (0.0, -0.215, 0.815)],
]


def beard():
    rings = []
    for level in BEARD:
        right = [V(*p) for p in level]
        left = [V(-p.x, p.y, p.z) for p in reversed(right[:-1])]
        rings.append(right + left)
    verts, faces, _ = loft(rings, closed=False)
    part('beard', verts, faces, M['hair'], inside=lambda c: V(0, -0.05, c.z))


# Hat: a wide, floppy brim, turned up in front and drooping at the sides and back, round a low, rounded
# crown with a band of moss. A bird sits on top. -------------------------------------------------------

BRIM_Z = 1.45
BRIM = [(0.145, 0.0), (0.25, -0.025), (0.345, -0.06)]  # radius and height: inside the crown, mid, edge
HAT_TILT, HAT_SIDE = 6, -4  # degrees it tips back, and to his left (negative: to his right)
CROWN = [  # height above the brim, half-width, half-depth, centre x and y
    (-0.015, 0.152, 0.15, 0.0, 0.0),
    (0.042, 0.158, 0.156, 0.0, 0.0),  # the top of the band
    (0.1, 0.158, 0.154, -0.008, 0.006),
    (0.16, 0.112, 0.108, -0.024, 0.012),
]
CROWN_TOP = V(-0.032, 0.016, BRIM_Z + 0.182)  # the soft crown slumps a little to his right


def droop(a):
    """How far the brim's edge hangs at `a` radians round from +X: turned up in front (-Y), down at
    the sides and lowest behind."""
    front = -math.sin(a)
    return 0.06 * max(front, 0.0) ** 2 - 0.05 * (1 - abs(front)) - 0.07 * max(-front, 0.0)


def hat():
    n = 12
    rings = []
    for k, (r, dz) in enumerate(BRIM):
        ring = []
        for i in range(n):
            a = math.tau * (i + 0.5) / n
            hang = droop(a) * (0.0, 0.35, 1.0)[k]  # the brim curls down towards its edge
            wave = (0.016 if i % 2 else -0.012) if k == len(BRIM) - 1 else 0.0
            ring.append(V(r * math.cos(a), r * math.sin(a), BRIM_Z + dz + hang + wave))
        rings.append(ring)
    verts, faces, _ = loft(rings)
    part('brim', verts, faces, M['team'], outward=V(0, 0, 1))

    rings = [ellipse(cx, cy, BRIM_Z + dz, rx, ry, 8, 22.5) for dz, rx, ry, cx, cy in CROWN]
    verts, faces, bands = loft(rings)
    face_mats = [1 if b == 0 else 0 for b in bands]
    apex = len(verts)
    verts.append(CROWN_TOP)
    last = (len(CROWN) - 1) * 8
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    face_mats += [0] * 8
    part('crown', verts, faces, [M['team'], M['moss']], face_mats, inside=V(0, 0.006, BRIM_Z + 0.06))

    bird('bird-hat', CROWN_TOP - V(0, 0, 0.012), (1.0, 0.12), size=1.5)


# Arms: wide brown sleeves and big hands. The left holds the staff out from his side; the right is
# held up before him, the fist closed, as a perch. Placed where the stoop has carried the shoulders.
L_SHOULDER, L_ELBOW, L_WRIST = V(0.205, 0.0, 1.02), V(0.33, 0.01, 0.85), V(0.405, -0.105, 0.932)
R_SHOULDER, R_ELBOW, R_WRIST = V(-0.205, 0.0, 1.02), V(-0.345, 0.03, 0.88), V(-0.43, -0.13, 1.03)
R_FIST = V(-0.45, -0.175, 1.05)


def arm(side, shoulder, elbow, wrist, fist, grip, thumb=0):
    shoulder = bent(shoulder)
    tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.08), (1.12, 0.072)], M['robe'])
    tube(f'cuff-{side}', elbow, wrist, [(-0.15, 0.068), (1.0, 0.098)], M['robe'])
    ahead = (fist - elbow).normalized()
    up = (Vector(grip) - Vector(grip).dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    box(f'fist-{side}', fist, [ahead, up, across], (0.052, 0.056, 0.056), M['skin'], 0.88)
    if thumb:
        # Pressed along the inside of the fist and over the staff, so it reads as a grip.
        centre = fist + 0.012 * ahead + 0.03 * up + thumb * 0.058 * across
        box(f'thumb-{side}', centre, [ahead, up, across], (0.044, 0.022, 0.019), M['skin'], 0.7)
    return fist + 0.056 * up  # the top of the fist


def perch():
    top = arm('right', R_SHOULDER, R_ELBOW, R_WRIST, R_FIST, V(0, 0, 1))
    bird('bird-hand', top - V(0, 0, 0.01), (0.9, 0.2), size=1.6)


# Staff, in his left hand: a crooked branch, knotted where it bends, in leaf at its head ----------------

STAFF_GRIP = V(0.43, -0.15, 0.955)  # in his fist
STAFF_UP = V(0.07, 0.03, 1.0).normalized()  # leaning out from him a little
STAFF = [  # distance along the staff from his fist (None for the foot, on the ground), radius, kink
    (0.70, 0.022, V(0, 0, 0)),
    (0.56, 0.031, V(0.03, -0.012, 0)),
    (0.38, 0.026, V(-0.026, 0.014, 0)),
    (0.17, 0.032, V(0.012, -0.004, 0)),
    (0.0, 0.028, V(0, 0, 0)),
    (-0.3, 0.03, V(-0.022, 0.006, 0)),
    (-0.6, 0.034, V(0.01, 0.0, 0)),
    (None, 0.024, V(0, 0, 0)),
]


# Single leaves round the clumps: which clump, how far its edge is, which way round from +X the leaf
# points and how far it dips.
LEAVES_OUT = [
    ('clump', 0.11, 20, 0.35),
    ('clump', 0.11, 140, 0.3),
    ('clump', 0.11, 255, 0.45),
    ('tuft', 0.068, -30, 0.5),
    ('tuft', 0.068, 70, 0.2),
]


def leaf(name, base, tip, width=0.034):
    # A pointed leaf, folded a little along its rib so its two halves catch the light differently.
    along = tip - base
    side = along.cross(V(0, 0, 1)).normalized()
    lift = side.cross(along).normalized()
    if lift.z < 0:
        lift = -lift
    mid = base.lerp(tip, 0.42)
    verts = [base, mid + width * side + 0.012 * lift, tip, mid - width * side + 0.012 * lift]
    part(name, verts, [(0, 1, 2), (0, 2, 3)], M['leaves'], outward=lift)


def staff():
    points, radii = [], []
    for t, r, kink in STAFF:
        if t is None:
            t = -STAFF_GRIP.z / STAFF_UP.z
        points.append(STAFF_GRIP + t * STAFF_UP + kink)
        radii.append(r)
    points[-1].z = 0.0
    bent_tube('staff', points, radii, M['wood'], n=5, level_end=True)

    # The leaves: a clump round its head and a smaller one on a side shoot, each with big single
    # leaves sticking out of it, so it reads as foliage and not as a ball.
    top = points[0]
    clump = top + 0.03 * STAFF_UP
    lump('leaves', clump, (0.125, 0.115, 0.095), M['leaves'], seed=7, rough=0.22)
    shoot = [points[1], points[1] + V(0.1, -0.015, 0.075)]
    bent_tube('shoot', shoot, [0.02, 0.014], M['wood'], n=4, end='cap')
    tuft = shoot[1] + V(0.025, 0, 0.015)
    lump('leaves-shoot', tuft, (0.078, 0.072, 0.062), M['leaves'], seed=11, rough=0.22)
    for k, (centre, reach, degrees, dip) in enumerate(LEAVES_OUT):
        c = clump if centre == 'clump' else tuft
        a = math.radians(degrees)
        out = V(math.cos(a), math.sin(a), -dip).normalized()
        leaf(f'leaf-{k}', c + 0.6 * reach * out, c + (reach + 0.075) * out)

    bird('bird-staff', clump + V(0, 0, 0.07), (-0.55, -0.8), size=1.45, wings=0.11)

    arm('left', L_SHOULDER, L_ELBOW, L_WRIST, STAFF_GRIP, STAFF_UP, thumb=1)


def main():
    reset()
    make_materials()
    boot('boot-right', RIGHT_ANKLE, RIGHT_YAW)
    boot('boot-left', LEFT_ANKLE, LEFT_YAW)

    before = set(bpy.context.scene.objects)
    robe()
    sash()
    pouch()
    mantle()
    hair()
    face()
    moustache()
    stoop(since(before), STOOP_FROM, STOOP_TO, STOOP)

    before = set(bpy.context.scene.objects)
    beard()
    carry(since(before), V(0, -STOOP, 0))

    before = set(bpy.context.scene.objects)
    hat()
    hat_parts = since(before)
    tilt(hat_parts, HEAD, HAT_TILT, HAT_SIDE)
    carry(hat_parts, V(0, -STOOP, 0))

    staff()
    perch()
    finish('radagast', budget=800)


main()
