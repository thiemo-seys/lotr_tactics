"""The Cave Troll of Moria: a Large PvE monster (packages/sim/src/data/monsters.ts), in the Faceted style
(docs/viewer-spec.md section 4).

After the books, where it forces the door of Mazarbul: a huge arm and shoulder with a dark skin of
greenish scales, and a great flat foot without toes. A hulking biped about 2.2 tall as it stoops, built
at full size as Treebeard is (treebeard.py, the Large pattern): short, thick legs on great flat toeless
feet, a pot belly and a massive hunched chest, a hump of shoulder over a small head thrust out low on
its neck (a heavy brow over small dull eyes, a broad flat nose, small pointed ears and an underbite
with tusks), long arms with heavy forearms, and a crude great club of a tree-trunk, banded and spiked
with iron, held across its body in both hands. Its hide is scaled in facets of dark green and darker,
its belly paler. An iron collar is riveted round its neck, with a length of broken chain hanging from
it, where its masters chained it in the dark.

Its livery, Moria rust (packages/client/src/livery.json), as the goblins' is: a ragged cloth tied at
the collar and hanging over its hump and down its back, seen from above and behind, and a loincloth
hanging before and behind from a rope belt, seen from in front and behind. Its fittings, the collar's
rivets and the club's iron bands, use `trim`, which the client colours iron at 1★, the only star level
a monster has.

It is rigged as a Large figure (../rig.py, Rig(kind='large')) with the 16 bones, as Treebeard is: its
legs bend at the knee where the thigh runs on inside the shin, its body at the waist where the upper
body runs on inside the lower, and its arms at the elbow. Its club is held in both hands, as Dáin's
mattock is (dain.py, clips.both_hands()), and its blows are its own, drawn along the library's path for
a weapon in both hands (../clips.py, haft_blow()): it brings the club over its head and down on the foe
ahead, and for Smash, its ability (stun the foes next to it, at the end of a 0.5 s wind-up), it heaves
it up higher and slams it into the ground before it on the release. As it wins it thrusts the club up
over its head in both hands.

    blender --background --factory-startup --python-exit-code 1 --python cave-troll.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so its right hand is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from clips import BLOW, both_hands, fit, haft_blow, timed  # noqa: E402
from kit import (  # noqa: E402
    EYES,
    LARGE_BUDGET,
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
    part,
    reset,
    segment,
    team_material,
    trim_material,
    tube,
)
from rig import Clip, Rig, hold, joint  # noqa: E402

# The troll's own colours (sRGB); the rest come from the kit.
HIDE = 0x4A5741  # dark greenish hide...
SCALES = 0x34402F  # ...in darker scales
BELLY = 0x6B6C4F  # its belly, a pale dull olive
NAILS = 0x2C2924  # its feet's soles and its nails, horn-dark
BONE = 0xC9BC94  # its tusks
GLOW = 0xB89A3A  # small dull yellow eyes
IRON = 0x55595D  # its collar and chain, crude iron
WOOD = 0x5B4631  # its club, a stripped trunk
ROPE = 0x6F5E43  # its belt, a hank of rope

M = {}  # materials by name, made once the scene is reset

SCALE = 1.06  # its size, from the measure in which it is built


def make_materials():
    M.update(
        team=team_material(),
        hide=material('hide', HIDE, roughness=0.9),
        scales=material('scales', SCALES, roughness=0.85),
        belly=material('belly', BELLY, roughness=0.9),
        nails=material('nails', NAILS, roughness=0.8),
        bone=material('bone', BONE, roughness=0.7),
        eyes=material('eyes', GLOW, roughness=0.5),
        mouth=material('mouth', EYES, roughness=0.6),
        iron=material('iron', IRON, roughness=0.6, metallic=0.1),
        wood=material('wood', WOOD, roughness=0.9),
        rope=material('rope', ROPE, roughness=0.95),
        leather=material('leather', LEATHER, roughness=0.85),
        trim=trim_material(),  # the collar's rivets and the club's bands, coloured by star level
    )


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


def scaly(faces, n, belly=None):
    """Material indexes for the faces of a lofted tube of n sides: hide and scales in a checker, so the
    facets read as scales, and the faces `belly` picks (by face index in its band and band) pale."""
    out = []
    for f in range(len(faces)):
        i, band = f % n, f // n
        out.append(2 if belly and belly(i, band) else (i + band) % 2)
    return out


# The stoop ----------------------------------------------------------------------------------------
#
# The body is built upright and bent by hunched(): it leans forward about its hips, and above the
# middle of its back its shoulders curl further, so its hump rises over a head thrust out low.

PIVOT = V(0, 0.02, 0.95)  # the hips
LEAN = 14  # degrees the body above the hips leans forward
MID = V(0, 0.03, 1.38)  # the middle of its back
CURL = 20  # further degrees its shoulders curl forward over it
CURL_SPAN = 0.3  # the height over which the curl comes in


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


# Feet and legs ------------------------------------------------------------------------------------

# Short, thick legs planted wide, the left foot a little forward; the knees a little forward of the
# line from hip to ankle, so they bend forward.
LEGS = [  # side, hip, knee, ankle, the foot's yaw (degrees, turned out)
    ('right', V(-0.21, 0.04, 0.9), V(-0.29, -0.06, 0.5), V(-0.31, 0.06, 0.15), -10),
    ('left', V(0.21, 0.0, 0.9), V(0.29, -0.12, 0.5), V(0.31, -0.02, 0.15), 10),
]
KNEE_OVERLAP = 0.07  # how far the thigh runs on past the knee, and the shin starts above it

# A great flat foot without toes, round its own centre under the ankle: z, centre y, half-width and
# half-length of each ring, blunt and rounded at the front.
FOOT = [(0.0, -0.07, 0.15, 0.25), (0.08, -0.06, 0.15, 0.24), (0.19, 0.0, 0.11, 0.13)]


def foot(side, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    rings = [[at + turn @ p for p in ellipse(0, cy, z, rx, ry, 8, 22.5)] for z, cy, rx, ry in FOOT]
    verts, faces, bands = loft(rings)
    face_mats = [0 if b == 0 else 1 + (f % 2) for f, b in enumerate(bands)]  # the sole's rim horn-dark
    verts.append(at + V(0, 0, 0.0) + turn @ V(0, -0.07, 0))
    faces += [(i, (i + 1) % 8, len(verts) - 1) for i in range(8)]  # the sole
    face_mats += [0] * 8
    part(f'foot-{side}', verts, faces, [M['nails'], M['hide'], M['scales']], face_mats,
         inside=at + V(0, -0.04, 0.08))
    joint(f'toe_{side[0]}', at + turn @ V(0, -0.3, 0.04))


def legs():
    for side, hip, knee, ankle, yaw in LEGS:
        s = side[0]
        past = knee + KNEE_OVERLAP * (ankle - knee).normalized()
        above = knee + KNEE_OVERLAP * (hip - knee).normalized()
        calf = knee.lerp(ankle, 0.35) + V(0, 0.03, 0)
        with bone(f'thigh_{s}'):
            stations = segment(hip, past, [(0, 0.19), (0.55, 0.175), (1, 0.15)], 6, 30)
            verts, faces, _ = loft(stations)
            part(f'thigh-{side}', verts, faces, [M['hide'], M['scales']], scaly(faces, 6),
                 inside=nearest_on_line(hip, past))
        with bone(f'shin_{s}'):
            rings = [segment(above, calf, [(0, 0.135)], 6, 30)[0], segment(above, calf, [(1, 0.15)], 6, 30)[0],
                     segment(calf, ankle, [(1, 0.12)], 6, 30)[0]]
            verts, faces, _ = loft(rings)
            part(f'shin-{side}', verts, faces, [M['hide'], M['scales']], scaly(faces, 6, lambda i, b: False),
                 inside=nearest_on_polyline([above, calf, ankle]))
        with bone(f'foot_{s}'):
            foot(side, ankle, yaw)
        joint(f'hip_{s}', hip)
        joint(f'knee_{s}', knee)
        joint(f'ankle_{s}', ankle)


# The body ------------------------------------------------------------------------------------------

# Built upright, rings of ten round it: z, half-width, half-depth and centre y. It bends at the waist
# in two pieces: the lower body on the hips, from the fork of the legs past the belt to WAIST_TOP, and
# the upper body on the spine, from a ring inside it (WAIST_INSIDE) up to its neck.
BODY = [
    (0.8, 0.26, 0.2, 0.02),  # the fork of the legs
    (0.97, 0.4, 0.3, 0.01),  # hips
    (1.12, 0.45, 0.37, -0.04),  # the belly, round, over the belt
    (1.38, 0.47, 0.37, -0.02),  # the chest
    (1.58, 0.5, 0.33, 0.02),  # the shoulders
    (1.73, 0.4, 0.29, 0.05),  # the hump
    (1.84, 0.2, 0.18, 0.02),  # the neck
]
WAIST_TOP = 1.26
WAIST_INSIDE = (1.08, 0.41, 0.33, -0.03)
SIDES = 10
PELVIS, WAIST, NECK = V(0, 0.02, 0.95), V(0, 0.1, 1.2), V(0, 0.03, 1.82)


def ring(z, rx, ry, cy):
    return ellipse(0, cy, z, rx, ry, SIDES, 18)


def at_height(z):
    """The BODY row at height z, between the rows either side."""
    for a, b in zip(BODY, BODY[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return tuple(p + t * (q - p) for p, q in zip(a, b))
    raise ValueError(f'no body at z = {z}')


def front(i):
    """Whether face i of a ring of SIDES faces the front, from 18 degrees round from its left."""
    a = 18 + 36 * (i + 0.5)
    return 220 < a < 320


def body():
    def inside(c):
        return V(0, 0.0, min(max(c.z, 0.9), 1.75))

    lower = [ring(*BODY[0]), ring(*BODY[1]), ring(*BODY[2]), ring(*at_height(WAIST_TOP))]
    verts, faces, _ = loft(lower)
    face_mats = scaly(faces, SIDES, lambda i, b: b >= 1 and front(i))
    verts.append(V(0, 0.02, 0.84))
    faces += [(i, (i + 1) % SIDES, len(verts) - 1) for i in range(SIDES)]  # closed between the legs
    face_mats += [0] * SIDES
    with bone('hips'):
        part('body-lower', verts, faces, [M['hide'], M['scales'], M['belly']], face_mats, inside=inside)
        # A rope belt round under the belly.
        belt = [ring(z, rx * k, ry * k, cy) for z, rx, ry, cy, k in
                ((1.02, *at_height(1.02)[1:], 1.04), (1.08, *at_height(1.08)[1:], 1.04))]
        verts, faces, _ = loft(belt)
        part('belt', verts, faces, M['rope'], inside=inside)
    upper = [ring(*WAIST_INSIDE)] + [ring(*row) for row in BODY[3:]]
    verts, faces, _ = loft(upper)
    face_mats = scaly(faces, SIDES, lambda i, b: b == 0 and front(i))
    with bone('spine'):
        part('body-upper', verts, faces, [M['hide'], M['scales'], M['belly']], face_mats, inside=inside)
    joint('pelvis', PELVIS)
    joint('waist', WAIST)
    joint('neck', NECK)


def loincloth():
    """A ragged loincloth of the team colour, hanging from the rope belt before and behind, on the
    hips."""
    for name, y, sign, drop in (('loincloth-front', -0.35, -1, 0.48), ('loincloth-back', 0.33, 1, 0.42)):
        top = 1.05
        width = 0.2
        verts = [V(-width, y, top), V(width, y, top),
                 V(-0.9 * width, y + sign * 0.06, top - 0.5 * drop), V(0.9 * width, y + sign * 0.06, top - 0.5 * drop),
                 V(-0.8 * width, y + sign * 0.08, top - drop), V(0.0, y + sign * 0.09, top - drop - 0.06),
                 V(0.8 * width, y + sign * 0.08, top - drop), V(-0.35 * width, y + sign * 0.085, top - drop + 0.06),
                 V(0.4 * width, y + sign * 0.085, top - drop + 0.04)]
        faces = [(0, 1, 3, 2), (2, 7, 4), (2, 3, 8, 7), (7, 8, 5), (3, 6, 8)]
        with bone('hips'):
            part(name, verts, faces, M['team'], outward=V(0, sign, 0))


def back_rag():
    """A ragged cloth of the team colour tied at the collar and hanging over the hump and down the back,
    in points, on the spine."""
    rows = []
    for z, grow in ((1.8, 0.06), (1.68, 0.05), (1.52, 0.05), (1.38, 0.05)):
        _, rx, ry, cy = at_height(z)
        rows.append([V((rx + grow) * math.cos(math.radians(a)), cy + (ry + grow) * math.sin(math.radians(a)), z)
                     for a in (5, 40, 75, 105, 140, 175)])
    verts, faces, _ = loft(rows, closed=False)
    width = len(rows[0])
    last = (len(rows) - 1) * width
    for i, drop in zip(range(width - 1), (0.12, 0.2, 0.15, 0.22, 0.13)):  # dags from the hem
        a, b = last + i, last + i + 1
        verts.append((verts[a] + verts[b]) / 2 + V(0, 0.03, -drop))
        faces.append((a, b, len(verts) - 1))
    with bone('spine'):
        part('back-rag', verts, faces, M['team'], inside=lambda c: V(0, 0.0, min(c.z, 1.75) - 0.1))


def collar():
    """An iron collar riveted round its neck, with a broken chain hanging from it down its back."""
    rings = [ring(z, 0.27, 0.25, 0.03) for z in (1.77, 1.87)]
    verts, faces, _ = loft(rings)
    with bone('spine'):
        part('collar', verts, faces, M['iron'], inside=lambda c: V(0, 0.03, c.z))
        for k, a in enumerate((200, 270, 340)):  # rivets
            p = V(0.275 * math.cos(math.radians(a)), 0.03 + 0.255 * math.sin(math.radians(a)), 1.82)
            out = V(math.cos(math.radians(a)), math.sin(math.radians(a)), 0)
            cone(f'rivet-{k}', p, p + 0.03 * out, 0.025, M['trim'], n=4, back=None)
        # The broken chain: four links from the back of the collar, on its left, down over the rag on
        # its hump, the last one broken open.
        top = V(0.1, 0.33, 1.79)
        down = V(0.03, 0.12, -1).normalized()
        for k in range(4):
            centre = top + (0.08 + 0.13 * k) * down
            flat = V(1, 0, 0) if k % 2 == 0 else V(0, 1, 0.12)
            link(f'chain-{k}', centre, down, flat, broken=k == 3)


def link(name, centre, along, flat, broken=False):
    """A chain link round `centre`, long along `along`, lying in the plane of `along` and `flat`: four
    bars round it, or three for a link broken open."""
    side = (flat - flat.dot(along) * along).normalized()
    half_l, half_w, r = 0.085, 0.05, 0.022
    corners = [centre + half_l * along + half_w * side, centre + half_l * along - half_w * side,
               centre - half_l * along - half_w * side, centre - half_l * along + half_w * side]
    bars = 3 if broken else 4
    for i in range(bars):
        a, b = corners[i], corners[(i + 1) % 4]
        tube(f'{name}-{i}', a, b, [(-0.15, r), (1.15, r)], M['iron'], n=3)


# The head ------------------------------------------------------------------------------------------

HEAD_SCALE = 1.15  # drawn a little big, as every head is, so it reads at game size

# The skull in rings from under the jaw up: the height above the head's origin, then the left half as
# (x, y): the side, the back corner, the back, the front corner and the front. The jaw is broad and
# jutting, the brow a heavy shelf, the crown low and sloping back.
SKULL = [
    (0.0, (0.15, 0.0), (0.1, 0.09), 0.1, (0.14, -0.16), -0.2),  # under the jaw
    (0.1, (0.17, 0.02), (0.13, 0.12), 0.15, (0.15, -0.15), -0.2),  # the mouth
    (0.2, (0.16, 0.03), (0.12, 0.14), 0.17, (0.12, -0.11), -0.15),  # the cheeks, under the eyes
    (0.27, (0.14, 0.04), (0.11, 0.14), 0.16, (0.12, -0.12), -0.16),  # the brow, a shelf
    (0.35, (0.1, 0.05), (0.08, 0.12), 0.13, (0.07, -0.04), -0.05),  # the crown, low
]
CROWN = (0, 0.05, 0.39)


def head_origin():
    """The middle of the underside of its jaw, thrust out low before its hump."""
    return hunched(NECK) + V(0, -0.13, -0.1)


def h(x, y, z):
    return head_origin() + HEAD_SCALE * V(x, y, z)


def head():
    with bone('head'):
        skull()
        features()
    joint('crown', h(*CROWN))


def skull():
    rings = []
    for z, side, corner, back, front_corner, front_y in SKULL:
        points = [side, corner, (0, back), (-corner[0], corner[1]), (-side[0], side[1]),
                  (-front_corner[0], front_corner[1]), (0, front_y), front_corner]
        rings.append([h(x, y, z) for x, y in points])
    verts, faces, bands = loft(rings)
    face_mats = [1 if (f % 8 + b) % 2 else 0 for f, b in enumerate(bands)]
    faces.append(tuple(range(8)))
    face_mats.append(0)
    verts.append(h(*CROWN))
    last = (len(rings) - 1) * 8
    faces += [(last + i, last + (i + 1) % 8, len(verts) - 1) for i in range(8)]
    face_mats += [1 if i % 2 else 0 for i in range(8)]
    part('skull', verts, faces, [M['hide'], M['scales']], face_mats, inside=h(0, 0.0, 0.18))


def features():
    # Small dull eyes deep under the brow.
    for s in (-1, 1):
        verts = [h(s * 0.035, -0.135, 0.235), h(s * 0.1, -0.12, 0.25), h(s * 0.085, -0.123, 0.215)]
        part(f'eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))
    # A broad flat nose.
    verts = [h(0, -0.15, 0.24), h(0, -0.2, 0.17), h(0.055, -0.155, 0.15), h(-0.055, -0.155, 0.15),
             h(0, -0.165, 0.135)]
    part('nose', verts, [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)], M['hide'], inside=h(0, -0.13, 0.17))
    # A wide mouth, a dark slit across the jutting jaw.
    verts = [h(0.12, -0.172, 0.08), h(0.04, -0.205, 0.095), h(-0.04, -0.205, 0.095), h(-0.12, -0.172, 0.08),
             h(-0.04, -0.205, 0.07), h(0.04, -0.205, 0.07)]
    part('mouth', verts, [(0, 1, 5), (1, 2, 4, 5), (2, 3, 4)], M['mouth'], outward=V(0, -1, 0))
    # Tusks from the underbite, up past the lip.
    for s in (-1, 1):
        x = s * 0.09
        verts = [h(x - 0.025, -0.19, 0.04), h(x + 0.025, -0.19, 0.04), h(x, -0.16, 0.04),
                 h(x + s * 0.02, -0.215, 0.15)]
        part(f'tusk-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['bone'], inside=h(x, -0.18, 0.06))
    # Small pointed ears, swept back.
    for s in (-1, 1):
        verts = [h(s * 0.15, -0.02, 0.18), h(s * 0.15, 0.06, 0.2), h(s * 0.14, 0.02, 0.27),
                 h(s * 0.24, 0.12, 0.27)]
        part(f'ear-{s}', verts, [(0, 2, 3), (2, 1, 3), (1, 0, 3)], M['hide'], inside=h(s * 0.12, 0.02, 0.21))


# Arms and the club --------------------------------------------------------------------------------

SHOULDERS = {s: hunched(V(s * 0.45, 0.05, 1.64)) for s in (-1, 1)}  # its left (+X) and right
UPPER_ARM, FOREARM = 0.44, 0.42  # long arms, as trolls have

# The club, held across its body as Dáin holds his mattock: the right fist low before its right hip,
# the haft up to its left, the left fist further up it, and the head over its left shoulder.
R_FIST = V(-0.24, -0.54, 1.0)
HAFT = V(math.cos(math.radians(48)), 0.05, math.sin(math.radians(48))).normalized()
L_GRIP = 0.42  # how far up the haft from the right fist the left fist is
BUTT_AT, HEAD_AT, END_AT = -0.14, 0.74, 0.96  # the butt, the middle of the head, and its end


def arm(side, fist, pole):
    """An arm from its shoulder to a fist at `fist` round the haft, the elbow bent towards `pole`."""
    s = 'l' if side == 'left' else 'r'
    shoulder = SHOULDERS[1 if s == 'l' else -1]
    reach = (fist - shoulder).normalized()
    elbow = bend(shoulder, fist - 0.08 * reach, UPPER_ARM, FOREARM, pole)
    wrist = fist - 0.08 * (fist - elbow).normalized()
    past = elbow + 0.06 * (wrist - elbow).normalized()
    above = elbow + 0.06 * (shoulder - elbow).normalized()
    with bone(f'upper_arm_{s}'):
        verts, faces, _ = loft(segment(shoulder, past, [(-0.1, 0.15), (0.5, 0.14), (1, 0.12)], 6, 30))
        part(f'upper-arm-{side}', verts, faces, [M['hide'], M['scales']], scaly(faces, 6),
             inside=nearest_on_line(shoulder, past))
    with bone(f'forearm_{s}'):
        verts, faces, _ = loft(segment(above, wrist, [(0, 0.11), (0.45, 0.145), (1, 0.115)], 6, 30))
        part(f'forearm-{side}', verts, faces, [M['hide'], M['scales']], scaly(faces, 6),
             inside=nearest_on_line(above, wrist))
        # Bony scales raised along the outside of the forearm.
        along = (wrist - above).normalized()
        out = V(1 if s == 'l' else -1, 0.3, 0.4)
        out = (out - out.dot(along) * along).normalized()
        for k, t in enumerate((0.25, 0.5, 0.75)):
            base = above.lerp(wrist, t) + (0.12 + 0.025 * math.sin(math.pi * t)) * out
            cone(f'forearm-scute-{side}-{k}', base - 0.02 * out, base + 0.06 * out - 0.03 * along, 0.035,
                 M['scales'], n=4, back=None)
    ahead = (fist - elbow).normalized()
    across = (HAFT - HAFT.dot(ahead) * ahead).normalized()
    with bone(f'hand_{s}'):
        box(f'fist-{side}', fist, [ahead, across, ahead.cross(across)], (0.1, 0.1, 0.095), M['hide'], 0.85)
    joint(f'shoulder_{s}', shoulder)
    joint(f'elbow_{s}', elbow)
    joint(f'wrist_{s}', wrist)
    joint(f'fist_{s}', fist + 0.04 * ahead)


def club():
    """A stripped tree-trunk, thin at the grip and swelling to a knotted head, banded with iron and
    studded with iron spikes; on the right hand, which holds it from its grip up to its head."""
    along = HAFT
    butt, end = R_FIST + BUTT_AT * HAFT, R_FIST + END_AT * HAFT
    stations = [(0.0, 0.05), (0.45, 0.06), (0.72, 0.11), (0.93, 0.14), (1.0, 0.12)]
    verts, faces, _ = loft(segment(butt, end, stations, 7, 0))
    verts.append(end + 0.03 * along)
    last = (len(stations) - 1) * 7
    faces += [(last + i, last + (i + 1) % 7, len(verts) - 1) for i in range(7)]
    verts.append(butt - 0.02 * along)
    faces += [(i, (i + 1) % 7, len(verts) - 1) for i in range(7)]
    part('club', verts, faces, M['wood'], inside=nearest_on_line(butt, end))
    for k, t in enumerate((0.7, 0.9)):  # iron bands round the head
        c = butt.lerp(end, t)
        r = 0.11 + 0.035 * (t - 0.7) / 0.2
        tube(f'band-{k}', c - 0.025 * along, c + 0.025 * along, [(0, r + 0.012), (1, r + 0.012)], M['trim'], n=7)
    centre = R_FIST + HEAD_AT * HAFT
    face = V(0, -1, 0)
    face = (face - face.dot(along) * along).normalized()
    side = along.cross(face)
    for k, (out, at) in enumerate(((face, 0.8), (side, 0.82), (-side, 0.84), (-face, 0.79), (face, 0.98))):
        c = butt.lerp(end, at)
        cone(f'spike-{k}', c + 0.11 * out, c + 0.19 * out, 0.035, M['iron'], n=3, back=None)
    return centre, face


def arms():
    with bone('hand_r'):
        centre, face = club()
    # The right arm reaches down and forward to the grip, the elbow out and back; the left across its
    # body to the haft higher up, the elbow out to its left.
    arm('right', R_FIST, SHOULDERS[-1] + V(-0.25, 0.25, -0.2))
    arm('left', R_FIST + L_GRIP * HAFT, SHOULDERS[1] + V(0.3, 0.15, -0.3))
    # Held by the right fist, low on the haft, up it to the head, its face forward: the left fist holds
    # it further up and keeps hold of it (clips.both_hands()).
    hold('r', R_FIST, centre, centre + 0.1 * face)


# Its blows (../clips.py, haft_blow(): the path a weapon held in both hands is drawn along, as smite and
# slam draw it). Smite and slam are a Dwarf's, whose blows land low before him with his hands before his
# chest; a troll's shoulders stand higher than a Man's head and its hands would have to reach past its
# arms' length for theirs. So it has its own: the club heaved up high over its head, back over its
# shoulders, and brought straight over and down before it, its hands low and out ahead of its belly, the
# body bowing into it. Its attack lands on a Man's head and shoulders ahead of it on frame 3, as keyed;
# its cast, Smash, is heaved higher, the body rearing, and slammed into the ground before it on frame 4,
# held braced, then lifted out. Each is the path of the two hands' middle from the middle of its
# shoulders, in units of its arm's reach, x outwards on its right; the way the haft points from them;
# and the way the right elbow points; then its body and how low it crouches (haft_blow()).
ELBOW = (0.6, 0.35, -0.5)
OVERHEAD = [  # frame, ease, the middle of the hands, the way the haft points, the elbow
    (0, 'smooth', (0.1, 0.3, 0.6), (-0.1, 0.6, 0.8), (0.7, 0.3, -0.2)),
    (1, 'in', (0.1, 0.25, 0.65), (-0.05, -0.1, 0.99), (0.7, 0.3, -0.3)),
    (2, 'in', (0.06, 0.1, 0.45), (-0.05, -0.75, 0.66), ELBOW),
    (BLOW, 'in', (0.0, -0.18, -0.55), (-0.1, -0.55, -0.83), ELBOW),
    (BLOW + 2, 'out', (0.0, -0.17, -0.52), (-0.1, -0.56, -0.81), ELBOW),
    (BLOW + 5, 'smooth', (0.0, -0.16, -0.5), (-0.1, -0.55, -0.8), ELBOW),
    (BLOW + 8, 'smooth', (0.08, -0.13, -0.6), (-0.1, -0.2, -0.97), ELBOW),
    (BLOW + 11, 'smooth', (0.1, -0.18, -0.52), (-0.7, -0.1, 0.1), ELBOW),
    (BLOW + 14, 'smooth', (0.0, -0.2, -0.45), (-0.3, 0.05, 0.8), ELBOW),
]
OVERHEAD_BODY = [  # frame, ease, hips, spine and head as (pitch, yaw)
    (0, 'smooth', (-3, 0), (-12, 0), (8, 0)),
    (1, 'in', (-2, 0), (-8, 0), (6, 0)),
    (2, 'in', (2, 0), (6, 0), (0, 0)),
    (BLOW, 'in', (3, 0), (11, 0), (-12, 0)),
    (BLOW + 2, 'out', (3, 0), (10, 0), (-10, 0)),
    (BLOW + 5, 'smooth', (3, 0), (9, 0), (-9, 0)),
    (BLOW + 8, 'smooth', (2, 0), (7, 0), (-6, 0)),
    (BLOW + 14, 'smooth', (1, 0), (4, 0), (-2, 0)),
]
OVERHEAD_CROUCH = [(0, 'smooth', 0.0, 0.0), (2, 'in', 0.05, 0.02), (BLOW, 'in', 0.12, 0.06),
                   (BLOW + 2, 'out', 0.11, 0.06), (BLOW + 5, 'smooth', 0.1, 0.05), (BLOW + 14, 'smooth', 0.03, 0.01)]
SMASH = 4  # the frame the club strikes the ground on, as keyed
SLAM = [
    (0, 'smooth', (0.1, 0.32, 0.62), (-0.1, 0.55, 0.83), (0.7, 0.3, -0.2)),
    (SMASH - 2, 'in', (0.1, 0.28, 0.68), (-0.05, 0.1, 0.99), (0.7, 0.3, -0.3)),
    (SMASH - 1, 'in', (0.06, 0.12, 0.45), (-0.05, -0.7, 0.71), ELBOW),
    (SMASH, 'in', (0.0, -0.2, -0.75), (-0.05, -0.35, -0.94), ELBOW),
    (SMASH + 3, 'out', (0.0, -0.19, -0.72), (-0.05, -0.36, -0.93), ELBOW),
    (SMASH + 12, 'smooth', (0.0, -0.19, -0.71), (-0.05, -0.36, -0.93), ELBOW),
    (SMASH + 15, 'smooth', (0.08, -0.13, -0.65), (-0.1, -0.2, -0.97), ELBOW),
    (SMASH + 17, 'smooth', (0.1, -0.18, -0.52), (-0.7, -0.1, 0.1), ELBOW),
    (SMASH + 18, 'smooth', (0.0, -0.2, -0.45), (-0.3, 0.05, 0.8), ELBOW),
]
SLAM_BODY = [
    (0, 'smooth', (-4, 0), (-16, 0), (10, 0)),
    (SMASH - 2, 'in', (-5, 0), (-18, 0), (10, 0)),
    (SMASH - 1, 'in', (2, 0), (6, 0), (0, 0)),
    (SMASH, 'in', (9, 0), (26, 0), (-14, 0)),
    (SMASH + 3, 'out', (8, 0), (24, 0), (-13, 0)),
    (SMASH + 12, 'smooth', (8, 0), (23, 0), (-12, 0)),
    (SMASH + 18, 'smooth', (3, 0), (8, 0), (-4, 0)),
]
SLAM_CROUCH = [(0, 'smooth', -0.02, -0.02), (SMASH - 2, 'in', -0.03, 0.0), (SMASH - 1, 'in', 0.05, 0.03),
               (SMASH, 'in', 0.18, 0.08), (SMASH + 3, 'out', 0.16, 0.08), (SMASH + 12, 'smooth', 0.15, 0.07),
               (SMASH + 18, 'smooth', 0.05, 0.02)]


def overhead(rig):
    """Its attack: the club over its head and down on the foe ahead, timed to the sim (timed())."""
    return timed(rig, 'attack', haft_blow(rig, 'r', 0.67, 'strike', BLOW, OVERHEAD, OVERHEAD_BODY, OVERHEAD_CROUCH))


def smash(rig):
    """Its cast, Smash: the club heaved up and slammed into the ground before it, at its height at the end
    of the wind-up (timed())."""
    return timed(rig, 'cast', haft_blow(rig, 'r', 0.8, 'height', SMASH, SLAM, SLAM_BODY, SLAM_CROUCH))


RAISED = 16  # the frame its victory holds from
HELD_UP = [  # as OVERHEAD: the club lifted from where it rests and thrust up over its head, behind it
    (0, 'smooth', (0.12, -0.25, -0.5), (-0.67, 0.05, 0.74), ELBOW),
    (6, 'smooth', (0.12, -0.17, -0.32), (-0.6, 0.0, 0.8), ELBOW),
    (12, 'out', (0.15, 0.15, 0.6), (-0.25, 0.05, 0.97), (0.7, 0.3, -0.2)),
    (RAISED, 'smooth', (0.15, 0.16, 0.56), (-0.3, 0.05, 0.95), (0.7, 0.3, -0.2)),
]
HELD_UP_BODY = [
    (0, 'smooth', (0, 0), (0, 0), (0, 0)),
    (6, 'smooth', (2, 0), (6, 0), (4, 0)),
    (12, 'out', (-4, 0), (-14, 0), (-12, 0)),
    (RAISED, 'smooth', (-3, 0), (-12, 0), (-14, 0)),
]
HELD_UP_CROUCH = [(0, 'smooth', 0.0, 0.0), (6, 'smooth', 0.06, 0.0), (12, 'out', -0.02, 0.0),
                  (RAISED, 'smooth', 0.0, 0.0)]


def victory(rig):
    """Its victory: the club lifted in both hands and thrust up over its head, the body rearing back
    and the head thrown up, and held there from frame RAISED (haft_blow() would bring it back down)."""
    made_clip = haft_blow(rig, 'r', 0.8, 'height', 12, HELD_UP, HELD_UP_BODY, HELD_UP_CROUCH)
    pose = made_clip.pose
    return Clip(made_clip.frames, lambda f: pose(min(f, RAISED)))


# Its clips (../clips.py): slow and heavy, as Treebeard's. It stands breathing slow, the club across
# it; strides long and low, the club carried in both hands; clubs the foe overhead, and for Smash heaves
# it up and slams it into the ground (above); sways, dazed, the club let down; sinks to its knees as it
# falls, the club laid down before it; and thrusts the club up over its head in both hands as it
# wins (victory()). Kept in its hex by fit(), its
# left hand on the haft by both_hands().
CLIPS = both_hands(fit({
    'idle': ('ready', {'seconds': 2.6, 'breath': 0.8, 'sway': 0.7, 'crouch': 0.04}),
    'move': ('run', {'seconds': 0.6, 'heavy': 1.0, 'stride': 0.42, 'lift': 0.16, 'lean': 6.0}),
    'attack': overhead,
    'cast': smash,
    'stun': ('dazed', {'seconds': 1.5, 'low': 1.0}),
    'death': ('knees', {'slump': 0.8, 'back': 0.25}),
    'victory': victory,
}, between=True), held=('idle', 'move', 'attack', 'cast', 'victory'))


def build():
    """Makes it in a fresh scene, every part bound to its bone and its joints marked, and returns the
    rig to finish() it with."""
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    body()
    loincloth()
    back_rag()
    collar()
    hunch(new_objects(before))
    head()
    arms()
    for o in bpy.context.scene.objects:  # grown to its size, joints and all
        o.data.transform(Matrix.Scale(SCALE, 4))
    return Rig(kind='large', clips=CLIPS)


def main():
    finish('cave-troll', budget=LARGE_BUDGET, rig=build())


if __name__ == '__main__':
    main()
