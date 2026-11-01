"""Grishnákh, the Orc: a Burglar of Mordor, in the Faceted style (docs/viewer-spec.md section 4).

His 2★ model, with his gear (docs/viewer-spec.md section 4, "Star levels"): the 1★ Grishnákh
(grishnakh.py), in the same crouch with his long knife and curved dagger, plus one piece, a bandolier
of knives for a knife-fighter. A broad leather strap is slung over his left shoulder and across his
hump to under his right arm, over the team-colour cape, and three more knives ride in it across his
back in dark sheaths, their hilts up towards his neck, ready to his hand. From behind, as the near
side is seen, the strap and the row of knives cross the cape; from in front, their hilts rise
beyond his hood. Their guards and pommels, like his other fittings, use `trim`.

    blender --background --factory-startup --python-exit-code 1 --python grishnakh-2.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BOOTS,
    CLOTH,
    EYES,
    GEAR_BUDGET,
    LEATHER,
    STEEL,
    V,
    bent_tube,
    box,
    cone,
    ellipse,
    finish,
    loft,
    material,
    nearest_on_polyline,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    trim_material,
    tube,
    wind,
)

# Grishnákh's own colours (sRGB); the rest come from the kit. His skin, iron and bone are his
# people's, as Gorbag has them.
SKIN = 0x7E7A5A  # sallow, olive-grey
IRON = 0x5D6166  # crude, blackened iron
BONE = 0xD5CAA8  # his tusks
TUNIC = 0x433C34  # a grimy jerkin

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
        steel=material('steel', STEEL, roughness=0.5, metallic=0.1),
        trim=trim_material(),  # fittings, recoloured by star
        bone=material('bone', BONE, roughness=0.7),
        eyes=material('eyes', EYES, roughness=0.6),
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


# The gear for 2 stars: a bandolier of knives ------------------------------------------------------
#
# Built on the upright body, as the cape it lies on is, and hunched with it. The strap runs round him
# in a tilted loop, high over his left shoulder and low under his right arm, laid on whatever is
# outermost there: over the cape across his back and his chest, and under it at his right side, where
# it passes below the cape's hem. The knives ride in it across his back, square to it, their hilts
# up towards his neck: the hunch turns them to face the camera behind him, and their hilts reach up
# beyond his hood for the camera in front.

STRAP_Z, STRAP_RISE = 0.735, 0.09  # the height of the strap's middle, and how far it rises to his left
STRAP_WIDTH, STRAP_LIFT = 0.072, 0.012  # its width, and how far it stands off what it lies on
STRAP_STATIONS = 16  # points round the loop, every 22.5 degrees from his left
KNIVES = [62, 90, 118]  # where the knives ride in it, in degrees round from his left (90 is behind)
SHEATH = 0.13  # how far each sheath reaches below the strap's middle
GRIP = 0.09  # the length of each knife's grip, above its guard


def surface(objects):
    """A BVH tree of the given parts, to lay things on them."""
    verts, polys = [], []
    for obj in objects:
        base = len(verts)
        verts += [v.co.copy() for v in obj.data.vertices]
        polys += [[base + i for i in p.vertices] for p in obj.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def lay(tree, at, out):
    """The point of `tree` met coming in towards `at` along -`out`, and its outward normal there."""
    out = Vector(out).normalized()
    hit, normal, _, _ = tree.ray_cast(Vector(at) + 0.6 * out, -out, 1.2)
    if hit is None:
        raise ValueError(f'nothing to lay on at {tuple(at)}')
    return hit, (normal if normal.dot(out) > 0 else -normal)


def hem_at(degrees):
    """The height of the cape's hem at `degrees` round from his left, between its eight points."""
    k = ((degrees - 22.5) % 360) / 45
    i = int(k)
    return CAPE_HEM_Z[i % 8] + (CAPE_HEM_Z[(i + 1) % 8] - CAPE_HEM_Z[i % 8]) * (k - i)


def strap_point(trees, degrees):
    """The middle of the strap at `degrees` round from his left, lifted off what it lies on, and the
    way out there."""
    a = math.radians(degrees)
    z = STRAP_Z + STRAP_RISE * math.cos(a)
    tree = trees['under'] if z < hem_at(degrees) + 0.01 else trees['over']
    hit, normal = lay(tree, V(0, 0.03, z), V(math.cos(a), math.sin(a), 0))
    return hit + STRAP_LIFT * normal, normal


def bandolier():
    torso_part, cape_part = bpy.data.objects['torso'], bpy.data.objects['cape']
    trees = {'over': surface([torso_part, cape_part]), 'under': surface([torso_part])}
    stations = [strap_point(trees, 360 * k / STRAP_STATIONS) for k in range(STRAP_STATIONS)]
    verts, faces = [], []
    n = len(stations)
    for k, (c, normal) in enumerate(stations):
        ahead = stations[(k + 1) % n][0] - stations[k - 1][0]
        across = normal.cross(ahead).normalized()
        if across.z < 0:
            across = -across
        verts += [c + 0.5 * STRAP_WIDTH * across, c - 0.5 * STRAP_WIDTH * across]
        faces.append((2 * k, 2 * ((k + 1) % n), 2 * ((k + 1) % n) + 1, 2 * k + 1))
    part('bandolier', verts, faces, M['leather'], inside=lambda c: V(0, 0.03, c.z))

    for degrees in KNIVES:
        c, normal = strap_point(trees, degrees)
        ahead = strap_point(trees, degrees + 4)[0] - strap_point(trees, degrees - 4)[0]
        up = normal.cross(ahead).normalized()
        if up.z < 0:
            up = -up
        lift = 0.014  # each knife lies on the strap, its hilt beyond the strap's upper edge
        mouth = c + (0.5 * STRAP_WIDTH + 0.006) * up + lift * normal
        low, low_normal = lay(trees['over'], c - SHEATH * up, normal)
        knife(f'knife-{degrees}', mouth, low + (STRAP_LIFT + 0.006) * low_normal, up.cross(normal))


def knife(name, mouth, low, side):
    """A sheathed knife from the sheath's tip at `low` to its mouth, the hilt beyond it, its flat
    towards `side`: a dark sheath, a guard and pommel of trim and a leather grip."""
    along = (mouth - low).normalized()
    bent_tube(f'{name}-sheath', [mouth, low], [(0.024, 0.012), (0.015, 0.009)], M['boots'], n=4, phase=45,
              side=side, start='cap', end=low - 0.03 * along)
    guard = mouth + 0.01 * along
    box(f'{name}-guard', guard, [along, side, along.cross(side)], (0.01, 0.036, 0.016), M['trim'])
    top = guard + (0.01 + GRIP) * along
    tube(f'{name}-grip', guard, top, [(0, 0.013), (1, 0.013)], M['leather'], n=4, phase=45)
    cone(f'{name}-pommel', top - 0.006 * along, top + 0.03 * along, 0.019, M['trim'], n=4, phase=45,
         back=top - 0.016 * along)


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


# Arms and blades -----------------------------------------------------------------------------------

UPPER_ARM, FOREARM = 0.3, 0.3  # long arms, longer than Gorbag's

# Each fist, low by his shins, and the way the blade in it points and its edge faces.
R_FIST, R_BLADE, R_EDGE = V(-0.37, -0.3, 0.2), V(-0.45, -0.85, 0.3), V(0.5, 0, -1)
L_FIST, L_BLADE, L_EDGE = V(0.44, -0.12, 0.19), V(0.65, -0.72, 0.25), V(-0.5, 0, -1)


def arm(side, shoulder, fist, pole, fist_up):
    """An arm from the shoulder to a fist at `fist`, its elbow bent towards `pole`; returns the way the
    fist's grip points."""
    reach = (fist - shoulder).normalized()
    wrist_at = fist - 0.055 * reach
    elbow = bend(shoulder, wrist_at, UPPER_ARM, FOREARM, pole)
    ahead = (fist - elbow).normalized()
    wrist = fist - 0.05 * ahead
    # One bent tube from inside the shoulder through the elbow into the fist, so the elbow has no seam:
    # the bare arm, then an iron bracer from halfway down the forearm, its edge standing proud.
    cuff = elbow.lerp(wrist, 0.45)
    points = [shoulder, elbow, cuff, cuff + 0.012 * ahead, wrist]
    bent_tube(f'arm-{side}', points, [0.078, 0.064, 0.058, 0.072, 0.066], [M['skin'], M['iron']], [0, 0, 1, 1])
    up = (Vector(fist_up) - Vector(fist_up).dot(ahead) * ahead).normalized()
    box(f'fist-{side}', fist, [ahead, up, ahead.cross(up)], (0.056, 0.062, 0.062), M['skin'], 0.85)
    return up


def blade(name, root, along, edge, stations, tip, curve=0.0):
    """A blade from `root` along `along`, its edge towards `edge`, a diamond in section. `stations` are
    (distance from the root, width to the edge, width to the spine, half-thickness); `tip` is the point's
    distance and how far towards the spine it lies. `curve` bends the blade towards its spine by
    curve times the distance squared."""
    along = along.normalized()
    edge = (edge - edge.dot(along) * along).normalized()
    flat = along.cross(edge)

    def centre(s, off=0.0):
        return root + s * along - (curve * s * s + off) * edge

    rings, path = [], []
    for s, to_edge, to_spine, t in stations:
        c = centre(s)
        across = (edge + 2 * curve * s * along).normalized()  # square to the curve, in the blade's plane
        rings.append([c - to_spine * across, c + t * flat, c + to_edge * across, c - t * flat])
        path.append(c)
    verts, faces, _ = loft(rings)
    point = len(verts)
    verts.append(centre(tip[0], tip[1]))
    k = (len(stations) - 1) * 4
    faces += [(k + i, k + (i + 1) % 4, point) for i in range(4)]
    path.append(verts[point])
    faces = wind(verts, faces, inside=nearest_on_polyline(path))
    faces += wind(verts, [(0, 1, 2, 3)], outward=-along)  # the root, against the guard
    part(name, verts, faces, M['steel'])
    # A crossguard, a leather grip in the fist and a pommel below it.
    box(f'{name}-guard', root - 0.008 * along, [along, edge, flat], (0.012, 0.05, 0.024), M['trim'])
    tube(f'{name}-grip', root - 0.15 * along, root, [(0, 0.022), (1, 0.022)], M['leather'], n=5)
    cone(f'{name}-pommel', root - 0.14 * along, root - 0.19 * along, 0.03, M['trim'], n=5, back=root - 0.12 * along)


# The long knife, straight and broad, its point clipped back to the spine; the dagger, curving up.
KNIFE = [(0.0, 0.034, 0.024, 0.012), (0.18, 0.04, 0.024, 0.012), (0.31, 0.036, 0.022, 0.011),
         (0.37, 0.024, 0.006, 0.008)]
KNIFE_TIP = (0.44, 0.014)
DAGGER = [(0.0, 0.028, 0.02, 0.01), (0.08, 0.03, 0.02, 0.01), (0.16, 0.026, 0.016, 0.008), (0.22, 0.016, 0.01, 0.006)]
DAGGER_TIP = (0.27, 0.0)
DAGGER_CURVE = 1.6


def arms():
    for side, sign, fist, aim, edge, stations, tip, curve in (
        ('right', -1, R_FIST, R_BLADE, R_EDGE, KNIFE, KNIFE_TIP, 0.0),
        ('left', 1, L_FIST, L_BLADE, L_EDGE, DAGGER, DAGGER_TIP, DAGGER_CURVE),
    ):
        shoulder = hunched(V(sign * 0.25, 0.04, 0.72))
        pole = shoulder + V(sign * 0.35, 0.15, -0.15)
        grip = arm(side, shoulder, fist, pole, aim.normalized())
        blade(f'blade-{side}', fist + 0.065 * grip, grip, edge, stations, tip, curve)


def main():
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    fittings()
    cape()
    bandolier()
    hunch(new_objects(before))
    before = set(bpy.context.scene.objects)
    head()
    hood()
    # Built upright, then tipped back on his neck so that he peers up from his crouch.
    pivot = HEAD + V(0, 0.1, 0.05)
    tilt = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(-HEAD_TILT), 4, 'X') @ Matrix.Translation(-pivot)
    for obj in new_objects(before):
        obj.data.transform(tilt)
    arms()
    finish('grishnakh-2', budget=GEAR_BUDGET)


main()
