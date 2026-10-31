"""Ugluk, captain of the Uruk-hai of Isengard: an Orc Guardian, in the Faceted style
(docs/viewer-spec.md section 4).

Of Gorbag's family (gorbag.py), which sets the Orcs' look: the heavy, jutting jaw with tusks, the
flat nose, slanted eyes under a shelf of brow and coarse black hair. But an Uruk of Isengard, as the
books have them: a great Orc, swart, heavy and straight-legged, nearly as tall as a Man and upright
where the Orcs of Mordor stoop, about 1.4 to the top of his helm; the broadest of the Orcs, with
thick legs and large hands, and skin of a dark grey-brown. He is armoured in plain black iron, heavy
and unspiked: a cuirass, broad pauldrons of two lames, bracers, greaves and knee-cops over a skirt of
mail, and an iron helm with the S-rune of white metal on its brow. He is a Guardian: a tall, curved
shield held forward on his left arm, bearing the White Hand, and the short, broad-bladed sword of
the Uruk-hai held upright in his right fist.

The team colour is the shield's face round the White Hand, and his tabard, the livery of Isengard:
a yoke over his shoulders and a panel down his chest and one down his back nearly to the knees,
belted at the waist and ragged at the hem. From behind, his ridged helm and pointed ears, the iron
pauldrons, the sword and the strapped back of the shield show round and above it.

    blender --background --factory-startup --python-exit-code 1 --python ugluk.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, with the sword, is at -X.
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
    CLOTH,
    EYES,
    LEATHER,
    MAIL,
    STEEL,
    WOOD,
    V,
    box,
    cone,
    ellipse,
    finish,
    lean,
    loft,
    material,
    nearest_on_line,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    tube,
    wind,
)

# Ugluk's own colours (sRGB); the rest come from the kit.
SKIN = 0x665647  # swart: a dark grey-brown, darker than the sallow olive of the Orcs of Mordor
HAIR = 0x221D1A  # coarse and black
IRON = 0x4C5056  # black iron, a dark grey so its facets still show
BONE = 0xD5CAA8  # his tusks
PAINT = 0xE4E0D4  # the White Hand on his shield
GLARE = 0xC4AA62  # pale yellow eyes, which show on his dark face

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.95),
        iron=material('iron', IRON, roughness=0.55, metallic=0.12),
        mail=material('mail', MAIL, roughness=0.8, metallic=0.05),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        cloth=material('cloth', CLOTH, roughness=0.9),
        bone=material('bone', BONE, roughness=0.7),
        paint=material('paint', PAINT, roughness=0.8),
        wood=material('wood', WOOD, roughness=0.85),
        eyes=material('eyes', GLARE, roughness=0.6),
        mouth=material('mouth', EYES, roughness=0.6),
    )


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


# The body above the hips is built upright and leans a little forward about them, into the fight. An
# Uruk stands straight where the Orcs of Mordor stoop.
PIVOT = V(0, 0.03, 0.62)
LEAN = 6


def leaned(p):
    """Where a point of the upright body is once he leans."""
    return PIVOT + Matrix.Rotation(math.radians(LEAN), 3, 'X') @ (Vector(p) - PIVOT)


# Legs: thick and straight, set wide, the shield-side (left) foot forward -----------------------------

R_HIP, R_KNEE, R_ANKLE, R_YAW = V(-0.125, 0.06, 0.62), V(-0.16, 0.05, 0.35), V(-0.18, 0.13, 0.1), -16
L_HIP, L_KNEE, L_ANKLE, L_YAW = V(0.125, 0.0, 0.62), V(0.165, -0.14, 0.36), V(0.18, -0.1, 0.1), 12

# Heavy boots from the sole up, in the foot's own frame (toes towards -y): the height of each ring and
# the right half of it, side, heel and toe, mirrored by boot().
BOOT_RINGS = [
    (0.0, [(0.1, -0.02), (0.085, 0.095), (0.066, -0.185)]),  # the sole
    (0.07, [(0.1, -0.01), (0.087, 0.09), (0.058, -0.142)]),  # the toe rises to a blunt point
    (0.17, [(0.084, 0.0), (0.076, 0.078), (0.064, -0.058)]),  # round the ankle
]


def boot(name, ankle, yaw):
    spin = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + spin @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['boots'], inside=at + V(0, 0, 0.07))


def legs():
    for side, hip, knee, ankle, yaw in (('right', R_HIP, R_KNEE, R_ANKLE, R_YAW),
                                        ('left', L_HIP, L_KNEE, L_ANKLE, L_YAW)):
        tube(f'thigh-{side}', hip, knee, [(-0.1, 0.11), (1.1, 0.086)], M['cloth'])
        tube(f'greave-{side}', knee, ankle, [(-0.1, 0.08), (1.25, 0.068)], M['iron'])
        boot(f'boot-{side}', ankle, yaw)
        # A plain iron cop over the knee, pointing forward.
        forward = V(0, -1, 0)
        base = segment(knee, knee + forward, [(0, 0.075)], 4, 45)[0]
        verts = base + [knee + 0.125 * forward + V(0, 0, 0.015)]
        part(f'knee-{side}', verts, [(i, (i + 1) % 4, 4) for i in range(4)], M['iron'], inside=knee)


# Body --------------------------------------------------------------------------------------------

# A barrel of octagons, built upright: z, half-width, half-depth and centre y. A skirt of mail over
# the hips, then the iron cuirass over a broad chest, and a bull neck.
TORSO = [
    (0.5, 0.245, 0.19, 0.02),  # the mail skirt's hem, flared over the thighs
    (0.62, 0.215, 0.165, 0.02),  # hips
    (0.71, 0.225, 0.17, 0.02),  # waist
    (0.87, 0.29, 0.2, 0.02),  # chest, the broadest of the Orcs
    (1.0, 0.285, 0.18, 0.04),  # shoulders
    (1.1, 0.135, 0.125, 0.03),  # neck
]
TORSO_BANDS = [0, 0, 1, 1, 1]  # mail, then iron


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    faces.append(tuple(range(len(verts) - 8, len(verts))))  # the top of the neck
    face_mats.append(2)
    part('torso', verts, faces, [M['mail'], M['iron'], M['skin']], face_mats,
         inside=lambda c: V(0, 0.02, min(max(c.z, 0.5), 1.0)))


def surface_ring(z):
    """The upright torso's half-width, half-depth and centre y at height z."""
    for (z0, *a), (z1, *b) in pairwise(TORSO):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return [p + t * (q - p) for p, q in zip(a, b)]
    raise ValueError(z)


def surface(x, z, side):
    """The y of the upright torso's front (side -1) or back (side 1) at x and height z."""
    rx, ry, cy = surface_ring(z)
    # The front half of the octagon from his right to his left; the back mirrors it.
    angles = (math.radians(a) for a in (202.5, 247.5, 292.5, 337.5))
    corners = [(rx * math.cos(a), ry * math.sin(a)) for a in angles]
    x = min(max(x, corners[0][0]), corners[-1][0])
    for (x0, y0), (x1, y1) in pairwise(corners):
        if x0 <= x <= x1:
            depth = y0 + (x - x0) / (x1 - x0) * (y1 - y0)
            return cy + depth if side < 0 else cy - depth
    raise ValueError(x)


def tabard():
    # The livery of Isengard: a yoke round his neck and over his shoulders, in rings of eight from his
    # left (+X), set like the torso's so the front is points 4 to 7 and the back 3 to 0; and from it a
    # panel down his chest and one down his back nearly to the knees, each in three facets that follow
    # the torso's, with a ragged hem.
    collar = ellipse(0, 0.03, 1.1, 0.155, 0.145, 8, 22.5)
    yoke_z = [0.985, 0.995, 0.995, 0.985, 0.975, 0.99, 0.99, 0.975]
    yoke = ellipse(0, 0.035, 0, 0.32, 0.215, 8, 22.5, yoke_z)
    verts = collar + yoke
    faces = [(i, (i + 1) % 8, 8 + (i + 1) % 8, 8 + i) for i in range(8)]
    faces = wind(verts, faces, inside=lambda c: V(0, 0.03, c.z - 0.12))
    for side, top in ((-1, (4, 5, 6, 7)), (1, (3, 2, 1, 0))):
        rows = [[8 + i for i in top]]
        for z, half, out in ((0.86, 0.22, 0.016), (0.71, 0.17, 0.012)):
            corner = 0.383 * surface_ring(z)[0]
            row = []
            for x in (-half, -corner, corner, half):
                verts.append(V(x, surface(x, z, side) + side * out, z))
                row.append(len(verts) - 1)
            rows.append(row)
        # Hanging free from the belt over the mail, out from it and flatter, in a ragged hem.
        hem = []
        for k, (x, z, out) in enumerate(((-0.19, 0.48, 0.055), (-0.1, 0.45, 0.042), (0.1, 0.46, 0.042),
                                         (0.19, 0.47, 0.055))):
            above = verts[rows[-1][k]]
            verts.append(V(x, above.y + side * out, z))
            hem.append(len(verts) - 1)
        rows.append(hem)
        panel = []
        for upper, lower in pairwise(rows):
            panel += [(upper[k], upper[k + 1], lower[k + 1], lower[k]) for k in range(3)]
        # Rags hang from the hem in points of uneven length.
        for (a, b), drop in zip(pairwise(hem), (0.08, 0.1, 0.06) if side < 0 else (0.07, 0.1, 0.08)):
            mid = (verts[a] + verts[b]) / 2
            verts.append(mid + V(0, side * 0.01, -drop))
            panel.append((a, b, len(verts) - 1))
        faces += wind(verts, panel, outward=V(0, side, 0))
    part('tabard', verts, faces, M['team'])


def belt():
    rings = [ellipse(0, 0.02, z, 0.25, 0.2, 8, 22.5) for z in (0.675, 0.745)]
    verts, faces, _ = loft(rings)
    part('belt', verts, faces, M['leather'], inside=V(0, 0.02, 0.71))
    axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
    box('buckle', V(0, -0.188, 0.71), axes, (0.018, 0.045, 0.042), M['iron'], 0.75)


SHOULDERS = {s: V(s * 0.29, 0.04, 0.975) for s in (-1, 1)}  # the middle of each pauldron, upright


def pauldron(s):
    # A broad shell of plain iron over the shoulder, tipped out, and a second lame flaring from under it.
    tip = Matrix.Rotation(math.radians(s * 22), 3, 'Y')
    c = SHOULDERS[s]

    def ring(rx, ry, z):
        angles = (math.tau * (i + 0.5) / 6 for i in range(6))
        return [c + tip @ V(rx * math.cos(a), ry * math.sin(a), z) for a in angles]

    verts, faces, _ = loft([ring(0.182, 0.175, -0.07), ring(0.152, 0.148, 0.03)])
    verts.append(c + tip @ V(0, 0, 0.078))
    faces += [(6 + i, 6 + (i + 1) % 6, 12) for i in range(6)]
    part(f'pauldron-{s}', verts, faces, M['iron'], inside=c + tip @ V(0, 0, -0.08))
    verts, faces, _ = loft([ring(0.195, 0.182, -0.145), ring(0.155, 0.15, -0.055)])
    part(f'lame-{s}', verts, faces, M['iron'], inside=c + tip @ V(0, 0, -0.1))


# Head ----------------------------------------------------------------------------------------------

HEAD = V(0, -0.085, 0.982)  # the middle of the underside of his jaw, placed after the lean
HEAD_SCALE = 1.15  # the head is drawn big, as Gimli's is, so it reads at game size

# The skull in rings from under the jaw to the brow, as Gorbag's but broader in the jaw: the height of
# each above HEAD, then the left half of it from HEAD as (x, y): the side, the back corner, the back,
# the front corner and the front. The helm covers it from the brow up.
SKULL = [
    (0.0, (0.148, -0.03), (0.092, 0.055), 0.07, (0.13, -0.16), -0.205),  # under the jaw, jutting
    (0.075, (0.16, -0.005), (0.112, 0.09), 0.115, (0.136, -0.15), -0.186),  # the mouth
    (0.165, (0.146, 0.005), (0.112, 0.105), 0.135, (0.12, -0.115), -0.152),  # cheekbones and eyes
    (0.245, (0.12, 0.015), (0.094, 0.105), 0.13, (0.09, -0.08), -0.1),  # brow and temples
]


def h(x, y, z):
    """A point of the head, from HEAD in the head's own (unscaled) measure."""
    return HEAD + HEAD_SCALE * V(x, y, z)


def head():
    rings = []
    for z, side, corner, back, front_corner, front in SKULL:
        ring = [side, corner, (0, back), (-corner[0], corner[1]), (-side[0], side[1]),
                (-front_corner[0], front_corner[1]), (0, front), front_corner]
        rings.append([h(x, y, z) for x, y in ring])
    verts, faces, bands = loft(rings)
    face_mats = [1 if b > 0 and i % 8 < 4 else 0 for i, b in enumerate(bands)]  # hair round the back
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
        """A point of the head at (x, z) laid `lift` proud of the surface `tris`."""
        p = h(x, 0, z)
        return V(p.x, on_surface(tris, p.x, p.z) - lift, p.z)

    # Slanted eyes under the brow, pale so they show on his dark face.
    for s in (-1, 1):
        outline = ((s * 0.03, 0.125), (s * 0.1, 0.15), (s * 0.07, 0.112))
        corners = [on(face, x, z, 0.006) for x, z in outline]
        part(f'eye-{s}', corners, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A heavy shelf of brow, dipping in the middle in a scowl, under the rim of the helm.
    sections = [
        [h(-0.124, -0.05, 0.2), h(-0.124, -0.13, 0.182), h(-0.124, -0.07, 0.156)],
        [h(0, -0.13, 0.196), h(0, -0.205, 0.163), h(0, -0.155, 0.136)],
        [h(0.124, -0.05, 0.2), h(0.124, -0.13, 0.182), h(0.124, -0.07, 0.156)],
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brow', verts, faces, M['skin'], inside=h(0, -0.09, 0.17))

    # A flat, broad nose.
    verts = [h(0, -0.156, 0.136), h(0, -0.222, 0.092), h(0.05, -0.166, 0.084), h(-0.05, -0.166, 0.084),
             h(0, -0.18, 0.074)]
    faces = [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)]
    part('nose', verts, faces, M['skin'], inside=h(0, -0.14, 0.1))

    # A wide, grim mouth, turned down at the corners.
    outline = [(0.1, 0.036), (0.042, 0.058), (-0.042, 0.058), (-0.1, 0.036), (-0.042, 0.044),
               (0.042, 0.044)]
    verts = [on(jaw, x, z, 0.005) for x, z in outline]
    part('mouth', verts, [(0, 1, 5), (1, 2, 4, 5), (2, 3, 4)], M['mouth'], outward=V(0, -1, 0))

    # Tusks from the lower jaw, up past the lip.
    for s in (-1, 1):
        x = s * 0.09
        base = on(jaw, x, 0.03, 0.0)
        y = (base.y - HEAD.y) / HEAD_SCALE
        verts = [h(x - 0.034, y + 0.01, 0.012), h(x + 0.034, y + 0.01, 0.012), h(x, y + 0.05, 0.008),
                 h(x + s * 0.04, y - 0.065, 0.19)]
        middle = sum(verts, Vector()) / 4
        part(f'tusk-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['bone'], inside=middle)

    # Pointed ears, smaller than a Mordor orc's and swept further back, from under the helm.
    for s in (-1, 1):
        verts = [h(s * 0.15, -0.02, 0.08), h(s * 0.14, 0.08, 0.1), h(s * 0.14, 0.03, 0.17),
                 h(s * 0.3, 0.17, 0.25)]
        middle = sum(verts, Vector()) / 4  # inside the ear, which leans far out from the head
        part(f'ear-{s}', verts, [(0, 2, 3), (2, 1, 3), (1, 0, 3)], M['skin'], inside=middle)


# The helm: a tall cap of black iron in rings of eight, flat on the brow for the S-rune, over the skull
# from the brow up. Each ring: the height above HEAD, its half-width, half-depth and centre y.
HELM = [
    (0.165, 0.17, 0.188, 0.0),  # the rim, over the brow
    (0.235, 0.174, 0.19, 0.0),  # the top of the brow-band
    (0.3, 0.15, 0.166, 0.01),  # the bowl
    (0.345, 0.092, 0.104, 0.016),  # the crown
]
# A ridge along the crown from front to back, so the helm looks forged and shows from above which way
# he faces: its front and back ends.
RIDGE = [(0, -0.07, 0.372), (0, 0.1, 0.368)]
# The S-rune, a zigzag of white metal on the brow-band, from its top down: (x, z) in the head's measure.
RUNE = [(-0.044, 0.226), (0.034, 0.206), (-0.034, 0.19), (0.044, 0.17)]
RUNE_WIDTH = 0.013


def helm():
    rings = [[h(p.x, p.y, z) for p in ellipse(0, cy, 0, rx, ry, 8, 22.5)] for z, rx, ry, cy in HELM]
    verts, faces, _ = loft(rings)
    # The crown's points are 0 and 7 on his left, 1 and 2 behind, 3 and 4 on his right and 5 and 6 in
    # front: a gable at each end of the ridge, and a roof down each side.
    c = (len(HELM) - 1) * 8
    f, b = len(verts), len(verts) + 1
    verts += [h(*p) for p in RIDGE]
    faces += [(c + 5, c + 6, f), (c + 1, c + 2, b), (c + 6, c + 7, f), (c + 7, c, b, f), (c, c + 1, b),
              (c + 2, c + 3, b), (c + 3, c + 4, f, b), (c + 4, c + 5, f)]
    part('helm', verts, faces, M['iron'], inside=h(0, 0.0, 0.2))

    # The rune, laid just proud of the brow-band's flat front.
    z0, _, ry0, _ = HELM[0]
    z1, _, ry1, _ = HELM[1]

    def on_band(x, z):
        t = (z - z0) / (z1 - z0)
        ry = ry0 + t * (ry1 - ry0)
        return h(x, -0.924 * ry - 0.005, z)

    verts, faces = [], []
    for k, (x, z) in enumerate(RUNE):
        verts += [on_band(x, z + RUNE_WIDTH), on_band(x, z - RUNE_WIDTH)]
        if k:
            faces.append((2 * k - 2, 2 * k - 1, 2 * k + 1, 2 * k))
    part('rune', verts, faces, M['steel'], outward=V(0, -1, 0))


# Shield, on his left arm ---------------------------------------------------------------------------

SHIELD_CENTRE = V(0.37, -0.32, 0.68)
SHIELD_TURN = Matrix.Rotation(math.radians(34), 3, 'Z') @ Matrix.Rotation(math.radians(-8), 3, 'X')
SHIELD_W = 0.2  # half its width
BULGE = 0.05  # how far forward its middle stands of its sides: it curves round him
# Its outline, tall with cut corners and a little arched at the top and bottom: (u, v), u across to
# his left and v up, from the bottom of its left side up and round.
OUTLINE = [
    (0.2, -0.24), (0.2, 0.24), (0.14, 0.31), (0.05, 0.325), (-0.05, 0.325), (-0.14, 0.31),
    (-0.2, 0.24), (-0.2, -0.24), (-0.14, -0.31), (-0.05, -0.32), (0.05, -0.32), (0.14, -0.31),
]
# The strips its face and back are filled with, between columns of the outline.
STRIPS = [(7, 6, 5, 8), (8, 5, 4, 9), (9, 4, 3, 10), (10, 3, 2, 11), (11, 2, 1, 0)]

# The White Hand, laid on the face: (u, v) of the palm, and of each digit its base, its tip and its
# half-widths there; thumb first.
PALM = [(-0.042, -0.135), (0.042, -0.135), (0.064, -0.04), (0.058, 0.01), (-0.058, 0.012),
        (-0.066, -0.05)]
DIGITS = [
    ((-0.055, -0.06), (-0.125, 0.0), 0.02, 0.016),
    ((-0.042, 0.0), (-0.068, 0.11), 0.016, 0.013),
    ((-0.013, 0.004), (-0.016, 0.13), 0.016, 0.013),
    ((0.016, 0.002), (0.035, 0.118), 0.015, 0.012),
    ((0.044, -0.008), (0.08, 0.085), 0.014, 0.011),
]


def on_shield(u, v, w):
    """A point of the shield: u across, v up, and w forward of the plane of its edge, on its curve."""
    bulge = BULGE * (1 - min((u / SHIELD_W) ** 2, 1.0))
    return SHIELD_CENTRE + SHIELD_TURN @ V(u, -(bulge + w), v)


def shield():
    forward = SHIELD_TURN @ V(0, -1, 0)
    # Its outline three times: the outer edge, the crest of the iron rim and the rim's inner edge.
    profile = [(1.0, -0.005), (0.985, 0.022), (0.9, 0.005)]
    rings = [[on_shield(k * u, k * v, w) for u, v in OUTLINE] for k, w in profile]
    verts, faces, _ = loft(rings)
    axis = nearest_on_line(SHIELD_CENTRE, SHIELD_CENTRE + forward)
    n = len(OUTLINE)
    faces = wind(verts, faces[:n], inside=axis) + wind(verts, faces[n:], outward=forward)
    face_mats = [1] * (2 * n)
    faces += wind(verts, [tuple(2 * n + i for i in s) for s in STRIPS], outward=forward)
    face_mats += [0] * len(STRIPS)
    faces += wind(verts, STRIPS, outward=-forward)
    face_mats += [2] * len(STRIPS)
    part('shield', verts, faces, [M['team'], M['iron'], M['wood']], face_mats)

    # Two iron straps across the boards on the back, following their curve.
    for v in (-0.17, 0.17):
        verts = [on_shield(u, v + dv, -0.011) for u in (-0.19, -0.07, 0.07, 0.19)
                 for dv in (-0.024, 0.024)]
        faces = [(2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2) for k in range(3)]
        part('strap', verts, wind(verts, faces, outward=-forward), M['iron'])

    # The White Hand of Saruman, just proud of the face.
    lift = 0.009
    verts = [on_shield(u, v, lift) for u, v in PALM]
    faces = [(0, 1, 2, 5), (5, 2, 3, 4)]
    for (bu, bv), (tu, tv), bw, tw in DIGITS:
        along = Vector((tu - bu, tv - bv)).normalized()
        across = Vector((-along.y, along.x))
        first = len(verts)
        for (cu, cv), half in (((bu, bv), bw), ((tu, tv), tw)):
            verts += [on_shield(cu + half * across.x, cv + half * across.y, lift + 0.002),
                      on_shield(cu - half * across.x, cv - half * across.y, lift + 0.002)]
        faces.append((first, first + 1, first + 3, first + 2))
    part('white-hand', verts, wind(verts, faces, outward=forward), M['paint'])


# The sword, upright in his right fist: short and broad-bladed, as the Uruk-hai's are -----------------

R_FIST = V(-0.44, -0.18, 0.9)
BLADE = V(-0.07, 0.08, 1.0).normalized()  # up, a little out and back


def sword():
    d = BLADE
    across = d.cross(V(0, 1, 0)).normalized()
    flat = across.cross(d).normalized()  # square to the flat of the blade
    g = R_FIST
    tube('grip', g - 0.08 * d, g + 0.07 * d, [(0, 0.024), (1, 0.024)], M['leather'], n=4)
    cone('pommel', g - 0.085 * d, g - 0.13 * d, 0.036, M['iron'], n=4, back=g - 0.065 * d)
    box('guard', g + 0.08 * d, [d, across, flat], (0.018, 0.1, 0.03), M['iron'])
    # A diamond in section, broad and swelling a little before it narrows to the point.
    stations = [(0.09, 0.044, 0.013), (0.34, 0.054, 0.012), (0.45, 0.044, 0.009)]
    rings = [[g + t * d + w * across, g + t * d + k * flat, g + t * d - w * across, g + t * d - k * flat]
             for t, w, k in stations]
    verts, faces, _ = loft(rings)
    verts.append(g + 0.56 * d)
    last = (len(rings) - 1) * 4
    faces += [(last + i, last + (i + 1) % 4, len(verts) - 1) for i in range(4)]
    part('blade', verts, faces, M['steel'], inside=nearest_on_line(g, g + d))


# Arms ----------------------------------------------------------------------------------------------

UPPER_ARM, FOREARM = 0.3, 0.29  # long arms, as orcs have


def arm(side, shoulder, fist, pole, fist_up, ahead=None):
    """An arm from the shoulder to a fist at `fist`, its elbow bent towards `pole`; the fist points
    along the forearm, or along `ahead` when it grips something square to it."""
    reach = (fist - shoulder).normalized()
    elbow = bend(shoulder, fist - 0.06 * reach, UPPER_ARM, FOREARM, pole)
    wrist = fist - 0.03 * (fist - elbow).normalized()  # inside the fist, which hides the bracer's end
    tube(f'upper-arm-{side}', shoulder, elbow, [(-0.1, 0.09), (1.08, 0.074)], M['skin'])
    tube(f'forearm-{side}', elbow, wrist, [(-0.12, 0.072), (0.35, 0.084), (1.0, 0.058)],
         [M['skin'], M['iron']], [0, 1])
    ahead = (fist - elbow).normalized() if ahead is None else Vector(ahead).normalized()
    up = (Vector(fist_up) - Vector(fist_up).dot(ahead) * ahead).normalized()
    box(f'fist-{side}', fist, [ahead, up, ahead.cross(up)], (0.058, 0.064, 0.066), M['skin'], 0.85)


def arms():
    left, right = leaned(V(0.3, 0.04, 0.94)), leaned(V(-0.3, 0.04, 0.94))
    # The shield arm hangs from the shoulder, and the forearm reaches forward to the grip behind the
    # middle of the shield, the fist square to the boards and just behind them.
    grip = on_shield(0, 0, -0.072)
    arm('left', left, grip, left + V(0.1, 0.12, -0.35), SHIELD_TURN @ V(0, 0, 1),
        SHIELD_TURN @ V(0, -1, 0))
    # The sword arm holds the blade up beside him, the elbow down and back.
    arm('right', right, R_FIST, right + V(-0.12, 0.2, -0.3), BLADE)


def main():
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    tabard()
    belt()
    for s in (-1, 1):
        pauldron(s)
    lean(new_objects(before), PIVOT, LEAN)
    head()
    helm()
    shield()
    sword()
    arms()
    finish('ugluk')


main()
