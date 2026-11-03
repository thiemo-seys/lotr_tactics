"""Dáin Ironfoot, Dwarf, Guardian: lord of the Iron Hills, later King under the Mountain.

Built in the Faceted style of the reference, Gimli (gimli.py, docs/viewer-spec.md section 4): every
form is a low-segment shape or a hand-placed set of vertices, shaded flat. A Dwarf of Gimli's build,
1.15 to the top of his helm, but heavier and older: a knee-length hauberk of steel mail, a hood of
iron mail under a crowned iron helm, and an iron-grey beard forked into two clasped locks. As the
Dwarves of the Iron Hills do, he slings his round shield on his back and fights with a great
two-handed mattock, held across his body ready to slam, its head high over his left shoulder. The
team colour is his shield's face, seen from behind, and the tabard over his hauberk, seen from the
front.

His fittings, the clasps on his beard's locks, the belt buckle, the shield's rim and boss and the
mattock's socket and butt cap, use `trim`, which the client colours iron, silver or gold by star
level (docs/viewer-spec.md section 4, "Star levels"); the crown on his helm is a crown, not a
fitting, and stays gold. His 2★ model is dain-2.py, which imports this script and builds him with
its sword behind his left hip (build()), and his 3★ model dain-3.py.

He is rigged as Gimli is (gimli.py, the Dwarves' reference rig): every part bound to the bone it
moves with, his joints marked as the parts round them are built. To bend, his legs are a thigh and a
shin, as Gimli's, which costs 24 triangles; his hauberk is a skirt on his hips and a chest on his
spine that starts deep inside the belt, and his spine bends about the back of his waist, so the back
of the hauberk stays closed under his shield as he slumps; his hood of mail is a coif on his head
and a cape of mail on his shoulders, tucked up under it; neither costs a triangle. The forks of his
beard hang from his chin on a bone of their own, as Balin's beard does (clips.hanging()), and his
shield goes with his back. The mattock is in his right fist, and his left hand keeps hold of the
haft wherever it goes, sliding along it as far as it must to reach (clips.both_hands()). His clips
(../clips.py) are Gimli's stance and heavy run, the mattock held across him in both hands; a
two-handed blow (smite), heaved up on his left and brought down across his front, landing low on
his left before him; and for his cast, Iron Hills, a greater one (slam), heaved higher as he rises
and slammed into the ground as he drops behind it. From his right fist to its head the haft is as
long as his hex's radius, and his arms are short for his long beard and his big helm, so both blows
keep before his beard (`beard`): his right hand beside it, his left past it, the haft across in
front of it, and his helm held up as he leans in, so neither his hands nor the haft go into his
helm or his beard; the blows land beside him, showing from behind past his shield. Dazed, he lets
it down to hang from his right hand by his hip, clear of his hauberk; he falls to his knees and
slumps over them as Gimli does, letting go of it; and he raises it high in his right hand, out from
his shoulder and leaning out a little, so its butt clears his helm, as he wins.
To fold his elbows to the haft, his sleeves are closed past them, which costs 8 triangles.

    blender --background --factory-startup --python-exit-code 1 --python dain.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BRASS,
    CLOTH,
    EYES,
    LEATHER,
    MAIL,
    STEEL,
    WOOD,
    V,
    bent_tube,
    bone,
    box,
    ellipse,
    finish,
    lean,
    loft,
    material,
    newell,
    on_surface,
    part,
    reset,
    team_material,
    trim_material,
    tube,
)
from clips import both_hands, fit, hanging  # noqa: E402
from rig import Rig, hold, joint  # noqa: E402

# Dáin's own colours (sRGB); the rest come from the kit.
BEARD = 0x9C978E  # iron-grey
SKIN = 0xCF9878  # weathered
IRON = 0x62666C  # his helm, his hood and his iron-shod boots, darker than the kit's steel

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        mail=material('mail', MAIL, roughness=0.8, metallic=0.05),
        iron=material('iron', IRON, roughness=0.55, metallic=0.12),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        gold=material('gold', BRASS, roughness=0.55, metallic=0.1),  # the crown
        trim=trim_material(),
        beard=material('beard', BEARD, roughness=0.9),
        skin=material('skin', SKIN, roughness=0.85),
        leather=material('leather', LEATHER, roughness=0.85),
        cloth=material('cloth', CLOTH, roughness=0.9),
        wood=material('wood', WOOD, roughness=0.85),
        eyes=material('eyes', EYES, roughness=0.6),
    )


def block(name, a, b, u, v, half_a, half_b, mat):
    """A block from the rectangle round `a` to the one round `b`, each with half-sizes along the unit
    vectors u and v: a tapered bar, a blade or a hammer's poll."""
    verts = []
    for c, (hu, hv) in ((a, half_a), (b, half_b)):
        verts += [c + su * hu * u + sv * hv * v for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    faces = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return part(name, verts, faces, mat, inside=(a + b) / 2)


# Legs --------------------------------------------------------------------------------------------

LEAN = 3  # degrees the body above the hips leans forward

# Feet planted wide, the left a little forward, toes turned out.
RIGHT_ANKLE, RIGHT_YAW = V(-0.175, 0.05, 0.10), -14
LEFT_ANKLE, LEFT_YAW = V(0.175, -0.055, 0.10), 12

# The iron-shod boot from the sole up, in the foot's own frame (toes towards -y): the height of each
# ring and the right half of it, side, heel and toe, mirrored counter-clockwise by boot().
BOOT_RINGS = [
    (0.0, [(0.09, -0.02), (0.075, 0.08), (0.068, -0.145)]),  # the sole
    (0.065, [(0.09, -0.01), (0.077, 0.08), (0.066, -0.108)]),  # the instep slopes back from the toe
    (0.15, [(0.08, 0.0), (0.072, 0.074), (0.064, -0.05)]),  # round the ankle
]


def boot(name, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    joint(f'toe_{name[-1]}', V(ankle.x, ankle.y, 0) + turn @ V(0, -0.13, 0.025))
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + turn @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['iron'], inside=at + V(0, 0, 0.07))
    # A turned-down leather cuff.
    top = outlines[-1][1]
    cuff = [[at + turn @ V(1.22 * x, 1.22 * y + 0.006, z) for x, y in top] for z in (0.11, 0.18)]
    verts, faces, _ = loft(cuff)
    part(name + '-cuff', verts, faces, M['leather'], inside=at + V(0, 0, 0.14))


# Each leg as it was built, one tube from the hip to the ankle, but in two at a knee halfway down and
# a little forward, as Gimli's: the thigh's end overlapping the shin's top so the knee can bend.
LEGS = [('r', V(-0.115, 0.02, 0.34), RIGHT_ANKLE, RIGHT_YAW), ('l', V(0.115, 0.0, 0.34), LEFT_ANKLE, LEFT_YAW)]
KNEE_AHEAD = 0.014
OVERLAP = 0.035


def legs():
    for s, hip, ankle, yaw in LEGS:
        ahead = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ V(0, -1, 0)
        knee = hip.lerp(ankle, 0.5) + KNEE_AHEAD * ahead
        thigh, shin = (knee - hip).length, (ankle - knee).length
        with bone(f'thigh_{s}'):
            tube(f'thigh-{s}', hip, knee, [(0, 0.09), (1 + OVERLAP / thigh, 0.079)], M['cloth'])
        with bone(f'shin_{s}'):
            tube(f'shin-{s}', knee, ankle, [(-OVERLAP / shin, 0.076), (1, 0.068)], M['cloth'])
        with bone(f'foot_{s}'):
            boot(f'boot-{s}', ankle, yaw)
        joint(f'hip_{s}', hip)
        joint(f'knee_{s}', knee)
        joint(f'ankle_{s}', ankle)


# Body --------------------------------------------------------------------------------------------

# The hauberk as a barrel of octagons: z, half-width, half-depth and centre y. It reaches his knees,
# flared like a bell. The belt is the band between the third and fourth rings. It is in two pieces,
# which bend at the belt, as Gimli's mail is: the skirt and the belt on his hips, and the chest on his
# spine, from inside the belt (WAIST) up to his neck, under the coif.
TORSO = [
    (0.19, 0.308, 0.262, 0.0),  # hem, at the knee
    (0.36, 0.27, 0.228, 0.0),  # hips
    (0.43, 0.282, 0.24, -0.005),  # belt, lower edge
    (0.50, 0.29, 0.248, -0.005),  # belt, upper edge
]
CHEST = [
    (0.38, 0.252, 0.212, -0.005),  # inside the belt, deep enough to stay in it as he bends
    (0.61, 0.318, 0.244, 0.0),  # barrel chest
    (0.71, 0.30, 0.205, 0.01),  # shoulders
    (0.79, 0.145, 0.125, 0.02),  # neck
]
BACK = 1.15  # how much deeper the barrel is behind than in front: a broad back under the shield
BELT_BAND = 2
TABARD = {4, 5, 6}  # the faces of each band that look forward, where the tabard is: front and corners
TABARD_BANDS = {0, 1}  # from the hem to the belt, on the skirt
CHEST_TABARD_BANDS = {0, 1}  # and from the belt to the shoulders, on the chest
# How far the tabard hangs below the mail under each of its corners, from his right to his left.
TABARD_HEM = [0.04, 0.085, 0.085, 0.04]
# His spine bends about the back of his waist rather than its middle, so the back of his hauberk
# stays closed under the shield as he slumps forward, and its front sinks into the belt instead.
PELVIS, WAIST = V(0, 0, 0.33), V(0, 0.15, 0.465)


def barrel(levels):
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in levels]
    for ring, (_, _, _, cy) in zip(rings, levels):
        for p in ring:
            p.y = cy + (p.y - cy) * (BACK if p.y > cy else 1.0)
    return rings


def torso():
    rings = barrel(TORSO)
    verts, faces, bands = loft(rings)
    face_mats = []
    for i, b in enumerate(bands):
        if b == BELT_BAND:
            face_mats.append(1)
        elif b in TABARD_BANDS and i % 8 in TABARD:
            face_mats.append(2)
        else:
            face_mats.append(0)
    # The tabard hangs below the hem of the mail, longest in the middle.
    first = len(verts)
    for k, drop in enumerate(TABARD_HEM):
        p = rings[0][4 + k]
        verts.append(V(1.03 * p.x, 1.03 * p.y, p.z - drop))
    for k in range(3):
        faces.append((4 + k, 5 + k, first + k + 1, first + k))
        face_mats.append(2)
    with bone('hips'):
        part('skirt', verts, faces, [M['mail'], M['leather'], M['team']], face_mats,
             inside=lambda c: V(0, 0, max(c.z, 0.2)))
        axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
        box('buckle', V(0, -0.248, 0.465), axes, (0.02, 0.05, 0.042), M['trim'], 0.8)
    verts, faces, bands = loft(barrel(CHEST))
    face_mats = [1 if b in CHEST_TABARD_BANDS and i % 8 in TABARD else 0 for i, b in enumerate(bands)]
    with bone('spine'):
        part('chest', verts, faces, [M['mail'], M['team']], face_mats, inside=lambda c: V(0, 0, c.z))
    joint('pelvis', PELVIS)
    joint('waist', WAIST)


# Head --------------------------------------------------------------------------------------------


NECK, CROWN = V(0, 0.02, 0.79), V(0, 0.015, 1.152)


def head():
    with bone('head'):
        features()
    joint('neck', NECK)
    joint('crown', CROWN)


def features():
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

    for s in (-1, 1):
        corners = [(s * 0.03, 0.909), (s * 0.092, 0.913), (s * 0.063, 0.892)]
        verts = [V(x, on_surface(plate, x, z) - 0.006, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    top, hump, tip = V(0, -0.15, 0.938), V(0, -0.205, 0.912), V(0, -0.262, 0.87)
    left, right, under = V(-0.052, -0.155, 0.872), V(0.052, -0.155, 0.872), V(0, -0.17, 0.853)
    verts = [top, hump, tip, left, right, under]
    faces = [(0, 3, 1), (0, 1, 4), (1, 3, 2), (1, 2, 4), (3, 5, 2), (5, 4, 2)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.12, 0.89))

    sections = [
        [V(-0.132, -0.112, 0.97), V(-0.132, -0.172, 0.95), V(-0.132, -0.118, 0.924)],
        [V(0, -0.14, 0.955), V(0, -0.21, 0.93), V(0, -0.15, 0.902)],
        [V(0.132, -0.112, 0.97), V(0.132, -0.172, 0.95), V(0.132, -0.118, 0.924)],
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brows', verts, faces, M['beard'], inside=V(0, -0.09, 0.94))


def coif_ring(z, side, back_corner, back_y, front_corner, front_y, lift=0.0):
    """Eight points round him from his left side (+X), past his back, to his right and his front,
    the three at the front raised by `lift`."""
    (sx, sy), (bx, by), (fx, fy) = side, back_corner, front_corner
    front = z + lift
    return [V(sx, sy, z), V(bx, by, z), V(0, back_y, z), V(-bx, by, z), V(-sx, sy, z), V(-fx, fy, front),
            V(0, front_y, front), V(fx, fy, front)]


# The hood of iron mail, from under the helm round his face and down over his shoulders, cut short
# at the front so the tabard shows either side of the beard. It is in two pieces: the coif on his
# head, down to his jaw, and the cape of mail on his shoulders, its top tucked up under the coif's
# edge (TUCK) so they overlap as his head turns.
COIF = [
    (0.945, (0.172, 0.02), (0.125, 0.15), 0.19, (0.125, -0.09), -0.115),  # under the helm
    (0.875, (0.178, 0.02), (0.13, 0.155), 0.198, (0.142, -0.098), -0.125),  # round the cheeks
    (0.79, (0.192, 0.03), (0.142, 0.17), 0.212, (0.152, -0.11), -0.14),  # round the jaw
    (0.735, (0.33, 0.02), (0.24, 0.2), 0.27, (0.23, -0.17), -0.215, 0.03),  # over the shoulders
    (0.665, (0.355, 0.02), (0.26, 0.215), 0.288, (0.25, -0.195), -0.24, 0.06),  # the hem
]


COIF_PARTS = 2  # the ring the two pieces part at, round the jaw
TUCK = (0.85, 0.012)  # how far in towards the middle the cape's top is drawn, and how far up


def coif():
    rings = [coif_ring(*r) for r in COIF]
    jaw = rings[COIF_PARTS]
    tucked = [V(TUCK[0] * p.x, 0.02 + TUCK[0] * (p.y - 0.02), p.z + TUCK[1]) for p in jaw]
    for name, bone_name, levels in (('coif', 'head', rings[:COIF_PARTS + 1]),
                                    ('coif-cape', 'spine', [tucked] + rings[COIF_PARTS + 1:])):
        verts, faces, _ = loft(levels)
        with bone(bone_name):
            part(name, verts, faces, M['iron'], inside=lambda c: V(0, 0.02, min(c.z, 0.85)))


# The helm: a gold crown round the brow of an iron cap. Profile rings: z, radius and material of the
# band above (0 iron, 1 gold).
HELM = [
    (0.93, 0.192, 1),  # the crown's foot
    (0.995, 0.2, 0),  # its upper edge, flared a little
    (1.0, 0.17, 0),  # the ledge inside it
    (1.072, 0.15, 0),  # the dome
    (1.122, 0.088, 0),
]
HELM_TOP = 1.152
HELM_Y = 0.015
TINES = [0.1, 0.072]  # the height of the crown's tines above its edge, taller and shorter in turn


def helm():
    with bone('head'):
        crown()


def crown():
    rings = [ellipse(0, HELM_Y, z, r, r * 0.97, 8, 22.5) for z, r, _ in HELM]
    verts, faces, bands = loft(rings)
    face_mats = [HELM[b][2] for b in bands]
    apex, last = len(verts), (len(HELM) - 1) * 8
    verts.append(V(0, HELM_Y, HELM_TOP))
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    face_mats += [0] * 8
    part('helm', verts, faces, [M['iron'], M['gold']], face_mats, inside=lambda c: V(0, HELM_Y, c.z))

    # The crown's tines, one on each face of the band, rising from its upper edge: a ridged point,
    # closed behind.
    z0, r0 = HELM[1][0], HELM[1][1]
    apothem = r0 * math.cos(math.radians(22.5))
    for i in range(8):
        a = math.radians(45 * (i + 1))
        out = V(math.cos(a), 0.97 * math.sin(a), 0).normalized()
        side = V(-math.sin(a), math.cos(a), 0)
        foot = V(0, HELM_Y, z0 - 0.015) + apothem * out
        w = 0.05
        corners = [foot - w * side, foot + 0.012 * out, foot + w * side]
        tip = foot + 0.006 * out + V(0, 0, TINES[i % 2])
        verts = corners + [tip]
        part(f'tine-{i}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['gold'], inside=foot - 0.02 * out)


# The two locks hang from his chin on a bone of their own (beard_root, where they part).
BEARD_ROOT, BEARD_TIP = V(0, -0.27, 0.72), V(0, -0.28, 0.37)


def beard():
    with bone('head'):
        chin()
    with bone('beard'):
        forks()
    with bone('head'):
        moustache()
    joint('beard_root', BEARD_ROOT)
    joint('beard_tip', BEARD_TIP)


def chin():
    # The beard from the cheeks down over the chin, then forked into two locks.
    half = [  # (x, y, z) of the right-side back, the lock's ridge, the valley; then the centre
        [(-0.158, -0.035, 0.94), (-0.146, -0.112, 0.882), (-0.078, -0.157, 0.851), (0.0, -0.17, 0.845)],
        [(-0.178, -0.07, 0.80), (-0.166, -0.212, 0.772), (-0.08, -0.238, 0.765), (0.0, -0.262, 0.762)],
        [(-0.142, -0.17, 0.675), (-0.126, -0.262, 0.668), (-0.066, -0.292, 0.662), (0.0, -0.262, 0.69)],
    ]
    rings = []
    for level in half:
        right = [V(*p) for p in level]
        left = [V(-p.x, p.y, p.z) for p in reversed(right[:-1])]
        rings.append(right + left)
    verts, faces, _ = loft(rings, closed=False)
    part('beard', verts, faces, M['beard'], inside=lambda c: V(0, -0.05, c.z))


def forks():
    # The two locks, splayed a little, ending in points below their clasps.
    for s in (-1, 1):
        points = [V(s * 0.072, -0.262, 0.73), V(s * 0.088, -0.29, 0.6), V(s * 0.1, -0.29, 0.47)]
        bent_tube(f'fork-{s}', points, [(0.068, 0.042), (0.058, 0.038), (0.042, 0.03)], M['beard'], n=5,
                  phase=90, end=V(s * 0.108, -0.278, 0.37))
        clasp = [V(s * 0.097, -0.29, 0.5), V(s * 0.1, -0.29, 0.455)]
        bent_tube(f'clasp-{s}', clasp, [(0.05, 0.036), (0.048, 0.034)], M['trim'], n=5, phase=90)


def moustache():
    # A moustache in two sweeps from under the nose down into the locks.
    for s in (-1, 1):
        root = [V(s * 0.01, -0.178, 0.878), V(s * 0.01, -0.21, 0.86), V(s * 0.01, -0.175, 0.846)]
        mid = [V(s * 0.068, -0.195, 0.858), V(s * 0.068, -0.235, 0.838), V(s * 0.068, -0.195, 0.822)]
        tip = V(s * 0.11, -0.25, 0.745)
        verts, faces, _ = loft([root, mid])
        verts.append(tip)
        faces += [(3, 4, 6), (4, 5, 6), (5, 3, 6)]
        part(f'moustache-{s}', verts, faces, M['beard'], inside=V(s * 0.06, -0.17, 0.84))


# Shield, slung on his back -------------------------------------------------------------------------

SHIELD_CENTRE = V(0.0, 0.275, 0.665)
# Built facing -Y, turned to face back, upright against the hood of mail and his back.
SHIELD_TURN = Matrix.Rotation(math.radians(180), 3, 'Z')


def shield():
    # As Gimli's, a profile turned round the axis from the rim to the boss, but without the back of
    # the rim, which faces his back.
    n = 10
    profile = [  # radius, y
        (0.29, 0.0),  # outer edge
        (0.282, -0.036),  # crest of the rim
        (0.254, -0.024),  # inner edge of the rim, where the face starts
        (0.09, -0.046),  # foot of the boss
        (0.066, -0.094),  # shoulder of the boss
    ]
    band_mats = [1, 1, 0, 1]  # team, trim

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
    if newell([verts[i] for i in faces[-2]]).y > 0:  # the boss's tip must face outwards
        faces = [tuple(reversed(f)) for f in faces]
    verts = [SHIELD_CENTRE + SHIELD_TURN @ v for v in verts]
    with bone('spine'):
        part('shield', verts, faces, [M['team'], M['trim'], M['wood']], face_mats)


# Mattock, held across his body in both hands, ready to slam ----------------------------------------

R_SHOULDER, R_ELBOW = V(-0.30, 0.02, 0.64), V(-0.37, -0.05, 0.45)
L_SHOULDER, L_ELBOW = V(0.30, 0.02, 0.64), V(0.40, -0.10, 0.55)
R_FIST = V(-0.17, -0.33, 0.40)  # low, at his right hip
HAFT = V(math.cos(math.radians(40)), -0.03, math.sin(math.radians(40))).normalized()  # up to his left
L_GRIP = 0.5  # how far up the haft from his right fist his left fist is
HEAD_AT = 0.9  # and the head
BUTT_AT = -0.2
HEAD_TURN = -10  # degrees the head is turned about the haft from square across his front


def arm(side, shoulder, elbow, fist, grip):
    s = side[0]
    with bone(f'upper_arm_{s}'):
        # Closed past the elbow, so its hollow doesn't show as the elbow folds to drive the haft down.
        bent_tube(f'sleeve-{side}', [shoulder, shoulder.lerp(elbow, 1.12)], [0.104, 0.084], M['mail'], end='cap')
    ahead = fist - elbow
    along = Vector(grip).normalized()
    ahead_flat = (ahead - ahead.dot(along) * along).normalized()
    wrist = fist - 0.05 * ahead.normalized()
    forearm = [(-0.2, 0.072), (0.3, 0.09), (1.0, 0.08)]
    with bone(f'forearm_{s}'):
        tube(f'forearm-{side}', elbow, wrist, forearm, [M['mail'], M['leather']], [0, 1])
    with bone(f'hand_{s}'):
        box(f'fist-{side}', fist, [ahead_flat, along, ahead_flat.cross(along)], (0.056, 0.06, 0.062), M['skin'],
            0.88)
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', fist)


def mattock():
    with bone('hand_r'):
        head = mattock_parts()
    arm('right', R_SHOULDER, R_ELBOW, R_FIST, HAFT)
    arm('left', L_SHOULDER, L_ELBOW, R_FIST + L_GRIP * HAFT, HAFT)
    # Held by the right fist, low on the haft, up it to the head, the blade outwards: the left fist
    # holds it further up, and keeps hold of it (clips.both_hands()).
    centre, out = head
    hold('r', R_FIST, centre, centre + 0.1 * out)


def mattock_parts():
    along = HAFT
    butt, top = R_FIST + BUTT_AT * along, R_FIST + (HEAD_AT + 0.08) * along
    tube('haft', butt, top, [(0, 0.032), (1, 0.029)], M['wood'])
    tube('butt', butt - 0.035 * along, butt + 0.05 * along, [(0, 0.042), (1, 0.038)], M['trim'], n=6)

    # The head, square across the haft in the plane of his front, its blade turned a little forward
    # (HEAD_TURN): a broad blade out and down to his left, a heavy hammer up towards his head, which
    # read from the front and from behind.
    centre = R_FIST + HEAD_AT * along
    out = V(0, 1, 0).cross(along).normalized()
    out = (Matrix.Rotation(math.radians(HEAD_TURN), 3, along) @ out).normalized()
    depth = along.cross(out)
    block('socket', centre - 0.085 * along, centre + 0.085 * along, out, depth,
          (0.055, 0.052), (0.055, 0.052), M['trim'])
    block('blade', centre + 0.045 * out, centre + 0.27 * out, along, depth,
          (0.06, 0.042), (0.125, 0.01), M['steel'])
    block('hammer', centre - 0.045 * out, centre - 0.2 * out, along, depth,
          (0.062, 0.062), (0.072, 0.072), M['steel'])
    return centre, out


# His clips (../clips.py): Gimli's stance and heavy run, the mattock in both hands; a two-handed blow
# heaved up on his left and, for his cast, a greater one slammed into the ground, both kept before
# his beard and clear of his helm (`beard`); kept in his hex by fit(), his left hand kept on the haft
# by both_hands() and his beard hanging from his chin.
CLIPS = hanging(both_hands(fit({
    'idle': ('ready', {}),
    'move': ('run', {'heavy': 1.0}),
    'attack': ('smite', {'beard': True}),
    'cast': ('slam', {'beard': True}),
    'stun': ('dazed', {'low': 1.0}),
    'death': ('knees', {'dropped': True}),
    'victory': ('raise', {'out': 0.45, 'lean': 20.0}),
}, between=True)))


def build(sword=None):
    """Makes him in a fresh scene, every part bound to its bone and his joints marked, and returns
    the rig to finish() him with. His 2★ model (dain-2.py) passes its sword as `sword`, a function
    that makes it behind his left hip, on his belt, before he leans."""
    reset()
    make_materials()
    legs()
    lower = set(bpy.context.scene.objects)
    torso()
    head()
    coif()
    helm()
    beard()
    shield()
    mattock()
    if sword is not None:
        sword()
    lean([o for o in bpy.context.scene.objects if o not in lower], V(0, 0, 0.33), LEAN)
    return Rig(bones={'beard': ('head', 'beard_root', 'beard_tip')}, clips=CLIPS)


def main():
    finish('dain', budget=800, rig=build())


if __name__ == '__main__':
    main()
