"""Aragorn, Gondor, Captain: Isildur's heir, with Andúril raised and the standard of the White Tree.

Built in the Faceted style of the reference, Gimli (gimli.py, docs/viewer-spec.md section 4): every
form is a low-segment shape or a hand-placed set of vertices, shaded flat. A Man of heroic
proportions, 1.42 to the top of his head, in the black and silver of Gondor: a black surcoat over
mail with the White Tree on the breast, the Star of Elendil on a fillet at his brow, and a ranger's
high boots. His cloak is the team colour, its hood thrown back over his shoulders as a mantle. He
is a Captain: he holds the reforged sword high to rally his allies, and in his other hand the
standard Arwen made for him, the White Tree on black.

    blender --background --factory-startup --python-exit-code 1 --python aragorn.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

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
    ellipse,
    finish,
    loft,
    material,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    tube,
)

# Aragorn's own colours (sRGB); the rest come from the kit.
SKIN = 0xCC9675  # weathered
HAIR = 0x463E38  # dark, flecked with grey
SABLE = 0x2B2B30  # the black of Gondor: his surcoat and his standard
MITHRIL = 0xE3E5E7  # the Star of Elendil, its fillet, and the White Tree

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        sable=material('sable', SABLE, roughness=0.9),
        mithril=material('mithril', MITHRIL, roughness=0.45, metallic=0.1),
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


def flat(name, points, faces, mat, normal, lift=0.0):
    """A flat detail laid on a surface, lifted off it by `lift` along `normal` and wound to face it."""
    normal = Vector(normal).normalized()
    verts = [Vector(p) + lift * normal for p in points]
    return part(name, verts, faces, mat, outward=normal)


# The White Tree as a flat emblem: (u, v) with u across, -0.5 to 0.5, and v up, 0 to 1. A trunk on
# spreading roots, under a broad crown of five round boughs fanned from its middle. The top of the
# trunk is part of the crown's outline, so nothing overlaps.
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


def tree_points(place):
    """The tree's points, each (u, v) placed in the model by `place`."""
    return [place(u, v) for u, v in TREE_POINTS]


# Legs --------------------------------------------------------------------------------------------

# Feet apart, the left foot forward beside the standard, toes turned out a little.
R_HIP, R_ANKLE, R_YAW = V(-0.092, 0.02, 0.66), V(-0.155, 0.075, 0.11), -12
L_HIP, L_ANKLE, L_YAW = V(0.092, -0.005, 0.66), V(0.15, -0.08, 0.11), 10

# A ranger's high boot. The foot from the sole up, in its own frame (toes towards -y): the height of
# each ring and the right half of it, side, heel and toe, mirrored counter-clockwise by leg().
FOOT = [
    (0.0, [(0.074, -0.016), (0.062, 0.082), (0.056, -0.172)]),  # the sole
    (0.07, [(0.074, -0.008), (0.064, 0.084), (0.056, -0.132)]),  # the instep slopes back from the toe
    (0.17, [(0.068, 0.004), (0.06, 0.068), (0.054, -0.054)]),  # round the ankle
]
# Then up the shin to the knee, round the leg: the height and the radius of each ring.
SHAFT = [(0.27, 0.07), (0.39, 0.078)]
CUFF = (0.352, 0.422, 1.22)  # the turned-down cuff: from and to (z), and how much wider than the boot


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
    for z, r in SHAFT:
        c = axis(z)
        rings.append([c + turn @ V(r * math.cos(a), r * math.sin(a), 0)
                      for a in (math.radians(60 * i) for i in range(6))])
    verts, faces, _ = loft(rings)
    part(f'boot-{side}', verts, faces, M['boots'], inside=lambda c: axis(c.z))
    # A turned-down cuff of paler leather, which makes it read as a high boot.
    low, high, k = CUFF
    r = SHAFT[-1][1] * k
    cuff = [[axis(z) + turn @ V(r * math.cos(a), r * math.sin(a), 0) for a in (math.radians(60 * i) for i in range(6))]
            for z in (low, high)]
    verts, faces, _ = loft(cuff)
    part(f'cuff-{side}', verts, faces, M['leather'], inside=lambda c: axis(c.z))
    # The thigh, in dark breeches, from the hip into the boot.
    tube(f'thigh-{side}', hip, axis(0.37), [(0, 0.094), (1, 0.072)], M['cloth'])


def legs():
    leg('right', R_HIP, R_ANKLE, R_YAW)
    leg('left', L_HIP, L_ANKLE, L_YAW)


# Body --------------------------------------------------------------------------------------------

# The surcoat over the mail as a barrel of octagons: z, half-width, half-depth and centre y. The mail
# shows below the surcoat's hem, and the belt is the band between the fourth and fifth rings.
TORSO = [
    (0.475, 0.22, 0.188, 0.0),  # the mail's hem
    (0.53, 0.234, 0.2, 0.0),  # the surcoat's hem, flared over the thighs
    (0.645, 0.19, 0.146, 0.0),  # hips
    (0.70, 0.178, 0.133, -0.004),  # belt, lower edge
    (0.76, 0.182, 0.135, -0.004),  # belt, upper edge
    (0.89, 0.228, 0.158, -0.01),  # chest
    (0.985, 0.222, 0.138, 0.0),  # shoulders
    (1.0, 0.07, 0.066, 0.01),  # neck, under the collar
]
TORSO_BANDS = [2, 0, 0, 1, 0, 0, 0]  # the mail, then the surcoat, except the belt


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    part('torso', verts, faces, [M['sable'], M['leather'], M['mail']], face_mats, inside=lambda c: V(0, 0, c.z))

    # The White Tree on his breast, on the flat front of the surcoat between the belt and the chest.
    front = [(rings[r][5], rings[r][6]) for r in (4, 5)]  # the front corners, right and left
    plate = [(front[0][0], front[0][1], front[1][1]), (front[0][0], front[1][1], front[1][0])]
    normal = (front[0][1] - front[0][0]).cross(front[1][0] - front[0][0])
    if normal.y > 0:
        normal = -normal

    def place(u, v):
        x, z = 0.1 * u, 0.768 + 0.1 * v
        return V(x, on_surface(plate, x, z), z)

    flat('tree-breast', tree_points(place), TREE_FACES, M['mithril'], normal, 0.003)

    # The belt buckle, its face smaller than its back so the edges read as a bevel.
    axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
    box('buckle', V(0, -0.138, 0.73), axes, (0.014, 0.032, 0.03), M['steel'], 0.75)


# Head --------------------------------------------------------------------------------------------

# The head as rings of eight from the neck up. Each ring is z, then the left half, mirrored to the
# right: the side, the back corner, the back's y, the front corner and the front's y.
HEAD = [
    (1.03, (0.078, 0.012), (0.056, 0.064), 0.078, (0.054, -0.05), -0.062),  # the neck, in the collar
    (1.085, (0.1, 0.004), (0.072, 0.076), 0.092, (0.07, -0.09), -0.118),  # under the jaw; the chin
    (1.16, (0.118, -0.002), (0.092, 0.088), 0.106, (0.086, -0.1), -0.13),  # the mouth
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

    # Deep-set eyes in the shade of the brows, laid just proud of the face.
    for s in (-1, 1):
        corners = [(s * 0.024, 1.27), (s * 0.08, 1.274), (s * 0.052, 1.252)]
        verts = [V(x, on_surface(face, x, z) - 0.004, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A stern mouth, a short dark line.
    corners = [(-0.036, 1.152), (0, 1.157), (0.036, 1.152), (0.03, 1.144), (0, 1.148), (-0.03, 1.144)]
    verts = [V(x, on_surface(face, x, z) - 0.003, z) for x, z in corners]
    part('mouth', verts, [(0, 1, 4, 5), (1, 2, 3, 4)], M['eyes'], outward=V(0, -1, 0))

    # A straight nose from under the brow to its tip.
    top, tip = V(0, -0.12, 1.292), V(0, -0.162, 1.2)
    left, right, under = V(-0.027, -0.114, 1.198), V(0.027, -0.114, 1.198), V(0, -0.124, 1.186)
    verts = [top, tip, left, right, under]
    part('nose', verts, [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)], M['skin'], inside=V(0, -0.08, 1.24))

    # Heavy brows: a bar jutting over the eyes, lower in the middle for a frown.
    sections = [
        [V(x, y, 1.322 + dz), V(x, y - 0.024, 1.305 + dz), V(x, y + 0.004, 1.288 + dz)]
        for x, y, dz in ((-0.096, -0.09, 0.006), (0, -0.122, -0.008), (0.096, -0.09, 0.006))
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brows', verts, faces, M['hair'], inside=V(0, -0.07, 1.3))

    # The fillet over his brow and his hair, and the Star of Elendil on it.
    def ring_at(z, grow):
        k = (z - HEAD[4][0]) / (HEAD[5][0] - HEAD[4][0])
        return [a.lerp(b, k) + grow * V(a.x, a.y - 0.01, 0).normalized() for a, b in zip(rings[4], rings[5])]

    # It runs round the front of his head from side to side; behind, it is under his hair.
    band = [[V(p.x, p.y, z) for p in (ring_at(z, 0.006)[i] for i in (4, 5, 6, 7, 0))] for z in (1.333, 1.347)]
    verts, faces, _ = loft(band, closed=False)
    part('fillet', verts, faces, M['mithril'], inside=V(0, 0.0, 1.34))

    front = ring_at(1.34, 0.006)[6]
    up = (rings[5][6] - rings[4][6]).normalized()
    out = up.cross(V(1, 0, 0)).normalized()
    if out.y > 0:
        out = -out
    across = V(1, 0, 0)
    centre = front + 0.004 * out
    tips = [centre + 0.03 * up, centre - 0.027 * across, centre - 0.024 * up, centre + 0.027 * across]
    inner = [centre + 0.008 * (up + across), centre + 0.008 * (up - across),
             centre - 0.008 * (up + across), centre - 0.008 * (up - across)]
    raised = centre + 0.008 * out
    verts = [raised] + tips + inner
    # Four points (1 to 4: up, to his right, down, to his left) round a raised middle (0), with the
    # inner corners between them (5 to 8).
    faces = []
    order = [(1, 6, 2), (2, 7, 3), (3, 8, 4), (4, 5, 1)]  # each point, the corner after it and the next
    for t, c, n in order:
        faces += [(0, t, c), (0, c, n)]
    part('star', verts, faces, M['mithril'], outward=out)


def hair():
    # Shoulder-length hair down the back and sides of his head, in locks to his collar. It rises over
    # the fillet behind, so the fillet shows only across his brow. Each level runs round him from just
    # in front of his left ear, past the back, to his right.
    angles = [math.radians(a) for a in (-15, 20, 55, 90, 125, 160, 195)]
    top = [(0.138, -0.034, 1.35), (0.137, 0.046, 1.362), (0.092, 0.116, 1.376), (0, 0.132, 1.385)]
    levels = [  # half-width, half-depth, centre y and the height of each point
        (0.148, 0.14, 0.006, [1.18, 1.17, 1.165, 1.16, 1.165, 1.17, 1.18]),
        (0.168, 0.162, 0.032, [1.09, 1.052, 1.07, 1.04, 1.07, 1.052, 1.09]),
    ]
    rings = [[V(*p) for p in top] + [V(-x, y, z) for x, y, z in reversed(top[:-1])]]
    rings += [[V(rx * math.cos(a), cy + ry * math.sin(a), z) for a, z in zip(angles, zs)] for rx, ry, cy, zs in levels]
    verts, faces, _ = loft(rings, closed=False)
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z))


# Team colour: the hood thrown back as a mantle, and the cloak ------------------------------------


def mantle():
    # Eight points round the neck and the shoulders, starting at his left shoulder (+X); the front
    # dips to the clasp at his throat and the back rises where the hood gathers.
    neck_z = [1.065, 1.08, 1.095, 1.08, 1.065, 1.045, 1.03, 1.045]
    neck = ellipse(0, 0.012, 0, 0.098, 0.092, 8, 0, neck_z)
    dome = ellipse(0, 0.01, 0, 0.23, 0.17, 8, 0, [z - 0.045 for z in neck_z])
    shoulder_z = [0.955, 0.965, 0.975, 0.965, 0.955, 0.95, 0.945, 0.95]
    shoulder = ellipse(0, 0.008, 0, 0.302, 0.206, 8, 0, shoulder_z)
    hem = ellipse(0, 0.008, 0, 0.294, 0.2, 8, 0, [z - 0.065 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('mantle', verts, faces, M['team'], inside=V(0, 0.01, 0.9))

    # The hood itself, bunched on his upper back under his hair.
    a, g, b = V(-0.13, 0.12, 1.05), V(0, 0.165, 1.06), V(0.13, 0.12, 1.05)
    c, e, d = V(-0.18, 0.225, 0.93), V(0, 0.262, 0.96), V(0.18, 0.225, 0.93)
    f = V(0, 0.25, 0.79)
    verts = [a, g, b, c, e, d, f]
    faces = [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 6), (4, 5, 6)]
    part('hood', verts, faces, M['team'], inside=V(0, 0.12, 0.92))


def cloak():
    # Down his back to the knees, in four folds, the hem lowest in the middle. Each level: z at the
    # middle and at the edges, half-width, half-depth, centre y, how far short of the sides it stops
    # (degrees) and how deep the folds are.
    levels = [
        (0.94, 0.94, 0.27, 0.178, 0.02, 24, 0.0),
        (0.67, 0.69, 0.292, 0.224, 0.015, 15, 0.03),
        (0.41, 0.46, 0.325, 0.27, 0.025, 8, 0.05),
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


# Arms --------------------------------------------------------------------------------------------

# The right arm raised out to the side, the fist above his shoulder with Andúril held high; the left
# forearm forward to the standard's pole.
R_SHOULDER, R_ELBOW = V(-0.215, 0.015, 0.955), V(-0.38, 0.0, 1.1)
R_WRIST, R_FIST = V(-0.485, -0.04, 1.26), V(-0.503, -0.046, 1.3)
L_SHOULDER, L_ELBOW = V(0.215, 0.015, 0.955), V(0.325, 0.04, 0.76)
POLE = V(0.375, -0.12, 0.0)
L_FIST = V(POLE.x, POLE.y, 0.87)
L_WRIST = L_FIST + (L_ELBOW - L_FIST).normalized() * 0.045


def arm(side, shoulder, elbow, wrist, fist, grip):
    """A mail sleeve, a leather bracer and a fist closed round a grip running along `grip`."""
    tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.078), (1.1, 0.065)], M['mail'])
    forearm = [(-0.15, 0.06), (0.35, 0.069), (1.0, 0.06)]
    tube(f'forearm-{side}', elbow, wrist, forearm, [M['mail'], M['leather']], [0, 1])
    along = Vector(grip).normalized()
    ahead = wrist - elbow
    ahead = (ahead - ahead.dot(along) * along).normalized()
    box(f'fist-{side}', fist, [ahead, along, ahead.cross(along)], (0.05, 0.057, 0.055), M['skin'], 0.88)


# Andúril, raised in his right hand -----------------------------------------------------------------

SWORD = V(-0.05, -0.08, 1.0).normalized()  # upright, a little forward and out


def anduril():
    along = SWORD
    across = along.cross(V(0, 1, 0)).normalized()  # the edges, out to the sides
    thick = across.cross(along)  # the flats face forward and back
    guard = R_FIST + 0.075 * along

    # The blade: a flattened diamond in section, narrowing a little to a long point.
    def section(c, w, t):
        return [c + w * across, c + t * thick, c - w * across, c - t * thick]

    rings = [section(guard, 0.043, 0.013), section(guard + 0.52 * along, 0.036, 0.011)]
    verts, faces, _ = loft(rings)
    verts.append(guard + 0.64 * along)
    faces += [(4 + i, 4 + (i + 1) % 4, 8) for i in range(4)]
    part('blade', verts, faces, M['steel'], inside=guard + 0.3 * along)

    # The cross-guard on top of his fist. The grip and pommel would be hidden in his fist and wrist,
    # since he holds the sword up along his forearm, so they are left out.
    box('guard', guard, [along, across, thick], (0.017, 0.112, 0.022), M['steel'], 0.8)

    arm('right', R_SHOULDER, R_ELBOW, R_WRIST, R_FIST, along)


# The standard of the White Tree, in his left hand --------------------------------------------------

POLE_TOP = 1.93
BAR = 1.85  # the cross-bar the banner hangs from
FLAG = [-0.18, -0.115, 0.0, 0.115, 0.18]  # the banner's columns, across from the pole
FLAG_ROWS = [1.85, 1.63]  # and its rows, down from the bar
FLAG_HEM = [1.37, 1.41, 1.47, 1.41, 1.37]  # swallow-tailed
FLAG_FOLD = [0.035, 0.0, 0.0, 0.0, 0.035]  # its sides curl back
FLAG_Y = POLE.y - 0.028


def standard():
    tube('pole', POLE, POLE + V(0, 0, POLE_TOP), [(0, 0.021), (1, 0.018)], M['wood'])
    # A silver spear-point on the top.
    top = POLE + V(0, 0, POLE_TOP)
    ring = segment(top, top + V(0, 0, 1), [(0, 0.032)], 4, 0)[0]
    verts = ring + [top + V(0, 0, 0.1), top - V(0, 0, 0.03)]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('finial', verts, faces, M['steel'], inside=top + V(0, 0, 0.02))
    tube('bar', POLE + V(-0.19, -0.012, BAR), POLE + V(0.19, -0.012, BAR), [(0, 0.014), (1, 0.014)],
         M['wood'], n=4, phase=45)

    # The banner, hanging from the bar in front of the pole.
    rows = [[V(POLE.x + u, FLAG_Y + f, z) for u, f in zip(FLAG, FLAG_FOLD)] for z in FLAG_ROWS]
    rows.append([V(POLE.x + u, FLAG_Y + f, z) for u, f, z in zip(FLAG, FLAG_FOLD, FLAG_HEM)])
    verts, faces, _ = loft(rows, closed=False)
    part('banner', verts, faces, M['sable'], outward=V(0, -1, 0))

    # The White Tree on both faces of it, on its flat middle.
    for name, lift, normal in (('tree-front', -0.004, V(0, -1, 0)), ('tree-back', 0.004, V(0, 1, 0))):
        points = tree_points(lambda u, v, y=FLAG_Y + lift: V(POLE.x + 0.21 * u, y, 1.5 + 0.27 * v))
        flat(name, points, TREE_FACES, M['mithril'], normal)

    arm('left', L_SHOULDER, L_ELBOW, L_WRIST, L_FIST, V(0, 0, 1))


def main():
    reset()
    make_materials()
    legs()
    torso()
    head()
    hair()
    mantle()
    cloak()
    anduril()
    standard()
    finish('aragorn')


main()
