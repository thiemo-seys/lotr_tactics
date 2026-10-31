"""Faramir, Gondor, Archer: Boromir's brother, Captain of the Rangers of Ithilien.

Built in the Faceted style of the reference, Gimli (gimli.py, docs/viewer-spec.md section 4), in the
family of Aragorn (aragorn.py), who sets the look of Gondor: every form is a low-segment shape or a
hand-placed set of vertices, shaded flat. A Man of heroic proportions, 1.42 to the top of his hood,
dressed as the books dress the Rangers of Ithilien: green and brown of varied hues, green gauntlets,
and the face hooded and masked with green but for the eyes, which are grey under dark brows. He
draws a great bow to the full for his heavy shot, aimed a little upward and to his left, so the bow
shows its curve to the game's camera from behind and in front, and long arrows stand out of the
quiver on his back. The team colour is his hooded cloak, the hood up.

    blender --background --factory-startup --python-exit-code 1 --python faramir.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
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
    STEEL,
    V,
    bent_tube,
    box,
    finish,
    frame,
    loft,
    material,
    nearest_on_polyline,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    tube,
    turn,
)

# Faramir's own colours (sRGB); the rest come from the kit.
SKIN = 0xD4A07E
TUNIC = 0x4F5C3C  # moss green: the sleeves and the skirt of his tunic
BUCKSKIN = 0x6B5540  # brown: his jerkin and breeches
MASK = 0x6F7D52  # the green mask over his face, lighter than the tunic so it reads as cloth
GAUNTLET = 0x5C6B44  # green gauntlets
BOW = 0xAD8656  # the great bow, of pale yew, so it reads against the board
FEATHER = 0xC6CEA0  # the long green-feathered arrows of the Rangers, pale so they read, and the string

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        tunic=material('tunic', TUNIC, roughness=0.9),
        buckskin=material('buckskin', BUCKSKIN, roughness=0.88),
        mask=material('mask', MASK, roughness=0.9),
        gauntlet=material('gauntlet', GAUNTLET, roughness=0.8),
        boots=material('boots', BOOTS, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        wood=material('wood', BOW, roughness=0.7),
        feather=material('feather', FEATHER, roughness=0.9),
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        eyes=material('eyes', EYES, roughness=0.6),
    )


# Pose ------------------------------------------------------------------------------------------
#
# An archer's stance at full draw. The arrow points AIM_YAW degrees to his left and ELEVATION degrees
# up rather than straight ahead: a bow drawn straight at the target is edge-on to the game's camera,
# from behind and in front, and reads as a stick. Turned and canted like this it shows its curve from
# both sides, a little more from behind, where the player sees his own units.

HIPS_YAW = -14  # degrees his hips turn to his right
TORSO_YAW = -22  # and his shoulders, the bow shoulder towards the shot
HEAD_YAW = 36  # degrees his head turns to his left, to look along the arrow
AIM_YAW = 52  # degrees to his left of straight ahead that the arrow points
ELEVATION = 12  # degrees up: a heavy shot at the farthest enemy
CANT = 5  # degrees the bow's top tips towards his right
NECK = V(0, 0.01, 1.0)  # the head turns about the upright through here


def yaw(degrees):
    return Matrix.Rotation(math.radians(degrees), 3, 'Z')


def turned(point, degrees, pivot=(0, 0, 0)):
    """A point turned about the upright through `pivot`; positive turns it to his left."""
    return Vector(pivot) + yaw(degrees) @ (Vector(point) - Vector(pivot))


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


# Legs --------------------------------------------------------------------------------------------

HIP_Z = 0.66
THIGH, SHIN = 0.31, 0.3
# A wide stance across the line of the shot: the left foot forward towards it, the right back and
# turned out. Each: the hip joint (in the hips' frame), the ankle and the foot's yaw.
LEGS = {
    'right': (V(-0.088, 0.0, HIP_Z), V(-0.15, 0.125, 0.09), -40),
    'left': (V(0.088, 0.0, HIP_Z), V(0.165, -0.12, 0.09), 18),
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
        hip = turned(hip, HIPS_YAW)
        ahead = turned(V(0, -1, 0), foot_yaw)
        knee = bend(hip, ankle, THIGH, SHIN, (hip + ankle) / 2 + 0.3 * ahead)
        # Breeches to the knee, then a ranger's high boot, as Aragorn's, with a turned-down cuff of
        # paler leather.
        shin = knee.lerp(ankle, 0.14)
        bent_tube(f'leg-{side}', [hip + V(0, 0, 0.05), knee, shin, ankle], [0.096, 0.074, 0.072, 0.062],
                  [M['buckskin'], M['boots']], band_mats=[0, 0, 1])
        tube(f'cuff-{side}', knee.lerp(ankle, 0.1), knee.lerp(ankle, 0.27), [(0, 0.078), (1, 0.088)],
             M['leather'])
        boot(f'boot-{side}', ankle, foot_yaw)


# Body, in the torso's frame: facing -Y, turned into the pose by TORSO_YAW ---------------------------

# The tunic and the jerkin over it as a barrel of octagons: z, half-width, half-depth and centre y.
# The belt is the band between the third and fourth rings; the tunic's skirt flares below it.
TORSO = [
    (0.47, 0.214, 0.184, 0.0),  # the tunic's hem, flared over the thighs
    (0.64, 0.186, 0.146, 0.0),  # hips
    (0.695, 0.176, 0.134, -0.004),  # belt, lower edge
    (0.755, 0.18, 0.136, -0.004),  # belt, upper edge
    (0.88, 0.236, 0.16, -0.01),  # chest
    (0.97, 0.232, 0.14, 0.0),  # shoulders
    (0.995, 0.074, 0.07, 0.01),  # neck, inside the hood
]
TORSO_BANDS = [0, 0, 1, 2, 2, 2]  # the tunic, the belt, the jerkin
OCTAGON = [math.radians(22.5 + 45 * i) for i in range(8)]


def torso():
    rings = [[V(rx * math.cos(a), cy + ry * math.sin(a), z) for a in OCTAGON] for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    part('torso', verts, faces, [M['tunic'], M['leather'], M['buckskin']], [TORSO_BANDS[b] for b in bands],
         inside=lambda c: V(0, 0, c.z))
    # The belt buckle, its face smaller than its back so the edges read as a bevel.
    axes = [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1)]
    box('buckle', V(0, -0.14, 0.725), axes, (0.014, 0.03, 0.028), M['steel'], 0.75)


def torso_point(degrees, z, out=0.0):
    """The point on the torso's surface at `degrees` from +X and height z, pushed out by `out`."""
    for (z0, rx0, ry0, cy0), (z1, rx1, ry1, cy1) in pairwise(TORSO):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            rx, ry, cy = rx0 + t * (rx1 - rx0), ry0 + t * (ry1 - ry0), cy0 + t * (cy1 - cy0)
            a = math.radians(degrees)
            normal = V(math.cos(a) / rx, math.sin(a) / ry, 0).normalized()
            return V(rx * math.cos(a), cy + ry * math.sin(a), z) + out * normal
    raise ValueError(f'no torso at {z}')


def baldric():
    # The quiver's strap: from his right shoulder across his chest to his left hip.
    path = [(202.5, 0.95), (247.5, 0.915), (292.5, 0.84), (337.5, 0.775), (22.5, 0.74)]
    rows = [[torso_point(a, z + dz, 0.008) for a, z in path] for dz in (-0.028, 0.028)]
    verts, faces, _ = loft(rows, closed=False)
    part('baldric', verts, faces, M['leather'], inside=lambda c: V(0, 0, c.z))


# Team colour: the hooded cloak --------------------------------------------------------------------

# The cloak from the collar down, open at the front: z at the front and at the back, half-width,
# half-depth, centre y, how deep its folds stand out and half the opening (degrees).
CLOAK = [
    (1.03, 1.085, 0.172, 0.165, 0.014, 0.0, 26),  # the collar, standing round the foot of the hood
    (0.935, 0.96, 0.29, 0.195, 0.012, 0.0, 34),  # over the shoulders
    (0.8, 0.68, 0.322, 0.228, 0.026, 0.03, 40),  # the hem, falling to his belt at the back
]
N_CLOAK = 13  # points round, from the left edge of the opening round the back to the right


def cloak_ring(front, back, rx, ry, cy, fold, opening):
    ring = []
    for i in range(N_CLOAK):
        a = math.radians(-90 + opening + (360 - 2 * opening) * i / (N_CLOAK - 1))
        z = front + (back - front) * (1 + math.sin(a)) / 2
        k = 1 + (fold / ry if i % 2 else 0)
        ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
    return ring


def cloak():
    rings = [cloak_ring(*level) for level in CLOAK]
    verts, faces, _ = loft(rings, closed=False)
    part('cloak', verts, faces, M['team'], inside=lambda c: V(0, 0.02, c.z))


# The quiver lies on his back over the cloak, from its hem by his left hip to behind his right
# shoulder, the feathers standing up behind his hood.
QUIVER_FOOT, QUIVER_TOP = V(0.11, 0.282, 0.68), V(-0.1, 0.232, 1.18)


def quiver():
    foot, top = QUIVER_FOOT, QUIVER_TOP
    along = (top - foot).normalized()
    tube('quiver', foot, top, [(0, 0.062), (1, 0.074)], M['leather'], n=6)
    ring = segment(foot, top, [(0, 0.062)], 6)[0]
    verts = ring + [foot - 0.04 * along]
    part('quiver-foot', verts, [(i, (i + 1) % 6, 6) for i in range(6)], M['leather'], inside=foot)
    rim = segment(top - 0.05 * along, top + 0.01 * along, [(0, 0.085), (1, 0.085)], 6)
    verts, faces, _ = loft(rim)
    faces.append(tuple(range(6, 12)))
    part('quiver-rim', verts, faces, M['boots'], inside=top - 0.02 * along)
    # The fletching of the long green-feathered arrows standing out of the mouth, each two crossed vanes.
    across, other = frame(along)
    for k, (du, dv, tilt) in enumerate([(0.032, 0.0, 0.16), (-0.028, 0.022, -0.13), (-0.01, -0.034, -0.03),
                                        (0.014, 0.036, 0.07), (0.0, 0.0, 0.0)]):
        base = top + du * across + dv * other
        up = (along + tilt * across + 0.5 * tilt * other).normalized()
        fletching(f'fletching-{k}', base, up, 0.18, 0.034)


def fletching(name, base, up, length, width):
    """Two crossed vanes of feather from `base` along `up`."""
    a, b = frame(up)
    verts, faces = [], []
    for w in (a, b):
        n = len(verts)
        middle = base + 0.35 * length * up
        verts += [base, middle + width * w, base + length * up, middle - width * w]
        faces.append((n, n + 1, n + 2, n + 3))
    part(name, verts, faces, M['feather'])


# Head, in its own frame: facing -Y, turned by HEAD_YAW about NECK ---------------------------------

# The face, a shallow pyramid of planes inside the hood's opening: the right half's corners (x < 0),
# mirrored, and the points down the middle. Skin from the brow to the cheekbones, round the eyes; the
# green mask over the nose and everything below.
BROW_TOP = V(0, -0.12, 1.335)  # the forehead, under the hood's brim
TEMPLE = V(-0.112, -0.09, 1.31)
NOSE_ROOT = V(0, -0.132, 1.262)
EYE_OUT = V(-0.122, -0.08, 1.232)  # beside the eye
CHEEKBONE = V(-0.07, -0.13, 1.208)  # where the mask's upper edge crosses the cheek
BRIDGE = V(0, -0.154, 1.212)  # the mask's upper edge on the bridge of the nose
NOSE_TIP = V(0, -0.176, 1.165)
JAW = V(-0.112, -0.066, 1.1)
MOUTH = V(-0.058, -0.142, 1.1)
CHIN = V(0, -0.15, 1.058)


def mirror(p):
    return V(-p.x, p.y, p.z)


def face():
    verts = [BROW_TOP, NOSE_ROOT, BRIDGE, NOSE_TIP, CHIN]
    faces, face_mats, sockets = [], [], {}
    for s, side in ((-1, lambda p: p), (1, mirror)):
        t, e, c, j, m = range(len(verts), len(verts) + 5)
        verts += [side(p) for p in (TEMPLE, EYE_OUT, CHEEKBONE, JAW, MOUTH)]
        # Skin round the eye, from the brow down to the mask's edge.
        faces += [(0, t, 1), (1, t, e), (1, e, c), (1, c, 2)]
        face_mats += [0] * 4
        # The mask over the nose, the cheek, the mouth and the jaw.
        faces += [(2, c, 3), (c, m, 3), (c, j, m), (c, e, j), (3, m, 4), (m, j, 4)]
        face_mats += [1] * 6
        sockets[s] = [(verts[0], verts[t], verts[1]), (verts[1], verts[t], verts[e]), (verts[1], verts[e], verts[c])]
    part('face', verts, faces, [M['skin'], M['mask']], face_mats, inside=V(0, 0.0, 1.2))

    # Grey eyes, drawn dark so they read at the game's size, laid just proud of the face.
    for s in (-1, 1):
        corners = [(s * 0.022, 1.252), (s * 0.094, 1.248), (s * 0.06, 1.226)]
        verts = [V(x, on_surface(sockets[s], x, z) - 0.006, z) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

        # A dark brow over each eye, its inner end lower: grave rather than fierce. His dark hair is
        # under the hood, so the brows take the eyes' near-black, as Aragorn's mouth does.
        ends = []
        for x, z in ((s * 0.018, 1.27), (s * 0.104, 1.284)):
            y = on_surface(sockets[s], x, z)
            ends.append([V(x, y - 0.004, z + 0.012), V(x, y - 0.018, z), V(x, y - 0.004, z - 0.008)])
        verts, faces, _ = loft(ends)
        faces += [(0, 1, 2), (3, 4, 5)]
        part(f'brow-{s}', verts, faces, M['eyes'], inside=V(s * 0.06, -0.08, 1.27))


# The hood, as rings from the rim of its opening back over the head: the left half of each, (x, y, z)
# of the top, the upper corner, the upper side, the side, the lower side and the bottom, mirrored to
# the right. The rim is the band between the first two rings; the hood rises over the crown and comes
# to a point falling back behind the head.
HOOD = [
    [(0, -0.155, 1.34), (0.08, -0.143, 1.322), (0.122, -0.116, 1.262), (0.13, -0.1, 1.165),
     (0.096, -0.12, 1.075), (0, -0.14, 1.04)],  # the opening
    [(0, -0.162, 1.388), (0.112, -0.143, 1.36), (0.168, -0.1, 1.275), (0.176, -0.08, 1.16),
     (0.138, -0.1, 1.05), (0, -0.122, 1.0)],  # the rim's outer edge
    [(0, -0.07, 1.43), (0.124, -0.045, 1.403), (0.178, -0.008, 1.3), (0.18, 0.008, 1.16),
     (0.155, -0.008, 1.04), (0, -0.04, 0.99)],  # over the crown
    [(0, 0.07, 1.42), (0.112, 0.084, 1.382), (0.161, 0.106, 1.29), (0.165, 0.114, 1.15),
     (0.14, 0.106, 1.03), (0, 0.095, 0.98)],  # behind the head
]
HOOD_POINT = V(0, 0.212, 1.38)  # the hood's soft point at the back of the crown


def hood():
    rings = []
    for half in HOOD:
        left = [V(*p) for p in half]
        right = [mirror(p) for p in reversed(left[1:-1])]
        rings.append(left + right)
    n = len(rings[0])
    verts, faces, _ = loft(rings)
    last = (len(rings) - 1) * n
    verts.append(HOOD_POINT)
    faces += [(last + i, last + (i + 1) % n, len(verts) - 1) for i in range(n)]
    part('hood', verts, faces, M['team'], inside=V(0, 0.0, 1.2))


# Arms, the bow and the arrow, placed in the pose ----------------------------------------------------

SHOULDER = V(0.218, 0.015, 0.955)  # his left shoulder joint in the torso's frame; the right mirrors it
UPPER_ARM, FOREARM = 0.28, 0.27
DRAW = 0.6  # from the nock, drawn to his cheek, to the grip
REST = 0.04  # the arrow lies this far above the middle of the grip

AIM = V(math.sin(math.radians(AIM_YAW)) * math.cos(math.radians(ELEVATION)),
        -math.cos(math.radians(AIM_YAW)) * math.cos(math.radians(ELEVATION)),
        math.sin(math.radians(ELEVATION)))
RIGHT_OF_AIM = V(-math.cos(math.radians(AIM_YAW)), -math.sin(math.radians(AIM_YAW)), 0)
_UP = (V(0, 0, 1) - AIM.z * AIM).normalized()
BOW_UP = math.cos(math.radians(CANT)) * _UP + math.sin(math.radians(CANT)) * RIGHT_OF_AIM
NOCK = turned(V(-0.11, -0.1, 1.15), HEAD_YAW, NECK)  # by his right cheek
GRIP = NOCK + DRAW * AIM - REST * BOW_UP

# The stave from the bottom tip to the top: (along the stave, back towards him, half-thickness).
# Drawn to the full, its limbs bend well back towards him.
STAVE = [
    (-0.76, 0.315, 0.0),
    (-0.67, 0.255, 0.028),
    (-0.56, 0.19, 0.033),
    (-0.42, 0.115, 0.037),
    (-0.27, 0.05, 0.04),
    (-0.1, 0.012, 0.043),
    (0.1, 0.012, 0.043),
    (0.27, 0.05, 0.04),
    (0.42, 0.115, 0.037),
    (0.56, 0.19, 0.033),
    (0.67, 0.255, 0.028),
    (0.76, 0.315, 0.0),
]
STAVE_BANDS = [0, 0, 0, 0, 1, 0, 0, 0, 0]  # wood, the grip wrapped in leather


def bow():
    side = AIM.cross(BOW_UP).normalized()  # across the bow's plane
    centres = [GRIP + u * BOW_UP - w * AIM for u, w, _ in STAVE]
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
    part('bow', verts, faces, [M['wood'], M['leather']], face_mats, inside=nearest_on_polyline(centres))

    # The string, from tip to tip by way of the arrow's nock.
    top, bottom = centres[-1] - 0.03 * BOW_UP, centres[0] + 0.03 * BOW_UP
    for name, a, b in (('string-top', NOCK, top), ('string-bottom', NOCK, bottom)):
        tube(name, a, b, [(0, 0.008), (1, 0.008)], M['feather'], n=3)

    # The arrow: a long shaft from the nock past the grip and a broad steel head for a heavy shot.
    point = GRIP + REST * BOW_UP + 0.1 * AIM
    tube('arrow', NOCK - 0.02 * AIM, point, [(0, 0.01), (1, 0.01)], M['wood'], n=3)
    ring = [point + 0.03 * side, point + 0.01 * BOW_UP, point - 0.03 * side, point - 0.01 * BOW_UP]
    tip = point + 0.08 * AIM
    verts = ring + [tip]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(3, 2, 1, 0)]
    part('arrowhead', verts, faces, M['steel'], inside=point + 0.02 * AIM)


def arm(side, shoulder, elbow, wrist):
    """A green sleeve from the shoulder to the elbow, and the forearm in a green gauntlet."""
    cuff = elbow.lerp(wrist, 0.35)
    bent_tube(f'arm-{side}', [shoulder, elbow, cuff, wrist], [0.074, 0.06, 0.07, 0.052],
              [M['tunic'], M['gauntlet']], band_mats=[0, 0, 1])


def arms():
    left_shoulder = turned(SHOULDER, TORSO_YAW)
    right_shoulder = turned(V(-SHOULDER.x, SHOULDER.y, SHOULDER.z), TORSO_YAW)

    # The bow arm, held out nearly straight towards the shot, the elbow turned down and out.
    fist = GRIP
    reach = (fist - left_shoulder).normalized()
    wrist = fist - 0.05 * reach
    elbow = bend(left_shoulder, wrist, UPPER_ARM, FOREARM, (left_shoulder + wrist) / 2 + V(0.1, 0.05, -0.3))
    arm('left', left_shoulder, elbow, wrist)
    up = (BOW_UP - BOW_UP.dot(reach) * reach).normalized()
    box('fist-left', fist, [reach, up, reach.cross(up)], (0.05, 0.056, 0.046), M['gauntlet'], 0.85)

    # The drawing arm, the elbow up and back behind him, the fingers hooked round the string.
    fist = NOCK - 0.016 * AIM - 0.014 * BOW_UP
    wrist = fist - 0.06 * AIM + V(-0.02, 0.02, -0.01)
    pole = right_shoulder - 0.4 * AIM + V(-0.1, 0.0, 0.45)
    elbow = bend(right_shoulder, wrist, UPPER_ARM, FOREARM, pole)
    arm('right', right_shoulder, elbow, wrist)
    ahead = (fist - wrist).normalized()
    up = (V(0, 0, 1) - ahead.z * ahead).normalized()
    box('fist-right', fist, [ahead, up, ahead.cross(up)], (0.046, 0.05, 0.044), M['gauntlet'], 0.85)


def main():
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    baldric()
    cloak()
    quiver()
    turn(new_objects(before), V(0, 0, 0), TORSO_YAW)
    before = set(bpy.context.scene.objects)
    face()
    hood()
    turn(new_objects(before), NECK, HEAD_YAW)
    arms()
    bow()
    finish('faramir')


main()
