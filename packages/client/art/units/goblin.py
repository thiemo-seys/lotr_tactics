"""A Moria goblin: a PvE monster (packages/sim/src/data/monsters.ts), in the Faceted style
(docs/viewer-spec.md section 4).

The orcs of Moria, of Gorbag's family (gorbag.py sets the Orcs' look) but smaller, scrawnier and more
stooped: about 1.0 to the top of the head as it stoops, bent almost double over bowed legs, with long,
thin arms that hang to its knees, splayed bare feet and a bare, bony chest. A big bald head thrust out
on its neck, the jaw jutting with small tusks, a hooked nose, great bat ears, and big pale eyes for the
dark under the mountains. Sallow, grey-green skin, scraps of cloth and leather, and crude iron. It hacks
with a crude curved blade and keeps a small round shield of boards, rimmed and bossed in iron.

The goblin archer (goblin-archer.py) is this goblin with a bow: it imports this script and builds it
with its bow, its quiver and its arms at the draw (build()), in place of the blade, the shield and the
arms that hold them. Up to four of them share a board with a Large boss, so they read but stay modest.

Its livery, Moria rust (packages/client/src/livery.json), is its ragged cowl over its hump and its
shoulders, its loincloth's flaps before and behind, and the face of its shield, so it shows from in
front, behind and above. Its fittings, the belt buckle and the shield's boss, use `trim`, which the
client colours iron at 1★, the only star level a monster has.

It is rigged as the Orcs are (gorbag.py, ../README.md, Monsters and summons): every part is bound to
the bone it moves with, the stoop is in the rest pose, and its legs bend at the knee where the thigh
and shin meet, its arms at the elbow and its body at the belt. It has no ability, so it never casts and
has six clips, without `cast` (../rig.py, Timing.wanted()).

The body is built in the measure of Gorbag's, an Orc of 1.2, and shrunk to the goblin's size at the
end (SCALE), joints and all, so the clips are made for the goblin as it stands.

    blender --background --factory-startup --python-exit-code 1 --python goblin.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its right hand is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    CLOTH,
    LEATHER,
    V,
    bone,
    box,
    cone,
    ellipse,
    finish,
    loft,
    material,
    nearest_on_line,
    nearest_on_polyline,
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

# The goblin's own colours (sRGB); the rest come from the kit.
SKIN = 0x878868  # sallow and grey-green, paler than Gorbag's, from the dark
IRON = 0x585C60  # crude, blackened iron
BLADE = 0x8E9296  # the blade's rough-ground iron, a little brighter, so it shows
BONE = 0xCFC4A2  # its tusks
GLEAM = 0xE2DC9C  # big pale eyes
PUPIL = 0x1E1612
RAGS = 0x4A4036  # its breeches, dark and ragged

M = {}  # materials by name, made once the scene is reset

SCALE = 0.85  # the goblin's size, from the measure of Gorbag's in which it is built


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        rags=material('rags', RAGS, roughness=0.95),
        leather=material('leather', LEATHER, roughness=0.85),
        cloth=material('cloth', CLOTH, roughness=0.9),
        iron=material('iron', IRON, roughness=0.6, metallic=0.1),
        blade=material('blade', BLADE, roughness=0.45, metallic=0.1),
        wood=material('wood', 0x6E5236, roughness=0.9),
        bone=material('bone', BONE, roughness=0.7),
        eyes=material('eyes', GLEAM, roughness=0.5, emission=GLEAM, emission_strength=0.6),
        pupils=material('pupils', PUPIL, roughness=0.6),
        trim=trim_material(),  # fittings, recoloured by star
    )


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


# The stoop ---------------------------------------------------------------------------------------
#
# The body above the hips is built upright and then bent by hunched(), as Gorbag's is but further: it
# leans forward about the hips, and above the small of the back the spine curls over into a hump, so
# the neck comes out of the front of it, almost level.

PIVOT = V(0, 0.03, 0.44)  # the hips
LEAN = 20  # degrees the body above the hips leans forward
MID = V(0, 0.04, 0.58)  # the small of the back
CURL = 34  # further degrees the shoulders curl forward over it
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
    """Shrinks the goblin, built in Gorbag's measure, to its own size about the origin on the ground."""
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


# Legs: bowed and thin, the knees out and bent, on splayed bare feet ----------------------------------

R_HIP, R_KNEE, R_ANKLE, R_YAW = V(-0.09, 0.05, 0.45), V(-0.215, -0.02, 0.26), V(-0.19, 0.08, 0.09), -30
L_HIP, L_KNEE, L_ANKLE, L_YAW = V(0.09, 0.0, 0.45), V(0.215, -0.13, 0.27), V(0.18, -0.09, 0.09), 24

# A long, flat bare foot from the sole up, in the foot's own frame (toes towards -y): the height of
# each ring and the right half of it, side, heel and toe, mirrored by foot(); the toes splay into a
# broad, clawed front.
FOOT_RINGS = [
    (0.0, [(0.07, -0.02), (0.05, 0.07), (0.075, -0.2)]),  # the sole
    (0.045, [(0.066, -0.01), (0.05, 0.065), (0.05, -0.17)]),  # over the toes
    (0.11, [(0.052, 0.0), (0.046, 0.05), (0.044, -0.04)]),  # round the ankle
]


def foot(name, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in FOOT_RINGS]
    rings = [[at + turn @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    faces.append(tuple(range(6)))  # the sole
    part(name, verts, faces, M['skin'], inside=at + V(0, 0, 0.05))


def legs():
    for side, hip, knee, ankle, yaw in (('right', R_HIP, R_KNEE, R_ANKLE, R_YAW),
                                        ('left', L_HIP, L_KNEE, L_ANKLE, L_YAW)):
        s = side[0]
        # The thigh, in ragged breeches to the knee, and the bare shin already overlap at the knee, so
        # the knee bends without a gap.
        with bone(f'thigh_{s}'):
            tube(f'thigh-{side}', hip, knee, [(-0.1, 0.075), (1.1, 0.06)], M['rags'], n=5)
        with bone(f'shin_{s}'):
            tube(f'shin-{side}', knee, ankle, [(-0.1, 0.046), (1.25, 0.04)], M['skin'], n=5)
        with bone(f'foot_{s}'):
            foot(f'foot-{side}', ankle, yaw)
        joint(f'hip_{s}', hip)
        joint(f'knee_{s}', knee)
        joint(f'ankle_{s}', ankle)
        joint(f'toe_{s}', V(ankle.x, ankle.y, 0) + Matrix.Rotation(math.radians(yaw), 3, 'Z') @ V(0, -0.16, 0.03))


# Body --------------------------------------------------------------------------------------------

# A narrow barrel, built upright and then hunched: z, half-width, half-depth and centre y. The bare
# chest is all ribs and bony shoulders.
TORSO = [
    (0.34, 0.14, 0.11, 0.03),  # hips
    (0.43, 0.15, 0.118, 0.03),  # belt, lower edge
    (0.5, 0.152, 0.12, 0.03),  # belt, upper edge
    (0.64, 0.18, 0.13, 0.03),  # chest
    (0.8, 0.205, 0.14, 0.05),  # shoulders
    (0.92, 0.1, 0.095, 0.02),  # neck
]
TORSO_BANDS = [0, 1, 2, 2, 2]  # breeches, belt, bare skin
# In two pieces, which bend at the belt: the breeches and the belt on its hips, and the bare chest on
# its spine from a ring inside the belt (the waist) up.
INSIDE_BELT = (0.465, 0.138, 0.11, 0.03)


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    mats = [M['rags'], M['leather'], M['skin']]

    def inside(c):
        return V(0, 0.03, min(max(c.z, 0.38), 0.88))

    with bone('hips'):
        verts, faces, bands = loft(rings[:3])
        part('breeches', verts, faces, mats, [TORSO_BANDS[b] for b in bands], inside=inside)
    z, rx, ry, cy = INSIDE_BELT
    with bone('spine'):
        verts, faces, _ = loft([ellipse(0, cy, z, rx, ry, 8, 22.5)] + rings[3:])
        faces.append(tuple(range(len(verts) - 8, len(verts))))  # the top of the neck
        part('chest', verts, faces, M['skin'], inside=inside)
    joint('pelvis', PIVOT)
    joint('waist', V(0, cy, z))


def cowl():
    # A ragged cowl of sacking round its neck and over its shoulders and hump: eight points from its
    # left (+X), the collar rising behind its neck and dipping in front.
    collar_z = [0.93, 0.97, 0.99, 0.97, 0.93, 0.88, 0.86, 0.88]
    collar = ellipse(0, 0.01, 0, 0.125, 0.12, 8, 0, collar_z)
    dome = ellipse(0, 0.02, 0, 0.215, 0.17, 8, 0, [z - 0.06 for z in collar_z])
    shoulder_z = [0.82, 0.8, 0.78, 0.8, 0.82, 0.81, 0.8, 0.81]
    shoulder = ellipse(0, 0.035, 0, 0.245, 0.18, 8, 0, shoulder_z)
    hem_drop = [0.05, 0.11, 0.13, 0.11, 0.05, 0.07, 0.08, 0.07]
    hem = ellipse(0, 0.035, 0, 0.24, 0.184, 8, 0, [z - d for z, d in zip(shoulder_z, hem_drop)])
    verts, faces, _ = loft([hem, shoulder, dome, collar])
    # Rags hang from the hem in points of uneven length, longest down its back.
    drops = [0.1, 0.16, 0.12, 0.17, 0.1, 0.12, 0.15, 0.1]
    for i in range(8):
        a, b = hem[i], hem[(i + 1) % 8]
        mid = (a + b) / 2
        out = V(mid.x, mid.y - 0.03, 0).normalized()
        verts.append(mid + 0.012 * out - V(0, 0, drops[i]))
        faces.append((i, (i + 1) % 8, len(verts) - 1))
    part('cowl', verts, faces, M['team'], inside=lambda c: V(0, 0.03, min(c.z, 0.8) - 0.1))


# Head ----------------------------------------------------------------------------------------------

HEAD = V(0, -0.37, 0.79)  # the middle of the underside of its jaw, placed after the stoop
HEAD_SCALE = 1.2  # the head is drawn big, bigger for its body than Gorbag's, so it reads at game size

# The skull in rings from under the jaw to the temples: the height of each above HEAD, then the left
# half of it from HEAD as (x, y): the side, the back corner, the back, the front corner and the front.
# Narrower in the jaw than Gorbag's and wider at the brow, round the big eyes.
SKULL = [
    (0.0, (0.105, -0.03), (0.07, 0.05), 0.065, (0.095, -0.15), -0.185),  # under the jaw, jutting
    (0.07, (0.13, -0.005), (0.1, 0.09), 0.115, (0.115, -0.14), -0.17),  # the mouth
    (0.165, (0.145, 0.005), (0.115, 0.11), 0.14, (0.125, -0.115), -0.15),  # cheekbones and eyes
    (0.25, (0.122, 0.015), (0.095, 0.11), 0.135, (0.09, -0.08), -0.1),  # brow and temples
]
CROWN = (0, 0.03, 0.31)


def h(x, y, z):
    """A point of the head, from HEAD in the head's own (unscaled) measure."""
    return HEAD + HEAD_SCALE * V(x, y, z)


NECK = V(0, 0.07, 0.01)  # where its head turns on its neck, from HEAD: at the back of the jaw


def head():
    with bone('head'):
        features()
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
    verts.append(h(*CROWN))
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

    face, jaw = front(1) + front(2), front(0)

    def on(tris, x, z, lift):
        """A point of the head at (x, z) laid `lift` proud of the surface `tris`."""
        p = h(x, 0, z)
        return V(p.x, on_surface(tris, p.x, p.z) - lift, p.z)

    # Big pale eyes, round and staring, each with a slit of a pupil.
    for s in (-1, 1):
        corners = [(s * 0.022, 0.135), (s * 0.06, 0.172), (s * 0.108, 0.15), (s * 0.104, 0.112), (s * 0.06, 0.1)]
        verts = [on(face, x, z, 0.006) for x, z in corners]
        part(f'eye-{s}', verts, [(0, 1, 2, 3, 4)], M['eyes'], outward=V(0, -1, 0))
        slit = [(s * 0.058, 0.158), (s * 0.072, 0.136), (s * 0.06, 0.112)]
        verts = [on(face, x, z, 0.009) for x, z in slit]
        part(f'pupil-{s}', verts, [(0, 1, 2)], M['pupils'], outward=V(0, -1, 0))

    # A thin, raised brow over them, which leaves them staring.
    sections = [
        [h(-0.122, -0.06, 0.215), h(-0.122, -0.12, 0.2), h(-0.122, -0.08, 0.186)],
        [h(0, -0.11, 0.212), h(0, -0.168, 0.19), h(0, -0.13, 0.17)],
        [h(0.122, -0.06, 0.215), h(0.122, -0.12, 0.2), h(0.122, -0.08, 0.186)],
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brow', verts, faces, M['skin'], inside=h(0, -0.08, 0.19))

    # A long, hooked nose, down over the mouth.
    verts = [h(0, -0.148, 0.165), h(0, -0.245, 0.085), h(0.034, -0.16, 0.088), h(-0.034, -0.16, 0.088),
             h(0, -0.19, 0.072)]
    faces = [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)]
    part('nose', verts, faces, M['skin'], inside=h(0, -0.14, 0.11))

    # A wide, thin mouth.
    outline = [(0.088, 0.045), (0.035, 0.06), (-0.035, 0.06), (-0.088, 0.045), (-0.035, 0.048), (0.035, 0.048)]
    verts = [on(jaw, x, z, 0.005) for x, z in outline]
    part('mouth', verts, [(0, 1, 5), (1, 2, 4, 5), (2, 3, 4)], M['pupils'], outward=V(0, -1, 0))

    # Small tusks from the lower jaw, up past the lip.
    for s in (-1, 1):
        x = s * 0.07
        base = on(jaw, x, 0.03, 0.0)
        y = (base.y - HEAD.y) / HEAD_SCALE
        verts = [h(x - 0.02, y + 0.008, 0.018), h(x + 0.02, y + 0.008, 0.018), h(x, y + 0.032, 0.014),
                 h(x + s * 0.02, y - 0.035, 0.11)]
        part(f'tusk-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['bone'], inside=h(x, y + 0.01, 0.04))

    # Great bat ears, out to its sides and drooping a little, so the head reads from behind and above.
    for s in (-1, 1):
        verts = [h(s * 0.13, -0.03, 0.12), h(s * 0.125, 0.075, 0.13), h(s * 0.12, 0.02, 0.235),
                 h(s * 0.4, 0.09, 0.2), h(s * 0.3, 0.06, 0.1)]
        faces = [(0, 2, 3), (2, 1, 3), (1, 0, 4), (0, 3, 4), (1, 4, 3)]
        part(f'ear-{s}', verts, faces, M['skin'], inside=h(s * 0.1, 0.02, 0.15))


# Loincloth and belt ---------------------------------------------------------------------------------

FLAP_TOP = V(0, -0.125, 0.45)  # the middle of the top of the front flap, tucked under the belt
FLAP_KNEE, FLAP_OUT = 0.33, 0.03  # the height where the flaps fall straight, and how far out they are there


def loincloth():
    # Ragged front and back flaps, each a sheet of two columns with a ragged hem.
    columns = (-0.1, 0.0, 0.1)
    hems = {'front': (0.18, 0.22, 0.2), 'back': (0.21, 0.17, 0.23)}
    with bone('hips'):
        for name, sign, top_y, top_z in (('front', -1, FLAP_TOP.y, FLAP_TOP.z), ('back', 1, 0.17, 0.48)):
            top = [V(x, top_y, top_z) for x in columns]
            mid = [V(0.95 * x, top_y + sign * FLAP_OUT, FLAP_KNEE) for x in columns]
            bottom = [V(0.86 * x, top_y + sign * FLAP_OUT, z) for x, z in zip(columns, hems[name])]
            verts, faces, _ = loft([top, mid, bottom], closed=False)
            part(f'loincloth-{name}', verts, faces, M['team'], outward=V(0, sign, 0))
        # A crude square buckle on the front of the belt, over the top of the front flap, leaning
        # forward with its body, so it faces a little down.
        out = V(0, -1, -0.2).normalized()
        up = V(0, -0.2, 1).normalized()
        box('buckle', V(0, -0.132, 0.462), [out, V(1, 0, 0), up], (0.012, 0.03, 0.025), M['trim'], 0.75)


# Arms ------------------------------------------------------------------------------------------------

UPPER_ARM, FOREARM = 0.3, 0.32  # long arms, longer than an Orc's, that hang to its knees
SHOULDERS = {s: hunched(V(s * 0.19, 0.04, 0.78)) for s in (-1, 1)}  # its left (+X) and right


def arm(side, fist, pole, fist_up, ahead=None, bracer=True):
    """A thin arm from the shoulder to a fist at `fist`, its elbow bent towards `pole`; the fist points
    along the forearm, or along `ahead` when it grips something square to it. A crude iron bracer on
    the forearm, unless `bracer` is False."""
    s = side[0]
    shoulder = SHOULDERS[1 if s == 'l' else -1]
    reach = (fist - shoulder).normalized()
    wrist_at = fist - 0.05 * reach
    elbow = bend(shoulder, wrist_at, UPPER_ARM, FOREARM, pole)
    wrist = fist - 0.04 * (fist - elbow).normalized()
    # The upper arm and the forearm already overlap at the elbow, so it bends without a gap.
    with bone(f'upper_arm_{s}'):
        tube(f'upper-arm-{side}', shoulder, elbow, [(-0.1, 0.055), (1.08, 0.045)], M['skin'], n=5)
    with bone(f'forearm_{s}'):
        if bracer:
            tube(f'forearm-{side}', elbow, wrist, [(-0.12, 0.044), (0.45, 0.05), (1.0, 0.046)],
                 [M['skin'], M['iron']], [0, 1], n=5)
        else:
            tube(f'forearm-{side}', elbow, wrist, [(-0.12, 0.044), (1.0, 0.04)], M['skin'], n=5)
    ahead = (fist - elbow).normalized() if ahead is None else Vector(ahead).normalized()
    up = (Vector(fist_up) - Vector(fist_up).dot(ahead) * ahead).normalized()
    with bone(f'hand_{s}'):
        box(f'fist-{side}', fist, [ahead, up, ahead.cross(up)], (0.05, 0.048, 0.05), M['skin'], 0.85)
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', fist)


# The blade: crude, curved and broad near its point, held low and forward in the right fist -----------

R_FIST = V(-0.33, -0.4, 0.56)
EDGE_UP = V(-0.18, -0.55, 0.82).normalized()  # the way the blade leaves the fist: forward, up, out
CURVE = 0.11  # how far its point sweeps back from that line, over its length
LENGTH = 0.5  # from the guard to the point
# Stations along the blade: fraction of its length, its half-width and its half-thickness; it widens
# towards its point, a chopper's blade.
BLADE_STATIONS = [(0.0, 0.028, 0.009), (0.45, 0.034, 0.009), (0.8, 0.044, 0.008)]


def blade_frame():
    """The way up the blade, the way its back faces (the way it curves) and across its flat."""
    d = EDGE_UP
    back = (V(0, 1, 0.3) - V(0, 1, 0.3).dot(d) * d).normalized()  # its back curves away from the foe
    return d, back, d.cross(back).normalized()


def blade_at(t):
    """The middle of the blade at a fraction `t` of its length from the guard, on its curve."""
    d, back, _ = blade_frame()
    guard = R_FIST + 0.065 * d
    return guard + t * LENGTH * d + CURVE * t * t * back


def blade():
    d, back, side = blade_frame()
    guard = R_FIST + 0.065 * d
    rings = []
    for t, w, k in BLADE_STATIONS:
        c = blade_at(t)
        along = (blade_at(t + 0.01) - c).normalized()
        across = (back - back.dot(along) * along).normalized()
        rings.append([c + w * across, c + k * side, c - w * across, c - k * side])
    verts, faces, _ = loft(rings)
    point = blade_at(1.0) + 0.03 * back  # the point, swept back along its spine
    verts.append(point)
    last = (len(rings) - 1) * 4
    faces += [(last + i, last + (i + 1) % 4, len(verts) - 1) for i in range(4)]
    path = [blade_at(t) for t in (0.0, 0.4, 0.8, 1.0)]
    part('blade', verts, faces, M['blade'], inside=nearest_on_polyline(path))
    # A bar of a guard, the grip bound in leather and a knob of iron for a pommel.
    box('guard', guard, [d, back, side], (0.014, 0.06, 0.022), M['iron'])
    tube('grip', R_FIST - 0.07 * d, guard, [(0, 0.02), (1, 0.02)], M['leather'], n=4)
    cone('pommel', R_FIST - 0.07 * d, R_FIST - 0.11 * d, 0.028, M['iron'], n=4, back=R_FIST - 0.06 * d)
    return point


def sword():
    with bone('hand_r'):
        point = blade()
    # Held by the grip in its fist, up the curve to the point, its edge to the front of the curve.
    _, back, _ = blade_frame()
    hold('r', R_FIST, point, point - 0.1 * back)


# The shield: small and round, of boards, rimmed and bossed in iron, held out before its left side -----

SHIELD_CENTRE = V(0.31, -0.42, 0.6)
SHIELD_TURN = Matrix.Rotation(math.radians(32), 3, 'Z') @ Matrix.Rotation(math.radians(-6), 3, 'X')
SHIELD_R = 0.17
SHIELD_DOME = 0.03  # how far its middle stands forward of its rim


def on_shield(u, v, w):
    """A point of the shield: u across, v up and w forward of the plane of its rim."""
    return SHIELD_CENTRE + SHIELD_TURN @ V(u, -w, v)


def boards():
    forward = SHIELD_TURN @ V(0, -1, 0)
    n = 8
    corners = [(math.cos(a), math.sin(a)) for a in (math.radians(22.5 + 45 * i) for i in range(n))]
    # The rim of iron: its outer edge, a band round the face and the edge of the back.
    rim = [on_shield(SHIELD_R * c, SHIELD_R * s, 0.0) for c, s in corners]
    face = [on_shield(0.82 * SHIELD_R * c, 0.82 * SHIELD_R * s, 0.012) for c, s in corners]
    back = [on_shield(0.92 * SHIELD_R * c, 0.92 * SHIELD_R * s, -0.02) for c, s in corners]
    verts = rim + face + back + [on_shield(0, 0, SHIELD_DOME), on_shield(0, 0, -0.02)]
    rim_faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    rim_faces += [(i, (i + 1) % n, 2 * n + (i + 1) % n, 2 * n + i) for i in range(n)]
    axis = nearest_on_line(SHIELD_CENTRE, SHIELD_CENTRE + forward)
    faces = wind(verts, rim_faces, inside=axis)
    face_mats = [1] * len(rim_faces)
    # The face, painted in its livery, rising to the boss; the back, bare boards.
    front = [(n + i, n + (i + 1) % n, 3 * n) for i in range(n)]
    faces += wind(verts, front, outward=forward)
    face_mats += [0] * n
    faces += wind(verts, [(2 * n + i, 2 * n + (i + 1) % n, 3 * n + 1) for i in range(n)], outward=-forward)
    face_mats += [2] * n
    part('shield', verts, faces, [M['team'], M['iron'], M['wood']], face_mats)
    # A crude iron boss in the middle, in trim.
    cone('boss', on_shield(0, 0, SHIELD_DOME - 0.01), on_shield(0, 0, SHIELD_DOME + 0.04), 0.045, M['trim'],
         n=5, back=None)


def shield():
    with bone('hand_l'):
        boards()
    # Held by the grip behind its middle, up to the top of its rim, its face to the front.
    top = on_shield(0, SHIELD_R, 0)
    hold('l', on_shield(0, 0, -0.06), top, top + SHIELD_TURN @ V(0, -0.1, 0))


def arms():
    # The shield arm reaches forward to the grip behind the shield's middle, the fist square to it.
    grip = on_shield(0, 0, -0.06)
    left = SHOULDERS[1]
    arm('left', grip, left + V(0.25, 0.1, -0.25), SHIELD_TURN @ V(0, 0, 1), SHIELD_TURN @ V(0, -1, 0))
    # The blade arm hangs long and forward, the elbow out and back, the blade raised before it.
    right = SHOULDERS[-1]
    arm('right', R_FIST, right + V(-0.3, 0.15, -0.15), EDGE_UP)


# Its clips (../clips.py): the Orcs' idle and run, as Gorbag's (gorbag.py): a restless low crouch,
# breathing quick, and a low, scuttling run, the shield held up. It hacks with a forehand slash of its
# curved blade, drawn back wide (`wide`) so its fist passes under its great ear rather than through
# its head. Falling, it lays its shield down before it, as Ugluk does, and lets its blade fall by its
# knee (`dropped`), where held upright it kept its death too tall. As it wins it holds the blade up
# out from its shoulder (`out`), clear of its ear. It has no ability, so it has no cast.
CLIPS = fit({
    'idle': ('ready', {'seconds': 2.0, 'crouch': 0.06}),
    'move': ('run', {'seconds': 0.43, 'heavy': 0.7, 'stride': 0.3, 'lift': 0.25, 'lean': 6.0, 'off': 'high'}),
    'attack': ('swing', {'wide': 0.25}),
    'stun': ('dazed', {}),
    'death': ('knees', {'hand': 'l', 'slump': 0.6, 'dropped': True}),
    'victory': ('raise', {'out': 0.3}),
}, between=True)


def build(bow=None):
    """Makes it in a fresh scene, every part bound to its bone and its joints marked, shrinks it to
    its size and returns the rig to finish() it with. The goblin archer (goblin-archer.py) passes its
    bow as `bow`: a function that makes, on the hunched body, the bow, the quiver and the arms at the
    draw, in place of the blade, the shield and the arms that hold them, and returns the archer's rig."""
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    with bone('spine'):
        cowl()
    hunch(new_objects(before))
    head()
    loincloth()
    if bow is None:
        shield()
        sword()
        arms()
        rig = Rig(clips=CLIPS)
    else:
        rig = bow()
    shrink(bpy.context.scene.objects)
    return rig


def main():
    finish('goblin', rig=build())


if __name__ == '__main__':
    main()
