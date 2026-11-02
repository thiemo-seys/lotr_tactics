"""Grishnákh, the Orc: a Burglar of Mordor, in the Faceted style (docs/viewer-spec.md section 4).

His 3★ model, the book moment (docs/viewer-spec.md section 4, "Star levels"): the same crouching orc
as grishnakh.py on the night under the eaves of Fangorn when he steals Merry and Pippin out of the
Uruk-hai's camp, one under each long arm, hoping to find on them the Ring they do not have (The Two
Towers, III 3, "The Uruk-hai").

- His blades are back in his belt to free his arms: the long knife and the curved dagger in dark
  sheaths crossed over his seat, their hilts up on either side of the small of his back.
- The captives, bound hand and foot in their grey-green cloaks of Lórien, are crushed to his sides
  face down, their heads behind him and their legs forward, where his hands clutch their bound
  ankles. So the camera behind him, as the near side is seen, finds their curls, Merry's chestnut
  and Pippin's straw, and the camera in front their big bare feet, with their heads beyond his
  shoulders. They are smaller than the hobbits' own models but keep a hobbit's big curly head and big
  feet, and nothing on them is the team colour.

The team colour is his hood and cape, as at 1★. Fittings use `trim`: the guards and pommels of the
blades in his belt, the belt buckle, the studs on his belt and jerkin, and two rivets on each bracer,
which show from in front.

    blender --background --factory-startup --python-exit-code 1 --python grishnakh-3.py [-- <out.glb>]

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
    V,
    bent_tube,
    box,
    cone,
    ellipse,
    finish,
    loft,
    lump,
    material,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    trim_material,
    tube,
)

# Grishnákh's own colours (sRGB); the rest come from the kit. His skin, iron and bone are his
# people's, as Gorbag has them.
SKIN = 0x7E7A5A  # sallow, olive-grey
IRON = 0x5D6166  # crude, blackened iron
BONE = 0xD5CAA8  # his tusks
TUNIC = 0x433C34  # a grimy jerkin
# His captives' colours: the hobbits' own (merry.py, pippin.py) and their cloaks of Lórien.
CLOAK = 0x87927F  # the grey-green of an elven cloak, light and muted, so it stands apart from his skin
HOBBIT = 0xE2AF8A  # a hobbit's skin, warm
CHESTNUT = 0x8A522E  # Merry's curls
STRAW = 0xD4B776  # Pippin's
ROPE = 0xB3A685  # the orcs' cords, pale on the cloaks

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        tunic=material('tunic', TUNIC, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        cloth=material('cloth', CLOTH, roughness=0.9),
        iron=material('iron', IRON, roughness=0.6, metallic=0.1),
        trim=trim_material(),  # fittings, recoloured by star
        bone=material('bone', BONE, roughness=0.7),
        eyes=material('eyes', EYES, roughness=0.6),
        cloak=material('cloak', CLOAK, roughness=0.9),
        hobbit=material('hobbit', HOBBIT, roughness=0.85),
        chestnut=material('chestnut', CHESTNUT, roughness=0.9),
        straw=material('straw', STRAW, roughness=0.9),
        rope=material('rope', ROPE, roughness=0.95),
    )


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


# The crouch --------------------------------------------------------------------------------------
#
# The body above the hips is built upright and then bent by hunched(), as Gorbag's is but further: it
# leans forward about the hips, and above the small of the back the spine curls on over, so the
# shoulders round into a hump and the neck comes out of the front of them.

PIVOT = V(0, 0.03, 0.42)  # the hips
LEAN = 22  # degrees the body above the hips leans forward
MID = V(0, 0.04, 0.56)  # the small of the back
CURL = 30  # further degrees the shoulders curl forward over it
CURL_SPAN = 0.22  # the height over which the curl comes in
TWIST = 10  # degrees his chest turns to his left above square hips, the knife shoulder forward
TWIST_FROM, TWIST_SPAN = 0.45, 0.3  # the height the twist starts at and the height it comes in over


def hunched(p):
    """Where a point of the upright body is once he crouches and turns."""
    p = Vector(p)
    t = min(max((p.z - MID.z) / CURL_SPAN, 0.0), 1.0)
    twist = TWIST * min(max((p.z - TWIST_FROM) / TWIST_SPAN, 0.0), 1.0)
    if t > 0:
        p = MID + Matrix.Rotation(math.radians(CURL * t), 3, 'X') @ (p - MID)
    p = PIVOT + Matrix.Rotation(math.radians(LEAN), 3, 'X') @ (p - PIVOT)
    return PIVOT + Matrix.Rotation(math.radians(twist), 3, 'Z') @ (p - PIVOT)


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


# Legs: crooked and bowed, the knees out wide and bent deep, the left foot forward ------------------

R_HIP, R_KNEE, R_ANKLE, R_YAW = V(-0.11, 0.07, 0.42), V(-0.29, -0.03, 0.25), V(-0.25, 0.13, 0.1), -28
L_HIP, L_KNEE, L_ANKLE, L_YAW = V(0.11, 0.0, 0.42), V(0.29, -0.17, 0.26), V(0.24, -0.08, 0.1), 22

# Crude boots from the sole up, in the foot's own frame (toes towards -y): the height of each ring and
# the right half of it, side, heel and toe, mirrored by boot().
BOOT_RINGS = [
    (0.0, [(0.095, -0.02), (0.08, 0.09), (0.062, -0.18)]),  # the sole
    (0.065, [(0.095, -0.01), (0.082, 0.085), (0.054, -0.135)]),  # the toe rises to a blunt point
    (0.16, [(0.08, 0.0), (0.072, 0.075), (0.06, -0.055)]),  # round the ankle
]


def boot(name, ankle, yaw):
    spin = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + spin @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['boots'], inside=at + V(0, 0, 0.07))


def legs():
    for side, hip, knee, ankle, yaw in (('right', R_HIP, R_KNEE, R_ANKLE, R_YAW),
                                        ('left', L_HIP, L_KNEE, L_ANKLE, L_YAW)):
        # One bent tube from inside the hips through the knee into the boot, so the knee has no seam:
        # breeches on the thigh, the bare shin below.
        top, bottom = hip + 0.1 * (hip - knee), ankle + 0.3 * (ankle - knee)
        bent_tube(f'leg-{side}', [top, knee, bottom], [0.1, 0.074, 0.056], [M['cloth'], M['skin']], [0, 1])
        boot(f'boot-{side}', ankle, yaw)
        # A crude iron cop over the knee, which hides the joint: it points out of the bend, and forward.
        forward = knee - (hip + ankle) / 2
        forward = V(forward.x, forward.y - 0.08, 0).normalized()
        base = segment(knee, knee + forward, [(0, 0.066)], 4, 45)[0]
        verts = base + [knee + 0.095 * forward + V(0, 0, 0.01)]
        part(f'knee-{side}', verts, [(i, (i + 1) % 4, 4) for i in range(4)], M['iron'], inside=knee)


# Body --------------------------------------------------------------------------------------------

# A barrel of octagons, built upright and then hunched: z, half-width, half-depth and centre y. He is
# broader than Gorbag across the chest and shoulders.
TORSO = [
    (0.34, 0.175, 0.14, 0.03),  # hips
    (0.42, 0.2, 0.155, 0.03),  # belt, lower edge
    (0.5, 0.21, 0.16, 0.03),  # belt, upper edge
    (0.64, 0.3, 0.2, 0.03),  # chest
    (0.77, 0.3, 0.19, 0.05),  # shoulders
    (0.87, 0.15, 0.13, 0.01),  # neck
]
TORSO_BANDS = [0, 1, 2, 2, 2]  # breeches, belt, jerkin
NECK = V(0, 0.01, 0.87)


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    faces.append(tuple(range(len(verts) - 8, len(verts))))  # the top of the neck
    face_mats.append(3)
    mats = [M['cloth'], M['leather'], M['tunic'], M['skin']]
    part('torso', verts, faces, mats, face_mats, inside=lambda c: V(0, 0.03, min(max(c.z, 0.4), 0.85)))


def on_torso(degrees, z):
    """The point of the upright torso at `degrees` round from +X (90 is the middle of his back) and
    height z, on its octagons, and the way out of it there."""
    for (z0, rx0, ry0, cy0), (z1, rx1, ry1, cy1) in zip(TORSO, TORSO[1:]):
        if z0 <= z <= z1:
            break
    t = (z - z0) / (z1 - z0)
    k = math.floor((degrees - 22.5) / 45)
    s = (degrees - 22.5 - 45 * k) / 45  # how far along the face from its first corner
    corners = []
    for a in (math.radians(22.5 + 45 * k), math.radians(22.5 + 45 * (k + 1))):
        low = V(rx0 * math.cos(a), cy0 + ry0 * math.sin(a), z0)
        high = V(rx1 * math.cos(a), cy1 + ry1 * math.sin(a), z1)
        corners.append((low, high))
    (a_low, a_high), (b_low, b_high) = corners
    p = a_low.lerp(a_high, t).lerp(b_low.lerp(b_high, t), s)
    out = (b_low - a_low).cross(a_high - a_low).normalized()
    if out.dot(p - V(0, 0.03, z)) < 0:
        out = -out
    return p, out


def stud(name, degrees, z, size=0.017):
    """A stud of trim, a low four-sided point, on the upright torso."""
    at, out = on_torso(degrees, z)
    cone(name, at - 0.004 * out, at + 1.3 * size * out, size, M['trim'], n=4, phase=45, back=None)


def fittings():
    """The belt buckle in front, and studs on the back of his belt and of his jerkin below the cape,
    where they show from behind between its rags."""
    at, out = on_torso(270, 0.46)
    box('buckle', at + 0.006 * out, [out, V(1, 0, 0), V(0, 0, 1)], (0.01, 0.045, 0.036), M['trim'], 0.7)
    for degrees in (45, 90, 135):
        stud(f'belt-stud-{degrees}', degrees, 0.46)
    for degrees in (67.5, 112.5):
        stud(f'jerkin-stud-{degrees}', degrees, 0.56)


# The cape over his hump: a ragged mantle round his neck and over his shoulders and the top of the hump,
# below which his jerkin shows. Eight points from his left (+X), the first behind it.
CAPE_COLLAR_Z = [0.92, 0.95, 0.95, 0.92, 0.89, 0.87, 0.87, 0.89]
CAPE_SHOULDER_Z = [0.77, 0.76, 0.76, 0.77, 0.78, 0.785, 0.785, 0.78]
CAPE_HEM_Z = [0.70, 0.68, 0.68, 0.70, 0.71, 0.72, 0.72, 0.71]
CAPE_RAGS = [0.12, 0.16, 0.13, 0.1, 0.08, 0.12, 0.09, 0.11]  # how far each rag hangs below the hem


def cape():
    n = 8
    collar = ellipse(0, 0.01, 0, 0.17, 0.16, n, 22.5, CAPE_COLLAR_Z)
    dome = ellipse(0, 0.025, 0, 0.3, 0.225, n, 22.5, [z - 0.065 for z in CAPE_COLLAR_Z])
    shoulder = ellipse(0, 0.035, 0, 0.365, 0.265, n, 22.5, CAPE_SHOULDER_Z)
    hem = ellipse(0, 0.035, 0, 0.36, 0.265, n, 22.5, CAPE_HEM_Z)
    verts, faces, _ = loft([hem, shoulder, dome, collar])  # the hem's points come first
    # Rags hang in points from the hem, longest down his back.
    for i, drop in enumerate(CAPE_RAGS):
        mid = (verts[i] + verts[(i + 1) % n]) / 2
        out = V(mid.x, mid.y - 0.035, 0).normalized()
        verts.append(mid + 0.012 * out - V(0, 0, drop))
        faces.append((i, (i + 1) % n, len(verts) - 1))
    part('cape', verts, faces, M['team'], inside=lambda c: V(0, 0.035, min(c.z, 0.8) - 0.12))


# Head ----------------------------------------------------------------------------------------------

HEAD_SCALE = 1.15  # the head is drawn big, as Gimli's is, so it reads at game size
HEAD_TILT = 5  # degrees he tips his head back to peer up from his crouch
# The middle of the underside of his jaw: thrust out in front of the hump, on the end of his neck.
HEAD = hunched(NECK) + V(0, -0.13, -0.02)

# The skull in rings from under the jaw to the temples: the height of each above HEAD, then the left
# half of it from HEAD as (x, y): the side, the back corner, the back, the front corner and the front.
SKULL = [
    (0.0, (0.115, -0.04), (0.07, 0.05), 0.065, (0.092, -0.19), -0.235),  # under the jaw, jutting
    (0.075, (0.15, -0.01), (0.105, 0.09), 0.115, (0.12, -0.165), -0.205),  # the mouth
    (0.165, (0.152, 0.005), (0.11, 0.105), 0.135, (0.124, -0.115), -0.15),  # wide cheekbones and eyes
    (0.245, (0.12, 0.015), (0.092, 0.105), 0.13, (0.088, -0.08), -0.105),  # brow and temples
]
CROWN = (0, 0.03, 0.3)


def h(x, y, z):
    """A point of the head, from HEAD in the head's own (unscaled) measure."""
    return HEAD + HEAD_SCALE * V(x, y, z)


def head():
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

    face, jaw = front(1), front(0)

    def on(tris, x, z, lift):
        """A point of the head at (x, z) laid `lift` proud of the surface `tris`."""
        p = h(x, 0, z)
        return V(p.x, on_surface(tris, p.x, p.z) - lift, p.z)

    # Slanted eyes under the brow.
    for s in (-1, 1):
        corners = [on(face, x, z, 0.006) for x, z in ((s * 0.03, 0.127), (s * 0.1, 0.152), (s * 0.07, 0.116))]
        part(f'eye-{s}', corners, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))

    # A heavy shelf of brow, dipping in the middle in a scowl.
    sections = [
        [h(-0.12, -0.05, 0.205), h(-0.12, -0.125, 0.185), h(-0.12, -0.07, 0.16)],
        [h(0, -0.13, 0.2), h(0, -0.2, 0.168), h(0, -0.155, 0.142)],
        [h(0.12, -0.05, 0.205), h(0.12, -0.125, 0.185), h(0.12, -0.07, 0.16)],
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brow', verts, faces, M['skin'], inside=h(0, -0.09, 0.17))

    # A long, hooked nose, its tip hanging over his lip.
    top, hump, tip = h(0, -0.15, 0.165), h(0, -0.235, 0.13), h(0, -0.29, 0.06)
    left, right, under = h(0.055, -0.165, 0.08), h(-0.055, -0.165, 0.08), h(0, -0.2, 0.055)
    verts = [top, hump, tip, left, right, under]
    faces = [(0, 3, 1), (0, 1, 4), (1, 3, 2), (1, 2, 4), (3, 5, 2), (5, 4, 2)]
    part('nose', verts, faces, M['skin'], inside=h(0, -0.14, 0.1))

    # A wide mouth.
    outline = [(0.1, 0.04), (0.04, 0.058), (-0.04, 0.058), (-0.1, 0.045), (-0.04, 0.044), (0.04, 0.044)]
    verts = [on(jaw, x, z, 0.005) for x, z in outline]
    part('mouth', verts, [(0, 1, 5), (1, 2, 4, 5), (2, 3, 4)], M['eyes'], outward=V(0, -1, 0))

    # Short tusks from the lower jaw, up past the lip.
    for s in (-1, 1):
        x = s * 0.085
        base = on(jaw, x, 0.03, 0.0)
        y = (base.y - HEAD.y) / HEAD_SCALE
        verts = [h(x - 0.03, y + 0.008, 0.015), h(x + 0.03, y + 0.008, 0.015), h(x, y + 0.042, 0.012),
                 h(x + s * 0.03, y - 0.05, 0.095)]
        part(f'tusk-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['bone'], inside=h(x, y + 0.01, 0.05))

    # Big pointed ears, out through slits in the hood, sideways and back.
    for s in (-1, 1):
        verts = [h(s * 0.128, -0.035, 0.12), h(s * 0.122, 0.07, 0.14), h(s * 0.115, 0.02, 0.225),
                 h(s * 0.4, 0.12, 0.24)]
        part(f'ear-{s}', verts, [(0, 2, 3), (2, 1, 3), (1, 0, 3)], M['skin'], inside=h(s * 0.1, 0.02, 0.15))


# The hood: arches over his head from front to back, each from his left jaw over the top to his right,
# drawn back to a point above the back of his head.
HOOD = [  # y, half-width, centre height and half-height of each arch, front to back
    (-0.05, 0.175, 0.11, 0.22),
    (0.04, 0.192, 0.1, 0.25),
    (0.13, 0.18, 0.08, 0.245),
    (0.21, 0.135, 0.06, 0.2),
]
HOOD_RAKE = 0.05  # how much further forward each arch's top is than its middle, so it overhangs the brow
HOOD_ARC = (-55, 235)  # degrees round each arch from the +X axis, from its left end to its right
HOOD_POINTS = 8
HOOD_TAIL = (-0.06, 0.35, 0.33)  # the point, flopped a little to his right


def hood():
    first, last = HOOD_ARC
    angles = [math.radians(first + (last - first) * i / (HOOD_POINTS - 1)) for i in range(HOOD_POINTS)]
    arches = [[h(rx * math.cos(a), y - HOOD_RAKE * math.sin(a), zc + rz * math.sin(a)) for a in angles]
              for y, rx, zc, rz in HOOD]
    verts, faces, _ = loft(arches, closed=False)
    tail = len(verts)
    verts.append(h(*HOOD_TAIL))
    base = (len(HOOD) - 1) * HOOD_POINTS
    faces += [(base + i, base + i + 1, tail) for i in range(HOOD_POINTS - 1)]
    part('hood', verts, faces, M['team'], inside=h(0, 0.04, 0.1))


# The knives, back in his belt -----------------------------------------------------------------------
#
# He has thrust both blades into his belt behind him to free his hands: the long knife and the curved
# dagger in dark sheaths, crossed over his seat, their hilts up and out above the belt on either side
# of the small of his back. Placed on the upright body, then carried by hunched() as straight parts.

# Each blade: where its sheath's mouth is on the belt (degrees round from his left, 90 behind), the
# way its hilt points in the upright body (out to that side and up), and its sheath's length.
BELT_KNIVES = [('knife', 118, V(-0.75, 0.0, 1.0), 0.3), ('dagger', 62, V(0.75, 0.0, 1.0), 0.22)]


def belt_knives():
    for name, degrees, hilt, length in BELT_KNIVES:
        at, out = on_torso(degrees, 0.49)
        up = (hilt - hilt.dot(out) * out).normalized()
        mouth = at + 0.03 * out
        low = mouth - length * up + 0.03 * out  # the sheath stands off his seat towards its tip
        mouth, low = hunched(mouth), hunched(low)
        side = (hunched(at + 0.1 * out) - hunched(at)).normalized()
        sheathed(name, mouth, low, side)


def sheathed(name, mouth, low, out):
    """A blade in a dark sheath from its tip at `low` to its mouth, the hilt beyond, its flat towards
    `out`: a guard and pommel of trim and a leather grip, as on the drawn blades of the 1★."""
    along = (mouth - low).normalized()
    side = along.cross(out).normalized()
    bent_tube(f'{name}-sheath', [mouth, low], [(0.034, 0.015), (0.022, 0.011)], M['boots'], n=4, phase=45,
              side=side, start='cap', end=low - 0.04 * along)
    guard = mouth + 0.012 * along
    box(f'{name}-guard', guard, [along, side, out], (0.012, 0.05, 0.024), M['trim'])
    top = guard + 0.012 * along + 0.13 * along
    tube(f'{name}-grip', guard, top, [(0, 0.022), (1, 0.022)], M['leather'], n=5)
    cone(f'{name}-pommel', top - 0.01 * along, top + 0.04 * along, 0.03, M['trim'], n=5, back=top - 0.03 * along)


# The captives -------------------------------------------------------------------------------------
#
# Merry and Pippin, bound hand and foot and each wrapped in the grey-green cloak of Lórien, its hood
# thrown back under their curls, crushed to his sides under his long arms, face down, their heads
# behind him and their legs forward, where his hands clutch their bound ankles. So the camera behind
# him, as the near side is seen, finds their curly heads, and the camera in front their big bare
# feet. A little smaller than the hobbits' own models, so he can carry them, but with a hobbit's big
# curly head and big feet. Each is built in its own frame, its head towards -Y and its back up (+Z),
# then scaled, turned and laid where it is carried.

# The bundle of the body in the cloak, from the shoulders to the ankles: y, half-width, half-height and
# centre z of each ring.
BUNDLE = [
    (-0.13, 0.072, 0.058, 0.0),  # the shoulders, under the head
    (-0.05, 0.088, 0.071, 0.004),  # the chest, the arms bound behind it
    (0.06, 0.085, 0.069, 0.008),  # the hips
    (0.17, 0.061, 0.05, 0.0),  # the knees
    (0.26, 0.042, 0.036, -0.006),  # the ankles, bound together
]
HEAD_AT, HEAD_RADII = V(0, -0.232, 0.05), (0.104, 0.1, 0.098)  # the head, big, a little raised
CURLS_AT, CURLS_RADII = V(0, -0.218, 0.088), (0.116, 0.102, 0.086)  # the curls over its top and back
HOOD_AT, HOOD_RADII = V(0, -0.15, 0.062), (0.09, 0.062, 0.05)  # the cloak's hood, thrown back at the nape
ROPES = [(-0.035, 0.012), (0.225, 0.008)]  # each binding: where along the body, and how far it stands out
FOOT_AT = V(0.036, 0.29, -0.05)  # the middle of the left foot (mirrored for the right): toes down
FOOT_HALF = (0.074, 0.034, 0.02)  # heel to toe, across, and sole to instep
CAPTIVE_SCALE = 1.2

# Who, the colour of their curls, where the middle of each is, and its turn, roll and pitch (head up),
# in degrees: turned round to lie head backwards, and 10 degrees further to his left, as his chest
# turns, with its back rolled a little outwards.
CAPTIVES = [
    ('merry', 'chestnut', V(-0.41, 0.0, 0.45), 190, 18, -24),  # under his right arm
    ('pippin', 'straw', V(0.43, 0.06, 0.45), 190, -18, -24),  # under his left
]


def captive_frame(centre, yaw, roll, pitch):
    return (Matrix.Translation(centre) @ Matrix.Rotation(math.radians(yaw), 4, 'Z')
            @ Matrix.Rotation(math.radians(roll), 4, 'Y') @ Matrix.Rotation(math.radians(pitch), 4, 'X')
            @ Matrix.Scale(CAPTIVE_SCALE, 4))


def captive(name, hair, frame, seed):
    before = set(bpy.context.scene.objects)
    rings = [[V(a * math.cos(t), y, cz + b * math.sin(t)) for t in (math.tau * i / 6 for i in range(6))]
             for y, a, b, cz in BUNDLE]
    verts, faces, _ = loft(rings)
    faces += [tuple(range(6)), tuple(range(len(verts) - 6, len(verts)))]  # closed at both ends
    part(f'{name}-cloak', verts, faces, M['cloak'], inside=lambda c: V(0, min(max(c.y, -0.1), 0.23), 0))
    for k, (y, lift) in enumerate(ROPES):
        _, a, b, cz = min(BUNDLE, key=lambda r: abs(r[0] - y))
        a, b = a + lift, b + lift
        band = [[V(a * math.cos(t), y + dy, cz + b * math.sin(t)) for t in (math.tau * i / 6 for i in range(6))]
                for dy in (-0.012, 0.012)]
        verts, faces, _ = loft(band)
        part(f'{name}-rope-{k}', verts, faces, M['rope'], inside=lambda c, y=y: V(0, y, 0))
    lump(f'{name}-hood', HOOD_AT, HOOD_RADII, M['cloak'], seed + 2, rough=0.12)
    lump(f'{name}-head', HEAD_AT, HEAD_RADII, M['hobbit'], seed, rough=0.05)
    lump(f'{name}-curls', CURLS_AT, CURLS_RADII, M[hair], seed + 1, rough=0.22)
    for s in (-1, 1):
        at = V(s * FOOT_AT.x, FOOT_AT.y, FOOT_AT.z)
        box(f'{name}-foot-{s}', at, [V(0, 0.25, -1), V(1, 0, 0), V(0, 1, 0.25)], FOOT_HALF, M['hobbit'], 1.3)
    for obj in new_objects(before):
        obj.data.transform(frame)


# Arms ---------------------------------------------------------------------------------------------

UPPER_ARM, FOREARM = 0.3, 0.3  # long arms, longer than Gorbag's

# Each hand clutches a captive's bound ankles from the outside, its fingers round them: where its
# middle is in the captive's frame, and its half-sizes along the fingers, across them and through.
HAND_AT, HAND_HALF = V(0.0, 0.215, 0.02), (0.062, 0.05, 0.03)
POLE = V(0.35, 0.15, -0.05)  # out from the shoulder and back: the elbow rides over the captive


def arm(side, shoulder, hand, fingers, up, pole):
    """An arm from the shoulder to a hand at `hand`, its fingers along `fingers`, its back towards
    `up`, the elbow bent towards `pole`."""
    wrist = hand - HAND_HALF[0] * fingers
    elbow = bend(shoulder, wrist, UPPER_ARM, FOREARM, pole)
    ahead = (wrist - elbow).normalized()
    # One bent tube from inside the shoulder through the elbow into the hand, as at 1★: the bare arm,
    # then an iron bracer from halfway down the forearm, its edge standing proud.
    cuff = elbow.lerp(wrist, 0.45)
    points = [shoulder, elbow, cuff, cuff + 0.012 * ahead, wrist + 0.02 * fingers]
    bent_tube(f'arm-{side}', points, [0.078, 0.064, 0.058, 0.072, 0.06], [M['skin'], M['iron']], [0, 0, 1, 1])
    # Two rivets of trim on the bracer's outer face, where they show from in front and behind.
    out = V(math.copysign(1, shoulder.x), 0, 0.5)
    out = (out - out.dot(ahead) * ahead).normalized()
    for k, t in enumerate((0.3, 0.75)):
        at = (cuff + 0.012 * ahead).lerp(wrist, t) + (0.07 - 0.008 * t) * out
        cone(f'rivet-{side}-{k}', at - 0.004 * out, at + 0.02 * out, 0.017, M['trim'], n=4, phase=45, back=None)
    up = (up - up.dot(fingers) * fingers).normalized()
    box(f'hand-{side}', hand, [fingers, up, fingers.cross(up)], HAND_HALF, M['skin'], 0.85)


def arms():
    for (name, hair, centre, yaw, roll, pitch), side, sign, seed in zip(CAPTIVES, ('right', 'left'), (-1, 1), (7, 11)):
        frame = captive_frame(centre, yaw, roll, pitch)
        captive(name, hair, frame, seed)
        hand = frame @ HAND_AT
        fingers = V(-sign, 0, 0)  # inwards, round the ankles from their outer side
        up = frame.to_3x3().normalized() @ V(0, 0, 1)
        shoulder = hunched(V(sign * 0.25, 0.04, 0.72))
        arm(side, shoulder, hand, fingers, up, shoulder + V(sign * POLE.x, POLE.y, POLE.z))


def main():
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    fittings()
    cape()
    hunch(new_objects(before))
    belt_knives()
    before = set(bpy.context.scene.objects)
    head()
    hood()
    # Built upright, then tipped back on his neck so that he peers up from his crouch.
    pivot = HEAD + V(0, 0.1, 0.05)
    tilt = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(-HEAD_TILT), 4, 'X') @ Matrix.Translation(-pivot)
    for obj in new_objects(before):
        obj.data.transform(tilt)
    arms()
    finish('grishnakh-3', budget=BOOK_BUDGET)


main()
