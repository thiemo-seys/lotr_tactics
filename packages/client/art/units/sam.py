"""Samwise Gamgee: Hobbit, Guardian, a 1-cost unit (docs/design.md section 5), in the Faceted style
of Gimli, the reference model (gimli.py, docs/viewer-spec.md section 4), and of Frodo's family
(frodo.py): the same build, round face, curls and big bare feet.

From the books rather than the films: Frodo's gardener, a sturdy, plain-spoken hobbit, the stoutest
of the four, sun-browned, with sandy-brown curls. He carries the heaviest pack of the Company, with
the cooking gear inside and a coil of the grey elven rope of Lórien strapped on top. He has a short
sword from the Barrow-downs but no shield, so he guards with what he has: the broader of his two
pans, raised in his left hand like a buckler, its black iron bottom to the enemy, and the sword
upright in his right. He stands square on his big bare feet, planted to hold his ground. A working
hobbit: no waistcoat, a linen shirt with its sleeves rolled to the elbows and the pack's straps over
it.

Hobbit proportions, as Frodo's, a little broader: 0.88 to the top of his curls, the head a third of
that, the roundest belly of the four. The team colour is his elven cloak: its cowl round his
shoulders, seen from the front and above, clasped at the throat with a green leaf; the hood, thrown
back and bunched at his nape over the pack; and the cloak hanging from his shoulders under the pack to
above his knees. From behind, as the near side is seen, his sandy curls show above the hood, the pack
and its rope in the middle of the cloak, and the pan and the sword either side.

    blender --background --factory-startup --python-exit-code 1 --python sam.py [-- <out.glb>]

Coordinates are Blender's: z up, the model faces -Y, so his right hand is at -X.
"""

import math
import os
import sys
from itertools import pairwise

import bpy
from mathutils import Matrix

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kit import (  # noqa: E402
    BRASS,
    EYES,
    LEATHER,
    V,
    box,
    cone,
    ellipse,
    finish,
    lean,
    loft,
    material,
    nearest_on_line,
    nearest_on_polyline,
    newell,
    on_surface,
    part,
    reset,
    team_material,
    tube,
)

# Sam's own colours (sRGB); the rest come from the kit.
SKIN = 0xDCA27D  # sun-browned, a gardener's
HAIR = 0xA67D4F  # sandy brown, on his head and the tops of his feet
BROWS = 0x6B4A2F  # darker than his curls, so they show on his sun-browned face
SHIRT = 0xD6CAAB  # unbleached linen
BREECHES = 0x5F5944  # drab wool
CANVAS = 0x93805C  # the pack
ROPE = 0xA4A39A  # the grey elven rope of Lórien
IRON = 0x474543  # the pan, black iron
BLADE = 0xCED3D6  # plain bright steel
LEAF = 0x6D8A4F  # the clasp, a green leaf of Lórien
MOUTH = 0x6A4434  # a dark line, not red

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.9),
        brows=material('brows', BROWS, roughness=0.9),
        shirt=material('shirt', SHIRT, roughness=0.9),
        breeches=material('breeches', BREECHES, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        canvas=material('canvas', CANVAS, roughness=0.9),
        rope=material('rope', ROPE, roughness=0.9),
        iron=material('iron', IRON, roughness=0.6, metallic=0.1),
        steel=material('steel', BLADE, roughness=0.4, metallic=0.1),
        brass=material('brass', BRASS, roughness=0.55, metallic=0.1),
        leaf=material('leaf', LEAF, roughness=0.6),
        eyes=material('eyes', EYES, roughness=0.6),
        mouth=material('mouth', MOUTH, roughness=0.8),
    )


LEAN = 5  # degrees the body above the hips leans forward, into the fight
HIPS = V(0, 0, 0.27)  # the pivot of the lean


def lerp(a, b, t):
    return a + (b - a) * t


# Feet and legs -----------------------------------------------------------------------------------

# Square on his feet, wide apart, the pan-side (left) foot a little forward, toes turned out; the
# knees bent a little over them.
R_ANKLE, R_YAW = V(-0.128, 0.035, 0.0), -16
L_ANKLE, L_YAW = V(0.132, -0.03, 0.0), 15

# The right foot from the sole up, in its own frame, as Frodo's (frodo.py): toes towards -y, the
# big toe's side (+x) inwards. Each ring runs round from the heel; the last is round the ankle.
FOOT = [
    [(0.0, 0.075, 0.0), (0.042, 0.05, 0.0), (0.052, -0.04, 0.0), (0.062, -0.12, 0.0), (0.046, -0.2, 0.0),
     (0.02, -0.182, 0.0), (-0.006, -0.192, 0.0), (-0.04, -0.172, 0.0), (-0.064, -0.11, 0.0),
     (-0.046, 0.045, 0.0)],  # the sole
    [(0.0, 0.07, 0.045), (0.04, 0.046, 0.045), (0.05, -0.04, 0.04), (0.058, -0.116, 0.036),
     (0.042, -0.19, 0.036), (0.02, -0.168, 0.026), (-0.006, -0.18, 0.03), (-0.036, -0.16, 0.026),
     (-0.058, -0.106, 0.034), (-0.044, 0.042, 0.042)],  # over the toes, the big toe the highest
    [(0.0, 0.034, 0.1), (0.028, 0.024, 0.1), (0.035, -0.008, 0.094), (0.03, -0.042, 0.084),
     (0.018, -0.062, 0.078), (0.005, -0.066, 0.076), (-0.008, -0.065, 0.076), (-0.02, -0.057, 0.078),
     (-0.031, -0.04, 0.084), (-0.031, 0.02, 0.098)],  # round the ankle, low over the instep
]
FOOT_SCALE = 1.16  # the footprint, bigger than life, a little bigger than Frodo's
# The thatch of hair over the instep: (index round the rings, fraction from the second ring to the
# third) of each point round its edge, jagged, and its middle, raised.
THATCH = [(4.0, 0.42), (4.8, 0.3), (5.5, 0.36), (6.2, 0.28), (7.0, 0.42), (6.8, 0.7), (7.1, 0.95),
          (5.5, 0.85), (3.9, 0.95), (4.2, 0.7)]
THATCH_MIDDLE = (5.5, 0.62)


def foot(name, ankle, yaw, inner):
    """A big bare foot, its big toe towards `inner` (+1 for the right foot, -1 for the left)."""
    turn = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    at = V(ankle.x, ankle.y, 0)

    def place(p):
        return at + turn @ V(FOOT_SCALE * inner * p[0], FOOT_SCALE * p[1], p[2])

    rings = [[place(p) for p in ring] for ring in FOOT]
    verts, faces, _ = loft(rings)
    axis = [place((0, 0.03, 0.04)), place((0, -0.14, 0.018))]
    part(name, verts, faces, M['skin'], inside=nearest_on_polyline(axis))

    def on_top(u, v, lift):
        i = int(u)
        f = u - i
        low = rings[1][i].lerp(rings[1][i + 1], f)
        high = rings[2][i].lerp(rings[2][i + 1], f)
        return low.lerp(high, v) + V(0, 0, lift)

    edge = [on_top(u, v, 0.004) for u, v in THATCH]
    middle = on_top(*THATCH_MIDDLE, 0.026)
    verts = edge + [middle]
    faces = [(i, (i + 1) % len(edge), len(edge)) for i in range(len(edge))]
    part(name + '-hair', verts, faces, M['hair'], inside=middle - V(0, 0, 0.05))


R_HIP, L_HIP = V(-0.088, 0.005, 0.27), V(0.088, 0.0, 0.27)
R_KNEE, L_KNEE = V(-0.128, -0.035, 0.172), V(0.134, -0.08, 0.172)
ANKLE_Z = 0.06  # where the shin ends, inside the foot


def leg(side, hip, knee, ankle):
    ankle = V(ankle.x, ankle.y, ANKLE_Z)
    # Breeches to just below the knee, ending in a cuff wider than the bare shin.
    tube(f'thigh-{side}', hip, knee, [(0, 0.08), (1.12, 0.066)], M['breeches'])
    tube(f'shin-{side}', knee, ankle, [(0, 0.047), (1, 0.036)], M['skin'])


def legs():
    leg('right', R_HIP, R_KNEE, R_ANKLE)
    leg('left', L_HIP, L_KNEE, L_ANKLE)
    foot('foot-right', R_ANKLE, R_YAW, 1)
    foot('foot-left', L_ANKLE, L_YAW, -1)


# Body --------------------------------------------------------------------------------------------

# Octagons from the seat of his breeches to the shoulders: z, half-width, half-depth and centre y.
# Stouter than Frodo: the belly the widest, standing well out in front over the belt.
TORSO = [
    (0.215, 0.138, 0.112, 0.015),  # the seat of his breeches
    (0.285, 0.17, 0.142, 0.0),  # the belt's lower edge
    (0.325, 0.186, 0.162, -0.016),  # the belt's upper edge, under the belly
    (0.405, 0.206, 0.186, -0.044),  # the round belly
    (0.535, 0.138, 0.104, 0.0),  # shoulders, under the cowl, open above
]
TORSO_BANDS = [0, 1, 2, 2]  # breeches, belt, shirt


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 22.5) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    mats = [M['breeches'], M['leather'], M['shirt']]
    part('torso', verts, faces, mats, face_mats, inside=lambda c: V(0, -0.01, c.z))
    tube('neck', V(0, 0.005, 0.55), V(0, -0.015, 0.64), [(0, 0.052), (1, 0.05)], M['skin'])


# Head --------------------------------------------------------------------------------------------

# Octagons with a corner at the front, from under the chin to the crown: z, half-width, half-depth
# and centre y. Rounder than Frodo's, with fuller cheeks.
HEAD = [
    (0.6, 0.056, 0.048, -0.05),  # under the chin
    (0.632, 0.104, 0.096, -0.03),  # the jaw and the mouth
    (0.69, 0.134, 0.117, -0.018),  # round cheeks, the widest
    (0.752, 0.128, 0.114, -0.012),  # the eyes and the temples
    (0.81, 0.11, 0.1, -0.008),  # the forehead, under the curls, open above
]


def head():
    rings = [ellipse(0, cy, z, rx, ry, 8, 0) for z, rx, ry, cy in HEAD]
    verts, faces, _ = loft(rings)
    faces.append(tuple(range(8)))  # under the chin
    part('head', verts, faces, M['skin'], inside=lambda c: V(0, -0.02, min(max(c.z, 0.65), 0.8)))

    def plane(a, b, low, high):
        p, q, r, s = rings[low][a], rings[low][b], rings[high][b], rings[high][a]
        return [(p, q, r), (p, r, s)]

    cheeks = plane(5, 6, 2, 3) + plane(6, 7, 2, 3)
    jaw = plane(5, 6, 1, 2) + plane(6, 7, 1, 2)
    brow = cheeks + plane(5, 6, 3, 4) + plane(6, 7, 3, 4)

    # Eyes a little smaller than Frodo's.
    for s in (-1, 1):
        x, z = s * 0.047, 0.728
        corners = [(x - 0.016, z), (x - 0.008, z + 0.013), (x + 0.008, z + 0.013), (x + 0.016, z),
                   (x + 0.008, z - 0.012), (x - 0.008, z - 0.012)]
        verts = [V(u, on_surface(cheeks, u, w) - 0.005, w) for u, w in corners]
        part(f'eye-{s}', verts, [(0, 1, 2, 3, 4, 5)], M['eyes'], outward=V(0, -1, 0))

    # A wide, plain mouth, a thin chevron with its corners up: good-natured.
    corners = [(-0.038, 0.662), (0, 0.658), (0.038, 0.662), (0, 0.649)]
    verts = [V(x, on_surface(jaw, x, z) - 0.004, z) for x, z in corners]
    part('mouth', verts, [(0, 3, 1), (1, 3, 2)], M['mouth'], outward=V(0, -1, 0))

    # A broad, round nose.
    top, tip, under = V(0, -0.129, 0.726), V(0, -0.158, 0.697), V(0, -0.137, 0.679)
    left, right = V(0.033, -0.122, 0.693), V(-0.033, -0.122, 0.693)
    verts = [top, left, under, right, tip]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.1, 0.7))

    # Brows, darker than his curls, lower at the inner ends: a steady, stubborn look.
    for s in (-1, 1):
        verts = [V(s * 0.022, 0, 0.762), V(s * 0.074, 0, 0.77), V(s * 0.072, 0, 0.759),
                 V(s * 0.024, 0, 0.752)]
        verts = [V(p.x, on_surface(brow, p.x, p.z) - 0.006, p.z) for p in verts]
        part(f'brow-{s}', verts, [(0, 1, 2, 3)], M['brows'], outward=V(0, -1, 0.2))

    # Ears a little pointed, through the curls at the sides.
    for s in (-1, 1):
        base = [V(s * 0.124, -0.018, 0.686), V(s * 0.126, 0.028, 0.698), V(s * 0.121, 0.014, 0.75),
                V(s * 0.124, -0.022, 0.735)]
        tip = V(s * 0.166, 0.026, 0.764)
        verts = base + [tip]
        faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
        part(f'ear-{s}', verts, faces, M['skin'], inside=V(s * 0.095, 0.0, 0.72))


def head_ring(z):
    """The head's half-width, half-depth and centre y at height z."""
    for (z0, *low), (z1, *high) in pairwise(HEAD):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return [lerp(a, b, t) for a, b in zip(low, high)]
    raise ValueError(z)


# The curls: a mop round the head, as Frodo's, from a hairline low at the nape, lifting over the
# ears and coming down in a fringe: its height at angles from his left (+X) round the back.
HAIRLINE = [(0, 0.765), (45, 0.67), (90, 0.632), (135, 0.67), (180, 0.765), (225, 0.778), (270, 0.792),
            (315, 0.778), (360, 0.765)]
HAIR_POINTS = 14
CURL = 0.018  # how far each curl hangs below the hairline between them
MOP = V(0, -0.006, 0.728), (0.156, 0.15, 0.148)  # the ellipsoid the curls fill: centre and radii
BUMP = 0.2  # how far each other point of the mop stands out, staggered ring to ring, each a curl


def hairline(degrees):
    for (a0, z0), (a1, z1) in pairwise(HAIRLINE):
        if a0 <= degrees <= a1:
            return lerp(z0, z1, (degrees - a0) / (a1 - a0))
    raise ValueError(degrees)


def hair():
    centre, (rx, ry, rz) = MOP
    n = HAIR_POINTS
    rings = [[], [], [], []]
    high = set()  # the points that stand out
    for i in range(n):
        a = math.tau * i / n
        cos, sin = math.cos(a), math.sin(a)
        z = hairline(360 * i / n)
        curl = i % 2 == 1
        z0 = z - CURL if curl else z + 0.006
        hx, hy, hc = head_ring(z0)
        rings[0].append(V(0.94 * hx * cos, hc + 0.94 * hy * sin, z0))
        low = math.asin((z + 0.028 - centre.z) / rz)
        for k, t in enumerate((0.0, 0.4, 0.75)):
            up = low + (math.pi / 2 - low) * t
            out = (i + k) % 2 == 1
            if out:
                high.add((k + 1) * n + i)
            r = math.cos(up) * (1 + BUMP * out)
            z = rz * math.sin(up) * (1 + 0.5 * BUMP * out) - (0.022 if out and k == 0 else 0.0)
            rings[k + 1].append(centre + V(rx * r * cos, ry * r * sin, z))
    verts, quads, _ = loft(rings)
    faces = []
    for a, b, c, d in quads:
        if a in high or c in high:
            faces += [(a, b, d), (b, c, d)]
        else:
            faces += [(a, b, c), (a, c, d)]
    crown = len(verts)
    verts.append(centre + V(0, 0, rz))
    last = 3 * n
    faces += [(last + i, last + (i + 1) % n, crown) for i in range(n)]
    part('hair', verts, faces, M['hair'], inside=centre)


# Arms --------------------------------------------------------------------------------------------

# Both forearms forward at the height of his belly: the left fist holds the pan up, the right the
# sword.
R_SHOULDER, R_ELBOW, R_WRIST = V(-0.152, 0.0, 0.5), V(-0.245, 0.02, 0.385), V(-0.262, -0.118, 0.415)
L_SHOULDER, L_ELBOW, L_WRIST = V(0.156, 0.0, 0.5), V(0.25, 0.02, 0.375), V(0.272, -0.12, 0.38)


def arm(side, shoulder, elbow, wrist, up):
    """A linen sleeve rolled to the elbow, the bare forearm and a big fist; `up` is where its thumb
    points. Returns the middle of the fist."""
    tube(f'sleeve-{side}', shoulder, elbow, [(0, 0.056), (1.1, 0.064)], M['shirt'])
    tube(f'forearm-{side}', elbow, wrist, [(-0.1, 0.044), (1, 0.036)], M['skin'])
    ahead = (wrist - elbow).normalized()
    up = (up - up.dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    fist = wrist + 0.03 * ahead
    box(f'fist-{side}', fist, [ahead, up, across], (0.04, 0.042, 0.044), M['skin'], 0.86)
    return fist


# The pan, raised in his left hand ----------------------------------------------------------------

PAN_UP = V(0.1, 0.02, 1.0).normalized()  # the handle, up from the fist and a little out
PAN_TURN = 22  # degrees its bottom is turned outwards (to his left) from straight ahead
PAN_RADIUS = 0.148
PAN_REACH = 0.212  # from the fist to the middle of the pan
# Its profile from the middle of the bottom out to the rim and back in down the inside: radius and
# height towards the enemy (the bottom's side).
PAN = [(0.0, 0.052), (0.104, 0.052), (PAN_RADIUS, 0.0), (0.097, 0.043), (0.0, 0.043)]
PAN_POINTS = 10


def pan():
    fist = arm('left', L_SHOULDER, L_ELBOW, L_WRIST, PAN_UP)
    along = PAN_UP
    turn = math.radians(PAN_TURN)
    ahead = V(math.sin(turn), -math.cos(turn), 0)
    out = (ahead - ahead.dot(along) * along).normalized()  # the way the bottom faces
    across = along.cross(out)
    centre = fist + PAN_REACH * along

    # One profile turned round the pan's axis; the rim is a ridge, so the faces are wound as one.
    n = PAN_POINTS
    rings = []
    for r, w in PAN[1:-1]:
        rings.append([centre + r * (math.cos(a) * along + math.sin(a) * across) + w * out
                      for a in (math.tau * (i + 0.5) / n for i in range(n))])
    verts, faces, _ = loft(rings)
    bottom, inside = len(verts), len(verts) + 1
    verts += [centre + PAN[0][1] * out, centre + PAN[-1][1] * out]
    last = (len(rings) - 1) * n
    faces += [(i, (i + 1) % n, bottom) for i in range(n)]
    faces += [(last + (i + 1) % n, last + i, inside) for i in range(n)]
    if newell([verts[i] for i in faces[len(faces) - 2 * n]]).dot(out) < 0:  # the bottom faces out
        faces = [tuple(reversed(f)) for f in faces]
    part('pan', verts, faces, M['iron'])

    # The handle, from the rim down through the fist.
    start, end = fist - 0.065 * along, centre - (PAN_RADIUS - 0.012) * along
    box('pan-handle', (start + end) / 2, [along, across, out], ((end - start).length / 2, 0.016, 0.011),
        M['iron'], 0.8)


# The sword, upright in his right hand ------------------------------------------------------------

SWORD = V(-0.26, -0.16, 0.95).normalized()  # upright, leaning out and a little forward
SWORD_LENGTH = 0.36  # from the guard to the point
# Stations along the blade: fraction of its length, half-width and half-thickness at the ridge.
SWORD_STATIONS = [(0.0, 0.034, 0.01), (0.64, 0.03, 0.009), (0.87, 0.019, 0.007)]


def sword():
    fist = arm('right', R_SHOULDER, R_ELBOW, R_WRIST, SWORD)
    width = V(1, 0, 0)
    width = (width - width.dot(SWORD) * SWORD).normalized()  # the flat faces forward and back
    flat = SWORD.cross(width).normalized()

    guard = fist + 0.055 * SWORD
    rings = []
    for t, w, th in SWORD_STATIONS:
        c = guard + t * SWORD_LENGTH * SWORD
        rings.append([c + w * width, c + th * flat, c - w * width, c - th * flat])
    verts, faces, _ = loft(rings)
    tip, last = len(verts), (len(rings) - 1) * 4
    verts.append(guard + SWORD_LENGTH * SWORD)
    faces += [(last + i, last + (i + 1) % 4, tip) for i in range(4)]
    part('blade', verts, faces, M['steel'], inside=nearest_on_line(guard, guard + SWORD))

    box('guard', guard, [SWORD, width, flat], (0.012, 0.062, 0.017), M['brass'], 0.8)
    end = fist - 0.06 * SWORD
    tube('grip', end, guard, [(0, 0.016), (1, 0.016)], M['leather'], n=4, phase=45)
    cone('pommel', end, end - 0.03 * SWORD, 0.025, M['brass'], n=4, phase=45, back=end + 0.012 * SWORD)


# Team colour: the elven cloak ---------------------------------------------------------------------


def cowl():
    # The cowl round his neck and over his shoulders, eight points round from his left (+X); it
    # rises behind the neck and dips in front to the clasp.
    neck_z = [0.61, 0.622, 0.63, 0.622, 0.61, 0.595, 0.582, 0.595]
    neck = ellipse(0, 0.01, 0, 0.094, 0.088, 8, 0, neck_z)
    dome = ellipse(0, 0.008, 0, 0.18, 0.152, 8, 0, [z - 0.036 for z in neck_z])
    shoulder_z = [0.52, 0.54, 0.55, 0.54, 0.52, 0.505, 0.498, 0.505]
    shoulder = ellipse(0, 0.004, 0, 0.238, 0.19, 8, 0, shoulder_z)
    hem = ellipse(0, 0.0, 0, 0.228, 0.196, 8, 0, [z - 0.045 for z in shoulder_z])
    verts, faces, _ = loft([hem, shoulder, dome, neck])
    part('cowl', verts, faces, M['team'], inside=V(0, 0.01, 0.45))

    # The clasp at his throat, a leaf, its two halves folded along the midrib.
    y = -0.1
    verts = [V(0, y, 0.592), V(0.022, y, 0.569), V(0, y, 0.545), V(-0.022, y, 0.569),
             V(0, y - 0.008, 0.569)]
    part('clasp', verts, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], M['leaf'], inside=V(0, 0, 0.56))


def hood():
    # The hood, thrown back: caught between his back and the pack, it bunches up at his nape over
    # the top of the pack. Its edge from his right round the nape to his left, its crest along the
    # pack's front edge, and its point lying on the pack.
    a, g, b = V(-0.112, 0.07, 0.598), V(0, 0.1, 0.645), V(0.112, 0.07, 0.598)
    c, e, d = V(-0.112, 0.176, 0.604), V(0, 0.165, 0.69), V(0.112, 0.176, 0.604)
    f = V(0, 0.208, 0.632)
    verts = [a, g, b, c, e, d, f]
    faces = [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 6), (4, 5, 6)]
    part('hood', verts, faces, M['team'], inside=V(0, 0.12, 0.57))


# The cloak from under the cowl to above his knees, close over his back under the pack, in three
# folds, the hem lowest in the middle. Each level: z in the middle and at the edges, half-width,
# half-depth, centre y, how far short of the sides it stops (degrees) and how deep the folds are.
CAPE = [
    (0.53, 0.51, 0.205, 0.158, 0.012, -8, 0.0),
    (0.4, 0.41, 0.224, 0.17, 0.012, 4, 0.014),
    (0.222, 0.255, 0.244, 0.184, 0.024, 10, 0.026),
]
CAPE_POINTS = 7


def cape():
    rings = []
    for middle, edge, rx, ry, cy, spread, fold in CAPE:
        ring = []
        for i in range(CAPE_POINTS):
            a = math.radians(spread + (180 - 2 * spread) * i / (CAPE_POINTS - 1))
            k = 1 + (fold / ry if i % 2 else 0)
            z = edge + (middle - edge) * math.sin(a) ** 2
            ring.append(V(k * rx * math.cos(a), cy + k * ry * math.sin(a), z))
        rings.append(ring)
    verts, faces, _ = loft(rings, closed=False)
    part('cape', verts, faces, M['team'], inside=lambda c: V(0, 0, c.z))


# The pack ----------------------------------------------------------------------------------------

# Rings from the bottom of the bag to its top, the load pressing its front into the round of his
# back: z, half-width, y of the front's middle and of the flat back, and how far its front corners
# reach forward round his back.
PACK = [
    (0.3, 0.105, 0.19, 0.3, 0.015),  # the bottom, rounded under
    (0.41, 0.14, 0.185, 0.35, 0.03),  # the load sags to a bulge low in the bag
    (0.594, 0.126, 0.19, 0.322, 0.025),  # the top, under the flap
]
# The leather flap over the top and down the back, to a point: half-width, then (y, z) of its front
# edge, its back edge and the end of its sides, and the height of its point.
FLAP = 0.112, (0.184, 0.608), (0.332, 0.614), (0.345, 0.49), 0.452
COIL = V(0, 0.282, 0.611), (0.092, 0.06), 0.024  # middle, radii to the rope and its thickness


def pack_ring(z, w, front, back, wrap):
    """Seven points round the bag counter-clockwise from above, from its left side round the flat
    back to the front, whose corners wrap forward."""
    middle = (front + back) / 2
    return [V(w, middle, z), V(0.85 * w, back, z), V(-0.85 * w, back, z), V(-w, middle, z),
            V(-0.72 * w, front - wrap, z), V(0, front, z), V(0.72 * w, front - wrap, z)]


def pack():
    rings = [pack_ring(*level) for level in PACK]
    verts, faces, _ = loft(rings)
    faces += [tuple(range(7)), tuple(range(14, 21))]
    part('pack', verts, faces, M['canvas'], inside=V(0, 0.27, 0.43))

    half, front, back, down, point = FLAP
    verts = [V(x, y, z) for y, z in (front, back, down) for x in (-half, half)]
    verts.append(V(0, down[0] + 0.006, point))
    faces = [(0, 1, 3, 2), (2, 3, 5, 4), (4, 5, 6)]
    part('flap', verts, faces, M['leather'], inside=V(0, 0.262, 0.5))

    # The coil of grey rope strapped on top of the pack: a ring lying on the flap, its underside
    # against it.
    centre, (rx, ry), thick = COIL
    n = 10
    rings = []
    for i in range(n):
        a = math.tau * (i + 0.5) / n
        out = V(math.cos(a), math.sin(a), 0)
        at = centre + V(rx * out.x, ry * out.y, 0)
        rings.append([at + thick * out, at + V(0, 0, thick), at - thick * out])
    verts = [p for ring in rings for p in ring]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces += [(3 * i, 3 * j, 3 * j + 1, 3 * i + 1), (3 * i + 1, 3 * j + 1, 3 * j + 2, 3 * i + 2)]

    def core(c):
        d = V((c.x - centre.x) / rx, (c.y - centre.y) / ry, 0).normalized()
        return centre + V(rx * d.x, ry * d.y, -0.01)

    part('coil', verts, faces, M['rope'], inside=core)

    # The straps from the top of the pack over his shoulders, down the cowl and under his arms.
    for s in (-1, 1):
        path = [V(s * 0.1, 0.188, 0.612), V(s * 0.11, -0.03, 0.618), V(s * 0.122, -0.15, 0.535),
                V(s * 0.142, -0.168, 0.455), V(s * 0.18, -0.13, 0.41)]
        verts = []
        for p in path:
            verts += [p + V(-0.02, 0, 0), p + V(0.02, 0, 0)]
        faces = [(2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2) for k in range(len(path) - 1)]
        part(f'strap-{s}', verts, faces, M['leather'], inside=V(s * 0.05, 0.0, 0.45))


def main():
    reset()
    make_materials()
    legs()
    lower = set(bpy.context.scene.objects)
    torso()
    head()
    hair()
    cowl()
    hood()
    cape()
    pack()
    pan()
    sword()
    lean([o for o in bpy.context.scene.objects if o not in lower], HIPS, LEAN)
    finish('sam')


main()
