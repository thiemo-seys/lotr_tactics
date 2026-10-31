"""Beregond son of Baranor, Gondor, Guardian: a Guard of the Citadel of Minas Tirith.

Built in the Faceted style of the reference, Gimli (gimli.py, docs/viewer-spec.md section 4), and in
the family of Aragorn (aragorn.py): every form is a low-segment shape or a hand-placed set of
vertices, shaded flat. A Man of heroic proportions, his head where Aragorn's is, in the livery the
books give the Guards of the Citadel: a black surcoat over mail with a white tree blossoming beneath
a silver crown on the breast, and a tall helm with long cheek-guards, set above them with the white
wings of sea-birds. The wings are his read on the board: they spread up and out from his temples,
their faces to the front and back, so they show from either side of it.

He is a Guardian: a tall shield held forward on his left arm, its face the team colour with the White
Tree on it, and an arming sword ready in his right hand, held low with its point up and out. The team
colour is also on his short cloak, a mantle over the shoulders and a cape down his back to the hips;
from behind, his helm and wings, the sword and the shield's rim show round and above it.

    blender --background --factory-startup --python-exit-code 1 --python beregond.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand, on the sword, is at -X.
"""

import math
import os
import sys

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
    team_material,
    tube,
    wind,
)

# Beregond's own colours (sRGB); the rest come from the kit.
SKIN = 0xC79272  # weathered, a little ruddier than Aragorn
HAIR = 0x2C2521  # the dark hair of the folk of Gondor
SABLE = 0x2B2B30  # the black of the Guard: his surcoat
MITHRIL = 0xE3E5E7  # the White Tree and the crown above it
FEATHER = 0xF0EEE6  # the white wings of sea-birds on his helm

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        sable=material('sable', SABLE, roughness=0.9),
        mithril=material('mithril', MITHRIL, roughness=0.45, metallic=0.1),
        feathers=material('feathers', FEATHER, roughness=0.8),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        mail=material('mail', MAIL, roughness=0.8, metallic=0.05),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        cloth=material('cloth', CLOTH, roughness=0.9),
        wood=material('wood', WOOD, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
    )


def new_objects(before):
    """The objects added to the scene since `before`, a set of the objects then."""
    return [o for o in bpy.context.scene.objects if o not in before]


def flat(name, points, faces, mat, normal, lift=0.0):
    """A flat detail laid on a surface, lifted off it by `lift` along `normal` and wound to face it."""
    normal = Vector(normal).normalized()
    verts = [Vector(p) + lift * normal for p in points]
    return part(name, verts, faces, mat, outward=normal)


def bend(root, end, upper, lower, pole):
    """Where the elbow goes on a limb from `root` to `end` with bones `upper` and `lower` long, bent
    towards the point `pole`."""
    axis = end - root
    reach = min(max(axis.length, abs(upper - lower) + 1e-4), upper + lower - 1e-4)
    axis.normalize()
    along = (upper * upper - lower * lower + reach * reach) / (2 * reach)
    out = (pole - root) - (pole - root).dot(axis) * axis
    return root + along * axis + math.sqrt(max(upper * upper - along * along, 0.0)) * out.normalized()


# The White Tree as a flat emblem, as on Aragorn's breast: (u, v) with u across, -0.5 to 0.5, and v up,
# 0 to 1. A trunk on spreading roots, under a broad crown of five round boughs fanned from its middle.
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

# The silver crown above the tree on his breast: a band with three tines, in the same (u, v).
CROWN_POINTS = [(-0.5, 0.0), (0.5, 0.0), (0.5, 1.0), (0.22, 0.42), (0.0, 1.0), (-0.22, 0.42), (-0.5, 1.0)]
CROWN_FACES = [(0, 1, 3, 5), (1, 2, 3), (5, 3, 4), (0, 5, 6)]


# Legs --------------------------------------------------------------------------------------------

# Feet apart and braced, the shield-side (left) foot forward, toes turned out a little.
R_HIP, R_ANKLE, R_YAW = V(-0.094, 0.025, 0.66), V(-0.165, 0.1, 0.11), -14
L_HIP, L_ANKLE, L_YAW = V(0.094, -0.01, 0.66), V(0.155, -0.11, 0.11), 10

# The boot, from the sole up, in its own frame (toes towards -y): the height of each ring and the
# right half of it, side, heel and toe, mirrored counter-clockwise by leg().
FOOT = [
    (0.0, [(0.074, -0.016), (0.062, 0.082), (0.056, -0.172)]),  # the sole
    (0.07, [(0.074, -0.008), (0.064, 0.084), (0.056, -0.132)]),  # the instep slopes back from the toe
    (0.17, [(0.068, 0.004), (0.06, 0.068), (0.054, -0.054)]),  # round the ankle
]
# Then the steel greave up the front of the shin to the knee, and the hose above it up into the skirt:
# the height and the radius of each ring, and how far forward its front stands.
GREAVE = [(0.4, 0.078, 0.012), (0.47, 0.088, 0.0)]


def leg(side, hip, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    up = hip - ankle

    def axis(z):
        return ankle + up * ((z - ankle.z) / up.z) if z > ankle.z else V(at.x, at.y, z)

    rings = []
    for z, (s, heel, toe) in FOOT:
        outline = [s, heel, (-heel[0], heel[1]), (-s[0], s[1]), (-toe[0], toe[1]), toe]
        rings.append([at + turn @ V(x, y, z) for x, y in outline])
    for z, r, ridge in GREAVE:
        ring = [V(r * math.cos(a), r * math.sin(a), 0) for a in (math.radians(60 * i) for i in range(6))]
        for i in (4, 5):  # the plate over the shin stands forward of the leg
            ring[i] += V(0, -ridge, 0)
        rings.append([axis(z) + turn @ p for p in ring])
    verts, faces, bands = loft(rings)
    # The boot, then the greave over the front three faces of the shin, then the hose.
    face_mats = [0 if b < 2 or (b == 2 and i % 6 < 3) else 1 if b == 2 else 2 for i, b in enumerate(bands)]
    part(f'leg-{side}', verts, faces, [M['boots'], M['steel'], M['cloth']], face_mats, inside=lambda c: axis(c.z))


def legs():
    leg('right', R_HIP, R_ANKLE, R_YAW)
    leg('left', L_HIP, L_ANKLE, L_YAW)


# Body --------------------------------------------------------------------------------------------

LEAN = 4  # degrees the body above the hips leans forward, braced behind the shield
PIVOT = V(0, 0, 0.62)

# The surcoat over the mail as a barrel of octagons: z, half-width, half-depth and centre y. The mail
# shows below the surcoat's hem, and the belt is the band between the fourth and fifth rings. Longer
# in the skirt than Aragorn's, as a guard's livery.
TORSO = [
    (0.44, 0.226, 0.192, 0.0),  # the mail's hem
    (0.49, 0.24, 0.205, 0.0),  # the surcoat's hem, flared over the thighs
    (0.635, 0.194, 0.15, 0.0),  # hips
    (0.685, 0.182, 0.137, -0.004),  # belt, lower edge
    (0.74, 0.186, 0.139, -0.004),  # belt, upper edge
    (0.89, 0.236, 0.162, -0.01),  # chest
    (0.985, 0.226, 0.14, 0.0),  # shoulders
    (1.0, 0.07, 0.066, 0.01),  # neck, under the collar
]
TORSO_BANDS = [2, 0, 0, 1, 0, 0, 0]  # the mail, then the surcoat, except the belt


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    part('torso', verts, faces, [M['sable'], M['leather'], M['mail']], face_mats, inside=lambda c: V(0, 0, c.z))

    # The White Tree beneath a silver crown on his breast, on the flat front of the surcoat between
    # the belt and the chest.
    front = [(rings[r][5], rings[r][6]) for r in (4, 5)]  # the front corners, right and left
    plate = [(front[0][0], front[0][1], front[1][1]), (front[0][0], front[1][1], front[1][0])]
    normal = (front[0][1] - front[0][0]).cross(front[1][0] - front[0][0])
    if normal.y > 0:
        normal = -normal

    def placer(width, bottom, height):
        def place(u, v):
            x, z = width * u, bottom + height * v
            return V(x, on_surface(plate, x, z), z)
        return place

    place = placer(0.11, 0.745, 0.09)
    flat('tree-breast', [place(u, v) for u, v in TREE_POINTS], TREE_FACES, M['mithril'], normal, 0.003)
    place = placer(0.07, 0.838, 0.028)
    flat('crown-breast', [place(u, v) for u, v in CROWN_POINTS], CROWN_FACES, M['mithril'], normal, 0.003)

    # The belt buckle, its face smaller than its back so the edges read as a bevel.
    axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
    box('buckle', V(0, -0.14, 0.712), axes, (0.014, 0.032, 0.03), M['steel'], 0.75)


# Head --------------------------------------------------------------------------------------------

# The head as rings of eight from the neck up to the brow, under the helm's brim. Each ring is z,
# then the left half, mirrored to the right: the side, the back corner, the back's y, the front
# corner and the front's y. A broad, square jaw.
HEAD = [
    (1.01, (0.078, 0.012), (0.056, 0.064), 0.078, (0.054, -0.05), -0.062),  # the neck, in the collar
    (1.068, (0.104, 0.004), (0.076, 0.078), 0.094, (0.078, -0.094), -0.12),  # under the jaw; the chin
    (1.145, (0.12, -0.002), (0.094, 0.09), 0.108, (0.09, -0.104), -0.132),  # the mouth
    (1.228, (0.128, 0.002), (0.102, 0.096), 0.118, (0.096, -0.106), -0.128),  # cheekbones and eyes
    (1.3, (0.13, 0.008), (0.104, 0.102), 0.124, (0.094, -0.108), -0.127),  # the brow, under the brim
]
# Faces 4 to 7 of each band, round the ring, are his right cheek, the two halves of his face and his
# left cheek: skin. The rest are the dark hair at the back of his head, under the helm.
SKIN_FACES = {4, 5, 6, 7}


def head_ring(z, side, back_corner, back_y, front_corner, front_y):
    (sx, sy), (bx, by), (fx, fy) = side, back_corner, front_corner
    return [V(sx, sy, z), V(bx, by, z), V(0, back_y, z), V(-bx, by, z), V(-sx, sy, z), V(-fx, fy, z),
            V(0, front_y, z), V(fx, fy, z)]


def head():
    rings = [head_ring(*r) for r in HEAD]
    verts, faces, _ = loft(rings)
    face_mats = [0 if i % 8 in SKIN_FACES else 1 for i in range(len(faces))]
    part('head', verts, faces, [M['skin'], M['hair']], face_mats, inside=V(0, 0.0, 1.2))

    # The planes of his face either side of the middle, for laying details on.
    face = []
    for r in range(1, 4):
        lo, hi = rings[r], rings[r + 1]
        for a, b in ((5, 6), (6, 7)):
            face += [(lo[a], lo[b], hi[b]), (lo[a], hi[b], hi[a])]

    # Eyes in the shade of the brim, laid just proud of the face.
    for s in (-1, 1):
        corners = [(s * 0.024, 1.25), (s * 0.08, 1.254), (s * 0.052, 1.232)]
        verts = [V(x, on_surface(face, x, z) - 0.004, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A stern mouth, a short dark line.
    corners = [(-0.036, 1.138), (0, 1.143), (0.036, 1.138), (0.03, 1.13), (0, 1.134), (-0.03, 1.13)]
    verts = [V(x, on_surface(face, x, z) - 0.003, z) for x, z in corners]
    part('mouth', verts, [(0, 1, 4, 5), (1, 2, 3, 4)], M['eyes'], outward=V(0, -1, 0))

    # A straight nose from under the brow to its tip.
    top, tip = V(0, -0.12, 1.272), V(0, -0.164, 1.18)
    left, right, under = V(-0.027, -0.115, 1.178), V(0.027, -0.115, 1.178), V(0, -0.125, 1.166)
    verts = [top, tip, left, right, under]
    part('nose', verts, [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)], M['skin'], inside=V(0, -0.08, 1.22))

    # Heavy brows: a bar jutting over the eyes, lower in the middle for a frown.
    sections = [
        [V(x, y, 1.3 + dz), V(x, y - 0.024, 1.284 + dz), V(x, y + 0.004, 1.267 + dz)]
        for x, y, dz in ((-0.096, -0.09, 0.006), (0, -0.122, -0.008), (0.096, -0.09, 0.006))
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brows', verts, faces, M['hair'], inside=V(0, -0.07, 1.28))


# The helm: tall, with long cheek-guards and the white wings of sea-birds -----------------------------

# Rings of eight from the brim up, a corner to the front so a ridge runs up it: z at the side, the
# back and the front (the brim comes down over the nape as a short neck-guard), and the radius.
HELM = [
    (1.272, 1.19, 1.292, 0.157),  # the brim
    (1.325, 1.285, 1.338, 0.154),  # the top of the brow band
    (1.415, 1.4, 1.42, 0.136),
    (1.478, 1.47, 1.478, 0.098),
    (1.52, 1.517, 1.52, 0.05),
]
HELM_TOP = V(0, 0.008, 1.55)


def helm():
    rings = []
    for side, back, front, r in HELM:
        zs = [side, (side + back) / 2, back, (side + back) / 2, side, (side + front) / 2, front, (side + front) / 2]
        rings.append(ellipse(0, 0.008, 0, r, r * 0.98, 8, 0, zs))
    verts, faces, _ = loft(rings)
    apex, last = len(verts), (len(rings) - 1) * 8
    verts.append(HELM_TOP)
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    part('helm', verts, faces, M['steel'], inside=V(0, 0.008, 1.32))

    # Long cheek-guards from the brim down beside his face to the jaw, close-fitting: plates with a
    # little thickness, bent forward round his cheekbones.
    for s in (-1, 1):
        outer = [V(s * 0.156, 0.048, 1.262), V(s * 0.132, -0.104, 1.284), V(s * 0.104, -0.1, 1.085),
                 V(s * 0.128, 0.026, 1.098)]
        inner = [p - V(s * 0.013, 0, 0) for p in outer]
        verts = outer + inner
        faces = [(0, 1, 2, 3), (4, 5, 6, 7)] + [(i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i) for i in range(4)]
        part(f'cheek-guard-{s}', verts, faces, M['steel'], inside=V(s * 0.124, -0.03, 1.18))


# Each wing is built for his left side and mirrored to his right. It rises from the side of the helm
# above the cheek-guard, up, out and a little back. Its faces are upright, turned to the front and back,
# so the camera sees as much of it from behind the near side as from in front of the far side. Its
# outline is (u, v): u along it from the root and v across it, towards the leading edge, which bows up
# and in; the long feathers point out and down.
WING_ROOT = V(0.12, 0.03, 1.33)
WING_ALONG = V(0.62, 0.14, 0.78).normalized()
WING_SCALE = 1.22
WING_OUTLINE = [
    (0.0, 0.022),  # the root, on the leading edge
    (0.14, 0.058),  # the bend of the wing
    (0.3, 0.032),
    (0.365, -0.01),  # the tip
    (0.272, -0.038),
    (0.285, -0.088),  # the second feather
    (0.192, -0.064),
    (0.185, -0.112),  # the third
    (0.085, -0.068),
    (0.0, -0.032),  # the root, on the trailing edge
]
# A raised spine along the middle, (u, v, half-thickness): the faces slope to the edges from it.
WING_SPINE = [(0.0, 0.0, 0.014), (0.14, -0.004, 0.014), (0.26, -0.012, 0.009)]
# Triangles of each face: outline points 0 to 9, then the spine 10 to 12.
WING_FACES = [
    (0, 1, 10), (1, 11, 10), (1, 2, 11), (2, 12, 11), (2, 3, 12), (3, 4, 12), (4, 5, 12),
    (5, 6, 12), (6, 11, 12), (6, 7, 11), (7, 8, 11), (8, 10, 11), (8, 9, 10), (9, 0, 10),
]


def wings():
    along = WING_ALONG
    normal = along.cross(V(0, 0, 1)).normalized()  # the front face, upright
    across = normal.cross(along).normalized()  # towards the leading edge: up and in
    for s in (1, -1):
        def at(u, v, w=0.0, s=s):
            p = WING_ROOT + WING_SCALE * (u * along + v * across) + w * normal
            return V(s * p.x, p.y, p.z)

        verts = [at(u, v) for u, v in WING_OUTLINE]
        verts += [at(u, v, t) for u, v, t in WING_SPINE] + [at(u, v, -t) for u, v, t in WING_SPINE]
        out = V(s * normal.x, normal.y, normal.z)
        back = [tuple(i + 3 if i >= 10 else i for i in f) for f in WING_FACES]
        faces = wind(verts, WING_FACES, outward=out) + wind(verts, back, outward=-out)
        part(f'wing-{s}', verts, faces, M['feathers'])


# Team colour: a mantle over the shoulders and a short cape down his back to the hips -----------------


def mantle():
    # Eight points round the neck and the shoulders, starting at his left shoulder (+X); the front
    # dips to the clasp at his throat and the back rises a little behind his neck.
    neck_z = [1.06, 1.075, 1.085, 1.075, 1.06, 1.04, 1.025, 1.04]
    neck = ellipse(0, 0.012, 0, 0.1, 0.094, 8, 0, neck_z)
    dome = ellipse(0, 0.01, 0, 0.236, 0.172, 8, 0, [z - 0.045 for z in neck_z])
    shoulder_z = [0.955, 0.965, 0.975, 0.965, 0.955, 0.95, 0.94, 0.95]
    shoulder = ellipse(0, 0.008, 0, 0.31, 0.21, 8, 0, shoulder_z)
    hem = ellipse(0, 0.008, 0, 0.302, 0.204, 8, 0, [z - 0.06 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('mantle', verts, faces, M['team'], inside=V(0, 0.01, 0.9))


def cape():
    # Down his back to the hips, in four folds, the hem lowest in the middle. Each level: z at the
    # middle and at the edges, half-width, half-depth, centre y, how far short of the sides it stops
    # (degrees) and how deep the folds are. It hangs behind his arms.
    levels = [
        (0.94, 0.94, 0.27, 0.18, 0.02, 24, 0.0),
        (0.78, 0.8, 0.285, 0.212, 0.025, 22, 0.036),
        (0.6, 0.66, 0.3, 0.24, 0.03, 18, 0.058),
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
    part('cape', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z))


# Arms --------------------------------------------------------------------------------------------

# The shoulder joints sit a little inside and under the mantle, so the sleeves' tops stay under it.
R_SHOULDER, L_SHOULDER = V(-0.205, 0.015, 0.935), V(0.205, 0.015, 0.935)
UPPER_ARM, FOREARM = 0.23, 0.235


def arm(side, shoulder, fist, pole, grip, ahead=None):
    """A mail sleeve, a leather bracer and a fist closed round a grip running along `grip`, the elbow
    bent towards `pole`. The knuckles point along the forearm, or along `ahead`."""
    reach = (fist - shoulder).normalized()
    elbow = bend(shoulder, fist - 0.05 * reach, UPPER_ARM, FOREARM, pole)
    wrist = fist - 0.035 * (fist - elbow).normalized()  # inside the fist, which hides the bracer's end
    tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.078), (1.1, 0.066)], M['mail'])
    forearm = [(-0.15, 0.06), (0.35, 0.069), (1.0, 0.06)]
    tube(f'forearm-{side}', elbow, wrist, forearm, [M['mail'], M['leather']], [0, 1])
    along = Vector(grip).normalized()
    ahead = (fist - elbow) if ahead is None else Vector(ahead)
    ahead = (ahead - ahead.dot(along) * along).normalized()
    box(f'fist-{side}', fist, [ahead, along, ahead.cross(along)], (0.05, 0.057, 0.055), M['skin'], 0.88)


# The shield, on his left arm: tall, round-topped and drawn to a point below ----------------------------

SHIELD_CENTRE = V(0.33, -0.31, 0.68)
SHIELD_TURN = Matrix.Rotation(math.radians(28), 3, 'Z') @ Matrix.Rotation(math.radians(-6), 3, 'X')
SHIELD_W = 0.205  # half its width
BULGE = 0.045  # how far forward its middle stands of its sides: it curves round him
# Its outline, (u, v), u across to his left and v up, from the point at the bottom up his left side,
# over the round top and down again.
SHIELD = [
    (0.0, -0.4), (0.075, -0.31), (0.145, -0.19), (0.192, -0.04), (0.205, 0.1), (0.19, 0.22), (0.13, 0.295),
    (0.0, 0.325), (-0.13, 0.295), (-0.19, 0.22), (-0.205, 0.1), (-0.192, -0.04), (-0.145, -0.19), (-0.075, -0.31),
]
# The strips its face and back are filled with, between the two sides of the outline.
SHIELD_STRIPS = [(0, 1, 13), (1, 2, 12, 13), (2, 3, 11, 12), (3, 4, 10, 11), (4, 5, 9, 10), (5, 6, 8, 9), (6, 7, 8)]
RIM = 0.024  # the steel rim's width


def on_shield(u, v, w=0.0):
    """A point of the shield: u across, v up, and w forward of the plane of its edge, on its curve."""
    bulge = BULGE * (1 - min((u / SHIELD_W) ** 2, 1.0))
    return SHIELD_CENTRE + SHIELD_TURN @ V(u, -(bulge + w), v)


def inset(outline, width):
    """The outline moved in by `width`, each point along the bisector of its corner."""
    points = [Vector((u, v)) for u, v in outline]
    n = len(points)
    moved = []
    for i, p in enumerate(points):
        a, b = points[i - 1], points[(i + 1) % n]
        e1, e2 = (p - a).normalized(), (b - p).normalized()
        n1, n2 = Vector((-e1.y, e1.x)), Vector((-e2.y, e2.x))  # inward, for a counter-clockwise outline
        mid = (n1 + n2).normalized()
        moved.append(tuple(p + mid * (width / max(mid.dot(n1), 0.3))))
    return moved


def shield():
    forward = SHIELD_TURN @ V(0, -1, 0)
    # Its outline three times: the outer edge, the crest of the steel rim and the rim's inner edge.
    inner = inset(SHIELD, RIM)
    crest = inset(SHIELD, 0.006)
    rings = [[on_shield(u, v, w) for u, v in ring] for ring, w in ((SHIELD, -0.004), (crest, 0.02), (inner, 0.006))]
    verts, faces, _ = loft(rings)
    axis = nearest_on_line(SHIELD_CENTRE, SHIELD_CENTRE + forward)
    n = len(SHIELD)
    faces = wind(verts, faces[:n], inside=axis) + wind(verts, faces[n:], outward=forward)
    face_mats = [1] * (2 * n)
    faces += wind(verts, [tuple(2 * n + i for i in s) for s in SHIELD_STRIPS], outward=forward)
    face_mats += [0] * len(SHIELD_STRIPS)
    faces += wind(verts, SHIELD_STRIPS, outward=-forward)
    face_mats += [2] * len(SHIELD_STRIPS)
    part('shield', verts, faces, [M['team'], M['steel'], M['wood']], face_mats)

    # The White Tree on its face, just proud of it, its crown where the shield is widest.
    points = [on_shield(0.25 * u, -0.17 + 0.36 * v, 0.008) for u, v in TREE_POINTS]
    part('tree-shield', points, wind(points, TREE_FACES, outward=forward), M['mithril'])


# The sword, in his right fist: an arming sword, held low with its point up and out --------------------

R_FIST = V(-0.365, -0.19, 0.8)
BLADE = V(-0.38, -0.12, 1.0).normalized()


def sword():
    d = BLADE
    across = d.cross(V(0, 1, 0)).normalized()  # the edges
    thick = across.cross(d).normalized()  # square to the flat of the blade
    g = R_FIST
    cone('pommel', g - 0.075 * d, g - 0.125 * d, 0.034, M['steel'], n=4, back=g - 0.045 * d)
    box('guard', g + 0.078 * d, [d, across, thick], (0.016, 0.1, 0.024), M['steel'], 0.8)
    # A diamond in section, narrowing a little to a long point.
    stations = [(0.09, 0.04, 0.012), (0.5, 0.033, 0.01)]
    rings = [[g + t * d + w * across, g + t * d + k * thick, g + t * d - w * across, g + t * d - k * thick]
             for t, w, k in stations]
    verts, faces, _ = loft(rings)
    verts.append(g + 0.64 * d)
    last = (len(rings) - 1) * 4
    faces += [(last + i, last + (i + 1) % 4, len(verts) - 1) for i in range(4)]
    part('blade', verts, faces, M['steel'], inside=nearest_on_line(g, g + d))


def arms():
    # The shield arm hangs from the shoulder and the forearm reaches forward to the grip behind the
    # shield, the fist square to the boards.
    grip = on_shield(0, 0.05, -0.066)
    arm('left', L_SHOULDER, grip, L_SHOULDER + V(0.16, 0.0, -0.3), SHIELD_TURN @ V(0, 0, 1),
        SHIELD_TURN @ V(0, -1, 0))
    # The sword arm: the elbow down at his side, the forearm forward to the fist.
    arm('right', R_SHOULDER, R_FIST, R_SHOULDER + V(-0.2, -0.02, -0.3), BLADE)


def main():
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    head()
    helm()
    wings()
    mantle()
    cape()
    shield()
    sword()
    arms()
    lean(new_objects(before), PIVOT, LEAN)
    finish('beregond')


main()
