"""Balin son of Fundin, Dwarf, Captain: Lord of Moria, in the Faceted style of Gimli, the reference
model (gimli.py, docs/viewer-spec.md section 4).

From the books rather than the films: an old Dwarf of Thorin's company with a long white beard and a
hood, who led his people back into Moria and was its lord. Built like Gimli, every form a
low-segment shape or a hand-placed set of vertices, shaded flat, and of his build: about 1.15 to
the top of the hood, the head a third of that, shoulders about half his height wide. He wears a
lord's long coat in dull old gold over mail, a broad brass circlet over his hood, and his beard
falls in two forks past his belt; his bushy brows droop with age, kinder than Gimli's frown.

The team colour is the hood (the books' scarlet hood) and the short mantle it is cut with, hanging
in folds over his shoulders, seen from the front, from behind and from above, and his banner. He is
a Captain: in his left hand he holds the banner of Durin's folk on a pole planted beside him, a pale
anvil under a crown on the team colour, flying out to his left above his head, so it reads from in
front and from behind without the pole crossing it; in his right, a bearded axe at the ready. The
short mantle leaves his coat and mail sleeves to show from behind, round the team colour.

    blender --background --factory-startup --python-exit-code 1 --python balin.py [-- <out.glb>]

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
    lean,
    loft,
    material,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    tube,
    wind,
)

# Balin's own colours (sRGB); the rest come from the kit.
BEARD = 0xDEDAD1  # white with age
SKIN = 0xD9A07E
COAT = 0x8A7550  # a lord's coat, old gold dulled with wear
SILVER = 0xE4E3DC  # Durin's anvil and crown on the banner

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        beard=material('beard', BEARD, roughness=0.9),
        skin=material('skin', SKIN, roughness=0.85),
        coat=material('coat', COAT, roughness=0.9),
        mail=material('mail', MAIL, roughness=0.8, metallic=0.05),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        cloth=material('cloth', CLOTH, roughness=0.9),
        brass=material('brass', BRASS, roughness=0.55, metallic=0.1),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        wood=material('wood', WOOD, roughness=0.85),
        silver=material('silver', SILVER, roughness=0.6),
        eyes=material('eyes', EYES, roughness=0.6),
    )


# Pose --------------------------------------------------------------------------------------------

LEAN = 5  # degrees the body above the hips leans forward, into the fight
PIVOT = V(0, 0, 0.33)


def leaned(p):
    """Where the lean carries a point of the upper body built upright."""
    tip = Matrix.Rotation(math.radians(LEAN), 3, 'X')
    return PIVOT + tip @ (Vector(p) - PIVOT)


# Legs --------------------------------------------------------------------------------------------

# Feet apart, the banner-side (left) foot forward, toes turned out a little.
RIGHT_ANKLE, RIGHT_YAW = V(-0.16, 0.055, 0.10), -15
LEFT_ANKLE, LEFT_YAW = V(0.16, -0.06, 0.10), 12

# The boot from the sole up, in the foot's own frame (toes towards -y): the height of each ring and
# the right half of it, side, heel and toe, mirrored counter-clockwise by boot(). Gimli's.
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


# Coat --------------------------------------------------------------------------------------------

# The coat as a barrel of octagons, from the hem up: z, half-width, half-depth and centre y. The belt
# is the band between the third and fourth rings.
TORSO = [
    (0.235, 0.29, 0.252, 0.0),  # the hem, flared over the knees
    (0.37, 0.258, 0.218, 0.0),  # hips
    (0.43, 0.272, 0.238, -0.005),  # belt, lower edge
    (0.505, 0.282, 0.244, -0.005),  # belt, upper edge
    (0.615, 0.312, 0.242, 0.0),  # barrel chest
    (0.715, 0.298, 0.202, 0.01),  # shoulders
    (0.79, 0.145, 0.125, 0.02),  # neck
]
TORSO_BANDS = [0, 0, 1, 0, 0, 0]  # coat, except the belt


def coat():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    part('coat', verts, faces, [M['coat'], M['leather']], face_mats, inside=lambda c: V(0, 0, c.z))


# Head --------------------------------------------------------------------------------------------


def head():
    # The face: a shallow pyramid of planes round the root of the nose, from under the brow round
    # the cheekbones to behind the moustache. Gimli's.
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

    # Bushy white brows jutting over the eyes: an arch over each, dipping where they meet over the
    # nose and drooping at the ends with age, kindlier than Gimli's frown. Each section is the top,
    # the jutting front and the underside, from his right to his left.
    half = [
        [(-0.15, -0.108, 0.952), (-0.152, -0.176, 0.926), (-0.148, -0.116, 0.902)],
        [(-0.075, -0.124, 0.978), (-0.078, -0.206, 0.954), (-0.075, -0.134, 0.921)],
        [(0.0, -0.142, 0.962), (0.0, -0.204, 0.94), (0.0, -0.152, 0.914)],
    ]
    sections = [[V(*p) for p in s] for s in half] + [[V(-x, y, z) for x, y, z in s] for s in reversed(half[:-1])]
    verts, faces, _ = loft(sections)
    last = 3 * (len(sections) - 1)
    faces += [(0, 1, 2), (last, last + 1, last + 2)]
    part('brows', verts, faces, M['beard'], inside=V(0, -0.09, 0.94))


# Team colour: the hood and the short mantle it is cut with ---------------------------------------

# One garment, as rings of eight from the mantle's hem up to the crown of the hood. Each ring is
# given by its left half, mirrored to the right: the side, the back corner, the back (y, z), the
# front corner and the front (y, z). Round the jaw and the eyes the front is drawn back behind the
# face, so the hood frames it; at the brow it comes forward over it. The mantle is the rings below
# the neck, the hood those from the neck up.
HOOD = [
    ((0.396, 0.03, 0.60), (0.288, 0.252, 0.598), (0.305, 0.585), (0.287, -0.198, 0.628), (-0.248, 0.64)),
    ((0.41, 0.03, 0.70), (0.296, 0.244, 0.705), (0.30, 0.71), (0.29, -0.19, 0.718), (-0.24, 0.722)),
    ((0.29, 0.035, 0.775), (0.215, 0.205, 0.785), (0.245, 0.79), (0.205, -0.165, 0.795), (-0.20, 0.80)),
    ((0.204, 0.03, 0.85), (0.158, 0.18, 0.858), (0.226, 0.862), (0.152, -0.098, 0.85), (-0.03, 0.84)),
    ((0.198, 0.028, 0.925), (0.152, 0.175, 0.935), (0.212, 0.94), (0.155, -0.11, 0.915), (-0.03, 0.92)),
    ((0.186, 0.025, 0.995), (0.14, 0.163, 1.005), (0.197, 1.01), (0.13, -0.152, 0.985), (-0.178, 0.975)),
    ((0.158, 0.035, 1.064), (0.118, 0.155, 1.074), (0.182, 1.079), (0.104, -0.112, 1.057), (-0.136, 1.051)),
    ((0.098, 0.05, 1.12), (0.072, 0.14, 1.126), (0.152, 1.13), (0.062, -0.05, 1.113), (-0.062, 1.108)),
]
HOOD_PEAK = V(0, 0.105, 1.153)
NECK = 3  # the ring where the hood starts; the mantle tucks up under it
UNDER_BROW = 4  # the band from the eyes to the brow, whose front is the underside of the brow
# The mantle hangs in folds: every other point of its rings of sixteen stands out (and at the hem
# hangs lower), from the hem up to the shoulders.
MANTLE_FOLD = [(0.032, 0.022), (0.016, 0.0), (0.0, 0.0)]  # out and down, hem, shoulder, upper


def hood_ring(side, back_corner, back, front_corner, front):
    (sx, sy, sz), (bx, by, bz), (fx, fy, fz) = side, back_corner, front_corner
    return [V(sx, sy, sz), V(bx, by, bz), V(0, back[0], back[1]), V(-bx, by, bz), V(-sx, sy, sz),
            V(-fx, fy, fz), V(0, front[0], front[1]), V(fx, fy, fz)]


def inside_garment(c):
    return V(0, 0.03, c.z - 0.08)


def mantle(rings):
    folded = []
    for ring, (out, down) in zip(rings[:NECK], MANTLE_FOLD):
        points = []
        for a, b in zip(ring, ring[1:] + ring[:1]):
            mid = (a + b) / 2
            points += [a, mid + out * V(mid.x, mid.y - 0.03, 0).normalized() - V(0, 0, down)]
        folded.append(points)
    # Its neck runs up under the hood, out of sight, so the hood's edge lies over it.
    neck = [p for a, b in zip(rings[NECK], rings[NECK][1:] + rings[NECK][:1]) for p in (a, (a + b) / 2)]
    folded.append([V(0.78 * p.x, 0.03 + 0.78 * (p.y - 0.03), p.z + 0.025) for p in neck])
    verts, faces, _ = loft(folded)
    part('mantle', verts, faces, M['team'], inside=inside_garment)


def hood(rings):
    verts, faces, bands = loft(rings[NECK:])
    apex, last = len(verts), (len(rings) - NECK - 1) * 8
    verts.append(HOOD_PEAK)
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    bands = [NECK + b for b in bands] + [len(rings) - 1] * 8
    # Every face points away from the inside of the garment, except the two under the brow, which
    # face down into the face.
    wound = []
    for k, (face, band) in enumerate(zip(faces, bands)):
        if band == UNDER_BROW and k % 8 in (5, 6):
            wound += wind(verts, [face], V(0, 0.05, 1.06))
        else:
            wound += wind(verts, [face], inside_garment)
    part('hood', verts, wound, M['team'])


def circlet(rings):
    # A lord's circlet of brass, round the hood above the brow, lower in front than behind: a broad
    # band with a rounded face, standing proud of the cloth so it catches the light from above.
    lo, hi = rings[5], rings[6]
    band = []
    for t, proud in ((0.02, 0.012), (0.24, 0.024), (0.48, 0.012)):
        ring = []
        for a, b in zip(lo, hi):
            p = a.lerp(b, t)
            ring.append(p + proud * V(p.x, p.y - 0.03, 0).normalized())
        band.append(ring)
    verts, faces, _ = loft(band)
    part('circlet', verts, faces, M['brass'], inside=lambda c: V(0, 0.03, c.z))


# Beard ---------------------------------------------------------------------------------------------


def beard():
    # Long and white, from the cheeks over the belt to his knees, in three locks (a W in section) that
    # part into two forks at the end. Each level runs from his right side across the front to his
    # left: the side, tucked into the hood or the coat, the lock's ridge, the valley and the middle.
    half = [
        [(-0.146, -0.072, 0.935), (-0.142, -0.118, 0.882), (-0.076, -0.158, 0.853), (0.0, -0.172, 0.845)],
        [(-0.182, -0.085, 0.80), (-0.174, -0.218, 0.772), (-0.082, -0.248, 0.766), (0.0, -0.278, 0.760)],
        [(-0.168, -0.175, 0.655), (-0.162, -0.298, 0.645), (-0.076, -0.316, 0.64), (0.0, -0.342, 0.635)],
        [(-0.138, -0.205, 0.52), (-0.132, -0.312, 0.51), (-0.064, -0.326, 0.505), (0.0, -0.35, 0.50)],
        [(-0.108, -0.19, 0.40), (-0.104, -0.296, 0.39), (-0.05, -0.30, 0.385), (0.0, -0.318, 0.38)],
        [(-0.072, -0.205, 0.30), (-0.066, -0.27, 0.238), (-0.034, -0.274, 0.272), (0.0, -0.284, 0.342)],
    ]
    rings = []
    for level in half:
        right = [V(*p) for p in level]
        left = [V(-p.x, p.y, p.z) for p in reversed(right[:-1])]
        rings.append(right + left)
    verts, faces, _ = loft(rings, closed=False)
    part('beard', verts, faces, M['beard'], inside=lambda c: V(0, -0.05, c.z))

    # A long moustache in two sweeps from under the nose, out and down over the beard.
    for s in (-1, 1):
        root = [V(s * 0.01, -0.178, 0.878), V(s * 0.01, -0.212, 0.86), V(s * 0.01, -0.176, 0.846)]
        mid = [V(s * 0.07, -0.2, 0.856), V(s * 0.07, -0.242, 0.834), V(s * 0.07, -0.2, 0.818)]
        tip = V(s * 0.125, -0.282, 0.71)
        verts, faces, _ = loft([root, mid])
        verts.append(tip)
        faces += [(3, 4, 6), (4, 5, 6), (5, 3, 6)]
        part(f'moustache-{s}', verts, faces, M['beard'], inside=V(s * 0.06, -0.17, 0.84))


# Arms ----------------------------------------------------------------------------------------------


def arm(side, shoulder, elbow, wrist, fist, fist_up, thumb=False):
    """A mail sleeve, the coat's cuff at the elbow, a leather bracer and a big fist closed round a
    grip running along `fist_up`."""
    tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.104), (1.12, 0.084)], M['mail'])
    forearm = [(-0.2, 0.074), (0.3, 0.09), (1.0, 0.082)]
    tube(f'forearm-{side}', elbow, wrist, forearm, [M['coat'], M['leather']], [0, 1])
    ahead = (wrist - elbow).normalized()
    up = (Vector(fist_up) - Vector(fist_up).dot(ahead) * ahead).normalized()
    across = ahead.cross(up)  # away from the body for the right hand
    box(f'fist-{side}', fist, [ahead, up, across], (0.056, 0.06, 0.062), M['skin'], 0.88)
    if thumb:
        # Pressed along the inside of the fist and over the haft, so it reads as a grip.
        centre = fist + 0.012 * ahead + 0.03 * up - 0.06 * across
        box(f'thumb-{side}', centre, [ahead, up, across], (0.047, 0.024, 0.02), M['skin'], 0.7)


# Axe, in his right hand, at the ready ---------------------------------------------------------------

R_SHOULDER, R_ELBOW = V(-0.30, 0.02, 0.64), V(-0.385, 0.0, 0.47)
R_WRIST, R_FIST = V(-0.392, -0.11, 0.497), V(-0.392, -0.162, 0.505)
HAFT = V(-0.1, -0.2, 1.0).normalized()  # upright, leaning forward and out a little
BLADE_OUT = V(-math.cos(math.radians(15)), -math.sin(math.radians(15)), 0)

# A bearded axe: the blade's outline from the top of the eye out along its straight top edge, down the
# cutting edge to the hooked beard and back to the eye: (u, v) with u outwards from the haft and v
# along it, and its half-thickness (0 on the cutting edge).
AXE_BLADE = [
    ((0.035, 0.05), 0.02),
    ((0.14, 0.06), 0.013),
    ((0.235, 0.085), 0.0),
    ((0.255, -0.02), 0.0),
    ((0.225, -0.175), 0.0),
    ((0.14, -0.085), 0.013),
    ((0.035, -0.05), 0.02),
]


def axe():
    grip, along = R_FIST, HAFT
    out = (BLADE_OUT - BLADE_OUT.dot(along) * along).normalized()
    across = out.cross(along)

    tube('haft', grip - 0.17 * along, grip + 0.56 * along, [(0, 0.028), (1, 0.025)], M['wood'])
    # A pommel below.
    end = grip - 0.17 * along
    ring = segment(end, end + along, [(0, 0.036)], 4, 45)[0]
    verts = ring + [end - 0.04 * along, end + 0.03 * along]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('pommel', verts, faces, M['steel'], inside=end)

    # The socket the head is forged round, closed over the top of the haft.
    eye = grip + 0.47 * along
    rings = segment(eye - 0.075 * along, eye + 0.09 * along, [(0, 0.045), (1, 0.04)], 6, 30)
    verts, faces, _ = loft(rings)
    faces += [tuple(range(6)), tuple(range(6, 12))]
    part('socket', verts, faces, M['steel'], inside=eye)

    # The blade: the flat by the eye on each side, bevelled to the edge.
    def at(u, v, w):
        return eye + u * out + v * along + w * across

    verts, index = [], []
    for (u, v), t in AXE_BLADE:
        if t == 0:
            index.append((len(verts), len(verts)))
            verts.append(at(u, v, 0))
        else:
            index.append((len(verts), len(verts) + 1))
            verts += [at(u, v, t), at(u, v, -t)]
    sides = []
    for side in (0, 1):
        p = [i[side] for i in index]
        sides.append([(p[0], p[1], p[5], p[6]), (p[1], p[2], p[3]), (p[1], p[3], p[5]), (p[5], p[3], p[4])])
    walls = [(index[0][0], index[1][0], index[1][1], index[0][1]), (index[1][0], index[2][0], index[1][1]),
             (index[5][0], index[6][0], index[6][1], index[5][1]), (index[4][0], index[5][0], index[5][1])]
    faces = wind(verts, sides[0], outward=across) + wind(verts, sides[1], outward=-across)
    faces += wind(verts, walls, inside=eye + 0.12 * out)
    part('blade', verts, faces, M['steel'])

    arm('right', R_SHOULDER, R_ELBOW, R_WRIST, R_FIST, along, thumb=True)


# The standard of Durin's folk, in his left hand ------------------------------------------------------

L_SHOULDER = V(0.30, 0.02, 0.64)  # before the lean
POLE = V(0.41, -0.115, 0.0)
L_ELBOW, L_FIST = V(0.405, 0.035, 0.49), V(POLE.x, POLE.y, 0.645)
POLE_TOP = 1.56
BAR = 1.47  # the bar the banner hangs from, out from the pole to his left
# The banner flies out from the pole, sewn to it along its edge: its columns out from the pole (u),
# its top, middle and bottom rows (z), and the swallowtail's two tails and the notch between them.
FLAG_U = [0.012, 0.1, 0.19, 0.27]
FLAG_ROWS = [BAR, 1.25, 1.03]
FLAG_TAIL = 0.36  # how far out the tails reach
FLAG_CURL = 0.035  # how far back the tails curl
DEVICE_AT = (0.125, 1.25)  # the device's centre (u, z), on the flat of the banner

# The device: an anvil under a crown, as flat shapes in (u, v), u across from -0.5 to 0.5 and v up
# from 0 to 1. The anvil's horn is at -u; standard() turns it to point out to the fly.
DEVICE = [
    # the anvil: foot, waist, and its face with the horn
    (-0.3, 0.0), (0.3, 0.0), (0.12, 0.17), (-0.12, 0.17), (0.15, 0.38), (-0.15, 0.38),
    (0.34, 0.44), (0.34, 0.6), (-0.3, 0.6), (-0.52, 0.56),
    # the crown: its band and three points
    (-0.25, 0.68), (0.25, 0.68), (0.25, 0.78), (0.1, 0.8), (-0.1, 0.8), (-0.25, 0.78),
    (0.28, 0.98), (0.0, 0.98), (-0.28, 0.98),
]
DEVICE_FACES = [
    (0, 1, 2, 3), (3, 2, 4, 5), (5, 4, 6, 7, 8, 9),
    (10, 11, 12, 13, 14, 15), (12, 16, 13), (13, 17, 14), (14, 18, 15),
]


def standard():
    tube('pole', POLE, POLE + V(0, 0, POLE_TOP), [(0, 0.021), (1, 0.018)], M['wood'])
    # A brass point on the top.
    top = POLE + V(0, 0, POLE_TOP)
    ring = segment(top, top + V(0, 0, 1), [(0, 0.034)], 4, 0)[0]
    verts = ring + [top + V(0, 0, 0.11), top - V(0, 0, 0.03)]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('finial', verts, faces, M['brass'], inside=top + V(0, 0, 0.02))
    bar_end = POLE + V(FLAG_TAIL + 0.012, 0.0, BAR + 0.012)
    tube('bar', POLE + V(0, 0, BAR + 0.012), bar_end, [(0, 0.015), (1, 0.013)], M['wood'], n=4, phase=45)

    # The banner, flat from the pole to the swallowtail, whose two tails curl back a little.
    def at(u, z, curl=0.0):
        return V(POLE.x + u, POLE.y + curl, z)

    grid = [[at(u, z) for u in FLAG_U] for z in FLAG_ROWS]
    verts, faces, _ = loft(grid, closed=False)
    top_tail, low_tail = len(verts), len(verts) + 1
    verts += [at(FLAG_TAIL, FLAG_ROWS[0], FLAG_CURL), at(FLAG_TAIL, FLAG_ROWS[2], FLAG_CURL)]
    n = len(FLAG_U)
    faces += [(n - 1, top_tail, 2 * n - 1), (2 * n - 1, low_tail, 3 * n - 1)]
    part('banner', verts, faces, M['team'], outward=V(0, -1, 0))

    # The device on both faces of it.
    cu, cz = DEVICE_AT
    for name, lift, normal in (('device-front', -0.004, V(0, -1, 0)), ('device-back', 0.004, V(0, 1, 0))):
        verts = [at(cu - 0.2 * u, cz - 0.15 + 0.3 * v, lift) for u, v in DEVICE]
        part(name, verts, DEVICE_FACES, M['silver'], outward=normal)

    shoulder = leaned(L_SHOULDER)
    wrist = L_FIST + (L_ELBOW - L_FIST).normalized() * 0.045
    arm('left', shoulder, L_ELBOW, wrist, L_FIST, V(0, 0, 1))


def main():
    reset()
    make_materials()
    legs()
    lower = set(bpy.context.scene.objects)
    coat()
    head()
    rings = [hood_ring(*level) for level in HOOD]
    mantle(rings)
    hood(rings)
    circlet(rings)
    beard()
    axe()
    lean([o for o in bpy.context.scene.objects if o not in lower], PIVOT, LEAN)
    standard()
    finish('balin')


main()
