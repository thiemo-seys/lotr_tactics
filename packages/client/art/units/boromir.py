"""Boromir, Gondor, Captain: the Steward's elder son, of the Fellowship, with the Horn of Gondor raised.

Built in the Faceted style of the reference, Gimli (gimli.py, docs/viewer-spec.md section 4), in the
family of Aragorn (aragorn.py), who sets the look of Gondor: every form is a low-segment shape or a
hand-placed set of vertices, shaded flat. A Man of heroic proportions, 1.42 to the top of his head,
in the black and silver of Gondor: a black surcoat over a long mail coat, and steel vambraces. From
the books: a tall Man with a fair and noble face and dark hair, who wore a great horn tipped with
silver on a baldric, and bore a long sword and a round shield. He is a Captain: he holds the great
horn up in his left hand, ready to sound it, and his sword ready in his right, its point up and out.
The round shield is slung on his back, black with a silver rim and boss, by a broad baldric of pale
leather with a silver mount, which crosses his breast from his left hip and goes over his right
shoulder. The team colour is his cloak: a mantle over his shoulders, and a cloak down his back to his
calves, under the shield.

Beside the other Men of Gondor he is the horn, the pale baldric and the round shield: Aragorn holds
his sword high and a banner, Faramir is a hooded ranger with a bow, and Beregond has a winged helm and
a tall shield. From behind, as the near side sees him, the black shield on the cloak and the horn
held up beside his head tell him; from the front, the horn and the baldric across the mantle.

    blender --background --factory-startup --python-exit-code 1 --python boromir.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOTS,
    CLOTH,
    EYES,
    LEATHER,
    MAIL,
    STEEL,
    V,
    bent_tube,
    box,
    cone,
    ellipse,
    finish,
    loft,
    material,
    newell,
    on_surface,
    part,
    path_rings,
    reset,
    team_material,
    tube,
    wind,
)

# Boromir's own colours (sRGB); the rest come from the kit.
SKIN = 0xD9A280  # fair
HAIR = 0x3A2B22  # dark brown
SABLE = 0x2B2B30  # the black of Gondor, as Aragorn's: his surcoat and the face of his shield
SILVER = 0xE3E5E7  # the horn's tip and bands, the shield's rim and boss, the buckle and the mount
IVORY = 0xD8C9A3  # the horn of a wild ox of Araw
HOLLOW = 0x3B2E24  # the shadowed inside of its bell
BUFF = 0xC4B59A  # the pale leather of the baldric

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        sable=material('sable', SABLE, roughness=0.9),
        silver=material('silver', SILVER, roughness=0.45, metallic=0.1),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        mail=material('mail', MAIL, roughness=0.8, metallic=0.05),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        baldric=material('baldric', BUFF, roughness=0.8),
        boots=material('boots', BOOTS, roughness=0.9),
        cloth=material('cloth', CLOTH, roughness=0.9),
        horn=material('horn', IVORY, roughness=0.6),
        hollow=material('hollow', HOLLOW, roughness=0.9),
        eyes=material('eyes', EYES, roughness=0.6),
    )


# Legs --------------------------------------------------------------------------------------------

# Feet apart and planted, the sword-side (right) foot forward, toes turned out a little.
R_HIP, R_ANKLE, R_YAW = V(-0.095, -0.01, 0.66), V(-0.165, -0.1, 0.11), -10
L_HIP, L_ANKLE, L_YAW = V(0.095, 0.02, 0.66), V(0.165, 0.095, 0.11), 16

# A tall boot. The foot from the sole up, in its own frame (toes towards -y): the height of each ring
# and the right half of it, side, heel and toe, mirrored counter-clockwise by leg().
FOOT = [
    (0.0, [(0.074, -0.016), (0.062, 0.082), (0.056, -0.172)]),  # the sole
    (0.07, [(0.074, -0.008), (0.064, 0.084), (0.056, -0.132)]),  # the instep slopes back from the toe
    (0.17, [(0.068, 0.004), (0.06, 0.068), (0.054, -0.054)]),  # round the ankle
]
# Then up the shin to below the knee, round the leg: the height and the radius of each ring.
SHAFT = [(0.40, 0.08)]


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
    # The thigh, in dark breeches, from the hip into the boot.
    tube(f'thigh-{side}', hip, axis(0.38), [(0, 0.095), (1, 0.074)], M['cloth'])


def legs():
    leg('right', R_HIP, R_ANKLE, R_YAW)
    leg('left', L_HIP, L_ANKLE, L_YAW)


# Body --------------------------------------------------------------------------------------------

# The surcoat over the mail as a barrel of octagons: z, half-width, half-depth and centre y. His mail
# coat is long, showing below the surcoat's hem to his knees, and the belt is the band between the
# fourth and fifth rings. A broad chest: he is the strongest of the Men of the Fellowship.
TORSO = [
    (0.44, 0.226, 0.192, 0.0),  # the mail's hem
    (0.505, 0.24, 0.205, 0.0),  # the surcoat's hem, flared over the thighs
    (0.645, 0.196, 0.15, 0.0),  # hips
    (0.70, 0.184, 0.138, -0.004),  # belt, lower edge
    (0.76, 0.19, 0.14, -0.004),  # belt, upper edge
    (0.89, 0.24, 0.165, -0.01),  # chest
    (0.985, 0.232, 0.142, 0.0),  # shoulders
    (1.0, 0.07, 0.066, 0.01),  # neck, under the collar
]
TORSO_BANDS = [2, 0, 0, 1, 0, 0, 0]  # the mail, then the surcoat, except the belt


def torso():
    """Builds the body and returns it, to lay the baldric on."""
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    body = part('torso', verts, faces, [M['sable'], M['leather'], M['mail']], face_mats,
                inside=lambda c: V(0, 0, c.z))

    # The belt buckle, its face smaller than its back so the edges read as a bevel.
    axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
    box('buckle', V(0, -0.142, 0.73), axes, (0.014, 0.032, 0.03), M['silver'], 0.75)
    return body


def strap(name, centres, half, mat, bodies, lift=0.008):
    """A flat strap along the line through `centres`, laid on the surfaces of `bodies`: each point is
    moved to `lift` off the nearest surface, with the strap's width square to the line and to the
    surface there, and then each quad is pulled out wherever it would sink into a ridge between its
    corners. Returns the strap's vertices, two to a point, the first of each on the same side."""
    points, polygons = [], []
    for body in bodies:
        base = len(points)
        points += [v.co.copy() for v in body.data.vertices]
        polygons += [[base + i for i in p.vertices] for p in body.data.polygons]
    tree = BVHTree.FromPolygons(points, polygons)

    def off(p):
        """How far p is in front of the nearest surface, and that surface's normal."""
        near, normal, _, _ = tree.find_nearest(p)
        return (p - near).dot(normal), normal

    centres = [Vector(c) for c in centres]
    verts = []
    for k, c in enumerate(centres):
        near, normal, _, _ = tree.find_nearest(c)
        ahead = (centres[min(k + 1, len(centres) - 1)] - centres[max(k - 1, 0)]).normalized()
        across = ahead.cross(normal).normalized()
        middle = near + lift * normal
        verts += [middle + half * across, middle - half * across]
    faces = [(2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2) for k in range(len(centres) - 1)]
    for _ in range(4):
        for face in faces:
            corners = [verts[i] for i in face]
            samples = corners + [(corners[i] + corners[(i + 1) % 4]) / 2 for i in range(4)]
            samples.append(sum(corners, Vector()) / 4)
            for p in samples:
                gap, normal = off(p)
                if gap < lift * 0.75:
                    for i in face:
                        verts[i] += (lift - gap) * normal
                    break
    outward = [off(sum((verts[i] for i in f), Vector()) / 4)[1] for f in faces]
    wound = [f if newell([verts[i] for i in f]).dot(n) > 0 else tuple(reversed(f)) for f, n in zip(faces, outward)]
    part(name, verts, wound, mat)
    return verts


# The baldric's line, from under the cloak at his left hip up across his breast, over the mantle and
# his right shoulder, and down his back to the shield it slings, under its rim. Each point is laid on
# the body or the mantle by strap().
BALDRIC = [
    V(0.215, 0.05, 0.625),  # round his left hip, under the edge of the cloak
    V(0.2, -0.06, 0.64),
    V(0.15, -0.13, 0.665),  # the left hip
    V(0.085, -0.15, 0.735),
    V(0.02, -0.155, 0.81),  # the breast, under the mantle's hem
    V(-0.03, -0.2, 0.866),  # over the mantle's hem
    V(-0.09, -0.17, 0.93),
    V(-0.14, -0.1, 0.99),
    V(-0.165, 0.0, 1.04),  # over the shoulder, by his neck
    V(-0.16, 0.1, 1.02),
    V(-0.15, 0.17, 0.96),  # under the shield's rim
]


def baldric(bodies):
    verts = strap('baldric', BALDRIC, 0.028, M['baldric'], bodies)
    # A silver mount on it over his right breast, between its seventh and eighth points: a lozenge, a
    # little proud of it.
    a, b, c, d = verts[12:16]
    centre = (a + b + c + d) / 4
    along = ((c + d) - (a + b)).normalized()
    side = (a - b).normalized()
    out = along.cross(side)
    if out.y > 0:
        out = -out
    centre += 0.004 * out
    verts = [centre + 0.04 * along, centre + 0.033 * side, centre - 0.04 * along, centre - 0.033 * side,
             centre + 0.008 * out]
    part('mount', verts, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], M['silver'], outward=out)


# Head --------------------------------------------------------------------------------------------

# The head as rings of eight from the neck up. Each ring is z, then the left half, mirrored to the
# right: the side, the back corner, the back's y, the front corner and the front's y. A strong jaw.
HEAD = [
    (1.03, (0.08, 0.012), (0.058, 0.064), 0.078, (0.056, -0.05), -0.062),  # the neck, in the collar
    (1.085, (0.104, 0.004), (0.074, 0.076), 0.092, (0.076, -0.09), -0.116),  # under the jaw; the chin
    (1.16, (0.12, -0.002), (0.093, 0.088), 0.106, (0.09, -0.1), -0.13),  # the mouth
    (1.245, (0.128, 0.002), (0.102, 0.096), 0.118, (0.096, -0.104), -0.126),  # cheekbones and eyes
    (1.315, (0.13, 0.008), (0.104, 0.102), 0.124, (0.094, -0.108), -0.127),  # the brow
    (1.35, (0.128, 0.011), (0.102, 0.102), 0.124, (0.088, -0.102), -0.118),  # the hairline
    (1.39, (0.104, 0.016), (0.084, 0.09), 0.108, (0.072, -0.082), -0.092),  # the top of the head
]
CROWN = V(0, 0.018, 1.428)
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

    # Grey eyes under level brows, laid just proud of the face.
    for s in (-1, 1):
        corners = [(s * 0.024, 1.27), (s * 0.08, 1.274), (s * 0.052, 1.252)]
        verts = [V(x, on_surface(face, x, z) - 0.004, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A firm mouth, a short dark line.
    corners = [(-0.034, 1.152), (0, 1.156), (0.034, 1.152), (0.028, 1.145), (0, 1.148), (-0.028, 1.145)]
    verts = [V(x, on_surface(face, x, z) - 0.003, z) for x, z in corners]
    part('mouth', verts, [(0, 1, 4, 5), (1, 2, 3, 4)], M['eyes'], outward=V(0, -1, 0))

    # A straight, noble nose from under the brow to its tip.
    top, tip = V(0, -0.12, 1.292), V(0, -0.164, 1.198)
    left, right, under = V(-0.028, -0.114, 1.196), V(0.028, -0.114, 1.196), V(0, -0.124, 1.184)
    verts = [top, tip, left, right, under]
    part('nose', verts, [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)], M['skin'], inside=V(0, -0.08, 1.24))

    # Brows: a bar jutting over the eyes, level, proud rather than frowning.
    sections = [
        [V(x, y, 1.32 + dz), V(x, y - 0.024, 1.303 + dz), V(x, y + 0.004, 1.288 + dz)]
        for x, y, dz in ((-0.096, -0.09, 0.004), (0, -0.122, -0.004), (0.096, -0.09, 0.004))
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brows', verts, faces, M['hair'], inside=V(0, -0.07, 1.3))


def hair():
    # Dark hair to his collar, fuller than Aragorn's at the ends, down the back and sides of his head.
    # Each level runs round him from just in front of his left ear, past the back, to his right.
    angles = [math.radians(a) for a in (-15, 20, 55, 90, 125, 160, 195)]
    top = [(0.138, -0.034, 1.35), (0.137, 0.046, 1.362), (0.092, 0.116, 1.376), (0, 0.132, 1.385)]
    levels = [  # half-width, half-depth, centre y and the height of each point
        (0.15, 0.142, 0.006, [1.18, 1.17, 1.165, 1.16, 1.165, 1.17, 1.18]),
        (0.184, 0.176, 0.034, [1.1, 1.055, 1.07, 1.04, 1.07, 1.055, 1.1]),
    ]
    rings = [[V(*p) for p in top] + [V(-x, y, z) for x, y, z in reversed(top[:-1])]]
    rings += [[V(rx * math.cos(a), cy + ry * math.sin(a), z) for a, z in zip(angles, zs)] for rx, ry, cy, zs in levels]
    verts, faces, _ = loft(rings, closed=False)
    part('hair', verts, faces, M['hair'], inside=lambda c: V(0, 0.0, c.z))


# Team colour: the mantle and the cloak ------------------------------------------------------------


def mantle():
    # Eight points round the neck and the shoulders, starting at his left shoulder (+X); the front
    # dips at his throat and the back rises behind his neck.
    neck_z = [1.06, 1.075, 1.09, 1.075, 1.06, 1.035, 1.015, 1.035]
    neck = ellipse(0, 0.012, 0, 0.098, 0.094, 8, 0, neck_z)
    dome = ellipse(0, 0.01, 0, 0.235, 0.172, 8, 0, [z - 0.045 for z in neck_z])
    shoulder_z = [0.955, 0.965, 0.975, 0.965, 0.955, 0.94, 0.925, 0.94]
    shoulder = ellipse(0, 0.008, 0, 0.31, 0.21, 8, 0, shoulder_z)
    hem = ellipse(0, 0.008, 0, 0.3, 0.205, 8, 0, [z - 0.07 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    return part('mantle', verts, faces, M['team'], inside=V(0, 0.01, 0.9))


def cloak():
    # Down his back to his calves, under the shield, in four folds, the hem lowest in the middle.
    # Each level: z at the middle and at the edges, half-width, half-depth, centre y, how far short of
    # the sides it stops (degrees) and how deep the folds are.
    levels = [
        (0.94, 0.94, 0.275, 0.18, 0.02, 24, 0.0),
        (0.64, 0.66, 0.305, 0.232, 0.015, 14, 0.03),
        (0.29, 0.35, 0.345, 0.285, 0.025, 6, 0.05),
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


# The round shield, slung on his back over the cloak ----------------------------------------------

SHIELD_CENTRE = V(0.0, 0.262, 0.86)
SHIELD_TILT = 8  # degrees its face turns up from facing straight back: its foot hangs out over the cloak
SHIELD_TURN = Matrix.Rotation(math.radians(SHIELD_TILT), 3, 'X') @ Matrix.Rotation(math.radians(180), 3, 'Z')


def shield():
    # Built facing -Y round the origin, as one profile turned round the axis: from the edge, over the
    # raised silver rim, down the black face to the silver boss, then turned to face behind him. The
    # rim is a ridge, so no one point is inside every face: the profile is wound as a whole instead.
    n = 10
    profile = [  # radius, y
        (0.25, 0.0),  # outer edge
        (0.243, -0.032),  # crest of the rim
        (0.214, -0.022),  # inner edge of the rim, where the face starts
        (0.076, -0.04),  # foot of the boss
        (0.056, -0.086),  # shoulder of the boss
    ]
    band_mats = [1, 1, 0, 1]  # sable, silver

    def ring(r, y):
        angles = (math.tau * (i + 0.5) / n for i in range(n))
        return [V(r * math.cos(a), y, r * math.sin(a)) for a in angles]

    verts, faces, bands = loft([ring(r, y) for r, y in profile])
    face_mats = [band_mats[b] for b in bands]
    apex, last = len(verts), (len(profile) - 1) * n
    verts.append(V(0, -0.102, 0))
    faces += [(last + i, last + (i + 1) % n, apex) for i in range(n)]
    face_mats += [1] * n
    faces.append(tuple(reversed(range(n))))  # the leather-covered boards, wound to match the rim
    face_mats.append(2)
    if newell([verts[i] for i in faces[-2]]).y > 0:  # the boss's tip must face outwards
        faces = [tuple(reversed(f)) for f in faces]
    verts = [SHIELD_CENTRE + SHIELD_TURN @ v for v in verts]
    part('shield', verts, faces, [M['sable'], M['silver'], M['leather']], face_mats)


# Arms --------------------------------------------------------------------------------------------

R_SHOULDER, L_SHOULDER = V(-0.225, 0.015, 0.955), V(0.225, 0.015, 0.96)
UPPER_ARM, FOREARM = 0.21, 0.23  # shoulder to elbow, and elbow to the middle of the fist


def elbow(shoulder, fist, pole):
    """Where the elbow goes for an arm from `shoulder` to `fist`, bent towards `pole`."""
    d = fist - shoulder
    reach = min(d.length, UPPER_ARM + FOREARM - 1e-3)
    along = (UPPER_ARM**2 - FOREARM**2 + reach**2) / (2 * reach)
    out = math.sqrt(max(UPPER_ARM**2 - along**2, 0.0))
    d.normalize()
    bend = (pole - pole.dot(d) * d).normalized()
    return shoulder + along * d + out * bend


def arm(side, shoulder, fist, pole, grip):
    """A mail sleeve, a steel vambrace and a fist closed round a grip running along `grip`."""
    bend = elbow(shoulder, fist, pole)
    wrist = fist + (bend - fist).normalized() * 0.045
    tube(f'sleeve-{side}', shoulder, bend, [(0, 0.08), (1.1, 0.066)], M['mail'])
    forearm = [(-0.15, 0.06), (0.4, 0.072), (1.0, 0.062)]
    tube(f'forearm-{side}', bend, wrist, forearm, [M['mail'], M['steel']], [0, 1])
    along = Vector(grip).normalized()
    ahead = wrist - bend
    ahead = (ahead - ahead.dot(along) * along).normalized()
    box(f'fist-{side}', fist, [ahead, along, ahead.cross(along)], (0.05, 0.057, 0.055), M['skin'], 0.88)


# The sword, ready in his right hand: low at his hip, its point up and out -------------------------

R_FIST = V(-0.355, -0.175, 0.76)
R_POLE = V(-0.3, 1, -0.2)  # the way his right elbow points: back, and out a little
SWORD = V(-0.5, -0.18, 0.85).normalized()


def sword():
    along = SWORD
    across = along.cross(V(0, 1, 0)).normalized()  # the edges; the flats face forward and back
    thick = across.cross(along)
    guard = R_FIST + 0.075 * along

    # The blade: a flattened diamond in section, narrowing a little to a long point.
    def section(c, w, t):
        return [c + w * across, c + t * thick, c - w * across, c - t * thick]

    rings = [section(guard, 0.041, 0.012), section(guard + 0.5 * along, 0.034, 0.01)]
    verts, faces, _ = loft(rings)
    verts.append(guard + 0.62 * along)
    faces += [(4 + i, 4 + (i + 1) % 4, 8) for i in range(4)]
    part('blade', verts, faces, M['steel'], inside=guard + 0.3 * along)

    # The cross-guard on top of his fist, and the pommel below it.
    box('guard', guard, [along, across, thick], (0.017, 0.1, 0.022), M['steel'], 0.8)
    cone('pommel', R_FIST - 0.085 * along, R_FIST - 0.125 * along, 0.03, M['steel'], n=4,
         back=R_FIST - 0.05 * along)

    arm('right', R_SHOULDER, R_FIST, R_POLE, along)


# The Horn of Gondor, raised in his left hand ------------------------------------------------------

# Its centre line, a crescent from the silver-tipped mouthpiece, pointing in at his head, out through
# his fist and up to the bell above his head, which opens upwards, inwards and forwards, towards the
# fight: the control points of a cubic.
HORN_CURVE = [V(0.3, -0.05, 1.18), V(0.56, -0.08, 1.12), V(0.72, -0.12, 1.4), V(0.58, -0.18, 1.64)]
HORN = [  # how far along the curve, the radius, and the material of the band from there
    (0.0, 0.022, 'silver'),  # the tip
    (0.08, 0.025, 'horn'),
    (0.3, 0.038, 'horn'),
    (0.55, 0.054, 'silver'),  # a band
    (0.62, 0.058, 'horn'),
    (0.86, 0.08, 'silver'),  # the rim of the bell
    (1.0, 0.1, None),
]
HORN_GRIP = 0.25  # where his fist holds it
L_POLE = V(1, 0.25, -0.6)  # the way his left elbow points: out, back and down


def horn_at(t):
    """The point of the horn's centre line at t, and the way it runs there."""
    a, b, c, d = HORN_CURVE
    p = (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t**3 * d
    ahead = 3 * (1 - t) ** 2 * (b - a) + 6 * (1 - t) * t * (c - b) + 3 * t * t * (d - c)
    return p, ahead.normalized()


def great_horn():
    points = [horn_at(t)[0] for t, _, _ in HORN]
    radii = [r for _, r, _ in HORN]
    mats = ['silver', 'horn']
    band_mats = [mats.index(m) for _, _, m in HORN[:-1]]
    bent_tube('horn', points, radii, [M['silver'], M['horn']], band_mats, n=6, start='cap')

    # The dark hollow of the bell: a shallow funnel inside the rim.
    bell, ahead = horn_at(1.0)
    verts = path_rings(points, radii, 6)[-1] + [bell - 0.08 * ahead]
    faces = wind(verts, [(i, (i + 1) % 6, 6) for i in range(6)], outward=ahead)
    part('horn-hollow', verts, faces, M['hollow'])

    fist, along = horn_at(HORN_GRIP)
    arm('left', L_SHOULDER, fist, L_POLE, along)


def main():
    reset()
    make_materials()
    legs()
    body = torso()
    head()
    hair()
    cape = mantle()
    baldric([body, cape])
    cloak()
    shield()
    sword()
    great_horn()
    finish('boromir')


main()
