"""Gorbag, the Orc: an Archer of Minas Morgul, in the Faceted style (docs/viewer-spec.md section 4).

Squat, broad and stooped, as the books have orcs: about 1.2 to the top of his head as he stands and
1.35 upright, with long arms, bowed legs and his head thrust forward on a bull neck. A heavy, jutting
jaw with tusks, a wide mouth, a flat nose, slanted eyes under a shelf of brow, big pointed ears, a
bald olive pate with a black mane and scalp-lock. Sallow, olive-grey skin, crude iron and leather. He
draws a short, sharply recurved bow of pale horn, a black-feathered arrow on the string, and a quiver
of them rides his back. The team colour is his ragged cowl, which hangs in rags over his hump and his
chest, and his loincloth, whose front flap bears the sign of Minas Morgul: a pale moon with a death's
face.

    blender --background --factory-startup --python-exit-code 1 --python gorbag.py [-- <out.glb>]

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
    CLOTH,
    EYES,
    LEATHER,
    WOOD,
    V,
    box,
    ellipse,
    finish,
    loft,
    material,
    on_surface,
    part,
    reset,
    segment,
    team_material,
    tube,
)

# Gorbag's own colours (sRGB); the rest come from the kit.
SKIN = 0x7E7A5A  # sallow, olive-grey
HAIR = 0x25201C  # coarse and black
IRON = 0x5D6166  # crude, blackened iron, darker than the kit's steel
HORN = 0xBFAD86  # the pale horn of his bow, and its string
BONE = 0xD5CAA8  # his tusks, and the moon on his badge
FEATHERS = 0x2B2623  # black-feathered arrows

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.95),
        leather=material('leather', LEATHER, roughness=0.85),
        boots=material('boots', BOOTS, roughness=0.9),
        cloth=material('cloth', CLOTH, roughness=0.9),
        iron=material('iron', IRON, roughness=0.6, metallic=0.1),
        horn=material('horn', HORN, roughness=0.6),
        bone=material('bone', BONE, roughness=0.7),
        wood=material('wood', WOOD, roughness=0.85),
        feathers=material('feathers', FEATHERS, roughness=0.95),
        eyes=material('eyes', EYES, roughness=0.6),
    )


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o not in before]


# The stoop ---------------------------------------------------------------------------------------
#
# The body above the hips is built upright and then bent by hunched(): it leans forward about the
# hips, and above the small of the back the spine curls further, so the shoulders round into a hump
# and the neck comes out of the front of them.

PIVOT = V(0, 0.03, 0.46)  # the hips
LEAN = 14  # degrees the body above the hips leans forward
MID = V(0, 0.04, 0.6)  # the small of the back
CURL = 24  # further degrees the shoulders curl forward over it
CURL_SPAN = 0.22  # the height over which the curl comes in
TWIST = -25  # degrees his chest turns to his right above square hips, the bow shoulder forward
TWIST_FROM, TWIST_SPAN = 0.5, 0.3  # the height the twist starts at and the height it comes in over


def hunched(p):
    """Where a point of the upright body is once he stoops and turns."""
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


def nearest_on_path(points):
    """A function giving the point on the polyline through `points` nearest to a point."""
    points = [Vector(p) for p in points]

    def nearest(c):
        best = None
        for a, b in zip(points, points[1:]):
            t = max(0.0, min(1.0, (c - a).dot(b - a) / (b - a).length_squared))
            p = a + t * (b - a)
            if best is None or (c - p).length < (c - best).length:
                best = p
        return best

    return nearest


# Legs: bowed, the knees out and bent, the left foot forward and the right braced behind -----------

R_HIP, R_KNEE, R_ANKLE, R_YAW = V(-0.1, 0.06, 0.47), V(-0.235, 0.0, 0.27), V(-0.2, 0.1, 0.1), -26
L_HIP, L_KNEE, L_ANKLE, L_YAW = V(0.1, 0.0, 0.47), V(0.235, -0.12, 0.28), V(0.19, -0.08, 0.1), 18

# Crude boots from the sole up, in the foot's own frame (toes towards -y): the height of each ring and
# the right half of it, side, heel and toe, mirrored by boot().
BOOT_RINGS = [
    (0.0, [(0.088, -0.02), (0.074, 0.085), (0.058, -0.165)]),  # the sole
    (0.06, [(0.088, -0.01), (0.076, 0.08), (0.05, -0.125)]),  # the toe rises to a blunt point
    (0.15, [(0.074, 0.0), (0.066, 0.07), (0.056, -0.05)]),  # round the ankle
]


def boot(name, ankle, yaw):
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)
    outlines = [(z, [side, heel, (-heel[0], heel[1]), (-side[0], side[1]), (-toe[0], toe[1]), toe])
                for z, (side, heel, toe) in BOOT_RINGS]
    rings = [[at + turn @ V(x, y, z) for x, y in ring] for z, ring in outlines]
    verts, faces, _ = loft(rings)
    part(name, verts, faces, M['boots'], inside=at + V(0, 0, 0.07))


def legs():
    for side, hip, knee, ankle, yaw in (('right', R_HIP, R_KNEE, R_ANKLE, R_YAW),
                                        ('left', L_HIP, L_KNEE, L_ANKLE, L_YAW)):
        tube(f'thigh-{side}', hip, knee, [(-0.1, 0.09), (1.1, 0.072)], M['cloth'])
        tube(f'shin-{side}', knee, ankle, [(-0.1, 0.064), (1.3, 0.056)], M['skin'])
        boot(f'boot-{side}', ankle, yaw)
        # A crude iron cop over the knee, which hides the joint: it points out of the bend, and forward.
        forward = knee - (hip + ankle) / 2
        forward = V(forward.x, forward.y - 0.08, 0).normalized()
        base = segment(knee, knee + forward, [(0, 0.062)], 4, 45)[0]
        verts = base + [knee + 0.09 * forward + V(0, 0, 0.01)]
        part(f'knee-{side}', verts, [(i, (i + 1) % 4, 4) for i in range(4)], M['iron'], inside=knee)


# Body --------------------------------------------------------------------------------------------

# A barrel of octagons, built upright and then hunched: z, half-width, half-depth and centre y.
TORSO = [
    (0.36, 0.165, 0.13, 0.03),  # hips
    (0.45, 0.185, 0.145, 0.03),  # belt, lower edge
    (0.53, 0.19, 0.15, 0.03),  # belt, upper edge
    (0.68, 0.25, 0.18, 0.03),  # chest
    (0.84, 0.258, 0.175, 0.05),  # shoulders
    (0.94, 0.14, 0.125, 0.01),  # neck
]
TORSO_BANDS = [0, 1, 2, 2, 2]  # breeches, belt, leather jerkin


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    faces.append(tuple(range(len(verts) - 8, len(verts))))  # the top of the neck
    face_mats.append(3)
    mats = [M['cloth'], M['boots'], M['leather'], M['skin']]
    part('torso', verts, faces, mats, face_mats, inside=lambda c: V(0, 0.03, min(max(c.z, 0.4), 0.9)))


def cowl():
    # A ragged cowl round his neck and over his shoulders: eight points from his left (+X), the collar
    # rising behind his neck and dipping in front.
    collar_z = [0.95, 0.99, 1.01, 0.99, 0.95, 0.9, 0.88, 0.9]
    collar = ellipse(0, 0.0, 0, 0.16, 0.15, 8, 0, collar_z)
    dome = ellipse(0, 0.02, 0, 0.275, 0.21, 8, 0, [z - 0.06 for z in collar_z])
    shoulder_z = [0.84, 0.82, 0.8, 0.82, 0.84, 0.83, 0.82, 0.83]
    shoulder = ellipse(0, 0.03, 0, 0.31, 0.228, 8, 0, shoulder_z)
    hem_drop = [0.05, 0.1, 0.12, 0.1, 0.05, 0.07, 0.09, 0.07]
    hem = ellipse(0, 0.03, 0, 0.305, 0.232, 8, 0, [z - d for z, d in zip(shoulder_z, hem_drop)])
    verts, faces, _ = loft([hem, shoulder, dome, collar])
    # Rags hang from the hem in points of uneven length, down his back and over his chest.
    drops = [0.1, 0.14, 0.1, 0.15, 0.1, 0.15, 0.17, 0.12]
    for i in range(8):
        a, b = hem[i], hem[(i + 1) % 8]
        mid = (a + b) / 2
        out = V(mid.x, mid.y - 0.03, 0).normalized()
        verts.append(mid + 0.012 * out - V(0, 0, drops[i]))
        faces.append((i, (i + 1) % 8, len(verts) - 1))
    part('cowl', verts, faces, M['team'], inside=lambda c: V(0, 0.03, min(c.z, 0.82) - 0.1))


QUIVER_BOTTOM, QUIVER_TOP = V(0.1, 0.29, 0.6), V(-0.1, 0.3, 0.94)
# The ends of the arrows in it, fanned out of its mouth: (across his back, away from it) where each
# leaves the mouth, and how far it stands out.
ARROWS = [(-0.024, -0.008, 0.15), (0.024, -0.004, 0.13), (0.0, 0.018, 0.17), (0.004, -0.024, 0.12)]


def quiver():
    # Slung across his back, its mouth over his right shoulder, so he can draw from it: leather, bound
    # in bone at the mouth.
    axis = (QUIVER_TOP - QUIVER_BOTTOM).normalized()
    stations = [(0, 0.04), (0.84, 0.048), (0.87, 0.056), (1, 0.056)]
    tube('quiver', QUIVER_BOTTOM, QUIVER_TOP, stations, [M['leather'], M['bone']], [0, 0, 1], n=6)
    ring = segment(QUIVER_BOTTOM, QUIVER_TOP, [(0, 0.04)], 6)[0]
    verts = ring + [QUIVER_BOTTOM - 0.03 * axis]
    part('quiver-end', verts, [(i, (i + 1) % 6, 6) for i in range(6)], M['leather'], inside=QUIVER_BOTTOM)
    # The fletching of the arrows bunched in the mouth, and a few drawn up out of it.
    ring = segment(QUIVER_BOTTOM, QUIVER_TOP, [(1, 0.056)], 6)[0]
    verts = ring + [QUIVER_TOP + 0.035 * axis]
    part('quiver-mouth', verts, [(i, (i + 1) % 6, 6) for i in range(6)], M['feathers'], inside=QUIVER_TOP)
    across = axis.cross(V(0, 1, 0)).normalized()
    out = across.cross(axis)
    for k, (a, b, length) in enumerate(ARROWS):
        base = QUIVER_TOP + a * across + b * out
        end = base + length * axis + 1.5 * (a * across + b * out)
        tube(f'shaft-{k}', base - 0.02 * axis, end, [(0, 0.008), (1, 0.008)], M['wood'], n=3)
        along = (end - base).normalized()
        flat = (across if k % 2 else out) - 0.3 * (out if k % 2 else across)
        flat = (flat - flat.dot(along) * along).normalized()
        verts = [end + 0.01 * along, end - 0.06 * along + 0.03 * flat, end - 0.1 * along,
                 end - 0.06 * along - 0.03 * flat]
        part(f'vane-{k}', verts, [(0, 1, 2, 3)], M['feathers'])


# Head ----------------------------------------------------------------------------------------------

HEAD = V(0, -0.33, 0.875)  # the middle of the underside of his jaw, placed after the stoop
HEAD_SCALE = 1.12  # the head is drawn big, as Gimli's is, so it reads at game size
HEAD_YAW = 35  # degrees his head turns to his left, along the arrow

# The skull in rings from under the jaw to the temples: the height of each above HEAD, then the left
# half of it from HEAD as (x, y): the side, the back corner, the back, the front corner and the front.
SKULL = [
    (0.0, (0.132, -0.03), (0.08, 0.055), 0.07, (0.116, -0.158), -0.2),  # under the jaw, jutting
    (0.075, (0.15, -0.005), (0.105, 0.09), 0.115, (0.128, -0.15), -0.182),  # the mouth
    (0.165, (0.142, 0.005), (0.11, 0.105), 0.135, (0.118, -0.115), -0.152),  # cheekbones and eyes
    (0.245, (0.118, 0.015), (0.092, 0.105), 0.13, (0.088, -0.08), -0.1),  # brow and temples
]
CROWN = (0, 0.03, 0.3)


def h(x, y, z):
    """A point of the head, from HEAD in the head's own (unscaled) measure."""
    return HEAD + HEAD_SCALE * V(x, y, z)


def head():
    before = set(bpy.context.scene.objects)
    rings = []
    for z, side, corner, back, front_corner, front in SKULL:
        ring = [side, corner, (0, back), (-corner[0], corner[1]), (-side[0], side[1]),
                (-front_corner[0], front_corner[1]), (0, front), front_corner]
        rings.append([h(x, y, z) for x, y in ring])
    verts, faces, bands = loft(rings)
    # A bald, olive skull with a mane of coarse black hair round the back.
    face_mats = [1 if b > 0 and i % 8 < 4 else 0 for i, b in enumerate(bands)]
    apex = len(verts)
    verts.append(h(*CROWN))
    last = 3 * 8
    faces += [(last + i, last + (i + 1) % 8, apex) for i in range(8)]
    face_mats += [0] * 8
    faces.append(tuple(range(8)))  # under the jaw
    face_mats.append(0)
    part('skull', verts, faces, [M['skin'], M['hair']], face_mats, inside=h(0, -0.03, 0.14))

    # A scalp-lock on his crown, bound at the root and swept back.
    root = [h(0.035, 0.0, 0.27), h(0, 0.06, 0.265), h(-0.035, 0.0, 0.27), h(0, -0.045, 0.265)]
    verts = root + [h(0, 0.21, 0.36)]
    part('scalp-lock', verts, [(i, (i + 1) % 4, 4) for i in range(4)], M['hair'], inside=h(0, 0.02, 0.25))

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
        [h(-0.118, -0.05, 0.2), h(-0.118, -0.125, 0.183), h(-0.118, -0.07, 0.158)],
        [h(0, -0.13, 0.195), h(0, -0.2, 0.165), h(0, -0.155, 0.14)],
        [h(0.118, -0.05, 0.2), h(0.118, -0.125, 0.183), h(0.118, -0.07, 0.158)],
    ]
    verts, faces, _ = loft(sections)
    faces += [(0, 1, 2), (6, 7, 8)]
    part('brow', verts, faces, M['skin'], inside=h(0, -0.09, 0.17))

    # A flat, broad nose.
    verts = [h(0, -0.156, 0.138), h(0, -0.218, 0.095), h(0.046, -0.165, 0.086), h(-0.046, -0.165, 0.086),
             h(0, -0.178, 0.076)]
    faces = [(0, 2, 1), (0, 1, 3), (2, 4, 1), (4, 3, 1)]
    part('nose', verts, faces, M['skin'], inside=h(0, -0.14, 0.1))

    # A wide mouth, turned down at the corners.
    outline = [(0.096, 0.042), (0.04, 0.066), (-0.04, 0.066), (-0.096, 0.042), (-0.04, 0.05), (0.04, 0.05)]
    verts = [on(jaw, x, z, 0.005) for x, z in outline]
    part('mouth', verts, [(0, 1, 5), (1, 2, 4, 5), (2, 3, 4)], M['eyes'], outward=V(0, -1, 0))

    # Tusks from the lower jaw, up past the lip.
    for s in (-1, 1):
        x = s * 0.085
        base = on(jaw, x, 0.03, 0.0)
        y = (base.y - HEAD.y) / HEAD_SCALE
        verts = [h(x - 0.028, y + 0.008, 0.018), h(x + 0.028, y + 0.008, 0.018), h(x, y + 0.04, 0.014),
                 h(x + s * 0.035, y - 0.05, 0.16)]
        part(f'tusk-{s}', verts, [(0, 1, 3), (1, 2, 3), (2, 0, 3)], M['bone'], inside=h(x, y + 0.01, 0.05))

    # Big pointed ears, swept back and up.
    for s in (-1, 1):
        verts = [h(s * 0.128, -0.035, 0.11), h(s * 0.122, 0.07, 0.13), h(s * 0.115, 0.02, 0.225),
                 h(s * 0.33, 0.1, 0.31)]
        part(f'ear-{s}', verts, [(0, 2, 3), (2, 1, 3), (1, 0, 3)], M['skin'], inside=h(s * 0.1, 0.02, 0.15))

    # Built square to his body, then turned on his neck to look along the arrow.
    turn = Matrix.Rotation(math.radians(HEAD_YAW), 4, 'Z')
    turn = Matrix.Translation(HEAD) @ turn @ Matrix.Translation(-HEAD)
    for obj in new_objects(before):
        obj.data.transform(turn)


# Loincloth, hanging from the belt -------------------------------------------------------------------


FLAP_TOP = V(0, -0.142, 0.47)  # the middle of the top of the front flap, tucked under the belt
FLAP_KNEE, FLAP_OUT = 0.34, 0.03  # the height where the flaps fall straight, and how far out they are there


def loincloth():
    # Front and back flaps, each a sheet of three columns with a ragged hem.
    columns = (-0.125, -0.042, 0.042, 0.125)
    hems = {'front': (0.17, 0.225, 0.16, 0.215), 'back': (0.24, 0.2, 0.25, 0.21)}
    for name, sign, top_y, top_z in (('front', -1, FLAP_TOP.y, FLAP_TOP.z), ('back', 1, 0.19, 0.52)):
        top = [V(x, top_y, top_z) for x in columns]
        mid = [V(0.95 * x, top_y + sign * FLAP_OUT, FLAP_KNEE) for x in columns]
        bottom = [V(0.86 * x, top_y + sign * FLAP_OUT, z) for x, z in zip(columns, hems[name])]
        verts, faces, _ = loft([top, mid, bottom], closed=False)
        part(f'loincloth-{name}', verts, faces, M['team'], outward=V(0, sign, 0))
    # The badge of Minas Morgul on the front flap, laid on its slope: a pale moon with a death's face.
    def on_flap(x, z, lift):
        return V(x, FLAP_TOP.y - FLAP_OUT * (FLAP_TOP.z - z) / (FLAP_TOP.z - FLAP_KNEE) - lift, z)

    # A shallow cone, `radius` across and `rise` proud of the flap at its middle.
    centre, radius, rise = V(0, 0, 0.39), 0.05, 0.01

    def on_badge(x, z, lift):
        return on_flap(x, centre.z + z, 0.003 + rise * (1 - math.hypot(x, z) / radius) + lift)

    ring = ellipse(0, 0, 0, radius, radius, 8, 22.5)
    verts = [on_badge(p.x, p.y, 0) for p in ring] + [on_badge(0, 0, 0)]
    part('badge', verts, [(i, (i + 1) % 8, 8) for i in range(8)], M['bone'], outward=V(0, -1, 0))
    for s in (-1, 1):
        corners = ((s * 0.008, 0.012), (s * 0.032, 0.014), (s * 0.02, -0.006))
        verts = [on_badge(x, z, 0.003) for x, z in corners]
        part(f'badge-eye-{s}', verts, [(0, 1, 2)], M['eyes'], outward=V(0, -1, 0))


# Bow, arrow and arms ---------------------------------------------------------------------------------

# He draws to under his chin in an archer's open stance, his chest turned to his right and the arrow
# aimed well to his left of where his feet point, as Legolas's is. A bow aimed straight ahead shows the
# camera in front or behind only its edge, and from behind it hides behind his head and ears; turned
# like this it stands clear beside his head and shows its curve to both.
NOCK = V(0.07, -0.41, 0.8)  # where the string is drawn to, under his chin
AIM_YAW = 60  # degrees to his left of straight ahead that the arrow points
ELEVATION = 8  # degrees the arrow points up
CANT = 10  # degrees the top of the bow tips to his right from square to the arrow
DRAW = 0.38  # from the nock forward to where the arrow crosses the bow
REST = 0.058  # from the middle of the grip up the bow to where the arrow crosses it
BOW_SCALE = 1.2  # the bow is drawn in the measure of STAVE, then scaled

# The upper limb of the bow from the end of the grip, in the bow's plane: (u, w, t, h), with u up the
# bow, w forward along the arrow, t the half-thickness in the bow's plane and h across it. The lower
# limb mirrors it. TIP is (u, w) of the point of each ear.
STAVE = [
    (0.05, 0.008, 0.033, 0.024),  # the end of the grip
    (0.15, 0.04, 0.03, 0.023),  # the limb swells forward
    (0.24, 0.012, 0.026, 0.02),  # and runs back
    (0.305, -0.04, 0.022, 0.018),  # to where the string leaves it
    (0.33, 0.02, 0.017, 0.014),  # and curls forward in a horn ear
]
TIP = (0.34, 0.085)


def bow_axes():
    """The arrow's direction, the way up the bow and the direction across the bow's plane."""
    y, e, c = (math.radians(a) for a in (AIM_YAW, ELEVATION, CANT))
    aim = V(math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e))
    right = aim.cross(V(0, 0, 1)).normalized()  # to his right of the arrow
    upright = right.cross(aim)  # square to the arrow, in its vertical plane
    up = math.cos(c) * upright + math.sin(c) * right
    return aim, up, aim.cross(up)


def grip():
    aim, up, _ = bow_axes()
    return NOCK + DRAW * aim - REST * up


def bow():
    aim, up, side = bow_axes()
    middle = grip()

    def at(u, w):
        return middle + BOW_SCALE * (u * up + w * aim)

    stations = [(-u, w, t, hh) for u, w, t, hh in reversed(STAVE)] + list(STAVE)
    centres = [at(u, w) for u, w, _, _ in stations]
    rings = []
    for k, (u, w, t, hh) in enumerate(stations):
        before, after = centres[max(k - 1, 0)], centres[min(k + 1, len(centres) - 1)]
        along = (after - before).normalized()
        normal = side.cross(along).normalized()  # in the bow's plane, across the stave
        c = centres[k]
        rings.append([c + t * normal, c + hh * side, c - t * normal, c - hh * side])
    verts, faces, bands = loft(rings)
    face_mats = [1 if b == len(STAVE) - 1 else 0 for b in bands]  # leather round the grip
    for end, (u, w) in ((0, (-TIP[0], TIP[1])), (len(rings) - 1, TIP)):
        verts.append(at(u, w))
        faces += [(end * 4 + i, end * 4 + (i + 1) % 4, len(verts) - 1) for i in range(4)]
        face_mats += [0] * 4
    path = [at(-TIP[0], TIP[1])] + centres + [at(*TIP)]
    part('bow', verts, faces, [M['horn'], M['leather']], face_mats, inside=nearest_on_path(path))

    # The string, from where it leaves each limb back to the nock.
    u, w, t, _ = STAVE[3]
    for name, end in (('upper', at(u, w - t)), ('lower', at(-u, w - t))):
        tube(f'string-{name}', end, NOCK, [(0, 0.006), (1, 0.006)], M['horn'], n=3)

    # The arrow: a shaft, a black-feathered end and a crude iron head.
    head = NOCK + (DRAW + 0.12) * aim
    tube('arrow', NOCK - 0.01 * aim, head, [(0, 0.009), (1, 0.009)], M['wood'], n=3)
    ring = [head + 0.026 * side, head + 0.012 * up, head - 0.026 * side, head - 0.012 * up]
    verts = ring + [head + 0.075 * aim, head - 0.02 * aim]
    faces = [(i, (i + 1) % 4, 4) for i in range(4)] + [(i, (i + 1) % 4, 5) for i in range(4)]
    part('arrowhead', verts, faces, M['iron'], inside=head + 0.02 * aim)
    for k, across in enumerate((up, side)):
        a, b = NOCK + 0.02 * aim, NOCK + 0.1 * aim
        verts = [a, b, b + 0.03 * across - 0.01 * aim, a + 0.032 * across, b - 0.03 * across - 0.01 * aim,
                 a - 0.032 * across]
        part(f'feather-{k}', verts, [(0, 1, 2, 3), (0, 5, 4, 1)], M['feathers'])


UPPER_ARM, FOREARM = 0.27, 0.28  # long arms, as orcs have


def arm(side, shoulder, fist, pole, fist_up):
    """An arm from the shoulder to a fist at `fist`, its elbow bent towards `pole`."""
    reach = (fist - shoulder).normalized()
    wrist_at = fist - 0.05 * reach
    elbow = bend(shoulder, wrist_at, UPPER_ARM, FOREARM, pole)
    wrist = fist - 0.05 * (fist - elbow).normalized()
    tube(f'upper-arm-{side}', shoulder, elbow, [(-0.1, 0.072), (1.08, 0.06)], M['skin'])
    tube(f'forearm-{side}', elbow, wrist, [(-0.12, 0.058), (0.4, 0.066), (1.0, 0.06)],
         [M['skin'], M['iron']], [0, 1])
    ahead = (fist - elbow).normalized()
    up = (Vector(fist_up) - Vector(fist_up).dot(ahead) * ahead).normalized()
    box(f'fist-{side}', fist, [ahead, up, ahead.cross(up)], (0.046, 0.05, 0.05), M['skin'], 0.85)


def arms():
    aim, up, _ = bow_axes()
    left, right = hunched(V(0.225, 0.04, 0.79)), hunched(V(-0.225, 0.04, 0.79))
    # The bow arm reaches forward and up, the elbow turned down and out.
    arm('left', left, grip(), (left + grip()) / 2 + V(0.25, 0.05, -0.2), up)
    # The drawing hand holds the string at the nock, the elbow out to his right and back.
    arm('right', right, NOCK - 0.02 * aim - 0.03 * up, right + V(-0.3, 0.12, 0.05), up)


def main():
    reset()
    make_materials()
    legs()
    before = set(bpy.context.scene.objects)
    torso()
    cowl()
    quiver()
    hunch(new_objects(before))
    head()
    loincloth()
    bow()
    arms()
    finish('gorbag')


main()
