"""Bilbo Baggins, the burglar of The Hobbit: Hobbit, Burglar, a 3-cost unit (docs/design.md section
5), in the Faceted style of Gimli, the reference model (gimli.py, docs/viewer-spec.md section 4), and
of Frodo's family (frodo.py): the same build, round face, curls and big bare feet.

From the books rather than the films: a well-to-do, rather portly hobbit, old now and white-haired
but spry, in a bottle-green waistcoat with bright brass buttons over a linen shirt and brown
breeches, and no shoes. Over them, the hood and cloak he borrowed from Dwalin for his adventure, too
big for him: a short cape over his shoulders, open down the front from a brass clasp at his throat,
and the hood thrown back, hanging down his back in a long point to a brass tassel. He holds a short
broad knife low by his hip, its back broken down to the point, a seax rather than a sword like
Sting, and raises his other hand by his head, a finger leaning to his temple: a riddle in the dark.
His head is cocked, one bushy white brow raised over a lopsided grin. No Ring shows.

Hobbit proportions, as Frodo's: 0.86 to the top of his curls, the head a third of that, the roundest
belly of the hobbits and feet bigger than life, thatched with grey. Told apart from the other
hobbits by his white hair, the green waistcoat and its buttons, the raised hand and the short broad
knife. The team colour is the borrowed cloak: the cape over his shoulders, seen from the front, from
behind and from above, its two fronts framing his waistcoat, and the hood down his back. From
behind, as the near side is seen, his white curls show above it, his raised hand and the knife
either side of it, and his waistcoat and breeches below it.

    blender --background --factory-startup --python-exit-code 1 --python bilbo.py [-- <out.glb>]

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
    EYES,
    LEATHER,
    V,
    bent_tube,
    box,
    cone,
    ellipse,
    finish,
    lean,
    loft,
    material,
    nearest_on_polyline,
    on_surface,
    part,
    reset,
    team_material,
    tube,
    wind,
)

# Bilbo's own colours (sRGB); the rest come from the kit.
SKIN = 0xE0AA86  # a hobbit's, warm
HAIR = 0xD5D2C9  # white with age, a little grey: his curls and his brows
GREY = 0xA8A499  # the thatch on the tops of his feet, greyer
SHIRT = 0xD8CDB2  # unbleached linen
WAISTCOAT = 0x45634A  # bottle green, darker and cooler than Merry's olive jerkin
BREECHES = 0x6E5A43  # brown wool
BRIGHT_BRASS = 0xD4A84A  # his buttons, polished
LINING = 0x394536  # the dark green of the borrowed hood, inside it
BLADE = 0xCED3D6  # plain bright steel
MOUTH = 0x6A4434  # a dark line, not red

M = {}  # materials by name, made once the scene is reset


def make_materials():
    M.update(
        team=team_material(),
        skin=material('skin', SKIN, roughness=0.85),
        hair=material('hair', HAIR, roughness=0.9),
        foot_hair=material('foot-hair', GREY, roughness=0.9),
        shirt=material('shirt', SHIRT, roughness=0.9),
        waistcoat=material('waistcoat', WAISTCOAT, roughness=0.85),
        breeches=material('breeches', BREECHES, roughness=0.9),
        leather=material('leather', LEATHER, roughness=0.85),
        lining=material('lining', LINING, roughness=0.9),
        steel=material('steel', BLADE, roughness=0.4, metallic=0.1),
        brass=material('brass', BRIGHT_BRASS, roughness=0.45, metallic=0.1),
        eyes=material('eyes', EYES, roughness=0.6),
        mouth=material('mouth', MOUTH, roughness=0.8),
    )


LEAN = 8  # degrees the body above the hips leans forward
HIPS = V(0, 0, 0.265)  # the pivot of the lean
COCK = -7  # degrees the head is cocked over to his right (-X), sly, away from his raised hand
NECK = V(0, -0.02, 0.6)  # the pivot of the cock of the head


def lerp(a, b, t):
    return a + (b - a) * t


# Feet and legs -----------------------------------------------------------------------------------

# Feet apart, the left foot forward and the knife side back, toes turned out; the knees a little bent.
R_ANKLE, R_YAW = V(-0.112, 0.07, 0.0), -22
L_ANKLE, L_YAW = V(0.105, -0.065, 0.0), 12

# The right foot from the sole up, in its own frame, as Frodo's: toes towards -y, the big toe's side
# (+x) inwards. Each ring runs round from the heel; the last is round the ankle.
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
FOOT_SCALE = 1.12  # the footprint, bigger than life
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
    part(name + '-hair', verts, faces, M['foot_hair'], inside=middle - V(0, 0, 0.05))


R_HIP, L_HIP = V(-0.08, 0.008, 0.265), V(0.08, 0.0, 0.265)
R_KNEE, L_KNEE = V(-0.115, 0.012, 0.172), V(0.11, -0.08, 0.174)
ANKLE_Z = 0.06  # where the shin ends, inside the foot


def leg(side, hip, knee, ankle):
    ankle = V(ankle.x, ankle.y, ANKLE_Z)
    shin = (ankle - knee).normalized()
    # Breeches to below the knee, ending in a cuff wider than the bare shin. The cuff is long enough
    # that its rings don't cross behind the bent knee.
    bent_tube(f'thigh-{side}', [hip, knee, knee + 0.035 * shin], [0.076, 0.063, 0.058], M['breeches'])
    tube(f'shin-{side}', knee, ankle, [(0, 0.044), (1, 0.034)], M['skin'])


def legs():
    leg('right', R_HIP, R_KNEE, R_ANKLE)
    leg('left', L_HIP, L_KNEE, L_ANKLE)
    foot('foot-right', R_ANKLE, R_YAW, 1)
    foot('foot-left', L_ANKLE, L_YAW, -1)


# Body --------------------------------------------------------------------------------------------

# Octagons with a corner at the front, from the seat of his breeches to the shoulders: z, half-width,
# half-depth and centre y. The waistcoat starts at the second; the belly is the roundest of the
# hobbits'.
TORSO = [
    (0.205, 0.13, 0.112, 0.02),  # the seat of his breeches
    (0.27, 0.165, 0.145, 0.002),  # the waistcoat's hem
    (0.335, 0.19, 0.178, -0.026),  # under the belly
    (0.4, 0.196, 0.19, -0.048),  # the round belly
    (0.468, 0.17, 0.142, -0.022),  # chest
    (0.52, 0.13, 0.1, 0.0),  # shoulders, closed above by his shirt, round the neck
]
TORSO_BANDS = [0, 1, 1, 1, 1]  # breeches, waistcoat
BUTTONS = [0.318, 0.38, 0.442]  # heights of the brass buttons down the front
BUTTON_SIZE = 0.026  # half the height of each button


def torso_ring(z):
    """The torso's half-width, half-depth and centre y at height z."""
    for (z0, *low), (z1, *high) in pairwise(TORSO):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return [lerp(a, b, t) for a, b in zip(low, high)]
    raise ValueError(z)


def torso_front(z):
    """The front corner of the torso at height z."""
    _, ry, cy = torso_ring(z)
    return V(0, cy - ry, z)


def clear(p, gap):
    """p, moved forward or back until it is at least `gap` outside the torso."""
    if not TORSO[0][0] <= p.z <= TORSO[-1][0]:
        return p
    rx, ry, cy = torso_ring(p.z)
    ax, ay = rx + gap, ry + gap
    if abs(p.x) >= ax:
        return p
    reach = ay * math.sqrt(1 - (p.x / ax) ** 2)
    return p if abs(p.y - cy) >= reach else V(p.x, cy + math.copysign(reach, p.y - cy), p.z)


def torso():
    rings = [ellipse(0, cy, z, rx, ry, 8, 0) for z, rx, ry, cy in TORSO]
    verts, faces, bands = loft(rings)
    face_mats = [TORSO_BANDS[b] for b in bands]
    # The waistcoat's two points either side of the front, over the top of his breeches.
    hem = rings[1]
    for a in (5, 7):
        p = hem[a].lerp(hem[6], 0.7)
        out = V(p.x, p.y - TORSO[1][3], 0).normalized()
        verts.append(p + 0.014 * out - V(0, 0, 0.062))
        faces.append((8 + a, 8 + 6, len(verts) - 1))
        face_mats.append(1)
    faces.append(tuple(range(40, 48)))  # the shirt at his throat, round the neck
    face_mats.append(2)
    mats = [M['breeches'], M['waistcoat'], M['shirt']]
    part('torso', verts, faces, mats, face_mats, inside=lambda c: V(0, -0.01, min(c.z, 0.5)))

    # Brass buttons down the front corner, each a little pyramid.
    for k, z in enumerate(BUTTONS):
        c = torso_front(z)
        ridge = (torso_front(z + 0.01) - torso_front(z - 0.01)).normalized()
        out = V(1, 0, 0).cross(ridge)
        s = BUTTON_SIZE
        across = [V(sx * s, 0, 0) - 0.4 * s * out for sx in (1, -1)]  # sunk to the faces either side
        verts = [c + s * ridge, c + across[0], c - s * ridge, c + across[1], c + 0.016 * out]
        faces = [(i, (i + 1) % 4, 4) for i in range(4)]
        part(f'button-{k}', verts, faces, M['brass'], inside=c - 0.01 * out)

    tube('neck', V(0, 0.009, 0.5), V(0, -0.015, 0.63), [(0, 0.05), (1, 0.047)], M['skin'])


# Head --------------------------------------------------------------------------------------------

# Octagons with a corner at the front, from under the chin to the crown: z, half-width, half-depth
# and centre y. A round face, and a high forehead where his hair has gone back.
HEAD = [
    (0.59, 0.05, 0.045, -0.05),  # under the chin
    (0.622, 0.1, 0.094, -0.03),  # the jaw and the mouth
    (0.68, 0.129, 0.115, -0.018),  # round cheeks, the widest
    (0.742, 0.126, 0.114, -0.012),  # the eyes and the temples
    (0.8, 0.111, 0.103, -0.008),  # the forehead
    (0.83, 0.074, 0.072, -0.004),  # the top of a high forehead, under the curls
]


def head():
    rings = [ellipse(0, cy, z, rx, ry, 8, 0) for z, rx, ry, cy in HEAD]
    verts, faces, _ = loft(rings)
    faces.append(tuple(range(8)))  # under the chin
    faces.append(tuple(range(40, 48)))  # the crown, under the curls
    part('head', verts, faces, M['skin'], inside=lambda c: V(0, -0.02, min(max(c.z, 0.65), 0.79)))

    def plane(a, b, low, high):
        p, q, r, s = rings[low][a], rings[low][b], rings[high][b], rings[high][a]
        return [(p, q, r), (p, r, s)]

    cheeks = plane(5, 6, 2, 3) + plane(6, 7, 2, 3)
    jaw = plane(5, 6, 1, 2) + plane(6, 7, 1, 2)
    brow = plane(5, 6, 3, 4) + plane(6, 7, 3, 4)

    # Narrow, twinkling eyes, a little wide apart.
    for s in (-1, 1):
        x, z = s * 0.046, 0.72
        corners = [(x - 0.018, z), (x - 0.009, z + 0.011), (x + 0.009, z + 0.011), (x + 0.018, z),
                   (x + 0.009, z - 0.01), (x - 0.009, z - 0.01)]
        verts = [V(u, on_surface(cheeks, u, w) - 0.005, w) for u, w in corners]
        part(f'eye-{s}', verts, [(0, 1, 2, 3, 4, 5)], M['eyes'], outward=V(0, -1, 0))

    # A lopsided grin, the corner under his raised hand higher.
    corners = [(-0.034, 0.662), (0, 0.652), (0.04, 0.67), (0, 0.643)]
    verts = [V(x, on_surface(jaw, x, z) - 0.004, z) for x, z in corners]
    part('mouth', verts, [(0, 3, 1), (1, 3, 2)], M['mouth'], outward=V(0, -1, 0))

    # A round nose, bigger than Frodo's.
    top, tip, under = V(0, -0.128, 0.716), V(0, -0.16, 0.688), V(0, -0.137, 0.671)
    left, right = V(0.031, -0.122, 0.688), V(-0.031, -0.122, 0.688)
    verts = [top, left, under, right, tip]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
    part('nose', verts, faces, M['skin'], inside=V(0, -0.1, 0.69))

    # Bushy white brows jutting over the eyes, each a ridge from the nose out to a tuft; the left one,
    # under his raised hand, is raised, quizzical.
    for s in (-1, 1):
        lift = 0.009 if s > 0 else 0.0
        inner, outer = (s * 0.02, 0.757 + lift), (s * 0.082, 0.757 + lift)
        foot_in = V(inner[0], on_surface(brow + cheeks, *inner) + 0.004, inner[1])
        foot_out = V(outer[0], on_surface(brow + cheeks, *outer) + 0.004, outer[1])
        up = V(0, 0, 0.014)
        ridge_in = foot_in + V(0, -0.016, 0.006)
        ridge_out = foot_out + V(s * 0.012, -0.014, 0.012)
        verts = [foot_in - up * 0.3, foot_out - up * 0.3, foot_out + up, foot_in + up, ridge_in, ridge_out]
        faces = [(0, 1, 5, 4), (4, 5, 2, 3), (0, 4, 3), (1, 2, 5)]
        part(f'brow-{s}', verts, faces, M['hair'], inside=(foot_in + foot_out) / 2 + V(0, 0.02, 0))

    # Ears a little pointed, through the curls at the sides.
    for s in (-1, 1):
        base = [V(s * 0.119, -0.018, 0.676), V(s * 0.121, 0.028, 0.688), V(s * 0.116, 0.014, 0.74),
                V(s * 0.119, -0.022, 0.725)]
        tip = V(s * 0.16, 0.026, 0.752)
        verts = base + [tip]
        faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
        part(f'ear-{s}', verts, faces, M['skin'], inside=V(s * 0.09, 0.0, 0.71))


def head_ring(z):
    """The head's half-width, half-depth and centre y at height z."""
    for (z0, *low), (z1, *high) in pairwise(HEAD):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return [lerp(a, b, t) for a, b in zip(low, high)]
    raise ValueError(z)


# The curls, white: a mop round the head from a hairline that is low at the nape, lifts over the
# ears and has gone back from his forehead: its height at angles from his left (+X) round the back.
HAIRLINE = [(0, 0.758), (45, 0.665), (90, 0.622), (135, 0.665), (180, 0.758), (225, 0.79), (270, 0.812),
            (315, 0.79), (360, 0.758)]
HAIR_POINTS = 16
CURL = 0.018  # how far each curl hangs below the hairline between them
MOP = V(0, -0.004, 0.722), (0.156, 0.148, 0.134)  # the ellipsoid the curls fill: centre and radii
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
        low = math.asin(min((z + 0.028 - centre.z) / rz, 0.95))
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

# The right arm holds the knife low by his hip; the left is raised beside his head, a finger up, as
# he asks a riddle.
R_SHOULDER, R_ELBOW, R_WRIST = V(-0.14, 0.0, 0.49), V(-0.218, -0.008, 0.39), V(-0.222, -0.135, 0.31)
L_SHOULDER, L_ELBOW, L_WRIST = V(0.14, 0.0, 0.49), V(0.278, -0.01, 0.44), V(0.272, -0.06, 0.622)
FINGER_TILT = 35  # degrees the raised finger leans from the forearm towards his head


def arm(side, shoulder, elbow, wrist, up):
    """A full linen sleeve gathered at the wrist, and a big fist; `up` is where its thumb points.
    Returns the fist's centre and its axes: ahead, up and across."""
    bent_tube(f'sleeve-{side}', [shoulder, elbow, wrist], [0.052, 0.049, 0.041], M['shirt'])
    ahead = (wrist - elbow).normalized()
    up = (up - up.dot(ahead) * ahead).normalized()
    across = ahead.cross(up)
    fist = wrist + 0.03 * ahead
    box(f'fist-{side}', fist, [ahead, up, across], (0.038, 0.04, 0.042), M['skin'], 0.86)
    return fist, ahead, up, across


def riddle_hand():
    fist, ahead, up, across = arm('left', L_SHOULDER, L_ELBOW, L_WRIST, V(-1, 0, 0))
    # The palm faces forward. The forefinger is raised from the top of the fist on the thumb's side
    # and leans towards his temple, a riddler's gesture, and the thumb is curled over the fingers.
    palm = across if across.y < 0 else -across
    tilt = math.radians(FINGER_TILT)
    point = math.cos(tilt) * ahead + math.sin(tilt) * up
    side = -math.sin(tilt) * ahead + math.cos(tilt) * up
    centre = fist + 0.036 * ahead + 0.008 * up + 0.036 * point
    box('finger', centre, [point, side, palm], (0.038, 0.012, 0.013), M['skin'], 0.8)
    box('thumb', fist + 0.006 * ahead + 0.01 * up + 0.044 * palm, [palm, up, ahead], (0.01, 0.027, 0.014),
        M['skin'], 0.9)


# The knife, in his right hand --------------------------------------------------------------------

KNIFE = V(-0.32, -0.9, 0.3).normalized()  # forward, a little out to his right and up
KNIFE_ROLL = 60  # degrees the flat is turned from upright towards level, to face the sky
# The blade's outline from the guard: (along, across) with across towards the back, which runs
# straight and breaks down to the point, a short broad seax.
SEAX = {'back': (0.0, 0.026), 'break': (0.15, 0.034), 'point': (0.245, -0.008), 'belly': (0.178, -0.031),
        'edge': (0.0, -0.029)}
SEAX_THICK = 0.009  # half the thickness of the back


def knife():
    fist, *_ = arm('right', R_SHOULDER, R_ELBOW, R_WRIST, KNIFE)
    level = V(KNIFE.y, -KNIFE.x, 0).normalized()
    upright = level.cross(KNIFE).normalized()
    if upright.z < 0:
        upright = -upright
    roll = math.radians(KNIFE_ROLL)
    width = math.cos(roll) * upright + math.sin(roll) * level  # from the edge to the back
    flat = KNIFE.cross(width).normalized()

    guard = fist + 0.056 * KNIFE

    def at(name, side=0):
        u, v = SEAX[name]
        return guard + u * KNIFE + v * width + side * SEAX_THICK * flat

    back_f, back_b, break_f, break_b = at('back', 1), at('back', -1), at('break', 1), at('break', -1)
    point, belly, edge = at('point'), at('belly'), at('edge')
    verts = [back_f, break_f, back_b, break_b, point, belly, edge]
    front = wind(verts, [(0, 1, 6), (1, 5, 6), (1, 4, 5)], outward=flat)
    rear = wind(verts, [(2, 3, 6), (3, 5, 6), (3, 4, 5)], outward=-flat)
    spine = wind(verts, [(0, 1, 3, 2), (1, 4, 3)], outward=width)
    part('blade', verts, front + rear + spine, M['steel'])

    # A brass cross-guard, a leather grip and a brass pommel.
    box('guard', guard, [KNIFE, width, flat], (0.011, 0.05, 0.018), M['brass'], 0.8)
    end = fist - 0.056 * KNIFE
    tube('grip', end, guard, [(0, 0.016), (1, 0.016)], M['leather'], n=4, phase=45)
    cone('pommel', end, end - 0.03 * KNIFE, 0.022, M['brass'], n=4, phase=45, back=end + 0.012 * KNIFE)


# Team colour: the borrowed hood and cloak ---------------------------------------------------------

# The cloak is a short cape over his shoulders, open down the front from the clasp at his throat, so
# its two fronts frame his waistcoat and its buttons. Each ring runs from the left front edge round
# his left (+X), the back and his right to the right front edge: half-width, half-depth, centre y,
# how far round from the middle of the front each edge is (degrees), and its height at the sides,
# the back and the front edges. The lower two rings hug his chest and belly, and his back, so his
# waistcoat shows below the cape.
CAPE_RINGS = [  # rx, ry, cy, gap, side z, back z, front z
    (0.216, 0.128, 0.016, 28, 0.463, 0.458, 0.43),  # the hem
    (0.226, 0.135, 0.016, 22, 0.505, 0.5, 0.47),  # over the shoulders
    (0.17, 0.138, 0.014, 12, 0.565, 0.585, 0.53),  # round the top of the shoulders
    (0.09, 0.084, 0.012, 6, 0.6, 0.62, 0.565),  # round the neck
]
CAPE_GAPS = [0.012, 0.028, 0.0, 0.0]  # how far each ring stands outside the torso


def cape_ring(rx, ry, cy, gap, side, back, front, clearance):
    """Nine points round the cape from its left front edge to its right, `clearance` outside him."""
    ring = []
    for i in range(9):
        a = math.radians(270 + gap + (360 - 2 * gap) * i / 8)
        sin = math.sin(a)
        z = side + (back - side) * max(sin, 0) + (front - side) * max(-sin, 0)
        ring.append(clear(V(rx * math.cos(a), cy + ry * sin, z), clearance))
    return ring


def cape():
    rings = [cape_ring(*ring, clearance) for ring, clearance in zip(CAPE_RINGS, CAPE_GAPS)]
    verts, faces, _ = loft(rings, closed=False)
    part('cape', verts, faces, M['team'], inside=V(0, 0.015, 0.45))

    # The clasp at his throat, a round brass brooch joining the two fronts.
    neck, dome = rings[3], rings[2]
    top = (neck[0] + neck[8]) / 2
    low = (dome[0] + dome[8]) / 2
    c = top.lerp(low, 0.3) + V(0, -0.006, 0)
    down = (top - low).normalized()
    out = V(1, 0, 0).cross(down).normalized()
    ring = [c + 0.024 * (math.cos(a) * V(1, 0, 0) + math.sin(a) * down)
            for a in (math.tau * i / 6 for i in range(6))]
    verts = ring + [c + 0.013 * out]
    part('clasp', verts, [(i, (i + 1) % 6, 6) for i in range(6)], M['brass'], inside=c - 0.01 * out)


# The hood, thrown back: Dwalin's, too big for him. Its opening lies flat under his curls, the lining
# a sliver inside, and below it the hood hangs in a long point down his back, over the waistcoat, to a
# brass tassel. The rim and the bag from the nape round to his left (+X), the back and his right.
HOOD_RIM = [V(0, 0.112, 0.616), V(0.072, 0.122, 0.606), V(0.114, 0.146, 0.588), V(0.084, 0.162, 0.574),
            V(0, 0.168, 0.57), V(-0.084, 0.162, 0.574), V(-0.114, 0.146, 0.588), V(-0.072, 0.122, 0.606)]
HOOD_HOLLOW = V(0, 0.132, 0.586)  # the bottom of the hollow inside, just clear of the cape
HOOD_BAG = [V(0, 0.14, 0.52), V(0.1, 0.155, 0.515), V(0.142, 0.178, 0.495), V(0.104, 0.206, 0.47),
            V(0, 0.222, 0.462), V(-0.104, 0.206, 0.47), V(-0.142, 0.178, 0.495), V(-0.1, 0.155, 0.515)]
HOOD_POINT = V(0, 0.176, 0.29)
TASSEL = V(0, 0.172, 0.235)


def hood():
    n = len(HOOD_RIM)
    verts, faces, _ = loft([HOOD_RIM, HOOD_BAG])
    verts.append(HOOD_POINT)
    faces += [(n + i, n + (i + 1) % n, 2 * n) for i in range(n)]
    middle = [V(0, 0.15, 0.58), V(0, 0.19, 0.48), V(0, 0.17, 0.3)]  # down the inside of the hood
    part('hood', verts, faces, M['team'], inside=nearest_on_polyline(middle))
    verts = HOOD_RIM + [HOOD_HOLLOW]
    part('hood-lining', verts, [(i, (i + 1) % n, n) for i in range(n)], M['lining'], outward=V(0, 0.6, 0.8))
    cone('tassel', HOOD_POINT + V(0, 0, 0.012), TASSEL, 0.022, M['brass'], n=4,
         back=HOOD_POINT + V(0, 0, 0.03))


def cock(objects, pivot, degrees):
    """Tips objects sideways about the forward axis through `pivot`, to his left (+X) for positive
    degrees: the head cocked."""
    tip = Matrix.Rotation(math.radians(degrees), 4, 'Y')
    turning = Matrix.Translation(pivot) @ tip @ Matrix.Translation(-pivot)
    for obj in objects:
        obj.data.transform(turning)


def main():
    reset()
    make_materials()
    legs()
    lower = set(bpy.context.scene.objects)
    torso()
    body = set(bpy.context.scene.objects)
    head()
    hair()
    cock([o for o in bpy.context.scene.objects if o not in body], NECK, COCK)
    cape()
    hood()
    riddle_hand()
    knife()
    lean([o for o in bpy.context.scene.objects if o not in lower], HIPS, LEAN)
    finish('bilbo')


main()
