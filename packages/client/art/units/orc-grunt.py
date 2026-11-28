"""An Orc grunt: the summon of the Orc trait and Gothmog's ability (packages/sim/src/data/units.ts,
SUMMONS), in the Faceted style (docs/viewer-spec.md section 4).

A plain Orc of Mordor, of Gorbag's family (gorbag.py sets the Orcs' look) but a little smaller and
plainer: about 1.1 to the top of its helm as it stoops, squat and broad, with long arms, bowed legs and
its head thrust forward on a bull neck. A jutting, tusked jaw, a flat nose and big pointed ears under a
crude iron cap with a nose-guard; sallow, olive-grey skin, a dark leather jerkin and heavy boots. It
carries a crude axe, a broad, notched blade on a short haft, and its other fist hangs empty and ready.

Its livery, the Orcs' colour (packages/client/src/livery.json), is its ragged cowl over its shoulders and
hump and its tabard's flaps before and behind, so it shows from in front, behind and above; the tabard's
front bears the Red Eye of Mordor. Its fittings, the belt buckle and the band round the axe's haft, use
`trim`, which the client colours iron at 1★, the only star level a summon has.

It is rigged as the Orcs are (gorbag.py, ../README.md, Monsters and summons): every part is bound to the
bone it moves with, the stoop is in the rest pose, and its legs bend at the knee where the thigh and shin
meet, its arms at the elbow and its body at the belt. It has no ability, so it never casts and has six
clips, without `cast` (../rig.py, Timing.wanted()). The client draws it at its own size, as it does
every model, not as a small pawn.

The body is built in the measure of Gorbag's and shrunk to the grunt's size at the end (SCALE), joints
and all, so the clips are made for the grunt as it stands.

    blender --background --factory-startup --python-exit-code 1 --python orc-grunt.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its right hand is at -X.
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
    LEATHER,
    WOOD,
    V,
    bone,
    box,
    cone,
    ellipse,
    finish,
    loft,
    material,
    on_surface,
    part,
    reset,
    team_material,
    trim_material,
    tube,
    wind,
)
from clips import fit  # noqa: E402
from rig import Rig, hold, joint  # noqa: E402

# The grunt's own colours (sRGB); the rest come from the kit.
SKIN = 0x75705F  # sallow and grey, greyer than Gorbag's, so the Orcs' olive livery stands out from it
IRON = 0x5D6166  # crude, blackened iron
EDGE = 0x8E9296  # the axe's ground edge, a little brighter, so it shows
JERKIN = 0x3E342C  # dark, greasy leather
BONE = 0xD5CAA8  # its tusks
GLARE = 0xB49A4C  # dull yellow eyes, which show on its face
RED = 0x9A2A1E  # the Red Eye of Mordor
PUPIL = 0x1E1612

M = {}  # materials by name, made once the scene is reset

SCALE = 0.92  # the grunt's size, from the measure of Gorbag's in which it is built


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        jerkin=material('jerkin', JERKIN, roughness=0.85),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        cloth=material('cloth', CLOTH, roughness=0.9),
        iron=material('iron', IRON, roughness=0.6, metallic=0.1),
        edge=material('edge', EDGE, roughness=0.45, metallic=0.1),
        wood=material('wood', WOOD, roughness=0.85),
        bone=material('bone', BONE, roughness=0.7),
        eyes=material('eyes', GLARE, roughness=0.6),
        paint=material('paint', RED, roughness=0.8),
        pupils=material('pupils', PUPIL, roughness=0.6),
        trim=trim_material(),  # fittings, recoloured by star
    )


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


# The stoop, as Gorbag's but square to its hips ---------------------------------------------------------

PIVOT = V(0, 0.03, 0.46)  # the hips
LEAN = 14  # degrees the body above the hips leans forward
MID = V(0, 0.04, 0.6)  # the small of the back
CURL = 24  # further degrees the shoulders curl forward over it
CURL_SPAN = 0.22  # the height over which the curl comes in


def hunched(p):
    """Where a point of the upright body is once it stoops."""
    p = Vector(p)
    t = min(max((p.z - MID.z) / CURL_SPAN, 0.0), 1.0)
    if t > 0:
        p = MID + Matrix.Rotation(math.radians(CURL * t), 3, 'X') @ (p - MID)
    return PIVOT + Matrix.Rotation(math.radians(LEAN), 3, 'X') @ (p - PIVOT)


def hunch(objects):
    for obj in objects:
        for v in obj.data.vertices:
            v.co = hunched(v.co)


def shrink(objects):
    """Shrinks the grunt, built in Gorbag's measure, to its own size about the origin on the ground."""
    for obj in objects:
        for v in obj.data.vertices:
            v.co = SCALE * v.co


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


# Legs: bowed, the knees out and bent, the left foot forward and the right braced behind ---------------

R_HIP, R_KNEE, R_ANKLE, R_YAW = V(-0.1, 0.06, 0.47), V(-0.225, 0.0, 0.27), V(-0.19, 0.1, 0.1), -24
L_HIP, L_KNEE, L_ANKLE, L_YAW = V(0.1, 0.0, 0.47), V(0.225, -0.11, 0.28), V(0.18, -0.07, 0.1), 16

# Crude boots from the sole up, in the foot's own frame (toes towards -y), as Gorbag's: the height of
# each ring and the right half of it, side, heel and toe, mirrored by boot().
BOOT_RINGS = [
    (0.0, [(0.085, -0.02), (0.072, 0.085), (0.056, -0.16)]),  # the sole
    (0.06, [(0.085, -0.01), (0.074, 0.08), (0.048, -0.12)]),  # the toe rises to a blunt point
    (0.15, [(0.072, 0.0), (0.064, 0.07), (0.054, -0.05)]),  # round the ankle
]


def boot(name, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + turn @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    faces.append(tuple(range(6)))  # the sole
    part(name, verts, faces, M['boots'], inside=at + V(0, 0, 0.07))


def legs():
    for side, hip, knee, ankle, yaw in (('right', R_HIP, R_KNEE, R_ANKLE, R_YAW),
                                        ('left', L_HIP, L_KNEE, L_ANKLE, L_YAW)):
        s = side[0]
        # The thigh and the shin already overlap at the knee, so the knee bends without a gap.
        with bone(f'thigh_{s}'):
            tube(f'thigh-{side}', hip, knee, [(-0.1, 0.088), (1.1, 0.07)], M['cloth'])
        with bone(f'shin_{s}'):
            tube(f'shin-{side}', knee, ankle, [(-0.1, 0.062), (1.3, 0.055)], M['skin'])
        with bone(f'foot_{s}'):
            boot(f'boot-{side}', ankle, yaw)
        joint(f'hip_{s}', hip)
        joint(f'knee_{s}', knee)
        joint(f'ankle_{s}', ankle)
        joint(f'toe_{s}', V(ankle.x, ankle.y, 0) + Matrix.Rotation(math.radians(yaw), 3, 'Z') @ V(0, -0.14, 0.03))


# Body --------------------------------------------------------------------------------------------

# A barrel of octagons, built upright and then hunched: z, half-width, half-depth and centre y.
TORSO = [
    (0.36, 0.165, 0.13, 0.03),  # hips
    (0.45, 0.185, 0.145, 0.03),  # belt, lower edge
    (0.53, 0.19, 0.15, 0.03),  # belt, upper edge
    (0.68, 0.245, 0.175, 0.03),  # chest
    (0.84, 0.25, 0.17, 0.05),  # shoulders
    (0.94, 0.14, 0.125, 0.01),  # neck
]
TORSO_BANDS = [0, 1, 2, 2, 2]  # breeches, belt, leather jerkin
# In two pieces, which bend at the belt: the breeches and the belt on its hips, and the jerkin on its
# spine from a ring inside the belt (the waist) up.
INSIDE_BELT = (0.49, 0.172, 0.134, 0.03)


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    mats = [M['cloth'], M['leather'], M['jerkin'], M['skin']]

    def inside(c):
        return V(0, 0.03, min(max(c.z, 0.4), 0.9))

    with bone('hips'):
        verts, faces, bands = loft(rings[:3])
        part('breeches', verts, faces, mats, [TORSO_BANDS[b] for b in bands], inside=inside)
    z, rx, ry, cy = INSIDE_BELT
    with bone('spine'):
        verts, faces, _ = loft([ellipse(0, cy, z, rx, ry, 8, 22.5)] + rings[3:])
        face_mats = [2] * len(faces)
        faces.append(tuple(range(len(verts) - 8, len(verts))))  # the top of the neck
        face_mats.append(3)
        part('jerkin', verts, faces, mats, face_mats, inside=inside)
    joint('pelvis', PIVOT)
    joint('waist', V(0, cy, z))


def cowl():
    # A ragged cowl round its neck and over its shoulders, as Gorbag's: eight points from its left (+X),
    # the collar rising behind its neck and dipping in front.
    collar_z = [0.95, 0.99, 1.01, 0.99, 0.95, 0.9, 0.88, 0.9]
    collar = ellipse(0, 0.0, 0, 0.16, 0.15, 8, 0, collar_z)
    dome = ellipse(0, 0.02, 0, 0.27, 0.205, 8, 0, [z - 0.06 for z in collar_z])
    shoulder_z = [0.84, 0.82, 0.8, 0.82, 0.84, 0.83, 0.82, 0.83]
    shoulder = ellipse(0, 0.03, 0, 0.3, 0.22, 8, 0, shoulder_z)
    hem_drop = [0.05, 0.09, 0.11, 0.09, 0.05, 0.06, 0.08, 0.06]
    hem = ellipse(0, 0.03, 0, 0.295, 0.225, 8, 0, [z - d for z, d in zip(shoulder_z, hem_drop)])
    verts, faces, _ = loft([hem, shoulder, dome, collar])
    drops = [0.08, 0.12, 0.09, 0.13, 0.08, 0.1, 0.12, 0.09]
    for i in range(8):
        a, b = hem[i], hem[(i + 1) % 8]
        mid = (a + b) / 2
        out = V(mid.x, mid.y - 0.03, 0).normalized()
        verts.append(mid + 0.012 * out - V(0, 0, drops[i]))
        faces.append((i, (i + 1) % 8, len(verts) - 1))
    part('cowl', verts, faces, M['team'], inside=lambda c: V(0, 0.03, min(c.z, 0.82) - 0.1))


# Head, under a crude iron cap -------------------------------------------------------------------------

HEAD = V(0, -0.29, 0.865)  # the middle of the underside of its jaw, placed after the stoop
HEAD_SCALE = 1.12  # the head is drawn big, as Gorbag's is, so it reads at game size

# The skull, as Gorbag's: rings from under the jaw to the temples, the height of each above HEAD, then
# the left half of it from HEAD as (x, y): the side, the back corner, the back, the front corner and
# the front.
SKULL = [
    (0.0, (0.132, -0.03), (0.08, 0.055), 0.07, (0.116, -0.158), -0.2),  # under the jaw, jutting
    (0.075, (0.15, -0.005), (0.105, 0.09), 0.115, (0.128, -0.15), -0.182),  # the mouth
    (0.165, (0.142, 0.005), (0.11, 0.105), 0.135, (0.118, -0.115), -0.152),  # cheekbones and eyes
    (0.245, (0.118, 0.015), (0.092, 0.105), 0.13, (0.088, -0.08), -0.1),  # brow and temples
]
CROWN = (0, 0.02, 0.36)  # the cap's point


def h(x, y, z):
    """A point of the head, from HEAD in the head's own (unscaled) measure."""
    return HEAD + HEAD_SCALE * V(x, y, z)


NECK = V(0, 0.065, 0.01)  # where its head turns on its bull neck, from HEAD: at the back of the jaw


def head():
    with bone('head'):
        features()
        cap()
    joint('neck', HEAD + NECK)
    joint('crown', h(*CROWN))


def features():
    rings = []
    for z, side, corner, back, front_corner, front in SKULL:
        ring = [side, corner, (0, back), (-corner[0], corner[1]), (-side[0], side[1]),
                (-front_corner[0], front_corner[1]), (0, front), front_corner]
        rings.append([h(x, y, z) for x, y in ring])
    verts, faces, _ = loft(rings)
    apex = len(verts)
    verts.append(h(0, 0.03, 0.3))
    last = 3 * 8
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    faces.append(tuple(range(8)))  # under the jaw
    part('skull', verts, faces, M['skin'], inside=h(0, -0.03, 0.14))

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

    # Slanted eyes under the cap's rim.
    for s in (-1, 1):
        corners = [on(face, x, z, 0.006) for x, z in ((s * 0.03, 0.127), (s * 0.1, 0.152), (s * 0.07, 0.114))]
        part(f'eye-{s}', corners, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A flat, broad nose, under the nose-guard.
    verts = [h(0, -0.156, 0.138), h(0, -0.218, 0.095), h(0.046, -0.165, 0.086), h(-0.046, -0.165, 0.086),
             h(0, -0.178, 0.076)]
    part('nose', verts, [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)], M['skin'], inside=h(0, -0.14, 0.1))

    # A wide mouth, turned down at the corners.
    outline = [(0.096, 0.042), (0.04, 0.066), (-0.04, 0.066), (-0.096, 0.042), (-0.04, 0.05), (0.04, 0.05)]
    verts = [on(jaw, x, z, 0.005) for x, z in outline]
    part('mouth', verts, [(0, 1, 5), (1, 2, 4, 5), (2, 3, 4)], M['pupils'], outward=V(0, -1, 0))

    # Tusks from the lower jaw, up past the lip.
    for s in (-1, 1):
        x = s * 0.085
        base = on(jaw, x, 0.03, 0.0)
        y = (base.y - HEAD.y) / HEAD_SCALE
        verts = [h(x - 0.026, y + 0.008, 0.018), h(x + 0.026, y + 0.008, 0.018), h(x, y + 0.038, 0.014),
                 h(x + s * 0.03, y - 0.045, 0.15)]
        part(f'tusk-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['bone'], inside=h(x, y + 0.01, 0.05))

    # Big pointed ears, swept back and out from under the cap.
    for s in (-1, 1):
        verts = [h(s * 0.128, -0.035, 0.1), h(s * 0.122, 0.07, 0.12), h(s * 0.125, 0.02, 0.2),
                 h(s * 0.3, 0.12, 0.25)]
        part(f'ear-{s}', verts, [(0, 2, 3), (2, 1, 3), (1, 0, 3)], M['skin'], inside=h(s * 0.1, 0.02, 0.15))


def cap():
    """A crude iron cap, pointed, its rim low on the brow, with a nose-guard down over the nose."""
    rim = ellipse(0, 0.0, 0, 0.152, 0.16, 8, 22.5)
    rim = [h(p.x, p.y, 0.205 + 0.05 * max(p.y, 0) / 0.16) for p in rim]  # dipping at the front
    middle = [h(p.x, p.y + 0.01, 0.285) for p in ellipse(0, 0, 0, 0.125, 0.13, 8, 22.5)]
    verts, faces, _ = loft([rim, middle])
    verts.append(h(*CROWN))
    faces += [(8 + i, 8 + (i + 1) % 8, 16) for i in range(8)]
    part('cap', verts, faces, M['iron'], inside=h(0, 0.0, 0.22))
    # The nose-guard, a tapering bar down from the rim at the front.
    top, foot = h(0, -0.168, 0.215), h(0, -0.21, 0.1)
    down = (foot - top).normalized()
    box('nose-guard', top.lerp(foot, 0.5), [down, V(1, 0, 0), down.cross(V(1, 0, 0))],
        (0.5 * (foot - top).length, 0.022, 0.009), M['iron'], 0.6)


# The tabard's flaps, hanging from the belt, with the Red Eye ----------------------------------------------

FLAP_TOP = V(0, -0.142, 0.47)  # the middle of the top of the front flap, tucked under the belt
FLAP_KNEE, FLAP_OUT = 0.34, 0.03  # the height where the flaps fall straight, and how far out they are there
EYE_AT = V(0, 0, 0.39)  # the middle of the Red Eye on the front flap


def flaps():
    columns = (-0.12, 0.0, 0.12)
    hems = {'front': (0.18, 0.2, 0.17), 'back': (0.22, 0.19, 0.23)}
    with bone('hips'):
        for name, sign, top_y, top_z in (('front', -1, FLAP_TOP.y, FLAP_TOP.z), ('back', 1, 0.19, 0.52)):
            top = [V(x, top_y, top_z) for x in columns]
            mid = [V(0.95 * x, top_y + sign * FLAP_OUT, FLAP_KNEE) for x in columns]
            bottom = [V(0.86 * x, top_y + sign * FLAP_OUT, z) for x, z in zip(columns, hems[name])]
            verts, faces, _ = loft([top, mid, bottom], closed=False)
            part(f'tabard-{name}', verts, faces, M['team'], outward=V(0, sign, 0))

        def on_flap(x, z, lift):
            return V(x, FLAP_TOP.y - FLAP_OUT * (FLAP_TOP.z - z) / (FLAP_TOP.z - FLAP_KNEE) - lift, z)

        # The Red Eye: a lidless lozenge, and its slit of a pupil.
        verts = [on_flap(x, EYE_AT.z + z, 0.004) for x, z in ((-0.06, 0), (0, 0.032), (0.06, 0), (0, -0.032))]
        part('red-eye', verts, [(0, 1, 2, 3)], M['paint'], outward=V(0, -1, 0))
        verts = [on_flap(x, EYE_AT.z + z, 0.007) for x, z in ((0, 0.026), (0.009, 0), (0, -0.026), (-0.009, 0))]
        part('red-eye-pupil', verts, [(0, 1, 2, 3)], M['pupils'], outward=V(0, -1, 0))
        # A crude square buckle on the front of the belt, over the top of the front flap.
        out = V(0, -1, -0.17).normalized()
        up = V(0, -0.17, 1).normalized()
        box('buckle', V(0, -0.15, 0.478), [out, V(1, 0, 0), up], (0.014, 0.034, 0.028), M['trim'], 0.75)


# The axe, held up beside its right shoulder ---------------------------------------------------------------

R_FIST = V(-0.38, -0.26, 0.66)
HAFT = V(-0.1, -0.25, 1.0).normalized()  # upright, leaning forward and out a little
BLADE_OUT = V(-0.9, -0.44, 0).normalized()  # outwards to its right, and forward
HAFT_LENGTH = 0.52  # from the fist up to the top
# The blade's outline from the haft out: (u, v), u outwards from the haft and v along it, and its
# half-thickness; a broad, notched cleaver of a blade, its edge longer than its neck.
BLADE = [
    ((0.0, 0.07), 0.016), ((0.13, 0.11), 0.004), ((0.15, 0.04), 0.004), ((0.12, 0.0), 0.004),
    ((0.14, -0.06), 0.004), ((0.0, -0.04), 0.016),
]


def axe_parts():
    grip = R_FIST
    along = HAFT
    out = (BLADE_OUT - BLADE_OUT.dot(along) * along).normalized()
    across = out.cross(along)
    tube('haft', grip - 0.12 * along, grip + HAFT_LENGTH * along, [(0, 0.024), (1, 0.022)], M['wood'], n=5)
    tube('band', grip + 0.3 * along, grip + 0.36 * along, [(0, 0.028), (1, 0.028)], M['trim'], n=5)
    eye = grip + (HAFT_LENGTH - 0.08) * along

    def at(u, v, w):
        return eye + u * out + v * along + w * across

    verts = [at(u, v, s * t) for (u, v), t in BLADE for s in (1, -1)]
    n = len(BLADE)
    front = tuple(2 * k for k in range(n))
    back = tuple(2 * k + 1 for k in range(n))
    walls = [(2 * k, 2 * ((k + 1) % n), 2 * ((k + 1) % n) + 1, 2 * k + 1) for k in range(n)]
    faces = wind(verts, [front], outward=across) + wind(verts, [back], outward=-across)
    faces += wind(verts, walls, inside=eye + 0.06 * out)
    mats = [0, 0] + [1 if 0 < k < n - 2 else 0 for k in range(n)]  # the edge, ground bright
    part('axe-head', verts, faces, [M['iron'], M['edge']], mats)
    # A spike on the back of the head.
    cone('spike', eye - 0.01 * out + 0.01 * along, eye - 0.09 * out + 0.03 * along, 0.024, M['iron'], n=4, back=None)
    return eye


def axe():
    with bone('hand_r'):
        eye = axe_parts()
    # Held by the grip, its head up the haft and its edge outwards.
    out = (BLADE_OUT - BLADE_OUT.dot(HAFT) * HAFT).normalized()
    hold('r', R_FIST, eye, eye + 0.2 * out)


# Arms ------------------------------------------------------------------------------------------------

UPPER_ARM, FOREARM = 0.27, 0.28  # long arms, as orcs have


def arm(side, shoulder, fist, pole, fist_up):
    """An arm from the shoulder to a fist at `fist`, its elbow bent towards `pole`."""
    reach = (fist - shoulder).normalized()
    wrist_at = fist - 0.05 * reach
    elbow = bend(shoulder, wrist_at, UPPER_ARM, FOREARM, pole)
    wrist = fist - 0.05 * (fist - elbow).normalized()
    s = side[0]
    # The upper arm and the forearm already overlap at the elbow, so it bends without a gap.
    with bone(f'upper_arm_{s}'):
        tube(f'upper-arm-{side}', shoulder, elbow, [(-0.1, 0.072), (1.08, 0.06)], M['skin'])
    with bone(f'forearm_{s}'):
        tube(f'forearm-{side}', elbow, wrist, [(-0.12, 0.058), (0.4, 0.066), (1.0, 0.06)],
             [M['skin'], M['leather']], [0, 1])
    ahead = (fist - elbow).normalized()
    up = (Vector(fist_up) - Vector(fist_up).dot(ahead) * ahead).normalized()
    with bone(f'hand_{s}'):
        box(f'fist-{side}', fist, [ahead, up, ahead.cross(up)], (0.048, 0.052, 0.052), M['skin'], 0.85)
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', fist)


def arms():
    left, right = hunched(V(0.225, 0.04, 0.79)), hunched(V(-0.225, 0.04, 0.79))
    # The axe arm holds it up beside its shoulder, the elbow down and out; the empty left fist hangs
    # forward and low, long-armed, the elbow out.
    arm('right', right, R_FIST, right + V(-0.2, 0.15, -0.3), HAFT)
    arm('left', left, V(0.3, -0.3, 0.46), left + V(0.25, 0.1, -0.1), V(0, -1, 0))


# Its clips (../clips.py): the Orcs' idle and run, as Gorbag's (gorbag.py): a restless low crouch,
# breathing quick, and a low, scuttling run, the empty fist swinging. It chops overhand with its axe,
# brought over the top and lifted back out past its helm and ears (`wide`, `clear`), where the
# library's chop took its fist through the back of its head; and as it wins it holds the axe up out
# from its shoulder (`out`). It has no ability, so it has no cast.
CLIPS = fit({
    'idle': ('ready', {'seconds': 2.0, 'crouch': 0.06}),
    'move': ('run', {'seconds': 0.43, 'heavy': 0.7, 'stride': 0.3, 'lift': 0.25, 'lean': 6.0}),
    'attack': ('chop', {'wide': 0.4, 'clear': 0.5}),
    'stun': ('dazed', {}),
    'death': ('knees', {}),
    'victory': ('raise', {'out': 0.3}),
}, between=True)


def build():
    """Makes it in a fresh scene, every part bound to its bone and its joints marked, shrinks it to its
    size and returns the rig to finish() it with."""
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    with bone('spine'):
        cowl()
    hunch(new_objects(before))
    head()
    flaps()
    axe()
    arms()
    shrink(bpy.context.scene.objects)
    return Rig(clips=CLIPS)


def main():
    finish('orc-grunt', rig=build())


if __name__ == '__main__':
    main()
