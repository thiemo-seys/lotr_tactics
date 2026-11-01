"""Gimli at Helm's Deep: his 3★ model, the book moment (docs/viewer-spec.md section 4, "Star levels").

The same Dwarf as gimli.py, in the war-cap from Edoras of his 2★ model (gimli-2.py), on the night of
Helm's Deep (The Two Towers, III 7), when he fought on the wall of the Hornburg and out of the
postern gate, and slew forty-two Orcs to Legolas's forty-one. He stands as at 1★ with his shield on
his left arm, but his right arm is up and his axe raised high to strike, gripped low on the haft
for a full swing, and its edge is notched: "Alas! My axe is notched: the forty-second had an iron
collar on his neck" (III 8). The raised axe puts a new shape above his head, seen from behind as
well as from the front, the biggest change that reads at the game's size; no crown and no long
mithril coat, which are Balin's as lord of Moria.

The team colour is, as at 1★, his hood thrown back as a mantle, his cape and his shield's face.
Fittings use `trim`: the war-cap's band, rivets and spike, the belt buckle, the shield's rim and
boss, and the axe's finial, socket and pommel.

    blender --background --factory-startup --python-exit-code 1 --python gimli-3.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOK_BUDGET,
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
    newell,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    trim_material,
    tube,
    wind,
)

# Gimli's own colours (sRGB); the rest come from the kit.
BEARD = 0x7E4527
SKIN = 0xD9A07E
TUNIC = 0x5E6A48

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        mail=material('mail', MAIL, roughness=0.8, metallic=0.05),
        beard=material('beard', BEARD, roughness=0.9),
        skin=material('skin', SKIN, roughness=0.85),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        cloth=material('cloth', CLOTH, roughness=0.9),
        tunic=material('tunic', TUNIC, roughness=0.9),
        trim=trim_material(),
        wood=material('wood', WOOD, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
    )


# Body --------------------------------------------------------------------------------------------

LEAN = 5  # degrees the body above the hips leans forward, into the fight

# Feet apart, the shield-side (left) foot forward, toes turned out a little.
RIGHT_ANKLE, RIGHT_YAW = V(-0.165, 0.065, 0.10), -16
LEFT_ANKLE, LEFT_YAW = V(0.17, -0.07, 0.10), 14

# The boot from the sole up, in the foot's own frame (toes towards -y): the height of each ring and
# the right half of it, side, heel and toe, mirrored counter-clockwise by boot().
BOOT_RINGS = [
    (0.0, [(0.086, -0.02), (0.072, 0.08), (0.064, -0.138)]),  # the sole
    (0.062, [(0.086, -0.01), (0.074, 0.08), (0.062, -0.104)]),  # the instep slopes back from the toe
    (0.15, [(0.078, 0.0), (0.07, 0.074), (0.062, -0.05)]),  # round the ankle
]


def boot(name, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + turn @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['boots'], inside=at + V(0, 0, 0.07))
    # A turned-down cuff, which makes the boot read as heavy.
    top = outlines[-1][1]
    cuff = [[at + turn @ V(1.24 * x, 1.24 * y + 0.006, z) for x, y in top] for z in (0.105, 0.178)]
    verts, faces, _ = loft(cuff)
    part(name + '-cuff', verts, faces, M['leather'], inside=at + V(0, 0, 0.14))


def legs():
    tube('leg-right', V(-0.11, 0.02, 0.36), RIGHT_ANKLE, [(0, 0.09), (1, 0.066)], M['cloth'])
    tube('leg-left', V(0.11, 0.0, 0.36), LEFT_ANKLE, [(0, 0.09), (1, 0.066)], M['cloth'])
    boot('boot-right', RIGHT_ANKLE, RIGHT_YAW)
    boot('boot-left', LEFT_ANKLE, LEFT_YAW)


# The mail shirt as a barrel of octagons: z, half-width, half-depth and centre y. The belt is the
# band between the third and fourth rings.
TORSO = [
    (0.265, 0.274, 0.234, 0.0),  # hem, flared over the thighs
    (0.360, 0.256, 0.216, 0.0),  # hips
    (0.430, 0.274, 0.240, -0.005),  # belt, lower edge
    (0.505, 0.284, 0.246, -0.005),  # belt, upper edge
    (0.615, 0.314, 0.242, 0.0),  # barrel chest
    (0.715, 0.300, 0.202, 0.01),  # shoulders
    (0.790, 0.145, 0.125, 0.02),  # neck
]
TORSO_BANDS = [0, 0, 1, 0, 0, 0]  # mail, except the belt


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    # The tunic's dagged hem hangs below the mail in a point under each side, flared out.
    hem = rings[0]
    for i in range(8):
        a, b = hem[i], hem[(i + 1) % 8]
        mid = (a + b) / 2
        out = V(mid.x, mid.y, 0).normalized()
        verts.append(V(mid.x, mid.y, 0) + 0.025 * out + V(0, 0, 0.215))
        faces.append((i, (i + 1) % 8, len(verts) - 1))
        face_mats.append(2)
    mats = [M['mail'], M['leather'], M['tunic']]
    part('torso', verts, faces, mats, face_mats, inside=lambda c: V(0, 0, c.z))
    # The belt buckle, its face smaller than its back so the edges read as a bevel.
    axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
    box('buckle', V(0, -0.236, 0.467), axes, (0.02, 0.05, 0.042), M['trim'], 0.8)


# Arms: short sleeves of mail, the tunic at the elbow, leather bracers, big fists. The right arm is
# raised, the elbow out at his side and the fist high with the axe above it, to bring it down; the
# left comes from behind to the shield's grip.
R_SHOULDER, R_ELBOW = V(-0.30, 0.02, 0.64), V(-0.445, 0.045, 0.765)
R_WRIST, R_FIST = V(-0.425, -0.065, 0.825), V(-0.42, -0.115, 0.845)
L_SHOULDER, L_ELBOW = V(0.30, 0.02, 0.64), V(0.39, 0.0, 0.475)


def arm(side, shoulder, elbow, wrist, fist, fist_up, thumb=False):
    tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.104), (1.12, 0.084)], M['mail'])
    forearm = [(-0.2, 0.072), (0.3, 0.09), (1.0, 0.082)]
    tube(f'forearm-{side}', elbow, wrist, forearm, [M['tunic'], M['leather']], [0, 1])
    ahead = (wrist - elbow).normalized()
    up = (Vector(fist_up) - Vector(fist_up).dot(ahead) * ahead).normalized()
    across = ahead.cross(up)  # away from the body for the right hand
    box(f'fist-{side}', fist, [ahead, up, across], (0.056, 0.06, 0.062), M['skin'], 0.88)
    if thumb:
        # Pressed along the inside of the fist and over the haft, so it reads as a grip.
        centre = fist + 0.012 * ahead + 0.03 * up - 0.06 * across
        box(f'thumb-{side}', centre, [ahead, up, across], (0.047, 0.024, 0.02), M['skin'], 0.7)


# Head --------------------------------------------------------------------------------------------


def head():
    # Hair at the back and sides, under the helmet; the face is a plate in front of it.
    rings = [ellipse(0, 0.02, z, 0.142, 0.14, 8, 22.5) for z in (0.76, 0.955)]
    verts, faces, _ = loft(rings)
    part('hair', verts, faces, M['beard'], inside=lambda c: V(0, 0.02, c.z))

    # The face: a shallow pyramid of planes round the root of the nose, from under the brow round
    # the cheekbones to behind the moustache.
    rim = [
        V(-0.112, -0.128, 0.945), V(0.112, -0.128, 0.945), V(0.138, -0.102, 0.884),
        V(0.076, -0.153, 0.849), V(0, -0.163, 0.843), V(-0.076, -0.153, 0.849),
        V(-0.138, -0.102, 0.884),
    ]
    root = V(0, -0.174, 0.904)
    plate = [(rim[i], rim[(i + 1) % 7], root) for i in range(7)]
    part('face', rim + [root], [(i, (i + 1) % 7, 7) for i in range(7)], M['skin'], outward=V(0, -1, 0))

    # Deep-set eyes in the shade of the brows, laid just proud of the plate.
    for s in (-1, 1):
        corners = [(s * 0.03, 0.909), (s * 0.092, 0.913), (s * 0.063, 0.892)]
        verts = [V(x, on_surface(plate, x, z) - 0.006, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A big nose: a humped bridge from under the brow to a heavy, low tip.
    top, hump, tip = V(0, -0.15, 0.938), V(0, -0.205, 0.912), V(0, -0.262, 0.87)
    left, right, under = V(-0.052, -0.155, 0.872), V(0.052, -0.155, 0.872), V(0, -0.17, 0.853)
    verts = [top, hump, tip, left, right, under]
    faces = [(0, 3, 1), (0, 1, 4), (1, 3, 2), (1, 2, 4), (3, 5, 2), (5, 4, 2)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.12, 0.89))

    # Heavy brows: one chevron jutting over the eyes, lower in the middle for a frown.
    sections = [
        [V(-0.132, -0.112, 0.97), V(-0.132, -0.172, 0.95), V(-0.132, -0.118, 0.924)],
        [V(0, -0.14, 0.955), V(0, -0.21, 0.93), V(0, -0.15, 0.902)],
        [V(0.132, -0.112, 0.97), V(0.132, -0.172, 0.95), V(0.132, -0.118, 0.924)],
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brows', verts, faces, M['beard'], inside=V(0, -0.09, 0.94))


def beard():
    # Three big locks (a W in section) from the cheeks down the chest, tucked into the belt.
    # Each level runs from his right side across the front to his left; the sides start high, as
    # sideburns under the helmet.
    half = [  # (x, y, z) of the right-side back, the lock's ridge, the valley; then the centre ridge
        [(-0.152, -0.04, 0.955), (-0.142, -0.114, 0.886), (-0.076, -0.157, 0.853), (0.0, -0.17, 0.845)],
        [(-0.172, -0.07, 0.800), (-0.164, -0.212, 0.770), (-0.078, -0.236, 0.765), (0.0, -0.268, 0.760)],
        [(-0.140, -0.17, 0.670), (-0.130, -0.272, 0.660), (-0.062, -0.286, 0.655), (0.0, -0.314, 0.650)],
        [(-0.088, -0.20, 0.570), (-0.082, -0.282, 0.565), (-0.040, -0.288, 0.560), (0.0, -0.304, 0.555)],
        [(-0.050, -0.19, 0.480), (-0.046, -0.212, 0.478), (-0.024, -0.21, 0.476), (0.0, -0.218, 0.475)],
    ]
    rings = []
    for level in half:
        right = [V(*p) for p in level]
        left = [V(-p.x, p.y, p.z) for p in reversed(right[:-1])]
        rings.append(right + left)
    verts, faces, _ = loft(rings, closed=False)
    part('beard', verts, faces, M['beard'], inside=lambda c: V(0, -0.05, c.z))

    # A moustache in two sweeps from under the nose out over the beard.
    for s in (-1, 1):
        root = [V(s * 0.01, -0.178, 0.878), V(s * 0.01, -0.21, 0.86), V(s * 0.01, -0.175, 0.846)]
        mid = [V(s * 0.068, -0.195, 0.858), V(s * 0.068, -0.235, 0.838), V(s * 0.068, -0.195, 0.822)]
        tip = V(s * 0.13, -0.225, 0.775)
        verts, faces, _ = loft([root, mid])
        verts.append(tip)
        faces += [(3, 4, 6), (4, 5, 6), (5, 3, 6)]
        part(f'moustache-{s}', verts, faces, M['beard'], inside=V(s * 0.06, -0.17, 0.84))


# Team colour: the hood thrown back as a mantle, the cape and the shield's face ----------------------


def mantle():
    # Eight points round the neck and the shoulders, starting at his left shoulder (+X); the front
    # dips under the beard and the back rises where the hood gathers.
    neck_z = [0.82, 0.835, 0.85, 0.835, 0.82, 0.805, 0.795, 0.805]
    neck = ellipse(0, 0.035, 0, 0.16, 0.155, 8, 0, neck_z)
    dome = ellipse(0, 0.032, 0, 0.315, 0.238, 8, 0, [z - 0.042 for z in neck_z])
    shoulder_z = [0.69, 0.705, 0.72, 0.705, 0.69, 0.695, 0.695, 0.695]
    shoulder = ellipse(0, 0.03, 0, 0.405, 0.288, 8, 0, shoulder_z)
    hem = ellipse(0, 0.03, 0, 0.39, 0.275, 8, 0, [z - 0.045 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('mantle', verts, faces, M['team'], inside=V(0, 0.03, 0.6))

    # The hood itself, bunched on his upper back and ending in a point.
    a, g, b = V(-0.165, 0.15, 0.845), V(0, 0.205, 0.88), V(0.165, 0.15, 0.845)
    c, e, d = V(-0.22, 0.30, 0.70), V(0, 0.36, 0.745), V(0.22, 0.30, 0.70)
    f = V(0, 0.34, 0.52)
    verts = [a, g, b, c, e, d, f]
    faces = [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 6), (4, 5, 6)]
    part('hood', verts, faces, M['team'], inside=V(0, 0.15, 0.7))


def cape():
    # Down his back to the knees, in four folds, the hem hanging lowest in the middle. Each level:
    # z at the middle and at the edges, half-width, half-depth, centre y, how far short of the sides
    # it stops (degrees) and how deep the folds are.
    levels = [
        (0.70, 0.70, 0.34, 0.24, 0.03, 30, 0.0),
        (0.44, 0.46, 0.345, 0.305, 0.02, 20, 0.035),
        (0.165, 0.235, 0.385, 0.345, 0.03, 12, 0.06),
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


# Shield, on his left arm -------------------------------------------------------------------------

SHIELD_CENTRE = V(0.43, -0.235, 0.50)
SHIELD_TURN = Matrix.Rotation(math.radians(25), 3, 'Z') @ Matrix.Rotation(math.radians(-8), 3, 'X')


def shield():
    # Built facing -Y round the origin, as one profile turned round the axis: from the rim on the
    # back, over the raised rim, down the team-coloured face to the boss, the rim and boss in trim.
    # The rim is a ridge, so no one point is inside every face: the profile is wound as a whole
    # instead.
    n = 10
    profile = [  # radius, y
        (0.232, 0.012),  # back of the rim, round the wooden boards
        (0.262, 0.0),  # outer edge
        (0.254, -0.036),  # crest of the rim
        (0.226, -0.024),  # inner edge of the rim, where the face starts
        (0.088, -0.046),  # foot of the boss
        (0.064, -0.094),  # shoulder of the boss
    ]
    band_mats = [1, 1, 1, 0, 1]  # team, trim

    def ring(r, y):
        angles = (math.tau * (i + 0.5) / n for i in range(n))
        return [V(r * math.cos(a), y, r * math.sin(a)) for a in angles]

    verts, faces, bands = loft([ring(r, y) for r, y in profile])
    face_mats = [band_mats[b] for b in bands]
    apex, last = len(verts), (len(profile) - 1) * n
    verts.append(V(0, -0.11, 0))
    faces += [(last + i, last + (i + 1) % n, apex) for i in range(n)]
    face_mats += [1] * n
    faces.append(tuple(reversed(range(n))))  # the boards, wound to match the rim
    face_mats.append(2)
    if newell([verts[i] for i in faces[-2]]).y > 0:  # the boss's tip must face forward
        faces = [tuple(reversed(f)) for f in faces]
    verts = [SHIELD_CENTRE + SHIELD_TURN @ v for v in verts]
    part('shield', verts, faces, [M['team'], M['trim'], M['wood']], face_mats)

    # The left arm comes from behind to the grip behind the boss.
    fist = SHIELD_CENTRE + SHIELD_TURN @ V(0, 0.052, 0)
    wrist = fist + (L_ELBOW - fist).normalized() * 0.045
    arm('left', L_SHOULDER, L_ELBOW, wrist, fist, V(0, 0, 1))


# Axe, in his right hand --------------------------------------------------------------------------

HAFT = V(0.05, 0.12, 1.0).normalized()  # raised high, leaning back a little, ready to strike
GRIP = 0.1  # how far up the haft from its end he grips it, low for a full swing (0.19 at 1 star)
BLADE_OUT = V(-math.cos(math.radians(12)), -math.sin(math.radians(12)), 0)  # outwards, a little forward

# The blade's outline from the top of the eye round the crescent edge to its bottom: (u, v) with u
# outwards from the haft and v along it, and its half-thickness (0 on the cutting edge).
BLADE = [
    ((0.032, 0.058), 0.020),
    ((0.115, 0.075), 0.016),
    ((0.215, 0.165), 0.0),
    ((0.252, 0.088), 0.0),
    ((0.266, 0.0), 0.0),
    ((0.252, -0.092), 0.0),
    ((0.205, -0.188), 0.0),
    ((0.110, -0.088), 0.016),
    ((0.032, -0.058), 0.020),
]
# The notch in the edge between its third and fourth points, where the forty-second Orc's iron
# collar met it: on the edge, the bottom of the notch, and on the edge again.
NOTCH = [(0.2565, 0.065), (0.218, 0.045), (0.2615, 0.025)]
BLADE_SCALE = 1.1
# Where the bevel to the cutting edge starts, from the top horn to the bottom one.
BEVEL = [(0.175, 0.125), (0.205, 0.07), (0.215, 0.0), (0.205, -0.072), (0.168, -0.14)]


def axe():
    grip = R_FIST
    along = HAFT
    out = (BLADE_OUT - BLADE_OUT.dot(along) * along).normalized()
    across = out.cross(along)

    length = 0.77  # the haft, as at 1 star
    tube('haft', grip - GRIP * along, grip + (length - GRIP) * along, [(0, 0.029), (1, 0.026)], M['wood'])
    # A finial on top and a pommel below, fittings in trim.
    top = grip + (length - GRIP) * along
    ring = segment(top, top + along, [(0, 0.026)], 6)[0]
    verts = ring + [top + 0.03 * along]
    part('finial', verts, [(i, (i + 1) % 6, 6) for i in range(6)], M['trim'], inside=top)
    end = grip - GRIP * along
    ring = segment(end, end + along, [(0, 0.036)], 4, 45)[0]
    verts = ring + [end - 0.04 * along, end + 0.03 * along]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('pommel', verts, faces, M['trim'], inside=end)

    # The socket the head is forged round, in trim.
    eye = grip + (length - GRIP - 0.115) * along
    rings = segment(eye - 0.07 * along, eye + 0.07 * along, [(0, 0.045), (1, 0.045)], 6, 30)
    verts, faces, _ = loft(rings)
    faces += [tuple(range(6)), tuple(range(6, 12))]
    part('socket', verts, faces, M['trim'], inside=eye)

    # The blade: thick by the eye, bevelled to a crescent edge.
    def at(u, v, w):
        return eye + BLADE_SCALE * (u * out + v * along) + w * across

    # Each outline point is a front and a back vertex, or one shared vertex on the edge.
    verts, index, bevel = [], {}, {}
    for k, ((u, v), t) in enumerate(BLADE):
        if t == 0:
            index[k] = (len(verts), len(verts))
            verts.append(at(u, v, 0))
        else:
            index[k] = (len(verts), len(verts) + 1)
            verts += [at(u, v, t), at(u, v, -t)]
    for k, (u, v) in enumerate(BEVEL):
        bevel[k] = (len(verts), len(verts) + 1)
        verts += [at(u, v, 0.011), at(u, v, -0.011)]
    notch = list(range(len(verts), len(verts) + len(NOTCH)))  # on the edge, so shared by both sides
    verts += [at(u, v, 0) for u, v in NOTCH]
    n1, n2, n3 = notch
    sides = []
    for side in (0, 1):
        p = {k: index[k][side] for k in index}
        q = {k: bevel[k][side] for k in bevel}
        cheek = [(p[0], p[1], q[0], q[1], q[2], q[3], q[4], p[7], p[8])]  # the flat by the eye
        edge = [(p[1], p[2], q[0]), (q[4], p[6], p[7])]  # the bevel, from horn to horn
        edge += [(q[k], p[2 + k], p[3 + k], q[k + 1]) for k in (0, 2, 3)]
        # Between the third and fourth edge points the bevel runs into the notch.
        edge += [(q[1], p[3], n1), (q[1], n1, n2), (q[1], n2, q[2]), (q[2], n2, n3), (q[2], n3, p[4])]
        sides.append(cheek + edge)
    f0, b0 = index[0]
    f1, b1 = index[1]
    f7, b7 = index[7]
    f8, b8 = index[8]
    walls = [(f0, f1, b1, b0), (f1, index[2][0], b1), (f7, f8, b8, b7), (index[6][0], f7, b7)]
    faces = wind(verts, sides[0], outward=across) + wind(verts, sides[1], outward=-across)
    faces += wind(verts, walls, inside=eye + 0.12 * out)
    part('blade', verts, faces, M['steel'])

    arm('right', R_SHOULDER, R_ELBOW, R_WRIST, R_FIST, along, thumb=True)


# The war-cap from Edoras, as at 2 stars (gimli-2.py), in place of the round cap ------------------

# The cap of eight facets, each ring a height and a radius: a band of trim, deeper than the round
# cap's, and a fuller, taller dome above it that rises to a spike.
CAP = [
    (0.925, 0.2),
    (0.992, 0.2),
    (0.998, 0.183),  # the dome steps in above the band
    (1.092, 0.172),
    (1.168, 0.118),
]
CAP_TOP = 1.212
SPIKE = 0.055  # how far the spike of trim stands above the point
RIVETS = [215, 245, 295, 325, 150, 30]  # degrees round the band from +X; the front is 270
# The skirt's lower edge, from his right cheek round the back to his left: the angle from +X, the
# radius and the height. It comes forward over his cheeks beside the beard, and clears the bunched
# hood behind.
SKIRT = [
    (226, 0.245, 0.835),
    (200, 0.24, 0.83),
    (165, 0.238, 0.84),
    (128, 0.242, 0.858),
    (90, 0.246, 0.876),
    (52, 0.242, 0.858),
    (15, 0.238, 0.84),
    (-20, 0.24, 0.83),
    (-46, 0.245, 0.835),
]
# The nasal down the front, over the frown and the bridge of his nose: the y and z of its middle and
# its half-width, from the band down.
NASAL = [(-0.185, 0.975, 0.017), (-0.226, 0.93, 0.014), (-0.243, 0.886, 0.01)]


def war_cap():
    """The cap of iron he chose at Edoras, as a dwarf's war-cap: a tall dome on a band of trim set
    with rivets, a spike, a nasal, and a skirt of plates for his cheeks and neck, so from behind and
    above his head reads as a bigger helm than the round cap at 1 star."""
    rings = [ellipse(0, 0.015, z, r, r * 0.97, 8, 0) for z, r in CAP]
    verts, faces, bands = loft(rings)
    face_mats = [0 if b < 2 else 1 for b in bands]
    apex, last = len(verts), (len(CAP) - 1) * 8
    verts.append(V(0, 0.015, CAP_TOP))
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    face_mats += [1] * 8
    part('war-cap', verts, faces, [M['trim'], M['steel']], face_mats, inside=V(0, 0.015, 0.95))
    peak = V(0, 0.015, CAP_TOP)
    cone('spike', peak - V(0, 0, 0.03), peak + V(0, 0, SPIKE), 0.028, M['trim'], n=4, back=None)

    for a in RIVETS:
        r = math.radians(a)
        out = V(math.cos(r), math.sin(r), 0)
        at = V(0.2 * math.cos(r), 0.015 + 0.2 * 0.97 * math.sin(r), 0.9585)
        cone(f'rivet-{a}', at - 0.004 * out, at + 0.011 * out, 0.016, M['trim'], n=4, phase=45, back=None)

    # The skirt, tucked under the band at the top and flared out over his hair and the mantle.
    def point(a, r, z):  # at `a` degrees round the cap from +X, `r` out from its middle
        return V(r * math.cos(math.radians(a)), 0.015 + r * 0.97 * math.sin(math.radians(a)), z)

    top = [point(a, 0.19, 0.94) for a, _, _ in SKIRT]
    hem = [point(a, r, z) for a, r, z in SKIRT]
    verts, faces, _ = loft([top, hem], closed=False)
    part('skirt', verts, faces, M['steel'], inside=lambda c: V(0, 0.015, c.z + 0.05))

    # The nasal: its front and sides, open behind where it lies on the brows.
    verts = []
    for y, z, w in NASAL:
        verts += [V(-w, y + 0.012, z), V(-w, y, z), V(w, y, z), V(w, y + 0.012, z)]
    faces = []
    for k in range(len(NASAL) - 1):
        a, b = 4 * k, 4 * (k + 1)
        faces += [(a, a + 1, b + 1, b), (a + 1, a + 2, b + 2, b + 1), (a + 2, a + 3, b + 3, b + 2)]
    faces.append((b, b + 1, b + 2, b + 3))  # its tip
    part('nasal', verts, faces, M['steel'], inside=lambda c: V(0, c.y + 0.03, c.z + 0.01))


def main():
    reset()
    make_materials()
    legs()
    lower = set(bpy.context.scene.objects)
    torso()
    head()
    war_cap()
    beard()
    mantle()
    cape()
    shield()
    axe()
    lean([o for o in bpy.context.scene.objects if o not in lower], V(0, 0, 0.33), LEAN)
    finish('gimli-3', budget=BOOK_BUDGET)


main()
