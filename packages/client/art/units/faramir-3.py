"""Faramir, Steward of Gondor: Faramir's 3★ model, the book moment (docs/viewer-spec.md section 4,
"Star levels").

Built on faramir.py, the same Faramir: a Man of heroic proportions, 1.42 to the top of his head, with
grey eyes under dark brows, the green of the Rangers of Ithilien on his arms, his great bow of pale
yew and the team colour on his hooded cloak. At the crowning of the King before the gate of Minas
Tirith, Faramir, the last Steward, surrenders his office and holds out the white rod of the Stewards;
Aragorn gives the rod back to him and bids him do his office still, and he is made Prince of
Ithilien (The Return of the King, VI 5). Here he stands as that Steward, the rod given back to him:
- his hood thrown back and his green mask pulled down to his throat, so his face shows, with the dark
  hair of the Men of Gondor to his collar;
- the black and silver of Gondor over his Ranger's green: a black surcoat to the knees, bordered with
  silver, with the White Tree on the breast, and his green sleeves and gauntlets;
- a Steward's long mantle in the team colour, over his shoulders and down his back to his calves, its
  hood bunched at his nape, so the team colour shows from in front, from above and from behind;
- the white rod of the Stewards with its golden knob, upright in his right hand above his head;
- his great bow, strung, in his left hand at his side, its back turned out so its curve shows from in
  front and from behind: he is still an Archer.
The books don't say what he wears that day; the black and silver are Gondor's, as the Guards of the
Citadel wear them. His fittings, the belt buckle, the mantle's brooch, the rod's golden knob and the
bands either side of the bow's grip, use `trim`.

    blender --background --factory-startup --python-exit-code 1 --python faramir-3.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOK_BUDGET,
    BOOTS,
    EYES,
    LEATHER,
    V,
    bent_tube,
    box,
    cone,
    ellipse,
    finish,
    loft,
    lump,
    material,
    nearest_on_polyline,
    on_surface,
    part,
    reset,
    team_material,
    trim_material,
    tube,
)

# Faramir's own colours (sRGB); the rest come from the kit.
SKIN = 0xD4A07E
HAIR = 0x2E2722  # the dark hair of the Men of Gondor
TUNIC = 0x4F5C3C  # moss green: the sleeves of his Ranger's tunic
BUCKSKIN = 0x6B5540  # brown: his breeches
MASK = 0x6F7D52  # the green mask, pulled down into a scarf
GAUNTLET = 0x5C6B44  # green gauntlets
BOW = 0xAD8656  # the great bow, of pale yew
STRING = 0xC6CEA0  # its string, pale so it reads
SABLE = 0x2B2B30  # the black of Gondor, as Aragorn's: his surcoat
SILVER = 0xC4C8CC  # the silver border of the surcoat
MITHRIL = 0xE3E5E7  # the White Tree on his breast
ROD = 0xEDEAE2  # the white rod of the Stewards

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.9),
        tunic=material('tunic', TUNIC, roughness=0.9),
        buckskin=material('buckskin', BUCKSKIN, roughness=0.88),
        mask=material('mask', MASK, roughness=0.9),
        gauntlet=material('gauntlet', GAUNTLET, roughness=0.8),
        sable=material('sable', SABLE, roughness=0.9),
        silver=material('silver', SILVER, roughness=0.5, metallic=0.1),
        mithril=material('mithril', MITHRIL, roughness=0.45, metallic=0.1),
        rod=material('rod', ROD, roughness=0.6),
        boots=material('boots', BOOTS, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        wood=material('wood', BOW, roughness=0.7),
        string=material('string', STRING, roughness=0.9),
        eyes=material('eyes', EYES, roughness=0.6),
        # Fittings: the renderer recolours this iron, silver or gold by star level.
        trim=trim_material(),
    )


def yaw(degrees):
    return Matrix.Rotation(math.radians(degrees), 3, 'Z')


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


def flat(name, points, faces, mat, normal, lift=0.0):
    """A flat detail laid on a surface, lifted off it by `lift` along `normal` and wound to face it."""
    normal = Vector(normal).normalized()
    verts = [Vector(p) + lift * normal for p in points]
    return part(name, verts, faces, mat, outward=normal)


# The White Tree as a flat emblem, as Aragorn's (aragorn.py): (u, v) with u across, -0.5 to 0.5, and
# v up, 0 to 1. A trunk on spreading roots, under a broad crown of five round boughs.
TREE_TRUNK = [(-0.2, 0.0), (0.2, 0.0), (0.05, 0.12), (0.045, 0.44), (-0.045, 0.44), (-0.05, 0.12)]
TREE_HUB = (0.0, 0.66)


def _boughs(centres=(-4, 45, 90, 135, 184), half=10, notch=0.78):
    points = []
    for k, c in enumerate(centres):
        points += [(c - half, 1.0), (c + half, 1.0)]
        if k < len(centres) - 1:
            points.append(((c + centres[k + 1]) / 2, notch))
    return [(0.5 * r * math.cos(math.radians(a)), 0.66 + 0.34 * r * math.sin(math.radians(a))) for a, r in points]


TREE_CROWN = _boughs()
TREE_POINTS = TREE_TRUNK + [TREE_HUB] + TREE_CROWN
_OUTLINE = list(range(7, 7 + len(TREE_CROWN))) + [4, 3]  # over the top, then under it to the trunk
TREE_FACES = [(0, 1, 2, 5), (5, 2, 3, 4)] + [(6, a, b) for a, b in zip(_OUTLINE, _OUTLINE[1:] + _OUTLINE[:1])]


# Legs --------------------------------------------------------------------------------------------

HIP_Z = 0.675  # a little higher than faramir.py's, so he stands straighter
THIGH, SHIN = 0.31, 0.3
# He stands tall, feet apart, the left a little forward, toes turned out. Each: the hip joint, the
# ankle and the foot's yaw.
LEGS = {
    'right': (V(-0.082, 0.0, HIP_Z), V(-0.13, 0.03, 0.09), -14),
    'left': (V(0.082, 0.0, HIP_Z), V(0.13, -0.03, 0.09), 10),
}

# The boot from the sole up, in the foot's own frame (toes towards -y): the height of each ring and
# the right half of it, side, heel and toe, mirrored counter-clockwise by boot().
FOOT = [
    (0.0, [(0.07, -0.016), (0.058, 0.08), (0.05, -0.168)]),  # the sole
    (0.066, [(0.07, -0.008), (0.06, 0.082), (0.05, -0.128)]),  # the instep slopes back from the toe
    (0.16, [(0.064, 0.004), (0.056, 0.064), (0.05, -0.05)]),  # round the ankle
]


def boot(name, ankle, foot_yaw):
    facing = yaw(foot_yaw)
    at = V(ankle.x, ankle.y, 0)
    rings = []
    for z, (side, heel, toe) in FOOT:
        outline = [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe]
        rings.append([at + facing @ V(x, y, z) for x, y in outline])
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['boots'], inside=at + V(0, 0, 0.07))


def legs():
    for side, (hip, ankle, foot_yaw) in LEGS.items():
        ahead = yaw(foot_yaw) @ V(0, -1, 0)
        knee = bend(hip, ankle, THIGH, SHIN, (hip + ankle) / 2 + 0.3 * ahead)
        # Breeches to the knee, then a ranger's high boot with a turned-down cuff of paler leather.
        shin = knee.lerp(ankle, 0.14)
        bent_tube(f'leg-{side}', [hip, knee, shin, ankle], [0.084, 0.074, 0.072, 0.062],
                  [M['buckskin'], M['boots']], band_mats=[0, 0, 1])
        tube(f'cuff-{side}', knee.lerp(ankle, 0.1), knee.lerp(ankle, 0.27), [(0, 0.078), (1, 0.088)],
             M['leather'])
        boot(f'boot-{side}', ankle, foot_yaw)


# Body: the black surcoat ---------------------------------------------------------------------------

# The surcoat as a barrel of octagons: z, half-width, half-depth and centre y. It falls to his knees
# with a border of silver at the hem, and the belt is the band between the fourth and fifth rings.
TORSO = [
    (0.37, 0.25, 0.222, -0.012),  # the hem, flared over his knees
    (0.41, 0.244, 0.214, -0.012),  # the top of the silver border
    (0.64, 0.204, 0.158, -0.006),  # hips, full enough to hide his thighs
    (0.695, 0.176, 0.134, -0.004),  # belt, lower edge
    (0.755, 0.18, 0.136, -0.004),  # belt, upper edge
    (0.88, 0.236, 0.16, -0.01),  # chest
    (0.97, 0.232, 0.14, 0.0),  # shoulders
    (0.995, 0.074, 0.07, 0.01),  # neck, inside the scarf
]
TORSO_BANDS = [2, 0, 0, 1, 0, 0, 0]  # the border, the surcoat, the belt
OCTAGON = [math.radians(22.5 + 45 * i) for i in range(8)]


def torso():
    rings = [[V(rx * math.cos(a), cy + ry * math.sin(a), z) for a in OCTAGON] for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    part('torso', verts, faces, [M['sable'], M['leather'], M['silver']], [TORSO_BANDS[b] for b in bands],
         inside=lambda c: V(0, 0, c.z))

    # The White Tree on his breast, on the flat front of the surcoat between the belt and the chest.
    front = [(rings[r][5], rings[r][6]) for r in (4, 5)]  # the front corners, right and left
    plate = [(front[0][0], front[0][1], front[1][1]), (front[0][0], front[1][1], front[1][0])]
    normal = (front[0][1] - front[0][0]).cross(front[1][0] - front[0][0])
    if normal.y > 0:
        normal = -normal

    def place(u, v):
        x, z = 0.11 * u, 0.762 + 0.1 * v
        return V(x, on_surface(plate, x, z), z)

    flat('tree', [place(u, v) for u, v in TREE_POINTS], TREE_FACES, M['mithril'], normal, 0.003)

    # The belt buckle, its face smaller than its back so the edges read as a bevel.
    axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
    box('buckle', V(0, -0.14, 0.725), axes, (0.014, 0.03, 0.028), M['trim'], 0.75)


# Head, bare: as Aragorn's (aragorn.py), with Faramir's grey eyes and level brows ------------------

# The head as rings of eight from the neck up. Each ring is z, then the left half, mirrored to the
# right: the side, the back corner, the back's y, the front corner and the front's y.
HEAD = [
    (1.03, (0.078, 0.012), (0.056, 0.064), 0.078, (0.054, -0.05), -0.062),  # the neck, in the scarf
    (1.085, (0.098, 0.004), (0.072, 0.076), 0.092, (0.068, -0.09), -0.118),  # under the jaw; the chin
    (1.16, (0.116, -0.002), (0.092, 0.088), 0.106, (0.084, -0.1), -0.13),  # the mouth
    (1.245, (0.128, 0.002), (0.102, 0.096), 0.118, (0.096, -0.104), -0.126),  # cheekbones and eyes
    (1.315, (0.13, 0.008), (0.104, 0.102), 0.124, (0.094, -0.108), -0.127),  # the brow
    (1.35, (0.128, 0.011), (0.102, 0.102), 0.124, (0.088, -0.102), -0.118),  # the hairline
    (1.395, (0.102, 0.016), (0.082, 0.088), 0.106, (0.07, -0.08), -0.09),  # the top of the head
]
CROWN = V(0, 0.016, 1.425)
# Which faces of each band are skin, by their place round the ring: 4 to 7 are his right side, the
# right and left of his face and his left side; the rest are hair.
SKIN_FACES = [{4, 5, 6, 7}, {4, 5, 6, 7}, {4, 5, 6, 7}, {5, 6}, {5, 6}, set()]


def head_ring(z, side, back_corner, back_y, front_corner, front_y):
    (sx, sy), (bx, by), (fx, fy) = side, back_corner, front_corner
    return [V(sx, sy, z), V(bx, by, z), V(0, back_y, z), V(-bx, by, z), V(-sx, sy, z), V(-fx, fy, z),
            V(0, front_y, z), V(fx, fy, z)]


def head():
    rings = [head_ring(*r) for r in HEAD]
    verts, faces, bands = loft(rings)
    face_mats = [0 if i % 8 in SKIN_FACES[b] else 1 for i, b in zip(range(len(faces)), bands)]
    apex, last = len(verts), (len(rings) - 1) * 8
    verts.append(CROWN)
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    face_mats += [1] * 8
    part('head', verts, faces, [M['skin'], M['hair']], face_mats, inside=V(0, 0.0, 1.22))

    # The planes of his face, the two either side of the middle, for laying details on.
    face = []
    for r in range(1, 4):
        lo, hi = rings[r], rings[r + 1]
        for a, b in ((5, 6), (6, 7)):
            face += [(lo[a], lo[b], hi[b]), (lo[a], hi[b], hi[a])]

    # His grey eyes, drawn dark so they read at the game's size, laid just proud of the face, and a
    # dark brow over each, its inner end lower: grave rather than fierce, as on faramir.py.
    for s in (-1, 1):
        corners = [(s * 0.022, 1.266), (s * 0.088, 1.268), (s * 0.055, 1.244)]
        verts = [V(x, on_surface(face, x, z) - 0.005, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

        ends = []
        for x, z in ((s * 0.018, 1.284), (s * 0.088, 1.296)):
            y = on_surface(face, x, z)
            ends.append([V(x, y - 0.004, z + 0.012), V(x, y - 0.018, z), V(x, y - 0.004, z - 0.008)])
        verts, faces, _ = loft(ends)
        faces += [(0, 1, 2), (3, 4, 5)]
        part(f'brow-{s}', verts, faces, M['hair'], inside=V(s * 0.06, -0.08, 1.28))

    # A grave mouth, a short dark line.
    corners = [(-0.034, 1.152), (0, 1.155), (0.034, 1.152), (0.028, 1.145), (0, 1.148), (-0.028, 1.145)]
    verts = [V(x, on_surface(face, x, z) - 0.003, z) for x, z in corners]
    part('mouth', verts, [(0, 1, 4, 5), (1, 2, 3, 4)], M['eyes'], outward=V(0, -1, 0))

    # A straight nose from under the brow to its tip.
    top, tip = V(0, -0.12, 1.29), V(0, -0.16, 1.2)
    left, right, under = V(-0.026, -0.114, 1.198), V(0.026, -0.114, 1.198), V(0, -0.124, 1.186)
    verts = [top, tip, left, right, under]
    part('nose', verts, [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)], M['skin'], inside=V(0, -0.08, 1.24))


def hair():
    # Dark hair to his collar down the back and sides of his head. Each level runs round him from
    # just in front of his left ear, past the back, to his right.
    angles = [math.radians(a) for a in (-15, 20, 55, 90, 125, 160, 195)]
    top = [(0.138, -0.034, 1.35), (0.137, 0.046, 1.362), (0.092, 0.116, 1.376), (0, 0.132, 1.385)]
    levels = [  # half-width, half-depth, centre y and the height of each point
        (0.148, 0.14, 0.006, [1.18, 1.17, 1.165, 1.16, 1.165, 1.17, 1.18]),
        (0.162, 0.158, 0.03, [1.1, 1.07, 1.08, 1.06, 1.08, 1.07, 1.1]),
    ]
    rings = [[V(*p) for p in top] + [V(-x, y, z) for x, y, z in reversed(top[:-1])]]
    rings += [[V(rx * math.cos(a), cy + ry * math.sin(a), z) for a, z in zip(angles, zs)] for rx, ry, cy, zs in levels]
    verts, faces, _ = loft(rings, closed=False)
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z))


# Team colour: the Steward's mantle, its hood thrown back, and the long cloak ----------------------

# Eight points round the neck, starting at his left shoulder (+X); the front dips at his throat and
# the back rises where the hood gathers.
NECK_Z = [1.06, 1.075, 1.09, 1.075, 1.06, 1.035, 1.015, 1.035]


def scarf():
    """The green mask, pulled down off his face into a scarf round his throat, over the mantle's collar."""
    lower = ellipse(0, 0.01, 0, 0.11, 0.106, 8, 0, [z - 0.006 for z in NECK_Z])
    upper = ellipse(0, 0.004, 0, 0.098, 0.098, 8, 0, [z + 0.042 for z in NECK_Z])
    verts, faces, _ = loft([lower, upper])
    part('scarf', verts, faces, M['mask'], inside=V(0, 0.005, 1.06))


def mantle():
    neck = ellipse(0, 0.012, 0, 0.1, 0.096, 8, 0, NECK_Z)
    dome = ellipse(0, 0.01, 0, 0.238, 0.174, 8, 0, [z - 0.045 for z in NECK_Z])
    shoulder_z = [0.955, 0.965, 0.975, 0.965, 0.955, 0.94, 0.925, 0.94]
    shoulder = ellipse(0, 0.008, 0, 0.314, 0.212, 8, 0, shoulder_z)
    drop = [0.08, 0.085, 0.09, 0.085, 0.08, 0.065, 0.055, 0.065]  # shallower in front, over the Tree
    hem = ellipse(0, 0.008, 0, 0.304, 0.206, 8, 0, [z - d for z, d in zip(shoulder_z, drop)])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('mantle', verts, faces, M['team'], inside=V(0, 0.01, 0.9))

    # Its brooch at his throat, below the scarf, standing off the mantle.
    at = V(0, -0.15, 0.982)
    out = V(0, -0.82, 0.57).normalized()
    cone('brooch', at, at + 0.026 * out, 0.03, M['trim'], n=4, phase=45, back=at - 0.008 * out)

    # The hood thrown back, bunched on his upper back and standing up behind his neck, under the ends
    # of his hair: the hood of faramir.py, down.
    a, g, b = V(-0.15, 0.125, 1.07), V(0, 0.185, 1.11), V(0.15, 0.125, 1.07)
    c, e, d = V(-0.2, 0.235, 0.93), V(0, 0.285, 0.97), V(0.2, 0.235, 0.93)
    f = V(0, 0.265, 0.76)
    verts = [a, g, b, c, e, d, f]
    faces = [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 6), (4, 5, 6)]
    part('hood', verts, faces, M['team'], inside=V(0, 0.12, 0.92))


def cloak():
    # Down his back to his calves, in four folds, the hem lowest in the middle. Each level: z at the
    # middle and at the edges, half-width, half-depth, centre y, how far short of the sides it stops
    # (degrees) and how deep the folds are.
    levels = [
        (0.94, 0.94, 0.275, 0.18, 0.02, 24, 0.0),
        (0.62, 0.65, 0.31, 0.236, 0.016, 14, 0.03),
        (0.21, 0.28, 0.35, 0.292, 0.03, 6, 0.05),
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
    part('cloak', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z))


# Arms, the bow and the rod -----------------------------------------------------------------------

SHOULDER = V(0.218, 0.015, 0.955)  # his left shoulder joint; the right mirrors it
UPPER_ARM, FOREARM = 0.28, 0.27

# The bow in his left hand, held upright at his side: the fist round the grip, the upper arm down by
# his side and the forearm forward. Its back is turned out, away from him, and the string in.
BOW_FIST = V(0.46, -0.2, 0.78)
BOW_UP = V(0.04, 0.0, 1.0).normalized()  # its top leans out a little, clear of his head
STRING_SIDE = V(-0.96, 0.28, 0.0).normalized()  # from the grip towards the string
# The braced stave from the bottom tip to the top: (along the stave, towards the string,
# half-thickness). The limbs bend gently back towards the string, with metal bands either side of
# the leather grip.
STAVE = [
    (-0.74, 0.17, 0.0),
    (-0.65, 0.125, 0.028),
    (-0.54, 0.085, 0.033),
    (-0.4, 0.048, 0.037),
    (-0.26, 0.02, 0.04),
    (-0.155, 0.007, 0.048),
    (-0.1, 0.003, 0.048),
    (0.1, 0.003, 0.048),
    (0.155, 0.007, 0.048),
    (0.26, 0.02, 0.04),
    (0.4, 0.048, 0.037),
    (0.54, 0.085, 0.033),
    (0.65, 0.125, 0.028),
    (0.74, 0.17, 0.0),
]
STAVE_BANDS = [0, 0, 0, 0, 2, 1, 2, 0, 0, 0, 0]  # wood, the grip wrapped in leather between metal bands

# The white rod in his right hand, held upright before his shoulder, its knob above his head.
ROD_FIST = V(-0.36, -0.22, 0.93)
ROD_UP = V(-0.06, -0.035, 1.0).normalized()
ROD_BELOW, ROD_ABOVE = 0.3, 0.72  # how far it runs below and above the middle of his fist


def bow():
    side = STRING_SIDE.cross(BOW_UP).normalized()  # across the bow's plane
    centres = [BOW_FIST + u * BOW_UP + w * STRING_SIDE for u, w, _ in STAVE]
    rings = []
    for k, (u, w, t) in enumerate(STAVE):
        if t == 0:
            continue
        ahead = (centres[k + 1] - centres[k - 1]).normalized()
        back = side.cross(ahead)  # in the bow's plane, across the stave
        c = centres[k]
        rings.append([c + t * back, c + 0.85 * t * side, c - t * back, c - 0.85 * t * side])
    verts, faces, bands = loft(rings)
    face_mats = [STAVE_BANDS[b] for b in bands]
    for tip, ring_start in ((centres[0], 0), (centres[-1], 4 * (len(rings) - 1))):
        verts.append(tip)
        faces += [(ring_start + i, ring_start + (i + 1) % 4, len(verts) - 1) for i in range(4)]
        face_mats += [0] * 4
    part('bow', verts, faces, [M['wood'], M['leather'], M['trim']], face_mats, inside=nearest_on_polyline(centres))

    # The string, straight from tip to tip.
    top, bottom = centres[-1] - 0.03 * BOW_UP, centres[0] + 0.03 * BOW_UP
    tube('string', bottom, top, [(0, 0.008), (1, 0.008)], M['string'], n=3)


def rod():
    """The white rod "with a golden knob" that Denethor holds in the Tower Hall (The Return of the
    King, V 1): the knob is `trim`, gold at 3 stars."""
    foot, head = ROD_FIST - ROD_BELOW * ROD_UP, ROD_FIST + ROD_ABOVE * ROD_UP
    tube('rod', foot, head, [(0, 0.021), (1, 0.021)], M['rod'], n=6)
    cone('rod-foot', foot, foot - 0.018 * ROD_UP, 0.021, M['rod'], n=6, back=None)
    lump('knob', head + 0.03 * ROD_UP, (0.04, 0.04, 0.036), M['trim'], seed=1, rough=0.0)


def arm(side, shoulder, elbow, wrist):
    """A green sleeve from the shoulder to the elbow, and the forearm in a green gauntlet."""
    cuff = elbow.lerp(wrist, 0.35)
    bent_tube(f'arm-{side}', [shoulder, elbow, cuff, wrist], [0.074, 0.06, 0.07, 0.052],
              [M['tunic'], M['gauntlet']], band_mats=[0, 0, 1])


def fist(side, at, wrist, grip):
    """A gauntleted fist at `at`, closed round a grip running along `grip`."""
    reach = (at - wrist).normalized()
    along = (grip - grip.dot(reach) * reach).normalized()
    box(f'fist-{side}', at, [reach, along, reach.cross(along)], (0.05, 0.056, 0.046), M['gauntlet'], 0.85)


def arms():
    left_shoulder = SHOULDER
    right_shoulder = V(-SHOULDER.x, SHOULDER.y, SHOULDER.z)

    # The bow arm: the elbow down by his side, the forearm forward to the grip.
    reach = (BOW_FIST - left_shoulder).normalized()
    wrist = BOW_FIST - 0.05 * reach
    elbow = bend(left_shoulder, wrist, UPPER_ARM, FOREARM, left_shoulder + V(0.12, 0.25, -0.6))
    arm('left', left_shoulder, elbow, wrist)
    fist('left', BOW_FIST, wrist, BOW_UP)

    # The rod arm: the elbow down and out a little, the forearm raised before him.
    reach = (ROD_FIST - right_shoulder).normalized()
    wrist = ROD_FIST - 0.05 * reach
    elbow = bend(right_shoulder, wrist, UPPER_ARM, FOREARM, right_shoulder + V(-0.25, 0.1, -0.6))
    arm('right', right_shoulder, elbow, wrist)
    fist('right', ROD_FIST, wrist, ROD_UP)


def main():
    reset()
    make_materials()
    legs()
    torso()
    head()
    hair()
    mantle()
    scarf()
    cloak()
    arms()
    bow()
    rod()
    finish('faramir-3', budget=BOOK_BUDGET)


main()
