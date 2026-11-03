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

He is rigged as Gimli is (gimli.py, the Dwarves' reference rig): every part bound to the bone it
moves with, his joints marked as the parts round them are built. To bend, his legs are a thigh and a
shin, as Gimli's, which costs 24 triangles, and his coat is a skirt on his hips and a chest on his
spine that starts deep inside the belt, so it stays in it as he bends, which costs none; the
mantle's neck runs well up inside the hood for the same reason. His long beard is in two: the top on
his head, and the rest on a bone of its own that hangs from his chin, overlapping it by a band (12
triangles), so it follows his head where it joins his face but keeps hanging down his chest as he
nods and looks about (clips.hanging()). His clips (../clips.py) are Gimli's, fitted by fit() to the
standard: a Dwarf's heavy run and the stance he stands in, a chop of the axe and a fall to his
knees; the standard stays planted as he stands, fights and is stunned, is carried clear of the
ground as he runs, tips over across his hex as he falls and is lifted as he wins. His cast, Lord of
Moria, is a Captain's rally to the standard (plant): heaved up and planted again with a stamp, the
axe thrust high.

His fittings, the point on the banner pole, the axe's pommel and the collar under its head, and the
studs on his belt, use `trim`, which the client colours iron, silver or gold by star level
(docs/viewer-spec.md section 4, "Star levels"); from behind the pole's point, the collar and the
studs on the back of the belt show it, and from in front the point, the axe's fittings and the studs
either side of his beard. The circlet is a lord's crown, not a fitting, and stays brass. With the
rig, the studs and the collar would be 27 triangles over the budget, so triangles nobody sees pay
for them: his chest stops at his shoulders, inside the mantle; his brows are open at the back,
where they lie on his brow; and the hood has no throat behind his face. His 2★ model is balin-2.py,
which imports this script and builds him with its jewelled belt in place of the plain one (build()),
and his 3★ model balin-3.py.

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
    bone,
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
from clips import fit, hanging  # noqa: E402
from rig import Rig, hold, joint  # noqa: E402

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
        brass=material('brass', BRASS, roughness=0.55, metallic=0.1),  # the circlet
        trim=trim_material(),  # fittings, recoloured by star
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


def boot(s, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    joint(f'toe_{s}', V(ankle.x, ankle.y, 0) + turn @ V(0, -0.125, 0.025))
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + turn @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(f'boot-{s}', verts, faces, M['boots'], inside=at + V(0, 0, 0.07))
    # A turned-down cuff, which makes the boot read as heavy.
    top = outlines[-1][1]
    cuff = [[at + turn @ V(1.24 * x, 1.24 * y + 0.006, z) for x, y in top] for z in (0.105, 0.178)]
    verts, faces, _ = loft(cuff)
    part(f'boot-{s}-cuff', verts, faces, M['leather'], inside=at + V(0, 0, 0.14))


# Each leg as it was built, one tube from the hip to the ankle, but in two at a knee halfway down and
# a little forward, as Gimli's: the thigh's end overlapping the shin's top so the knee can bend.
LEGS = [('r', V(-0.11, 0.02, 0.36), RIGHT_ANKLE, RIGHT_YAW), ('l', V(0.11, 0.0, 0.36), LEFT_ANKLE, LEFT_YAW)]
KNEE_AHEAD = 0.014
OVERLAP = 0.035


def legs():
    for s, hip, ankle, yaw in LEGS:
        ahead = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ V(0, -1, 0)
        knee = hip.lerp(ankle, 0.5) + KNEE_AHEAD * ahead
        thigh, shin = (knee - hip).length, (ankle - knee).length
        with bone(f'thigh_{s}'):
            tube(f'thigh-{s}', hip, knee, [(0, 0.09), (1 + OVERLAP / thigh, 0.077)], M['cloth'])
        with bone(f'shin_{s}'):
            tube(f'shin-{s}', knee, ankle, [(-OVERLAP / shin, 0.074), (1, 0.066)], M['cloth'])
        with bone(f'foot_{s}'):
            boot(s, ankle, yaw)
        joint(f'hip_{s}', hip)
        joint(f'knee_{s}', knee)
        joint(f'ankle_{s}', ankle)


# Coat --------------------------------------------------------------------------------------------

# The coat as a barrel of octagons, from the hem up: z, half-width, half-depth and centre y. The belt
# is the band between the third and fourth rings. It is in two pieces, which bend at the belt, as
# Gimli's mail is: the skirt and the belt on his hips, and the chest on his spine, from inside the
# belt (WAIST) up to his shoulders. It stops there, inside the mantle, which closes over it to the
# neck and up into the hood, so a band from there to the neck would never be seen.
TORSO = [
    (0.235, 0.29, 0.252, 0.0),  # the hem, flared over the knees
    (0.37, 0.258, 0.218, 0.0),  # hips
    (0.43, 0.272, 0.238, -0.005),  # belt, lower edge
    (0.505, 0.282, 0.244, -0.005),  # belt, upper edge
]
CHEST = [
    (0.38, 0.244, 0.208, -0.005),  # inside the belt, deep enough to stay in it as he bends
    (0.615, 0.312, 0.242, 0.0),  # barrel chest
    (0.715, 0.298, 0.202, 0.01),  # shoulders, inside the mantle
]
TORSO_BANDS = [0, 0, 1]  # coat, except the belt
PELVIS, WAIST = V(0, 0, 0.33), V(0, -0.005, 0.47)
BELT = 2  # the ring at the belt's lower edge
# Square studs on the belt, on the faces of the coat's octagon at these angles (degrees from +X,
# his left): three on the back, and one either side of his beard in front.
STUDS = [45, 90, 135, 225, 315]


def coat(belt=True):
    # Without the plain `belt`, as his 2★ model has it, the belt's band is coat and has no studs.
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] if belt else 0 for b in bands]
    with bone('hips'):
        part('skirt', verts, faces, [M['coat'], M['leather']], face_mats, inside=lambda c: V(0, 0, c.z))
        # The studs, on the belt with the skirt.
        for a in STUDS if belt else ():
            k = a // 45 - 1  # the face at angle a runs from vertex k to k + 1 of each ring
            j = (k + 1) % 8
            corners = [rings[BELT][k], rings[BELT][j], rings[BELT + 1][j], rings[BELT + 1][k]]
            at = sum(corners, Vector()) / 4
            out = newell(corners).normalized()
            if out.dot(V(at.x, at.y, 0)) < 0:
                out = -out
            cone(f'stud-{a}', at - 0.004 * out, at + 0.018 * out, 0.027, M['trim'], n=4, phase=45, back=None)
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in CHEST]
    verts, faces, _ = loft(rings)
    with bone('spine'):
        part('chest', verts, faces, M['coat'], inside=lambda c: V(0, 0, c.z))
    joint('pelvis', PELVIS)
    joint('waist', WAIST)


# Head --------------------------------------------------------------------------------------------

NECK, CROWN = V(0, 0.02, 0.79), V(0, 0.03, 1.13)


def head():
    with bone('head'):
        features()
    joint('neck', NECK)
    joint('crown', CROWN)


def features():
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
    # the jutting front and the underside, from his right to his left. Their backs lie on his brow
    # under the hood, so they are left open.
    half = [
        [(-0.15, -0.108, 0.952), (-0.152, -0.176, 0.926), (-0.148, -0.116, 0.902)],
        [(-0.075, -0.124, 0.978), (-0.078, -0.206, 0.954), (-0.075, -0.134, 0.921)],
        [(0.0, -0.142, 0.962), (0.0, -0.204, 0.94), (0.0, -0.152, 0.914)],
    ]
    sections = [[V(*p) for p in s] for s in half] + [[V(-x, y, z) for x, y, z in s] for s in reversed(half[:-1])]
    verts, faces, _ = loft(sections, closed=False)
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
HOOD_NECK = 3  # the ring where the hood starts; the mantle tucks up under it
UNDER_BROW = 4  # the band from the eyes to the brow, whose front is the underside of the brow
# The mantle hangs in folds: every other point of its rings of sixteen stands out (and at the hem
# hangs lower), from the hem up to the shoulders.
MANTLE_FOLD = [(0.032, 0.022), (0.016, 0.0), (0.0, 0.0)]  # out and down, hem, shoulder, upper
MANTLE_TUCK = 0.07  # how far its neck runs up inside the hood


def hood_ring(side, back_corner, back, front_corner, front):
    (sx, sy, sz), (bx, by, bz), (fx, fy, fz) = side, back_corner, front_corner
    return [V(sx, sy, sz), V(bx, by, bz), V(0, back[0], back[1]), V(-bx, by, bz), V(-sx, sy, sz),
            V(-fx, fy, fz), V(0, front[0], front[1]), V(fx, fy, fz)]


def inside_garment(c):
    return V(0, 0.03, c.z - 0.08)


def mantle(rings):
    folded = []
    for ring, (out, down) in zip(rings[:HOOD_NECK], MANTLE_FOLD):
        points = []
        for a, b in zip(ring, ring[1:] + ring[:1]):
            mid = (a + b) / 2
            points += [a, mid + out * V(mid.x, mid.y - 0.03, 0).normalized() - V(0, 0, down)]
        folded.append(points)
    # Its neck runs up under the hood, out of sight, so the hood's edge lies over it, and far enough
    # up inside it that it still does as he bows his head.
    ring = rings[HOOD_NECK]
    neck = [p for a, b in zip(ring, ring[1:] + ring[:1]) for p in (a, (a + b) / 2)]
    folded.append([V(0.78 * p.x, 0.03 + 0.78 * (p.y - 0.03), p.z + MANTLE_TUCK) for p in neck])
    verts, faces, _ = loft(folded)
    with bone('spine'):
        part('mantle', verts, faces, M['team'], inside=inside_garment)


def hood(rings):
    with bone('head'):
        cowl(rings)


def cowl(rings):
    verts, faces, bands = loft(rings[HOOD_NECK:])
    apex, last = len(verts), (len(rings) - HOOD_NECK - 1) * 8
    verts.append(HOOD_PEAK)
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    bands = [HOOD_NECK + b for b in bands] + [len(rings) - 1] * 8
    # Every face points away from the inside of the garment, except the two under the brow, which
    # face down into the face. The two in front of the throat, behind his face and the top of his
    # beard, are left out: nobody sees them.
    wound = []
    for k, (face, band) in enumerate(zip(faces, bands)):
        if band == HOOD_NECK and k % 8 in (5, 6):
            continue
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
    with bone('head'):
        part('circlet', verts, faces, M['brass'], inside=lambda c: V(0, 0.03, c.z))


# Beard ---------------------------------------------------------------------------------------------


# Long and white, from the cheeks over the belt to his knees, in three locks (a W in section) that part
# into two forks at the end. Each level runs from his right side across the front to his left: the
# side, tucked into the hood or the coat, the lock's ridge, the valley and the middle.
BEARD_LEVELS = [
    [(-0.146, -0.072, 0.935), (-0.142, -0.118, 0.882), (-0.076, -0.158, 0.853), (0.0, -0.172, 0.845)],
    [(-0.182, -0.085, 0.80), (-0.174, -0.218, 0.772), (-0.082, -0.248, 0.766), (0.0, -0.278, 0.760)],
    [(-0.168, -0.175, 0.655), (-0.162, -0.298, 0.645), (-0.076, -0.316, 0.64), (0.0, -0.342, 0.635)],
    [(-0.138, -0.205, 0.52), (-0.132, -0.312, 0.51), (-0.064, -0.326, 0.505), (0.0, -0.35, 0.50)],
    [(-0.108, -0.19, 0.40), (-0.104, -0.296, 0.39), (-0.05, -0.30, 0.385), (0.0, -0.318, 0.38)],
    [(-0.072, -0.205, 0.30), (-0.066, -0.27, 0.238), (-0.034, -0.274, 0.272), (0.0, -0.284, 0.342)],
]
# It is in two: the top, from the cheeks to his chest, on his head, and the rest on a bone of its own
# that hangs from his chin (beard_root, in the middle of the level it parts at), its top a little up
# inside the top's last band so they overlap as it swings.
BEARD_PARTS = 2  # the level the two pieces part at
BEARD_OVERLAP = 0.3  # how far up the band above it the lower piece starts, a share of it
BEARD_ROOT, BEARD_TIP = V(0, -0.29, 0.645), V(0, -0.29, 0.3)


def beard():
    rings = []
    for level in BEARD_LEVELS:
        right = [V(*p) for p in level]
        left = [V(-p.x, p.y, p.z) for p in reversed(right[:-1])]
        rings.append(right + left)
    top = rings[:BEARD_PARTS + 1]
    tucked = [a.lerp(b, BEARD_OVERLAP) + V(0, 0.006, 0) for a, b in zip(rings[BEARD_PARTS], rings[BEARD_PARTS - 1])]
    hanging = [tucked] + rings[BEARD_PARTS:]
    for name, bone_name, levels in (('beard', 'head', top), ('beard-hanging', 'beard', hanging)):
        verts, faces, _ = loft(levels, closed=False)
        with bone(bone_name):
            part(name, verts, faces, M['beard'], inside=lambda c: V(0, -0.05, c.z))
    joint('beard_root', BEARD_ROOT)
    joint('beard_tip', BEARD_TIP)

    # A long moustache in two sweeps from under the nose, out and down over the beard.
    for s in (-1, 1):
        root = [V(s * 0.01, -0.178, 0.878), V(s * 0.01, -0.212, 0.86), V(s * 0.01, -0.176, 0.846)]
        mid = [V(s * 0.07, -0.2, 0.856), V(s * 0.07, -0.242, 0.834), V(s * 0.07, -0.2, 0.818)]
        tip = V(s * 0.125, -0.282, 0.71)
        verts, faces, _ = loft([root, mid])
        verts.append(tip)
        faces += [(3, 4, 6), (4, 5, 6), (5, 3, 6)]
        with bone('head'):
            part(f'moustache-{s}', verts, faces, M['beard'], inside=V(s * 0.06, -0.17, 0.84))


# Arms ----------------------------------------------------------------------------------------------


def arm(side, shoulder, elbow, wrist, fist, fist_up, thumb=False):
    """A mail sleeve, the coat's cuff at the elbow, a leather bracer and a big fist closed round a
    grip running along `fist_up`; the sleeve overlaps the cuff, so it bends at the elbow, as Gimli's."""
    s = side[0]
    with bone(f'upper_arm_{s}'):
        tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.104), (1.12, 0.084)], M['mail'])
    with bone(f'forearm_{s}'):
        forearm = [(-0.2, 0.074), (0.3, 0.09), (1.0, 0.082)]
        tube(f'forearm-{side}', elbow, wrist, forearm, [M['coat'], M['leather']], [0, 1])
    ahead = (wrist - elbow).normalized()
    up = (Vector(fist_up) - Vector(fist_up).dot(ahead) * ahead).normalized()
    across = ahead.cross(up)  # away from the body for the right hand
    with bone(f'hand_{s}'):
        box(f'fist-{side}', fist, [ahead, up, across], (0.056, 0.06, 0.062), M['skin'], 0.88)
        if thumb:
            # Pressed along the inside of the fist and over the haft, so it reads as a grip.
            centre = fist + 0.012 * ahead + 0.03 * up - 0.06 * across
            box(f'thumb-{side}', centre, [ahead, up, across], (0.047, 0.024, 0.02), M['skin'], 0.7)
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', fist)


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
    with bone('hand_r'):
        axe_parts()
    arm('right', R_SHOULDER, R_ELBOW, R_WRIST, R_FIST, HAFT, thumb=True)
    # Held by the grip, its head up the haft and its edge outwards.
    eye = R_FIST + 0.47 * HAFT
    hold('r', R_FIST, eye, eye + 0.2 * (BLADE_OUT - BLADE_OUT.dot(HAFT) * HAFT).normalized())


def axe_parts():
    grip, along = R_FIST, HAFT
    out = (BLADE_OUT - BLADE_OUT.dot(along) * along).normalized()
    across = out.cross(along)

    tube('haft', grip - 0.17 * along, grip + 0.56 * along, [(0, 0.028), (1, 0.025)], M['wood'])
    # A pommel below.
    end = grip - 0.17 * along
    ring = segment(end, end + along, [(0, 0.036)], 4, 45)[0]
    verts = ring + [end - 0.04 * along, end + 0.03 * along]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('pommel', verts, faces, M['trim'], inside=end)

    # The socket the head is forged round, closed over the top of the haft, and a collar under it.
    eye = grip + 0.47 * along
    collar = [(0, 0.029), (0.5, 0.041), (1, 0.029)]
    tube('collar', eye - 0.135 * along, eye - 0.075 * along, collar, M['trim'])
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
    with bone('hand_l'):
        banner()
    shoulder = leaned(L_SHOULDER)
    wrist = L_FIST + (L_ELBOW - L_FIST).normalized() * 0.045
    arm('left', shoulder, L_ELBOW, wrist, L_FIST, V(0, 0, 1))
    # Held by the grip in his fist, up the pole to its top, the banner's face to the front.
    top = POLE + V(0, 0, POLE_TOP)
    hold('l', L_FIST, top, top + V(0, -0.1, 0))


def banner():
    tube('pole', POLE, POLE + V(0, 0, POLE_TOP), [(0, 0.021), (1, 0.018)], M['wood'])
    # A point on the top.
    top = POLE + V(0, 0, POLE_TOP)
    ring = segment(top, top + V(0, 0, 1), [(0, 0.034)], 4, 0)[0]
    verts = ring + [top + V(0, 0, 0.11), top - V(0, 0, 0.03)]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('finial', verts, faces, M['trim'], inside=top + V(0, 0, 0.02))
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


# His clips (../clips.py): Gimli's stance and heavy run, a chop of the axe, and for his cast a rally to
# the standard, fitted to the standard he holds; his beard hanging from his chin through them all.
CLIPS = hanging(fit({
    'idle': ('ready', {}),
    'move': ('run', {'heavy': 1.0}),
    'attack': ('chop', {}),
    'cast': ('plant', {'rise': 0.26}),
    'stun': ('dazed', {}),
    'death': ('knees', {}),
    'victory': ('raise', {}),
}, pole='l', free=('cast',)))


def build(girdle=None):
    """Makes him in a fresh scene, every part bound to its bone and his joints marked, and returns
    the rig to finish() him with. His 2★ model (balin-2.py) passes its jewelled belt as `girdle`, a
    function that makes it on his hips before he leans, which takes the place of the plain belt and
    its studs."""
    reset()
    make_materials()
    legs()
    lower = set(bpy.context.scene.objects)
    coat(belt=girdle is None)
    if girdle is not None:
        girdle()
    head()
    rings = [hood_ring(*level) for level in HOOD]
    mantle(rings)
    hood(rings)
    circlet(rings)
    beard()
    axe()
    lean([o for o in bpy.context.scene.objects if o not in lower], PIVOT, LEAN)
    standard()
    return Rig(bones={'beard': ('head', 'beard_root', 'beard_tip')}, clips=CLIPS)


def main():
    finish('balin', rig=build())


if __name__ == '__main__':
    main()
